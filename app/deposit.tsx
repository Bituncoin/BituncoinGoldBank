
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAlert, getSupabaseClient } from '@/template';
import { useWallet } from '@/contexts/WalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGButton } from '@/components';
import { PAYMENT_METHODS } from '@/constants/mockData';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { recordTransaction } from '@/services/tradingService';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { ZoneEngine } from '@/constants/zoneEngine';
import type { ZoneResolution } from '@/constants/zoneResolver';

const zoneEngine = new ZoneEngine();

const DEPOSIT_COINS = [
  { symbol: 'USDT',  name: 'Tether',        logo: '₮',  color: '#26A17B' },
  { symbol: 'BTNG',  name: 'Bituncoin Gold', logo: '🥇', color: '#D4A017' },
  { symbol: 'BTNGG', name: 'BTNG Gold Token',logo: '₿3', color: '#D4A017' },
  { symbol: 'BTC',   name: 'Bitcoin',        logo: '₿',  color: '#F7931A' },
  { symbol: 'ETH',   name: 'Ethereum',       logo: 'Ξ',  color: '#627EEA' },
];

export default function DepositScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coin: coinParam } = useLocalSearchParams<{ coin?: string }>();
  const { showAlert } = useAlert();
  const { deposit } = useWallet();
  const { user } = useAuth();

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();

  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0]);
  const [selectedCoin, setSelectedCoin] = useState(
    coinParam ? (DEPOSIT_COINS.find(c => c.symbol === coinParam) ?? DEPOSIT_COINS[0]) : DEPOSIT_COINS[0]
  );
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ amount: number; coin: string; method: string } | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);

  // ── Zone Engine state ────────────────────────────────────────────────────
  const [activeZone, setActiveZone] = useState<ZoneResolution | null>(null);
  const [zoneBlocked, setZoneBlocked] = useState<{ reason: string; maxAmount: number } | null>(null);

  // Pre-select coin from query param (handles navigating here from BTNG3 wallet card)
  useEffect(() => {
    if (coinParam) {
      const match = DEPOSIT_COINS.find(c => c.symbol === coinParam);
      if (match) setSelectedCoin(match);
    }
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

  // Live local currency conversion
  const numericAmount = parseFloat(amount) || 0;
  const localAmount = numericAmount > 0 ? convertUSDRaw(numericAmount) : 0;
  const showLocalConversion = selectedCurrency.code !== 'USD' && numericAmount > 0;
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  // ── Stripe Checkout via Edge Function ──────────────────────────────────────
  const handleStripeDeposit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 1) {
      showAlert('Invalid Amount', 'Minimum deposit is $1 USD.');
      return;
    }

    setStripeLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.functions.invoke('stripe-onramp', {
        body: { amount: amt, coin: selectedCoin.symbol, method: 'Stripe Checkout' },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const text = await error.context?.text();
            msg = text || msg;
          } catch {}
        }
        showAlert('Stripe Error', msg);
        return;
      }

      if (data?.url) {
        // Open Stripe Checkout in an in-app browser
        const result = await WebBrowser.openBrowserAsync(data.url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
        // Handle return from Stripe (deep link handled in _layout)
        if (result.type === 'cancel' || result.type === 'dismiss') {
          // User cancelled — no action needed
        }
      } else {
        showAlert('Error', 'Could not create Stripe session. Please try again.');
      }
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Stripe checkout failed.');
    } finally {
      setStripeLoading(false);
    }
  };

  const handleDeposit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 10) { showAlert('Invalid Amount', 'Minimum deposit is $10.'); return; }

    // ── Zone rule check ──────────────────────────────────────────────────────
    setZoneBlocked(null);
    if (activeZone) {
      try {
        const decision = zoneEngine.evaluateRules({
          userId:  user?.id ?? 'anon',
          zoneId:  activeZone.zoneId,
          assetId: selectedCoin.symbol,
          amount:  amt,
          action:  'DEPOSIT',
        });
        if (!decision.allowed) {
          setZoneBlocked({
            reason:    decision.reason ?? 'Zone deposit limit exceeded.',
            maxAmount: decision.maxAmount ?? 0,
          });
          return;
        }
      } catch (e) {
        console.warn('[ZoneEngine] evaluate failed:', e);
      }
    }

    // This block was previously outside the `if (!user)` check, causing an unreachable code error
    // It is moved here to be part of the conditional check
    if (!user) {
      showAlert('Sign In Required', 'Please sign in to make a deposit.');
      return;
    }

    setLoading(true);

    // Update local wallet state
    await deposit(selectedMethod.name, amt);

    // Record in trade_history as pending (awaiting payment confirmation)
    const { error } = await recordTransaction({
      userId: user.id,
      type: 'deposit',
      coin: selectedCoin.symbol,
      coinName: selectedCoin.name,
      amount: amt,
      totalUsd: amt,
      status: 'pending',
      note: `Deposit via ${selectedMethod.name}`,
    });

    // If depositing BTNGG, update btng_wallets balance in DB
    if (selectedCoin.symbol === 'BTNGG') {
      try {
        const sb = getSupabaseClient();
        const { data: existing } = await sb
          .from('btng_wallets')
          .select('balance')
          .eq('user_id', user.id)
          .maybeSingle();
        const currentBalance = existing?.balance ?? 0;
        await sb
          .from('btng_wallets')
          .update({ balance: currentBalance + amt, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } catch { /* best-effort */ }
    }

    setLoading(false);

    if (error) {
      // Still show success even if history write failed — wallet updated
      console.warn('deposit history write failed:', error);
    }

    setSubmitted({ amount: amt, coin: selectedCoin.symbol, method: selectedMethod.name });
  };

  const handleDone = () => {
    setSubmitted(null);
    router.back();
  };

  // ── Success Screen
  if (submitted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.successWrap}>
          <View style={styles.successIconWrap}>
            <MaterialIcons name="pending-actions" size={52} color={Colors.warning} />
          </View>
          <Text style={styles.successTitle}>Deposit Pending</Text>
          <Text style={styles.successSub}>
            Your deposit of ${submitted.amount.toLocaleString()} ({submitted.coin}) via {submitted.method} has been submitted.
          </Text>

          <View style={styles.successCard}>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Amount</Text>
              <Text style={styles.successVal}>${submitted.amount.toLocaleString()} {submitted.coin}</Text>
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
            <View style={[styles.successRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }]}>
              <Text style={styles.successLabel}>Processing Time</Text>
              <Text style={[styles.successVal, { color: Colors.textSecondary }]}>1–24 hours</Text>
            </View>
          </View>

          <View style={styles.infoNote}>
            <MaterialIcons name="info-outline" size={14} color={Colors.info} />
            <Text style={styles.infoNoteText}>
              Funds will appear in your wallet once payment is confirmed. You can track this in Wallet → History.
            </Text>
          </View>

          <BTNGButton title="View History" onPress={() => { setSubmitted(null); router.back(); }} variant="primary" size="lg" fullWidth />
          <TouchableOpacity onPress={handleDone} style={styles.doneLinkBtn}>
            <Text style={styles.doneLinkText}>Back to Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Deposit Funds</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Coin Select */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Select Coin</Text>
          <View style={styles.coinRow}>
            {DEPOSIT_COINS.map(c => (
              <TouchableOpacity
                key={c.symbol}
                style={[styles.coinBtn, selectedCoin.symbol === c.symbol && { borderColor: c.color, backgroundColor: c.color + '15' }]}
                onPress={() => setSelectedCoin(c)}
              >
                <Text style={styles.coinBtnLogo}>{c.logo}</Text>
                <Text style={[styles.coinBtnText, selectedCoin.symbol === c.symbol && { color: c.color, fontWeight: FontWeight.bold }]}>{c.symbol}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Amount */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Amount (USD)</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={v => { setAmount(v); setZoneBlocked(null); }}
            placeholder="0.00"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            textAlign="center"
          />

          {/* ── Zone Info Strip ── */}
          {activeZone ? (
            <View style={styles.zoneInfoStrip}>
              <View style={styles.zoneInfoLeft}>
                <MaterialIcons name="travel-explore" size={14} color={Colors.primary} />
                <Text style={styles.zoneInfoName} numberOfLines={1}>
                  {activeZone.zoneId.replace(/_/g, ' ')}
                </Text>
              </View>
              <View style={styles.zoneInfoLimits}>
                {[
                  { label: 'DEP', val: activeZone.config.maxSendAmount },
                  { label: 'SWAP', val: activeZone.config.maxSwapAmount },
                  { label: 'OUT', val: activeZone.config.maxWithdrawAmount },
                ].map(item => (
                  <View key={item.label} style={styles.zoneLimitChip}>
                    <Text style={styles.zoneLimitLabel}>{item.label}</Text>
                    <Text style={styles.zoneLimitVal}>{item.val.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

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
          ) : numericAmount > 0 && selectedCurrency.code === 'USD' ? null : (
            <Text style={styles.conversionHint}>
              Enter amount to see {selectedCurrency.code} equivalent
            </Text>
          )}

          <View style={styles.quickAmounts}>
            {['50', '100', '500', '1000'].map(a => (
              <TouchableOpacity key={a} style={styles.quickBtn} onPress={() => setAmount(a)}>
                <Text style={styles.quickBtnText}>${a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Select Payment Method</Text>
        {PAYMENT_METHODS.map(pm => (
          <TouchableOpacity
            key={pm.id}
            style={[styles.methodCard, selectedMethod.id === pm.id && styles.methodCardActive]}
            onPress={() => setSelectedMethod(pm)}
          >
            <Text style={styles.methodIcon}>{pm.icon}</Text>
            <View style={styles.methodInfo}>
              <Text style={styles.methodName}>{pm.name}</Text>
              <Text style={styles.methodCountry}>{pm.type} — {pm.country}</Text>
            </View>
            {selectedMethod.id === pm.id && <MaterialIcons name="check-circle" size={20} color={Colors.primary} />}
          </TouchableOpacity>
        ))}

        {/* ── Stripe Checkout Card ───────────────────────────────────────── */}
        <View style={styles.stripeSection}>
          <View style={styles.stripeDividerRow}>
            <View style={styles.stripeDivider} />
            <Text style={styles.stripeDividerText}>or pay with card</Text>
            <View style={styles.stripeDivider} />
          </View>

          <TouchableOpacity
            style={[styles.stripeCard, stripeLoading && { opacity: 0.65 }]}
            activeOpacity={0.88}
            onPress={handleStripeDeposit}
            disabled={stripeLoading}
          >
            <View style={styles.stripeLeft}>
              <View style={styles.stripeIconWrap}>
                {stripeLoading
                  ? <ActivityIndicator size="small" color={Colors.success} />
                  : <Text style={styles.stripeLogoText}>$</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.stripeTitleRow}>
                  <Text style={styles.stripeTitle}>
                    {stripeLoading ? 'Opening Checkout...' : 'Pay with Stripe'}
                  </Text>
                  <View style={styles.stripeSecureBadge}>
                    <MaterialIcons name="lock" size={9} color={Colors.success} />
                    <Text style={styles.stripeSecureText}>256-bit SSL</Text>
                  </View>
                </View>
                <Text style={styles.stripeSub}>Visa · Mastercard · Apple Pay · Google Pay</Text>
                <View style={styles.stripeChipsRow}>
                  {['VISA', 'MC', 'AMEX', 'Apple Pay', 'G Pay'].map(c => (
                    <View key={c} style={styles.stripeChip}>
                      <Text style={styles.stripeChipText}>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.stripeArrow}>
              <MaterialIcons name={stripeLoading ? 'hourglass-empty' : 'arrow-forward'} size={16} color={Colors.success} />
            </View>
          </TouchableOpacity>

          <View style={styles.stripeTrustRow}>
            <MaterialIcons name="verified-user" size={12} color={Colors.textMuted} />
            <Text style={styles.stripeTrustText}>Payments powered by Stripe · PCI-DSS Level 1 compliant</Text>
          </View>
        </View>

        {/* Fee Summary */}
        <View style={styles.feeCard}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Amount</Text>
            <Text style={styles.feeValue}>${amount || '0.00'}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Coin</Text>
            <Text style={styles.feeValue}>{selectedCoin.logo} {selectedCoin.symbol}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Processing Fee</Text>
            <Text style={[styles.feeValue, { color: Colors.success }]}>$0.00 (Free)</Text>
          </View>
          <View style={[styles.feeRow, styles.feeTotalRow]}>
            <Text style={styles.feeTotalLabel}>You Receive</Text>
            <View style={styles.feeTotalValueCol}>
              <Text style={styles.feeTotalValue}>${amount || '0.00'} {selectedCoin.symbol}</Text>
              {showLocalConversion && (
                <Text style={styles.feeTotalLocalValue}>
                  {selectedCurrency.flag} {selectedCurrency.symbol}
                  {localAmount >= 1000
                    ? localAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : localAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              <Text style={styles.zoneBlockTitle}>Deposit Blocked by Zone Policy</Text>
            </View>
            <Text style={styles.zoneBlockReason}>{zoneBlocked.reason}</Text>
            {zoneBlocked.maxAmount > 0 ? (
              <View style={styles.zoneBlockLimitRow}>
                <MaterialIcons name="info-outline" size={13} color="#EF4444" />
                <Text style={styles.zoneBlockLimit}>
                  Max deposit in{' '}
                  <Text style={{ fontWeight: FontWeight.heavy }}>
                    {activeZone?.zoneId.replace(/_/g, ' ')}
                  </Text>
                  {': $'}{zoneBlocked.maxAmount.toLocaleString()}
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
            <Text style={styles.authWarningText}>Sign in to save deposit history to your account.</Text>
          </View>
        )}

        <BTNGButton
          title={loading ? 'Processing...' : 'Confirm Deposit'}
          onPress={handleDeposit}
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
        />

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  content: { padding: Spacing.xl, gap: Spacing.lg },

  sectionBlock: { gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  coinRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  coinBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  coinBtnLogo: { fontSize: 16 },
  coinBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },

  amountCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md },
  amountLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  amountInput: { fontSize: 48, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', width: '100%', includeFontPadding: false },
  quickAmounts: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  quickBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  quickBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  methodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  methodCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  methodIcon: { fontSize: 28 },
  methodInfo: { flex: 1, gap: 3 },
  methodName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  methodCountry: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  feeCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  feeLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  feeValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium, includeFontPadding: false },
  feeTotalRow: { paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  feeTotalLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  feeTotalValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  authWarning: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '44' },
  authWarningText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },

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

  // Stripe section
  stripeSection: { gap: Spacing.md },
  stripeDividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stripeDivider: { flex: 1, height: 1, backgroundColor: Colors.border },
  stripeDividerText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },
  stripeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#061a0f', borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#22C55E55', gap: Spacing.md, shadowColor: '#22C55E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 5 },
  stripeLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stripeIconWrap: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#22C55E18', borderWidth: 1.5, borderColor: '#22C55E44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stripeLogoText: { fontSize: 26, fontWeight: '900', color: '#22C55E' },
  stripeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' },
  stripeTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  stripeSecureBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '44' },
  stripeSecureText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  stripeSub: { fontSize: FontSize.xs, color: '#8ac09a', includeFontPadding: false, marginBottom: 4 },
  stripeChipsRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  stripeChip: { backgroundColor: '#ffffff12', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#ffffff22' },
  stripeChipText: { fontSize: 8, fontWeight: FontWeight.bold, color: '#ffffff99', includeFontPadding: false },
  stripeArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stripeTrustRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  stripeTrustText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Local currency conversion
  localConversionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  localConversionArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '55' },
  localConversionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '44' },
  localConversionFlag: { fontSize: 15 },
  localConversionText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  liveRatePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveRateText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  conversionHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  feeTotalValueCol: { alignItems: 'flex-end', gap: 3 },
  feeTotalLocalValue: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },

  // Zone info strip
  zoneInfoStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '33', paddingHorizontal: Spacing.md, paddingVertical: 8, width: '100%' },
  zoneInfoLeft: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  zoneInfoName: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.3 },
  zoneInfoLimits: { flexDirection: 'row', gap: 5 },
  zoneLimitChip: { alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 7, paddingVertical: 3, gap: 1 },
  zoneLimitLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.4, includeFontPadding: false },
  zoneLimitVal: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Zone block banner
  zoneBlockBanner: { backgroundColor: '#EF444412', borderRadius: Radius.md, borderWidth: 1, borderColor: '#EF444455', padding: Spacing.md, gap: 8 },
  zoneBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneBlockTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#EF4444', includeFontPadding: false, flex: 1 },
  zoneBlockReason: { fontSize: FontSize.xs, color: '#FCA5A5', lineHeight: 18, includeFontPadding: false },
  zoneBlockLimitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF444420', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  zoneBlockLimit: { fontSize: FontSize.xs, color: '#FCA5A5', includeFontPadding: false, flex: 1 },
  zoneBlockKycBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 12, paddingVertical: 9, marginTop: 2 },
  zoneBlockKycText: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});
