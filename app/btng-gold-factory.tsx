/**
 * app/btng-gold-factory.tsx
 * BTNG Gold Factory — Infinity Gold Producer
 * Stratum V2 Mining Pool Launcher & Status Panel
 *
 * Engine Files:
 *   sdk/stratum-gateway.js  → Stratum V2 + BTNG PoW backend (Port 38984)
 *   sdk/pow-worker.js       → Browser Web Worker (Real SHA-256 PoW)
 *   sdk/gold-factory/index.html → Full mining dashboard
 *
 * Deploy:
 *   npm install axios pg
 *   DATABASE_URL=postgres://... node sdk/stratum-gateway.js
 *   Serve sdk/gold-factory/ via Nginx on 168.231.79.52 (HTTPS)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, Platform, FlatList, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const STRATUM_HOST   = '168.231.79.52';
const STRATUM_PORT   = 38984;
const DASHBOARD_URL  = `https://${STRATUM_HOST}/gold-factory/`;
const STRATUM_WS_URL = `wss://${STRATUM_HOST}:${STRATUM_PORT}`;

// ─── WebSocket Types ──────────────────────────────────────────────────────────
type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface MiningJob {
  height:       number | null;
  target:       string | null;
  bits:         string | null;
  version:      number | null;
  merkleroot:   string | null;
  prevHash:     string | null;
  curtime:      number | null;
  receivedAt:   string;
}

interface LogEntry {
  id:        number;
  ts:        string;
  type:      'connect' | 'job' | 'submit' | 'accept' | 'reject' | 'error' | 'info';
  message:   string;
  color:     string;
}

// ─── Animated Gold Pulse ──────────────────────────────────────────────────────
function GoldPulse({ size = 80 }: { size?: number }) {
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const spin   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(ring1, { toValue: 1.6, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(ring1, { toValue: 1,   duration: 1200, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.delay(600),
      Animated.timing(ring2, { toValue: 1.8, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(ring2, { toValue: 1,   duration: 1200, useNativeDriver: true }),
    ])).start();
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 8000, useNativeDriver: true, easing: Easing.linear })
    ).start();
  }, [ring1, ring2, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ width: size + 48, height: size + 48, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 48, height: size + 48, borderRadius: (size + 48) / 2, borderWidth: 1.5, borderColor: '#D4A01730', transform: [{ scale: ring2 }] }} />
      <Animated.View style={{ position: 'absolute', width: size + 24, height: size + 24, borderRadius: (size + 24) / 2, borderWidth: 1, borderColor: '#D4A01750', transform: [{ scale: ring1 }] }} />
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#D4A01720', borderWidth: 2, borderColor: '#D4A017AA', alignItems: 'center', justifyContent: 'center', transform: [{ rotate }] }}>
        <Text style={{ fontSize: size * 0.5 }}>⛏️</Text>
      </Animated.View>
    </View>
  );
}

// ─── Status Row ───────────────────────────────────────────────────────────────
function StatusRow({ label, value, icon, color = Colors.textMuted }: {
  label: string; value: string; icon: string; color?: string;
}) {
  return (
    <View style={sr.row}>
      <View style={[sr.iconWrap, { backgroundColor: color + '15', borderColor: color + '33' }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <Text style={sr.label}>{label}</Text>
      <Text style={[sr.value, { color }]}>{value}</Text>
    </View>
  );
}

const sr = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  iconWrap:{ width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:   { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  value:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ─── File Card ────────────────────────────────────────────────────────────────
function FileCard({ file, desc, icon, color, cmd }: {
  file: string; desc: string; icon: string; color: string; cmd?: string;
}) {
  return (
    <View style={[fc.card, { borderColor: color + '33' }]}>
      <View style={[fc.iconWrap, { backgroundColor: color + '15', borderColor: color + '33' }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={fc.file} selectable>{file}</Text>
        <Text style={fc.desc}>{desc}</Text>
        {cmd ? (
          <View style={fc.cmdBox}>
            <Text style={fc.cmd} selectable>{cmd}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const fc = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  iconWrap:{ width: 40, height: 40, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  file:    { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  desc:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  cmdBox:  { backgroundColor: '#060608', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border, marginTop: 2 },
  cmd:     { fontSize: 9, color: '#22C55E', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── Log Entry Row ───────────────────────────────────────────────────────────
function LogRow({ item }: { item: LogEntry }) {
  return (
    <View style={lg.row}>
      <Text style={[lg.ts]}>{item.ts}</Text>
      <Text style={[lg.msg, { color: item.color }]} numberOfLines={2}>{item.message}</Text>
    </View>
  );
}
const lg = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#FFFFFF08' },
  ts:  { fontSize: 9, color: '#4B5563', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, flexShrink: 0, paddingTop: 1 },
  msg: { flex: 1, fontSize: 9.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 13 },
});

// ─── Job Field Row ────────────────────────────────────────────────────────────
function JobField({ label, value, color = Colors.textPrimary }: { label: string; value: string; color?: string }) {
  return (
    <View style={jf.row}>
      <Text style={jf.label}>{label}</Text>
      <Text style={[jf.value, { color }]} selectable numberOfLines={1} ellipsizeMode="middle">{value}</Text>
    </View>
  );
}
const jf = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', gap: 8 },
  label: { width: 90, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  value: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
// ─── Live Dashboard WebView Tab ──────────────────────────────────────────────
function LiveDashboardTab({ url, insetBottom }: { url: string; insetBottom: number }) {
  const [webLoading, setWebLoading]   = useState(true);
  const [webError,   setWebError]     = useState(false);
  const [reloading,  setReloading]    = useState(false);
  const webviewRef = useRef<WebView>(null);
  const loadAnim   = useRef(new Animated.Value(0)).current;
  const spinAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!webLoading) {
      Animated.timing(loadAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      setReloading(false);
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [webLoading]);

  const handleReload = () => {
    setWebError(false);
    setWebLoading(true);
    setReloading(true);
    loadAnim.setValue(0);
    spinAnim.setValue(0);
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.linear })
    ).start();
    webviewRef.current?.reload();
  };

  const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>

      {/* Dashboard Header Bar */}
      <View style={wd.dashHeader}>
        <MaterialIcons name="dashboard" size={14} color={Colors.primary} />
        <Text style={wd.dashUrl} numberOfLines={1} ellipsizeMode="middle">{url}</Text>
        <TouchableOpacity
          style={[wd.reloadBtn, reloading && { opacity: 0.55 }]}
          onPress={handleReload}
          disabled={reloading}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Animated.View style={{ transform: [{ rotate: reloading ? spinDeg : '0deg' }] }}>
            <MaterialIcons name="refresh" size={18} color={reloading ? Colors.primary : Colors.textSecondary} />
          </Animated.View>
        </TouchableOpacity>
        {!webLoading && !webError ? (
          <View style={wd.dashLivePill}>
            <View style={wd.dashLiveDot} />
            <Text style={wd.dashLiveText}>LIVE</Text>
          </View>
        ) : webError ? (
          <View style={[wd.dashLivePill, { backgroundColor: '#EF444418', borderColor: '#EF444444' }]}>
            <MaterialIcons name="wifi-off" size={9} color="#EF4444" />
            <Text style={[wd.dashLiveText, { color: '#EF4444' }]}>ERROR</Text>
          </View>
        ) : (
          <View style={[wd.dashLivePill, { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '55' }]}>
            <ActivityIndicator size="small" color={Colors.warning} style={{ transform: [{ scale: 0.55 }] }} />
            <Text style={[wd.dashLiveText, { color: Colors.warning }]}>LOADING</Text>
          </View>
        )}
      </View>

      {/* WebView */}
      <Animated.View style={{ flex: 1, opacity: webError ? 0 : loadAnim }}>
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: Colors.bg }}
          onLoadStart={() => { setWebLoading(true); setWebError(false); }}
          onLoadEnd={() => setWebLoading(false)}
          onError={() => { setWebLoading(false); setWebError(true); }}
          onHttpError={() => { setWebLoading(false); setWebError(true); }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={['*']}
          userAgent="Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 BTNGGoldFactory/1.0"
        />
      </Animated.View>

      {/* Loading overlay */}
      {webLoading && !webError && (
        <View style={wd.loadingOverlay}>
          <View style={wd.loadingCard}>
            <View style={wd.goldIcon}>
              <Text style={{ fontSize: 32 }}>⛏️</Text>
            </View>
            <Text style={wd.loadingTitle}>Loading Gold Factory</Text>
            <Text style={wd.loadingUrl} numberOfLines={1}>{url}</Text>
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 12 }} />
            <Text style={wd.loadingHint}>Connecting to mining dashboard…</Text>
          </View>
        </View>
      )}

      {/* Error state */}
      {webError && (
        <View style={wd.errorOverlay}>
          <View style={wd.errorCard}>
            <View style={wd.errorIconWrap}>
              <MaterialIcons name="wifi-off" size={40} color="#EF4444" />
            </View>
            <Text style={wd.errorTitle}>Dashboard Unreachable</Text>
            <Text style={wd.errorDesc}>
              The Gold Factory dashboard at {url} could not be loaded. The server may be offline, or it uses a self-signed SSL certificate that the WebView blocks.
            </Text>
            <View style={wd.errorNote}>
              <MaterialIcons name="info-outline" size={12} color={Colors.warning} />
              <Text style={wd.errorNoteText}>
                If the server uses a self-signed cert, deploy a trusted SSL certificate (e.g. Let"s Encrypt) on {STRATUM_HOST} to allow in-app loading.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, width: '100%' }}>
              <TouchableOpacity
                style={wd.retryBtn}
                onPress={handleReload}
                activeOpacity={0.85}
              >
                <MaterialIcons name="refresh" size={16} color={Colors.bg} />
                <Text style={wd.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Bottom safe area padding */}
      <View style={{ height: insetBottom }} />
    </View>
  );
}

const wd = StyleSheet.create({
  dashHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.xl, paddingVertical: 10, backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dashUrl:      { flex: 1, fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  reloadBtn:    { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dashLivePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, backgroundColor: Colors.successBg, borderColor: Colors.success + '55', flexShrink: 0 },
  dashLiveDot:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  dashLiveText: { fontSize: 8, fontWeight: '800' as any, color: Colors.success, includeFontPadding: false, letterSpacing: 0.4 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  loadingCard:    { alignItems: 'center', gap: 10, paddingHorizontal: 40 },
  goldIcon:       { width: 72, height: 72, borderRadius: 20, backgroundColor: '#D4A01718', borderWidth: 1.5, borderColor: '#D4A01744', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  loadingTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  loadingUrl:     { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, maxWidth: 280 },
  loadingHint:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 6 },
  errorOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 10, paddingHorizontal: 24 },
  errorCard:      { alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: '#EF444433', width: '100%', maxWidth: 400 },
  errorIconWrap:  { width: 80, height: 80, borderRadius: 20, backgroundColor: '#EF444412', borderWidth: 1.5, borderColor: '#EF444433', alignItems: 'center', justifyContent: 'center' },
  errorTitle:     { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: '#EF4444', includeFontPadding: false },
  errorDesc:      { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  errorNote:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.warning + '33', width: '100%' },
  errorNoteText:  { flex: 1, fontSize: 10, color: Colors.warning, lineHeight: 14, includeFontPadding: false },
  retryBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  retryBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BTNGGoldFactoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'status' | 'dashboard'>('status');
  const [gatewayStatus, setGatewayStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const pingAnim = useRef(new Animated.Value(0)).current;

  // ── WebSocket State ─────────────────────────────────────────────────────────
  const [wsStatus,   setWsStatus]   = useState<WsStatus>('disconnected');
  const [currentJob, setCurrentJob] = useState<MiningJob | null>(null);
  const [wsLog,      setWsLog]      = useState<LogEntry[]>([]);
  const wsRef      = useRef<WebSocket | null>(null);
  const logIdRef   = useRef(0);
  const wsBlinkRef = useRef(new Animated.Value(1)).current;

  // Blink animation for connected status
  useEffect(() => {
    if (wsStatus === 'connected') {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(wsBlinkRef, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(wsBlinkRef, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    } else {
      wsBlinkRef.setValue(1);
    }
  }, [wsStatus, wsBlinkRef]);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const colorMap: Record<LogEntry['type'], string> = {
      connect: '#22C55E',
      job:     '#D4A017',
      submit:  '#60A5FA',
      accept:  '#22C55E',
      reject:  '#EF4444',
      error:   '#EF4444',
      info:    '#9CA3AF',
    };
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry: LogEntry = { id: ++logIdRef.current, ts, type, message, color: colorMap[type] };
    setWsLog(prev => [entry, ...prev].slice(0, 80));
  }, []);

  const connectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus('connecting');
    addLog('info', `Connecting to ${STRATUM_WS_URL}…`);

    try {
      const ws = new WebSocket(STRATUM_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        addLog('connect', 'WebSocket connected to Stratum V2 gateway');
        // Send mining.authorize to subscribe to job notifications
        const authMsg = JSON.stringify({
          id: 1,
          method: 'mining.authorize',
          params: ['monitor@btng.gold'],
        });
        ws.send(authMsg);
        addLog('info', 'Sent: mining.authorize (monitor mode)');
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.method === 'mining.notify') {
            const job = msg.params?.[0] ?? {};
            const height    = job.height     ?? null;
            const target    = job.target     ?? null;
            const bits      = job.bits       ?? null;
            const version   = job.version    ?? null;
            const merkle    = job.merkleroot ?? null;
            const prevHash  = job.previousblockhash ?? null;
            const curtime   = job.curtime    ?? null;

            setCurrentJob({
              height, target, bits, version,
              merkleroot: merkle,
              prevHash, curtime,
              receivedAt: new Date().toISOString(),
            });

            addLog('job',
              `NEW JOB · Block #${
                height !== null ? height.toLocaleString() : '?'
              } · bits=${bits ?? '?'} · target=${target ? target.slice(0, 12) + '…' : '?'}`
            );
          } else if (msg.result === true) {
            if (msg.id === 1) {
              addLog('accept', 'Authorized · Subscribed to job notifications');
            } else {
              addLog('accept', `Share accepted (id=${msg.id})`);
            }
          } else if (msg.result === false) {
            addLog('reject', `Share rejected · ${JSON.stringify(msg.error ?? 'invalid')}`);
          } else {
            addLog('info', `MSG: ${JSON.stringify(msg).slice(0, 120)}`);
          }
        } catch {
          addLog('info', `RAW: ${String(evt.data).slice(0, 100)}`);
        }
      };

      ws.onerror = (err: any) => {
        setWsStatus('error');
        addLog('error', `WebSocket error: ${err?.message ?? 'connection failed'}`);
      };

      ws.onclose = (evt) => {
        setWsStatus('disconnected');
        addLog('info', `Disconnected (code=${evt.code} · ${evt.reason || 'no reason'})`);
        wsRef.current = null;
      };
    } catch (err: any) {
      setWsStatus('error');
      addLog('error', `Failed to open WebSocket: ${err?.message ?? 'unknown error'}`);
    }
  }, [addLog]);

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'user disconnect');
      wsRef.current = null;
    }
    setWsStatus('disconnected');
    addLog('info', 'Disconnected by user');
  }, [addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Pulse the ping dot
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pingAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pingAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [pingAnim]);

  // Check gateway reachability
  useEffect(() => {
    (async () => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://${STRATUM_HOST}/gold-factory/`, { signal: controller.signal, method: 'HEAD' }).catch(() => null);
        clearTimeout(t);
        setGatewayStatus(res ? 'online' : 'offline');
      } catch {
        setGatewayStatus('offline');
      }
    })();
  }, []);

  // Switch to the embedded Live Dashboard tab — no external browser
  const openDashboard = () => setActiveTab('dashboard');

  const statusColor = gatewayStatus === 'online' ? '#22C55E' : gatewayStatus === 'offline' ? '#EF4444' : '#F59E0B';
  const statusLabel = gatewayStatus === 'online' ? 'ONLINE' : gatewayStatus === 'offline' ? 'OFFLINE' : 'CHECKING…';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Gold Factory</Text>
          <Text style={s.topSub}>Infinity Gold Producer · Stratum V2</Text>
        </View>
        {/* Gateway status */}
        <View style={[s.statusPill, { borderColor: statusColor + '55', backgroundColor: statusColor + '12' }]}>
          <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor, opacity: pingAnim }} />
          <Text style={[s.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'status' && s.tabBtnActive]}
          onPress={() => setActiveTab('status')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="monitor-heart" size={15} color={activeTab === 'status' ? Colors.bg : Colors.textMuted} />
          <Text style={[s.tabBtnText, activeTab === 'status' && s.tabBtnTextActive]}>Status</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'dashboard' && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
          onPress={() => setActiveTab('dashboard')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="dashboard" size={15} color={activeTab === 'dashboard' ? Colors.bg : Colors.textMuted} />
          <Text style={[s.tabBtnText, activeTab === 'dashboard' && s.tabBtnTextActive]}>Live Dashboard</Text>
          <View style={[s.tabLiveDot, { backgroundColor: activeTab === 'dashboard' ? Colors.bg : Colors.primary }]} />
        </TouchableOpacity>
      </View>

      {/* ── Live Dashboard Tab ───────────────────────────────────────────── */}
      {activeTab === 'dashboard' ? (
        <LiveDashboardTab url={DASHBOARD_URL} insetBottom={insets.bottom} />
      ) : null}

      {/* ── Status Tab ───────────────────────────────────────────────────── */}
      {activeTab !== 'dashboard' ? <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={s.heroCard}>
          <GoldPulse size={72} />
          <View style={s.heroText}>
            <Text style={s.heroTitle}>🏭 Gold Factory</Text>
            <Text style={s.heroSub}>Highest Level Mining Pool</Text>
            <Text style={s.heroDesc}>
              BTNG PoW engine with Stratum V2 gateway, real SHA-256 double-hash worker,
              live blockchain dashboard, and PostgreSQL share ledger.
            </Text>
          </View>
        </View>

        {/* ── Open Dashboard ───────────────────────────────────────────────── */}
        <TouchableOpacity style={s.launchBtn} onPress={openDashboard} activeOpacity={0.88}>
          <MaterialIcons name="dashboard" size={22} color="#060608" />
          <Text style={s.launchBtnText}>Open Gold Factory Dashboard</Text>
          <MaterialIcons name="arrow-forward" size={18} color="#060608" />
        </TouchableOpacity>

        {/* ── View Leaderboard ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={s.leaderboardBtn}
          onPress={() => router.push('/btng-gold-factory-leaderboard' as any)}
          activeOpacity={0.88}
        >
          <MaterialIcons name="emoji-events" size={20} color={Colors.primary} />
          <Text style={s.leaderboardBtnText}>View Leaderboard</Text>
          <MaterialIcons name="chevron-right" size={18} color={Colors.primary} />
        </TouchableOpacity>

        {/* ── Network Status ───────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Network Status</Text>
          <StatusRow label="Stratum Gateway"  value={`${STRATUM_HOST}:${STRATUM_PORT}`} icon="dns"           color={statusColor} />
          <StatusRow label="Protocol"         value="Stratum V2 (TCP)"                  icon="cable"          color="#60A5FA"     />
          <StatusRow label="PoW Algorithm"    value="SHA-256 Double Hash"                icon="memory"         color="#D4A017"     />
          <StatusRow label="Dashboard URL"    value={DASHBOARD_URL}                      icon="web"            color="#22C55E"     />
          <StatusRow label="RPC Node"         value="72.62.160.237:7051"                 icon="router"         color="#8B5CF6"     />
          <StatusRow label="DB Share Ledger"  value="mining_shares (PostgreSQL)"         icon="storage"        color="#F59E0B"     />
          <StatusRow label="Job Refresh"      value="Every 5 seconds"                    icon="autorenew"      color={Colors.textMuted} />
        </View>

        {/* ── Engine Files ─────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Engine Files</Text>
          <View style={{ gap: Spacing.sm }}>
            <FileCard
              file="sdk/stratum-gateway.js"
              desc="Node.js Stratum V2 TCP server · BTNG PoW backend · Share recorder"
              icon="dns"
              color="#D4A017"
              cmd="DATABASE_URL=postgres://... node sdk/stratum-gateway.js"
            />
            <FileCard
              file="sdk/pow-worker.js"
              desc="Browser Web Worker · Real SHA-256 double-hash BTNG PoW engine"
              icon="memory"
              color="#8B5CF6"
            />
            <FileCard
              file="sdk/gold-factory/index.html"
              desc="Full mining dashboard · hashrate chart · live blocks · wallet balance"
              icon="dashboard"
              color="#22C55E"
              cmd="Serve via Nginx on 168.231.79.52 (HTTPS)"
            />
          </View>
        </View>

        {/* ── SQL Schema ───────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Database Schema</Text>
          <View style={s.sqlBox}>
            <Text style={s.sqlText} selectable>{`CREATE TABLE IF NOT EXISTS mining_shares (\n  id            SERIAL PRIMARY KEY,\n  miner_address TEXT,\n  nonce         BIGINT,\n  block_height  BIGINT DEFAULT 0,\n  timestamp     TIMESTAMP DEFAULT NOW()\n);`}</Text>
          </View>
          <View style={[s.schemaNote, { backgroundColor: '#22C55E10', borderColor: '#22C55E33' }]}>
            <MaterialIcons name="check-circle" size={13} color="#22C55E" />
            <Text style={[s.schemaNoteText, { color: '#22C55E' }]}>Table created in OnSpace Cloud database</Text>
          </View>
        </View>

        {/* ── Deploy Steps ─────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Deploy Steps</Text>
          {[
            { step: '1', label: 'Install dependencies',    cmd: 'npm install axios pg',                             color: '#60A5FA' },
            { step: '2', label: 'Set env vars',            cmd: 'export DATABASE_URL=postgres://...\nexport BTNG_SECRET=your_secret', color: '#F59E0B' },
            { step: '3', label: 'Start Stratum gateway',   cmd: 'node sdk/stratum-gateway.js',                      color: '#D4A017' },
            { step: '4', label: 'Serve dashboard via Nginx', cmd: 'serve sdk/gold-factory/ on port 443 (HTTPS)',     color: '#22C55E' },
            { step: '5', label: 'Open dashboard in browser', cmd: DASHBOARD_URL,                                     color: '#8B5CF6' },
          ].map(item => (
            <View key={item.step} style={[s.stepRow, { borderColor: item.color + '22' }]}>
              <View style={[s.stepNum, { backgroundColor: item.color + '20', borderColor: item.color + '44' }]}>
                <Text style={[s.stepNumText, { color: item.color }]}>{item.step}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.stepLabel}>{item.label}</Text>
                <View style={s.stepCmdBox}>
                  <Text style={[s.stepCmd, { color: item.color }]} selectable>{item.cmd}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* ── WebSocket Monitor Panel ──────────────────────────────────────── */}
        <View style={s.wsCard}>
          {/* Header */}
          <View style={s.wsHeader}>
            <View style={[s.wsHeaderIcon, { backgroundColor: '#D4A01718', borderColor: '#D4A01744' }]}>
              <Text style={{ fontSize: 18 }}>📡</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.wsTitle}>Live Stratum Monitor</Text>
              <Text style={s.wsSub}>{STRATUM_WS_URL}</Text>
            </View>
            {/* Status pill */}
            <View style={[
              s.wsPill,
              wsStatus === 'connected'    && { backgroundColor: '#22C55E18', borderColor: '#22C55E44' },
              wsStatus === 'connecting'   && { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' },
              wsStatus === 'error'        && { backgroundColor: '#EF444418', borderColor: '#EF444444' },
              wsStatus === 'disconnected' && { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
            ]}>
              <Animated.View style={[
                s.wsDot,
                { backgroundColor:
                    wsStatus === 'connected'  ? '#22C55E' :
                    wsStatus === 'connecting' ? '#F59E0B' :
                    wsStatus === 'error'      ? '#EF4444' : Colors.textMuted,
                  opacity: wsStatus === 'connected' ? wsBlinkRef : 1,
                },
              ]} />
              <Text style={[
                s.wsPillText,
                { color:
                    wsStatus === 'connected'  ? '#22C55E' :
                    wsStatus === 'connecting' ? '#F59E0B' :
                    wsStatus === 'error'      ? '#EF4444' : Colors.textMuted,
                },
              ]}>
                {wsStatus.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Connect / Disconnect buttons */}
          <View style={s.wsActionRow}>
            <TouchableOpacity
              style={[
                s.wsBtn,
                { backgroundColor: '#22C55E18', borderColor: '#22C55E44' },
                (wsStatus === 'connected' || wsStatus === 'connecting') && { opacity: 0.4 },
              ]}
              onPress={connectWs}
              disabled={wsStatus === 'connected' || wsStatus === 'connecting'}
              activeOpacity={0.85}
            >
              <MaterialIcons name="wifi-tethering" size={16} color="#22C55E" />
              <Text style={[s.wsBtnText, { color: '#22C55E' }]}>Connect</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.wsBtn,
                { backgroundColor: '#EF444418', borderColor: '#EF444444' },
                wsStatus === 'disconnected' && { opacity: 0.4 },
              ]}
              onPress={disconnectWs}
              disabled={wsStatus === 'disconnected'}
              activeOpacity={0.85}
            >
              <MaterialIcons name="wifi-off" size={16} color="#EF4444" />
              <Text style={[s.wsBtnText, { color: '#EF4444' }]}>Disconnect</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.wsBtn, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}
              onPress={() => setWsLog([])}
              activeOpacity={0.85}
            >
              <MaterialIcons name="delete-sweep" size={16} color={Colors.textMuted} />
              <Text style={[s.wsBtnText, { color: Colors.textMuted }]}>Clear</Text>
            </TouchableOpacity>
          </View>

          {/* ── Current Job Card ── */}
          {currentJob ? (
            <View style={s.jobCard}>
              <View style={s.jobCardHeader}>
                <View style={[s.jobIconWrap, { backgroundColor: '#D4A01718', borderColor: '#D4A01744' }]}>
                  <MaterialIcons name="memory" size={14} color="#D4A017" />
                </View>
                <Text style={s.jobCardTitle}>Latest Mining Job</Text>
                <View style={s.jobLiveDot}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' }} />
                </View>
                <Text style={s.jobTs}>
                  {new Date(currentJob.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </Text>
              </View>
              <JobField
                label="Block Height"
                value={currentJob.height !== null ? `#${currentJob.height.toLocaleString()}` : '—'}
                color="#D4A017"
              />
              <JobField
                label="Target"
                value={currentJob.target ?? '—'}
                color="#22C55E"
              />
              <JobField
                label="Bits"
                value={currentJob.bits ?? '—'}
                color="#60A5FA"
              />
              <JobField
                label="Version"
                value={currentJob.version !== null ? `0x${currentJob.version.toString(16).toUpperCase()}` : '—'}
                color="#8B5CF6"
              />
              <JobField
                label="Curtime"
                value={currentJob.curtime !== null
                  ? `${currentJob.curtime} · ${new Date(currentJob.curtime * 1000).toUTCString().slice(0, 22)}`
                  : '—'}
                color="#F59E0B"
              />
              <JobField
                label="Merkle Root"
                value={currentJob.merkleroot ?? '—'}
                color={Colors.textMuted}
              />
              <JobField
                label="Prev Hash"
                value={currentJob.prevHash ?? '—'}
                color={Colors.textMuted}
              />
            </View>
          ) : wsStatus === 'connected' ? (
            <View style={[s.jobCard, { alignItems: 'center', paddingVertical: Spacing.lg }]}>
              <MaterialIcons name="hourglass-empty" size={22} color={Colors.textMuted} />
              <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 6, includeFontPadding: false } as any}>
                Waiting for mining.notify from gateway…
              </Text>
            </View>
          ) : null}

          {/* ── Scrolling Log ── */}
          <View style={s.logWrap}>
            <View style={s.logHeader}>
              <MaterialIcons name="terminal" size={13} color={Colors.textMuted} />
              <Text style={s.logTitle}>Event Log</Text>
              <Text style={s.logCount}>{wsLog.length} events</Text>
            </View>
            <View style={s.logBox}>
              {wsLog.length === 0 ? (
                <Text style={s.logEmpty}>
                  {wsStatus === 'disconnected'
                    ? 'Press Connect to start monitoring…'
                    : 'Waiting for events…'}
                </Text>
              ) : (
                <FlatList
                  data={wsLog}
                  keyExtractor={item => String(item.id)}
                  renderItem={({ item }) => <LogRow item={item} />}
                  style={{ maxHeight: 220 }}
                  showsVerticalScrollIndicator={false}
                  inverted={false}
                  initialNumToRender={20}
                />
              )}
            </View>
          </View>

          {/* Footer note */}
          <View style={s.wsFooter}>
            <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
            <Text style={s.wsFooterText}>
              Connects as a monitor node · sends mining.authorize then listens for mining.notify job broadcasts
            </Text>
          </View>
        </View>

        {/* ── PM2 integration note ─────────────────────────────────────────── */}
        <View style={s.infoCard}>
          <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.infoTitle}>PM2 Integration</Text>
            <Text style={s.infoLine}>Add to sdk/ecosystem.config.js as btng-gold-factory process on port 38984.</Text>
            <Text style={s.infoLine}>Workers: sdk/stratum-gateway.js + sdk/pow-worker.js</Text>
            <Text style={s.infoLine}>Dashboard: sdk/gold-factory/index.html (static serve)</Text>
          </View>
        </View>

      </ScrollView> : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },

  topBar:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter:    { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  topSub:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, flexShrink: 0 },
  statusPillText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  scroll:       { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md },

  heroCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xxl, borderWidth: 1.5, borderColor: '#D4A01744', padding: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  heroText:     { alignItems: 'center', gap: 6 },
  heroTitle:    { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub:      { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  heroDesc:     { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 300, includeFontPadding: false },

  launchBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 16, borderRadius: Radius.xl, backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  launchBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#060608', includeFontPadding: false },
  leaderboardBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 14, borderRadius: Radius.xl, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 3 },
  leaderboardBtnText:{ fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  cardTitle:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 4 },

  sqlBox:       { backgroundColor: '#060608', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  sqlText:      { fontSize: 10, color: '#D4A017', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  schemaNote:   { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.md, padding: 9, borderWidth: 1 },
  schemaNoteText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },

  stepRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, backgroundColor: Colors.bgElevated },
  stepNum:      { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText:  { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  stepLabel:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  stepCmdBox:   { backgroundColor: '#060608', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  stepCmd:      { fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14, includeFontPadding: false },

  infoCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  infoTitle:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false, marginBottom: 2 },
  infoLine:     { fontSize: 10, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },

  // ── WebSocket Monitor Card ──────────────────────────────────────────────────
  wsCard:            { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#D4A01744', padding: Spacing.md, gap: Spacing.md },
  wsHeader:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  wsHeaderIcon:      { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  wsTitle:           { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  wsSub:             { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: 2 },
  wsPill:            { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, flexShrink: 0 },
  wsDot:             { width: 6, height: 6, borderRadius: 3 },
  wsPillText:        { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
  wsActionRow:       { flexDirection: 'row', gap: Spacing.sm },
  wsBtn:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: Radius.lg, borderWidth: 1 },
  wsBtnText:         { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Job card
  jobCard:       { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: '#D4A01733', padding: Spacing.md, gap: 2 },
  jobCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  jobIconWrap:   { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  jobCardTitle:  { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  jobLiveDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  jobTs:         { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Log
  logWrap:   { gap: Spacing.sm },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logTitle:  { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  logCount:  { fontSize: 9, color: Colors.textMuted, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border, includeFontPadding: false },
  logBox:    { backgroundColor: '#060608', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, minHeight: 60 },
  logEmpty:  { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, textAlign: 'center', paddingVertical: 12 },

  wsFooter:     { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  wsFooterText: { flex: 1, fontSize: 9, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false },

  // ── Tab Bar ────────────────────────────────────────────────────────────────
  tabBar:         { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.border, position: 'relative' },
  tabBtnActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  tabBtnTextActive:{ color: Colors.bg },
  tabLiveDot:     { width: 6, height: 6, borderRadius: 3, position: 'absolute', top: 6, right: 8 },
});
