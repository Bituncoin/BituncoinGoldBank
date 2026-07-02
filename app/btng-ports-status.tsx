/**
 * app/btng-ports-status.tsx
 * BTNG Platform — Live Port Health Dashboard
 *
 * Pings all BTNG backend services with 5-second timeout:
 *  • 8090  — Bank Wallet Server     (localhost:8090/api/health)
 *  • 8125  — Zone Engine            (localhost:8125/api/zone/health)
 *  • 8087  — Brain Gate (AI)        (localhost:8087/health)
 *  • 8000  — Private Banker / BTNG  (localhost:8000/)
 *  • 64799 — Sovereign Node         (http://168.231.79.52:64799/api/v1/stats)
 *
 * Shows: UP/DOWN badge, response time in ms, last checked timestamp,
 * per-port manual refresh, and auto-refresh toggle.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, Platform, ActivityIndicator, TextInput,
  Share, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const BANK_BASE_URL = 'http://localhost:8090';

// ── ss -tuln parser ────────────────────────────────────────────────────────────

interface ParsedSocket {
  proto: string;
  state: string;
  localAddr: string;
  port: number;
}

// Ports considered expected / known on this server
const EXPECTED_PORTS = [8090, 8125, 3000, 38984, 8087, 8000, 64799, 3001, 3002, 22, 80, 443];

function parseSsTuln(output: string): ParsedSocket[] {
  const lines  = output.split('\n').filter(Boolean);
  const result: ParsedSocket[] = [];
  // Skip header lines (contain "Netid" or "State" or "Recv-Q")
  for (const line of lines) {
    if (/Netid|State|Recv-Q/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    // ss -tuln typical columns: Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port
    if (cols.length < 5) continue;
    const proto    = cols[0] ?? '';
    const state    = cols[1] ?? 'LISTEN';
    const localRaw = cols[4] ?? '';
    // Extract port from Local Address:Port (last colon)
    const lastColon = localRaw.lastIndexOf(':');
    if (lastColon === -1) continue;
    const portStr = localRaw.slice(lastColon + 1);
    const port    = parseInt(portStr, 10);
    if (isNaN(port) || port <= 0) continue;
    // Deduplicate by proto+port
    const exists = result.find(s => s.proto === proto && s.port === port);
    if (!exists) {
      result.push({ proto, state, localAddr: localRaw, port });
    }
  }
  return result.sort((a, b) => a.port - b.port);
}

// ─── Port Definitions ─────────────────────────────────────────────────────────

interface PortDef {
  id:         string;
  name:       string;
  label:      string;
  port:       number;
  host:       string;
  url:        string;
  color:      string;
  icon:       string;
  emoji:      string;
  method:     string;
  authNote?:  string;
  category:   string;
}

const PORTS: PortDef[] = [
  {
    id:       'bank-wallet',
    name:     'Bank Wallet Server',
    label:    'localhost:8090',
    port:     8090,
    host:     'localhost',
    url:      'http://localhost:8090/api/health',
    color:    '#D4A017',
    icon:     'account-balance-wallet',
    emoji:    '🏦',
    method:   'GET',
    category: 'CORE BANKING',
  },
  {
    id:       'zone-engine',
    name:     'Zone Engine Server',
    label:    'localhost:8125',
    port:     8125,
    host:     'localhost',
    url:      'http://localhost:8125/',
    color:    '#3B82F6',
    icon:     'travel-explore',
    emoji:    '🌐',
    method:   'GET',
    category: 'ZONE SERVICES',
  },
  {
    id:       'brain-gate',
    name:     'Brain Gate (AI)',
    label:    'localhost:8087',
    port:     8087,
    host:     'localhost',
    url:      'http://localhost:8087/health',
    color:    '#8B5CF6',
    icon:     'psychology',
    emoji:    '🧠',
    method:   'GET',
    category: 'AI ENGINE',
  },
  {
    id:       'private-banker',
    name:     'Private Banker',
    label:    'localhost:8000',
    port:     8000,
    host:     'localhost',
    url:      'http://localhost:8000/',
    color:    '#22C55E',
    icon:     'person',
    emoji:    '👔',
    method:   'GET',
    category: 'BANKING AI',
  },
  {
    id:       'sovereign-node',
    name:     'Sovereign Node',
    label:    '168.231.79.52:64799',
    port:     64799,
    host:     '168.231.79.52',
    url:      'http://168.231.79.52:64799/api/v1/stats',
    color:    '#F7931A',
    icon:     'hub',
    emoji:    '⛓️',
    method:   'GET',
    category: 'BLOCKCHAIN NODE',
  },
  {
    id:       'api-key-gen',
    name:     'API Key Generator',
    label:    'localhost:3002',
    port:     3002,
    host:     'localhost',
    url:      'http://localhost:3002/',
    color:    '#06B6D4',
    icon:     'vpn-key',
    emoji:    '🔑',
    method:   'GET',
    category: 'SDK SERVICES',
  },
  {
    id:       'node-generator',
    name:     'Node Generator API',
    label:    'localhost:3001',
    port:     3001,
    host:     'localhost',
    url:      'http://localhost:3001/',
    color:    '#EC4899',
    icon:     'device-hub',
    emoji:    '🔧',
    method:   'GET',
    category: 'SDK SERVICES',
  },
  {
    id:       'main-app',
    name:     'Main Web App',
    label:    'localhost:3000',
    port:     3000,
    host:     'localhost',
    url:      'http://localhost:3000/',
    color:    '#10B981',
    icon:     'web',
    emoji:    '🌍',
    method:   'GET',
    category: 'FRONTEND',
  },
  {
    id:       'gold-factory',
    name:     'Gold Factory Stratum V2',
    label:    '168.231.79.52:38984',
    port:     38984,
    host:     '168.231.79.52',
    url:      'https://168.231.79.52:38984/',
    color:    '#F5C518',
    icon:     'factory',
    emoji:    '🏭',
    method:   'GET',
    category: 'MINING ENGINE',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type PortStatus = 'idle' | 'checking' | 'up' | 'down' | 'timeout';

interface PortState {
  status:        PortStatus;
  responseMs:    number | null;
  lastChecked:   Date | null;
  statusCode:    number | null;
  errorMsg:      string | null;
  responseSnip:  string | null;
}

const INITIAL_STATE: PortState = {
  status:       'idle',
  responseMs:   null,
  lastChecked:  null,
  statusCode:   null,
  errorMsg:     null,
  responseSnip: null,
};

const PING_TIMEOUT_MS = 5000;

// ─── Status Colors ────────────────────────────────────────────────────────────

const STATUS_META: Record<PortStatus, { color: string; bg: string; label: string; icon: string }> = {
  idle:     { color: Colors.textMuted,  bg: Colors.bgElevated,  label: 'IDLE',     icon: 'circle'           },
  checking: { color: '#60A5FA',         bg: '#60A5FA18',        label: 'CHECKING', icon: 'autorenew'        },
  up:       { color: '#22C55E',         bg: '#22C55E18',        label: 'UP',       icon: 'check-circle'     },
  down:     { color: '#EF4444',         bg: '#EF444418',        label: 'DOWN',     icon: 'cancel'           },
  timeout:  { color: '#F59E0B',         bg: '#F59E0B18',        label: 'TIMEOUT',  icon: 'timer-off'        },
};

// ─── Animated Live Dot ────────────────────────────────────────────────────────

function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
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

// ─── Spinning Loader ──────────────────────────────────────────────────────────

function SpinIcon({ color }: { color: string }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.linear })
    );
    loop.start();
    return () => loop.stop();
  }, [rot]);
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <MaterialIcons name="autorenew" size={14} color={color} />
    </Animated.View>
  );
}

// ─── Port Card ────────────────────────────────────────────────────────────────

function PortCard({
  port,
  state,
  onPing,
}: {
  port:   PortDef;
  state:  PortState;
  onPing: (id: string) => void;
}) {
  const sm = STATUS_META[state.status];
  const isChecking = state.status === 'checking';

  // ── Per-port auto-ping ──────────────────────────────────────────────────────
  const [autoPing,    setAutoPing]    = useState(false);
  const [pingCountdown, setPingCountdown] = useState(15);
  const portPingRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const portCountRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const portCountdown = useRef(15);

  useEffect(() => {
    if (portPingRef.current)  clearInterval(portPingRef.current);
    if (portCountRef.current) clearInterval(portCountRef.current);

    if (autoPing) {
      portCountdown.current = 15;
      setPingCountdown(15);

      portCountRef.current = setInterval(() => {
        portCountdown.current -= 1;
        setPingCountdown(portCountdown.current);
        if (portCountdown.current <= 0) {
          portCountdown.current = 15;
          setPingCountdown(15);
        }
      }, 1000);

      portPingRef.current = setInterval(() => {
        onPing(port.id);
        portCountdown.current = 15;
        setPingCountdown(15);
      }, 15_000);
    }

    return () => {
      if (portPingRef.current)  clearInterval(portPingRef.current);
      if (portCountRef.current) clearInterval(portCountRef.current);
    };
  }, [autoPing, port.id, onPing]);

  const formatTime = (d: Date | null) => {
    if (!d) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const responseColor = () => {
    if (state.responseMs === null) return Colors.textMuted;
    if (state.responseMs < 100)  return '#22C55E';
    if (state.responseMs < 500)  return '#F59E0B';
    return '#EF4444';
  };

  return (
    <View style={[pc.card, { borderColor: state.status === 'up' ? port.color + '66' : state.status === 'down' ? '#EF444444' : Colors.border }]}>

      {/* Left accent strip */}
      <View style={[pc.accentStrip, { backgroundColor: sm.color }]} />

      <View style={pc.body}>
        {/* Header row */}
        <View style={pc.headerRow}>
          <View style={[pc.iconWrap, { backgroundColor: port.color + '18', borderColor: port.color + '44' }]}>
            <Text style={{ fontSize: 20 }}>{port.emoji}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[pc.portName, { color: port.color }]} numberOfLines={1}>{port.name}</Text>
            <Text style={pc.portLabel}>{port.label}</Text>
          </View>

          {/* Status badge */}
          <View style={[pc.statusBadge, { backgroundColor: sm.bg, borderColor: sm.color + '55' }]}>
            {state.status === 'checking' ? (
              <SpinIcon color={sm.color} />
            ) : state.status === 'up' ? (
              <LiveDot color={sm.color} size={5} />
            ) : (
              <MaterialIcons name={sm.icon as any} size={10} color={sm.color} />
            )}
            <Text style={[pc.statusBadgeText, { color: sm.color }]}>{sm.label}</Text>
          </View>

          {/* Ping button */}
          <TouchableOpacity
            style={[pc.pingBtn, { borderColor: port.color + '66', backgroundColor: port.color + '12' }, isChecking && { opacity: 0.5 }]}
            onPress={() => onPing(port.id)}
            disabled={isChecking}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.8}
          >
            {isChecking
              ? <ActivityIndicator size="small" color={port.color} />
              : <MaterialIcons name="refresh" size={16} color={port.color} />}
          </TouchableOpacity>

          {/* Per-port auto-ping pill */}
          <TouchableOpacity
            style={[
              pc.autoPill,
              autoPing
                ? { backgroundColor: port.color + '20', borderColor: port.color + '88' }
                : { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
            ]}
            onPress={() => setAutoPing(v => !v)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.8}
          >
            {autoPing ? (
              <LiveDot color={port.color} size={4} />
            ) : (
              <MaterialIcons name="timer" size={10} color={Colors.textMuted} />
            )}
            <Text style={[
              pc.autoPillText,
              { color: autoPing ? port.color : Colors.textMuted },
            ]}>
              {autoPing ? '15s' : 'Auto'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mini auto-ping countdown pip */}
        {autoPing ? (
          <View style={pc.autoCountdownStrip}>
            <LiveDot color={port.color} size={4} />
            <Text style={[pc.autoCountdownLabel, { color: port.color }]}>
              Re-ping in {pingCountdown}s
            </Text>
            <View style={pc.autoCountdownTrack}>
              <View
                style={[
                  pc.autoCountdownFill,
                  {
                    width: `${(pingCountdown / 15) * 100}%` as any,
                    backgroundColor: port.color,
                  },
                ]}
              />
            </View>
            <TouchableOpacity
              onPress={() => setAutoPing(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={11} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Metrics row */}
        <View style={pc.metricsRow}>
          {/* Response time */}
          <View style={[pc.metricCell, { borderColor: responseColor() + '44', backgroundColor: responseColor() + '08' }]}>
            <MaterialIcons name="speed" size={10} color={responseColor()} />
            <Text style={[pc.metricValue, { color: responseColor() }]}>
              {state.responseMs !== null ? `${state.responseMs} ms` : '— ms'}
            </Text>
            <Text style={pc.metricLabel}>Response</Text>
          </View>

          {/* Status code */}
          <View style={[pc.metricCell, {
            borderColor: (state.statusCode && state.statusCode < 400 ? '#22C55E' : '#EF4444') + '44',
            backgroundColor: (state.statusCode && state.statusCode < 400 ? '#22C55E' : '#EF4444') + '08',
          }]}>
            <MaterialIcons name="tag" size={10} color={state.statusCode && state.statusCode < 400 ? '#22C55E' : Colors.textMuted} />
            <Text style={[pc.metricValue, { color: state.statusCode && state.statusCode < 400 ? '#22C55E' : Colors.textMuted }]}>
              {state.statusCode ?? '—'}
            </Text>
            <Text style={pc.metricLabel}>HTTP Code</Text>
          </View>

          {/* Port number */}
          <View style={[pc.metricCell, { borderColor: port.color + '33', backgroundColor: port.color + '07' }]}>
            <MaterialIcons name="electrical-services" size={10} color={port.color} />
            <Text style={[pc.metricValue, { color: port.color }]}>{port.port}</Text>
            <Text style={pc.metricLabel}>Port</Text>
          </View>

          {/* Last checked */}
          <View style={[pc.metricCell, { borderColor: Colors.border, flex: 1.4 }]}>
            <MaterialIcons name="schedule" size={10} color={Colors.textMuted} />
            <Text style={[pc.metricValue, { color: Colors.textSecondary, fontSize: 9 }]} numberOfLines={1}>
              {formatTime(state.lastChecked)}
            </Text>
            <Text style={pc.metricLabel}>Last Checked</Text>
          </View>
        </View>

        {/* URL row */}
        <View style={pc.urlRow}>
          <MaterialIcons name="link" size={10} color={Colors.textMuted} />
          <Text style={pc.urlText} numberOfLines={1} ellipsizeMode="tail">{port.url}</Text>
          <View style={[pc.categoryChip, { backgroundColor: port.color + '14', borderColor: port.color + '33' }]}>
            <Text style={[pc.categoryChipText, { color: port.color }]}>{port.category}</Text>
          </View>
        </View>

        {/* Error / response snippet */}
        {state.status === 'down' && state.errorMsg ? (
          <View style={pc.errorStrip}>
            <MaterialIcons name="error-outline" size={11} color="#EF4444" />
            <Text style={pc.errorText} numberOfLines={2}>{state.errorMsg}</Text>
          </View>
        ) : state.status === 'timeout' ? (
          <View style={[pc.errorStrip, { backgroundColor: '#F59E0B10', borderColor: '#F59E0B33' }]}>
            <MaterialIcons name="timer-off" size={11} color="#F59E0B" />
            <Text style={[pc.errorText, { color: '#F59E0B' }]}>
              No response within {PING_TIMEOUT_MS / 1000}s — service may be offline or unreachable from mobile.
            </Text>
          </View>
        ) : state.status === 'up' && state.responseSnip ? (
          <View style={[pc.errorStrip, { backgroundColor: '#22C55E08', borderColor: '#22C55E33' }]}>
            <MaterialIcons name="check" size={11} color="#22C55E" />
            <Text style={[pc.errorText, { color: '#22C55E' }]} numberOfLines={1}>{state.responseSnip}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const pc = StyleSheet.create({
  card:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', overflow: 'hidden', marginBottom: Spacing.md },
  accentStrip:   { width: 4, flexShrink: 0 },
  body:          { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  headerRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:      { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  portName:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  portLabel:     { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  statusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  statusBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.6, includeFontPadding: false },
  pingBtn:       { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  autoPill:      { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 5, borderWidth: 1, flexShrink: 0, minWidth: 42, justifyContent: 'center' },
  autoPillText:  { fontSize: 8, fontWeight: FontWeight.heavy as any, includeFontPadding: false },
  autoCountdownStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  autoCountdownLabel: { fontSize: 9, fontWeight: FontWeight.semibold as any, includeFontPadding: false, flexShrink: 0 },
  autoCountdownTrack: { flex: 1, height: 2, backgroundColor: Colors.border, borderRadius: 1, overflow: 'hidden' },
  autoCountdownFill:  { height: 2, borderRadius: 1 },
  metricsRow:    { flexDirection: 'row', gap: 5 },
  metricCell:    { flex: 1, alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 3 },
  metricValue:   { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  metricLabel:   { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  urlRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  urlText:       { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  categoryChip:  { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  categoryChipText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  errorStrip:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#EF444410', borderRadius: Radius.md, padding: 8, borderWidth: 1, borderColor: '#EF444433' },
  errorText:     { flex: 1, fontSize: 10, color: '#FCA5A5', lineHeight: 14, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BTNGPortsStatusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Port states map: portId → PortState
  const [portStates, setPortStates] = useState<Record<string, PortState>>(
    () => Object.fromEntries(PORTS.map(p => [p.id, { ...INITIAL_STATE }]))
  );

  // ── Admin Actions state ───────────────────────────────────────────────────
  const [adminToken,       setAdminToken]       = useState('');
  const [tokenVisible,     setTokenVisible]     = useState(false);
  const [rememberToken,    setRememberToken]    = useState(false);
  const tokenSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [backupLoading,    setBackupLoading]    = useState(false);
  const [backupResult,     setBackupResult]     = useState<{ ok: boolean; msg: string; detail?: string } | null>(null);
  const [restoreLoading,   setRestoreLoading]   = useState(false);
  const [restoreResult,    setRestoreResult]    = useState<{ ok: boolean; msg: string; detail?: string } | null>(null);
  const [restoreMode,      setRestoreMode]      = useState<'merge' | 'overwrite'>('merge');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  // ── Zone Engine token ────────────────────────────────────────────────────
  const [zoneToken,        setZoneToken]        = useState('');
  const [zoneTokenVisible, setZoneTokenVisible] = useState(false);
  const [zoneRemember,     setZoneRemember]     = useState(false);
  const zoneTokenSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── ss -tuln quick scan ────────────────────────────────────────────────────
  const [scanLoading,      setScanLoading]      = useState(false);
  const [scanSockets,      setScanSockets]      = useState<ParsedSocket[] | null>(null);
  const [scanError,        setScanError]        = useState<string | null>(null);
  const [scanTs,           setScanTs]           = useState<string | null>(null);
  const [scanAutoRefresh,  setScanAutoRefresh]  = useState(false);
  const [scanCountdown,    setScanCountdown]    = useState(60);
  const scanIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanCountRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanCountdownRef = useRef(60);

  // ── Load persisted tokens on mount ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [saved, remember, zoneSaved, zoneRem] = await Promise.all([
          SecureStore.getItemAsync('btng_admin_token'),
          SecureStore.getItemAsync('btng_admin_remember'),
          SecureStore.getItemAsync('btng_zone_token'),
          SecureStore.getItemAsync('btng_zone_remember'),
        ]);
        const shouldRemember = remember === 'true';
        setRememberToken(shouldRemember);
        if (shouldRemember && saved) setAdminToken(saved);

        const shouldZoneRemember = zoneRem === 'true';
        setZoneRemember(shouldZoneRemember);
        if (shouldZoneRemember && zoneSaved) setZoneToken(zoneSaved);
      } catch {
        // SecureStore unavailable (web) — silently skip
      }
    })();
  }, []);

  // ── Persist admin token (debounced 600ms) ──────────────────────────────
  useEffect(() => {
    if (tokenSaveRef.current) clearTimeout(tokenSaveRef.current);
    tokenSaveRef.current = setTimeout(async () => {
      try {
        if (rememberToken) {
          if (adminToken.trim()) {
            await SecureStore.setItemAsync('btng_admin_token', adminToken.trim());
          } else {
            await SecureStore.deleteItemAsync('btng_admin_token');
          }
        }
      } catch { /* ignore */ }
    }, 600);
    return () => { if (tokenSaveRef.current) clearTimeout(tokenSaveRef.current); };
  }, [adminToken, rememberToken]);

  // ── Persist zone token (debounced 600ms) ─────────────────────────────────
  useEffect(() => {
    if (zoneTokenSaveRef.current) clearTimeout(zoneTokenSaveRef.current);
    zoneTokenSaveRef.current = setTimeout(async () => {
      try {
        if (zoneRemember) {
          if (zoneToken.trim()) {
            await SecureStore.setItemAsync('btng_zone_token', zoneToken.trim());
          } else {
            await SecureStore.deleteItemAsync('btng_zone_token');
          }
        }
      } catch { /* ignore */ }
    }, 600);
    return () => { if (zoneTokenSaveRef.current) clearTimeout(zoneTokenSaveRef.current); };
  }, [zoneToken, zoneRemember]);

  // ── Toggle remember (admin) ──────────────────────────────────────────────
  const handleToggleRemember = async (value: boolean) => {
    setRememberToken(value);
    try {
      if (value) {
        await SecureStore.setItemAsync('btng_admin_remember', 'true');
        if (adminToken.trim()) await SecureStore.setItemAsync('btng_admin_token', adminToken.trim());
      } else {
        await SecureStore.setItemAsync('btng_admin_remember', 'false');
        await SecureStore.deleteItemAsync('btng_admin_token');
      }
    } catch { /* ignore */ }
  };

  // ── Toggle remember (zone) ────────────────────────────────────────────────
  const handleToggleZoneRemember = async (value: boolean) => {
    setZoneRemember(value);
    try {
      if (value) {
        await SecureStore.setItemAsync('btng_zone_remember', 'true');
        if (zoneToken.trim()) await SecureStore.setItemAsync('btng_zone_token', zoneToken.trim());
      } else {
        await SecureStore.setItemAsync('btng_zone_remember', 'false');
        await SecureStore.deleteItemAsync('btng_zone_token');
      }
    } catch { /* ignore */ }
  };

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoInterval, setAutoInterval] = useState<30 | 60 | 120>(60); // seconds
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lastFullCheck, setLastFullCheck] = useState<Date | null>(null);
  const [fullChecking, setFullChecking] = useState(false);

  // ── ss -tuln handler ───────────────────────────────────────────────────────────
  const handleSsTuln = useCallback(async () => {
    if (!adminToken.trim()) return;
    setScanLoading(true);
    setScanError(null);
    setScanSockets(null);
    setScanTs(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(`${BANK_BASE_URL}/api/admin/exec`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${adminToken.trim()}`,
        },
        body: JSON.stringify({ command: 'ss -tuln' }),
      });
      clearTimeout(timer);

      if (res.status === 401) {
        setScanError('Unauthorized (401) — check your Bearer token.');
        return;
      }
      if (res.status === 403) {
        setScanError('Command not in allowlist. Ensure "ss -tuln" is in ALLOWED_COMMANDS in btng-bank-server.js.');
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        setScanError(`HTTP ${res.status} — ${txt.slice(0, 120)}`);
        return;
      }

      const json = await res.json().catch(() => null);
      const output: string = json?.output ?? json?.stdout ?? '';
      const parsed = parseSsTuln(output);
      setScanSockets(parsed);
      setScanTs(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      setScanError(isTimeout ? 'Request timed out — server not responding' : (err?.message ?? 'Network error'));
    } finally {
      setScanLoading(false);
    }
  }, [adminToken]);

  // ── Download Backup ────────────────────────────────────────────────────────
  const handleDownloadBackup = useCallback(async () => {
    if (!adminToken.trim()) {
      setBackupResult({ ok: false, msg: 'Bearer token required', detail: 'Enter the BTNG_SECRET to authenticate.' });
      return;
    }
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${BANK_BASE_URL}/api/admin/backup`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${adminToken.trim()}`,
          'Accept': 'application/json',
        },
      });
      clearTimeout(timer);

      if (res.status === 401) {
        setBackupResult({ ok: false, msg: 'Unauthorized (401)', detail: 'Invalid or missing Bearer token.' });
        return;
      }
      if (res.status === 503) {
        setBackupResult({ ok: false, msg: 'Server Error (503)', detail: 'BTNG_SECRET not configured on the server.' });
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        setBackupResult({ ok: false, msg: `HTTP ${res.status}`, detail: txt.slice(0, 120) });
        return;
      }

      const jsonText = await res.text();
      const parsed = JSON.parse(jsonText);
      const count = parsed?._meta?.wallet_count ?? '?';
      const ts    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `btng-backup-${ts}.json`;

      if (Platform.OS === 'web') {
        // Web: trigger browser file download
        const blob = new Blob([jsonText], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        setBackupResult({ ok: true, msg: `Downloaded ${filename}`, detail: `${count} wallet(s) in backup.` });
      } else {
        // Mobile: write to cache + share
        const path = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(path, jsonText, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Save BTNG Backup' });
          setBackupResult({ ok: true, msg: `Backup ready to save`, detail: `${count} wallet(s) · ${filename}` });
        } else {
          setBackupResult({ ok: true, msg: `Saved to cache`, detail: `${path}\n${count} wallet(s).` });
        }
      }
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      setBackupResult({
        ok:     false,
        msg:    isTimeout ? 'Request timed out' : 'Network error',
        detail: isTimeout ? 'Server did not respond within 10s.' : (err?.message ?? 'Unknown error'),
      });
    } finally {
      setBackupLoading(false);
    }
  }, [adminToken]);

  // ── Restore from File ────────────────────────────────────────────────────────
  const handleRestoreFromFile = useCallback(async () => {
    if (!adminToken.trim()) {
      setRestoreResult({ ok: false, msg: 'Bearer token required', detail: 'Enter the BTNG_SECRET to authenticate.' });
      return;
    }

    setRestoreResult(null);
    setSelectedFileName(null);

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (picked.canceled || !picked.assets?.[0]) {
        setRestoreResult({ ok: false, msg: 'No file selected', detail: 'File picker was cancelled.' });
        return;
      }

      const asset = picked.assets[0];
      setSelectedFileName(asset.name ?? 'selected file');

      let fileContent: string;
      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        fileContent = await resp.text();
      } else {
        fileContent = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(fileContent);
      } catch {
        setRestoreResult({ ok: false, msg: 'Invalid JSON', detail: 'The selected file is not valid JSON.' });
        return;
      }

      // Support both raw wallet store and backup-envelope formats
      const wallets = parsed.wallets ?? parsed;
      const walletCount = Object.keys(wallets).filter(k => k !== '_meta').length;

      // Confirm before overwrite
      if (restoreMode === 'overwrite') {
        await new Promise<void>((resolve, reject) => {
          Alert.alert(
            'Confirm Overwrite',
            `This will REPLACE all existing wallets with ${walletCount} wallet(s) from the backup. Continue?`,
            [
              { text: 'Cancel',    style: 'cancel',      onPress: () => reject(new Error('cancelled')) },
              { text: 'Overwrite', style: 'destructive', onPress: () => resolve() },
            ],
          );
        });
      }

      setRestoreLoading(true);

      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 15_000);

      const res = await fetch(`${BANK_BASE_URL}/api/admin/restore`, {
        method:  'POST',
        signal:  controller2.signal,
        headers: {
          'Authorization': `Bearer ${adminToken.trim()}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
        },
        body: JSON.stringify({ mode: restoreMode, wallets }),
      });
      clearTimeout(timer2);

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setRestoreResult({ ok: false, msg: 'Unauthorized (401)', detail: 'Invalid or missing Bearer token.' });
        return;
      }
      if (!res.ok) {
        setRestoreResult({ ok: false, msg: `HTTP ${res.status}`, detail: data?.error ?? 'Server rejected restore.' });
        return;
      }

      const s = data?.summary;
      setRestoreResult({
        ok:     true,
        msg:    `Restored ${s?.imported ?? '?'} wallet(s)`,
        detail: `Mode: ${s?.mode ?? restoreMode} · Skipped: ${s?.skipped ?? 0} · Total now: ${s?.currentTotal ?? '?'}`,
      });
    } catch (err: any) {
      if (err?.message === 'cancelled') {
        setRestoreResult({ ok: false, msg: 'Cancelled', detail: 'Overwrite was cancelled by user.' });
        return;
      }
      const isTimeout = err?.name === 'AbortError';
      setRestoreResult({
        ok:     false,
        msg:    isTimeout ? 'Request timed out' : (err?.message ?? 'Failed'),
        detail: isTimeout ? 'Server did not respond within 15s.' : undefined,
      });
    } finally {
      setRestoreLoading(false);
    }
  }, [adminToken, restoreMode]);

  // ── Ping a single port ──────────────────────────────────────────────────────
  const pingPort = useCallback(async (id: string) => {
    const port = PORTS.find(p => p.id === id);
    if (!port) return;

    setPortStates(prev => ({
      ...prev,
      [id]: { ...prev[id], status: 'checking', errorMsg: null, responseSnip: null },
    }));

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

      // Attach zone token when pinging the Zone Engine health endpoint
      const pingHeaders: Record<string, string> = { 'Accept': 'application/json' };
      if (id === 'zone-engine' && zoneToken.trim()) {
        pingHeaders['Authorization'] = `Bearer ${zoneToken.trim()}`;
      }

      const res = await fetch(port.url, {
        method: port.method,
        signal: controller.signal,
        headers: pingHeaders,
      });
      clearTimeout(timer);

      const ms = Date.now() - start;
      let snip: string | null = null;

      try {
        const text = await res.text();
        // Try to extract a meaningful snippet from JSON
        const parsed = JSON.parse(text);
        snip = parsed?.status ?? parsed?.message ?? parsed?.network ?? parsed?.version ?? text.slice(0, 60);
        if (typeof snip === 'object') snip = JSON.stringify(snip).slice(0, 60);
      } catch {
        snip = null;
      }

      setPortStates(prev => ({
        ...prev,
        [id]: {
          status:       res.ok ? 'up' : 'down',
          responseMs:   ms,
          lastChecked:  new Date(),
          statusCode:   res.status,
          errorMsg:     res.ok ? null : `HTTP ${res.status} ${res.statusText}`,
          responseSnip: snip,
        },
      }));
    } catch (err: any) {
      const ms = Date.now() - start;
      const isTimeout = err?.name === 'AbortError' || ms >= PING_TIMEOUT_MS - 50;
      const isNetwork = err?.message?.includes('Network') || err?.message?.includes('fetch');

      setPortStates(prev => ({
        ...prev,
        [id]: {
          status:       isTimeout ? 'timeout' : 'down',
          responseMs:   isTimeout ? null : ms,
          lastChecked:  new Date(),
          statusCode:   null,
          errorMsg:     isTimeout ? null : (err?.message ?? 'Connection refused'),
          responseSnip: null,
        },
      }));
    }
  }, []);

  // ── Ping all ports ──────────────────────────────────────────────────────────
  const pingAll = useCallback(async () => {
    setFullChecking(true);
    // Fire all pings in parallel
    await Promise.all(PORTS.map(p => pingPort(p.id)));
    setLastFullCheck(new Date());
    setFullChecking(false);
  }, [pingPort]);

  // ── Auto-refresh ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        pingAll();
      }, autoInterval * 1000);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [autoRefresh, autoInterval, pingAll]);

  // ── ss -tuln auto-scan interval ───────────────────────────────────────────
  useEffect(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (scanCountRef.current)    clearInterval(scanCountRef.current);

    if (scanAutoRefresh && adminToken.trim()) {
      scanCountdownRef.current = 60;
      setScanCountdown(60);

      scanCountRef.current = setInterval(() => {
        scanCountdownRef.current -= 1;
        setScanCountdown(scanCountdownRef.current);
        if (scanCountdownRef.current <= 0) {
          scanCountdownRef.current = 60;
          setScanCountdown(60);
        }
      }, 1000);

      scanIntervalRef.current = setInterval(() => {
        handleSsTuln();
        scanCountdownRef.current = 60;
        setScanCountdown(60);
      }, 60_000);
    }

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (scanCountRef.current)    clearInterval(scanCountRef.current);
    };
  }, [scanAutoRefresh, adminToken, handleSsTuln]);

  // ── Initial check on mount ──────────────────────────────────────────────────
  useEffect(() => {
    pingAll();
  }, [zoneToken]);

  // ── Derived stats ───────────────────────────────────────────────────────────
  const upCount      = PORTS.filter(p => portStates[p.id]?.status === 'up').length;
  const downCount    = PORTS.filter(p => portStates[p.id]?.status === 'down').length;
  const timeoutCount = PORTS.filter(p => portStates[p.id]?.status === 'timeout').length;
  const avgMs        = (() => {
    const vals = PORTS.map(p => portStates[p.id]?.responseMs).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  })();

  const overallStatus: 'all-up' | 'partial' | 'all-down' | 'unknown' = (() => {
    const checked = PORTS.filter(p => portStates[p.id]?.status !== 'idle' && portStates[p.id]?.status !== 'checking');
    if (checked.length === 0) return 'unknown';
    if (upCount === PORTS.length) return 'all-up';
    if (downCount + timeoutCount === PORTS.length) return 'all-down';
    return 'partial';
  })();

  const overallColor = {
    'all-up':   '#22C55E',
    'partial':  '#F59E0B',
    'all-down': '#EF4444',
    'unknown':  Colors.textMuted,
  }[overallStatus];

  const overallLabel = {
    'all-up':   'ALL SYSTEMS OPERATIONAL',
    'partial':  'PARTIAL OUTAGE',
    'all-down': 'MAJOR OUTAGE',
    'unknown':  'CHECKING SYSTEMS…',
  }[overallStatus];

  const formatDate = (d: Date | null) => {
    if (!d) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Group by category
  const categories = [...new Set(PORTS.map(p => p.category))];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Port Health Monitor</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {overallStatus === 'all-up'
              ? <LiveDot color={overallColor} size={5} />
              : <MaterialIcons name="radio-button-on" size={10} color={overallColor} />}
            <Text style={[s.topSub, { color: overallColor }]}>{overallLabel}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.iconBtn, fullChecking && { opacity: 0.5 }]}
          onPress={pingAll}
          disabled={fullChecking}
          activeOpacity={0.8}
        >
          {fullChecking
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <MaterialIcons name="refresh" size={22} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Overall Status Banner ─────────────────────────────────────── */}
        <View style={[s.statusBanner, { borderColor: overallColor + '66', backgroundColor: overallColor + '0C' }]}>
          <View style={[s.statusBannerIcon, { backgroundColor: overallColor + '22', borderColor: overallColor + '55' }]}>
            <MaterialIcons
              name={overallStatus === 'all-up' ? 'check-circle' : overallStatus === 'all-down' ? 'cancel' : overallStatus === 'partial' ? 'warning' : 'hourglass-empty'}
              size={28}
              color={overallColor}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.statusBannerTitle, { color: overallColor }]}>{overallLabel}</Text>
            <Text style={s.statusBannerSub}>
              {upCount}/{PORTS.length} services online · Last full check: {formatDate(lastFullCheck)}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.pingAllBtn, { borderColor: overallColor + '55', backgroundColor: overallColor + '12' }, fullChecking && { opacity: 0.5 }]}
            onPress={pingAll}
            disabled={fullChecking}
            activeOpacity={0.85}
          >
            {fullChecking
              ? <ActivityIndicator size="small" color={overallColor} />
              : <MaterialIcons name="wifi-tethering" size={18} color={overallColor} />}
            <Text style={[s.pingAllBtnText, { color: overallColor }]}>
              {fullChecking ? 'Checking…' : 'Ping All'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Summary Stats ─────────────────────────────────────────────── */}
        <View style={s.summaryRow}>
          {[
            { label: 'Online',    value: upCount,      color: '#22C55E', icon: 'check-circle'  },
            { label: 'Offline',   value: downCount,    color: '#EF4444', icon: 'cancel'        },
            { label: 'Timeout',   value: timeoutCount, color: '#F59E0B', icon: 'timer-off'     },
            { label: 'Avg ms',    value: avgMs !== null ? `${avgMs}` : '—', color: Colors.primary, icon: 'speed' },
            { label: 'Services',  value: PORTS.length, color: Colors.textSecondary, icon: 'dashboard' },
          ].map(stat => (
            <View key={stat.label} style={[s.summaryCell, { borderColor: stat.color + '44' }]}>
              <MaterialIcons name={stat.icon as any} size={13} color={stat.color} />
              <Text style={[s.summaryCellVal, { color: stat.color }]}>{String(stat.value)}</Text>
              <Text style={s.summaryCellLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Auto-refresh Controls ─────────────────────────────────────── */}
        <View style={s.autoCard}>
          <View style={s.autoCardHeader}>
            <MaterialIcons name="autorenew" size={15} color={autoRefresh ? Colors.success : Colors.textMuted} />
            <Text style={[s.autoCardTitle, { color: autoRefresh ? Colors.success : Colors.textPrimary }]}>
              Auto-Refresh
            </Text>
            <TouchableOpacity
              style={[s.autoToggle, { backgroundColor: autoRefresh ? Colors.success : Colors.bgElevated, borderColor: autoRefresh ? Colors.success : Colors.border }]}
              onPress={() => setAutoRefresh(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={[s.autoToggleText, { color: autoRefresh ? Colors.bg : Colors.textMuted }]}>
                {autoRefresh ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Interval picker */}
          <View style={s.intervalRow}>
            <Text style={s.intervalLabel}>Interval:</Text>
            {([30, 60, 120] as const).map(sec => (
              <TouchableOpacity
                key={sec}
                style={[s.intervalChip, autoInterval === sec && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                onPress={() => setAutoInterval(sec)}
                activeOpacity={0.8}
              >
                <Text style={[s.intervalChipText, autoInterval === sec && { color: Colors.bg }]}>
                  {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                </Text>
              </TouchableOpacity>
            ))}
            {autoRefresh && (
              <View style={[s.intervalChip, { borderColor: Colors.success + '55', backgroundColor: Colors.successBg, marginLeft: 'auto' }]}>
                <LiveDot color={Colors.success} size={5} />
                <Text style={[s.intervalChipText, { color: Colors.success }]}>
                  Every {autoInterval < 60 ? `${autoInterval}s` : `${autoInterval / 60}m`}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Port Cards by Category ───────────────────────────────────── */}
        {categories.map(cat => {
          const catPorts = PORTS.filter(p => p.category === cat);
          const catUp    = catPorts.filter(p => portStates[p.id]?.status === 'up').length;
          return (
            <View key={cat}>
              {/* Category header */}
              <View style={s.catHeader}>
                <View style={s.catDivider} />
                <View style={s.catLabelWrap}>
                  <Text style={s.catLabel}>{cat}</Text>
                  <View style={[s.catBadge, { backgroundColor: catUp === catPorts.length ? '#22C55E18' : '#EF444418', borderColor: catUp === catPorts.length ? '#22C55E44' : '#EF444444' }]}>
                    <Text style={[s.catBadgeText, { color: catUp === catPorts.length ? '#22C55E' : '#EF4444' }]}>
                      {catUp}/{catPorts.length}
                    </Text>
                  </View>
                </View>
                <View style={s.catDivider} />
              </View>

              {/* Cards */}
              {catPorts.map(port => (
                <PortCard
                  key={port.id}
                  port={port}
                  state={portStates[port.id] ?? INITIAL_STATE}
                  onPing={pingPort}
                />
              ))}
            </View>
          );
        })}

        {/* ── Admin Actions Card ──────────────────────────────────────── */}
        <View style={s.adminCard}>
          {/* Header */}
          <View style={s.adminHeader}>
            <View style={s.adminHeaderIconWrap}>
              <MaterialIcons name="admin-panel-settings" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.adminHeaderTitle}>Admin Actions</Text>
              <Text style={s.adminHeaderSub}>Bank Wallet Server · localhost:8090</Text>
            </View>
            <View style={[s.adminChip, { backgroundColor: '#D4A01718', borderColor: '#D4A01744' }]}>
              <MaterialIcons name="lock" size={10} color={Colors.primary} />
              <Text style={[s.adminChipText, { color: Colors.primary }]}>SECURED</Text>
            </View>
          </View>

          <View style={s.adminDivider} />

          {/* Bearer Token Input */}
          <View style={s.tokenSection}>
            <Text style={s.tokenLabel}>
              <MaterialIcons name="vpn-key" size={11} color={Colors.textMuted} />{'  '}Bearer Token (BTNG_SECRET)
            </Text>
            <View style={s.tokenInputRow}>
              <TextInput
                style={s.tokenInput}
                value={adminToken}
                onChangeText={setAdminToken}
                placeholder="Enter BTNG_SECRET…"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!tokenVisible}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={s.tokenEye}
                onPress={() => setTokenVisible(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={tokenVisible ? 'visibility-off' : 'visibility'}
                  size={18}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
              {adminToken.length > 0 && (
                <TouchableOpacity
                  style={s.tokenClear}
                  onPress={() => { setAdminToken(''); setBackupResult(null); setRestoreResult(null); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {/* Remember token toggle */}
            <TouchableOpacity
              style={s.rememberRow}
              onPress={() => handleToggleRemember(!rememberToken)}
              activeOpacity={0.8}
            >
              <View style={[s.rememberToggleTrack, rememberToken && s.rememberToggleTrackOn]}>
                <View style={[s.rememberToggleThumb, rememberToken && s.rememberToggleThumbOn]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rememberLabel, rememberToken && { color: Colors.primary }]}>
                  Remember token
                </Text>
                <Text style={s.rememberSub}>
                  {rememberToken
                    ? 'Token is saved securely on this device'
                    : 'Token will be cleared when you leave this screen'}
                </Text>
              </View>
              {rememberToken && (
                <View style={s.rememberBadge}>
                  <MaterialIcons name="lock" size={9} color={Colors.primary} />
                  <Text style={s.rememberBadgeText}>SAVED</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={s.tokenHint}>
              Set on the server with: BTNG_SECRET=your_secret node btng-bank-server.js
            </Text>
          </View>

          <View style={s.adminDivider} />

          {/* ── Download Backup ── */}
          <View style={s.actionSection}>
            <View style={s.actionTitleRow}>
              <View style={[s.actionIconWrap, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                <MaterialIcons name="cloud-download" size={18} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>Download Backup</Text>
                <Text style={s.actionDesc}>
                  Exports full btng-wallets.json from the bank server as a dated JSON file.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                s.actionBtn,
                { backgroundColor: '#22C55E18', borderColor: '#22C55E55' },
                (backupLoading || !adminToken.trim()) && { opacity: 0.5 },
              ]}
              onPress={handleDownloadBackup}
              disabled={backupLoading || !adminToken.trim()}
              activeOpacity={0.85}
            >
              {backupLoading
                ? <ActivityIndicator size="small" color="#22C55E" />
                : <MaterialIcons name="download" size={18} color="#22C55E" />}
              <Text style={[s.actionBtnText, { color: '#22C55E' }]}>
                {backupLoading ? 'Downloading…' : 'Download Backup'}
              </Text>
            </TouchableOpacity>

            {backupResult !== null ? (
              <View style={[
                s.resultStrip,
                { backgroundColor: backupResult.ok ? '#22C55E10' : '#EF444410', borderColor: backupResult.ok ? '#22C55E44' : '#EF444444' },
              ]}>
                <MaterialIcons
                  name={backupResult.ok ? 'check-circle' : 'error-outline'}
                  size={14}
                  color={backupResult.ok ? '#22C55E' : '#EF4444'}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.resultMsg, { color: backupResult.ok ? '#22C55E' : '#EF4444' }]}>
                    {backupResult.msg}
                  </Text>
                  {backupResult.detail ? (
                    <Text style={s.resultDetail}>{backupResult.detail}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => setBackupResult(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={s.adminDivider} />

          {/* ── Restore from File ── */}
          <View style={s.actionSection}>
            <View style={s.actionTitleRow}>
              <View style={[s.actionIconWrap, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' }]}>
                <MaterialIcons name="restore" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>Restore from File</Text>
                <Text style={s.actionDesc}>
                  Pick a backup .json and POST it to /api/admin/restore. Choose merge or overwrite mode.
                </Text>
              </View>
            </View>

            {/* Mode selector */}
            <View style={s.modeRow}>
              <Text style={s.modeLabel}>Mode:</Text>
              {(['merge', 'overwrite'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    s.modeChip,
                    restoreMode === mode && {
                      backgroundColor: mode === 'merge' ? '#3B82F618' : '#EF444418',
                      borderColor:     mode === 'merge' ? '#3B82F655' : '#EF444455',
                    },
                  ]}
                  onPress={() => setRestoreMode(mode)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={mode === 'merge' ? 'merge-type' : 'warning'}
                    size={12}
                    color={restoreMode === mode ? (mode === 'merge' ? '#3B82F6' : '#EF4444') : Colors.textMuted}
                  />
                  <Text style={[
                    s.modeChipText,
                    restoreMode === mode && { color: mode === 'merge' ? '#3B82F6' : '#EF4444', fontWeight: FontWeight.heavy },
                  ]}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={s.modeHintWrap}>
                <Text style={s.modeHint}>
                  {restoreMode === 'merge'
                    ? 'Adds/updates wallets — existing data preserved'
                    : 'Replaces ALL wallets — existing data erased'}
                </Text>
              </View>
            </View>

            {/* Selected file indicator */}
            {selectedFileName ? (
              <View style={s.fileChip}>
                <MaterialIcons name="insert-drive-file" size={13} color={Colors.primary} />
                <Text style={s.fileChipText} numberOfLines={1}>{selectedFileName}</Text>
                <TouchableOpacity
                  onPress={() => setSelectedFileName(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={12} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                s.actionBtn,
                {
                  backgroundColor: restoreMode === 'overwrite' ? '#EF444418' : '#F59E0B18',
                  borderColor:     restoreMode === 'overwrite' ? '#EF444455' : '#F59E0B55',
                },
                (restoreLoading || !adminToken.trim()) && { opacity: 0.5 },
              ]}
              onPress={handleRestoreFromFile}
              disabled={restoreLoading || !adminToken.trim()}
              activeOpacity={0.85}
            >
              {restoreLoading
                ? <ActivityIndicator size="small" color="#F59E0B" />
                : <MaterialIcons
                    name="upload-file"
                    size={18}
                    color={restoreMode === 'overwrite' ? '#EF4444' : '#F59E0B'}
                  />}
              <Text style={[
                s.actionBtnText,
                { color: restoreMode === 'overwrite' ? '#EF4444' : '#F59E0B' },
              ]}>
                {restoreLoading
                  ? 'Restoring…'
                  : `Pick File & Restore (${restoreMode.charAt(0).toUpperCase() + restoreMode.slice(1)})`}
              </Text>
            </TouchableOpacity>

            {restoreResult !== null ? (
              <View style={[
                s.resultStrip,
                { backgroundColor: restoreResult.ok ? '#22C55E10' : '#EF444410', borderColor: restoreResult.ok ? '#22C55E44' : '#EF444444' },
              ]}>
                <MaterialIcons
                  name={restoreResult.ok ? 'check-circle' : 'error-outline'}
                  size={14}
                  color={restoreResult.ok ? '#22C55E' : '#EF4444'}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.resultMsg, { color: restoreResult.ok ? '#22C55E' : '#EF4444' }]}>
                    {restoreResult.msg}
                  </Text>
                  {restoreResult.detail ? (
                    <Text style={s.resultDetail}>{restoreResult.detail}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => setRestoreResult(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={s.adminDivider} />

          {/* ── Zone Engine Token ── */}
          <View style={s.zoneSection}>
            {/* Zone section header */}
            <View style={s.zoneSectionHeader}>
              <View style={[s.zoneIconWrap, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                <MaterialIcons name="travel-explore" size={16} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: '#3B82F6' }]}>Zone Engine Bearer Token</Text>
                <Text style={s.actionDesc}>Used when pinging localhost:8125 · /api/zone/health</Text>
              </View>
              <View style={[s.adminChip, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                <MaterialIcons name="sensors" size={10} color="#3B82F6" />
                <Text style={[s.adminChipText, { color: '#3B82F6' }]}>PORT 8125</Text>
              </View>
            </View>

            {/* Zone token input */}
            <Text style={s.tokenLabel}>
              <MaterialIcons name="vpn-key" size={11} color={Colors.textMuted} />{'  '}Bearer Token (BTNG_SECRET)
            </Text>
            <View style={[s.tokenInputRow, { borderColor: zoneToken.trim() ? '#3B82F666' : Colors.border }]}>
              <TextInput
                style={s.tokenInput}
                value={zoneToken}
                onChangeText={setZoneToken}
                placeholder="Enter Zone Engine secret…"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!zoneTokenVisible}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={s.tokenEye}
                onPress={() => setZoneTokenVisible(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={zoneTokenVisible ? 'visibility-off' : 'visibility'}
                  size={18}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
              {zoneToken.length > 0 && (
                <TouchableOpacity
                  style={s.tokenClear}
                  onPress={() => setZoneToken('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Zone remember toggle */}
            <TouchableOpacity
              style={s.rememberRow}
              onPress={() => handleToggleZoneRemember(!zoneRemember)}
              activeOpacity={0.8}
            >
              <View style={[s.rememberToggleTrack, zoneRemember && s.rememberToggleTrackZone]}>
                <View style={[s.rememberToggleThumb, zoneRemember && s.rememberToggleThumbZone]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rememberLabel, zoneRemember && { color: '#3B82F6' }]}>
                  Remember zone token
                </Text>
                <Text style={s.rememberSub}>
                  {zoneRemember
                    ? 'Zone token saved securely on this device'
                    : 'Zone token cleared when leaving this screen'}
                </Text>
              </View>
              {zoneRemember && (
                <View style={[s.rememberBadge, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                  <MaterialIcons name="lock" size={9} color="#3B82F6" />
                  <Text style={[s.rememberBadgeText, { color: '#3B82F6' }]}>SAVED</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Ping zone button */}
            <TouchableOpacity
              style={[
                s.actionBtn,
                { backgroundColor: '#3B82F618', borderColor: '#3B82F655' },
                !zoneToken.trim() && { opacity: 0.4 },
              ]}
              onPress={() => pingPort('zone-engine')}
              activeOpacity={0.85}
            >
              <MaterialIcons name="sensors" size={16} color="#3B82F6" />
              <Text style={[s.actionBtnText, { color: '#3B82F6' }]}>Ping Zone Engine with Token</Text>
            </TouchableOpacity>

            <Text style={s.tokenHint}>
              Token is attached as: Authorization: Bearer &lt;token&gt; on every zone health ping
            </Text>
          </View>


          <View style={s.adminDivider} />

          {/* ── ss -tuln Quick Scan ── */}
          <View style={s.actionSection}>
            <View style={s.actionTitleRow}>
              <View style={[s.actionIconWrap, { backgroundColor: '#A78BFA18', borderColor: '#A78BFA44' }]}>
                <MaterialIcons name="wifi" size={18} color="#A78BFA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>Network Port Scanner</Text>
                <Text style={s.actionDesc}>
                  Runs `ss -tuln` via /api/admin/exec — shows which ports are actually LISTENING on the server.
                </Text>
              </View>
              <View style={[s.adminChip, { backgroundColor: '#A78BFA18', borderColor: '#A78BFA44' }]}>
                <MaterialIcons name="sensors" size={10} color="#A78BFA" />
                <Text style={[s.adminChipText, { color: '#A78BFA' }]}>EXEC</Text>
              </View>
            </View>

            {/* ── Scan button + auto-refresh toggle row ── */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[
                  s.actionBtn,
                  { backgroundColor: '#A78BFA18', borderColor: '#A78BFA55', flex: 1 },
                  (scanLoading || !adminToken.trim()) && { opacity: 0.5 },
                ]}
                onPress={handleSsTuln}
                disabled={scanLoading || !adminToken.trim()}
                activeOpacity={0.85}
              >
                {scanLoading
                  ? <ActivityIndicator size="small" color="#A78BFA" />
                  : <MaterialIcons name="network-check" size={18} color="#A78BFA" />}
                <Text style={[s.actionBtnText, { color: '#A78BFA' }]}>
                  {scanLoading ? 'Scanning…' : 'Scan Listening Ports (ss -tuln)'}
                </Text>
              </TouchableOpacity>

              {/* Auto-rescan toggle pill */}
              <TouchableOpacity
                style={[
                  s.scanAutoToggleBtn,
                  scanAutoRefresh && adminToken.trim()
                    ? { backgroundColor: '#A78BFA22', borderColor: '#A78BFA88' }
                    : { opacity: !adminToken.trim() ? 0.35 : 1 },
                ]}
                onPress={() => setScanAutoRefresh(v => !v)}
                disabled={!adminToken.trim()}
                activeOpacity={0.8}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialIcons
                  name="autorenew"
                  size={14}
                  color={scanAutoRefresh && adminToken.trim() ? '#A78BFA' : Colors.textMuted}
                />
                <Text style={[
                  s.scanAutoToggleText,
                  { color: scanAutoRefresh && adminToken.trim() ? '#A78BFA' : Colors.textMuted },
                ]}>
                  {scanAutoRefresh ? 'Auto ON' : 'Auto'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Auto-scan countdown strip ── */}
            {scanAutoRefresh && adminToken.trim() ? (
              <View style={s.scanCountdownStrip}>
                <MaterialIcons name="autorenew" size={11} color="#A78BFA" />
                <Text style={s.scanCountdownLabel}>Re-scan in {scanCountdown}s</Text>
                <View style={s.scanCountdownTrack}>
                  <View
                    style={[
                      s.scanCountdownFill,
                      { width: `${(scanCountdown / 60) * 100}%` as any },
                    ]}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setScanAutoRefresh(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="close" size={12} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}

            {scanError ? (
              <View style={[s.resultStrip, { backgroundColor: '#EF444410', borderColor: '#EF444444' }]}>
                <MaterialIcons name="error-outline" size={14} color="#EF4444" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.resultMsg, { color: '#EF4444' }]}>Scan failed</Text>
                  <Text style={s.resultDetail}>{scanError}</Text>
                </View>
                <TouchableOpacity onPress={() => setScanError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}

            {scanSockets !== null && !scanLoading ? (
              <View style={s.scanResultCard}>
                <View style={s.scanResultHeader}>
                  <MaterialIcons name="list" size={13} color={Colors.textMuted} />
                  <Text style={s.scanResultTitle}>
                    {scanSockets.length} listening socket{scanSockets.length !== 1 ? 's' : ''} found
                  </Text>
                  {scanTs ? <Text style={s.scanResultTs}>{scanTs}</Text> : null}
                  <TouchableOpacity
                    onPress={() => { setScanSockets(null); setScanTs(null); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {scanSockets.length === 0 ? (
                  <Text style={[s.resultDetail, { textAlign: 'center', paddingVertical: 12 }]}>
                    No listening sockets found in output
                  </Text>
                ) : (
                  <View style={s.scanChipsWrap}>
                    {scanSockets.map((sock, idx) => {
                      const isExpected = EXPECTED_PORTS.includes(sock.port);
                      const chipColor  = isExpected ? '#22C55E' : '#F59E0B';
                      return (
                        <View
                          key={idx}
                          style={[s.scanChip, { backgroundColor: chipColor + '15', borderColor: chipColor + '44' }]}
                        >
                          <View style={[s.scanChipDot, { backgroundColor: chipColor }]} />
                          <Text style={[s.scanChipPort, { color: chipColor }]}>{sock.port}</Text>
                          <View style={[s.scanChipProto, { backgroundColor: chipColor + '22', borderColor: chipColor + '44' }]}>
                            <Text style={[s.scanChipProtoText, { color: chipColor }]}>{sock.proto.toUpperCase()}</Text>
                          </View>
                          <Text style={[s.scanChipState, { color: chipColor }]}>{sock.state}</Text>
                          {isExpected ? (
                            <MaterialIcons name="check-circle" size={10} color={chipColor} />
                          ) : (
                            <MaterialIcons name="help-outline" size={10} color={chipColor} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={s.scanLegend}>
                  <View style={[s.scanLegendDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={s.scanLegendText}>Expected (8090 / 8125 / 3000 / 38984)</Text>
                  <View style={[s.scanLegendDot, { backgroundColor: '#F59E0B', marginLeft: 10 }]} />
                  <Text style={s.scanLegendText}>Unknown port</Text>
                </View>
              </View>
            ) : null}

            {!adminToken.trim() && (
              <Text style={s.tokenHint}>Enter BTNG_SECRET token above to enable port scanner</Text>
            )}
          </View>

          {/* Admin footer */}
          <View style={s.adminFooter}>
            <MaterialIcons name="security" size={11} color={Colors.textMuted} />
            <Text style={s.adminFooterText}>
              Protected by Bearer token · Bank v1.0.0 · Zone Engine v1.0.0
            </Text>
          </View>
        </View>

        {/* ── Network Note ──────────────────────────────────────────────── */}
        <View style={s.noteCard}>
          <View style={s.noteHeader}>
            <MaterialIcons name="info-outline" size={14} color={Colors.warning} />
            <Text style={[s.noteTitle, { color: Colors.warning }]}>Mobile Access Note</Text>
          </View>
          <Text style={s.noteText}>
            <Text style={{ fontWeight: FontWeight.bold }}>localhost</Text> services (8090, 8125, 8087, 8000, 3000–3004) are only reachable when the app runs on the same machine as the servers (e.g. Expo web/emulator). On a physical device, replace <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Colors.primary }}>localhost</Text> with your server's LAN IP.
          </Text>
          <View style={s.noteRow}>
            <MaterialIcons name="lan" size={12} color={Colors.primary} />
            <Text style={s.noteRowText}>
              Sovereign node <Text style={{ color: '#F7931A', fontWeight: FontWeight.bold }}>168.231.79.52:64799</Text> is always reachable over internet when the server is online.
            </Text>
          </View>
          <View style={[s.noteRow, { borderColor: Colors.success + '33', backgroundColor: Colors.successBg }]}>
            <MaterialIcons name="verified-user" size={12} color={Colors.success} />
            <Text style={[s.noteRowText, { color: Colors.success }]}>
              5-second timeout per request — TIMEOUT means no response (not necessarily crashed).
            </Text>
          </View>
        </View>

        {/* ── Port Map Reference ────────────────────────────────────────── */}
        <View style={s.mapCard}>
          <View style={s.mapHeader}>
            <MaterialIcons name="map" size={14} color={Colors.primary} />
            <Text style={s.mapTitle}>Full Port Directory</Text>
          </View>
          {[
            { port: 64799, service: 'BTNG Sovereign Node',    host: '168.231.79.52',  proto: 'HTTP', color: '#F7931A' },
            { port: 8090,  service: 'Bank Wallet Server',     host: 'localhost',      proto: 'HTTP', color: '#D4A017' },
            { port: 8125,  service: 'Zone Engine',            host: 'localhost',      proto: 'HTTP', color: '#3B82F6' },
            { port: 8087,  service: 'Brain Gate (AI)',        host: 'localhost',      proto: 'HTTP', color: '#8B5CF6' },
            { port: 8080,  service: 'Affinity Engine/FastAPI',host: 'localhost',      proto: 'HTTP', color: '#6366F1' },
            { port: 8000,  service: 'Private Banker / BTNG',  host: 'localhost',      proto: 'HTTP', color: '#22C55E' },
            { port: 3000,  service: 'Main Web App',           host: 'localhost',      proto: 'HTTP', color: '#10B981' },
            { port: 3001,  service: 'Node Generator API',     host: 'localhost',      proto: 'HTTP', color: '#EC4899' },
            { port: 3002,  service: 'API Key Generator',      host: 'localhost',      proto: 'HTTP', color: '#06B6D4' },
            { port: 3003,  service: 'OAuth2 Server',          host: 'localhost',      proto: 'HTTP', color: '#F59E0B' },
            { port: 3004,  service: 'Webhook Engine',         host: 'localhost',      proto: 'HTTP', color: '#8B5CF6' },
            { port: 38984, service: 'Gold Factory Stratum V2',  host: '168.231.79.52',  proto: 'TCP',  color: '#F5C518' },
          ].map(entry => (
            <View key={entry.port} style={s.mapRow}>
              <View style={[s.mapPortBadge, { backgroundColor: entry.color + '18', borderColor: entry.color + '44' }]}>
                <Text style={[s.mapPortText, { color: entry.color }]}>{entry.port}</Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={[s.mapServiceName, { color: entry.color }]}>{entry.service}</Text>
                <Text style={s.mapHostText}>{entry.host}</Text>
              </View>
              <View style={[s.mapProtoBadge, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                <Text style={s.mapProtoText}>{entry.proto}</Text>
              </View>
            </View>
          ))}

          {/* Firewall command */}
          <View style={s.firewallBox}>
            <Text style={s.firewallLabel}>UFW FIREWALL RULE</Text>
            <Text style={s.firewallCmd} selectable>
              {'ufw allow 3000/tcp && ufw allow 8081/tcp && ufw allow 8082/tcp && ufw allow 8088/tcp && ufw allow 8090/tcp && ufw allow 8125/tcp && ufw allow 64799/tcp && ufw allow 38984/tcp'}
            </Text>
          </View>
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.bg },
  topBar:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:           { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:         { flex: 1, alignItems: 'center', gap: 3 },
  topTitle:          { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:            { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },

  scroll:            { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: 0 },

  statusBanner:      { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  statusBannerIcon:  { width: 52, height: 52, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusBannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.4 },
  statusBannerSub:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  pingAllBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.lg, borderWidth: 1, flexShrink: 0 },
  pingAllBtnText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  summaryRow:        { flexDirection: 'row', gap: 6, marginBottom: Spacing.md },
  summaryCell:       { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, alignItems: 'center', gap: 3 },
  summaryCellVal:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  summaryCellLabel:  { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  autoCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
  autoCardHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  autoCardTitle:     { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  autoToggle:        { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  autoToggleText:    { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  intervalRow:       { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  intervalLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  intervalChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  intervalChipText:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },

  catHeader:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  catDivider:        { flex: 1, height: 1, backgroundColor: Colors.border },
  catLabelWrap:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catLabel:          { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  catBadge:          { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  catBadgeText:      { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  noteCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.warning + '44', padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
  noteHeader:        { flexDirection: 'row', alignItems: 'center', gap: 7 },
  noteTitle:         { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  noteText:          { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  noteRow:           { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '33' },
  noteRowText:       { flex: 1, fontSize: FontSize.xs, color: Colors.primary, lineHeight: 15, includeFontPadding: false },

  mapCard:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
  mapHeader:         { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mapTitle:          { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  mapRow:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  mapPortBadge:      { borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, minWidth: 54, alignItems: 'center', flexShrink: 0 },
  mapPortText:       { fontSize: 12, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  mapServiceName:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  mapHostText:       { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  mapProtoBadge:     { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  mapProtoText:      { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },

  firewallBox:       { backgroundColor: '#0A0A0A', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  firewallLabel:     { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  firewallCmd:       { fontSize: 10, color: '#22C55E', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14, includeFontPadding: false },

  // ── Admin Card ──────────────────────────────────────────────────────────────
  adminCard:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.md, gap: Spacing.md, marginBottom: Spacing.md },
  adminHeader:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  adminHeaderIconWrap: { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  adminHeaderTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  adminHeaderSub:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  adminChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  adminChipText:     { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  adminDivider:      { height: 1, backgroundColor: Colors.border },

  // Token input
  tokenSection:      { gap: Spacing.sm },
  tokenLabel:        { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tokenInputRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  tokenInput:        { flex: 1, height: 44, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  tokenEye:          { padding: 6 },
  tokenClear:        { padding: 6 },
  tokenHint:         { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 13, includeFontPadding: false },

  // Action sections
  actionSection:     { gap: Spacing.sm },
  actionTitleRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  actionIconWrap:    { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionTitle:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  actionDesc:        { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false, marginTop: 2 },
  actionBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 13, paddingHorizontal: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1 },
  actionBtnText:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Mode selector
  modeRow:           { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  modeLabel:         { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  modeChip:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  modeChipText:      { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textMuted, includeFontPadding: false },
  modeHintWrap:      { flex: 1, minWidth: 120 },
  modeHint:          { fontSize: 9, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false },

  // File chip
  fileChip:          { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '44' },
  fileChipText:      { flex: 1, fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Result strip
  resultStrip:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1 },
  resultMsg:         { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  resultDetail:      { fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },

  // Remember token toggle
  rememberRow:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: 10, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  rememberToggleTrack:   { width: 42, height: 24, borderRadius: 12, backgroundColor: Colors.border, justifyContent: 'center', paddingHorizontal: 3, flexShrink: 0 },
  rememberToggleTrackOn: { backgroundColor: Colors.primary + '44', borderWidth: 1.5, borderColor: Colors.primary + '88' },
  rememberToggleThumb:   { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.textMuted, alignSelf: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2, elevation: 2 },
  rememberToggleThumbOn: { backgroundColor: Colors.primary, alignSelf: 'flex-end' },
  rememberLabel:         { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  rememberSub:           { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  rememberBadge:         { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  rememberBadgeText:     { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },

  // Zone Engine token section
  zoneSection:       { gap: Spacing.sm },
  zoneSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  zoneIconWrap:      { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rememberToggleTrackZone:  { backgroundColor: '#3B82F633', borderWidth: 1.5, borderColor: '#3B82F688' },
  rememberToggleThumbZone:  { backgroundColor: '#3B82F6', alignSelf: 'flex-end' },

  // Admin footer
  adminFooter:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  adminFooterText:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // ss -tuln auto-scan toggle + countdown
  scanAutoToggleBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, flexShrink: 0 },
  scanAutoToggleText:   { fontSize: 10, fontWeight: FontWeight.bold as any, includeFontPadding: false },
  scanCountdownStrip:   { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#A78BFA0C', borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#A78BFA33' },
  scanCountdownLabel:   { fontSize: 9, color: '#A78BFA', fontWeight: FontWeight.semibold as any, includeFontPadding: false, flexShrink: 0 },
  scanCountdownTrack:   { flex: 1, height: 3, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden' },
  scanCountdownFill:    { height: 3, backgroundColor: '#A78BFA', borderRadius: 2 },

  // Scan result
  scanResultCard:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: '#A78BFA33', padding: Spacing.md, gap: Spacing.sm },
  scanResultHeader:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  scanResultTitle:   { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  scanResultTs:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  scanChipsWrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  scanChip:          { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  scanChipDot:       { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  scanChipPort:      { fontSize: 11, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  scanChipProto:     { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1 },
  scanChipProtoText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  scanChipState:     { fontSize: 9, fontWeight: FontWeight.semibold as any, includeFontPadding: false },
  scanLegend:        { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  scanLegendDot:     { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  scanLegendText:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});
