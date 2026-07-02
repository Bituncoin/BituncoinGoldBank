// BTNG Gold — Transfer Screen
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
  Animated, Easing,
} from 'react-native';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { getSupabaseClient } from '@/template';
import { recordTransaction } from '@/services/tradingService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useDomainResolver, RESOLVABLE_DOMAINS } from '@/hooks/useDomainResolver';
import { ZoneEngine } from '@/constants/zoneEngine';
import type { ZoneResolution } from '@/constants/zoneResolver';

const zoneEngine = new ZoneEngine();

// ─── Types ────────────────────────────────────────────────────────────────────
type TransferType = 'internal' | 'external';
type InternalDirection = 'spot_to_practice' | 'practice_to_spot';

interface ConfirmationData {
  type: TransferType;
  direction?: InternalDirection;
  coin: string;
  coinIcon: string;
  amount: number;
  amountUsd: number;
  fee: number;
  recipientEmail?: string;
  recipientName?: string;
  recipientCode?: string;
  note: string;
  txId: string;
  timestamp: string;
}

// ─── Coin Options ─────────────────────────────────────────────────────────────
const TRANSFER_COINS = [
  { symbol: 'BTNG', name: 'BTNG Gold',  icon: '🪙', priceUsd: 4.20    },
  { symbol: 'USDT', name: 'Tether',     icon: '₮',  priceUsd: 1       },
  { symbol: 'BTC',  name: 'Bitcoin',    icon: '₿',  priceUsd: 67500   },
  { symbol: 'ETH',  name: 'Ethereum',   icon: 'Ξ',  priceUsd: 3480    },
  { symbol: 'BNB',  name: 'BNB',        icon: '⬡',  priceUsd: 598     },
  { symbol: 'SOL',  name: 'Solana',     icon: '◎',  priceUsd: 178     },
];

const PRACTICE_TRANSFER_FEE = 0;       // free internal
const EXTERNAL_TRANSFER_FEE_RATE = 0.001; // 0.1%

function fmt(n: number): string {
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toFixed(8).replace(/\.?0+$/, '');
}

function fmtUsd(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TransferScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const { coins, practiceBalance, executePracticeTrade } = useWallet();
  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();

  // ── State ──────────────────────────────────────────────────────────────────
  const [transferType, setTransferType] = useState<TransferType>('internal');
  const [direction, setDirection] = useState<InternalDirection>('spot_to_practice');
  const [selectedCoin, setSelectedCoin] = useState(TRANSFER_COINS[0]);
  const [showCoinPicker, setShowCoinPicker] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [recipient, setRecipient] = useState('');    // email or referral code
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [resolvedUser, setResolvedUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);

  // ── Zone Engine state ────────────────────────────────────────────────────
  const [activeZone, setActiveZone] = useState<ZoneResolution | null>(null);
  const [zoneBlocked, setZoneBlocked] = useState<{ reason: string; maxAmount: number } | null>(null);

  // ── Resolve zone on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    try {
      const profileUser = user as any;
      const country: string = profileUser?.country ?? profileUser?.registeredCountry ?? 'GH';
      const rawKyc: string = profileUser?.kyc_status ?? 'pending';
      const kycLevel: 'NONE' | 'BASIC' | 'FULL' =
        rawKyc === 'approved' ? 'FULL' :
        rawKyc === 'pending'  ? 'BASIC' : 'NONE';
      const resolution = zoneEngine.resolveZone({
        userId: user.id,
        registeredCountry: country,
        kycLevel,
        userTier: 'STANDARD',
      });
      setActiveZone(resolution);
    } catch (e) {
      console.warn('[ZoneEngine] resolve failed:', e);
    }
  }, [user?.id]);

  // ── Domain Resolver ────────────────────────────────────────────────────────
  const { resolving: domResolving, resolvedRecord: domRecord, resolveError: domError, resolve: resolveDomain, clear: clearResolver } = useDomainResolver();
  const [resolverChain, setResolverChain] = useState('BTNG');
  const [domainResolvedAddress, setDomainResolvedAddress] = useState('');

  // ── Derived ────────────────────────────────────────────────────────────────
  const amount = useMemo(() => {
    const n = parseFloat(amountText.replace(/,/g, ''));
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [amountText]);

  const amountUsd = amount * selectedCoin.priceUsd;

  // Live local currency conversion
  const localAmount = amountUsd > 0 ? convertUSDRaw(amountUsd) : 0;
  const showLocalConversion = selectedCurrency.code !== 'USD' && amountUsd > 0;
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const fee = transferType === 'internal' ? PRACTICE_TRANSFER_FEE : amount * EXTERNAL_TRANSFER_FEE_RATE;
  const netAmount = amount - fee;

  // Spot coin balance from WalletContext
  const spotCoin = coins.find(c => c.symbol === selectedCoin.symbol);
  const spotBalance = spotCoin?.balance ?? 0;

  // Max transferable
  const maxAmount = direction === 'spot_to_practice' || transferType === 'external'
    ? spotBalance
    : practiceBalance / selectedCoin.priceUsd;

  const isValid = amount > 0 && amount <= maxAmount && (
    transferType === 'internal'
      ? true
      : (!!resolvedUser && !lookupError) || !!domainResolvedAddress
  );

  // ── Lookup recipient ───────────────────────────────────────────────────────
  const lookupRecipient = useCallback(async (value: string) => {
    const trimmed = value.trim();
    setLookupError('');
    setResolvedUser(null);
    if (!trimmed) return;

    setLookupLoading(true);
    const client = getSupabaseClient();
    const isEmail = trimmed.includes('@');

    let query = client
      .from('user_profiles')
      .select('id, email, username, full_name')
      .limit(1);

    if (isEmail) {
      query = query.eq('email', trimmed);
    } else {
      query = query.eq('referral_code', trimmed.toUpperCase());
    }

    const { data, error } = await query;
    setLookupLoading(false);

    if (error || !data || data.length === 0) {
      setLookupError(isEmail ? 'No BTNG account found for this email.' : 'Invalid referral code.');
      return;
    }

    const found = data[0] as any;
    if (found.id === user?.id) {
      setLookupError('You cannot send to yourself.');
      return;
    }

    setResolvedUser({
      id: found.id,
      name: found.full_name ?? found.username ?? found.email,
      email: found.email,
    });
  }, [user?.id]);

  // ── Domain-aware recipient input handlers ──────────────────────────────────
  const handleRecipientInput = useCallback((v: string) => {
    setRecipient(v);
    setLookupError('');
    setResolvedUser(null);
    setDomainResolvedAddress('');
    const trimmed = v.trim().toLowerCase();
    if (RESOLVABLE_DOMAINS.includes(trimmed)) resolveDomain(trimmed, resolverChain);
    else clearResolver();
  }, [resolveDomain, clearResolver, resolverChain]);

  const handleAcceptResolved = useCallback((address: string) => {
    setRecipient(address);
    setDomainResolvedAddress(address);
    setLookupError('');
    setResolvedUser(null);
    clearResolver();
  }, [clearResolver]);

  // ── Submit Transfer ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!user?.id) { showAlert('Not Signed In', 'Please sign in to transfer funds.'); return; }
    if (!isValid) { showAlert('Invalid Transfer', 'Check your amount and recipient.'); return; }

    // ── Zone rule check (only for external sends) ────────────────────────────
    setZoneBlocked(null);
    if (transferType === 'external' && activeZone) {
      try {
        const decision = zoneEngine.evaluateRules({
          userId:  user.id,
          zoneId:  activeZone.zoneId,
          assetId: selectedCoin.symbol,
          amount,
          action:  'SEND',
        });
        if (!decision.allowed) {
          setZoneBlocked({
            reason:    decision.reason ?? 'Zone send limit exceeded.',
            maxAmount: decision.maxAmount ?? 0,
          });
          return;
        }
      } catch (e) {
        console.warn('[ZoneEngine] evaluate failed:', e);
      }
    }

    setLoading(true);

    try {
      const txId = `BTNG-TRF-${Date.now().toString(36).toUpperCase()}`;
      const timestamp = new Date().toISOString();

      if (transferType === 'internal') {
        // Internal: Spot ↔ Practice (no real Supabase movement, just record)
        const noteLabel = direction === 'spot_to_practice'
          ? `Internal transfer: Spot → Practice Wallet  •  ${selectedCoin.symbol}`
          : `Internal transfer: Practice Wallet → Spot  •  ${selectedCoin.symbol}`;

        // Record in trade_history as a transfer
        await recordTransaction({
          userId: user.id,
          type: 'transfer',
          coin: selectedCoin.symbol,
          coinName: selectedCoin.name,
          amount,
          totalUsd: amountUsd,
          fee: 0,
          status: 'completed',
          note: noteLabel,
        });

        // Update practice balance via WalletContext if direction touches practice wallet
        if (direction === 'spot_to_practice') {
          // Add to practice balance
          await executePracticeTrade(spotCoin?.id ?? selectedCoin.symbol.toLowerCase(), 'sell', amount);
        } else {
          // Remove from practice balance
          await executePracticeTrade(spotCoin?.id ?? selectedCoin.symbol.toLowerCase(), 'buy', amount);
        }

        setConfirmation({
          type: 'internal',
          direction,
          coin: selectedCoin.symbol,
          coinIcon: selectedCoin.icon,
          amount,
          amountUsd,
          fee: 0,
          note: noteLabel,
          txId,
          timestamp,
        });

      } else {
        // External: Send to another BTNG user or domain-resolved wallet address
        const recipientLabel = resolvedUser?.email ?? domainResolvedAddress;
        const noteLabel = memo
          ? `Sent to ${recipientLabel}  •  Memo: ${memo}`
          : `Sent to ${recipientLabel}`;

        // Record outgoing transfer for sender
        await recordTransaction({
          userId: user.id,
          type: 'transfer',
          coin: selectedCoin.symbol,
          coinName: selectedCoin.name,
          amount,
          totalUsd: amountUsd,
          fee: fee * selectedCoin.priceUsd,
          status: 'completed',
          note: noteLabel,
        });

        // Record incoming transfer + notification (only if resolved to a BTNG user profile)
        if (resolvedUser) {
          await recordTransaction({
            userId: resolvedUser.id,
            type: 'transfer',
            coin: selectedCoin.symbol,
            coinName: selectedCoin.name,
            amount: netAmount,
            totalUsd: netAmount * selectedCoin.priceUsd,
            fee: 0,
            status: 'completed',
            note: `Received from ${user.email ?? 'BTNG User'}${memo ? `  •  Memo: ${memo}` : ''}`,
          });

          const client = getSupabaseClient();
          await client.from('notifications').insert({
            user_id: resolvedUser.id,
            type: 'success',
            category: 'deposit',
            title: 'Crypto Received',
            message: `You received ${fmt(netAmount)} ${selectedCoin.symbol} (${fmtUsd(netAmount * selectedCoin.priceUsd)}) from a BTNG user.`,
          });
        }

        setConfirmation({
          type: 'external',
          coin: selectedCoin.symbol,
          coinIcon: selectedCoin.icon,
          amount,
          amountUsd,
          fee,
          recipientEmail: resolvedUser?.email ?? domainResolvedAddress,
          recipientName: resolvedUser?.name ?? domainResolvedAddress,
          note: noteLabel,
          txId,
          timestamp,
        });
      }

      // Reset form
      setAmountText('');
      setRecipient('');
      setMemo('');
      setResolvedUser(null);
      setDomainResolvedAddress('');
      clearResolver();

    } catch (err: any) {
      showAlert('Transfer Failed', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [
    user, isValid, transferType, direction, selectedCoin,
    amount, amountUsd, fee, netAmount, resolvedUser, memo,
    executePracticeTrade, spotCoin, domainResolvedAddress, clearResolver,
  ]);

  // ── Confirmation Screen ────────────────────────────────────────────────────
  if (confirmation) {
    return <ConfirmationView data={confirmation} onDone={() => { setConfirmation(null); router.back(); }} onNewTransfer={() => setConfirmation(null)} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Transfer</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Transfer Type Toggle */}
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[styles.typeBtn, transferType === 'internal' && styles.typeBtnActive]}
              onPress={() => setTransferType('internal')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="swap-horiz" size={16} color={transferType === 'internal' ? Colors.bg : Colors.textMuted} />
              <Text style={[styles.typeBtnText, transferType === 'internal' && styles.typeBtnTextActive]}>
                Internal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, transferType === 'external' && styles.typeBtnActive]}
              onPress={() => setTransferType('external')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="send" size={16} color={transferType === 'external' ? Colors.bg : Colors.textMuted} />
              <Text style={[styles.typeBtnText, transferType === 'external' && styles.typeBtnTextActive]}>
                Send to User
              </Text>
            </TouchableOpacity>
          </View>

          {/* Info Banner */}
          <View style={styles.infoBanner}>
            {transferType === 'internal' ? (
              <>
                <MaterialIcons name="info-outline" size={15} color={Colors.primary} />
                <Text style={styles.infoText}>
                  Move funds between your <Text style={styles.infoHighlight}>Spot wallet</Text> and <Text style={styles.infoHighlight}>Practice wallet</Text> instantly. No fees apply.
                </Text>
              </>
            ) : (
              <>
                <MaterialIcons name="info-outline" size={15} color={Colors.primary} />
                <Text style={styles.infoText}>
                  Send crypto to any BTNG user by email or referral code. A <Text style={styles.infoHighlight}>0.1% fee</Text> applies.
                </Text>
              </>
            )}
          </View>

          {/* ── INTERNAL: Direction Toggle ── */}
          {transferType === 'internal' && (
            <View style={styles.dirCard}>
              <Text style={styles.cardTitle}>Transfer Direction</Text>
              <View style={styles.dirRow}>
                <TouchableOpacity
                  style={[styles.dirBtn, direction === 'spot_to_practice' && styles.dirBtnActive]}
                  onPress={() => setDirection('spot_to_practice')}
                  activeOpacity={0.8}
                >
                  <View style={styles.dirBtnContent}>
                    <View style={[styles.walletBadge, direction === 'spot_to_practice' && styles.walletBadgeActive]}>
                      <MaterialIcons name="account-balance-wallet" size={18} color={direction === 'spot_to_practice' ? Colors.primary : Colors.textMuted} />
                    </View>
                    <Text style={[styles.dirLabel, direction === 'spot_to_practice' && { color: Colors.textPrimary }]}>Spot Wallet</Text>
                    <Text style={[styles.dirSub, direction === 'spot_to_practice' && { color: Colors.textSecondary }]}>→ Practice</Text>
                  </View>
                  {direction === 'spot_to_practice' && (
                    <View style={styles.dirCheck}>
                      <MaterialIcons name="check-circle" size={16} color={Colors.primary} />
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.dirArrow}>
                  <MaterialIcons name="swap-horiz" size={20} color={Colors.textMuted} />
                </View>

                <TouchableOpacity
                  style={[styles.dirBtn, direction === 'practice_to_spot' && styles.dirBtnActive]}
                  onPress={() => setDirection('practice_to_spot')}
                  activeOpacity={0.8}
                >
                  <View style={styles.dirBtnContent}>
                    <View style={[styles.walletBadge, direction === 'practice_to_spot' && styles.walletBadgeActive]}>
                      <MaterialIcons name="science" size={18} color={direction === 'practice_to_spot' ? Colors.primary : Colors.textMuted} />
                    </View>
                    <Text style={[styles.dirLabel, direction === 'practice_to_spot' && { color: Colors.textPrimary }]}>Practice</Text>
                    <Text style={[styles.dirSub, direction === 'practice_to_spot' && { color: Colors.textSecondary }]}>→ Spot Wallet</Text>
                  </View>
                  {direction === 'practice_to_spot' && (
                    <View style={styles.dirCheck}>
                      <MaterialIcons name="check-circle" size={16} color={Colors.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Balance display */}
              <View style={styles.balanceRow}>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceLabel}>Spot Balance</Text>
                  <Text style={styles.balanceValue}>
                    {fmt(spotBalance)} {selectedCoin.symbol}
                  </Text>
                  <Text style={styles.balanceUsd}>{fmtUsd(spotBalance * selectedCoin.priceUsd)}</Text>
                </View>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceLabel}>Practice Balance</Text>
                  <Text style={[styles.balanceValue, { color: Colors.success }]}>
                    {fmtUsd(practiceBalance)}
                  </Text>
                  <Text style={styles.balanceUsd}>Virtual funds</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── EXTERNAL: Recipient Input ── */}
          {transferType === 'external' && (
            <View style={styles.inputCard}>
              <Text style={styles.cardTitle}>Recipient</Text>
              <Text style={styles.inputLabel}>Email, Referral Code, or Web3 Domain</Text>
              <View style={[styles.inputRow, lookupError ? styles.inputRowError : (resolvedUser || domainResolvedAddress) ? styles.inputRowSuccess : null]}>
                <MaterialIcons
                  name={RESOLVABLE_DOMAINS.includes(recipient.trim().toLowerCase()) ? 'language' : recipient.includes('@') ? 'email' : 'tag'}
                  size={18}
                  color={lookupError ? Colors.error : (resolvedUser || domainResolvedAddress) ? Colors.success : Colors.textMuted}
                />
                <TextInput
                  style={styles.textInput}
                  value={recipient}
                  onChangeText={handleRecipientInput}
                  onBlur={() => { if (!RESOLVABLE_DOMAINS.includes(recipient.trim().toLowerCase())) lookupRecipient(recipient); }}
                  placeholder="user@email.com, BTNG-XXXX, or btng.gold"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                {lookupLoading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : recipient.length > 3 && !RESOLVABLE_DOMAINS.includes(recipient.trim().toLowerCase()) ? (
                  <TouchableOpacity onPress={() => lookupRecipient(recipient)}>
                    <MaterialIcons name="search" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Chain selector — shown only when a resolvable domain is typed */}
              {RESOLVABLE_DOMAINS.includes(recipient.trim().toLowerCase()) && (
                <View style={rcs.row}>
                  <MaterialIcons name="device-hub" size={11} color={Colors.textMuted} />
                  <Text style={rcs.label}>Resolve on:</Text>
                  {['BTNG', 'ETH', 'POLYGON', 'BTC', 'BNB', 'SOL'].map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[rcs.chip, resolverChain === c && rcs.chipActive]}
                      onPress={() => { setResolverChain(c); resolveDomain(recipient.trim().toLowerCase(), c); }}
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

              {/* Confirmed wallet from domain resolution */}
              {domainResolvedAddress && !domRecord && (
                <View style={styles.resolvedWalletStrip}>
                  <MaterialIcons name="check-circle" size={13} color={Colors.success} />
                  <Text style={styles.resolvedWalletText} numberOfLines={1} ellipsizeMode="middle">
                    {domainResolvedAddress}
                  </Text>
                  <TouchableOpacity onPress={() => { setDomainResolvedAddress(''); setRecipient(''); clearResolver(); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <MaterialIcons name="close" size={13} color={Colors.success} />
                  </TouchableOpacity>
                </View>
              )}

              {lookupError && !RESOLVABLE_DOMAINS.includes(recipient.trim().toLowerCase()) ? (
                <View style={styles.lookupError}>
                  <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                  <Text style={styles.lookupErrorText}>{lookupError}</Text>
                </View>
              ) : resolvedUser ? (
                <View style={styles.resolvedUser}>
                  <View style={styles.resolvedAvatar}>
                    <Text style={styles.resolvedAvatarText}>{resolvedUser.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resolvedName}>{resolvedUser.name}</Text>
                    <Text style={styles.resolvedEmail}>{resolvedUser.email}</Text>
                  </View>
                  <MaterialIcons name="verified-user" size={18} color={Colors.success} />
                </View>
              ) : null}

              {/* Memo */}
              <View style={{ marginTop: Spacing.md }}>
                <Text style={styles.inputLabel}>Memo (Optional)</Text>
                <View style={styles.inputRow}>
                  <MaterialIcons name="notes" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.textInput}
                    value={memo}
                    onChangeText={setMemo}
                    placeholder="Payment reason, note..."
                    placeholderTextColor={Colors.textMuted}
                    maxLength={120}
                  />
                </View>
              </View>
            </View>
          )}

          {/* ── Coin + Amount ── */}
          <View style={styles.inputCard}>
            <Text style={styles.cardTitle}>Amount</Text>

            {/* Coin Selector */}
            <Text style={styles.inputLabel}>Coin</Text>
            <TouchableOpacity
              style={styles.coinSelector}
              onPress={() => setShowCoinPicker(v => !v)}
              activeOpacity={0.8}
            >
              <View style={styles.coinLeft}>
                <View style={styles.coinIconBadge}>
                  <Text style={styles.coinIconText}>{selectedCoin.icon}</Text>
                </View>
                <View>
                  <Text style={styles.coinSymbol}>{selectedCoin.symbol}</Text>
                  <Text style={styles.coinName}>{selectedCoin.name}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.coinPrice}>{fmtUsd(selectedCoin.priceUsd)}</Text>
                <MaterialIcons name={showCoinPicker ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>

            {showCoinPicker && (
              <View style={styles.coinDropdown}>
                {TRANSFER_COINS.map(coin => (
                  <TouchableOpacity
                    key={coin.symbol}
                    style={[styles.coinOption, selectedCoin.symbol === coin.symbol && styles.coinOptionActive]}
                    onPress={() => { setSelectedCoin(coin); setShowCoinPicker(false); setAmountText(''); }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 18 }}>{coin.icon}</Text>
                      <View>
                        <Text style={[styles.coinSymbol, selectedCoin.symbol === coin.symbol && { color: Colors.primary }]}>
                          {coin.symbol}
                        </Text>
                        <Text style={styles.coinName}>{coin.name}</Text>
                      </View>
                    </View>
                    <Text style={styles.coinPrice}>{fmtUsd(coin.priceUsd)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Amount Input */}
            <View style={{ marginTop: Spacing.lg }}>
              <View style={styles.amountLabelRow}>
                <Text style={styles.inputLabel}>Amount ({selectedCoin.symbol})</Text>
                <TouchableOpacity onPress={() => setAmountText(fmt(maxAmount))}>
                  <Text style={styles.maxBtn}>MAX: {fmt(maxAmount)}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.amountInputRow, amount > maxAmount && styles.amountInputRowError]}>
                <TextInput
                  style={styles.amountInput}
                  value={amountText}
                  onChangeText={v => setAmountText(v.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                />
                <View style={styles.amountSuffix}>
                  <Text style={styles.amountSuffixText}>{selectedCoin.symbol}</Text>
                </View>
              </View>
              <Text style={styles.amountUsdText}>
                ≈ {fmtUsd(amountUsd)}
                {amount > maxAmount && <Text style={{ color: Colors.error }}>  •  Exceeds balance</Text>}
              </Text>

              {/* Live local currency conversion */}
              {showLocalConversion ? (
                <View style={styles.localConversionRow}>
                  <View style={styles.localConversionArrow}>
                    <MaterialIcons name="arrow-downward" size={12} color={Colors.primary} />
                  </View>
                  <View style={styles.localConversionBadge}>
                    <Text style={styles.localConversionFlag}>{selectedCurrency.flag}</Text>
                    <Text style={styles.localConversionText}>
                      {selectedCurrency.symbol}
                      {localAmount >= 1000
                        ? localAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })
                        : localAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {' '}{selectedCurrency.code}
                    </Text>
                  </View>
                  <View style={styles.liveRatePill}>
                    {ratesLoading ? (
                      <ActivityIndicator size="small" color={Colors.success} style={{ transform: [{ scale: 0.6 }] }} />
                    ) : (
                      <View style={styles.liveDot} />
                    )}
                    <Text style={styles.liveRateText}>
                      {rateTimestamp ? `Live · ${rateTimestamp}` : 'Live rate'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Quick Amount Presets */}
            <View style={styles.presetRow}>
              {['25%', '50%', '75%', '100%'].map(pct => {
                const val = (maxAmount * parseInt(pct) / 100);
                return (
                  <TouchableOpacity
                    key={pct}
                    style={[styles.preset, amountText === fmt(val) && styles.presetActive]}
                    onPress={() => setAmountText(fmt(val))}
                  >
                    <Text style={[styles.presetText, amountText === fmt(val) && styles.presetTextActive]}>
                      {pct}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Fee Summary */}
          {amount > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.cardTitle}>Transfer Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Amount</Text>
                <Text style={styles.summaryValue}>{fmt(amount)} {selectedCoin.symbol}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Fee</Text>
                <Text style={[styles.summaryValue, { color: fee === 0 ? Colors.success : Colors.error }]}>
                  {fee === 0 ? 'FREE' : `${fmt(fee)} ${selectedCoin.symbol}`}
                </Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryNetRow]}>
                <Text style={styles.summaryNetLabel}>Recipient receives</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.summaryNetValue}>{fmt(netAmount)} {selectedCoin.symbol}</Text>
                  <Text style={styles.summaryNetUsd}>{fmtUsd(netAmount * selectedCoin.priceUsd)}</Text>
                  {showLocalConversion && netAmount > 0 && (
                    <Text style={styles.summaryNetLocal}>
                      {selectedCurrency.flag} {selectedCurrency.symbol}
                      {(() => {
                        const v = convertUSDRaw(netAmount * selectedCoin.priceUsd);
                        return v >= 1000
                          ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
                          : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()} {selectedCurrency.code}
                    </Text>
                  )}
                </View>
              </View>

              {transferType === 'internal' && (
                <View style={styles.internalNote}>
                  <MaterialIcons name="swap-horiz" size={14} color={Colors.primary} />
                  <Text style={styles.internalNoteText}>
                    {direction === 'spot_to_practice'
                      ? `Moving from your Spot wallet to Practice wallet`
                      : `Moving from Practice wallet to your Spot wallet`}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Zone Block Banner ─────────────────────────────────────────── */}
          {zoneBlocked ? (
            <View style={styles.zoneBlockBanner}>
              <View style={styles.zoneBlockHeader}>
                <MaterialIcons name="block" size={18} color="#EF4444" />
                <Text style={styles.zoneBlockTitle}>Transfer Blocked by Zone Policy</Text>
              </View>
              <Text style={styles.zoneBlockReason}>{zoneBlocked.reason}</Text>
              {zoneBlocked.maxAmount > 0 ? (
                <View style={styles.zoneBlockLimitRow}>
                  <MaterialIcons name="info-outline" size={13} color="#EF4444" />
                  <Text style={styles.zoneBlockLimit}>
                    Max send in{' '}
                    <Text style={{ fontWeight: FontWeight.heavy }}>
                      {activeZone?.zoneId.replace(/_/g, ' ')}
                    </Text>
                    {': '}{zoneBlocked.maxAmount.toLocaleString()} {selectedCoin.symbol}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.zoneBlockKycBtn}
                onPress={() => router.push('/kyc' as any)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="verified-user" size={14} color={Colors.primary} />
                <Text style={styles.zoneBlockKycText}>Upgrade KYC to unlock higher limits</Text>
                <MaterialIcons name="arrow-forward" size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, (!isValid || loading) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.bg} />
            ) : (
              <>
                <MaterialIcons
                  name={transferType === 'internal' ? 'swap-horiz' : 'send'}
                  size={20}
                  color={Colors.bg}
                />
                <Text style={styles.submitBtnText}>
                  {transferType === 'internal' ? 'Transfer Now' : `Send ${selectedCoin.symbol}`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <MaterialIcons name="lock" size={14} color={Colors.textMuted} />
            <Text style={styles.securityNoteText}>
              Transfers are processed securely. External transfers are irreversible once confirmed.
            </Text>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Confirmation View ────────────────────────────────────────────────────────
function ConfirmationView({
  data,
  onDone,
  onNewTransfer,
}: {
  data: ConfirmationData;
  onDone: () => void;
  onNewTransfer: () => void;
}) {
  const insets = useSafeAreaInsets();

  const isInternal = data.type === 'internal';
  const dirLabel = data.direction === 'spot_to_practice'
    ? 'Spot → Practice'
    : 'Practice → Spot';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingTop: Spacing.xl }]}>

        {/* Success Icon */}
        <View style={styles.confirmHero}>
          <View style={styles.confirmIconRing}>
            <MaterialIcons name="check-circle" size={52} color={Colors.success} />
          </View>
          <Text style={styles.confirmTitle}>Transfer Successful!</Text>
          <Text style={styles.confirmSub}>
            {isInternal
              ? `${fmt(data.amount)} ${data.coin} moved (${dirLabel})`
              : `${fmt(data.amount)} ${data.coin} sent to ${data.recipientName ?? data.recipientEmail}`}
          </Text>
        </View>

        {/* Transfer Card */}
        <View style={styles.confirmCard}>
          {/* Header */}
          <View style={styles.confirmCardHeader}>
            <View style={styles.confirmCoinBadge}>
              <Text style={{ fontSize: 28 }}>{data.coinIcon}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.confirmCoinAmount}>{fmt(data.amount)} {data.coin}</Text>
              <Text style={styles.confirmCoinUsd}>{fmtUsd(data.amountUsd)}</Text>
            </View>
            <View style={[styles.confirmStatusBadge]}>
              <MaterialIcons name="check" size={13} color={Colors.success} />
              <Text style={styles.confirmStatusText}>Completed</Text>
            </View>
          </View>

          <View style={styles.confirmDivider} />

          {/* Details */}
          <View style={styles.confirmDetails}>
            {[
              { label: 'Transaction ID', value: data.txId, mono: true },
              { label: 'Date & Time', value: new Date(data.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), mono: false },
              { label: 'Type', value: isInternal ? `Internal (${dirLabel})` : 'External Transfer', mono: false },
              ...(data.recipientEmail ? [
                { label: 'Recipient', value: data.recipientName ?? data.recipientEmail, mono: false },
                { label: 'Email', value: data.recipientEmail, mono: false },
              ] : []),
              { label: 'Fee', value: data.fee === 0 ? 'FREE' : `${fmt(data.fee)} ${data.coin}`, mono: false },
              {
                label: 'Net Received',
                value: `${fmt(data.amount - data.fee)} ${data.coin} = ${fmtUsd((data.amount - data.fee) * (data.amountUsd / (data.amount || 1)))}`,
                mono: false,
              },
            ].map((row, i) => (
              <View key={i} style={[styles.confirmDetailRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                <Text style={styles.confirmDetailLabel}>{row.label}</Text>
                <Text
                  style={[styles.confirmDetailValue, row.mono && {
                    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                    fontSize: FontSize.xs, letterSpacing: 0.5,
                  }]}
                  numberOfLines={1}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Note */}
        {!isInternal && (
          <View style={styles.confirmNote}>
            <MaterialIcons name="info-outline" size={14} color={Colors.primary} />
            <Text style={styles.confirmNoteText}>
              The recipient has been notified. The transfer has been recorded in both transaction histories.
            </Text>
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity style={styles.submitBtn} onPress={onDone}>
          <MaterialIcons name="account-balance-wallet" size={18} color={Colors.bg} />
          <Text style={styles.submitBtnText}>Back to Wallet</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.newTransferBtn} onPress={onNewTransfer}>
          <MaterialIcons name="swap-horiz" size={16} color={Colors.primary} />
          <Text style={styles.newTransferBtnText}>New Transfer</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
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
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  content: { paddingHorizontal: Spacing.xl, paddingBottom: 24, gap: Spacing.xl },

  typeToggle: {
    flexDirection: 'row', backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg, padding: 4, borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: Radius.md,
  },
  typeBtnActive: { backgroundColor: Colors.primary },
  typeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  typeBtnTextActive: { color: Colors.bg },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primary + '33', padding: Spacing.md,
  },
  infoText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  infoHighlight: { color: Colors.primary, fontWeight: FontWeight.semibold },

  // Cards
  dirCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.lg,
  },
  inputCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.sm,
  },
  summaryCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.primary + '33', padding: Spacing.xl, gap: Spacing.md,
  },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 4, includeFontPadding: false },

  // Direction
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dirBtn: {
    flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md,
    position: 'relative',
  },
  dirBtnActive: { borderColor: Colors.primary },
  dirBtnContent: { alignItems: 'center', gap: 5 },
  walletBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  walletBadgeActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  dirLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  dirSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  dirArrow: { alignItems: 'center', justifyContent: 'center' },
  dirCheck: { position: 'absolute', top: 8, right: 8 },

  balanceRow: {
    flexDirection: 'row', backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  balanceItem: { flex: 1, alignItems: 'center', gap: 3 },
  balanceLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  balanceValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  balanceUsd: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  balanceDivider: { width: 1, backgroundColor: Colors.border },

  // Recipient Input
  inputLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.4, marginBottom: 5, includeFontPadding: false },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  inputRowError: { borderColor: Colors.error },
  inputRowSuccess: { borderColor: Colors.success },
  textInput: {
    flex: 1, fontSize: FontSize.md, color: Colors.textPrimary,
    includeFontPadding: false, paddingVertical: 4,
  },
  lookupError: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  lookupErrorText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  resolvedUser: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.successBg, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.success + '44',
    padding: Spacing.md, marginTop: 6,
  },
  resolvedAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.success + '33', borderWidth: 1, borderColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  resolvedAvatarText: { fontSize: 16, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  resolvedName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  resolvedEmail: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },

  // Coin Selector
  coinSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  coinLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinIconBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  coinIconText: { fontSize: 18 },
  coinSymbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  coinName: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  coinPrice: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  coinDropdown: {
    marginTop: Spacing.sm, backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  coinOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  coinOptionActive: { backgroundColor: Colors.primaryGlow },

  // Amount
  amountLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  maxBtn: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  amountInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 2, borderColor: Colors.primary + '66', overflow: 'hidden',
  },
  amountInputRowError: { borderColor: Colors.error },
  amountInput: {
    flex: 1, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    fontSize: 22, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false,
  },
  amountSuffix: {
    backgroundColor: Colors.primaryGlow, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderLeftWidth: 1, borderLeftColor: Colors.primary + '44',
    minWidth: 64, alignItems: 'center', justifyContent: 'center',
  },
  amountSuffixText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  amountUsdText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 5, includeFontPadding: false },

  // Local currency conversion
  localConversionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  localConversionArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '55' },
  localConversionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '44' },
  localConversionFlag: { fontSize: 15 },
  localConversionText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  liveRatePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveRateText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  summaryNetLocal: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },

  presetRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  preset: {
    flex: 1, paddingVertical: 7, borderRadius: Radius.full, alignItems: 'center',
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
  },
  presetActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  presetText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  presetTextActive: { color: Colors.primary },

  // Summary
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  summaryValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  summaryNetRow: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: Spacing.md, marginTop: 5,
  },
  summaryNetLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  summaryNetValue: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  summaryNetUsd: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  internalNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  internalNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2, minHeight: 52,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  newTransferBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: Spacing.md,
  },
  newTransferBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  securityNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  securityNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },

  // Zone block banner
  zoneBlockBanner: { backgroundColor: '#EF444412', borderRadius: Radius.md, borderWidth: 1, borderColor: '#EF444455', padding: Spacing.md, gap: 8 },
  zoneBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneBlockTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#EF4444', includeFontPadding: false, flex: 1 },
  zoneBlockReason: { fontSize: FontSize.xs, color: '#FCA5A5', lineHeight: 18, includeFontPadding: false },
  zoneBlockLimitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF444420', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  zoneBlockLimit: { fontSize: FontSize.xs, color: '#FCA5A5', includeFontPadding: false, flex: 1 },
  zoneBlockKycBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 12, paddingVertical: 9, marginTop: 2 },
  zoneBlockKycText: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Confirmation View
  confirmHero: {
    alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  confirmIconRing: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.successBg, borderWidth: 3, borderColor: Colors.success + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontSize: 24, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  confirmSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false, maxWidth: 280 },

  confirmCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.success + '44',
    overflow: 'hidden',
  },
  confirmCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.xl, backgroundColor: Colors.successBg,
  },
  confirmCoinBadge: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.success + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmCoinAmount: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  confirmCoinUsd: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  confirmStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success + '22', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.success + '44',
  },
  confirmStatusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  confirmDivider: { height: 1, backgroundColor: Colors.border },
  confirmDetails: { padding: Spacing.xl, gap: 0 },
  confirmDetailRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  confirmDetailLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  confirmDetailValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, maxWidth: 200, textAlign: 'right', includeFontPadding: false },

  confirmNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primary + '33', padding: Spacing.md,
  },
  confirmNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  resolvedWalletStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '44', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 1, marginTop: 4 },
  resolvedWalletText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});
