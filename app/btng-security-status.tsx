
/**
 * BTNG712 Security Status Screen
 * Live view of SSL Pinning, Sovereign Handshake, and Node Health.
 * Read-only — no changes to any existing screens or services.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { bootstrapSecurity, getLastBootstrapResult } from '@/services/securityBootstrap';
import { getNodeHealthSnapshot, releaseNodeFromQuarantine } from '@/services/verifiedBreakerService';
import { getStatus as getSslStatus } from '@/services/sslPinningService';
import type { SecurityBootstrapResult } from '@/services/securityBootstrap';
import type { NodeHealth } from '@/services/verifiedBreakerService';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    SECURE:              { bg: Colors.successBg,  color: Colors.success  },
    PARTIAL:             { bg: Colors.warningBg,  color: Colors.warning  },
    DEGRADED:            { bg: Colors.errorBg,    color: Colors.error    },
    active:              { bg: Colors.successBg,  color: Colors.success  },
    disabled_dev:        { bg: Colors.warningBg,  color: Colors.warning  },
    disabled_placeholder:{ bg: Colors.warningBg,  color: Colors.warning  },
    unavailable:         { bg: Colors.errorBg,    color: Colors.error    },
    pass:                { bg: Colors.successBg,  color: Colors.success  },
    fail:                { bg: Colors.errorBg,    color: Colors.error    },
    unknown:             { bg: Colors.bgElevated, color: Colors.textMuted},
    QUARANTINED:         { bg: Colors.errorBg,    color: Colors.error    },
    OK:                  { bg: Colors.successBg,  color: Colors.success  },
  };
  const c = cfg[status] ?? { bg: Colors.bgElevated, color: Colors.textMuted };
  return (
    <View style={[badge.wrap, { backgroundColor: c.bg, paddingVertical: size === 'sm' ? 2 : 3 }]}>
      <Text style={[badge.text, { color: c.color, fontSize: size === 'sm' ? 9 : 10 }]}>
        {status}
      </Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: { borderRadius: Radius.full, paddingHorizontal: 8 },
  text: { fontWeight: FontWeight.heavy, letterSpacing: 0.4, includeFontPadding: false },
});

// ─── Section card ─────────────────────────────────────────────────────────────
function SCard({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  return (
    <View style={[sc.card, { borderLeftColor: color }]}>
      <View style={sc.header}>
        <View style={[sc.icon, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <MaterialIcons name={icon as any} size={16} color={color} />
        </View>
        <Text style={sc.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  icon:   { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:  { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
});

// ─── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={[ir.value, color ? { color } : {}]} numberOfLines={1}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  label: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  value: { flex: 2, fontSize: FontSize.sm, color: Colors.textPrimary, textAlign: 'right', fontWeight: FontWeight.medium, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BtngSecurityStatusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<SecurityBootstrapResult | null>(getLastBootstrapResult());
  const [nodeHealth, setNodeHealth]   = useState<NodeHealth[]>(getNodeHealthSnapshot());
  const [lastRun, setLastRun]         = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const r = await bootstrapSecurity(true);
      setResult(r);
      setNodeHealth(getNodeHealthSnapshot());
      setLastRun(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e: any) {
      console.warn('[SecurityStatus] Scan error:', e?.message);
    }
    setLoading(false);
  }, []); // Dependencies for useCallback are empty as there are no external dependencies it relies on that change over time.

  // Auto-run on mount if not yet bootstrapped
  useEffect(() => {
    if (!result) runScan();
  }, [result, runScan]); // Added `result` and `runScan` as dependencies. The original comment indicated an eslint-disable, but it's better to explicitly list dependencies for clarity and correctness.

  const sslStatus = getSslStatus();
  const overallColor =
    result?.overallStatus === 'SECURE'   ? Colors.success  :
    result?.overallStatus === 'PARTIAL'  ? Colors.warning  :
    result?.overallStatus === 'DEGRADED' ? Colors.error    : Colors.textMuted;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.topTitle}>BTNG712 Security</Text>
          <Text style={s.topSub}>Handshake · SSL Pinning · Circuit Breaker</Text>
        </View>
        <TouchableOpacity
          style={[s.scanBtn, loading && { opacity: 0.5 }]}
          onPress={runScan}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <MaterialIcons name="security" size={18} color={Colors.primary} />
          }
          <Text style={s.scanBtnText}>{loading ? 'Scanning…' : 'Run Scan'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Overall status hero */}
        <View style={[s.heroCard, { borderColor: overallColor + '55' }]}>
          <MaterialIcons
            name={result?.overallStatus === 'SECURE' ? 'verified-user' : result?.overallStatus === 'PARTIAL' ? 'shield' : 'gpp-bad'}
            size={48}
            color={overallColor}
          />
          <Text style={[s.heroStatus, { color: overallColor }]}>
            {result?.overallStatus ?? 'NOT SCANNED'}
          </Text>
          <Text style={s.heroSub}>
            {result?.overallStatus === 'SECURE'
              ? 'All security layers active. MITM protection enforced.'
              : result?.overallStatus === 'PARTIAL'
              ? 'Sovereign node verified. Configure SSL hashes for full protection.'
              : result?.overallStatus === 'DEGRADED'
              ? 'No verified node reachable. Check network and VPS status.'
              : 'Press Run Scan to check security status.'}
          </Text>
          {lastRun && <Text style={s.heroTime}>Last scan: {lastRun}</Text>}
        </View>

        {/* SSL Pinning */}
        <SCard title="SSL Certificate Pinning" icon="lock" color="#9945FF">
          <InfoRow label="Status"      value={sslStatus.mode}        color={sslStatus.mode === 'active' ? Colors.success : Colors.warning} />
          <InfoRow label="Initialized" value={sslStatus.initialized ? 'Yes' : 'No'} />
          <InfoRow label="Domains"     value={sslStatus.domains.join(', ') || '—'} />
          <View style={s.infoBox}>
            <MaterialIcons name="info-outline" size={13} color={Colors.warning} />
            <Text style={s.infoBoxText}>
              {sslStatus.mode === 'active'
                ? 'Real certificate hashes enforced. All TLS connections pinned.'
                : sslStatus.mode === 'disabled_dev'
                ? 'Pinning disabled in development. Will activate in production builds.'
                : 'Replace placeholder hashes in constants/securityConfig.ts → SSL_PIN_CONFIG to activate.'}
            </Text>
          </View>
        </SCard>

        {/* Sovereign Handshake */}
        <SCard title="Sovereign Node Handshake" icon="vpn-key" color={Colors.primary}>
          <InfoRow
            label="Verified Node"
            value={result?.nodeDiscovery.nodeName ?? '—'}
            color={result?.nodeDiscovery.success ? Colors.success : Colors.error}
          />
          <InfoRow
            label="Result"
            value={result?.nodeDiscovery.success ? 'PASS' : (result?.nodeDiscovery.error ?? '—')}
            color={result?.nodeDiscovery.success ? Colors.success : Colors.error}
          />
          {result?.nodeDiscovery.durationMs != null && (
            <InfoRow label="Duration" value={`${result.nodeDiscovery.durationMs}ms`} />
          )}
          <View style={s.infoBox}>
            <MaterialIcons name="info-outline" size={13} color={Colors.primary} />
            <Text style={s.infoBoxText}>
              Replace ROOT_AUTHORITY_ADDRESS in constants/securityConfig.ts with your
              Master Sovereign Public Key to activate full ECDSA verification.
            </Text>
          </View>
        </SCard>

        {/* Node Health */}
        <SCard title="Node Health Monitor" icon="hub" color="#3B82F6">
          {nodeHealth.map((h, i) => {
            const quarantined = h.quarantinedUntil > Date.now();
            const nodeStatus  = quarantined ? 'QUARANTINED' : h.lastResult === 'pass' ? 'OK' : h.lastResult === 'fail' ? 'fail' : 'unknown';
            return (
              <View key={h.url} style={[s.nodeRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.nodeName}>{h.name}</Text>
                    <StatusBadge status={nodeStatus} size="sm" />
                  </View>
                  <Text style={s.nodeUrl} numberOfLines={1}>{h.url}</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Text style={s.nodeMeta}>Failures: {h.failures}</Text>
                    {h.lastVerified > 0 && (
                      <Text style={s.nodeMeta}>
                        Verified: {new Date(h.lastVerified).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                </View>
                {quarantined && (
                  <TouchableOpacity
                    style={s.releaseBtn}
                    onPress={() => { releaseNodeFromQuarantine(h.url); setNodeHealth(getNodeHealthSnapshot()); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="lock-open" size={13} color={Colors.warning} />
                    <Text style={s.releaseBtnText}>Release</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </SCard>

        {/* Production checklist */}
        <SCard title="Production Checklist" icon="checklist" color={Colors.success}>
          {[
            { done: false, text: 'Generate Master Sovereign Keypair on HSM' },
            { done: false, text: 'Set ROOT_AUTHORITY_ADDRESS in securityConfig.ts' },
            { done: false, text: 'Sign node identities and expose /api/identity-proof' },
            { done: false, text: 'Generate SHA-256 cert hashes for each domain' },
            { done: false, text: 'Replace placeholder hashes in SSL_PIN_CONFIG' },
            { done: false, text: 'Install react-native-ssl-public-key-pinning' },
            { done: true,  text: 'Handshake service created (services/handshakeService.ts)' },
            { done: true,  text: 'SSL pinning service created (services/sslPinningService.ts)' },
            { done: true,  text: 'Verified circuit breaker created (services/verifiedBreakerService.ts)' },
            { done: true,  text: 'Security bootstrap created (services/securityBootstrap.ts)' },
          ].map((item, i) => (
            <View key={i} style={s.checkRow}>
              <MaterialIcons
                name={item.done ? 'check-circle' : 'radio-button-unchecked'}
                size={16}
                color={item.done ? Colors.success : Colors.textMuted}
              />
              <Text style={[s.checkText, item.done && { color: Colors.textSecondary }]}>
                {item.text}
              </Text>
            </View>
          ))}
        </SCard>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:    { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  scanBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '55' },
  scanBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  scroll:    { padding: Spacing.xl, gap: Spacing.lg },
  heroCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 2, alignItems: 'center', gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 6 },
  heroStatus:{ fontSize: 24, fontWeight: FontWeight.heavy, includeFontPadding: false },
  heroSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  heroTime:  { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  infoBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, marginTop: 4 },
  infoBoxText:{ flex: 1, fontSize: 10, color: Colors.textSecondary, lineHeight: 15, includeFontPadding: false },
  nodeRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm + 2 },
  nodeName:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  nodeUrl:   { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  nodeMeta:  { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  releaseBtn:{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningBg, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.warning + '44' },
  releaseBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  checkRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  checkText: { flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary, lineHeight: 17, includeFontPadding: false },
});
