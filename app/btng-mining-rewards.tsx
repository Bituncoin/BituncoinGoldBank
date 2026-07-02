/**
 * app/btng-mining-rewards.tsx
 * BTNG Mining Rewards — Per-Miner Earnings Tracker
 *
 * Fetches mining_shares from Supabase filtered by wallet address,
 * groups shares by date, renders an animated daily bar chart,
 * and shows lifetime rewards in BTNGG.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Easing, ActivityIndicator, Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSupabaseClient } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MiningShare {
  id:            number;
  miner_address: string;
  nonce:         number | null;
  block_height:  number;
  timestamp:     string;
}

interface DailyStat {
  date:   string;   // YYYY-MM-DD
  label:  string;   // Mon 23
  shares: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BTNGG_PER_SHARE = 0.001;
const CHART_BAR_COUNT = 14; // show last 14 days

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateKey(ts: string): string {
  return ts.slice(0, 10); // YYYY-MM-DD
}

function toDayLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

function buildDailyStats(shares: MiningShare[], days = CHART_BAR_COUNT): DailyStat[] {
  // Count shares per date
  const counts: Record<string, number> = {};
  for (const s of shares) {
    if (!s.timestamp) continue;
    const key = toDateKey(s.timestamp);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  // Build last N calendar days (UTC)
  const result: DailyStat[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({
      date:   key,
      label:  toDayLabel(key),
      shares: counts[key] ?? 0,
    });
  }
  return result;
}

// ─── Animated Bar ─────────────────────────────────────────────────────────────

function AnimatedBar({
  value,
  maxValue,
  color,
  maxHeight,
  delay,
}: {
  value:     number;
  maxValue:  number;
  color:     string;
  maxHeight: number;
  delay:     number;
}) {
  const anim  = useRef(new Animated.Value(0)).current;
  const ratio = maxValue > 0 ? value / maxValue : 0;
  const targetH = Math.max(ratio * maxHeight, value > 0 ? 4 : 2);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue:  targetH,
      duration: 500,
      delay,
      easing:   Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [targetH, delay]);

  return (
    <Animated.View
      style={{
        width:        '78%',
        height:       anim,
        borderRadius: 4,
        backgroundColor: value > 0 ? color : Colors.bgElevated,
        alignSelf:    'center',
        minHeight:    2,
      }}
    />
  );
}

// ─── Stat Cell ────────────────────────────────────────────────────────────────

function StatCell({
  icon, label, value, color, sub,
}: {
  icon: string; label: string; value: string; color: string; sub?: string;
}) {
  return (
    <View style={[sc.cell, { borderColor: color + '33' }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '15', borderColor: color + '33' }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[sc.value, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={sc.label}>{label}</Text>
      {sub ? <Text style={[sc.sub, { color: color + 'AA' }]}>{sub}</Text> : null}
    </View>
  );
}

const sc = StyleSheet.create({
  cell:     { flex: 1, alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, paddingVertical: Spacing.md, paddingHorizontal: 8 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  value:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  label:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  sub:      { fontSize: 8, includeFontPadding: false, textAlign: 'center' },
});

// ─── Share Row ────────────────────────────────────────────────────────────────

function ShareRow({ share, index }: { share: MiningShare; index: number }) {
  const ts = share.timestamp
    ? new Date(share.timestamp).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';
  return (
    <View style={[rw.row, index % 2 === 0 && { backgroundColor: Colors.bgElevated + '55' }]}>
      <View style={rw.rankWrap}>
        <Text style={rw.rank}>#{share.id}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={rw.ts}>{ts}</Text>
        {share.nonce !== null ? (
          <Text style={rw.nonce}>nonce: {share.nonce.toLocaleString()}</Text>
        ) : null}
      </View>
      <View style={rw.blockWrap}>
        <MaterialIcons name="link" size={11} color={Colors.primary} />
        <Text style={rw.block}>#{share.block_height.toLocaleString()}</Text>
      </View>
      <View style={rw.reward}>
        <Text style={rw.rewardVal}>+{BTNGG_PER_SHARE.toFixed(3)}</Text>
        <Text style={rw.rewardUnit}>BTNGG</Text>
      </View>
    </View>
  );
}

const rw = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: Spacing.sm, borderRadius: Radius.md },
  rankWrap:  { width: 36, alignItems: 'center' },
  rank:      { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  ts:        { fontSize: FontSize.xs, color: Colors.textPrimary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  nonce:     { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  blockWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  block:     { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  reward:    { alignItems: 'flex-end' },
  rewardVal: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  rewardUnit:{ fontSize: 8, color: '#22C55E', includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BTNGMiningRewardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [address,    setAddress]    = useState('');
  const [query,      setQuery]      = useState('');
  const [shares,     setShares]     = useState<MiningShare[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [searched,   setSearched]   = useState(false);
  const [showAll,    setShowAll]    = useState(false);

  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);

  const chartWidth = Math.min(dims.width - Spacing.xl * 2 - Spacing.md * 2, 600);
  const barWidth   = Math.max(Math.floor((chartWidth - 8) / CHART_BAR_COUNT) - 3, 8);
  const barMaxH    = 110;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRewards = useCallback(async (addr: string) => {
    const trimmed = addr.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setShares([]);
    setShowAll(false);
    setSearched(true);
    setQuery(trimmed);

    try {
      const supabase = getSupabaseClient();
      const { data, error: dbErr } = await supabase
        .from('mining_shares')
        .select('id, miner_address, nonce, block_height, timestamp')
        .ilike('miner_address', trimmed)
        .order('timestamp', { ascending: false });

      if (dbErr) throw new Error(dbErr.message);
      setShares((data ?? []) as MiningShare[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch shares');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalShares     = shares.length;
  const estimatedBTNGG  = totalShares * BTNGG_PER_SHARE;
  const latestBlock     = shares.reduce((mx, s) => Math.max(mx, s.block_height ?? 0), 0);
  const dailyStats      = buildDailyStats(shares, CHART_BAR_COUNT);
  const maxDailyShares  = Math.max(...dailyStats.map(d => d.shares), 1);
  const activeDays      = dailyStats.filter(d => d.shares > 0).length;
  const avgDaily        = activeDays > 0 ? (totalShares / activeDays).toFixed(1) : '0';

  const displayShares = showAll ? shares : shares.slice(0, 20);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Mining Rewards</Text>
          <Text style={s.topSub}>Per-miner BTNGG earnings tracker</Text>
        </View>
        <View style={s.iconBtn}>
          <Text style={{ fontSize: 18 }}>⛏️</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Hero Banner ────────────────────────────────────────────────── */}
        <View style={s.heroBanner}>
          <View style={s.heroBannerLeft}>
            <View style={s.heroCoin}>
              <Text style={{ fontSize: 32 }}>🪙</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.heroTitle}>BTNGG Rewards</Text>
              <Text style={s.heroSub}>
                {BTNGG_PER_SHARE.toFixed(3)} BTNGG earned per valid share submitted to the Gold Factory pool.
              </Text>
            </View>
          </View>
          <View style={s.heroRateBadge}>
            <Text style={s.heroRateTop}>Rate</Text>
            <Text style={s.heroRateVal}>{BTNGG_PER_SHARE}</Text>
            <Text style={s.heroRateUnit}>BTNGG/share</Text>
          </View>
        </View>

        {/* ── Address Search ─────────────────────────────────────────────── */}
        <View style={s.searchCard}>
          <Text style={s.searchLabel}>
            <MaterialIcons name="account-balance-wallet" size={12} color={Colors.primary} />
            {'  '}Miner Wallet Address
          </Text>
          <View style={s.searchRow}>
            <TextInput
              style={s.searchInput}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter miner wallet address…"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => fetchRewards(address)}
            />
            {address.length > 0 && (
              <TouchableOpacity
                style={s.searchClear}
                onPress={() => { setAddress(''); setShares([]); setSearched(false); setError(null); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="close" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.searchBtn, (!address.trim() || loading) && { opacity: 0.45 }]}
              onPress={() => fetchRewards(address)}
              disabled={!address.trim() || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator size="small" color="#060608" />
                : <MaterialIcons name="search" size={20} color="#060608" />}
            </TouchableOpacity>
          </View>
          {query.length > 0 && searched && (
            <View style={s.queryChip}>
              <MaterialIcons name="manage-search" size={11} color={Colors.primary} />
              <Text style={s.queryChipText} numberOfLines={1}>{query}</Text>
              <Text style={[s.queryChipCount, { color: totalShares > 0 ? '#22C55E' : Colors.textMuted }]}>
                {loading ? '…' : `${totalShares} share${totalShares !== 1 ? 's' : ''} found`}
              </Text>
            </View>
          )}
        </View>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error ? (
          <View style={s.errorCard}>
            <MaterialIcons name="error-outline" size={16} color="#EF4444" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.errorTitle}>Query Failed</Text>
              <Text style={s.errorMsg}>{error}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Loading skeleton ────────────────────────────────────────────── */}
        {loading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.loadingText}>Fetching shares from blockchain…</Text>
          </View>
        ) : null}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {!loading && searched && !error && (
          <>
            {totalShares === 0 ? (
              /* Empty state */
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 44, marginBottom: 8 }}>🪨</Text>
                <Text style={s.emptyTitle}>No Shares Found</Text>
                <Text style={s.emptyMsg}>
                  No mining shares recorded for this address.{'\n'}
                  Start mining at the BTNG Gold Factory to earn BTNGG rewards.
                </Text>
                <TouchableOpacity
                  style={s.emptyBtn}
                  onPress={() => router.push('/btng-gold-factory' as any)}
                  activeOpacity={0.85}
                >
                  <Text style={{ fontSize: 16 }}>🏭</Text>
                  <Text style={s.emptyBtnText}>Open Gold Factory</Text>
                  <MaterialIcons name="chevron-right" size={16} color="#060608" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* ── Stats Strip ──────────────────────────────────────── */}
                <View style={s.statsRow}>
                  <StatCell
                    icon="bolt"
                    label="Total Shares"
                    value={totalShares.toLocaleString()}
                    color={Colors.primary}
                    sub="all time"
                  />
                  <StatCell
                    icon="toll"
                    label="Est. BTNGG"
                    value={estimatedBTNGG >= 1000
                      ? `${(estimatedBTNGG / 1000).toFixed(2)}K`
                      : estimatedBTNGG.toFixed(3)}
                    color="#22C55E"
                    sub={`${BTNGG_PER_SHARE}/share`}
                  />
                  <StatCell
                    icon="trending-up"
                    label="Avg/Day"
                    value={avgDaily}
                    color="#8B5CF6"
                    sub={`${activeDays} active days`}
                  />
                  <StatCell
                    icon="link"
                    label="Latest Block"
                    value={latestBlock > 0 ? `#${latestBlock.toLocaleString()}` : '—'}
                    color="#60A5FA"
                  />
                </View>

                {/* ── Daily Bar Chart ───────────────────────────────────── */}
                <View style={s.chartCard}>
                  <View style={s.chartHeader}>
                    <View style={[s.chartIconWrap, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                      <MaterialIcons name="bar-chart" size={16} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.chartTitle}>Daily Share Activity</Text>
                      <Text style={s.chartSub}>Last {CHART_BAR_COUNT} days · 1 bar = 1 day</Text>
                    </View>
                    <View style={[s.maxBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                      <Text style={[s.maxBadgeText, { color: Colors.primary }]}>
                        Peak {maxDailyShares}
                      </Text>
                    </View>
                  </View>

                  {/* Y-axis labels + bars */}
                  <View style={s.chartBody}>
                    {/* Y-axis */}
                    <View style={s.yAxis}>
                      {[maxDailyShares, Math.round(maxDailyShares / 2), 0].map((v, i) => (
                        <Text key={i} style={s.yLabel}>{v}</Text>
                      ))}
                    </View>

                    {/* Bars */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={[s.barsContent, { gap: 3 }]}
                    >
                      {dailyStats.map((stat, i) => {
                        const isToday = stat.date === new Date().toISOString().slice(0, 10);
                        return (
                          <View key={stat.date} style={[s.barCol, { width: barWidth }]}>
                            {/* Value tooltip */}
                            {stat.shares > 0 && (
                              <Text style={[s.barValue, { color: Colors.primary }]}>
                                {stat.shares}
                              </Text>
                            )}

                            {/* Bar */}
                            <View style={[s.barTrack, { height: barMaxH }]}>
                              <AnimatedBar
                                value={stat.shares}
                                maxValue={maxDailyShares}
                                color={isToday ? '#22C55E' : Colors.primary}
                                maxHeight={barMaxH}
                                delay={i * 25}
                              />
                            </View>

                            {/* X-axis label */}
                            <Text
                              style={[
                                s.barLabel,
                                isToday && { color: '#22C55E', fontWeight: FontWeight.bold },
                              ]}
                              numberOfLines={1}
                            >
                              {stat.label.split(' ')[1] ?? stat.label}
                            </Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Legend */}
                  <View style={s.chartLegend}>
                    <View style={[s.legendDot, { backgroundColor: Colors.primary }]} />
                    <Text style={s.legendText}>Shares submitted</Text>
                    <View style={[s.legendDot, { backgroundColor: '#22C55E', marginLeft: 12 }]} />
                    <Text style={s.legendText}>Today</Text>
                  </View>
                </View>

                {/* ── Reward Estimate Card ─────────────────────────────── */}
                <View style={s.rewardCard}>
                  <View style={s.rewardCardLeft}>
                    <Text style={{ fontSize: 28 }}>🏆</Text>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.rewardCardTitle}>Estimated Total Reward</Text>
                      <Text style={s.rewardCardSub}>
                        {totalShares.toLocaleString()} shares × {BTNGG_PER_SHARE} BTNGG/share
                      </Text>
                    </View>
                  </View>
                  <View style={s.rewardValueWrap}>
                    <Text style={s.rewardValue}>
                      {estimatedBTNGG >= 1000
                        ? `${(estimatedBTNGG / 1000).toFixed(3)}K`
                        : estimatedBTNGG.toFixed(4)}
                    </Text>
                    <Text style={s.rewardUnit}>BTNGG</Text>
                  </View>
                </View>

                {/* ── Share History ─────────────────────────────────────── */}
                <View style={s.histCard}>
                  <View style={s.histHeader}>
                    <MaterialIcons name="history" size={15} color={Colors.textMuted} />
                    <Text style={s.histTitle}>Share History</Text>
                    <Text style={s.histCount}>{totalShares} total</Text>
                  </View>

                  {/* Column headers */}
                  <View style={[rw.row, { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
                    <View style={rw.rankWrap}>
                      <Text style={[rw.rank, { color: Colors.textMuted, fontSize: 8 }]}>ID</Text>
                    </View>
                    <Text style={[rw.ts, { flex: 1, color: Colors.textMuted, fontSize: 8 }]}>TIMESTAMP</Text>
                    <Text style={[rw.block, { color: Colors.textMuted, fontSize: 8 }]}>BLOCK</Text>
                    <Text style={[rw.rewardVal, { color: Colors.textMuted, fontSize: 8 }]}>REWARD</Text>
                  </View>

                  {displayShares.map((share, i) => (
                    <ShareRow key={share.id} share={share} index={i} />
                  ))}

                  {shares.length > 20 && !showAll && (
                    <TouchableOpacity
                      style={s.showMoreBtn}
                      onPress={() => setShowAll(true)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="expand-more" size={16} color={Colors.primary} />
                      <Text style={s.showMoreText}>
                        Show all {shares.length} shares
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* ── Navigation ─────────────────────────────────────────────────── */}
        <View style={s.navRow}>
          <TouchableOpacity
            style={s.navBtn}
            onPress={() => router.push('/btng-gold-factory-leaderboard' as any)}
            activeOpacity={0.85}
          >
            <MaterialIcons name="emoji-events" size={18} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.navBtnTitle}>View Leaderboard</Text>
              <Text style={s.navBtnSub}>Top miners by share count</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.navBtn, { borderColor: '#D4A01744' }]}
            onPress={() => router.push('/btng-gold-factory' as any)}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 20 }}>🏭</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.navBtnTitle}>BTNG Gold Factory</Text>
              <Text style={s.navBtnSub}>Start mining · Stratum V2</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Footer note */}
        <View style={s.footerNote}>
          <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
          <Text style={s.footerNoteText}>
            Rewards are estimates based on {BTNGG_PER_SHARE} BTNGG per recorded share.
            Actual distribution depends on pool settlement rules.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  topBar:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter: { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  topSub:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  scroll:    { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Hero
  heroBanner:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#D4A01744', padding: Spacing.md, gap: Spacing.md },
  heroBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  heroCoin:       { width: 60, height: 60, borderRadius: 16, backgroundColor: '#D4A01718', borderWidth: 1.5, borderColor: '#D4A01755', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub:        { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 17, includeFontPadding: false },
  heroRateBadge:  { alignSelf: 'flex-start', alignItems: 'center', backgroundColor: '#22C55E12', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#22C55E44', paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  heroRateTop:    { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  heroRateVal:    { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  heroRateUnit:   { fontSize: 8, color: '#22C55E', includeFontPadding: false },

  // Search
  searchCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  searchLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  searchRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  searchInput:  { flex: 1, height: 46, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  searchClear:  { padding: 6 },
  searchBtn:    { width: 40, height: 40, borderRadius: Radius.lg, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  queryChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '44' },
  queryChipText:  { flex: 1, fontSize: FontSize.xs, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  queryChipCount: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Error
  errorCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: '#EF444410', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#EF444433', padding: Spacing.md },
  errorTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#EF4444', includeFontPadding: false },
  errorMsg:   { fontSize: FontSize.xs, color: '#FCA5A5', lineHeight: 16, includeFontPadding: false, marginTop: 2 },

  // Loading
  loadingCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  // Empty
  emptyCard:    { alignItems: 'center', gap: 8, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xxl },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  emptyMsg:     { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: 12, paddingHorizontal: Spacing.lg, marginTop: Spacing.sm },
  emptyBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#060608', includeFontPadding: false },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.sm },

  // Chart
  chartCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#D4A01744', padding: Spacing.md, gap: Spacing.md },
  chartHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chartIconWrap:{ width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chartTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  chartSub:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  maxBadge:     { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  maxBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  chartBody:    { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  yAxis:        { width: 28, height: 140, justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0, paddingBottom: 20 },
  yLabel:       { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'right' },

  barsContent:  { alignItems: 'flex-end', paddingBottom: 0 },
  barCol:       { alignItems: 'center', gap: 2 },
  barValue:     { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, marginBottom: 2 },
  barTrack:     { width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  barLabel:     { fontSize: 7, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },

  chartLegend:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  legendText:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Reward card
  rewardCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#22C55E44', padding: Spacing.md, gap: Spacing.md },
  rewardCardLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rewardCardTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  rewardCardSub:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  rewardValueWrap: { alignSelf: 'flex-end', alignItems: 'flex-end', backgroundColor: '#22C55E12', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#22C55E44', paddingHorizontal: 14, paddingVertical: 10 },
  rewardValue:     { fontSize: 22, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  rewardUnit:      { fontSize: FontSize.xs, color: '#22C55E', fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'right' },

  // History
  histCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  histHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  histTitle:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  histCount:  { fontSize: 9, color: Colors.textMuted, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border, includeFontPadding: false },
  showMoreBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 },
  showMoreText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Nav
  navRow:       { gap: Spacing.sm },
  navBtn:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  navBtnTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  navBtnSub:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },

  // Footer
  footerNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  footerNoteText: { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
});
