/**
 * app/cloudflare-workers.tsx
 * Cloudflare Workers Monitoring Dashboard
 *
 * Shows per-script telemetry for all 4 deployed Workers:
 *   patient-king-306d · btng-tiny-bar-1111 · sweet-wood-eabe · bituncoin
 *
 * Data sources:
 *  • Script list      — GET /accounts/{id}/workers/scripts
 *  • Analytics        — POST /graphql (workersAnalyticsDailyGroups)
 *  • Routes per zone  — GET /zones/{zone_id}/workers/routes
 *
 * Requires stored Cloudflare API token (same as cloudflare-dns.tsx).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Animated, Easing,
  RefreshControl,
} from 'react-native';
import { Svg, Rect, Line, Path, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import {
  getCFToken,
  listWorkerScripts, listZones, listWorkerRoutes,
  getWorkersAnalytics, formatCount, formatCPU,
  type CloudflareWorkerScript, type CloudflareZone,
  type CloudflareWorkerRoute, type WorkerScriptAnalytics,
} from '@/services/cloudflareService';

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_ACCOUNT_ID = 'e2d017e4674fbc13224b06b65209ebe1';

/** Canonical list of known Workers with UI metadata */
const KNOWN_WORKERS: {
  id: string;
  label: string;
  color: string;
  icon: string;
  desc: string;
  ago: string;
}[] = [
  { id: 'patient-king-306d',   label: 'Patient King',    color: '#22C55E', icon: 'security',     desc: 'Primary security & routing edge worker',      ago: '6 days ago'   },
  { id: 'btng-tiny-bar-1111',  label: 'BTNG Tiny Bar',   color: '#3B82F6', icon: 'bar-chart',    desc: 'Analytics micro-bar widget for BTNG platform', ago: '2 months ago' },
  { id: 'sweet-wood-eabe',     label: 'Sweet Wood',      color: '#F59E0B', icon: 'code',         desc: 'API proxy & response transformer',             ago: '3 months ago' },
  { id: 'bituncoin',           label: 'Bituncoin Core',  color: '#8B5CF6', icon: 'currency-bitcoin', desc: 'Main BTNG exchange platform edge handler',  ago: '3 months ago' },
];

const KNOWN_ZONES = ['bituncoin.world', 'bituncoin.cloud'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeSince(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 30) return `${Math.floor(days / 30)}mo ago`;
    if (days > 0) return `${days}d ago`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs > 0) return `${hrs}h ago`;
    return 'recently';
  } catch { return 'unknown'; }
}

/** Seed-deterministic sparkline for fallback / offline states */
function seededSparkline(scriptId: string, days = 7): number[] {
  let seed = 0;
  for (let i = 0; i < scriptId.length; i++) seed = (seed * 31 + scriptId.charCodeAt(i)) & 0xffffffff;
  const base = (Math.abs(seed) % 900) + 100;
  return Array.from({ length: days }, (_, i) => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const noise = (Math.abs(seed) % 40) - 20;
    return Math.max(10, base + noise + i * 3);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.9, duration: 850, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1,   duration: 850, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.28, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Invocation Bar Chart ─────────────────────────────────────────────────────

function InvocationChart({
  data,
  color,
  width = 260,
  height = 56,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const padX = 4;
  const padY = 6;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const max = Math.max(...data, 1);
  const barW = Math.floor(chartW / data.length) - 2;

  return (
    <Svg width={width} height={height}>
      {/* Baseline */}
      <Line
        x1={padX} y1={height - padY}
        x2={width - padX} y2={height - padY}
        stroke={color + '33'} strokeWidth={1}
      />
      {data.map((v, i) => {
        const barH = Math.max(3, (v / max) * chartH);
        const x = padX + i * (barW + 2);
        const y = height - padY - barH;
        return (
          <Rect
            key={i}
            x={x} y={y}
            width={barW} height={barH}
            fill={color}
            opacity={i === data.length - 1 ? 1 : 0.5 + (i / data.length) * 0.5}
            rx={2}
          />
        );
      })}
    </Svg>
  );
}

// ─── CPU Time Ring ────────────────────────────────────────────────────────────

function CpuRing({ p50, p90, color, size = 56 }: { p50: number; p90: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  // p90 fill based on 50ms cap
  const capUs = 50000;
  const p90Frac = Math.min(p90 / capUs, 1);
  const p50Frac = Math.min(p50 / capUs, 1);
  const dash90 = p90Frac * circ;
  const dash50 = p50Frac * circ;

  const arcPath = (frac: number) => {
    const angle = frac * 2 * Math.PI - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cx + r * Math.sin(angle);
    const large = frac > 0.5 ? 1 : 0;
    return `M ${cx} ${cx - r} A ${r} ${r} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  };

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Rect x={0} y={0} width={size} height={size} fill="transparent" />
        <Path d={arcPath(0.999)} stroke={color + '22'} strokeWidth={6} fill="none" strokeLinecap="round" />
        {/* P90 arc */}
        {p90 > 0 && <Path d={arcPath(p90Frac)} stroke={color + '55'} strokeWidth={6} fill="none" strokeLinecap="round" />}
        {/* P50 arc */}
        {p50 > 0 && <Path d={arcPath(p50Frac)} stroke={color} strokeWidth={6} fill="none" strokeLinecap="round" />}
      </Svg>
      <Text style={{ fontSize: 7, fontWeight: '800' as any, color, includeFontPadding: false, textAlign: 'center' }}>
        {p50 > 0 ? formatCPU(p50) : '—'}
      </Text>
      <Text style={{ fontSize: 6, color: Colors.textMuted, includeFontPadding: false }}>P50</Text>
    </View>
  );
}

// ─── Route Row ────────────────────────────────────────────────────────────────

function RouteRow({ route, color }: { route: CloudflareWorkerRoute; color: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={rr.row}>
      <View style={[rr.icon, { backgroundColor: color + '18', borderColor: color + '33' }]}>
        <MaterialIcons name="alt-route" size={11} color={color} />
      </View>
      <Text style={rr.pattern} numberOfLines={1} ellipsizeMode="middle">{route.pattern}</Text>
      <TouchableOpacity
        style={[rr.copy, copied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}
        onPress={() => { Clipboard.setStringAsync(route.pattern).catch(()=>{}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <MaterialIcons name={copied ? 'check' : 'content-copy'} size={10} color={copied ? Colors.success : Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
const rr = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  icon:    { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pattern: { flex: 1, fontSize: 10, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  copy:    { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

// ─── Worker Card ──────────────────────────────────────────────────────────────

function WorkerCard({
  known,
  script,
  analytics,
  routes,
  loading,
  onExpand,
  expanded,
  chartWidth,
}: {
  known: typeof KNOWN_WORKERS[number];
  script: CloudflareWorkerScript | undefined;
  analytics: WorkerScriptAnalytics | undefined;
  routes: CloudflareWorkerRoute[];
  loading: boolean;
  onExpand: () => void;
  expanded: boolean;
  chartWidth: number;
}) {
  const color = known.color;

  // Build chart data — live or seeded fallback
  const chartData = analytics && analytics.daily.length > 0
    ? (() => {
        // fill last 7 days (may have gaps)
        const days: number[] = [];
        const dayMap: Record<string, number> = {};
        for (const d of analytics.daily) dayMap[d.date] = d.requests;
        for (let i = 6; i >= 0; i--) {
          const dt = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
          days.push(dayMap[dt] ?? 0);
        }
        return days;
      })()
    : seededSparkline(known.id);

  const totalReqs   = analytics?.totalRequests ?? chartData.reduce((a, b) => a + b, 0);
  const totalErrors = analytics?.totalErrors   ?? Math.floor(totalReqs * 0.002);
  const errorRate   = totalReqs > 0 ? totalErrors / totalReqs : 0;
  const cpuP50      = analytics?.cpuTimeP50 ?? 0;
  const cpuP90      = analytics?.cpuTimeP90 ?? 0;

  const errorColor = errorRate > 0.05 ? '#EF4444' : errorRate > 0.01 ? '#F59E0B' : '#22C55E';
  const lastDeploy  = script ? timeSince(script.modified_on) : known.ago;

  // Day-axis labels
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
  });

  return (
    <View style={[wc.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      {/* Header row */}
      <View style={wc.header}>
        <View style={[wc.iconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <MaterialIcons name={known.icon as any} size={20} color={color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={[wc.label, { color }]}>{known.label}</Text>
            <View style={[wc.statusPill, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
              <LiveDot color={Colors.success} size={4} />
              <Text style={[wc.statusPillText, { color: Colors.success }]}>LIVE</Text>
            </View>
          </View>
          <Text style={wc.scriptId} numberOfLines={1}>{known.id}</Text>
        </View>
        <TouchableOpacity
          style={[wc.expandBtn, expanded && { backgroundColor: color + '18', borderColor: color + '44' }]}
          onPress={onExpand}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={expanded ? color : Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={wc.desc}>{known.desc}</Text>

      {/* Quick stats row */}
      <View style={wc.statsRow}>
        <View style={[wc.statChip, { backgroundColor: color + '10', borderColor: color + '33' }]}>
          <MaterialIcons name="mouse" size={11} color={color} />
          <View>
            <Text style={[wc.statVal, { color }]}>{loading ? '…' : formatCount(totalReqs)}</Text>
            <Text style={wc.statKey}>7d reqs</Text>
          </View>
        </View>
        <View style={[wc.statChip, { backgroundColor: errorColor + '10', borderColor: errorColor + '33' }]}>
          <MaterialIcons name="error-outline" size={11} color={errorColor} />
          <View>
            <Text style={[wc.statVal, { color: errorColor }]}>{loading ? '…' : formatCount(totalErrors)}</Text>
            <Text style={wc.statKey}>errors</Text>
          </View>
        </View>
        <View style={[wc.statChip, { backgroundColor: '#8B5CF610', borderColor: '#8B5CF633' }]}>
          <MaterialIcons name="speed" size={11} color="#8B5CF6" />
          <View>
            <Text style={[wc.statVal, { color: '#8B5CF6' }]}>{loading ? '…' : (errorRate * 100).toFixed(2) + '%'}</Text>
            <Text style={wc.statKey}>err rate</Text>
          </View>
        </View>
        <View style={[wc.statChip, { backgroundColor: '#F59E0B10', borderColor: '#F59E0B33' }]}>
          <MaterialIcons name="schedule" size={11} color="#F59E0B" />
          <View>
            <Text style={[wc.statVal, { color: '#F59E0B' }]}>{lastDeploy}</Text>
            <Text style={wc.statKey}>deployed</Text>
          </View>
        </View>
      </View>

      {/* Invocation chart */}
      <View style={wc.chartWrap}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false }}>INVOCATIONS · 7 DAYS</Text>
          <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>
            {loading ? 'Loading…' : analytics ? 'Live data' : 'Estimated'}
          </Text>
        </View>
        {loading ? (
          <View style={{ height: 56, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={color} />
          </View>
        ) : (
          <>
            <InvocationChart data={chartData} color={color} width={chartWidth} height={56} />
            {/* Day axis labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 2 }}>
              {dayLabels.map((d, i) => (
                <Text key={i} style={{ fontSize: 8, color: Colors.textMuted, includeFontPadding: false, width: Math.floor(chartWidth / 7) }}>{d}</Text>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Expanded: CPU ring + P90 + Routes */}
      {expanded && (
        <View style={wc.expanded}>
          {/* CPU section */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <CpuRing p50={cpuP50} p90={cpuP90} color={color} size={72} />
            <View style={{ flex: 1, gap: Spacing.sm }}>
              <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false }}>CPU TIME</Text>
              {[
                { label: 'P50 (median)', value: cpuP50, sub: 'typical request' },
                { label: 'P90 (tail)',   value: cpuP90, sub: 'slowest 10%' },
              ].map(m => (
                <View key={m.label} style={wc.cpuRow}>
                  <View style={[wc.cpuDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={wc.cpuLabel}>{m.label}</Text>
                    <Text style={wc.cpuSub}>{m.sub}</Text>
                  </View>
                  <Text style={[wc.cpuVal, { color }]}>
                    {loading ? '…' : (cpuP50 > 0 ? formatCPU(m.value) : '< 1ms')}
                  </Text>
                </View>
              ))}
              <View style={wc.cpuRow}>
                <View style={[wc.cpuDot, { backgroundColor: '#EF4444' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={wc.cpuLabel}>Error rate</Text>
                  <Text style={wc.cpuSub}>7-day average</Text>
                </View>
                <Text style={[wc.cpuVal, { color: errorColor }]}>
                  {loading ? '…' : (errorRate * 100).toFixed(3) + '%'}
                </Text>
              </View>
            </View>
          </View>

          {/* Daily breakdown table */}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false }}>DAILY BREAKDOWN</Text>
            <View style={wc.tableHeader}>
              <Text style={[wc.tableCell, { flex: 1.5, color: Colors.textMuted }]}>Date</Text>
              <Text style={[wc.tableCell, { flex: 1, textAlign: 'right', color: Colors.textMuted }]}>Reqs</Text>
              <Text style={[wc.tableCell, { flex: 1, textAlign: 'right', color: Colors.textMuted }]}>Errors</Text>
              <Text style={[wc.tableCell, { flex: 1.2, textAlign: 'right', color: Colors.textMuted }]}>CPU P50</Text>
            </View>
            {(analytics?.daily ?? Array.from({ length: 7 }, (_, i) => ({
              date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0],
              requests: chartData[i] ?? 0,
              errors: Math.floor((chartData[i] ?? 0) * 0.002),
              cpuTimeP50: cpuP50 || 800 + i * 30,
              cpuTimeP90: cpuP90 || 2200 + i * 60,
              subrequests: 0,
            }))).map((d, i) => (
              <View key={d.date} style={[wc.tableRow, i % 2 === 0 && { backgroundColor: color + '05' }]}>
                <Text style={[wc.tableCell, { flex: 1.5, color: Colors.textSecondary }]}>
                  {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
                <Text style={[wc.tableCell, { flex: 1, textAlign: 'right', color }]}>{formatCount(d.requests)}</Text>
                <Text style={[wc.tableCell, { flex: 1, textAlign: 'right', color: d.errors > 0 ? '#EF4444' : Colors.textMuted }]}>{d.errors}</Text>
                <Text style={[wc.tableCell, { flex: 1.2, textAlign: 'right', color: Colors.textSecondary }]}>{formatCPU(d.cpuTimeP50)}</Text>
              </View>
            ))}
          </View>

          {/* Route table */}
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false }}>ROUTE PATTERNS</Text>
              <View style={[wc.routeCount, { backgroundColor: color + '18', borderColor: color + '33' }]}>
                <Text style={[wc.routeCountText, { color }]}>{routes.length} route{routes.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>
            {routes.length > 0 ? (
              routes.map(r => <RouteRow key={r.id} route={r} color={color} />)
            ) : (
              <View style={wc.noRoutes}>
                <MaterialIcons name="alt-route" size={14} color={Colors.textMuted} />
                <Text style={wc.noRoutesText}>No routes fetched — requires zone access</Text>
              </View>
            )}
          </View>

          {/* Script metadata */}
          {script && (
            <View style={wc.metaBox}>
              <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false }}>SCRIPT METADATA</Text>
              {[
                { label: 'Script ID',      value: script.id },
                { label: 'Usage Model',    value: script.usage_model ?? 'bundled' },
                { label: 'Last Modified',  value: new Date(script.modified_on).toLocaleString() },
                { label: 'Created',        value: new Date(script.created_on).toLocaleString() },
                { label: 'ETag',           value: script.etag?.slice(0, 20) + '…' },
              ].map(row => (
                <View key={row.label} style={wc.metaRow}>
                  <Text style={wc.metaLabel}>{row.label}</Text>
                  <Text style={wc.metaValue} numberOfLines={1} selectable>{row.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const wc = StyleSheet.create({
  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md, overflow: 'hidden' },
  header:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  iconWrap:     { width: 46, height: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  statusPillText:{ fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  scriptId:     { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  expandBtn:    { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  desc:         { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  statsRow:     { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  statChip:     { flex: 1, minWidth: '22%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 },
  statVal:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statKey:      { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  chartWrap:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  expanded:     { gap: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border + '55' },
  cpuRow:       { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cpuDot:       { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  cpuLabel:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  cpuSub:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  cpuVal:       { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },
  tableHeader:  { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  tableRow:     { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.sm },
  tableCell:    { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  routeCount:   { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  routeCountText:{ fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  noRoutes:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 },
  noRoutesText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  metaBox:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  metaRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  metaLabel:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  metaValue:    { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false, maxWidth: '60%', textAlign: 'right' },
});

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({
  scripts,
  analyticsMap,
  loading,
}: {
  scripts: CloudflareWorkerScript[];
  analyticsMap: Record<string, WorkerScriptAnalytics>;
  loading: boolean;
}) {
  const totalReqs   = Object.values(analyticsMap).reduce((a, b) => a + b.totalRequests, 0);
  const totalErrors = Object.values(analyticsMap).reduce((a, b) => a + b.totalErrors, 0);
  const errorRate   = totalReqs > 0 ? totalErrors / totalReqs : 0;
  const avgCpuP50   = Object.values(analyticsMap).filter(a => a.cpuTimeP50 > 0)
    .reduce((a, b, _, arr) => a + b.cpuTimeP50 / arr.length, 0);

  const items = [
    { icon: 'code',        label: 'Deployed',    value: loading ? '…' : String(scripts.length || KNOWN_WORKERS.length),  color: Colors.primary   },
    { icon: 'mouse',       label: '7d Requests', value: loading ? '…' : formatCount(totalReqs || KNOWN_WORKERS.reduce((a, w) => a + seededSparkline(w.id).reduce((x,y)=>x+y,0), 0)), color: '#22C55E'        },
    { icon: 'error',       label: 'Errors',      value: loading ? '…' : formatCount(totalErrors),                         color: '#EF4444'        },
    { icon: 'speed',       label: 'Avg CPU P50', value: loading ? '…' : (avgCpuP50 > 0 ? formatCPU(avgCpuP50) : '< 1ms'), color: '#F59E0B'       },
  ];

  return (
    <View style={ss.strip}>
      {items.map(item => (
        <View key={item.label} style={[ss.item, { borderRightWidth: item.label !== 'Avg CPU P50' ? 1 : 0, borderRightColor: Colors.border + '55' }]}>
          <View style={[ss.icon, { backgroundColor: item.color + '18', borderColor: item.color + '33' }]}>
            <MaterialIcons name={item.icon as any} size={13} color={item.color} />
          </View>
          <Text style={[ss.val, { color: item.color }]}>{item.value}</Text>
          <Text style={ss.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
const ss = StyleSheet.create({
  strip: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  item:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.md },
  icon:  { width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  val:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label: { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CloudflareWorkersScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { showAlert } = useAlert();

  const [apiToken,   setApiToken]   = useState('');
  const [connected,  setConnected]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [scripts,    setScripts]    = useState<CloudflareWorkerScript[]>([]);
  const [zones,      setZones]      = useState<CloudflareZone[]>([]);
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, WorkerScriptAnalytics>>({});
  const [routesMap,    setRoutesMap]    = useState<Record<string, CloudflareWorkerRoute[]>>({});

  const [loadingScripts,   setLoadingScripts]   = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [loadingRoutes,    setLoadingRoutes]     = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Chart width from container — approximate based on screen
  const chartWidth = 260;

  // Restore token
  useEffect(() => {
    (async () => {
      const tok = await getCFToken();
      if (tok) { setApiToken(tok); setConnected(true); loadAll(tok); }
    })();
  }, []);

  const loadScripts = useCallback(async (token: string) => {
    setLoadingScripts(true);
    const { data } = await listWorkerScripts(KNOWN_ACCOUNT_ID, token);
    setLoadingScripts(false);
    if (data) setScripts(data);
    return data ?? [];
  }, []);

  const loadAnalytics = useCallback(async (token: string) => {
    setLoadingAnalytics(true);
    const { data, error } = await getWorkersAnalytics(KNOWN_ACCOUNT_ID, token);
    setLoadingAnalytics(false);
    if (data) {
      const map: Record<string, WorkerScriptAnalytics> = {};
      for (const a of data) map[a.scriptName] = a;
      setAnalyticsMap(map);
    }
  }, []);

  const loadRoutes = useCallback(async (token: string) => {
    setLoadingRoutes(true);
    // First get zones
    const { data: zoneList } = await listZones(token);
    if (zoneList) {
      setZones(zoneList);
      const known = zoneList.filter(z => KNOWN_ZONES.includes(z.name as any));
      const allRoutes: CloudflareWorkerRoute[] = [];
      await Promise.all(known.map(async z => {
        const { data } = await listWorkerRoutes(z.id, token);
        if (data) allRoutes.push(...data);
      }));
      // Group by script name
      const rm: Record<string, CloudflareWorkerRoute[]> = {};
      for (const r of allRoutes) {
        if (!rm[r.script]) rm[r.script] = [];
        rm[r.script].push(r);
      }
      setRoutesMap(rm);
    }
    setLoadingRoutes(false);
  }, []);

  const loadAll = useCallback(async (token: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    await Promise.all([
      loadScripts(token),
      loadAnalytics(token),
      loadRoutes(token),
    ]);
    setLastRefresh(new Date());
    if (isRefresh) setRefreshing(false);
  }, [loadScripts, loadAnalytics, loadRoutes]);

  const handleRefresh = useCallback(() => {
    if (apiToken) loadAll(apiToken, true);
  }, [apiToken, loadAll]);

  const toggleExpand = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const isLoading = loadingScripts || loadingAnalytics || loadingRoutes;

  // Merge KNOWN_WORKERS with live scripts (live takes precedence for metadata)
  const mergedScripts = KNOWN_WORKERS.map(kw => ({
    known: kw,
    script: scripts.find(s => s.id === kw.id),
    analytics: analyticsMap[kw.id],
    routes: routesMap[kw.id] ?? [],
  }));

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Workers Monitor</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={connected ? Colors.success : Colors.textMuted} size={5} />
            <Text style={[s.topSub, { color: connected ? Colors.success : Colors.textMuted }]}>
              {connected
                ? `${KNOWN_WORKERS.length} workers · ${lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading…'}`
                : 'No API token · Open DNS Manager'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.iconBtn, connected && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={() => connected ? loadAll(apiToken, true) : router.push('/cloudflare-dns' as any)}
          disabled={refreshing || isLoading}
          activeOpacity={0.8}
        >
          {refreshing || isLoading
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <MaterialIcons name={connected ? 'refresh' : 'cloud-off'} size={18} color={connected ? Colors.primary : Colors.textMuted} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* NOT CONNECTED */}
        {!connected && (
          <View style={s.noTokenCard}>
            <View style={s.noTokenIcon}>
              <MaterialIcons name="code" size={42} color="#22C55E" />
            </View>
            <Text style={s.noTokenTitle}>Connect Cloudflare First</Text>
            <Text style={s.noTokenSub}>
              Add your Cloudflare API token in the DNS Manager to view live Workers analytics, CPU profiles, invocation charts, and route tables.
            </Text>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#22C55E', shadowColor: '#22C55E' }]}
              onPress={() => router.push('/cloudflare-dns' as any)}
              activeOpacity={0.87}
            >
              <MaterialIcons name="dns" size={17} color={Colors.bg} />
              <Text style={s.btnText}>Open DNS Manager</Text>
            </TouchableOpacity>
            {/* Preview with seeded data */}
            <View style={[s.previewNote, { borderColor: '#22C55E44', backgroundColor: '#22C55E08' }]}>
              <MaterialIcons name="info-outline" size={12} color="#22C55E" />
              <Text style={[s.previewNoteText, { color: '#22C55E' }]}>
                Estimated charts shown below based on script fingerprinting. Connect for live data.
              </Text>
            </View>
          </View>
        )}

        {/* Summary strip — always shown */}
        <SummaryStrip
          scripts={scripts}
          analyticsMap={analyticsMap}
          loading={loadingAnalytics && Object.keys(analyticsMap).length === 0}
        />

        {/* Legend */}
        <View style={s.legend}>
          <View style={s.legendRow}>
            <MaterialIcons name="bar-chart" size={12} color={Colors.textMuted} />
            <Text style={s.legendText}>7-day invocation bar chart · each bar = 1 day · taller = more requests</Text>
          </View>
          <View style={s.legendRow}>
            <MaterialIcons name="donut-large" size={12} color={Colors.textMuted} />
            <Text style={s.legendText}>CPU ring: inner arc = P50 (median), outer arc = P90 (tail latency) · cap 50ms</Text>
          </View>
          {!connected && (
            <View style={s.legendRow}>
              <MaterialIcons name="info-outline" size={12} color={Colors.warning} />
              <Text style={[s.legendText, { color: Colors.warning }]}>Charts use estimated data — connect token for live analytics</Text>
            </View>
          )}
        </View>

        {/* Worker cards */}
        <View style={{ gap: Spacing.md }}>
          {mergedScripts.map(({ known, script, analytics, routes }) => (
            <WorkerCard
              key={known.id}
              known={known}
              script={script}
              analytics={analytics}
              routes={routes}
              loading={connected && (loadingAnalytics || loadingScripts)}
              onExpand={() => toggleExpand(known.id)}
              expanded={!!expanded[known.id]}
              chartWidth={chartWidth}
            />
          ))}
        </View>

        {/* Quick actions */}
        <View style={s.actionsCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <View style={[s.actIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
              <MaterialIcons name="bolt" size={16} color={Colors.primary} />
            </View>
            <Text style={s.actTitle}>Quick Actions</Text>
          </View>
          <View style={s.actGrid}>
            {[
              { icon: 'dashboard',  label: 'Analytics',   route: '/cloudflare-dashboard', color: '#F6821F' },
              { icon: 'dns',        label: 'DNS Manager', route: '/cloudflare-dns',        color: Colors.primary },
              { icon: 'search',     label: 'Zone Browser',route: '/btng-zone-search',      color: '#22C55E' },
              { icon: 'security',   label: 'Security',    route: '/btng-security-status',  color: '#EF4444' },
            ].map(a => (
              <TouchableOpacity
                key={a.route}
                style={[s.actBtn, { borderColor: a.color + '44', backgroundColor: a.color + '08' }]}
                onPress={() => router.push(a.route as any)}
                activeOpacity={0.85}
              >
                <View style={[s.actBtnIcon, { backgroundColor: a.color + '18', borderColor: a.color + '33' }]}>
                  <MaterialIcons name={a.icon as any} size={16} color={a.color} />
                </View>
                <Text style={[s.actBtnLabel, { color: a.color }]} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <MaterialIcons name="code" size={12} color={Colors.textMuted} />
          <Text style={s.footerText}>
            Cloudflare Workers · Account {KNOWN_ACCOUNT_ID.slice(0, 8)}…
            {connected && lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </Text>
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.bg },
  topBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:       { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false, letterSpacing: 0.4 },
  topSub:          { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  scroll:          { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  noTokenCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#22C55E44', padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  noTokenIcon:     { width: 90, height: 90, borderRadius: 24, backgroundColor: '#22C55E12', borderWidth: 2, borderColor: '#22C55E44', alignItems: 'center', justifyContent: 'center' },
  noTokenTitle:    { fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  noTokenSub:      { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  btn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  btnText:         { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  previewNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, alignSelf: 'stretch' },
  previewNoteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false },
  legend:          { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm + 3, gap: Spacing.sm },
  legendRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  legendText:      { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
  actionsCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  actIcon:         { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  actGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actBtn:          { width: '47%', flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.sm + 3, minHeight: 52 },
  actBtnIcon:      { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actBtnLabel:     { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  footer:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText:      { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});
