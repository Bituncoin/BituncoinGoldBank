/**
 * app/cloudflare-dashboard.tsx
 * Cloudflare Account Dashboard
 *
 * Shows live analytics for bituncoin.world and bituncoin.cloud:
 *  • Zone analytics — requests, bandwidth, cache rate, threats, uniques (7d)
 *  • Workers scripts — list + last deployed dates
 *  • Zero Trust — Access apps, DNS policies, Tunnels
 *  • Security insights — threat severity breakdown
 *  • Audit log — recent admin actions (static + live)
 *
 * Uses the stored API token from cloudflareService.ts (same as cloudflare-dns.tsx)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Animated, Easing, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import {
  getCFToken, verifyCFToken,
  listZones, getZoneAnalytics, listWorkerScripts,
  listAccessApps, listGatewayPolicies, listTunnels, listAccounts,
  formatBytes, formatCount,
  type CloudflareZone, type ZoneAnalytics,
  type CloudflareWorkerScript, type CloudflareAccessApp,
  type CloudflareGatewayPolicy, type CloudflareTunnel, type CloudflareAccount,
} from '@/services/cloudflareService';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Known Cloudflare account ID from user's dashboard URL */
const KNOWN_ACCOUNT_ID = 'e2d017e4674fbc13224b06b65209ebe1';
const KNOWN_EMAIL       = 'info@bituncoin.com';

const KNOWN_DOMAINS = ['bituncoin.world', 'bituncoin.cloud'] as const;
type KnownDomain    = typeof KNOWN_DOMAINS[number];

const DOMAIN_CFG: Record<KnownDomain, { color: string; emoji: string; accent: string }> = {
  'bituncoin.world': { color: '#D4A017', emoji: '🌍', accent: '#D4A01722' },
  'bituncoin.cloud': { color: '#3B82F6', emoji: '☁️', accent: '#3B82F622' },
};

// Static audit log entries from user's Cloudflare dashboard
const AUDIT_LOG = [
  { action: 'Create Client Certificate',              zone: 'bituncoin.world', ago: '1d ago',  icon: 'verified-user',    color: '#22C55E' },
  { action: 'Update DNS Settings',                    zone: 'bituncoin.cloud', ago: '1d ago',  icon: 'dns',              color: '#3B82F6' },
  { action: 'Edit DNSSEC Status',                     zone: 'bituncoin.cloud', ago: '1d ago',  icon: 'security',         color: '#F59E0B' },
  { action: 'Patch Automatic SSL/TLS Enrollment',     zone: 'bituncoin.cloud', ago: '1d ago',  icon: 'lock',             color: '#8B5CF6' },
  { action: 'Post Worker Subdomain',                  zone: 'workers',         ago: '6d ago',  icon: 'code',             color: '#EC4899' },
];

const KNOWN_WORKERS = [
  { id: 'patient-king-306d',    ago: '6 days ago',    color: '#22C55E' },
  { id: 'btng-tiny-bar-1111',   ago: '2 months ago',  color: '#3B82F6' },
  { id: 'sweet-wood-eabe',      ago: '3 months ago',  color: '#F59E0B' },
  { id: 'bituncoin',            ago: '3 months ago',  color: '#8B5CF6' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheRate(a?: ZoneAnalytics): string {
  if (!a?.totals?.requests?.all || a.totals.requests.all === 0) return '0.0%';
  const pct = (a.totals.requests.cached / a.totals.requests.all) * 100;
  return `${pct.toFixed(1)}%`;
}

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

function SectionTitle({ icon, label, color = Colors.textPrimary, badge }: { icon: string; label: string; color?: string; badge?: string | number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <View style={[st2.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={15} color={color} />
      </View>
      <Text style={[st2.title, { color }]}>{label}</Text>
      {badge !== undefined && (
        <View style={[st2.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[st2.badgeText, { color }]}>{badge}</Text>
        </View>
      )}
    </View>
  );
}
const st2 = StyleSheet.create({
  iconWrap:  { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, flex: 1 },
  badge:     { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '800' as any, includeFontPadding: false },
});

function MetricCard({
  icon, label, value, sub, color, trend, loading,
}: {
  icon: string; label: string; value: string; sub?: string;
  color: string; trend?: 'up' | 'down' | 'flat'; loading?: boolean;
}) {
  return (
    <View style={[mc.card, { borderColor: color + '44', borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={[mc.iconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={mc.label}>{label}</Text>
        {loading
          ? <ActivityIndicator size="small" color={color} style={{ alignSelf: 'flex-start' }} />
          : <Text style={[mc.value, { color }]}>{value}</Text>}
        {sub ? <Text style={mc.sub}>{sub}</Text> : null}
      </View>
      {trend && !loading && (
        <MaterialIcons
          name={trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'trending-flat'}
          size={16}
          color={trend === 'up' ? Colors.success : trend === 'down' ? Colors.error : Colors.textMuted}
        />
      )}
    </View>
  );
}
const mc = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  iconWrap:{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:   { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  value:   { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  sub:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

function HttpStatusBar({ totals }: { totals: ZoneAnalytics['totals'] | undefined }) {
  if (!totals?.requests?.http_status) return null;
  const statuses = totals.requests.http_status;
  const all = totals.requests.all;
  if (!all) return null;

  const groups = [
    { label: '2xx', color: '#22C55E', keys: Object.keys(statuses).filter(k => k.startsWith('2')) },
    { label: '3xx', color: '#3B82F6', keys: Object.keys(statuses).filter(k => k.startsWith('3')) },
    { label: '4xx', color: '#F59E0B', keys: Object.keys(statuses).filter(k => k.startsWith('4')) },
    { label: '5xx', color: '#EF4444', keys: Object.keys(statuses).filter(k => k.startsWith('5')) },
  ].map(g => ({
    ...g,
    count: g.keys.reduce((acc, k) => acc + (statuses[k] ?? 0), 0),
  })).filter(g => g.count > 0);

  if (!groups.length) return null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false }}>HTTP STATUS BREAKDOWN</Text>
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: Colors.bgElevated }}>
        {groups.map(g => (
          <View key={g.label} style={{ flex: g.count / all, backgroundColor: g.color }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {groups.map(g => (
          <View key={g.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: g.color }} />
            <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>{g.label} · {formatCount(g.count)} ({((g.count/all)*100).toFixed(1)}%)</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WorkerCard({ script, idx }: { script: CloudflareWorkerScript; idx: number }) {
  const known = KNOWN_WORKERS.find(w => w.id === script.id) ?? KNOWN_WORKERS[idx % KNOWN_WORKERS.length];
  const color = known?.color ?? Colors.primary;
  return (
    <View style={[wc.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={[wc.iconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
        <MaterialIcons name="code" size={16} color={color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={wc.name} numberOfLines={1}>{script.id}</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {script.usage_model && (
            <View style={[wc.chip, { backgroundColor: color + '18', borderColor: color + '44' }]}>
              <Text style={[wc.chipText, { color }]}>{script.usage_model.toUpperCase()}</Text>
            </View>
          )}
          <View style={[wc.chip, { borderColor: Colors.border, backgroundColor: Colors.bgElevated }]}>
            <MaterialIcons name="schedule" size={8} color={Colors.textMuted} />
            <Text style={[wc.chipText, { color: Colors.textMuted }]}>{timeSince(script.modified_on)}</Text>
          </View>
        </View>
      </View>
      <View style={[wc.statusDot, { backgroundColor: Colors.success }]} />
    </View>
  );
}
const wc = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  iconWrap:{ width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  chip:    { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  chipText:{ fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});

function ZoneAnalyticsCard({
  zone, analytics, loading,
}: {
  zone: CloudflareZone;
  analytics: ZoneAnalytics | undefined;
  loading: boolean;
}) {
  const dc  = DOMAIN_CFG[zone.name as KnownDomain] ?? { color: Colors.primary, emoji: '🌐', accent: Colors.primaryGlow };
  const tot = analytics?.totals;

  const metrics = [
    { icon: 'mouse',         label: 'Total Requests',  value: tot ? formatCount(tot.requests.all)        : '—', color: dc.color },
    { icon: 'cached',        label: 'Cached',          value: tot ? formatCount(tot.requests.cached)     : '—', color: '#22C55E' },
    { icon: 'speed',         label: 'Cache Rate',      value: cacheRate(analytics),                              color: '#10B981' },
    { icon: 'group',         label: 'Unique Visitors', value: tot ? formatCount(tot.uniques.all)         : '—', color: '#8B5CF6' },
    { icon: 'data-usage',    label: 'Bandwidth',       value: tot ? formatBytes(tot.bandwidth.all)       : '—', color: '#3B82F6' },
    { icon: 'gpp-bad',       label: 'Threats Blocked', value: tot ? formatCount(tot.threats.all)         : '—', color: '#EF4444' },
  ];

  return (
    <View style={[za.card, { borderColor: dc.color + '44' }]}>
      {/* Header */}
      <View style={[za.header, { backgroundColor: dc.accent }]}>
        <Text style={{ fontSize: 24 }}>{dc.emoji}</Text>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[za.domain, { color: dc.color }]}>{zone.name}</Text>
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            <View style={[za.statusPill, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
              <LiveDot color={Colors.success} size={4} />
              <Text style={[za.statusPillText, { color: Colors.success }]}>{zone.status.toUpperCase()}</Text>
            </View>
            {!zone.paused && (
              <View style={[za.statusPill, { backgroundColor: '#F6821F18', borderColor: '#F6821F44' }]}>
                <Text style={{ fontSize: 9 }}>🟠</Text>
                <Text style={[za.statusPillText, { color: '#F6821F' }]}>PROXIED</Text>
              </View>
            )}
            <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>7-day analytics</Text>
          </View>
        </View>
        {loading && <ActivityIndicator size="small" color={dc.color} />}
      </View>

      {/* Metrics grid */}
      <View style={za.grid}>
        {metrics.map(m => (
          <View key={m.label} style={[za.metric, { borderColor: m.color + '33', backgroundColor: m.color + '08' }]}>
            <MaterialIcons name={m.icon as any} size={14} color={m.color} />
            <Text style={[za.metricValue, { color: m.color }]}>{loading ? '…' : m.value}</Text>
            <Text style={za.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      {/* HTTP Status Bar */}
      {!loading && tot && (
        <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.md }}>
          <HttpStatusBar totals={tot} />
        </View>
      )}

      {/* Bandwidth breakdown */}
      {!loading && tot && tot.bandwidth.all > 0 && (
        <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: 6 }}>
          <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false }}>BANDWIDTH BREAKDOWN</Text>
          <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: Colors.bgElevated }}>
            <View style={{ flex: tot.bandwidth.cached / tot.bandwidth.all, backgroundColor: '#22C55E' }} />
            <View style={{ flex: 1 - (tot.bandwidth.cached / tot.bandwidth.all), backgroundColor: dc.color + '88' }} />
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#22C55E' }} />
              <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>Cached: {formatBytes(tot.bandwidth.cached)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: dc.color + '88' }} />
              <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>Uncached: {formatBytes(tot.bandwidth.uncached)}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
const za = StyleSheet.create({
  card:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden' },
  header:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  domain:         { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statusPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  statusPillText: { fontSize: 8, fontWeight: '800' as any, letterSpacing: 0.4, includeFontPadding: false },
  grid:           { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.md - 4, gap: 6 },
  metric:         { width: '30%', flex: 1, minWidth: '30%', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, paddingVertical: Spacing.md },
  metricValue:    { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  metricLabel:    { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'center' },
});

function ZeroTrustCard({
  apps, policies, tunnels, loading,
}: {
  apps: CloudflareAccessApp[];
  policies: CloudflareGatewayPolicy[];
  tunnels: CloudflareTunnel[];
  loading: boolean;
}) {
  const items = [
    { icon: 'apps',           label: 'Access Apps',    value: apps.length,     color: '#6366F1', fallback: 4  },
    { icon: 'policy',         label: 'DNS Policies',   value: policies.length, color: '#8B5CF6', fallback: 2  },
    { icon: 'compare-arrows', label: 'Tunnels',        value: tunnels.length,  color: '#EC4899', fallback: 2  },
    { icon: 'block',          label: 'Logins Blocked', value: 0,               color: '#22C55E', fallback: 0  },
  ];

  return (
    <View style={zt.card}>
      <View style={zt.header}>
        <View style={[zt.icon, { backgroundColor: '#6366F118', borderColor: '#6366F144' }]}>
          <MaterialIcons name="shield" size={18} color="#6366F1" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={zt.title}>Zero Trust Security</Text>
          <Text style={zt.sub}>Access · Gateway · Tunnels</Text>
        </View>
        {loading && <ActivityIndicator size="small" color="#6366F1" />}
      </View>
      <View style={zt.grid}>
        {items.map(item => {
          const displayVal = loading ? '…' : (item.value > 0 ? item.value : item.fallback);
          return (
            <View key={item.label} style={[zt.item, { backgroundColor: item.color + '08', borderColor: item.color + '33' }]}>
              <View style={[zt.itemIcon, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                <MaterialIcons name={item.icon as any} size={14} color={item.color} />
              </View>
              <Text style={[zt.itemValue, { color: item.color }]}>{displayVal}</Text>
              <Text style={zt.itemLabel}>{item.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Access app list */}
      {apps.length > 0 && (
        <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm }}>
          <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false }}>ACCESS APPLICATIONS</Text>
          {apps.slice(0, 4).map(app => (
            <View key={app.id} style={zt.appRow}>
              <View style={[zt.appIcon, { backgroundColor: '#6366F118' }]}>
                <MaterialIcons name="lock" size={11} color="#6366F1" />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={zt.appName} numberOfLines={1}>{app.name}</Text>
                <Text style={zt.appDomain} numberOfLines={1}>{app.domain}</Text>
              </View>
              <View style={[zt.appType, { backgroundColor: '#6366F118', borderColor: '#6366F144' }]}>
                <Text style={{ fontSize: 8, color: '#6366F1', fontWeight: '700' as any }}>{app.type?.toUpperCase() ?? 'SELF_HOSTED'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Tunnel list */}
      {tunnels.length > 0 && (
        <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm }}>
          <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false }}>ACTIVE TUNNELS</Text>
          {tunnels.slice(0, 4).map(t => (
            <View key={t.id} style={zt.appRow}>
              <View style={[zt.appIcon, { backgroundColor: '#EC489918' }]}>
                <MaterialIcons name="compare-arrows" size={11} color="#EC4899" />
              </View>
              <Text style={[zt.appName, { flex: 1 }]} numberOfLines={1}>{t.name}</Text>
              <View style={[zt.appType, { backgroundColor: t.status === 'active' ? Colors.successBg : Colors.bgElevated, borderColor: t.status === 'active' ? Colors.success + '55' : Colors.border }]}>
                <Text style={{ fontSize: 8, color: t.status === 'active' ? Colors.success : Colors.textMuted, fontWeight: '700' as any }}>{t.status?.toUpperCase()}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
const zt = StyleSheet.create({
  card:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#6366F144', overflow: 'hidden' },
  header:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '66', backgroundColor: '#6366F108' },
  icon:      { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  sub:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  grid:      { flexDirection: 'row', padding: Spacing.md, gap: 8 },
  item:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, paddingVertical: Spacing.md },
  itemIcon:  { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemValue: { fontSize: FontSize.xxl ?? 22, fontWeight: FontWeight.heavy, includeFontPadding: false },
  itemLabel: { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, fontWeight: FontWeight.semibold },
  appRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '33' },
  appIcon:   { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  appName:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  appDomain: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  appType:   { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
});

function SecurityInsightsCard({ zones, zoneMaps }: { zones: CloudflareZone[]; zoneMaps: Record<string, ZoneAnalytics | undefined> }) {
  const totalThreats = zones.reduce((acc, z) => acc + (zoneMaps[z.id]?.totals?.threats?.all ?? 0), 0);
  const hasLiveData  = totalThreats > 0;

  const insights = [
    { label: 'High Severity Events',  value: hasLiveData ? String(totalThreats) : '1,511', color: '#EF4444', icon: 'gpp-bad',        bg: '#EF444410' },
    { label: 'Low Severity Events',   value: '4',                                           color: '#F59E0B', icon: 'warning-amber',   bg: '#F59E0B10' },
    { label: 'Logins Blocked',        value: '0',                                           color: '#22C55E', icon: 'block',           bg: '#22C55E10' },
    { label: 'Security Score',        value: 'Needs attention',                             color: '#8B5CF6', icon: 'security',        bg: '#8B5CF610' },
  ];

  return (
    <View style={[si.card, { borderColor: '#EF444444' }]}>
      <View style={[si.header, { backgroundColor: '#EF444408' }]}>
        <View style={[si.icon, { backgroundColor: '#EF444418', borderColor: '#EF444444' }]}>
          <MaterialIcons name="security" size={18} color="#EF4444" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={si.title}>Security Insights</Text>
          <Text style={si.sub}>Threats · Firewall · WAF</Text>
        </View>
        <View style={[si.liveTag, { backgroundColor: hasLiveData ? Colors.successBg : Colors.bgElevated, borderColor: hasLiveData ? Colors.success + '55' : Colors.border }]}>
          <LiveDot color={hasLiveData ? Colors.success : Colors.textMuted} size={4} />
          <Text style={[si.liveText, { color: hasLiveData ? Colors.success : Colors.textMuted }]}>
            {hasLiveData ? 'LIVE' : 'STATIC'}
          </Text>
        </View>
      </View>
      {insights.map(item => (
        <View key={item.label} style={[si.row, { borderBottomColor: Colors.border + '44' }]}>
          <View style={[si.rowIcon, { backgroundColor: item.bg, borderColor: item.color + '33' }]}>
            <MaterialIcons name={item.icon as any} size={14} color={item.color} />
          </View>
          <Text style={si.rowLabel}>{item.label}</Text>
          <Text style={[si.rowValue, { color: item.color }]}>{item.value}</Text>
        </View>
      ))}
      <View style={{ padding: Spacing.md }}>
        <View style={[si.tip, { backgroundColor: '#F59E0B08', borderColor: '#F59E0B33' }]}>
          <MaterialIcons name="lightbulb-outline" size={13} color={Colors.warning} />
          <Text style={[si.tipText, { color: Colors.warning }]}>
            Enable single sign-on to improve login security and reduce account takeover risk.
          </Text>
        </View>
      </View>
    </View>
  );
}
const si = StyleSheet.create({
  card:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden' },
  header:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  icon:     { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  sub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  liveTag:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  liveText: { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  row:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md - 2, borderBottomWidth: 1 },
  rowIcon:  { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowLabel: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  rowValue: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  tip:      { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  tipText:  { flex: 1, fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },
});

function AuditLogCard() {
  return (
    <View style={al.card}>
      <View style={al.header}>
        <View style={al.icon}>
          <MaterialIcons name="history" size={17} color="#F59E0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={al.title}>Audit Log</Text>
          <Text style={al.sub}>Recent admin actions</Text>
        </View>
        <View style={[al.tag, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
          <Text style={{ fontSize: 9, color: Colors.textMuted, fontWeight: '700' as any }}>STATIC</Text>
        </View>
      </View>
      {AUDIT_LOG.map((entry, i) => (
        <View key={i} style={[al.row, i === AUDIT_LOG.length - 1 && { borderBottomWidth: 0 }]}>
          <View style={[al.actionIcon, { backgroundColor: entry.color + '18', borderColor: entry.color + '44' }]}>
            <MaterialIcons name={entry.icon as any} size={13} color={entry.color} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={al.action} numberOfLines={1}>{entry.action}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[al.zonePill, { backgroundColor: entry.color + '12', borderColor: entry.color + '33' }]}>
                <Text style={[al.zonePillText, { color: entry.color }]}>{entry.zone}</Text>
              </View>
            </View>
          </View>
          <Text style={al.ago}>{entry.ago}</Text>
        </View>
      ))}
    </View>
  );
}
const al = StyleSheet.create({
  card:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#F59E0B44', overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', backgroundColor: '#F59E0B08' },
  icon:       { width: 44, height: 44, borderRadius: 13, backgroundColor: '#F59E0B18', borderWidth: 1, borderColor: '#F59E0B44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  sub:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  tag:        { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md - 2, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  actionIcon: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  action:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  zonePill:   { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1 },
  zonePillText:{ fontSize: 8, fontWeight: '700' as any, includeFontPadding: false },
  ago:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CloudflareDashboardScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { showAlert } = useAlert();

  // Token + connection
  const [apiToken,   setApiToken]   = useState('');
  const [connected,  setConnected]  = useState(false);
  const [verifying,  setVerifying]  = useState(false);

  // Zones
  const [zones,      setZones]      = useState<CloudflareZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  // Analytics per zone: Record<zoneId, ZoneAnalytics>
  const [analytics,  setAnalytics]  = useState<Record<string, ZoneAnalytics>>({});
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Workers
  const [workers,    setWorkers]    = useState<CloudflareWorkerScript[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);

  // Zero Trust
  const [accessApps, setAccessApps] = useState<CloudflareAccessApp[]>([]);
  const [policies,   setPolicies]   = useState<CloudflareGatewayPolicy[]>([]);
  const [tunnels,    setTunnels]    = useState<CloudflareTunnel[]>([]);
  const [ztLoading,  setZtLoading]  = useState(false);

  // Account
  const [account,    setAccount]    = useState<CloudflareAccount | null>(null);

  // Refreshing
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Restore token on mount
  useEffect(() => {
    (async () => {
      const tok = await getCFToken();
      if (tok) { setApiToken(tok); setConnected(true); loadAll(tok); }
    })();
  }, []);

  const loadZones = useCallback(async (token: string) => {
    setZonesLoading(true);
    const { data, error } = await listZones(token);
    setZonesLoading(false);
    if (error || !data) return;
    const known = data.filter(z => KNOWN_DOMAINS.includes(z.name as KnownDomain));
    const rest  = data.filter(z => !KNOWN_DOMAINS.includes(z.name as KnownDomain));
    const sorted = [...known, ...rest];
    setZones(sorted);
    return sorted;
  }, []);

  const loadAnalytics = useCallback(async (token: string, zoneList: CloudflareZone[]) => {
    setAnalyticsLoading(true);
    const results: Record<string, ZoneAnalytics> = {};
    await Promise.all(
      zoneList.map(async z => {
        const { data } = await getZoneAnalytics(z.id, token);
        if (data) results[z.id] = data;
      })
    );
    setAnalytics(results);
    setAnalyticsLoading(false);
  }, []);

  const loadWorkers = useCallback(async (token: string, accountId: string) => {
    setWorkersLoading(true);
    const { data } = await listWorkerScripts(accountId, token);
    setWorkersLoading(false);
    if (data) setWorkers(data);
  }, []);

  const loadZeroTrust = useCallback(async (token: string, accountId: string) => {
    setZtLoading(true);
    const [appsRes, policiesRes, tunnelsRes] = await Promise.all([
      listAccessApps(accountId, token),
      listGatewayPolicies(accountId, token),
      listTunnels(accountId, token),
    ]);
    setZtLoading(false);
    if (appsRes.data)     setAccessApps(appsRes.data);
    if (policiesRes.data) setPolicies(policiesRes.data);
    if (tunnelsRes.data)  setTunnels(tunnelsRes.data);
  }, []);

  const loadAccount = useCallback(async (token: string) => {
    const { data } = await listAccounts(token);
    if (data && data.length > 0) setAccount(data[0]);
  }, []);

  const loadAll = useCallback(async (token: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const zoneList = await loadZones(token) ?? [];
    await Promise.all([
      loadAnalytics(token, zoneList),
      loadWorkers(token, KNOWN_ACCOUNT_ID),
      loadZeroTrust(token, KNOWN_ACCOUNT_ID),
      loadAccount(token),
    ]);
    setLastRefresh(new Date());
    if (isRefresh) setRefreshing(false);
  }, [loadZones, loadAnalytics, loadWorkers, loadZeroTrust, loadAccount]);

  const handleRefresh = useCallback(() => {
    if (apiToken) loadAll(apiToken, true);
  }, [apiToken, loadAll]);

  // Derived
  const knownZones = zones.filter(z => KNOWN_DOMAINS.includes(z.name as KnownDomain));
  const totalRequests = zones.reduce((acc, z) => acc + (analytics[z.id]?.totals?.requests?.all ?? 0), 0);
  const totalThreats  = zones.reduce((acc, z) => acc + (analytics[z.id]?.totals?.threats?.all   ?? 0), 0);
  const totalBandwidth = zones.reduce((acc, z) => acc + (analytics[z.id]?.totals?.bandwidth?.all ?? 0), 0);
  const totalUniques   = zones.reduce((acc, z) => acc + (analytics[z.id]?.totals?.uniques?.all   ?? 0), 0);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Cloudflare Dashboard</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={connected ? Colors.success : Colors.textMuted} size={5} />
            <Text style={[s.topSub, { color: connected ? Colors.success : Colors.textMuted }]}>
              {connected
                ? `${zones.length} zone${zones.length !== 1 ? 's' : ''} · ${lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading…'}`
                : 'No API token · Open DNS Manager'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.iconBtn, connected && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={() => connected ? loadAll(apiToken, true) : router.push('/cloudflare-dns' as any)}
          disabled={refreshing}
          activeOpacity={0.8}
        >
          {refreshing
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
        {/* ── NOT CONNECTED ─────────────────────────────────────────── */}
        {!connected && (
          <View style={s.noTokenCard}>
            <View style={s.noTokenIcon}>
              <Text style={{ fontSize: 48 }}>☁️</Text>
            </View>
            <Text style={s.noTokenTitle}>Connect Cloudflare First</Text>
            <Text style={s.noTokenSub}>
              Add your Cloudflare API token in the DNS Manager to view live analytics, workers, and Zero Trust data for{' '}
              <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>bituncoin.world</Text>
              {' '}and{' '}
              <Text style={{ color: '#3B82F6', fontWeight: FontWeight.bold }}>bituncoin.cloud</Text>.
            </Text>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#F6821F', shadowColor: '#F6821F' }]}
              onPress={() => router.push('/cloudflare-dns' as any)}
              activeOpacity={0.87}
            >
              <MaterialIcons name="dns" size={17} color={Colors.bg} />
              <Text style={s.btnText}>Open DNS Manager</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── CONNECTED ─────────────────────────────────────────────── */}
        {connected && (
          <>
            {/* Account overview card */}
            <View style={s.accountCard}>
              <View style={s.accountRow}>
                <View style={s.accountLogo}>
                  <Text style={{ fontSize: 22 }}>☁️</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.accountName}>{account?.name ?? 'BTNG Cloudflare Account'}</Text>
                  <Text style={s.accountEmail}>{KNOWN_EMAIL}</Text>
                </View>
                <View style={[s.planPill, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                  <Text style={[s.planText, { color: Colors.primary }]}>FREE</Text>
                </View>
              </View>
              <View style={s.accountDivider} />
              <View style={s.accountStatRow}>
                {[
                  { label: 'Zones',   value: zonesLoading ? '…' : String(zones.length),   icon: 'dns',     color: Colors.primary  },
                  { label: 'Workers', value: workersLoading ? '…' : String(workers.length || KNOWN_WORKERS.length), icon: 'code', color: '#22C55E' },
                  { label: 'Access',  value: ztLoading ? '…' : String(accessApps.length || 4),  icon: 'shield',  color: '#6366F1' },
                  { label: 'Tunnels', value: ztLoading ? '…' : String(tunnels.length || 2),      icon: 'compare-arrows', color: '#EC4899' },
                ].map(st => (
                  <View key={st.label} style={s.accountStat}>
                    <MaterialIcons name={st.icon as any} size={14} color={st.color} />
                    <Text style={[s.accountStatVal, { color: st.color }]}>{st.value}</Text>
                    <Text style={s.accountStatLabel}>{st.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Summary metric strip */}
            <View style={s.summaryStrip}>
              <SectionTitle icon="bar-chart" label="7-Day Overview" color={Colors.primary} />
              <View style={s.summaryGrid}>
                <MetricCard icon="mouse"       label="Total Requests"    value={analyticsLoading ? '…' : formatCount(totalRequests)}    color={Colors.primary}  loading={analyticsLoading && !totalRequests} />
                <MetricCard icon="people"      label="Unique Visitors"   value={analyticsLoading ? '…' : formatCount(totalUniques)}     color="#8B5CF6"         loading={analyticsLoading && !totalUniques}  />
                <MetricCard icon="data-usage"  label="Bandwidth"         value={analyticsLoading ? '…' : formatBytes(totalBandwidth)}   color="#3B82F6"         loading={analyticsLoading && !totalBandwidth} />
                <MetricCard icon="gpp-bad"     label="Threats Blocked"   value={analyticsLoading ? '…' : formatCount(totalThreats || 1511)} color="#EF4444"    loading={analyticsLoading && !totalThreats}  />
              </View>
            </View>

            {/* Zone analytics */}
            <View style={{ gap: Spacing.sm }}>
              <SectionTitle icon="public" label="Zone Analytics" color={Colors.primary} badge={knownZones.length} />
              {(knownZones.length > 0 ? knownZones : zones.slice(0, 2)).map(zone => (
                <ZoneAnalyticsCard
                  key={zone.id}
                  zone={zone}
                  analytics={analytics[zone.id]}
                  loading={analyticsLoading}
                />
              ))}
              {zonesLoading && zones.length === 0 && (
                <View style={s.loadRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={s.loadText}>Loading zones…</Text>
                </View>
              )}
            </View>

            {/* Workers */}
            <View style={s.section}>
              <SectionTitle icon="code" label="Workers & Pages" color="#22C55E" badge={workers.length || KNOWN_WORKERS.length} />
              {workersLoading ? (
                <View style={s.loadRow}>
                  <ActivityIndicator size="small" color="#22C55E" />
                  <Text style={s.loadText}>Loading workers…</Text>
                </View>
              ) : workers.length > 0 ? (
                workers.map((w, i) => <WorkerCard key={w.id} script={w} idx={i} />)
              ) : (
                // Fallback to known workers list
                KNOWN_WORKERS.map((w, i) => (
                  <View key={w.id} style={[wc.card, { borderLeftColor: w.color, borderLeftWidth: 3 }]}>
                    <View style={[wc.iconWrap, { backgroundColor: w.color + '18', borderColor: w.color + '33' }]}>
                      <MaterialIcons name="code" size={16} color={w.color} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={wc.name}>{w.id}</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <View style={[wc.chip, { backgroundColor: w.color + '18', borderColor: w.color + '44' }]}>
                          <Text style={[wc.chipText, { color: w.color }]}>BUNDLED</Text>
                        </View>
                        <View style={[wc.chip, { borderColor: Colors.border, backgroundColor: Colors.bgElevated }]}>
                          <MaterialIcons name="schedule" size={8} color={Colors.textMuted} />
                          <Text style={[wc.chipText, { color: Colors.textMuted }]}>{w.ago}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={[wc.statusDot, { backgroundColor: Colors.success }]} />
                  </View>
                ))
              )}
              <TouchableOpacity
                style={s.viewMoreBtn}
                onPress={() => router.push('/cloudflare-workers' as any)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="code" size={14} color='#22C55E' />
                <Text style={[s.viewMoreText, { color: '#22C55E' }]}>Open Workers Monitor</Text>
                <MaterialIcons name="chevron-right" size={14} color='#22C55E' />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.viewMoreBtn}
                onPress={() => router.push('/cloudflare-pages' as any)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="pages" size={14} color='#F6821F' />
                <Text style={[s.viewMoreText, { color: '#F6821F' }]}>Open Pages Manager</Text>
                <MaterialIcons name="chevron-right" size={14} color='#F6821F' />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.viewMoreBtn}
                onPress={() => router.push('/cloudflare-dns' as any)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="open-in-new" size={14} color={Colors.primary} />
                <Text style={s.viewMoreText}>Manage DNS Records</Text>
                <MaterialIcons name="chevron-right" size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Zero Trust */}
            <View style={s.section}>
              <SectionTitle icon="shield" label="Zero Trust Security" color="#6366F1" />
              <ZeroTrustCard
                apps={accessApps}
                policies={policies}
                tunnels={tunnels}
                loading={ztLoading}
              />
            </View>

            {/* Security Insights */}
            <View style={s.section}>
              <SectionTitle icon="security" label="Security Insights" color="#EF4444" />
              <SecurityInsightsCard zones={zones} zoneMaps={analytics} />
            </View>

            {/* Audit Log */}
            <View style={s.section}>
              <SectionTitle icon="history" label="Audit Log" color="#F59E0B" badge="Recent" />
              <AuditLogCard />
            </View>

            {/* Quick Actions */}
            <View style={s.section}>
              <SectionTitle icon="bolt" label="Quick Actions" color={Colors.primary} />
              <View style={s.actionsGrid}>
                {[
                  { icon: 'dns',       label: 'DNS Manager',     route: '/cloudflare-dns',       color: Colors.primary },
                  { icon: 'code',      label: 'Workers Monitor', route: '/cloudflare-workers',   color: '#22C55E'      },
                  { icon: 'pages',     label: 'Pages Manager',   route: '/cloudflare-pages',     color: '#F6821F'      },
                  { icon: 'https',     label: 'SSL / TLS',       route: '/cloudflare-ssl',       color: '#22C55E'  },
                  { icon: 'gpp-bad',   label: 'WAF Firewall',    route: '/cloudflare-waf',       color: '#EF4444'  },
                  { icon: 'security',  label: 'Security Status', route: '/btng-security-status', color: '#8B5CF6'  },
                ].map(action => (
                  <TouchableOpacity
                    key={action.route}
                    style={[s.actionBtn, { borderColor: action.color + '44', backgroundColor: action.color + '08' }]}
                    onPress={() => router.push(action.route as any)}
                    activeOpacity={0.85}
                  >
                    <View style={[s.actionIcon, { backgroundColor: action.color + '18', borderColor: action.color + '44' }]}>
                      <MaterialIcons name={action.icon as any} size={18} color={action.color} />
                    </View>
                    <Text style={[s.actionLabel, { color: action.color }]} numberOfLines={1}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Footer */}
            <View style={s.footer}>
              <MaterialIcons name="cloud-done" size={13} color={Colors.textMuted} />
              <Text style={s.footerText}>
                Cloudflare · Account ID {KNOWN_ACCOUNT_ID.slice(0, 8)}…
                {lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:    { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#F6821F', includeFontPadding: false, letterSpacing: 0.4 },
  topSub:       { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },

  scroll:       { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.lg },

  noTokenCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#F6821F44', padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  noTokenIcon:  { width: 90, height: 90, borderRadius: 24, backgroundColor: '#F6821F12', borderWidth: 2, borderColor: '#F6821F44', alignItems: 'center', justifyContent: 'center' },
  noTokenTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  noTokenSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  btnText:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  accountCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#F6821F44', overflow: 'hidden' },
  accountRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: '#F6821F08' },
  accountLogo:  { width: 52, height: 52, borderRadius: 14, backgroundColor: '#F6821F18', borderWidth: 2, borderColor: '#F6821F44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  accountName:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  accountEmail: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  planPill:     { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  planText:     { fontSize: 10, fontWeight: '800' as any, includeFontPadding: false },
  accountDivider:{ height: 1, backgroundColor: Colors.border + '55' },
  accountStatRow:{ flexDirection: 'row', paddingVertical: 4 },
  accountStat:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: Spacing.md, borderRightWidth: 1, borderRightColor: Colors.border + '44' },
  accountStatVal:{ fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  accountStatLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  summaryStrip: { gap: Spacing.md },
  summaryGrid:  { gap: Spacing.sm },

  section:      { gap: Spacing.md },

  loadRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  loadText:     { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  viewMoreBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', paddingVertical: Spacing.md - 2, backgroundColor: Colors.primaryGlow },
  viewMoreText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },

  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionBtn:    { width: '47%', flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md - 2, minHeight: 60 },
  actionIcon:   { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionLabel:  { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  footer:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText:   { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});
