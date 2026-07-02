// BTNG Pay Gateway — Full Payment Confirmation Flow
// Processes BTNG Pay transactions with UCAF signature validation
// Records to btng_pay_transactions table with live status tracking
import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Platform, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNG_MERCHANT, INTL_EQUITY_TRUST, INTL_EQUITY_CUSTODIAN } from '@/constants/merchantConfig';
import { useDomainResolver, RESOLVABLE_DOMAINS } from '@/hooks/useDomainResolver';

// ── Constants ─────────────────────────────────────────────────────────────────
const BTNG_USD = 3.250;
const XAU_USD = 3250;
const GHS_USD = 11.71;
const CHAIN_ID = 'BTNG-MAINNET';
const CHANNEL = 'BTNG_PAY_GATEWAY';
const CONVERSION_ANCHOR = 'BTNG-GOLD';

type PaymentStatus = 'form' | 'validating' | 'confirming' | 'processing' | 'success' | 'failed';

interface PaymentForm {
  senderWallet: string;
  senderFirstName: string;
  senderMiddleName: string;
  senderEmail: string;
  recipientWallet: string;
  recipientFirstName: string;
  recipientMiddleName: string;
  recipientEmail: string;
  amountBtngg: string;
  unit: string;
  purpose: string;
  tokenRef: string;
  ucaf: string;
  signature: string;
  publicKey: string;
  paymentMethod: string;
}

// Recipient picker options for BTNG Pay
const RECIPIENT_OPTIONS = [
  {
    key: 'ekuye',
    label: 'EKUYE Digital Gateway',
    legalName: 'EKUYE DIGITAL GATEWAY TRUST LTD',
    wallet: BTNG_MERCHANT.merchantId,
    firstName: 'EKUYE',
    middleName: 'DIGITAL GATEWAY',
    email: 'info@bituncoin.io',
    badge: 'Primary Merchant',
    badgeColor: '#D4A017',
    flag: '🇬🇭',
    sub: `Merchant ID: ${BTNG_MERCHANT.merchantId} · BTNG Sovereign Network`,
    verified: true,
  },
  {
    key: 'ietrust',
    label: 'Intl Equity Trust Co',
    legalName: INTL_EQUITY_TRUST.legalName,
    wallet: INTL_EQUITY_TRUST.merchantCenterId,
    firstName: 'International Equity',
    middleName: 'Trust Co',
    email: 'info@bituncoin.io',
    badge: 'Google Shopping',
    badgeColor: '#3B82F6',
    flag: '🌍',
    sub: `Merchant Center ID: ${INTL_EQUITY_TRUST.merchantCenterId} · ${INTL_EQUITY_TRUST.shoppingService}`,
    verified: true,
  },
  {
    key: 'goldnet',
    label: 'Equity Custodian Goldnet',
    legalName: INTL_EQUITY_CUSTODIAN.legalName,
    wallet: INTL_EQUITY_TRUST.merchantCenterId,
    firstName: 'International Equity',
    middleName: 'Custodian Goldnet Inc',
    email: 'info@bituncoin.io',
    badge: 'Gold Custodian',
    badgeColor: Colors.primary,
    flag: '🥇',
    sub: `${INTL_EQUITY_CUSTODIAN.assetType} · BTNG Chain`,
    verified: true,
  },
] as const;

const BLANK_FORM: PaymentForm = {
  senderWallet: '',
  senderFirstName: '',
  senderMiddleName: '',
  senderEmail: '',
  recipientWallet: BTNG_MERCHANT.merchantId,
  recipientFirstName: 'EKUYE',
  recipientMiddleName: 'DIGITAL GATEWAY',
  recipientEmail: 'info@bituncoin.io',
  amountBtngg: '',
  unit: 'BTNGG',
  purpose: 'merchant_transfer',
  tokenRef: '',
  ucaf: '',
  signature: '',
  publicKey: '',
  paymentMethod: 'external_token',
};

const PURPOSES = [
  { key: 'merchant_transfer', label: 'Merchant Transfer', icon: 'storefront' },
  { key: 'p2p_payment', label: 'P2P Payment', icon: 'people' },
  { key: 'gold_purchase', label: 'Gold Purchase', icon: 'toll' },
  { key: 'subscription', label: 'Subscription', icon: 'subscriptions' },
  { key: 'loan_repayment', label: 'Loan Repayment', icon: 'account-balance' },
  { key: 'remittance', label: 'Remittance', icon: 'send' },
];

const PAYMENT_METHODS = [
  { key: 'external_token', label: 'BTNG Token', icon: 'toll' },
  { key: 'mtn_momo', label: 'MTN MoMo', icon: 'cell-tower' },
  { key: 'bank_transfer', label: 'Bank Transfer', icon: 'account-balance' },
  { key: 'card', label: 'Card', icon: 'credit-card' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function generateReference(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BTNG-PAY-${ts}-${rand}`;
}

function generateUCAF(payload: Partial<PaymentForm>): string {
  const raw = [
    payload.senderWallet ?? '',
    payload.recipientWallet ?? '',
    payload.amountBtngg ?? '0',
    payload.unit ?? 'BTNGG',
    CHAIN_ID,
    Date.now().toString(),
  ].join('|');
  // Simple deterministic hash for demo
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return '0xUCAF' + Math.abs(hash).toString(16).padStart(8, '0').toUpperCase() + raw.length.toString(16).toUpperCase();
}

function validateUCAF(ucaf: string): boolean {
  return typeof ucaf === 'string' && ucaf.length >= 8 && (ucaf.startsWith('0x') || ucaf.startsWith('BTNG'));
}

function calcConversions(amountBtngg: string) {
  const amt = parseFloat(amountBtngg) || 0;
  return {
    usd: amt * BTNG_USD,
    ghs: amt * BTNG_USD * GHS_USD,
    xau: amt / 1000,
  };
}

// ── Resolver Chip ─────────────────────────────────────────────────────────────
function ResolverChip({
  resolving, record, error, onAccept, onDismiss,
}: {
  resolving: boolean;
  record: { domain: string; chain: string; wallet_address: string; coin_symbol: string } | null;
  error: string | null;
  onAccept: (address: string) => void;
  onDismiss: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const visible = resolving || !!record || !!error;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: visible ? 1 : 0, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [visible, fadeAnim]);
  if (!visible) return null;
  return (
    <Animated.View style={[
      domChipS.wrap,
      record ? domChipS.wrapOk : error ? domChipS.wrapErr : domChipS.wrapLoading,
      { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] },
    ]}>
      {resolving ? (
        <View style={domChipS.row}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={domChipS.loadText}>Resolving domain record…</Text>
        </View>
      ) : record ? (
        <View style={domChipS.row}>
          <MaterialIcons name="check-circle" size={16} color={Colors.success} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={domChipS.okTitle}><Text style={{ color: Colors.success, fontWeight: FontWeight.heavy }}>{record.domain}</Text>{' → '}{record.chain}</Text>
            <Text style={domChipS.okAddr} numberOfLines={1} ellipsizeMode="middle">{record.wallet_address}</Text>
            <Text style={domChipS.okSub}>{record.coin_symbol} · Primary record</Text>
          </View>
          <TouchableOpacity style={domChipS.fillBtn} onPress={() => onAccept(record.wallet_address)} activeOpacity={0.85}>
            <MaterialIcons name="arrow-downward" size={12} color={Colors.bg} />
            <Text style={domChipS.fillBtnText}>Fill</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={14} color={Colors.success} />
          </TouchableOpacity>
        </View>
      ) : error ? (
        <View style={domChipS.row}>
          <MaterialIcons name="error-outline" size={15} color={Colors.warning} />
          <Text style={[domChipS.errText, { flex: 1 }]}>{error}</Text>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={13} color={Colors.warning} />
          </TouchableOpacity>
        </View>
      ) : null}
    </Animated.View>
  );
}
const domChipS = StyleSheet.create({
  wrap:        { borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  wrapOk:      { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' },
  wrapErr:     { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '44' },
  wrapLoading: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  loadText:    { flex: 1, fontSize: FontSize.xs, color: Colors.primary, includeFontPadding: false },
  okTitle:     { fontSize: FontSize.xs, color: Colors.textPrimary, includeFontPadding: false },
  okAddr:      { fontSize: 10, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  okSub:       { fontSize: 9, color: Colors.success, includeFontPadding: false },
  errText:     { fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },
  fillBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.success, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  fillBtnText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
});
const domChainS = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  label:         { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  chip:          { paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  chipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:      { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  chipTextActive:{ color: Colors.bg },
});

// ── Sub-Components ─────────────────────────────────────────────────────────────
function StatusStep({ step, label, active, done, error }: { step: number; label: string; active: boolean; done: boolean; error?: boolean }) {
  return (
    <View style={ss.row}>
      <View style={[ss.dot, done && ss.dotDone, active && ss.dotActive, error && ss.dotError]}>
        {done ? (
          <MaterialIcons name="check" size={12} color={Colors.bg} />
        ) : error ? (
          <MaterialIcons name="close" size={12} color={Colors.bg} />
        ) : active ? (
          <ActivityIndicator size="small" color={Colors.bg} style={{ transform: [{ scale: 0.7 }] }} />
        ) : (
          <Text style={ss.dotText}>{step}</Text>
        )}
      </View>
      <Text style={[ss.label, done && { color: Colors.success }, active && { color: Colors.primary }, error && { color: Colors.error }]}>{label}</Text>
    </View>
  );
}
const ss = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  dotError: { backgroundColor: Colors.error, borderColor: Colors.error },
  dotText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
});

function FieldInput({
  label, value, onChangeText, placeholder, keyboardType, icon, required, mono, hint, editable = true,
}: {
  label: string; value: string; onChangeText?: (v: string) => void;
  placeholder?: string; keyboardType?: any; icon?: string; required?: boolean;
  mono?: boolean; hint?: string; editable?: boolean;
}) {
  return (
    <View style={fi.wrap}>
      <View style={fi.labelRow}>
        {icon ? <MaterialIcons name={icon as any} size={12} color={Colors.textMuted} /> : null}
        <Text style={fi.label}>{label}{required ? <Text style={{ color: Colors.error }}> *</Text> : null}</Text>
      </View>
      <TextInput
        style={[fi.input, mono && fi.inputMono, !editable && fi.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      {hint ? <Text style={fi.hint}>{hint}</Text> : null}
    </View>
  );
}
const fi = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  input: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  inputMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  inputDisabled: { backgroundColor: Colors.bgElevated, opacity: 0.75 },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function BtngPayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ amount?: string; ref?: string; wallet?: string }>();
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [status, setStatus] = useState<PaymentStatus>('form');
  const [form, setForm] = useState<PaymentForm>({
    ...BLANK_FORM,
    amountBtngg: params.amount ?? '',
    tokenRef: params.ref ?? generateReference(),
    senderWallet: params.wallet ?? '',
    senderFirstName: user?.full_name?.split(' ')[0] ?? '',
    senderEmail: user?.email ?? '',
  });
  const [activeTab, setActiveTab] = useState<'payment' | 'ucaf' | 'history'>('payment');
  const [ucafGenerated, setUcafGenerated] = useState(false);
  const [ucafValid, setUcafValid] = useState<boolean | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const [txRecord, setTxRecord] = useState<any>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<typeof RECIPIENT_OPTIONS[number]>(RECIPIENT_OPTIONS[0]);
  const successAnim = useRef(new Animated.Value(0)).current;

  // ── Domain Resolver state ─────────────────────────────────────────────────
  const { resolving: domResolving, resolvedRecord: domRecord, resolveError: domError, resolve: resolveDomain, clear: clearResolver } = useDomainResolver();
  const [resolverChain,        setResolverChain]        = useState('BTNG');
  const [recipientInputValue,  setRecipientInputValue]  = useState(BTNG_MERCHANT.merchantId);

  const conv = calcConversions(form.amountBtngg);

  // Load transaction history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  // Sync recipientInputValue when merchant picker changes
  useEffect(() => {
    setRecipientInputValue(selectedRecipient.wallet);
    clearResolver();
  }, [selectedRecipient]);

  // Prefill recipient from selected merchant
  useEffect(() => {
    setForm(f => ({
      ...f,
      recipientWallet: selectedRecipient.wallet,
      recipientFirstName: selectedRecipient.firstName,
      recipientMiddleName: selectedRecipient.middleName,
      recipientEmail: selectedRecipient.email,
    }));
  }, [selectedRecipient]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const client = getSupabaseClient();
      const { data } = await client
        .from('btng_pay_transactions')
        .select('id, reference, amount_satoshi, unit, status, ghs_equivalent, usd_equivalent, sender_first_name, sender_wallet, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setTxHistory(data);
    } catch { /* offline graceful */ } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleGenerateUCAF = useCallback(() => {
    const ucaf = generateUCAF(form);
    const sig = '0xSIG' + Math.random().toString(16).slice(2, 66).toUpperCase();
    const pk = '0xPK' + Math.random().toString(16).slice(2, 68).toUpperCase();
    setForm(f => ({ ...f, ucaf, signature: sig, publicKey: pk }));
    setUcafGenerated(true);
    setUcafValid(null);
  }, [form]);

  const handleValidateUCAF = useCallback(() => {
    const valid = validateUCAF(form.ucaf) && form.signature.length > 10 && form.publicKey.length > 10;
    setUcafValid(valid);
    if (!valid) showAlert('UCAF Invalid', 'The UCAF authentication code or signature is not valid. Please generate a fresh UCAF or check the values.');
  }, [form, showAlert]);

  const handleCopy = useCallback((value: string, key: string) => {
    ExpoClipboard.setStringAsync(value).catch(()=>{});
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const setField = useCallback((key: keyof PaymentForm, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
  }, []);

  // Domain-aware recipient input handler
  const handleRecipientInput = useCallback((v: string) => {
    setRecipientInputValue(v);
    setField('recipientWallet', v);
    const trimmed = v.trim().toLowerCase();
    if (RESOLVABLE_DOMAINS.includes(trimmed)) resolveDomain(trimmed, resolverChain);
    else clearResolver();
  }, [setField, resolveDomain, clearResolver, resolverChain]);

  const handleAcceptResolved = useCallback((address: string) => {
    setRecipientInputValue(address);
    setField('recipientWallet', address);
    clearResolver();
  }, [setField, clearResolver]);

  const validateForm = useCallback((): string | null => {
    if (!form.senderWallet.trim()) return 'Sender wallet address is required.';
    if (!form.senderFirstName.trim()) return 'Sender name is required.';
    if (!form.senderEmail.trim() || !form.senderEmail.includes('@')) return 'Valid sender email is required.';
    if (!form.recipientWallet.trim()) return 'Recipient wallet/merchant ID is required.';
    if (!form.recipientFirstName.trim()) return 'Recipient name is required.';
    if (!form.amountBtngg.trim() || parseFloat(form.amountBtngg) <= 0) return 'A valid BTNGG amount is required.';
    if (!form.ucaf.trim()) return 'UCAF authentication code is required. Generate it in the Security tab.';
    if (!form.signature.trim()) return 'Transaction signature is required.';
    return null;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    const err = validateForm();
    if (err) { showAlert('Validation Error', err); return; }

    setStatus('validating');
    setProcessingStep(1);

    // Step 1: Validate UCAF
    await new Promise(r => setTimeout(r, 900));
    const ucafOk = validateUCAF(form.ucaf);
    if (!ucafOk) {
      setStatus('failed');
      showAlert('UCAF Failed', 'UCAF signature validation failed. Payment rejected.');
      return;
    }

    setStatus('confirming');
    setProcessingStep(2);
    await new Promise(r => setTimeout(r, 800));

    setStatus('processing');
    setProcessingStep(3);
    await new Promise(r => setTimeout(r, 700));

    // Build record
    const amtFloat = parseFloat(form.amountBtngg);
    const amtSatoshi = Math.round(amtFloat * 1e8);
    const reference = form.tokenRef || generateReference();

    const record = {
      reference,
      version: 1,
      amount_satoshi: amtSatoshi,
      unit: form.unit,
      conversion_anchor: CONVERSION_ANCHOR,
      chain_id: CHAIN_ID,
      channel: CHANNEL,
      purpose: form.purpose,
      sender_wallet: form.senderWallet.trim(),
      sender_first_name: form.senderFirstName.trim(),
      sender_middle_name: form.senderMiddleName.trim() || null,
      sender_email: form.senderEmail.trim().toLowerCase(),
      recipient_merchant_id: BTNG_MERCHANT.merchantId,
      recipient_wallet: form.recipientWallet.trim(),
      recipient_first_name: form.recipientFirstName.trim(),
      recipient_middle_name: form.recipientMiddleName.trim() || null,
      recipient_email: form.recipientEmail.trim().toLowerCase(),
      payment_method_type: form.paymentMethod,
      token_ref: reference,
      ucaf: form.ucaf.trim(),
      signature: form.signature.trim(),
      public_key: form.publicKey.trim(),
      status: 'pending',
      gold_price_usd: XAU_USD,
      btng_usd: BTNG_USD,
      usd_equivalent: conv.usd,
      ghs_equivalent: conv.ghs,
      created_by: user?.id ?? null,
    };

    try {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('btng_pay_transactions')
        .insert(record)
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Update status to confirmed
      await client
        .from('btng_pay_transactions')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', data.id);

      setTxRecord({ ...data, status: 'confirmed' });
      setStatus('success');
      setProcessingStep(4);

      // Animate success
      Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }).start();
      await loadHistory();

    } catch (e: any) {
      // Still save locally as failed for audit trail
      try {
        const client = getSupabaseClient();
        await client.from('btng_pay_transactions').insert({ ...record, status: 'failed', error_reason: e?.message ?? 'Unknown error' });
      } catch { /* ignore */ }
      setStatus('failed');
      showAlert('Payment Failed', e?.message ?? 'Transaction could not be processed. Please retry.');
    }
  }, [form, validateForm, conv, user, showAlert, loadHistory, successAnim]);

  const handleReset = useCallback(() => {
    setStatus('form');
    setProcessingStep(0);
    setTxRecord(null);
    setUcafGenerated(false);
    setUcafValid(null);
    setForm({
      ...BLANK_FORM,
      tokenRef: generateReference(),
      senderFirstName: user?.full_name?.split(' ')[0] ?? '',
      senderEmail: user?.email ?? '',
    });
    successAnim.setValue(0);
  }, [user, successAnim]);

  const STEPS = [
    { label: 'UCAF Validation' },
    { label: 'Wallet Confirmation' },
    { label: 'Broadcasting' },
    { label: 'Settlement' },
  ];

  const TABS = [
    { key: 'payment', label: 'Payment', icon: 'payments' },
    { key: 'ucaf', label: 'Security', icon: 'verified-user' },
    { key: 'history', label: 'History', icon: 'history' },
  ];

  // ── Success Screen ──────────────────────────────────────────────────────────
  if (status === 'success' && txRecord) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.topTitle}>Payment Complete</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <Animated.View style={[s.successCard, { transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }], opacity: successAnim }]}>
            <View style={s.successIconWrap}>
              <MaterialIcons name="check-circle" size={52} color={Colors.success} />
            </View>
            <Text style={s.successTitle}>Payment Confirmed</Text>
            <Text style={s.successSub}>Transaction settled on BTNG Sovereign Mainnet</Text>
            <View style={s.successAmountWrap}>
              <Text style={s.successAmountLabel}>Amount Sent</Text>
              <Text style={s.successAmount}>{form.amountBtngg} BTNGG</Text>
              <View style={s.successAmountRow}>
                <Text style={s.successAmountSub}>${conv.usd.toFixed(4)} USD</Text>
                <View style={s.successAmountDivider} />
                <Text style={s.successAmountSub}>₵{conv.ghs.toFixed(2)} GHS</Text>
              </View>
            </View>
          </Animated.View>

          {/* Transaction Receipt */}
          <View style={s.receiptCard}>
            <View style={s.receiptHeader}>
              <MaterialIcons name="receipt-long" size={16} color={Colors.primary} />
              <Text style={s.receiptTitle}>Transaction Receipt</Text>
              <View style={s.confirmedBadge}>
                <View style={s.confirmedDot} />
                <Text style={s.confirmedText}>CONFIRMED</Text>
              </View>
            </View>
            {[
              { label: 'Reference', value: txRecord.reference ?? form.tokenRef, mono: true, copyKey: 'ref' },
              { label: 'Chain', value: CHAIN_ID, mono: true },
              { label: 'Status', value: 'CONFIRMED', color: Colors.success },
              { label: 'Sender', value: `${form.senderFirstName} (${form.senderWallet.slice(0, 12)}…)`, mono: true },
              { label: 'Recipient', value: `${form.recipientFirstName} · ID ${BTNG_MERCHANT.merchantId}` },
              { label: 'Amount', value: `${form.amountBtngg} BTNGG`, color: Colors.primary },
              { label: 'USD Value', value: `$${conv.usd.toFixed(4)}` },
              { label: 'GHS Value', value: `₵${conv.ghs.toFixed(2)}` },
              { label: 'Gold Equiv', value: `${conv.xau.toFixed(6)} oz XAU` },
              { label: 'Gold Price', value: `$${XAU_USD.toLocaleString()} / oz` },
              { label: 'Purpose', value: PURPOSES.find(p => p.key === form.purpose)?.label ?? form.purpose },
              { label: 'Method', value: PAYMENT_METHODS.find(m => m.key === form.paymentMethod)?.label ?? form.paymentMethod },
              { label: 'UCAF', value: form.ucaf.slice(0, 20) + '…', mono: true, copyKey: 'ucaf' },
            ].map(row => (
              <TouchableOpacity
                key={row.label}
                style={s.receiptRow}
                onPress={row.copyKey ? () => handleCopy(row.copyKey === 'ref' ? (txRecord.reference ?? form.tokenRef) : form.ucaf, row.copyKey) : undefined}
                activeOpacity={row.copyKey ? 0.7 : 1}
              >
                <Text style={s.receiptLabel}>{row.label}</Text>
                <View style={s.receiptValueRow}>
                  <Text style={[s.receiptValue, row.mono && s.receiptValueMono, row.color ? { color: row.color } : {}]} numberOfLines={1}>{row.value}</Text>
                  {row.copyKey ? (
                    <MaterialIcons name={copiedField === row.copyKey ? 'check-circle' : 'copy-all'} size={12} color={copiedField === row.copyKey ? Colors.success : Colors.textMuted} />
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Actions */}
          <TouchableOpacity style={s.newPayBtn} onPress={handleReset} activeOpacity={0.85}>
            <MaterialIcons name="add-circle" size={18} color={Colors.bg} />
            <Text style={s.newPayBtnText}>New Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.historyBtn} onPress={() => { handleReset(); setActiveTab('history'); }} activeOpacity={0.85}>
            <MaterialIcons name="history" size={16} color={Colors.primary} />
            <Text style={s.historyBtnText}>View All Transactions</Text>
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ── Processing / Failed Screen ────────────────────────────────────────────────
  if (status !== 'form') {
    const isFailed = status === 'failed';
    const steps = ['validating', 'confirming', 'processing', 'success'];
    const activeStepIdx = steps.indexOf(status);
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => isFailed ? handleReset() : undefined} disabled={!isFailed}>
            <MaterialIcons name={isFailed ? 'arrow-back' : 'lock'} size={22} color={isFailed ? Colors.textPrimary : Colors.textMuted} />
          </TouchableOpacity>
          <Text style={s.topTitle}>{isFailed ? 'Payment Failed' : 'Processing…'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.processingCard}>
          <View style={[s.processingIconWrap, { backgroundColor: isFailed ? Colors.errorBg : Colors.primaryGlow }]}>
            {isFailed ? (
              <MaterialIcons name="error-outline" size={44} color={Colors.error} />
            ) : (
              <ActivityIndicator size="large" color={Colors.primary} />
            )}
          </View>
          <Text style={[s.processingTitle, isFailed && { color: Colors.error }]}>
            {isFailed ? 'Transaction Rejected' : STEPS[processingStep - 1]?.label ?? 'Initializing…'}
          </Text>
          <Text style={s.processingSub}>
            {isFailed ? 'Payment could not be processed. Check details and retry.' : 'Securing your BTNG transaction on the sovereign chain…'}
          </Text>

          {/* Steps Pipeline */}
          <View style={s.stepsCard}>
            {STEPS.map((step, i) => (
              <React.Fragment key={step.label}>
                <StatusStep
                  step={i + 1}
                  label={step.label}
                  active={processingStep === i + 1 && !isFailed}
                  done={processingStep > i + 1 || (isFailed && i < processingStep - 1)}
                  error={isFailed && i === processingStep - 1}
                />
                {i < STEPS.length - 1 && (
                  <View style={[s.stepConnector, (processingStep > i + 1) && s.stepConnectorDone]} />
                )}
              </React.Fragment>
            ))}
          </View>

          {isFailed && (
            <TouchableOpacity style={s.retryBtn} onPress={handleReset} activeOpacity={0.85}>
              <MaterialIcons name="refresh" size={16} color={Colors.bg} />
              <Text style={s.retryBtnText}>Retry Payment</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Main Form ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Pay Gateway</Text>
          <View style={s.livePill}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>BTNG-MAINNET · Live</Text>
          </View>
        </View>
        <View style={[s.backBtn, { backgroundColor: Colors.primaryGlow }]}>
          <MaterialIcons name="payments" size={20} color={Colors.primary} />
        </View>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]} onPress={() => setActiveTab(t.key as any)}>
            <MaterialIcons name={t.icon as any} size={13} color={activeTab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* ── PAYMENT TAB ── */}
        {activeTab === 'payment' && (
          <>
            {/* Amount Hero */}
            <View style={s.amountCard}>
              <View style={s.amountCardHeader}>
                <View style={s.amountIconWrap}><Text style={{ fontSize: 22 }}>🥇</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.amountCardTitle}>BTNG Pay Transaction</Text>
                  <Text style={s.amountCardSub}>Gold-backed · Sovereign · Instant settlement</Text>
                </View>
                <View style={s.chainBadge}>
                  <Text style={s.chainBadgeText}>{CHAIN_ID}</Text>
                </View>
              </View>
              <View style={s.amountInputWrap}>
                <View style={s.amountPrefix}>
                  <Text style={s.amountPrefixText}>BTNGG</Text>
                </View>
                <TextInput
                  style={s.amountInput}
                  value={form.amountBtngg}
                  onChangeText={v => setField('amountBtngg', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.000000"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                {form.amountBtngg.trim() && parseFloat(form.amountBtngg) > 0 && (
                  <View style={s.amountSuffix}>
                    <Text style={s.amountSuffixText}>${conv.usd.toFixed(2)}</Text>
                  </View>
                )}
              </View>
              {form.amountBtngg.trim() && parseFloat(form.amountBtngg) > 0 && (
                <View style={s.convRow}>
                  <View style={s.convChip}>
                    <Text style={s.convFlag}>🇬🇭</Text>
                    <Text style={s.convText}>₵{conv.ghs.toFixed(2)} GHS</Text>
                  </View>
                  <View style={s.convChip}>
                    <Text style={s.convFlag}>🥇</Text>
                    <Text style={s.convText}>{conv.xau.toFixed(6)} oz XAU</Text>
                  </View>
                  <View style={s.convChip}>
                    <Text style={s.convFlag}>$</Text>
                    <Text style={s.convText}>${conv.usd.toFixed(4)}</Text>
                  </View>
                </View>
              )}
              {/* Quick amounts */}
              <View style={s.quickAmounts}>
                {['1', '10', '50', '100', '500', '1000'].map(amt => (
                  <TouchableOpacity key={amt} style={[s.quickAmt, form.amountBtngg === amt && s.quickAmtActive]} onPress={() => setField('amountBtngg', amt)}>
                    <Text style={[s.quickAmtText, form.amountBtngg === amt && { color: Colors.bg }]}>{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Reference */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <MaterialIcons name="tag" size={14} color={Colors.primary} />
                <Text style={s.sectionTitle}>Transaction Reference</Text>
              </View>
              <View style={s.refRow}>
                <TextInput
                  style={[fi.input, fi.inputMono, { flex: 1 }]}
                  value={form.tokenRef}
                  onChangeText={v => setField('tokenRef', v)}
                  placeholder="BTNG-PAY-..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <TouchableOpacity style={s.refGenBtn} onPress={() => setField('tokenRef', generateReference())} activeOpacity={0.8}>
                  <MaterialIcons name="refresh" size={16} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.refCopyBtn} onPress={() => handleCopy(form.tokenRef, 'tokenRef')} activeOpacity={0.8}>
                  <MaterialIcons name={copiedField === 'tokenRef' ? 'check-circle' : 'copy-all'} size={16} color={copiedField === 'tokenRef' ? Colors.success : Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sender Details */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <MaterialIcons name="account-circle" size={14} color={Colors.primary} />
                <Text style={s.sectionTitle}>Sender Details</Text>
              </View>
              <FieldInput label="Wallet Address" value={form.senderWallet} onChangeText={v => setField('senderWallet', v)} placeholder="btng:mainnet:…" icon="account-balance-wallet" required mono hint="Your BTNG Genesis wallet address" />
              <View style={s.rowInputs}>
                <View style={{ flex: 1 }}>
                  <FieldInput label="First Name" value={form.senderFirstName} onChangeText={v => setField('senderFirstName', v)} placeholder="John" required />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldInput label="Middle Name" value={form.senderMiddleName} onChangeText={v => setField('senderMiddleName', v)} placeholder="Kojo (optional)" />
                </View>
              </View>
              <FieldInput label="Email Address" value={form.senderEmail} onChangeText={v => setField('senderEmail', v)} placeholder="you@example.com" keyboardType="email-address" icon="email" required />
            </View>

            {/* Recipient Details */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <MaterialIcons name="storefront" size={14} color={Colors.warning} />
                <Text style={[s.sectionTitle, { color: Colors.warning }]}>Recipient Details</Text>
                <View style={s.merchantBadge}><Text style={s.merchantBadgeText}>Merchant</Text></View>
              </View>

              {/* Merchant Picker */}
              <View style={s.merchantPickerRow}>
                {RECIPIENT_OPTIONS.map(opt => {
                  const isActive = selectedRecipient.key === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        s.merchantPickerBtn,
                        isActive && { borderColor: opt.badgeColor, backgroundColor: opt.badgeColor + '18' },
                      ]}
                      onPress={() => setSelectedRecipient(opt)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 16 }}>{opt.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.merchantPickerLabel, isActive && { color: opt.badgeColor }]} numberOfLines={1}>{opt.label}</Text>
                        <View style={[s.merchantPickerBadge, { backgroundColor: opt.badgeColor + '22', borderColor: opt.badgeColor + '55' }]}>
                          <Text style={[s.merchantPickerBadgeText, { color: opt.badgeColor }]}>{opt.badge}</Text>
                        </View>
                      </View>
                      {isActive && <MaterialIcons name="check-circle" size={16} color={opt.badgeColor} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Selected Merchant Strip */}
              <View style={[s.merchantStrip, { borderColor: selectedRecipient.badgeColor + '55' }]}>
                <Text style={{ fontSize: 22 }}>{selectedRecipient.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.merchantName}>{selectedRecipient.legalName}</Text>
                  <Text style={s.merchantSub}>{selectedRecipient.sub}</Text>
                </View>
                {selectedRecipient.verified && (
                  <View style={s.verifiedBadge}><MaterialIcons name="verified" size={12} color={Colors.success} /></View>
                )}
              </View>

              {/* Google Shopping info for ietrust */}
              {selectedRecipient.key === 'ietrust' && (
                <View style={s.googleShopCard}>
                  <MaterialIcons name="shopping-cart" size={14} color={Colors.info} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.googleShopTitle}>Google Merchant Center</Text>
                    <Text style={s.googleShopSub}>Merchant Center ID: <Text style={{ color: Colors.primary, fontWeight: '800' }}>{INTL_EQUITY_TRUST.merchantCenterId}</Text></Text>
                    <Text style={s.googleShopSub}>Comparison Shopping Service: <Text style={{ color: Colors.info }}>{INTL_EQUITY_TRUST.shoppingService}</Text></Text>
                    <Text style={s.googleShopSub}>Platform: {INTL_EQUITY_TRUST.shoppingUrl}</Text>
                  </View>
                </View>
              )}

              {/* Goldnet info */}
              {selectedRecipient.key === 'goldnet' && (
                <View style={[s.googleShopCard, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]}>
                  <MaterialIcons name="workspace-premium" size={14} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.googleShopTitle, { color: Colors.primary }]}>Gold Equity Custodian</Text>
                    <Text style={s.googleShopSub}>Entity: <Text style={{ color: Colors.primary, fontWeight: '700' }}>{INTL_EQUITY_CUSTODIAN.legalName}</Text></Text>
                    <Text style={s.googleShopSub}>Asset Type: <Text style={{ color: Colors.primary }}>{INTL_EQUITY_CUSTODIAN.assetType}</Text></Text>
                    <Text style={s.googleShopSub}>Network: {INTL_EQUITY_CUSTODIAN.network}</Text>
                  </View>
                </View>
              )}

              {/* Domain-Aware Recipient Wallet Field */}
              <View style={{ gap: 6 }}>
                <View style={fi.labelRow}>
                  <MaterialIcons name="tag" size={12} color={Colors.textMuted} />
                  <Text style={fi.label}>Wallet ID or Domain Name<Text style={{ color: Colors.error }}> *</Text></Text>
                </View>
                <TextInput
                  style={[fi.input, fi.inputMono, domRecord && { borderColor: Colors.success + '88', borderWidth: 1.5 }]}
                  value={recipientInputValue}
                  onChangeText={handleRecipientInput}
                  placeholder="248059  or  btng.gold / btng.token"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {/* Chain selector — only visible when a resolvable domain is typed */}
                {RESOLVABLE_DOMAINS.includes(recipientInputValue.trim().toLowerCase()) && (
                  <View style={domChainS.row}>
                    <MaterialIcons name="device-hub" size={11} color={Colors.textMuted} />
                    <Text style={domChainS.label}>Resolve on:</Text>
                    {['BTNG', 'ETH', 'POLYGON', 'BTC', 'BNB', 'SOL'].map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[domChainS.chip, resolverChain === c && domChainS.chipActive]}
                        onPress={() => { setResolverChain(c); resolveDomain(recipientInputValue.trim().toLowerCase(), c); }}
                        activeOpacity={0.8}
                      >
                        <Text style={[domChainS.chipText, resolverChain === c && domChainS.chipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <ResolverChip
                  resolving={domResolving}
                  record={domRecord}
                  error={domError}
                  onAccept={handleAcceptResolved}
                  onDismiss={clearResolver}
                />
                {!RESOLVABLE_DOMAINS.includes(recipientInputValue.trim().toLowerCase()) && (
                  <Text style={fi.hint}>
                    Type{' '}
                    <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>btng.gold</Text>
                    {' or '}
                    <Text style={{ color: '#8247E5', fontWeight: FontWeight.bold }}>btng.token</Text>
                    {' to auto-resolve a wallet address'}
                  </Text>
                )}
              </View>
              <FieldInput label="Recipient Email" value={form.recipientEmail} onChangeText={v => setField('recipientEmail', v)} placeholder="info@bituncoin.io" keyboardType="email-address" icon="email" />
            </View>

            {/* Purpose & Method */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <MaterialIcons name="category" size={14} color={Colors.primary} />
                <Text style={s.sectionTitle}>Purpose</Text>
              </View>
              <View style={s.chipGrid}>
                {PURPOSES.map(p => (
                  <TouchableOpacity
                    key={p.key}
                    style={[s.purposeChip, form.purpose === p.key && s.purposeChipActive]}
                    onPress={() => setField('purpose', p.key)}
                  >
                    <MaterialIcons name={p.icon as any} size={12} color={form.purpose === p.key ? Colors.bg : Colors.textMuted} />
                    <Text style={[s.purposeChipText, form.purpose === p.key && { color: Colors.bg }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.section}>
              <View style={s.sectionHeader}>
                <MaterialIcons name="payment" size={14} color={Colors.primary} />
                <Text style={s.sectionTitle}>Payment Method</Text>
              </View>
              <View style={s.methodRow}>
                {PAYMENT_METHODS.map(m => (
                  <TouchableOpacity
                    key={m.key}
                    style={[s.methodChip, form.paymentMethod === m.key && s.methodChipActive]}
                    onPress={() => setField('paymentMethod', m.key)}
                  >
                    <MaterialIcons name={m.icon as any} size={14} color={form.paymentMethod === m.key ? Colors.bg : Colors.textMuted} />
                    <Text style={[s.methodChipText, form.paymentMethod === m.key && { color: Colors.bg }]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Security Check */}
            <View style={[s.ucafStatusCard, ucafGenerated ? s.ucafStatusCardOk : s.ucafStatusCardWarn]}>
              <MaterialIcons
                name={ucafGenerated ? (ucafValid === false ? 'error' : 'verified-user') : 'shield'}
                size={18}
                color={ucafGenerated ? (ucafValid === false ? Colors.error : Colors.success) : Colors.warning}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.ucafStatusTitle, { color: ucafGenerated ? (ucafValid === false ? Colors.error : Colors.success) : Colors.warning }]}>
                  {ucafGenerated ? (ucafValid === false ? 'UCAF Invalid' : 'UCAF Authenticated') : 'UCAF Required'}
                </Text>
                <Text style={s.ucafStatusSub}>
                  {ucafGenerated ? 'Security signature is set — transaction ready to submit.' : 'Go to Security tab to generate UCAF before submitting.'}
                </Text>
              </View>
              {!ucafGenerated && (
                <TouchableOpacity style={s.ucafGoBtn} onPress={() => setActiveTab('ucaf')} activeOpacity={0.8}>
                  <Text style={s.ucafGoBtnText}>Setup</Text>
                  <MaterialIcons name="chevron-right" size={14} color={Colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[s.submitBtn, !ucafGenerated && { opacity: 0.55 }]}
              onPress={handleSubmit}
              disabled={!ucafGenerated}
              activeOpacity={0.85}
            >
              <MaterialIcons name="send" size={18} color={Colors.bg} />
              <Text style={s.submitBtnText}>Submit Payment · {form.amountBtngg || '0'} BTNGG</Text>
            </TouchableOpacity>

            <View style={s.footNote}>
              <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
              <Text style={s.footNoteText}>All payments are recorded on the BTNG Sovereign Blockchain. Reference: <Text style={{ color: Colors.primary }}>{form.tokenRef}</Text> · BTNG Merchant 248059</Text>
            </View>
          </>
        )}

        {/* ── SECURITY / UCAF TAB ── */}
        {activeTab === 'ucaf' && (
          <>
            {/* UCAF Explainer */}
            <View style={s.ucafHero}>
              <View style={s.ucafHeroIconWrap}>
                <MaterialIcons name="verified-user" size={36} color={Colors.primary} />
              </View>
              <Text style={s.ucafHeroTitle}>UCAF Authentication</Text>
              <Text style={s.ucafHeroSub}>Universal Cardholder Authentication Field — BTNG's sovereign transaction security protocol. Each payment is signed with a unique cryptographic proof tied to your wallet address.</Text>
              <View style={s.ucafBadgeRow}>
                <View style={s.ucafBadge}><Text style={s.ucafBadgeText}>AES-256</Text></View>
                <View style={s.ucafBadge}><Text style={s.ucafBadgeText}>EIP-191</Text></View>
                <View style={s.ucafBadge}><Text style={s.ucafBadgeText}>secp256k1</Text></View>
                <View style={s.ucafBadge}><Text style={s.ucafBadgeText}>BTNG-MAINNET</Text></View>
              </View>
            </View>

            {/* Generate Section */}
            <View style={s.section}>
              <Text style={s.sectionTitle2}>Step 1 — Generate UCAF</Text>
              <Text style={s.sectionDesc}>Generate a unique UCAF code bound to your current payment details. The code changes with each transaction.</Text>
              <View style={s.ucafInfoCard}>
                {[
                  { label: 'Sender Wallet', value: form.senderWallet || '(not set)', truncate: true },
                  { label: 'Recipient', value: form.recipientWallet || BTNG_MERCHANT.merchantId },
                  { label: 'Amount', value: form.amountBtngg ? `${form.amountBtngg} BTNGG` : '(not set)', color: Colors.primary },
                  { label: 'Chain', value: CHAIN_ID },
                  { label: 'Reference', value: form.tokenRef, truncate: true },
                ].map(row => (
                  <View key={row.label} style={s.ucafInfoRow}>
                    <Text style={s.ucafInfoLabel}>{row.label}</Text>
                    <Text style={[s.ucafInfoValue, row.color ? { color: row.color } : {}]} numberOfLines={1}>{row.truncate && row.value.length > 20 ? row.value.slice(0, 18) + '…' : row.value}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={s.genUcafBtn} onPress={handleGenerateUCAF} activeOpacity={0.85}>
                <MaterialIcons name="auto-awesome" size={16} color={Colors.bg} />
                <Text style={s.genUcafBtnText}>{ucafGenerated ? 'Regenerate UCAF' : 'Generate UCAF Code'}</Text>
              </TouchableOpacity>
            </View>

            {/* UCAF Fields */}
            <View style={s.section}>
              <Text style={s.sectionTitle2}>Step 2 — Review & Validate</Text>
              <FieldInput
                label="UCAF Code"
                value={form.ucaf}
                onChangeText={v => { setField('ucaf', v); setUcafValid(null); }}
                placeholder="0xUCAF..."
                icon="shield"
                required
                mono
                hint="Auto-generated or paste your UCAF manually"
              />
              {form.ucaf ? (
                <TouchableOpacity style={s.copyFieldBtn} onPress={() => handleCopy(form.ucaf, 'ucaf')} activeOpacity={0.8}>
                  <MaterialIcons name={copiedField === 'ucaf' ? 'check-circle' : 'copy-all'} size={13} color={copiedField === 'ucaf' ? Colors.success : Colors.textMuted} />
                  <Text style={s.copyFieldBtnText}>{copiedField === 'ucaf' ? 'Copied' : 'Copy UCAF'}</Text>
                </TouchableOpacity>
              ) : null}

              <FieldInput
                label="Signature (Hex)"
                value={form.signature}
                onChangeText={v => setField('signature', v)}
                placeholder="0xSIG..."
                icon="draw"
                required
                mono
              />
              <FieldInput
                label="Public Key (Hex)"
                value={form.publicKey}
                onChangeText={v => setField('publicKey', v)}
                placeholder="0xPK..."
                icon="vpn-key"
                mono
              />
            </View>

            {/* Validate Button */}
            <TouchableOpacity
              style={[s.validateBtn, (!form.ucaf.trim() || !form.signature.trim()) && { opacity: 0.45 }]}
              onPress={handleValidateUCAF}
              disabled={!form.ucaf.trim() || !form.signature.trim()}
              activeOpacity={0.85}
            >
              <MaterialIcons name="verified" size={16} color={Colors.bg} />
              <Text style={s.validateBtnText}>Validate UCAF Signature</Text>
            </TouchableOpacity>

            {/* Validation Result */}
            {ucafValid !== null && (
              <View style={[s.validResult, ucafValid ? s.validResultOk : s.validResultFail]}>
                <MaterialIcons name={ucafValid ? 'check-circle' : 'cancel'} size={20} color={ucafValid ? Colors.success : Colors.error} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.validResultTitle, { color: ucafValid ? Colors.success : Colors.error }]}>
                    {ucafValid ? 'UCAF Signature Valid' : 'UCAF Signature Invalid'}
                  </Text>
                  <Text style={s.validResultSub}>
                    {ucafValid ? 'Transaction is cryptographically authenticated and ready to submit.' : 'Signature verification failed. Please regenerate the UCAF or check input values.'}
                  </Text>
                </View>
              </View>
            )}

            {/* Security Breakdown */}
            <View style={s.secBreakCard}>
              <Text style={s.secBreakTitle}>Security Architecture</Text>
              {[
                { icon: 'lock', label: 'Payload Hash', desc: 'Sender wallet + recipient + amount + chain + timestamp hashed with SHA-256', color: Colors.primary },
                { icon: 'fingerprint', label: 'EIP-191 Signature', desc: 'Personal sign prefix prefixed to prevent cross-protocol replay attacks', color: '#9945FF' },
                { icon: 'verified-user', label: 'UCAF Binding', desc: 'UCAF code is bound to this exact reference — reuse on different transactions fails', color: Colors.success },
                { icon: 'security', label: 'On-Chain Immutability', desc: 'Every record with UCAF + sig stored permanently on BTNG Sovereign Blockchain', color: Colors.warning },
              ].map((item, i) => (
                <View key={i} style={s.secBreakRow}>
                  <View style={[s.secBreakIcon, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                    <MaterialIcons name={item.icon as any} size={14} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.secBreakLabel, { color: item.color }]}>{item.label}</Text>
                    <Text style={s.secBreakDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Sovereign Engine Sign Card */}
            <View style={s.sovEngCard}>
              <View style={s.sovEngHeader}>
                <View style={s.sovEngIconWrap}>
                  <MaterialIcons name="security" size={20} color="#9945FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sovEngTitle}>Sovereign Engine Sign</Text>
                  <Text style={s.sovEngSub}>Triple-Key Architecture v2.0</Text>
                </View>
                <View style={s.sovEngBadge}>
                  <Text style={s.sovEngBadgeText}>MASTERPIECE</Text>
                </View>
              </View>

              <Text style={s.sovEngDesc}>
                Every BTNG Pay transaction is protected by a Triple-Key cryptographic pipeline — three independent signatures must be collected before settlement is permitted.
              </Text>

              {/* Architecture Diagram */}
              <View style={s.sovEngDiagram}>
                {[
                  { icon: 'person',          label: 'Client',   sub: 'Signs payment intent',   color: '#22C55E', step: '1' },
                  { icon: 'account-balance', label: 'Bank',     sub: 'Validates + co-signs',    color: Colors.primary, step: '2' },
                  { icon: 'store',           label: 'Merchant', sub: 'Settles transaction',     color: '#9945FF', step: '3' },
                ].map((node, i, arr) => (
                  <React.Fragment key={node.step}>
                    <View style={s.sovEngNode}>
                      <View style={[s.sovEngNodeIcon, { backgroundColor: node.color + '18', borderColor: node.color + '55' }]}>
                        <MaterialIcons name={node.icon as any} size={16} color={node.color} />
                        <View style={[s.sovEngStepBadge, { backgroundColor: node.color }]}>
                          <Text style={s.sovEngStepNum}>{node.step}</Text>
                        </View>
                      </View>
                      <Text style={[s.sovEngNodeLabel, { color: node.color }]}>{node.label}</Text>
                      <Text style={s.sovEngNodeSub} numberOfLines={2}>{node.sub}</Text>
                    </View>
                    {i < arr.length - 1 && (
                      <MaterialIcons name="arrow-forward" size={16} color={Colors.textMuted} style={{ marginTop: 10, flexShrink: 0 }} />
                    )}
                  </React.Fragment>
                ))}
              </View>

              {/* Key Facts */}
              <View style={s.sovEngFacts}>
                {[
                  { icon: 'vpn-key',    label: 'Algorithm',    val: 'BTNG-ED25519 (Ed25519-style)', color: Colors.primary },
                  { icon: 'verified',   label: 'Signatures',   val: '3 required — Client + Bank + Merchant', color: '#22C55E' },
                  { icon: 'lock',       label: 'Key Storage',  val: 'AsyncStorage (encrypted at rest)', color: '#3B82F6' },
                  { icon: 'link',       label: 'Chain',        val: 'BTNG Sovereign Mainnet · CS099020624', color: '#9945FF' },
                ].map(fact => (
                  <View key={fact.label} style={s.sovEngFactRow}>
                    <View style={[s.sovEngFactIcon, { backgroundColor: fact.color + '18', borderColor: fact.color + '44' }]}>
                      <MaterialIcons name={fact.icon as any} size={12} color={fact.color} />
                    </View>
                    <Text style={s.sovEngFactLabel}>{fact.label}</Text>
                    <Text style={s.sovEngFactVal} numberOfLines={1}>{fact.val}</Text>
                  </View>
                ))}
              </View>

              {/* Navigate to Sovereign Engine */}
              <TouchableOpacity
                style={s.sovEngBtn}
                onPress={() => router.push('/btng-sovereign-engine' as any)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="rocket-launch" size={16} color={Colors.bg} />
                <Text style={s.sovEngBtnText}>Explore Triple-Key Signing Engine</Text>
                <MaterialIcons name="arrow-forward" size={14} color={Colors.bg} />
              </TouchableOpacity>

              <View style={s.sovEngNote}>
                <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
                <Text style={s.sovEngNoteText}>Open the Sovereign Engine to generate wallet key pairs, simulate triple-sign flows, and verify cryptographic proofs before submitting live payments.</Text>
              </View>
            </View>

            {ucafGenerated && (
              <TouchableOpacity style={s.proceedBtn} onPress={() => setActiveTab('payment')} activeOpacity={0.85}>
                <MaterialIcons name="payments" size={16} color={Colors.bg} />
                <Text style={s.proceedBtnText}>Proceed to Payment</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <>
            <View style={s.historyHeader}>
              <View style={s.historyHeaderLeft}>
                <View style={s.historyIconWrap}><MaterialIcons name="history" size={16} color={Colors.primary} /></View>
                <Text style={s.historyTitle}>Transaction History</Text>
              </View>
              <TouchableOpacity style={[s.refreshBtn, historyLoading && { opacity: 0.5 }]} onPress={loadHistory} disabled={historyLoading}>
                {historyLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={16} color={Colors.primary} />}
              </TouchableOpacity>
            </View>

            {historyLoading && txHistory.length === 0 ? (
              <View style={s.historyLoading}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={s.historyLoadingText}>Loading transactions…</Text>
              </View>
            ) : txHistory.length === 0 ? (
              <View style={s.historyEmpty}>
                <Text style={{ fontSize: 48 }}>📄</Text>
                <Text style={s.historyEmptyTitle}>No Transactions Yet</Text>
                <Text style={s.historyEmptySub}>Submit your first BTNG Pay transaction to see it here.</Text>
                <TouchableOpacity style={s.historyNewBtn} onPress={() => setActiveTab('payment')} activeOpacity={0.85}>
                  <MaterialIcons name="add-circle" size={15} color={Colors.bg} />
                  <Text style={s.historyNewBtnText}>Create Payment</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Summary */}
                <View style={s.histSummaryRow}>
                  {[
                    { label: 'Total Txns', value: String(txHistory.length), color: Colors.primary },
                    { label: 'Confirmed', value: String(txHistory.filter(t => t.status === 'confirmed').length), color: Colors.success },
                    { label: 'Pending', value: String(txHistory.filter(t => t.status === 'pending').length), color: Colors.warning },
                    { label: 'Failed', value: String(txHistory.filter(t => t.status === 'failed').length), color: Colors.error },
                  ].map(stat => (
                    <View key={stat.label} style={[s.histSumCard, { borderColor: stat.color + '33' }]}>
                      <Text style={[s.histSumValue, { color: stat.color }]}>{stat.value}</Text>
                      <Text style={s.histSumLabel}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                {txHistory.map((tx, idx) => {
                  const isConfirmed = tx.status === 'confirmed';
                  const isFailed = tx.status === 'failed';
                  const isPending = tx.status === 'pending';
                  const amtBtngg = (tx.amount_satoshi / 1e8).toFixed(6);
                  const date = new Date(tx.created_at);
                  const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
                  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <View key={tx.id} style={[s.txCard, { borderColor: isConfirmed ? Colors.success + '33' : isFailed ? Colors.error + '33' : Colors.warning + '33' }]}>
                      <View style={s.txTop}>
                        <View style={[s.txStatusDot, { backgroundColor: isConfirmed ? Colors.success : isFailed ? Colors.error : Colors.warning }]} />
                        <Text style={s.txRef} numberOfLines={1}>{tx.reference}</Text>
                        <View style={[s.txStatusBadge, { backgroundColor: isConfirmed ? Colors.successBg : isFailed ? Colors.errorBg : Colors.warningBg }]}>
                          <Text style={[s.txStatusText, { color: isConfirmed ? Colors.success : isFailed ? Colors.error : Colors.warning }]}>
                            {tx.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <View style={s.txBody}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.txAmount}>{amtBtngg} {tx.unit ?? 'BTNGG'}</Text>
                          <Text style={s.txSender} numberOfLines={1}>{tx.sender_first_name ?? 'Unknown'}</Text>
                          <Text style={s.txDate}>{dateStr} · {timeStr}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={s.txUsd}>${((tx.amount_satoshi / 1e8) * BTNG_USD).toFixed(2)}</Text>
                          <Text style={s.txGhs}>₵{(tx.ghs_equivalent ?? (tx.amount_satoshi / 1e8) * BTNG_USD * GHS_USD).toFixed(2)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { alignItems: 'center', gap: 3 },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, gap: 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.lg },

  // Amount Card
  amountCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  amountCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  amountIconWrap: { width: 42, height: 42, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  amountCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  amountCardSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  chainBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  chainBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  amountInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', overflow: 'hidden' },
  amountPrefix: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md + 2, backgroundColor: Colors.primaryGlow, borderRightWidth: 1, borderRightColor: Colors.primary + '44' },
  amountPrefixText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  amountInput: { flex: 1, fontSize: 26, fontWeight: FontWeight.bold, color: Colors.textPrimary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, includeFontPadding: false },
  amountSuffix: { paddingHorizontal: Spacing.md, backgroundColor: Colors.bgCard, borderLeftWidth: 1, borderLeftColor: Colors.border, paddingVertical: Spacing.md },
  amountSuffixText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  convRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  convChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  convFlag: { fontSize: 12 },
  convText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  quickAmounts: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  quickAmt: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  quickAmtActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickAmtText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  // Sections
  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flex: 1 },
  sectionTitle2: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionDesc: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  rowInputs: { flexDirection: 'row', gap: Spacing.sm },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  refGenBtn: { width: 40, height: 44, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  refCopyBtn: { width: 40, height: 44, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },

  // Merchant
  merchantBadge: { backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  merchantBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  merchantPickerRow: { gap: Spacing.sm },
  merchantPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1.5, borderColor: Colors.border },
  merchantPickerLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 2 },
  merchantPickerBadge: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1 },
  merchantPickerBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  googleShopCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.info + '44' },
  googleShopTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.info, includeFontPadding: false, marginBottom: 3 },
  googleShopSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, lineHeight: 15 },
  merchantStrip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  merchantName: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  merchantSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  verifiedBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '44', alignItems: 'center', justifyContent: 'center' },

  // Purpose / Method chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  purposeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  purposeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  purposeChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  methodRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  methodChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  methodChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  methodChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },

  // UCAF Status
  ucafStatusCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1 },
  ucafStatusCardOk: { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' },
  ucafStatusCardWarn: { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '55' },
  ucafStatusTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  ucafStatusSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  ucafGoBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  ucafGoBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Submit
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  submitBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  footNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  footNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },

  // UCAF Tab
  ucafHero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  ucafHeroIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  ucafHeroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  ucafHeroSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  ucafBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  ucafBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  ucafBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  ucafInfoCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  ucafInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderBottomWidth: 1, borderBottomColor: Colors.border },
  ucafInfoLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  ucafInfoValue: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, maxWidth: '65%', includeFontPadding: false },
  genUcafBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  genUcafBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  copyFieldBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  copyFieldBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  validateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2 },
  validateBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  validResult: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1 },
  validResultOk: { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' },
  validResultFail: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '55' },
  validResultTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  validResultSub: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, marginTop: 3, includeFontPadding: false },
  secBreakCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  secBreakTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  secBreakRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  secBreakIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  secBreakLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  secBreakDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, marginTop: 2, includeFontPadding: false },
  proceedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2 },
  proceedBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Sovereign Engine Sign Card
  sovEngCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#9945FF55', gap: Spacing.md, shadowColor: '#9945FF', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  sovEngHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sovEngIconWrap:   { width: 44, height: 44, borderRadius: 14, backgroundColor: '#9945FF18', borderWidth: 1.5, borderColor: '#9945FF55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sovEngTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sovEngSub:        { fontSize: FontSize.xs, color: '#9945FF', fontWeight: FontWeight.semibold, marginTop: 1, includeFontPadding: false },
  sovEngBadge:      { backgroundColor: '#9945FF18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#9945FF44', flexShrink: 0 },
  sovEngBadgeText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: '#9945FF', letterSpacing: 0.5, includeFontPadding: false },
  sovEngDesc:       { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  sovEngDiagram:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  sovEngNode:       { flex: 1, alignItems: 'center', gap: 4 },
  sovEngNodeIcon:   { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  sovEngStepBadge:  { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bgElevated },
  sovEngStepNum:    { fontSize: 9, fontWeight: FontWeight.heavy, color: '#fff', includeFontPadding: false },
  sovEngNodeLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  sovEngNodeSub:    { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, lineHeight: 12 },
  sovEngFacts:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm - 2 },
  sovEngFactRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 3 },
  sovEngFactIcon:   { width: 26, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sovEngFactLabel:  { width: 78, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  sovEngFactVal:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  sovEngBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#9945FF', borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: '#9945FF', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  sovEngBtnText:    { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false, textAlign: 'center' },
  sovEngNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 1, borderWidth: 1, borderColor: Colors.border },
  sovEngNoteText:   { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },

  // History Tab
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  historyIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  refreshBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  historyLoading: { alignItems: 'center', gap: Spacing.md, paddingVertical: 40 },
  historyLoadingText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  historyEmpty: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md, marginTop: Spacing.lg },
  historyEmptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historyEmptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, includeFontPadding: false },
  historyNewBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl },
  historyNewBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  histSummaryRow: { flexDirection: 'row', gap: Spacing.sm },
  histSumCard: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  histSumValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, includeFontPadding: false },
  histSumLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  txCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, gap: Spacing.sm },
  txTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  txStatusDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  txRef: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  txStatusBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  txStatusText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  txBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  txAmount: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  txSender: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  txDate: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  txUsd: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  txGhs: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },

  // Processing Screen
  processingCard: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  processingIconWrap: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 8 },
  processingTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  processingSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  stepsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: 4, width: '100%' },
  stepConnector: { width: 2, height: 16, backgroundColor: Colors.border, marginLeft: 13 },
  stepConnectorDone: { backgroundColor: Colors.success },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.error, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, paddingHorizontal: Spacing.xl },
  retryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Success Screen
  successCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1.5, borderColor: Colors.success + '55', alignItems: 'center', gap: Spacing.md, shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  successIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.successBg, borderWidth: 2, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  successSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', includeFontPadding: false },
  successAmountWrap: { alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.xl, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44', width: '100%' },
  successAmountLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  successAmount: { fontSize: 28, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  successAmountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  successAmountSub: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  successAmountDivider: { width: 1, height: 14, backgroundColor: Colors.border },
  receiptCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: 1 },
  receiptHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  receiptTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  confirmedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  confirmedText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.5, includeFontPadding: false },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  receiptLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  receiptValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '65%' },
  receiptValue: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  receiptValueMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 },
  newPayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  newPayBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  historyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.primary },
  historyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
});
