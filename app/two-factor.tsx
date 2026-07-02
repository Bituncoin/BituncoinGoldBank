
// BTNG Gold — Two-Factor Authentication Screen
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Platform,
} from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import {
  generateTotpSecret,
  buildOtpAuthUri,
  verifyTotp,
  formatSecret,
  fetchTwoFA,
  upsertTwoFASecret,
  enableTwoFA,
  disableTwoFA,
  TwoFARecord,
} from '@/services/twoFactorService';

type SetupStep = 'loading' | 'status' | 'setup_scan' | 'setup_verify' | 'enabled';

export default function TwoFactorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [step, setStep] = useState<SetupStep>('loading');
  const [record, setRecord] = useState<TwoFARecord | null>(null);
  const [pendingSecret, setPendingSecret] = useState('');
  const [otpUri, setOtpUri] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [saving, setSaving] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [showDisableInput, setShowDisableInput] = useState(false);

  // ── Load existing 2FA record ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await fetchTwoFA(user.id);
    setRecord(data);
    setStep(data?.enabled ? 'enabled' : 'status');
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Start setup: generate secret ──────────────────────────────────────────
  const handleStartSetup = async () => {
    if (!user?.email || !user?.id) return;
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(secret, user.email);
    setSaving(true);
    const { error } = await upsertTwoFASecret(user.id, secret);
    setSaving(false);
    if (error) { showAlert('Error', error); return; }
    setPendingSecret(secret);
    setOtpUri(uri);
    setVerifyCode('');
    setVerifyError('');
    setStep('setup_scan');
  };

  // ── Copy secret key ───────────────────────────────────────────────────────
  const handleCopySecret = () => {
    ExpoClipboard.setStringAsync(pendingSecret).catch(()=>{});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ── Verify & enable ───────────────────────────────────────────────────────
  const handleVerifyEnable = async () => {
    if (!user?.id) return;
    const trimmed = verifyCode.replace(/\s/g, '');
    if (trimmed.length !== 6 || !/^\d+$/.test(trimmed)) {
      setVerifyError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (!verifyTotp(pendingSecret, trimmed)) {
      setVerifyError('Incorrect code. Make sure your device time is correct and try again.');
      return;
    }
    setSaving(true);
    const { error } = await enableTwoFA(user.id);
    setSaving(false);
    if (error) { showAlert('Error', error); return; }
    await load();
    showAlert('2FA Enabled', 'Two-factor authentication has been successfully activated on your BTNG account.');
  };

  // ── Disable 2FA ───────────────────────────────────────────────────────────
  const handleDisable = async () => {
    if (!user?.id || !record) return;
    const trimmed = disableCode.replace(/\s/g, '');
    if (trimmed.length !== 6 || !/^\d+$/.test(trimmed)) {
      showAlert('Invalid Code', 'Enter the 6-digit code from your authenticator app to confirm.');
      return;
    }
    if (!verifyTotp(record.secret, trimmed)) {
      showAlert('Incorrect Code', 'The code you entered is wrong. Make sure your device time is correct.');
      return;
    }
    setSaving(true);
    const { error } = await disableTwoFA(user.id);
    setSaving(false);
    if (error) { showAlert('Error', error); return; }
    setDisableCode('');
    setShowDisableInput(false);
    await load();
    showAlert('2FA Disabled', 'Two-factor authentication has been removed from your account.');
  };

  // ── Confirm disable intent ────────────────────────────────────────────────
  const handleDisableIntent = () => {
    showAlert(
      'Disable 2FA',
      'Removing 2FA will reduce your account security. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => setShowDisableInput(true) },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.title}>2FA Security</Text>
          <View style={[styles.statusPill, record?.enabled ? styles.statusOn : styles.statusOff]}>
            <View style={[styles.statusDot, { backgroundColor: record?.enabled ? Colors.success : Colors.textMuted }]} />
            <Text style={[styles.statusPillText, { color: record?.enabled ? Colors.success : Colors.textMuted }]}>
              {record?.enabled ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ── Loading ── */}
        {step === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading security settings...</Text>
          </View>
        )}

        {/* ── Status / Intro (not yet set up) ── */}
        {step === 'status' && (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIconWrap}>
                <MaterialIcons name="shield" size={40} color={Colors.primary} />
              </View>
              <Text style={styles.heroTitle}>Protect Your Account</Text>
              <Text style={styles.heroSub}>
                Two-factor authentication adds an extra layer of security. Every sign-in requires both your password and a one-time code from your authenticator app.
              </Text>
            </View>

            <View style={styles.featureList}>
              {[
                { icon: 'smartphone', text: 'Works with Google Authenticator, Authy, and any TOTP app' },
                { icon: 'lock', text: 'Protects against password theft and phishing' },
                { icon: 'flash-on', text: 'Fast — just enter the 6-digit code at login' },
                { icon: 'account-balance', text: 'Required for high-value withdrawals and P2P trades' },
              ].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={styles.featureIconWrap}>
                    <MaterialIcons name={f.icon as any} size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
              onPress={handleStartSetup}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator size="small" color={Colors.bg} />
                : <>
                  <MaterialIcons name="qr-code" size={20} color={Colors.bg} />
                  <Text style={styles.primaryBtnText}>Set Up Two-Factor Auth</Text>
                </>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 1: Scan QR ── */}
        {step === 'setup_scan' && (
          <>
            <StepHeader step={1} total={2} title="Scan QR Code" />

            <View style={styles.instructCard}>
              <Text style={styles.instructTitle}>Open your authenticator app</Text>
              <Text style={styles.instructText}>
                Open Google Authenticator, Authy, or any TOTP app and scan the QR code below. Then tap Next to verify.
              </Text>
            </View>

            {/* QR Code */}
            <View style={styles.qrCard}>
              <View style={styles.qrContainer}>
                {otpUri ? (
                  <QRCode
                    value={otpUri}
                    size={200}
                    backgroundColor="#FFFFFF"
                    color="#000000"
                    quietZone={12}
                  />
                ) : (
                  <ActivityIndicator color={Colors.primary} size="large" />
                )}
              </View>
              <View style={styles.qrBadge}>
                <MaterialIcons name="verified" size={14} color={Colors.primary} />
                <Text style={styles.qrBadgeText}>BTNG Gold · SHA-1 · 30s</Text>
              </View>
            </View>

            {/* Manual Entry */}
            <View style={styles.manualCard}>
              <View style={styles.manualHeader}>
                <MaterialIcons name="keyboard" size={16} color={Colors.textSecondary} />
                <Text style={styles.manualTitle}>Manual Entry Key</Text>
              </View>
              <Text style={styles.manualSub}>
                If you cannot scan the QR code, enter this key manually in your authenticator app.
              </Text>
              <TouchableOpacity style={styles.secretBox} onPress={handleCopySecret} activeOpacity={0.8}>
                <Text style={styles.secretText} selectable>
                  {formatSecret(pendingSecret)}
                </Text>
                <View style={[styles.copyBtn, codeCopied && styles.copyBtnDone]}>
                  <MaterialIcons
                    name={codeCopied ? 'check' : 'content-copy'}
                    size={15}
                    color={codeCopied ? Colors.success : Colors.primary}
                  />
                  <Text style={[styles.copyBtnText, codeCopied && { color: Colors.success }]}>
                    {codeCopied ? 'Copied!' : 'Copy'}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.manualMeta}>
                {[
                  { label: 'Account', value: user?.email ?? '' },
                  { label: 'Type', value: 'Time-based (TOTP)' },
                  { label: 'Algorithm', value: 'SHA-1' },
                  { label: 'Digits', value: '6' },
                  { label: 'Period', value: '30 seconds' },
                ].map(m => (
                  <View key={m.label} style={styles.metaRow}>
                    <Text style={styles.metaLabel}>{m.label}</Text>
                    <Text style={styles.metaValue} numberOfLines={1}>{m.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => { setVerifyCode(''); setVerifyError(''); setStep('setup_verify'); }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Next: Verify Code</Text>
              <MaterialIcons name="arrow-forward" size={18} color={Colors.bg} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.ghostBtn} onPress={() => setStep('status')}>
              <Text style={styles.ghostBtnText}>Cancel Setup</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 2: Verify ── */}
        {step === 'setup_verify' && (
          <>
            <StepHeader step={2} total={2} title="Verify & Activate" />

            <View style={styles.instructCard}>
              <Text style={styles.instructTitle}>Enter the 6-digit code</Text>
              <Text style={styles.instructText}>
                Open your authenticator app and enter the current 6-digit code for your BTNG Gold account.
              </Text>
            </View>

            <View style={styles.verifyCard}>
              <View style={styles.codeIconRow}>
                <View style={styles.codeIcon}>
                  <MaterialIcons name="pin" size={24} color={Colors.primary} />
                </View>
              </View>
              <TextInput
                style={[styles.codeInput, verifyError ? styles.codeInputError : null]}
                value={verifyCode}
                onChangeText={v => { setVerifyCode(v.replace(/\D/g, '').slice(0, 6)); setVerifyError(''); }}
                placeholder="000000"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                autoFocus
              />
              {verifyError ? (
                <View style={styles.errorRow}>
                  <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                  <Text style={styles.errorText}>{verifyError}</Text>
                </View>
              ) : (
                <Text style={styles.codeHint}>Code refreshes every 30 seconds</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (verifyCode.length !== 6 || saving) && { opacity: 0.5 }]}
              onPress={handleVerifyEnable}
              disabled={verifyCode.length !== 6 || saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator size="small" color={Colors.bg} />
                : <>
                  <MaterialIcons name="verified-user" size={18} color={Colors.bg} />
                  <Text style={styles.primaryBtnText}>Activate 2FA</Text>
                </>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.ghostBtn} onPress={() => setStep('setup_scan')}>
              <MaterialIcons name="arrow-back" size={16} color={Colors.textMuted} />
              <Text style={styles.ghostBtnText}>Back to QR Code</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Enabled State ── */}
        {step === 'enabled' && (
          <>
            <View style={styles.enabledHero}>
              <View style={styles.enabledIconRing}>
                <MaterialIcons name="verified-user" size={44} color={Colors.success} />
              </View>
              <Text style={styles.enabledTitle}>2FA is Active</Text>
              <Text style={styles.enabledSub}>
                Your account is protected. You will be prompted for a verification code on every login.
              </Text>
              {record?.verified_at && (
                <Text style={styles.enabledDate}>
                  Enabled on {new Date(record.verified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              )}
            </View>

            <View style={styles.infoGrid}>
              {[
                { icon: 'schedule', label: 'Type', value: 'Time-based (TOTP)' },
                { icon: 'lock', label: 'Algorithm', value: 'SHA-1 / 6 digits' },
                { icon: 'account-circle', label: 'Account', value: user?.email ?? '' },
              ].map(info => (
                <View key={info.label} style={styles.infoCell}>
                  <MaterialIcons name={info.icon as any} size={20} color={Colors.primary} />
                  <Text style={styles.infoCellLabel}>{info.label}</Text>
                  <Text style={styles.infoCellValue} numberOfLines={1}>{info.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>Keep your account safe</Text>
              {[
                'Save a backup of your secret key in a secure place',
                'If you lose access to your authenticator, contact BTNG support',
                'Do not share your QR code or secret key with anyone',
              ].map((t, i) => (
                <View key={i} style={styles.tipRow}>
                  <View style={styles.tipDot} />
                  <Text style={styles.tipText}>{t}</Text>
                </View>
              ))}
            </View>

            {/* Disable Section */}
            {!showDisableInput ? (
              <TouchableOpacity style={styles.dangerBtn} onPress={handleDisableIntent} activeOpacity={0.8}>
                <MaterialIcons name="no-encryption" size={18} color={Colors.error} />
                <Text style={styles.dangerBtnText}>Disable Two-Factor Auth</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.disableCard}>
                <View style={styles.disableWarning}>
                  <MaterialIcons name="warning" size={16} color={Colors.warning} />
                  <Text style={styles.disableWarningText}>Enter your current authenticator code to confirm</Text>
                </View>
                <TextInput
                  style={styles.codeInput}
                  value={disableCode}
                  onChangeText={v => setDisableCode(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  textAlign="center"
                  autoFocus
                />
                <View style={styles.disableActions}>
                  <TouchableOpacity
                    style={styles.disableCancelBtn}
                    onPress={() => { setShowDisableInput(false); setDisableCode(''); }}
                  >
                    <Text style={styles.disableCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.disableConfirmBtn, (disableCode.length !== 6 || saving) && { opacity: 0.5 }]}
                    onPress={handleDisable}
                    disabled={disableCode.length !== 6 || saving}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color={Colors.bg} />
                      : <Text style={styles.disableConfirmText}>Confirm Disable</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Step Header Component ────────────────────────────────────────────────────
function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepPills}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[styles.stepPill, i + 1 <= step ? styles.stepPillActive : styles.stepPillInactive]}
          />
        ))}
      </View>
      <Text style={styles.stepLabel}>Step {step} of {total}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  topBarCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3,
    borderWidth: 1,
  },
  statusOn: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  statusOff: { backgroundColor: Colors.bgCard, borderColor: Colors.border },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: FontWeight.semibold, includeFontPadding: false },

  content: { paddingHorizontal: Spacing.xl, paddingBottom: 24, gap: Spacing.xl },

  center: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, includeFontPadding: false },

  // Hero Card
  heroCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md,
  },
  heroIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },

  // Feature List
  featureList: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md,
  },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  featureIconWrap: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryGlow,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  featureText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2, paddingHorizontal: Spacing.xl, minHeight: 52,
  },
  primaryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: Spacing.md,
  },
  ghostBtnText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  // Step Header
  stepHeader: { alignItems: 'center', gap: 6 },
  stepPills: { flexDirection: 'row', gap: 6 },
  stepPill: { height: 4, width: 32, borderRadius: 2 },
  stepPillActive: { backgroundColor: Colors.primary },
  stepPillInactive: { backgroundColor: Colors.bgElevated },
  stepLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  stepTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  // Instruction Card
  instructCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: 6,
  },
  instructTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  instructText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },

  // QR Card
  qrCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.lg,
  },
  qrContainer: {
    backgroundColor: '#FFFFFF', borderRadius: Radius.lg, padding: 16,
    shadowColor: Colors.primary, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  qrBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  qrBadgeText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Manual Entry Card
  manualCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md,
  },
  manualHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  manualTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  manualSub: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  secretBox: {
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primary + '44',
    padding: Spacing.md, gap: Spacing.sm, alignItems: 'center',
  },
  secretText: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary,
    letterSpacing: 3, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  copyBtnDone: { borderColor: Colors.success + '44', backgroundColor: Colors.successBg },
  copyBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  manualMeta: {
    backgroundColor: Colors.bg, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 5,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  metaValue: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, maxWidth: 200, textAlign: 'right', includeFontPadding: false },

  // Verify Card
  verifyCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.lg,
  },
  codeIconRow: { alignItems: 'center' },
  codeIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  codeInput: {
    width: '100%', backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg, borderWidth: 2, borderColor: Colors.primary + '66',
    paddingVertical: Spacing.lg, fontSize: 32, fontWeight: FontWeight.heavy,
    color: Colors.textPrimary, letterSpacing: 12, includeFontPadding: false,
  },
  codeInputError: { borderColor: Colors.error },
  codeHint: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  errorText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, lineHeight: 16, includeFontPadding: false },

  // Enabled State
  enabledHero: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.success + '44',
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.md,
  },
  enabledIconRing: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.successBg, borderWidth: 3, borderColor: Colors.success + '66',
    alignItems: 'center', justifyContent: 'center',
  },
  enabledTitle: { fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  enabledSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  enabledDate: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  infoGrid: { flexDirection: 'row', gap: Spacing.sm },
  infoCell: {
    flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
    alignItems: 'center', gap: 5,
  },
  infoCellLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  infoCellValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },

  tipsCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md,
  },
  tipsTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 7, flexShrink: 0 },
  tipText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },

  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.errorBg, borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2, borderWidth: 1, borderColor: Colors.error + '44',
  },
  dangerBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },

  disableCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.error + '44',
    padding: Spacing.lg, gap: Spacing.md,
  },
  disableWarning: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  disableWarningText: { flex: 1, fontSize: FontSize.sm, color: Colors.warning, lineHeight: 18, includeFontPadding: false },
  disableActions: { flexDirection: 'row', gap: Spacing.md },
  disableCancelBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  disableCancelText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  disableConfirmBtn: {
    flex: 2, paddingVertical: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: Colors.error, alignItems: 'center',
  },
  disableConfirmText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
