import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { useWallet } from '@/contexts/WalletContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGButton, MiniChart } from '@/components';
import { COINS, CHART_POINTS_24H } from '@/constants/mockData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';

export default function PracticeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { practiceBalance, executePracticeTrade } = useWallet();
  const { showAlert } = useAlert();
  const [selectedCoin, setSelectedCoin] = useState(COINS[0]);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [tradeHistory, setTradeHistory] = useState<Array<{ coin: string; type: string; amount: number; price: number; pnl: number }>>([]);

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { getRate, loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();
  const showLocalConversion = selectedCurrency.code !== 'USD';
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  // Pulse animation for the live dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const liveRate = showLocalConversion ? getRate(selectedCurrency.code) : 1;
  const localBalance = convertUSDRaw(practiceBalance);

  // Cumulative P&L from trade history
  const totalPnl = tradeHistory.reduce((sum, t) => sum + t.pnl, 0);
  const localTotalPnl = convertUSDRaw(Math.abs(totalPnl));

  const handlePracticeTrade = async () => {
    const qty = parseFloat(amount);
    if (!qty || qty <= 0) { showAlert('Invalid Amount', 'Please enter a valid amount.'); return; }
    setLoading(true);
    const result = await executePracticeTrade(selectedCoin.id, side, qty);
    setLoading(false);
    if (result.success) {
      const pnl = (Math.random() - 0.45) * qty * selectedCoin.price * 0.05;
      setTradeHistory(prev => [{
        coin: selectedCoin.symbol,
        type: side,
        amount: qty,
        price: selectedCoin.price,
        pnl,
      }, ...prev.slice(0, 9)]);
      setAmount('');
      showAlert('Practice Trade', result.message);
    } else {
      showAlert('Trade Failed', result.message);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Practice Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Binary Trading Banner */}
        <TouchableOpacity style={styles.binaryBanner} onPress={() => router.push('/binary-trading' as any)} activeOpacity={0.85}>
          <View style={styles.binaryBannerLeft}>
            <View style={styles.binaryBannerIcon}>
              <MaterialIcons name="trending-up" size={20} color={Colors.bg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.binaryBannerTitle}>Binary Trading</Text>
              <Text style={styles.binaryBannerSub}>UP or DOWN · 85% payout · Practice mode</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={Colors.primary} />
        </TouchableOpacity>

        {/* Practice Balance */}
        <View style={styles.balanceCard}>
          <View style={styles.practiceBadge}>
            <MaterialIcons name="science" size={14} color={Colors.warning} />
            <Text style={styles.practiceBadgeText}>PRACTICE MODE — No Real Money</Text>
          </View>
          <Text style={styles.balanceLabel}>Virtual Balance</Text>
          <Text style={styles.balanceValue}>${practiceBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>

          {/* Local currency equivalent */}
          {showLocalConversion && localBalance > 0 && (
            <View style={styles.localBalanceBlock}>
              <View style={styles.localBalanceRow}>
                <Text style={styles.localBalanceFlag}>{selectedCurrency.flag}</Text>
                <Text style={styles.localBalanceText}>
                  {selectedCurrency.symbol}{localBalance >= 1000
                    ? localBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : localBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={styles.localBalanceCode}>{selectedCurrency.code}</Text>
              </View>
              <View style={styles.liveRateRow}>
                <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                <Text style={styles.liveRateLabel}>Live rate</Text>
                <Text style={styles.liveRateValue}>
                  1 USD = {liveRate >= 1000
                    ? liveRate.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : liveRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedCurrency.code}
                </Text>
                {rateTimestamp && <Text style={styles.liveRateTime}>· {rateTimestamp}</Text>}
              </View>
            </View>
          )}

          {/* Session P&L summary */}
          {tradeHistory.length > 0 && (
            <View style={[styles.sessionPnlRow, { backgroundColor: totalPnl >= 0 ? Colors.successBg : Colors.errorBg, borderColor: (totalPnl >= 0 ? Colors.success : Colors.error) + '44' }]}>
              <MaterialIcons
                name={totalPnl >= 0 ? 'trending-up' : 'trending-down'}
                size={14}
                color={totalPnl >= 0 ? Colors.success : Colors.error}
              />
              <Text style={[styles.sessionPnlText, { color: totalPnl >= 0 ? Colors.success : Colors.error }]}>
                Session P&L: {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(2)}
              </Text>
              {showLocalConversion && (
                <View style={[styles.pnlLocalBadge, { borderColor: (totalPnl >= 0 ? Colors.success : Colors.error) + '44' }]}>
                  <Text style={styles.pnlLocalFlag}>{selectedCurrency.flag}</Text>
                  <Text style={[styles.pnlLocalText, { color: totalPnl >= 0 ? Colors.success : Colors.error }]}>
                    {totalPnl >= 0 ? '+' : '-'}{selectedCurrency.symbol}{localTotalPnl >= 1000
                      ? localTotalPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })
                      : localTotalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.resetBtn} onPress={() => showAlert('Reset Balance', 'Reset your practice balance back to $100,000?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', onPress: () => showAlert('Reset', 'Balance reset to $100,000') },
          ])}>
            <MaterialIcons name="refresh" size={14} color={Colors.textMuted} />
            <Text style={styles.resetText}>Reset to $100,000</Text>
          </TouchableOpacity>
        </View>

        {/* Coin Select */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coinScroll} contentContainerStyle={styles.coinScrollContent}>
          {COINS.slice(0, 6).map(c => (
            <TouchableOpacity key={c.id} style={[styles.coinOption, selectedCoin.id === c.id && styles.coinOptionActive]} onPress={() => setSelectedCoin(c)}>
              <Text style={styles.coinOptionLogo}>{c.logo}</Text>
              <Text style={[styles.coinOptionSymbol, selectedCoin.id === c.id && { color: Colors.primary }]}>{c.symbol}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartCoinInfo}>
            <Text style={styles.chartCoinName}>{selectedCoin.name}</Text>
            <Text style={styles.chartCoinPrice}>${selectedCoin.price >= 1000 ? selectedCoin.price.toLocaleString() : selectedCoin.price.toFixed(4)}</Text>
          </View>
          <MiniChart data={CHART_POINTS_24H} width={320} height={120} color={Colors.primary} showFill />
        </View>

        {/* Trade Panel */}
        <View style={styles.tradePanel}>
          <View style={styles.sideRow}>
            <TouchableOpacity style={[styles.sideBtn, side === 'buy' && styles.sideBtnBuy]} onPress={() => setSide('buy')}>
              <MaterialIcons name="trending-up" size={18} color={side === 'buy' ? '#fff' : Colors.textMuted} />
              <Text style={[styles.sideBtnText, side === 'buy' && { color: '#fff' }]}>BUY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sideBtn, side === 'sell' && styles.sideBtnSell]} onPress={() => setSide('sell')}>
              <MaterialIcons name="trending-down" size={18} color={side === 'sell' ? '#fff' : Colors.textMuted} />
              <Text style={[styles.sideBtnText, side === 'sell' && { color: '#fff' }]}>SELL</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Amount ({selectedCoin.symbol})</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Estimated Cost</Text>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text style={styles.summaryValue}>{amount ? `$${(parseFloat(amount) * selectedCoin.price).toFixed(2)}` : '--'}</Text>
              {showLocalConversion && amount && parseFloat(amount) > 0 && (() => {
                const costUsd = parseFloat(amount) * selectedCoin.price;
                const localCost = convertUSDRaw(costUsd);
                return (
                  <View style={styles.costLocalBadge}>
                    <Text style={styles.costLocalFlag}>{selectedCurrency.flag}</Text>
                    <Text style={styles.costLocalText}>
                      {selectedCurrency.symbol}{localCost >= 1000
                        ? localCost.toLocaleString('en-US', { maximumFractionDigits: 0 })
                        : localCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })()}
            </View>
          </View>

          <BTNGButton
            title={`Practice ${side === 'buy' ? 'Buy' : 'Sell'} ${selectedCoin.symbol}`}
            onPress={handlePracticeTrade}
            variant={side === 'buy' ? 'buy' : 'sell'}
            size="lg"
            fullWidth
            loading={loading}
          />
        </View>

        {/* Trade History */}
        {tradeHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historySectionTitle}>Practice History</Text>
            {tradeHistory.map((t, i) => (
              <View key={i} style={styles.historyRow}>
                <View style={[styles.historyIcon, { backgroundColor: t.type === 'buy' ? Colors.successBg : Colors.errorBg }]}>
                  <MaterialIcons name={t.type === 'buy' ? 'trending-up' : 'trending-down'} size={16} color={t.type === 'buy' ? Colors.success : Colors.error} />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyTitle}>{t.type === 'buy' ? 'Bought' : 'Sold'} {t.amount} {t.coin}</Text>
                  <Text style={styles.historyPrice}>@ ${t.price.toFixed(3)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={[styles.historyPnl, { color: t.pnl >= 0 ? Colors.success : Colors.error }]}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                  </Text>
                  {showLocalConversion && t.pnl !== 0 && (() => {
                    const localPnl = convertUSDRaw(Math.abs(t.pnl));
                    return (
                      <View style={[styles.historyLocalBadge, { backgroundColor: t.pnl >= 0 ? Colors.successBg : Colors.errorBg, borderColor: (t.pnl >= 0 ? Colors.success : Colors.error) + '44' }]}>
                        <Text style={styles.historyLocalFlag}>{selectedCurrency.flag}</Text>
                        <Text style={[styles.historyLocalText, { color: t.pnl >= 0 ? Colors.success : Colors.error }]}>
                          {t.pnl >= 0 ? '+' : '-'}{selectedCurrency.symbol}{localPnl >= 1000
                            ? localPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })
                            : localPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  binaryBanner: {
    marginHorizontal: Spacing.xl, marginBottom: Spacing.lg,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.primary + '55',
    padding: Spacing.lg, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  binaryBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  binaryBannerIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  binaryBannerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  binaryBannerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  balanceCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.warning + '44', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  practiceBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.warning + '55' },
  practiceBadgeText: { fontSize: 10, color: Colors.warning, fontWeight: FontWeight.bold, letterSpacing: 0.5, includeFontPadding: false },
  balanceLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  balanceValue: { fontSize: 36, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  coinScroll: { marginBottom: Spacing.md },
  coinScrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  coinOption: { alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 4, borderWidth: 1, borderColor: Colors.border, minWidth: 60 },
  coinOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  coinOptionLogo: { fontSize: 22 },
  coinOptionSymbol: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  chartCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  chartCoinInfo: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  chartCoinName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  chartCoinPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  tradePanel: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md, marginBottom: Spacing.lg },
  sideRow: { flexDirection: 'row', gap: Spacing.sm },
  sideBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 4, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  sideBtnBuy: { backgroundColor: Colors.success, borderColor: Colors.success },
  sideBtnSell: { backgroundColor: Colors.error, borderColor: Colors.error },
  sideBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  input: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 50 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  summaryLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  summaryValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  historySection: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  historySectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  historyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  historyInfo: { flex: 1, gap: 3 },
  historyTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  historyPrice: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  historyPnl: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Local balance block
  localBalanceBlock: { alignSelf: 'stretch', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  localBalanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  localBalanceFlag: { fontSize: 16 },
  localBalanceText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  localBalanceCode: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  liveRateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success },
  liveRateLabel: { fontSize: 10, color: Colors.success, fontWeight: FontWeight.bold, includeFontPadding: false },
  liveRateValue: { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  liveRateTime: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Session P&L row
  sessionPnlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', justifyContent: 'center', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 7, borderWidth: 1 },
  sessionPnlText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  pnlLocalBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  pnlLocalFlag: { fontSize: 10 },
  pnlLocalText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Cost local badge on summary row
  costLocalBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '33' },
  costLocalFlag: { fontSize: 10 },
  costLocalText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // History row local badge
  historyLocalBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1 },
  historyLocalFlag: { fontSize: 10 },
  historyLocalText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
});
