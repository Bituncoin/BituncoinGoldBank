import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAlert, getSupabaseClient } from '@/template';
import { useWallet } from '@/contexts/WalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { ZoneEngine } from '@/constants/zoneEngine';
import type { ZoneResolution } from '@/constants/zoneResolver';
import { BTNGButton } from '@/components';
import { PAYMENT_METHODS } from '@/constants/mockData';
import { recordTransaction } from '@/services/tradingService';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';

const NETWORK_FEE = 0.5;
const zoneEngine = new ZoneEngine();

export default function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coin: coinParam } = useLocalSearchParams<{ coin?: string }>();
  const { showAlert } = useAlert();
  const { coins, withdraw } = useWallet();
  const { user } = useAuth();

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();

  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0]);
  const [selectedCoin, setSelectedCoin] = useState(coinParam ?? 'USDT');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ amount: number; coin: string; method: string; address: string } | null>(null);

  // ── Zone Engine state ────────────────────────────────────────────────────
  const [activeZone, setActiveZone] = useState<ZoneResolution | null>(null);
  const [zoneBlocked, setZoneBlocked] = useState<{ reason: string; maxAmount: number } | null>(null);

  // Pre-select coin from query param (handles navigating here from BTNG3 wallet card)
  useEffect(() => {
    if (coinParam) setSelectedCoin(coinParam);
  }, [coinParam]);

  // ── Resolve zone on mount from user profile ───────────────────────────────
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

  // ── Declare derived coin values FIRST before any computations that reference them ──
  const ownedCoins = coins.filter(c => c.isOwned && c.balance > 0);
  const ownedCoin = coins.find(c => c.symbol === selectedCoin);

  // Live local currency conversion
  const numericAmount = parseFloat(amount) || 0;
  const amountInUSD = ownedCoin ? numericAmount * ownedCoin.price : numericAmount;
  const localAmount = amountInUSD > 0 ? convertUSDRaw(amountInUSD) : 0;
  const showLocalConversion = selectedCurrency.code !== 'USD' && amountInUSD > 0;
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;
  const parsedAmount = parseFloat(amount) || 0;
  const youReceive = Math.max(0, parsedAmount - NETWORK_FEE);
  const youReceiveUSD = ownedCoin ? youReceive * ownedCoin.price : youReceive;
  const localReceive = youReceiveUSD > 0 ? convertUSDRaw(youReceiveUSD) : 0;

  const handleWithdraw = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 10) { showAlert('Invalid Amount', 'Minimum withdrawal is $10.'); return; }
    if (!address.trim()) { showAlert('Missing Address', 'Please enter a wallet address or account number.'); return; }

    // ── Zone rule check ──────────────────────────────────────────────────────
    setZoneBlocked(null);
    if (activeZone) {
      try {
        const decision = zoneEngine.evaluateRules({
          userId: user?.id ?? 'anon',
          zoneId: activeZone.zoneId,
          assetId: selectedCoin === 'BTNGG' ? 'BTNGG' : selectedCoin,
          amount: amt,
          action: 'WITHDRAW',
        });
        if (!decision.allowed) {
          setZoneBlocked({
            reason: decision.reason ?? 'Zone withdrawal limit exceeded.',
            maxAmount: decision.maxAmount ?? 0,
          });
          return;
        }
      } catch (e) {
        console.warn('[ZoneEngine] evaluate failed:', e);
      }
    }

    if (ownedCoin && amt > ownedCoin.balance) {
      showAlert('Insufficient Balance', `You only have ${ownedCoin.balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${selectedCoin} available.`);
      return;
    }
    if (!user?.id) {
      showAlert('Sign In Required', 'Please sign in to make a withdrawal.');
      return;
    }

    setLoading(true);

    // Update local wallet state
    await withdraw(selectedMethod.name, amt, selectedCoin);

    // Record in trade_history as pending
    const { error } = await recordTransaction({
      userId: user.id,
      type: 'withdraw',
      coin: selectedCoin,
      coinName: ownedCoin?.name ?? selectedCoin,
      amount: amt,
      totalUsd: amt,
      fee: NETWORK_FEE,
      status: 'pending',
      note: `Withdrawal via ${selectedMethod.name} to ${address.length > 16 ? address.slice(0, 12) + '...' : address}`,
    });

    // If withdrawing BTNGG, deduct from btng_wallets balance in DB
    if (selectedCoin === 'BTNGG') {
      try {
        const sb = getSupabaseClient();
        const { data: existing } = await sb
          .from('btng_wallets')
          .select('balance')
          .eq('user_id', user.id)
          .maybeSingle();
        const currentBalance = existing?.balance ?? 0;
        const newBalance = Math.max(0, currentBalance - amt);
        await sb
          .from('btng_wallets')
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } catch { /* best-effort */ }
    }

    setLoading(false);

    if (error) {
      console.warn('withdraw history write failed:', error);
    }

    setSubmitted({ amount: amt, coin: selectedCoin, method: selectedMethod.name, address });
  };

  // ── Success Screen
  if (submitted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.successWrap}>
          <View style={styles.successIconWrap}>
            <MaterialIcons name="schedule-send" size={52} color={Colors.warning} />
          </View>
          <Text style={styles.successTitle}>Withdrawal Submitted</Text>
          <Text style={styles.successSub}>
            Your withdrawal is being processed. Funds will arrive within 1–24 hours.
          </Text>

          <View style={styles.successCard}>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Amount</Text>
              <Text style={styles.successVal}>{submitted.amount.toLocaleString()} {submitted.coin}</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Network Fee</Text>
              <Text style={[styles.successVal, { color: Colors.textMuted }]}>−$0.50</Text>
            </View>
            <View style={[styles.successRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm }]}>
              <Text style={styles.successLabel}>You Receive</Text>
              <Text style={[styles.successVal, { color: Colors.primary }]}>
                {Math.max(0, submitted.amount - NETWORK_FEE).toFixed(2)} {submitted.coin}
              </Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Method</Text>
              <Text style={styles.successVal}>{submitted.method}</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Status</Text>
              <View style={styles.pendingChip}>
                <View style={[styles.statusDot, { backgroundColor: Colors.warning }]} />
                <Text style={[styles.statusChipText, { color: Colors.warning }]}>Pending</Text>
              </View>
            </View>
          </View>

          <View style={styles.infoNote}>
            <MaterialIcons name="verified-user" size={14} color={Colors.success} />
            <Text style={styles.infoNoteText}>
              Your withdrawal is secured by BTNG escrow. Track the status in Wallet → History.
            </Text>
          </View>

          <BTNGButton title="View History" onPress={() => { setSubmitted(null); router.back(); }} variant="primary" size="lg" fullWidth />
          <TouchableOpacity onPress={() => { setSubmitted(null); router.back(); }} style={styles.doneLinkBtn}>
            <Text style={styles.doneLinkText}>Back to Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Withdraw Funds</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Coin Select */}
          {ownedCoins.length > 0 ? (
            <View style={styles.coinSelectRow}>
              {ownedCoins.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.coinBtn, selectedCoin === c.symbol && { borderColor: c.color, backgroundColor: c.color + '15' }]}
                  onPress={() => setSelectedCoin(c.symbol)}
                >
                  <Text style={styles.coinBtnLogo}>{c.logo}</Text>
                  <Text style={[styles.coinBtnText, selectedCoin === c.symbol && { color: c.color, fontWeight: FontWeight.bold }]}>
                    {c.symbol}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.noCoinCard}>
              <MaterialIcons name="account-balance-wallet" size={32} color={Colors.textMuted} />
              <Text style={styles.noCoinText}>No coins to withdraw. Make a deposit first.</Text>
            </View>
          )}

          {ownedCoin && (
            <View style={styles.balanceInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.balanceLabel}>Available Balance</Text>
              </View>
              <TouchableOpacity onPress={() => setAmount(String(ownedCoin.balance))}>
                <Text style={styles.balanceValue}>
                  {ownedCoin.balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} {selectedCoin}
                  {'  '}<Text style={styles.maxLabel}>MAX</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Amount */}
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Amount ({selectedCoin})</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              textAlign="center"
            />
            {parsedAmount > 0 && ownedCoin && (
              <Text style={[styles.usdEstimate, parsedAmount > ownedCoin.balance && { color: Colors.error }]}>
                {parsedAmount > ownedCoin.balance
                  ? `Exceeds balance of ${ownedCoin.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${selectedCoin}`
                  : `≈ $${(parsedAmount * ownedCoin.price).toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`
                }
              </Text>
            )}

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

          {/* Destination */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Wallet Address / Account Number</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="0x... or MoMo number"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Method */}
          <Text style={styles.sectionTitle}>Withdrawal Method</Text>
          {PAYMENT_METHODS.slice(0, 4).map(pm => (
            <TouchableOpacity
              key={pm.id}
              style={[styles.methodCard, selectedMethod.id === pm.id && styles.methodCardActive]}
              onPress={() => setSelectedMethod(pm)}
            >
              <Text style={styles.methodIcon}>{pm.icon}</Text>
              <View style={styles.methodInfo}>
                <Text style={styles.methodName}>{pm.name}</Text>
                <Text style={styles.methodMeta}>{pm.type} — Processing: 1–24h</Text>
              </View>
              {selectedMethod.id === pm.id && <MaterialIcons name="check-circle" size={20} color={Colors.primary} />}
            </TouchableOpacity>
          ))}

          {/* Fee Summary */}
          <View style={styles.feeCard}>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Withdraw Amount</Text>
              <Text style={styles.feeValue}>{amount || '0'} {selectedCoin}</Text>
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Network Fee</Text>
              <Text style={[styles.feeValue, { color: Colors.error }]}>−$0.50</Text>
            </View>
            <View style={[styles.feeRow, styles.feeTotalRow]}>
              <Text style={styles.feeTotalLabel}>You Receive</Text>
              <View style={styles.feeTotalValueCol}>
                <Text style={styles.feeTotalValue}>
                  {parsedAmount > 0 ? youReceive.toFixed(2) : '0.00'} {selectedCoin}
                </Text>
                {showLocalConversion && parsedAmount > 0 && (
                  <Text style={styles.feeTotalLocalValue}>
                    {selectedCurrency.flag} {selectedCurrency.symbol}
                    {localReceive >= 1000
                      ? localReceive.toLocaleString('en-US', { maximumFractionDigits: 0 })
                      : localReceive.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {' '}{selectedCurrency.code}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* ── Zone Block Banner ───────────────────────────────────────────────── */}
          {zoneBlocked ? (
            <View style={styles.zoneBlockBanner}>
              <View style={styles.zoneBlockHeader}>
                <MaterialIcons name="block" size={18} color="#EF4444" />
                <Text style={styles.zoneBlockTitle}>Withdrawal Blocked by Zone Policy</Text>
              </View>
              <Text style={styles.zoneBlockReason}>{zoneBlocked.reason}</Text>
              {zoneBlocked.maxAmount > 0 ? (
                <View style={styles.zoneBlockLimitRow}>
                  <MaterialIcons name="info-outline" size={13} color="#EF4444" />
                  <Text style={styles.zoneBlockLimit}>
                    Max allowed in{' '}
                    <Text style={{ fontWeight: FontWeight.heavy }}>
                      {activeZone?.zoneId.replace(/_/g, ' ')}
                    </Text>
                    {': '}{zoneBlocked.maxAmount.toLocaleString()} BTNGG
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

          {!user && (
            <View style={styles.authWarning}>
              <MaterialIcons name="lock-outline" size={14} color={Colors.warning} />
              <Text style={styles.authWarningText}>Sign in to save withdrawal history to your account.</Text>
            </View>
          )}

          <BTNGButton
            title={loading ? 'Processing...' : 'Confirm Withdrawal'}
            onPress={handleWithdraw}
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
          />

          <View style={styles.securityNote}>
            <MaterialIcons name="verified-user" size={13} color={Colors.success} />
            <Text style={styles.securityNoteText}>
              All withdrawals are reviewed for security. Large withdrawals may require additional verification.
            </Text>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  content: { padding: Spacing.xl, gap: Spacing.lg },

  coinSelectRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  coinBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  coinBtnLogo: { fontSize: 16 },
  coinBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary, includeFontPadding: false },

  noCoinCard: { alignItems: 'center', padding: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  noCoinText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  balanceInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  balanceLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  balanceValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  maxLabel: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold },

  amountCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  amountLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  amountInput: { fontSize: 40, fontWeight: FontWeight.heavy, color: Colors.textPrimary, width: '100%', includeFontPadding: false },
  usdEstimate: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Local currency conversion
  localConversionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  localConversionArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '55' },
  localConversionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '44' },
  localConversionFlag: { fontSize: 15 },
  localConversionText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  liveRatePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveRateText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  feeTotalValueCol: { alignItems: 'flex-end', gap: 3 },
  feeTotalLocalValue: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },

  inputGroup: { gap: 6 },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  input: { backgroundColor: Colors.bgCard, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 50 },

  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  methodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  methodCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  methodIcon: { fontSize: 28 },
  methodInfo: { flex: 1, gap: 3 },
  methodName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  methodMeta: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  feeCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  feeLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  feeValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium, includeFontPadding: false },
  feeTotalRow: { paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  feeTotalLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  feeTotalValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  authWarning: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '44' },
  authWarningText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },

  securityNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.success + '44' },
  securityNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 16, includeFontPadding: false },

  // Zone block banner
  zoneBlockBanner: { backgroundColor: '#EF444412', borderRadius: Radius.md, borderWidth: 1, borderColor: '#EF444455', padding: Spacing.md, gap: 8 },
  zoneBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneBlockTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#EF4444', includeFontPadding: false, flex: 1 },
  zoneBlockReason: { fontSize: FontSize.xs, color: '#FCA5A5', lineHeight: 18, includeFontPadding: false },
  zoneBlockLimitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF444420', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  zoneBlockLimit: { fontSize: FontSize.xs, color: '#FCA5A5', includeFontPadding: false, flex: 1 },
  zoneBlockKycBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 12, paddingVertical: 9, marginTop: 2 },
  zoneBlockKycText: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Success state
  successWrap: { flex: 1, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  successIconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.warningBg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.warning + '55' },
  successTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  successSub: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, includeFontPadding: false, maxWidth: 300 },
  successCard: { width: '100%', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  successRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  successLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  successVal: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  pendingChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.warning + '44' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, width: '100%' },
  infoNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  doneLinkBtn: { paddingVertical: Spacing.sm },
  doneLinkText: { fontSize: FontSize.sm, color: Colors.textMuted, textDecorationLine: 'underline', includeFontPadding: false },
});
