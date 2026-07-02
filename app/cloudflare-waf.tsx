/**
 * app/cloudflare-waf.tsx
 * Cloudflare WAF (Web Application Firewall) Manager
 *
 * Per zone (bituncoin.world + bituncoin.cloud):
 *  • List managed rule packages  — GET  /zones/{id}/firewall/waf/packages
 *  • Toggle package on/off        — PATCH /zones/{id}/firewall/waf/packages/{pkg_id}
 *  • Sensitivity selector (OWASP) — PATCH with sensitivity: high/medium/low/off
 *  • Action mode selector         — simulate / block / challenge
 *  • Per-package rule groups      — GET  /zones/{id}/firewall/waf/packages/{pkg_id}/groups
 *  • Toggle group mode            — PATCH on/off/default per group
 *
 * Uses stored Cloudflare API token from cloudflareService.ts.
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
  listWAFPackages, updateWAFPackage,
  listWAFGroups, updateWAFGroup,
  type CloudflareZone,
  type CloudflareWAFPackage, type CloudflareWAFGroup,
  type WAFPackageActionMode, type WAFSensitivity, type WAFGroupMode,
} from '@/services/cloudflareService';

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_ACCOUNT_ID = 'e2d017e4674fbc13224b06b65209ebe1';
const KNOWN_DOMAINS    = ['bituncoin.world', 'bituncoin.cloud'] as const;
type KnownDomain       = typeof KNOWN_DOMAINS[number];

const DOMAIN_CFG: Record<KnownDomain, { color: string; emoji: string; accent: string }> = {
  'bituncoin.world': { color: '#D4A017', emoji: '🌍', accent: '#D4A01722' },
  'bituncoin.cloud': { color: '#3B82F6', emoji: '☁️', accent: '#3B82F622' },
};

// Package type detection
const OWASP_NAME_RE   = /owasp/i;
const CF_MANAGED_NAME = /cloudflare managed/i;

// Action mode config
const ACTION_MODES: {
  value: WAFPackageActionMode;
  label: string;
  desc: string;
  icon: string;
  color: string;
}[] = [
  { value: 'simulate',  label: 'Simulate',  desc: 'Log but do not block — safe for tuning new rules.',         icon: 'science',        color: '#3B82F6' },
  { value: 'block',     label: 'Block',     desc: 'Block matching requests with a 403 Forbidden response.',    icon: 'block',          color: '#EF4444' },
  { value: 'challenge', label: 'Challenge', desc: 'Present a JS / CAPTCHA challenge to suspicious visitors.',  icon: 'quiz',           color: '#F59E0B' },
];

// Sensitivity config (OWASP)
const SENSITIVITY_OPTIONS: {
  value: WAFSensitivity;
  label: string;
  desc: string;
  color: string;
  riskLabel: string;
}[] = [
  { value: 'high',   label: 'High',     desc: 'Maximum rule coverage — higher chance of false positives.',   color: '#3B82F6', riskLabel: 'Strict'       },
  { value: 'medium', label: 'Medium',   desc: 'Balanced protection and false-positive tolerance.',            color: '#22C55E', riskLabel: 'Balanced'     },
  { value: 'low',    label: 'Low',      desc: 'Minimal rules — low false positives, reduced coverage.',       color: '#F59E0B', riskLabel: 'Permissive'   },
  { value: 'off',    label: 'Off',      desc: 'OWASP scoring disabled — only Cloudflare managed rules fire.', color: '#6B7280', riskLabel: 'Disabled'     },
];

// Group mode config
const GROUP_MODE_CFG: Record<WAFGroupMode, { label: string; color: string; icon: string }> = {
  on:      { label: 'On',      color: '#22C55E', icon: 'check-circle'    },
  off:     { label: 'Off',     color: '#EF4444', icon: 'cancel'          },
  default: { label: 'Default', color: '#F59E0B', icon: 'settings'        },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOWASP(pkg: CloudflareWAFPackage | { name: string }): boolean {
  return OWASP_NAME_RE.test(pkg.name);
}

function packageColor(pkg: CloudflareWAFPackage): string {
  if (isOWASP(pkg))           return '#F59E0B';
  if (CF_MANAGED_NAME.test(pkg.name)) return '#F6821F';
  return '#8B5CF6';
}

function packageIcon(pkg: CloudflareWAFPackage): string {
  if (isOWASP(pkg))           return 'shield';
  if (CF_MANAGED_NAME.test(pkg.name)) return 'security';
  return 'verified-user';
}

function statusColor(status: string): string {
  return status === 'active' ? '#22C55E' : '#6B7280';
}

// ─── Animated Live Dot ────────────────────────────────────────────────────────

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

// ─── Section Title ────────────────────────────────────────────────────────────

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

// ─── Action Mode Selector ─────────────────────────────────────────────────────

function ActionModeSelector({
  current,
  updating,
  onSelect,
}: {
  current: WAFPackageActionMode | undefined;
  updating: boolean;
  onSelect: (m: WAFPackageActionMode) => void;
}) {
  return (
    <View style={{ gap: Spacing.sm }}>
      {ACTION_MODES.map(m => {
        const active = current === m.value;
        return (
          <TouchableOpacity
            key={m.value}
            style={[am.row, active && { borderColor: m.color, backgroundColor: m.color + '08' }]}
            onPress={() => onSelect(m.value)}
            activeOpacity={0.85}
            disabled={updating}
          >
            <View style={[am.icon, { backgroundColor: m.color + '18', borderColor: m.color + '44' }]}>
              <MaterialIcons name={m.icon as any} size={16} color={m.color} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[am.label, active && { color: m.color }]}>{m.label}</Text>
              <Text style={am.desc}>{m.desc}</Text>
            </View>
            <View style={[am.radio, active && { borderColor: m.color, backgroundColor: m.color + '18' }]}>
              {active && (updating
                ? <ActivityIndicator size="small" color={m.color} />
                : <View style={[am.radioDot, { backgroundColor: m.color }]} />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const am = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md },
  icon:     { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  desc:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
  radio:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});

// ─── Sensitivity Selector (OWASP only) ───────────────────────────────────────

function SensitivitySelector({
  current,
  updating,
  onSelect,
}: {
  current: WAFSensitivity | undefined;
  updating: boolean;
  onSelect: (s: WAFSensitivity) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
      {SENSITIVITY_OPTIONS.map(opt => {
        const active = current === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[sv.btn, active && { borderColor: opt.color, backgroundColor: opt.color + '12' }]}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.85}
            disabled={updating}
          >
            <Text style={[sv.label, active && { color: opt.color }]}>{opt.label}</Text>
            <View style={[sv.risk, { backgroundColor: opt.color + '18', borderColor: opt.color + '44' }]}>
              <Text style={[sv.riskText, { color: opt.color }]}>{opt.riskLabel}</Text>
            </View>
            {active && !updating && <View style={[sv.dot, { backgroundColor: opt.color }]} />}
            {active && updating && <ActivityIndicator size="small" color={opt.color} style={{ marginTop: 2 }} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const sv = StyleSheet.create({
  btn:      { flex: 1, minWidth: '22%', alignItems: 'center', gap: 5, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgCard, padding: Spacing.sm + 4, paddingVertical: Spacing.md - 2 },
  label:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  risk:     { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  riskText: { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  dot:      { width: 6, height: 6, borderRadius: 3 },
});

// ─── WAF Group Row ────────────────────────────────────────────────────────────

function WAFGroupRow({
  group,
  color,
  updating,
  onModeChange,
}: {
  group: CloudflareWAFGroup;
  color: string;
  updating: boolean;
  onModeChange: (g: CloudflareWAFGroup, mode: WAFGroupMode) => void;
}) {
  const modeCfg  = GROUP_MODE_CFG[group.mode] ?? GROUP_MODE_CFG['default'];
  const hasEdits = group.modified_rules_count > 0;

  return (
    <View style={gr.row}>
      <View style={[gr.iconWrap, { backgroundColor: color + '12', borderColor: color + '33' }]}>
        <MaterialIcons name="rule" size={13} color={color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={gr.name} numberOfLines={1}>{group.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <View style={[gr.pill, { backgroundColor: modeCfg.color + '18', borderColor: modeCfg.color + '44' }]}>
            {group.mode === 'on' ? <LiveDot color={modeCfg.color} size={4} /> : <MaterialIcons name={modeCfg.icon as any} size={9} color={modeCfg.color} />}
            <Text style={[gr.pillText, { color: modeCfg.color }]}>{modeCfg.label.toUpperCase()}</Text>
          </View>
          <View style={[gr.pill, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
            <MaterialIcons name="rule-folder" size={9} color={Colors.textMuted} />
            <Text style={[gr.pillText, { color: Colors.textMuted }]}>{group.rules_count} rules</Text>
          </View>
          {hasEdits && (
            <View style={[gr.pill, { backgroundColor: color + '12', borderColor: color + '33' }]}>
              <MaterialIcons name="edit" size={9} color={color} />
              <Text style={[gr.pillText, { color }]}>{group.modified_rules_count} modified</Text>
            </View>
          )}
        </View>
        {group.description ? (
          <Text style={gr.desc} numberOfLines={2}>{group.description}</Text>
        ) : null}
      </View>

      {/* Mode cycle buttons */}
      <View style={gr.modeBtns}>
        {(['on', 'off', 'default'] as WAFGroupMode[]).map(m => {
          const mc = GROUP_MODE_CFG[m];
          const active = group.mode === m;
          return (
            <TouchableOpacity
              key={m}
              style={[gr.modeBtn, active && { backgroundColor: mc.color, borderColor: mc.color }]}
              onPress={() => !active && onModeChange(group, m)}
              disabled={updating || active}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              {updating && active
                ? <ActivityIndicator size="small" color={Colors.bg} style={{ width: 12, height: 12 }} />
                : <MaterialIcons name={mc.icon as any} size={11} color={active ? Colors.bg : Colors.textMuted} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const gr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  iconWrap:  { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  name:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  pill:      { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  pillText:  { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  desc:      { fontSize: 9, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false },
  modeBtns:  { flexDirection: 'column', gap: 4, flexShrink: 0 },
  modeBtn:   { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
});

// ─── WAF Package Card ─────────────────────────────────────────────────────────

interface PackageState {
  pkg:    CloudflareWAFPackage;
  groups: CloudflareWAFGroup[];
  groupsLoaded: boolean;
  groupsLoading: boolean;
}

function WAFPackageCard({
  state,
  zoneId,
  token,
  onUpdatePackage,
  onUpdateGroup,
  updatingPkg:   updatingPkgMap,
  updatingGroup: updatingGroupMap,
}: {
  state: PackageState;
  zoneId: string;
  token: string;
  onUpdatePackage: (pkg: CloudflareWAFPackage, data: Parameters<typeof updateWAFPackage>[2]) => void;
  onUpdateGroup:   (pkg: CloudflareWAFPackage, group: CloudflareWAFGroup, mode: WAFGroupMode) => void;
  updatingPkg:   Record<string, boolean>;
  updatingGroup: Record<string, boolean>;
}) {
  const [expanded, setExpanded] = useState(false);

  const { pkg, groups, groupsLoaded, groupsLoading } = state;
  const color   = packageColor(pkg);
  const icon    = packageIcon(pkg);
  const isOW    = isOWASP(pkg);
  const isActive = pkg.status === 'active';
  const updPkg   = !!updatingPkg[pkg.id];

  const totalRules   = groups.reduce((a, g) => a + g.rules_count, 0);
  const modifiedGrps = groups.filter(g => g.modified_rules_count > 0).length;
  const activeGroups = groups.filter(g => g.mode === 'on').length;

  const handleToggleActive = () => {
    onUpdatePackage(pkg, { status: isActive ? 'not-active' : 'active' });
  };

  const handleExpand = () => {
    setExpanded(prev => !prev);
  };

  return (
    <View style={[pc.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      {/* Header */}
      <View style={[pc.header, { backgroundColor: color + '08', borderBottomColor: Colors.border + '55' }]}>
        <View style={[pc.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <MaterialIcons name={icon as any} size={22} color={color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[pc.name, { color }]} numberOfLines={1}>{pkg.name}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <View style={[pc.pill, { backgroundColor: statusColor(pkg.status) + '18', borderColor: statusColor(pkg.status) + '44' }]}>
              {isActive ? <LiveDot color="#22C55E" size={4} /> : <MaterialIcons name="cancel" size={9} color="#6B7280" />}
              <Text style={[pc.pillText, { color: statusColor(pkg.status) }]}>
                {isActive ? 'ACTIVE' : 'INACTIVE'}
              </Text>
            </View>
            <View style={[pc.pill, { backgroundColor: color + '12', borderColor: color + '33' }]}>
              <MaterialIcons name="precision-manufacturing" size={9} color={color} />
              <Text style={[pc.pillText, { color }]}>{pkg.detection_mode?.toUpperCase() ?? 'TRADITIONAL'}</Text>
            </View>
            {updPkg && <ActivityIndicator size="small" color={color} />}
          </View>
        </View>

        {/* Active toggle */}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Switch
            value={isActive}
            onValueChange={handleToggleActive}
            disabled={updPkg}
            trackColor={{ false: Colors.border, true: color + '55' }}
            thumbColor={isActive ? color : Colors.bgElevated}
          />
          <TouchableOpacity
            style={[pc.expandBtn, expanded && { backgroundColor: color + '18', borderColor: color + '44' }]}
            onPress={handleExpand}
            activeOpacity={0.8}
          >
            <MaterialIcons name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={16} color={expanded ? color : Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats row */}
      <View style={pc.statsRow}>
        {[
          { icon: 'rule-folder', label: 'Groups',        value: groups.length || '—',    color },
          { icon: 'list-alt',    label: 'Total Rules',   value: totalRules || '—',        color: '#3B82F6' },
          { icon: 'check-circle',label: 'Groups On',     value: activeGroups,              color: '#22C55E' },
          { icon: 'edit',        label: 'Modified Grps', value: modifiedGrps,              color: '#F59E0B' },
        ].map(s => (
          <View key={s.label} style={[pc.stat, { backgroundColor: (s.color as string) + '08', borderColor: (s.color as string) + '22' }]}>
            <MaterialIcons name={s.icon as any} size={11} color={s.color as string} />
            <Text style={[pc.statVal, { color: s.color as string }]}>{String(s.value)}</Text>
            <Text style={pc.statKey}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Description */}
      {pkg.description ? (
        <Text style={pc.desc} numberOfLines={2}>{pkg.description}</Text>
      ) : null}

      {/* Expanded controls */}
      {expanded && (
        <View style={pc.expandedWrap}>

          {/* Action mode selector */}
          <View style={{ gap: Spacing.sm }}>
            <SectionTitle icon="settings" label="Action Mode" color={color} />
            <ActionModeSelector
              current={pkg.action_mode}
              updating={updPkg}
              onSelect={mode => onUpdatePackage(pkg, { action_mode: mode })}
            />
          </View>

          {/* Sensitivity (OWASP only) */}
          {isOW && (
            <View style={{ gap: Spacing.sm }}>
              <SectionTitle icon="tune" label="OWASP Sensitivity" color="#F59E0B" />
              <View style={[pc.owasp, { borderColor: '#F59E0B33', backgroundColor: '#F59E0B06' }]}>
                <MaterialIcons name="info-outline" size={12} color="#F59E0B" />
                <Text style={[pc.owaspNote, { color: '#F59E0B' }]}>
                  OWASP sensitivity controls the anomaly score threshold. Lower sensitivity = fewer false positives but weaker protection.
                </Text>
              </View>
              <SensitivitySelector
                current={pkg.sensitivity}
                updating={updPkg}
                onSelect={s => onUpdatePackage(pkg, { sensitivity: s })}
              />
            </View>
          )}

          {/* Rule groups */}
          <View style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <SectionTitle icon="rule-folder" label="Rule Groups" color={color} badge={groups.length || undefined} />
              {groupsLoading && <ActivityIndicator size="small" color={color} />}
            </View>

            {groupsLoading && groups.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Spacing.sm }}>
                <ActivityIndicator size="small" color={color} />
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>Loading rule groups…</Text>
              </View>
            ) : groups.length > 0 ? (
              <View style={[pc.groupsWrap, { borderColor: color + '33' }]}>
                {/* Group mode legend */}
                <View style={pc.groupLegend}>
                  {(['on', 'off', 'default'] as WAFGroupMode[]).map(m => {
                    const mc = GROUP_MODE_CFG[m];
                    return (
                      <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={[pc.legendDot, { backgroundColor: mc.color }]} />
                        <Text style={[pc.legendText, { color: mc.color }]}>{mc.label}</Text>
                      </View>
                    );
                  })}
                  <Text style={pc.legendHint}>Tap mode buttons to switch</Text>
                </View>
                {groups.map((g, idx) => (
                  <WAFGroupRow
                    key={g.id}
                    group={g}
                    color={color}
                    updating={!!updatingGroup[g.id]}
                    onModeChange={(group, mode) => onUpdateGroup(pkg, group, mode)}
                  />
                ))}
              </View>
            ) : !groupsLoaded ? (
              <View style={[pc.noGroupsCard, { borderColor: color + '33', backgroundColor: color + '06' }]}>
                <MaterialIcons name="info-outline" size={13} color={color} />
                <Text style={[pc.noGroupsText, { color }]}>
                  Expand again to load rule groups — requires API token with WAF permissions.
                </Text>
              </View>
            ) : (
              <View style={[pc.noGroupsCard, { borderColor: Colors.border }]}>
                <MaterialIcons name="rule-folder" size={13} color={Colors.textMuted} />
                <Text style={pc.noGroupsText}>No rule groups returned for this package.</Text>
              </View>
            )}
          </View>

        </View>
      )}
    </View>
  );
}

const pc = StyleSheet.create({
  card:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1 },
  iconWrap:    { width: 50, height: 50, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  pill:        { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  pillText:    { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  expandBtn:   { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  statsRow:    { flexDirection: 'row', gap: 6, padding: Spacing.md, paddingTop: Spacing.sm, flexWrap: 'wrap' },
  stat:        { flex: 1, minWidth: '22%', alignItems: 'center', gap: 4, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: 6, paddingVertical: Spacing.sm + 2 },
  statVal:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statKey:     { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  desc:        { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md - 4, includeFontPadding: false },
  expandedWrap:{ padding: Spacing.md, gap: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border + '55' },
  owasp:       { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  owaspNote:   { flex: 1, fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false },
  groupsWrap:  { borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, overflow: 'hidden' },
  groupLegend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '44', flexWrap: 'wrap' },
  legendDot:   { width: 7, height: 7, borderRadius: 3.5 },
  legendText:  { fontSize: 9, fontWeight: '700' as any, includeFontPadding: false },
  legendHint:  { flex: 1, fontSize: 9, color: Colors.textMuted, textAlign: 'right', includeFontPadding: false },
  noGroupsCard:{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  noGroupsText:{ flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
});

// ─── Zone WAF Panel ───────────────────────────────────────────────────────────

interface ZoneWAFData {
  zone:       CloudflareZone;
  packages:   PackageState[];
  loading:    boolean;
  error?:     string;
}

function ZoneWAFPanel({
  data,
  token,
  onUpdatePackage,
  onUpdateGroup,
  updatingPkg,
  updatingGroup,
  onLoadGroups,
}: {
  data: ZoneWAFData;
  token: string;
  onUpdatePackage: (zone: CloudflareZone, pkg: CloudflareWAFPackage, pdata: Parameters<typeof updateWAFPackage>[2]) => void;
  onUpdateGroup:   (zone: CloudflareZone, pkg: CloudflareWAFPackage, group: CloudflareWAFGroup, mode: WAFGroupMode) => void;
  updatingPkg:   Record<string, boolean>;
  updatingGroup: Record<string, boolean>;
  onLoadGroups:  (zone: CloudflareZone, pkg: CloudflareWAFPackage) => void;
}) {
  const dc          = DOMAIN_CFG[data.zone.name as KnownDomain] ?? { color: Colors.primary, emoji: '🌐', accent: Colors.primaryGlow };
  const activeCount = data.packages.filter(p => p.pkg.status === 'active').length;
  const totalGroups = data.packages.reduce((a, p) => a + p.groups.length, 0);
  const totalRules  = data.packages.reduce((a, p) => a + p.groups.reduce((b, g) => b + g.rules_count, 0), 0);

  return (
    <View style={[zp.wrap, { borderColor: dc.color + '44' }]}>
      {/* Zone header */}
      <View style={[zp.header, { backgroundColor: dc.accent, borderBottomColor: dc.color + '33' }]}>
        <Text style={{ fontSize: 26 }}>{dc.emoji}</Text>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[zp.domain, { color: dc.color }]}>{data.zone.name}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <View style={[zp.pill, { backgroundColor: dc.color + '18', borderColor: dc.color + '44' }]}>
              <MaterialIcons name="security" size={9} color={dc.color} />
              <Text style={[zp.pillText, { color: dc.color }]}>{data.packages.length} PACKAGES</Text>
            </View>
            <View style={[zp.pill, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
              <LiveDot color="#22C55E" size={4} />
              <Text style={[zp.pillText, { color: '#22C55E' }]}>{activeCount} ACTIVE</Text>
            </View>
            {data.loading && <ActivityIndicator size="small" color={dc.color} />}
          </View>
        </View>
        {/* Summary stats */}
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[zp.statBadge, { backgroundColor: dc.color + '18', borderColor: dc.color + '44' }]}>
            <Text style={[zp.statBadgeNum, { color: dc.color }]}>{totalRules || '—'}</Text>
            <Text style={[zp.statBadgeLabel, { color: dc.color }]}>rules</Text>
          </View>
        </View>
      </View>

      {data.loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md }}>
          <ActivityIndicator size="small" color={dc.color} />
          <Text style={{ fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false }}>Loading WAF packages…</Text>
        </View>
      ) : data.error ? (
        <View style={[zp.errCard, { margin: Spacing.md, borderColor: '#EF444444', backgroundColor: '#EF444408' }]}>
          <MaterialIcons name="error-outline" size={14} color="#EF4444" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#EF4444', includeFontPadding: false }}>Failed to load WAF data</Text>
            <Text style={{ fontSize: FontSize.xs, color: '#FCA5A5', lineHeight: 15, includeFontPadding: false }}>{data.error}</Text>
            <Text style={{ fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 }}>
              Note: WAF packages require a Pro, Business, or Enterprise zone. Free zones may return empty.
            </Text>
          </View>
        </View>
      ) : data.packages.length === 0 ? (
        <View style={[zp.emptyCard, { margin: Spacing.md, borderColor: Colors.warning + '44', backgroundColor: Colors.warning + '08' }]}>
          <MaterialIcons name="warning-amber" size={16} color={Colors.warning} />
          <Text style={[zp.emptyText, { color: Colors.warning }]}>
            No WAF packages found for {data.zone.name}.{'\n'}WAF managed rules require a Cloudflare Pro or higher plan.
          </Text>
        </View>
      ) : (
        <View style={{ padding: Spacing.md, gap: Spacing.md }}>
          {data.packages.map(ps => (
            <WAFPackageCard
              key={ps.pkg.id}
              state={ps}
              zoneId={data.zone.id}
              token={token}
              onUpdatePackage={(pkg, pdata) => onUpdatePackage(data.zone, pkg, pdata)}
              onUpdateGroup={(pkg, group, mode) => onUpdateGroup(data.zone, pkg, group, mode)}
              updatingPkg={updatingPkg}
              updatingGroup={updatingGroup}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const zp = StyleSheet.create({
  wrap:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden' },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1 },
  domain:        { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  pill:          { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  pillText:      { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  statBadge:     { alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  statBadgeNum:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statBadgeLabel:{ fontSize: 8, fontWeight: '700' as any, includeFontPadding: false },
  errCard:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  emptyCard:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  emptyText:     { flex: 1, fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },
});

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({ zoneData, loading }: { zoneData: ZoneWAFData[]; loading: boolean }) {
  const totalPkgs     = zoneData.reduce((a, z) => a + z.packages.length, 0);
  const activePkgs    = zoneData.reduce((a, z) => a + z.packages.filter(p => p.pkg.status === 'active').length, 0);
  const totalGroups   = zoneData.reduce((a, z) => a + z.packages.reduce((b, p) => b + p.groups.length, 0), 0);
  const totalRules    = zoneData.reduce((a, z) => a + z.packages.reduce((b, p) => b + p.groups.reduce((c, g) => c + g.rules_count, 0), 0), 0);

  const items = [
    { icon: 'security',    label: 'Packages',   value: loading ? '…' : String(totalPkgs),    color: '#F6821F'       },
    { icon: 'check-circle',label: 'Active',     value: loading ? '…' : String(activePkgs),   color: '#22C55E'       },
    { icon: 'rule-folder', label: 'Groups',     value: loading ? '…' : String(totalGroups),  color: Colors.primary  },
    { icon: 'list-alt',    label: 'Rules',      value: loading ? '…' : (totalRules > 0 ? String(totalRules) : '—'), color: '#8B5CF6' },
  ];

  return (
    <View style={ss.strip}>
      {items.map((item, idx) => (
        <View key={item.label} style={[ss.item, idx < 3 && { borderRightWidth: 1, borderRightColor: Colors.border + '55' }]}>
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

export default function CloudflareWAFScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { showAlert } = useAlert();

  const [apiToken,    setApiToken]    = useState('');
  const [connected,   setConnected]   = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [zoneData,    setZoneData]    = useState<ZoneWAFData[]>([]);

  // Updating states
  const [updatingPkg,   setUpdatingPkg]   = useState<Record<string, boolean>>({});
  const [updatingGroup, setUpdatingGroup] = useState<Record<string, boolean>>({});

  // ── Bootstrap ────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const tok = await getCFToken();
      if (tok) { setApiToken(tok); setConnected(true); loadAll(tok); }
    })();
  }, []);

  const loadZoneWAF = useCallback(async (zone: CloudflareZone, token: string): Promise<ZoneWAFData> => {
    const { data, error } = await listWAFPackages(zone.id, token);
    if (error || !data) {
      return { zone, packages: [], loading: false, error: error ?? 'No data returned' };
    }
    const packages: PackageState[] = data.map(pkg => ({
      pkg,
      groups: [],
      groupsLoaded: false,
      groupsLoading: false,
    }));
    return { zone, packages, loading: false };
  }, []);

  const loadAll = useCallback(async (token: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const { data: zones } = await listZones(token);
    const targets = zones?.filter(z => KNOWN_DOMAINS.includes(z.name as KnownDomain)) ?? [];

    // Set loading placeholders
    setZoneData(targets.map(z => ({ zone: z, packages: [], loading: true })));

    // Load each zone in parallel
    const results = await Promise.all(targets.map(z => loadZoneWAF(z, token)));
    setZoneData(results);
    setLastRefresh(new Date());
    if (isRefresh) setRefreshing(false);
  }, [loadZoneWAF]);

  // Load rule groups when a package is expanded (lazy)
  const handleLoadGroups = useCallback(async (zone: CloudflareZone, pkg: CloudflareWAFPackage) => {
    // Mark loading
    setZoneData(prev => prev.map(zd => zd.zone.id !== zone.id ? zd : {
      ...zd,
      packages: zd.packages.map(ps => ps.pkg.id !== pkg.id ? ps : { ...ps, groupsLoading: true }),
    }));
    const { data, error } = await listWAFGroups(zone.id, pkg.id, apiToken);
    setZoneData(prev => prev.map(zd => zd.zone.id !== zone.id ? zd : {
      ...zd,
      packages: zd.packages.map(ps => ps.pkg.id !== pkg.id ? ps : {
        ...ps,
        groups: data ?? [],
        groupsLoaded: true,
        groupsLoading: false,
      }),
    }));
    if (error) showAlert('Groups Error', error);
  }, [apiToken, showAlert]);

  // ── Update handlers ───────────────────────────────────────────────────────

  const handleUpdatePackage = useCallback(async (
    zone: CloudflareZone,
    pkg: CloudflareWAFPackage,
    pdata: Parameters<typeof updateWAFPackage>[2],
  ) => {
    const key = pkg.id;

    // Confirm destructive action mode change
    if (pdata.action_mode === 'block' || pdata.status === 'not-active') {
      const label = pdata.action_mode === 'block' ? 'Block mode' : 'Deactivate package';
      const msg   = pdata.action_mode === 'block'
        ? `Set "${pkg.name}" to Block mode on ${zone.name}? Matching requests will receive a 403 response.`
        : `Deactivate "${pkg.name}" on ${zone.name}? WAF protection from this package will stop.`;
      await new Promise<void>((resolve, reject) => {
        showAlert(label, msg, [
          { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('cancelled')) },
          { text: 'Confirm', style: 'default', onPress: () => resolve() },
        ]);
      }).catch(() => { return; });
    }

    setUpdatingPkg(prev => ({ ...prev, [key]: true }));
    const { data, error } = await updateWAFPackage(zone.id, pkg.id, pdata, apiToken);
    setUpdatingPkg(prev => ({ ...prev, [key]: false }));

    if (error) { showAlert('Update Failed', error); return; }
    if (data) {
      setZoneData(prev => prev.map(zd => zd.zone.id !== zone.id ? zd : {
        ...zd,
        packages: zd.packages.map(ps => ps.pkg.id !== pkg.id ? ps : { ...ps, pkg: data }),
      }));
    }
  }, [apiToken, showAlert]);

  const handleUpdateGroup = useCallback(async (
    zone: CloudflareZone,
    pkg: CloudflareWAFPackage,
    group: CloudflareWAFGroup,
    mode: WAFGroupMode,
  ) => {
    const key = group.id;
    setUpdatingGroup(prev => ({ ...prev, [key]: true }));
    const { data, error } = await updateWAFGroup(zone.id, pkg.id, group.id, mode, apiToken);
    setUpdatingGroup(prev => ({ ...prev, [key]: false }));

    if (error) { showAlert('Group Update Failed', error); return; }
    if (data) {
      setZoneData(prev => prev.map(zd => zd.zone.id !== zone.id ? zd : {
        ...zd,
        packages: zd.packages.map(ps => ps.pkg.id !== pkg.id ? ps : {
          ...ps,
          groups: ps.groups.map(g => g.id !== group.id ? g : data),
        }),
      }));
    }
  }, [apiToken, showAlert]);

  const handleRefresh = useCallback(() => {
    if (apiToken) loadAll(apiToken, true);
  }, [apiToken, loadAll]);

  // Derived
  const globalLoading = zoneData.some(z => z.loading);
  const totalPkgs     = zoneData.reduce((a, z) => a + z.packages.length, 0);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>WAF Manager</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={connected ? Colors.success : Colors.textMuted} size={5} />
            <Text style={[s.topSub, { color: connected ? Colors.success : Colors.textMuted }]}>
              {connected
                ? `${KNOWN_DOMAINS.length} zones · ${totalPkgs} package${totalPkgs !== 1 ? 's' : ''} · ${lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading…'}`
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
              <MaterialIcons name="gpp-bad" size={40} color="#EF4444" />
            </View>
            <Text style={s.noTokenTitle}>Connect Cloudflare First</Text>
            <Text style={s.noTokenSub}>
              Add your Cloudflare API token in the DNS Manager to view and manage WAF rules for{' '}
              <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>bituncoin.world</Text>
              {' '}and{' '}
              <Text style={{ color: '#3B82F6', fontWeight: FontWeight.bold }}>bituncoin.cloud</Text>.
            </Text>
            <View style={[s.planNote, { borderColor: '#F59E0B44', backgroundColor: '#F59E0B08' }]}>
              <MaterialIcons name="info-outline" size={13} color="#F59E0B" />
              <Text style={[s.planNoteText, { color: '#F59E0B' }]}>
                WAF managed rules (OWASP, Cloudflare Managed) require a Cloudflare Pro or higher plan. Free zones will return an empty package list.
              </Text>
            </View>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#EF4444', shadowColor: '#EF4444' }]}
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
            <SummaryStrip zoneData={zoneData} loading={globalLoading} />

            {/* Info banner */}
            <View style={[s.infoBanner, { borderColor: '#EF444433', backgroundColor: '#EF444408' }]}>
              <MaterialIcons name="security" size={14} color="#EF4444" />
              <Text style={[s.infoBannerText, { color: '#EF4444' }]}>
                WAF changes take effect within seconds across Cloudflare edge nodes globally. Expand a package to configure action mode, sensitivity (OWASP), and individual rule group toggles.
              </Text>
            </View>

            {/* Zone panels */}
            {zoneData.map(data => (
              <ZoneWAFPanel
                key={data.zone.id}
                data={data}
                token={apiToken}
                onUpdatePackage={handleUpdatePackage}
                onUpdateGroup={handleUpdateGroup}
                updatingPkg={updatingPkg}
                updatingGroup={updatingGroup}
                onLoadGroups={handleLoadGroups}
              />
            ))}

            {/* Loading skeleton */}
            {zoneData.length === 0 && globalLoading && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md }}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={{ fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false }}>Loading WAF packages…</Text>
              </View>
            )}

            {/* OWASP explanation card */}
            <View style={[s.explainCard, { borderColor: '#F59E0B44' }]}>
              <View style={[s.explainIcon, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' }]}>
                <MaterialIcons name="school" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1, gap: Spacing.sm }}>
                <Text style={[s.explainTitle, { color: '#F59E0B' }]}>About OWASP ModSecurity</Text>
                <Text style={s.explainDesc}>
                  The OWASP Core Rule Set (CRS) defends against common web attacks including SQL injection, XSS, and RFI. Sensitivity controls the anomaly score threshold — lower thresholds reduce false positives but also weaken coverage.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {SENSITIVITY_OPTIONS.map(opt => (
                    <View key={opt.value} style={[s.sensChip, { backgroundColor: opt.color + '12', borderColor: opt.color + '33' }]}>
                      <View style={[s.sensDot, { backgroundColor: opt.color }]} />
                      <Text style={[s.sensLabel, { color: opt.color }]}>{opt.label}: {opt.desc.split(' — ')[0]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Cloudflare Managed explanation */}
            <View style={[s.explainCard, { borderColor: '#F6821F44' }]}>
              <View style={[s.explainIcon, { backgroundColor: '#F6821F18', borderColor: '#F6821F44' }]}>
                <MaterialIcons name="cloud-done" size={18} color="#F6821F" />
              </View>
              <View style={{ flex: 1, gap: Spacing.sm }}>
                <Text style={[s.explainTitle, { color: '#F6821F' }]}>About Cloudflare Managed Rules</Text>
                <Text style={s.explainDesc}>
                  Cloudflare Managed rules protect against known CVEs and application-layer attack patterns. Rule groups are regularly updated by Cloudflare threat intelligence. Use Simulate mode to safely evaluate new rules before enforcing them.
                </Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                  {ACTION_MODES.map(m => (
                    <View key={m.value} style={[s.sensChip, { backgroundColor: m.color + '12', borderColor: m.color + '33' }]}>
                      <MaterialIcons name={m.icon as any} size={10} color={m.color} />
                      <Text style={[s.sensLabel, { color: m.color }]}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
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
                  { icon: 'dashboard', label: 'Dashboard',    route: '/cloudflare-dashboard', color: '#F6821F'      },
                  { icon: 'dns',       label: 'DNS Manager',  route: '/cloudflare-dns',        color: Colors.primary },
                  { icon: 'https',     label: 'SSL / TLS',    route: '/cloudflare-ssl',        color: '#22C55E'      },
                  { icon: 'code',      label: 'Workers',      route: '/cloudflare-workers',    color: '#8B5CF6'      },
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
              <MaterialIcons name="gpp-good" size={12} color={Colors.textMuted} />
              <Text style={s.footerText}>
                Cloudflare WAF · bituncoin.world + bituncoin.cloud
                {connected && lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
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
  topTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#EF4444', includeFontPadding: false, letterSpacing: 0.4 },
  topSub:          { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  scroll:          { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  noTokenCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#EF444444', padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  noTokenIcon:     { width: 90, height: 90, borderRadius: 24, backgroundColor: '#EF444412', borderWidth: 2, borderColor: '#EF444444', alignItems: 'center', justifyContent: 'center' },
  noTokenTitle:    { fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  noTokenSub:      { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  planNote:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3, alignSelf: 'stretch' },
  planNoteText:    { flex: 1, fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false },
  btn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  btnText:         { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  infoBanner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  infoBannerText:  { flex: 1, fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },

  explainCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  explainIcon:     { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  explainTitle:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  explainDesc:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  sensChip:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  sensDot:         { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  sensLabel:       { fontSize: 9, fontWeight: '700' as any, includeFontPadding: false },

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
