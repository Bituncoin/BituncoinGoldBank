/**
 * app/mtn-momo-webhooks.tsx
 * BTNG + MTN MoMo — Live Webhook Audit Log Viewer
 *
 * Fetches GET /webhook/momo/log from port 3000 every 10s.
 * Each event card shows:
 *   • Webhook ID          • Received timestamp
 *   • Status badge        • Credited flag
 *   • Amount + currency   • Matched key hint
 *   • IP address          • Error reason (if any)
 *
 * Controls:
 *   • Filter chips by status (All / SUCCESSFUL / FAILED / PENDING / other)
 *   • Auto-refresh every 10s with live countdown
 *   • Manual refresh button
 *   • Clear Log (prompts Bearer token → DELETE /webhook/momo/log)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Easing, ActivityIndicator, Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const MOMO_URL        = 'http://localhost:3000';
const AUTO_REFRESH_S  = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookEvent {
  id:             string;
  receivedAt:     string;
  signatureValid: boolean;
  matchedKey:     string | null;
  ipAddress:      string;
  headers:        Record<string, string | null>;
  payload:        Record<string, any>;
  momoStatus:     string;
  momoRef:        string | null;
  externalId:     string | null;
  amount:         number | null;
  currency:       string;
  credited:       boolean;
  creditedUserId: string | null;
  creditError:    string | null;
}

type FilterType = 'ALL' | 'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'OTHER';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      month:  '2-digit',
      day:    '2-digit',
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusColor(st: string): string {
  switch (st.toUpperCase()) {
    case 'SUCCESSFUL': return '#22C55E';
    case 'FAILED':
    case 'EXPIRED':    return '#EF4444';
    case 'PENDING':    return '#F59E0B';
    default:           return '#60A5FA';
  }
}

function statusBg(st: string): string {
  return statusColor(st) + '18';
}

function statusBorder(st: string): string {
  return statusColor(st) + '55';
}

// ─── Animated Live Dot ────────────────────────────────────────────────────────

function LiveDot({ color = '#22C55E', size = 6 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.9, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
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

// ─── Webhook Event Card ───────────────────────────────────────────────────────

function WebhookCard({ ev, index }: { ev: WebhookEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const st     = ev.momoStatus || 'UNKNOWN';
  const sColor = statusColor(st);

  return (
    <TouchableOpacity
      style={[wc.card, { borderColor: ev.signatureValid ? sColor + '44' : '#EF444444' }]}
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
    >
      {/* Left accent */}
      <View style={[wc.accent, { backgroundColor: sColor }]} />

      <View style={wc.body}>
        {/* ── Row 1: ID + Status + credited ── */}
        <View style={wc.row1}>
          <View style={wc.idWrap}>
            <Text style={wc.seqNum}>#{index + 1}</Text>
            <Text style={wc.idText} numberOfLines={1}>{ev.id || '—'}</Text>
          </View>
          <View style={[wc.statusBadge, { backgroundColor: statusBg(st), borderColor: statusBorder(st) }]}>
            {st === 'SUCCESSFUL' && <LiveDot color={sColor} size={4} />}
            <Text style={[wc.statusText, { color: sColor }]}>{st}</Text>
          </View>
          {ev.credited ? (
            <View style={wc.creditedBadge}>
              <MaterialIcons name="check-circle" size={10} color="#22C55E" />
              <Text style={wc.creditedText}>CREDITED</Text>
            </View>
          ) : ev.creditError ? (
            <View style={wc.notCreditedBadge}>
              <MaterialIcons name="error-outline" size={10} color="#F59E0B" />
              <Text style={wc.notCreditedText}>NOT CREDITED</Text>
            </View>
          ) : null}
        </View>

        {/* ── Row 2: Timestamp + amount + currency ── */}
        <View style={wc.row2}>
          <View style={wc.infoChip}>
            <MaterialIcons name="schedule" size={10} color={Colors.textMuted} />
            <Text style={wc.infoChipText}>{formatTs(ev.receivedAt)}</Text>
          </View>
          {ev.amount !== null ? (
            <View style={[wc.infoChip, { backgroundColor: sColor + '10', borderColor: sColor + '33' }]}>
              <MaterialIcons name="attach-money" size={10} color={sColor} />
              <Text style={[wc.infoChipText, { color: sColor }]}>
                {ev.amount} {ev.currency || 'GHS'}
              </Text>
            </View>
          ) : null}
          {ev.externalId ? (
            <View style={wc.infoChip}>
              <MaterialIcons name="person" size={10} color={Colors.textMuted} />
              <Text style={wc.infoChipText} numberOfLines={1}>{ev.externalId}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Row 3: IP + matched key + signature ── */}
        <View style={wc.row3}>
          {ev.ipAddress && ev.ipAddress !== 'unknown' ? (
            <View style={wc.infoChip}>
              <MaterialIcons name="router" size={10} color={Colors.textMuted} />
              <Text style={wc.infoChipText}>{ev.ipAddress}</Text>
            </View>
          ) : null}
          {ev.matchedKey ? (
            <View style={[wc.infoChip, { backgroundColor: '#D4A01710', borderColor: '#D4A01733' }]}>
              <MaterialIcons name="vpn-key" size={10} color={Colors.primary} />
              <Text style={[wc.infoChipText, { color: Colors.primary }]}>
                {ev.matchedKey}
              </Text>
            </View>
          ) : null}
          <View style={[
            wc.sigBadge,
            ev.signatureValid
              ? { backgroundColor: '#22C55E10', borderColor: '#22C55E33' }
              : { backgroundColor: '#EF444410', borderColor: '#EF444433' },
          ]}>
            <MaterialIcons
              name={ev.signatureValid ? 'verified' : 'gpp-bad'}
              size={10}
              color={ev.signatureValid ? '#22C55E' : '#EF4444'}
            />
            <Text style={[wc.sigText, { color: ev.signatureValid ? '#22C55E' : '#EF4444' }]}>
              {ev.signatureValid ? 'SIG OK' : 'SIG FAIL'}
            </Text>
          </View>
        </View>

        {/* ── Credit error ── */}
        {ev.creditError ? (
          <View style={wc.errorStrip}>
            <MaterialIcons name="warning" size={11} color="#F59E0B" />
            <Text style={wc.errorText} numberOfLines={expanded ? undefined : 1}>
              {ev.creditError}
            </Text>
          </View>
        ) : null}

        {/* ── Credited to ── */}
        {ev.credited && ev.creditedUserId ? (
          <View style={wc.creditedToRow}>
            <MaterialIcons name="account-balance-wallet" size={11} color="#22C55E" />
            <Text style={wc.creditedToText}>Credited to: {ev.creditedUserId}</Text>
          </View>
        ) : null}

        {/* ── MoMo ref ── */}
        {ev.momoRef ? (
          <View style={wc.refRow}>
            <MaterialIcons name="receipt" size={10} color={Colors.textMuted} />
            <Text style={wc.refText} numberOfLines={1} selectable>Ref: {ev.momoRef}</Text>
          </View>
        ) : null}

        {/* ── Expanded: raw payload ── */}
        {expanded ? (
          <View style={wc.payloadBox}>
            <Text style={wc.payloadLabel}>RAW PAYLOAD</Text>
            <Text style={wc.payloadText} selectable>
              {JSON.stringify(ev.payload, null, 2)}
            </Text>
          </View>
        ) : null}

        {/* Expand toggle */}
        <TouchableOpacity
          style={wc.expandRow}
          onPress={() => setExpanded(v => !v)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={14}
            color={Colors.textMuted}
          />
          <Text style={wc.expandText}>{expanded ? 'Collapse' : 'Show payload'}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const wc = StyleSheet.create({
  card:          { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  accent:        { width: 4, flexShrink: 0 },
  body:          { flex: 1, padding: Spacing.md, gap: Spacing.sm - 2 },

  row1:          { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  idWrap:        { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, overflow: 'hidden' },
  seqNum:        { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  idText:        { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, flex: 1 },
  statusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  statusText:    { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  creditedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#22C55E12', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#22C55E44', flexShrink: 0 },
  creditedText:  { fontSize: 8, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  notCreditedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F59E0B10', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#F59E0B44', flexShrink: 0 },
  notCreditedText:  { fontSize: 8, fontWeight: FontWeight.heavy, color: '#F59E0B', includeFontPadding: false },

  row2:          { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  row3:          { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  infoChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  infoChipText:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  sigBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  sigText:       { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },

  errorStrip:    { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: '#F59E0B10', borderRadius: Radius.md, padding: 7, borderWidth: 1, borderColor: '#F59E0B33' },
  errorText:     { flex: 1, fontSize: 9, color: '#FCD34D', lineHeight: 13, includeFontPadding: false },

  creditedToRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  creditedToText: { fontSize: 9, color: '#22C55E', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  refRow:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  refText:       { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  payloadBox:    { backgroundColor: '#060608', borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  payloadLabel:  { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 4, includeFontPadding: false },
  payloadText:   { fontSize: 9, color: '#9CA3AF', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 13, includeFontPadding: false },

  expandRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  expandText:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  color,
  onPress,
}: {
  label:   string;
  count:   number;
  active:  boolean;
  color:   string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        fc.chip,
        active
          ? { backgroundColor: color + '20', borderColor: color + '66' }
          : { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[fc.label, { color: active ? color : Colors.textMuted }]}>{label}</Text>
      <View style={[fc.badge, { backgroundColor: active ? color : Colors.bgCard, borderColor: active ? color + '55' : Colors.border }]}>
        <Text style={[fc.badgeText, { color: active ? Colors.bg : Colors.textMuted }]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const fc = StyleSheet.create({
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, height: 36 },
  label:     { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  badge:     { minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ─── Clear Log Modal ──────────────────────────────────────────────────────────

function ClearLogModal({
  visible,
  onClose,
  onConfirm,
  loading,
}: {
  visible:   boolean;
  onClose:   () => void;
  onConfirm: (token: string) => void;
  loading:   boolean;
}) {
  const [token, setToken] = useState('');
  const [show,  setShow]  = useState(false);

  if (!visible) return null;

  return (
    <View style={cl.overlay}>
      <View style={cl.modal}>
        <View style={cl.header}>
          <View style={cl.iconWrap}>
            <MaterialIcons name="delete-forever" size={24} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cl.title}>Clear Webhook Log</Text>
            <Text style={cl.sub}>Deletes all events from momo-webhooks.json</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={cl.warning}>
          <MaterialIcons name="warning" size={13} color="#F59E0B" />
          <Text style={cl.warningText}>
            This action is irreversible. All webhook events on the server will be permanently deleted.
          </Text>
        </View>

        <Text style={cl.tokenLabel}>Bearer Token (BTNG_SECRET)</Text>
        <View style={cl.tokenRow}>
          <TextInput
            style={cl.tokenInput}
            value={token}
            onChangeText={setToken}
            placeholder="Enter BTNG_SECRET to authorize…"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={() => setShow(v => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 6 }}
            activeOpacity={0.8}
          >
            <MaterialIcons name={show ? 'visibility-off' : 'visibility'} size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={cl.actions}>
          <TouchableOpacity style={cl.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={cl.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[cl.deleteBtn, (!token.trim() || loading) && { opacity: 0.5 }]}
            onPress={() => onConfirm(token.trim())}
            disabled={!token.trim() || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color="#EF4444" />
              : <MaterialIcons name="delete-forever" size={16} color="#EF4444" />}
            <Text style={cl.deleteText}>{loading ? 'Clearing…' : 'Clear Log'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const cl = StyleSheet.create({
  overlay:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 999, justifyContent: 'flex-end' },
  modal:       { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  header:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:    { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EF444418', borderWidth: 1, borderColor: '#EF444444', alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  sub:         { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  warning:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F59E0B10', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#F59E0B33' },
  warningText: { flex: 1, fontSize: FontSize.xs, color: '#FCD34D', lineHeight: 17, includeFontPadding: false },
  tokenLabel:  { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tokenRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  tokenInput:  { flex: 1, height: 48, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  actions:     { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn:   { flex: 1, paddingVertical: 14, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  cancelText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  deleteBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, backgroundColor: '#EF444410', borderWidth: 1, borderColor: '#EF444455' },
  deleteText:  { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#EF4444', includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MTNMoMoWebhooksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [events,       setEvents]       = useState<WebhookEvent[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [lastFetched,  setLastFetched]  = useState<Date | null>(null);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [filter,       setFilter]       = useState<FilterType>('ALL');
  const [countdown,    setCountdown]    = useState(AUTO_REFRESH_S);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [clearVisible, setClearVisible] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearResult,  setClearResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Retry Uncredited ─────────────────────────────────────────────────────
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryResult,  setRetryResult]  = useState<{
    eligible:            number;
    retried:             number;
    skipped:             number;
    uncreditedRemaining: number;
  } | null>(null);

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef(AUTO_REFRESH_S);

  // ── Retry Uncredited handler ────────────────────────────────────────────
  const handleRetryUncredited = useCallback(async () => {
    setRetryLoading(true);
    setRetryResult(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${MOMO_URL}/webhook/momo/retry`, {
        method:  'POST',
        signal:  controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({}),
      });
      clearTimeout(timer);
      if (!res.ok) {
        setRetryResult({ eligible: 0, retried: 0, skipped: 0, uncreditedRemaining: 0 });
        return;
      }
      const data = await res.json();
      setRetryResult({
        eligible:            data.eligible            ?? 0,
        retried:             data.retried             ?? 0,
        skipped:             data.skipped             ?? 0,
        uncreditedRemaining: data.uncreditedRemaining ?? 0,
      });
      // Refresh log so credited flags reflect immediately
      fetchLog(true);
    } catch {
      setRetryResult({ eligible: 0, retried: 0, skipped: 0, uncreditedRemaining: 0 });
    } finally {
      setRetryLoading(false);
    }
  }, [fetchLog]);

  // ── Fetch log ──────────────────────────────────────────────────────────────
  const fetchLog = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${MOMO_URL}/webhook/momo/log?limit=100`, {
        method:  'GET',
        signal:  controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      setServerOnline(res.ok);

      if (!res.ok) {
        setErrorMsg(`HTTP ${res.status} — ${res.statusText}`);
        return;
      }

      const data = await res.json();
      setTotal(data.total ?? 0);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setLastFetched(new Date());
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      setErrorMsg(isTimeout ? 'Timed out — MoMo host offline?' : (err?.message ?? 'Network error'));
      setServerOnline(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ── Auto-refresh every 10s ────────────────────────────────────────────────
  useEffect(() => {
    fetchLog();

    // Countdown ticker (every 1s)
    countdownRef.current = AUTO_REFRESH_S;
    countRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = AUTO_REFRESH_S;
        setCountdown(AUTO_REFRESH_S);
      }
    }, 1000);

    // Fetch ticker (every 10s)
    intervalRef.current = setInterval(() => {
      fetchLog(true);
      countdownRef.current = AUTO_REFRESH_S;
      setCountdown(AUTO_REFRESH_S);
    }, AUTO_REFRESH_S * 1000);

    return () => {
      if (intervalRef.current)  clearInterval(intervalRef.current);
      if (countRef.current)     clearInterval(countRef.current);
    };
  }, [fetchLog]);

  // ── Manual refresh ────────────────────────────────────────────────────────
  const handleRefresh = () => {
    countdownRef.current = AUTO_REFRESH_S;
    setCountdown(AUTO_REFRESH_S);
    fetchLog();
  };

  // ── Clear log ─────────────────────────────────────────────────────────────
  const handleClearLog = async (token: string) => {
    setClearLoading(true);
    setClearResult(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${MOMO_URL}/webhook/momo/log`, {
        method:  'DELETE',
        signal:  controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept:        'application/json',
        },
      });
      clearTimeout(timer);
      if (res.status === 401) {
        setClearResult({ ok: false, msg: 'Unauthorized — invalid Bearer token.' });
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        setClearResult({ ok: false, msg: `HTTP ${res.status}: ${txt.slice(0, 80)}` });
        return;
      }
      setClearResult({ ok: true, msg: 'Webhook log cleared successfully.' });
      setClearVisible(false);
      setEvents([]);
      setTotal(0);
    } catch (err: any) {
      setClearResult({ ok: false, msg: err?.message ?? 'Network error' });
    } finally {
      setClearLoading(false);
    }
  };

  // ── Filter events ─────────────────────────────────────────────────────────
  const filtered = events.filter(ev => {
    if (filter === 'ALL')       return true;
    if (filter === 'OTHER')     return !['SUCCESSFUL', 'FAILED', 'PENDING', 'EXPIRED'].includes(ev.momoStatus?.toUpperCase());
    return ev.momoStatus?.toUpperCase() === filter
        || (filter === 'FAILED' && ev.momoStatus?.toUpperCase() === 'EXPIRED');
  });

  // ── Counts per filter ─────────────────────────────────────────────────────
  const countOf = (f: FilterType) => {
    if (f === 'ALL')   return events.length;
    if (f === 'OTHER') return events.filter(ev => !['SUCCESSFUL', 'FAILED', 'PENDING', 'EXPIRED'].includes(ev.momoStatus?.toUpperCase())).length;
    return events.filter(ev => {
      const s = ev.momoStatus?.toUpperCase();
      return s === f || (f === 'FAILED' && s === 'EXPIRED');
    }).length;
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const successCount  = events.filter(ev => ev.momoStatus?.toUpperCase() === 'SUCCESSFUL').length;
  const creditedCount = events.filter(ev => ev.credited).length;
  const failedCount   = events.filter(ev => ['FAILED', 'EXPIRED'].includes(ev.momoStatus?.toUpperCase())).length;

  const filters: { id: FilterType; label: string; color: string }[] = [
    { id: 'ALL',        label: 'All',       color: Colors.primary },
    { id: 'SUCCESSFUL', label: 'Success',   color: '#22C55E'      },
    { id: 'PENDING',    label: 'Pending',   color: '#F59E0B'      },
    { id: 'FAILED',     label: 'Failed',    color: '#EF4444'      },
    { id: 'OTHER',      label: 'Other',     color: '#60A5FA'      },
  ];

  const formatTs2 = (d: Date | null) => {
    if (!d) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Clear Log Modal */}
      <ClearLogModal
        visible={clearVisible}
        onClose={() => setClearVisible(false)}
        onConfirm={handleClearLog}
        loading={clearLoading}
      />

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={s.topCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={s.topTitle}>Webhook Audit Log</Text>
            {serverOnline === true && <LiveDot color="#22C55E" size={5} />}
          </View>
          <Text style={s.topSub}>
            MTN MoMo · PORT 3000 · {serverOnline === true ? 'LIVE' : serverOnline === false ? 'OFFLINE' : '…'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[s.iconBtn, { borderColor: '#EF444444', backgroundColor: '#EF444410' }]}
            onPress={() => { setClearResult(null); setClearVisible(true); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="delete-sweep" size={20} color="#EF4444" />
          </TouchableOpacity>
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
      </View>

      {/* ── Auto-refresh countdown bar ─────────────────────────────────────── */}
      <View style={s.countdownRow}>
        <MaterialIcons name="autorenew" size={11} color={Colors.textMuted} />
        <Text style={s.countdownLabel}>Auto-refresh in {countdown}s</Text>
        <CountdownBar seconds={countdown} total={AUTO_REFRESH_S} />
        <Text style={s.lastFetchedText}>Last: {formatTs2(lastFetched)}</Text>
      </View>

      {/* ── Clear result banner ───────────────────────────────────────────── */}
      {clearResult ? (
        <View style={[s.clearBanner, { backgroundColor: clearResult.ok ? '#22C55E10' : '#EF444410', borderColor: clearResult.ok ? '#22C55E44' : '#EF444444' }]}>
          <MaterialIcons name={clearResult.ok ? 'check-circle' : 'error-outline'} size={14} color={clearResult.ok ? '#22C55E' : '#EF4444'} />
          <Text style={[s.clearBannerText, { color: clearResult.ok ? '#22C55E' : '#EF4444' }]}>{clearResult.msg}</Text>
          <TouchableOpacity onPress={() => setClearResult(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {errorMsg ? (
        <View style={s.errorBanner}>
          <MaterialIcons name="cloud-off" size={14} color="#EF4444" />
          <Text style={s.errorBannerText}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => setErrorMsg(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <View style={s.statsRow}>
        {[
          { label: 'Total',    value: total,        color: Colors.primary },
          { label: 'Success',  value: successCount, color: '#22C55E'      },
          { label: 'Credited', value: creditedCount,color: '#D4A017'      },
          { label: 'Failed',   value: failedCount,  color: '#EF4444'      },
        ].map(stat => (
          <View key={stat.label} style={[s.statCell, { borderColor: stat.color + '33' }]}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Retry Uncredited row ─────────────────────────────────────────── */}
      {(() => {
        const uncreditedCount = events.filter(
          ev => !ev.credited && ev.momoStatus?.toUpperCase() === 'SUCCESSFUL'
        ).length;
        return (
          <View style={s.retryRow}>
            {/* Uncredited badge */}
            <View style={[s.retryStat, {
              borderColor:     uncreditedCount > 0 ? '#F59E0B44' : Colors.border,
              backgroundColor: uncreditedCount > 0 ? '#F59E0B10' : Colors.bgCard,
            }]}>
              <MaterialIcons name="pending-actions" size={13} color={uncreditedCount > 0 ? '#F59E0B' : Colors.textMuted} />
              <Text style={[s.retryStatVal, { color: uncreditedCount > 0 ? '#F59E0B' : Colors.textMuted }]}>{uncreditedCount}</Text>
              <Text style={s.retryStatLabel}>Uncredited</Text>
            </View>

            {/* Retry button */}
            <TouchableOpacity
              style={[
                s.retryBtn,
                { backgroundColor: uncreditedCount > 0 ? '#F59E0B18' : Colors.bgCard, borderColor: uncreditedCount > 0 ? '#F59E0B55' : Colors.border },
                (retryLoading || uncreditedCount === 0) && { opacity: 0.4 },
              ]}
              onPress={handleRetryUncredited}
              disabled={retryLoading || uncreditedCount === 0}
              activeOpacity={0.85}
            >
              {retryLoading
                ? <ActivityIndicator size="small" color="#F59E0B" />
                : <MaterialIcons name="replay" size={15} color={uncreditedCount > 0 ? '#F59E0B' : Colors.textMuted} />}
              <Text style={[s.retryBtnText, { color: uncreditedCount > 0 ? '#F59E0B' : Colors.textMuted }]}>
                {retryLoading ? 'Retrying…' : 'Retry Uncredited'}
              </Text>
            </TouchableOpacity>

            {/* Inline chip result */}
            {retryResult !== null ? (
              <TouchableOpacity
                style={[s.retryChip, {
                  backgroundColor: retryResult.retried > 0 ? '#22C55E10' : '#3B82F610',
                  borderColor:     retryResult.retried > 0 ? '#22C55E44' : '#3B82F644',
                }]}
                onPress={() => setRetryResult(null)}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name={retryResult.retried > 0 ? 'check-circle' : 'info'}
                  size={10}
                  color={retryResult.retried > 0 ? '#22C55E' : '#60A5FA'}
                />
                <Text style={[s.retryChipText, { color: retryResult.retried > 0 ? '#22C55E' : '#60A5FA' }]}>
                  {retryResult.retried > 0
                    ? `+${retryResult.retried} credited`
                    : retryResult.eligible === 0
                    ? 'None eligible'
                    : `${retryResult.skipped} skipped`}
                </Text>
                <MaterialIcons name="close" size={9} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })()}

      {/* ── Retry detail banner (shown when retried > 0 or eligible > 0) ── */}
      {retryResult !== null && (retryResult.retried > 0 || retryResult.eligible > 0) ? (
        <View style={[s.retryBanner, {
          backgroundColor: retryResult.retried > 0 ? '#22C55E10' : '#3B82F610',
          borderColor:     retryResult.retried > 0 ? '#22C55E44' : '#3B82F644',
        }]}>
          <View style={s.retryBannerRow}>
            <MaterialIcons
              name={retryResult.retried > 0 ? 'check-circle' : 'info'}
              size={14}
              color={retryResult.retried > 0 ? '#22C55E' : '#60A5FA'}
            />
            <Text style={[s.retryBannerTitle, { color: retryResult.retried > 0 ? '#22C55E' : '#60A5FA' }]}>
              Retry Complete
            </Text>
            <TouchableOpacity onPress={() => setRetryResult(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={s.retryBannerStats}>
            {[
              { label: 'Eligible',  value: retryResult.eligible,            color: '#F59E0B' },
              { label: 'Credited',  value: retryResult.retried,             color: '#22C55E' },
              { label: 'Skipped',   value: retryResult.skipped,             color: '#60A5FA' },
              { label: 'Remaining', value: retryResult.uncreditedRemaining, color: retryResult.uncreditedRemaining > 0 ? '#EF4444' : Colors.textMuted },
            ].map(st => (
              <View key={st.label} style={[s.retryBannerCell, { borderColor: st.color + '33' }]}>
                <Text style={[s.retryBannerVal, { color: st.color }]}>{st.value}</Text>
                <Text style={s.retryBannerLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Filter chips ─────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterScrollContent}
      >
        {filters.map(f => (
          <FilterChip
            key={f.id}
            label={f.label}
            count={countOf(f.id)}
            active={filter === f.id}
            color={f.color}
            onPress={() => setFilter(f.id)}
          />
        ))}
      </ScrollView>

      {/* ── Event list ───────────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Loading skeleton */}
        {loading && events.length === 0 ? (
          <View style={s.emptyState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.emptyText}>Fetching webhook events…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="webhook" size={36} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>
              {events.length === 0 ? 'No webhook events yet' : `No ${filter.toLowerCase()} events`}
            </Text>
            <Text style={s.emptyText}>
              {events.length === 0
                ? 'MTN MoMo will POST payment callbacks to /webhook/momo on port 3000.'
                : 'Try selecting a different filter above.'}
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={handleRefresh} activeOpacity={0.8}>
              <MaterialIcons name="refresh" size={16} color={Colors.primary} />
              <Text style={s.emptyBtnText}>Refresh Now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Result count */}
            <View style={s.resultHeader}>
              <Text style={s.resultCount}>
                {filtered.length} event{filtered.length !== 1 ? 's' : ''}
                {filter !== 'ALL' ? ` · ${filter}` : ''}
              </Text>
              <View style={[s.serverChip, { backgroundColor: serverOnline ? '#22C55E10' : '#EF444410', borderColor: serverOnline ? '#22C55E44' : '#EF444444' }]}>
                {serverOnline ? <LiveDot color="#22C55E" size={4} /> : <MaterialIcons name="cloud-off" size={9} color="#EF4444" />}
                <Text style={[s.serverChipText, { color: serverOnline ? '#22C55E' : '#EF4444' }]}>
                  {serverOnline ? 'HOST LIVE' : 'HOST DOWN'}
                </Text>
              </View>
            </View>

            {filtered.map((ev, i) => (
              <WebhookCard key={ev.id || i} ev={ev} index={i} />
            ))}
          </>
        )}

        {/* Info card */}
        <View style={s.infoCard}>
          <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.infoTitle}>Webhook Endpoint</Text>
            <Text style={s.infoLine}>POST  http://localhost:3000/webhook/momo</Text>
            <Text style={s.infoLine}>GET   http://localhost:3000/webhook/momo/log</Text>
            <Text style={s.infoLine}>DEL   http://localhost:3000/webhook/momo/log  [AUTH]</Text>
            <Text style={s.infoNote}>
              MTN sends X-Callback-Signature (HMAC-SHA256) on live mode.
              Sandbox mode skips signature — set MTN_MOMO_TARGET_ENV=sandbox.
            </Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.bg },

  topBar:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:           { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter:         { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:          { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  topSub:            { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  countdownRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm },
  countdownLabel:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  lastFetchedText:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },

  clearBanner:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1 },
  clearBannerText:   { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },

  errorBanner:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, padding: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1, backgroundColor: '#EF444410', borderColor: '#EF444444' },
  errorBannerText:   { flex: 1, fontSize: FontSize.xs, color: '#FCA5A5', includeFontPadding: false },

  statsRow:          { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  statCell:          { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, alignItems: 'center', gap: 2 },
  statValue:         { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:         { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  // Retry Uncredited
  retryRow:        { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  retryStat:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.lg, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1 },
  retryStatVal:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  retryStatLabel:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  retryBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.lg, borderWidth: 1, height: 36 },
  retryBtnText:    { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  retryChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  retryChipText:   { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  retryBanner:     { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  retryBannerRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  retryBannerTitle:{ flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  retryBannerStats:{ flexDirection: 'row', gap: 6 },
  retryBannerCell: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm, alignItems: 'center', gap: 2 },
  retryBannerVal:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  retryBannerLabel:{ fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  filterScroll:        { flexGrow: 0, flexShrink: 0, marginBottom: Spacing.sm },
  filterScrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },

  scroll:            { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: 0 },

  emptyState:        { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyIcon:         { width: 72, height: 72, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  emptyText:         { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 280, includeFontPadding: false },
  emptyBtn:          { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44' },
  emptyBtnText:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  resultHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resultCount:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  serverChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  serverChipText:    { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },

  infoCard:          { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginTop: Spacing.sm },
  infoTitle:         { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  infoLine:          { fontSize: 9, color: '#22C55E', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 14 },
  infoNote:          { fontSize: 9, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false, marginTop: 2 },
});
