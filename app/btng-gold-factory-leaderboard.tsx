/**
 * app/btng-gold-factory-leaderboard.tsx
 * BTNG Gold Factory — Live Mining Leaderboard
 *
 * Queries mining_shares (PostgreSQL via Supabase) to rank top miners by share count.
 * Auto-refreshes every 30s.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSupabaseClient } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const AUTO_REFRESH_S = 30;

// ─── Types ────────────────────────────────────────────────────────────────────
interface MinerRow {
  miner_address:    string;
  share_count:      number;
  latest_block:     number;
  last_activity:    string;   // ISO timestamp
}

interface StatsRow {
  total_shares:  number;
  total_miners:  number;
  latest_block:  number;
  first_share:   string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function truncateAddress(addr: string, head = 8, tail = 6): string {
  if (!addr) return '—';
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)  return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return '—'; }
}

function formatTs(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

// ─── Medal colors ─────────────────────────────────────────────────────────────
const MEDAL: Record<number, { color: string; icon: string; label: string }> = {
  1: { color: '#FFD700', icon: 'emoji-events',   label: 'GOLD'   },
  2: { color: '#C0C0C0', icon: 'workspace-premium', label: 'SILVER' },
  3: { color: '#CD7F32', icon: 'military-tech',   label: 'BRONZE' },
};

// ─── Animated Gold Pulse ──────────────────────────────────────────────────────
function GoldOrb({ size = 40 }: { size?: number }) {
  const ring = useRef(new Animated.Value(1)).current;
  const spin  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(ring, { toValue: 1.5, duration: 1100, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(ring, { toValue: 1,   duration: 1100, useNativeDriver: true }),
    ])).start();
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 6000, useNativeDriver: true, easing: Easing.linear })
    ).start();
  }, [ring, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 16, height: size + 16, borderRadius: (size + 16) / 2, borderWidth: 1, borderColor: '#D4A01740', transform: [{ scale: ring }] }} />
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#D4A01720', borderWidth: 1.5, borderColor: '#D4A017AA', alignItems: 'center', justifyContent: 'center', transform: [{ rotate }] }}>
        <Text style={{ fontSize: size * 0.44 }}>⛏️</Text>
      </Animated.View>
    </View>
  );
}

// ─── Live Dot ─────────────────────────────────────────────────────────────────
function LiveDot({ color = '#22C55E', size = 6 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.8, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1,   duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.28, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Countdown Bar ────────────────────────────────────────────────────────────
function CountdownBar({ seconds, total }: { seconds: number; total: number }) {
  const pct = Math.max(0, Math.min(1, seconds / total));
  return (
    <View style={cb.track}>
      <View style={[cb.fill, { width: `${pct * 100}%` as any }]} />
    </View>
  );
}
const cb = StyleSheet.create({
  track: { height: 3, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden', flex: 1 },
  fill:  { height: 3, backgroundColor: Colors.primary, borderRadius: 2 },
});

// ─── Miner Row ────────────────────────────────────────────────────────────────
function MinerCard({
  miner,
  rank,
  maxShares,
}: {
  miner:     MinerRow;
  rank:      number;
  maxShares: number;
}) {
  const medal    = MEDAL[rank];
  const barPct   = maxShares > 0 ? (miner.share_count / maxShares) : 0;
  const barAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: barPct,
      duration: 800,
      useNativeDriver: false,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [barPct]);

  const barColor = medal?.color ?? Colors.primary;

  return (
    <View style={[mc.card, rank <= 3 && { borderColor: (medal?.color ?? Colors.primary) + '55' }]}>
      {/* ── Rank ── */}
      <View style={[mc.rankWrap, medal
        ? { backgroundColor: medal.color + '18', borderColor: medal.color + '44' }
        : { backgroundColor: Colors.bgElevated, borderColor: Colors.border }
      ]}>
        {medal ? (
          <MaterialIcons name={medal.icon as any} size={18} color={medal.color} />
        ) : (
          <Text style={mc.rankNum}>{rank}</Text>
        )}
      </View>

      {/* ── Address + meta ── */}
      <View style={mc.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[mc.address, medal && { color: medal.color }]} selectable>
            {truncateAddress(miner.miner_address)}
          </Text>
          {rank <= 3 ? (
            <View style={[mc.medalBadge, { backgroundColor: medal.color + '15', borderColor: medal.color + '44' }]}>
              <Text style={[mc.medalText, { color: medal.color }]}>{medal.label}</Text>
            </View>
          ) : null}
        </View>

        {/* Progress bar */}
        <View style={mc.barTrack}>
          <Animated.View
            style={[
              mc.barFill,
              {
                backgroundColor: barColor,
                width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        </View>

        {/* Meta chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
          <View style={mc.chip}>
            <MaterialIcons name="layers" size={9} color={Colors.textMuted} />
            <Text style={mc.chipText}>Block #{miner.latest_block.toLocaleString()}</Text>
          </View>
          <View style={mc.chip}>
            <MaterialIcons name="schedule" size={9} color={Colors.textMuted} />
            <Text style={mc.chipText}>{formatRelative(miner.last_activity)}</Text>
          </View>
        </View>
      </View>

      {/* ── Share count ── */}
      <View style={mc.sharesWrap}>
        <Text style={[mc.sharesVal, medal && { color: medal.color }]}>
          {miner.share_count.toLocaleString()}
        </Text>
        <Text style={mc.sharesLabel}>shares</Text>
      </View>
    </View>
  );
}

const mc = StyleSheet.create({
  card:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  rankWrap:    { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankNum:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  info:        { flex: 1, gap: 5, minWidth: 0, overflow: 'hidden' },
  address:     { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  medalBadge:  { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  medalText:   { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
  barTrack:    { height: 4, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  barFill:     { height: 4, borderRadius: 3 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  chipText:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  sharesWrap:  { alignItems: 'center', flexShrink: 0 },
  sharesVal:   { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  sharesLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ─── Stat Cell ────────────────────────────────────────────────────────────────
function StatCell({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <View style={[sc.cell, { borderColor: color + '33' }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[sc.value, { color }]}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  cell:     { flex: 1, alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  value:    { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BTNGGoldFactoryLeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // navigate to per-miner rewards page with address pre-filled via route push

  const [miners,    setMiners]    = useState<MinerRow[]>([]);
  const [stats,     setStats]     = useState<StatsRow | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_S);

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef(AUTO_REFRESH_S);

  // ── Fetch leaderboard ─────────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = getSupabaseClient();

      // Top miners aggregated
      const { data: minerData, error: minerErr } = await supabase
        .from('mining_shares')
        .select('miner_address, block_height, timestamp')
        .order('timestamp', { ascending: false });

      if (minerErr) throw new Error(minerErr.message);

      // Aggregate client-side (no RPC needed)
      const map: Record<string, { count: number; latestBlock: number; lastTs: string }> = {};
      for (const row of (minerData ?? [])) {
        const addr = row.miner_address ?? 'unknown';
        if (!map[addr]) {
          map[addr] = { count: 0, latestBlock: 0, lastTs: row.timestamp };
        }
        map[addr].count++;
        if ((row.block_height ?? 0) > map[addr].latestBlock) {
          map[addr].latestBlock = row.block_height ?? 0;
        }
        if (row.timestamp > map[addr].lastTs) {
          map[addr].lastTs = row.timestamp;
        }
      }

      const sorted: MinerRow[] = Object.entries(map)
        .map(([addr, v]) => ({
          miner_address: addr,
          share_count:   v.count,
          latest_block:  v.latestBlock,
          last_activity: v.lastTs,
        }))
        .sort((a, b) => b.share_count - a.share_count)
        .slice(0, 50);

      setMiners(sorted);

      // Global stats
      const allShares = minerData ?? [];
      const totalShares = allShares.length;
      const allBlocks   = allShares.map(r => r.block_height ?? 0);
      const latestBlock = allBlocks.length > 0 ? Math.max(...allBlocks) : 0;
      const firstShare  = allShares.length > 0
        ? allShares.reduce((min, r) => r.timestamp < min ? r.timestamp : min, allShares[0].timestamp)
        : null;

      setStats({
        total_shares:  totalShares,
        total_miners:  Object.keys(map).length,
        latest_block:  latestBlock,
        first_share:   firstShare,
      });

      setLastFetch(new Date());
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to load leaderboard');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ── Auto-refresh ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchLeaderboard();

    countdownRef.current = AUTO_REFRESH_S;
    countRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = AUTO_REFRESH_S;
        setCountdown(AUTO_REFRESH_S);
      }
    }, 1000);

    intervalRef.current = setInterval(() => {
      fetchLeaderboard(true);
      countdownRef.current = AUTO_REFRESH_S;
      setCountdown(AUTO_REFRESH_S);
    }, AUTO_REFRESH_S * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countRef.current)    clearInterval(countRef.current);
    };
  }, [fetchLeaderboard]);

  const handleRefresh = () => {
    countdownRef.current = AUTO_REFRESH_S;
    setCountdown(AUTO_REFRESH_S);
    fetchLeaderboard();
  };

  const maxShares = miners.length > 0 ? miners[0].share_count : 1;

  const formatLastFetch = (d: Date | null) =>
    d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={s.topCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={s.topTitle}>Mining Leaderboard</Text>
            {!loading && miners.length > 0 && <LiveDot color={Colors.primary} size={5} />}
          </View>
          <Text style={s.topSub}>BTNG Gold Factory · Top Miners by Share Count</Text>
        </View>

        <TouchableOpacity
          style={[s.iconBtn, loading && { opacity: 0.5 }]}
          onPress={handleRefresh}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <MaterialIcons name="refresh" size={22} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      {/* ── Countdown row ────────────────────────────────────────────────── */}
      <View style={s.countdownRow}>
        <MaterialIcons name="autorenew" size={11} color={Colors.textMuted} />
        <Text style={s.countdownLabel}>Refresh in {countdown}s</Text>
        <CountdownBar seconds={countdown} total={AUTO_REFRESH_S} />
        <Text style={s.lastLabel}>Last: {formatLastFetch(lastFetch)}</Text>
      </View>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {errorMsg ? (
        <View style={s.errorBanner}>
          <MaterialIcons name="error-outline" size={14} color="#EF4444" />
          <Text style={s.errorText}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => setErrorMsg(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 48 }]}
      >

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={s.hero}>
          <GoldOrb size={52} />
          <View style={s.heroText}>
            <Text style={s.heroTitle}>🏆 Gold Factory Leaderboard</Text>
            <Text style={s.heroSub}>Top miners ranked by accepted shares · Stratum V2 · SHA-256 PoW</Text>
          </View>
        </View>

        {/* ── Stats strip ──────────────────────────────────────────────────── */}
        {stats ? (
          <View style={s.statsRow}>
            <StatCell label="Total Shares" value={stats.total_shares}  color={Colors.primary} icon="bolt"         />
            <StatCell label="Miners"       value={stats.total_miners}  color="#8B5CF6"        icon="group"        />
            <StatCell label="Latest Block" value={stats.latest_block}  color="#22C55E"        icon="link"         />
          </View>
        ) : loading ? (
          <View style={s.statsPlaceholder}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={s.loadingText}>Loading stats…</Text>
          </View>
        ) : null}

        {/* ── First share timestamp ─────────────────────────────────────────── */}
        {stats?.first_share ? (
          <View style={s.sinceRow}>
            <MaterialIcons name="history" size={12} color={Colors.textMuted} />
            <Text style={s.sinceText}>Mining since {formatTs(stats.first_share)}</Text>
          </View>
        ) : null}

        {/* ── Mine Now CTA ─────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={s.mineBtn}
          onPress={() => router.push('/btng-gold-factory' as any)}
          activeOpacity={0.88}
        >
          <Text style={{ fontSize: 18 }}>⛏️</Text>
          <Text style={s.mineBtnText}>Mine Now</Text>
          <MaterialIcons name="arrow-forward" size={18} color="#060608" />
        </TouchableOpacity>

        {/* ── Leaderboard list ─────────────────────────────────────────────── */}
        {loading && miners.length === 0 ? (
          <View style={s.emptyState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.emptyText}>Fetching miner data…</Text>
          </View>
        ) : miners.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="emoji-events" size={36} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>No miners yet</Text>
            <Text style={s.emptyText}>
              Start the Stratum V2 gateway and begin mining to appear on the leaderboard.
            </Text>
            <TouchableOpacity
              style={s.emptyBtn}
              onPress={() => router.push('/btng-gold-factory' as any)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14 }}>⛏️</Text>
              <Text style={s.emptyBtnText}>Open Gold Factory</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 0 }}>
            {/* Table header */}
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, { width: 44 }]}>Rank</Text>
              <Text style={[s.tableHeaderText, { flex: 1 }]}>Miner Address</Text>
              <Text style={[s.tableHeaderText, { width: 64, textAlign: 'right' }]}>Shares</Text>
            </View>

            {miners.map((miner, i) => (
              <MinerCard
                key={miner.miner_address}
                miner={miner}
                rank={i + 1}
                maxShares={maxShares}
              />
            ))}
          </View>
        )}

        {/* ── Info footer ──────────────────────────────────────────────────── */}
        <View style={s.infoCard}>
          <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.infoTitle}>Data Source</Text>
            <Text style={s.infoLine}>Table: public.mining_shares (OnSpace Cloud PostgreSQL)</Text>
            <Text style={s.infoLine}>Columns: miner_address, nonce, block_height, timestamp</Text>
            <Text style={s.infoLine}>Gateway: sdk/stratum-gateway.js · Port 38984</Text>
            <Text style={s.infoNote}>Shares are recorded by the Stratum V2 gateway when a valid PoW solution is submitted.</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.bg },

  topBar:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter:       { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  topSub:          { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  countdownRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm },
  countdownLabel:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  lastLabel:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },

  errorBanner:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1, backgroundColor: '#EF444410', borderColor: '#EF444444' },
  errorText:       { flex: 1, fontSize: FontSize.xs, color: '#FCA5A5', includeFontPadding: false },

  scroll:          { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  hero:            { backgroundColor: Colors.bgCard, borderRadius: Radius.xxl, borderWidth: 1.5, borderColor: '#D4A01744', padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  heroText:        { flex: 1, gap: 5 },
  heroTitle:       { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub:         { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 17, includeFontPadding: false },

  statsRow:        { flexDirection: 'row', gap: Spacing.sm },
  statsPlaceholder:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center', paddingVertical: Spacing.md },
  loadingText:     { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  sinceRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  sinceText:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  mineBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 15, borderRadius: Radius.xl, backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.38, shadowRadius: 10, elevation: 7 },
  mineBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#060608', includeFontPadding: false },

  tableHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.sm },
  tableHeaderText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },

  emptyState:      { alignItems: 'center', paddingVertical: 56, gap: Spacing.md },
  emptyIcon:       { width: 72, height: 72, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  emptyText:       { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 280, includeFontPadding: false },
  emptyBtn:        { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 11, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44' },
  emptyBtnText:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  infoCard:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  infoTitle:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  infoLine:        { fontSize: 9, color: '#22C55E', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 14 },
  infoNote:        { fontSize: 9, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false, marginTop: 2 },
});
