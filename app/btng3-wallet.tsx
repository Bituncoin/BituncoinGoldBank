// BTNG3 Wallet Generator — Genesis Style
// Bitcoin-style Base58Check, 35-char addresses, secp256k1 keypairs
// Commercial-grade: Personal · Business · Merchant
import React, { useState, useCallback, useRef, useEffect, Component } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Share, Platform,
  TextInput, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import {
  BTNG3ClientType,
  BTNG3Account,
  BTNG3HistoryEntry,
  BTNG3_NETWORKS,
  createBTNG3WalletAccount,
  validateBTNG3Address,
  saveBTNG3Wallet,
  loadBTNG3Wallets,
  deleteBTNG3Wallet,
  loadBTNG3History,
  appendBTNG3History,
  clearBTNG3History,
} from '@/services/btng3WalletService';

// ── Error Boundary ──────────────────────────────────────────────────────────
class SafeSection extends Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

// ── Client type config ──────────────────────────────────────────────────────
const CLIENT_TYPES: {
  type: BTNG3ClientType;
  label: string;
  sub: string;
  icon: string;
  color: string;
}[] = [
  { type: 0x01, label: 'Personal',  sub: 'Individual account',  icon: 'person',      color: Colors.primary    },
  { type: 0x02, label: 'Business',  sub: 'Corporate wallet',    icon: 'business',    color: '#3B82F6'         },
  { type: 0x03, label: 'Merchant',  sub: 'Payment acceptance',  icon: 'storefront',  color: '#22C55E'         },
];

// ── Address pill badge ──────────────────────────────────────────────────────
function AddrBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[ab.wrap, { backgroundColor: color + '1A', borderColor: color + '55' }]}>
      <Text style={[ab.text, { color }]}>{label}</Text>
    </View>
  );
}
const ab = StyleSheet.create({
  wrap: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  text: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
});

// ── Address QR card ─────────────────────────────────────────────────────────
function AddressQRCard({ account }: { account: BTNG3Account }) {
  const { showAlert } = useAlert();
  const qrRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `My BTNG3 ${account.clientTypeLabel} address:\n${account.address}\n\nNetwork: ${account.networkLabel}\nChain: BTNG-MAINNET`,
        title: 'BTNG3 Commercial Wallet Address',
      });
    } catch { showAlert('Share Failed', 'Could not share the address.'); }
  }, [account, showAlert]);

  const handleSave = useCallback(async () => {
    if (!qrRef.current) { showAlert('Error', 'QR not ready.'); return; }
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { showAlert('Permission Denied', 'Allow photo library access in Settings.'); setSaving(false); return; }
      qrRef.current.toDataURL(async (dataURL: string) => {
        try {
          const fileUri = FileSystem.cacheDirectory + 'btng3_address_qr.png';
          await FileSystem.writeAsStringAsync(fileUri, dataURL, { encoding: FileSystem.EncodingType.Base64 });
          const asset = await MediaLibrary.createAssetAsync(fileUri);
          await MediaLibrary.createAlbumAsync('BTNG Wallet', asset, false);
          showAlert('Saved', 'QR code saved to your Photos in the "BTNG Wallet" album.');
        } catch { showAlert('Save Failed', 'Could not save the QR.'); }
        finally { setSaving(false); }
      });
    } catch { showAlert('Error', 'Unexpected error.'); setSaving(false); }
  }, [showAlert]);

  const cfg = CLIENT_TYPES.find(c => c.type === account.clientType) ?? CLIENT_TYPES[0];

  return (
    <View style={[qrc.card, { borderColor: cfg.color + '55' }]}>
      <View style={qrc.header}>
        <View style={[qrc.iconWrap, { backgroundColor: cfg.color + '1A', borderColor: cfg.color + '44' }]}>
          <MaterialIcons name={cfg.icon as any} size={18} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={qrc.title}>Receive · {account.clientTypeLabel} Wallet</Text>
          <Text style={qrc.sub}>{account.networkLabel}</Text>
        </View>
        <AddrBadge label="BTNG3" color={cfg.color} />
      </View>

      <View style={qrc.qrWrap}>
        <View style={qrc.qrFrame}>
          <View style={qrc.qrInner}>
            <QRCode
              value={account.address}
              size={176}
              color={Colors.bg}
              backgroundColor="#F5F0E8"
              getRef={(r) => { qrRef.current = r; }}
              quietZone={8}
            />
          </View>
          {/* Corner brackets */}
          {(['TL','TR','BL','BR'] as const).map(pos => (
            <View key={pos} style={[qrc.corner, qrc[`corner${pos}`], { borderColor: cfg.color }]} />
          ))}
        </View>
        <View style={qrc.watermarkRow}>
          <View style={[qrc.goldDot, { backgroundColor: cfg.color }]} />
          <Text style={[qrc.watermark, { color: cfg.color }]}>BITUNCOIN GOLD · BTNG3 · {account.clientTypeLabel.toUpperCase()}</Text>
          <View style={[qrc.goldDot, { backgroundColor: cfg.color }]} />
        </View>
      </View>

      {/* Address display */}
      <TouchableOpacity
        style={qrc.addrBox}
        onPress={() => { ExpoClipboard.setStringAsync(account.address).catch(()=>{}); showAlert('Copied', 'BTNG3 address copied to clipboard.'); }}
        activeOpacity={0.75}
      >
        <Text style={[qrc.addrText, { color: cfg.color }]} selectable numberOfLines={1} ellipsizeMode="middle">
          {account.address}
        </Text>
        <MaterialIcons name="copy-all" size={14} color={cfg.color} />
      </TouchableOpacity>

      <View style={qrc.lengthRow}>
        <View style={qrc.lengthChip}>
          <MaterialIcons name="tag" size={10} color={Colors.textMuted} />
          <Text style={qrc.lengthText}>{account.address.length} chars</Text>
        </View>
        <View style={qrc.lengthChip}>
          <MaterialIcons name="verified" size={10} color={Colors.success} />
          <Text style={[qrc.lengthText, { color: Colors.success }]}>Base58Check</Text>
        </View>
        <View style={qrc.lengthChip}>
          <MaterialIcons name="security" size={10} color={Colors.primary} />
          <Text style={[qrc.lengthText, { color: Colors.primary }]}>secp256k1</Text>
        </View>
      </View>

      <View style={qrc.actions}>
        <TouchableOpacity style={qrc.actionBtn} onPress={handleShare} activeOpacity={0.8}>
          <MaterialIcons name="share" size={15} color={cfg.color} />
          <Text style={[qrc.actionBtnText, { color: cfg.color }]}>Share</Text>
        </TouchableOpacity>
        <View style={qrc.actionDivider} />
        <TouchableOpacity style={[qrc.actionBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator size="small" color={cfg.color} /> : <MaterialIcons name="save-alt" size={15} color={cfg.color} />}
          <Text style={[qrc.actionBtnText, { color: cfg.color }]}>{saving ? 'Saving…' : 'Save to Photos'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const qrc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  qrWrap: { alignItems: 'center', gap: Spacing.sm },
  qrFrame: { padding: 12, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', position: 'relative' },
  qrInner: { borderRadius: Radius.sm, overflow: 'hidden' },
  corner: { position: 'absolute', width: 18, height: 18 },
  cornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: Radius.lg },
  cornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: Radius.lg },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: Radius.lg },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: Radius.lg },
  watermarkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goldDot: { width: 4, height: 4, borderRadius: 2, opacity: 0.6 },
  watermark: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 2, includeFontPadding: false, opacity: 0.8 },
  addrBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.border },
  addrText: { flex: 1, fontSize: 11, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  lengthRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  lengthChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  lengthText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  actions: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: Spacing.md },
  actionDivider: { width: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function BTNG3WalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedClientType, setSelectedClientType] = useState<BTNG3ClientType>(0x01);
  const [selectedNetwork, setSelectedNetwork] = useState(0x0001);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<BTNG3Account | null>(null);
  const [savedWallets, setSavedWallets] = useState<BTNG3Account[]>([]);
  const [history, setHistory] = useState<BTNG3HistoryEntry[]>([]);
  const [pkRevealed, setPkRevealed] = useState(false);
  const [pkCopied, setPkCopied] = useState(false);
  const [pkCountdown, setPkCountdown] = useState(60);
  const pkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Validator
  const [validateMode, setValidateMode] = useState(false);
  const [validateInput, setValidateInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<Awaited<ReturnType<typeof validateBTNG3Address>> | null>(null);

  // Delete confirm
  const [confirmDeleteAddr, setConfirmDeleteAddr] = useState<string | null>(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [wallets, hist] = await Promise.all([loadBTNG3Wallets(), loadBTNG3History()]);
      setSavedWallets(wallets);
      setHistory(hist);
    })();
  }, []);

  // Coin pulse animation
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  // PK auto-clear countdown
  useEffect(() => {
    if (!pkRevealed) return;
    setPkCountdown(60);
    pkTimerRef.current = setInterval(() => {
      setPkCountdown(prev => {
        if (prev <= 1) {
          setPkRevealed(false);
          if (pkTimerRef.current) clearInterval(pkTimerRef.current);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (pkTimerRef.current) clearInterval(pkTimerRef.current); };
  }, [pkRevealed]);

  // ── Generate wallet ────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setPkRevealed(false);
    setGenerated(null);

    // Start glow animation
    Animated.timing(glowAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();

    try {
      const account = await createBTNG3WalletAccount(selectedClientType, selectedNetwork);

      // Slide in result
      slideAnim.setValue(40);
      setGenerated(account);

      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]).start();

      // Auto-save
      await saveBTNG3Wallet(account);
      const histEntry: BTNG3HistoryEntry = {
        id: Date.now().toString(),
        address: account.address,
        clientTypeLabel: account.clientTypeLabel,
        networkLabel: account.networkLabel,
        createdAt: account.createdAt,
      };
      await appendBTNG3History(histEntry);

      const [wallets, hist] = await Promise.all([loadBTNG3Wallets(), loadBTNG3History()]);
      setSavedWallets(wallets);
      setHistory(hist);
    } catch (e: any) {
      showAlert('Generation Failed', e?.message ?? 'Could not generate BTNG3 wallet. Please try again.');
      Animated.timing(glowAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    } finally {
      setGenerating(false);
    }
  }, [selectedClientType, selectedNetwork, showAlert, glowAnim, slideAnim]);

  // ── Validate address ───────────────────────────────────────────────────────
  const handleValidate = useCallback(async () => {
    if (!validateInput.trim()) return;
    setValidating(true);
    setValidateResult(null);
    const result = await validateBTNG3Address(validateInput.trim());
    setValidateResult(result);
    setValidating(false);
  }, [validateInput]);

  // ── Delete wallet ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (address: string) => {
    await deleteBTNG3Wallet(address);
    const wallets = await loadBTNG3Wallets();
    setSavedWallets(wallets);
    setConfirmDeleteAddr(null);
    if (generated?.address === address) {
      setGenerated(null);
      setPkRevealed(false);
    }
    showAlert('Removed', 'Wallet removed from device. Funds are recoverable with the private key.');
  }, [generated, showAlert]);

  const cfg = CLIENT_TYPES.find(c => c.type === selectedClientType) ?? CLIENT_TYPES[0];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG3 Wallet</Text>
          <Text style={s.topSub}>Commercial · Genesis Style</Text>
        </View>
        <View style={s.topBadge}>
          <View style={s.topBadgeDot} />
          <Text style={s.topBadgeText}>BTNG3</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >

        {/* Coin Emblem */}
        <View style={s.coinSection}>
          <Animated.View style={[s.coinRing, { transform: [{ scale: pulseAnim }] }]}>
            <Animated.View style={[s.coinGlow, {
              opacity: glowAnim,
              backgroundColor: cfg.color,
              transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
            }]} />
            <Image
              source={require('@/assets/images/btng_coin_logo.jpg')}
              style={s.coinImg}
              contentFit="cover"
              transition={200}
            />
          </Animated.View>

          <View style={s.coinNameRow}>
            <View style={s.goldDiv} />
            <Text style={s.coinName}>BITUNCOIN GOLD · BTNG3</Text>
            <View style={s.goldDiv} />
          </View>
          <Text style={s.coinTagline}>Commercial-Grade Sovereign Wallet</Text>
          <View style={s.coinMetaRow}>
            {[
              { icon: 'security',          label: 'Base58Check',    color: Colors.primary },
              { icon: 'fingerprint',        label: 'secp256k1',      color: '#3B82F6'      },
              { icon: 'workspace-premium',  label: '35-char Addr',   color: '#22C55E'      },
            ].map(m => (
              <View key={m.label} style={s.coinMetaChip}>
                <MaterialIcons name={m.icon as any} size={11} color={m.color} />
                <Text style={[s.coinMetaText, { color: m.color }]}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Address Schema Info */}
        <View style={s.schemaCard}>
          <View style={s.cardHeader}>
            <MaterialIcons name="info-outline" size={15} color={Colors.primary} />
            <Text style={s.cardTitle}>BTNG3 Address Schema</Text>
            <View style={s.versionChip}><Text style={s.versionChipText}>v3.0</Text></View>
          </View>
          <View style={s.schemaGrid}>
            {[
              { label: 'Version Byte',  val: '0x31',         sub: 'Starts with "3"' },
              { label: 'Client Type',   val: '1 byte',        sub: '01 · 02 · 03'   },
              { label: 'Network Code',  val: '2 bytes',       sub: 'Big-endian'      },
              { label: 'Entropy',       val: '16 bytes',      sub: 'secp256k1 pub'   },
              { label: 'Checksum',      val: '5 bytes',       sub: 'SHA256²'         },
              { label: 'Total',         val: '25 bytes',      sub: '→ 35 chars B58'  },
            ].map(r => (
              <View key={r.label} style={s.schemaCell}>
                <Text style={s.schemaCellLabel}>{r.label}</Text>
                <Text style={s.schemaCellVal}>{r.val}</Text>
                <Text style={s.schemaCellSub}>{r.sub}</Text>
              </View>
            ))}
          </View>
          <View style={s.exampleAddr}>
            <Text style={s.exampleLabel}>Example</Text>
            <Text style={s.exampleText}>BTNG1BK2FCK7sQm9dA2pR8XyTnW4bZ6uK1</Text>
          </View>
        </View>

        {/* Client Type Selector */}
        <View style={s.section}>
          <View style={s.cardHeader}>
            <MaterialIcons name="badge" size={15} color={Colors.primary} />
            <Text style={s.cardTitle}>Account Type</Text>
          </View>
          <View style={s.clientTypeRow}>
            {CLIENT_TYPES.map(ct => {
              const active = selectedClientType === ct.type;
              return (
                <TouchableOpacity
                  key={ct.type}
                  style={[s.clientTypeCard, active && { borderColor: ct.color, backgroundColor: ct.color + '12' }]}
                  onPress={() => { setSelectedClientType(ct.type); setGenerated(null); setPkRevealed(false); }}
                  activeOpacity={0.8}
                >
                  <View style={[s.ctIconWrap, { backgroundColor: ct.color + '1A', borderColor: ct.color + (active ? 'AA' : '44') }]}>
                    <MaterialIcons name={ct.icon as any} size={20} color={ct.color} />
                  </View>
                  <Text style={[s.ctLabel, { color: active ? ct.color : Colors.textSecondary }]}>{ct.label}</Text>
                  <Text style={s.ctSub}>{ct.sub}</Text>
                  <View style={[s.ctTypeBadge, { backgroundColor: ct.color + '22', borderColor: ct.color + '44' }]}>
                    <Text style={[s.ctTypeBadgeText, { color: ct.color }]}>0x{ct.type.toString(16).padStart(2, '0').toUpperCase()}</Text>
                  </View>
                  {active && <View style={[s.ctActiveDot, { backgroundColor: ct.color }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Network Selector */}
        <View style={s.section}>
          <View style={s.cardHeader}>
            <MaterialIcons name="public" size={15} color={Colors.primary} />
            <Text style={s.cardTitle}>Network</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.networkRail}>
            {BTNG3_NETWORKS.map(net => {
              const active = selectedNetwork === net.code;
              return (
                <TouchableOpacity
                  key={net.code}
                  style={[s.networkChip, active && s.networkChipActive]}
                  onPress={() => { setSelectedNetwork(net.code); setGenerated(null); setPkRevealed(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={s.networkChipFlag}>{net.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.networkChipLabel, active && { color: Colors.bg }]}>{net.label}</Text>
                    <Text style={[s.networkChipChain, active && { color: Colors.bg, opacity: 0.75 }]}>{net.chain}</Text>
                  </View>
                  <View style={[s.networkCodeChip, active && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <Text style={[s.networkCodeText, active && { color: Colors.bg }]}>
                      0x{net.code.toString(16).padStart(4, '0').toUpperCase()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[s.generateBtn, { borderColor: cfg.color + '88', shadowColor: cfg.color }, generating && { opacity: 0.55 }]}
          onPress={handleGenerate}
          disabled={generating}
          activeOpacity={0.85}
        >
          {generating ? (
            <ActivityIndicator size="small" color={Colors.bg} />
          ) : (
            <MaterialIcons name="add-circle" size={22} color={Colors.bg} />
          )}
          <View>
            <Text style={s.generateBtnTitle}>{generating ? 'Generating BTNG3 Address…' : `Generate ${cfg.label} Wallet`}</Text>
            <Text style={s.generateBtnSub}>{generating ? 'SHA256² checksum · secp256k1 keypair' : '35-char · Base58Check · Checksummed'}</Text>
          </View>
        </TouchableOpacity>

        {/* Generated Result */}
        {generated ? (
          <Animated.View style={{ transform: [{ translateY: slideAnim }], opacity: slideAnim.interpolate({ inputRange: [0, 40], outputRange: [1, 0] }) }}>
            {/* Success Banner */}
            <View style={s.successBanner}>
              <View style={s.successIconWrap}>
                <MaterialIcons name="check-circle" size={22} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.successTitle}>BTNG3 Address Generated</Text>
                <Text style={s.successSub}>{generated.clientTypeLabel} · {generated.networkLabel} · {new Date(generated.createdAt).toLocaleTimeString()}</Text>
              </View>
              <View style={s.validBadge}>
                <MaterialIcons name="verified" size={12} color={Colors.success} />
                <Text style={s.validBadgeText}>Valid</Text>
              </View>
            </View>

            {/* QR Card */}
            <SafeSection fallback={null}>
              <AddressQRCard account={generated} />
            </SafeSection>

            {/* Address Details */}
            <View style={s.detailCard}>
              <View style={s.cardHeader}>
                <MaterialIcons name="info" size={15} color={Colors.primary} />
                <Text style={s.cardTitle}>Address Details</Text>
              </View>
              {[
                { label: 'Address',      val: generated.address,                                           mono: true,  color: cfg.color },
                { label: 'Type',         val: `${generated.clientTypeLabel} (0x${generated.clientType.toString(16).padStart(2,'0').toUpperCase()})`, mono: false, color: cfg.color },
                { label: 'Network',      val: `${generated.networkLabel} · 0x${generated.networkCode.toString(16).padStart(4,'0').toUpperCase()}`, mono: false, color: Colors.textPrimary },
                { label: 'Version',      val: '0x31 · BTNG3 Mainnet',                                     mono: true,  color: Colors.textMuted },
                { label: 'Algorithm',    val: 'secp256k1 → SHA256² → Base58Check',                         mono: false, color: Colors.textMuted },
                { label: 'Created',      val: new Date(generated.createdAt).toLocaleString(),              mono: false, color: Colors.textMuted },
              ].map(row => (
                <View key={row.label} style={s.detailRow}>
                  <Text style={s.detailLabel}>{row.label}</Text>
                  <TouchableOpacity
                    style={s.detailValWrap}
                    onPress={() => { ExpoClipboard.setStringAsync(row.val).catch(()=>{}); showAlert('Copied', `${row.label} copied.`); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.detailVal, { color: row.color }, row.mono && s.monoText]} numberOfLines={1}>
                      {row.val}
                    </Text>
                    <MaterialIcons name="copy-all" size={11} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Public Key */}
            <View style={s.keyCard}>
              <View style={s.cardHeader}>
                <MaterialIcons name="vpn-key" size={15} color={Colors.primary} />
                <Text style={s.cardTitle}>Public Key</Text>
                <View style={s.pubKeyBadge}><Text style={s.pubKeyBadgeText}>Safe to share</Text></View>
              </View>
              <TouchableOpacity
                style={s.keyBox}
                onPress={() => { ExpoClipboard.setStringAsync(generated.publicKey).catch(()=>{}); showAlert('Copied', 'Public key copied.'); }}
                activeOpacity={0.75}
              >
                <Text style={[s.keyText, { color: Colors.primary }]} numberOfLines={3} selectable>{generated.publicKey}</Text>
                <MaterialIcons name="copy-all" size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Private Key (danger zone) */}
            <View style={s.pkDangerCard}>
              <View style={s.cardHeader}>
                <MaterialIcons name="lock" size={15} color={Colors.error} />
                <Text style={[s.cardTitle, { color: Colors.error }]}>Private Key</Text>
                <View style={s.holdBadge}>
                  <MaterialIcons name="touch-app" size={10} color={Colors.warning} />
                  <Text style={s.holdBadgeText}>Hold to reveal</Text>
                </View>
              </View>

              {!pkRevealed ? (
                <>
                  <View style={s.pkWarningRow}>
                    <MaterialIcons name="warning" size={14} color={Colors.error} />
                    <Text style={s.pkWarningText}>
                      Anyone with this key has full control of this wallet. Store offline, never share, never screenshot.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.pkRevealBtn}
                    onLongPress={() => setPkRevealed(true)}
                    delayLongPress={700}
                    activeOpacity={0.75}
                  >
                    <MaterialIcons name="lock" size={16} color={Colors.error} />
                    <Text style={s.pkRevealBtnText}>Hold 0.7s to Reveal Private Key</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={s.pkRevealCard}>
                  <View style={s.pkCountdownRow}>
                    <View style={s.pkCountdownTrack}>
                      <View style={[s.pkCountdownBar, { width: `${(pkCountdown / 60) * 100}%` }]} />
                    </View>
                    <Text style={s.pkCountdownText}>Clears in {pkCountdown}s</Text>
                  </View>
                  <TouchableOpacity
                    style={s.pkBox}
                    onPress={() => {
                      ExpoClipboard.setStringAsync(generated.privateKey).catch(()=>{});
                      setPkCopied(true);
                      setTimeout(() => setPkCopied(false), 2500);
                      showAlert('Copied', 'Private key copied. Store in a secure password manager immediately.');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={s.pkHex} selectable numberOfLines={4}>{generated.privateKey}</Text>
                    <MaterialIcons name={pkCopied ? 'check-circle' : 'copy-all'} size={14} color={pkCopied ? Colors.success : Colors.error} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.pkHideBtn} onPress={() => setPkRevealed(false)} activeOpacity={0.8}>
                    <MaterialIcons name="visibility-off" size={13} color={Colors.textMuted} />
                    <Text style={s.pkHideBtnText}>Hide key</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Animated.View>
        ) : null}

        {/* Validator */}
        <View style={s.validatorCard}>
          <TouchableOpacity
            style={s.cardHeader}
            onPress={() => { setValidateMode(v => !v); setValidateResult(null); setValidateInput(''); }}
            activeOpacity={0.8}
          >
            <View style={s.valIconWrap}>
              <MaterialIcons name="verified" size={15} color={Colors.primary} />
            </View>
            <Text style={s.cardTitle}>Validate BTNG3 Address</Text>
            <MaterialIcons name={validateMode ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          {validateMode && (
            <View style={s.validatorBody}>
              <Text style={s.fieldLabel}>Paste any BTNG3 address (35 chars)</Text>
              <TextInput
                style={s.valInput}
                value={validateInput}
                onChangeText={v => { setValidateInput(v); setValidateResult(null); }}
                placeholder="3PCX1BK2FCK7sQm9dA2pR8XyTnW4bZ6uK1"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
              <View style={s.valLenRow}>
                <View style={[s.valLenChip, { backgroundColor: validateInput.length === 35 ? Colors.successBg : Colors.bgElevated, borderColor: validateInput.length === 35 ? Colors.success + '44' : Colors.border }]}>
                  <MaterialIcons name={validateInput.length === 35 ? 'check-circle' : 'radio-button-unchecked'} size={11} color={validateInput.length === 35 ? Colors.success : Colors.textMuted} />
                  <Text style={[s.valLenText, { color: validateInput.length === 35 ? Colors.success : Colors.textMuted }]}>{validateInput.length} / 35 chars</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[s.valBtn, (validating || !validateInput.trim()) && { opacity: 0.45 }]}
                onPress={handleValidate}
                disabled={validating || !validateInput.trim()}
                activeOpacity={0.8}
              >
                {validating ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="verified-user" size={15} color={Colors.bg} />}
                <Text style={s.valBtnText}>{validating ? 'Checking…' : 'Validate Address'}</Text>
              </TouchableOpacity>

              {validateResult ? (
                <View style={[s.valResultCard, {
                  backgroundColor: validateResult.valid ? Colors.successBg : Colors.errorBg,
                  borderColor:     validateResult.valid ? Colors.success + '55' : Colors.error + '55',
                }]}>
                  <View style={s.valResultHeader}>
                    <MaterialIcons
                      name={validateResult.valid ? 'check-circle' : 'cancel'}
                      size={20}
                      color={validateResult.valid ? Colors.success : Colors.error}
                    />
                    <Text style={[s.valResultTitle, { color: validateResult.valid ? Colors.success : Colors.error }]}>
                      {validateResult.valid ? 'VALID BTNG3 Address' : 'INVALID Address'}
                    </Text>
                  </View>
                  {validateResult.valid ? (
                    <View style={s.valResultDetails}>
                      {[
                        { label: 'Version',      val: `0x31 · BTNG3 Mainnet` },
                        { label: 'Client Type',  val: `${validateResult.clientTypeLabel} (0x${validateResult.clientType?.toString(16).padStart(2,'0').toUpperCase()})` },
                        { label: 'Network Code', val: `0x${validateResult.networkCode?.toString(16).padStart(4,'0').toUpperCase()}` },
                        { label: 'Checksum',     val: '✓ SHA256² verified' },
                      ].map(r => (
                        <View key={r.label} style={s.valDetailRow}>
                          <Text style={s.valDetailLabel}>{r.label}</Text>
                          <Text style={[s.valDetailVal, { color: Colors.success }]}>{r.val}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={[s.valResultReason, { color: Colors.error }]}>
                      {validateResult.reason ?? 'Unknown validation error'}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Saved Wallets */}
        {savedWallets.length > 0 && (
          <View style={s.savedCard}>
            <View style={s.cardHeader}>
              <MaterialIcons name="account-balance-wallet" size={15} color={Colors.primary} />
              <Text style={s.cardTitle}>Saved BTNG3 Wallets</Text>
              <View style={s.countBadge}>
                <Text style={s.countBadgeText}>{savedWallets.length}</Text>
              </View>
            </View>
            {savedWallets.map((w, idx) => {
              const wcfg = CLIENT_TYPES.find(c => c.type === w.clientType) ?? CLIENT_TYPES[0];
              return (
                <View key={w.address} style={[s.savedRow, idx < savedWallets.length - 1 && s.savedRowBorder]}>
                  <View style={[s.savedTypeIcon, { backgroundColor: wcfg.color + '1A', borderColor: wcfg.color + '44' }]}>
                    <MaterialIcons name={wcfg.icon as any} size={14} color={wcfg.color} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={s.savedAddrRow}>
                      <Text style={[s.savedAddr, { color: wcfg.color }]} numberOfLines={1}>
                        {w.address}
                      </Text>
                    </View>
                    <View style={s.savedMetaRow}>
                      <AddrBadge label={w.clientTypeLabel} color={wcfg.color} />
                      <Text style={s.savedMeta}>{w.networkLabel}</Text>
                      <Text style={s.savedMeta}>·</Text>
                      <Text style={s.savedMeta}>{new Date(w.createdAt).toLocaleDateString()}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={s.savedCopyBtn}
                    onPress={() => { ExpoClipboard.setStringAsync(w.address).catch(()=>{}); showAlert('Copied', 'Address copied.'); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="copy-all" size={14} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.savedDeleteBtn}
                    onPress={() => setConfirmDeleteAddr(w.address)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={s.historyCard}>
            <View style={s.cardHeader}>
              <MaterialIcons name="history" size={15} color={Colors.primary} />
              <Text style={s.cardTitle}>Generation History</Text>
              <TouchableOpacity
                style={s.clearHistBtn}
                onPress={async () => {
                  await clearBTNG3History();
                  setHistory([]);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="delete-sweep" size={13} color={Colors.error} />
                <Text style={s.clearHistText}>Clear</Text>
              </TouchableOpacity>
            </View>
            {history.slice(0, 10).map((h, idx) => (
              <View key={h.id} style={[s.histRow, idx < Math.min(history.length, 10) - 1 && s.histRowBorder]}>
                <View style={s.histIndexChip}>
                  <Text style={s.histIndexText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.histAddr} numberOfLines={1}>{h.address}</Text>
                  <View style={s.histMeta}>
                    <Text style={s.histMetaText}>{h.clientTypeLabel}</Text>
                    <Text style={s.histMetaText}>·</Text>
                    <Text style={s.histMetaText}>{h.networkLabel}</Text>
                    <Text style={s.histMetaText}>·</Text>
                    <Text style={s.histMetaText}>{new Date(h.createdAt).toLocaleString()}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => { ExpoClipboard.setStringAsync(h.address).catch(()=>{}); showAlert('Copied', 'Address copied.'); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="copy-all" size={13} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
            {history.length > 10 && (
              <Text style={s.histMoreText}>+ {history.length - 10} more entries</Text>
            )}
          </View>
        )}

        {/* Sovereign note */}
        <View style={s.sovereignNote}>
          <MaterialIcons name="verified-user" size={14} color={Colors.success} />
          <Text style={s.sovereignNoteText}>
            BTNG3 addresses are cryptographically checksummed. All keys are generated locally on-device via secp256k1 — no server contact required.
          </Text>
        </View>

      </ScrollView>

      {/* Delete Confirm Modal */}
      <Modal visible={!!confirmDeleteAddr} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalIconWrap}>
              <MaterialIcons name="delete-forever" size={32} color={Colors.error} />
            </View>
            <Text style={s.modalTitle}>Remove Wallet?</Text>
            <Text style={s.modalBody}>
              This removes the wallet from this device. Your funds remain safe — restore with the private key.
            </Text>
            <Text style={[s.modalAddr, { color: Colors.error }]} numberOfLines={1}>
              {confirmDeleteAddr}
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setConfirmDeleteAddr(null)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalDeleteBtn} onPress={() => confirmDeleteAddr && handleDelete(confirmDeleteAddr)}>
                <Text style={s.modalDeleteText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  // Top Bar
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter: { flex: 1, alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  topBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '55' },
  topBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  topBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },

  scroll: { paddingHorizontal: Spacing.xl, gap: Spacing.lg },

  // Coin emblem
  coinSection: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  coinRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 2.5, borderColor: Colors.primary, overflow: 'hidden', position: 'relative', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  coinGlow: { position: 'absolute', width: '100%', height: '100%', borderRadius: 50 },
  coinImg: { width: '100%', height: '100%' },
  coinNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  goldDiv: { width: 28, height: 1, backgroundColor: Colors.primary, opacity: 0.5 },
  coinName: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 2.5, includeFontPadding: false },
  coinTagline: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  coinMetaRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  coinMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  coinMetaText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Schema card
  schemaCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  versionChip: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  versionChipText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  schemaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  schemaCell: { width: '30.5%', flex: 1, minWidth: '30%', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  schemaCellLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  schemaCellVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  schemaCellSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  exampleAddr: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '33', gap: 4 },
  exampleLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  exampleText: { fontSize: 11, color: Colors.primary, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  // Section wrapper
  section: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },

  // Client type
  clientTypeRow: { flexDirection: 'row', gap: Spacing.sm },
  clientTypeCard: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.border, position: 'relative' },
  ctIconWrap: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ctLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  ctSub: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  ctTypeBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  ctTypeBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  ctActiveDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 3.5 },

  // Network
  networkRail: { gap: Spacing.sm, paddingVertical: 2 },
  networkChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1.5, borderColor: Colors.border, minWidth: 200 },
  networkChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  networkChipFlag: { fontSize: 18 },
  networkChipLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  networkChipChain: { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  networkCodeChip: { backgroundColor: Colors.bgCard, borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  networkCodeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  // Generate button
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, paddingHorizontal: Spacing.xl, borderWidth: 2, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 },
  generateBtnTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  generateBtnSub: { fontSize: 10, color: Colors.bg, opacity: 0.75, includeFontPadding: false, marginTop: 2 },

  // Success banner
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.successBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.success + '55', marginBottom: Spacing.md },
  successIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.success + '22', borderWidth: 1, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  successTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  successSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  validBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  validBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },

  // Detail card
  detailCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm - 2, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm },
  detailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, width: 72, flexShrink: 0, includeFontPadding: false },
  detailValWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailVal: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  monoText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 },

  // Key cards
  keyCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '33', gap: Spacing.md },
  keyBox: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  keyText: { flex: 1, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  pubKeyBadge: { backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '44' },
  pubKeyBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  pkDangerCard: { backgroundColor: Colors.errorBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.error + '44', gap: Spacing.md },
  pkWarningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.error + '1A', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '33' },
  pkWarningText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, lineHeight: 17, includeFontPadding: false },
  holdBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '55' },
  holdBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  pkRevealBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bg, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderWidth: 1.5, borderColor: Colors.error + '66', alignSelf: 'flex-start' },
  pkRevealBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.error, includeFontPadding: false },
  pkRevealCard: { gap: Spacing.sm },
  pkCountdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pkCountdownTrack: { flex: 1, height: 4, backgroundColor: Colors.error + '22', borderRadius: 2, overflow: 'hidden' },
  pkCountdownBar: { height: 4, backgroundColor: Colors.error, opacity: 0.7, borderRadius: 2 },
  pkCountdownText: { fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  pkBox: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  pkHex: { flex: 1, fontSize: 10, color: Colors.error, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.3, lineHeight: 16, includeFontPadding: false },
  pkHideBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6 },
  pkHideBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Validator
  validatorCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  valIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  validatorBody: { gap: Spacing.md },
  fieldLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  valInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  valLenRow: { flexDirection: 'row', gap: Spacing.sm },
  valLenChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  valLenText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  valBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  valBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  valResultCard: { borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, gap: Spacing.md },
  valResultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valResultTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  valResultDetails: { gap: 6 },
  valDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.success + '22' },
  valDetailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  valDetailVal: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  valResultReason: { fontSize: FontSize.sm, lineHeight: 18, includeFontPadding: false },

  // Saved wallets
  savedCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  countBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  countBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  savedRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  savedTypeIcon: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  savedAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  savedAddr: { flex: 1, fontSize: 11, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  savedMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  savedMeta: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  savedCopyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  savedDeleteBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.errorBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.error + '33' },

  // History
  historyCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  clearHistBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.errorBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.error + '44' },
  clearHistText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  histRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  histIndexChip: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  histIndexText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  histAddr: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  histMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  histMetaText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  histMoreText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Sovereign note
  sovereignNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.successBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.success + '33' },
  sovereignNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 17, includeFontPadding: false },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.9)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  modalSheet: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', gap: Spacing.md, borderWidth: 1.5, borderColor: Colors.error + '55', alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.errorBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.error + '44' },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  modalAddr: { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center', includeFontPadding: false },
  modalActions: { flexDirection: 'row', gap: Spacing.md, width: '100%' },
  modalCancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  modalCancelText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  modalDeleteBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.error, alignItems: 'center' },
  modalDeleteText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
});
