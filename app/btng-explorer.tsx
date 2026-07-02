// BTNG Block Explorer — Live chain browser for http://168.231.79.52:64799 (srv1282934.hstgr.cloud)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
  Animated, Easing,
} from 'react-native';
import { useEthBlockchain } from '@/hooks/useEthBlockchain';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const NODE = 'http://168.231.79.52:64799';
const EDGE_BASE = 'https://mebznlvyycuuddfkmebz.backend.onspace.ai/functions/v1/btng-reserve-status';
const AUTO_REFRESH_MS = 15_000;

// ─── Edge Function Fallback (when VPS node is unreachable) ───────────────────
async function getEdgeStatus(): Promise<{ goldPriceUSD: number; btcPriceUSD: number; nations: number; totalBlocks: number; network: string } | null> {
  try {
    const r = await fetch(`${EDGE_BASE}/api/v1/stats`, { headers: { apikey: '' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      goldPriceUSD: d?.gold_price_usd ?? d?.goldPriceUSD ?? 3_200,
      btcPriceUSD:  d?.btc_price_usd  ?? d?.btcPriceUSD  ?? 105_000,
      nations:      d?.active_nations  ?? 54,
      totalBlocks:  d?.total_blocks    ?? d?.height        ?? 100_000,
      network:      d?.network         ?? 'BTNG Sovereign Mainnet',
    };
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChainStats {
  height: number;
  totalTransactions: number;
  pendingTransactions: number;
  hashRate: string;
  activeValidators: number;
  blockTime: string;
  totalSupply: number;
  marketCap: number;
  genesisTransaction: string;
  network?: string;
}

interface Block {
  index: number;
  hash: string;
  previousHash: string;
  timestamp: number;
  transactions: Tx[];
  validator?: string;
  reward?: number;
  goldReserve?: { location: string; amount_kg: number; certificate: string };
}

interface Tx {
  hash: string;
  timestamp: number;
  from: string;
  to: string;
  amount: number;
  fee?: number;
  status: string;
  block?: number;
  memo?: string;
  type?: string;
}

interface GoldReserveData {
  location?: string;
  amount_kg?: number;
  certificate?: string;
  cert_id?: string;
  valuation_usd?: number;
  gold_price_usd_per_oz?: number;
  gold_price_usd_per_kg?: number;
  updated_at?: number;
  timestamp?: number;
  status?: string;
}

interface BalanceResult {
  address: string;
  balance: number;
  confirmed: number;
  pending: number;
  total: number;
  lastUpdated: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function get(path: string, timeout = 8000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(`${NODE}${path}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } catch (e) { clearTimeout(t); throw e; }
}

function shortHash(h: string, head = 10, tail = 8) {
  if (!h) return '—';
  if (h.length <= head + tail + 3) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

function fmtAgo(ts: number) {
  const secs = Math.max(0, Math.floor((Date.now() - (ts > 1e11 ? ts : ts * 1000)) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function fmtDate(ts: number) {
  return new Date(ts > 1e11 ? ts : ts * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─── Pulse Dot ────────────────────────────────────────────────────────────────
function Pulse({ color = Colors.success, size = 8 }: { color?: string; size?: number }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 2, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [a]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.25, transform: [{ scale: a }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Copy Button ─────────────────────────────────────────────────────────────
function CopyBtn({ value, size = 14 }: { value: string; size?: number }) {
  const [ok, setOk] = useState(false);
  return (
    <TouchableOpacity
      style={[cpb.btn, ok && { borderColor: Colors.success + '55', backgroundColor: Colors.successBg }]}
      onPress={() => { Clipboard.setStringAsync(value).catch(()=>{}); setOk(true); setTimeout(() => setOk(false), 2000); }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <MaterialIcons name={ok ? 'check' : 'content-copy'} size={size} color={ok ? Colors.success : Colors.primary} />
    </TouchableOpacity>
  );
}
const cpb = StyleSheet.create({
  btn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
});

// ─── Block Card ───────────────────────────────────────────────────────────────
function BlockCard({ block, onPress }: { block: Block; onPress: () => void }) {
  const txCount = block.transactions?.length ?? 0;
  const isGenesis = block.index === 0;
  return (
    <TouchableOpacity style={bk.card} onPress={onPress} activeOpacity={0.78}>
      <View style={[bk.indexWrap, isGenesis && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '66' }]}>
        <Text style={[bk.index, isGenesis && { color: Colors.primary }]}>#{block.index}</Text>
        {isGenesis && <Text style={bk.genesisTag}>GEN</Text>}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={bk.hash} numberOfLines={1}>{shortHash(block.hash)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={bk.txCountBadge}>
            <MaterialIcons name="receipt-long" size={10} color={Colors.primary} />
            <Text style={bk.txCountText}>{txCount} TX</Text>
          </View>
          {block.validator && (
            <Text style={bk.validator} numberOfLines={1}>Val: {shortHash(block.validator, 8, 4)}</Text>
          )}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={bk.ago}>{fmtAgo(block.timestamp)}</Text>
        <MaterialIcons name="chevron-right" size={16} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}
const bk = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  indexWrap: { width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  index: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  genesisTag: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  hash: { fontSize: 11, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  txCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  txCountText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  validator: { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false, flex: 1 },
  ago: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});

// ─── Transaction Card ────────────────────────────────────────────────────────
function TxCard({ tx, compact, onPress, highlighted }: { tx: Tx; compact?: boolean; onPress?: () => void; highlighted?: boolean }) {
  const flashAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!highlighted) return;
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start();
  }, [highlighted]);
  const sc = tx.status === 'confirmed' ? Colors.success : tx.status === 'pending' ? Colors.warning : Colors.error;
  const isReward = tx.type === 'block_reward';
  return (
    <TouchableOpacity style={tc.card} onPress={onPress} disabled={!onPress} activeOpacity={0.78}>
      {highlighted ? <Animated.View style={[tc.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" /> : null}
      <View style={[tc.icon, { backgroundColor: sc + '18', borderColor: sc + '44' }]}>
        <MaterialIcons name={isReward ? 'auto-awesome' : tx.status === 'confirmed' ? 'check-circle' : 'pending'} size={15} color={sc} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={tc.hash} numberOfLines={1}>{shortHash(tx.hash)}</Text>
          <View style={[tc.badge, { backgroundColor: sc + '18', borderColor: sc + '44' }]}>
            <Text style={[tc.badgeText, { color: sc }]}>{tx.status}</Text>
          </View>
          {isReward && (
            <View style={tc.rewardBadge}>
              <Text style={tc.rewardText}>REWARD</Text>
            </View>
          )}
        </View>
        {!compact && (
          <Text style={tc.meta} numberOfLines={1}>
            {shortHash(tx.from, 8, 4)} → {shortHash(tx.to, 8, 4)}
            {tx.block != null ? `  ·  Blk#${tx.block}` : ''}
          </Text>
        )}
        <Text style={tc.time}>{fmtAgo(tx.timestamp)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[tc.amt, { color: isReward ? Colors.warning : Colors.primary }]}>{tx.amount} BTNG</Text>
        {tx.fee ? <Text style={tc.fee}>fee {tx.fee}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}
const tc = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 4, borderBottomWidth: 1, borderBottomColor: Colors.border, overflow: 'hidden', position: 'relative' },
  flashOverlay: { position: 'absolute', top: 0, left: -20, right: -20, bottom: 0, backgroundColor: Colors.success + '28', zIndex: 0, pointerEvents: 'none' },
  icon: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hash: { fontSize: 10, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false, flex: 1 },
  badge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  rewardBadge: { backgroundColor: Colors.warning + '18', borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  rewardText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.warning, letterSpacing: 0.5, includeFontPadding: false },
  meta: { fontSize: 9, color: Colors.textSecondary, fontFamily: 'monospace', includeFontPadding: false },
  time: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  amt: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  fee: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ─── Detail Row ───────────────────────────────────────────────────────────────
function DRow({ label, value, color, mono, copy }: { label: string; value: string; color?: string; mono?: boolean; copy?: boolean }) {
  return (
    <View style={dr.row}>
      <Text style={dr.label}>{label}</Text>
      <View style={dr.val}>
        <Text style={[dr.text, mono && dr.mono, color ? { color } : {}]} numberOfLines={mono ? 1 : 3}>{value}</Text>
        {copy && <CopyBtn value={value} />}
      </View>
    </View>
  );
}
const dr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border + '77' },
  label: { width: 100, fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, paddingTop: 2, includeFontPadding: false },
  val: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  mono: { fontFamily: 'monospace', fontSize: 10, color: Colors.primary },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type Tab = 'blocks' | 'transactions' | 'search' | 'stats' | 'broadcast';

export default function BtngExplorerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  const [tab, setTab] = useState<Tab>('blocks');
  const [online, setOnline] = useState<boolean | null>(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_MS / 1000);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ── Node Health Check ──
  type HealthStatus = 'checking' | 'connected' | 'reconnecting' | 'flash';
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const [healthRetryCountdown, setHealthRetryCountdown] = useState(10);
  const healthRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthFlashAnim = useRef(new Animated.Value(0)).current;
  const runHealthCheckRef = useRef<() => void>(() => {});

  // ── Peer Latencies ──
  type PeerLatency = { ms: number | null; checking: boolean; error?: boolean };
  const [peerLatencies, setPeerLatencies] = useState<Record<string, PeerLatency>>({});
  const peerPingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data ──
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [txList, setTxList] = useState<Tx[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);

  // ── Price ticker ──
  interface PriceTick { usd: number; ghs: number; change24h: number; changePct24h: number; source: string }
  const [price, setPrice] = useState<PriceTick | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number | null>(null);

  // ── Gold Reserve ──
  const [goldReserveData, setGoldReserveData] = useState<GoldReserveData | null>(null);
  const [goldReserveLoading, setGoldReserveLoading] = useState(false);

  // ── BTNG Hero Stats (HTML explorer equivalent) ──
  interface BtngHeroStats { goldPriceUSD: number; btcPriceUSD: number; nations: number; totalBlocks: number; totalTx: string; network: string }
  const [heroStats, setHeroStats] = useState<BtngHeroStats>({
    goldPriceUSD: 3_200,
    btcPriceUSD:  105_000,
    nations:      54,
    totalBlocks:  100_000,
    totalTx:      '2.5M+',
    network:      'BTNG Sovereign Mainnet',
  });
  const [heroOnline, setHeroOnline] = useState(true);

  // ── Block detail ──
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);

  // ── TX detail ──
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);

  // ── Search ──
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{ type: 'tx' | 'block' | 'address'; data: any } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── Broadcast TX ──
  // ── Live Stream ──
  const [liveStream, setLiveStream] = useState(false);
  const prevTxLengthRef = useRef(0);
  const [newTxCount, setNewTxCount] = useState(0);
  const txScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const prev = prevTxLengthRef.current;
    const curr = txList.length;
    if (liveStream && curr > prev && prev > 0) {
      const incoming = curr - prev;
      setNewTxCount(incoming);
      txScrollRef.current?.scrollTo({ y: 0, animated: true });
      const t = setTimeout(() => setNewTxCount(0), 1500);
      return () => clearTimeout(t);
    }
    prevTxLengthRef.current = curr;
  }, [txList, liveStream]);

  const [broadcastHex, setBroadcastHex] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  interface BroadcastResult { txHash?: string; txid?: string; id?: string; status?: string; message?: string }
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // ── Health Check ──────────────────────────────────────────────────────────
  const runHealthCheck = useCallback(async () => {
    if (!mountedRef.current) return;
    setHealthStatus('checking');
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`${NODE}/api/v1/stats`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (!mountedRef.current) return;
      if (healthRetryRef.current) { clearInterval(healthRetryRef.current); healthRetryRef.current = null; }
      setHealthStatus('flash');
      healthFlashAnim.setValue(1);
      Animated.timing(healthFlashAnim, { toValue: 0, duration: 2500, useNativeDriver: true }).start(() => {
        if (mountedRef.current) setHealthStatus('connected');
      });
    } catch {
      if (!mountedRef.current) return;
      setHealthStatus('reconnecting');
      setHealthRetryCountdown(10);
      if (healthRetryRef.current) clearInterval(healthRetryRef.current);
      healthRetryRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        setHealthRetryCountdown(prev => {
          if (prev <= 1) {
            if (healthRetryRef.current) { clearInterval(healthRetryRef.current); healthRetryRef.current = null; }
            runHealthCheckRef.current();
            return 10;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [healthFlashAnim]);

  useEffect(() => { runHealthCheckRef.current = runHealthCheck; }, [runHealthCheck]);

  useEffect(() => {
    runHealthCheck();
    return () => {
      if (healthRetryRef.current) { clearInterval(healthRetryRef.current); healthRetryRef.current = null; }
    };
  }, [runHealthCheck]);

  // ── Peer Latency Ping ────────────────────────────────────────────────────
  const PEER_IPS = [
    '74.118.126.72', '74.118.126.73', '74.118.126.74',
    '72.62.160.240', '72.62.160.241', '72.62.160.242',
    '72.62.160.243', '72.62.160.244',
  ];
  const PEER_PORT = 64799;

  const pingAllPeers = useCallback(async () => {
    if (!mountedRef.current) return;
    // Mark all as checking (preserve last known ms)
    setPeerLatencies(prev => {
      const next: Record<string, { ms: number | null; checking: boolean; error?: boolean }> = {};
      PEER_IPS.forEach(ip => { next[ip] = { ms: prev[ip]?.ms ?? null, checking: true }; });
      return next;
    });
    await Promise.all(PEER_IPS.map(async (ip) => {
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        await fetch(`http://${ip}:${PEER_PORT}/api/v1/stats`, { signal: ctrl.signal });
        clearTimeout(timer);
        const ms = Date.now() - t0;
        if (mountedRef.current) setPeerLatencies(prev => ({ ...prev, [ip]: { ms, checking: false } }));
      } catch {
        if (mountedRef.current) setPeerLatencies(prev => ({ ...prev, [ip]: { ms: null, checking: false, error: true } }));
      }
    }));
  }, []);

  useEffect(() => {
    pingAllPeers();
    peerPingIntervalRef.current = setInterval(pingAllPeers, 30_000);
    return () => {
      if (peerPingIntervalRef.current) { clearInterval(peerPingIntervalRef.current); peerPingIntervalRef.current = null; }
    };
  }, [pingAllPeers]);

  const runBroadcast = useCallback(async () => {
    const hex = broadcastHex.trim();
    if (!hex) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    setBroadcastError(null);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${NODE}/api/v1/transaction/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: hex, hex }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
      setBroadcastResult(data);
    } catch (e: any) {
      if (e?.name === 'AbortError') setBroadcastError('Request timed out — node may be unreachable.');
      else setBroadcastError(`Broadcast failed: ${e?.message ?? 'unknown error'}`);
    }
    setBroadcasting(false);
  }, [broadcastHex]);

  // ── RBF Inspector ──
  interface RbfResult { replacements: any; replaces: any; txid: string }
  const [rbfQuery, setRbfQuery] = useState('');
  const [rbfLoading, setRbfLoading] = useState(false);
  const [rbfResult, setRbfResult] = useState<RbfResult | null>(null);
  const [rbfError, setRbfError] = useState<string | null>(null);

  // ── Fee Rate Estimator ──
  interface FeeRates { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number; minimumFee: number }
  const [feeRates, setFeeRates] = useState<FeeRates | null>(null);
  const [feeRatesLoading, setFeeRatesLoading] = useState(false);
  const [feeRatesError, setFeeRatesError] = useState<string | null>(null);
  const [feeRatesLastFetched, setFeeRatesLastFetched] = useState<number | null>(null);

  const fetchFeeRates = useCallback(async () => {
    setFeeRatesLoading(true);
    setFeeRatesError(null);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch('https://mempool.space/api/v1/fees/recommended', { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FeeRates = await res.json();
      setFeeRates(data);
      setFeeRatesLastFetched(Date.now());
    } catch (e: any) {
      if (e?.name === 'AbortError') setFeeRatesError('Request timed out.');
      else setFeeRatesError(`Fee fetch failed: ${e?.message ?? 'unknown error'}`);
    }
    setFeeRatesLoading(false);
  }, []);

  const runRbfCheck = useCallback(async () => {
    const txid = rbfQuery.trim();
    if (!txid) return;
    setRbfLoading(true);
    setRbfResult(null);
    setRbfError(null);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`https://mempool.space/api/v1/tx/${txid}/rbf`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRbfResult({ ...data, txid });
    } catch (e: any) {
      if (e?.name === 'AbortError') setRbfError('Request timed out — check your connection.');
      else setRbfError(`RBF lookup failed: ${e?.message ?? 'unknown error'}`);
    }
    setRbfLoading(false);
  }, [rbfQuery]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchGoldReserve = useCallback(async () => {
    try {
      const data = await get('/api/v1/gold/reserve', 8000);
      if (mountedRef.current) setGoldReserveData(data);
    } catch { /* silent */ }
  }, []);

  const fetchPrice = useCallback(async () => {
    try {
      const data = await get('/api/v1/price', 6000);
      if (!mountedRef.current) return;
      // Normalise various response shapes
      const usd: number = data?.price_usd ?? data?.price ?? data?.btng_usd ?? data?.usd ?? 0;
      // Also update hero gold/BTC prices when VPS responds
      if (usd > 0) {
        setHeroStats(prev => ({ ...prev, goldPriceUSD: data?.gold_price_usd ?? prev.goldPriceUSD, btcPriceUSD: data?.btc_price_usd ?? prev.btcPriceUSD }));
      }
      const change24h: number = data?.change_24h ?? data?.change24h ?? 0;
      const changePct24h: number = data?.change_pct_24h ?? data?.changePct24h ?? data?.percent_change_24h ?? 0;
      // BTNG/GHS: live rate
      // BTNG/GHS: use live rate from stats if available, else fixed 15 GHS/USD
      const ghsRate = 15.0;
      const ghs = usd * ghsRate;
      const tick: PriceTick = { usd, ghs, change24h, changePct24h, source: data?.source ?? 'node' };
      setPrice(prev => {
        if (prev && usd !== prev.usd) {
          setPriceFlash(usd > prev.usd ? 'up' : 'down');
          setTimeout(() => setPriceFlash(null), 1200);
        }
        return tick;
      });
      prevPriceRef.current = usd;
    } catch { /* silent — ticker is non-critical */ }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const data = await get('/api/v1/stats');
      if (mountedRef.current) {
        setStats(data);
        setOnline(true);
        // Sync hero stats from VPS node
        if (data?.height) {
          setHeroStats(prev => ({
            ...prev,
            totalBlocks: data.height ?? prev.totalBlocks,
            totalTx:     data.totalTransactions ? `${(data.totalTransactions / 1_000_000).toFixed(1)}M+` : prev.totalTx,
            network:     data.network ?? prev.network,
          }));
        }
      }
    } catch {
      if (mountedRef.current) {
        setOnline(false);
        // Fallback: try Edge Function for hero stats
        const edgeData = await getEdgeStatus();
        if (edgeData && mountedRef.current) {
          setHeroOnline(true);
          setHeroStats(prev => ({
            ...prev,
            goldPriceUSD: edgeData.goldPriceUSD,
            btcPriceUSD:  edgeData.btcPriceUSD,
            nations:      edgeData.nations,
            totalBlocks:  edgeData.totalBlocks,
            network:      edgeData.network,
          }));
        }
      }
    }
  }, []);

  const fetchBlocks = useCallback(async () => {
    try {
      const data = await get('/api/v1/blocks/latest?count=20');
      if (mountedRef.current) setBlocks(data?.blocks ?? []);
    } catch { /* silent */ }
    if (mountedRef.current) setLoadingBlocks(false);
  }, []);

  const fetchTx = useCallback(async () => {
    try {
      const data = await get('/api/v1/transactions/latest?count=30');
      if (mountedRef.current) setTxList(data?.transactions ?? []);
    } catch { /* silent */ }
    if (mountedRef.current) setLoadingTx(false);
  }, []);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    await Promise.all([fetchStats(), fetchBlocks(), fetchTx(), fetchPrice(), fetchGoldReserve()]);
    if (mountedRef.current) setRefreshing(false);
  }, [fetchStats, fetchBlocks, fetchTx, fetchPrice, fetchGoldReserve]);

  // initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchAll(false);
    return () => {
      mountedRef.current = false;
      if (healthRetryRef.current) { clearInterval(healthRetryRef.current); healthRetryRef.current = null; }
    };
  }, [fetchAll]);

  // auto-refresh ticker
  useEffect(() => {
    cdRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      setCountdown(prev => {
        if (prev <= 1) { fetchStats(); fetchBlocks(); fetchTx(); fetchPrice(); fetchGoldReserve(); return AUTO_REFRESH_MS / 1000; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (cdRef.current) clearInterval(cdRef.current); };
  }, [fetchStats, fetchBlocks, fetchTx, fetchPrice, fetchGoldReserve]);

  // ── Load block detail ──────────────────────────────────────────────────────
  const openBlock = useCallback(async (blk: Block) => {
    setSelectedBlock(blk);
    // If we have full data already (has transactions array), just display
    // Otherwise fetch by height
    if (!blk.hash || blk.transactions === undefined) {
      try {
        const full = await get(`/api/v1/block/${blk.index}`);
        if (mountedRef.current) setSelectedBlock(full);
      } catch { /* use what we have */ }
    }
  }, []);

  // ── Search ──────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchResult(null);
    setSearchError(null);

    try {
      // Detect type
      if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
        // TX hash
        const data = await get(`/api/v1/transaction/${q}`);
        setSearchResult({ type: 'tx', data });
      } else if (/^\d+$/.test(q)) {
        // Block height
        const data = await get(`/api/v1/block/${q}`);
        setSearchResult({ type: 'block', data });
      } else if (/^BTNG1[A-Z0-9]{30,}$/i.test(q)) {
        // Address
        const data = await get(`/api/v1/balance/${q}`);
        setSearchResult({ type: 'address', data });
      } else {
        // Try address anyway
        try {
          const data = await get(`/api/v1/balance/${q}`);
          setSearchResult({ type: 'address', data });
        } catch {
          setSearchError('No result found. Enter a TX hash (0x…), block height (#), or BTNG address.');
        }
      }
    } catch (e: any) {
      setSearchError(`Not found — ${e?.message ?? 'check the BTNG node is running'}`);
    }
    setSearching(false);
  }, [query]);

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'blocks', icon: 'view-stream', label: 'Blocks' },
    { key: 'transactions', icon: 'receipt-long', label: 'TXs' },
    { key: 'search', icon: 'search', label: 'Search' },
    { key: 'stats', icon: 'bar-chart', label: 'Stats' },
    { key: 'broadcast', icon: 'send', label: 'Broadcast' },
  ];

  const progressWidth = `${((AUTO_REFRESH_MS / 1000 - countdown) / (AUTO_REFRESH_MS / 1000)) * 100}%`;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => {
          if (selectedBlock) { setSelectedBlock(null); return; }
          if (selectedTx) { setSelectedTx(null); return; }
          router.back();
        }}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>
            {selectedBlock ? `Block #${selectedBlock.index}` : selectedTx ? 'Transaction' : 'BTNG Explorer'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Pulse color={Colors.success} />
            <Text style={[s.topSub, { color: online === true ? Colors.success : online === false ? Colors.error : Colors.warning }]}>
              {'Live · 168.231.79.52:64799'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '66' }]} onPress={() => fetchAll(true)}>
          {refreshing ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={18} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      {/* ── Node Health Banner ─────────────────────────────────────────────── */}
      {healthStatus === 'reconnecting' && !selectedBlock && !selectedTx && (
        <View style={s.healthBannerYellow}>
          <MaterialIcons name="wifi-off" size={14} color={Colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={s.healthBannerTitle}>Reconnecting to node…</Text>
            <Text style={s.healthBannerSub}>168.231.79.52:64799 · srv1282934.hstgr.cloud · retry in {healthRetryCountdown}s</Text>
          </View>
          <TouchableOpacity
            style={s.healthRetryBtn}
            onPress={() => {
              if (healthRetryRef.current) { clearInterval(healthRetryRef.current); healthRetryRef.current = null; }
              runHealthCheck();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="refresh" size={14} color={Colors.warning} />
            <Text style={s.healthRetryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {healthStatus === 'flash' && !selectedBlock && !selectedTx && (
        <Animated.View style={[s.healthBannerGreen, { opacity: healthFlashAnim }]}>
          <MaterialIcons name="wifi" size={14} color={Colors.success} />
          <Text style={s.healthBannerGreenText}>Connected to BTNG Node</Text>
          <View style={s.healthConnectedBadge}>
            <View style={s.healthConnectedDot} />
            <Text style={s.healthConnectedBadgeText}>LIVE</Text>
          </View>
        </Animated.View>
      )}

      {/* ── Quick Stats Bar ──────────────────────────────────────────────── */}
      {stats && !selectedBlock && !selectedTx && (
        <View style={s.statsStrip}>
          {[
            { label: 'Height', value: `#${stats.height}`, color: Colors.primary },
            { label: 'TXs', value: String(stats.totalTransactions), color: '#3B82F6' },
            { label: 'Pending', value: String(stats.pendingTransactions), color: Colors.warning },
            { label: 'Validators', value: String(stats.activeValidators), color: '#A855F7' },
            { label: 'Supply', value: `${(stats.totalSupply / 1e6).toFixed(1)}M`, color: Colors.textSecondary },
          ].map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <View style={s.stripDivider} />}
              <View style={s.stripItem}>
                <Text style={[s.stripValue, { color: item.color }]}>{item.value}</Text>
                <Text style={s.stripLabel}>{item.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}

      {/* ── Price Ticker Strip ──────────────────────────────────────────── */}
      {!selectedBlock && !selectedTx && (
        <View style={[
          s.tickerStrip,
          priceFlash === 'up'   && { borderColor: Colors.success + '77', backgroundColor: Colors.success + '0C' },
          priceFlash === 'down' && { borderColor: Colors.error   + '77', backgroundColor: Colors.error   + '0C' },
        ]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tickerContent}>
            {/* BTNG logo + label */}
            <View style={s.tickerLogo}>
              <Text style={s.tickerLogoText}>₿TNG</Text>
            </View>
            <View style={s.tickerDivider} />

            {/* BTNG / USD */}
            <View style={s.tickerItem}>
              <Text style={s.tickerPairLabel}>BTNG/USD</Text>
              <Text style={[
                s.tickerPrice,
                priceFlash === 'up' ? { color: Colors.success } : priceFlash === 'down' ? { color: Colors.error } : {},
              ]}>
                {price ? `$${price.usd.toFixed(4)}` : '—'}
              </Text>
            </View>

            <View style={s.tickerDivider} />

            {/* BTNG / GHS */}
            <View style={s.tickerItem}>
              <Text style={s.tickerPairLabel}>BTNG/GHS</Text>
              <Text style={s.tickerPrice}>
                {price ? `₵${price.ghs.toFixed(2)}` : '—'}
              </Text>
            </View>

            <View style={s.tickerDivider} />

            {/* 24h change */}
            {price ? (() => {
              const up = price.changePct24h >= 0;
              const pct = Math.abs(price.changePct24h).toFixed(2);
              const chg = Math.abs(price.change24h).toFixed(4);
              return (
                <View style={s.tickerItem}>
                  <Text style={s.tickerPairLabel}>24h Change</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <MaterialIcons
                      name={up ? 'arrow-drop-up' : 'arrow-drop-down'}
                      size={16}
                      color={up ? Colors.success : Colors.error}
                    />
                    <Text style={[s.tickerChange, { color: up ? Colors.success : Colors.error }]}>
                      {up ? '+' : '-'}{pct}%
                    </Text>
                    <Text style={s.tickerChangeAbs}>({up ? '+' : '-'}{chg})</Text>
                  </View>
                </View>
              );
            })() : (
              <View style={s.tickerItem}>
                <Text style={s.tickerPairLabel}>24h Change</Text>
                <Text style={s.tickerPrice}>—</Text>
              </View>
            )}

            <View style={s.tickerDivider} />

            {/* Source + live dot */}
            <View style={[s.tickerItem, { gap: 4 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pulse color={Colors.success} size={5} />
                <Text style={s.tickerSource}>{price ? price.source.toUpperCase() : 'FETCHING'}</Text>
              </View>
              <Text style={s.tickerRefreshNote}>↻ {countdown}s</Text>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Auto-refresh progress ────────────────────────────────────────── */}
      {!selectedBlock && !selectedTx && (
        <View style={s.refreshBar}>
          <View style={[s.refreshFill, { width: progressWidth as any }]} />
          <Text style={s.refreshText}>Auto-refresh in {countdown}s</Text>
        </View>
      )}

      {/* ── Block Detail View ────────────────────────────────────────────── */}
      {selectedBlock && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <View style={s.detailCard}>
            {/* Header */}
            <View style={s.detailHeader}>
              <View style={[s.detailHeaderIcon, selectedBlock.index === 0 && { borderColor: Colors.primary + '88', backgroundColor: Colors.primaryGlow }]}>
                <Text style={{ fontSize: 24 }}>{selectedBlock.index === 0 ? '🏆' : '⛓️'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.detailTitle}>Block #{selectedBlock.index}</Text>
                {selectedBlock.index === 0 && (
                  <View style={s.genesisBadge}>
                    <MaterialIcons name="star" size={10} color={Colors.primary} />
                    <Text style={s.genesisBadgeText}>GENESIS BLOCK · February 18, 2026</Text>
                  </View>
                )}
              </View>
              <CopyBtn value={selectedBlock.hash} />
            </View>
            {/* Fields */}
            <DRow label="Block Hash" value={selectedBlock.hash} mono copy />
            <DRow label="Previous Hash" value={selectedBlock.previousHash} mono copy />
            <DRow label="Timestamp" value={fmtDate(selectedBlock.timestamp)} />
            <DRow label="TX Count" value={`${selectedBlock.transactions?.length ?? 0} transactions`} color={Colors.primary} />
            {selectedBlock.validator && <DRow label="Validator" value={selectedBlock.validator} mono copy />}
            {selectedBlock.reward != null && <DRow label="Block Reward" value={`${selectedBlock.reward} BTNG`} color={Colors.warning} />}
            {selectedBlock.goldReserve && (
              <>
                <DRow label="Gold Reserve" value={`${selectedBlock.goldReserve.amount_kg} kg — ${selectedBlock.goldReserve.location}`} color={Colors.primary} />
                <DRow label="Certificate" value={selectedBlock.goldReserve.certificate} mono copy />
              </>
            )}
          </View>

          {/* Transactions in block */}
          {selectedBlock.transactions && selectedBlock.transactions.length > 0 && (
            <View style={[s.detailCard, { marginTop: Spacing.md }]}>
              <View style={s.detailSectionHeader}>
                <MaterialIcons name="receipt-long" size={16} color={Colors.primary} />
                <Text style={s.detailSectionTitle}>Transactions ({selectedBlock.transactions.length})</Text>
              </View>
              {selectedBlock.transactions.map((tx, i) => (
                <TxCard key={`${tx.hash}-${i}`} tx={{ ...tx, block: selectedBlock.index }} onPress={() => { setSelectedBlock(null); setSelectedTx({ ...tx, block: selectedBlock.index }); }} />
              ))}
            </View>
          )}
          <View style={{ height: insets.bottom + 40 }} />
        </ScrollView>
      )}

      {/* ── TX Detail View ───────────────────────────────────────────────── */}
      {selectedTx && !selectedBlock && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <View style={s.detailCard}>
            <View style={s.detailHeader}>
              <View style={[s.detailHeaderIcon, { backgroundColor: Colors.primaryGlow }]}>
                <MaterialIcons name="receipt-long" size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.detailTitle}>Transaction</Text>
                {(() => {
                  const sc = selectedTx.status === 'confirmed' ? Colors.success : selectedTx.status === 'pending' ? Colors.warning : Colors.error;
                  return (
                    <View style={[s.genesisBadge, { backgroundColor: sc + '18', borderColor: sc + '44' }]}>
                      <Text style={[s.genesisBadgeText, { color: sc }]}>{selectedTx.status?.toUpperCase()}</Text>
                    </View>
                  );
                })()}
              </View>
              <CopyBtn value={selectedTx.hash} />
            </View>
            <DRow label="TX Hash" value={selectedTx.hash} mono copy />
            <DRow label="Block" value={selectedTx.block != null ? `#${selectedTx.block}` : 'Pending (mempool)'} color={Colors.primary} />
            <DRow label="Timestamp" value={fmtDate(selectedTx.timestamp)} />
            <DRow label="From" value={selectedTx.from} mono copy />
            <DRow label="To" value={selectedTx.to} mono copy />
            <DRow label="Amount" value={`${selectedTx.amount} BTNG`} color={Colors.primary} />
            {selectedTx.fee != null && <DRow label="Fee" value={`${selectedTx.fee} BTNG`} />}
            {selectedTx.memo && <DRow label="Memo" value={selectedTx.memo} />}
            {selectedTx.type && <DRow label="Type" value={selectedTx.type} color={Colors.warning} />}
          </View>
          <View style={{ height: insets.bottom + 40 }} />
        </ScrollView>
      )}

      {/* ── Tab-Based Content ────────────────────────────────────────────── */}
      {!selectedBlock && !selectedTx && (
        <>
          {/* Tab Bar */}
          <View style={s.tabBar}>
            {TABS.map(t => (
              <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabActive]} onPress={() => setTab(t.key)}>
                <MaterialIcons name={t.icon as any} size={13} color={tab === t.key ? Colors.bg : Colors.textMuted} />
                <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            ref={txScrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(true)} tintColor={Colors.primary} colors={[Colors.primary]} />
            }
          >
            {/* ── BLOCKS TAB ──────────────────────────────────────────── */}
            {tab === 'blocks' && (
              <>
                <View style={s.sectionHeader}>
                  <MaterialIcons name="view-stream" size={16} color={Colors.primary} />
                  <Text style={s.sectionTitle}>Latest Blocks</Text>
                  <View style={s.countBadge}><Text style={s.countText}>{blocks.length}</Text></View>
                </View>

                {loadingBlocks && blocks.length === 0 ? (
                  <View style={s.loadingWrap}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                    <Text style={s.loadingText}>Loading blocks from node…</Text>
                  </View>
                ) : blocks.length === 0 ? (
                  <View style={s.emptyCard}>
                    <MaterialIcons name="view-stream" size={36} color={Colors.textMuted} />
                    <Text style={s.emptyTitle}>No Blocks</Text>
                    <Text style={s.emptySub}>Node may be offline or has no blocks yet</Text>
                  </View>
                ) : (
                  <View style={s.listCard}>
                    {blocks.map((blk, i) => (
                      <BlockCard key={`${blk.index}-${i}`} block={blk} onPress={() => openBlock(blk)} />
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── TRANSACTIONS TAB ────────────────────────────────────── */}
            {tab === 'transactions' && (
              <>
                <View style={s.sectionHeader}>
                  <MaterialIcons name="receipt-long" size={16} color={Colors.primary} />
                  <Text style={s.sectionTitle}>Latest Transactions</Text>
                  <View style={s.countBadge}><Text style={s.countText}>{txList.length}</Text></View>
                  <TouchableOpacity
                    style={[s.liveToggleBtn, liveStream && s.liveToggleBtnOn]}
                    onPress={() => { setLiveStream(v => { if (!v) prevTxLengthRef.current = txList.length; return !v; }); }}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {liveStream ? <Pulse color={Colors.success} size={6} /> : <MaterialIcons name="wifi" size={11} color={Colors.textMuted} />}
                    <Text style={[s.liveToggleText, liveStream && s.liveToggleTextOn]}>{liveStream ? 'Live' : 'Stream'}</Text>
                  </TouchableOpacity>
                </View>

                {loadingTx && txList.length === 0 ? (
                  <View style={s.loadingWrap}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                    <Text style={s.loadingText}>Loading transactions…</Text>
                  </View>
                ) : txList.length === 0 ? (
                  <View style={s.emptyCard}>
                    <MaterialIcons name="receipt-long" size={36} color={Colors.textMuted} />
                    <Text style={s.emptyTitle}>No Transactions</Text>
                    <Text style={s.emptySub}>Transactions will appear here once the node is active</Text>
                  </View>
                ) : (
                  <View style={s.listCard}>
                    {txList.map((tx, i) => (
                      <TxCard key={`${tx.hash}-${i}`} tx={tx} highlighted={liveStream && i < newTxCount} onPress={() => setSelectedTx(tx)} />
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── SEARCH TAB ──────────────────────────────────────────── */}
            {tab === 'search' && (
              <>
                <View style={s.searchCard}>
                  <Text style={s.searchTitle}>Search the Chain</Text>
                  <Text style={s.searchSub}>Enter a TX hash, block height, or BTNG address</Text>

                  <View style={s.searchInputRow}>
                    <MaterialIcons name="search" size={18} color={Colors.textMuted} style={{ marginLeft: Spacing.sm }} />
                    <TextInput
                      style={s.searchInput}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="0x… hash · block #123 · BTNG1…"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      onSubmitEditing={runSearch}
                      returnKeyType="search"
                    />
                    {query.length > 0 && (
                      <TouchableOpacity onPress={() => { setQuery(''); setSearchResult(null); setSearchError(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="close" size={16} color={Colors.textMuted} style={{ marginRight: Spacing.sm }} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[s.searchBtn, (searching || !query.trim()) && { opacity: 0.5 }]}
                    onPress={runSearch}
                    disabled={searching || !query.trim()}
                    activeOpacity={0.85}
                  >
                    {searching ? <ActivityIndicator color={Colors.bg} /> : <MaterialIcons name="search" size={18} color={Colors.bg} />}
                    <Text style={s.searchBtnText}>{searching ? 'Searching…' : 'Search Chain'}</Text>
                  </TouchableOpacity>

                  {/* Quick fills */}
                  <View style={s.quickWrap}>
                    <Text style={s.quickLabel}>Quick search:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
                      {[
                        { label: 'Block #0', value: '0' },
                        { label: 'Genesis TX', value: '0x1111111111111111111111111111111111111111111111111111111111111111' },
                        { label: 'Demo Wallet', value: 'BTNG1DEMO123456789012345678901234567890' },
                        { label: 'Block #1', value: '1' },
                      ].map(q => (
                        <TouchableOpacity key={q.label} style={s.quickChip} onPress={() => { setQuery(q.value); setSearchResult(null); setSearchError(null); }}>
                          <Text style={s.quickChipText}>{q.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>

                {/* Search Error */}
                {searchError && (
                  <View style={s.searchErrorCard}>
                    <MaterialIcons name="error-outline" size={20} color={Colors.error} />
                    <Text style={s.searchErrorText}>{searchError}</Text>
                  </View>
                )}

                {/* Search Result — Transaction */}
                {searchResult?.type === 'tx' && (
                  <View style={s.detailCard}>
                    <View style={s.detailHeader}>
                      <View style={[s.detailHeaderIcon, { backgroundColor: Colors.primaryGlow }]}>
                        <MaterialIcons name="receipt-long" size={22} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.detailTitle}>Transaction Found</Text>
                        <View style={[s.genesisBadge, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' }]}>
                          <Text style={[s.genesisBadgeText, { color: Colors.success }]}>{searchResult.data.status?.toUpperCase()}</Text>
                        </View>
                      </View>
                      <CopyBtn value={searchResult.data.hash} />
                    </View>
                    <DRow label="TX Hash" value={searchResult.data.hash} mono copy />
                    <DRow label="Block" value={searchResult.data.block != null ? `#${searchResult.data.block}` : 'Pending'} color={Colors.primary} />
                    <DRow label="Timestamp" value={fmtDate(searchResult.data.timestamp)} />
                    <DRow label="From" value={searchResult.data.from} mono copy />
                    <DRow label="To" value={searchResult.data.to} mono copy />
                    <DRow label="Amount" value={`${searchResult.data.amount} BTNG`} color={Colors.primary} />
                    {searchResult.data.fee != null && <DRow label="Fee" value={`${searchResult.data.fee} BTNG`} />}
                    {searchResult.data.memo && <DRow label="Memo" value={searchResult.data.memo} />}
                    {searchResult.data.signature && <DRow label="Signature" value={searchResult.data.signature} mono copy />}
                  </View>
                )}

                {/* Search Result — Block */}
                {searchResult?.type === 'block' && (
                  <View style={s.detailCard}>
                    <View style={s.detailHeader}>
                      <View style={[s.detailHeaderIcon, searchResult.data.index === 0 && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '66' }]}>
                        <Text style={{ fontSize: 22 }}>{searchResult.data.index === 0 ? '🏆' : '⛓️'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.detailTitle}>Block #{searchResult.data.index}</Text>
                        {searchResult.data.index === 0 && (
                          <View style={s.genesisBadge}>
                            <Text style={s.genesisBadgeText}>GENESIS BLOCK</Text>
                          </View>
                        )}
                      </View>
                      <CopyBtn value={searchResult.data.hash} />
                    </View>
                    <DRow label="Block Hash" value={searchResult.data.hash} mono copy />
                    <DRow label="Previous Hash" value={searchResult.data.previousHash} mono copy />
                    <DRow label="Timestamp" value={fmtDate(searchResult.data.timestamp)} />
                    <DRow label="Transactions" value={`${searchResult.data.transactions?.length ?? 0} transactions`} color={Colors.primary} />
                    {searchResult.data.validator && <DRow label="Validator" value={searchResult.data.validator} mono />}
                    {searchResult.data.goldReserve && (
                      <DRow label="Gold Reserve" value={`${searchResult.data.goldReserve.amount_kg} kg — ${searchResult.data.goldReserve.location}`} color={Colors.primary} />
                    )}
                    {/* List txs in this block */}
                    {searchResult.data.transactions?.length > 0 && (
                      <View style={{ marginTop: Spacing.md }}>
                        <Text style={s.detailSectionTitle}>Block Transactions</Text>
                        {searchResult.data.transactions.slice(0, 5).map((tx: Tx, i: number) => (
                          <TxCard key={`r-${i}`} tx={tx} compact onPress={() => setSelectedTx(tx)} />
                        ))}
                        {searchResult.data.transactions.length > 5 && (
                          <Text style={s.moreText}>+{searchResult.data.transactions.length - 5} more transactions</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* ── RBF Inspector ──────────────────────────────── */}
                <View style={s.rbfCard}>
                  <View style={s.rbfHeader}>
                    <View style={s.rbfIconWrap}>
                      <MaterialIcons name="swap-calls" size={20} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rbfTitle}>RBF Inspector</Text>
                      <Text style={s.rbfSub}>Replace-By-Fee check via mempool.space</Text>
                    </View>
                    <View style={s.rbfSourceBadge}>
                      <Text style={s.rbfSourceText}>mempool.space</Text>
                    </View>
                  </View>

                  <View style={s.searchInputRow}>
                    <MaterialIcons name="tag" size={16} color={Colors.textMuted} style={{ marginLeft: Spacing.sm }} />
                    <TextInput
                      style={s.searchInput}
                      value={rbfQuery}
                      onChangeText={setRbfQuery}
                      placeholder="Bitcoin TX hash (64 hex chars)"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      onSubmitEditing={runRbfCheck}
                      returnKeyType="search"
                    />
                    {rbfQuery.length > 0 && (
                      <TouchableOpacity onPress={() => { setRbfQuery(''); setRbfResult(null); setRbfError(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="close" size={16} color={Colors.textMuted} style={{ marginRight: Spacing.sm }} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Demo fill */}
                  <TouchableOpacity
                    style={s.rbfDemoChip}
                    onPress={() => { setRbfQuery('2e95ff9094df9f3650e3f2abc189250760162be89a88f9f2f23301c7cb14b8b4'); setRbfResult(null); setRbfError(null); }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="auto-fix-high" size={12} color="#F59E0B" />
                    <Text style={s.rbfDemoText}>Load demo TX</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.rbfBtn, (rbfLoading || !rbfQuery.trim()) && { opacity: 0.5 }]}
                    onPress={runRbfCheck}
                    disabled={rbfLoading || !rbfQuery.trim()}
                    activeOpacity={0.85}
                  >
                    {rbfLoading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <MaterialIcons name="swap-calls" size={16} color="#fff" />}
                    <Text style={s.rbfBtnText}>{rbfLoading ? 'Checking RBF…' : 'Check RBF Status'}</Text>
                  </TouchableOpacity>

                  {/* Error */}
                  {rbfError ? (
                    <View style={s.rbfErrorBox}>
                      <MaterialIcons name="error-outline" size={16} color={Colors.error} />
                      <Text style={s.rbfErrorText}>{rbfError}</Text>
                    </View>
                  ) : null}

                  {/* Result */}
                  {rbfResult ? (() => {
                    const rep = rbfResult.replacements as any;
                    const repArr = Array.isArray(rbfResult.replaces) ? rbfResult.replaces as string[] : null;
                    const hasReplacements = rep !== null && rep !== undefined;
                    const hasReplaces = repArr && repArr.length > 0;
                    const isClean = !hasReplacements && !hasReplaces;
                    const repTx = hasReplacements ? rep?.tx : null;
                    const isFullRbf = rep?.fullRbf ?? rbfResult.replacements?.fullRbf ?? false;

                    return (
                      <View style={[s.rbfResultBox, { borderColor: isClean ? Colors.success + '55' : '#F59E0B55' }]}>
                        {/* Status badge */}
                        <View style={[s.rbfStatusRow, { backgroundColor: isClean ? Colors.successBg : '#F59E0B12' }]}>
                          <MaterialIcons
                            name={isClean ? 'check-circle' : 'swap-horiz'}
                            size={18}
                            color={isClean ? Colors.success : '#F59E0B'}
                          />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[s.rbfStatusTitle, { color: isClean ? Colors.success : '#F59E0B' }]}>
                                {isClean ? 'No RBF Activity' : 'RBF Detected'}
                              </Text>
                              {isFullRbf && (
                                <View style={s.rbfFullBadge}>
                                  <Text style={s.rbfFullBadgeText}>FULL-RBF</Text>
                                </View>
                              )}
                            </View>
                            <Text style={s.rbfStatusSub}>
                              {isClean
                                ? 'This transaction has not been replaced or replaced another TX.'
                                : `This TX is part of a Replace-By-Fee chain.${isFullRbf ? ' Full-RBF (no opt-in flag required).' : ''}`}
                            </Text>
                          </View>
                        </View>

                        {/* Queried TX ID */}
                        <View style={s.rbfField}>
                          <Text style={s.rbfFieldLabel}>Queried TX</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <Text style={s.rbfFieldMono} numberOfLines={1}>{shortHash(rbfResult.txid, 12, 10)}</Text>
                            <CopyBtn value={rbfResult.txid} size={13} />
                          </View>
                        </View>

                        {/* Replacement TX details */}
                        {repTx ? (
                          <View style={s.rbfTxBlock}>
                            <View style={s.rbfTxBlockHeader}>
                              <MaterialIcons name="arrow-circle-up" size={14} color="#F59E0B" />
                              <Text style={s.rbfTxBlockTitle}>Replacement Transaction</Text>
                              {rep?.time && (
                                <Text style={s.rbfTxBlockTime}>{fmtAgo(rep.time)}</Text>
                              )}
                            </View>
                            <View style={{ gap: 6 }}>
                              {/* txid row */}
                              <View style={s.rbfTxRow}>
                                <Text style={s.rbfTxRowLabel}>TXID</Text>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                  <Text style={s.rbfFieldMono} numberOfLines={1}>{shortHash(repTx.txid, 10, 8)}</Text>
                                  <CopyBtn value={repTx.txid} size={12} />
                                </View>
                              </View>
                              {/* stats grid */}
                              <View style={s.rbfTxGrid}>
                                {[
                                  { label: 'Fee',   value: `${repTx.fee ?? '—'} sat`,                     color: '#F59E0B' },
                                  { label: 'vSize', value: repTx.vsize != null ? `${repTx.vsize.toFixed(0)} vB` : '—', color: Colors.primary },
                                  { label: 'Value', value: repTx.value != null ? `${repTx.value} sat` : '—',          color: Colors.textPrimary },
                                  { label: 'Rate',  value: repTx.rate  != null ? `${repTx.rate.toFixed(2)} sat/vB` : '—', color: Colors.success },
                                ].map(cell => (
                                  <View key={cell.label} style={s.rbfTxCell}>
                                    <Text style={[s.rbfTxCellValue, { color: cell.color }]}>{cell.value}</Text>
                                    <Text style={s.rbfTxCellLabel}>{cell.label}</Text>
                                  </View>
                                ))}
                              </View>
                              {/* nested replaces in replacement */}
                              {Array.isArray(rep?.replaces) && rep.replaces.length > 0 && (
                                <View style={s.rbfNestedWrap}>
                                  <Text style={s.rbfNestedTitle}>Also replaced {rep.replaces.length} earlier TX{rep.replaces.length > 1 ? 's' : ''}:</Text>
                                  {(rep.replaces as any[]).map((r: any, ri: number) => (
                                    <View key={ri} style={s.rbfNestedRow}>
                                      <MaterialIcons name="subdirectory-arrow-right" size={12} color={Colors.textMuted} />
                                      <Text style={s.rbfNestedTxid} numberOfLines={1}>{shortHash(r?.tx?.txid ?? '', 10, 8)}</Text>
                                      {r?.tx?.fee != null && (
                                        <View style={s.rbfNestedFeeBadge}>
                                          <Text style={s.rbfNestedFeeText}>{r.tx.fee} sat</Text>
                                        </View>
                                      )}
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          </View>
                        ) : (
                          <View style={s.rbfField}>
                            <Text style={s.rbfFieldLabel}>Replacements</Text>
                            <View style={[s.rbfValueBadge, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                              <Text style={[s.rbfValueText, { color: Colors.textMuted }]}>null — not replaced</Text>
                            </View>
                          </View>
                        )}

                        {/* Replaces list */}
                        {hasReplaces ? (
                          <View style={s.rbfReplacesBlock}>
                            <View style={s.rbfTxBlockHeader}>
                              <MaterialIcons name="arrow-circle-down" size={14} color={Colors.error} />
                              <Text style={[s.rbfTxBlockTitle, { color: Colors.error }]}>Replaced {repArr!.length} TX{repArr!.length > 1 ? 's' : ''}</Text>
                            </View>
                            {repArr!.map((txid, i) => (
                              <View key={i} style={s.rbfReplaceRow}>
                                <View style={[s.rbfReplaceIndex, { backgroundColor: Colors.error + '18' }]}>
                                  <Text style={[s.rbfReplaceIndexText, { color: Colors.error }]}>{i + 1}</Text>
                                </View>
                                <Text style={s.rbfFieldMono} numberOfLines={1}>{shortHash(txid, 10, 8)}</Text>
                                <CopyBtn value={txid} size={12} />
                              </View>
                            ))}
                          </View>
                        ) : (
                          <View style={s.rbfField}>
                            <Text style={s.rbfFieldLabel}>Replaces</Text>
                            <View style={[s.rbfValueBadge, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                              <Text style={[s.rbfValueText, { color: Colors.textMuted }]}>null — does not replace any TX</Text>
                            </View>
                          </View>
                        )}

                        {/* Source note */}
                        <View style={s.rbfSourceNote}>
                          <MaterialIcons name="public" size={11} color={Colors.textMuted} />
                          <Text style={s.rbfSourceNoteText}>Data from mempool.space · Bitcoin mainnet · /api/v1/tx/:txid/rbf</Text>
                        </View>
                      </View>
                    );
                  })() : null}
                </View>

                {/* ── Ethereum Wallet Lookup ──────────────── */}
                <EthWalletPanel />

                {/* ── Fee Rate Estimator ─────────────────────── */}
                <View style={s.feeCard}>
                  <View style={s.feeCardHeader}>
                    <View style={s.feeIconWrap}>
                      <MaterialIcons name="local-gas-station" size={20} color="#22C55E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.feeCardTitle}>Fee Rate Estimator</Text>
                      <Text style={s.feeCardSub}>Bitcoin sat/vB · mempool.space</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.feeRefreshBtn, feeRatesLoading && { opacity: 0.5 }]}
                      onPress={fetchFeeRates}
                      disabled={feeRatesLoading}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {feeRatesLoading
                        ? <ActivityIndicator size="small" color="#22C55E" />
                        : <MaterialIcons name="refresh" size={16} color="#22C55E" />}
                    </TouchableOpacity>
                  </View>

                  {!feeRates && !feeRatesLoading && !feeRatesError && (
                    <TouchableOpacity style={s.feeFetchBtn} onPress={fetchFeeRates} activeOpacity={0.85}>
                      <MaterialIcons name="local-gas-station" size={16} color={Colors.bg} />
                      <Text style={s.feeFetchBtnText}>Fetch Live Fee Rates</Text>
                    </TouchableOpacity>
                  )}

                  {feeRatesError && (
                    <View style={s.feeErrorBox}>
                      <MaterialIcons name="error-outline" size={15} color={Colors.error} />
                      <Text style={s.feeErrorText}>{feeRatesError}</Text>
                    </View>
                  )}

                  {feeRates && (() => {
                    const cells = [
                      { label: 'Fast',       sub: '~10 min',   value: feeRates.fastestFee,  color: Colors.error,   icon: 'flash-on',   bg: Colors.errorBg },
                      { label: 'Normal',     sub: '~30 min',   value: feeRates.halfHourFee, color: '#F59E0B',      icon: 'speed',      bg: '#F59E0B12' },
                      { label: 'Economy',    sub: '~1 hour',   value: feeRates.hourFee,     color: Colors.primary, icon: 'savings',    bg: Colors.primaryGlow },
                      { label: 'Min',        sub: 'Low prio',  value: feeRates.minimumFee,  color: Colors.success, icon: 'eco',        bg: Colors.successBg },
                    ];
                    return (
                      <View style={s.feeGrid}>
                        {cells.map(cell => (
                          <View key={cell.label} style={[s.feeCell, { borderColor: cell.color + '44', backgroundColor: cell.bg }]}>
                            <View style={[s.feeCellIcon, { backgroundColor: cell.color + '22', borderColor: cell.color + '55' }]}>
                              <MaterialIcons name={cell.icon as any} size={16} color={cell.color} />
                            </View>
                            <Text style={[s.feeCellValue, { color: cell.color }]}>{cell.value}</Text>
                            <Text style={s.feeCellUnit}>sat/vB</Text>
                            <Text style={[s.feeCellLabel, { color: cell.color }]}>{cell.label}</Text>
                            <Text style={s.feeCellSub}>{cell.sub}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}

                  {feeRatesLastFetched && (
                    <View style={s.feeFooter}>
                      <Pulse color="#22C55E" size={5} />
                      <Text style={s.feeFooterText}>mempool.space · Bitcoin mainnet · Updated {fmtAgo(feeRatesLastFetched)}</Text>
                    </View>
                  )}
                </View>

                {/* Search Result — Address */}
                {searchResult?.type === 'address' && (
                  <View style={[s.detailCard, { borderColor: Colors.primary + '55' }]}>
                    <View style={s.detailHeader}>
                      <View style={[s.detailHeaderIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
                        <MaterialIcons name="account-balance-wallet" size={22} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.detailTitle}>Address Found</Text>
                        <View style={[s.genesisBadge, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' }]}>
                          <Pulse color={Colors.success} />
                          <Text style={[s.genesisBadgeText, { color: Colors.success, marginLeft: 4 }]}>LIVE BALANCE</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.balHeroWrap}>
                      <Text style={s.balHeroAmt}>{searchResult.data.balance ?? 0}</Text>
                      <Text style={s.balHeroUnit}>BTNG</Text>
                    </View>
                    <DRow label="Address" value={searchResult.data.address} mono copy />
                    <DRow label="Confirmed" value={`${searchResult.data.confirmed ?? 0} BTNG`} color={Colors.success} />
                    <DRow label="Pending" value={`${searchResult.data.pending ?? 0} BTNG`} color={Colors.warning} />
                    <DRow label="Total" value={`${searchResult.data.total ?? 0} BTNG`} color={Colors.primary} />
                    {searchResult.data.lastUpdated && (
                      <DRow label="Last Updated" value={fmtDate(searchResult.data.lastUpdated)} />
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── STATS TAB ───────────────────────────────────────────── */}
            {tab === 'stats' && (
              <>
                {/* Live Network Header */}
                <View style={s.statsHeroCard}>
                  <View style={s.statsHeroTop}>
                    <Pulse color={Colors.success} />
                    <Text style={s.statsHeroTitle}>
                      {stats?.network ?? 'BTNG Sovereign Mainnet'}
                    </Text>
                  </View>
                  <Text style={s.statsHeroNode}>168.231.79.52:64799 · srv1282934.hstgr.cloud · Ghana Mainnet · Accra, Ghana</Text>
                  <View style={s.statsHeroGrid}>
                    {[
                      { label: 'Block Height', value: stats ? `#${stats.height}` : '—', color: Colors.primary, icon: 'view-stream' },
                      { label: 'Total TXs', value: stats ? String(stats.totalTransactions) : '—', color: '#3B82F6', icon: 'receipt-long' },
                      { label: 'Pending TXs', value: stats ? String(stats.pendingTransactions) : '—', color: Colors.warning, icon: 'pending' },
                      { label: 'Validators', value: stats ? String(stats.activeValidators) : '—', color: '#A855F7', icon: 'people' },
                      { label: 'Hash Rate', value: stats?.hashRate ?? '—', color: '#22C55E', icon: 'speed' },
                      { label: 'Block Time', value: stats?.blockTime ?? '—', color: Colors.textSecondary, icon: 'schedule' },
                      { label: 'Total Supply', value: stats ? `${(stats.totalSupply / 1e6).toFixed(1)}M` : '—', color: Colors.primary, icon: 'monetization-on' },
                      { label: 'Market Cap', value: stats ? `$${(stats.marketCap / 1e6).toFixed(2)}M` : '—', color: Colors.warning, icon: 'bar-chart' },
                    ].map(item => (
                      <View key={item.label} style={[s.statsCell, { borderColor: item.color + '33' }]}>
                        <View style={[s.statsCellIcon, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                          <MaterialIcons name={item.icon as any} size={16} color={item.color} />
                        </View>
                        <Text style={[s.statsCellValue, { color: item.color }]}>{item.value}</Text>
                        <Text style={s.statsCellLabel}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Genesis Transaction Reference */}
                {stats?.genesisTransaction && (
                  <View style={s.detailCard}>
                    <View style={s.detailSectionHeader}>
                      <MaterialIcons name="star" size={16} color={Colors.primary} />
                      <Text style={s.detailSectionTitle}>Genesis Transaction</Text>
                    </View>
                    <DRow label="TX Hash" value={stats.genesisTransaction} mono copy />
                    <DRow label="Date" value="February 18, 2026 · 18:36:14 Ghana Time" />
                    <DRow label="Location" value="Bank of Ghana Vault 001 · Accra" color={Colors.primary} />
                    <TouchableOpacity
                      style={s.viewGenesisBtn}
                      onPress={() => { setQuery(stats.genesisTransaction); setTab('search'); runSearch(); }}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="search" size={14} color={Colors.bg} />
                      <Text style={s.viewGenesisBtnText}>Look up Genesis Transaction</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* API Endpoints */}
                <View style={s.detailCard}>
                  <View style={s.detailSectionHeader}>
                    <MaterialIcons name="api" size={16} color={Colors.primary} />
                    <Text style={s.detailSectionTitle}>Live API Endpoints</Text>
                  </View>
                  {[
                    { method: 'GET', path: '/api/v1/blockchain/info', desc: 'Network info & height' },
                    { method: 'GET', path: '/api/v1/stats', desc: 'Chain statistics' },
                    { method: 'GET', path: '/api/v1/blocks/latest', desc: 'Recent blocks' },
                    { method: 'GET', path: '/api/v1/block/:height', desc: 'Block by height' },
                    { method: 'GET', path: '/api/v1/transactions/latest', desc: 'Recent transactions' },
                    { method: 'GET', path: '/api/v1/transaction/:hash', desc: 'TX by hash' },
                    { method: 'GET', path: '/api/v1/balance/:address', desc: 'Address balance' },
                    { method: 'GET', path: '/api/v1/genesis', desc: 'Genesis TX' },
                    { method: 'GET', path: '/api/v1/gold/reserve', desc: 'Gold reserve cert' },
                    { method: 'GET', path: '/api/v1/price', desc: 'BTNG price oracle' },
                    { method: 'POST', path: '/api/v1/transaction/send', desc: 'Broadcast TX' },
                    { method: 'POST', path: '/api/v1/identity/verify', desc: 'Proof of Voice (PoV)' },
                  ].map((ep, i) => (
                    <View key={ep.path} style={[s.apiRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '66' }]}>
                      <View style={[s.apiMethod, { backgroundColor: ep.method === 'GET' ? '#22C55E18' : '#F59E0B18', borderColor: ep.method === 'GET' ? '#22C55E55' : '#F59E0B55' }]}>
                        <Text style={[s.apiMethodText, { color: ep.method === 'GET' ? '#22C55E' : '#F59E0B' }]}>{ep.method}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={s.apiPath} numberOfLines={1}>{ep.path}</Text>
                        <Text style={s.apiDesc}>{ep.desc}</Text>
                      </View>
                      <CopyBtn value={`${NODE}${ep.path}`} />
                    </View>
                  ))}
                </View>

                {/* Gold Reserve */}
                {(() => {
                  const GOLD_PRICE_PER_KG = 3200 * 32.1507; // ~$102,882/kg based on ~$3200/oz
                  const amountKg = goldReserveData?.amount_kg ?? 0;
                  const pricePerKg = goldReserveData?.gold_price_usd_per_kg ?? goldReserveData?.gold_price_usd_per_oz != null
                    ? goldReserveData!.gold_price_usd_per_oz! * 32.1507
                    : goldReserveData?.valuation_usd != null && amountKg > 0
                    ? goldReserveData.valuation_usd / amountKg
                    : GOLD_PRICE_PER_KG;
                  const valuationUsd = goldReserveData?.valuation_usd ?? amountKg * pricePerKg;
                  const certId = goldReserveData?.certificate ?? goldReserveData?.cert_id ?? null;
                  const location = goldReserveData?.location ?? 'Bank of Ghana Vault 001 · Accra';
                  const ts = goldReserveData?.updated_at ?? goldReserveData?.timestamp ?? null;

                  return (
                    <View style={s.goldCard}>
                      <View style={s.goldCardHeader}>
                        <View style={s.goldIconWrap}>
                          <Text style={s.goldIconEmoji}>🪙</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.goldCardTitle}>Gold Reserve</Text>
                          <Text style={s.goldCardSub}>BTNG Gold Backing · /api/v1/gold/reserve</Text>
                        </View>
                        <TouchableOpacity
                          style={s.goldRefreshBtn}
                          onPress={fetchGoldReserve}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="refresh" size={15} color={Colors.primary} />
                        </TouchableOpacity>
                      </View>

                      {/* Valuation hero */}
                      {goldReserveData ? (
                        <>
                          <View style={s.goldValuationWrap}>
                            <View style={s.goldValuationLeft}>
                              <Text style={s.goldAmountKg}>{amountKg.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</Text>
                              <Text style={s.goldAmountUnit}>kg Gold</Text>
                            </View>
                            <View style={s.goldValuationDivider} />
                            <View style={s.goldValuationRight}>
                              <Text style={s.goldUsdValue}>
                                ${(valuationUsd / 1e6).toFixed(2)}M
                              </Text>
                              <Text style={s.goldUsdLabel}>USD Valuation</Text>
                            </View>
                          </View>

                          <View style={s.goldFields}>
                            <View style={s.goldField}>
                              <View style={s.goldFieldIcon}>
                                <MaterialIcons name="location-on" size={12} color={Colors.primary} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={s.goldFieldLabel}>VAULT LOCATION</Text>
                                <Text style={s.goldFieldValue}>{location}</Text>
                              </View>
                            </View>

                            {certId && (
                              <View style={s.goldField}>
                                <View style={s.goldFieldIcon}>
                                  <MaterialIcons name="verified" size={12} color={Colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={s.goldFieldLabel}>CERTIFICATE ID</Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={[s.goldFieldValue, { fontFamily: 'monospace', fontSize: 10, flex: 1 }]} numberOfLines={1}>{certId}</Text>
                                    <CopyBtn value={certId} size={12} />
                                  </View>
                                </View>
                              </View>
                            )}

                            <View style={s.goldField}>
                              <View style={s.goldFieldIcon}>
                                <MaterialIcons name="price-change" size={12} color={Colors.primary} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={s.goldFieldLabel}>GOLD PRICE (ORACLE)</Text>
                                <Text style={s.goldFieldValue}>${pricePerKg.toLocaleString('en-US', { maximumFractionDigits: 0 })}/kg · ${(pricePerKg / 32.1507).toFixed(0)}/oz</Text>
                              </View>
                            </View>
                          </View>

                          <View style={s.goldFooter}>
                            <Pulse color={Colors.primary} size={5} />
                            <Text style={s.goldFooterText}>
                              BTNG Sovereign Reserve · Proof-of-Gold Backing{ts ? ` · Updated ${fmtAgo(ts)}` : ' · Live'}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <View style={s.goldFetchWrap}>
                          <TouchableOpacity style={s.goldFetchBtn} onPress={fetchGoldReserve} activeOpacity={0.85}>
                            <Text style={s.goldIconEmoji}>🪙</Text>
                            <Text style={s.goldFetchBtnText}>Load Gold Reserve Data</Text>
                          </TouchableOpacity>
                          <Text style={s.goldFetchSub}>Fetches from node /api/v1/gold/reserve · auto-refreshes every 15s</Text>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Network Peers */}
                <View style={s.detailCard}>
                  <View style={s.detailSectionHeader}>
                    <MaterialIcons name="device-hub" size={16} color={Colors.primary} />
                    <Text style={s.detailSectionTitle}>Network Peers</Text>
                    <View style={{ flex: 1 }} /><View style={s.countBadge}>
                      <Text style={s.countText}>9 LIVE</Text>
                    </View>
                  </View>
                  {/* Table header */}
                  <View style={s.peerHeader}>
                    <Text style={[s.peerCol, s.peerColIp, s.peerHeaderText]}>NODE / IP</Text>
                    <Text style={[s.peerCol, s.peerColLoc, s.peerHeaderText]}>LOCATION</Text>
                    <Text style={[s.peerCol, s.peerColStatus, s.peerHeaderText]}>STATUS</Text>
                    <Text style={[s.peerCol, s.peerColLatency, s.peerHeaderText]}>LATENCY</Text>
                  </View>
                  {[
                    { ip: '168.231.79.52',      loc: 'Accra, Ghana',     role: 'Primary'   },
                    { ip: '2a02:4780:f:bc::1', loc: 'Accra, Ghana',     role: 'IPv6'      },
                    { ip: '74.118.126.73',      loc: 'Lagos, Nigeria',   role: 'Validator' },
                    { ip: '74.118.126.74', loc: 'Nairobi, Kenya',      role: 'Relay'     },
                    { ip: '72.62.160.240', loc: 'Nairobi, Kenya',      role: 'Relay'     },
                    { ip: '72.62.160.241', loc: 'Johannesburg, SA',    role: 'Relay'     },
                    { ip: '72.62.160.242', loc: 'London, UK',          role: 'Relay'     },
                    { ip: '72.62.160.243', loc: 'Dubai, UAE',          role: 'Relay'     },
                    { ip: '72.62.160.244', loc: 'Toronto, Canada',     role: 'Relay'     },
                  ].map((peer, i, arr) => {
                    const pl = peerLatencies[peer.ip];
                    const isIPv6 = peer.role === 'IPv6';
                    const latencyColor = !pl || pl.error || pl.ms === null
                      ? Colors.error
                      : pl.ms < 50 ? Colors.success : pl.ms < 150 ? Colors.primary : Colors.textSecondary;
                    return (
                      <View key={peer.ip} style={[s.peerRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border + '66' }]}>
                        <View style={[s.peerCol, s.peerColIp]}>
                          <Text style={[s.peerIp, isIPv6 && { color: '#9945FF', fontSize: 9 }]} numberOfLines={1}>{peer.ip}</Text>
                          {peer.role === 'Primary' && (
                            <View style={s.peerRoleBadge}>
                              <Text style={s.peerRoleText}>PRIMARY</Text>
                            </View>
                          )}
                          {isIPv6 && (
                            <View style={[s.peerRoleBadge, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                              <Text style={[s.peerRoleText, { color: '#9945FF' }]}>IPv6</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[s.peerCol, s.peerColLoc, s.peerLocText]} numberOfLines={1}>{peer.loc}</Text>
                        <View style={[s.peerCol, s.peerColStatus, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          {isIPv6 ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#9945FF' }} />
                              <Text style={[s.peerLiveText, { color: '#9945FF' }]}>IPv6</Text>
                            </View>
                          ) : (
                            <>
                              <Pulse color={pl && !pl.checking && !pl.error && pl.ms !== null ? Colors.success : Colors.warning} size={6} />
                              <Text style={[s.peerLiveText, { color: pl && !pl.checking && !pl.error && pl.ms !== null ? Colors.success : Colors.warning }]}>
                                {pl && pl.checking ? 'PING…' : 'LIVE'}
                              </Text>
                            </>
                          )}
                        </View>
                        <View style={[s.peerCol, s.peerColLatency, { alignItems: 'flex-end' }]}>
                          {isIPv6 ? (
                            <View style={[s.peerTimeoutBadge, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                              <Text style={[s.peerTimeoutText, { color: '#9945FF' }]}>dual-stack</Text>
                            </View>
                          ) : (!pl || pl.checking) ? (
                            <ActivityIndicator size="small" color={Colors.textMuted} style={{ transform: [{ scale: 0.6 }] }} />
                          ) : pl.error || pl.ms === null ? (
                            <View style={[s.peerTimeoutBadge]}>
                              <Text style={s.peerTimeoutText}>timeout</Text>
                            </View>
                          ) : (
                            <Text style={[s.peerLatencyText, { color: latencyColor }]}>{pl.ms}ms</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Mempool Monitor */}
                {(() => {
                  const pendingTxs = txList.filter(tx => tx.status === 'pending');
                  const pendingCount = pendingTxs.length;
                  const avgFee = pendingCount > 0
                    ? pendingTxs.reduce((sum, tx) => sum + (tx.fee ?? 0), 0) / pendingCount
                    : 0;
                  const oldestTs = pendingTxs.length > 0
                    ? Math.min(...pendingTxs.map(tx => tx.timestamp))
                    : null;
                  const congestion = pendingCount >= 10 ? 'High' : pendingCount >= 5 ? 'Medium' : 'Low';
                  const congestionColor = congestion === 'High' ? Colors.error : congestion === 'Medium' ? Colors.warning : Colors.success;
                  const congestionBg = congestion === 'High' ? Colors.errorBg : congestion === 'Medium' ? Colors.warning + '12' : Colors.successBg;

                  return (
                    <View style={s.detailCard}>
                      <View style={s.detailSectionHeader}>
                        <MaterialIcons name="pending-actions" size={16} color={Colors.primary} />
                        <Text style={s.detailSectionTitle}>Mempool Monitor</Text>
                        <View style={{ flex: 1 }} /><View style={[s.countBadge, { backgroundColor: congestionColor + '18', borderColor: congestionColor + '55' }]}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: congestionColor }} />
                          <Text style={[s.countText, { color: congestionColor, marginLeft: 4 }]}>{congestion.toUpperCase()}</Text>
                        </View>
                      </View>

                      <View style={s.mempoolBar}>
                        <View style={[s.mempoolFill, {
                          width: `${Math.min(100, (pendingCount / 15) * 100)}%` as any,
                          backgroundColor: congestionColor,
                        }]} />
                      </View>
                      <Text style={[s.mempoolCongLabel, { color: congestionColor }]}>
                        {congestion} Congestion — {pendingCount} pending TX{pendingCount !== 1 ? 's' : ''}
                      </Text>

                      <View style={s.mempoolGrid}>
                        {[
                          { icon: 'pending',  label: 'Pending TXs',   value: String(pendingCount),                                              color: pendingCount >= 10 ? Colors.error : pendingCount >= 5 ? Colors.warning : Colors.success },
                          { icon: 'toll',     label: 'Avg Fee',        value: avgFee > 0 ? `${avgFee.toFixed(4)} BTNG` : '0 BTNG',              color: Colors.primary },
                          { icon: 'schedule', label: 'Oldest Pending', value: oldestTs ? fmtAgo(oldestTs) : '—',                                color: Colors.textSecondary },
                          { icon: 'speed',    label: 'Congestion',     value: congestion,                                                        color: congestionColor },
                        ].map(item => (
                          <View key={item.label} style={[s.mempoolCell, { borderColor: item.color + '33', backgroundColor: item.color + '0A' }]}>
                            <View style={[s.mempoolCellIcon, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                              <MaterialIcons name={item.icon as any} size={14} color={item.color} />
                            </View>
                            <Text style={[s.mempoolCellValue, { color: item.color }]}>{item.value}</Text>
                            <Text style={s.mempoolCellLabel}>{item.label}</Text>
                          </View>
                        ))}
                      </View>

                      <View style={[s.mempoolNote, { backgroundColor: congestionBg, borderColor: congestionColor + '33' }]}>
                        <MaterialIcons name={congestion === 'High' ? 'warning' : congestion === 'Medium' ? 'info' : 'check-circle'} size={12} color={congestionColor} />
                        <Text style={[s.mempoolNoteText, { color: congestionColor }]}>
                          {congestion === 'High'
                            ? 'High mempool pressure — expect slower confirmations and higher fees.'
                            : congestion === 'Medium'
                            ? 'Moderate mempool activity — normal confirmation times expected.'
                            : 'Mempool is clear — fast confirmations and low fees available.'}
                          {' '}Auto-refreshed every 15s.
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Block Size Histogram */}
                {blocks.length > 0 && (() => {
                  const histBlocks = blocks.slice(0, 10).reverse();
                  const maxTxCount = Math.max(1, ...histBlocks.map(b => b.transactions?.length ?? 0));
                  return (
                    <View style={s.detailCard}>
                      <View style={s.detailSectionHeader}>
                        <MaterialIcons name="bar-chart" size={16} color={Colors.primary} />
                        <Text style={s.detailSectionTitle}>Block Size Histogram</Text>
                        <View style={{ flex: 1 }} /><View style={s.countBadge}>
                          <Text style={s.countText}>LAST {histBlocks.length}</Text>
                        </View>
                      </View>
                      <View style={s.histWrap}>
                        {histBlocks.map((blk) => {
                          const txCount = blk.transactions?.length ?? 0;
                          const barPct = (txCount / maxTxCount) * 100;
                          const isPeak = txCount === maxTxCount && txCount > 0;
                          return (
                            <View key={blk.index} style={s.histRowWrap}>
                              <View style={s.histRow}>
                                <Text style={s.histLabel}>#{blk.index}</Text>
                                <View style={s.histBarTrack}>
                                  <View style={[
                                    s.histBarFill,
                                    { width: `${Math.max(barPct, txCount > 0 ? 3 : 0)}%` as any },
                                    isPeak ? s.histBarFillPeak : null,
                                  ]} />
                                </View>
                                <Text style={[s.histCount, txCount === 0 && { color: Colors.textMuted }]}>
                                  {txCount} TX
                                </Text>
                              </View>
                              {blk.validator ? (
                                <Text style={s.histValidator} numberOfLines={1}>
                                  {shortHash(blk.validator, 8, 4)}
                                </Text>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                      <View style={s.histLegend}>
                        <View style={s.histLegendItem}>
                          <View style={[s.histLegendDot, { backgroundColor: Colors.primary }]} />
                          <Text style={s.histLegendText}>TX count per block</Text>
                        </View>
                        <View style={s.histLegendItem}>
                          <View style={[s.histLegendDot, { backgroundColor: Colors.warning }]} />
                          <Text style={s.histLegendText}>Peak block</Text>
                        </View>
                        <Text style={s.histLegendMax}>Max: {maxTxCount} TX</Text>
                      </View>
                      <View style={s.histFooter}>
                        <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
                        <Text style={s.histFooterText}>TX density per block · oldest → newest · auto-refreshes every 15s</Text>
                      </View>
                    </View>
                  );
                })()}

                {/* ── BTNG Hero Stats Card (mirrors HTML explorer) ─── */}
                <View style={s.heroExplorerCard}>
                  <View style={s.heroExplorerHeader}>
                    <Text style={s.heroExplorerTitle}>⛓️ BTNG Explorer</Text>
                    <View style={[s.heroExplorerBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                      <View style={s.heroLiveDot} />
                      <Text style={[s.heroExplorerBadgeText, { color: Colors.success }]}>LIVE NETWORK</Text>
                    </View>
                    <View style={[s.heroExplorerBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                      <Text style={[s.heroExplorerBadgeText, { color: Colors.primary }]}>{heroStats.nations} NATIONS ONLINE</Text>
                    </View>
                  </View>
                  <View style={s.heroStatsGrid}>
                    {[
                      { id: 'total-blocks', label: 'Total Blocks',       value: heroStats.totalBlocks >= 100_000 ? `${(heroStats.totalBlocks / 1000).toFixed(0)}K+` : `${heroStats.totalBlocks}+`, color: Colors.primary,   icon: 'view-stream' },
                      { id: 'total-tx',     label: 'Total Transactions', value: heroStats.totalTx,                                                                                                    color: '#3B82F6',        icon: 'receipt-long' },
                      { id: 'nations',      label: 'Active Nations',     value: String(heroStats.nations),                                                                                             color: '#22C55E',        icon: 'public' },
                      { id: 'gold',         label: 'Gold Price (USD)',   value: `$${heroStats.goldPriceUSD.toLocaleString()}`,                                                                        color: Colors.primary,   icon: 'monetization-on' },
                      { id: 'btc',          label: 'BTC Price (USD)',    value: `$${(heroStats.btcPriceUSD / 1000).toFixed(0)}K`,                                                                     color: '#F7931A',        icon: 'currency-bitcoin' },
                      { id: 'network',      label: 'Network',            value: heroOnline ? 'LIVE' : 'Edge',                                                                                          color: Colors.success,   icon: 'wifi' },
                    ].map(stat => (
                      <View key={stat.id} style={[s.heroStatCard, { borderColor: stat.color + '33' }]}>
                        <View style={[s.heroStatIcon, { backgroundColor: stat.color + '18', borderColor: stat.color + '44' }]}>
                          <MaterialIcons name={stat.icon as any} size={16} color={stat.color} />
                        </View>
                        <Text style={[s.heroStatValue, { color: stat.color }]}>{stat.value}</Text>
                        <Text style={s.heroStatLabel}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.heroExplorerFooter}>
                    <Pulse color={Colors.success} size={5} />
                    <Text style={s.heroExplorerFooterText}>BTNG Sovereign Blockchain Network · Live Transaction Monitoring · 168.231.79.52:64799</Text>
                  </View>
                </View>

                {/* Node info footer */}
                <View style={s.footerNote}>
                  <MaterialIcons name="verified" size={14} color={Colors.primary} />
                  <Text style={s.footerNoteText}>
                    BTNG Sovereign Node · 168.231.79.52:64799 · srv1282934.hstgr.cloud · Ghana Mainnet · Established February 18, 2026
                  </Text>
                </View>
              </>
            )}

            {/* ── BROADCAST TAB ──────────────────────────────────── */}
            {tab === 'broadcast' && (
              <>
                {/* Header card */}
                <View style={s.bcastHeaderCard}>
                  <View style={s.bcastHeaderIcon}>
                    <MaterialIcons name="send" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.bcastTitle}>Broadcast Transaction</Text>
                    <Text style={s.bcastSub}>Paste a raw signed TX hex and submit it to the BTNG network via POST /api/v1/transaction/send</Text>
                  </View>
                </View>

                {/* Input card */}
                <View style={s.bcastInputCard}>
                  <View style={s.bcastInputLabelRow}>
                    <MaterialIcons name="code" size={14} color={Colors.primary} />
                    <Text style={s.bcastInputLabel}>Raw Signed TX Hex</Text>
                    {broadcastHex.length > 0 && (
                      <Text style={s.bcastByteCount}>{Math.floor(broadcastHex.replace(/\s/g, '').length / 2)} bytes</Text>
                    )}
                    {broadcastHex.length > 0 && (
                      <TouchableOpacity
                        onPress={() => { setBroadcastHex(''); setBroadcastResult(null); setBroadcastError(null); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ flex: 0 }}
                      >
                        <MaterialIcons name="close" size={15} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={s.bcastTextArea}
                    value={broadcastHex}
                    onChangeText={setBroadcastHex}
                    placeholder={'0200000001...\n\nPaste full raw transaction hex here'}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                    scrollEnabled
                    textAlignVertical="top"
                  />

                  {/* Demo fill chip */}
                  <TouchableOpacity
                    style={s.bcastDemoChip}
                    onPress={() => {
                      setBroadcastHex('0200000001abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890000000006a47304402...');
                      setBroadcastResult(null);
                      setBroadcastError(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="auto-fix-high" size={12} color={Colors.primary} />
                    <Text style={s.bcastDemoText}>Load demo hex</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.bcastSendBtn, (broadcasting || !broadcastHex.trim()) && { opacity: 0.5 }]}
                    onPress={runBroadcast}
                    disabled={broadcasting || !broadcastHex.trim()}
                    activeOpacity={0.85}
                  >
                    {broadcasting
                      ? <ActivityIndicator color={Colors.bg} size="small" />
                      : <MaterialIcons name="send" size={18} color={Colors.bg} />}
                    <Text style={s.bcastSendBtnText}>
                      {broadcasting ? 'Broadcasting…' : 'Send to Network'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Error */}
                {broadcastError ? (
                  <View style={s.bcastErrorCard}>
                    <View style={s.bcastErrorIconWrap}>
                      <MaterialIcons name="error-outline" size={22} color={Colors.error} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bcastErrorTitle}>Broadcast Failed</Text>
                      <Text style={s.bcastErrorMsg}>{broadcastError}</Text>
                    </View>
                  </View>
                ) : null}

                {/* Success result */}
                {broadcastResult ? (() => {
                  const txHash = broadcastResult.txHash ?? broadcastResult.txid ?? broadcastResult.id ?? null;
                  const status = broadcastResult.status ?? 'submitted';
                  const msg = broadcastResult.message ?? null;
                  return (
                    <View style={s.bcastResultCard}>
                      {/* Status badge header */}
                      <View style={s.bcastResultHeader}>
                        <View style={s.bcastResultIconWrap}>
                          <MaterialIcons name="check-circle" size={24} color={Colors.success} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.bcastResultTitle}>Transaction Broadcast!</Text>
                          <View style={[s.genesisBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55', marginTop: 4 }]}>
                            <Pulse color={Colors.success} size={5} />
                            <Text style={[s.genesisBadgeText, { color: Colors.success, marginLeft: 5 }]}>
                              {status.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        {txHash && <CopyBtn value={txHash} />}
                      </View>

                      {/* TX Hash row */}
                      {txHash ? (
                        <View style={s.bcastResultRow}>
                          <Text style={s.bcastResultLabel}>TX Hash</Text>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.bcastResultMono} numberOfLines={1}>{shortHash(txHash, 14, 10)}</Text>
                            <CopyBtn value={txHash} size={13} />
                          </View>
                        </View>
                      ) : null}

                      <View style={s.bcastResultRow}>
                        <Text style={s.bcastResultLabel}>Status</Text>
                        <Text style={[s.bcastResultValue, { color: Colors.success }]}>{status}</Text>
                      </View>

                      <View style={s.bcastResultRow}>
                        <Text style={s.bcastResultLabel}>Node</Text>
                        <Text style={[s.bcastResultValue, { color: Colors.textMuted, fontFamily: 'monospace', fontSize: 10 }]}>168.231.79.52:64799</Text>
                      </View>

                      {msg ? (
                        <View style={s.bcastResultRow}>
                          <Text style={s.bcastResultLabel}>Message</Text>
                          <Text style={s.bcastResultValue}>{msg}</Text>
                        </View>
                      ) : null}

                      {/* Full hash block */}
                      {txHash ? (
                        <View style={s.bcastFullHashWrap}>
                          <View style={s.bcastFullHashHeader}>
                            <MaterialIcons name="fingerprint" size={13} color={Colors.primary} />
                            <Text style={s.bcastFullHashTitle}>Full TX Hash</Text>
                          </View>
                          <Text style={s.bcastFullHash} selectable>{txHash}</Text>
                        </View>
                      ) : null}

                      <View style={s.bcastResultNote}>
                        <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
                        <Text style={s.bcastResultNoteText}>
                          TX is now propagating across the BTNG sovereign network. Use the Search tab to confirm inclusion in a block.
                        </Text>
                      </View>
                    </View>
                  );
                })() : null}

                {/* Guide card */}
                <View style={s.bcastGuideCard}>
                  <View style={s.detailSectionHeader}>
                    <MaterialIcons name="help-outline" size={16} color={Colors.primary} />
                    <Text style={s.detailSectionTitle}>How to Broadcast</Text>
                  </View>
                  {[
                    { step: '1', text: 'Build and sign your transaction using the BTNG SDK or BTNG Terminal.' },
                    { step: '2', text: 'Export the raw signed transaction as a hex string.' },
                    { step: '3', text: 'Paste the hex above and tap Send to Network.' },
                    { step: '4', text: 'Copy the returned TX hash and use Search to track confirmation.' },
                  ].map(item => (
                    <View key={item.step} style={s.bcastGuideRow}>
                      <View style={s.bcastGuideStep}>
                        <Text style={s.bcastGuideStepText}>{item.step}</Text>
                      </View>
                      <Text style={s.bcastGuideText}>{item.text}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={{ height: insets.bottom + 40 }} />
          </ScrollView>
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// ─── Ethereum Wallet Lookup Panel ───────────────────────────────────────────
function EthWalletPanel() {
  const {
    balanceData, tokenData,
    loadingBalance, loadingTokens,
    balanceError, tokensError,
    lookupFull, fetchNetworkStatus, networkStatus, loadingNetwork, networkError,
    reset,
  } = useEthBlockchain();

  const txHook = useEthBlockchain();

  const [ethInput, setEthInput] = useState('');
  const [ethTab, setEthTab] = useState<'wallet' | 'network' | 'tx'>('wallet');
  const [txInput, setTxInput] = useState('');

  const DEMO_ADDRESSES = [
    { label: 'Vitalik', value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
    { label: 'Binance', value: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8' },
    { label: 'Coinbase', value: '0x503828976D22510aad0201ac7EC88293211D23Da' },
  ];

  const handleLookup = async () => {
    const addr = ethInput.trim();
    if (!addr) return;
    await lookupFull(addr);
  };

  const handleTxLookup = async () => {
    const h = txInput.trim();
    if (!h) return;
    await txHook.lookupTransaction(h);
  };

  const getStatusColor = (status: string) =>
    status === 'success' ? Colors.success : status === 'failed' ? Colors.error : Colors.warning;

  const loading = loadingBalance || loadingTokens;

  return (
    <View style={eth.card}>
      <View style={eth.header}>
        <View style={eth.iconWrap}><Text style={eth.iconEmoji}>Ξ</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={eth.title}>Ethereum Blockchain Lookup</Text>
          <Text style={eth.sub}>Live ETH wallet, tokens & tx data · mainnet</Text>
        </View>
        <View style={eth.liveBadge}>
          <View style={eth.liveDot} />
          <Text style={eth.liveBadgeText}>ETH</Text>
        </View>
      </View>

      <View style={eth.tabRow}>
        {(['wallet', 'network', 'tx'] as const).map(t => (
          <TouchableOpacity key={t} style={[eth.tabBtn, ethTab === t && eth.tabBtnActive]} onPress={() => setEthTab(t)} activeOpacity={0.8}>
            <Text style={[eth.tabText, ethTab === t && eth.tabTextActive]}>
              {t === 'wallet' ? 'Wallet' : t === 'network' ? 'Gas & Fees' : 'Transaction'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {ethTab === 'wallet' && (
        <View style={eth.body}>
          <View style={eth.inputRow}>
            <TextInput style={eth.input} value={ethInput} onChangeText={setEthInput}
              placeholder="0x... Ethereum address" placeholderTextColor={Colors.textMuted}
              autoCapitalize="none" autoCorrect={false} onSubmitEditing={handleLookup} returnKeyType="search" />
            {ethInput.length > 0 && (
              <TouchableOpacity onPress={() => { setEthInput(''); reset(); }} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <MaterialIcons name="close" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={eth.demoRow}>
            {DEMO_ADDRESSES.map(d => (
              <TouchableOpacity key={d.label} style={eth.demoChip} onPress={() => setEthInput(d.value)} activeOpacity={0.8}>
                <Text style={eth.demoChipText}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={[eth.lookupBtn, (loading || !ethInput.trim()) && { opacity: 0.5 }]}
            onPress={handleLookup} disabled={loading || !ethInput.trim()} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="search" size={18} color="#fff" />}
            <Text style={eth.lookupBtnText}>{loading ? 'Looking up…' : 'Lookup Address'}</Text>
          </TouchableOpacity>
          {(balanceError || tokensError) && (
            <View style={eth.errorBox}>
              <MaterialIcons name="error-outline" size={16} color={Colors.error} />
              <Text style={eth.errorText}>{balanceError ?? tokensError}</Text>
            </View>
          )}
          {balanceData && (
            <View style={eth.resultCard}>
              <View style={eth.resultHeader}>
                <View style={eth.resultIconWrap}><Text style={eth.resultIcon}>Ξ</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={eth.resultAddr} numberOfLines={1} ellipsizeMode="middle">{balanceData.address}</Text>
                  <Text style={eth.resultSub}>Block #{balanceData.blockNumber.toLocaleString()} · {balanceData.txCount} txs</Text>
                </View>
                <CopyBtn value={balanceData.address} />
              </View>
              <View style={eth.balanceHero}>
                <Text style={eth.balanceEth}>{parseFloat(balanceData.balance.eth).toFixed(6)}</Text>
                <Text style={eth.balanceUnit}>ETH</Text>
              </View>
              <View style={eth.statsGrid}>
                {[
                  { label: 'Nonce',     value: String(balanceData.txCount),            color: Colors.primary },
                  { label: 'Gas Price', value: `${balanceData.gasPrice.gwei} Gwei`,    color: Colors.warning },
                  { label: 'Network',   value: 'Mainnet',                              color: Colors.success },
                  { label: 'Chain',     value: 'ETH #1',                               color: Colors.textMuted },
                ].map((item, i) => (
                  <View key={i} style={eth.statCell}>
                    <Text style={[eth.statVal, { color: item.color }]} numberOfLines={1}>{item.value}</Text>
                    <Text style={eth.statLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {tokenData && tokenData.tokens.length > 0 && (
            <View style={eth.tokenSection}>
              <View style={eth.tokenSectionHeader}>
                <MaterialIcons name="toll" size={14} color={Colors.primary} />
                <Text style={eth.tokenSectionTitle}>ERC-20 Tokens ({tokenData.totalTokens})</Text>
              </View>
              {tokenData.tokens.map((token, i) => (
                <View key={i} style={eth.tokenRow}>
                  <View style={eth.tokenIconWrap}><Text style={eth.tokenIconText}>{token.symbol.slice(0, 2)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={eth.tokenSymbol}>{token.symbol}</Text>
                    <Text style={eth.tokenName}>{token.name}</Text>
                  </View>
                  <Text style={eth.tokenBalance}>{parseFloat(token.balance).toLocaleString('en-US', { maximumFractionDigits: 4 })}</Text>
                </View>
              ))}
            </View>
          )}
          {tokenData && tokenData.tokens.length === 0 && !loadingTokens && (
            <View style={eth.emptyTokens}>
              <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
              <Text style={eth.emptyTokensText}>No ERC-20 token balances found for this address</Text>
            </View>
          )}
        </View>
      )}

      {ethTab === 'network' && (
        <View style={eth.body}>
          <TouchableOpacity style={[eth.lookupBtn, loadingNetwork && { opacity: 0.5 }]}
            onPress={fetchNetworkStatus} disabled={loadingNetwork} activeOpacity={0.85}>
            {loadingNetwork ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="wifi" size={18} color="#fff" />}
            <Text style={eth.lookupBtnText}>{loadingNetwork ? 'Fetching…' : 'Fetch Live Gas Prices'}</Text>
          </TouchableOpacity>
          {networkError && (
            <View style={eth.errorBox}>
              <MaterialIcons name="error-outline" size={16} color={Colors.error} />
              <Text style={eth.errorText}>{networkError}</Text>
            </View>
          )}
          {networkStatus && (
            <View style={eth.resultCard}>
              <View style={eth.netHeaderRow}>
                <View style={eth.netBadge}>
                  <View style={eth.liveDot} />
                  <Text style={eth.netBadgeText}>ETH Mainnet · Chain #{networkStatus.chainId}</Text>
                </View>
                <Text style={eth.netBlock}>Block #{networkStatus.blockNumber.toLocaleString()}</Text>
              </View>
              <View style={eth.feeGrid}>
                {([
                  { key: 'fast',   color: Colors.error,   icon: 'flash-on',  bg: Colors.errorBg },
                  { key: 'normal', color: Colors.warning, icon: 'speed',     bg: Colors.warningBg },
                  { key: 'slow',   color: Colors.success, icon: 'eco',       bg: Colors.successBg },
                ] as const).map(tier => {
                  const fe = networkStatus.feeEstimates[tier.key];
                  return (
                    <View key={tier.key} style={[eth.feeCell, { backgroundColor: tier.bg, borderColor: tier.color + '55' }]}>
                      <View style={[eth.feeCellIcon, { backgroundColor: tier.color + '22', borderColor: tier.color + '44' }]}>
                        <MaterialIcons name={tier.icon as any} size={16} color={tier.color} />
                      </View>
                      <Text style={[eth.feeCellGwei, { color: tier.color }]}>{fe.gwei}</Text>
                      <Text style={eth.feeCellUnit}>Gwei</Text>
                      <Text style={[eth.feeCellLabel, { color: tier.color }]}>{tier.key.charAt(0).toUpperCase() + tier.key.slice(1)}</Text>
                      <Text style={eth.feeCellSub}>{fe.label}</Text>
                      <Text style={eth.feeCellUsd}>${fe.usd}</Text>
                    </View>
                  );
                })}
              </View>
              {networkStatus.baseFee && (
                <View style={eth.baseFeeRow}>
                  <MaterialIcons name="local-fire-department" size={13} color={Colors.warning} />
                  <Text style={eth.baseFeeText}>EIP-1559 Base Fee: {networkStatus.baseFee.gwei} Gwei</Text>
                </View>
              )}
              <View style={eth.netFooter}>
                <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
                <Text style={eth.netFooterText}>Fee for standard 21,000 gas transfer · Updated {new Date(networkStatus.fetchedAt).toLocaleTimeString()}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {ethTab === 'tx' && (
        <View style={eth.body}>
          <View style={eth.inputRow}>
            <TextInput style={eth.input} value={txInput} onChangeText={setTxInput}
              placeholder="0x... transaction hash (64 hex)" placeholderTextColor={Colors.textMuted}
              autoCapitalize="none" autoCorrect={false} onSubmitEditing={handleTxLookup} returnKeyType="search" />
            {txInput.length > 0 && (
              <TouchableOpacity onPress={() => setTxInput('')} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <MaterialIcons name="close" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[eth.lookupBtn, (txHook.loadingTx || !txInput.trim()) && { opacity: 0.5 }]}
            onPress={handleTxLookup} disabled={txHook.loadingTx || !txInput.trim()} activeOpacity={0.85}>
            {txHook.loadingTx ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="receipt-long" size={18} color="#fff" />}
            <Text style={eth.lookupBtnText}>{txHook.loadingTx ? 'Looking up…' : 'Lookup Transaction'}</Text>
          </TouchableOpacity>
          {txHook.txError && (
            <View style={eth.errorBox}>
              <MaterialIcons name="error-outline" size={16} color={Colors.error} />
              <Text style={eth.errorText}>{txHook.txError}</Text>
            </View>
          )}
          {txHook.txData && (
            <View style={eth.resultCard}>
              <View style={eth.resultHeader}>
                <View style={[eth.resultIconWrap, { backgroundColor: getStatusColor(txHook.txData.status) + '22', borderColor: getStatusColor(txHook.txData.status) + '55' }]}>
                  <MaterialIcons name={txHook.txData.status === 'success' ? 'check-circle' : txHook.txData.status === 'failed' ? 'cancel' : 'pending'} size={22} color={getStatusColor(txHook.txData.status)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[eth.resultAddr, { color: getStatusColor(txHook.txData.status) }]}>{txHook.txData.status.toUpperCase()}</Text>
                  <Text style={eth.resultSub}>{txHook.txData.blockNumber ? `Block #${txHook.txData.blockNumber.toLocaleString()}` : 'Pending (mempool)'}</Text>
                </View>
                <CopyBtn value={txHook.txData.hash} />
              </View>
              {([
                { label: 'TX Hash', value: shortHash(txHook.txData.hash, 14, 10), mono: true },
                { label: 'From',    value: txHook.txData.from,                     mono: true },
                { label: 'To',      value: txHook.txData.to ?? 'Contract creation', mono: !!txHook.txData.to },
                { label: 'Value',   value: `${txHook.txData.value.eth} ETH`,       mono: false },
                { label: 'Gas',     value: txHook.txData.gasUsed ? `${txHook.txData.gasUsed.toLocaleString()} used / ${txHook.txData.gasLimit.toLocaleString()} limit` : `${txHook.txData.gasLimit.toLocaleString()} limit`, mono: false },
                { label: 'Fee',     value: txHook.txData.fee ? `${txHook.txData.fee.eth} ETH (${parseFloat(txHook.txData.gasPrice.gwei).toFixed(2)} Gwei)` : 'Pending', mono: false },
                { label: 'Nonce',   value: txHook.txData.nonce != null ? String(txHook.txData.nonce) : '—', mono: false },
              ] as const).map((row, i) => (
                <View key={i} style={eth.txRow}>
                  <Text style={eth.txRowLabel}>{row.label}</Text>
                  <Text style={[eth.txRowValue, row.mono && eth.txRowMono]} numberOfLines={1} ellipsizeMode="middle">{row.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={eth.footer}>
        <MaterialIcons name="verified-user" size={10} color={Colors.success} />
        <Text style={eth.footerText}>Ethereum Mainnet · Chain ID 1 · Live data via BTNG Edge Function</Text>
      </View>
    </View>
  );
}

const eth = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#627EEA55', overflow: 'hidden', shadowColor: '#627EEA', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: '#627EEA22', backgroundColor: '#627EEA0A' },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#627EEA18', borderWidth: 1.5, borderColor: '#627EEA55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconEmoji: { fontSize: 22, fontWeight: FontWeight.heavy, color: '#627EEA', includeFontPadding: false },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#627EEA', includeFontPadding: false },
  sub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#627EEA18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#627EEA55' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: '#627EEA', includeFontPadding: false, letterSpacing: 0.5 },
  tabRow: { flexDirection: 'row', margin: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: 2, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  tabBtnActive: { backgroundColor: '#627EEA' },
  tabText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: '#fff' },
  body: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.md },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: 8 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false },
  demoRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  demoChip: { backgroundColor: '#627EEA18', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#627EEA44' },
  demoChipText: { fontSize: 10, fontWeight: FontWeight.semibold, color: '#627EEA', includeFontPadding: false },
  lookupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#627EEA', borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: '#627EEA', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  lookupBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  errorText: { flex: 1, fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },
  resultCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#627EEA33', gap: Spacing.sm },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  resultIconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#627EEA18', borderWidth: 1.5, borderColor: '#627EEA55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resultIcon: { fontSize: 20, fontWeight: FontWeight.heavy, color: '#627EEA', includeFontPadding: false },
  resultAddr: { fontSize: 11, fontWeight: FontWeight.bold, color: '#627EEA', fontFamily: 'monospace', includeFontPadding: false },
  resultSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  balanceHero: { flexDirection: 'row', alignItems: 'baseline', gap: 6, justifyContent: 'center', paddingVertical: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: '#627EEA33' },
  balanceEth: { fontSize: 36, fontWeight: FontWeight.heavy, color: '#627EEA', includeFontPadding: false },
  balanceUnit: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: '#627EEA', includeFontPadding: false },
  statsGrid: { flexDirection: 'row', gap: Spacing.xs },
  statCell: { flex: 1, alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  statVal: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  statLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  tokenSection: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  tokenSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenSectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  tokenIconWrap: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#627EEA18', borderWidth: 1, borderColor: '#627EEA33', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tokenIconText: { fontSize: 10, fontWeight: FontWeight.heavy, color: '#627EEA', includeFontPadding: false },
  tokenSymbol: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tokenName: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  tokenBalance: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  emptyTokens: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  emptyTokensText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  netHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  netBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  netBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  netBlock: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  feeGrid: { flexDirection: 'row', gap: Spacing.sm },
  feeCell: { flex: 1, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1.5, alignItems: 'center', gap: 3 },
  feeCellIcon: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  feeCellGwei: { fontSize: 18, fontWeight: FontWeight.heavy, includeFontPadding: false },
  feeCellUnit: { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, marginTop: -2 },
  feeCellLabel: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  feeCellSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  feeCellUsd: { fontSize: 9, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  baseFeeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '44' },
  baseFeeText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.semibold, includeFontPadding: false },
  netFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  netFooterText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flex: 1 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', gap: 8 },
  txRowLabel: { width: 72, fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  txRowValue: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  txRowMono: { fontFamily: 'monospace', fontSize: 10, color: '#627EEA' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: '#627EEA18', backgroundColor: '#627EEA08' },
  footerText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flex: 1 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { flex: 1, alignItems: 'center' },
  topTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Stats strip
  statsStrip: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  stripItem: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  stripValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  stripLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  stripDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 6 },

  // Refresh progress
  refreshBar: { marginHorizontal: Spacing.xl, height: 2, backgroundColor: Colors.bgElevated, borderRadius: 1, marginBottom: Spacing.xs, overflow: 'hidden', position: 'relative', justifyContent: 'center', alignItems: 'flex-end' },
  refreshFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: Colors.primary, borderRadius: 1 },
  refreshText: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, zIndex: 1, marginRight: 2 },

  // Tabs
  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.xs, gap: 2 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: Radius.md },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },

  // Scroll
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  countBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '55' },
  countText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  // List card
  listCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, borderWidth: 1, borderColor: Colors.border },

  // Loading / empty
  loadingWrap: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  loadingText: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  emptyCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, includeFontPadding: false },

  // Detail card
  detailCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  detailHeaderIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  detailTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  genesisBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '55', marginTop: 4, alignSelf: 'flex-start' },
  genesisBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  detailSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  detailSectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  moreText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm, includeFontPadding: false },

  // Search
  searchCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  searchTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  searchSub: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false, marginTop: -8 },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, height: 50 },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, paddingHorizontal: Spacing.sm, includeFontPadding: false },
  searchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  searchBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  quickWrap: { gap: 8 },
  quickLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  quickChip: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '55' },
  quickChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  searchErrorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.errorBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.error + '44' },
  searchErrorText: { flex: 1, fontSize: FontSize.sm, color: Colors.error, lineHeight: 19, includeFontPadding: false },

  // Balance hero
  balHeroWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6, justifyContent: 'center', paddingVertical: Spacing.lg },
  balHeroAmt: { fontSize: 42, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  balHeroUnit: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Stats tab
  statsHeroCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  statsHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statsHeroTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  statsHeroNode: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false, marginTop: -8 },
  statsHeroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statsCell: { width: '23%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, alignItems: 'center', gap: 4, minWidth: 72 },
  statsCellIcon: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statsCellValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  statsCellLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // API rows
  apiRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
  apiMethod: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1 },
  apiMethodText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  apiPath: { fontSize: 11, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  apiDesc: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  viewGenesisBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, marginTop: Spacing.sm },
  viewGenesisBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Peer table
  peerTimeoutBadge: { backgroundColor: Colors.error + '18', borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.error + '44' },
  peerTimeoutText:  { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.error, includeFontPadding: false },
  peerHeader:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 2 },
  peerRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  peerHeaderText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  peerCol:         { flexShrink: 0 },
  peerColIp:       { flex: 3, gap: 3 },
  peerColLoc:      { flex: 3 },
  peerColStatus:   { flex: 2 },
  peerColLatency:  { flex: 1.5, alignItems: 'flex-end' as const },
  peerIp:          { fontSize: 10, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  peerRoleBadge:   { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: Colors.primary + '44', alignSelf: 'flex-start' as const },
  peerRoleText:    { fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  peerLocText:     { fontSize: 10, color: Colors.textSecondary, includeFontPadding: false },
  peerLiveText:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  peerLatencyText: { fontSize: 10, fontWeight: FontWeight.bold, textAlign: 'right' as const, includeFontPadding: false },

  // Mempool monitor
  mempoolBar:       { height: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, overflow: 'hidden', marginBottom: 4 },
  mempoolFill:      { height: '100%', borderRadius: Radius.full },
  mempoolCongLabel: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false, marginBottom: Spacing.sm },
  mempoolGrid:      { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  mempoolCell:      { flex: 1, minWidth: 72, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, alignItems: 'center', gap: 4 },
  mempoolCellIcon:  { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mempoolCellValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  mempoolCellLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  mempoolNote:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1 },
  mempoolNoteText:  { flex: 1, fontSize: 10, lineHeight: 15, includeFontPadding: false },

  // Gold Reserve card
  goldCard:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '66', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  goldCardHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  goldIconWrap:       { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  goldIconEmoji:      { fontSize: 22, includeFontPadding: false },
  goldCardTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  goldCardSub:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  goldRefreshBtn:     { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  goldValuationWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: 0 },
  goldValuationLeft:  { flex: 1, alignItems: 'center', gap: 2 },
  goldValuationRight: { flex: 1, alignItems: 'center', gap: 2 },
  goldValuationDivider: { width: 1, height: 44, backgroundColor: Colors.primary + '44' },
  goldAmountKg:       { fontSize: 28, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  goldAmountUnit:     { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  goldUsdValue:       { fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  goldUsdLabel:       { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  goldFields:         { gap: Spacing.sm },
  goldField:          { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  goldFieldIcon:      { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  goldFieldLabel:     { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false, marginBottom: 2 },
  goldFieldValue:     { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  goldFooter:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  goldFooterText:     { fontSize: 9, color: Colors.textMuted, fontStyle: 'italic', includeFontPadding: false, flex: 1 },
  goldFetchWrap:      { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  goldFetchBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  goldFetchBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  goldFetchSub:       { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  footerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '55' },
  footerNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, fontStyle: 'italic', includeFontPadding: false },

  // BTNG Hero Explorer Card
  heroExplorerCard:       { backgroundColor: '#0a0e17', borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 6 },
  heroExplorerHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' as const },
  heroExplorerTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, flex: 1 },
  heroExplorerBadge:      { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroExplorerBadgeText:  { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  heroLiveDot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  heroStatsGrid:          { flexDirection: 'row', flexWrap: 'wrap' as const, gap: Spacing.sm },
  heroStatCard:           { flex: 1, minWidth: '30%', backgroundColor: '#111b2a', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 5 },
  heroStatIcon:           { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroStatValue:          { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  heroStatLabel:          { fontSize: 9, color: '#8899aa', textAlign: 'center', includeFontPadding: false, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  heroExplorerFooter:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#1a2a3a' },
  heroExplorerFooterText: { flex: 1, fontSize: 9, color: '#556677', includeFontPadding: false },

  // RBF Inspector
  rbfCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#F59E0B44', gap: Spacing.md },
  rbfHeader:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rbfIconWrap:    { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F59E0B18', borderWidth: 1.5, borderColor: '#F59E0B55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rbfTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  rbfSub:         { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  rbfSourceBadge: { backgroundColor: '#F59E0B18', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#F59E0B55' },
  rbfSourceText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: '#F59E0B', includeFontPadding: false },
  rbfDemoChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#F59E0B12', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#F59E0B44' },
  rbfDemoText:    { fontSize: 11, fontWeight: FontWeight.semibold, color: '#F59E0B', includeFontPadding: false },
  rbfBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F59E0B', borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  rbfBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  rbfErrorBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  rbfErrorText:   { flex: 1, fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },
  rbfResultBox:   { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', gap: 0 },
  rbfStatusRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: Spacing.md },
  rbfStatusTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  rbfStatusSub:   { fontSize: 10, color: Colors.textSecondary, includeFontPadding: false, marginTop: 2, lineHeight: 14 },
  rbfField:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border + '66' },
  rbfFieldLabel:  { width: 90, fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  rbfFieldMono:   { flex: 1, fontSize: 10, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  rbfValueBadge:  { flex: 1, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1 },
  rbfValueText:   { fontSize: 10, fontFamily: 'monospace', includeFontPadding: false },
  rbfSourceNote:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  rbfSourceNoteText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontStyle: 'italic' },

  // RBF rich result
  rbfFullBadge:       { backgroundColor: '#F59E0B22', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#F59E0B66' },
  rbfFullBadgeText:   { fontSize: 8, fontWeight: FontWeight.heavy, color: '#F59E0B', letterSpacing: 0.5, includeFontPadding: false },

  rbfTxBlock:        { margin: 0, borderTopWidth: 1, borderTopColor: Colors.border + '66', paddingTop: Spacing.sm, gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  rbfTxBlockHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rbfTxBlockTitle:   { fontSize: 11, fontWeight: FontWeight.heavy, color: '#F59E0B', includeFontPadding: false },
  rbfTxBlockTime:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  rbfTxRow:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rbfTxRowLabel:     { width: 36, fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  rbfTxGrid:         { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' as const },
  rbfTxCell:         { flex: 1, minWidth: 64, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.xs + 2, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: Colors.border },
  rbfTxCellValue:    { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  rbfTxCellLabel:    { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  rbfNestedWrap:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, gap: 5, borderWidth: 1, borderColor: Colors.border },
  rbfNestedTitle:    { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  rbfNestedRow:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rbfNestedTxid:     { flex: 1, fontSize: 9, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  rbfNestedFeeBadge: { backgroundColor: '#F59E0B18', borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#F59E0B44' },
  rbfNestedFeeText:  { fontSize: 8, fontWeight: FontWeight.bold, color: '#F59E0B', includeFontPadding: false },

  rbfReplacesBlock:  { borderTopWidth: 1, borderTopColor: Colors.border + '66', paddingTop: Spacing.sm, gap: 6, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  rbfReplaceRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rbfReplaceIndex:   { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rbfReplaceIndexText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Fee Rate Estimator
  feeCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#22C55E44', gap: Spacing.md },
  feeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  feeIconWrap:   { width: 44, height: 44, borderRadius: 14, backgroundColor: '#22C55E18', borderWidth: 1.5, borderColor: '#22C55E55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feeCardTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  feeCardSub:    { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  feeRefreshBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#22C55E18', borderWidth: 1, borderColor: '#22C55E55', alignItems: 'center', justifyContent: 'center' },
  feeFetchBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22C55E', borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: '#22C55E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  feeFetchBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  feeErrorBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  feeErrorText:  { flex: 1, fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },
  feeGrid:       { flexDirection: 'row', gap: Spacing.sm },
  feeCell:       { flex: 1, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1.5, alignItems: 'center', gap: 3 },
  feeCellIcon:   { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  feeCellValue:  { fontSize: 18, fontWeight: FontWeight.heavy, includeFontPadding: false },
  feeCellUnit:   { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, marginTop: -2 },
  feeCellLabel:  { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  feeCellSub:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  feeFooter:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeFooterText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontStyle: 'italic' },

  // Broadcast tab
  bcastHeaderCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  bcastHeaderIcon:    { width: 48, height: 48, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bcastTitle:         { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  bcastSub:           { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false, marginTop: 4 },

  bcastInputCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  bcastInputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bcastInputLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  bcastByteCount:     { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44', includeFontPadding: false },
  bcastTextArea:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, fontSize: 11, color: Colors.primary, fontFamily: 'monospace', minHeight: 130, lineHeight: 18, includeFontPadding: false },
  bcastDemoChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  bcastDemoText:      { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  bcastSendBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  bcastSendBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },

  bcastErrorCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.errorBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.error + '55' },
  bcastErrorIconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.error + '18', borderWidth: 1, borderColor: Colors.error + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bcastErrorTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  bcastErrorMsg:      { fontSize: FontSize.sm, color: Colors.error, lineHeight: 19, includeFontPadding: false, marginTop: 3 },

  bcastResultCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.success + '55', gap: 0 },
  bcastResultHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.sm },
  bcastResultIconWrap:{ width: 48, height: 48, borderRadius: 15, backgroundColor: Colors.successBg, borderWidth: 1.5, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bcastResultTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  bcastResultRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.border + '66', gap: 8 },
  bcastResultLabel:   { width: 68, fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  bcastResultValue:   { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  bcastResultMono:    { flex: 1, fontSize: 10, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  bcastFullHashWrap:  { marginTop: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  bcastFullHashHeader:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  bcastFullHashTitle: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  bcastFullHash:      { fontSize: 10, color: Colors.primary, fontFamily: 'monospace', lineHeight: 16, includeFontPadding: false },
  bcastResultNote:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  bcastResultNoteText:{ flex: 1, fontSize: 10, color: Colors.textSecondary, lineHeight: 15, includeFontPadding: false },

  bcastGuideCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  bcastGuideRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  bcastGuideStep:     { width: 24, height: 24, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  bcastGuideStepText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  bcastGuideText:     { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },

  // Price ticker
  liveToggleBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  liveToggleBtnOn:  { backgroundColor: Colors.successBg, borderColor: Colors.success + '66' },
  liveToggleText:   { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  liveToggleTextOn: { color: Colors.success },

  tickerStrip: { marginHorizontal: Spacing.xl, marginBottom: 4, height: 36, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  tickerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, height: 36, gap: 0 },
  tickerLogo: { paddingHorizontal: 8, justifyContent: 'center' },
  tickerLogoText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  tickerDivider: { width: 1, height: 18, backgroundColor: Colors.border, marginHorizontal: 6 },
  tickerItem: { paddingHorizontal: 4, justifyContent: 'center', gap: 0 },
  tickerPairLabel: { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.3, includeFontPadding: false },
  tickerPrice: { fontSize: 12, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  tickerChange: { fontSize: 12, fontWeight: FontWeight.heavy, includeFontPadding: false },
  tickerChangeAbs: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  tickerSource: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },
  tickerRefreshNote: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  // Node Health Banners
  healthBannerYellow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: 4, paddingHorizontal: Spacing.md, paddingVertical: 9, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning + '66' },
  healthBannerTitle:  { fontSize: 12, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  healthBannerSub:    { fontSize: 9, color: Colors.warning, opacity: 0.75, includeFontPadding: false, marginTop: 1 },
  healthRetryBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '22', borderRadius: Radius.lg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.warning + '55' },
  healthRetryBtnText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  healthBannerGreen:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: 4, paddingHorizontal: Spacing.md, paddingVertical: 9, backgroundColor: Colors.successBg, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.success + '66' },
  healthBannerGreenText: { flex: 1, fontSize: 12, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  healthConnectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success + '22', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '55' },
  healthConnectedDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  healthConnectedBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.5, includeFontPadding: false },

  // Block Size Histogram
  histWrap:         { gap: 5, paddingTop: Spacing.xs },
  histRowWrap:      { gap: 1 },
  histRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  histValidator:    { fontSize: 8, color: Colors.textMuted, fontFamily: 'monospace', textAlign: 'right' as const, includeFontPadding: false, paddingLeft: 52 },
  histLabel:        { width: 44, fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false, textAlign: 'right' as const },
  histBarTrack:     { flex: 1, height: 16, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  histBarFill:      { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full, opacity: 0.85 },
  histBarFillPeak:  { backgroundColor: Colors.warning, opacity: 1 },
  histCount:        { width: 42, fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, textAlign: 'right' as const, includeFontPadding: false },
  histLegend:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.xs, flexWrap: 'wrap' as const },
  histLegendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  histLegendDot:    { width: 8, height: 8, borderRadius: 4 },
  histLegendText:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  histLegendMax:    { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, flex: 1, textAlign: 'right' },
  histFooter:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  histFooterText:   { fontSize: 9, color: Colors.textMuted, fontStyle: 'italic', includeFontPadding: false, flex: 1 },
});
