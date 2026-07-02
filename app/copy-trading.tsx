// BTNG Gold — Copy Trading Screen (Live Supabase Data)
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGButton, MiniChart } from '@/components';
import { PRICE_HISTORY_7D } from '@/constants/mockData';
import { useLivePoll } from '@/hooks/useLivePoll';
import { useCopyTrading, CopyTrader } from '@/hooks/useCopyTrading';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';

const RISK_FILTERS = ['All', 'Low', 'Medium', 'High'];

const RISK_COLORS: Record<string, string> = {
  Low: Colors.success,
  Medium: Colors.warning,
  High: Colors.error,
};

export default function CopyTradingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  const {
    traders, loading, actionLoading, error,
    isFollowing, getSubscription,
    followTrader, unfollowTrader,
    reload, stats,
  } = useCopyTrading();

  // ── Live auto-refresh every 30s ───────────────────────────────────────────
  const { tick: liveTick, countdown: liveCountdown } = useLivePoll(30_000);
  useEffect(() => { reload(); }, [liveTick]);

  const [riskFilter, setRiskFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'followers' | 'pnl' | 'win_rate'>('followers');
  const [followModalTrader, setFollowModalTrader] = useState<CopyTrader | null>(null);
  const [copyAmount, setCopyAmount] = useState('100');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();
  const showLocalConversion = selectedCurrency.code !== 'USD';
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  // ── Filter + Sort ──────────────────────────────────────────────────────────
  const filtered = traders
    .filter(t => riskFilter === 'All' || t.risk_level === riskFilter)
    .sort((a, b) => {
      if (sortBy === 'pnl') return b.monthly_pnl - a.monthly_pnl;
      if (sortBy === 'win_rate') return b.win_rate - a.win_rate;
      return b.follower_count - a.follower_count;
    });

  // ── Follow intent ──────────────────────────────────────────────────────────
  const handleFollowIntent = useCallback((trader: CopyTrader) => {
    if (isFollowing(trader.id)) {
      // Already following — show stop dialog
      showAlert(
        `Stop Copying ${trader.display_name}`,
        'You will stop copying this trader. Any open copied positions are unaffected.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Stop Copying', style: 'destructive',
            onPress: async () => {
              const { error: err } = await unfollowTrader(trader.id);
              if (err) showAlert('Error', err);
              else showAlert('Stopped', `You are no longer copying ${trader.display_name}.`);
            },
          },
        ]
      );
      return;
    }
    // Not following — open copy amount modal
    setCopyAmount('100');
    setFollowModalTrader(trader);
  }, [isFollowing, unfollowTrader, showAlert]);

  // ── Confirm follow ─────────────────────────────────────────────────────────
  const handleConfirmFollow = useCallback(async () => {
    if (!followModalTrader) return;
    const amt = parseFloat(copyAmount);
    if (isNaN(amt) || amt < followModalTrader.min_copy_amount) {
      showAlert('Invalid Amount', `Minimum copy amount is $${followModalTrader.min_copy_amount}`);
      return;
    }
    setFollowModalTrader(null);
    const { error: err } = await followTrader(followModalTrader.id, amt);
    if (err) showAlert('Error', err);
    else showAlert(
      'Copy Active! 🎉',
      `You are now copying ${followModalTrader.display_name} with $${amt}.\n\nProfit share: ${followModalTrader.profit_share_pct}% of gains.`
    );
  }, [followModalTrader, copyAmount, followTrader, showAlert]);

  const fmtAum = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Copy Trading</Text>
        <TouchableOpacity onPress={() => { reload(); }} style={[styles.refreshBtn, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 }]}>
          <MaterialIcons name="refresh" size={18} color={Colors.textMuted} />
          <Text style={{ fontSize: 9, color: Colors.success, fontWeight: '700' as any, includeFontPadding: false }}>LIVE {liveCountdown}s</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Banner */}
      <View style={styles.banner}>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerValue}>+{stats.topMonthlyPnl.toFixed(1)}%</Text>
          <Text style={styles.bannerLabel}>Top ROI (30d)</Text>
        </View>
        <View style={styles.bannerDivider} />
        <View style={styles.bannerStat}>
          <Text style={styles.bannerValue}>{stats.totalActiveCopiers.toLocaleString()}</Text>
          <Text style={styles.bannerLabel}>Active Copiers</Text>
        </View>
        <View style={styles.bannerDivider} />
        <View style={styles.bannerStat}>
          <Text style={[styles.bannerValue, stats.myActiveCopies > 0 && { color: Colors.success }]}>
            {stats.myActiveCopies}
          </Text>
          <Text style={styles.bannerLabel}>My Copies</Text>
        </View>
      </View>

      {/* Risk Filter + Sort */}
      <View style={styles.filterRow}>
        {RISK_FILTERS.map(r => (
          <TouchableOpacity key={r} style={[styles.filterChip, riskFilter === r && styles.filterChipActive]} onPress={() => setRiskFilter(r)}>
            <Text style={[styles.filterText, riskFilter === r && styles.filterTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSortBy(s => s === 'followers' ? 'pnl' : s === 'pnl' ? 'win_rate' : 'followers')}
        >
          <MaterialIcons name="sort" size={15} color={Colors.primary} />
          <Text style={styles.sortText}>
            {sortBy === 'followers' ? 'Followers' : sortBy === 'pnl' ? 'ROI' : 'Win Rate'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading traders...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={40} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reload}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
          {filtered.map(trader => {
            const following = isFollowing(trader.id);
            const sub = getSubscription(trader.id);
            const isLoading = actionLoading === trader.id;
            const expanded = expandedId === trader.id;
            const chartData = PRICE_HISTORY_7D.map(v => v + trader.monthly_pnl / 20);

            return (
              <View key={trader.id} style={[styles.traderCard, following && styles.traderCardActive]}>
                {/* Following badge */}
                {following && (
                  <View style={styles.copyingBanner}>
                    <MaterialIcons name="content-copy" size={11} color={Colors.bg} />
                    <Text style={styles.copyingText}>COPYING</Text>
                    {sub && <Text style={styles.copyingAmount}>${sub.copy_amount}</Text>}
                  </View>
                )}

                {/* Header row */}
                <TouchableOpacity
                  style={styles.traderHeader}
                  onPress={() => setExpandedId(expanded ? null : trader.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.traderAvatarWrap}>
                    <View style={styles.traderAvatar}>
                      <Text style={styles.traderAvatarText}>{trader.avatar}</Text>
                    </View>
                    {trader.verified && (
                      <View style={styles.verifiedBadge}>
                        <MaterialIcons name="verified" size={12} color={Colors.primary} />
                      </View>
                    )}
                  </View>
                  <View style={styles.traderInfo}>
                    <View style={styles.traderNameRow}>
                      <Text style={styles.traderName}>{trader.display_name}</Text>
                      <View style={[styles.riskBadge, { backgroundColor: RISK_COLORS[trader.risk_level] + '22', borderColor: RISK_COLORS[trader.risk_level] + '55' }]}>
                        <Text style={[styles.riskText, { color: RISK_COLORS[trader.risk_level] }]}>{trader.risk_level}</Text>
                      </View>
                    </View>
                    <Text style={styles.traderMeta}>{trader.country}  •  {trader.follower_count.toLocaleString()} followers</Text>
                    <Text style={styles.traderSpeciality}>{trader.speciality}</Text>
                  </View>
                  <MiniChart data={chartData} width={68} height={38} color={Colors.primary} showFill={false} />
                </TouchableOpacity>

                {/* Performance row */}
                <View style={styles.perfRow}>
                  <View style={styles.perfItem}>
                    <Text style={[styles.perfValue, { color: Colors.success }]}>+{trader.monthly_pnl.toFixed(1)}%</Text>
                    {showLocalConversion && (() => {
                      // Treat monthly_pnl% on a $100 base as USD for conversion display
                      const pnlUsd = trader.monthly_pnl;
                      const localVal = convertUSDRaw(pnlUsd);
                      return (
                        <View style={styles.localPnlBadge}>
                          <Text style={styles.localPnlFlag}>{selectedCurrency.flag}</Text>
                          <Text style={styles.localPnlText}>
                            {localVal >= 1000
                              ? localVal.toLocaleString('en-US', { maximumFractionDigits: 0 })
                              : localVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      );
                    })()}
                    <Text style={styles.perfLabel}>30d ROI</Text>
                  </View>
                  <View style={styles.perfDivider} />
                  <View style={styles.perfItem}>
                    <Text style={styles.perfValue}>{trader.win_rate.toFixed(1)}%</Text>
                    <Text style={styles.perfLabel}>Win Rate</Text>
                  </View>
                  <View style={styles.perfDivider} />
                  <View style={styles.perfItem}>
                    <Text style={styles.perfValue}>{trader.trade_count.toLocaleString()}</Text>
                    <Text style={styles.perfLabel}>Trades</Text>
                  </View>
                  <View style={styles.perfDivider} />
                  <View style={styles.perfItem}>
                    <Text style={styles.perfValue}>{fmtAum(trader.aum)}</Text>
                    <Text style={styles.perfLabel}>AUM</Text>
                  </View>
                </View>

                {/* Expanded details */}
                {expanded && (
                  <View style={styles.expandedSection}>
                    {trader.bio ? (
                      <View style={styles.bioBox}>
                        <Text style={styles.bioText}>{trader.bio}</Text>
                      </View>
                    ) : null}

                    <View style={styles.detailGrid}>
                      {[
                        { label: 'Total PnL', value: `+${trader.total_pnl.toFixed(1)}%`, color: Colors.success },
                        { label: 'Avg Duration', value: trader.avg_trade_duration, color: Colors.textPrimary },
                        { label: 'Min Copy', value: `$${trader.min_copy_amount}`, color: Colors.textPrimary },
                        { label: 'Profit Share', value: `${trader.profit_share_pct}%`, color: Colors.warning },
                      ].map(d => (
                        <View key={d.label} style={styles.detailCell}>
                          <Text style={[styles.detailValue, { color: d.color }]}>{d.value}</Text>
                          <Text style={styles.detailLabel}>{d.label}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Badges */}
                    {trader.badges.length > 0 && (
                      <View style={styles.badgesRow}>
                        {trader.badges.map(b => (
                          <View key={b} style={styles.badge}>
                            <Text style={styles.badgeText}>{b}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* My copy stats if following */}
                    {following && sub && (
                      <View style={styles.mySubCard}>
                        <View style={styles.mySubTitleRow}>
                          <Text style={styles.mySubTitle}>My Copy Stats</Text>
                          {showLocalConversion && rateTimestamp && (
                            <View style={styles.liveRatePill}>
                              {ratesLoading ? null : <View style={styles.liveDot} />}
                              <Text style={styles.liveRateText}>Live · {rateTimestamp}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.mySubRow}>
                          <View style={styles.mySubStat}>
                            <Text style={styles.mySubValue}>${sub.copy_amount}</Text>
                            {showLocalConversion && (() => {
                              const localAlloc = convertUSDRaw(sub.copy_amount);
                              return (
                                <View style={styles.subLocalBadge}>
                                  <Text style={styles.subLocalFlag}>{selectedCurrency.flag}</Text>
                                  <Text style={styles.subLocalText}>
                                    {selectedCurrency.symbol}{localAlloc >= 1000
                                      ? localAlloc.toLocaleString('en-US', { maximumFractionDigits: 0 })
                                      : localAlloc.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                  </Text>
                                </View>
                              );
                            })()}
                            <Text style={styles.mySubLabel}>Allocated</Text>
                          </View>
                          <View style={styles.mySubStat}>
                            <Text style={[styles.mySubValue, { color: sub.total_pnl >= 0 ? Colors.success : Colors.error }]}>
                              {sub.total_pnl >= 0 ? '+' : ''}{sub.total_pnl.toFixed(2)} USD
                            </Text>
                            {showLocalConversion && sub.total_pnl !== 0 && (() => {
                              const localPnl = convertUSDRaw(Math.abs(sub.total_pnl));
                              return (
                                <View style={[styles.subLocalBadge, { backgroundColor: sub.total_pnl >= 0 ? Colors.successBg : Colors.errorBg, borderColor: (sub.total_pnl >= 0 ? Colors.success : Colors.error) + '44' }]}>
                                  <Text style={styles.subLocalFlag}>{selectedCurrency.flag}</Text>
                                  <Text style={[styles.subLocalText, { color: sub.total_pnl >= 0 ? Colors.success : Colors.error }]}>
                                    {sub.total_pnl >= 0 ? '+' : '-'}{selectedCurrency.symbol}{localPnl >= 1000
                                      ? localPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })
                                      : localPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </Text>
                                </View>
                              );
                            })()}
                            <Text style={styles.mySubLabel}>PnL</Text>
                          </View>
                          <View style={styles.mySubStat}>
                            <Text style={styles.mySubValue}>{sub.trades_copied}</Text>
                            <Text style={styles.mySubLabel}>Copied</Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* CTA */}
                <BTNGButton
                  title={
                    isLoading ? 'Processing...' :
                    following ? '✓ Stop Copying' :
                    `Copy Trader  •  min $${trader.min_copy_amount}`
                  }
                  onPress={() => !isLoading && handleFollowIntent(trader)}
                  variant={following ? 'secondary' : 'primary'}
                  size="md"
                  fullWidth
                />
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ── Follow Modal ── */}
      <Modal visible={!!followModalTrader} transparent animationType="slide" onRequestClose={() => setFollowModalTrader(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFollowModalTrader(null)}>
          <TouchableOpacity style={styles.modalSheet} activeOpacity={1} onPress={() => {}}>
            {followModalTrader && (
              <>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>{followModalTrader.avatar}</Text>
                  </View>
                  <View style={styles.modalHeaderInfo}>
                    <Text style={styles.modalTitle}>Copy {followModalTrader.display_name}</Text>
                    <Text style={styles.modalSub}>{followModalTrader.speciality}  •  {followModalTrader.win_rate}% win rate</Text>
                  </View>
                </View>

                <View style={styles.modalStatsRow}>
                  {[
                    { label: '30d ROI', value: `+${followModalTrader.monthly_pnl.toFixed(1)}%`, color: Colors.success },
                    { label: 'Risk',    value: followModalTrader.risk_level,                     color: RISK_COLORS[followModalTrader.risk_level] },
                    { label: 'Profit Share', value: `${followModalTrader.profit_share_pct}%`,   color: Colors.warning },
                  ].map(s => (
                    <View key={s.label} style={styles.modalStat}>
                      <Text style={[styles.modalStatValue, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.modalStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Copy Amount (USD)</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.amountPrefix}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={copyAmount}
                    onChangeText={v => setCopyAmount(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="100"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <Text style={styles.inputHint}>Minimum: ${followModalTrader.min_copy_amount}</Text>

                <View style={styles.presetRow}>
                  {['50', '100', '250', '500', '1000'].filter(v => parseFloat(v) >= followModalTrader.min_copy_amount).map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.preset, copyAmount === p && styles.presetActive]}
                      onPress={() => setCopyAmount(p)}
                    >
                      <Text style={[styles.presetText, copyAmount === p && styles.presetTextActive]}>${p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setFollowModalTrader(null)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmFollow}>
                    <MaterialIcons name="content-copy" size={16} color={Colors.bg} />
                    <Text style={styles.confirmBtnText}>Start Copying</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  banner: {
    flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1,
    borderColor: Colors.primary + '40', marginBottom: Spacing.md,
  },
  bannerStat: { flex: 1, alignItems: 'center', gap: 4 },
  bannerValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  bannerLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  bannerDivider: { width: 1, backgroundColor: Colors.border },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: Spacing.sm,
    marginBottom: Spacing.md, alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    height: 36, justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  filterTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.primary + '44', height: 36,
  },
  sortText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, includeFontPadding: false },
  errorText: { color: Colors.error, fontSize: FontSize.sm, textAlign: 'center', paddingHorizontal: Spacing.xl, includeFontPadding: false },
  retryBtn: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  retryText: { color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Trader Card
  traderCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing.md, overflow: 'hidden',
  },
  traderCardActive: { borderColor: Colors.primary },
  copyingBanner: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 5,
    borderBottomLeftRadius: Radius.md, flexDirection: 'row', gap: 5, alignItems: 'center',
  },
  copyingText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  copyingAmount: { fontSize: 10, color: Colors.bg, opacity: 0.85, includeFontPadding: false },

  traderHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  traderAvatarWrap: { position: 'relative' },
  traderAvatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  traderAvatarText: { fontSize: 22 },
  verifiedBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: Colors.bg, borderRadius: 10, padding: 1 },
  traderInfo: { flex: 1, gap: 3 },
  traderNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  traderName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  riskText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  traderMeta: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  traderSpeciality: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  perfRow: {
    flexDirection: 'row', paddingVertical: Spacing.md,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border,
  },
  perfItem: { flex: 1, alignItems: 'center', gap: 4 },
  perfValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  perfLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  perfDivider: { width: 1, backgroundColor: Colors.border },

  // Expanded
  expandedSection: { gap: Spacing.md },
  bioBox: {
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  bioText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  detailCell: {
    flex: 1, minWidth: '40%', backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, gap: 3,
  },
  detailValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  detailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  badge: {
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44',
  },
  badgeText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  mySubCard: {
    backgroundColor: Colors.successBg, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.success + '44', padding: Spacing.md, gap: 8,
  },
  mySubTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mySubTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  mySubRow: { flexDirection: 'row' },
  mySubStat: { flex: 1, alignItems: 'center', gap: 3 },
  mySubValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  mySubLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Local PnL badge on perf row
  localPnlBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '33' },
  localPnlFlag: { fontSize: 9 },
  localPnlText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  // Sub local badge
  subLocalBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '33' },
  subLocalFlag: { fontSize: 9 },
  subLocalText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Live rate pill
  liveRatePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveRateText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, gap: Spacing.lg, borderWidth: 1, borderColor: Colors.border,
    borderBottomWidth: 0,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 4,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  modalAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryGlow,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.primary,
  },
  modalAvatarText: { fontSize: 22 },
  modalHeaderInfo: { flex: 1, gap: 3 },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  modalStatsRow: {
    flexDirection: 'row', backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  modalStat: { flex: 1, alignItems: 'center', gap: 3 },
  modalStatValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  modalStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  inputLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.5, includeFontPadding: false },
  amountRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 2, borderColor: Colors.primary + '66', overflow: 'hidden',
  },
  amountPrefix: { paddingHorizontal: Spacing.lg, fontSize: 22, fontWeight: FontWeight.bold, color: Colors.primary },
  amountInput: {
    flex: 1, paddingVertical: Spacing.md, paddingRight: Spacing.lg,
    fontSize: 22, fontWeight: FontWeight.bold, color: Colors.textPrimary,
    includeFontPadding: false,
  },
  inputHint: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  presetRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  preset: {
    paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
  },
  presetActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  presetText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  presetTextActive: { color: Colors.primary },

  modalActions: { flexDirection: 'row', gap: Spacing.md },
  cancelBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  cancelBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  confirmBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
  },
  confirmBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
