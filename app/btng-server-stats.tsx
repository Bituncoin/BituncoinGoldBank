/**
 * app/btng-server-stats.tsx
 * BTNG Server Stats — Live Server Monitoring Dashboard
 *
 * Polls GET /api/health (port 8090) every 30s for wallet/reserve data.
 * Runs `uptime` + `free -m` via POST /api/admin/exec for system metrics.
 * Displays CPU load averages, memory bar, server uptime, wallet count,
 * reserve total — with sparkline trend graphs.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Easing, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ─── Config ──────────────────────────────────────────────────────────────────

const HOST           = '168.231.79.52';
const PORT           = 8090;
const HEALTH_URL     = `http://${HOST}:${PORT}/api/health`;
const EXEC_URL       = `http://${HOST}:${PORT}/api/admin/exec`;
const TOKEN_KEY      = 'btng_admin_token';
const REFRESH_SEC    = 30;
const TIMEOUT_MS     = 10_000;
const SPARKLINE_MAX  = 20;  // keep last 20 samples

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  uptime:    string;
  wallets:   number;
  totalBal:  number;
  totalTx:   number;
  reserves:  string;
  ts:        string;
}

interface MemData {
  totalMB:  number;
  usedMB:   number;
  freeMB:   number;
  availMB:  number;
  pct:      number;          // used / total
}

interface LoadData {
  raw:   string;            // e.g. "2 days, 3:45"
  l1m:   number;
  l5m:   number;
  l15m:  number;
}

interface Sample {
  ts:    number;
  value: number;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseUptime(output: string): LoadData | null {
  try {
    // load average: 0.15, 0.20, 0.18
    const la = output.match(/load average[s]?:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!la) return null;
    // up N days/hours/min
    const upMatch = output.match(/up\s+([^,]+(?:,\s*[\d:]+)?)/);
    return {
      raw:  upMatch ? upMatch[1].trim() : '—',
      l1m:  parseFloat(la[1]),
      l5m:  parseFloat(la[2]),
      l15m: parseFloat(la[3]),
    };
  } catch { return null; }
}

function parseFreeM(output: string): MemData | null {
  try {
    // Mem:          16034        6423        2345         543        7266        8643
    const line = output.split('\n').find(l => l.startsWith('Mem:') || l.toLowerCase().startsWith('mem:'));
    if (!line) return null;
    const nums = line.split(/\s+/).filter(s => /^\d+$/.test(s)).map(Number);
    if (nums.length < 3) return null;
    const [total, used, free] = nums;
    const avail = nums[5] ?? (total - used);
    const pct   = total > 0 ? Math.round((used / total) * 100) : 0;
    return { totalMB: total, usedMB: used, freeMB: free, availMB: avail, pct };
  } catch { return null; }
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({
  samples,
  color,
  width = 100,
  height = 32,
}: {
  samples: Sample[];
  color:   string;
  width?:  number;
  height?: number;
}) {
  if (samples.length < 2) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 8, color: Colors.textMuted }}>No data</Text>
      </View>
    );
  }

  const vals   = samples.map(s => s.value);
  const minV   = Math.min(...vals);
  const maxV   = Math.max(...vals);
  const rangeV = maxV - minV || 1;
  const padX   = 3;
  const stepX  = (width - padX * 2) / (samples.length - 1);

  // Build SVG-like polyline via small View rects (React Native compatible)
  const points = samples.map((s, i) => ({
    x: padX + i * stepX,
    y: height - 4 - ((s.value - minV) / rangeV) * (height - 8),
  }));

  return (
    <View style={{ width, height, position: 'relative' }}>
      {/* Horizontal grid lines */}
      {[0.25, 0.5, 0.75].map((pct, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0, right: 0,
            top: height * (1 - pct) - 1,
            height: 1,
            backgroundColor: Colors.border + '55',
          }}
        />
      ))}

      {/* Connecting lines between adjacent points */}
      {points.slice(0, -1).map((pt, i) => {
        const next  = points[i + 1];
        const dx    = next.x - pt.x;
        const dy    = next.y - pt.y;
        const len   = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={i}
            style={{
              position:  'absolute',
              left:      pt.x,
              top:       pt.y - 1,
              width:     len,
              height:    2,
              backgroundColor: color,
              borderRadius: 1,
              opacity: 0.85,
              transform: [{ translateX: 0 }, { rotate: `${angle}deg` }],
              transformOrigin: '0 50%',
            } as any}
          />
        );
      })}

      {/* Last point dot */}
      {points.length > 0 && (
        <View style={{
          position: 'absolute',
          left: points[points.length - 1].x - 3,
          top:  points[points.length - 1].y - 3,
          width: 6, height: 6, borderRadius: 3,
          backgroundColor: color,
          borderWidth: 1.5,
          borderColor: Colors.bgCard,
        }} />
      )}
    </View>
  );
}

// ─── Memory Bar ───────────────────────────────────────────────────────────────

function MemBar({ pct, usedMB, totalMB }: { pct: number; usedMB: number; totalMB: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct / 100,
      duration: 700,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [pct]);

  const barColor = pct > 85 ? '#EF4444' : pct > 65 ? '#F59E0B' : '#22C55E';

  return (
    <View style={mb.wrap}>
      <View style={mb.labels}>
        <Text style={mb.label}>{(usedMB / 1024).toFixed(1)} GB used</Text>
        <Text style={mb.label}>{(totalMB / 1024).toFixed(1)} GB total</Text>
      </View>
      <View style={mb.track}>
        <Animated.View
          style={[
            mb.fill,
            {
              backgroundColor: barColor,
              width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
        {/* Grid markers */}
        {[0.25, 0.5, 0.75].map((pctMark, i) => (
          <View key={i} style={[mb.marker, { left: `${pctMark * 100}%` as any }]} />
        ))}
      </View>
      <View style={mb.labels}>
        <Text style={[mb.pct, { color: barColor }]}>{pct}% used</Text>
        <Text style={mb.label}>{(((totalMB - usedMB) / 1024)).toFixed(1)} GB free</Text>
      </View>
    </View>
  );
}

const mb = StyleSheet.create({
  wrap:    { gap: 6 },
  labels:  { flexDirection: 'row', justifyContent: 'space-between' },
  label:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  pct:     { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  track:   { height: 14, backgroundColor: Colors.bgElevated, borderRadius: 7, overflow: 'hidden', position: 'relative' },
  fill:    { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 7 },
  marker:  { position: 'absolute', top: 3, bottom: 3, width: 1, backgroundColor: Colors.bgCard + 'CC' },
});

// ─── Load Gauge ───────────────────────────────────────────────────────────────

function LoadGauge({ value, label, maxVal = 4 }: { value: number; label: string; maxVal?: number }) {
  const pct   = Math.min(value / maxVal, 1);
  const color = pct > 0.8 ? '#EF4444' : pct > 0.5 ? '#F59E0B' : '#22C55E';

  return (
    <View style={lg.wrap}>
      <View style={[lg.gauge, { borderColor: color + '55' }]}>
        <Text style={[lg.val, { color }]}>{value.toFixed(2)}</Text>
      </View>
      <Text style={lg.label}>{label}</Text>
    </View>
  );
}
const lg = StyleSheet.create({
  wrap:  { alignItems: 'center', gap: 4 },
  gauge: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  val:   { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
});

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub, color, samples, children,
}: {
  icon:      string;
  label:     string;
  value:     string;
  sub?:      string;
  color:     string;
  samples?:  Sample[];
  children?: React.ReactNode;
}) {
  return (
    <View style={[mc.card, { borderColor: color + '33' }]}>
      {/* Header */}
      <View style={mc.header}>
        <View style={[mc.iconWrap, { backgroundColor: color + '15', borderColor: color + '33' }]}>
          <MaterialIcons name={icon as any} size={16} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={mc.label}>{label}</Text>
          {sub ? <Text style={mc.sub}>{sub}</Text> : null}
        </View>
        {samples && samples.length >= 2 && (
          <Sparkline samples={samples} color={color} width={80} height={30} />
        )}
      </View>
      {/* Value */}
      <Text style={[mc.value, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      {children ? <View style={{ marginTop: Spacing.sm }}>{children}</View> : null}
    </View>
  );
}

const mc = StyleSheet.create({
  card:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  header:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  sub:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  value:   { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ─── Countdown Ring ───────────────────────────────────────────────────────────

function CountdownBar({ seconds, total }: { seconds: number; total: number }) {
  const pct = Math.max(0, seconds / total);
  return (
    <View style={{ flex: 1, height: 3, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden' }}>
      <View style={{ height: 3, width: `${pct * 100}%`, backgroundColor: Colors.primary, borderRadius: 2 }} />
    </View>
  );
}

// ─── Status Pill ─────────────────────────────────────────────────────────────

function StatusPill({ online, checking }: { online: boolean; checking: boolean }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!online && !checking) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [online, checking]);

  const color = checking ? '#F59E0B' : online ? '#22C55E' : '#EF4444';
  const label = checking ? 'CHECKING' : online ? 'ONLINE' : 'OFFLINE';

  return (
    <View style={[sp.pill, { backgroundColor: color + '15', borderColor: color + '44' }]}>
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: anim }} />
      <Text style={[sp.text, { color }]}>{label}</Text>
    </View>
  );
}
const sp = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, flexShrink: 0 },
  text: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BTNGServerStatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Auth token ──────────────────────────────────────────────────────────────
  const [token,      setToken]      = useState('');
  const [showToken,  setShowToken]  = useState(false);
  const [remember,   setRemember]   = useState(true);
  const [tokenSaved, setTokenSaved] = useState(false);
  const tokenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Health data ─────────────────────────────────────────────────────────────
  const [health,     setHealth]     = useState<HealthData | null>(null);
  const [memData,    setMemData]    = useState<MemData | null>(null);
  const [loadData,   setLoadData]   = useState<LoadData | null>(null);
  const [online,     setOnline]     = useState(false);
  const [checking,   setChecking]   = useState(true);
  const [lastFetch,  setLastFetch]  = useState<Date | null>(null);
  const [countdown,  setCountdown]  = useState(REFRESH_SEC);
  const [fetchErr,   setFetchErr]   = useState<string | null>(null);
  const [execErr,    setExecErr]    = useState<string | null>(null);

  // ── Sparkline history ───────────────────────────────────────────────────────
  const [memSamples,   setMemSamples]   = useState<Sample[]>([]);
  const [load1Samples, setLoad1Samples] = useState<Sample[]>([]);
  const [walletSamples,setWalletSamples]= useState<Sample[]>([]);

  const countdownRef = useRef(REFRESH_SEC);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Token load/save ─────────────────────────────────────────────────────────
  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then(v => {
      if (v) { setToken(v); setTokenSaved(true); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!remember) return;
    if (tokenTimer.current) clearTimeout(tokenTimer.current);
    tokenTimer.current = setTimeout(async () => {
      if (token.trim()) {
        await SecureStore.setItemAsync(TOKEN_KEY, token.trim()).catch(() => {});
        setTokenSaved(true);
      }
    }, 600);
    return () => { if (tokenTimer.current) clearTimeout(tokenTimer.current); };
  }, [token, remember]);

  const toggleRemember = async () => {
    const next = !remember;
    setRemember(next);
    if (!next) {
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      setTokenSaved(false);
    }
  };

  // ── Fetch helpers ───────────────────────────────────────────────────────────
  const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  };

  const execCommand = useCallback(async (cmd: string): Promise<string | null> => {
    if (!token.trim()) return null;
    try {
      const res = await fetchWithTimeout(EXEC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}`,
        },
        body: JSON.stringify({ command: cmd }),
      });
      const json = await res.json().catch(() => null);
      if (!json) return null;
      return json.output ?? json.stdout ?? null;
    } catch { return null; }
  }, [token]);

  const fetchHealth = useCallback(async () => {
    setFetchErr(null);
    setChecking(true);
    try {
      const res = await fetchWithTimeout(HEALTH_URL);
      const json = await res.json();
      const ts   = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const h: HealthData = {
        uptime:   json.uptime ?? '—',
        wallets:  json.session?.walletCount   ?? 0,
        totalBal: json.session?.totalBalance  ?? 0,
        totalTx:  json.session?.totalTx       ?? 0,
        reserves: json.reserves?.formatted?.total ?? json.reserves?.total ?? '—',
        ts,
      };
      setHealth(h);
      setOnline(true);
      setLastFetch(new Date());
      // Sparkline
      const now = Date.now();
      setWalletSamples(prev => [...prev, { ts: now, value: h.wallets }].slice(-SPARKLINE_MAX));
    } catch (e: any) {
      setOnline(false);
      setFetchErr(e?.name === 'AbortError'
        ? 'Health check timed out — server may be offline'
        : `Health check failed: ${e?.message ?? 'unknown error'}`);
    } finally {
      setChecking(false);
    }
  }, []);

  const fetchSystemMetrics = useCallback(async () => {
    if (!token.trim()) return;
    setExecErr(null);

    // Run uptime + free -m in parallel
    const [uptimeOut, freeOut] = await Promise.all([
      execCommand('uptime'),
      execCommand('free -m'),
    ]);

    const now = Date.now();

    if (uptimeOut) {
      const ld = parseUptime(uptimeOut);
      if (ld) {
        setLoadData(ld);
        setLoad1Samples(prev => [...prev, { ts: now, value: ld.l1m }].slice(-SPARKLINE_MAX));
      }
    }

    if (freeOut) {
      const mem = parseFreeM(freeOut);
      if (mem) {
        setMemData(mem);
        setMemSamples(prev => [...prev, { ts: now, value: mem.pct }].slice(-SPARKLINE_MAX));
      }
    }

    if (!uptimeOut && !freeOut && token.trim()) {
      setExecErr('Exec endpoint unreachable — ensure Bearer token is correct and server is running');
    }
  }, [execCommand, token]);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setChecking(true);
    await fetchHealth();
    await fetchSystemMetrics();
    if (!silent) setChecking(false);
  }, [fetchHealth, fetchSystemMetrics]);

  // ── Auto-refresh ────────────────────────────────────────────────────────────
  useEffect(() => {
    refresh();

    countdownRef.current = REFRESH_SEC;
    countRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = REFRESH_SEC;
        setCountdown(REFRESH_SEC);
      }
    }, 1000);

    intervalRef.current = setInterval(() => {
      refresh(true);
      countdownRef.current = REFRESH_SEC;
      setCountdown(REFRESH_SEC);
    }, REFRESH_SEC * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countRef.current)    clearInterval(countRef.current);
    };
  }, [refresh]);

  const handleManualRefresh = () => {
    countdownRef.current = REFRESH_SEC;
    setCountdown(REFRESH_SEC);
    refresh();
  };

  // ─── Derived ────────────────────────────────────────────────────────────────
  const memPct    = memData?.pct      ?? 0;
  const memColor  = memPct > 85 ? '#EF4444' : memPct > 65 ? '#F59E0B' : '#22C55E';
  const load1m    = loadData?.l1m     ?? 0;
  const loadColor = load1m > 3 ? '#EF4444' : load1m > 1.5 ? '#F59E0B' : '#22C55E';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Server Stats</Text>
          <Text style={s.topSub}>{HOST}:{PORT} · Live Monitor</Text>
        </View>
        <StatusPill online={online} checking={checking} />
      </View>

      {/* ── Refresh strip ────────────────────────────────────────────────── */}
      <View style={s.refreshStrip}>
        <MaterialIcons name="autorenew" size={11} color={Colors.textMuted} />
        <Text style={s.refreshLabel}>Refresh in {countdown}s</Text>
        <CountdownBar seconds={countdown} total={REFRESH_SEC} />
        <Text style={s.refreshTs}>
          {lastFetch
            ? lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '—'}
        </Text>
        <TouchableOpacity
          style={[s.refreshBtn, checking && { opacity: 0.4 }]}
          onPress={handleManualRefresh}
          disabled={checking}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {checking
            ? <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.65 }] }} />
            : <MaterialIcons name="refresh" size={16} color={Colors.primary} />
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Server Hero ───────────────────────────────────────────────── */}
        <View style={s.heroBanner}>
          <View style={[s.heroIconWrap, { borderColor: (online ? '#22C55E' : '#EF4444') + '44' }]}>
            <Text style={{ fontSize: 26 }}>🖥️</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.heroTitle}>BTNG Sovereign Node</Text>
            <Text style={s.heroSub}>Ubuntu 26.04 LTS · {HOST} · Port {PORT}</Text>
            {health ? (
              <View style={s.heroUptime}>
                <MaterialIcons name="schedule" size={11} color={Colors.primary} />
                <Text style={s.heroUptimeText}>Process up: {health.uptime}</Text>
              </View>
            ) : null}
          </View>
          <View style={[s.heroOnlinePill, {
            backgroundColor: (online ? '#22C55E' : '#EF4444') + '12',
            borderColor:     (online ? '#22C55E' : '#EF4444') + '44',
          }]}>
            <Text style={[s.heroOnlineText, { color: online ? '#22C55E' : '#EF4444' }]}>
              {checking ? '…' : online ? '● LIVE' : '● DOWN'}
            </Text>
          </View>
        </View>

        {/* ── Error banners ─────────────────────────────────────────────── */}
        {fetchErr ? (
          <View style={s.errBanner}>
            <MaterialIcons name="error-outline" size={14} color="#EF4444" />
            <Text style={s.errText}>{fetchErr}</Text>
          </View>
        ) : null}
        {execErr ? (
          <View style={[s.errBanner, { backgroundColor: '#F59E0B10', borderColor: '#F59E0B44' }]}>
            <MaterialIcons name="warning-amber" size={14} color="#F59E0B" />
            <Text style={[s.errText, { color: '#F59E0B' }]}>{execErr}</Text>
          </View>
        ) : null}

        {/* ── Token Card ────────────────────────────────────────────────── */}
        <View style={s.tokenCard}>
          <View style={s.tokenHeader}>
            <View style={[s.tokenIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
              <MaterialIcons name="vpn-key" size={13} color={Colors.primary} />
            </View>
            <Text style={s.tokenTitle}>Admin Bearer Token</Text>
            {tokenSaved && (
              <View style={s.savedChip}>
                <MaterialIcons name="lock" size={9} color="#22C55E" />
                <Text style={s.savedChipText}>SAVED</Text>
              </View>
            )}
            <Text style={s.tokenNote}>Required for exec metrics</Text>
          </View>
          <View style={s.tokenRow}>
            <TextInput
              style={s.tokenInput}
              value={token}
              onChangeText={setToken}
              secureTextEntry={!showToken}
              placeholder="Enter BTNG_SECRET bearer token…"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {token.length > 0 && (
              <TouchableOpacity
                style={s.tokenIconBtn}
                onPress={() => { setToken(''); SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}); setTokenSaved(false); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.tokenIconBtn} onPress={() => setShowToken(p => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name={showToken ? 'visibility-off' : 'visibility'} size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.remRow} onPress={toggleRemember} activeOpacity={0.8}>
            <View style={[s.toggleTrack, remember && { backgroundColor: Colors.primary + '30', borderColor: Colors.primary + '66' }]}>
              <View style={[s.toggleThumb, remember && { backgroundColor: Colors.primary, transform: [{ translateX: 14 }] }]} />
            </View>
            <Text style={s.remLabel}>Remember on this device</Text>
          </TouchableOpacity>
        </View>

        {/* ── Grid Row 1: Uptime + Wallets ─────────────────────────────── */}
        <View style={s.grid2}>
          <MetricCard
            icon="schedule"
            label="Server Uptime"
            value={loadData?.raw ?? (health?.uptime ?? '—')}
            sub="OS uptime from `uptime` cmd"
            color="#22C55E"
            samples={load1Samples.map(s => ({ ...s, value: 1 }))} // not meaningful here
          >
            {loadData ? (
              <View style={s.loadRow}>
                <LoadGauge value={loadData.l1m}  label="1 min"  maxVal={4} />
                <LoadGauge value={loadData.l5m}  label="5 min"  maxVal={4} />
                <LoadGauge value={loadData.l15m} label="15 min" maxVal={4} />
              </View>
            ) : !token.trim() ? (
              <Text style={s.noTokenNote}>Enter token to load CPU data</Text>
            ) : (
              <ActivityIndicator size="small" color="#22C55E" />
            )}
          </MetricCard>

          <MetricCard
            icon="account-balance-wallet"
            label="Wallets"
            value={health ? health.wallets.toLocaleString() : '—'}
            sub="Active bank wallets"
            color={Colors.primary}
            samples={walletSamples}
          >
            {health ? (
              <View style={{ gap: 5 }}>
                <View style={s.inlineRow}>
                  <Text style={s.inlineLabel}>Total Tx</Text>
                  <Text style={[s.inlineVal, { color: Colors.primary }]}>{health.totalTx.toLocaleString()}</Text>
                </View>
                <View style={s.inlineRow}>
                  <Text style={s.inlineLabel}>BTNGG Balance</Text>
                  <Text style={[s.inlineVal, { color: '#22C55E' }]}>{health.totalBal.toFixed(4)}</Text>
                </View>
              </View>
            ) : <ActivityIndicator size="small" color={Colors.primary} />}
          </MetricCard>
        </View>

        {/* ── Memory Card ──────────────────────────────────────────────── */}
        <MetricCard
          icon="memory"
          label="Memory Usage"
          value={memData ? `${memData.pct}% · ${(memData.usedMB / 1024).toFixed(1)} / ${(memData.totalMB / 1024).toFixed(1)} GB` : '—'}
          sub="`free -m` · RAM utilisation"
          color={memColor}
          samples={memSamples}
        >
          {memData ? (
            <MemBar pct={memData.pct} usedMB={memData.usedMB} totalMB={memData.totalMB} />
          ) : !token.trim() ? (
            <Text style={s.noTokenNote}>Enter token to load memory data</Text>
          ) : (
            <ActivityIndicator size="small" color={memColor} />
          )}

          {memData ? (
            <View style={s.memDetailRow}>
              {[
                { label: 'Total',     val: `${(memData.totalMB / 1024).toFixed(1)} GB`, color: Colors.textMuted },
                { label: 'Used',      val: `${(memData.usedMB  / 1024).toFixed(1)} GB`, color: memColor },
                { label: 'Free',      val: `${(memData.freeMB  / 1024).toFixed(1)} GB`, color: '#22C55E' },
                { label: 'Available', val: `${(memData.availMB / 1024).toFixed(1)} GB`, color: '#60A5FA' },
              ].map(item => (
                <View key={item.label} style={s.memCell}>
                  <Text style={[s.memCellVal, { color: item.color }]}>{item.val}</Text>
                  <Text style={s.memCellLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </MetricCard>

        {/* ── Grid Row 2: CPU Load sparkline + Reserve ──────────────────── */}
        <View style={s.grid2}>
          <MetricCard
            icon="speed"
            label="CPU Load (1 min)"
            value={loadData ? loadData.l1m.toFixed(2) : '—'}
            sub="Load average trend"
            color={loadColor}
            samples={load1Samples}
          >
            {loadData ? (
              <View style={[s.loadBadge, { backgroundColor: loadColor + '15', borderColor: loadColor + '44' }]}>
                <Text style={[s.loadBadgeText, { color: loadColor }]}>
                  {load1m > 3 ? 'HIGH LOAD' : load1m > 1.5 ? 'MODERATE' : 'NORMAL'}
                </Text>
              </View>
            ) : null}
          </MetricCard>

          <MetricCard
            icon="account-balance"
            label="Reserves"
            value={health?.reserves ?? '—'}
            sub="Sovereign reserve cover"
            color="#D4A017"
            samples={[]}
          >
            {health ? (
              <View style={{ gap: 4 }}>
                <Text style={s.reserveNote}>
                  BTNG Sovereign Platform — EKUYE DIGITAL GATEWAY TRUST LTD
                </Text>
                <View style={[s.reserveBadge]}>
                  <MaterialIcons name="verified" size={11} color="#D4A017" />
                  <Text style={s.reserveBadgeText}>Gold-backed sovereign reserve</Text>
                </View>
              </View>
            ) : null}
          </MetricCard>
        </View>

        {/* ── Process Uptime Card (from health) ────────────────────────── */}
        {health ? (
          <View style={s.healthCard}>
            <View style={s.healthCardHeader}>
              <View style={[s.healthCardIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                <MaterialIcons name="dns" size={15} color={Colors.primary} />
              </View>
              <Text style={s.healthCardTitle}>Bank Server Health</Text>
              <View style={[s.healthTs, { backgroundColor: '#22C55E15', borderColor: '#22C55E33' }]}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' }} />
                <Text style={{ fontSize: 9, color: '#22C55E', fontWeight: FontWeight.heavy, includeFontPadding: false } as any}>
                  {health.ts}
                </Text>
              </View>
            </View>

            <View style={s.healthGrid}>
              {[
                { icon: 'schedule',      label: 'Process Uptime',    val: health.uptime,               color: '#22C55E' },
                { icon: 'layers',        label: 'Wallet Sessions',   val: health.wallets.toString(),   color: Colors.primary },
                { icon: 'swap-horiz',    label: 'Total Transactions',val: health.totalTx.toString(),   color: '#60A5FA' },
                { icon: 'toll',          label: 'BTNGG In Pool',     val: health.totalBal.toFixed(4),  color: '#D4A017' },
              ].map(item => (
                <View key={item.label} style={[s.healthCell, { borderColor: item.color + '22' }]}>
                  <View style={[s.healthCellIcon, { backgroundColor: item.color + '15', borderColor: item.color + '33' }]}>
                    <MaterialIcons name={item.icon as any} size={13} color={item.color} />
                  </View>
                  <Text style={[s.healthCellVal, { color: item.color }]}>{item.val}</Text>
                  <Text style={s.healthCellLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Quick links ───────────────────────────────────────────────── */}
        <View style={s.linksCard}>
          <Text style={s.linksTitle}>Related Tools</Text>
          <View style={{ gap: Spacing.sm }}>
            {[
              { icon: 'terminal',   label: 'Server Terminal',  sub: 'Run exec commands',       route: '/btng-server-terminal' },
              { icon: 'sensors',    label: 'Port Health',       sub: 'All service port status', route: '/btng-ports-status' },
              { icon: 'factory',    label: 'Gold Factory',      sub: 'Mining pool dashboard',   route: '/btng-gold-factory' },
            ].map(link => (
              <TouchableOpacity
                key={link.route}
                style={s.linkRow}
                onPress={() => router.push(link.route as any)}
                activeOpacity={0.8}
              >
                <View style={[s.linkIcon, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                  <MaterialIcons name={link.icon as any} size={16} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.linkLabel}>{link.label}</Text>
                  <Text style={s.linkSub}>{link.sub}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Security note ─────────────────────────────────────────────── */}
        <View style={s.secNote}>
          <MaterialIcons name="security" size={12} color={Colors.textMuted} />
          <Text style={s.secNoteText}>
            /api/health is public · /api/admin/exec requires Bearer token · All exec commands are server-side allowlisted · read-only operations only
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },

  topBar:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter:  { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  topSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  refreshStrip:  { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm },
  refreshLabel:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  refreshTs:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  refreshBtn:    { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  scroll:     { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Hero
  heroBanner:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#D4A01744', padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  heroIconWrap:  { width: 56, height: 56, borderRadius: 16, backgroundColor: '#D4A01712', borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  heroUptime:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  heroUptimeText:{ fontSize: 9, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  heroOnlinePill:{ borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, flexShrink: 0 },
  heroOnlineText:{ fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Errors
  errBanner:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: '#EF444410', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#EF444444', padding: Spacing.sm + 2 },
  errText:    { flex: 1, fontSize: FontSize.xs, color: '#FCA5A5', lineHeight: 16, includeFontPadding: false },

  // Token card
  tokenCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  tokenHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tokenIcon:    { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tokenTitle:   { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  tokenNote:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  savedChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#22C55E15', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#22C55E33' },
  savedChipText:{ fontSize: 8, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  tokenRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, gap: 6 },
  tokenInput:   { flex: 1, height: 42, fontSize: FontSize.sm, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  tokenIconBtn: { padding: 6 },
  remRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  toggleTrack:  { width: 32, height: 18, borderRadius: 9, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', paddingHorizontal: 2, flexShrink: 0 },
  toggleThumb:  { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.textMuted },
  remLabel:     { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Grids
  grid2:  { flexDirection: 'row', gap: Spacing.md },

  // Load row
  loadRow:     { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4 },
  loadBadge:   { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  loadBadgeText:{ fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },

  noTokenNote: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, fontStyle: 'italic' },

  // Inline key-value
  inlineRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  inlineVal:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Memory detail
  memDetailRow: { flexDirection: 'row', gap: Spacing.sm, paddingTop: 4 },
  memCell:      { flex: 1, alignItems: 'center', gap: 3 },
  memCellVal:   { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  memCellLabel: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  // Reserve
  reserveNote:  { fontSize: 9, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false },
  reserveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#D4A01715', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#D4A01744', alignSelf: 'flex-start', marginTop: 2 },
  reserveBadgeText: { fontSize: 8, color: '#D4A017', fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Health card
  healthCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  healthCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthCardIcon:   { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  healthCardTitle:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  healthTs:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  healthGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  healthCell:       { flex: 1, minWidth: '44%', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 2 },
  healthCellIcon:   { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  healthCellVal:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  healthCellLabel:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  // Links
  linksCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  linksTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  linkRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  linkIcon:   { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  linkLabel:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  linkSub:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },

  // Security note
  secNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  secNoteText: { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
});
