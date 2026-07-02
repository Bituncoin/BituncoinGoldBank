/**
 * app/cloudflare-ssl.tsx
 * Cloudflare SSL/TLS Status & Settings Screen
 *
 * Per zone (bituncoin.world + bituncoin.cloud):
 *  • Certificate verification status   — GET /zones/{id}/ssl/verification
 *  • SSL encryption mode selector      — GET/PATCH /zones/{id}/settings/ssl
 *  • Always Use HTTPS toggle           — GET/PATCH /zones/{id}/settings/always_use_https
 *  • HSTS settings                     — GET/PATCH /zones/{id}/settings/security_header
 *  • Minimum TLS version               — GET/PATCH /zones/{id}/settings/min_tls_version
 *
 * Uses stored Cloudflare API token (same as other CF screens).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Animated, Easing, Switch,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import {
  getCFToken, listZones,
  getSSLSetting, updateSSLSetting,
  getSSLVerification, getAlwaysHTTPS, updateAlwaysHTTPS,
  getHSTSSetting, updateHSTSSetting,
  getTLSMinVersion, updateTLSMinVersion,
  type CloudflareZone,
  type SSLMode, type SSLSetting, type SSLVerificationRecord,
  type AlwaysHTTPSSetting, type HSSTSetting, type TLSVersionSetting,
} from '@/services/cloudflareService';

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_ACCOUNT_ID = 'e2d017e4674fbc13224b06b65209ebe1';
const KNOWN_DOMAINS    = ['bituncoin.world', 'bituncoin.cloud'] as const;
type KnownDomain       = typeof KNOWN_DOMAINS[number];

const DOMAIN_CFG: Record<KnownDomain, { color: string; emoji: string; accent: string }> = {
  'bituncoin.world': { color: '#D4A017', emoji: '🌍', accent: '#D4A01722' },
  'bituncoin.cloud': { color: '#3B82F6', emoji: '☁️', accent: '#3B82F622' },
};

// SSL mode configuration
const SSL_MODES: {
  value: SSLMode;
  label: string;
  desc: string;
  icon: string;
  color: string;
  riskLevel: 'none' | 'low' | 'medium' | 'high';
}[] = [
  {
    value: 'off',
    label: 'Off',
    desc: 'No SSL — HTTP only. Visitors see a warning. Not recommended.',
    icon: 'no-encryption',
    color: '#EF4444',
    riskLevel: 'high',
  },
  {
    value: 'flexible',
    label: 'Flexible',
    desc: 'Encrypts traffic between visitor and Cloudflare. Origin may be HTTP.',
    icon: 'lock-open',
    color: '#F59E0B',
    riskLevel: 'medium',
  },
  {
    value: 'full',
    label: 'Full',
    desc: 'Encrypts end-to-end. Origin certificate can be self-signed.',
    icon: 'lock',
    color: '#22C55E',
    riskLevel: 'low',
  },
  {
    value: 'strict',
    label: 'Full (Strict)',
    desc: 'Strongest — origin must have a valid CA-signed certificate.',
    icon: 'verified-user',
    color: '#3B82F6',
    riskLevel: 'none',
  },
];

// TLS version options
const TLS_VERSIONS = [
  { value: '1.0', label: 'TLS 1.0', color: '#EF4444', risk: 'Deprecated' },
  { value: '1.1', label: 'TLS 1.1', color: '#F59E0B', risk: 'Legacy'     },
  { value: '1.2', label: 'TLS 1.2', color: '#22C55E', risk: 'Recommended'},
  { value: '1.3', label: 'TLS 1.3', color: '#3B82F6', risk: 'Latest'     },
];

// HSTS max-age presets (in seconds)
const HSTS_MAX_AGE_PRESETS = [
  { label: 'Disabled', value: 0        },
  { label: '1 month',  value: 2592000  },
  { label: '3 months', value: 7776000  },
  { label: '6 months', value: 15552000 },
  { label: '1 year',   value: 31536000 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function certStatusColor(status: string): string {
  if (status === 'active') return '#22C55E';
  if (status === 'pending_validation' || status === 'pending_issuance') return '#F59E0B';
  if (status === 'expired' || status === 'revoked') return '#EF4444';
  return '#9CA3AF';
}

function certStatusIcon(status: string): string {
  if (status === 'active') return 'verified';
  if (status.startsWith('pending')) return 'pending';
  if (status === 'expired') return 'event-busy';
  if (status === 'revoked') return 'cancel';
  return 'help-outline';
}

function certStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatMaxAge(sec: number): string {
  if (sec === 0) return 'Disabled';
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  if (sec < 2592000) return `${Math.round(sec / 86400)}d`;
  if (sec < 31536000) return `${Math.round(sec / 2592000)}mo`;
  return `${Math.round(sec / 31536000)}yr`;
}

function timeSince(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 30) return `${Math.floor(days / 30)}mo ago`;
    if (days > 0) return `${days}d ago`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs > 0) return `${hrs}h ago`;
    return 'recently';
  } catch { return '—'; }
}

function timeUntil(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff < 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    if (days > 365) return `${Math.floor(days / 365)}yr`;
    if (days > 30) return `${Math.floor(days / 30)}mo`;
    return `${days}d`;
  } catch { return '—'; }
}

// ─── Zone data container ──────────────────────────────────────────────────────

interface ZoneSSLData {
  zone:         CloudflareZone;
  ssl?:         SSLSetting;
  certs:        SSLVerificationRecord[];
  alwaysHttps?: AlwaysHTTPSSetting;
  hsts?:        { id: string; value: HSSTSetting };
  tlsMin?:      TLSVersionSetting;
  loading:      boolean;
  error?:       string;
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
      <View style={[tt.wrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={15} color={color} />
      </View>
      <Text style={[tt.label, { color }]}>{label}</Text>
      {badge !== undefined && (
        <View style={[tt.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[tt.badgeText, { color }]}>{badge}</Text>
        </View>
      )}
    </View>
  );
}
const tt = StyleSheet.create({
  wrap:      { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, flex: 1 },
  badge:     { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '800' as any, includeFontPadding: false },
});

// ─── Certificate Card ─────────────────────────────────────────────────────────

function CertCard({ cert, color }: { cert: SSLVerificationRecord; color: string }) {
  const statusColor = certStatusColor(cert.certificate_status);
  const isActive    = cert.certificate_status === 'active';
  const expiresIn   = timeUntil(cert.expires_on);
  const expiresUrgent = cert.expires_on
    ? (new Date(cert.expires_on).getTime() - Date.now()) < 30 * 86400000
    : false;

  return (
    <View style={[cc.card, { borderLeftColor: statusColor, borderLeftWidth: 3 }]}>
      <View style={cc.row}>
        <View style={[cc.iconWrap, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
          <MaterialIcons name={certStatusIcon(cert.certificate_status) as any} size={18} color={statusColor} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <View style={[cc.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
              {isActive && <LiveDot color={statusColor} size={4} />}
              <Text style={[cc.statusText, { color: statusColor }]}>
                {certStatusLabel(cert.certificate_status)}
              </Text>
            </View>
            <View style={[cc.typePill, { backgroundColor: color + '12', borderColor: color + '33' }]}>
              <Text style={[cc.typeText, { color }]}>{cert.type?.toUpperCase() ?? 'UNIVERSAL'}</Text>
            </View>
            {cert.signature && (
              <View style={[cc.typePill, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                <Text style={[cc.typeText, { color: Colors.textMuted }]}>{cert.signature}</Text>
              </View>
            )}
          </View>
          {cert.hosts && cert.hosts.length > 0 && (
            <Text style={cc.hosts} numberOfLines={1}>
              {cert.hosts.join(', ')}
            </Text>
          )}
        </View>
        {cert.expires_on && (
          <View style={[cc.expiry, { backgroundColor: expiresUrgent ? '#EF444410' : Colors.bgElevated, borderColor: expiresUrgent ? '#EF444444' : Colors.border }]}>
            <MaterialIcons name="event" size={10} color={expiresUrgent ? '#EF4444' : Colors.textMuted} />
            <Text style={[cc.expiryText, { color: expiresUrgent ? '#EF4444' : Colors.textMuted }]}>
              {expiresIn}
            </Text>
          </View>
        )}
      </View>

      {/* Validation info */}
      {cert.verification_info && (
        <View style={[cc.verifyBox, { borderColor: color + '33', backgroundColor: color + '06' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <MaterialIcons name="dns" size={11} color={color} />
            <Text style={[cc.verifyLabel, { color }]}>DNS VERIFICATION</Text>
          </View>
          <View style={cc.verifyRow}>
            <Text style={cc.verifyKey}>Name</Text>
            <Text style={cc.verifyVal} selectable numberOfLines={1}>{cert.verification_info.record_name}</Text>
          </View>
          <View style={cc.verifyRow}>
            <Text style={cc.verifyKey}>Target</Text>
            <Text style={cc.verifyVal} selectable numberOfLines={1}>{cert.verification_info.record_target}</Text>
          </View>
        </View>
      )}

      {/* Validation errors */}
      {cert.validation_errors && cert.validation_errors.length > 0 && (
        <View style={[cc.errBox, { borderColor: '#EF444433', backgroundColor: '#EF444410' }]}>
          <MaterialIcons name="error-outline" size={13} color="#EF4444" />
          <View style={{ flex: 1, gap: 2 }}>
            {cert.validation_errors.map((e, i) => (
              <Text key={i} style={cc.errText}>{e.message}</Text>
            ))}
          </View>
        </View>
      )}

      {/* Timestamps */}
      <View style={{ flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' }}>
        {cert.issued_on && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="schedule" size={10} color={Colors.textMuted} />
            <Text style={cc.meta}>Issued {timeSince(cert.issued_on)}</Text>
          </View>
        )}
        {cert.expires_on && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="event-busy" size={10} color={expiresUrgent ? '#EF4444' : Colors.textMuted} />
            <Text style={[cc.meta, expiresUrgent && { color: '#EF4444' }]}>
              Expires {new Date(cert.expires_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        )}
        {cert.cert_pack_uuid && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="fingerprint" size={10} color={Colors.textMuted} />
            <Text style={cc.meta}>{cert.cert_pack_uuid.slice(0, 12)}…</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const cc = StyleSheet.create({
  card:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  iconWrap:    { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  statusText:  { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  typePill:    { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  typeText:    { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  hosts:       { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  expiry:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  expiryText:  { fontSize: 9, fontWeight: '700' as any, includeFontPadding: false },
  verifyBox:   { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, gap: 3 },
  verifyLabel: { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false, letterSpacing: 0.5 },
  verifyRow:   { flexDirection: 'row', gap: 8 },
  verifyKey:   { fontSize: 9, color: Colors.textMuted, width: 40, includeFontPadding: false },
  verifyVal:   { flex: 1, fontSize: 9, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  errBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  errText:     { fontSize: FontSize.xs, color: '#EF4444', lineHeight: 16, includeFontPadding: false },
  meta:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ─── SSL Mode Selector ────────────────────────────────────────────────────────

function SSLModeSelector({
  current,
  updating,
  onSelect,
}: {
  current: SSLMode | undefined;
  updating: boolean;
  onSelect: (mode: SSLMode) => void;
}) {
  return (
    <View style={{ gap: Spacing.sm }}>
      {SSL_MODES.map(m => {
        const active = current === m.value;
        return (
          <TouchableOpacity
            key={m.value}
            style={[ms.row, active && { borderColor: m.color, backgroundColor: m.color + '08' }]}
            onPress={() => onSelect(m.value)}
            activeOpacity={0.85}
            disabled={updating}
          >
            <View style={[ms.iconWrap, { backgroundColor: m.color + '18', borderColor: m.color + '44' }]}>
              <MaterialIcons name={m.icon as any} size={18} color={m.color} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={[ms.label, active && { color: m.color }]}>{m.label}</Text>
                {m.riskLevel !== 'none' && (
                  <View style={[ms.riskPill, {
                    backgroundColor: m.riskLevel === 'high' ? '#EF444418' : m.riskLevel === 'medium' ? '#F59E0B18' : '#22C55E18',
                    borderColor: m.riskLevel === 'high' ? '#EF444444' : m.riskLevel === 'medium' ? '#F59E0B44' : '#22C55E44',
                  }]}>
                    <Text style={[ms.riskText, {
                      color: m.riskLevel === 'high' ? '#EF4444' : m.riskLevel === 'medium' ? '#F59E0B' : '#22C55E',
                    }]}>
                      {m.riskLevel.toUpperCase()} RISK
                    </Text>
                  </View>
                )}
              </View>
              <Text style={ms.desc}>{m.desc}</Text>
            </View>
            <View style={[ms.radio, active && { borderColor: m.color, backgroundColor: m.color + '18' }]}>
              {active && (
                updating
                  ? <ActivityIndicator size="small" color={m.color} />
                  : <View style={[ms.radioDot, { backgroundColor: m.color }]} />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const ms = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md },
  iconWrap: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  desc:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
  riskPill: { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  riskText: { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  radio:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});

// ─── TLS Version Selector ─────────────────────────────────────────────────────

function TLSVersionSelector({
  current,
  updating,
  onSelect,
}: {
  current: string | undefined;
  updating: boolean;
  onSelect: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
      {TLS_VERSIONS.map(v => {
        const active = current === v.value;
        return (
          <TouchableOpacity
            key={v.value}
            style={[tv.btn, active && { borderColor: v.color, backgroundColor: v.color + '12' }]}
            onPress={() => onSelect(v.value)}
            activeOpacity={0.85}
            disabled={updating}
          >
            <Text style={[tv.label, active && { color: v.color }]}>{v.label}</Text>
            <Text style={[tv.risk, { color: active ? v.color : Colors.textMuted }]}>{v.risk}</Text>
            {active && !updating && (
              <View style={[tv.dot, { backgroundColor: v.color }]} />
            )}
            {active && updating && <ActivityIndicator size="small" color={v.color} style={{ marginTop: 2 }} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const tv = StyleSheet.create({
  btn:   { flex: 1, minWidth: '22%', alignItems: 'center', gap: 4, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgCard, padding: Spacing.sm + 4, paddingVertical: Spacing.md - 2 },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  risk:  { fontSize: 9, fontWeight: '700' as any, includeFontPadding: false },
  dot:   { width: 6, height: 6, borderRadius: 3 },
});

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  icon, label, desc, value, onToggle, disabled, color = '#22C55E',
}: {
  icon: string; label: string; desc: string;
  value: boolean; onToggle: (v: boolean) => void;
  disabled?: boolean; color?: string;
}) {
  return (
    <View style={[tr.row, value && { borderColor: color + '44', backgroundColor: color + '06' }]}>
      <View style={[tr.icon, { backgroundColor: color + '18', borderColor: color + '33' }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[tr.label, value && { color }]}>{label}</Text>
        <Text style={tr.desc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: Colors.border, true: color + '55' }}
        thumbColor={value ? color : Colors.bgElevated}
      />
    </View>
  );
}
const tr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md },
  icon:  { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  desc:  { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
});

// ─── HSTS Card ────────────────────────────────────────────────────────────────

function HSTSCard({
  hsts,
  updating,
  onUpdate,
}: {
  hsts: HSSTSetting | undefined;
  updating: boolean;
  onUpdate: (partial: Partial<HSSTSetting>) => void;
}) {
  const enabled = hsts?.enabled ?? false;
  const maxAge  = hsts?.max_age ?? 0;

  return (
    <View style={hc.card}>
      <View style={hc.header}>
        <View style={[hc.icon, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF644' }]}>
          <MaterialIcons name="security" size={18} color="#8B5CF6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={hc.title}>HSTS Settings</Text>
          <Text style={hc.sub}>HTTP Strict Transport Security</Text>
        </View>
        {updating && <ActivityIndicator size="small" color="#8B5CF6" />}
      </View>

      {/* Enable / disable */}
      <View style={hc.row}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={hc.rowLabel}>Enable HSTS</Text>
          <Text style={hc.rowDesc}>Force browsers to always use HTTPS for this domain.</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={v => onUpdate({ enabled: v })}
          disabled={updating}
          trackColor={{ false: Colors.border, true: '#8B5CF655' }}
          thumbColor={enabled ? '#8B5CF6' : Colors.bgElevated}
        />
      </View>

      {enabled && (
        <>
          {/* Max age picker */}
          <View style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialIcons name="timer" size={12} color={Colors.textMuted} />
              <Text style={{ fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false }}>MAX AGE</Text>
              <View style={[hc.currentBadge, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF644' }]}>
                <Text style={{ fontSize: 9, color: '#8B5CF6', fontWeight: '700' as any, includeFontPadding: false }}>
                  Current: {formatMaxAge(maxAge)}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
              {HSTS_MAX_AGE_PRESETS.map(p => {
                const active = maxAge === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    style={[hc.ageBtn, active && { borderColor: '#8B5CF6', backgroundColor: '#8B5CF618' }]}
                    onPress={() => onUpdate({ max_age: p.value })}
                    disabled={updating}
                    activeOpacity={0.85}
                  >
                    <Text style={[hc.ageBtnText, active && { color: '#8B5CF6' }]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Include subdomains */}
          <View style={hc.row}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={hc.rowLabel}>Include Subdomains</Text>
              <Text style={hc.rowDesc}>Apply HSTS to all subdomains as well.</Text>
            </View>
            <Switch
              value={hsts?.include_subdomains ?? false}
              onValueChange={v => onUpdate({ include_subdomains: v })}
              disabled={updating}
              trackColor={{ false: Colors.border, true: '#8B5CF655' }}
              thumbColor={(hsts?.include_subdomains ?? false) ? '#8B5CF6' : Colors.bgElevated}
            />
          </View>

          {/* Preload */}
          <View style={hc.row}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={hc.rowLabel}>Preload</Text>
              <Text style={hc.rowDesc}>
                Submit to browser HSTS preload lists. Requires max-age ≥ 1 year + subdomains enabled.
              </Text>
            </View>
            <Switch
              value={hsts?.preload ?? false}
              onValueChange={v => onUpdate({ preload: v })}
              disabled={updating || maxAge < 31536000 || !(hsts?.include_subdomains)}
              trackColor={{ false: Colors.border, true: '#8B5CF655' }}
              thumbColor={(hsts?.preload ?? false) ? '#8B5CF6' : Colors.bgElevated}
            />
          </View>

          {/* Warning */}
          <View style={[hc.warn, { borderColor: '#F59E0B44', backgroundColor: '#F59E0B08' }]}>
            <MaterialIcons name="warning-amber" size={13} color={Colors.warning} />
            <Text style={[hc.warnText, { color: Colors.warning }]}>
              HSTS is difficult to undo. Ensure your SSL certificate is valid before enabling with long max-age values.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
const hc = StyleSheet.create({
  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#8B5CF644', overflow: 'hidden' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', backgroundColor: '#8B5CF608' },
  icon:         { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  sub:          { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  row:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md - 2, borderTopWidth: 1, borderTopColor: Colors.border + '44' },
  rowLabel:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  rowDesc:      { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
  currentBadge: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  ageBtn:       { borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgElevated },
  ageBtnText:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  warn:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, margin: Spacing.md, marginTop: 4, padding: Spacing.sm + 2 },
  warnText:     { flex: 1, fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false },
});

// ─── Zone SSL Panel ───────────────────────────────────────────────────────────

function ZoneSSLPanel({
  data,
  onUpdateSSL,
  onUpdateAlwaysHttps,
  onUpdateHSTS,
  onUpdateTLS,
  updatingSSL,
  updatingHttps,
  updatingHSTS,
  updatingTLS,
}: {
  data: ZoneSSLData;
  onUpdateSSL:         (mode: SSLMode) => void;
  onUpdateAlwaysHttps: (v: 'on' | 'off') => void;
  onUpdateHSTS:        (partial: Partial<HSSTSetting>) => void;
  onUpdateTLS:         (v: string) => void;
  updatingSSL:    boolean;
  updatingHttps:  boolean;
  updatingHSTS:   boolean;
  updatingTLS:    boolean;
}) {
  const dc = DOMAIN_CFG[data.zone.name as KnownDomain] ?? { color: Colors.primary, emoji: '🌐', accent: Colors.primaryGlow };
  const currentMode = data.ssl?.value;
  const modeCfg     = SSL_MODES.find(m => m.value === currentMode);

  // Summary score
  const score = (() => {
    let s = 0;
    if (currentMode === 'strict') s += 40;
    else if (currentMode === 'full') s += 30;
    else if (currentMode === 'flexible') s += 15;
    if (data.alwaysHttps?.value === 'on') s += 20;
    if (data.hsts?.value?.enabled) s += 20;
    if (data.hsts?.value?.include_subdomains) s += 10;
    if (data.hsts?.value?.preload) s += 10;
    const cert = data.certs.find(c => c.certificate_status === 'active');
    if (cert) s += 20; else if (data.certs.length === 0) s += 10;
    return Math.min(100, s);
  })();

  const scoreColor = score >= 80 ? '#22C55E' : score >= 50 ? '#F59E0B' : '#EF4444';
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs Improvement';

  return (
    <View style={zp.wrap}>
      {/* Zone header */}
      <View style={[zp.header, { backgroundColor: dc.accent, borderColor: dc.color + '44' }]}>
        <Text style={{ fontSize: 26 }}>{dc.emoji}</Text>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[zp.domain, { color: dc.color }]}>{data.zone.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {modeCfg && (
              <View style={[zp.pill, { backgroundColor: modeCfg.color + '18', borderColor: modeCfg.color + '44' }]}>
                <MaterialIcons name={modeCfg.icon as any} size={9} color={modeCfg.color} />
                <Text style={[zp.pillText, { color: modeCfg.color }]}>{modeCfg.label.toUpperCase()}</Text>
              </View>
            )}
            {data.alwaysHttps?.value === 'on' && (
              <View style={[zp.pill, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                <MaterialIcons name="https" size={9} color="#22C55E" />
                <Text style={[zp.pillText, { color: '#22C55E' }]}>ALWAYS HTTPS</Text>
              </View>
            )}
            {data.loading && <ActivityIndicator size="small" color={dc.color} />}
          </View>
        </View>
        {/* Score badge */}
        <View style={[zp.scoreBadge, { backgroundColor: scoreColor + '18', borderColor: scoreColor + '44' }]}>
          <Text style={[zp.scoreNum, { color: scoreColor }]}>{score}</Text>
          <Text style={[zp.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
        </View>
      </View>

      {data.loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md }}>
          <ActivityIndicator size="small" color={dc.color} />
          <Text style={{ fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false }}>Loading SSL settings…</Text>
        </View>
      ) : (
        <View style={{ padding: Spacing.md, gap: Spacing.lg }}>

          {/* Certificates */}
          {data.certs.length > 0 && (
            <View style={{ gap: Spacing.sm }}>
              <SectionTitle icon="verified" label="Certificates" color={dc.color} badge={data.certs.length} />
              {data.certs.map((cert, i) => (
                <CertCard key={i} cert={cert} color={dc.color} />
              ))}
            </View>
          )}

          {data.certs.length === 0 && !data.loading && (
            <View style={[zp.noCert, { borderColor: Colors.warning + '44', backgroundColor: Colors.warning + '08' }]}>
              <MaterialIcons name="warning-amber" size={16} color={Colors.warning} />
              <Text style={[zp.noCertText, { color: Colors.warning }]}>
                No SSL certificate data returned — the API may require additional zone permissions.
              </Text>
            </View>
          )}

          {/* SSL mode */}
          <View style={{ gap: Spacing.sm }}>
            <SectionTitle icon="lock" label="Encryption Mode" color={dc.color} />
            <SSLModeSelector
              current={currentMode}
              updating={updatingSSL}
              onSelect={onUpdateSSL}
            />
          </View>

          {/* Always HTTPS */}
          <View style={{ gap: Spacing.sm }}>
            <SectionTitle icon="https" label="HTTPS Redirect" color="#22C55E" />
            <ToggleRow
              icon="redirect"
              label="Always Use HTTPS"
              desc="Redirect all HTTP requests to HTTPS automatically. Strongly recommended."
              value={data.alwaysHttps?.value === 'on'}
              onToggle={v => onUpdateAlwaysHttps(v ? 'on' : 'off')}
              disabled={updatingHttps}
              color="#22C55E"
            />
          </View>

          {/* TLS minimum version */}
          <View style={{ gap: Spacing.sm }}>
            <SectionTitle icon="verified-user" label="Minimum TLS Version" color="#3B82F6" />
            <View style={[zp.tlsNote, { borderColor: '#3B82F644', backgroundColor: '#3B82F608' }]}>
              <MaterialIcons name="info-outline" size={12} color="#3B82F6" />
              <Text style={[zp.tlsNoteText, { color: '#3B82F6' }]}>
                Connections using older TLS versions will be rejected. TLS 1.2 is recommended for best compatibility.
              </Text>
            </View>
            <TLSVersionSelector
              current={data.tlsMin?.value}
              updating={updatingTLS}
              onSelect={onUpdateTLS}
            />
          </View>

          {/* HSTS */}
          <View style={{ gap: Spacing.sm }}>
            <SectionTitle icon="security" label="HSTS" color="#8B5CF6" />
            <HSTSCard
              hsts={data.hsts?.value}
              updating={updatingHSTS}
              onUpdate={onUpdateHSTS}
            />
          </View>

          {/* Security score breakdown */}
          <View style={[zp.scoreCard, { borderColor: scoreColor + '44' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <View style={[zp.scoreIcon, { backgroundColor: scoreColor + '18', borderColor: scoreColor + '44' }]}>
                <MaterialIcons name="shield" size={16} color={scoreColor} />
              </View>
              <Text style={[zp.scoreCardTitle, { color: scoreColor }]}>Security Score: {score}/100 · {scoreLabel}</Text>
            </View>
            {/* Score bar */}
            <View style={[zp.scoreBar, { backgroundColor: Colors.bgElevated }]}>
              <View style={[zp.scoreFill, { width: `${score}%` as any, backgroundColor: scoreColor }]} />
            </View>
            <View style={{ gap: 5, marginTop: Spacing.sm }}>
              {[
                { label: 'Encryption Mode',   pass: currentMode === 'full' || currentMode === 'strict', pts: 30 },
                { label: 'Always HTTPS',       pass: data.alwaysHttps?.value === 'on',                   pts: 20 },
                { label: 'HSTS Enabled',       pass: data.hsts?.value?.enabled ?? false,                 pts: 20 },
                { label: 'HSTS Subdomains',    pass: data.hsts?.value?.include_subdomains ?? false,       pts: 10 },
                { label: 'Certificate Active', pass: data.certs.some(c => c.certificate_status === 'active'), pts: 20 },
              ].map(item => (
                <View key={item.label} style={zp.scoreRow}>
                  <MaterialIcons
                    name={item.pass ? 'check-circle' : 'radio-button-unchecked'}
                    size={13}
                    color={item.pass ? '#22C55E' : Colors.textMuted}
                  />
                  <Text style={[zp.scoreRowLabel, { color: item.pass ? Colors.textSecondary : Colors.textMuted }]}>
                    {item.label}
                  </Text>
                  <Text style={[zp.scoreRowPts, { color: item.pass ? '#22C55E' : Colors.textMuted }]}>
                    {item.pass ? `+${item.pts}` : `+0`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const zp = StyleSheet.create({
  wrap:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  domain:        { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  pill:          { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  pillText:      { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  scoreBadge:    { alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, minWidth: 52, flexShrink: 0 },
  scoreNum:      { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  scoreLabel:    { fontSize: 8, fontWeight: '700' as any, includeFontPadding: false, textAlign: 'center' },
  noCert:        { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  noCertText:    { flex: 1, fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false },
  tlsNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  tlsNoteText:   { flex: 1, fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false },
  scoreCard:     { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, backgroundColor: Colors.bgElevated },
  scoreIcon:     { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  scoreCardTitle:{ flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  scoreBar:      { height: 8, borderRadius: 4, overflow: 'hidden' },
  scoreFill:     { height: 8, borderRadius: 4 },
  scoreRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  scoreRowLabel: { flex: 1, fontSize: FontSize.xs, includeFontPadding: false },
  scoreRowPts:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CloudflareSSLScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { showAlert } = useAlert();

  const [apiToken,   setApiToken]   = useState('');
  const [connected,  setConnected]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh,setLastRefresh]= useState<Date | null>(null);

  // Per-zone SSL data
  const [zoneData,   setZoneData]   = useState<ZoneSSLData[]>([]);

  // Updating states per zone
  const [updatingSSL,   setUpdatingSSL]   = useState<Record<string, boolean>>({});
  const [updatingHttps, setUpdatingHttps] = useState<Record<string, boolean>>({});
  const [updatingHSTS,  setUpdatingHSTS]  = useState<Record<string, boolean>>({});
  const [updatingTLS,   setUpdatingTLS]   = useState<Record<string, boolean>>({});

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const tok = await getCFToken();
      if (tok) { setApiToken(tok); setConnected(true); loadAll(tok); }
    })();
  }, []);

  const loadZoneSSL = useCallback(async (zone: CloudflareZone, token: string): Promise<ZoneSSLData> => {
    const [sslRes, certRes, httpsRes, hstsRes, tlsRes] = await Promise.all([
      getSSLSetting(zone.id, token),
      getSSLVerification(zone.id, token),
      getAlwaysHTTPS(zone.id, token),
      getHSTSSetting(zone.id, token),
      getTLSMinVersion(zone.id, token),
    ]);
    return {
      zone,
      ssl:        sslRes.data,
      certs:      certRes.data ?? [],
      alwaysHttps:httpsRes.data,
      hsts:       hstsRes.data,
      tlsMin:     tlsRes.data,
      loading:    false,
      error:      sslRes.error ?? certRes.error,
    };
  }, []);

  const loadAll = useCallback(async (token: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    // Get zones first
    const { data: zones } = await listZones(token);
    const targetZones = zones?.filter(z => KNOWN_DOMAINS.includes(z.name as KnownDomain)) ?? [];

    // Set loading skeletons
    setZoneData(targetZones.map(z => ({ zone: z, certs: [], loading: true })));

    // Load each zone in parallel
    const results = await Promise.all(targetZones.map(z => loadZoneSSL(z, token)));
    setZoneData(results);
    setLastRefresh(new Date());
    if (isRefresh) setRefreshing(false);
  }, [loadZoneSSL]);

  const handleRefresh = useCallback(() => {
    if (apiToken) loadAll(apiToken, true);
  }, [apiToken, loadAll]);

  // ── Update handlers ───────────────────────────────────────────────────────

  const handleUpdateSSL = useCallback(async (zone: CloudflareZone, mode: SSLMode) => {
    const modeCfg = SSL_MODES.find(m => m.value === mode);
    showAlert(
      `Set ${modeCfg?.label ?? mode} mode?`,
      `Change SSL encryption for ${zone.name} to ${modeCfg?.label ?? mode}.\n\n${modeCfg?.desc ?? ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm', style: 'default', onPress: async () => {
            setUpdatingSSL(prev => ({ ...prev, [zone.id]: true }));
            const { data, error } = await updateSSLSetting(zone.id, mode, apiToken);
            setUpdatingSSL(prev => ({ ...prev, [zone.id]: false }));
            if (error) { showAlert('Update Failed', error); return; }
            if (data) {
              setZoneData(prev => prev.map(d =>
                d.zone.id === zone.id ? { ...d, ssl: data } : d
              ));
              showAlert('Updated', `SSL mode for ${zone.name} set to ${modeCfg?.label ?? mode}.`);
            }
          },
        },
      ],
    );
  }, [apiToken, showAlert]);

  const handleUpdateAlwaysHttps = useCallback(async (zone: CloudflareZone, value: 'on' | 'off') => {
    setUpdatingHttps(prev => ({ ...prev, [zone.id]: true }));
    const { data, error } = await updateAlwaysHTTPS(zone.id, value, apiToken);
    setUpdatingHttps(prev => ({ ...prev, [zone.id]: false }));
    if (error) { showAlert('Update Failed', error); return; }
    if (data) {
      setZoneData(prev => prev.map(d =>
        d.zone.id === zone.id ? { ...d, alwaysHttps: data } : d
      ));
    }
  }, [apiToken, showAlert]);

  const handleUpdateHSTS = useCallback(async (zone: CloudflareZone, partial: Partial<HSSTSetting>) => {
    setUpdatingHSTS(prev => ({ ...prev, [zone.id]: true }));
    const existing = zoneData.find(d => d.zone.id === zone.id)?.hsts?.value;
    const merged = { ...(existing ?? { enabled: false, max_age: 0, include_subdomains: false, nosniff: false, preload: false }), ...partial };
    const { data, error } = await updateHSTSSetting(zone.id, merged, apiToken);
    setUpdatingHSTS(prev => ({ ...prev, [zone.id]: false }));
    if (error) { showAlert('HSTS Update Failed', error); return; }
    if (data) {
      setZoneData(prev => prev.map(d =>
        d.zone.id === zone.id ? { ...d, hsts: data } : d
      ));
    }
  }, [apiToken, showAlert, zoneData]);

  const handleUpdateTLS = useCallback(async (zone: CloudflareZone, version: string) => {
    const label = TLS_VERSIONS.find(v => v.value === version)?.label ?? version;
    showAlert(
      `Set Minimum TLS ${label}?`,
      `Connections from clients using older TLS versions will be rejected for ${zone.name}. Ensure your infrastructure supports ${label}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm', style: 'default', onPress: async () => {
            setUpdatingTLS(prev => ({ ...prev, [zone.id]: true }));
            const { data, error } = await updateTLSMinVersion(zone.id, version, apiToken);
            setUpdatingTLS(prev => ({ ...prev, [zone.id]: false }));
            if (error) { showAlert('TLS Update Failed', error); return; }
            if (data) {
              setZoneData(prev => prev.map(d =>
                d.zone.id === zone.id ? { ...d, tlsMin: data } : d
              ));
              showAlert('Updated', `Minimum TLS for ${zone.name} set to ${label}.`);
            }
          },
        },
      ],
    );
  }, [apiToken, showAlert]);

  // ── Render ────────────────────────────────────────────────────────────────

  const totalCerts   = zoneData.reduce((a, d) => a + d.certs.length, 0);
  const activeCerts  = zoneData.reduce((a, d) => a + d.certs.filter(c => c.certificate_status === 'active').length, 0);
  const strictZones  = zoneData.filter(d => d.ssl?.value === 'strict' || d.ssl?.value === 'full').length;
  const httpsZones   = zoneData.filter(d => d.alwaysHttps?.value === 'on').length;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>SSL / TLS Manager</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={connected ? Colors.success : Colors.textMuted} size={5} />
            <Text style={[s.topSub, { color: connected ? Colors.success : Colors.textMuted }]}>
              {connected
                ? `${KNOWN_DOMAINS.length} zones · ${lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading…'}`
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
        {/* NOT CONNECTED */}
        {!connected && (
          <View style={s.noTokenCard}>
            <View style={s.noTokenIcon}>
              <MaterialIcons name="https" size={40} color="#22C55E" />
            </View>
            <Text style={s.noTokenTitle}>Connect Cloudflare First</Text>
            <Text style={s.noTokenSub}>
              Add your Cloudflare API token in the DNS Manager to view and manage SSL/TLS settings for{' '}
              <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>bituncoin.world</Text>
              {' '}and{' '}
              <Text style={{ color: '#3B82F6', fontWeight: FontWeight.bold }}>bituncoin.cloud</Text>.
            </Text>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#22C55E', shadowColor: '#22C55E' }]}
              onPress={() => router.push('/cloudflare-dns' as any)}
              activeOpacity={0.87}
            >
              <MaterialIcons name="dns" size={17} color={Colors.bg} />
              <Text style={s.btnText}>Open DNS Manager</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* CONNECTED */}
        {connected && (
          <>
            {/* Summary strip */}
            <View style={s.summaryStrip}>
              {[
                { icon: 'verified',      label: 'Active Certs',    value: zoneData.some(d => d.loading) ? '…' : String(activeCerts),  color: '#22C55E'       },
                { icon: 'lock',          label: 'Full/Strict',     value: zoneData.some(d => d.loading) ? '…' : String(strictZones),  color: '#3B82F6'       },
                { icon: 'https',         label: 'Always HTTPS',    value: zoneData.some(d => d.loading) ? '…' : String(httpsZones),   color: Colors.primary  },
                { icon: 'dns',           label: 'Zones',           value: String(KNOWN_DOMAINS.length),                               color: '#8B5CF6'       },
              ].map((item, idx) => (
                <View key={item.label} style={[s.summaryItem, idx < 3 && { borderRightWidth: 1, borderRightColor: Colors.border + '55' }]}>
                  <View style={[s.summaryIcon, { backgroundColor: item.color + '18', borderColor: item.color + '33' }]}>
                    <MaterialIcons name={item.icon as any} size={13} color={item.color} />
                  </View>
                  <Text style={[s.summaryVal, { color: item.color }]}>{item.value}</Text>
                  <Text style={s.summaryLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Info banner */}
            <View style={[s.infoBanner, { borderColor: '#3B82F644', backgroundColor: '#3B82F608' }]}>
              <MaterialIcons name="info-outline" size={14} color="#3B82F6" />
              <Text style={[s.infoBannerText, { color: '#3B82F6' }]}>
                SSL/TLS changes take effect within seconds and apply globally via Cloudflare edge network. Changes to HSTS are browser-cached and may take time to revert.
              </Text>
            </View>

            {/* Zone SSL panels */}
            {zoneData.map(data => (
              <ZoneSSLPanel
                key={data.zone.id}
                data={data}
                onUpdateSSL={mode => handleUpdateSSL(data.zone, mode)}
                onUpdateAlwaysHttps={v => handleUpdateAlwaysHttps(data.zone, v)}
                onUpdateHSTS={partial => handleUpdateHSTS(data.zone, partial)}
                onUpdateTLS={v => handleUpdateTLS(data.zone, v)}
                updatingSSL={!!updatingSSL[data.zone.id]}
                updatingHttps={!!updatingHttps[data.zone.id]}
                updatingHSTS={!!updatingHSTS[data.zone.id]}
                updatingTLS={!!updatingTLS[data.zone.id]}
              />
            ))}

            {/* Loading skeleton if no zones yet */}
            {zoneData.length === 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md }}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={{ fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false }}>Loading zones…</Text>
              </View>
            )}

            {/* Quick Actions */}
            <View style={s.actionsCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <View style={[s.actIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                  <MaterialIcons name="bolt" size={16} color={Colors.primary} />
                </View>
                <Text style={s.actTitle}>Quick Actions</Text>
              </View>
              <View style={s.actGrid}>
                {[
                  { icon: 'dashboard', label: 'Dashboard',    route: '/cloudflare-dashboard', color: '#F6821F'       },
                  { icon: 'dns',       label: 'DNS Manager',  route: '/cloudflare-dns',        color: Colors.primary  },
                  { icon: 'code',      label: 'Workers',      route: '/cloudflare-workers',    color: '#22C55E'       },
                  { icon: 'pages',     label: 'Pages',        route: '/cloudflare-pages',      color: '#F59E0B'       },
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
              <MaterialIcons name="https" size={12} color={Colors.textMuted} />
              <Text style={s.footerText}>
                Cloudflare SSL/TLS · bituncoin.world + bituncoin.cloud
                {connected && lastRefresh ? ` · ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
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
  summaryStrip:    { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  summaryItem:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.md },
  summaryIcon:     { width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summaryVal:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  summaryLabel:    { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  infoBanner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  infoBannerText:  { flex: 1, fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },
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
