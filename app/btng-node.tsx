
// BTNG Sovereign Node Dashboard
// Connects to external node at 168.231.79.52:64799 (srv1282934.hstgr.cloud)
import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const NODE_URL = 'http://168.231.79.52:64799';

// ── Live Network Metrics (from Sovereign Network Status Report) ───────────────
const SOVEREIGN_METRICS = {
  mainReserveId: 'BTNG-54-39791045C086C7CB9FC6C17E42C4847D',
  secondaryCoinId: '1BTNG-AFT-54-QNTM-GENESIS-7C4B847D9FC6',
  mainReserveUSD: 29.5,   // Trillion
  secondaryReserveUSD: 30, // Trillion
  totalSovereignValue: 59.5, // Trillion
  goldTonnes: 399,
  activeServices: 35,
  validatorNodes: 892,
  txVolume: 45_800_000,
  blockHeight: 1_247_000,
  security: 'Post-Quantum ML-DSA',
  apiEndpoints: 5,
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface BlockchainInfo {
  network: string; height: number; totalSupply: number;
  goldReserve: { location: string; amount_kg: number; certificate: string };
  genesisHash: string; genesisTime: number;
  validatorCount: number; networkStatus: string;
  endpoint: string;
}

interface GoldReserve {
  certificate: string; location: string; amount_kg: number;
  purity: string; auditor: string; lastAudit: string;
  nextAudit: string; status: string;
}

interface Stats {
  network: string; height: number; hashRate: string;
  activeValidators: number; totalTransactions: number;
  pendingTransactions: number; blockTime: string;
  totalSupply: number; marketCap: number;
  genesisTransaction: string;
}

interface Transaction {
  hash: string; timestamp: number; from: string; to: string;
  amount: number; fee?: number; status: string; block?: number;
  memo?: string;
}

interface PriceData {
  currency: string; btngPrice: number; goldPrice: number;
  backingRatio: string; lastUpdate: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function nodeGet(path: string) {
  const res = await fetch(`${NODE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function nodePost(path: string, body: object) {
  const res = await fetch(`${NODE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function shortHash(h: string) {
  if (!h) return '—';
  return `${h.slice(0, 12)}...${h.slice(-8)}`;
}

function fmtTime(ts: number) {
  if (!ts) return '—';
  return new Date(ts > 1e10 ? ts : ts * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = Colors.primary }: {
  icon: string; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={[sc.card, { borderColor: color + '33' }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      {sub ? <Text style={sc.sub}>{sub}</Text> : null}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 5, minWidth: 90,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  value: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false, textAlign: 'center' },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  sub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
});

// ── SSH Command Row (must be a component — cannot use useState inside .map) ───────
function SshCmdRow({ label, cmd }: { label: string; cmd: string }) {
  const [cpd, setCpd] = useState(false);
  return (
    <View style={sshRow.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>{label}</Text>
        <Text style={{ fontSize: 11, color: '#7CFC00', fontFamily: 'monospace', includeFontPadding: false }} numberOfLines={1}>{cmd}</Text>
      </View>
      <TouchableOpacity
        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: cpd ? Colors.successBg : '#22C55E18', borderWidth: 1, borderColor: cpd ? Colors.success + '44' : '#22C55E44', alignItems: 'center', justifyContent: 'center' }}
        onPress={() => { Clipboard.setStringAsync(cmd).catch(()=>{}); setCpd(true); setTimeout(() => setCpd(false), 2000); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name={cpd ? 'check' : 'content-copy'} size={13} color={cpd ? Colors.success : '#22C55E'} />
      </TouchableOpacity>
    </View>
  );
}
const sshRow = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#050507', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: '#22C55E22', marginBottom: 6 },
});

// ── Copy Row ──────────────────────────────────────────────────────────────────
function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={cr.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={cr.label}>{label}</Text>
        <Text style={[cr.value, mono && cr.mono]} numberOfLines={2}>{value || '—'}</Text>
      </View>
      <TouchableOpacity
        style={[cr.btn, copied && cr.btnDone]}
        onPress={() => { Clipboard.setStringAsync(value).catch(()=>{}); setCopied(true); setTimeout(() => setCopied(false), 2200); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name={copied ? 'check-circle' : 'content-copy'} size={14} color={copied ? Colors.success : Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const cr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
  label: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  value: { fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  btn: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  btnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
});

// ── TX Row ────────────────────────────────────────────────────────────────────
function TxRow({ tx }: { tx: Transaction }) {
  const [copied, setCopied] = useState(false);
  const statusColor = tx.status === 'confirmed' ? Colors.success : tx.status === 'pending' ? Colors.warning : Colors.error;
  return (
    <TouchableOpacity
      style={tx_s.row}
      onLongPress={() => { Clipboard.setStringAsync(tx.hash).catch(()=>{}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      activeOpacity={0.75}
    >
      <View style={[tx_s.typeDot, { backgroundColor: statusColor + '22', borderColor: statusColor + '66' }]}>
        <MaterialIcons name={tx.status === 'confirmed' ? 'check-circle' : 'pending'} size={14} color={statusColor} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={tx_s.hashRow}>
          <Text style={tx_s.hash} numberOfLines={1}>{shortHash(tx.hash)}</Text>
          <View style={[tx_s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
            <Text style={[tx_s.statusText, { color: statusColor }]}>{tx.status}</Text>
          </View>
        </View>
        <Text style={tx_s.meta} numberOfLines={1}>
          {tx.from.slice(0, 12)}… → {tx.to.slice(0, 12)}…
          {tx.block != null ? `  ·  Block #${tx.block}` : ''}
        </Text>
        <Text style={tx_s.time}>{fmtTime(tx.timestamp)}</Text>
      </View>
      <View style={tx_s.amtWrap}>
        <Text style={[tx_s.amount, { color: Colors.primary }]}>{tx.amount} BTNG</Text>
        {tx.fee ? <Text style={tx_s.fee}>fee {tx.fee}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const tx_s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  typeDot: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hashRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  hash: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace', includeFontPadding: false, flex: 1 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  statusText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  meta: { fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: 'monospace', includeFontPadding: false },
  time: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  amtWrap: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  amount: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  fee: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
type Tab = 'overview' | 'explorer' | 'balance' | 'send';

export default function BtngNodeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('overview');
  const [demoMode, setDemoMode] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoRetryActive, setAutoRetryActive] = useState(false);
  const [showConnectedBanner, setShowConnectedBanner] = useState(false);
  const [lastAttemptTime, setLastAttemptTime] = useState<string | null>(null);
  const prevNodeOnlineRef = useRef<boolean | null>(null);
  const RETRY_INTERVAL = 30;

  // Ref so startRetry can call fetchAll before fetchAll is declared
  const fetchAllRef = useRef<(isRefresh?: boolean) => void>(() => {});

  // Demo data constants
  const DEMO_INFO: BlockchainInfo = { network: 'BTNG Sovereign Mainnet', height: 1247000, totalSupply: 21000000, goldReserve: { location: 'Bank of Ghana Vault 001, Accra', amount_kg: 500, certificate: 'BG-2026-001-GH' }, genesisHash: '0x1111111111111111111111111111111111111111111111111111111111111111', genesisTime: 1739877374, validatorCount: 892, networkStatus: 'DEMO', endpoint: NODE_URL };
  const DEMO_GOLD: GoldReserve = { certificate: 'BG-2026-001-GH', location: 'Bank of Ghana Vault 001, Accra', amount_kg: 500, purity: '99.99%', auditor: 'International Gold Council', lastAudit: 'February 18, 2026', nextAudit: 'August 18, 2026', status: 'verified' };
  const DEMO_STATS: Stats = { network: 'BTNG Sovereign Mainnet', height: 1247000, hashRate: '1.24 TH/s', activeValidators: 892, totalTransactions: 45800000, pendingTransactions: 3, blockTime: '60 seconds', totalSupply: 21000000, marketCap: 4720000, genesisTransaction: '0x1111111111111111111111111111111111111111111111111111111111111111' };
  const DEMO_GENESIS: Transaction = { hash: '0x1111111111111111111111111111111111111111111111111111111111111111', timestamp: 1739877374, from: 'BTNG1GENESIS123456789012345678901234567890', to: 'BTNG1SOVEREIGN123456789012345678901234567890', amount: 1, status: 'confirmed', block: 0, memo: 'BTNG Sovereign Genesis - Bank of Ghana Vault 001 - Accra' };
  const DEMO_PRICE: PriceData = { currency: 'USD', btngPrice: 4.72, goldPrice: 3200, backingRatio: '500kg BoG', lastUpdate: Date.now() };

  const [refreshing, setRefreshing] = useState(false);
  const [nodeOnline, setNodeOnline] = useState<boolean | null>(null);

  // Data
  const [info, setInfo] = useState<BlockchainInfo | null>(null);
  const [gold, setGold] = useState<GoldReserve | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [txList, setTxList] = useState<Transaction[]>([]);
  const [genesis, setGenesis] = useState<Transaction | null>(null);
  const [price, setPrice] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [showSovereignPanel, setShowSovereignPanel] = useState(true);
  const [autoPolling, setAutoPolling] = useState(false);
  const [pollCountdown, setPollCountdown] = useState(30);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Balance tab
  const [balAddr, setBalAddr] = useState('BTNG1DEMO123456789012345678901234567890');
  const [balResult, setBalResult] = useState<{ balance: number; address: string } | null>(null);
  const [balLoading, setBalLoading] = useState(false);

  // Send tab
  const [sendFrom, setSendFrom] = useState('BTNG1DEMO123456789012345678901234567890');
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ hash: string; amount: number; status: string } | null>(null);

  // Auto-activate demo mode after 5 seconds offline so app always works
  useEffect(() => {
    if (nodeOnline === false && !demoMode && !info) {
      const t = setTimeout(() => { activateDemoMode(); }, 5000);
      return () => clearTimeout(t);
    }
  }, [nodeOnline, demoMode, info]);

  const activateDemoMode = useCallback(() => {
    setDemoMode(true);
    setInfo(DEMO_INFO);
    setGold(DEMO_GOLD);
    setStats(DEMO_STATS);
    setGenesis(DEMO_GENESIS);
    setPrice(DEMO_PRICE);
    setTxList([]);
    setLoading(false);
    setLastFetched(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, [DEMO_INFO, DEMO_GOLD, DEMO_STATS, DEMO_GENESIS, DEMO_PRICE]);

  const stopAutoRetry = useCallback(() => {
    if (autoRetryRef.current) { clearInterval(autoRetryRef.current); autoRetryRef.current = null; }
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    setAutoRetryActive(false);
    setRetryCountdown(0);
  }, []);

  const startRetry = useCallback((secs = 30) => {
    setRetryCountdown(secs);
    setAutoRetryActive(true);
    if (retryRef.current) clearInterval(retryRef.current);
    if (autoRetryRef.current) clearInterval(autoRetryRef.current);
    // Countdown ticker — resets back to 30 on each cycle
    retryRef.current = setInterval(() => {
      setRetryCountdown(p => { if (p <= 1) { return 30; } return p - 1; });
    }, 1000);
    // Auto-retry every 30 seconds via ref (avoids circular dep with fetchAll)
    autoRetryRef.current = setInterval(() => { fetchAllRef.current(false); }, 30000);
  }, []);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setLastAttemptTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    try {
      const [infoRes, goldRes, statsRes, txRes, genesisRes, priceRes] = await Promise.allSettled([
        nodeGet('/api/v1/blockchain/info'),
        nodeGet('/api/v1/gold/reserve'),
        nodeGet('/api/v1/stats'),
        nodeGet('/api/v1/transactions/latest?count=15'),
        nodeGet('/api/v1/genesis'),
        nodeGet('/api/v1/price'),
      ]);
      if (infoRes.status === 'fulfilled') { setInfo(infoRes.value); setNodeOnline(true); }
      else { setNodeOnline(false); }
      if (goldRes.status === 'fulfilled') setGold(goldRes.value);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (txRes.status === 'fulfilled') setTxList(txRes.value?.transactions ?? []);
      if (genesisRes.status === 'fulfilled') setGenesis(genesisRes.value?.transaction ?? null);
      if (priceRes.status === 'fulfilled') setPrice(priceRes.value);
      setLastFetched(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      setNodeOnline(false);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  // Keep fetchAllRef in sync
  useEffect(() => { fetchAllRef.current = fetchAll; }, [fetchAll]);

  useEffect(() => { fetchAll(false); }, [fetchAll]);
  useEffect(() => () => {
    if (retryRef.current) clearInterval(retryRef.current);
    if (autoRetryRef.current) clearInterval(autoRetryRef.current);
  }, []);

  // Detect node coming back online after being offline — show banner + stop retry loop + insert notification
  useEffect(() => {
    const prev = prevNodeOnlineRef.current;
    prevNodeOnlineRef.current = nodeOnline;
    if (prev === false && nodeOnline === true) {
      stopAutoRetry();
      setShowConnectedBanner(true);
      const t = setTimeout(() => setShowConnectedBanner(false), 4500);
      // Insert system notification so user sees it even after navigating away
      if (user?.id) {
        const reconnectedAt = new Date().toLocaleString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        getSupabaseClient()
          .from('notifications')
          .insert({
            user_id: user.id,
            type: 'success',
            category: 'system',
            title: 'BTNG Node Online',
            message: `srv1282934.hstgr.cloud (168.231.79.52) reconnected at ${reconnectedAt}.`,
            is_read: false,
          })
          .then(() => {});
      }
      return () => clearTimeout(t);
    } else if (prev === true && nodeOnline === false) {
      // Node just went offline — insert warning notification
      if (user?.id) {
        const offlineAt = new Date().toLocaleString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        getSupabaseClient()
          .from('notifications')
          .insert({
            user_id: user.id,
            type: 'warning',
            category: 'system',
            title: 'BTNG Node Offline',
            message: `srv1282934.hstgr.cloud (168.231.79.52) became unreachable at ${offlineAt}. Auto-retry started.`,
            is_read: false,
          })
          .then(() => {});
      }
    }
  }, [nodeOnline, stopAutoRetry, user]);

  // ── Auto-poll every 30s on Overview tab ──────────────────────────────────
  const pollStats = useCallback(async () => {
    if (!nodeOnline) return;
    try {
      const [statsRes, txRes] = await Promise.allSettled([
        nodeGet('/api/v1/stats'),
        nodeGet('/api/v1/transactions/latest?count=15'),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (txRes.status === 'fulfilled') setTxList(txRes.value?.transactions ?? []);
      setLastFetched(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch { /* silent */ }
  }, [nodeOnline]);

  useEffect(() => {
    if (tab !== 'overview' || nodeOnline === false) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
      setAutoPolling(false);
      setPollCountdown(30);
      return;
    }
    setAutoPolling(true);
    setPollCountdown(30);

    // Countdown ticker
    countdownIntervalRef.current = setInterval(() => {
      setPollCountdown(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);

    // Poll every 30s
    pollIntervalRef.current = setInterval(() => {
      setPollCountdown(30);
      pollStats();
    }, 30000);

    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    };
  }, [tab, nodeOnline, pollStats]);

  const handleCheckBalance = useCallback(async () => {
    if (!balAddr.trim()) return;
    setBalLoading(true); setBalResult(null);
    try {
      const data = await nodeGet(`/api/v1/balance/${balAddr.trim()}`);
      setBalResult(data);
    } catch {
      showAlert('Error', 'Could not reach BTNG node. Check network connectivity to 168.231.79.52:64799 (srv1282934.hstgr.cloud)');
    }
    setBalLoading(false);
  }, [balAddr, showAlert]);

  const handleSend = useCallback(async () => {
    if (!sendFrom.trim() || !sendTo.trim() || !sendAmount.trim()) {
      showAlert('Missing Fields', 'Please fill in all transaction fields.');
      return;
    }
    const amt = parseFloat(sendAmount);
    if (isNaN(amt) || amt <= 0) {
      showAlert('Invalid Amount', 'Enter a valid BTNG amount greater than 0.');
      return;
    }
    setSendLoading(true); setSendResult(null);
    try {
      const data = await nodePost('/api/v1/transaction/send', {
        from: sendFrom.trim(),
        to: sendTo.trim(),
        amount: amt,
        fee: 0.001,
      });
      if (data.success && data.transaction) {
        setSendResult({ hash: data.transaction.hash, amount: amt, status: data.transaction.status });
        showAlert('Transaction Broadcast', `TX hash: ${data.transaction.hash.slice(0, 20)}…`);
      } else {
        showAlert('Send Failed', data.error || 'Unknown error from node.');
      }
    } catch {
      showAlert('Node Unreachable', 'Cannot connect to 168.231.79.52:64799. Ensure the node is running.');
    }
    setSendLoading(false);
  }, [sendFrom, sendTo, sendAmount, showAlert]);

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'overview', icon: 'account-balance', label: 'Overview' },
    { key: 'explorer', icon: 'search', label: 'Explorer' },
    { key: 'balance', icon: 'account-balance-wallet', label: 'Balance' },
    { key: 'send', icon: 'send', label: 'Send' },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.topTitle}>BTNG Sovereign Node</Text>
            {demoMode ? (
              <View style={{ backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '55' }}>
                <Text style={{ fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false }}>DEMO</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.topSub} numberOfLines={1} ellipsizeMode="tail">168.231.79.52 · srv1282934.hstgr.cloud</Text>
        </View>
        <View style={[s.statusBadge,
          nodeOnline === true && s.statusOnline,
          nodeOnline === false && s.statusOffline,
        ]}>
          <View style={[s.statusDot,
            nodeOnline === true && { backgroundColor: Colors.success },
            nodeOnline === false && { backgroundColor: Colors.error },
            nodeOnline === null && { backgroundColor: Colors.warning },
          ]} />
          <Text style={[s.statusText,
            nodeOnline === true && { color: Colors.success },
            nodeOnline === false && { color: Colors.error },
            nodeOnline === null && { color: Colors.warning },
          ]}>
            {nodeOnline === true ? 'Live' : nodeOnline === false ? 'Offline' : 'Checking'}
          </Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <MaterialIcons name={t.icon as any} size={14} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchAll(true)}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {loading && !info ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.loadingText}>Connecting to BTNG Sovereign Node…</Text>
            <Text style={s.loadingEndpoint}>168.231.79.52:64799</Text>
          </View>
        ) : nodeOnline === false && !info && !demoMode ? (
          <> {/* Added Fragment here */}
            <View style={{ gap: Spacing.md, paddingTop: Spacing.sm }}>
              <View style={[s.offlineCard, { flexDirection: 'row', alignItems: 'center', marginTop: 0, padding: Spacing.lg }]}>
                <View style={{ width: 50, height: 50, borderRadius: 15, backgroundColor: Colors.error + '18', borderWidth: 1, borderColor: Colors.error + '44', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="wifi-off" size={26} color={Colors.error} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={s.offlineTitle}>Node Unreachable</Text>
                  <Text style={[s.offlineSub, { textAlign: 'left', fontSize: FontSize.xs, fontFamily: 'monospace' }]}>168.231.79.52 {'·'} srv1282934.hstgr.cloud</Text>
                </View>
                <View style={[s.statusBadge, s.statusOffline]}>
                  <View style={[s.statusDot, { backgroundColor: Colors.error }]} />
                  <Text style={[s.statusText, { color: Colors.error }]}>Offline</Text>
                </View>
              </View>
              <View style={s.demoCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                  <View style={s.demoIconWrap}>
                    <MaterialIcons name="play-circle" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.demoCardTitle}>View in Demo Mode</Text>
                    <Text style={s.demoCardSub}>Explore the full dashboard with sovereign mock data while your server is offline</Text>
                  </View>
                </View>
                <TouchableOpacity style={s.demoBtn} onPress={activateDemoMode} activeOpacity={0.85}>
                  <MaterialIcons name="visibility" size={16} color={Colors.bg} />
                  <Text style={s.demoBtnText}>Launch Demo Mode</Text>
                </TouchableOpacity>
              </View>
              <View style={s.retryCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: Spacing.sm }}>
                  <MaterialIcons name="refresh" size={15} color={Colors.warning} />
                  <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false }}>Reconnect to Node</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' }}>
                  <TouchableOpacity style={s.retryBtn} onPress={() => { fetchAll(false); startRetry(30); }} activeOpacity={0.85}>
                    <MaterialIcons name="refresh" size={15} color={Colors.bg} />
                    <Text style={s.retryBtnText}>Retry Now</Text>
                  </TouchableOpacity>
                  {autoRetryActive && retryCountdown > 0 ? (
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.warning + '44', alignSelf: 'flex-start' }}>
                        <MaterialIcons name="schedule" size={12} color={Colors.warning} />
                        <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.warning, includeFontPadding: false }}>Auto-retry in {retryCountdown}s</Text>
                      </View>
                      <View style={{ height: 3, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: 3, borderRadius: 2, backgroundColor: Colors.warning, width: `${((RETRY_INTERVAL - retryCountdown) / RETRY_INTERVAL) * 100}%` as any }} />
                      </View>
                      <TouchableOpacity onPress={stopAutoRetry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                        <MaterialIcons name="close" size={11} color={Colors.textMuted} />
                        <Text style={{ fontSize: 10, color: Colors.textMuted, includeFontPadding: false }}>Stop auto-retry</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              {lastAttemptTime ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <MaterialIcons name="history" size={11} color={Colors.textMuted} />
                  <Text style={{ fontSize: 10, color: Colors.textMuted, includeFontPadding: false }}>Last attempted: <Text style={{ fontFamily: 'monospace', color: Colors.textSecondary }}>{lastAttemptTime}</Text></Text>
                </View>
              ) : null}
              </View>
              <View style={s.sshCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#22C55E18', borderWidth: 1, borderColor: '#22C55E44', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="terminal" size={18} color="#22C55E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false }}>Start Your Node</Text>
                    <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false }}>SSH into srv1282934.hstgr.cloud and run:</Text>
                  </View>
                </View>
                {[
                  { label: '1. SSH into server',              cmd: 'ssh root@168.231.79.52' },
                  { label: '2. Start with PM2 (recommended)', cmd: 'pm2 start /opt/btng-node/server.js --name btng-node' },
                  { label: '3. Or start directly',            cmd: 'cd /opt/btng-node && node server.js' },
                  { label: '4. Check PM2 status',             cmd: 'pm2 status btng-node' },
                  { label: '5. View live logs',               cmd: 'pm2 logs btng-node --lines 20' },
                  { label: '6. Verify endpoint',              cmd: 'curl http://168.231.79.52:64799/api/v1/stats' },
                ].map((item, i) => (
                  <SshCmdRow key={i} label={item.label} cmd={item.cmd} />
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.warning + '44', marginTop: Spacing.xs }}>
                  <MaterialIcons name="info-outline" size={12} color={Colors.warning} />
                  <Text style={{ flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 16, includeFontPadding: false }}>Make sure UFW port 64799 is open: <Text style={{ fontFamily: 'monospace' }}>ufw allow 64799/tcp</Text></Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* ── Node Connected Banner ─────────────────────────────────── */}
            {showConnectedBanner && (
              <View style={s.connectedBanner}>
                <MaterialIcons name="wifi" size={18} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={s.connectedBannerTitle}>Node Connected</Text>
                  <Text style={s.connectedBannerSub}>168.231.79.52:64799 · srv1282934.hstgr.cloud is live</Text>
                </View>
                <TouchableOpacity onPress={() => setShowConnectedBanner(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={16} color={Colors.success} />
                </TouchableOpacity>
              </View>
            )}
            {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
            {tab === 'overview' && (
              <>
                {/* ── Sovereign Network Banner ──────────────────────────── */}
                {showSovereignPanel && (
                  <View style={s.sovereignBanner}>
                    <View style={s.sovereignBannerTop}>
                      <View style={s.sovereignBannerLeft}>
                        <View style={s.sovereignLiveDot} />
                        <Text style={s.sovereignBannerTitle}>BTNG SOVEREIGN NETWORK</Text>
                      </View>
                      <TouchableOpacity onPress={() => setShowSovereignPanel(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <View style={s.sovereignGrid}>
                      {[
                        { label: 'Total Sovereign Value', value: `$${SOVEREIGN_METRICS.totalSovereignValue}T`, color: Colors.primary },
                        { label: 'Main Reserve', value: `$${SOVEREIGN_METRICS.mainReserveUSD}T`, color: '#22C55E' },
                        { label: 'Secondary Coin', value: `$${SOVEREIGN_METRICS.secondaryReserveUSD}T`, color: '#3B82F6' },
                        { label: 'Gold Backing', value: `${SOVEREIGN_METRICS.goldTonnes}+ Tonnes`, color: Colors.warning },
                        { label: 'Validators Active', value: `${SOVEREIGN_METRICS.validatorNodes.toLocaleString()}`, color: '#A855F7' },
                        { label: 'TX Volume', value: `${(SOVEREIGN_METRICS.txVolume / 1e6).toFixed(1)}M`, color: Colors.success },
                        { label: 'Block Height', value: `${(SOVEREIGN_METRICS.blockHeight / 1000).toFixed(0)}K+`, color: Colors.primary },
                        { label: 'Security', value: 'Post-Quantum', color: '#22C55E' },
                      ].map(item => (
                        <View key={item.label} style={[s.sovereignCell, { borderColor: item.color + '33' }]}>
                          <Text style={[s.sovereignCellValue, { color: item.color }]}>{item.value}</Text>
                          <Text style={s.sovereignCellLabel}>{item.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={s.sovereignIdRow}>
                      <Text style={s.sovereignIdLabel}>IPv4:</Text>
                    <Text style={s.sovereignIdValue}>168.231.79.52:64799 · srv1282934.hstgr.cloud</Text>
                  </View>
                  <View style={s.sovereignIdRow}>
                    <Text style={s.sovereignIdLabel}>IPv6:</Text>
                    <Text style={s.sovereignIdValue}>2a02:4780:f:bc::1 · srv1282934.hstgr.cloud</Text>
                  </View>
                  <View style={s.sovereignIdRow}>
                    <Text style={s.sovereignIdLabel}>Main Reserve ID:</Text>
                      <Text style={s.sovereignIdValue} numberOfLines={1}>{SOVEREIGN_METRICS.mainReserveId}</Text>
                    </View>
                    <View style={s.sovereignIdRow}>
                      <Text style={s.sovereignIdLabel}>Secondary Coin:</Text>
                      <Text style={s.sovereignIdValue} numberOfLines={1}>{SOVEREIGN_METRICS.secondaryCoinId}</Text>
                    </View>
                    <View style={[s.sovereignStatusRow]}>
                      <MaterialIcons name="verified" size={12} color={Colors.success} />
                      <Text style={s.sovereignStatusText}>ALL SYSTEMS FULLY OPERATIONAL · 35 ACTIVE SERVICES · 5 API ENDPOINTS LIVE</Text>
                    </View>
                  </View>
                )}

                {/* Hero */}
                <View style={s.heroCard}>
                  <View style={s.heroIconWrap}>
                    <Text style={{ fontSize: 36 }}>🏦</Text>
                  </View>
                  <View style={s.heroCenter}>
                    <Text style={s.heroNetwork}>{info?.network ?? 'BTNG Sovereign Mainnet'}</Text>
                    <Text style={s.heroEndpoint}>168.231.79.52 (IPv4) · 2a02:4780:f:bc::1 (IPv6)</Text>
                  </View>
                  <View style={[s.heroPill, nodeOnline ? s.heroPillOnline : demoMode ? s.heroPillDemo : s.heroPillOff]}>
                    <View style={[s.heroPillDot, nodeOnline ? { backgroundColor: Colors.success } : demoMode ? { backgroundColor: Colors.primary } : { backgroundColor: Colors.error }]} />
                    <Text style={[s.heroPillText, nodeOnline ? { color: Colors.success } : demoMode ? { color: Colors.primary } : { color: Colors.error }]}>
                      {nodeOnline ? 'ACTIVE' : demoMode ? 'DEMO' : 'OFFLINE'}
                    </Text>
                  </View>
                </View>

                {/* Price Strip */}
                {price && (
                  <View style={s.priceStrip}>
                    <View style={s.priceItem}>
                      <Text style={s.priceLabel}>BTNG Price</Text>
                      <Text style={s.priceValue}>${price.btngPrice.toFixed(2)}</Text>
                    </View>
                    <View style={s.priceDivider} />
                    <View style={s.priceItem}>
                      <Text style={s.priceLabel}>Gold/oz</Text>
                      <Text style={s.priceValue}>${price.goldPrice.toFixed(0)}</Text>
                    </View>
                    <View style={s.priceDivider} />
                    <View style={s.priceItem}>
                      <Text style={s.priceLabel}>Backing</Text>
                      <Text style={[s.priceValue, { color: Colors.success }]}>{price.backingRatio}</Text>
                    </View>
                    <View style={s.priceDivider} />
                    <View style={s.priceItem}>
                      <Text style={s.priceLabel}>Mkt Cap</Text>
                      <Text style={s.priceValue}>${stats ? (stats.marketCap / 1e6).toFixed(1) + 'M' : '—'}</Text>
                    </View>
                  </View>
                )}

                {/* Stats Grid */}
                {stats && (
                  <View style={s.statsGrid}>
                    <StatCard icon="view-stream" label="Block Height" value={`#${stats.height}`} color={Colors.primary} />
                    <StatCard icon="receipt-long" label="Transactions" value={String(stats.totalTransactions)} color="#3B82F6" />
                    <StatCard icon="pending" label="Pending TXs" value={String(stats.pendingTransactions)} color={Colors.warning} />
                    <StatCard icon="speed" label="Hash Rate" value={stats.hashRate} color="#22C55E" />
                    <StatCard icon="people" label="Validators" value={String(stats.activeValidators)} color="#A855F7" />
                    <StatCard icon="schedule" label="Block Time" value={stats.blockTime} color={Colors.textSecondary} />
                  </View>
                )}

                {/* Total Supply */}
                {info && (
                  <View style={s.supplyCard}>
                    <View style={s.supplyRow}>
                      <MaterialIcons name="monetization-on" size={18} color={Colors.primary} />
                      <Text style={s.supplyLabel}>Total Supply</Text>
                      <Text style={s.supplyValue}>{info.totalSupply.toLocaleString()} BTNG</Text>
                    </View>
                  </View>
                )}

                {/* Gold Reserve Card */}
                {gold && (
                  <View style={s.goldCard}>
                    <View style={s.goldHeader}>
                      <View style={s.goldIconWrap}>
                        <Text style={{ fontSize: 22 }}>🥇</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.goldTitle}>Gold Reserve Certificate</Text>
                        <Text style={s.goldCert}>{gold.certificate}</Text>
                      </View>
                      <View style={[s.goldVerified, gold.status === 'verified' && s.goldVerifiedActive]}>
                        <MaterialIcons name="verified" size={12} color={gold.status === 'verified' ? Colors.success : Colors.textMuted} />
                        <Text style={[s.goldVerifiedText, gold.status === 'verified' && { color: Colors.success }]}>
                          {gold.status?.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={s.goldBody}>
                      <View style={s.goldRow}><Text style={s.goldRowLabel}>Location</Text><Text style={s.goldRowValue}>{gold.location}</Text></View>
                      <View style={s.goldDivider} />
                      <View style={s.goldRow}><Text style={s.goldRowLabel}>Amount</Text><Text style={[s.goldRowValue, { color: Colors.primary, fontWeight: FontWeight.bold }]}>{gold.amount_kg} kg ({gold.purity} pure)</Text></View>
                      <View style={s.goldDivider} />
                      <View style={s.goldRow}><Text style={s.goldRowLabel}>Auditor</Text><Text style={s.goldRowValue}>{gold.auditor}</Text></View>
                      <View style={s.goldDivider} />
                      <View style={s.goldRow}><Text style={s.goldRowLabel}>Last Audit</Text><Text style={s.goldRowValue}>{gold.lastAudit}</Text></View>
                      <View style={s.goldDivider} />
                      <View style={s.goldRow}><Text style={s.goldRowLabel}>Next Audit</Text><Text style={s.goldRowValue}>{gold.nextAudit}</Text></View>
                    </View>
                  </View>
                )}

                {/* Genesis Transaction */}
                {genesis && (
                  <View style={s.genesisCard}>
                    <View style={s.genesisHeader}>
                      <View style={s.genesisIconWrap}>
                        <MaterialIcons name="star" size={18} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.genesisTitle}>Genesis Transaction</Text>
                        <Text style={s.genesisSub}>February 18, 2026 · 18:36:14 Ghana Time</Text>
                      </View>
                      <View style={s.genesisBadge}>
                        <Text style={s.genesisBadgeText}>Block #0</Text>
                      </View>
                    </View>
                    <View style={s.genesisBody}>
                      <CopyRow label="TX Hash" value={genesis.hash} mono />
                      <View style={s.goldDivider} />
                      <CopyRow label="From" value={genesis.from} mono />
                      <View style={s.goldDivider} />
                      <CopyRow label="To" value={genesis.to} mono />
                      <View style={s.goldDivider} />
                      <View style={s.genesisAmtRow}>
                        <Text style={s.genesisAmtLabel}>Amount</Text>
                        <Text style={s.genesisAmt}>{genesis.amount} BTNG</Text>
                      </View>
                      {genesis.memo ? (
                        <>
                          <View style={s.goldDivider} />
                          <View style={[cr.row, { paddingVertical: Spacing.sm }]}>
                            <View style={{ flex: 1, gap: 2 }}>
                              <Text style={cr.label}>Memo</Text>
                              <Text style={cr.value}>{genesis.memo}</Text>
                            </View>
                          </View>
                        </>
                      ) : null}
                    </View>
                    <View style={s.genesisNote}>
                      <MaterialIcons name="auto-awesome" size={12} color={Colors.primary} />
                      <Text style={s.genesisNoteText}>
                        First sovereign BTNG transaction on African infrastructure · Bank of Ghana Vault 001 · Accra
                      </Text>
                    </View>
                  </View>
                )}

                {/* Auto-poll status bar */}
                {autoPolling && nodeOnline && (
                  <View style={s.autoPollBar}>
                    <View style={s.autoPollLeft}>
                      <View style={s.autoPollDot} />
                      <Text style={s.autoPollText}>Live · auto-refresh in {pollCountdown}s</Text>
                    </View>
                    <View style={s.autoPollTrack}>
                      <View style={[s.autoPollFill, { width: `${((30 - pollCountdown) / 30) * 100}%` as any }]} />
                    </View>
                    {lastFetched && (
                      <Text style={s.autoPollUpdated}>Updated {lastFetched}</Text>
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── EXPLORER ───────────────────────────────────────────────────── */}
            {tab === 'explorer' && (
              <>
                <View style={s.explorerHeader}>
                  <MaterialIcons name="history" size={16} color={Colors.primary} />
                  <Text style={s.explorerTitle}>Recent Transactions</Text>
                  <View style={s.explorerCountBadge}>
                    <Text style={s.explorerCountText}>{txList.length}</Text>
                  </View>
                </View>

                {txList.length === 0 ? (
                  <View style={s.emptyCard}>
                    <MaterialIcons name="receipt-long" size={40} color={Colors.textMuted} />
                    <Text style={s.emptyText}>No transactions yet</Text>
                    <Text style={s.emptySubText}>Transactions will appear here once the node receives them</Text>
                  </View>
                ) : (
                  <View style={s.txCard}>
                    {txList.map((tx, i) => (
                      <TxRow key={`${tx.hash}-${i}`} tx={tx} />
                    ))}
                  </View>
                )}

                {/* Node endpoint info */}
                <View style={s.endpointCard}>
                  <View style={s.endpointRow}>
                    <MaterialIcons name="router" size={14} color={Colors.primary} />
                    <Text style={s.endpointLabel}>Node Endpoint</Text>
                  </View>
                  <Text style={s.endpointValue}>{NODE_URL}</Text>
                  <View style={s.endpointApiRow}>
                    {[
                      '/api/v1/blockchain/info',
                      '/api/v1/stats',
                      '/api/v1/genesis',
                      '/api/v1/gold/reserve',
                      '/api/v1/transactions/latest',
                      '/api/v1/price',
                    ].map(ep => (
                      <View key={ep} style={s.endpointChip}>
                        <Text style={s.endpointChipText}>{ep}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

            {/* ── BALANCE ────────────────────────────────────────────────────── */}
            {tab === 'balance' && (
              <>
                <View style={s.balCard}>
                  <View style={s.balHeader}>
                    <View style={s.balIconWrap}>
                      <MaterialIcons name="account-balance-wallet" size={22} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={s.balTitle}>Check BTNG Balance</Text>
                      <Text style={s.balSubtitle}>Live balance from sovereign node</Text>
                    </View>
                  </View>

                  <Text style={s.fieldLabel}>BTNG Address</Text>
                  <View style={s.fieldRow}>
                    <TextInput
                      style={s.fieldInput}
                      value={balAddr}
                      onChangeText={setBalAddr}
                      placeholder="BTNG1..."
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    {balAddr.length > 0 && (
                      <TouchableOpacity
                        style={s.clearBtn}
                        onPress={() => { setBalAddr(''); setBalResult(null); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[s.checkBtn, (balLoading || !balAddr.trim()) && { opacity: 0.5 }]}
                    onPress={handleCheckBalance}
                    disabled={balLoading || !balAddr.trim()}
                    activeOpacity={0.85}
                  >
                    {balLoading ? (
                      <ActivityIndicator color={Colors.bg} />
                    ) : (
                      <>
                        <MaterialIcons name="search" size={16} color={Colors.bg} />
                        <Text style={s.checkBtnText}>Check Balance</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {balResult && (
                    <View style={s.balResultCard}>
                      <View style={s.balResultTop}>
                        <MaterialIcons name="verified" size={24} color={Colors.success} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.balResultLabel}>BTNG Balance</Text>
                          <Text style={s.balResultAddr} numberOfLines={1}>{balResult.address}</Text>
                        </View>
                      </View>
                      <Text style={s.balResultAmount}>{balResult.balance} BTNG</Text>
                      {price && (
                        <Text style={s.balResultUsd}>
                          ≈ ${(balResult.balance * price.btngPrice).toFixed(2)} USD
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Quick fill buttons */}
                  <Text style={s.quickLabel}>Quick addresses:</Text>
                  <View style={s.quickRow}>
                    {[
                      { label: 'Demo', addr: 'BTNG1DEMO123456789012345678901234567890' },
                      { label: 'Genesis', addr: 'BTNG1GENESIS123456789012345678901234567890' },
                    ].map(q => (
                      <TouchableOpacity
                        key={q.label}
                        style={s.quickChip}
                        onPress={() => { setBalAddr(q.addr); setBalResult(null); }}
                      >
                        <Text style={s.quickChipText}>{q.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}

            {/* ── SEND ───────────────────────────────────────────────────────── */}
            {tab === 'send' && (
              <>
                <View style={s.sendCard}>
                  <View style={s.sendHeader}>
                    <View style={s.sendIconWrap}>
                      <MaterialIcons name="send" size={22} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={s.sendTitle}>Send BTNG</Text>
                      <Text style={s.sendSubtitle}>Broadcast to sovereign node · fee 0.001 BTNG</Text>
                    </View>
                  </View>

                  <View style={s.sendWarning}>
                    <MaterialIcons name="warning" size={14} color={Colors.warning} />
                    <Text style={s.sendWarningText}>
                      Transactions are broadcast directly to the BTNG sovereign node at 168.231.79.52:64799 (srv1282934.hstgr.cloud). Ensure the node is running.
                    </Text>
                  </View>

                  <Text style={s.fieldLabel}>From Address</Text>
                  <View style={s.fieldRow}>
                    <TextInput
                      style={s.fieldInput}
                      value={sendFrom}
                      onChangeText={setSendFrom}
                      placeholder="BTNG1..."
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </View>

                  <Text style={s.fieldLabel}>To Address</Text>
                  <View style={s.fieldRow}>
                    <TextInput
                      style={s.fieldInput}
                      value={sendTo}
                      onChangeText={setSendTo}
                      placeholder="BTNG1..."
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </View>

                  <Text style={s.fieldLabel}>Amount (BTNG)</Text>
                  <View style={s.fieldRow}>
                    <View style={s.amtPrefix}><Text style={s.amtPrefixText}>BTNG</Text></View>
                    <TextInput
                      style={[s.fieldInput, { flex: 1 }]}
                      value={sendAmount}
                      onChangeText={v => setSendAmount(v.replace(/[^0-9.]/g, ''))}
                      placeholder="0.00"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <TouchableOpacity
                    style={[s.sendBtn, (sendLoading || !sendFrom.trim() || !sendTo.trim() || !sendAmount.trim()) && { opacity: 0.5 }]}
                    onPress={handleSend}
                    disabled={sendLoading || !sendFrom.trim() || !sendTo.trim() || !sendAmount.trim()}
                    activeOpacity={0.85}
                  >
                    {sendLoading ? (
                      <ActivityIndicator color={Colors.bg} />
                    ) : (
                      <>
                        <MaterialIcons name="send" size={16} color={Colors.bg} />
                        <Text style={s.sendBtnText}>Broadcast Transaction</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {sendResult && (
                    <View style={s.sendResultCard}>
                      <View style={s.sendResultTop}>
                        <MaterialIcons name="check-circle" size={24} color={Colors.success} />
                        <Text style={s.sendResultLabel}>Transaction Broadcast!</Text>
                      </View>
                      <View style={s.goldDivider} />
                      <CopyRow label="TX Hash" value={sendResult.hash} mono />
                      <View style={s.goldDivider} />
                      <View style={[cr.row, { paddingVertical: Spacing.sm }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={cr.label}>Amount</Text>
                          <Text style={[cr.value, { color: Colors.primary, fontWeight: FontWeight.bold }]}>{sendResult.amount} BTNG</Text>
                        </View>
                        <View style={[s.statusBadge, s.statusOnline]}>
                          <Text style={[s.statusText, { color: Colors.success }]}>{sendResult.status}</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </>
            )}
          </>
        )}

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  topCenter: { flex: 1, alignItems: 'center' },
  topTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, maxWidth: 220 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  statusOnline: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  statusOffline: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.warning },
  statusText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  tabBar: {
    flexDirection: 'row', marginHorizontal: Spacing.xl,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, gap: 2,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md,
  },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  loadingWrap: { alignItems: 'center', paddingVertical: 80, gap: Spacing.md },
  loadingText: { fontSize: FontSize.md, color: Colors.textSecondary, includeFontPadding: false },
  loadingEndpoint: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  connectedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.successBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.success + '66' },
  connectedBannerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  connectedBannerSub: { fontSize: FontSize.xs, color: Colors.success, opacity: 0.8, includeFontPadding: false, marginTop: 1 },
  offlineCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.error + '44', alignItems: 'center', gap: Spacing.md, marginTop: 40 },
  offlineTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.error, includeFontPadding: false },
  offlineSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  demoCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md },
  demoIconWrap: { width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  demoCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  demoCardSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16, includeFontPadding: false },
  demoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  demoBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  retryCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.warning + '44' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.warning, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 4, paddingHorizontal: Spacing.lg },
  retryBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  sshCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#22C55E44' },
  sshCmdRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#050507', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: '#22C55E22', marginBottom: 6 },
  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  heroIconWrap: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.bgSecondary,
  }
});
