import React, { useState, useCallback, useRef, useEffect, Component } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Platform, Share, FlatList,
  RefreshControl, Animated, Vibration,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { useBtngWallet, BtngWalletState } from '@/hooks/useBtngWallet';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import type { BtngAccount } from '@/services/btngWalletService';
import {
  fetchAllAccountBalances,
  BTNG_RPC_URL,
  BtngBalance,
  getRpcUrl,
  saveRpcUrl,
  testRpcConnection,
  RpcTestResult,
  signBtngPayload,
  verifyBtngSignature,
  getActivePrivateKey,
  saveBtngPin,
  loadBtngPin,
  loadPinAttempts,
  savePinAttempts,
  clearPinAttempts,
  loadAccountNicknames,
  saveAccountNickname,
  loadBulkHistory,
  saveBulkHistoryEntry,
  clearBulkHistory,
  BulkHistoryEntry,
} from '@/services/btngWalletService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { Image } from 'expo-image';
import { BTNG_MERCHANT, BTNG_RAIL_CHANNELS } from '@/constants/merchantConfig';
import QRCode from 'react-native-qrcode-svg';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import * as Print from 'expo-print';
// NFC — safe dynamic import so the screen never crashes on simulators or web
let NfcManager: any = null;
let Ndef: any = null;
let NfcTech: any = null;
try {
  const nfcMod = require('react-native-nfc-manager');
  NfcManager = nfcMod.default ?? nfcMod.NfcManager;
  Ndef = nfcMod.Ndef;
  NfcTech = nfcMod.NfcTech;
} catch (_) {
  // NFC not available on this platform
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function shortenAddress(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// ── PIN Pad Modal ─────────────────────────────────────────────────────────────
const PIN_LENGTH = 6;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 30;

function PinModal({
  visible, mode, onSuccess, onCancel, onUseBiometric, canUseBiometric, storedPin,
}: {
  visible: boolean;
  mode: 'verify' | 'setup' | 'confirm';
  onSuccess: (pin: string) => void;
  onCancel: () => void;
  onUseBiometric?: () => void;
  canUseBiometric: boolean;
  storedPin?: string | null;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [failedCount, setFailedCount] = useState(0);
  const [lockoutSecsLeft, setLockoutSecsLeft] = useState(0);
  const lockoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLockedOut = lockoutSecsLeft > 0;

  useEffect(() => {
    if (!visible) return;
    setPin(''); setError('');
    if (mode !== 'verify') { setFailedCount(0); setLockoutSecsLeft(0); return; }
    (async () => {
      const data = await loadPinAttempts();
      setFailedCount(data.count);
      if (data.lockedUntil && data.lockedUntil > Date.now()) {
        setLockoutSecsLeft(Math.ceil((data.lockedUntil - Date.now()) / 1000));
      } else {
        setLockoutSecsLeft(0);
        if (data.lockedUntil && data.lockedUntil <= Date.now()) {
          await savePinAttempts({ count: 0, lockedUntil: null });
          setFailedCount(0);
        }
      }
    })();
  }, [visible, mode]);

  useEffect(() => {
    if (lockoutSecsLeft <= 0) {
      if (lockoutIntervalRef.current) { clearInterval(lockoutIntervalRef.current); lockoutIntervalRef.current = null; }
      return;
    }
    lockoutIntervalRef.current = setInterval(() => {
      setLockoutSecsLeft(prev => {
        if (prev <= 1) { savePinAttempts({ count: 0, lockedUntil: null }); setFailedCount(0); setError(''); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (lockoutIntervalRef.current) { clearInterval(lockoutIntervalRef.current); lockoutIntervalRef.current = null; } };
  }, [lockoutSecsLeft]);

  const shake = useCallback(() => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleKey = useCallback(async (k: string) => {
    if (isLockedOut) return;
    if (k === 'DEL') { setPin(p => p.slice(0, -1)); setError(''); return; }
    const next = pin + k;
    setPin(next); setError('');
    if (next.length === PIN_LENGTH) {
      if (mode === 'verify') {
        if (next === storedPin) {
          await clearPinAttempts(); setFailedCount(0); setLockoutSecsLeft(0); onSuccess(next);
        } else {
          shake();
          const newCount = failedCount + 1;
          const remaining = MAX_PIN_ATTEMPTS - newCount;
          if (newCount >= MAX_PIN_ATTEMPTS) {
            const lockedUntil = Date.now() + PIN_LOCKOUT_SECONDS * 1000;
            await savePinAttempts({ count: 0, lockedUntil });
            setFailedCount(0); setLockoutSecsLeft(PIN_LOCKOUT_SECONDS); setPin(''); setError('');
            Vibration.vibrate([0, 100, 80, 100, 80, 200]);
          } else {
            await savePinAttempts({ count: newCount, lockedUntil: null });
            setFailedCount(newCount);
            setError(remaining === 1 ? 'Incorrect PIN. 1 attempt remaining before lockout.' : `Incorrect PIN. ${remaining} attempts remaining.`);
            setTimeout(() => setPin(''), 400);
          }
        }
      } else { onSuccess(next); }
    }
  }, [pin, mode, storedPin, onSuccess, shake, isLockedOut, failedCount]);

  const labels = {
    verify: { title: 'Enter PIN', subtitle: 'Use your BTNG wallet PIN to unlock', icon: 'lock' },
    setup: { title: 'Create PIN', subtitle: 'Set a 6-digit PIN to protect your wallet', icon: 'lock-outline' },
    confirm: { title: 'Confirm PIN', subtitle: 'Re-enter your 6-digit PIN to confirm', icon: 'lock-outline' },
  }[mode];
  const keys = ['1','2','3','4','5','6','7','8','9','','0','DEL'];
  const attemptsLeft = MAX_PIN_ATTEMPTS - failedCount;
  const lockoutProgress = lockoutSecsLeft / PIN_LOCKOUT_SECONDS;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={pinStyles.overlay}>
        <View style={pinStyles.sheet}>
          <View style={pinStyles.header}>
            <View style={[pinStyles.iconWrap, isLockedOut && { backgroundColor: Colors.errorBg, borderColor: Colors.error + '55' }]}>
              <MaterialIcons name={isLockedOut ? 'lock-clock' : labels.icon as any} size={28} color={isLockedOut ? Colors.error : Colors.primary} />
            </View>
            <Text style={pinStyles.title}>{isLockedOut ? 'Wallet Locked' : labels.title}</Text>
            <Text style={[pinStyles.subtitle, isLockedOut && { color: Colors.error }]}>
              {isLockedOut ? `Too many wrong attempts. Try again in ${lockoutSecsLeft}s.` : labels.subtitle}
            </Text>
          </View>
          {isLockedOut ? (
            <View style={pinStyles.lockoutWrap}>
              <View style={pinStyles.lockoutTrack}><View style={[pinStyles.lockoutBar, { width: `${lockoutProgress * 100}%` as any }]} /></View>
              <View style={pinStyles.lockoutTimerRow}>
                <MaterialIcons name="timer" size={13} color={Colors.error} />
                <Text style={pinStyles.lockoutTimerText}>Locked for <Text style={{ fontWeight: FontWeight.bold }}>{lockoutSecsLeft}</Text> seconds</Text>
              </View>
              <View style={pinStyles.lockoutAttemptsRow}>
                {Array.from({ length: MAX_PIN_ATTEMPTS }).map((_, i) => (<View key={i} style={[pinStyles.attemptDot, { backgroundColor: Colors.error + '88' }]} />))}
              </View>
            </View>
          ) : null}
          {!isLockedOut ? (
            <Animated.View style={[pinStyles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <View key={i} style={[pinStyles.dot, i < pin.length && pinStyles.dotFilled, error ? pinStyles.dotError : null]} />
              ))}
            </Animated.View>
          ) : <View style={{ height: 42 }} />}
          {!isLockedOut && error ? (
            <View style={pinStyles.errorRow}><MaterialIcons name="error-outline" size={13} color={Colors.error} /><Text style={pinStyles.errorText}>{error}</Text></View>
          ) : !isLockedOut && mode === 'verify' && failedCount > 0 ? (
            <View style={pinStyles.attemptsWarningRow}>
              {Array.from({ length: MAX_PIN_ATTEMPTS }).map((_, i) => (
                <View key={i} style={[pinStyles.attemptDot, { backgroundColor: i < failedCount ? Colors.error : Colors.bgElevated }, i < failedCount && { borderColor: Colors.error }]} />
              ))}
              <Text style={pinStyles.attemptsWarningText}>{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left</Text>
            </View>
          ) : <View style={{ height: 22 }} />}
          <View style={[pinStyles.keypad, isLockedOut && { opacity: 0.25 }]}>
            {keys.map((k, i) => {
              if (!k) return <View key={i} style={pinStyles.keyEmpty} />;
              return (
                <TouchableOpacity key={i} style={[pinStyles.key, k === 'DEL' && pinStyles.keyDel]} onPress={() => handleKey(k)} disabled={isLockedOut} activeOpacity={0.7}>
                  {k === 'DEL' ? <MaterialIcons name="backspace" size={20} color={Colors.textSecondary} /> : <Text style={pinStyles.keyText}>{k}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={pinStyles.footer}>
            {canUseBiometric && onUseBiometric ? (
              <TouchableOpacity style={pinStyles.biometricBtn} onPress={onUseBiometric} activeOpacity={0.8}>
                <MaterialIcons name="fingerprint" size={18} color={Colors.primary} />
                <Text style={pinStyles.biometricBtnText}>Use biometrics instead</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={pinStyles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={pinStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pinStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.92)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  sheet: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.xl, width: '100%', maxWidth: 360, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.primary + '44', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 16 },
  header: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, includeFontPadding: false },
  dotsRow: { flexDirection: 'row', gap: 14, marginVertical: Spacing.lg },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border },
  dotFilled: { backgroundColor: Colors.primary, borderColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 4 },
  dotError: { borderColor: Colors.error },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22 },
  errorText: { fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12, marginTop: Spacing.md },
  key: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  keyDel: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyEmpty: { width: 68, height: 68 },
  keyText: { fontSize: 22, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  footer: { width: '100%', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  lockoutWrap: { width: '100%', alignItems: 'center', gap: Spacing.sm },
  lockoutTrack: { width: '100%', height: 5, borderRadius: 3, backgroundColor: Colors.error + '22', overflow: 'hidden' },
  lockoutBar: { height: 5, borderRadius: 3, backgroundColor: Colors.error, opacity: 0.75 },
  lockoutTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.errorBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.error + '44' },
  lockoutTimerText: { fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },
  lockoutAttemptsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  attemptDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.error + '55' },
  attemptsWarningRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 22 },
  attemptsWarningText: { fontSize: FontSize.xs, color: Colors.error, fontWeight: FontWeight.semibold, includeFontPadding: false },
  biometricBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  biometricBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  cancelBtn: { paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
});

// ── Biometric Gate ────────────────────────────────────────────────────────────
function BiometricGate({ onUnlock, biometricType }: { onUnlock: () => void; biometricType: LocalAuthentication.AuthenticationType | null }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useCallback(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ])).start();
  }, [pulseAnim]);
  useEffect(() => { pulseLoop(); }, [pulseLoop]);
  const biometricIcon = biometricType === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ? 'face' : 'fingerprint';
  const biometricLabel = biometricType === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ? 'Face ID' : 'Fingerprint';
  return (
    <View style={gateStyles.container}>
      <View style={gateStyles.coinWrap}>
        <View style={gateStyles.coinOuter}>
          <View style={gateStyles.coinInner}>
            <Text style={gateStyles.coinSymbol}>₿</Text>
            <Text style={gateStyles.coinLabel}>BTNG</Text>
          </View>
        </View>
      </View>
      <Text style={gateStyles.title}>BTNG Genesis</Text>
      <Text style={gateStyles.subtitle}>Sovereign Wallet</Text>
      <View style={gateStyles.lockWrap}>
        <Animated.View style={[gateStyles.lockIconWrap, { transform: [{ scale: pulseAnim }] }]}>
          <MaterialIcons name="lock" size={36} color={Colors.primary} />
        </Animated.View>
        <Text style={gateStyles.lockLabel}>Wallet Locked</Text>
        <Text style={gateStyles.lockSub}>Authenticate to access your BTNG wallet</Text>
      </View>
      {biometricType !== null ? (
        <TouchableOpacity style={gateStyles.authBtn} onPress={onUnlock} activeOpacity={0.8}>
          <MaterialIcons name={biometricIcon as any} size={22} color={Colors.bg} />
          <Text style={gateStyles.authBtnText}>{`Unlock with ${biometricLabel}`}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={gateStyles.authBtn} onPress={onUnlock} activeOpacity={0.8}>
          <MaterialIcons name="dialpad" size={22} color={Colors.bg} />
          <Text style={gateStyles.authBtnText}>Unlock with PIN</Text>
        </TouchableOpacity>
      )}
      <View style={gateStyles.secNote}>
        <MaterialIcons name="security" size={12} color={Colors.success} />
        <Text style={gateStyles.secNoteText}>Keys stored in device secure enclave</Text>
      </View>
    </View>
  );
}

const gateStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  coinWrap: { marginBottom: Spacing.sm },
  coinOuter: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  coinInner: { alignItems: 'center', gap: 1 },
  coinSymbol: { fontSize: 30, color: Colors.primary, includeFontPadding: false },
  coinLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 2, includeFontPadding: false },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false, marginTop: -Spacing.sm },
  lockWrap: { alignItems: 'center', gap: 8, marginVertical: Spacing.lg },
  lockIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  lockLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  lockSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.error + '44' },
  errorText: { fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },
  authBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, paddingHorizontal: Spacing.xl + 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  authBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  secNote: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '33', marginTop: Spacing.md },
  secNoteText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ── QR Code Card ─────────────────────────────────────────────────────────────
function QRAddressCard({ address }: { address: string }) {
  const { showAlert } = useAlert();
  const qrRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const handleShare = useCallback(async () => {
    try { await Share.share({ message: `My BTNG Gold (BTNG) address:\n${address}`, title: 'BTNG Genesis Wallet Address' }); }
    catch { showAlert('Share Failed', 'Could not share the address.'); }
  }, [address, showAlert]);
  const handleSaveToPhotos = useCallback(async () => {
    if (!qrRef.current) { showAlert('Error', 'QR code is not ready yet.'); return; }
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { showAlert('Permission Denied', 'Please allow photo library access in Settings to save the QR code.'); setSaving(false); return; }
      qrRef.current.toDataURL(async (dataURL: string) => {
        try {
          const fileUri = FileSystem.cacheDirectory + 'btng_address_qr.png';
          await FileSystem.writeAsStringAsync(fileUri, dataURL, { encoding: FileSystem.EncodingType.Base64 });
          const asset = await MediaLibrary.createAssetAsync(fileUri);
          await MediaLibrary.createAlbumAsync('BTNG Wallet', asset, false);
          showAlert('Saved', 'QR code saved to your Photos in the "BTNG Wallet" album.');
        } catch { showAlert('Save Failed', 'Could not save the QR code image.'); }
        finally { setSaving(false); }
      });
    } catch { showAlert('Error', 'An unexpected error occurred.'); setSaving(false); }
  }, [showAlert]);
  return (
    <View style={qrStyles.card}>
      <View style={qrStyles.header}>
        <View style={qrStyles.headerLeft}>
          <View style={qrStyles.iconWrap}><MaterialIcons name="qr-code-2" size={20} color={Colors.primary} /></View>
          <View><Text style={qrStyles.title}>Receive BTNG</Text><Text style={qrStyles.subtitle}>Scan to send to this wallet</Text></View>
        </View>
        <View style={qrStyles.networkBadge}><Text style={qrStyles.networkBadgeText}>BTNG</Text></View>
      </View>
      <View style={qrStyles.qrWrap}>
        <View style={qrStyles.qrFrame}>
          <View style={qrStyles.qrInner}>
            <QRCode value={address} size={180} color={Colors.bg} backgroundColor="#F5F0E8" logo={undefined} getRef={(ref) => { qrRef.current = ref; }} quietZone={8} />
          </View>
          <View style={[qrStyles.corner, qrStyles.cornerTL]} /><View style={[qrStyles.corner, qrStyles.cornerTR]} />
          <View style={[qrStyles.corner, qrStyles.cornerBL]} /><View style={[qrStyles.corner, qrStyles.cornerBR]} />
        </View>
        <View style={qrStyles.watermarkRow}>
          <View style={qrStyles.goldDot} /><Text style={qrStyles.watermarkText}>BITUNCOIN GOLD · BTNG</Text><View style={qrStyles.goldDot} />
        </View>
      </View>
      <View style={qrStyles.addrRow}><Text style={qrStyles.addrFull} numberOfLines={1} ellipsizeMode="middle">{address}</Text></View>
      <View style={qrStyles.actions}>
        <TouchableOpacity style={qrStyles.actionBtn} onPress={handleShare} activeOpacity={0.8}>
          <MaterialIcons name="share" size={16} color={Colors.primary} /><Text style={qrStyles.actionBtnText}>Share</Text>
        </TouchableOpacity>
        <View style={qrStyles.actionDivider} />
        <TouchableOpacity style={[qrStyles.actionBtn, saving && { opacity: 0.5 }]} onPress={handleSaveToPhotos} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="save-alt" size={16} color={Colors.primary} />}
          <Text style={qrStyles.actionBtnText}>{saving ? 'Saving...' : 'Save to Photos'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const qrStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  networkBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  networkBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },
  qrWrap: { alignItems: 'center', gap: Spacing.sm },
  qrFrame: { padding: 12, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', position: 'relative' },
  qrInner: { borderRadius: Radius.sm, overflow: 'hidden' },
  corner: { position: 'absolute', width: 18, height: 18, borderColor: Colors.primary },
  cornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: Radius.lg },
  cornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: Radius.lg },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: Radius.lg },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: Radius.lg },
  watermarkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  goldDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, opacity: 0.6 },
  watermarkText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 2, includeFontPadding: false, opacity: 0.8 },
  addrRow: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  addrFull: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  actions: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: Spacing.md },
  actionDivider: { width: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
});

// ── MTN MoMo Payment QR Card ──────────────────────────────────────────────────
function MoMoPayQRCard() {
  const { showAlert } = useAlert();
  const momoQrRef = useRef<any>(null);
  const ussdQrRef = useRef<any>(null);
  const [ussdSaving, setUssdSaving] = useState(false);
  const [ussdCopied, setUssdCopied] = useState(false);
  const [momoAmount, setMomoAmount] = useState('');
  const [momoNote, setMomoNote] = useState('');
  const [momoGenerated, setMomoGenerated] = useState(false);
  const [momoSaving, setMomoSaving] = useState(false);
  const [momoLinkCopied, setMomoLinkCopied] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptGenerated, setReceiptGenerated] = useState(false);
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [nfcWriting, setNfcWriting] = useState(false);
  const [nfcStatus, setNfcStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [nfcReading, setNfcReading] = useState(false);
  const [nfcReadStatus, setNfcReadStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [nfcReadError, setNfcReadError] = useState<string | null>(null);

  const buildMomoPayload = useCallback((): string => {
    const msisdn = BTNG_MERCHANT.msisdn.replace(/\s+/g, '').replace('+', '');
    const parts: string[] = [
      `msisdn=${encodeURIComponent(msisdn)}`,
      `merchantId=${encodeURIComponent(BTNG_MERCHANT.merchantId)}`,
      `currency=${encodeURIComponent(BTNG_MERCHANT.currency)}`,
    ];
    if (momoAmount.trim()) parts.push(`amount=${encodeURIComponent(momoAmount.trim())}`);
    parts.push(`ref=${encodeURIComponent(momoNote.trim() || 'BTNG-PAY')}`);
    return `momo://pay?${parts.join('&')}`;
  }, [momoAmount, momoNote]);

  const momoQrPayload = momoGenerated ? buildMomoPayload() : null;

  const handleMomoShare = useCallback(async () => {
    const payload = buildMomoPayload();
    const amtStr = momoAmount.trim() ? `GHS ${momoAmount.trim()}` : 'any amount';
    try {
      await Share.share({
        message: `Pay ${amtStr} to BTNG via MTN MoMo\n\nMerchant: ${BTNG_MERCHANT.legalName}\nMerchant ID: ${BTNG_MERCHANT.merchantId}\nMSISDN: ${BTNG_MERCHANT.msisdn}\n\nDeep-link: ${payload}`,
        title: 'BTNG MTN MoMo Payment Request',
      });
    } catch { showAlert('Share Failed', 'Could not share the payment link.'); }
  }, [momoAmount, buildMomoPayload, showAlert]);

  const handleMomoSave = useCallback(async () => {
    if (!momoQrRef.current) { showAlert('Error', 'QR not ready.'); return; }
    setMomoSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { showAlert('Permission Denied', 'Please allow photo library access.'); setMomoSaving(false); return; }
      momoQrRef.current.toDataURL(async (dataURL: string) => {
        try {
          const fileUri = FileSystem.cacheDirectory + 'btng_momo_qr.png';
          await FileSystem.writeAsStringAsync(fileUri, dataURL, { encoding: FileSystem.EncodingType.Base64 });
          const asset = await MediaLibrary.createAssetAsync(fileUri);
          await MediaLibrary.createAlbumAsync('BTNG Wallet', asset, false);
          showAlert('Saved', 'MoMo QR saved to "BTNG Wallet" album.');
        } catch { showAlert('Save Failed', 'Could not save QR image.'); }
        finally { setMomoSaving(false); }
      });
    } catch { showAlert('Error', 'Unexpected error.'); setMomoSaving(false); }
  }, [showAlert]);

  const handleCopyMomoLink = useCallback(() => {
    ExpoClipboard.setStringAsync(buildMomoPayload()).catch(()=>{});
    setMomoLinkCopied(true);
    setTimeout(() => setMomoLinkCopied(false), 2400);
  }, [buildMomoPayload]);

  const handleGenerateReceipt = useCallback(async () => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { showAlert('Sharing Unavailable', 'File sharing is not supported on this device.'); return; }
    setReceiptLoading(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const amtDisplay = momoAmount.trim() ? 'GHS ' + momoAmount.trim() : 'Open Amount';
      const refDisplay = momoNote.trim() || 'BTNG-PAY';
      const receiptId = 'BTNG-' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + '-' + String(now.getTime()).slice(-6);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0a0a0c;color:#fff;padding:40px 32px;max-width:480px;margin:0 auto}.header{text-align:center;padding-bottom:28px;border-bottom:2px solid #D4A01788}.logo-ring{width:72px;height:72px;border-radius:50%;border:2.5px solid #D4A017;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;background:rgba(212,160,23,0.1);box-shadow:0 0 24px rgba(212,160,23,0.25)}.logo-symbol{font-size:32px;color:#D4A017;line-height:1}.logo-label{font-size:8px;font-weight:800;color:#D4A017;letter-spacing:3px;margin-top:2px}.org-name{font-size:13px;font-weight:800;color:#D4A017;letter-spacing:1.5px;margin-bottom:4px}.trading-name{font-size:10px;font-weight:600;color:#888;letter-spacing:2px;text-transform:uppercase}.receipt-badge{display:inline-block;background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.4);border-radius:20px;padding:6px 16px;font-size:10px;font-weight:700;color:#D4A017;letter-spacing:1px;margin-top:12px}.amount-section{text-align:center;padding:32px 0 24px}.amount-label{font-size:11px;color:#666;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px}.amount-value{font-size:44px;font-weight:800;color:#D4A017;letter-spacing:-1px}.amount-currency{font-size:18px;font-weight:700;color:#D4A017;opacity:0.8}.details-card{background:#111;border-radius:14px;border:1px solid #222;overflow:hidden;margin-bottom:20px}.detail-row{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #1a1a1a}.detail-row:last-child{border-bottom:none}.detail-key{font-size:11px;color:#666;font-weight:600;letter-spacing:0.5px}.detail-value{font-size:12px;color:#fff;font-weight:600;text-align:right;max-width:200px}.detail-value.gold{color:#D4A017;font-weight:800}.detail-value.green{color:#22C55E}.status-section{text-align:center;padding:20px 0}.status-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:30px;padding:10px 20px}.status-dot{width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 8px rgba(34,197,94,0.8)}.status-text{font-size:12px;font-weight:700;color:#22C55E;letter-spacing:0.5px}.footer{text-align:center;padding-top:24px;border-top:1px solid #1a1a1a;margin-top:8px}.footer-brand{font-size:11px;color:#444;font-weight:600;letter-spacing:0.5px;margin-bottom:4px}.footer-note{font-size:9px;color:#333;line-height:1.6}.receipt-id{font-size:9px;color:#333;font-family:monospace;margin-top:10px;letter-spacing:0.5px}.divider{height:1px;background:linear-gradient(to right,transparent,#D4A01755,transparent);margin:20px 0}</style></head><body><div class="header"><div class="logo-ring"><div><div class="logo-symbol">&#x20BF;</div><div class="logo-label">BTNG</div></div></div><div class="org-name">EKUYE DIGITAL GATEWAY TRUST LTD</div><div class="trading-name">BTNG SOVEREIGN NETWORK</div><div class="receipt-badge">PAYMENT RECEIPT</div></div><div class="amount-section"><div class="amount-label">Amount Due</div><div class="amount-value">${momoAmount.trim() || '—'}<span class="amount-currency">${momoAmount.trim() ? '' : ''}</span></div>${momoAmount.trim() ? '<div style="font-size:13px;color:#666;margin-top:4px">Ghana Cedis (GHS) · MTN MoMo</div>' : '<div style="font-size:13px;color:#666;margin-top:4px">Open Amount · Customer to enter</div>'}</div><div class="details-card"><div class="detail-row"><span class="detail-key">Merchant Name</span><span class="detail-value gold">Ekuye Digital Gateway</span></div><div class="detail-row"><span class="detail-key">Trading Name</span><span class="detail-value">BTNG Sovereign Network</span></div><div class="detail-row"><span class="detail-key">Merchant ID</span><span class="detail-value gold">248059</span></div><div class="detail-row"><span class="detail-key">MSISDN</span><span class="detail-value">+233 54 041 8537</span></div><div class="detail-row"><span class="detail-key">Network</span><span class="detail-value">MTN MoMo · Ghana</span></div><div class="detail-row"><span class="detail-key">Reference</span><span class="detail-value gold">${refDisplay}</span></div><div class="detail-row"><span class="detail-key">Currency</span><span class="detail-value">GHS · Ghanaian Cedi</span></div><div class="detail-row"><span class="detail-key">Date</span><span class="detail-value">${dateStr}</span></div><div class="detail-row"><span class="detail-key">Time</span><span class="detail-value">${timeStr} GMT</span></div><div class="detail-row"><span class="detail-key">Payment Method</span><span class="detail-value">Dial *170# · MoMoPay</span></div></div><div class="status-section"><div class="status-badge"><div class="status-dot"></div><span class="status-text">AWAITING PAYMENT</span></div></div><div class="divider"></div><div class="footer"><div class="footer-brand">EKUYE DIGITAL GATEWAY TRUST LTD  ·  BTNG SOVEREIGN NETWORK</div><div class="footer-note">West Africa · 54 African Nations · Ghana<br>This receipt is issued by the BTNG Cash Rail sovereign payment engine.<br>For support contact: info@bituncoin.io</div><div class="receipt-id">${receiptId}</div></div></body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const destUri = (FileSystem.cacheDirectory ?? '') + 'BTNG_Receipt_' + String(now.getTime()) + '.pdf';
      await FileSystem.copyAsync({ from: uri, to: destUri });
      await Sharing.shareAsync(destUri, { mimeType: 'application/pdf', dialogTitle: 'BTNG Payment Receipt', UTI: 'com.adobe.pdf' });
      setReceiptGenerated(true);
      setTimeout(() => setReceiptGenerated(false), 4000);
    } catch (e: any) {
      showAlert('Receipt Failed', e?.message ?? 'Could not generate the receipt PDF.');
    } finally { setReceiptLoading(false); }
  }, [momoAmount, momoNote, showAlert]);

  // ── NFC Write ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (NfcManager && typeof NfcManager.isSupported === 'function') {
      NfcManager.isSupported().then((supported: boolean) => setNfcSupported(supported)).catch(() => setNfcSupported(false));
    } else {
      setNfcSupported(false);
    }
  }, []);

  const handleNfcWrite = useCallback(async () => {
    if (!nfcSupported || !NfcManager) { showAlert('NFC Not Available', 'This device does not support NFC.'); return; }
    const payload = buildMomoPayload();
    setNfcWriting(true); setNfcError(null); setNfcStatus('waiting');
    try {
      await NfcManager.start();
      await NfcManager.requestTechnology(NfcTech?.Ndef ?? 'Ndef');
      setNfcStatus('waiting');
      const bytes = Ndef?.encodeMessage([Ndef.uriRecord(payload)]);
      if (bytes) { await NfcManager.ndefHandler.writeNdefMessage(bytes); }
      setNfcStatus('success');
      setTimeout(() => setNfcStatus('idle'), 3000);
    } catch (ex: any) {
      if (ex?.message !== 'NFC manager is already started' && ex?.message !== 'cancelled') {
        const msg = ex?.message ?? 'Could not write to NFC tag. Hold tag closer and try again.';
        setNfcError(msg); setNfcStatus('error');
        setTimeout(() => { setNfcStatus('idle'); setNfcError(null); }, 4000);
      } else { setNfcStatus('idle'); }
    } finally {
      NfcManager.cancelTechnologyRequest?.().catch(() => {});
      setNfcWriting(false);
    }
  }, [nfcSupported, buildMomoPayload, showAlert]);

  const handleNfcRead = useCallback(async () => {
    if (!nfcSupported || !NfcManager) { showAlert('NFC Not Available', 'This device does not support NFC.'); return; }
    setNfcReading(true); setNfcReadError(null); setNfcReadStatus('scanning');
    try {
      await NfcManager.start();
      await NfcManager.requestTechnology(NfcTech?.Ndef ?? 'Ndef');
      const tag = await NfcManager.getTag();
      const ndefRecords = tag?.ndefMessage ?? [];
      let decoded: string | null = null;
      for (const record of ndefRecords) {
        try {
          const uri = Ndef?.uri?.decodePayload(record.payload as unknown as number[]);
          if (uri && uri.includes('momo://')) { decoded = uri; break; }
        } catch { /* skip non-URI records */ }
      }
      if (!decoded) {
        setNfcReadStatus('error');
        setNfcReadError('No momo://pay URI found on this tag.');
        setTimeout(() => { setNfcReadStatus('idle'); setNfcReadError(null); }, 4000);
      } else {
        try {
          const queryStr = decoded.includes('?') ? decoded.split('?')[1] : '';
          const params = new URLSearchParams(queryStr);
          const tagAmount = params.get('amount');
          const tagRef = params.get('ref');
          if (tagAmount) setMomoAmount(decodeURIComponent(tagAmount));
          if (tagRef) setMomoNote(decodeURIComponent(tagRef));
          setMomoGenerated(false);
          setNfcReadStatus('success');
          setTimeout(() => setNfcReadStatus('idle'), 3500);
        } catch {
          setNfcReadStatus('error');
          setNfcReadError('Could not parse momo://pay parameters.');
          setTimeout(() => { setNfcReadStatus('idle'); setNfcReadError(null); }, 4000);
        }
      }
    } catch (ex: any) {
      if (ex?.message !== 'cancelled' && ex?.message !== 'NFC manager is already started') {
        setNfcReadStatus('error');
        setNfcReadError(ex?.message ?? 'Could not read NFC tag.');
        setTimeout(() => { setNfcReadStatus('idle'); setNfcReadError(null); }, 4000);
      } else { setNfcReadStatus('idle'); }
    } finally {
      NfcManager.cancelTechnologyRequest?.().catch(() => {});
      setNfcReading(false);
    }
  }, [nfcSupported, showAlert]);

  const USSD_PAYLOAD = 'tel:*170%23';

  const handleUssdSave = useCallback(async () => {
    if (!ussdQrRef.current) { showAlert('Error', 'QR not ready.'); return; }
    setUssdSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { showAlert('Permission Denied', 'Please allow photo library access.'); setUssdSaving(false); return; }
      ussdQrRef.current.toDataURL(async (dataURL: string) => {
        try {
          const fileUri = FileSystem.cacheDirectory + 'btng_ussd_qr.png';
          await FileSystem.writeAsStringAsync(fileUri, dataURL, { encoding: FileSystem.EncodingType.Base64 });
          const asset = await MediaLibrary.createAssetAsync(fileUri);
          await MediaLibrary.createAlbumAsync('BTNG Wallet', asset, false);
          showAlert('Saved', 'USSD QR saved to your BTNG Wallet album.');
        } catch { showAlert('Save Failed', 'Could not save QR image.'); }
        finally { setUssdSaving(false); }
      });
    } catch { showAlert('Error', 'Unexpected error.'); setUssdSaving(false); }
  }, [showAlert]);

  const handleUssdShare = useCallback(async () => {
    try {
      await Share.share({
        message: 'Dial *170# to pay via MTN MoMo\n\nMerchant: ' + BTNG_MERCHANT.legalName + '\nMerchant ID: ' + BTNG_MERCHANT.merchantId + '\nNumber: ' + BTNG_MERCHANT.msisdnLocal + '\n\nScan the QR or dial *170# on any MTN number.',
        title: 'BTNG MTN MoMo Dial-to-Pay',
      });
    } catch { showAlert('Share Failed', 'Could not share.'); }
  }, [showAlert]);

  const handleCopyUssdCode = useCallback(() => {
    ExpoClipboard.setStringAsync('*170#').catch(()=>{});
    setUssdCopied(true);
    setTimeout(() => setUssdCopied(false), 2400);
  }, []);

  return (
    <View style={momoStyles.card}>
      <View style={momoStyles.header}>
        <View style={momoStyles.iconWrap}><MaterialIcons name="qr-code-2" size={20} color={Colors.warning} /></View>
        <View style={{ flex: 1 }}>
          <Text style={momoStyles.cardTitle}>MTN MoMo Pay</Text>
          <Text style={momoStyles.cardSubtitle}>Request Payment QR Code</Text>
        </View>
        <View style={momoStyles.networkBadge}>
          <MaterialIcons name="cell-tower" size={10} color={Colors.warning} />
          <Text style={momoStyles.networkBadgeText}>MoMo</Text>
        </View>
      </View>
      <View style={momoStyles.merchantStrip}>
        <Text style={momoStyles.merchantFlag}>🇬🇭</Text>
        <View style={{ flex: 1 }}>
          <Text style={momoStyles.merchantName} numberOfLines={1}>{BTNG_MERCHANT.legalName}</Text>
          <Text style={[momoStyles.merchantMeta, { color: Colors.primary, fontSize: 10, fontWeight: FontWeight.bold }]} numberOfLines={1}>{BTNG_MERCHANT.tradingName}</Text>
          <Text style={momoStyles.merchantMeta}>ID {BTNG_MERCHANT.merchantId} · {BTNG_MERCHANT.msisdn}</Text>
        </View>
        <View style={momoStyles.ghsBadge}><Text style={momoStyles.ghsBadgeText}>{BTNG_MERCHANT.currency}</Text></View>
      </View>
      {/* NFC reader strip */}
      {nfcSupported !== false && (
        <TouchableOpacity
          style={[
            momoStyles.nfcReadBtn,
            nfcReadStatus === 'scanning' && momoStyles.nfcReadBtnScanning,
            nfcReadStatus === 'success' && momoStyles.nfcReadBtnSuccess,
            nfcReadStatus === 'error' && momoStyles.nfcReadBtnError,
            nfcReading && { opacity: 0.75 },
          ]}
          onPress={handleNfcRead}
          disabled={nfcReading || nfcWriting}
          activeOpacity={0.8}
        >
          {nfcReading ? (
            <ActivityIndicator size="small" color={Colors.warning} />
          ) : (
            <MaterialIcons
              name={nfcReadStatus === 'success' ? 'check-circle' : nfcReadStatus === 'error' ? 'error-outline' : 'nfc'}
              size={17}
              color={nfcReadStatus === 'success' ? Colors.success : nfcReadStatus === 'error' ? Colors.error : Colors.warning}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={momoStyles.nfcReadBtnTitle}>
              {nfcReadStatus === 'scanning' ? 'Scanning tag…'
                : nfcReadStatus === 'success' ? 'Fields pre-filled from tag'
                : nfcReadStatus === 'error' ? (nfcReadError ?? 'Read failed')
                : 'Scan NFC Tag to pre-fill'}
            </Text>
            <Text style={momoStyles.nfcReadBtnSub}>
              {nfcReadStatus === 'scanning' ? 'Hold tag to back of phone'
                : nfcReadStatus === 'success' ? 'Amount & reference loaded'
                : nfcReadStatus === 'error' ? 'Tap to retry'
                : 'Reads momo://pay tag · auto-fills amount & ref'}
            </Text>
          </View>
          {nfcReadStatus === 'idle' && (
            <View style={momoStyles.nfcReadChip}><Text style={momoStyles.nfcReadChipText}>READ</Text></View>
          )}
        </TouchableOpacity>
      )}
      <View style={momoStyles.fieldGroup}>
        <View style={momoStyles.fieldLabelRow}><MaterialIcons name="payments" size={12} color={Colors.textMuted} /><Text style={momoStyles.fieldLabel}>Amount (GHS) — optional</Text></View>
        <View style={momoStyles.amountRow}>
          <View style={momoStyles.amountPrefix}><Text style={momoStyles.amountPrefixText}>GHS</Text></View>
          <TextInput style={momoStyles.amountInput} value={momoAmount} onChangeText={v => { setMomoAmount(v.replace(/[^0-9.]/g, '')); setMomoGenerated(false); }} placeholder="0.00" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" returnKeyType="done" />
          {momoAmount.trim() ? (<TouchableOpacity style={momoStyles.amountClear} onPress={() => { setMomoAmount(''); setMomoGenerated(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><MaterialIcons name="close" size={14} color={Colors.textMuted} /></TouchableOpacity>) : null}
        </View>
      </View>
      {/* NFC reader strip */}
      {nfcSupported !== false && (
        <TouchableOpacity
          style={[
            momoStyles.nfcReadBtn,
            nfcReadStatus === 'scanning' && momoStyles.nfcReadBtnScanning,
            nfcReadStatus === 'success' && momoStyles.nfcReadBtnSuccess,
            nfcReadStatus === 'error' && momoStyles.nfcReadBtnError,
            nfcReading && { opacity: 0.75 },
          ]}
          onPress={handleNfcRead}
          disabled={nfcReading || nfcWriting}
          activeOpacity={0.8}
        >
          {nfcReading ? (
            <ActivityIndicator size="small" color={Colors.warning} />
          ) : (
            <MaterialIcons
              name={nfcReadStatus === 'success' ? 'check-circle' : nfcReadStatus === 'error' ? 'error-outline' : 'nfc'}
              size={17}
              color={nfcReadStatus === 'success' ? Colors.success : nfcReadStatus === 'error' ? Colors.error : Colors.warning}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={momoStyles.nfcReadBtnTitle}>
              {nfcReadStatus === 'scanning' ? 'Scanning tag…'
                : nfcReadStatus === 'success' ? 'Fields pre-filled from tag'
                : nfcReadStatus === 'error' ? (nfcReadError ?? 'Read failed')
                : 'Scan NFC Tag to pre-fill'}
            </Text>
            <Text style={momoStyles.nfcReadBtnSub}>
              {nfcReadStatus === 'scanning' ? 'Hold tag to back of phone'
                : nfcReadStatus === 'success' ? 'Amount & reference loaded'
                : nfcReadStatus === 'error' ? 'Tap to retry'
                : 'Reads momo://pay tag · auto-fills amount & ref'}
            </Text>
          </View>
          {nfcReadStatus === 'idle' && (
            <View style={momoStyles.nfcReadChip}><Text style={momoStyles.nfcReadChipText}>READ</Text></View>
          )}
        </TouchableOpacity>
      )}
      <View style={momoStyles.fieldGroup}>
        <View style={momoStyles.fieldLabelRow}><MaterialIcons name="short-text" size={12} color={Colors.textMuted} /><Text style={momoStyles.fieldLabel}>Reference / Note — optional</Text></View>
        <TextInput style={momoStyles.noteInput} value={momoNote} onChangeText={v => { setMomoNote(v); setMomoGenerated(false); }} placeholder="e.g. BTNG deposit, invoice #001" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} maxLength={40} returnKeyType="done" />
      </View>
      <TouchableOpacity style={[momoStyles.generateBtn, momoGenerated && momoStyles.generateBtnDone]} onPress={() => setMomoGenerated(true)} activeOpacity={0.8}>
        <MaterialIcons name={momoGenerated ? 'check-circle' : 'qr-code-2'} size={16} color={momoGenerated ? Colors.success : Colors.bg} />
        <Text style={[momoStyles.generateBtnText, momoGenerated && { color: Colors.success }]}>{momoGenerated ? 'QR Code Ready' : 'Generate MoMo QR'}</Text>
      </TouchableOpacity>
      {momoQrPayload ? (
        <View style={momoStyles.qrSection}>
          <View style={momoStyles.qrFrame}>
            <View style={momoStyles.qrInner}>
              <QRCode value={momoQrPayload} size={190} color={Colors.bg} backgroundColor="#FFF8EC" getRef={(ref) => { momoQrRef.current = ref; }} quietZone={10} />
            </View>
            <View style={[momoStyles.qrCorner, momoStyles.qrCornerTL]} /><View style={[momoStyles.qrCorner, momoStyles.qrCornerTR]} />
            <View style={[momoStyles.qrCorner, momoStyles.qrCornerBL]} /><View style={[momoStyles.qrCorner, momoStyles.qrCornerBR]} />
          </View>
          <View style={momoStyles.badgeRow}>
            {momoAmount.trim() ? (
              <View style={momoStyles.amountBadge}><Text style={momoStyles.amountBadgeCurrency}>GHS</Text><Text style={momoStyles.amountBadgeValue}>{momoAmount.trim()}</Text></View>
            ) : (
              <View style={[momoStyles.amountBadge, momoStyles.amountBadgeAny]}><MaterialIcons name="all-inclusive" size={11} color={Colors.textMuted} /><Text style={momoStyles.amountBadgeAnyText}>Any amount</Text></View>
            )}
            {momoNote.trim() ? (<View style={momoStyles.noteBadge}><MaterialIcons name="label" size={10} color={Colors.textMuted} /><Text style={momoStyles.noteBadgeText} numberOfLines={1}>{momoNote.trim()}</Text></View>) : null}
          </View>
          <View style={momoStyles.deepLinkRow}>
            <Text style={momoStyles.deepLinkText} numberOfLines={1} ellipsizeMode="middle">{momoQrPayload}</Text>
            <TouchableOpacity style={[momoStyles.copyLinkBtn, momoLinkCopied && momoStyles.copyLinkBtnDone]} onPress={handleCopyMomoLink} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <MaterialIcons name={momoLinkCopied ? 'check-circle' : 'copy-all'} size={13} color={momoLinkCopied ? Colors.success : Colors.warning} />
              <Text style={[momoStyles.copyLinkBtnText, momoLinkCopied && { color: Colors.success }]}>{momoLinkCopied ? 'Copied' : 'Copy link'}</Text>
            </TouchableOpacity>
          </View>
          {/* NFC tap-to-pay */}
          {nfcSupported !== false && (
            <View style={momoStyles.nfcSection}>
              <TouchableOpacity
                style={[
                  momoStyles.nfcBtn,
                  nfcStatus === 'waiting' && momoStyles.nfcBtnWaiting,
                  nfcStatus === 'success' && momoStyles.nfcBtnSuccess,
                  nfcStatus === 'error' && momoStyles.nfcBtnError,
                  nfcWriting && { opacity: 0.75 },
                ]}
                onPress={handleNfcWrite}
                disabled={nfcWriting}
                activeOpacity={0.8}
              >
                {nfcWriting && nfcStatus === 'waiting' ? (
                  <ActivityIndicator size="small" color={Colors.bg} />
                ) : (
                  <MaterialIcons
                    name={nfcStatus === 'success' ? 'check-circle' : nfcStatus === 'error' ? 'error-outline' : 'nfc'}
                    size={20}
                    color={Colors.bg}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={momoStyles.nfcBtnTitle}>
                    {nfcStatus === 'waiting' ? 'Hold NFC tag to phone…'
                      : nfcStatus === 'success' ? 'NFC Tag Written!'
                      : nfcStatus === 'error' ? 'Write Failed — Retry'
                      : 'Write to NFC Tag'}
                  </Text>
                  <Text style={momoStyles.nfcBtnSub}>
                    {nfcStatus === 'waiting' ? 'Keep tag steady until confirmed'
                      : nfcStatus === 'success' ? 'Customers can now tap to pay'
                      : nfcStatus === 'error' && nfcError ? nfcError
                      : 'Tap-to-pay · momo://pay deep-link'}
                  </Text>
                </View>
                {nfcStatus === 'idle' && (
                  <View style={momoStyles.nfcChip}>
                    <Text style={momoStyles.nfcChipText}>NFC</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
          <View style={momoStyles.actionsRow}>
            <TouchableOpacity style={momoStyles.actionBtn} onPress={handleMomoShare} activeOpacity={0.8}><MaterialIcons name="share" size={15} color={Colors.warning} /><Text style={momoStyles.actionBtnText}>Share</Text></TouchableOpacity>
            <View style={momoStyles.actionDivider} />
            <TouchableOpacity style={[momoStyles.actionBtn, momoSaving && { opacity: 0.5 }]} onPress={handleMomoSave} disabled={momoSaving} activeOpacity={0.8}>
              {momoSaving ? <ActivityIndicator size="small" color={Colors.warning} /> : <MaterialIcons name="save-alt" size={15} color={Colors.warning} />}
              <Text style={momoStyles.actionBtnText}>{momoSaving ? 'Saving…' : 'Save to Photos'}</Text>
            </TouchableOpacity>
          </View>
          {/* Receipt Generator */}
          <TouchableOpacity
            style={[momoStyles.receiptBtn, receiptGenerated && momoStyles.receiptBtnDone, receiptLoading && { opacity: 0.6 }]}
            onPress={handleGenerateReceipt}
            disabled={receiptLoading}
            activeOpacity={0.85}
          >
            {receiptLoading ? (
              <ActivityIndicator size="small" color={Colors.bg} />
            ) : (
              <MaterialIcons name={receiptGenerated ? 'check-circle' : 'receipt-long'} size={17} color={receiptGenerated ? Colors.success : Colors.bg} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[momoStyles.receiptBtnTitle, receiptGenerated && { color: Colors.success }]}>
                {receiptLoading ? 'Generating PDF…' : receiptGenerated ? 'Receipt Ready — Shared!' : 'Generate Receipt PDF'}
              </Text>
              <Text style={momoStyles.receiptBtnSub}>
                {receiptGenerated ? 'Branded PDF sent to share sheet' : 'EKUYE DIGITAL GATEWAY TRUST LTD · Merchant ID 248059'}
              </Text>
            </View>
            {!receiptLoading && !receiptGenerated && (
              <View style={momoStyles.receiptChip}><Text style={momoStyles.receiptChipText}>PDF</Text></View>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={momoStyles.formatNote}>
        <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
        <Text style={momoStyles.formatNoteText}>{'Encodes '}<Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>momo://pay</Text>{' deep-link · Scannable by any MTN MoMo app'}</Text>
      </View>

      {/* USSD Dial-to-Pay QR */}
      <View style={ussdStyles.divider} />
      <View style={ussdStyles.section}>
        <View style={ussdStyles.sectionHeader}>
          <View style={ussdStyles.sectionIconWrap}>
            <MaterialIcons name="dialpad" size={18} color={Colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ussdStyles.sectionTitle}>Dial *170# to MoMoPay</Text>
            <Text style={ussdStyles.sectionSubtitle}>Auto-dial QR · scan to open phone dialler</Text>
          </View>
          <TouchableOpacity
            style={[ussdStyles.copyCodeBtn, ussdCopied && ussdStyles.copyCodeBtnDone]}
            onPress={handleCopyUssdCode}
            activeOpacity={0.8}
          >
            <MaterialIcons name={ussdCopied ? 'check-circle' : 'content-copy'} size={12} color={ussdCopied ? Colors.success : Colors.warning} />
            <Text style={[ussdStyles.copyCodeBtnText, ussdCopied && { color: Colors.success }]}>{ussdCopied ? 'Copied' : '*170#'}</Text>
          </TouchableOpacity>
        </View>

        <View style={ussdStyles.qrWrap}>
          <View style={ussdStyles.qrFrame}>
            <View style={ussdStyles.qrInner}>
              <QRCode
                value={USSD_PAYLOAD}
                size={170}
                color={Colors.bg}
                backgroundColor="#FFF8EC"
                getRef={(ref) => { ussdQrRef.current = ref; }}
                quietZone={10}
              />
            </View>
            <View style={[ussdStyles.corner, ussdStyles.cornerTL]} />
            <View style={[ussdStyles.corner, ussdStyles.cornerTR]} />
            <View style={[ussdStyles.corner, ussdStyles.cornerBL]} />
            <View style={[ussdStyles.corner, ussdStyles.cornerBR]} />
          </View>
          <View style={ussdStyles.dialBadge}>
            <MaterialIcons name="dialpad" size={13} color={Colors.warning} />
            <Text style={ussdStyles.dialBadgeCode}>*170#</Text>
            <View style={ussdStyles.dialBadgeDivider} />
            <Text style={ussdStyles.dialBadgeMerchant}>ID {BTNG_MERCHANT.merchantId}</Text>
          </View>
        </View>

        <View style={ussdStyles.stepsCard}>
          {[
            { n: '1', text: 'Scan this QR to open your phone dialler with *170# pre-filled' },
            { n: '2', text: 'Press Call to launch the MTN MoMo USSD menu' },
            { n: '3', text: 'Select MoMoPay and enter Merchant ID 248059' },
            { n: '4', text: 'Enter amount and confirm with your MoMo PIN' },
          ].map(step => (
            <View key={step.n} style={ussdStyles.step}>
              <View style={ussdStyles.stepNum}><Text style={ussdStyles.stepNumText}>{step.n}</Text></View>
              <Text style={ussdStyles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>

        <View style={ussdStyles.actionsRow}>
          <TouchableOpacity style={ussdStyles.actionBtn} onPress={handleUssdShare} activeOpacity={0.8}>
            <MaterialIcons name="share" size={14} color={Colors.warning} />
            <Text style={ussdStyles.actionBtnText}>Share</Text>
          </TouchableOpacity>
          <View style={ussdStyles.actionDivider} />
          <TouchableOpacity style={[ussdStyles.actionBtn, ussdSaving && { opacity: 0.5 }]} onPress={handleUssdSave} disabled={ussdSaving} activeOpacity={0.8}>
            {ussdSaving ? <ActivityIndicator size="small" color={Colors.warning} /> : <MaterialIcons name="save-alt" size={14} color={Colors.warning} />}
            <Text style={ussdStyles.actionBtnText}>{ussdSaving ? 'Saving...' : 'Save to Photos'}</Text>
          </TouchableOpacity>
        </View>

        <View style={ussdStyles.compatNote}>
          <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
          <Text style={ussdStyles.compatNoteText}>
            {'Encodes '}<Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>tel:*170%23</Text>{' · Works on Android & iOS · Any MTN Ghana SIM'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const momoStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.warning + '55', gap: Spacing.md, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 14, elevation: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  networkBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.warning + '55' },
  networkBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.warning, letterSpacing: 0.5, includeFontPadding: false },
  merchantStrip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  merchantFlag: { fontSize: 18 },
  merchantName: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  merchantMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  ghsBadge: { backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.warning + '44' },
  ghsBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  fieldGroup: { gap: 6 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fieldLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning + '55', overflow: 'hidden' },
  amountPrefix: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, backgroundColor: Colors.warningBg, borderRightWidth: 1, borderRightColor: Colors.warning + '44' },
  amountPrefixText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  amountInput: { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, includeFontPadding: false },
  amountClear: { paddingHorizontal: Spacing.md },
  noteInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.warning, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  generateBtnDone: { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '55', shadowOpacity: 0, elevation: 0 },
  generateBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  qrSection: { alignItems: 'center', gap: Spacing.md },
  qrFrame: { padding: 14, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning + '66', position: 'relative' },
  qrInner: { borderRadius: Radius.sm, overflow: 'hidden' },
  qrCorner: { position: 'absolute', width: 18, height: 18, borderColor: Colors.warning },
  qrCornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: Radius.lg },
  qrCornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: Radius.lg },
  qrCornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: Radius.lg },
  qrCornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: Radius.lg },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  amountBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '55' },
  amountBadgeAny: { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  amountBadgeCurrency: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  amountBadgeValue: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  amountBadgeAnyText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  noteBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border, maxWidth: 160 },
  noteBadgeText: { fontSize: 10, color: Colors.textSecondary, includeFontPadding: false, flex: 1 },
  deepLinkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingLeft: Spacing.md, paddingRight: Spacing.sm, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, width: '100%' },
  deepLinkText: { flex: 1, fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  copyLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.warning + '44' },
  copyLinkBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  copyLinkBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  actionsRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', width: '100%' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: Spacing.md },
  actionDivider: { width: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.warning, includeFontPadding: false },
  formatNote: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  formatNoteText: { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
  nfcReadBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, paddingHorizontal: Spacing.md, borderWidth: 1.5, borderColor: Colors.warning + '55' },
  nfcReadBtnScanning: { borderColor: Colors.warning, backgroundColor: Colors.warningBg },
  nfcReadBtnSuccess: { borderColor: Colors.success + '77', backgroundColor: Colors.successBg },
  nfcReadBtnError: { borderColor: Colors.error + '66', backgroundColor: Colors.errorBg },
  nfcReadBtnTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  nfcReadBtnSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  nfcReadChip: { backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.warning + '55' },
  nfcReadChipText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, letterSpacing: 0.8, includeFontPadding: false },
  nfcSection: { gap: Spacing.sm },
  nfcBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '88', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  nfcBtnWaiting: { backgroundColor: Colors.warning, borderColor: Colors.warning, shadowColor: Colors.warning },
  nfcBtnSuccess: { backgroundColor: Colors.success, borderColor: Colors.success, shadowColor: Colors.success },
  nfcBtnError: { backgroundColor: Colors.error, borderColor: Colors.error, shadowColor: Colors.error },
  nfcBtnTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  nfcBtnSub: { fontSize: 10, color: Colors.bg, opacity: 0.8, includeFontPadding: false, marginTop: 2 },
  nfcChip: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  nfcChipText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, letterSpacing: 0.8, includeFontPadding: false },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '88', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  receiptBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '66', shadowOpacity: 0, elevation: 0 },
  receiptBtnTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  receiptBtnSub: { fontSize: 10, color: Colors.bg, opacity: 0.75, includeFontPadding: false, marginTop: 2 },
  receiptChip: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  receiptChipText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, letterSpacing: 0.8, includeFontPadding: false },
});

const ussdStyles = StyleSheet.create({
  divider: { height: 1, backgroundColor: Colors.warning + '33', marginVertical: 4 },
  section: { gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  copyCodeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1.5, borderColor: Colors.warning + '66' },
  copyCodeBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' },
  copyCodeBtnText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.warning, letterSpacing: 0.5, includeFontPadding: false },
  qrWrap: { alignItems: 'center', gap: Spacing.sm },
  qrFrame: { padding: 13, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning + '77', position: 'relative' },
  qrInner: { borderRadius: Radius.sm, overflow: 'hidden' },
  corner: { position: 'absolute', width: 18, height: 18, borderColor: Colors.warning },
  cornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: Radius.lg },
  cornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: Radius.lg },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: Radius.lg },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: Radius.lg },
  dialBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1.5, borderColor: Colors.warning + '66' },
  dialBadgeCode: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.warning, letterSpacing: 1, includeFontPadding: false },
  dialBadgeDivider: { width: 1, height: 14, backgroundColor: Colors.warning + '55' },
  dialBadgeMerchant: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  stepsCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '33', gap: Spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '66', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNumText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  stepText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  actionsRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: Spacing.md },
  actionDivider: { width: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.warning, includeFontPadding: false },
  compatNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  compatNoteText: { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
});

// ── Bulk Payment QR Section ───────────────────────────────────────────────────
interface BulkEntry {
  id: string;
  name: string;
  amount: string;
}

function BulkPayQRSection() {
  const { showAlert } = useAlert();
  const [entries, setEntries] = useState<BulkEntry[]>([
    { id: '1', name: '', amount: '' },
    { id: '2', name: '', amount: '' },
  ]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const bulkQrRefs = useRef<Map<string, any>>(new Map());

  // History
  const [bulkHistory, setBulkHistory] = useState<BulkHistoryEntry[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  useEffect(() => {
    loadBulkHistory().then(setBulkHistory);
  }, []);

  const addEntry = useCallback(() => {
    if (entries.length >= 20) { showAlert('Limit Reached', 'Maximum 20 payers per bulk export.'); return; }
    setEntries(prev => [...prev, { id: Date.now().toString(), name: '', amount: '' }]);
  }, [entries.length, showAlert]);

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    bulkQrRefs.current.delete(id);
  }, []);

  const updateEntry = useCallback((id: string, field: 'name' | 'amount', value: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: field === 'amount' ? value.replace(/[^0-9.]/g, '') : value } : e));
  }, []);

  const buildPayload = useCallback((entry: BulkEntry): string => {
    const msisdn = BTNG_MERCHANT.msisdn.replace(/\s+/g, '').replace('+', '');
    const parts = [
      `msisdn=${encodeURIComponent(msisdn)}`,
      `merchantId=${encodeURIComponent(BTNG_MERCHANT.merchantId)}`,
      `currency=${encodeURIComponent(BTNG_MERCHANT.currency)}`,
    ];
    if (entry.amount.trim()) parts.push(`amount=${encodeURIComponent(entry.amount.trim())}`);
    const ref = entry.name.trim() ? `BTNG-${entry.name.trim().replace(/\s+/g, '-').toUpperCase()}` : 'BTNG-PAY';
    parts.push(`ref=${encodeURIComponent(ref)}`);
    return `momo://pay?${parts.join('&')}`;
  }, []);

  const validEntries = entries.filter(e => e.name.trim());

  const handleExportZip = useCallback(async () => {
    if (validEntries.length === 0) { showAlert('No Payers', 'Add at least one payer name before exporting.'); return; }
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { showAlert('Sharing Unavailable', 'File sharing is not supported on this device.'); return; }
    setExporting(true); setExportProgress(0);
    try {
      const zip = new JSZip();
      let done = 0;
      await new Promise<void>((resolve) => {
        const processNext = (index: number) => {
          if (index >= validEntries.length) { resolve(); return; }
          const entry = validEntries[index];
          const ref = bulkQrRefs.current.get(entry.id);
          if (!ref) { done++; setExportProgress(Math.round((done / validEntries.length) * 100)); processNext(index + 1); return; }
          ref.toDataURL((dataURL: string) => {
            try {
              const safeName = entry.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || `payer_${index + 1}`;
              const amtSuffix = entry.amount.trim() ? `_GHS${entry.amount.trim()}` : '';
              zip.file(`BTNG_MoMo_${safeName}${amtSuffix}.png`, dataURL, { base64: true });
            } catch { /* skip */ }
            done++;
            setExportProgress(Math.round((done / validEntries.length) * 100));
            processNext(index + 1);
          });
        };
        processNext(0);
      });
      const zipBase64 = await zip.generateAsync({ type: 'base64' });
      const zipPath = `${FileSystem.cacheDirectory}BTNG_MoMo_Bulk_${Date.now()}.zip`;
      await FileSystem.writeAsStringAsync(zipPath, zipBase64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(zipPath, {
        mimeType: 'application/zip',
        dialogTitle: `BTNG MoMo Bulk QR — ${validEntries.length} payer${validEntries.length !== 1 ? 's' : ''}`,
        UTI: 'com.pkware.zip-archive',
      });

      // Save to history
      const totalGHS = validEntries.reduce((sum, e) => {
        const amt = parseFloat(e.amount.trim());
        return sum + (isNaN(amt) ? 0 : amt);
      }, 0);
      const historyEntry: BulkHistoryEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        payerCount: validEntries.length,
        totalGHS,
        payers: validEntries.map(e => ({ name: e.name.trim(), amount: e.amount.trim() })),
      };
      await saveBulkHistoryEntry(historyEntry);
      const updated = await loadBulkHistory();
      setBulkHistory(updated);
    } catch (e: any) {
      showAlert('Export Failed', e?.message ?? 'Could not generate the ZIP archive.');
    } finally { setExporting(false); setExportProgress(0); }
  }, [validEntries, showAlert]);

  return (
    <View style={bulkStyles.container}>
      {/* Header */}
      <View style={bulkStyles.header}>
        <View style={bulkStyles.iconWrap}><MaterialIcons name="grid-view" size={16} color={Colors.warning} /></View>
        <View style={{ flex: 1 }}>
          <Text style={bulkStyles.title}>Bulk Payment QR</Text>
          <Text style={bulkStyles.subtitle}>Generate multiple QRs — one per payer</Text>
        </View>
        <View style={bulkStyles.countBadge}><Text style={bulkStyles.countBadgeText}>{entries.length} / 20</Text></View>
      </View>

      {/* Merchant strip */}
      <View style={bulkStyles.merchantStrip}>
        <Text style={{ fontSize: 14 }}>🇬🇭</Text>
        <View style={{ flex: 1 }}>
          <Text style={bulkStyles.merchantName} numberOfLines={1}>{BTNG_MERCHANT.legalName}</Text>
          <Text style={bulkStyles.merchantMeta}>ID {BTNG_MERCHANT.merchantId} · {BTNG_MERCHANT.currency}</Text>
        </View>
        <View style={bulkStyles.momoChip}>
          <MaterialIcons name="cell-tower" size={10} color={Colors.warning} />
          <Text style={bulkStyles.momoChipText}>MTN MoMo</Text>
        </View>
      </View>

      {/* Column headers */}
      <View style={bulkStyles.colHeader}>
        <View style={{ width: 22 }} />
        <Text style={[bulkStyles.colLabel, { flex: 1 }]}>Payer Name *</Text>
        <Text style={[bulkStyles.colLabel, { width: 94 }]}>Amount (GHS)</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Entry rows */}
      {entries.map((entry, idx) => (
        <View key={entry.id} style={bulkStyles.entryRow}>
          <View style={bulkStyles.indexBadge}><Text style={bulkStyles.indexText}>{idx + 1}</Text></View>
          <TextInput
            style={[bulkStyles.nameInput, !entry.name.trim() && bulkStyles.inputRequired]}
            value={entry.name}
            onChangeText={v => updateEntry(entry.id, 'name', v)}
            placeholder="e.g. Kwame Mensah"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words" autoCorrect={false} returnKeyType="next" maxLength={30}
          />
          <TextInput
            style={bulkStyles.amountInput}
            value={entry.amount}
            onChangeText={v => updateEntry(entry.id, 'amount', v)}
            placeholder="0.00"
            placeholderTextColor={Colors.textMuted}
            keyboardType="decimal-pad" returnKeyType="done" maxLength={12}
          />
          <TouchableOpacity style={bulkStyles.removeBtn} onPress={() => removeEntry(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} disabled={entries.length <= 1}>
            <MaterialIcons name="remove-circle-outline" size={18} color={entries.length <= 1 ? Colors.border : Colors.error} />
          </TouchableOpacity>
        </View>
      ))}

      {/* Add payer */}
      <TouchableOpacity style={bulkStyles.addBtn} onPress={addEntry} activeOpacity={0.8}>
        <MaterialIcons name="add-circle-outline" size={15} color={Colors.warning} />
        <Text style={bulkStyles.addBtnText}>Add Payer</Text>
        <Text style={bulkStyles.addBtnLimit}>(max 20)</Text>
      </TouchableOpacity>

      {/* Off-screen QR renders for export — keyed refs */}
      <View style={{ position: 'absolute', opacity: 0, top: -9999, left: -9999 }}>
        {validEntries.map(entry => (
          <QRCode
            key={entry.id}
            value={buildPayload(entry)}
            size={300}
            color={Colors.bg}
            backgroundColor="#FFF8EC"
            getRef={(ref: any) => { if (ref) bulkQrRefs.current.set(entry.id, ref); }}
            quietZone={14}
          />
        ))}
      </View>

      {/* Visible mini-preview rail */}
      {validEntries.length > 0 && (
        <View style={bulkStyles.previewSection}>
          <View style={bulkStyles.previewHeader}>
            <MaterialIcons name="preview" size={12} color={Colors.textMuted} />
            <Text style={bulkStyles.previewHeaderText}>Preview — {validEntries.length} QR code{validEntries.length !== 1 ? 's' : ''} ready</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bulkStyles.previewRail}>
            {validEntries.map((entry, idx) => (
              <View key={entry.id} style={bulkStyles.previewCard}>
                <View style={bulkStyles.previewQrWrap}>
                  <QRCode value={buildPayload(entry)} size={88} color={Colors.bg} backgroundColor="#FFF8EC" quietZone={4} />
                </View>
                <Text style={bulkStyles.previewIndex}>#{idx + 1}</Text>
                <Text style={bulkStyles.previewName} numberOfLines={1}>{entry.name.trim()}</Text>
                {entry.amount.trim() ? (
                  <View style={bulkStyles.previewAmtBadge}><Text style={bulkStyles.previewAmtText}>GHS {entry.amount.trim()}</Text></View>
                ) : (
                  <Text style={bulkStyles.previewAmtAny}>Any amount</Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Progress bar */}
      {exporting && exportProgress > 0 && (
        <View style={bulkStyles.progressWrap}>
          <View style={bulkStyles.progressTrack}>
            <View style={[bulkStyles.progressBar, { width: `${exportProgress}%` as any }]} />
          </View>
          <Text style={bulkStyles.progressText}>Packing ZIP… {exportProgress}%</Text>
        </View>
      )}

      {/* Export button */}
      <TouchableOpacity
        style={[bulkStyles.exportBtn, (exporting || validEntries.length === 0) && { opacity: 0.5 }]}
        onPress={handleExportZip}
        disabled={exporting || validEntries.length === 0}
        activeOpacity={0.8}
      >
        {exporting ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="archive" size={16} color={Colors.bg} />}
        <Text style={bulkStyles.exportBtnText}>
          {exporting ? `Building ZIP (${exportProgress}%)…` : `Export ${validEntries.length > 0 ? validEntries.length + ' ' : ''}QR${validEntries.length !== 1 ? 's' : ''} as ZIP`}
        </Text>
      </TouchableOpacity>

      {/* Info note */}
      <View style={bulkStyles.infoRow}>
        <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
        <Text style={bulkStyles.infoText}>
          {'Each QR encodes a unique '}
          <Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>momo://pay</Text>
          {' deep-link with the payer name as reference · PNG files bundled into a single .zip via expo-sharing'}
        </Text>
      </View>

      {/* Export History */}
      {bulkHistory.length > 0 && (
        <View style={bulkStyles.historyContainer}>
          <TouchableOpacity
            style={bulkStyles.historyHeader}
            onPress={() => setHistoryExpanded(v => !v)}
            activeOpacity={0.8}
          >
            <View style={bulkStyles.historyHeaderLeft}>
              <View style={bulkStyles.historyIconWrap}>
                <MaterialIcons name="history" size={14} color={Colors.warning} />
              </View>
              <Text style={bulkStyles.historyTitle}>Export History</Text>
              <View style={bulkStyles.historyCountBadge}>
                <Text style={bulkStyles.historyCountText}>{bulkHistory.length}</Text>
              </View>
            </View>
            <View style={bulkStyles.historyHeaderRight}>
              {historyExpanded && (
                <TouchableOpacity
                  style={[bulkStyles.clearHistoryBtn, clearingHistory && { opacity: 0.5 }]}
                  onPress={async () => {
                    setClearingHistory(true);
                    await clearBulkHistory();
                    setBulkHistory([]);
                    setHistoryExpanded(false);
                    setClearingHistory(false);
                  }}
                  disabled={clearingHistory}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="delete-sweep" size={12} color={Colors.error} />
                  <Text style={bulkStyles.clearHistoryBtnText}>Clear all</Text>
                </TouchableOpacity>
              )}
              <MaterialIcons
                name={historyExpanded ? 'expand-less' : 'expand-more'}
                size={18}
                color={Colors.textMuted}
              />
            </View>
          </TouchableOpacity>

          {historyExpanded && (
            <View style={bulkStyles.historyList}>
              {bulkHistory.map((item, idx) => {
                const date = new Date(item.timestamp);
                const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
                const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[bulkStyles.historyRow, idx < bulkHistory.length - 1 && bulkStyles.historyRowBorder]}
                    onPress={() => {
                      // Restore entries into the form
                      const restored: BulkEntry[] = item.payers.map((p, i) => ({
                        id: `restored_${Date.now()}_${i}`,
                        name: p.name,
                        amount: p.amount,
                      }));
                      setEntries(restored);
                      setHistoryExpanded(false);
                      showAlert('Restored', `Loaded ${item.payerCount} payers from ${dateStr}. Review and re-export as needed.`);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={bulkStyles.historyRowLeft}>
                      <View style={bulkStyles.historyIndexChip}>
                        <Text style={bulkStyles.historyIndexText}>{idx + 1}</Text>
                      </View>
                      <View style={bulkStyles.historyRowMeta}>
                        <View style={bulkStyles.historyDateRow}>
                          <MaterialIcons name="event" size={10} color={Colors.textMuted} />
                          <Text style={bulkStyles.historyDateText}>{dateStr}</Text>
                          <Text style={bulkStyles.historyTimeText}>{timeStr}</Text>
                        </View>
                        <View style={bulkStyles.historyStatsRow}>
                          <View style={bulkStyles.historyStatChip}>
                            <MaterialIcons name="people" size={9} color={Colors.warning} />
                            <Text style={bulkStyles.historyStatText}>{item.payerCount} payer{item.payerCount !== 1 ? 's' : ''}</Text>
                          </View>
                          {item.totalGHS > 0 && (
                            <View style={[bulkStyles.historyStatChip, bulkStyles.historyStatChipGHS]}>
                              <Text style={bulkStyles.historyStatGHSText}>GHS {item.totalGHS % 1 === 0 ? item.totalGHS.toLocaleString() : item.totalGHS.toFixed(2)}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    <View style={bulkStyles.historyRestoreBtn}>
                      <MaterialIcons name="restore" size={13} color={Colors.warning} />
                      <Text style={bulkStyles.historyRestoreBtnText}>Restore</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const bulkStyles = StyleSheet.create({
  container: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.warning + '44', gap: Spacing.md, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  countBadge: { backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.warning + '55' },
  countBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  merchantStrip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  merchantName: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  merchantMeta: { fontSize: 9, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  momoChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.warning + '44' },
  momoChipText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  colHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: 2 },
  colLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  indexBadge: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  indexText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  nameInput: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm + 1, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false },
  inputRequired: { borderColor: Colors.warning + '55' },
  amountInput: { width: 94, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm + 1, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false, textAlign: 'right' },
  removeBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: Colors.warningBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.warning + '55' },
  addBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.warning, includeFontPadding: false },
  addBtnLimit: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  previewSection: { gap: Spacing.sm },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  previewHeaderText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  previewRail: { gap: Spacing.sm, paddingVertical: 2 },
  previewCard: { alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.warning + '44', width: 114 },
  previewQrWrap: { borderRadius: Radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: Colors.warning + '22' },
  previewIndex: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  previewName: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'center' },
  previewAmtBadge: { backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  previewAmtText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  previewAmtAny: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  progressWrap: { gap: 5 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: Colors.bgElevated, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  progressBar: { height: 4, backgroundColor: Colors.warning, borderRadius: 2 },
  progressText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.semibold, includeFontPadding: false },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.warning, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  exportBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  infoText: { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
  // History
  historyContainer: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.warning + '44', overflow: 'hidden' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4 },
  historyHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  historyHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  historyIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historyCountBadge: { backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '55' },
  historyCountText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  clearHistoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.errorBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.error + '44' },
  clearHistoryBtnText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  historyList: { borderTopWidth: 1, borderTopColor: Colors.warning + '33' },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, gap: Spacing.sm },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  historyRowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  historyIndexChip: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  historyIndexText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  historyRowMeta: { flex: 1, gap: 4 },
  historyDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyDateText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historyTimeText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  historyStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  historyStatChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  historyStatChipGHS: { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '44' },
  historyStatText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  historyStatGHSText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  historyRestoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.warning + '55', flexShrink: 0 },
  historyRestoreBtnText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
});

// ── Account Selector ──────────────────────────────────────────────────────
function AccountSelector({
  accounts, activeIndex, onSwitch, working, balances, balancesLoading, nicknames, onEditNickname,
}: {
  accounts: BtngAccount[];
  activeIndex: number;
  onSwitch: (i: number) => void;
  working: boolean;
  balances: Record<string, BtngBalance | { error: string }>;
  balancesLoading: boolean;
  nicknames: Record<number, string>;
  onEditNickname: (index: number) => void;
}) {
  return (
    <View style={accStyles.wrapper}>
      <View style={accStyles.header}>
        <View style={accStyles.iconWrap}><MaterialIcons name="account-tree" size={16} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={accStyles.title}>HD Sub-Accounts</Text>
          <Text style={accStyles.subtitle}>{accounts.length} accounts · Account {activeIndex + 1} active</Text>
        </View>
        <View style={accStyles.pathBadge}><Text style={accStyles.pathBadgeText}>BTNG-9999</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={accStyles.rail}>
        {accounts.map((acc) => {
          const isActive = acc.index === activeIndex;
          const entry = balances[acc.address];
          return (
            <TouchableOpacity key={acc.index} style={[accStyles.card, isActive && accStyles.cardActive]} onPress={() => !isActive && !working && onSwitch(acc.index)} activeOpacity={isActive ? 1 : 0.75} disabled={working}>
              <View style={[accStyles.accBadge, isActive && accStyles.accBadgeActive]}>
                {working && isActive ? <ActivityIndicator size="small" color={Colors.bg} /> : <Text style={[accStyles.accBadgeText, isActive && { color: Colors.bg }]}>{acc.index + 1}</Text>}
              </View>
              <View style={accStyles.nicknameRow}>
                <Text style={[accStyles.accNickname, isActive && { color: Colors.primary }]} numberOfLines={1}>{nicknames[acc.index] || `Account ${acc.index + 1}`}</Text>
                <TouchableOpacity style={accStyles.editNicknameBtn} onPress={() => onEditNickname(acc.index)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <MaterialIcons name="edit" size={10} color={isActive ? Colors.primary : Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={[accStyles.accAddr, isActive && { color: Colors.textPrimary }]} numberOfLines={1}>{`${acc.address.slice(0, 6)}…${acc.address.slice(-4)}`}</Text>
              {(() => {
                if (balancesLoading && !entry) return (<View style={accStyles.balanceChip}><ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.65 }] }} /><Text style={accStyles.balanceChipText}>Fetching…</Text></View>);
                if (!entry) return null;
                if ('error' in entry) return (<View style={[accStyles.balanceChip, accStyles.balanceChipOffline]}><MaterialIcons name="wifi-off" size={9} color={Colors.textMuted} /><Text style={[accStyles.balanceChipText, { color: Colors.textMuted }]}>Offline</Text></View>);
                return (<View style={[accStyles.balanceChip, isActive && accStyles.balanceChipActive]}><MaterialIcons name="toll" size={9} color={isActive ? Colors.primary : Colors.textMuted} /><Text style={[accStyles.balanceChipText, isActive && { color: Colors.primary }]}>{entry.balance} BTNG</Text></View>);
              })()}
              <View style={accStyles.pathRow}><Text style={accStyles.pathText}>{`/0/${acc.index}`}</Text></View>
              {isActive && (<View style={accStyles.activeIndicator}><View style={accStyles.activeDot} /><Text style={accStyles.activeText}>Active</Text></View>)}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={accStyles.legend}>All accounts share the same 24-word recovery phrase · Tap to switch</Text>
      <View style={accStyles.rpcRow}><MaterialIcons name="router" size={10} color={Colors.textMuted} /><Text style={accStyles.rpcText} numberOfLines={1}>{BTNG_RPC_URL}</Text></View>
    </View>
  );
}

const accStyles = StyleSheet.create({
  wrapper: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '33', gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  pathBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  pathBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  rail: { gap: Spacing.sm, paddingVertical: 2 },
  card: { width: 152, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6, alignItems: 'flex-start' },
  cardActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  accBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  accBadgeActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  accBadgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  accLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  accAddr: { fontSize: 11, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  balanceChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border, alignSelf: 'flex-start' },
  balanceChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' },
  balanceChipOffline: { borderColor: Colors.border },
  balanceChipText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  pathRow: { backgroundColor: Colors.bgCard, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  pathText: { fontSize: 9, fontWeight: FontWeight.semibold, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  activeIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 2 },
  activeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  legend: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  rpcRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rpcText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flex: 1 },
  nicknameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  accNickname: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false, flex: 1 },
  editNicknameBtn: { width: 18, height: 18, borderRadius: 5, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
});

// ── Merchant Rail Card ────────────────────────────────────────────────────
function MerchantRailCard() {
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<'id' | 'msisdn' | null>(null);
  const handleCopyField = useCallback((value: string, field: 'id' | 'msisdn') => {
    ExpoClipboard.setStringAsync(value).catch(()=>{}); setCopied(true); setCopiedField(field);
    setTimeout(() => { setCopied(false); setCopiedField(null); }, 2200);
  }, []);
  return (
    <View style={railStyles.card}>
      <View style={railStyles.header}>
        <View style={railStyles.iconWrap}><MaterialIcons name="storefront" size={20} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}><Text style={railStyles.cardTitle}>BTNG Cash Rail</Text><Text style={railStyles.cardSub}>Sovereign MTN MoMo Merchant Identity</Text></View>
        <View style={railStyles.activePill}><View style={railStyles.activeDot} /><Text style={railStyles.activeText}>Live Rail</Text></View>
      </View>
      <View style={railStyles.identityBox}>
        <View style={railStyles.networkRow}>
          <View style={railStyles.networkBadge}><MaterialIcons name="cell-tower" size={11} color={Colors.warning} /><Text style={railStyles.networkBadgeText}>{BTNG_MERCHANT.network}</Text></View>
          <View style={railStyles.countryBadge}><Text style={railStyles.countryFlag}>🇬🇭</Text><Text style={railStyles.countryText}>{BTNG_MERCHANT.country} · {BTNG_MERCHANT.currency}</Text></View>
        </View>
        <Text style={railStyles.legalName}>{BTNG_MERCHANT.legalName}</Text>
        <Text style={railStyles.tradingName}>{BTNG_MERCHANT.tradingName}</Text>
        <Text style={railStyles.regionLabel}>{BTNG_MERCHANT.region}</Text>
        <TouchableOpacity style={railStyles.fieldRow} onPress={() => handleCopyField(BTNG_MERCHANT.merchantId, 'id')} activeOpacity={0.75}>
          <View style={railStyles.fieldLabelWrap}><MaterialIcons name="tag" size={12} color={Colors.textMuted} /><Text style={railStyles.fieldLabel}>Merchant ID</Text></View>
          <Text style={railStyles.fieldValue}>{BTNG_MERCHANT.merchantId}</Text>
          <MaterialIcons name={copiedField === 'id' ? 'check-circle' : 'copy-all'} size={14} color={copiedField === 'id' ? Colors.success : Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={railStyles.fieldRow} onPress={() => handleCopyField(BTNG_MERCHANT.msisdn, 'msisdn')} activeOpacity={0.75}>
          <View style={railStyles.fieldLabelWrap}><MaterialIcons name="phone" size={12} color={Colors.textMuted} /><Text style={railStyles.fieldLabel}>Merchant MSISDN</Text></View>
          <Text style={railStyles.fieldValue}>{BTNG_MERCHANT.msisdn}</Text>
          <MaterialIcons name={copiedField === 'msisdn' ? 'check-circle' : 'copy-all'} size={14} color={copiedField === 'msisdn' ? Colors.success : Colors.textMuted} />
        </TouchableOpacity>
        {copied ? (<View style={railStyles.copiedBadge}><MaterialIcons name="check-circle" size={11} color={Colors.success} /><Text style={railStyles.copiedText}>Copied to clipboard</Text></View>) : null}
      </View>
      <View style={railStyles.anchorRow}><MaterialIcons name="anchor" size={12} color={Colors.primary} /><Text style={railStyles.anchorText}>This identity is the anchor of the entire BTNG cash-rail architecture.</Text></View>
      <View style={railStyles.channelsGrid}>
        {BTNG_RAIL_CHANNELS.map(ch => (
          <View key={ch.id} style={[railStyles.channelChip, { borderColor: ch.color + '55' }]}>
            <View style={[railStyles.channelDot, { backgroundColor: ch.color }]} />
            <View><Text style={[railStyles.channelLabel, { color: ch.color }]}>{ch.label}</Text><Text style={railStyles.channelSub}>{ch.sublabel}</Text></View>
          </View>
        ))}
      </View>
      {/* Dial-to-pay strip */}
      <View style={railStyles.dialStrip}>
        <MaterialIcons name="dialpad" size={14} color={Colors.warning} />
        <Text style={railStyles.dialText}>Got to pay? Dial <Text style={railStyles.dialCode}>{BTNG_MERCHANT.dialCode}</Text> to MoMoPay</Text>
        <View style={railStyles.dialBadge}><Text style={railStyles.dialBadgeText}>{BTNG_MERCHANT.msisdnLocal}</Text></View>
      </View>

      <View style={railStyles.sovereignNote}>
        <MaterialIcons name="verified" size={12} color={Colors.success} />
        <Text style={railStyles.sovereignText}>Active · Sovereign · Unchanged — no replacement, no substitution.</Text>
      </View>
    </View>
  );
}

const railStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '55' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  activeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  identityBox: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  networkRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  networkBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.warning + '55' },
  networkBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  countryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  countryFlag: { fontSize: 12 },
  countryText: { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  legalName: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.3, includeFontPadding: false },
  tradingName: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, letterSpacing: 0.5, includeFontPadding: false },
  regionLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.border },
  fieldLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  fieldLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  fieldValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  copiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  copiedText: { fontSize: 10, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
  anchorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '33' },
  anchorText: { flex: 1, fontSize: FontSize.xs, color: Colors.primary, lineHeight: 16, includeFontPadding: false },
  channelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  channelChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm, borderWidth: 1, minWidth: '47%', flex: 1 },
  channelDot: { width: 7, height: 7, borderRadius: 3.5 },
  channelLabel: { fontSize: 11, fontWeight: FontWeight.bold, includeFontPadding: false },
  channelSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  dialStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  dialText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  dialCode: { color: Colors.warning, fontWeight: FontWeight.heavy },
  dialBadge: { backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  dialBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.bg, letterSpacing: 0.5, includeFontPadding: false },
  sovereignNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '33', alignSelf: 'center' },
  sovereignText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

function MnemonicGrid({ words }: { words: string[] }) {
  return (
    <View style={mgStyles.grid}>
      {words.map((word, i) => (
        <View key={i} style={mgStyles.cell}>
          <Text style={mgStyles.index}>{i + 1}</Text>
          <Text style={mgStyles.word}>{word}</Text>
        </View>
      ))}
    </View>
  );
}

const mgStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '30.5%', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.border },
  index: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, width: 14, includeFontPadding: false },
  word: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
// ── Top-level Error Boundary ─────────────────────────────────────────────────
class GenesisErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; errorMsg: string }> {
  constructor(props: any) { super(props); this.state = { hasError: false, errorMsg: '' }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, errorMsg: String(error?.message ?? error) }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <MaterialIcons name="account-balance-wallet" size={56} color={Colors.primary} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' }}>BTNG Genesis Wallet</Text>
          <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>Your sovereign wallet is ready. There was an issue loading one component — your keys and funds are safe.</Text>
          <View style={{ backgroundColor: Colors.bgCard, borderRadius: 12, padding: 12, width: '100%', borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'monospace' }}>{this.state.errorMsg}</Text>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function BtngGenesisScreen() {
  return <GenesisErrorBoundary><BtngGenesisScreenInner /></GenesisErrorBoundary>;
}

function BtngGenesisScreenInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  // ── Backup section scroll + pulse ─────────────────────────────────────────
  const scrollViewRef = useRef<any>(null);
  const backupPulseAnim = useRef(new Animated.Value(0)).current;
  const backupPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const hasScrolledToBackup = useRef(false);

  const [authUnlocked, setAuthUnlocked] = useState(false);
  const [biometricType, setBiometricType] = useState<LocalAuthentication.AuthenticationType | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'verify' | 'setup' | 'confirm'>('verify');
  const [pendingSetupPin, setPendingSetupPin] = useState('');
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [pkAuthPending, setPkAuthPending] = useState(false);
  const [changePinPending, setChangePinPending] = useState(false);
  const [changePinSuccess, setChangePinSuccess] = useState(false);

  const {
    phase, address, mnemonic, derivationPath, createdAt,
    accounts, activeIndex,
    error, working,
    generateWallet, confirmBackup, importWallet, deleteWallet, switchAccount,
  } = useBtngWallet();

  const goldOracle = useGoldOracle();

  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const available = hasHardware && enrolled;
      setBioAvailable(available);
      if (available && types.length > 0) {
        const face = types.find(t => t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        setBiometricType(face ?? types[0]);
      }
      const pin = await loadBtngPin();
      setStoredPin(pin);
    })();
  }, []);

  // PIN/biometric gate disabled — auto-unlock on mount
  useEffect(() => {
    setAuthUnlocked(true);
  }, []);

  // Auto-scroll + pulse when genesis wallet is freshly created
  useEffect(() => {
    if (phase === 'genesis' && mnemonic && authUnlocked && !hasScrolledToBackup.current) {
      hasScrolledToBackup.current = true;
      // Auto-reveal recovery phrase immediately
      setShowPhrase(true);
      // Scroll to end (backup section is at the bottom of genesis content)
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 700);
      // Start pulsing border animation
      backupPulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(backupPulseAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
          Animated.timing(backupPulseAnim, { toValue: 0, duration: 700, useNativeDriver: false }),
        ])
      );
      backupPulseLoopRef.current.start();
      // Stop pulsing after 12 seconds
      setTimeout(() => {
        backupPulseLoopRef.current?.stop();
        Animated.timing(backupPulseAnim, { toValue: 0, duration: 400, useNativeDriver: false }).start();
      }, 12000);
    }
  }, [phase, mnemonic, authUnlocked, backupPulseAnim]);

  // Auto-generate wallet when none exists
  const hasAutoGenerated = useRef(false);
  useEffect(() => {
    if (phase === 'none' && !working && !hasAutoGenerated.current) {
      hasAutoGenerated.current = true;
      setAuthUnlocked(true);
      generateWallet();
    }
  }, [phase, working]);

  // ── Backup 24h reminder effect ────────────────────────────────────────────
  useEffect(() => {
    if (!createdAt || phase !== 'genesis') {
      setBackupReminderVisible(false);
      return;
    }
    const formatDuration = () => {
      const diffMs = Date.now() - new Date(createdAt).getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours < 24) { setBackupReminderVisible(false); return; }
      setBackupReminderVisible(true);
      const days = Math.floor(diffHours / 24);
      const hrs  = Math.floor(diffHours % 24);
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setTimeSinceCreationStr(days > 0 ? `${days}d ${hrs}h ${mins}m` : `${hrs}h ${mins}m`);
    };
    formatDuration();
    const iv = setInterval(formatDuration, 60_000);
    return () => clearInterval(iv);
  }, [createdAt, phase]);

  // Pulse animation for reminder banner
  useEffect(() => {
    if (!backupReminderVisible) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(reminderPulseAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
      Animated.timing(reminderPulseAnim, { toValue: 0, duration: 900, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [backupReminderVisible, reminderPulseAnim]);

  const handleBackUpNow = useCallback(() => {
    setShowPhrase(true);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 200);
  }, []);

  // Gate unlock — PIN disabled, just unlock directly
  const handleGateUnlock = useCallback(() => {
    setAuthError('');
    setAuthUnlocked(true);
  }, []);

  const handlePinSuccess = useCallback(async (pin: string) => {
    if (pinModalMode === 'setup') { setPendingSetupPin(pin); setPinModalMode('confirm'); return; }
    if (pinModalMode === 'confirm') {
      if (pin !== pendingSetupPin) {
        showAlert('PIN Mismatch', 'The PINs did not match. Please try again.');
        setPinModalMode('setup'); setPendingSetupPin(''); setPinModalVisible(false); return;
      }
      await saveBtngPin(pin); setStoredPin(pin); setPinModalVisible(false);
      if (changePinPending) {
        setChangePinPending(false); setChangePinSuccess(true);
        setTimeout(() => setChangePinSuccess(false), 3000);
        showAlert('PIN Updated', 'Your BTNG wallet PIN has been changed successfully.');
      } else if (pkAuthPending) { setPkAuthPending(false); proceedExportPk(); }
      else { setAuthUnlocked(true); }
      return;
    }
    setPinModalVisible(false);
    if (changePinPending) { setPinModalMode('setup'); setPendingSetupPin(''); setPinModalVisible(true); }
    else if (pkAuthPending) { setPkAuthPending(false); proceedExportPk(); }
    else { setAuthUnlocked(true); }
  }, [pinModalMode, pendingSetupPin, pkAuthPending, changePinPending, showAlert]);

  const handlePinCancel = useCallback(() => {
    setPinModalVisible(false); setPkAuthPending(false); setChangePinPending(false); setPendingSetupPin('');
    if (!authUnlocked) setAuthError('Authentication is required to access this wallet.');
  }, [authUnlocked]);

  const handlePinModalBiometric = useCallback(async () => {
    setPinModalVisible(false);
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Authenticate to access BTNG Genesis Wallet', disableDeviceFallback: true });
    if (result.success) {
      if (changePinPending) { setPinModalMode('setup'); setPendingSetupPin(''); setPinModalVisible(true); }
      else if (pkAuthPending) { setPkAuthPending(false); proceedExportPk(); }
      else { setAuthUnlocked(true); }
    } else { setPinModalVisible(true); }
  }, [pkAuthPending, changePinPending]);

  const [showPhrase, setShowPhrase] = useState(false);
  const [backupChecked, setBackupChecked] = useState(false);

  // ── Backup reminder (shows 24h after wallet creation if backup not confirmed) ─
  const [backupReminderVisible, setBackupReminderVisible] = useState(false);
  const [timeSinceCreationStr, setTimeSinceCreationStr] = useState('');
  const reminderPulseAnim = useRef(new Animated.Value(0)).current;
  const [importMode, setImportMode] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rpcInput, setRpcInput] = useState('');
  const [rpcSaved, setRpcSaved] = useState(BTNG_RPC_URL);
  const [rpcTesting, setRpcTesting] = useState(false);
  const [rpcResult, setRpcResult] = useState<RpcTestResult | { error: string } | null>(null);
  const [rpcExpanded, setRpcExpanded] = useState(false);
  const [verifyExpanded, setVerifyExpanded] = useState(false);
  const [verifyAddr, setVerifyAddr] = useState('');
  const [verifyMsg, setVerifyMsg] = useState('');
  const [verifySigInput, setVerifySigInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; recoveredAddress: string } | { error: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pkRevealed, setPkRevealed] = useState(false);
  const [pkValue, setPkValue] = useState<string | null>(null);
  const [pkCopied, setPkCopied] = useState(false);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkCountdown, setPkCountdown] = useState(60);
  const pkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPrivateKey = useCallback(() => {
    setPkRevealed(false); setPkValue(null); setPkCopied(false); setPkCountdown(60);
    if (pkTimerRef.current) { clearInterval(pkTimerRef.current); pkTimerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!pkRevealed) return;
    setPkCountdown(60);
    pkTimerRef.current = setInterval(() => {
      setPkCountdown(prev => { if (prev <= 1) { clearPrivateKey(); return 60; } return prev - 1; });
    }, 1000);
    return () => { if (pkTimerRef.current) { clearInterval(pkTimerRef.current); pkTimerRef.current = null; } };
  }, [pkRevealed, clearPrivateKey]);

  const proceedExportPk = useCallback(async () => {
    setPkLoading(true);
    const result = await getActivePrivateKey();
    setPkLoading(false);
    if ('error' in result) { showAlert('Error', result.error); return; }
    setPkValue(result.privateKey); setPkRevealed(true);
  }, [showAlert]);

  // Change PIN — disabled, show coming soon notice
  const handleChangePinStart = useCallback(() => {
    setChangePinPending(true);
    setPinModalMode(storedPin ? 'verify' : 'setup');
    setPendingSetupPin('');
    setPinModalVisible(true);
  }, [storedPin]);

  // Export PK — no PIN gate, proceed directly
  const handleExportPk = useCallback(async () => {
    setAuthError('');
    await proceedExportPk();
  }, [proceedExportPk]);

  const handleCopyPk = useCallback(() => {
    if (!pkValue) return;
    ExpoClipboard.setStringAsync(pkValue).catch(()=>{}); setPkCopied(true);
    setTimeout(() => setPkCopied(false), 2500);
    showAlert('Copied', 'Private key copied. Store it securely and never share it.');
  }, [pkValue, showAlert]);

  const [signExpanded, setSignExpanded] = useState(false);
  const [signPayload, setSignPayload] = useState('');
  const [signResult, setSignResult] = useState<{ sig: string } | { error: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [sigCopied, setSigCopied] = useState(false);

  useEffect(() => { getRpcUrl().then(url => { setRpcSaved(url); setRpcInput(url); }); }, []);

  const handleSaveRpc = useCallback(async () => {
    const trimmed = rpcInput.trim();
    await saveRpcUrl(trimmed);
    const updated = trimmed || BTNG_RPC_URL;
    setRpcSaved(updated); setRpcInput(updated); setRpcResult(null);
    showAlert('RPC Saved', `Endpoint updated to:\n${updated}`);
  }, [rpcInput, showAlert]);

  const handleResetRpc = useCallback(async () => {
    await saveRpcUrl('');
    setRpcSaved(BTNG_RPC_URL); setRpcInput(BTNG_RPC_URL); setRpcResult(null);
    showAlert('Reset', 'RPC endpoint restored to default.');
  }, [showAlert]);

  const handleSignMessage = useCallback(async () => {
    const trimmed = signPayload.trim();
    if (!trimmed) return;
    setSigning(true); setSignResult(null);
    const result = await signBtngPayload(trimmed);
    setSignResult('error' in result ? { error: result.error } : { sig: result.signature });
    setSigning(false);
  }, [signPayload]);

  const handleVerify = useCallback(async () => {
    setVerifying(true); setVerifyResult(null);
    const result = await verifyBtngSignature(verifyAddr.trim(), verifyMsg, verifySigInput.trim());
    setVerifyResult(result); setVerifying(false);
  }, [verifyAddr, verifyMsg, verifySigInput]);

  const handleCopySig = useCallback((sig: string) => {
    ExpoClipboard.setStringAsync(sig).catch(()=>{}); setSigCopied(true);
    setTimeout(() => setSigCopied(false), 2500);
    showAlert('Copied', 'Signature copied to clipboard.');
  }, [showAlert]);

  const handleTestRpc = useCallback(async () => {
    if (!address) return;
    setRpcTesting(true); setRpcResult(null);
    const result = await testRpcConnection(address, rpcInput.trim() || rpcSaved);
    setRpcResult(result); setRpcTesting(false);
  }, [address, rpcInput, rpcSaved]);

  const [accountNicknames, setAccountNicknames] = useState<Record<number, string>>({});
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [nicknameEditIndex, setNicknameEditIndex] = useState<number>(0);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameSaving, setNicknameSaving] = useState(false);

  useEffect(() => {
    if (phase === 'existing' || phase === 'genesis') { loadAccountNicknames().then(setAccountNicknames); }
  }, [phase]);

  const handleEditNickname = useCallback((index: number) => {
    setNicknameEditIndex(index); setNicknameInput(accountNicknames[index] ?? ''); setNicknameModalVisible(true);
  }, [accountNicknames]);

  const handleSaveNickname = useCallback(async () => {
    setNicknameSaving(true);
    await saveAccountNickname(nicknameEditIndex, nicknameInput);
    const updated = await loadAccountNicknames();
    setAccountNicknames(updated); setNicknameSaving(false); setNicknameModalVisible(false);
  }, [nicknameEditIndex, nicknameInput]);

  const [balances, setBalances] = useState<Record<string, BtngBalance | { error: string }>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [balancesFetchedAt, setBalancesFetchedAt] = useState<string | null>(null);
  const [lastUpdatedSeconds, setLastUpdatedSeconds] = useState(0);
  const [fetchingCount, setFetchingCount] = useState(0);
  const lastUpdatedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Live USD/GHS exchange rate state
  const [ghsRate, setGhsRate] = useState(15.5);
  const [ghsRateSource, setGhsRateSource] = useState<'live' | 'fallback'>('fallback');
  const [ghsRateFetchedAt, setGhsRateFetchedAt] = useState<string | null>(null);
  const livePulseAnim = useRef(new Animated.Value(1)).current;
  const livePulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Live dot pulse animation
  useEffect(() => {
    livePulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(livePulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    livePulseLoop.current.start();
    return () => livePulseLoop.current?.stop();
  }, [livePulseAnim]);

  // Fetch live USD/GHS exchange rate from open.er-api.com
  useEffect(() => {
    let cancelled = false;
    async function fetchGhsRate() {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rate = data?.rates?.GHS;
        if (typeof rate === 'number' && rate > 1 && !cancelled) {
          setGhsRate(rate);
          setGhsRateSource('live');
          setGhsRateFetchedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        }
      } catch {
        // Keep fallback rate 15.5
      }
    }
    fetchGhsRate();
    return () => { cancelled = true; };
  }, []);

  // "X seconds ago" counter that resets on each fetch
  useEffect(() => {
    if (!balancesFetchedAt) return;
    setLastUpdatedSeconds(0);
    if (lastUpdatedIntervalRef.current) clearInterval(lastUpdatedIntervalRef.current);
    lastUpdatedIntervalRef.current = setInterval(() => {
      setLastUpdatedSeconds(prev => prev + 1);
    }, 1000);
    return () => {
      if (lastUpdatedIntervalRef.current) clearInterval(lastUpdatedIntervalRef.current);
    };
  }, [balancesFetchedAt]);

  const loadBalances = useCallback(async (isRefresh = false) => {
    if (!accounts.length) return;
    if (isRefresh) setRefreshing(true); else setBalancesLoading(true);
    setFetchingCount(accounts.length);
    // All accounts fetched simultaneously via Promise.allSettled inside fetchAllAccountBalances
    const rpcUrl = await getRpcUrl();
    const result = await fetchAllAccountBalances(accounts.map(a => a.address), rpcUrl);
    setBalances(result);
    setFetchingCount(0);
    setBalancesFetchedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    if (isRefresh) setRefreshing(false); else setBalancesLoading(false);
  }, [accounts]);

  useEffect(() => {
    if ((phase === 'existing' || phase === 'genesis') && accounts.length > 0) { loadBalances(false); }
  }, [phase, accounts.length]);

  const handleRefresh = useCallback(() => loadBalances(true), [loadBalances]);

  function formatSecondsAgo(s: number): string {
    if (s < 5) return 'Just now';
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  const handleCopy = useCallback((text: string, label: string) => {
    ExpoClipboard.setStringAsync(text).catch(()=>{}); setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showAlert('Copied', `${label} copied to clipboard.`);
  }, [showAlert]);

  const handleImport = useCallback(async () => {
    const words = importInput.trim().split(/\s+/);
    if (words.length !== 24) { showAlert('Invalid Phrase', 'A BTNG recovery phrase must contain exactly 24 words.'); return; }
    const ok = await importWallet(importInput.trim());
    if (ok) { setImportMode(false); setImportInput(''); showAlert('Wallet Restored', 'Your BTNG Genesis Wallet has been successfully restored.'); }
  }, [importInput, importWallet, showAlert]);

  const handleDelete = useCallback(async () => {
    setConfirmDelete(false); await deleteWallet();
    showAlert('Wallet Removed', 'Your BTNG Genesis Wallet has been cleared from this device.');
  }, [deleteWallet, showAlert]);

  const words = mnemonic ? mnemonic.split(' ') : [];

  if (!authUnlocked) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} /></TouchableOpacity>
          <View style={{ flex: 1 }} /><View style={{ width: 40 }} />
        </View>
        <BiometricGate onUnlock={handleGateUnlock} biometricType={bioAvailable ? biometricType : null} />
        {authError ? (
          <View style={[gateStyles.errorRow, { margin: Spacing.xl, marginTop: 0 }]}>
            <MaterialIcons name="error-outline" size={14} color={Colors.error} />
            <Text style={[gateStyles.errorText, { flex: 1 }]}>{authError}</Text>
          </View>
        ) : null}
        <PinModal visible={pinModalVisible} mode={pinModalMode} storedPin={storedPin ?? undefined} canUseBiometric={bioAvailable} onUseBiometric={handlePinModalBiometric} onSuccess={handlePinSuccess} onCancel={handlePinCancel} />
      </View>
    );
  }

  if (phase === 'loading') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} /></TouchableOpacity>
          <Text style={styles.topTitle}>BTNG Genesis</Text><View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /><Text style={styles.loadingText}>Initializing secure vault…</Text></View>
      </View>
    );
  }

  if (importMode) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => { setImportMode(false); setImportInput(''); }} style={styles.backBtn}><MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} /></TouchableOpacity>
          <Text style={styles.topTitle}>Restore Wallet</Text><View style={{ width: 40 }} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.importCard}>
            <View style={styles.importIconWrap}><MaterialIcons name="restore" size={36} color={Colors.primary} /></View>
            <Text style={styles.importTitle}>Enter Recovery Phrase</Text>
            <Text style={styles.importSub}>Type your 24-word BTNG recovery phrase exactly as written, separated by spaces. This will restore your wallet on this device.</Text>
            <TextInput style={styles.phraseInput} value={importInput} onChangeText={setImportInput} placeholder="word1 word2 word3 … word24" placeholderTextColor={Colors.textMuted} multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} spellCheck={false} />
            <View style={styles.wordCountRow}>
              <MaterialIcons name={importInput.trim().split(/\s+/).filter(Boolean).length === 24 ? 'check-circle' : 'radio-button-unchecked'} size={14} color={importInput.trim().split(/\s+/).filter(Boolean).length === 24 ? Colors.success : Colors.textMuted} />
              <Text style={[styles.wordCountText, { color: importInput.trim().split(/\s+/).filter(Boolean).length === 24 ? Colors.success : Colors.textMuted }]}>{importInput.trim().split(/\s+/).filter(Boolean).length} / 24 words</Text>
            </View>
            {error ? (<View style={styles.errorRow}><MaterialIcons name="error-outline" size={14} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>) : null}
            <TouchableOpacity style={[styles.primaryBtn, (working || importInput.trim().split(/\s+/).filter(Boolean).length !== 24) && { opacity: 0.5 }]} onPress={handleImport} disabled={working || importInput.trim().split(/\s+/).filter(Boolean).length !== 24}>
              {working ? <ActivityIndicator size="small" color={Colors.bg} /> : <Text style={styles.primaryBtnText}>Restore Wallet</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} /></TouchableOpacity>
        <View style={styles.topCenter}><Text style={styles.topTitle}>BTNG Genesis</Text><Text style={styles.topSub}>Sovereign Wallet</Text></View>
        {phase === 'existing' ? (
          <TouchableOpacity style={styles.deleteIconBtn} onPress={() => setConfirmDelete(true)}><MaterialIcons name="delete-outline" size={20} color={Colors.error} /></TouchableOpacity>
        ) : (<View style={{ width: 40 }} />)}
      </View>

      {/* ── 24h Backup Reminder Banner ───────────────────────────────────── */}
      {backupReminderVisible && phase === 'genesis' && authUnlocked && (
        <Animated.View style={[
          reminderBannerStyles.banner,
          {
            borderColor: reminderPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.error + '66', Colors.error] }),
            backgroundColor: reminderPulseAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(239,68,68,0.06)', 'rgba(239,68,68,0.14)'] }),
          },
        ]}>
          <View style={reminderBannerStyles.iconWrap}>
            <MaterialIcons name="warning" size={20} color={Colors.error} />
          </View>
          <View style={reminderBannerStyles.textWrap}>
            <Text style={reminderBannerStyles.title}>Wallet Not Backed Up</Text>
            <Text style={reminderBannerStyles.sub}>
              {'Created '}<Text style={reminderBannerStyles.subBold}>{timeSinceCreationStr}</Text>{' ago — your funds are at risk without a backup.'}
            </Text>
          </View>
          <TouchableOpacity style={reminderBannerStyles.btn} onPress={handleBackUpNow} activeOpacity={0.85}>
            <MaterialIcons name="arrow-downward" size={13} color={Colors.bg} />
            <Text style={reminderBannerStyles.btnText}>Back Up</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} title="Pull to refresh balances" titleColor={Colors.textMuted} />}
      >
        {/* Coin emblem */}
        <View style={styles.coinEmblem}>
          <View style={styles.coinOuter}>
            <Image
              source={require('@/assets/images/btng_coin_logo.jpg')}
              style={{ width: 96, height: 96, borderRadius: 48 }}
              contentFit="cover"
              transition={300}
            />
          </View>
          <View style={styles.coinNameRow}><View style={styles.goldDivider} /><Text style={styles.coinFullName}>BITUNCOIN GOLD</Text><View style={styles.goldDivider} /></View>
          <Text style={styles.coinTagline}>Africa's Sovereign Digital Currency</Text>
        </View>

        {/* No wallet — auto-generating */}
        {phase === 'none' && (
          <View style={styles.section}>
            <View style={styles.centered}>
              <View style={styles.coinOuter}>
                <View style={styles.coinInner}>
                  <Text style={styles.coinSymbol}>₿</Text>
                  <Text style={styles.coinLabel}>BTNG</Text>
                </View>
              </View>
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
              <Text style={[styles.loadingText, { marginTop: Spacing.md, textAlign: 'center' }]}>Generating your BTNG Genesis Wallet…</Text>
              <Text style={[styles.loadingText, { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' }]}>Creating BIP-39 seed · HD keys · Secure enclave</Text>
            </View>
            {error ? (<View style={styles.errorRow}><MaterialIcons name="error-outline" size={14} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>) : null}
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setImportMode(true)}>
              <MaterialIcons name="restore" size={16} color={Colors.primary} /><Text style={styles.secondaryBtnText}>Restore from Recovery Phrase</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Genesis / Existing */}
        {(phase === 'genesis' || phase === 'existing') && address && (
          <View style={styles.section}>
            {/* Address Card */}
            <View style={styles.addressCard}>
              <View style={styles.addressCardHeader}>
                <View style={styles.addressIconWrap}><MaterialIcons name="account-balance-wallet" size={20} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addressCardTitle}>BTNG Address</Text>
                  <Text style={styles.addressCardSub}>{phase === 'genesis' ? '✨ Freshly generated' : `Created ${createdAt ? new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}`}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.success }]} /><Text style={[styles.statusText, { color: Colors.success }]}>Active</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.addressBox} onPress={() => handleCopy(address, 'BTNG Address')} activeOpacity={0.75}>
                <Text style={styles.addressText} selectable>{address}</Text>
                <MaterialIcons name={copied ? 'check-circle' : 'copy-all'} size={18} color={copied ? Colors.success : Colors.primary} />
              </TouchableOpacity>
              <View style={styles.addressMeta}>
                <View style={styles.metaChip}><MaterialIcons name="account-tree" size={11} color={Colors.primary} /><Text style={styles.metaChipText}>{derivationPath ?? "m/44'/9999'/0'/0/0"}</Text></View>
                <View style={styles.metaChip}><MaterialIcons name="public" size={11} color={Colors.africanGreen} /><Text style={[styles.metaChipText, { color: Colors.africanGreen }]}>Ghana · Africa</Text></View>
              </View>
            </View>

            {/* Live Balance Panel */}
            {accounts.length > 0 && (
              <View style={styles.liveBalancePanel}>
                {/* Total Portfolio Value Row */}
                {(() => {
                  const totalBtng = accounts.reduce((sum, acc) => {
                    const entry = balances[acc.address];
                    if (!entry || 'error' in entry) return sum;
                    const parsed = parseFloat((entry as any).balance.replace(/,/g, ''));
                    return sum + (isNaN(parsed) ? 0 : parsed);
                  }, 0);
                  // BTNG is gold-backed: priceBTNGG = gold price / 1000 (1/1000 troy oz)
                  const btngUsdPrice = goldOracle.priceBTNGG > 0 ? goldOracle.priceBTNGG : 3.3258;
                  const totalUSD = totalBtng * btngUsdPrice;
                  const totalGHS = totalUSD * ghsRate;
                  const hasAnyBalance = Object.keys(balances).length > 0;
                  return (
                    <View style={styles.portfolioValueRow}>
                      <View style={styles.portfolioValueLeft}>
                        <View style={styles.portfolioValueIconWrap}>
                          <MaterialIcons name="account-balance" size={14} color={Colors.kenteGold} />
                        </View>
                        <View style={{ gap: 2 }}>
                          <Text style={styles.portfolioValueLabel}>Total Portfolio</Text>
                          <Text style={styles.portfolioValueSub}>{accounts.length} HD accounts · BTNG Gold</Text>
                        </View>
                      </View>
                      {balancesLoading && !hasAnyBalance ? (
                        <View style={styles.portfolioValueLoading}>
                          <ActivityIndicator size="small" color={Colors.kenteGold} />
                          <Text style={styles.portfolioValueLoadingText}>Fetching…</Text>
                        </View>
                      ) : (
                        <View style={styles.portfolioValueRight}>
                          <View style={styles.portfolioValueBtngRow}>
                            <Text style={styles.portfolioValueBtng}>
                              {totalBtng.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                            </Text>
                            <View style={styles.portfolioValueBtngBadge}>
                              <Text style={styles.portfolioValueBtngBadgeText}>BTNG</Text>
                            </View>
                          </View>
                          <View style={styles.portfolioValueFiatRow}>
                            <View style={styles.portfolioValueFiatChip}>
                              <Text style={styles.portfolioValueFiatSymbol}>$</Text>
                              <Text style={styles.portfolioValueFiatAmount}>
                                {totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Text>
                            </View>
                            <View style={styles.portfolioValueFiatDivider} />
                            <View style={[styles.portfolioValueFiatChip, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                              <Text style={[styles.portfolioValueFiatSymbol, { color: '#22C55E' }]}>₵</Text>
                              <Text style={[styles.portfolioValueFiatAmount, { color: '#22C55E' }]}>
                                {totalGHS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Text>
                            </View>
                          </View>
                          {goldOracle.priceUSD > 0 && (
                            <View style={styles.portfolioGoldOracleRow}>
                              {goldOracle.source === 'live'
                                ? <View style={styles.portfolioGoldOracleDot} />
                                : <MaterialIcons name="cloud-off" size={8} color={Colors.textMuted} />}
                              <Text style={styles.portfolioGoldOracleText}>
                                Gold ${goldOracle.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz · {goldOracle.source === 'live' ? 'Live' : 'Cached'} Oracle
                              </Text>
                            </View>
                          )}
                          <View style={styles.portfolioGhsRateRow}>
                            {ghsRateSource === 'live'
                              ? <View style={styles.portfolioGhsRateDot} />
                              : <MaterialIcons name="sync-disabled" size={8} color={Colors.textMuted} />}
                            <Text style={styles.portfolioGhsRateText}>
                              {`GHS ${ghsRate.toFixed(2)}/USD · ${ghsRateSource === 'live' ? 'Live' : 'Fallback'} Rate${ghsRateFetchedAt ? ` · ${ghsRateFetchedAt}` : ''}`}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Header row */}
                <View style={styles.liveBalancePanelHeader}>
                  <View style={styles.liveBalancePanelLeft}>
                    <View style={styles.liveBalanceIconWrap}>
                      <MaterialIcons name="account-balance" size={15} color={Colors.success} />
                    </View>
                    <View style={{ gap: 2 }}>
                      <Text style={styles.liveBalancePanelTitle}>On-chain Balances</Text>
                      <Text style={styles.liveBalancePanelSub}>
                        {accounts.length} HD sub-account{accounts.length !== 1 ? 's' : ''} · BTNG Gold Coin Network
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.liveRefreshBtn, balancesLoading && { opacity: 0.55 }]}
                    onPress={() => loadBalances(true)}
                    disabled={balancesLoading}
                    activeOpacity={0.8}
                  >
                    {balancesLoading
                      ? <ActivityIndicator size="small" color={Colors.success} />
                      : <MaterialIcons name="refresh" size={17} color={Colors.success} />}
                  </TouchableOpacity>
                </View>

                {/* Fetching status — shown during active fetch */}
                {(balancesLoading || refreshing) && fetchingCount > 0 ? (
                  <View style={styles.liveBalanceFetchingRow}>
                    <ActivityIndicator size="small" color={Colors.success} />
                    <Text style={styles.liveBalanceFetchingText}>
                      Fetching {fetchingCount} account{fetchingCount !== 1 ? 's' : ''} in parallel…
                    </Text>
                    <View style={styles.liveBalanceFetchingBadge}>
                      <Text style={styles.liveBalanceFetchingBadgeText}>Promise.all</Text>
                    </View>
                  </View>
                ) : balancesFetchedAt ? (
                  <View style={styles.liveBalanceStatusRow}>
                    {/* Animated live dot */}
                    <Animated.View style={[styles.liveStatusDot, { opacity: livePulseAnim }]} />
                    <View style={styles.liveStatusTextWrap}>
                      <Text style={styles.liveStatusLabel}>Live</Text>
                      <Text style={styles.liveStatusTime}>Updated {formatSecondsAgo(lastUpdatedSeconds)}</Text>
                    </View>
                    <View style={styles.liveStatusDivider} />
                    <View style={styles.liveStatusTimeChip}>
                      <MaterialIcons name="schedule" size={10} color={Colors.success} />
                      <Text style={styles.liveStatusTimeChipText}>{balancesFetchedAt}</Text>
                    </View>
                    <View style={styles.liveStatusDivider} />
                    <View style={styles.liveParallelChip}>
                      <MaterialIcons name="bolt" size={10} color={Colors.success} />
                      <Text style={styles.liveParallelChipText}>{accounts.length} parallel</Text>
                    </View>
                  </View>
                ) : null}

                {/* Per-account mini balance rail */}
                {Object.keys(balances).length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.liveBalanceRailContent}
                    style={styles.liveBalanceRail}
                  >
                    {accounts.map((acc) => {
                      const entry = balances[acc.address];
                      const isActive = acc.index === activeIndex;
                      return (
                        <View
                          key={acc.index}
                          style={[
                            styles.liveBalanceMiniCard,
                            isActive && styles.liveBalanceMiniCardActive,
                          ]}
                        >
                          <View style={[styles.liveBalanceMiniIndex, isActive && styles.liveBalanceMiniIndexActive]}>
                            <Text style={[styles.liveBalanceMiniIndexText, isActive && { color: Colors.bg }]}>
                              {acc.index + 1}
                            </Text>
                          </View>
                          {(() => {
                            if (balancesLoading && !entry) return (
                              <ActivityIndicator size="small" color={isActive ? Colors.success : Colors.textMuted} style={{ transform: [{ scale: 0.7 }] }} />
                            );
                            if (!entry) return <Text style={styles.liveBalanceMiniEmpty}>—</Text>;
                            if ('error' in entry) return (
                              <View style={styles.liveBalanceMiniOffline}>
                                <MaterialIcons name="wifi-off" size={9} color={Colors.error} />
                                <Text style={styles.liveBalanceMiniOfflineText}>Offline</Text>
                              </View>
                            );
                            return (
                              <View style={styles.liveBalanceMiniBalanceWrap}>
                                <Text style={[styles.liveBalanceMiniBalance, isActive && { color: Colors.success }]}>
                                  {entry.balance}
                                </Text>
                                <Text style={styles.liveBalanceMiniSymbol}>BTNG</Text>
                              </View>
                            );
                          })()}
                          {isActive && (
                            <View style={styles.liveBalanceMiniActiveDot} />
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Pull-to-refresh hint */}
                <View style={styles.liveBalancePullHint}>
                  <MaterialIcons name="swipe-down" size={11} color={Colors.textMuted} />
                  <Text style={styles.liveBalancePullHintText}>
                    Pull down to refresh all {accounts.length} account balances
                  </Text>
                </View>
              </View>
            )}

            {/* Account Selector */}
            {accounts.length > 1 && (
              <AccountSelector accounts={accounts} activeIndex={activeIndex} onSwitch={switchAccount} working={working} balances={balances} balancesLoading={balancesLoading} nicknames={accountNicknames} onEditNickname={handleEditNickname} />
            )}

            {/* BTNG Cash Rail */}
            <MerchantRailCard />

            {/* Cash Rail History shortcut */}
            <TouchableOpacity style={cashLinkStyles.card} onPress={() => router.push('/cash-rail' as any)} activeOpacity={0.85}>
              <View style={cashLinkStyles.left}>
                <View style={cashLinkStyles.iconWrap}><MaterialIcons name="history" size={20} color={Colors.warning} /></View>
                <View>
                  <Text style={cashLinkStyles.title}>MTN MoMo History</Text>
                  <Text style={cashLinkStyles.sub}>View all Cash Rail transactions</Text>
                </View>
              </View>
              <View style={cashLinkStyles.right}>
                <View style={cashLinkStyles.badge}><View style={cashLinkStyles.liveDot} /><Text style={cashLinkStyles.badgeText}>Live Rail</Text></View>
                <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>

            {/* MTN MoMo Payment QR */}
            <MoMoPayQRCard />

            {/* Bulk Payment QR */}
            <BulkPayQRSection />

            {/* BTNG Address QR */}
            <QRAddressCard address={address} />

            {/* Genesis backup */}
            {phase === 'genesis' && mnemonic && (
              <Animated.View style={[
                styles.mnemonicSection,
                {
                  borderWidth: backupPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1.5, 3] }),
                  borderColor: backupPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.warning + '55', Colors.warning] }),
                  borderRadius: Radius.xl,
                  padding: Spacing.md,
                  backgroundColor: backupPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.warningBg + '00', Colors.warningBg + '44'] }),
                  shadowColor: Colors.warning,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: backupPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }) as any,
                  shadowRadius: 16,
                  elevation: 6,
                },
              ]}>
                {/* Wallet ready banner */}
                <View style={styles.walletReadyBanner}>
                  <View style={styles.walletReadyIconWrap}>
                    <MaterialIcons name="check-circle" size={22} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.walletReadyTitle}>Your wallet is ready</Text>
                    <Text style={styles.walletReadyBody}>Back up your recovery phrase now — this screen will not appear again.</Text>
                  </View>
                  <View style={styles.walletReadyArrow}>
                    <MaterialIcons name="arrow-downward" size={18} color={Colors.warning} />
                  </View>
                </View>
                <View style={styles.warningBanner}>
                  <MaterialIcons name="warning" size={16} color={Colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.warningTitle}>Back Up Your Recovery Phrase</Text>
                    <Text style={styles.warningBody}>Write these 24 words on paper and store securely. Anyone with this phrase controls your BTNG Gold. This screen will not show again.</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.revealBtn} onPress={() => setShowPhrase(v => !v)} activeOpacity={0.8}>
                  <MaterialIcons name={showPhrase ? 'visibility-off' : 'visibility'} size={16} color={Colors.primary} />
                  <Text style={styles.revealBtnText}>{showPhrase ? 'Hide Recovery Phrase' : 'Reveal Recovery Phrase'}</Text>
                </TouchableOpacity>
                {showPhrase && (
                  <View style={styles.phraseContainer}>
                    <View style={styles.phraseHeaderRow}>
                      <Text style={styles.phraseContainerTitle}>24-Word Recovery Phrase</Text>
                      <TouchableOpacity style={styles.copyPhraseBtn} onPress={() => handleCopy(mnemonic, 'Recovery phrase')}>
                        <MaterialIcons name="copy-all" size={14} color={Colors.primary} /><Text style={styles.copyPhraseBtnText}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                    <MnemonicGrid words={words} />
                    <Text style={styles.phraseNote}>🔒  Store offline · Never share digitally · Never photograph</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.checkRow} onPress={() => setBackupChecked(v => !v)} activeOpacity={0.8}>
                  <View style={[styles.checkbox, backupChecked && { backgroundColor: Colors.success, borderColor: Colors.success }]}>
                    {backupChecked && <MaterialIcons name="check" size={14} color={Colors.bg} />}
                  </View>
                  <Text style={styles.checkText}>I have written down my 24-word recovery phrase and stored it securely offline.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, !backupChecked && { opacity: 0.4 }]} onPress={confirmBackup} disabled={!backupChecked} activeOpacity={0.85}>
                  <MaterialIcons name="verified" size={18} color={Colors.bg} /><Text style={styles.primaryBtnText}>I have backed up my wallet</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Verify Signature */}
            {phase === 'existing' && (
              <View style={styles.verifyPanel}>
                <TouchableOpacity style={styles.verifyPanelHeader} onPress={() => { setVerifyExpanded(v => !v); setVerifyResult(null); }} activeOpacity={0.8}>
                  <View style={styles.verifyHeaderLeft}>
                    <View style={styles.verifyIconWrap}><MaterialIcons name="verified-user" size={16} color={Colors.primary} /></View>
                    <View><Text style={styles.verifyPanelTitle}>Verify Signature</Text><Text style={styles.verifyPanelSubtitle}>Confirm message authenticity by address</Text></View>
                  </View>
                  <View style={styles.verifyHeaderRight}>
                    <View style={styles.eipBadge}><Text style={styles.eipBadgeText}>EIP-191</Text></View>
                    <MaterialIcons name={verifyExpanded ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>
                {verifyExpanded && (
                  <View style={styles.verifyBody}>
                    <View style={styles.verifyFieldWrap}>
                      <View style={styles.verifyFieldLabelRow}>
                        <MaterialIcons name="account-balance-wallet" size={12} color={Colors.textMuted} />
                        <Text style={styles.verifyFieldLabel}>Signer Address</Text>
                        {address ? (<TouchableOpacity style={styles.verifyAutoFillBtn} onPress={() => setVerifyAddr(address)} activeOpacity={0.75}><MaterialIcons name="my-location" size={10} color={Colors.primary} /><Text style={styles.verifyAutoFillText}>Use active</Text></TouchableOpacity>) : null}
                      </View>
                      <TextInput style={styles.verifyInput} value={verifyAddr} onChangeText={t => { setVerifyAddr(t); setVerifyResult(null); }} placeholder="0x…" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} spellCheck={false} />
                    </View>
                    <View style={styles.verifyFieldWrap}>
                      <View style={styles.verifyFieldLabelRow}><MaterialIcons name="message" size={12} color={Colors.textMuted} /><Text style={styles.verifyFieldLabel}>Original Message</Text></View>
                      <TextInput style={[styles.verifyInput, styles.verifyInputMulti]} value={verifyMsg} onChangeText={t => { setVerifyMsg(t); setVerifyResult(null); }} placeholder="The message that was signed…" placeholderTextColor={Colors.textMuted} multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} spellCheck={false} />
                    </View>
                    <View style={styles.verifyFieldWrap}>
                      <View style={styles.verifyFieldLabelRow}><MaterialIcons name="draw" size={12} color={Colors.textMuted} /><Text style={styles.verifyFieldLabel}>Hex Signature</Text></View>
                      <TextInput style={[styles.verifyInput, styles.verifyInputMono]} value={verifySigInput} onChangeText={t => { setVerifySigInput(t); setVerifyResult(null); }} placeholder="0x…" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} spellCheck={false} />
                    </View>
                    <TouchableOpacity style={[styles.verifyBtn, (verifying || !verifyAddr.trim() || !verifyMsg.trim() || !verifySigInput.trim()) && { opacity: 0.45 }]} onPress={handleVerify} disabled={verifying || !verifyAddr.trim() || !verifyMsg.trim() || !verifySigInput.trim()} activeOpacity={0.8}>
                      {verifying ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="verified-user" size={16} color={Colors.bg} />}
                      <Text style={styles.verifyBtnText}>{verifying ? 'Verifying…' : 'Verify Signature'}</Text>
                    </TouchableOpacity>
                    {verifyResult && ('error' in verifyResult ? (
                      <View style={styles.verifyError}><MaterialIcons name="error-outline" size={14} color={Colors.error} /><Text style={styles.verifyErrorText}>{verifyResult.error}</Text></View>
                    ) : (
                      <View style={[styles.verifyResultCard, verifyResult.valid ? styles.verifyResultValid : styles.verifyResultInvalid]}>
                        <View style={styles.verifyResultBadgeRow}>
                          <View style={[styles.verifyBadge, verifyResult.valid ? styles.verifyBadgeValid : styles.verifyBadgeInvalid]}>
                            <MaterialIcons name={verifyResult.valid ? 'check-circle' : 'cancel'} size={18} color={verifyResult.valid ? Colors.success : Colors.error} />
                            <Text style={[styles.verifyBadgeText, { color: verifyResult.valid ? Colors.success : Colors.error }]}>{verifyResult.valid ? 'VALID' : 'INVALID'}</Text>
                          </View>
                          <Text style={styles.verifyResultHint}>{verifyResult.valid ? 'Signature matches the address' : 'Signature does NOT match the address'}</Text>
                        </View>
                        <View style={styles.verifyRecoveredWrap}>
                          <Text style={styles.verifyRecoveredLabel}>Recovered signer</Text>
                          <View style={styles.verifyRecoveredRow}>
                            <Text style={[styles.verifyRecoveredAddr, { color: verifyResult.valid ? Colors.success : Colors.error }]} selectable numberOfLines={1}>{verifyResult.recoveredAddress}</Text>
                            {verifyResult.valid && <MaterialIcons name="check-circle" size={12} color={Colors.success} />}
                          </View>
                        </View>
                        <View style={styles.verifyMetaRow}>
                          <View style={styles.verifyMetaChip}><MaterialIcons name="security" size={10} color={Colors.textMuted} /><Text style={styles.verifyMetaText}>EIP-191 · personal_sign</Text></View>
                          <View style={styles.verifyMetaChip}><MaterialIcons name="fingerprint" size={10} color={Colors.textMuted} /><Text style={styles.verifyMetaText}>secp256k1</Text></View>
                        </View>
                      </View>
                    ))}
                    <Text style={styles.verifyHelperText}>Paste any EIP-191 personal_sign signature and the original message to confirm the signer. The recovered address is derived cryptographically — no private key required.</Text>
                  </View>
                )}
              </View>
            )}

            {/* Sign Message */}
            {phase === 'existing' && (
              <View style={styles.signPanel}>
                <TouchableOpacity style={styles.signPanelHeader} onPress={() => { setSignExpanded(v => !v); setSignResult(null); }} activeOpacity={0.8}>
                  <View style={styles.signHeaderLeft}>
                    <View style={styles.signIconWrap}><MaterialIcons name="draw" size={16} color={Colors.primary} /></View>
                    <View><Text style={styles.signPanelTitle}>Sign Message</Text><Text style={styles.signPanelSubtitle}>Prove ownership of your BTNG address</Text></View>
                  </View>
                  <View style={styles.signHeaderRight}>
                    <View style={styles.eipBadge}><Text style={styles.eipBadgeText}>EIP-191</Text></View>
                    <MaterialIcons name={signExpanded ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>
                {signExpanded && (
                  <View style={styles.signBody}>
                    <View style={styles.signInputLabel}><MaterialIcons name="message" size={12} color={Colors.textMuted} /><Text style={styles.signInputLabelText}>Message / Payload</Text></View>
                    <TextInput style={styles.signInput} value={signPayload} onChangeText={text => { setSignPayload(text); setSignResult(null); }} placeholder={`Sign with BTNG Account ${activeIndex + 1}…`} placeholderTextColor={Colors.textMuted} multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} spellCheck={false} />
                    <TouchableOpacity style={[styles.signBtn, (signing || !signPayload.trim()) && { opacity: 0.45 }]} onPress={handleSignMessage} disabled={signing || !signPayload.trim()} activeOpacity={0.8}>
                      {signing ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="draw" size={16} color={Colors.bg} />}
                      <Text style={styles.signBtnText}>{signing ? 'Signing…' : `Sign with Account ${activeIndex + 1}`}</Text>
                    </TouchableOpacity>
                    {signResult && ('error' in signResult ? (
                      <View style={styles.signError}><MaterialIcons name="error-outline" size={14} color={Colors.error} /><Text style={[styles.signResultText, { color: Colors.error, flex: 1 }]}>{signResult.error}</Text></View>
                    ) : (
                      <View style={styles.signResultCard}>
                        <View style={styles.signResultHeader}>
                          <View style={styles.signResultHeaderLeft}><View style={styles.signOkDot} /><Text style={styles.signResultHeaderLabel}>Signature</Text><View style={styles.eipBadgeSmall}><Text style={styles.eipBadgeSmallText}>personal_sign</Text></View></View>
                          <TouchableOpacity style={[styles.sigCopyBtn, sigCopied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]} onPress={() => handleCopySig(signResult.sig)} activeOpacity={0.8}>
                            <MaterialIcons name={sigCopied ? 'check-circle' : 'copy-all'} size={13} color={sigCopied ? Colors.success : Colors.primary} />
                            <Text style={[styles.sigCopyBtnText, sigCopied && { color: Colors.success }]}>{sigCopied ? 'Copied' : 'Copy'}</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.sigBox}><Text style={styles.sigHex} selectable numberOfLines={4}>{signResult.sig}</Text></View>
                        <View style={styles.sigMetaRow}>
                          <View style={styles.sigMetaChip}><MaterialIcons name="account-tree" size={10} color={Colors.textMuted} /><Text style={styles.sigMetaText}>{`Account ${activeIndex + 1} · /0/${activeIndex}`}</Text></View>
                          <View style={styles.sigMetaChip}><MaterialIcons name="fingerprint" size={10} color={Colors.textMuted} /><Text style={styles.sigMetaText}>132 chars</Text></View>
                        </View>
                      </View>
                    ))}
                    <Text style={styles.signHelperText}>The message is signed using EIP-191 personal_sign (Ethereum standard). The signature proves the active BTNG address controls the private key — without revealing it.</Text>
                  </View>
                )}
              </View>
            )}

            {/* RPC Settings */}
            {phase === 'existing' && (
              <View style={styles.rpcPanel}>
                <TouchableOpacity style={styles.rpcPanelHeader} onPress={() => setRpcExpanded(v => !v)} activeOpacity={0.8}>
                  <View style={styles.rpcHeaderLeft}>
                    <View style={styles.rpcIconWrap}><MaterialIcons name="router" size={16} color={Colors.primary} /></View>
                    <View><Text style={styles.rpcPanelTitle}>RPC Node Settings</Text><Text style={styles.rpcPanelSubtitle} numberOfLines={1}>{rpcSaved}</Text></View>
                  </View>
                  <View style={styles.rpcHeaderRight}>
                    {rpcSaved !== BTNG_RPC_URL && <View style={styles.rpcCustomBadge}><Text style={styles.rpcCustomBadgeText}>Custom</Text></View>}
                    <MaterialIcons name={rpcExpanded ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>
                {rpcExpanded && (
                  <View style={styles.rpcBody}>
                    <View style={styles.rpcInputRow}><TextInput style={styles.rpcInput} value={rpcInput} onChangeText={text => { setRpcInput(text); setRpcResult(null); }} placeholder="https://rpc.btng.gold" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} spellCheck={false} keyboardType="url" /></View>
                    <View style={styles.rpcActionRow}>
                      <TouchableOpacity style={[styles.rpcBtn, styles.rpcBtnTest, rpcTesting && { opacity: 0.55 }]} onPress={handleTestRpc} disabled={rpcTesting} activeOpacity={0.8}>
                        {rpcTesting ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="wifi-tethering" size={14} color={Colors.primary} />}
                        <Text style={styles.rpcBtnTestText}>{rpcTesting ? 'Testing…' : 'Test Connection'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rpcBtn} onPress={handleSaveRpc} activeOpacity={0.8}><MaterialIcons name="save" size={14} color={Colors.textSecondary} /><Text style={styles.rpcBtnText}>Save</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.rpcBtn} onPress={handleResetRpc} activeOpacity={0.8}><MaterialIcons name="settings-backup-restore" size={14} color={Colors.textMuted} /><Text style={[styles.rpcBtnText, { color: Colors.textMuted }]}>Default</Text></TouchableOpacity>
                    </View>
                    {rpcResult && (
                      <View style={[styles.rpcResult, 'error' in rpcResult ? styles.rpcResultError : styles.rpcResultSuccess]}>
                        {'error' in rpcResult ? (
                          <View style={styles.rpcResultRow}><MaterialIcons name="error-outline" size={15} color={Colors.error} /><Text style={[styles.rpcResultText, { color: Colors.error, flex: 1 }]}>{rpcResult.error}</Text></View>
                        ) : (
                          <>
                            <View style={styles.rpcResultRow}><View style={styles.rpcStatChip}><MaterialIcons name="speed" size={12} color={Colors.success} /><Text style={styles.rpcStatLabel}>Latency</Text></View><Text style={styles.rpcStatValue}><Text style={{ color: Colors.success, fontWeight: FontWeight.bold }}>{rpcResult.latencyMs}</Text><Text style={{ color: Colors.textMuted }}> ms</Text></Text></View>
                            <View style={styles.rpcResultRow}><View style={styles.rpcStatChip}><MaterialIcons name="view-stream" size={12} color={Colors.primary} /><Text style={styles.rpcStatLabel}>Block</Text></View><Text style={styles.rpcStatValue}><Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>#{rpcResult.blockHeight}</Text></Text></View>
                            <View style={styles.rpcResultRow}><View style={styles.rpcStatChip}><MaterialIcons name="toll" size={12} color={Colors.textMuted} /><Text style={styles.rpcStatLabel}>Balance</Text></View><Text style={[styles.rpcStatValue, { color: Colors.textPrimary }]}>{rpcResult.balance}</Text></View>
                            <View style={styles.rpcOkRow}><View style={styles.rpcOkPill}><View style={styles.rpcOkDot} /><Text style={styles.rpcOkText}>Connected</Text></View><Text style={styles.rpcResultEndpoint} numberOfLines={1}>{rpcResult.rpcUrl}</Text></View>
                          </>
                        )}
                      </View>
                    )}
                    <Text style={styles.rpcHelperText}>Enter any EVM-compatible JSON-RPC endpoint. Leave blank to use the BTNG default node.</Text>
                  </View>
                )}
              </View>
            )}

            {/* Eternal Service Link */}
            {phase === 'existing' && (
              <TouchableOpacity
                style={eternStyles.card}
                onPress={() => router.push('/btng-eternal-service' as any)}
                activeOpacity={0.85}
              >
                <View style={eternStyles.left}>
                  <View style={eternStyles.iconWrap}>
                    <Text style={{ fontSize: 22 }}>♾️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={eternStyles.title}>Eternal Service Dashboard</Text>
                    <Text style={eternStyles.sub}>Live genesis counter · Gold spiral · Service commitments</Text>
                  </View>
                </View>
                <View style={eternStyles.right}>
                  <View style={eternStyles.activeBadge}>
                    <View style={eternStyles.activeDot} />
                    <Text style={eternStyles.activeText}>Active</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            )}

            {/* Existing wallet info */}
            {phase === 'existing' && (
              <View style={styles.existingPanel}>
                <View style={styles.existingRow}><MaterialIcons name="lock" size={14} color={Colors.success} /><Text style={styles.existingLabel}>Secure Storage</Text><View style={styles.existingBadge}><Text style={styles.existingBadgeText}>Encrypted on-device</Text></View></View>
                <View style={styles.existingRow}><MaterialIcons name="shield" size={14} color={Colors.primary} /><Text style={styles.existingLabel}>Key Custody</Text><View style={[styles.existingBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '33' }]}><Text style={[styles.existingBadgeText, { color: Colors.primary }]}>Self-sovereign</Text></View></View>
                <View style={styles.existingRow}><MaterialIcons name="account-tree" size={14} color={Colors.textMuted} /><Text style={styles.existingLabel}>Network</Text><Text style={styles.existingValue}>BTNG Gold (Coin Type 9999)</Text></View>
                <View style={styles.existingRow}><MaterialIcons name="public" size={14} color={Colors.africanGreen} /><Text style={styles.existingLabel}>Region</Text><Text style={[styles.existingValue, { color: Colors.africanGreen }]}>Ghana · Africa · Diaspora</Text></View>
              </View>
            )}

            {/* Danger Zone */}
            {phase === 'existing' && (
              <View style={styles.dangerZone}>
                <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
                <View style={styles.changePinWrap}>
                  <View style={styles.changePinLabelRow}>
                    <MaterialIcons name="dialpad" size={13} color={Colors.warning} />
                    <Text style={styles.changePinLabel}>Change Wallet PIN</Text>
                    {changePinSuccess ? (<View style={styles.changePinSuccessBadge}><MaterialIcons name="check-circle" size={10} color={Colors.success} /><Text style={styles.changePinSuccessText}>PIN updated</Text></View>) : null}
                  </View>
                  <TouchableOpacity style={styles.changePinBtn} onPress={handleChangePinStart} activeOpacity={0.8}>
                    <MaterialIcons name="lock-reset" size={15} color={Colors.warning} /><Text style={styles.changePinBtnText}>{storedPin ? 'Change PIN' : 'Set PIN'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.changePinHint}>{storedPin ? 'Verify your current PIN, then enter a new 6-digit PIN.' : 'No PIN set yet — tap to create a 6-digit wallet PIN.'}</Text>
                </View>
                <View style={styles.dangerDivider} />
                <View style={styles.pkExportWrap}>
                  {!pkRevealed ? (
                    <>
                      <View style={styles.pkExportLabelRow}>
                        <MaterialIcons name="vpn-key" size={13} color={Colors.error} />
                        <Text style={styles.pkExportLabel}>Export Private Key</Text>
                        <View style={styles.pkHoldBadge}><MaterialIcons name="touch-app" size={10} color={Colors.warning} /><Text style={styles.pkHoldBadgeText}>Hold to reveal</Text></View>
                      </View>
                      <TouchableOpacity style={[styles.pkExportBtn, pkLoading && { opacity: 0.55 }]} onLongPress={handleExportPk} delayLongPress={700} disabled={pkLoading} activeOpacity={0.75}>
                        {pkLoading ? <ActivityIndicator size="small" color={Colors.error} /> : <MaterialIcons name="vpn-key" size={16} color={Colors.error} />}
                        <Text style={styles.pkExportBtnText}>{pkLoading ? 'Retrieving…' : 'Hold to Export Private Key'}</Text>
                      </TouchableOpacity>
                      <Text style={styles.pkExportHint}>Hold for 0.7 s to reveal. Anyone with this key has full control of Account {activeIndex + 1}.</Text>
                    </>
                  ) : (
                    <View style={styles.pkRevealCard}>
                      <View style={styles.pkWarningBanner}><MaterialIcons name="warning" size={14} color={Colors.error} /><Text style={styles.pkWarningText}>Store securely — NEVER share this key. Auto-clears in {pkCountdown}s.</Text></View>
                      <View style={styles.pkCountdownTrack}><View style={[styles.pkCountdownBar, { width: `${(pkCountdown / 60) * 100}%` as any }]} /></View>
                      <View style={styles.pkRevealHeaderRow}>
                        <View style={styles.pkRevealHeaderLeft}><View style={styles.pkRevealDot} /><Text style={styles.pkRevealHeaderLabel}>Private Key · Account {activeIndex + 1}</Text><View style={styles.pkDerivChip}><Text style={styles.pkDerivChipText}>{`/0/${activeIndex}`}</Text></View></View>
                        <TouchableOpacity style={[styles.pkCopyBtn, pkCopied && { backgroundColor: Colors.errorBg, borderColor: Colors.error + '55' }]} onPress={handleCopyPk} activeOpacity={0.8}>
                          <MaterialIcons name={pkCopied ? 'check-circle' : 'copy-all'} size={13} color={Colors.error} /><Text style={[styles.pkCopyBtnText, pkCopied && { color: Colors.error }]}>{pkCopied ? 'Copied' : 'Copy'}</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.pkBox}><Text style={styles.pkHex} selectable numberOfLines={3}>{pkValue}</Text></View>
                      <TouchableOpacity style={styles.pkClearBtn} onPress={clearPrivateKey} activeOpacity={0.8}><MaterialIcons name="visibility-off" size={14} color={Colors.textMuted} /><Text style={styles.pkClearBtnText}>Clear key from screen</Text></TouchableOpacity>
                    </View>
                  )}
                </View>
                <View style={styles.dangerDivider} />
                <TouchableOpacity style={styles.dangerBtn} onPress={() => setConfirmDelete(true)}>
                  <MaterialIcons name="delete-forever" size={16} color={Colors.error} /><Text style={styles.dangerBtnText}>Remove wallet from device</Text>
                </TouchableOpacity>
                <Text style={styles.dangerNote}>This only removes the wallet from this device. Your funds are recoverable with your 24-word phrase.</Text>
              </View>
            )}
          </View>
        )}
        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>

      {/* Nickname Modal */}
      <Modal visible={nicknameModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { borderColor: Colors.primary + '44' }]}>
            <View style={nicknameStyles.iconWrap}><MaterialIcons name="label" size={28} color={Colors.primary} /></View>
            <Text style={styles.modalTitle}>Rename Account</Text>
            <Text style={nicknameStyles.subtitle}>Account {nicknameEditIndex + 1} · m/44&apos;/9999&apos;/0&apos;/0/{nicknameEditIndex}</Text>
            <TextInput style={nicknameStyles.input} value={nicknameInput} onChangeText={setNicknameInput} placeholder={`Account ${nicknameEditIndex + 1}`} placeholderTextColor={Colors.textMuted} autoCapitalize="words" autoCorrect={false} maxLength={24} returnKeyType="done" onSubmitEditing={handleSaveNickname} />
            <View style={nicknameStyles.charRow}>
              <Text style={nicknameStyles.charCount}>{nicknameInput.length}/24</Text>
              {nicknameInput.trim() ? (<TouchableOpacity style={nicknameStyles.clearBtn} onPress={() => setNicknameInput('')}><MaterialIcons name="close" size={11} color={Colors.textMuted} /><Text style={nicknameStyles.clearBtnText}>Clear</Text></TouchableOpacity>) : null}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNicknameModalVisible(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[nicknameStyles.saveBtn, nicknameSaving && { opacity: 0.6 }]} onPress={handleSaveNickname} disabled={nicknameSaving}>
                {nicknameSaving ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="check" size={16} color={Colors.bg} />}
                <Text style={nicknameStyles.saveBtnText}>{nicknameSaving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PinModal visible={pinModalVisible} mode={pinModalMode} storedPin={storedPin ?? undefined} canUseBiometric={bioAvailable} onUseBiometric={handlePinModalBiometric} onSuccess={handlePinSuccess} onCancel={handlePinCancel} />

      <Modal visible={confirmDelete} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={[styles.modalIconWrap, { backgroundColor: Colors.errorBg }]}><MaterialIcons name="delete-forever" size={32} color={Colors.error} /></View>
            <Text style={styles.modalTitle}>Remove Wallet?</Text>
            <Text style={styles.modalBody}>This will delete your BTNG Genesis Wallet from this device. Your funds remain safe — restore anytime with your 24-word recovery phrase. Make sure you have it before proceeding.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setConfirmDelete(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalDeleteBtn} onPress={handleDelete}><Text style={styles.modalDeleteText}>Remove</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter: { alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  deleteIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.errorBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.error + '33' },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingBottom: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontSize: FontSize.md, color: Colors.textMuted, includeFontPadding: false },
  coinEmblem: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  coinOuter: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primaryGlow, borderWidth: 2.5, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 14, overflow: 'hidden' },
  coinInner: { alignItems: 'center', gap: 2 },
  coinSymbol: { fontSize: 36, color: Colors.primary, includeFontPadding: false },
  coinLabel: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 2, includeFontPadding: false, display: 'none' as any },
  coinNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  goldDivider: { height: 1, width: 30, backgroundColor: Colors.primary, opacity: 0.5 },
  coinFullName: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 3, includeFontPadding: false },
  coinTagline: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  section: { gap: Spacing.md },
  introCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.success + '33' },
  securityText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
  introTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  introBody: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  featureList: { gap: Spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  featureText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1, includeFontPadding: false },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2 },
  primaryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.primary },
  secondaryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  errorText: { flex: 1, fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },
  addressCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  addressCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  addressIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  addressCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  addressCardSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  addressBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  addressText: { flex: 1, fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  addressMeta: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '33' },
  metaChipText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  // Live Balance Panel
  liveBalancePanel: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.success + '55', gap: Spacing.md, overflow: 'hidden', shadowColor: Colors.success, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  // Portfolio value row
  portfolioValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.kenteGold + '33', gap: Spacing.sm, backgroundColor: Colors.kenteGold + '08' },
  portfolioValueLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  portfolioValueIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.kenteGold + '20', borderWidth: 1, borderColor: Colors.kenteGold + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  portfolioValueLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.kenteGold, includeFontPadding: false },
  portfolioValueSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  portfolioValueLoading: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  portfolioValueLoadingText: { fontSize: FontSize.xs, color: Colors.kenteGold, includeFontPadding: false },
  portfolioValueRight: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  portfolioValueBtngRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  portfolioValueBtng: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.kenteGold, includeFontPadding: false },
  portfolioValueBtngBadge: { backgroundColor: Colors.kenteGold + '22', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.kenteGold + '55' },
  portfolioValueBtngBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.kenteGold, letterSpacing: 0.8, includeFontPadding: false },
  portfolioValueFiatRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  portfolioValueFiatChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  portfolioValueFiatSymbol: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  portfolioValueFiatAmount: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  portfolioValueFiatDivider: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  portfolioGoldOracleRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  portfolioGoldOracleDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 3 },
  portfolioGoldOracleText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  portfolioGhsRateRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  portfolioGhsRateDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E', shadowColor: '#22C55E', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 3 },
  portfolioGhsRateText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  liveBalancePanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 0, gap: Spacing.sm },
  liveBalancePanelLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  liveBalanceIconWrap: { width: 34, height: 34, borderRadius: 11, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  liveBalancePanelTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  liveBalancePanelSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  liveRefreshBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.successBg, borderWidth: 1.5, borderColor: Colors.success + '66', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Fetching status
  liveBalanceFetchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '44' },
  liveBalanceFetchingText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
  liveBalanceFetchingBadge: { backgroundColor: Colors.success + '22', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '55' },
  liveBalanceFetchingBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.5, includeFontPadding: false },
  // Status row
  liveBalanceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: Spacing.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '44' },
  liveStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 5, elevation: 3, flexShrink: 0 },
  liveStatusTextWrap: { gap: 1 },
  liveStatusLabel: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false, letterSpacing: 0.5 },
  liveStatusTime: { fontSize: 9, color: Colors.success, opacity: 0.75, includeFontPadding: false },
  liveStatusDivider: { width: 1, height: 18, backgroundColor: Colors.success + '33' },
  liveStatusTimeChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  liveStatusTimeChipText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  liveParallelChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  liveParallelChipText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  // Mini balance rail
  liveBalanceRail: { flexGrow: 0 },
  liveBalanceRailContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingVertical: 2 },
  liveBalanceMiniCard: { alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.sm + 4, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.border, minWidth: 80, position: 'relative' },
  liveBalanceMiniCardActive: { backgroundColor: Colors.successBg, borderColor: Colors.success + '66', shadowColor: Colors.success, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
  liveBalanceMiniIndex: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  liveBalanceMiniIndexActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  liveBalanceMiniIndexText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  liveBalanceMiniEmpty: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  liveBalanceMiniOffline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  liveBalanceMiniOfflineText: { fontSize: 9, color: Colors.error, fontWeight: FontWeight.semibold, includeFontPadding: false },
  liveBalanceMiniBalanceWrap: { alignItems: 'center', gap: 1 },
  liveBalanceMiniBalance: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  liveBalanceMiniSymbol: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, letterSpacing: 0.5, includeFontPadding: false },
  liveBalanceMiniActiveDot: { position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 3 },
  // Pull hint
  liveBalancePullHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, paddingTop: 0 },
  liveBalancePullHintText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  // Legacy (kept for AccountSelector compatibility)
  balanceSummaryBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '33' },
  balanceSummaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' },
  balanceSummaryLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  balanceLivePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  balanceLiveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  balanceLiveText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  balanceRefreshBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  mnemonicSection: { gap: Spacing.md, overflow: 'visible' },
  walletReadyBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.successBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.success + '77', shadowColor: Colors.success, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  walletReadyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.success + '22', borderWidth: 1, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  walletReadyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  walletReadyBody: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, marginTop: 2, includeFontPadding: false },
  walletReadyArrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  warningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44' },
  warningTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  warningBody: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: 3, includeFontPadding: false },
  revealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.primary },
  revealBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  phraseContainer: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  phraseHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phraseContainerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  copyPhraseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  copyPhraseBtnText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  phraseNote: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },
  existingPanel: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  existingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  existingLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  existingBadge: { backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  existingBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  existingValue: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  changePinWrap: { gap: Spacing.sm },
  changePinLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changePinLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.warning, flex: 1, includeFontPadding: false },
  changePinSuccessBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '55' },
  changePinSuccessText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  changePinBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderWidth: 1, borderColor: Colors.warning + '55', alignSelf: 'flex-start' },
  changePinBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.warning, includeFontPadding: false },
  changePinHint: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  dangerZone: { backgroundColor: Colors.errorBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.error + '44', gap: Spacing.sm },
  dangerZoneTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error, letterSpacing: 0.5, includeFontPadding: false },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bg, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderWidth: 1, borderColor: Colors.error + '44', alignSelf: 'flex-start' },
  dangerBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.error, includeFontPadding: false },
  dangerNote: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  dangerDivider: { height: 1, backgroundColor: Colors.error + '22', marginVertical: Spacing.sm },
  pkExportWrap: { gap: Spacing.sm },
  pkExportLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pkExportLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error, flex: 1, includeFontPadding: false },
  pkHoldBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '55' },
  pkHoldBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  pkExportBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bg, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderWidth: 1.5, borderColor: Colors.error + '66', alignSelf: 'flex-start' },
  pkExportBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.error, includeFontPadding: false },
  pkExportHint: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  pkRevealCard: { backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.error + '66', overflow: 'hidden', gap: 0 },
  pkWarningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.error + '22', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.error + '33' },
  pkWarningText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, fontWeight: FontWeight.semibold, lineHeight: 16, includeFontPadding: false },
  pkCountdownTrack: { height: 3, backgroundColor: Colors.error + '22' },
  pkCountdownBar: { height: 3, backgroundColor: Colors.error, opacity: 0.7 },
  pkRevealHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.error + '22' },
  pkRevealHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pkRevealHeaderLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  pkRevealDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.error, shadowColor: Colors.error, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  pkDerivChip: { backgroundColor: Colors.errorBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: Colors.error + '44' },
  pkDerivChipText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.error, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  pkCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.errorBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.error + '44' },
  pkCopyBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  pkBox: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.error + '22', backgroundColor: Colors.errorBg + '55' },
  pkHex: { fontSize: 10, color: Colors.error, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.3, lineHeight: 16, includeFontPadding: false },
  pkClearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: Spacing.md },
  pkClearBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  importCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  importIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  importTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  importSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  phraseInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.sm, minHeight: 120, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  wordCountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wordCountText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  signPanel: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  signPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  signHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  signHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  signIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  signPanelTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  signPanelSubtitle: { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  eipBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '55' },
  eipBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  signBody: { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  signInputLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  signInputLabelText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  signInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.sm, minHeight: 80, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  signBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  signBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  signError: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  signResultCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '55', overflow: 'hidden' },
  signResultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, backgroundColor: Colors.successBg, borderBottomWidth: 1, borderBottomColor: Colors.success + '33' },
  signResultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signResultHeaderLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  signOkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  eipBadgeSmall: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: Colors.primary + '44' },
  eipBadgeSmallText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.3, includeFontPadding: false },
  sigCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  sigCopyBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  sigBox: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sigHex: { fontSize: 10, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.3, lineHeight: 16, includeFontPadding: false },
  sigResultText: { fontSize: FontSize.sm, lineHeight: 18, includeFontPadding: false },
  sigMetaRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  sigMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  sigMetaText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  signHelperText: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  rpcPanel: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  rpcPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  rpcHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  rpcHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rpcIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  rpcPanelTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  rpcPanelSubtitle: { fontSize: 10, color: Colors.textMuted, marginTop: 2, maxWidth: 200, includeFontPadding: false },
  rpcCustomBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  rpcCustomBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  rpcBody: { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  rpcInputRow: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  rpcInput: { color: Colors.textPrimary, fontSize: FontSize.sm, paddingVertical: Spacing.md, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  rpcActionRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  rpcBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.border },
  rpcBtnTest: { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow, flex: 1, justifyContent: 'center' },
  rpcBtnTestText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  rpcBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary, includeFontPadding: false },
  rpcResult: { borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, gap: Spacing.sm },
  rpcResultSuccess: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  rpcResultError: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' },
  rpcResultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  rpcStatChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rpcStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  rpcStatValue: { fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  rpcResultText: { fontSize: FontSize.sm, lineHeight: 18, includeFontPadding: false },
  rpcOkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  rpcOkPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  rpcOkDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  rpcOkText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  rpcResultEndpoint: { fontSize: 9, color: Colors.textMuted, flex: 1, includeFontPadding: false },
  rpcHelperText: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  verifyPanel: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  verifyPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  verifyHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  verifyHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  verifyIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  verifyPanelTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  verifyPanelSubtitle: { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  verifyBody: { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  verifyFieldWrap: { gap: 6 },
  verifyFieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifyFieldLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, flex: 1 },
  verifyAutoFillBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  verifyAutoFillText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  verifyInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false },
  verifyInputMulti: { minHeight: 70, textAlignVertical: 'top' },
  verifyInputMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  verifyBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  verifyError: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  verifyErrorText: { flex: 1, fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },
  verifyResultCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  verifyResultValid: { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' },
  verifyResultInvalid: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '55' },
  verifyResultBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  verifyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  verifyBadgeValid: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  verifyBadgeInvalid: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' },
  verifyBadgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  verifyResultHint: { fontSize: FontSize.xs, color: Colors.textSecondary, flex: 1, includeFontPadding: false },
  verifyRecoveredWrap: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  verifyRecoveredLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  verifyRecoveredRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifyRecoveredAddr: { flex: 1, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: FontWeight.semibold, includeFontPadding: false },
  verifyMetaRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  verifyMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  verifyMetaText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  verifyHelperText: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.88)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  modalSheet: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', gap: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44', alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.error + '44' },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  modalActions: { flexDirection: 'row', gap: Spacing.md, width: '100%' },
  modalCancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  modalCancelText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  modalDeleteBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.error, alignItems: 'center' },
  modalDeleteText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
});

const reminderBannerStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.xl, marginBottom: 6,
    borderRadius: Radius.lg, borderWidth: 1.5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3,
    shadowColor: Colors.error, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.error + '22', borderWidth: 1, borderColor: Colors.error + '55',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  textWrap: { flex: 1, gap: 2 },
  title: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.error, includeFontPadding: false },
  sub: { fontSize: 10, color: Colors.textSecondary, lineHeight: 14, includeFontPadding: false },
  subBold: { fontWeight: FontWeight.heavy, color: Colors.error },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.error, borderRadius: Radius.lg,
    paddingHorizontal: 10, paddingVertical: 7,
    shadowColor: Colors.error, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 3,
    flexShrink: 0,
  },
  btnText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
});

const eternStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.primary + '55',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  iconWrap: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.primaryGlow,
    borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.success + '44',
  },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  activeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
});

const cashLinkStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44', shadowColor: Colors.warning, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  badgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
});

const nicknameStyles = StyleSheet.create({
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: -Spacing.sm },
  input: { width: '100%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.semibold, textAlign: 'center', includeFontPadding: false },
  charRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: '100%', gap: Spacing.sm, marginTop: -Spacing.sm },
  charCount: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  clearBtnText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  saveBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
