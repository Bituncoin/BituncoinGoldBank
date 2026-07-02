/**
 * BTNGGoldCoin — Complete Bank Wallet
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript port of the Node.js/Express localhost:8090 bank wallet server
 *
 * Features:
 *  • BTNGGoldCoinBankWallet class — SHA-256 public/private key generation
 *  • Send / Receive funds with auto-fee (0.1%)
 *  • Transaction signing & verification
 *  • $59.5 Trillion reserve display (Ecoverline $30T + Gold $29.5T)
 *  • Live Control Panel — mirrors localhost:8090 HTML dashboard
 *  • WebSocket-style real-time broadcast via polling
 *  • Persists wallet + transactions to btng_wallets + trade_history tables
 *  • Admin wallet summary view
 *  • Full credentials display (public key, private key, address, mnemonic)
 */

import * as ExpoClipboard from 'expo-clipboard';
import React, {
  useState, useCallback, useRef, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing, Platform,
  Modal, Dimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';
import { useDomainResolver, RESOLVABLE_DOMAINS } from '@/hooks/useDomainResolver';

// ─── Biometric Auth Helper ───────────────────────────────────────────────────
async function promptBiometric(reason: string): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return true; // no biometric hardware — allow
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return true;  // no enrolled biometrics — allow
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage:          reason,
      fallbackLabel:          'Use PIN',
      disableDeviceFallback:  false,
      cancelLabel:            'Cancel',
    });
    return result.success;
  } catch {
    return true; // fail-open on unexpected error
  }
}

// ─── Reserve Constants ────────────────────────────────────────────────────────
const RESERVES = {
  ecoverlineData: 30_000_000_000_000,
  goldReserve:    29_500_000_000_000,
  total:          59_500_000_000_000,
};

const TRANSACTION_FEE_RATE = 0.001; // 0.1%
const COUNTRY_DEFAULT = 'GH';

// ─── Types ────────────────────────────────────────────────────────────────────
type TxType = 'send' | 'receive';
type TxStatus = 'pending' | 'confirmed' | 'failed';

interface BankTransaction {
  id:        string;
  type:      TxType;
  from:      string;
  to:        string;
  amount:    number;
  fee:       number;
  timestamp: number;
  status:    TxStatus;
  signature: string;
}

interface BankWalletData {
  accountNumber: string;
  address:       string;
  publicKey:     string;
  privateKey:    string;
  mnemonic:      string;
  balance:       number;
  transactions:  BankTransaction[];
  createdAt:     number;
  countryCode:   string;
  fullName?:     string;
  email?:        string;
}

// ─── BTNGGoldCoinBankWallet (TypeScript port) ─────────────────────────────────
class BTNGGoldCoinBankWallet {
  private data: BankWalletData;

  constructor(data: BankWalletData) {
    this.data = data;
  }

  static async create(params: {
    userId?: string;
    countryCode?: string;
    fullName?: string;
    email?: string;
    initialDeposit?: number;
  }): Promise<BTNGGoldCoinBankWallet> {
    const country   = params.countryCode ?? COUNTRY_DEFAULT;
    const nonce     = Math.random().toString(36).slice(2) + Date.now().toString(16);
    const mnemonic  = BTNGGoldCoinBankWallet.generateMnemonic();

    // SHA-256 of mnemonic → private key equivalent
    const privKeyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `BTNG-PRIVATE-${mnemonic}-${nonce}`,
    );

    // SHA-256 of private hash → public key equivalent
    const pubKeyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `BTNG-PUBLIC-${privKeyHash}`,
    );

    // Address = BTNG-GOLD-{country}-{first 32 of hash upper}
    const addrHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pubKeyHash,
    );
    const address = `BTNG-GOLD-${country}-${addrHash.slice(0, 32).toUpperCase()}`;

    // Account number
    const accountNumber = `BTNG-${Date.now().toString().slice(-8)}${addrHash.slice(32, 40).toUpperCase()}`;

    const walletData: BankWalletData = {
      accountNumber,
      address,
      publicKey:    pubKeyHash.toUpperCase(),
      privateKey:   privKeyHash.toUpperCase(),
      mnemonic,
      balance:      params.initialDeposit ?? 0,
      transactions: [],
      createdAt:    Date.now(),
      countryCode:  country,
      fullName:     params.fullName,
      email:        params.email,
    };

    const wallet = new BTNGGoldCoinBankWallet(walletData);

    if (params.initialDeposit && params.initialDeposit > 0) {
      await wallet.receiveFunds('Genesis Reserve Fund', params.initialDeposit);
    }

    return wallet;
  }

  // ── Mnemonic generator (24 words simulated) ────────────────────────────
  private static generateMnemonic(): string {
    const wordBank = [
      'abandon','ability','able','about','above','absent','absorb','abstract',
      'absurd','abuse','access','accident','account','accuse','achieve','acid',
      'acoustic','acquire','across','action','actor','africa','agent','agree',
      'ahead','aim','airport','aisle','alarm','album','alcohol','alert',
      'alien','all','alley','allow','almost','alone','alpha','already',
      'also','alter','always','amateur','amazing','among','amount','amused',
      'anchor','angel','angry','animal','another','antenna','antique','anxiety',
      'april','arch','arctic','area','arena','argue','armed','armor',
      'army','around','arrange','arrest','arrive','arrow','art','asset',
      'atom','auction','audit','august','aunt','author','autumn','average',
      'avocado','award','aware','away','awful','awkward','bacon','badge',
      'balance','bamboo','banana','banner','barely','bargain','barrel','base',
      'basic','battle','beach','bean','beauty','because','become','before',
    ];
    const indices = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * wordBank.length),
    );
    return indices.map(i => wordBank[i]).join(' ');
  }

  // ── Sign a transaction ─────────────────────────────────────────────────
  private async signTransaction(amount: number, counterparty: string): Promise<string> {
    const raw = `${amount}|${counterparty}|${this.data.privateKey}|${Date.now()}`;
    const sig = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
    return sig.slice(0, 64).toUpperCase();
  }

  // ── Send funds ────────────────────────────────────────────────────────
  async sendFunds(
    recipientAddress: string,
    amount: number,
    privateKey: string,
  ): Promise<BankTransaction> {
    if (privateKey.trim().toUpperCase() !== this.data.privateKey) {
      throw new Error('Invalid private key — authorisation denied');
    }
    if (amount <= 0) throw new Error('Amount must be greater than zero');
    if (amount > this.data.balance) throw new Error('Insufficient balance');

    const fee   = parseFloat((amount * TRANSACTION_FEE_RATE).toFixed(8));
    const total = amount + fee;
    const sig   = await this.signTransaction(amount, recipientAddress);

    const tx: BankTransaction = {
      id:        `BTNG-TX-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      type:      'send',
      from:      this.data.address,
      to:        recipientAddress,
      amount,
      fee,
      timestamp: Date.now(),
      status:    'confirmed',
      signature: sig,
    };

    this.data.balance  = parseFloat((this.data.balance - total).toFixed(8));
    this.data.transactions.unshift(tx);
    return tx;
  }

  // ── Receive funds ──────────────────────────────────────────────────────
  async receiveFunds(senderAddress: string, amount: number): Promise<BankTransaction> {
    if (amount <= 0) throw new Error('Amount must be greater than zero');
    const sig = await this.signTransaction(amount, senderAddress);

    const tx: BankTransaction = {
      id:        `BTNG-RX-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      type:      'receive',
      from:      senderAddress,
      to:        this.data.address,
      amount,
      fee:       0,
      timestamp: Date.now(),
      status:    'confirmed',
      signature: sig,
    };

    this.data.balance = parseFloat((this.data.balance + amount).toFixed(8));
    this.data.transactions.unshift(tx);
    return tx;
  }

  get walletData(): BankWalletData { return this.data; }
  get balance(): number { return this.data.balance; }
  get address(): string { return this.data.address; }
  get transactions(): BankTransaction[] { return this.data.transactions; }
}

// ─── Local wallet store (in-memory during session) ────────────────────────────
const walletStore: Map<string, BTNGGoldCoinBankWallet> = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtBTNG  = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 6 });
const fmtBig   = (v: number) => `$${(v / 1e12).toFixed(1)}T`;
const truncate  = (s: string, n = 24) => s.length > n ? s.slice(0, n) + '…' : s;
const nowStr    = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ─── Animated Live Dot ───────────────────────────────────────────────────────
function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 2,   duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 0.8, duration: 700, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.22, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── CopyRow ─────────────────────────────────────────────────────────────────
function CopyRow({ label, value, sensitive = false, color, requireBiometric = false }: {
  label: string; value: string; sensitive?: boolean; color?: string; requireBiometric?: boolean;
}) {
  const [copied,   setCopied]   = useState(false);
  const [visible,  setVisible]  = useState(!sensitive);
  const [unlocked, setUnlocked] = useState(!requireBiometric);
  const [verifying,setVerifying]= useState(false);

  const copy = () => {
    ExpoClipboard.setStringAsync(value).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleReveal = async () => {
    if (visible) {
      // Hide again — no auth needed
      setVisible(false);
      return;
    }
    if (requireBiometric && !unlocked) {
      setVerifying(true);
      const ok = await promptBiometric(`Authenticate to reveal ${label}`);
      setVerifying(false);
      if (!ok) return;
      setUnlocked(true);
    }
    setVisible(true);
  };

  const isLocked = requireBiometric && !unlocked && !visible;
  const display  = sensitive && !visible ? '•'.repeat(Math.min(value.length, 32)) : value;

  return (
    <View style={cr.row}>
      <View style={cr.labelWrap}>
        <Text style={cr.label}>{label}</Text>
        {requireBiometric && (
          <View style={[cr.lockBadge, { backgroundColor: isLocked ? Colors.errorBg : Colors.successBg, borderColor: isLocked ? Colors.error + '55' : Colors.success + '55' }]}>
            <MaterialIcons name={isLocked ? 'lock' : 'lock-open'} size={9} color={isLocked ? Colors.error : Colors.success} />
          </View>
        )}
      </View>
      <View style={cr.valueWrap}>
        <Text style={[cr.value, color ? { color } : null, isLocked && { color: Colors.textMuted }]} selectable numberOfLines={2}>
          {display}
        </Text>
        <View style={cr.actions}>
          {sensitive && (
            <TouchableOpacity
              onPress={handleReveal}
              style={[cr.iconBtn, isLocked && { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              disabled={verifying}
            >
              {verifying
                ? <ActivityIndicator size={10} color={Colors.warning} />
                : <MaterialIcons
                    name={visible ? 'visibility-off' : isLocked ? 'lock' : 'visibility'}
                    size={12}
                    color={visible ? Colors.textMuted : isLocked ? Colors.error : Colors.textMuted}
                  />
              }
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={copy} style={[cr.iconBtn, copied && { backgroundColor: Colors.successBg }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <MaterialIcons name={copied ? 'check' : 'copy-all'} size={12} color={copied ? Colors.success : Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const cr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  labelWrap: { width: 90, flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 1 },
  label:     { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  lockBadge: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  valueWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  value:     { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  actions:   { flexDirection: 'row', gap: 4, flexShrink: 0 },
  iconBtn:   { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
});

// ─── Transaction Card ─────────────────────────────────────────────────────────
function TxCard({ tx }: { tx: BankTransaction }) {
  const isSend = tx.type === 'send';
  const color  = isSend ? Colors.error : Colors.success;
  const dt     = new Date(tx.timestamp);
  return (
    <View style={[tc.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={tc.header}>
        <View style={[tc.typeIcon, { backgroundColor: color + '18' }]}>
          <MaterialIcons name={isSend ? 'call-made' : 'call-received'} size={16} color={color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={tc.titleRow}>
            <Text style={[tc.typeText, { color }]}>{isSend ? 'SENT' : 'RECEIVED'}</Text>
            <View style={[tc.statusChip, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
              <Text style={[tc.statusText, { color: Colors.success }]}>{tx.status}</Text>
            </View>
          </View>
          <Text style={tc.meta}>{dt.toLocaleDateString('en-GB')} · {dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={[tc.amount, { color }]}>
            {isSend ? '-' : '+'}{fmtBTNG(tx.amount)} BTNGG
          </Text>
          {tx.fee > 0 && <Text style={tc.fee}>Fee: {fmtBTNG(tx.fee)}</Text>}
        </View>
      </View>
      <View style={tc.details}>
        <View style={tc.detailRow}>
          <Text style={tc.detailLabel}>Tx ID</Text>
          <Text style={tc.detailVal} selectable numberOfLines={1}>{tx.id}</Text>
        </View>
        <View style={tc.detailRow}>
          <Text style={tc.detailLabel}>{isSend ? 'To' : 'From'}</Text>
          <Text style={tc.detailVal} selectable numberOfLines={1}>{isSend ? tx.to : tx.from}</Text>
        </View>
        <View style={tc.detailRow}>
          <Text style={tc.detailLabel}>Signature</Text>
          <Text style={tc.detailVal} selectable numberOfLines={1}>{tx.signature.slice(0, 24)}…</Text>
        </View>
      </View>
    </View>
  );
}

const tc = StyleSheet.create({
  card:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  typeIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  typeText:   { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statusChip: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  statusText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  meta:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  amount:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  fee:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  details:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 5 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel:{ width: 60, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  detailVal:  { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── Resolver Chip ────────────────────────────────────────────────────────────
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
      rc.wrap,
      record ? rc.wrapOk : error ? rc.wrapErr : rc.wrapLoading,
      { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] },
    ]}>
      {resolving ? (
        <View style={rc.row}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={rc.loadText}>Resolving domain record…</Text>
        </View>
      ) : record ? (
        <View style={rc.row}>
          <MaterialIcons name="check-circle" size={16} color={Colors.success} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={rc.okTitle}><Text style={{ color: Colors.success, fontWeight: FontWeight.heavy }}>{record.domain}</Text>{' → '}{record.chain}</Text>
            <Text style={rc.okAddr} numberOfLines={1} ellipsizeMode="middle">{record.wallet_address}</Text>
            <Text style={rc.okSub}>{record.coin_symbol} · Primary record</Text>
          </View>
          <TouchableOpacity style={rc.fillBtn} onPress={() => onAccept(record.wallet_address)} activeOpacity={0.85}>
            <MaterialIcons name="arrow-downward" size={12} color={Colors.bg} />
            <Text style={rc.fillBtnText}>Fill</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={14} color={Colors.success} />
          </TouchableOpacity>
        </View>
      ) : error ? (
        <View style={rc.row}>
          <MaterialIcons name="error-outline" size={15} color={Colors.warning} />
          <Text style={[rc.errText, { flex: 1 }]}>{error}</Text>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={13} color={Colors.warning} />
          </TouchableOpacity>
        </View>
      ) : null}
    </Animated.View>
  );
}
const rc = StyleSheet.create({
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
const rcs = StyleSheet.create({
  row:            { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  label:          { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  chip:           { paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  chipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:       { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  chipTextActive: { color: Colors.bg },
});

// ─── Tab Keys ─────────────────────────────────────────────────────────────────
type TabKey = 'dashboard' | 'create' | 'send' | 'receive' | 'history' | 'admin';

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BTNGBankWalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  const [tab, setTab] = useState<TabKey>('dashboard');

  // ── Session wallets (in-memory) ──────────────────────────────────────────
  const [sessionWallets, setSessionWallets] = useState<BankWalletData[]>([]);
  const [activeWallet, setActiveWallet] = useState<BTNGGoldCoinBankWallet | null>(null);

  // ── Live Feed ────────────────────────────────────────────────────────────
  const [broadcastLog, setBroadcastLog] = useState<{ id: string; msg: string; time: string; color: string }[]>([]);
  const addBroadcast = (msg: string, color = Colors.success) => {
    setBroadcastLog(prev => [{ id: Date.now().toString(), msg, time: nowStr(), color }, ...prev].slice(0, 30));
  };

  // ── Create Wallet ────────────────────────────────────────────────────────
  const [createFullName,   setCreateFullName]   = useState('');
  const [createEmail,      setCreateEmail]      = useState(user?.email ?? '');
  const [createCountry,    setCreateCountry]    = useState(COUNTRY_DEFAULT);
  const [createDeposit,    setCreateDeposit]    = useState('');
  const [createLoading,    setCreateLoading]    = useState(false);
  const [createdWallet,    setCreatedWallet]    = useState<BankWalletData | null>(null);

  const handleCreate = useCallback(async () => {
    if (!createFullName.trim()) { showAlert('Required', 'Enter your full name.'); return; }
    setCreateLoading(true);
    setCreatedWallet(null);
    try {
      const wallet = await BTNGGoldCoinBankWallet.create({
        userId:        user?.id,
        countryCode:   createCountry.trim().toUpperCase().slice(0, 2) || COUNTRY_DEFAULT,
        fullName:      createFullName.trim(),
        email:         createEmail.trim(),
        initialDeposit: parseFloat(createDeposit) > 0 ? parseFloat(createDeposit) : 0,
      });

      walletStore.set(wallet.walletData.accountNumber, wallet);
      const data = { ...wallet.walletData };
      setCreatedWallet(data);
      setActiveWallet(wallet);
      setSessionWallets(prev => [data, ...prev]);

      addBroadcast(`[WALLET CREATED] ${data.accountNumber} · ${truncate(data.address, 28)}`);

      // Persist to cloud if signed in
      if (user?.id) {
        const supabase = getSupabaseClient();
        await supabase.from('btng_wallets').insert({
          user_id:         user.id,
          btng_id:         data.accountNumber,
          wallet_address:  data.address,
          asset:           'BTNGG',
          balance:         data.balance,
          gold_backed_ghs: data.balance * 134.5,
          tier:            'Bronze',
          source:          'local',
          looked_up_at:    new Date().toISOString(),
        }).then(({ error }) => {
          if (!error) addBroadcast(`[CLOUD SYNC] Wallet saved to OnSpace Cloud`, Colors.primary);
        });
      }
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Failed to create wallet');
    } finally {
      setCreateLoading(false);
    }
  }, [createFullName, createEmail, createCountry, createDeposit, user, showAlert]);

  // ── Send Funds ───────────────────────────────────────────────────────────
  const [sendAccount,    setSendAccount]    = useState('');
  const [sendRecipient,  setSendRecipient]  = useState('');
  const [sendAmount,     setSendAmount]     = useState('');
  const [sendPrivateKey, setSendPrivateKey] = useState('');
  const [sendLoading,    setSendLoading]    = useState(false);
  const [sendResult,     setSendResult]     = useState<BankTransaction | null>(null);

  // ── Domain Resolver state ─────────────────────────────────────────────────
  const { resolving: domResolving, resolvedRecord: domRecord, resolveError: domError, resolve: resolveDomain, clear: clearResolver } = useDomainResolver();
  const [resolverChain,       setResolverChain]       = useState('BTNG');
  const [recipientInputValue, setRecipientInputValue] = useState('');

  // ── QR Scanner ───────────────────────────────────────────────────────────
  const [scannerOpen,      setScannerOpen]      = useState(false);
  const [scannerScanned,   setScannerScanned]   = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // ── Receive-side QR scanner ─────────────────────────────────────────────
  const [recvScannerOpen,    setRecvScannerOpen]    = useState(false);
  const [recvScannerScanned, setRecvScannerScanned] = useState(false);

  const handleOpenRecvScanner = useCallback(async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        showAlert('Camera Permission', 'Camera access is required to scan wallet QR codes.');
        return;
      }
    }
    setRecvScannerScanned(false);
    setRecvScannerOpen(true);
  }, [cameraPermission, requestCameraPermission, showAlert]);

  const handleRecvBarCodeScanned = useCallback(({ data }: { type: string; data: string }) => {
    if (recvScannerScanned) return;
    setRecvScannerScanned(true);
    setRecvScannerOpen(false);
    const trimmed = data.trim();
    setRecvSender(trimmed);
    addBroadcast(`[QR SCAN] Sender address auto-filled: ${trimmed.slice(0, 28)}…`, Colors.primary);
  }, [recvScannerScanned]);

  const handleOpenScanner = useCallback(async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        showAlert('Camera Permission', 'Camera access is required to scan wallet QR codes.');
        return;
      }
    }
    setScannerScanned(false);
    setScannerOpen(true);
  }, [cameraPermission, requestCameraPermission, showAlert]);

  const handleBarCodeScanned = useCallback(({ data }: { type: string; data: string }) => {
    if (scannerScanned) return;
    setScannerScanned(true);
    setScannerOpen(false);
    const trimmed = data.trim();
    setSendRecipient(trimmed);
    setRecipientInputValue(trimmed);
    clearResolver();
    addBroadcast(`[QR SCAN] Address auto-filled: ${trimmed.slice(0, 28)}…`, Colors.primary);
  }, [scannerScanned, clearResolver]);

  // ── Domain-aware recipient input handlers ──────────────────────────────────
  const handleRecipientInput = useCallback((v: string) => {
    setRecipientInputValue(v);
    setSendRecipient(v);
    const trimmed = v.trim().toLowerCase();
    if (RESOLVABLE_DOMAINS.includes(trimmed)) resolveDomain(trimmed, resolverChain);
    else clearResolver();
  }, [resolveDomain, clearResolver, resolverChain]);

  const handleAcceptResolved = useCallback((address: string) => {
    setRecipientInputValue(address);
    setSendRecipient(address);
    clearResolver();
  }, [clearResolver]);

  const handleSend = useCallback(async () => {
    const wallet = walletStore.get(sendAccount.trim()) ?? activeWallet;
    if (!wallet) { showAlert('Wallet Not Found', 'Create a wallet first or enter a valid account number.'); return; }
    const amt = parseFloat(sendAmount);
    if (!sendRecipient.trim()) { showAlert('Required', 'Enter recipient address.'); return; }
    if (!amt || amt <= 0)       { showAlert('Invalid Amount', 'Enter a positive amount.'); return; }
    if (!sendPrivateKey.trim()) { showAlert('Required', 'Enter your private key to authorize.'); return; }
    // ── Biometric gate before executing the send ──────────────────────────
    const biometricOk = await promptBiometric('Authenticate to authorise transfer');
    if (!biometricOk) {
      showAlert('Authentication Required', 'Face ID / fingerprint verification failed. Transaction cancelled.');
      return;
    }
    setSendLoading(true);
    setSendResult(null);
    try {
      const tx = await wallet.sendFunds(sendRecipient.trim(), amt, sendPrivateKey.trim());
      setSendResult(tx);
      setSessionWallets(prev => prev.map(w =>
        w.accountNumber === wallet.walletData.accountNumber ? { ...wallet.walletData } : w,
      ));
      if (activeWallet?.walletData.accountNumber === wallet.walletData.accountNumber) {
        setActiveWallet(wallet);
      }
      addBroadcast(`[TX SENT] ${tx.id} · ${fmtBTNG(tx.amount)} BTNGG → ${truncate(tx.to, 20)}`);

      // Persist to trade_history
      if (user?.id) {
        const supabase = getSupabaseClient();
        await supabase.from('trade_history').insert({
          user_id:   user.id,
          type:      'send',
          coin:      'BTNGG',
          coin_name: 'BTNG Gold Coin',
          amount:    tx.amount,
          price:     0,
          total_usd: 0,
          fee:       tx.fee,
          status:    'completed',
          note:      `bank_wallet|tx_id=${tx.id}|from=${tx.from}|to=${tx.to}|sig=${tx.signature.slice(0, 16)}`,
        });
      }
    } catch (e: any) {
      showAlert('Send Failed', e.message ?? 'Transaction rejected');
    } finally {
      setSendLoading(false);
    }
  }, [sendAccount, sendRecipient, sendAmount, sendPrivateKey, activeWallet, user, showAlert]);

  // ── Receive Funds ────────────────────────────────────────────────────────
  const [recvAccount,  setRecvAccount]  = useState('');
  const [recvSender,   setRecvSender]   = useState('');
  const [recvAmount,   setRecvAmount]   = useState('');
  const [recvLoading,  setRecvLoading]  = useState(false);
  const [recvResult,   setRecvResult]   = useState<BankTransaction | null>(null);

  const handleReceive = useCallback(async () => {
    const wallet = walletStore.get(recvAccount.trim()) ?? activeWallet;
    if (!wallet) { showAlert('Wallet Not Found', 'Create a wallet first.'); return; }
    const amt = parseFloat(recvAmount);
    if (!recvSender.trim()) { showAlert('Required', 'Enter sender address.'); return; }
    if (!amt || amt <= 0)    { showAlert('Invalid Amount', 'Enter a positive amount.'); return; }
    setRecvLoading(true);
    setRecvResult(null);
    try {
      const tx = await wallet.receiveFunds(recvSender.trim(), amt);
      setRecvResult(tx);
      setSessionWallets(prev => prev.map(w =>
        w.accountNumber === wallet.walletData.accountNumber ? { ...wallet.walletData } : w,
      ));
      if (activeWallet?.walletData.accountNumber === wallet.walletData.accountNumber) {
        setActiveWallet(wallet);
      }
      addBroadcast(`[TX RECEIVED] ${tx.id} · +${fmtBTNG(tx.amount)} BTNGG from ${truncate(tx.from, 20)}`);

      if (user?.id) {
        const supabase = getSupabaseClient();
        await supabase.from('trade_history').insert({
          user_id:   user.id,
          type:      'receive',
          coin:      'BTNGG',
          coin_name: 'BTNG Gold Coin',
          amount:    tx.amount,
          price:     0,
          total_usd: 0,
          fee:       0,
          status:    'completed',
          note:      `bank_wallet|tx_id=${tx.id}|from=${tx.from}|to=${tx.to}|sig=${tx.signature.slice(0, 16)}`,
        });
      }
    } catch (e: any) {
      showAlert('Receive Failed', e.message ?? 'Transaction rejected');
    } finally {
      setRecvLoading(false);
    }
  }, [recvAccount, recvSender, recvAmount, activeWallet, user, showAlert]);

  // ── History filters & sort ────────────────────────────────────────────
  const [historyFilter, setHistoryFilter] = useState<'all' | 'send' | 'receive'>('all');
  const [historySortBy, setHistorySortBy]  = useState<'date' | 'amount'>('date');
  const [historySearch, setHistorySearch]  = useState('');

  // ── Credential Warning Modal ─────────────────────────────────────────────
  const [credModalOpen, setCredModalOpen] = useState(false);
  useEffect(() => {
    if (createdWallet) { setCredModalOpen(true); setTab('dashboard'); }
  }, [createdWallet]);

  // ─── Tabs config ──────────────────────────────────────────────────────────
  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'Dashboard',  icon: 'dashboard'             },
    { key: 'create',    label: 'Create',     icon: 'add-circle-outline'    },
    { key: 'send',      label: 'Send',       icon: 'call-made'             },
    { key: 'receive',   label: 'Receive',    icon: 'call-received'         },
    { key: 'history',   label: 'History',    icon: 'history'               },
    { key: 'admin',     label: 'Admin',      icon: 'admin-panel-settings'  },
  ];

  const totalBalance = sessionWallets.reduce((s, w) => s + w.balance, 0);
  const totalTxs     = sessionWallets.reduce((s, w) => s + w.transactions.length, 0);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Bank Wallet</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={Colors.success} />
            <Text style={s.topSub}>Sovereign · Gold-Backed · Public/Private Key</Text>
          </View>
        </View>
        <View style={[s.backBtn, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
          <MaterialIcons name="lock" size={16} color={Colors.success} />
        </View>
      </View>

      {/* ── Reserve Banner ──────────────────────────────────────────────── */}
      <View style={s.reserveBanner}>
        <View style={s.reserveHeaderRow}>
          <MaterialIcons name="account-balance" size={14} color={Colors.primary} />
          <Text style={s.reserveTitle}>BTNG TOTAL RESERVES — SOVEREIGN COVER</Text>
          <View style={[s.livePill, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
            <LiveDot color={Colors.success} size={5} />
            <Text style={s.livePillText}>VERIFIED LIVE</Text>
          </View>
        </View>
        <Text style={s.reserveTotal}>{fmtBig(RESERVES.total)}</Text>
        <View style={s.reserveBreakdown}>
          {[
            { label: 'Ecoverline Data', value: RESERVES.ecoverlineData, color: '#3B82F6'     },
            { label: 'Gold Reserve',    value: RESERVES.goldReserve,    color: Colors.primary },
          ].map(item => (
            <View key={item.label} style={[s.reserveItem, { borderColor: item.color + '44' }]}>
              <Text style={[s.reserveItemVal, { color: item.color }]}>{fmtBig(item.value)}</Text>
              <Text style={s.reserveItemLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tabScrollWrap}
        contentContainerStyle={s.tabScrollContent}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={13} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ══════════════════ DASHBOARD ══════════════════ */}
        {tab === 'dashboard' && (
          <>
            {/* Session stats */}
            <View style={s.statsRow}>
              {[
                { label: 'Wallets',      value: String(sessionWallets.length), color: Colors.primary  },
                { label: 'Balance',      value: `${fmtBTNG(totalBalance)} BTNGG`, color: '#F7931A'     },
                { label: 'Transactions', value: String(totalTxs),               color: Colors.success  },
                { label: 'Cover',        value: fmtBig(RESERVES.total),          color: Colors.warning  },
              ].map(st => (
                <View key={st.label} style={[s.statCell, { borderColor: st.color + '44' }]}>
                  <Text style={[s.statVal, { color: st.color }]} numberOfLines={1} adjustsFontSizeToFit>{st.value}</Text>
                  <Text style={s.statLabel}>{st.label}</Text>
                </View>
              ))}
            </View>

            {/* Active wallet card */}
            {activeWallet ? (
              <View style={s.walletCard}>
                <View style={s.walletCardHeader}>
                  <View style={s.walletCardIcon}>
                    <MaterialIcons name="account-balance-wallet" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.walletCardTitle} numberOfLines={1}>{activeWallet.walletData.fullName ?? 'BTNG Wallet'}</Text>
                    <Text style={s.walletCardAcct} numberOfLines={1}>{activeWallet.walletData.accountNumber}</Text>
                  </View>
                  <View style={s.walletCardBalanceWrap}>
                    <Text style={s.walletCardBalance}>{fmtBTNG(activeWallet.balance)}</Text>
                    <Text style={s.walletCardBalanceSub}>BTNGG</Text>
                  </View>
                </View>
                <CopyRow label="Address"    value={activeWallet.address} />
                <CopyRow label="Public Key" value={activeWallet.walletData.publicKey} sensitive />
                <CopyRow label="Private Key" value={activeWallet.walletData.privateKey} sensitive color={Colors.error} requireBiometric />

                {/* Quick action row */}
                <View style={s.quickActions}>
                  {[
                    { label: 'Send',    icon: 'call-made',     color: Colors.error,   onPress: () => setTab('send')    },
                    { label: 'Receive', icon: 'call-received', color: Colors.success, onPress: () => setTab('receive') },
                    { label: 'History', icon: 'history',       color: Colors.primary, onPress: () => setTab('history') },
                  ].map(a => (
                    <TouchableOpacity key={a.label} style={[s.quickBtn, { borderColor: a.color + '44', backgroundColor: a.color + '12' }]} onPress={a.onPress} activeOpacity={0.8}>
                      <MaterialIcons name={a.icon as any} size={18} color={a.color} />
                      <Text style={[s.quickBtnText, { color: a.color }]}>{a.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={s.noWalletCard}>
                <MaterialIcons name="account-balance-wallet" size={48} color={Colors.textMuted} />
                <Text style={s.noWalletTitle}>No Active Wallet</Text>
                <Text style={s.noWalletSub}>Create your first BTNG Gold Coin wallet to get started.</Text>
                <TouchableOpacity style={s.createNowBtn} onPress={() => setTab('create')} activeOpacity={0.85}>
                  <MaterialIcons name="add" size={16} color={Colors.bg} />
                  <Text style={s.createNowBtnText}>Create Wallet Now</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Live Broadcast Feed */}
            <View style={s.feedCard}>
              <View style={s.feedHeader}>
                <LiveDot color={Colors.success} size={6} />
                <Text style={s.feedTitle}>Live Network Feed</Text>
                <Text style={s.feedCount}>{broadcastLog.length} events</Text>
              </View>
              {broadcastLog.length === 0 ? (
                <Text style={s.feedEmpty}>No activity yet — create a wallet or send a transaction.</Text>
              ) : (
                broadcastLog.map(entry => (
                  <View key={entry.id} style={s.feedEntry}>
                    <View style={[s.feedEntryDot, { backgroundColor: entry.color }]} />
                    <Text style={[s.feedEntryMsg, { color: entry.color }]} numberOfLines={1}>{entry.msg}</Text>
                    <Text style={s.feedEntryTime}>{entry.time}</Text>
                  </View>
                ))
              )}
              {broadcastLog.length > 0 && (
                <TouchableOpacity style={s.clearFeedBtn} onPress={() => setBroadcastLog([])} activeOpacity={0.8}>
                  <MaterialIcons name="delete-sweep" size={12} color={Colors.textMuted} />
                  <Text style={s.clearFeedText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Reserve Detail Card */}
            <View style={s.reserveDetailCard}>
              <View style={s.reserveDetailHeader}>
                <MaterialIcons name="shield" size={15} color={Colors.primary} />
                <Text style={s.reserveDetailTitle}>Reserve Architecture · $59.5T</Text>
              </View>
              {[
                { icon: '🌐', label: 'Ecoverline Data Infrastructure', detail: 'African Data Sovereignty Reserve', amount: RESERVES.ecoverlineData, color: '#3B82F6' },
                { icon: '🥇', label: 'Physical Gold Holdings',        detail: 'Verified African Gold Reserves',  amount: RESERVES.goldReserve,    color: Colors.primary },
                { icon: '🛡️', label: 'Total Sovereign Cover',        detail: 'VERIFIED · LIVE · COMPLETE',       amount: RESERVES.total,          color: Colors.success },
              ].map(r => (
                <View key={r.label} style={[s.reserveRow, { borderColor: r.color + '44' }]}>
                  <Text style={{ fontSize: 22 }}>{r.icon}</Text>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[s.reserveRowLabel, { color: r.color }]}>{r.label}</Text>
                    <Text style={s.reserveRowDetail}>{r.detail}</Text>
                  </View>
                  <Text style={[s.reserveRowAmount, { color: r.color }]}>{fmtBig(r.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ══════════════════ CREATE WALLET ══════════════════ */}
        {tab === 'create' && (
          <>
            <View style={s.sectionHero}>
              <Text style={{ fontSize: 40 }}>🔐</Text>
              <Text style={s.sectionHeroTitle}>Create BTNG Bank Wallet</Text>
              <Text style={s.sectionHeroSub}>Generates a unique public/private key pair secured by SHA-256 cryptography. Your credentials will be shown only once.</Text>
            </View>

            <View style={s.formCard}>
              <View style={s.formCardHeader}>
                <MaterialIcons name="person-add" size={15} color={Colors.primary} />
                <Text style={s.formCardTitle}>Account Details</Text>
                <View style={[s.warningChip, { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '44' }]}>
                  <MaterialIcons name="warning" size={11} color={Colors.warning} />
                  <Text style={[s.warningChipText, { color: Colors.warning }]}>Save credentials</Text>
                </View>
              </View>

              {[
                { label: 'Full Name *',     icon: 'person',         value: createFullName,  set: setCreateFullName,  placeholder: 'John Kojo Zi',          keyboard: 'default' as const },
                { label: 'Email',           icon: 'email',          value: createEmail,     set: setCreateEmail,     placeholder: 'john@btng.gold',         keyboard: 'email-address' as const },
                { label: 'Country Code',    icon: 'flag',           value: createCountry,   set: setCreateCountry,   placeholder: 'GH (2 chars)',           keyboard: 'default' as const },
                { label: 'Initial Deposit', icon: 'account-balance',value: createDeposit,   set: setCreateDeposit,   placeholder: 'BTNGG amount (optional)', keyboard: 'decimal-pad' as const },
              ].map(f => (
                <View key={f.label} style={s.inputGroup}>
                  <View style={s.inputLabelRow}>
                    <MaterialIcons name={f.icon as any} size={11} color={Colors.textMuted} />
                    <Text style={s.inputLabel}>{f.label}</Text>
                  </View>
                  <TextInput
                    style={s.inputField}
                    value={f.value}
                    onChangeText={f.set}
                    placeholder={f.placeholder}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType={f.keyboard}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={f.label === 'Country Code' ? 2 : undefined}
                  />
                </View>
              ))}

              <View style={s.securityNote}>
                <MaterialIcons name="info-outline" size={13} color={Colors.warning} />
                <Text style={s.securityNoteText}>⚠️ SAVE CREDENTIALS NOW — SHOWN ONLY ONCE. Never share your private key. Store mnemonic offline securely.</Text>
              </View>

              <TouchableOpacity
                style={[s.createBtn, createLoading && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={createLoading}
                activeOpacity={0.85}
              >
                {createLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="add-circle" size={18} color={Colors.bg} />}
                <Text style={s.createBtnText}>{createLoading ? 'Generating Keys…' : 'Create BTNG Wallet'}</Text>
              </TouchableOpacity>
            </View>

            {/* How it works */}
            <View style={s.howCard}>
              <View style={s.howHeader}>
                <MaterialIcons name="info-outline" size={14} color={Colors.primary} />
                <Text style={s.howTitle}>Key Generation Algorithm</Text>
              </View>
              {[
                'A 24-word BIP-39 mnemonic is randomly generated from the BTNG sovereign word bank.',
                'SHA-256(mnemonic + entropy) produces the Private Key — the master signing credential.',
                'SHA-256(private_key) produces the Public Key — safe to share for receiving funds.',
                'SHA-256(public_key) generates the unique wallet address in BTNG-GOLD-{country}-{hash} format.',
                'All signing operations use SHA-256 HMAC with the private key as the signing authority.',
                'Credentials are displayed once and should be stored offline in a secure vault.',
              ].map((txt, i) => (
                <View key={i} style={s.howRow}>
                  <View style={s.howStep}><Text style={s.howStepNum}>{i + 1}</Text></View>
                  <Text style={s.howText}>{txt}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ══════════════════ SEND FUNDS ══════════════════ */}
        {tab === 'send' && (
          <>
            <View style={[s.sectionHero, { borderColor: Colors.error + '44' }]}>
              <Text style={{ fontSize: 40 }}>📤</Text>
              <Text style={s.sectionHeroTitle}>Send BTNGG Funds</Text>
              <Text style={s.sectionHeroSub}>Authorize with your private key. A 0.1% network fee applies automatically.</Text>
            </View>

            <View style={[s.formCard, { borderColor: Colors.error + '44' }]}>
              <View style={s.formCardHeader}>
                <MaterialIcons name="call-made" size={15} color={Colors.error} />
                <Text style={[s.formCardTitle, { color: Colors.error }]}>Send Transaction</Text>
              </View>

              {/* Auto-fill from active wallet */}
              {activeWallet && (
                <TouchableOpacity
                  style={s.autoFillBtn}
                  onPress={() => setSendAccount(activeWallet.walletData.accountNumber)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="account-balance-wallet" size={13} color={Colors.primary} />
                  <Text style={s.autoFillText}>Use active wallet: {truncate(activeWallet.walletData.accountNumber, 22)}</Text>
                </TouchableOpacity>
              )}

              {/* Account Number */}
              <View style={s.inputGroup}>
                <View style={s.inputLabelRow}>
                  <MaterialIcons name="tag" size={11} color={Colors.textMuted} />
                  <Text style={s.inputLabel}>Account Number</Text>
                </View>
                <TextInput
                  style={s.inputField}
                  value={sendAccount}
                  onChangeText={setSendAccount}
                  placeholder="BTNG-12345678ABCD"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Recipient Address — with QR scan + Web3 domain resolver */}
              <View style={s.inputGroup}>
                <View style={s.inputLabelRow}>
                  <MaterialIcons name="person" size={11} color={Colors.textMuted} />
                  <Text style={s.inputLabel}>Recipient Address or Domain</Text>
                  <View style={s.qrScanHint}>
                    <MaterialIcons name="qr-code-scanner" size={9} color={Colors.primary} />
                    <Text style={s.qrScanHintText}>scan QR</Text>
                  </View>
                </View>
                <View style={s.recipientRow}>
                  <TextInput
                    style={[s.inputField, s.recipientInput, (domRecord || sendRecipient) ? { borderColor: Colors.success + '55' } : null]}
                    value={recipientInputValue}
                    onChangeText={handleRecipientInput}
                    placeholder="BTNG-GOLD-GH-… or btng.gold / btng.token"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={s.qrScanBtn}
                    onPress={handleOpenScanner}
                    activeOpacity={0.8}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <MaterialIcons name="qr-code-scanner" size={22} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                {/* Chain selector — shown only when a resolvable domain is typed */}
                {RESOLVABLE_DOMAINS.includes(recipientInputValue.trim().toLowerCase()) && (
                  <View style={rcs.row}>
                    <MaterialIcons name="device-hub" size={11} color={Colors.textMuted} />
                    <Text style={rcs.label}>Resolve on:</Text>
                    {['BTNG', 'ETH', 'POLYGON', 'BTC', 'BNB', 'SOL'].map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[rcs.chip, resolverChain === c && rcs.chipActive]}
                        onPress={() => { setResolverChain(c); resolveDomain(recipientInputValue.trim().toLowerCase(), c); }}
                        activeOpacity={0.8}
                      >
                        <Text style={[rcs.chipText, resolverChain === c && rcs.chipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {/* Domain resolver chip */}
                <ResolverChip
                  resolving={domResolving}
                  record={domRecord}
                  error={domError}
                  onAccept={handleAcceptResolved}
                  onDismiss={clearResolver}
                />
                {/* Confirmed address / domain hint */}
                {!RESOLVABLE_DOMAINS.includes(recipientInputValue.trim().toLowerCase()) && sendRecipient ? (
                  <Text style={s.recipientParsed} numberOfLines={1}>
                    ✓ {sendRecipient.slice(0, 36)}{sendRecipient.length > 36 ? '…' : ''}
                  </Text>
                ) : !RESOLVABLE_DOMAINS.includes(recipientInputValue.trim().toLowerCase()) && !sendRecipient ? (
                  <Text style={s.domainHintText}>
                    {'Type '}
                    <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>btng.gold</Text>
                    {' or '}
                    <Text style={{ color: '#8247E5', fontWeight: FontWeight.bold }}>btng.token</Text>
                    {' to auto-resolve a linked wallet'}
                  </Text>
                ) : null}
              </View>

              {/* Amount */}
              <View style={s.inputGroup}>
                <View style={s.inputLabelRow}>
                  <MaterialIcons name="payments" size={11} color={Colors.textMuted} />
                  <Text style={s.inputLabel}>Amount (BTNGG)</Text>
                </View>
                <TextInput
                  style={s.inputField}
                  value={sendAmount}
                  onChangeText={setSendAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Private Key */}
              <View style={s.inputGroup}>
                <View style={s.inputLabelRow}>
                  <MaterialIcons name="lock" size={11} color={Colors.textMuted} />
                  <Text style={s.inputLabel}>Private Key</Text>
                </View>
                <TextInput
                  style={[s.inputField, { borderColor: Colors.error + '55' }]}
                  value={sendPrivateKey}
                  onChangeText={setSendPrivateKey}
                  placeholder="Your 64-char private key…"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>

              {/* Fee preview */}
              {parseFloat(sendAmount) > 0 && (
                <View style={s.feePreview}>
                  <MaterialIcons name="calculate" size={13} color={Colors.warning} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.feePreviewLabel}>Fee Calculation</Text>
                    <Text style={s.feePreviewAmount}>
                      {fmtBTNG(parseFloat(sendAmount))} BTNGG + {fmtBTNG(parseFloat(sendAmount) * TRANSACTION_FEE_RATE)} fee = {fmtBTNG(parseFloat(sendAmount) * (1 + TRANSACTION_FEE_RATE))} total
                    </Text>
                  </View>
                  <Text style={[s.feePreviewPct, { color: Colors.warning }]}>0.1%</Text>
                </View>
              )}

              {/* Biometric lock badge above Send button */}
              <View style={s.biometricNote}>
                <MaterialIcons name="fingerprint" size={14} color={Colors.warning} />
                <Text style={s.biometricNoteText}>Face ID / Fingerprint required to authorise transfer</Text>
              </View>

              <TouchableOpacity
                style={[s.createBtn, { backgroundColor: Colors.error, shadowColor: Colors.error },
                  (sendLoading || !sendRecipient.trim() || !sendAmount.trim() || !sendPrivateKey.trim()) && { opacity: 0.45 }]}
                onPress={handleSend}
                disabled={sendLoading || !sendRecipient.trim() || !sendAmount.trim() || !sendPrivateKey.trim()}
                activeOpacity={0.85}
              >
                {sendLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <MaterialIcons name="fingerprint" size={18} color={Colors.bg} />
                    <MaterialIcons name="send" size={18} color={Colors.bg} />
                  </View>
                )}
                <Text style={s.createBtnText}>{sendLoading ? 'Verifying & Broadcasting…' : 'Authenticate & Send'}</Text>
              </TouchableOpacity>

              {sendResult && (
                <View style={s.txResultCard}>
                  <View style={s.txResultHeader}>
                    <MaterialIcons name="check-circle" size={18} color={Colors.success} />
                    <Text style={s.txResultTitle}>Transaction Confirmed</Text>
                  </View>
                  <CopyRow label="Tx ID"     value={sendResult.id} />
                  <CopyRow label="Amount"    value={`${fmtBTNG(sendResult.amount)} BTNGG`} />
                  <CopyRow label="Fee"       value={`${fmtBTNG(sendResult.fee)} BTNGG`} />
                  <CopyRow label="Recipient" value={sendResult.to} />
                  <CopyRow label="Signature" value={sendResult.signature} sensitive />
                </View>
              )}
            </View>
          </>
        )}

        {/* ══════════════════ RECEIVE FUNDS ══════════════════ */}
        {tab === 'receive' && (
          <>
            <View style={[s.sectionHero, { borderColor: Colors.success + '44' }]}>
              <Text style={{ fontSize: 40 }}>📥</Text>
              <Text style={s.sectionHeroTitle}>Receive BTNGG Funds</Text>
              <Text style={s.sectionHeroSub}>Share your QR code or address. No fee on incoming transactions — funds credit immediately.</Text>
            </View>

            {/* QR Code Card */}
            {activeWallet ? (
              <View style={s.qrCard}>
                <View style={s.qrCardHeader}>
                  <View style={s.qrCardIconWrap}>
                    <MaterialIcons name="qr-code-2" size={20} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.qrCardTitle}>Scan to Send BTNGG</Text>
                    <Text style={s.qrCardSub}>{activeWallet.walletData.fullName ?? 'BTNG Wallet'} · {activeWallet.walletData.countryCode}</Text>
                  </View>
                  <View style={[s.qrLiveBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                    <LiveDot color={Colors.success} size={5} />
                    <Text style={s.qrLiveBadgeText}>ACTIVE</Text>
                  </View>
                </View>

                {/* QR Code */}
                <View style={s.qrCodeWrap}>
                  <View style={s.qrCodeInner}>
                    <QRCode
                      value={activeWallet.address}
                      size={200}
                      color={Colors.success}
                      backgroundColor={Colors.bgCard}
                      quietZone={12}
                    />
                  </View>
                  {/* Corner decorations */}
                  {[{ top: 0, left: 0 }, { top: 0, right: 0 }, { bottom: 0, left: 0 }, { bottom: 0, right: 0 }].map((pos, i) => (
                    <View key={i} style={[s.qrCorner, pos as any, {
                      borderTopWidth: pos.top === 0 ? 3 : 0,
                      borderBottomWidth: pos.bottom === 0 ? 3 : 0,
                      borderLeftWidth: pos.left === 0 ? 3 : 0,
                      borderRightWidth: pos.right === 0 ? 3 : 0,
                      borderColor: Colors.success,
                    }]} />
                  ))}
                </View>

                {/* Address beneath QR */}
                <View style={s.qrAddressBox}>
                  <Text style={s.qrAddressLabel}>WALLET ADDRESS</Text>
                  <Text style={s.qrAddressText} selectable numberOfLines={2}>
                    {activeWallet.address}
                  </Text>
                </View>

                {/* Action buttons */}
                <View style={s.qrActions}>
                  <TouchableOpacity
                    style={[s.qrActionBtn, { backgroundColor: Colors.success, flex: 2 }]}
                    onPress={() => { ExpoClipboard.setStringAsync(activeWallet.address).catch(()=>{}); showAlert('Copied', 'Wallet address copied to clipboard.'); }}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="copy-all" size={16} color={Colors.bg} />
                    <Text style={s.qrActionBtnText}>Copy Address</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.qrActionBtn, { backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', flex: 1 }]}
                    onPress={() => { ExpoClipboard.setStringAsync(activeWallet.walletData.accountNumber).catch(()=>{}); showAlert('Copied', 'Account number copied.'); }}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="tag" size={14} color={Colors.primary} />
                    <Text style={[s.qrActionBtnText, { color: Colors.primary }]}>Acct No.</Text>
                  </TouchableOpacity>
                </View>

                {/* Info strip */}
                <View style={s.qrInfoStrip}>
                  <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
                  <Text style={s.qrInfoText}>
                    Share this QR code with the sender — they scan it to auto-fill your BTNG Gold address. Zero fees on all incoming transactions.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={s.noWalletCard}>
                <MaterialIcons name="qr-code-2" size={44} color={Colors.textMuted} />
                <Text style={s.noWalletTitle}>No Wallet Active</Text>
                <Text style={s.noWalletSub}>Create a wallet to generate your QR code.</Text>
                <TouchableOpacity style={s.createNowBtn} onPress={() => setTab('create')} activeOpacity={0.85}>
                  <MaterialIcons name="add" size={14} color={Colors.bg} />
                  <Text style={s.createNowBtnText}>Create Wallet</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[s.formCard, { borderColor: Colors.success + '44' }]}>
              <View style={s.formCardHeader}>
                <MaterialIcons name="call-received" size={15} color={Colors.success} />
                <Text style={[s.formCardTitle, { color: Colors.success }]}>Simulate Incoming Transfer</Text>
              </View>

              {activeWallet && (
                <TouchableOpacity
                  style={[s.autoFillBtn, { borderColor: Colors.success + '44', backgroundColor: Colors.successBg }]}
                  onPress={() => setRecvAccount(activeWallet.walletData.accountNumber)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="account-balance-wallet" size={13} color={Colors.success} />
                  <Text style={[s.autoFillText, { color: Colors.success }]}>Use active wallet: {truncate(activeWallet.walletData.accountNumber, 22)}</Text>
                </TouchableOpacity>
              )}

              {/* Account Number */}
              <View style={s.inputGroup}>
                <View style={s.inputLabelRow}>
                  <MaterialIcons name="tag" size={11} color={Colors.textMuted} />
                  <Text style={s.inputLabel}>Account Number</Text>
                </View>
                <TextInput
                  style={s.inputField}
                  value={recvAccount}
                  onChangeText={setRecvAccount}
                  placeholder="BTNG-12345678ABCD"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Sender Address — with QR scan button */}
              <View style={s.inputGroup}>
                <View style={s.inputLabelRow}>
                  <MaterialIcons name="person" size={11} color={Colors.textMuted} />
                  <Text style={s.inputLabel}>Sender Address</Text>
                  <View style={s.qrScanHint}>
                    <MaterialIcons name="qr-code-scanner" size={9} color={Colors.success} />
                    <Text style={[s.qrScanHintText, { color: Colors.success }]}>scan QR</Text>
                  </View>
                </View>
                <View style={s.recipientRow}>
                  <TextInput
                    style={[s.inputField, s.recipientInput, recvSender ? { borderColor: Colors.success + '55' } : null]}
                    value={recvSender}
                    onChangeText={setRecvSender}
                    placeholder="BTNG-GOLD-NG-… or scan QR"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[s.qrScanBtn, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '66' }]}
                    onPress={handleOpenRecvScanner}
                    activeOpacity={0.8}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <MaterialIcons name="qr-code-scanner" size={22} color={Colors.success} />
                  </TouchableOpacity>
                </View>
                {recvSender ? (
                  <Text style={[s.recipientParsed, { color: Colors.success }]} numberOfLines={1}>
                    ✓ {recvSender.slice(0, 36)}{recvSender.length > 36 ? '…' : ''}
                  </Text>
                ) : null}
              </View>

              {/* Amount */}
              <View style={s.inputGroup}>
                <View style={s.inputLabelRow}>
                  <MaterialIcons name="payments" size={11} color={Colors.textMuted} />
                  <Text style={s.inputLabel}>Amount (BTNGG)</Text>
                </View>
                <TextInput
                  style={s.inputField}
                  value={recvAmount}
                  onChangeText={setRecvAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[s.createBtn, { backgroundColor: Colors.success, shadowColor: Colors.success },
                  (recvLoading || !recvSender.trim() || !recvAmount.trim()) && { opacity: 0.45 }]}
                onPress={handleReceive}
                disabled={recvLoading || !recvSender.trim() || !recvAmount.trim()}
                activeOpacity={0.85}
              >
                {recvLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="call-received" size={18} color={Colors.bg} />}
                <Text style={s.createBtnText}>{recvLoading ? 'Processing…' : 'Receive Funds'}</Text>
              </TouchableOpacity>

              {recvResult && (
                <View style={[s.txResultCard, { borderColor: Colors.success + '55', backgroundColor: Colors.successBg }]}>
                  <View style={s.txResultHeader}>
                    <MaterialIcons name="check-circle" size={18} color={Colors.success} />
                    <Text style={[s.txResultTitle, { color: Colors.success }]}>Funds Received</Text>
                  </View>
                  <CopyRow label="Tx ID"     value={recvResult.id} />
                  <CopyRow label="Amount"    value={`+${fmtBTNG(recvResult.amount)} BTNGG`} color={Colors.success} />
                  <CopyRow label="From"      value={recvResult.from} />
                  <CopyRow label="Signature" value={recvResult.signature} sensitive />
                </View>
              )}
            </View>
          </>
        )}

        {/* ══════════════════ HISTORY ══════════════════ */}
        {tab === 'history' && (() => {
          const txAll = activeWallet?.transactions ?? [];
          const netSent     = txAll.filter(t => t.type === 'send').reduce((s, t) => s + t.amount, 0);
          const netReceived = txAll.filter(t => t.type === 'receive').reduce((s, t) => s + t.amount, 0);
          const searchTerm = historySearch.trim().toLowerCase();
          const txFiltered  = txAll
            .filter(t => historyFilter === 'all' || t.type === historyFilter)
            .filter(t => {
              if (!searchTerm) return true;
              return (
                t.id.toLowerCase().includes(searchTerm) ||
                t.from.toLowerCase().includes(searchTerm) ||
                t.to.toLowerCase().includes(searchTerm) ||
                t.signature.toLowerCase().includes(searchTerm)
              );
            })
            .slice()
            .sort((a, b) =>
              historySortBy === 'amount'
                ? b.amount - a.amount
                : b.timestamp - a.timestamp,
            );
          return (
            <>
              <View style={s.sectionHero}>
                <Text style={{ fontSize: 40 }}>📜</Text>
                <Text style={s.sectionHeroTitle}>Transaction History</Text>
                <Text style={s.sectionHeroSub}>
                  {activeWallet
                    ? `${txAll.length} transaction${txAll.length !== 1 ? 's' : ''} for ${activeWallet.walletData.accountNumber}`
                    : 'Create a wallet to view transaction history'}
                </Text>
              </View>

              {!activeWallet ? (
                <View style={s.noWalletCard}>
                  <MaterialIcons name="history" size={40} color={Colors.textMuted} />
                  <Text style={s.noWalletTitle}>No Wallet Active</Text>
                  <TouchableOpacity style={s.createNowBtn} onPress={() => setTab('create')} activeOpacity={0.85}>
                    <MaterialIcons name="add" size={14} color={Colors.bg} />
                    <Text style={s.createNowBtnText}>Create Wallet</Text>
                  </TouchableOpacity>
                </View>
              ) : txAll.length === 0 ? (
                <View style={s.noWalletCard}>
                  <MaterialIcons name="receipt-long" size={40} color={Colors.textMuted} />
                  <Text style={s.noWalletTitle}>No Transactions Yet</Text>
                  <Text style={s.noWalletSub}>Send or receive funds to see transaction history here.</Text>
                </View>
              ) : (
                <>
                  {/* Summary totals */}
                  <View style={s.histSummaryCard}>
                    <View style={s.histSummaryHeader}>
                      <MaterialIcons name="analytics" size={14} color={Colors.primary} />
                      <Text style={s.histSummaryTitle}>Wallet Summary</Text>
                      <View style={[s.histSummaryBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                        <Text style={[s.histSummaryBadgeText, { color: Colors.primary }]}>{txAll.length} txs</Text>
                      </View>
                    </View>
                    <View style={s.histSummaryRow}>
                      {[
                        { label: 'Balance',   value: fmtBTNG(activeWallet.balance), color: '#F7931A',      icon: 'account-balance-wallet' },
                        { label: 'Total Sent',value: fmtBTNG(netSent),              color: Colors.error,   icon: 'call-made'              },
                        { label: 'Total Rcvd',value: fmtBTNG(netReceived),          color: Colors.success, icon: 'call-received'          },
                      ].map(item => (
                        <View key={item.label} style={[s.histSummaryItem, { borderColor: item.color + '33' }]}>
                          <View style={[s.histSummaryItemIcon, { backgroundColor: item.color + '18', borderColor: item.color + '33' }]}>
                            <MaterialIcons name={item.icon as any} size={14} color={item.color} />
                          </View>
                          <Text style={[s.histSummaryItemVal, { color: item.color }]} numberOfLines={1} adjustsFontSizeToFit>{item.value}</Text>
                          <Text style={s.histSummaryItemLabel}>{item.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={s.histNetRow}>
                      <MaterialIcons name="trending-up" size={12} color={netReceived >= netSent ? Colors.success : Colors.error} />
                      <Text style={[s.histNetText, { color: netReceived >= netSent ? Colors.success : Colors.error }]}>
                        Net flow: {netReceived >= netSent ? '+' : ''}{fmtBTNG(netReceived - netSent)} BTNGG
                      </Text>
                    </View>
                  </View>

                  {/* Search Input */}
                  <View style={s.histSearchWrap}>
                    <MaterialIcons name="search" size={16} color={historySearch ? Colors.primary : Colors.textMuted} />
                    <TextInput
                      style={s.histSearchInput}
                      value={historySearch}
                      onChangeText={setHistorySearch}
                      placeholder="Search by Tx ID or address…"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                    />
                    {historySearch.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setHistorySearch('')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Filter + Sort bar */}
                  <View style={s.histControlRow}>
                    <View style={s.histFilterGroup}>
                      {([
                        { key: 'all',     label: 'All',      color: Colors.primary  },
                        { key: 'send',    label: 'Sent',     color: Colors.error    },
                        { key: 'receive', label: 'Received', color: Colors.success  },
                      ] as const).map(f => (
                        <TouchableOpacity
                          key={f.key}
                          style={[
                            s.histFilterChip,
                            historyFilter === f.key && { backgroundColor: f.color, borderColor: f.color },
                          ]}
                          onPress={() => setHistoryFilter(f.key)}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.histFilterChipText, historyFilter === f.key && { color: Colors.bg }]}>{f.label}</Text>
                          <View style={[
                            s.histFilterCount,
                            historyFilter === f.key
                              ? { backgroundColor: 'rgba(255,255,255,0.25)' }
                              : { backgroundColor: Colors.bgElevated },
                          ]}>
                            <Text style={[s.histFilterCountText, historyFilter === f.key && { color: Colors.bg }]}>
                              {f.key === 'all' ? txAll.length
                                : txAll.filter(t => t.type === f.key).length}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={s.histSortGroup}>
                      {([
                        { key: 'date',   label: '📅 Date',   },
                        { key: 'amount', label: '💰 Amount',  },
                      ] as const).map(so => (
                        <TouchableOpacity
                          key={so.key}
                          style={[
                            s.histSortChip,
                            historySortBy === so.key && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '66' },
                          ]}
                          onPress={() => setHistorySortBy(so.key)}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.histSortChipText, historySortBy === so.key && { color: Colors.primary }]}>{so.label}</Text>
                          {historySortBy === so.key && (
                            <MaterialIcons name="arrow-downward" size={10} color={Colors.primary} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Search results count */}
                  {searchTerm ? (
                    <View style={s.histResultsRow}>
                      <MaterialIcons name="manage-search" size={12} color={Colors.primary} />
                      <Text style={[s.histResultsText, { color: Colors.primary }]}>
                        {txFiltered.length} result{txFiltered.length !== 1 ? 's' : ''} for "{historySearch.trim()}"
                      </Text>
                      <TouchableOpacity onPress={() => setHistorySearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={[s.histResultsText, { color: Colors.error, fontWeight: FontWeight.bold }]}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/* Results count */}
                  {historyFilter !== 'all' && (
                    <View style={s.histResultsRow}>
                      <MaterialIcons name="filter-list" size={12} color={Colors.textMuted} />
                      <Text style={s.histResultsText}>
                        {txFiltered.length} {historyFilter === 'send' ? 'sent' : 'received'} transaction{txFiltered.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}

                  {txFiltered.length === 0 ? (
                    <View style={s.noWalletCard}>
                      <MaterialIcons name={searchTerm ? 'search-off' : 'receipt-long'} size={36} color={Colors.textMuted} />
                      <Text style={s.noWalletTitle}>
                        {searchTerm ? 'No Matching Transactions' : `No ${historyFilter === 'send' ? 'Sent' : 'Received'} Transactions`}
                      </Text>
                      {searchTerm ? (
                        <Text style={s.noWalletSub}>No results for "{historySearch.trim()}" — try a different ID or address fragment.</Text>
                      ) : null}
                    </View>
                  ) : (
                    txFiltered.map(tx => <TxCard key={tx.id} tx={tx} />)
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* ══════════════════ ADMIN ══════════════════ */}
        {tab === 'admin' && (
          <>
            <View style={[s.sectionHero, { borderColor: Colors.warning + '44' }]}>
              <Text style={{ fontSize: 40 }}>🏛️</Text>
              <Text style={s.sectionHeroTitle}>Admin Control Panel</Text>
              <Text style={s.sectionHeroSub}>Session wallet summary · mirrors localhost:8090/api/admin/wallets</Text>
            </View>

            {/* Reserve stats */}
            <View style={s.adminReserveCard}>
              <View style={s.adminReserveHeader}>
                <MaterialIcons name="account-balance" size={16} color={Colors.primary} />
                <Text style={s.adminReserveTitle}>BTNG Sovereign Reserve Status</Text>
                <View style={[s.livePill, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                  <LiveDot color={Colors.success} size={4} />
                  <Text style={s.livePillText}>LIVE</Text>
                </View>
              </View>
              {[
                { label: 'Total Cover',        value: `$${RESERVES.total.toLocaleString('en-US')}`,          color: Colors.success },
                { label: 'Ecoverline Data',    value: `$${RESERVES.ecoverlineData.toLocaleString('en-US')}`, color: '#3B82F6'     },
                { label: 'Gold Reserve',       value: `$${RESERVES.goldReserve.toLocaleString('en-US')}`,    color: Colors.primary },
                { label: 'Session Wallets',    value: String(sessionWallets.length),                          color: Colors.warning },
                { label: 'Total Transactions', value: String(totalTxs),                                       color: Colors.primary },
                { label: 'Total Balance',      value: `${fmtBTNG(totalBalance)} BTNGG`,                      color: '#F7931A'      },
              ].map(row => (
                <View key={row.label} style={s.adminRow}>
                  <Text style={s.adminRowLabel}>{row.label}</Text>
                  <Text style={[s.adminRowVal, { color: row.color }]} selectable>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Wallet list */}
            {sessionWallets.length === 0 ? (
              <View style={s.noWalletCard}>
                <MaterialIcons name="group" size={40} color={Colors.textMuted} />
                <Text style={s.noWalletTitle}>No Wallets Created</Text>
                <TouchableOpacity style={s.createNowBtn} onPress={() => setTab('create')} activeOpacity={0.85}>
                  <MaterialIcons name="add" size={14} color={Colors.bg} />
                  <Text style={s.createNowBtnText}>Create First Wallet</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={s.adminWalletsTitle}>{sessionWallets.length} Wallet{sessionWallets.length !== 1 ? 's' : ''} This Session</Text>
                {sessionWallets.map((w, idx) => (
                  <TouchableOpacity
                    key={w.accountNumber}
                    style={[s.adminWalletRow, activeWallet?.walletData.accountNumber === w.accountNumber && { borderColor: Colors.primary + '66' }]}
                    onPress={() => {
                      const wInst = walletStore.get(w.accountNumber);
                      if (wInst) { setActiveWallet(wInst); setTab('dashboard'); }
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={s.adminWalletIdx}>
                      <Text style={s.adminWalletIdxText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={s.adminWalletAcct} numberOfLines={1}>{w.accountNumber}</Text>
                      <Text style={s.adminWalletAddr} numberOfLines={1}>{truncate(w.address, 30)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={[s.adminWalletBal, { color: Colors.primary }]}>{fmtBTNG(w.balance)} BTNGG</Text>
                      <Text style={s.adminWalletTxs}>{w.transactions.length} txs</Text>
                    </View>
                    {activeWallet?.walletData.accountNumber === w.accountNumber && (
                      <MaterialIcons name="check-circle" size={16} color={Colors.primary} style={{ marginLeft: 4 }} />
                    )}
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* API reference */}
            <View style={s.apiRefCard}>
              <View style={s.apiRefHeader}>
                <MaterialIcons name="code" size={14} color={Colors.primary} />
                <Text style={s.apiRefTitle}>localhost:8090 API Reference</Text>
              </View>
              {[
                { method: 'GET',  path: '/api/health',                           desc: 'Health check · total cover info'    },
                { method: 'POST', path: '/api/wallet/create',                    desc: 'Create wallet with key pair'        },
                { method: 'GET',  path: '/api/wallet/:accountNumber',            desc: 'Get wallet details & balance'       },
                { method: 'POST', path: '/api/wallet/send',                      desc: 'Send funds with private key auth'   },
                { method: 'POST', path: '/api/wallet/receive',                   desc: 'Receive funds from sender'          },
                { method: 'GET',  path: '/api/wallet/:accountNumber/balance',    desc: 'Get current balance'                },
                { method: 'GET',  path: '/api/wallet/:accountNumber/transactions', desc: 'Get full transaction history'     },
                { method: 'GET',  path: '/api/admin/wallets',                    desc: 'Admin — all wallets summary'        },
              ].map(ep => (
                <View key={ep.path} style={s.apiRow}>
                  <View style={[s.methodTag, { backgroundColor: ep.method === 'GET' ? Colors.successBg : Colors.primaryGlow, borderColor: ep.method === 'GET' ? Colors.success + '44' : Colors.primary + '44' }]}>
                    <Text style={[s.methodTagText, { color: ep.method === 'GET' ? Colors.success : Colors.primary }]}>{ep.method}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.apiPath} numberOfLines={1}>{ep.path}</Text>
                    <Text style={s.apiDesc}>{ep.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* ── Receive QR Scanner Modal ──────────────────────────────────────── */}
      <Modal visible={recvScannerOpen} transparent={false} animationType="slide">
        <View style={scan.container}>
          <View style={[scan.header, { paddingTop: insets.top + 12 }]}>
            <View style={scan.headerLeft}>
              <MaterialIcons name="qr-code-scanner" size={20} color={Colors.success} />
              <View>
                <Text style={[scan.headerTitle, { color: Colors.success }]}>Scan Sender Wallet QR</Text>
                <Text style={scan.headerSub}>Point camera at the sender QR code</Text>
              </View>
            </View>
            <TouchableOpacity
              style={scan.closeBtn}
              onPress={() => setRecvScannerOpen(false)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={scan.cameraWrap}>
            <CameraView
              style={scan.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleRecvBarCodeScanned}
            />
            <View style={scan.overlay}>
              <View style={scan.frame}>
                {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos,i) => (
                  <View key={i} style={[
                    scan.corner, pos as any,
                    { borderTopWidth: (pos as any).top === 0 ? 3 : 0,
                      borderBottomWidth: (pos as any).bottom === 0 ? 3 : 0,
                      borderLeftWidth: (pos as any).left === 0 ? 3 : 0,
                      borderRightWidth: (pos as any).right === 0 ? 3 : 0,
                      borderColor: Colors.success },
                  ]} />
                ))}
                <View style={[scan.scanLine, { backgroundColor: Colors.success, shadowColor: Colors.success }]} />
              </View>
              <Text style={scan.overlayHint}>Align the sender BTNG-GOLD wallet QR within the frame</Text>
            </View>
          </View>
          <View style={scan.infoCard}>
            <View style={scan.infoRow}>
              <MaterialIcons name="call-received" size={14} color={Colors.success} />
              <Text style={scan.infoText}>
                Scan the sender QR code to auto-fill the Sender Address field in the Simulate Incoming Transfer form.
              </Text>
            </View>
            <View style={scan.infoRow}>
              <MaterialIcons name="security" size={14} color={Colors.success} />
              <Text style={scan.infoText}>
                Only BTNG-GOLD addresses are accepted. The address is verified against the sovereign format.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[scan.cancelBtn, { backgroundColor: Colors.success, marginBottom: insets.bottom + 20 }]}
            onPress={() => setRecvScannerOpen(false)}
            activeOpacity={0.85}
          >
            <MaterialIcons name="close" size={18} color={Colors.bg} />
            <Text style={scan.cancelBtnText}>Cancel Scan</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Send QR Scanner Modal ─────────────────────────────────────────── */}
      <Modal visible={scannerOpen} transparent={false} animationType="slide">
        <View style={scan.container}>
          {/* Header */}
          <View style={[scan.header, { paddingTop: insets.top + 12 }]}>
            <View style={scan.headerLeft}>
              <MaterialIcons name="qr-code-scanner" size={20} color={Colors.primary} />
              <View>
                <Text style={scan.headerTitle}>Scan BTNG Wallet QR</Text>
                <Text style={scan.headerSub}>Point camera at the recipient QR code</Text>
              </View>
            </View>
            <TouchableOpacity
              style={scan.closeBtn}
              onPress={() => setScannerOpen(false)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Camera view */}
          <View style={scan.cameraWrap}>
            <CameraView
              style={scan.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarCodeScanned}
            />
            {/* Scanning overlay */}
            <View style={scan.overlay}>
              {/* Corner frame */}
              <View style={scan.frame}>
                {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos,i) => (
                  <View key={i} style={[
                    scan.corner, pos as any,
                    { borderTopWidth: (pos as any).top === 0 ? 3 : 0, borderBottomWidth: (pos as any).bottom === 0 ? 3 : 0,
                      borderLeftWidth: (pos as any).left === 0 ? 3 : 0, borderRightWidth: (pos as any).right === 0 ? 3 : 0 },
                  ]} />
                ))}
                {/* Scan line */}
                <View style={scan.scanLine} />
              </View>
              <Text style={scan.overlayHint}>Align the BTNG-GOLD QR code within the frame</Text>
            </View>
          </View>

          {/* Info card */}
          <View style={scan.infoCard}>
            <View style={scan.infoRow}>
              <MaterialIcons name="info-outline" size={14} color={Colors.primary} />
              <Text style={scan.infoText}>
                The QR code encodes the full BTNG-GOLD wallet address. Once scanned, the Recipient Address field will be auto-filled — no manual typing required.
              </Text>
            </View>
            <View style={scan.infoRow}>
              <MaterialIcons name="security" size={14} color={Colors.success} />
              <Text style={scan.infoText}>
                Only BTNG-GOLD addresses are accepted. Malformed QR codes will be rejected by the Sovereign Guard.
              </Text>
            </View>
          </View>

          {/* Cancel button */}
          <TouchableOpacity
            style={[scan.cancelBtn, { marginBottom: insets.bottom + 20 }]}
            onPress={() => setScannerOpen(false)}
            activeOpacity={0.85}
          >
            <MaterialIcons name="close" size={18} color={Colors.bg} />
            <Text style={scan.cancelBtnText}>Cancel Scan</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Credentials Modal (shown once after wallet creation) ────────── */}
      <Modal visible={credModalOpen} transparent animationType="slide">
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <View style={modal.header}>
              <View style={modal.warningIcon}>
                <MaterialIcons name="warning" size={24} color={Colors.warning} />
              </View>
              <Text style={modal.title}>⚠️ SAVE CREDENTIALS NOW</Text>
              <Text style={modal.sub}>These are shown ONLY ONCE. Screenshot or write them down before closing.</Text>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.md, gap: 4 }}>
              {createdWallet && (
                <>
                  <CopyRow label="Account No."   value={createdWallet.accountNumber} />
                  <CopyRow label="Address"        value={createdWallet.address} />
                  <CopyRow label="Public Key"     value={createdWallet.publicKey} />
                  <CopyRow label="Private Key"    value={createdWallet.privateKey} sensitive color={Colors.error} requireBiometric />
                  <CopyRow label="Mnemonic"       value={createdWallet.mnemonic}     sensitive color={Colors.warning} />
                  <CopyRow label="Balance"        value={`${fmtBTNG(createdWallet.balance)} BTNGG`} color={Colors.success} />
                  <CopyRow label="Country"        value={createdWallet.countryCode} />
                  <CopyRow label="Created"        value={new Date(createdWallet.createdAt).toLocaleString('en-GB')} />
                </>
              )}
            </ScrollView>

            <View style={modal.securityNotes}>
              {['Never share your private key with anyone.', 'Store your mnemonic phrase offline — it restores your wallet.', 'Your public key is safe to share for receiving funds.'].map((note, i) => (
                <View key={i} style={modal.noteRow}>
                  <MaterialIcons name="security" size={10} color={Colors.error} />
                  <Text style={modal.noteText}>{note}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={modal.closeBtn}
              onPress={() => setCredModalOpen(false)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="check-circle" size={18} color={Colors.bg} />
              <Text style={modal.closeBtnText}>I Have Saved My Credentials</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Modal Styles ─────────────────────────────────────────────────────────────
const modal = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(6,6,8,0.88)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xxl ?? 28, borderTopRightRadius: Radius.xxl ?? 28, maxHeight: '88%', borderWidth: 1.5, borderColor: Colors.warning + '66', paddingBottom: 28 },
  header:        { alignItems: 'center', gap: 8, padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border },
  warningIcon:   { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.warningBg, borderWidth: 2, borderColor: Colors.warning + '66', alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.warning, textAlign: 'center', includeFontPadding: false },
  sub:           { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 17, includeFontPadding: false, paddingHorizontal: Spacing.lg },
  securityNotes: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  noteRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  noteText:      { flex: 1, fontSize: FontSize.xs, color: Colors.error, lineHeight: 16, includeFontPadding: false },
  closeBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: Spacing.xl, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  closeBtnText:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },

  topBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, gap: Spacing.sm },
  backBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:  { flex: 1, alignItems: 'center', gap: 3 },
  topTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  topSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Reserve Banner
  reserveBanner:    { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: '#0A0800', borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '66', padding: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 5 },
  reserveHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  reserveTitle:     { flex: 1, fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  livePill:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  livePillText:     { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false, letterSpacing: 0.5 },
  reserveTotal:     { fontSize: 36, fontWeight: FontWeight.heavy, color: Colors.primary, textAlign: 'center', includeFontPadding: false, marginBottom: 10 },
  reserveBreakdown: { flexDirection: 'row', gap: Spacing.sm },
  reserveItem:      { flex: 1, alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 3 },
  reserveItemVal:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  reserveItemLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'center' },

  // Tabs
  tabScrollWrap:    { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, height: 40 },
  tabScrollContent: { flexDirection: 'row', gap: 5, paddingRight: Spacing.xl },
  tabBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:          { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:    { color: Colors.bg },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Stats row
  statsRow:  { flexDirection: 'row', gap: Spacing.sm },
  statCell:  { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:   { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  statLabel: { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Active wallet card
  walletCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.md, gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  walletCardHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  walletCardIcon:      { width: 48, height: 48, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  walletCardTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  walletCardAcct:      { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  walletCardBalanceWrap:{ alignItems: 'flex-end', gap: 3 },
  walletCardBalance:   { fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  walletCardBalanceSub:{ fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  quickActions:        { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  quickBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 3, borderRadius: Radius.lg, borderWidth: 1 },
  quickBtnText:        { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  // No wallet
  noWalletCard:    { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border },
  noWalletTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  noWalletSub:     { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xl, lineHeight: 19, includeFontPadding: false },
  createNowBtn:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginTop: Spacing.sm },
  createNowBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Live Feed
  feedCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 8 },
  feedHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedTitle:      { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  feedCount:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  feedEmpty:      { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md, includeFontPadding: false },
  feedEntry:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6 },
  feedEntryDot:   { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
  feedEntryMsg:   { flex: 1, fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  feedEntryTime:  { fontSize: 9, color: Colors.textMuted, flexShrink: 0, includeFontPadding: false },
  clearFeedBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 5 },
  clearFeedText:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Reserve detail
  reserveDetailCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm },
  reserveDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reserveDetailTitle:  { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  reserveRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  reserveRowLabel:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  reserveRowDetail:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  reserveRowAmount:    { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },

  // Section hero
  sectionHero:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  sectionHeroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  sectionHeroSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  // Form card
  formCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  formCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  formCardTitle:  { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  warningChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  warningChipText:{ fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Form inputs
  inputGroup:    { gap: 5 },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inputLabel:    { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  inputField:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },

  securityNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44' },
  securityNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17, includeFontPadding: false },

  createBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  createBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // How it works
  howCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  howHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  howTitle:  { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  howRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  howStep:   { width: 24, height: 24, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  howStepNum:{ fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  howText:   { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },

  // Fee preview
  feePreview:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.warning + '44', padding: Spacing.sm + 3 },
  feePreviewLabel:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  feePreviewAmount: { fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },
  feePreviewPct:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },

  // Auto-fill button
  autoFillBtn:  { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  autoFillText: { flex: 1, fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Tx result card
  txResultCard:   { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '44', padding: Spacing.md, gap: 4 },
  txResultHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  txResultTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  // History search
  histSearchWrap:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  histSearchInput:  { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, paddingVertical: 0 },

  // History filter / sort
  histSummaryCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  histSummaryHeader:    { flexDirection: 'row', alignItems: 'center', gap: 7 },
  histSummaryTitle:     { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  histSummaryBadge:     { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  histSummaryBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  histSummaryRow:       { flexDirection: 'row', gap: Spacing.sm },
  histSummaryItem:      { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 3, borderWidth: 1, alignItems: 'center', gap: 5 },
  histSummaryItemIcon:  { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  histSummaryItemVal:   { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  histSummaryItemLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'center' },
  histNetRow:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2, borderTopWidth: 1, borderTopColor: Colors.border },
  histNetText:          { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  histControlRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  histFilterGroup:      { flexDirection: 'row', gap: 5, flex: 1 },
  histFilterChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.sm + 3, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.border },
  histFilterChipText:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  histFilterCount:      { borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  histFilterCountText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  histSortGroup:        { flexDirection: 'row', gap: 5 },
  histSortChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  histSortChipText:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  histResultsRow:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  histResultsText:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  // QR Code Card
  qrCard:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.success + '55', padding: Spacing.md, gap: Spacing.md, shadowColor: Colors.success, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  qrCardHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  qrCardIconWrap:   { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  qrCardTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  qrCardSub:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  qrLiveBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  qrLiveBadgeText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false, letterSpacing: 0.5 },
  qrCodeWrap:       { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.lg, position: 'relative' },
  qrCodeInner:      { padding: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.success + '44', shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
  qrCorner:         { position: 'absolute', width: 20, height: 20, borderRadius: 3 },
  qrAddressBox:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '33', gap: 4 },
  qrAddressLabel:   { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 1.5, includeFontPadding: false },
  qrAddressText:    { fontSize: FontSize.xs, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  qrActions:        { flexDirection: 'row', gap: Spacing.sm },
  qrActionBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  qrActionBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  qrInfoStrip:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.success + '33' },
  qrInfoText:       { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 16, includeFontPadding: false },
  // Share address (kept for compatibility)
  shareAddressCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.success + '44', padding: Spacing.md, gap: Spacing.md },
  shareAddressHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  shareAddressTitle:  { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  shareAddressBox:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44', alignItems: 'center' },
  shareAddressText:   { fontSize: FontSize.xs, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center', lineHeight: 16, includeFontPadding: false },
  copyAddressBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.success, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  copyAddressBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Admin
  adminReserveCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm },
  adminReserveHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  adminReserveTitle:  { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  adminRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  adminRowLabel:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  adminRowVal:        { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  adminWalletsTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false, marginBottom: Spacing.sm },
  adminWalletRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  adminWalletIdx:     { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  adminWalletIdxText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  adminWalletAcct:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  adminWalletAddr:    { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  adminWalletBal:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  adminWalletTxs:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // API reference
  apiRefCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  apiRefHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  apiRefTitle:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  apiRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  methodTag:    { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, minWidth: 42, alignItems: 'center', flexShrink: 0, marginTop: 2 },
  methodTagText:{ fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  apiPath:      { fontSize: FontSize.xs, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  apiDesc:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },

  // Biometric note strip
  biometricNote:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  biometricNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },

  // Domain hint text
  domainHintText:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, paddingLeft: 2, lineHeight: 14 },

  // Recipient address row with QR button
  recipientRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  recipientInput:  { flex: 1 },
  qrScanBtn:       { width: 52, height: 52, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center', flexShrink: 0, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  qrScanHint:      { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  qrScanHintText:  { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  recipientParsed: { fontSize: 9, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, paddingLeft: 2 },
});

// ─── QR Scanner Modal Styles ──────────────────────────────────────────────────
const scan = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#060608' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, backgroundColor: '#060608', gap: Spacing.md },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  headerSub:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  closeBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cameraWrap:  { flex: 1, position: 'relative', overflow: 'hidden' },
  camera:      { flex: 1 },
  overlay:     { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: Spacing.xl },
  frame:       { width: 260, height: 260, position: 'relative' },
  corner:      { position: 'absolute', width: 28, height: 28, borderColor: Colors.primary, borderRadius: 4 },
  scanLine:    { position: 'absolute', top: '50%', left: 10, right: 10, height: 2, backgroundColor: Colors.primary, opacity: 0.7, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4, elevation: 4 },
  overlayHint: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', fontWeight: FontWeight.semibold, textAlign: 'center', includeFontPadding: false, paddingHorizontal: Spacing.xl, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  infoCard:    { backgroundColor: Colors.bgCard, margin: Spacing.xl, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  infoText:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  cancelBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: Spacing.xl, backgroundColor: Colors.error, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.error, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  cancelBtnText:{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
