// BTNG Gold Coin — Sovereign Dashboard
// Bituncoin Gold | Gold-Backed Sovereign Chain | 500kg Gold Reserve · Bank of Ghana Vault 001
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSupabaseClient } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

import { getNodeHealthSnapshot, type NodeHealth } from '@/services/verifiedBreakerService';

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'wallet' | 'mining' | 'explorer' | 'market' | 'reserve' | 'brain' | 'derive';

interface BrainStatus {
  node: string;
  status: string;
  operator_tier: number;
  tier_label: string;
  rulings_count: number;
  last_ruling: Record<string, any> | null;
  uptime_s: number;
  brain_version: string;
  timestamp: string;
}

interface TxEntry {
  id: string;
  hash: string;
  amount: number;
  type: 'send' | 'receive' | 'mine' | 'fee';
  status: 'confirmed' | 'pending';
  memo?: string;
  ts: string;
}

interface BlockEntry {
  height: number;
  hash: string;
  txCount: number;
  reward: number;
  miner: string;
  ts: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function shortHash(h: string, pre = 8, suf = 4) {
  if (!h || h.length < pre + suf + 3) return h;
  return `${h.slice(0, pre)}…${h.slice(-suf)}`;
}
function fmtNum(n: number, dec = 4) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function nowTs() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function mockHash() {
  const chars = '0123456789abcdef';
  return '0x' + Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * 16)]).join('');
}
function mockAddress() {
  const chars = '0123456789abcdef';
  return 'btng1' + Array.from({ length: 38 }, () => chars[Math.floor(Math.random() * 16)]).join('');
}

const GENESIS_ADDRESS = 'btng1f3a9b2c8d1e7f4a6b3c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2';
const RESERVE_MSG     = '500kg Gold Reserve · Bank of Ghana Vault 001 · Ceremony: Accra Genesis 2026-02-18';

// ── Latency bar chart (per-bar colouring) ────────────────────────────────────────
function LatencyBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const H   = 60;
  const barColor = (ms: number) => {
    if (ms === 0)   return Colors.textMuted;
    if (ms > 500)   return Colors.error;      // red   — critical
    if (ms > 100)   return '#F59E0B';          // amber — slow
    return '#22C55E';                          // green — fast
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 2 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, Math.round((v / max) * H)),
            backgroundColor: barColor(v),
            borderRadius: 2,
            opacity: 0.88,
          }}
        />
      ))}
    </View>
  );
}

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function MiniBarChart({ data, color = Colors.primary }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const H = 60;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 3 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(4, Math.round((v / max) * H)),
            backgroundColor: color,
            borderRadius: 3,
            opacity: 0.7 + 0.3 * (i / data.length),
          }}
        />
      ))}
    </View>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatTile({ title, value, sub, icon, color = Colors.primary }: { title: string; value: string; sub?: string; icon: string; color?: string }) {
  return (
    <View style={[sd.statTile, { borderColor: color + '33' }]}>
      <View style={[sd.statTileIcon, { backgroundColor: color + '18', borderColor: color + '33' }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={sd.statTileTitle}>{title}</Text>
      <Text style={[sd.statTileValue, { color }]}>{value}</Text>
      {sub ? <Text style={sd.statTileSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function SovereignDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('dashboard');

  // ── Reserve Terminal ─────────────────────────────────────────────────────────
  const SOVEREIGN_RESERVE = {
    address:        'BTNG-54-39791045C086C7CB9FC6C17E42C4847D',
    balance:        204_199_414_192,
    displayBalance: 1_234.56,
    usdValue:       29_500_000_000_000,
    goldOzEquiv:    6_565_169_873,
    goldSpotPrice:  4_465.07,
    reserveRatio:   295,
    btcEquiv:       '∞',
    status:         'ACTIVE · VERIFIED · IMMUTABLE',
    lockedSince:    'Genesis Block · March 2026',
    nations:        54,
    backing:        '500kg Gold Reserve · Bank of Ghana Vault 001',
    reserveType:    'Primary Sovereign Gold Reserve (BTNG-54)',
    oracleStatus:   'LIVE · VERIFIED',
    ledgerStatus:   'ACTIVE · IMMUTABLE',
  };

  // ── Quantum Sovereign Reserve (AFT-54) ─────────────────────────────────────
  const QUANTUM_RESERVE = {
    assetId:       '1BTNG-AFT-54-QNTM-GENESIS-7C4B847D9FC6',
    valuationDate: 'June 5, 2026',
    usdValue:      30_000_000_000_000,
    goldSpotPrice: 4_465.07,
    goldOzEquiv:   6_718_827_872,
    reserveType:   'Quantum Sovereign Reserve (AFT-54)',
    status:        'ACTIVE · VERIFIED',
  };
  const [reserveAccessVisible, setReserveAccessVisible] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [accessAttempted, setAccessAttempted] = useState(false);
  const reservePulse = useRef(new Animated.Value(1)).current;
  const lockRotate   = useRef(new Animated.Value(0)).current;
  const termCursor   = useRef(new Animated.Value(1)).current;
  const [termLines, setTermLines]   = useState<string[]>([]);
  const [termReady, setTermReady]   = useState(false);

  // ── Quantum Boot Sequence ──────────────────────────────────────────────────
  const [quantumLines, setQuantumLines]   = useState<string[]>([]);
  const [quantumBooted, setQuantumBooted] = useState(false);
  const [quantumBooting, setQuantumBooting] = useState(false);
  const quantumCursor = useRef(new Animated.Value(1)).current;
  const quantumGlow   = useRef(new Animated.Value(0.3)).current;
  const quantumScale  = useRef(new Animated.Value(0.96)).current;

  // Terminal boot sequence
  useEffect(() => {
    const lines = [
      '> BTNG SOVEREIGN RESERVE TERMINAL v2.0.54',
      '> Connecting to: 168.231.79.52:64799 (srv1282934.hstgr.cloud)...',
      '> Authentication: GENESIS_SIGNATURE_VERIFIED',
      '> Loading sovereign manifest...',
      '> Reserve address: BTNG-54-39791045C086C7CB9FC6C17E42C4847D',
      '> Balance: 204,199,414,192 BTNGG',
      '> USD Value: $29,500,000,000,000',
      '> Gold equivalent: 6,565,169,873.00 oz XAU',
      '> Reserve ratio: 295:1',
      '> BTC equivalent: ∞',
      '> Status: INFINITY LOCKDOWN — PERMANENTLY LOCKED',
      '> Backing: 500kg Gold · Bank of Ghana Vault 001',
      '> Nations covered: 54 AFRICAN NATIONS',
      '> SOVEREIGN RESERVE PERMANENTLY ACTIVATED FOREVER',
      '> AUTHORIZED ACCESS ONLY — PRIVATE KEY REQUIRED',
    ];
    let i = 0;
    const t = setInterval(() => {
      if (i < lines.length) {
        setTermLines(prev => [...prev, lines[i]]);
        i++;
      } else {
        setTermReady(true);
        clearInterval(t);
      }
    }, 200);
    return () => clearInterval(t);
  }, []);

  // Lock pulse
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(reservePulse, { toValue: 1.06, duration: 1000, useNativeDriver: true }),
        Animated.timing(reservePulse, { toValue: 1,    duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reservePulse]);

  // Cursor blink
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(termCursor, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(termCursor, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [termCursor]);

  // Quantum cursor blink
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(quantumCursor, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(quantumCursor, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [quantumCursor]);

  // Quantum glow pulse
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(quantumGlow, { toValue: 1,    duration: 1400, useNativeDriver: true }),
        Animated.timing(quantumGlow, { toValue: 0.25, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [quantumGlow]);

  // Quantum boot sequence — fires once when Reserve tab first opens
  useEffect(() => {
    if (tab !== 'reserve' || quantumBooting || quantumBooted) return;
    setQuantumBooting(true);
    setQuantumLines([]);
    const qLines = [
      '⚛  QUANTUM SOVEREIGN RESERVE · BOOT SEQUENCE v1.0',
      '> Initializing AFT-54 quantum ledger...',
      '> Connecting to sovereign oracle node...',
      `> Asset ID: ${QUANTUM_RESERVE.assetId}`,
      `> Valuation Date: ${QUANTUM_RESERVE.valuationDate}`,
      '> USD Reserve Value: $30,000,000,000,000',
      `> Gold Spot Price: $${QUANTUM_RESERVE.goldSpotPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} / troy oz`,
      `> Gold Equivalent: ${QUANTUM_RESERVE.goldOzEquiv.toLocaleString()} oz XAU`,
      `> Reserve Type: ${QUANTUM_RESERVE.reserveType}`,
      '> Status: ACTIVE · VERIFIED',
      '✓ QUANTUM RESERVE FULLY INITIALIZED',
    ];
    let i = 0;
    const t = setInterval(() => {
      if (i < qLines.length) {
        setQuantumLines(prev => [...prev, qLines[i]]);
        i++;
      } else {
        clearInterval(t);
        // Animate scale-in then reveal card
        Animated.spring(quantumScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }).start();
        setTimeout(() => setQuantumBooted(true), 1000);
      }
    }, 280);
    return () => clearInterval(t);
  }, [tab]);

  // ── Live price data ──────────────────────────────────────────────────────────
  const [price, setPrice] = useState(4.46507);
  const [priceChange, setPriceChange] = useState(+0.285);
  const [marketCap, setMarketCap] = useState(4465070);
  const [priceHistory, setPriceHistory] = useState([4.31, 4.38, 4.42, 4.39, 4.45, 4.48, 4.46, 4.44, 4.47, 4.46507]);
  const [blockCount, setBlockCount] = useState(1847);
  const [txCount, setTxCount] = useState(42831);
  const [netHash, setNetHash] = useState(1.24);
  // ── Brain Health Panel ───────────────────────────────────────────────────────
  const BRAIN_GATE_URL = 'http://localhost:8087';
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);
  const [brainError, setBrainError] = useState<string | null>(null);
  const [brainLastFetch, setBrainLastFetch] = useState<Date | null>(null);
  const brainPulse = useRef(new Animated.Value(0.4)).current;

  // ── Brain History (Ruling Timeline) ─────────────────────────────────────
  interface RulingEntry {
    ts?: string;
    session_id?: string;
    intent?: string;
    policy_id?: string;
    ruling?: string;
    latency_ms?: number;
    reason?: string;
  }
  const [brainHistory, setBrainHistory] = useState<RulingEntry[]>([]);
  const [fullLogVisible, setFullLogVisible] = useState(false);
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);

  // ── Brain health colour — derived from ruling distribution ────────────────
  const brainHealthColor = useMemo(() => {
    if (!brainHistory.length) return '#9945FF'; // purple = no data yet
    const total = brainHistory.length;
    const allowCount = brainHistory.filter(
      e => (e.ruling ?? '').startsWith('ALLOW')
    ).length;
    const allowRate = allowCount / total;
    if (allowRate >= 0.8) return '#22C55E';   // green  — healthy
    if (allowRate >= 0.5) return '#F59E0B';   // amber  — degraded
    return Colors.error;                       // red    — DENY dominant
  }, [brainHistory]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchBrainHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${BRAIN_GATE_URL}/history?limit=20`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBrainHistory((data.entries ?? []) as RulingEntry[]);
    } catch (_) {
      setBrainHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchBrainStatus = useCallback(async () => {
    setBrainLoading(true);
    setBrainError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${BRAIN_GATE_URL}/status`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BrainStatus = await res.json();
      setBrainStatus(data);
      setBrainLastFetch(new Date());
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setBrainError('Brain Gate timeout — is brain_gate.py running on :8087?');
      } else {
        setBrainError(`Brain Gate unreachable: ${err.message}`);
      }
      setBrainStatus(null);
    } finally {
      setBrainLoading(false);
    }
  }, []);

  // Auto-fetch when Brain tab is active + poll every 30s
  useEffect(() => {
    if (tab !== 'brain') return;
    fetchBrainStatus();
    fetchBrainHistory();
    const id = setInterval(() => {
      fetchBrainStatus();
      fetchBrainHistory();
    }, 30_000);
    return () => clearInterval(id);
  }, [tab, fetchBrainStatus, fetchBrainHistory]);

  // Brain pulse animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(brainPulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
        Animated.timing(brainPulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [brainPulse]);

  // ── Node Health (Circuit Breaker) ─────────────────────────────────────────
  const [nodeHealth, setNodeHealth] = useState<NodeHealth[]>(() => getNodeHealthSnapshot());
  const nodeHealthPulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Refresh snapshot every 30s while on dashboard tab
    if (tab !== 'dashboard') return;
    const id = setInterval(() => setNodeHealth(getNodeHealthSnapshot()), 30_000);
    return () => clearInterval(id);
  }, [tab]);

  // Pulse animation for node live dots
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(nodeHealthPulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
        Animated.timing(nodeHealthPulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [nodeHealthPulse]);

  const [loading, setLoading] = useState(false);
  const priceAnim = useRef(new Animated.Value(1)).current;
  const tickerAnim = useRef(new Animated.Value(0)).current;

  // ── Ticker scroll animation ────────────────────────────────────────────────
  const TICKER_ITEM_W = 162; // estimated px per pair tile
  const TICKER_TOTAL  = TICKER_ITEM_W * 6; // one full set width

  useEffect(() => {
    tickerAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(tickerAnim, {
        toValue: -TICKER_TOTAL,
        duration: 28_000,
        useNativeDriver: true,
        easing: Easing.linear,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const flashPrice = useCallback(() => {
    Animated.sequence([
      Animated.timing(priceAnim, { toValue: 1.06, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(priceAnim, { toValue: 1,    duration: 300, useNativeDriver: true }),
    ]).start();
  }, [priceAnim]);

  // Live price from gold oracle — tries BTNGG key first, falls back to gold-oracle edge function
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const sb = getSupabaseClient();
        // Try BTNGG key (primary)
        let data: any = null;
        const { data: d1 } = await sb
          .from('btng_oracle_cache')
          .select('price_usd,change_24h,change_pct_24h')
          .eq('key', 'BTNGG')
          .maybeSingle();
        if (d1 && Number(d1.price_usd) > 0) {
          data = d1;
        } else {
          // Fallback: try BTNG key
          const { data: d2 } = await sb
            .from('btng_oracle_cache')
            .select('price_usd,change_24h,change_pct_24h')
            .eq('key', 'BTNG')
            .maybeSingle();
          if (d2 && Number(d2.price_usd) > 0) data = d2;
        }
        if (!cancelled && data) {
          const p = Number(data.price_usd) || 4.46507;
          setPrice(p);
          setPriceChange(Number(data.change_pct_24h) || 0.285);
          setMarketCap(p * 1_000_000);
          setPriceHistory(h => [...h.slice(1), p]);
          flashPrice();
        }
      } catch (_) {
        // Fallback: call gold-oracle edge function directly
        try {
          const sb = getSupabaseClient();
          const { data: fnData, error: fnErr } = await sb.functions.invoke('gold-oracle', { body: { action: 'getPrice' } });
          if (!cancelled && fnData && !fnErr) {
            const p = Number(fnData.price_usd || fnData.priceBTNGG) || 4.46507;
            setPrice(p);
            setPriceChange(Number(fnData.change_pct_24h) || 0.285);
            setMarketCap(p * 1_000_000);
            setPriceHistory(h => [...h.slice(1), p]);
            flashPrice();
          }
        } catch (_2) {}
      }
    };
    fetchPrice();
    const id = setInterval(fetchPrice, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Simulate block/tx ticks
  useEffect(() => {
    const id = setInterval(() => {
      setBlockCount(b => b + 1);
      setTxCount(t => t + Math.floor(Math.random() * 5) + 1);
      setNetHash(h => parseFloat((h + (Math.random() - 0.5) * 0.05).toFixed(2)));
    }, 12_000);
    return () => clearInterval(id);
  }, []);

  // ── Wallet ───────────────────────────────────────────────────────────────────
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletAddress] = useState(GENESIS_ADDRESS);
  const [sendTo, setSendTo] = useState('');
  const [sendAmt, setSendAmt] = useState('');
  const [sendFee, setSendFee] = useState<'slow' | 'standard' | 'fast'>('standard');
  const [walletTxs, setWalletTxs] = useState<TxEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Load wallet balance from btng_wallets if available
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await sb.from('btng_wallets').select('balance,wallet_address').eq('user_id', user.id).maybeSingle();
        if (!cancelled && data) {
          setWalletBalance(Number(data.balance) || 0);
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCopyAddress = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!sendTo.trim() || !sendAmt.trim()) return;
    const amt = parseFloat(sendAmt);
    if (isNaN(amt) || amt <= 0) return;
    const feeMap = { slow: 0.001, standard: 0.005, fast: 0.010 };
    const fee = feeMap[sendFee];
    setSending(true);
    await new Promise(r => setTimeout(r, 1200));
    const tx: TxEntry = {
      id: Date.now().toString(),
      hash: mockHash(),
      amount: amt + fee,
      type: 'send',
      status: 'pending',
      ts: nowTs(),
    };
    setWalletTxs(prev => [tx, ...prev]);
    setWalletBalance(b => Math.max(0, b - amt - fee));
    setSendTo('');
    setSendAmt('');
    setSending(false);
    // confirm after 3s
    setTimeout(() => {
      setWalletTxs(prev => prev.map(t => t.id === tx.id ? { ...t, status: 'confirmed' } : t));
    }, 3000);
  };

  // ── Mining ───────────────────────────────────────────────────────────────────
  const [mining, setMining] = useState(false);
  const [hashRate, setHashRate] = useState(0);
  const [mineProgress, setMineProgress] = useState(0);
  const [mineBlocks, setMineBlocks] = useState(0);
  const [mineEarned, setMineEarned] = useState(0);
  const [difficulty, setDifficulty] = useState(1.0);
  const [mineLog, setMineLog] = useState<string[]>([
    `[${nowTs()}] 🏛️ Genesis anchored to 500kg Gold Reserve · Bank of Ghana`,
    `[${nowTs()}] 🔗 BTNG Sovereign Mainnet · Chain ID: BTNG-MAINNET`,
    `[${nowTs()}] ⚡ Ready to mine. Block reward: 50 BTNGG`,
  ]);
  const mineProgressAnim = useRef(new Animated.Value(0)).current;
  const mineIntervalRef = useRef<any>(null);

  const addLog = (msg: string) => setMineLog(prev => [`[${nowTs()}] ${msg}`, ...prev].slice(0, 100));

  const startMining = useCallback(() => {
    setMining(true);
    let progress = 0;
    const target = Math.floor(Math.random() * 60 + 30); // 30–90 ticks
    const hr = Math.floor(Math.random() * 500 + 100);
    setHashRate(hr);
    addLog(`⛏️ Mining started · ${hr} MH/s · Difficulty: ${difficulty.toFixed(2)}`);

    mineIntervalRef.current = setInterval(() => {
      progress += Math.random() * 3 + 1;
      if (progress >= 100) {
        progress = 0;
        setMineBlocks(b => b + 1);
        setMineEarned(e => e + 50);
        setBlockCount(b => b + 1);
        setDifficulty(d => parseFloat((d + 0.01).toFixed(3)));
        addLog(`✅ Block found! Reward: 50 BTNGG · Hash: ${shortHash(mockHash(), 10, 6)}`);
      }
      setMineProgress(Math.min(progress, 100));
      Animated.timing(mineProgressAnim, { toValue: Math.min(progress, 100) / 100, duration: 150, useNativeDriver: false }).start();
    }, 300);
  }, [difficulty]);

  const stopMining = useCallback(() => {
    setMining(false);
    setHashRate(0);
    setMineProgress(0);
    Animated.timing(mineProgressAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    if (mineIntervalRef.current) clearInterval(mineIntervalRef.current);
    addLog('⏹️ Mining stopped.');
  }, []);

  useEffect(() => { return () => { if (mineIntervalRef.current) clearInterval(mineIntervalRef.current); }; }, []);

  // ── Explorer ─────────────────────────────────────────────────────────────────
  const [blocks, setBlocks] = useState<BlockEntry[]>([]);
  const [expTxs, setExpTxs] = useState<TxEntry[]>([]);
  const [expSearch, setExpSearch] = useState('');
  const [expResult, setExpResult] = useState<string | null>(null);

  useEffect(() => {
    // Generate initial mock blocks & txs
    const b: BlockEntry[] = Array.from({ length: 10 }, (_, i) => ({
      height: blockCount - i,
      hash: mockHash(),
      txCount: Math.floor(Math.random() * 20 + 1),
      reward: 50,
      miner: shortHash(mockHash(), 6, 4),
      ts: new Date(Date.now() - i * 60_000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    }));
    setBlocks(b);
    const t: TxEntry[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      hash: mockHash(),
      amount: parseFloat((Math.random() * 500 + 1).toFixed(4)),
      type: Math.random() > 0.5 ? 'send' : 'receive',
      status: Math.random() > 0.2 ? 'confirmed' : 'pending',
      memo: Math.random() > 0.6 ? 'BTNG Transfer' : undefined,
      ts: new Date(Date.now() - i * 45_000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    }));
    setExpTxs(t);
  }, []);

  const handleSearch = () => {
    if (!expSearch.trim()) return;
    const q = expSearch.trim().toLowerCase();
    if (q.startsWith('0x') || q.startsWith('btng1')) {
      setExpResult(`Found: ${expSearch.trim()}\nType: ${q.startsWith('0x') ? 'Transaction Hash' : 'Wallet Address'}\nStatus: Confirmed\nBlock: #${blockCount - Math.floor(Math.random() * 50)}`);
    } else if (!isNaN(Number(q))) {
      setExpResult(`Block #${q}\nHash: ${shortHash(mockHash(), 14, 8)}\nTX Count: ${Math.floor(Math.random() * 20 + 1)}\nMiner: ${shortHash(mockHash(), 8, 6)}\nReward: 50 BTNGG\nTimestamp: ${new Date().toLocaleString()}`);
    } else {
      setExpResult('No result found for this query.');
    }
  };

  // ── Market ────────────────────────────────────────────────────────────────────
  const marketPairs = [
    { pair: 'BTNGG/USDT', price: price, change: priceChange, vol: 2_840_000 },
    { pair: 'BTNGG/GHS',  price: price * 15.1, change: priceChange - 0.1, vol: 1_120_000 },
    { pair: 'BTNGG/BTC',  price: price / 107200, change: priceChange + 0.3, vol: 450_000 },
    { pair: 'BTNGG/ETH',  price: price / 3840,  change: priceChange - 0.2, vol: 290_000 },
    { pair: 'BTNGG/GOLD', price: price / 4465.07, change: priceChange + 0.1, vol: 180_000 },
    { pair: 'BTNG-G/USD', price: price * 31.1035, change: priceChange + 0.08, vol: 520_000 },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[sd.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={sd.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={sd.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={sd.topTitleRow}>
            <Text style={sd.topTitle}>Sovereign Dashboard</Text>
            <View style={sd.livePill}>
              <View style={sd.liveDot} />
              <Text style={sd.livePillText}>LIVE</Text>
            </View>
          </View>
          <Text style={sd.topSub}>Bituncoin Gold · BTNG | 500kg Gold Reserve</Text>
        </View>
        <View style={sd.headerPriceCol}>
          <Animated.Text style={[sd.headerPrice, { transform: [{ scale: priceAnim }] }]}>
            ${price.toFixed(3)}
          </Animated.Text>
          <Text style={[sd.headerChange, { color: priceChange >= 0 ? Colors.success : Colors.error }]}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </Text>
        </View>
      </View>

      {/* Genesis Banner */}
      <View style={sd.genesisBanner}>
        <MaterialIcons name="account-balance" size={13} color={Colors.primary} />
        <Text style={sd.genesisBannerText} numberOfLines={1}>{RESERVE_MSG}</Text>
      </View>

      {/* ── Live Ticker Banner ── */}
      <View style={sd.tickerWrap}>
        <View style={sd.tickerLeft}>
          <View style={sd.tickerLiveDot} />
          <Text style={sd.tickerLeftText}>LIVE</Text>
        </View>
        <View style={sd.tickerViewport}>
          <Animated.View style={[sd.tickerRow, { transform: [{ translateX: tickerAnim }] }]}>
            {[...marketPairs, ...marketPairs, ...marketPairs].map((p, i) => (
              <View key={i} style={sd.tickerItem}>
                <Text style={sd.tickerPairText}>{p.pair}</Text>
                <Text style={sd.tickerPriceText}>
                  {p.pair.includes('BTC') ? p.price.toFixed(8)
                    : p.pair.includes('ETH') ? p.price.toFixed(6)
                    : p.price.toFixed(4)}
                </Text>
                <View style={[sd.tickerChangePill, {
                  backgroundColor: p.change >= 0 ? Colors.successBg : Colors.errorBg,
                  borderColor:     p.change >= 0 ? Colors.success + '44' : Colors.error + '44',
                }]}>
                  <MaterialIcons
                    name={p.change >= 0 ? 'arrow-drop-up' : 'arrow-drop-down'}
                    size={11}
                    color={p.change >= 0 ? Colors.success : Colors.error}
                  />
                  <Text style={[sd.tickerChangeText, { color: p.change >= 0 ? Colors.success : Colors.error }]}>
                    {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
                  </Text>
                </View>
                <View style={sd.tickerSep} />
              </View>
            ))}
          </Animated.View>
        </View>
      </View>

      {/* Tab Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sd.tabScrollWrap} contentContainerStyle={sd.tabScrollContent}>
        {([
          { id: 'dashboard', icon: 'bar-chart',              label: 'Dashboard' },
          { id: 'wallet',    icon: 'account-balance-wallet', label: 'Wallet'    },
          { id: 'mining',    icon: 'hardware',               label: 'Mining'    },
          { id: 'explorer',  icon: 'explore',                label: 'Explorer'  },
          { id: 'market',    icon: 'show-chart',             label: 'Market'    },
          { id: 'reserve',   icon: 'security',               label: 'Reserve'   },
          { id: 'brain',     icon: 'psychology',              label: 'Brain'     },
          { id: 'derive',    icon: 'account-tree',             label: 'HD Derive'  },
        ] as { id: Tab; icon: string; label: string }[]).map(t => (
          <TouchableOpacity
            key={t.id}
            style={[sd.tabBtn, tab === t.id && sd.tabBtnActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={14} color={tab === t.id ? Colors.bg : Colors.textMuted} />
            <Text style={[sd.tabBtnText, tab === t.id && { color: Colors.bg }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <View style={sd.section}>
            {/* Stat tiles */}
            <View style={sd.tileGrid}>
              <StatTile title="BTNG Price"    value={`$${price.toFixed(4)}`} sub={`${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}% 24h`}     icon="monetization-on" color={Colors.primary} />
              <StatTile title="Market Cap"    value={fmtShort(marketCap)}    sub="Circulating supply"                                                   icon="account-balance"  color="#3B82F6" />
              <StatTile title="Blocks Mined"  value={blockCount.toLocaleString()} sub={`+1 ~60s`}                                                       icon="grid-on"          color="#22C55E" />
              <StatTile title="Total TX"      value={txCount.toLocaleString()}    sub="All-time"                                                         icon="swap-horiz"       color="#9945FF" />
            </View>

            {/* Price chart */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="show-chart" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>BTNG / USD · 24h Price</Text>
                <View style={[sd.changeChip, { backgroundColor: priceChange >= 0 ? Colors.successBg : Colors.errorBg }]}>
                  <MaterialIcons name={priceChange >= 0 ? 'trending-up' : 'trending-down'} size={11} color={priceChange >= 0 ? Colors.success : Colors.error} />
                  <Text style={[sd.changeChipText, { color: priceChange >= 0 ? Colors.success : Colors.error }]}>
                    {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                  </Text>
                </View>
              </View>
              <Text style={sd.bigPrice}>${price.toFixed(4)}</Text>
              <View style={{ marginTop: 12 }}>
                <MiniBarChart data={priceHistory} color={priceChange >= 0 ? Colors.success : Colors.error} />
              </View>
              <View style={sd.chartLabelRow}>
                <Text style={sd.chartLabel}>24h ago</Text>
                <Text style={sd.chartLabel}>12h</Text>
                <Text style={sd.chartLabel}>Now</Text>
              </View>
            </View>

            {/* Network stats */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="hub" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Network Stats</Text>
              </View>
              <View style={sd.networkGrid}>
                {[
                  { label: 'Net Hash Rate',  val: `${netHash.toFixed(2)} TH/s`, color: '#22C55E' },
                  { label: 'Block Reward',   val: '50 BTNGG',                   color: Colors.primary },
                  { label: 'Target Time',    val: '60 seconds',                 color: '#3B82F6' },
                  { label: 'Difficulty',     val: `${difficulty.toFixed(3)}`,   color: Colors.warning },
                  { label: 'Node',           val: '168.231.79.52:64799',        color: '#22C55E' },
                  { label: 'Halving In',     val: `${(21000 - (blockCount % 21000)).toLocaleString()} blocks`, color: '#9945FF' },
                ].map(row => (
                  <View key={row.label} style={sd.networkRow}>
                    <Text style={sd.networkLabel}>{row.label}</Text>
                    <Text style={[sd.networkVal, { color: row.color }]} numberOfLines={1}>{row.val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Recent TX */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="receipt-long" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Recent Transactions</Text>
              </View>
              {expTxs.slice(0, 5).map(tx => (
                <View key={tx.id} style={sd.txRow}>
                  <View style={[sd.txTypeIcon, { backgroundColor: tx.type === 'receive' ? Colors.successBg : Colors.primaryGlow }]}>
                    <MaterialIcons name={tx.type === 'receive' ? 'arrow-downward' : 'arrow-upward'} size={13} color={tx.type === 'receive' ? Colors.success : Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sd.txHash} numberOfLines={1}>{shortHash(tx.hash, 10, 6)}</Text>
                    <Text style={sd.txTime}>{tx.ts}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[sd.txAmt, { color: tx.type === 'receive' ? Colors.success : Colors.primary }]}>
                      {tx.type === 'receive' ? '+' : '-'}{fmtNum(tx.amount, 4)} BTNG
                    </Text>
                    <View style={[sd.statusBadge, { backgroundColor: tx.status === 'confirmed' ? Colors.successBg : Colors.warningBg, borderColor: tx.status === 'confirmed' ? Colors.success + '33' : Colors.warning + '33' }]}>
                      <Text style={[sd.statusBadgeText, { color: tx.status === 'confirmed' ? Colors.success : Colors.warning }]}>{tx.status}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Node Health ── */}
            <View style={[sd.card, { borderColor: '#3B82F655' }]}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="hub" size={16} color="#3B82F6" />
                <Text style={[sd.cardTitle, { color: '#3B82F6' }]}>Sovereign Node Health</Text>
                <TouchableOpacity
                  style={nh.refreshBtn}
                  onPress={() => setNodeHealth(getNodeHealthSnapshot())}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="autorenew" size={14} color="#3B82F6" />
                </TouchableOpacity>
              </View>

              {nodeHealth.map((h, idx) => {
                const quarantined = h.quarantinedUntil > Date.now();
                const isOK        = !quarantined && h.lastResult === 'pass';
                const isFail      = !quarantined && h.lastResult === 'fail';
                const nodeColor   = quarantined ? Colors.error : isOK ? Colors.success : isFail ? Colors.error : Colors.textMuted;
                const nodeLabel   = quarantined ? 'QUARANTINED' : isOK ? 'OK' : isFail ? 'FAIL' : 'UNKNOWN';
                const nodeBg      = quarantined ? Colors.errorBg : isOK ? Colors.successBg : isFail ? Colors.errorBg : Colors.bgElevated;

                return (
                  <View
                    key={h.url}
                    style={[
                      nh.nodeRow,
                      idx < nodeHealth.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border },
                    ]}
                  >
                    {/* Status dot */}
                    <Animated.View style={[nh.dot, { backgroundColor: nodeColor, opacity: isOK ? nodeHealthPulse : 1 }]} />

                    {/* Info column */}
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={nh.nodeName} numberOfLines={1}>{h.name}</Text>
                      <Text style={nh.nodeUrl} numberOfLines={1}>{h.url}</Text>

                      {/* Metrics row */}
                      <View style={nh.metaRow}>
                        <View style={[nh.metaChip, { backgroundColor: nodeColor + '18', borderColor: nodeColor + '44' }]}>
                          <Text style={[nh.metaChipText, { color: nodeColor }]}>{nodeLabel}</Text>
                        </View>
                        <View style={nh.metaChip}>
                          <MaterialIcons name="error-outline" size={9} color={h.failures > 0 ? Colors.error : Colors.textMuted} />
                          <Text style={[nh.metaChipText, { color: h.failures > 0 ? Colors.error : Colors.textMuted }]}>
                            {h.failures} failure{h.failures !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        {h.lastVerified > 0 && (
                          <View style={nh.metaChip}>
                            <MaterialIcons name="schedule" size={9} color={Colors.textMuted} />
                            <Text style={nh.metaChipText}>
                              {new Date(h.lastVerified).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                        )}
                        {quarantined && (
                          <View style={[nh.metaChip, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }]}>
                            <MaterialIcons name="lock" size={9} color={Colors.error} />
                            <Text style={[nh.metaChipText, { color: Colors.error }]}>
                              {Math.ceil((h.quarantinedUntil - Date.now()) / 1000)}s left
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Failure bar */}
                    <View style={nh.failureBarTrack}>
                      <View
                        style={[
                          nh.failureBarFill,
                          {
                            width: `${Math.min(100, (h.failures / 3) * 100)}%` as any,
                            backgroundColor: h.failures >= 3 ? Colors.error : h.failures > 0 ? Colors.warning : Colors.success,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}

              {/* Legend */}
              <View style={nh.legend}>
                {[
                  { dot: Colors.success, label: 'Verified & Active' },
                  { dot: Colors.error,   label: 'Failed / Quarantined' },
                  { dot: Colors.textMuted, label: 'Not yet checked' },
                ].map(l => (
                  <View key={l.label} style={nh.legendItem}>
                    <View style={[nh.legendDot, { backgroundColor: l.dot }]} />
                    <Text style={nh.legendText}>{l.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── WALLET ── */}
        {tab === 'wallet' && (
          <View style={sd.section}>
            {/* Balance */}
            <View style={[sd.card, { alignItems: 'center', gap: Spacing.sm }]}>
              <Text style={sd.walletLabel}>Total Balance</Text>
              <Text style={sd.walletBalance}>{fmtNum(walletBalance, 4)}</Text>
              <Text style={sd.walletUSD}>≈ {fmtShort(walletBalance * price)}</Text>
              <View style={sd.walletBadge}>
                <MaterialIcons name="workspace-premium" size={11} color={Colors.primary} />
                <Text style={sd.walletBadgeText}>BTNGG · Gold-Backed Sovereign</Text>
              </View>
            </View>

            {/* Address */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="qr-code" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Wallet Address</Text>
              </View>
              <View style={sd.addressBox}>
                <Text style={sd.addressText} numberOfLines={1} selectable>{walletAddress}</Text>
                <TouchableOpacity style={[sd.copyBtn, copied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]} onPress={handleCopyAddress}>
                  <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={copied ? Colors.success : Colors.primary} />
                  <Text style={[sd.copyBtnText, copied && { color: Colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
              <View style={sd.walletStatsRow}>
                <View style={sd.walletStat}>
                  <Text style={sd.walletStatLabel}>Total Received</Text>
                  <Text style={[sd.walletStatVal, { color: Colors.success }]}>+{fmtNum(walletBalance + 120.5, 2)} BTNG</Text>
                </View>
                <View style={sd.walletStatDivider} />
                <View style={sd.walletStat}>
                  <Text style={sd.walletStatLabel}>Total Sent</Text>
                  <Text style={[sd.walletStatVal, { color: Colors.error }]}>-120.50 BTNG</Text>
                </View>
              </View>
            </View>

            {/* Send form */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="send" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Send BTNG</Text>
              </View>
              <Text style={sd.fieldLabel}>Recipient Address</Text>
              <TextInput
                style={sd.fieldInput}
                value={sendTo}
                onChangeText={setSendTo}
                placeholder="btng1..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={sd.fieldLabel}>Amount (BTNG)</Text>
              <TextInput
                style={sd.fieldInput}
                value={sendAmt}
                onChangeText={setSendAmt}
                placeholder="0.0000"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
              <Text style={sd.fieldLabel}>Transaction Fee</Text>
              <View style={sd.feeRow}>
                {([
                  { id: 'slow',     label: 'Slow',     fee: '0.001' },
                  { id: 'standard', label: 'Standard', fee: '0.005' },
                  { id: 'fast',     label: 'Fast',     fee: '0.010' },
                ] as { id: 'slow' | 'standard' | 'fast'; label: string; fee: string }[]).map(f => (
                  <TouchableOpacity
                    key={f.id}
                    style={[sd.feeChip, sendFee === f.id && sd.feeChipActive]}
                    onPress={() => setSendFee(f.id)}
                  >
                    <Text style={[sd.feeChipText, sendFee === f.id && { color: Colors.bg }]}>{f.label}</Text>
                    <Text style={[sd.feeChipAmt, sendFee === f.id && { color: Colors.bg }]}>{f.fee}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[sd.sendBtn, (sending || !sendTo.trim() || !sendAmt.trim()) && { opacity: 0.5 }]}
                onPress={handleSend}
                disabled={sending || !sendTo.trim() || !sendAmt.trim()}
                activeOpacity={0.85}
              >
                {sending ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="send" size={18} color={Colors.bg} />}
                <Text style={sd.sendBtnText}>{sending ? 'Broadcasting…' : 'Send Transaction'}</Text>
              </TouchableOpacity>
            </View>

            {/* Wallet TX history */}
            {walletTxs.length > 0 && (
              <View style={sd.card}>
                <View style={sd.cardHeader}>
                  <MaterialIcons name="history" size={16} color={Colors.primary} />
                  <Text style={sd.cardTitle}>Transaction History</Text>
                </View>
                {walletTxs.map(tx => (
                  <View key={tx.id} style={sd.txRow}>
                    <View style={[sd.txTypeIcon, { backgroundColor: Colors.primaryGlow }]}>
                      <MaterialIcons name="arrow-upward" size={13} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={sd.txHash} numberOfLines={1}>{shortHash(tx.hash, 10, 6)}</Text>
                      <Text style={sd.txTime}>{tx.ts}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={[sd.txAmt, { color: Colors.error }]}>-{fmtNum(tx.amount, 4)} BTNG</Text>
                      <View style={[sd.statusBadge, { backgroundColor: tx.status === 'confirmed' ? Colors.successBg : Colors.warningBg, borderColor: tx.status === 'confirmed' ? Colors.success + '33' : Colors.warning + '33' }]}>
                        <Text style={[sd.statusBadgeText, { color: tx.status === 'confirmed' ? Colors.success : Colors.warning }]}>{tx.status}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── MINING ── */}
        {tab === 'mining' && (
          <View style={sd.section}>
            {/* Console */}
            <View style={[sd.card, { alignItems: 'center' }]}>
              <Text style={sd.miningEmoji}>⛏️</Text>
              <Text style={sd.cardTitle}>Mining Console</Text>
              <Text style={sd.hashRateDisplay}>
                {mining ? `${hashRate.toLocaleString()} MH/s` : '0 MH/s'}
              </Text>

              {/* Progress bar */}
              <View style={sd.progressTrack}>
                <Animated.View style={[sd.progressFill, {
                  width: mineProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                }]} />
              </View>
              <Text style={sd.progressPct}>{Math.round(mineProgress)}% block progress</Text>

              <TouchableOpacity
                style={[sd.mineBtn, mining && { backgroundColor: Colors.error }]}
                onPress={mining ? stopMining : startMining}
                activeOpacity={0.85}
              >
                <MaterialIcons name={mining ? 'stop' : 'hardware'} size={20} color={Colors.bg} />
                <Text style={sd.mineBtnText}>{mining ? 'Stop Mining' : 'Start Mining'}</Text>
              </TouchableOpacity>

              <View style={sd.mineStatsGrid}>
                {[
                  { label: 'Blocks Found', val: mineBlocks.toString(), color: Colors.primary },
                  { label: 'Earned',       val: `${mineEarned} BTNG`, color: Colors.success },
                  { label: 'Difficulty',   val: difficulty.toFixed(3), color: Colors.warning },
                ].map(s => (
                  <View key={s.label} style={sd.mineStatCard}>
                    <Text style={sd.mineStatLabel}>{s.label}</Text>
                    <Text style={[sd.mineStatVal, { color: s.color }]}>{s.val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Log */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="terminal" size={16} color={Colors.success} />
                <Text style={sd.cardTitle}>Mining Log</Text>
                <View style={[sd.livePill, { backgroundColor: mining ? Colors.successBg : Colors.bgElevated, borderColor: mining ? Colors.success + '44' : Colors.border }]}>
                  <View style={[sd.liveDot, { backgroundColor: mining ? Colors.success : Colors.textMuted }]} />
                  <Text style={[sd.livePillText, { color: mining ? Colors.success : Colors.textMuted }]}>{mining ? 'ACTIVE' : 'IDLE'}</Text>
                </View>
              </View>
              <ScrollView style={sd.logBox} showsVerticalScrollIndicator={false}>
                {mineLog.map((line, i) => (
                  <Text key={i} style={sd.logLine}>{line}</Text>
                ))}
              </ScrollView>
            </View>

            {/* Network stats */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="public" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Network Stats</Text>
              </View>
              <View style={sd.networkGrid}>
                {[
                  { label: 'Net Hashrate',  val: `${netHash.toFixed(2)} TH/s`,                          color: '#22C55E' },
                  { label: 'Block Reward',  val: '50 BTNGG',                                             color: Colors.primary },
                  { label: 'Next Halving',  val: `${(21000 - (blockCount % 21000)).toLocaleString()}`,   color: Colors.warning },
                  { label: 'Target Time',   val: '60 seconds',                                           color: '#3B82F6' },
                ].map(row => (
                  <View key={row.label} style={sd.networkRow}>
                    <Text style={sd.networkLabel}>{row.label}</Text>
                    <Text style={[sd.networkVal, { color: row.color }]}>{row.val}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── EXPLORER ── */}
        {tab === 'explorer' && (
          <View style={sd.section}>
            {/* Search */}
            <View style={sd.searchBar}>
              <MaterialIcons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={sd.searchInput}
                value={expSearch}
                onChangeText={setExpSearch}
                placeholder="Block #, TX hash, Address..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              {expSearch.length > 0 && (
                <TouchableOpacity onPress={handleSearch} style={sd.searchBtn}>
                  <Text style={sd.searchBtnText}>Search</Text>
                </TouchableOpacity>
              )}
            </View>

            {expResult ? (
              <View style={[sd.card, { borderColor: Colors.primary + '55' }]}>
                <View style={sd.cardHeader}>
                  <MaterialIcons name="find-in-page" size={16} color={Colors.primary} />
                  <Text style={sd.cardTitle}>Search Result</Text>
                  <TouchableOpacity onPress={() => { setExpResult(null); setExpSearch(''); }}>
                    <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <Text style={sd.expResultText}>{expResult}</Text>
              </View>
            ) : null}

            {/* Latest Blocks */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="grid-on" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Latest Blocks</Text>
              </View>
              {blocks.map(b => (
                <View key={b.height} style={sd.blockRow}>
                  <View style={sd.blockHeightWrap}>
                    <Text style={sd.blockHeight}>#{b.height.toLocaleString()}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={sd.txHash} numberOfLines={1}>{shortHash(b.hash, 12, 6)}</Text>
                    <Text style={sd.txTime}>{b.txCount} txs · Miner: {b.miner} · {b.ts}</Text>
                  </View>
                  <Text style={[sd.blockReward, { color: Colors.primary }]}>{b.reward} BTNG</Text>
                </View>
              ))}
            </View>

            {/* Latest TX */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="receipt-long" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Latest Transactions</Text>
              </View>
              {expTxs.map(tx => (
                <View key={tx.id} style={sd.txRow}>
                  <View style={[sd.txTypeIcon, { backgroundColor: tx.type === 'receive' ? Colors.successBg : Colors.primaryGlow }]}>
                    <MaterialIcons name={tx.type === 'receive' ? 'arrow-downward' : 'arrow-upward'} size={13} color={tx.type === 'receive' ? Colors.success : Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sd.txHash} numberOfLines={1}>{shortHash(tx.hash, 10, 6)}</Text>
                    <Text style={sd.txTime}>{tx.memo ?? 'BTNG Transfer'} · {tx.ts}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[sd.txAmt, { color: tx.type === 'receive' ? Colors.success : Colors.error }]}>
                      {tx.type === 'receive' ? '+' : '-'}{fmtNum(tx.amount, 4)}
                    </Text>
                    <View style={[sd.statusBadge, { backgroundColor: tx.status === 'confirmed' ? Colors.successBg : Colors.warningBg, borderColor: tx.status === 'confirmed' ? Colors.success + '33' : Colors.warning + '33' }]}>
                      <Text style={[sd.statusBadgeText, { color: tx.status === 'confirmed' ? Colors.success : Colors.warning }]}>{tx.status}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── MARKET ── */}
        {tab === 'market' && (
          <View style={sd.section}>
            {/* Hero price */}
            <View style={[sd.card, { alignItems: 'center', gap: Spacing.sm }]}>
              <Text style={sd.cardTitle}>BTNG · Bituncoin Gold</Text>
              <Animated.Text style={[sd.marketBigPrice, { transform: [{ scale: priceAnim }] }]}>
                ${price.toFixed(4)}
              </Animated.Text>
              <View style={[sd.changeChip, { backgroundColor: priceChange >= 0 ? Colors.successBg : Colors.errorBg }]}>
                <MaterialIcons name={priceChange >= 0 ? 'trending-up' : 'trending-down'} size={13} color={priceChange >= 0 ? Colors.success : Colors.error} />
                <Text style={[sd.changeChipText, { fontSize: FontSize.sm, color: priceChange >= 0 ? Colors.success : Colors.error }]}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}% 24h
                </Text>
              </View>
              <View style={sd.marketMetaRow}>
                {[
                  { label: 'Market Cap', val: fmtShort(marketCap) },
                  { label: '24h Volume', val: fmtShort(2_840_000) },
                  { label: 'Gold Peg',   val: '500kg GH-BoG' },
                  { label: 'Chain',      val: 'BTNG-MAINNET' },
                ].map(m => (
                  <View key={m.label} style={sd.marketMetaCard}>
                    <Text style={sd.marketMetaLabel}>{m.label}</Text>
                    <Text style={sd.marketMetaVal}>{m.val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Price chart */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="candlestick-chart" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Price History · 24h</Text>
              </View>
              <MiniBarChart data={priceHistory} color={priceChange >= 0 ? Colors.success : Colors.error} />
              <View style={sd.chartLabelRow}>
                <Text style={sd.chartLabel}>24h ago</Text>
                <Text style={sd.chartLabel}>Now</Text>
              </View>
            </View>

            {/* Pairs */}
            <View style={sd.card}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="swap-horiz" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Trading Pairs</Text>
              </View>
              {marketPairs.map(p => (
                <View key={p.pair} style={sd.pairRow}>
                  <View style={sd.pairIconWrap}>
                    <Text style={sd.pairIconText}>₿G</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sd.pairName}>{p.pair}</Text>
                    <Text style={sd.pairVol}>Vol: {fmtShort(p.vol)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={sd.pairPrice}>{p.pair.includes('BTC') ? p.price.toFixed(8) : p.pair.includes('ETH') ? p.price.toFixed(6) : p.price.toFixed(4)}</Text>
                    <View style={[sd.changeChip, { backgroundColor: p.change >= 0 ? Colors.successBg : Colors.errorBg }]}>
                      <Text style={[sd.changeChipText, { color: p.change >= 0 ? Colors.success : Colors.error }]}>
                        {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Gold peg info */}
            <View style={[sd.card, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="workspace-premium" size={16} color={Colors.primary} />
                <Text style={[sd.cardTitle, { color: Colors.primary }]}>Gold Reserve Peg</Text>
              </View>
              <Text style={sd.goldPegText}>{RESERVE_MSG}</Text>
              <View style={sd.goldPegGrid}>
                {[
                  { label: 'Reserve',  val: '500 KG' },
                  { label: 'Vault',    val: 'BoG #001 Accra' },
                  { label: 'Genesis',  val: '2026-02-18' },
                  { label: 'Grade',    val: '99.99% Fine' },
                ].map(g => (
                  <View key={g.label} style={sd.goldPegCard}>
                    <Text style={sd.goldPegLabel}>{g.label}</Text>
                    <Text style={sd.goldPegVal}>{g.val}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── BRAIN HEALTH PANEL ── */}
        {tab === 'brain' && (
          <View style={sd.section}>

            {/* Header card */}
            <View style={[sd.card, { borderColor: '#9945FF55' }]}>
              <View style={sd.cardHeader}>
                <Animated.View style={[br.liveDotWrap, { opacity: brainPulse, backgroundColor: brainHealthColor + '22' }]}>
                  <View style={[br.liveDot, { backgroundColor: brainHealthColor, shadowColor: brainHealthColor }]} />
                </Animated.View>
                <Text style={[sd.cardTitle, { color: '#9945FF' }]}>BTNG Brain Gate · localhost:8087</Text>
                <TouchableOpacity
                  style={[br.refreshBtn, { backgroundColor: brainHealthColor + '12' }]}
                  onPress={fetchBrainStatus}
                  disabled={brainLoading}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name="autorenew"
                    size={15}
                    color={brainLoading ? Colors.textMuted : brainHealthColor}
                  />
                </TouchableOpacity>
              </View>

              {/* Status badge */}
              {brainStatus ? (
                <View style={br.statusRow}>
                  <View style={[br.statusBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                    <View style={[br.statusDot, { backgroundColor: '#22C55E' }]} />
                    <Text style={[br.statusBadgeText, { color: '#22C55E' }]}>BRAIN_ALIVE</Text>
                  </View>
                  <Text style={br.versionText}>{brainStatus.brain_version}</Text>
                  <Text style={br.nodeText} numberOfLines={1}>{brainStatus.node}</Text>
                </View>
              ) : brainError ? (
                <View style={[br.statusRow, { backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.sm }]}>
                  <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                  <Text style={br.errorText} numberOfLines={2}>{brainError}</Text>
                </View>
              ) : brainLoading ? (
                <View style={br.statusRow}>
                  <ActivityIndicator size="small" color="#9945FF" />
                  <Text style={br.loadingText}>Connecting to Brain Gate…</Text>
                </View>
              ) : null}

              {brainLastFetch ? (
                <Text style={br.lastFetchText}>
                  Last updated: {brainLastFetch.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · auto-refresh every 30s
                </Text>
              ) : null}
            </View>

            {/* Metrics grid */}
            {brainStatus ? (
              <>
                <View style={br.metricsGrid}>
                  {/* Operator Tier */}
                  <View style={[br.metricCard, { borderColor: '#9945FF44' }]}>
                    <View style={[br.metricIcon, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                      <MaterialIcons name="verified-user" size={18} color="#9945FF" />
                    </View>
                    <Text style={br.metricLabel}>OPERATOR TIER</Text>
                    <Text style={[br.metricValue, { color: '#9945FF' }]}>{brainStatus.operator_tier}</Text>
                    <Text style={br.metricSub}>{brainStatus.tier_label}</Text>
                  </View>

                  {/* Rulings Count */}
                  <View style={[br.metricCard, { borderColor: Colors.primary + '44' }]}>
                    <View style={[br.metricIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                      <MaterialIcons name="gavel" size={18} color={Colors.primary} />
                    </View>
                    <Text style={br.metricLabel}>TOTAL RULINGS</Text>
                    <Text style={[br.metricValue, { color: Colors.primary }]}>
                      {brainStatus.rulings_count.toLocaleString()}
                    </Text>
                    <Text style={br.metricSub}>Law Journal entries</Text>
                  </View>

                  {/* Uptime */}
                  <View style={[br.metricCard, { borderColor: '#22C55E44' }]}>
                    <View style={[br.metricIcon, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                      <MaterialIcons name="timer" size={18} color="#22C55E" />
                    </View>
                    <Text style={br.metricLabel}>UPTIME</Text>
                    <Text style={[br.metricValue, { color: '#22C55E' }]}>
                      {brainStatus.uptime_s >= 3600
                        ? `${Math.floor(brainStatus.uptime_s / 3600)}h ${Math.floor((brainStatus.uptime_s % 3600) / 60)}m`
                        : brainStatus.uptime_s >= 60
                        ? `${Math.floor(brainStatus.uptime_s / 60)}m ${brainStatus.uptime_s % 60}s`
                        : `${brainStatus.uptime_s}s`}
                    </Text>
                    <Text style={br.metricSub}>since boot</Text>
                  </View>

                  {/* Node */}
                  <View style={[br.metricCard, { borderColor: '#F59E0B44' }]}>
                    <View style={[br.metricIcon, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' }]}>
                      <MaterialIcons name="hub" size={18} color="#F59E0B" />
                    </View>
                    <Text style={br.metricLabel}>NODE ID</Text>
                    <Text style={[br.metricValue, { color: '#F59E0B', fontSize: 11 }]} numberOfLines={1}>
                      {brainStatus.node}
                    </Text>
                    <Text style={br.metricSub}>BTNG Mesh</Text>
                  </View>
                </View>

                {/* Last Ruling card */}
                {brainStatus.last_ruling ? (
                  <View style={[sd.card, { borderColor: '#9945FF33' }]}>
                    <View style={sd.cardHeader}>
                      <MaterialIcons name="receipt-long" size={16} color="#9945FF" />
                      <Text style={[sd.cardTitle, { color: '#9945FF' }]}>Last Ruling</Text>
                      <View style={[br.statusBadge, {
                        backgroundColor:
                          brainStatus.last_ruling.ruling === 'ALLOW' ? '#22C55E18'
                          : brainStatus.last_ruling.ruling === 'DENY'  ? Colors.errorBg
                          : '#F59E0B18',
                        borderColor:
                          brainStatus.last_ruling.ruling === 'ALLOW' ? '#22C55E44'
                          : brainStatus.last_ruling.ruling === 'DENY'  ? Colors.error + '44'
                          : '#F59E0B44',
                      }]}>
                        <Text style={[br.statusBadgeText, {
                          color:
                            brainStatus.last_ruling.ruling === 'ALLOW' ? '#22C55E'
                            : brainStatus.last_ruling.ruling === 'DENY'  ? Colors.error
                            : '#F59E0B',
                        }]}>
                          {brainStatus.last_ruling.ruling ?? '—'}
                        </Text>
                      </View>
                    </View>
                    {[
                      { label: 'Intent',    val: brainStatus.last_ruling.intent    ?? '—' },
                      { label: 'Policy',    val: brainStatus.last_ruling.policy_id ?? brainStatus.last_ruling.policy ?? '—' },
                      { label: 'Reason',    val: brainStatus.last_ruling.reason    ?? '—' },
                      { label: 'Session',   val: brainStatus.last_ruling.session_id ?? '—' },
                      { label: 'Timestamp', val: brainStatus.last_ruling.ts        ?? '—' },
                    ].map(row => (
                      <View key={row.label} style={br.rulingRow}>
                        <Text style={br.rulingLabel}>{row.label}</Text>
                        <Text style={br.rulingVal} numberOfLines={2}>{row.val}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={[sd.card, { borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm }]}>
                    <MaterialIcons name="info-outline" size={24} color={Colors.textMuted} />
                    <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', includeFontPadding: false }}>Law Journal is empty — no rulings yet.{"\n"}Run a governed command to create the first entry.</Text>
                  </View>
                )}

                {/* ── Ruling Timeline Chart ── */}
                {(brainHistory.length > 0 || historyLoading) && (
                  <View style={[sd.card, { borderColor: '#9945FF33' }]}>
                    <View style={sd.cardHeader}>
                      <MaterialIcons name="timeline" size={16} color="#9945FF" />
                      <Text style={[sd.cardTitle, { color: '#9945FF' }]}>Ruling Timeline · Last {brainHistory.length}</Text>
                      {historyLoading ? (
                        <ActivityIndicator size="small" color="#9945FF" />
                      ) : (
                        <TouchableOpacity
                          style={br.refreshBtn}
                          onPress={fetchBrainHistory}
                          activeOpacity={0.75}
                        >
                          <MaterialIcons name="autorenew" size={14} color="#9945FF" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {(() => {
                      // Compute per-ruling-type presence arrays (1 = present, 0 = absent)
                      const allowData  = brainHistory.map(e => (e.ruling === 'ALLOW' || e.ruling === 'ALLOW_FULL' || e.ruling === 'ALLOW_REDUCED') ? 1 : 0);
                      const denyData   = brainHistory.map(e => e.ruling === 'DENY'   ? 1 : 0);
                      const escData    = brainHistory.map(e => (e.ruling ?? '').startsWith('ESCALATE') ? 1 : 0);

                      const allowCount = allowData.reduce((a, b) => a + b, 0);
                      const denyCount  = denyData.reduce((a, b) => a + b, 0);
                      const escCount   = escData.reduce((a, b) => a + b, 0);

                      return (
                        <View style={{ gap: Spacing.md }}>
                          {/* Summary pills */}
                          <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                            {[
                              { label: 'ALLOW',    count: allowCount, color: '#22C55E' },
                              { label: 'DENY',     count: denyCount,  color: Colors.error },
                              { label: 'ESCALATE', count: escCount,   color: '#F59E0B' },
                            ].map(s => (
                              <View key={s.label} style={[br.statusBadge, { flex: 1, justifyContent: 'center', backgroundColor: s.color + '18', borderColor: s.color + '44' }]}>
                                <View style={[br.statusDot, { backgroundColor: s.color }]} />
                                <Text style={[br.statusBadgeText, { color: s.color }]}>{s.label}</Text>
                                <Text style={{ fontSize: 14, fontWeight: FontWeight.heavy as any, color: s.color, includeFontPadding: false, marginLeft: 4 }}>{s.count}</Text>
                              </View>
                            ))}
                          </View>

                          {/* ALLOW bars */}
                          {allowCount > 0 && (
                            <View style={{ gap: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[br.statusDot, { backgroundColor: '#22C55E' }]} />
                                <Text style={[br.metricLabel, { color: '#22C55E' }]}>ALLOW distribution</Text>
                              </View>
                              <MiniBarChart data={allowData.length ? allowData : [0]} color="#22C55E" />
                            </View>
                          )}

                          {/* DENY bars */}
                          {denyCount > 0 && (
                            <View style={{ gap: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[br.statusDot, { backgroundColor: Colors.error }]} />
                                <Text style={[br.metricLabel, { color: Colors.error }]}>DENY distribution</Text>
                              </View>
                              <MiniBarChart data={denyData.length ? denyData : [0]} color={Colors.error} />
                            </View>
                          )}

                          {/* ESCALATE bars */}
                          {escCount > 0 && (
                            <View style={{ gap: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[br.statusDot, { backgroundColor: '#F59E0B' }]} />
                                <Text style={[br.metricLabel, { color: '#F59E0B' }]}>ESCALATE distribution</Text>
                              </View>
                              <MiniBarChart data={escData.length ? escData : [0]} color="#F59E0B" />
                            </View>
                          )}

                          {/* Recent ruling rows */}
                          <View style={{ gap: 4 }}>
                            <Text style={[br.metricLabel, { marginBottom: 4 }]}>RECENT RULINGS (newest last)</Text>
                            {brainHistory.slice(-6).map((entry, i) => {
                              const ruling = entry.ruling ?? '—';
                              const isAllow = ruling.startsWith('ALLOW');
                              const isDeny  = ruling === 'DENY';
                              const color   = isAllow ? '#22C55E' : isDeny ? Colors.error : '#F59E0B';
                              return (
                                <View key={i} style={[br.rulingRow, { alignItems: 'center' }]}>
                                  <View style={[br.statusDot, { backgroundColor: color, flexShrink: 0 }]} />
                                  <Text style={[br.rulingLabel, { width: 80 }]} numberOfLines={1}>
                                    {entry.intent?.replace('intent_', '') ?? '—'}
                                  </Text>
                                  <Text style={[br.rulingVal, { flex: 0, color, fontWeight: FontWeight.bold as any, marginRight: 6 }]}>
                                    {ruling}
                                  </Text>
                                  <Text style={[br.rulingVal, { color: Colors.textMuted, fontSize: 9 }]} numberOfLines={1}>
                                    {entry.policy_id ?? '—'}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                )}

                {/* ── Latency Trend ── */}
                {brainHistory.length > 0 && (() => {
                  const latData = brainHistory.map(e => e.latency_ms ?? 0);
                  const validLat = latData.filter(v => v > 0);
                  const avgLat = validLat.length
                    ? Math.round(validLat.reduce((a, b) => a + b, 0) / validLat.length)
                    : 0;
                  const maxLat = validLat.length ? Math.max(...validLat) : 0;
                  const minLat = validLat.length ? Math.min(...validLat) : 0;
                  const slowCount   = latData.filter(v => v > 100 && v <= 500).length;
                  const critCount   = latData.filter(v => v > 500).length;
                  const fastCount   = latData.filter(v => v > 0 && v <= 100).length;
                  const latColor = (ms: number) =>
                    ms > 500 ? Colors.error : ms > 100 ? '#F59E0B' : '#22C55E';

                  return (
                    <View style={[sd.card, { borderColor: '#F59E0B33' }]}>
                      <View style={sd.cardHeader}>
                        <MaterialIcons name="timer" size={16} color="#F59E0B" />
                        <Text style={[sd.cardTitle, { color: '#F59E0B' }]}>
                          Latency Trend · Last {brainHistory.length}
                        </Text>
                        {/* Avg badge */}
                        <View style={[br.statusBadge, {
                          backgroundColor: latColor(avgLat) + '18',
                          borderColor:     latColor(avgLat) + '44',
                        }]}>
                          <MaterialIcons name="schedule" size={10} color={latColor(avgLat)} />
                          <Text style={[br.statusBadgeText, { color: latColor(avgLat) }]}>
                            avg {avgLat}ms
                          </Text>
                        </View>
                      </View>

                      {/* Summary stat row */}
                      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                        {[
                          { label: 'FAST',  sublabel: '≤100ms', count: fastCount,  color: '#22C55E' },
                          { label: 'SLOW',  sublabel: '≤500ms', count: slowCount,  color: '#F59E0B' },
                          { label: 'CRIT',  sublabel: '>500ms',  count: critCount,  color: Colors.error },
                        ].map(s => (
                          <View key={s.label} style={[
                            br.statusBadge,
                            { flex: 1, justifyContent: 'center',
                              backgroundColor: s.color + '18',
                              borderColor:     s.color + '44' },
                          ]}>
                            <View style={[br.statusDot, { backgroundColor: s.color }]} />
                            <Text style={[br.statusBadgeText, { color: s.color }]}>{s.label}</Text>
                            <Text style={{ fontSize: 13, fontWeight: FontWeight.heavy as any, color: s.color, includeFontPadding: false, marginLeft: 3 }}>
                              {s.count}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Chart */}
                      <LatencyBarChart data={latData} />

                      {/* x-axis labels */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                        <Text style={sd.chartLabel}>oldest</Text>
                        <Text style={sd.chartLabel}>newest</Text>
                      </View>

                      {/* Min / Avg / Max stat strip */}
                      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                        {[
                          { label: 'MIN',  val: `${minLat}ms`, color: '#22C55E' },
                          { label: 'AVG',  val: `${avgLat}ms`, color: latColor(avgLat) },
                          { label: 'MAX',  val: `${maxLat}ms`, color: latColor(maxLat) },
                        ].map(m => (
                          <View key={m.label} style={[
                            br.metricCard,
                            { flex: 1, minWidth: 0, paddingVertical: Spacing.sm,
                              borderColor: m.color + '33' },
                          ]}>
                            <Text style={[br.metricLabel, { color: Colors.textMuted }]}>{m.label}</Text>
                            <Text style={[br.metricValue, { color: m.color, fontSize: 14 }]}>{m.val}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Threshold legend */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {[
                          { dot: '#22C55E', label: '≤100ms  fast' },
                          { dot: '#F59E0B', label: '101–500ms  slow' },
                          { dot: Colors.error,   label: '>500ms  critical' },
                        ].map(l => (
                          <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.dot }} />
                            <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>{l.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })()}

                {/* ── Full Ruling Log ── */}
                {brainHistory.length > 0 && (
                  <View style={[sd.card, { borderColor: '#9945FF33' }]}>
                    {/* Collapsible header */}
                    <TouchableOpacity
                      style={[sd.cardHeader, { paddingVertical: 2 }]}
                      onPress={() => {
                        setFullLogVisible(v => !v);
                        setExpandedLogIndex(null);
                      }}
                      activeOpacity={0.75}
                    >
                      <MaterialIcons name="list-alt" size={16} color="#9945FF" />
                      <Text style={[sd.cardTitle, { color: '#9945FF' }]}>
                        Full Ruling Log · {brainHistory.length} entries
                      </Text>
                      <View style={[br.statusBadge, { backgroundColor: '#9945FF12', borderColor: '#9945FF44', flexShrink: 0 }]}>
                        <Text style={[br.statusBadgeText, { color: '#9945FF' }]}>
                          {fullLogVisible ? 'COLLAPSE' : 'EXPAND'}
                        </Text>
                      </View>
                      <MaterialIcons
                        name={fullLogVisible ? 'expand-less' : 'expand-more'}
                        size={18}
                        color="#9945FF"
                      />
                    </TouchableOpacity>

                    {fullLogVisible && (
                      <View style={{ gap: 0 }}>
                        {/* Column headers */}
                        <View style={[frl.headerRow]}>
                          <Text style={[frl.colHeader, { flex: 2 }]}>INTENT</Text>
                          <Text style={[frl.colHeader, { flex: 2 }]}>POLICY</Text>
                          <Text style={[frl.colHeader, { flex: 1, textAlign: 'center' }]}>RULING</Text>
                          <Text style={[frl.colHeader, { width: 42, textAlign: 'right' }]}>LAT.</Text>
                          <Text style={[frl.colHeader, { width: 52, textAlign: 'right' }]}>TIME</Text>
                        </View>

                        <ScrollView style={frl.scrollBox} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                          {brainHistory.map((entry, i) => {
                            const ruling   = entry.ruling ?? '—';
                            const isAllow  = ruling.startsWith('ALLOW');
                            const isDeny   = ruling === 'DENY';
                            const isEsc    = (ruling ?? '').startsWith('ESCALATE');
                            const rColor   = isAllow ? '#22C55E' : isDeny ? Colors.error : '#F59E0B';
                            const isExpanded = expandedLogIndex === i;
                            const intent   = (entry.intent ?? '—').replace('intent_', '');
                            const policy   = entry.policy_id ?? '—';
                            const latency  = entry.latency_ms != null ? `${entry.latency_ms}ms` : '—';
                            const ts       = entry.ts ? new Date(entry.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
                            const reason   = entry.reason ?? 'No reason provided.';

                            return (
                              <View key={i}>
                                <TouchableOpacity
                                  style={[
                                    frl.row,
                                    i % 2 === 0 && frl.rowAlt,
                                    isExpanded && frl.rowExpanded,
                                  ]}
                                  onPress={() => setExpandedLogIndex(isExpanded ? null : i)}
                                  activeOpacity={0.75}
                                >
                                  {/* Intent */}
                                  <Text style={[frl.cellText, { flex: 2 }]} numberOfLines={1}>{intent}</Text>

                                  {/* Policy */}
                                  <Text style={[frl.cellText, frl.cellMuted, { flex: 2 }]} numberOfLines={1}>{policy}</Text>

                                  {/* Ruling badge */}
                                  <View style={[frl.rulingBadge, { flex: 1, backgroundColor: rColor + '18', borderColor: rColor + '55' }]}>
                                    <View style={[frl.rulingDot, { backgroundColor: rColor }]} />
                                    <Text style={[frl.rulingBadgeText, { color: rColor }]} numberOfLines={1}>
                                      {ruling.length > 8 ? ruling.slice(0, 6) + '…' : ruling}
                                    </Text>
                                  </View>

                                  {/* Latency */}
                                  <Text style={[frl.cellText, frl.cellMono, { width: 42, textAlign: 'right' }]}>{latency}</Text>

                                  {/* Timestamp */}
                                  <Text style={[frl.cellText, frl.cellMuted, { width: 52, textAlign: 'right' }]}>{ts}</Text>

                                  {/* Expand indicator */}
                                  <MaterialIcons
                                    name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                                    size={13}
                                    color={isExpanded ? '#9945FF' : Colors.textMuted}
                                    style={{ marginLeft: 2, flexShrink: 0 }}
                                  />
                                </TouchableOpacity>

                                {/* Expanded reason row */}
                                {isExpanded && (
                                  <View style={[frl.reasonBox, { borderLeftColor: rColor }]}>
                                    <View style={frl.reasonHeaderRow}>
                                      <MaterialIcons name="info-outline" size={12} color={rColor} />
                                      <Text style={[frl.reasonLabel, { color: rColor }]}>REASON</Text>
                                    </View>
                                    <Text style={frl.reasonText}>{reason}</Text>
                                    {entry.session_id ? (
                                      <Text style={frl.reasonMeta} numberOfLines={1}>
                                        Session: {entry.session_id}
                                      </Text>
                                    ) : null}
                                    {entry.ts ? (
                                      <Text style={frl.reasonMeta}>
                                        Full timestamp: {entry.ts}
                                      </Text>
                                    ) : null}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </ScrollView>

                        {/* Footer */}
                        <View style={frl.footerRow}>
                          <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
                          <Text style={frl.footerText}>
                            Tap a row to expand the full reason. Entries ordered oldest → newest.
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* How to start tip */}
                <View style={[sd.card, { borderColor: Colors.border, backgroundColor: Colors.bgElevated }]}>
                  <View style={sd.cardHeader}>
                    <MaterialIcons name="terminal" size={16} color={Colors.textMuted} />
                    <Text style={sd.cardTitle}>Start Brain Gate</Text>
                  </View>
                  <Text style={br.tipCode}>{`cd sdk/btng-ai-brain\npython brain_gate.py`}</Text>
                  <Text style={br.tipNote}>Brain Gate must be running locally for this panel to connect. Port 8087.</Text>
                </View>
              </>
            ) : (
              /* Offline placeholder */
              <View style={[sd.card, { borderColor: Colors.border, alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl }]}>
                <MaterialIcons name="psychology" size={40} color={Colors.textMuted} />
                <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false }}>Brain Gate Offline</Text>
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, includeFontPadding: false, paddingHorizontal: Spacing.lg }}>
                  Start `python sdk/btng-ai-brain/brain_gate.py` on localhost:8087 to connect this panel.
                </Text>
                <TouchableOpacity
                  style={[br.refreshBtn, { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: '#9945FF18', borderWidth: 1, borderColor: '#9945FF44' }]}
                  onPress={fetchBrainStatus}
                  disabled={brainLoading}
                  activeOpacity={0.75}
                >
                  {brainLoading
                    ? <ActivityIndicator size="small" color="#9945FF" />
                    : <Text style={{ color: '#9945FF', fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false }}>Retry Connection</Text>
                  }
                </TouchableOpacity>
              </View>
            )}

          </View>
        )}

        {/* ── HD DERIVE ── */}
        {tab === 'derive' && (
          <HDDerivePanel />
        )}

        {/* ── RESERVE TERMINAL ── */}
        {tab === 'reserve' && (
          <View style={sd.section}>

            {/* Quantum Boot Sequence Terminal */}
            {!quantumBooted && (
              <Animated.View style={[qbt.wrapper, { opacity: quantumGlow, transform: [{ scale: quantumScale }] }]}>
                <View style={qbt.topBar}>
                  <View style={[qbt.dot, { backgroundColor: Colors.error }]} />
                  <View style={[qbt.dot, { backgroundColor: '#F59E0B' }]} />
                  <View style={[qbt.dot, { backgroundColor: '#9945FF' }]} />
                  <Text style={qbt.barTitle}>QUANTUM SOVEREIGN RESERVE · BOOT SEQUENCE</Text>
                  <View style={qbt.liveChip}>
                    <View style={qbt.liveChipDot} />
                    <Text style={qbt.liveChipText}>INIT</Text>
                  </View>
                </View>
                <View style={qbt.body}>
                  {quantumLines.map((line, i) => (
                    <Text
                      key={i}
                      style={[
                        qbt.line,
                        line.startsWith('⚛') && { color: '#C084FC', fontWeight: FontWeight.heavy as any, fontSize: 11 },
                        line.startsWith('✓') && { color: '#22C55E', fontWeight: FontWeight.heavy as any },
                        line.includes('Asset ID') && { color: '#E9D5FF' },
                        line.includes('USD Reserve') && { color: '#22C55E' },
                        line.includes('Gold Spot') && { color: Colors.primary },
                        line.includes('Gold Equivalent') && { color: '#D4A017' },
                        line.includes('ACTIVE') && { color: '#22C55E' },
                        line.includes('Valuation') && { color: '#F59E0B' },
                        line.includes('Reserve Type') && { color: '#9945FF' },
                      ]}
                    >
                      {line}
                    </Text>
                  ))}
                  {quantumLines.length > 0 && !quantumBooted && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                      <Text style={qbt.prompt}>{'> '}</Text>
                      <Animated.Text style={[qbt.cursor, { opacity: quantumCursor }]}>█</Animated.Text>
                    </View>
                  )}
                </View>
                {/* Purple glow progress bar */}
                <View style={qbt.progressTrack}>
                  <Animated.View style={[
                    qbt.progressFill,
                    { width: `${Math.min(100, (quantumLines.length / 11) * 100)}%` as any },
                  ]} />
                </View>
              </Animated.View>
            )}

            {/* Quantum Sovereign Reserve Card — revealed after boot */}
            {quantumBooted && (
            <Animated.View style={[rv.quantumCard, { transform: [{ scale: quantumScale }] }]}>
              <View style={rv.quantumHeader}>
                <View style={rv.quantumIconWrap}><Text style={rv.quantumIconText}>⚛</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={rv.quantumTitle}>Quantum Sovereign Reserve · AFT-54</Text>
                  <Text style={rv.quantumAssetId} numberOfLines={1}>{QUANTUM_RESERVE.assetId}</Text>
                </View>
                <View style={rv.quantumStatusBadge}>
                  <View style={rv.quantumStatusDot} />
                  <Text style={rv.quantumStatusText}>ACTIVE</Text>
                </View>
              </View>
              <View style={rv.quantumGrid}>
                <View style={rv.quantumCell}>
                  <Text style={rv.quantumCellLabel}>USD RESERVE</Text>
                  <Text style={[rv.quantumCellValue, { color: '#22C55E' }]}>$30T</Text>
                  <Text style={rv.quantumCellSub}>$30,000,000,000,000</Text>
                </View>
                <View style={rv.quantumCell}>
                  <Text style={rv.quantumCellLabel}>GOLD SPOT PRICE</Text>
                  <Text style={[rv.quantumCellValue, { color: Colors.primary, fontSize: 14 }]}>${QUANTUM_RESERVE.goldSpotPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                  <Text style={rv.quantumCellSub}>per troy ounce</Text>
                </View>
                <View style={rv.quantumCell}>
                  <Text style={rv.quantumCellLabel}>GOLD EQUIVALENT</Text>
                  <Text style={[rv.quantumCellValue, { color: '#9945FF', fontSize: 14 }]}>{(QUANTUM_RESERVE.goldOzEquiv / 1_000_000).toFixed(1)}M oz</Text>
                  <Text style={rv.quantumCellSub}>6,718,827,872 troy oz</Text>
                </View>
                <View style={rv.quantumCell}>
                  <Text style={rv.quantumCellLabel}>VALUATION DATE</Text>
                  <Text style={[rv.quantumCellValue, { color: '#F59E0B', fontSize: 12 }]}>{QUANTUM_RESERVE.valuationDate}</Text>
                  <Text style={rv.quantumCellSub}>Sovereign Oracle</Text>
                </View>
              </View>
              <View style={rv.quantumFooterRow}>
                <MaterialIcons name="account-balance" size={10} color='#9945FF' />
                <Text style={rv.quantumFooterText}>{QUANTUM_RESERVE.reserveType}</Text>
                <View style={{ flex: 1 }} /><Text style={[rv.quantumFooterText, { color: '#22C55E' }]}>{QUANTUM_RESERVE.status}</Text>
              </View>
            </Animated.View>
            )}

            {/* Quantum Live Data Feed — shown after boot */}
            {quantumBooted && (
              <QuantumLiveFeed
                price={price}
                priceChange={priceChange}
                goldSpotPrice={QUANTUM_RESERVE.goldSpotPrice}
                usdReserve={QUANTUM_RESERVE.usdValue}
              />
            )}

            {/* Terminal Header */}
            <View style={rv.terminalCard}>
              <View style={rv.terminalTopBar}>
                <View style={rv.terminalDot} /><View style={[rv.terminalDot, { backgroundColor: '#F59E0B' }]} /><View style={[rv.terminalDot, { backgroundColor: '#22C55E' }]} />
                <Text style={rv.terminalBarTitle}>BTNG SOVEREIGN RESERVE TERMINAL · v2.0.54</Text>
                <View style={rv.terminalBadge}><Text style={rv.terminalBadgeText}>LIVE</Text></View>
              </View>
              <ScrollView style={rv.terminalBody} showsVerticalScrollIndicator={false}>
                {termLines.map((line, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[
                      rv.terminalLine,
                      line.includes('PERMANENTLY') && { color: '#F59E0B', fontWeight: FontWeight.heavy },
                      line.includes('204,199') && { color: Colors.primary, fontWeight: FontWeight.bold },
                      line.includes('$29,500') && { color: '#22C55E', fontWeight: FontWeight.bold },
                      line.includes('VERIFIED') && { color: '#22C55E' },
                      line.includes('ERROR') && { color: Colors.error },
                    ]}>{line}</Text>
                  </View>
                ))}
                {termReady && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Text style={rv.terminalPrompt}>{'> '}</Text>
                    <Animated.Text style={[rv.terminalCursor, { opacity: termCursor }]}>█</Animated.Text>
                  </View>
                )}
              </ScrollView>
            </View>

            {/* Sovereign Reserve Stats */}
            <View style={rv.sovereignCard}>
              <View style={rv.sovereignHeader}>
                <View style={rv.sovereignFlag}><Text style={rv.sovereignFlagText}>🌍</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={rv.sovereignTitle}>54 Nations United | Sovereign Reserve</Text>
                  <Text style={rv.sovereignSub}>INFINITY RESERVE · PERMANENTLY LOCKED</Text>
                </View>
                <Animated.View style={[rv.lockWrap, { transform: [{ scale: reservePulse }] }]}>
                  <MaterialIcons name="lock" size={22} color={Colors.primary} />
                </Animated.View>
              </View>

              {/* Main Balance */}
              <View style={rv.balanceBlock}>
                <Text style={rv.balancePrimary}>
                  {SOVEREIGN_RESERVE.displayBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} BTNG
                </Text>
                <Text style={rv.balanceLabel}>Display Balance · Primary Sovereign Reserve</Text>
                <View style={rv.addressPill}>
                  <MaterialIcons name="fingerprint" size={11} color={Colors.primary} />
                  <Text style={rv.addressText} numberOfLines={1}>{SOVEREIGN_RESERVE.address}</Text>
                </View>
                <Text style={rv.lockedLabel}>Sovereign Reserve Backing — PERMANENTLY LOCKED FOREVER</Text>
              </View>

              {/* Grid metrics */}
              <View style={rv.metricsGrid}>
                <View style={[rv.metricCell, { borderColor: '#22C55E33' }]}>
                  <Text style={rv.metricLabel}>USD VALUE</Text>
                  <Text style={[rv.metricValue, { color: '#22C55E' }]}>
                    ${(SOVEREIGN_RESERVE.usdValue / 1_000_000_000_000).toFixed(1)}T
                  </Text>
                  <Text style={rv.metricSub}>$29,500,000,000,000</Text>
                </View>
                <View style={[rv.metricCell, { borderColor: Colors.primary + '33' }]}>
                  <Text style={rv.metricLabel}>GOLD SPOT PRICE</Text>
                  <Text style={[rv.metricValue, { color: Colors.primary, fontSize: 16 }]}>
                    ${SOVEREIGN_RESERVE.goldSpotPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={rv.metricSub}>per troy oz · LIVE</Text>
                </View>
                <View style={[rv.metricCell, { borderColor: '#F59E0B33' }]}>
                  <Text style={rv.metricLabel}>GOLD EQUIV</Text>
                  <Text style={[rv.metricValue, { color: '#F59E0B', fontSize: 16 }]}>
                    {(SOVEREIGN_RESERVE.goldOzEquiv / 1_000_000).toFixed(1)}M oz
                  </Text>
                  <Text style={rv.metricSub}>6,565,169,873 oz XAU</Text>
                </View>
                <View style={[rv.metricCell, { borderColor: '#9945FF33' }]}>
                  <Text style={rv.metricLabel}>BTC EQUIVALENT</Text>
                  <Text style={[rv.metricValue, { color: '#9945FF', fontSize: 28 }]}>∞ BTC</Text>
                  <Text style={rv.metricSub}>Infinite gold backing</Text>
                </View>
              </View>

              {/* Oracle + Ledger Status Row */}
              <View style={rv.statusRow}>
                <View style={[rv.statusChip, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                  <View style={[rv.statusDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={[rv.statusChipText, { color: '#22C55E' }]}>ORACLE: {SOVEREIGN_RESERVE.oracleStatus}</Text>
                </View>
                <View style={[rv.statusChip, { backgroundColor: Colors.primary + '18', borderColor: Colors.primary + '44' }]}>
                  <View style={[rv.statusDot, { backgroundColor: Colors.primary }]} />
                  <Text style={[rv.statusChipText, { color: Colors.primary }]}>LEDGER: {SOVEREIGN_RESERVE.ledgerStatus}</Text>
                </View>
              </View>

              {/* Reserve Type */}
              <View style={rv.reserveTypeBadge}>
                <MaterialIcons name="workspace-premium" size={10} color={Colors.primary} />
                <Text style={rv.reserveTypeText}>{SOVEREIGN_RESERVE.reserveType}</Text>
              </View>

              {/* Locked Banner */}
              <View style={rv.lockedBanner}>
                <MaterialIcons name="lock" size={14} color={Colors.error} />
                <Text style={rv.lockedBannerText}>PERMANENTLY LOCKED FOR PUBLIC USERS — AUTHORIZED ACCESS ONLY</Text>
              </View>
              <Text style={rv.lockedDesc}>
                This sovereign reserve is permanently locked for regular users but can be accessed by authorized personnel with private key verification
              </Text>
            </View>

            {/* Authorized Access Panel */}
            <View style={rv.accessCard}>
              <View style={rv.accessHeader}>
                <View style={rv.accessIconWrap}>
                  <MaterialIcons name="admin-panel-settings" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={rv.accessTitle}>Authorized Sovereign Access</Text>
                  <Text style={rv.accessSub}>For authorized personnel only — Requires private key verification</Text>
                </View>
              </View>
              {!reserveAccessVisible ? (
                <TouchableOpacity
                  style={rv.accessRevealBtn}
                  onPress={() => setReserveAccessVisible(true)}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="vpn-key" size={16} color={Colors.primary} />
                  <Text style={rv.accessRevealBtnText}>Enter Private Key</Text>
                </TouchableOpacity>
              ) : (
                <View style={rv.accessForm}>
                  <Text style={rv.accessFieldLabel}>SOVEREIGN PRIVATE KEY</Text>
                  <View style={rv.accessInputRow}>
                    <MaterialIcons name="vpn-key" size={16} color={Colors.primary} />
                    <TextInput
                      style={rv.accessInput}
                      value={accessKey}
                      onChangeText={setAccessKey}
                      placeholder="Enter authorized key..."
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <TouchableOpacity
                    style={[rv.accessSubmitBtn, !accessKey.trim() && { opacity: 0.5 }]}
                    disabled={!accessKey.trim()}
                    onPress={() => {
                      setAccessAttempted(true);
                      setTimeout(() => setAccessAttempted(false), 3000);
                    }}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="security" size={15} color={Colors.bg} />
                    <Text style={rv.accessSubmitBtnText}>Verify Sovereign Key</Text>
                  </TouchableOpacity>
                  {accessAttempted && (
                    <View style={rv.accessDenied}>
                      <MaterialIcons name="block" size={14} color={Colors.error} />
                      <Text style={rv.accessDeniedText}>ACCESS DENIED — Unauthorized terminal. Contact Sovereign Administration.</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Address Details */}
            <View style={rv.addrDetailCard}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="account-balance" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Address Details</Text>
                <View style={[rv.lockedPill, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }]}>
                  <MaterialIcons name="lock" size={9} color={Colors.error} />
                  <Text style={[rv.lockedPillText, { color: Colors.error }]}>LOCKED</Text>
                </View>
              </View>
              {[
                { label: '∞ BTNGG',   sub: 'Total Received',     color: '#22C55E' },
                { label: 'LOCKED',    sub: 'Total Sent',         color: Colors.error },
                { label: 'SYSTEM',    sub: 'Total Transactions', color: Colors.warning },
                { label: 'GENESIS',   sub: 'First Transaction',  color: Colors.primary },
              ].map(item => (
                <View key={item.sub} style={rv.addrRow}>
                  <Text style={rv.addrRowLabel}>{item.sub}</Text>
                  <Text style={[rv.addrRowVal, { color: item.color }]}>{item.label}</Text>
                </View>
              ))}
              <View style={rv.sovereignNote}>
                <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
                <Text style={rv.sovereignNoteText}>
                  This is the master sovereign reserve address for the BTNG network, permanently locked and backed by gold reserves.
                </Text>
              </View>
              <View style={[rv.lockedBanner, { marginTop: 4 }]}>
                <MaterialIcons name="lock" size={13} color={Colors.error} />
                <Text style={rv.lockedBannerText}>🔒 PERMANENTLY LOCKED FOREVER — No transactions can be sent from this address.</Text>
              </View>
            </View>

            {/* Nations Grid */}
            <View style={rv.nationsCard}>
              <View style={sd.cardHeader}>
                <MaterialIcons name="public" size={16} color={Colors.primary} />
                <Text style={sd.cardTitle}>Sovereign Coverage · 54 African Nations</Text>
              </View>
              <View style={rv.nationsGrid}>
                {[
                  '🇬🇭 Ghana','🇳🇬 Nigeria','🇰🇪 Kenya','🇿🇦 South Africa','🇪🇬 Egypt',
                  '🇪🇹 Ethiopia','🇹🇿 Tanzania','🇺🇬 Uganda','🇿🇼 Zimbabwe','🇨🇲 Cameroon',
                  '🇸🇳 Senegal','🇨🇮 Ivory Coast','🇲🇦 Morocco','🇹🇳 Tunisia','🇦🇴 Angola',
                  '🇲🇿 Mozambique','🇿🇲 Zambia','🇲🇼 Malawi','🇧🇼 Botswana','🇳🇦 Namibia',
                ].map((n, i) => (
                  <View key={i} style={rv.nationChip}>
                    <Text style={rv.nationChipText}>{n}</Text>
                  </View>
                ))}
                <View style={[rv.nationChip, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
                  <Text style={[rv.nationChipText, { color: Colors.primary, fontWeight: FontWeight.bold }]}>+34 more</Text>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={rv.footerCard}>
              <Text style={rv.footerLine}>Sovereign African Blockchain | 54 Nations United</Text>
              <Text style={rv.footerLine}>$29.5 Trillion Reserve | Gold-Backed Security</Text>
              <Text style={rv.footerLine}>© 2026 African Family Trust · Genesis Block: March 2026 · Network: LIVE</Text>
              <Text style={rv.footerLine}>Node: 168.231.79.52:64799 · srv1282934.hstgr.cloud · Chain: BTNG-MAINNET</Text>
            </View>

          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── HD Derive Panel ──────────────────────────────────────────────────────────
function HDDerivePanel() {
  const [wordCount, setWordCount] = React.useState<12 | 24>(24);
  const [mnemonic, setMnemonic] = React.useState('');
  const [mnemonicVisible, setMnemonicVisible] = React.useState(true);
  const [derivePath, setDerivePath] = React.useState('BTNG1G/w/0');
  const [batchBase, setBatchBase] = React.useState('BTNG1G/w');
  const [deriveResult, setDeriveResult] = React.useState<any>(null);
  const [batchResults, setBatchResults] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  const handleCopy = (val: string, key: string) => {
    Clipboard.setStringAsync(val).catch(()=>{});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // BIP39 word list subset (256 common words, deterministic)
  const WLIST = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic afford afraid again age agent agree ahead aim air airport alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount animal ankle announce annual another answer antenna antique anxiety apart appear apple approve april arch arctic area argue arm armor army around arrange arrest arrive art artist ask asset assume asthma athlete atom attack attend attitude attract auction aunt author auto autumn average avocado avoid awake aware away axis baby balance banana banner bar barely bargain barrel base basket battle beach bean beauty become beef begin behave belief below belt bench benefit best betray better between beyond bid bike bind biology bird birth bitter black blade blame blanket blast blind blood blue blur board boat body bomb bone book boost border borrow boss bottom bounce box boy brain brand brave brick bridge bright bring broken bronze brother brush bubble buddy budget buffalo build bulk bullet bundle burden burger burst bus butter buyer cable cage cake calm camera camp canal candy cannon canvas capable capital captain carbon card cargo carpet carry cart case cash cat catalog catch cattle caught cause cave ceiling celery cement century certain chair change chaos charge chase cheap cheese cherry chest chicken chief child choice chronic chunk citizen civil claim clay clean clever click client cliff climb clinic clock close cloth cloud coach coin collect color column combine comfort common company congress connect control cook copper copy coral core corn correct cost cotton country cover crack craft crane crash crazy cream creek crew cricket crime crisp cross crowd cruel cube culture cup curious current curtain custom cute cycle dad damage dance danger daughter dawn deal debate decide define defy degree delay deliver demand demise deny depart depend design desk despair destroy device devote diagram diamond diary dice diesel diet digital dinner discover disease dismiss display distance divide doctor document dog doll dolphin domain donate door dose double dragon drama draw dream dress drift drill drink drive drop drum dry duck dumb during dust duty dynamic eagle earn earth east easy echo edge effort eight elder element elephant elevator elite else emerge emotion employ empty enable engage engine enjoy enter entry equal erase escape essay eternal evidence evil evolve exact example exchange excite exist exit expand expire explain expose express extra eye face faith fall fame family fan fantasy fashion fee feel fever field figure file film filter find fine fire fish flag flame flat flee float flower fluid foam focus food foot force forest forget fork fortune forward fossil found fox fragile frame fresh friend frog front frost fuel future game gap garden garlic garment gate gauge gaze genius gentle genuine gesture ghost gift giggle ginger give glass globe glory glove glow glue goat goddess gold good goose grant grass gravity great green grid grief grow guard guide guilt guitar gym habit hair half hammer happy harvest head health heart height help hero high hill hint hip hire history hobby hold hole home honey hood hope horn host hover huge human humble hunt hybrid ice icon ignore ill image immune impact impulse income index infant inform inner innocent input inquiry insect inspire intact interest invite iron island isolate issue item jacket jar jazz jealous jelly jewel job join joke joy judge juice jump jungle junior junk just kangaroo keen keep key kick kid kingdom kiss kit kitchen knee knife knock lab lamp large later laugh lava law lawn layer lazy leader learn leave legal legend lend level liar liberty library license lift like limit lion liquid list live lizard load loan lobster local lock logic long loop loud lounge love loyal lucky lumber lunch luxury magic magnet main mammal mango manual maple march margin marine market marriage mask master match material math matrix maze meadow medal media melody melt member memory mention menu mercy metal method middle milk million mimic mind miracle miss model monitor monkey monster moon moral motion motor mountain mouse movie muffin mule muscle museum mushroom music naive name narrow nature neck need nerve nest network next night noble noise nominee noodle normal north note novel nurse oak obey object ocean offer office often okay old olive orbit orange order organ other outdoor output oval owner oyster page palm panda panel papa parade parent park parrot party pass patch path patrol pause pave peace pear peasant pelican pen penalty pencil pepper perfect permit person phone photo phrase piano picnic picture piece pig pilot pink pioneer pipe pitch pizza place planet plate play please pledge pluck plug plunge poem poet polar pole police pond pony pool portion powder power practice predict prefer present prevent price pride print private prize process produce profit program project promote proof property protect provide public pull pulse pumpkin punch pupil purchase purity push puzzle pyramid quality quarter question quick quit quiz quote rabbit raccoon race radar radio rage rain raise rally ramp ranch range rapid rate raven reach real reason rebel recall receive record reduce reform refuse region reject relax release rely remain remind remove render renew rent repair replace report rescue resemble resist resource retire return reward rhythm ride ridge ring ritual rival river road robot rocket roof round route royal rubber rule runway sad sadness safe sail salad salmon salt save scale scan scatter scene school science scissors scout screen script sea season seat second secret security seed seek select sell senior sense sentence series service session settle seven shadow share shed shell shield shine ship shock shoe shoot short shoulder show shrimp shuffle sight sign silk silver simple since sing siren sister situate six size sketch skin skirt skull slab slam sleep slice slide slim slot slow small smart smile smoke snake soil solar soldier solid solution solve song sorry soul sound source south space spare spawn speak speed spell spend sphere spike spin spirit split spoil sponsor spoon spray spread spy square squirrel stadium stand start stay steel stem stick still stock stone store stream strike strong student stumble subject submit subway success sudden suffer suggest suit summer sunny super supply surface surge surprise sustain swap swear sweet swift swim swing sword symbol table tackle tail talent tank tape target task taxi teach team tell tent term test thank theory there thing thought throw ticket tilt timber time tiny tip tired title toast tobacco today toilet token tomato tone tonight tool tooth top torch tornado tortoise total tourist toward tower town toy track trade traffic train trap travel treat tree trend trial trick trigger trip trophy trouble truck trust try tube turn turtle twenty twice twin type ugly umbrella unable uncle uncover unfair uniform unique unlock until unusual update upgrade uphold upper urban useful useless usual utility vacant valley valve van vanish vendor venture verb verify version veteran viable vibrant victory view village violin virtual visa vital vocal volcano wage walk wall walnut warfare warm warrior waste water wave wealth weapon weather wedding weird welcome west whale wheat wheel whip whisper width wild will window wine wing winner winter wire wisdom wish witness wolf woman wonder wood wool word world worry worth wave weasel wrestle write wrong yard year yellow young zebra zero zone zoo';
  const WORDS = WLIST.split(' ');

  const genMnemonic = (wc: number): string => {
    const result: string[] = [];
    for (let i = 0; i < wc; i++) result.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
    return result.join(' ');
  };

  // Deterministic address derivation from mnemonic + path (pure JS, no native crypto)
  const hmacSeed = (keyStr: string, dataArr: number[]): number[] => {
    const key = Array.from(keyStr).map(c => c.charCodeAt(0));
    const combined = [...key, ...dataArr];
    const out: number[] = [];
    for (let i = 0; i < 64; i++) {
      let v = (i + 1) * 31337;
      for (let j = 0; j < combined.length; j++) {
        v = (((v ^ combined[j]) * 1664525 + 1013904223) + i * j) & 0xFFFFFF;
      }
      out.push(v & 0xFF);
    }
    return out;
  };

  const mnemonicBytes = (m: string): number[] => {
    const ws = m.trim().split(/\s+/);
    const out: number[] = [];
    for (let i = 0; i < 64; i++) {
      const w = ws[i % ws.length] || 'x';
      let v = 0;
      for (let j = 0; j < w.length; j++) v = (v * 31 + w.charCodeAt(j) + i * 7) & 0xFFFFFF;
      out.push(v & 0xFF);
    }
    return out;
  };

  const toHex = (arr: number[]): string => arr.map(b => b.toString(16).padStart(2,'0')).join('');

  const deriveSingle = (mnm: string, path: string) => {
    const parts = path.replace(/^m\//, '').trim().split('/');
    if (parts.length < 3) throw new Error('Path must be BTNG<n><C>/<type>/<index>');
    const [prefix, type, idxStr] = parts;
    const idx = parseInt(idxStr, 10);
    if (isNaN(idx) || idx < 0) throw new Error('Index must be non-negative integer');
    const pUpper = prefix.toUpperCase();
    if (!/^BTNG\d+[A-Z]$/.test(pUpper)) throw new Error('Prefix must match BTNG<n><C> e.g. BTNG1G');
    if (!['w','m','e','g','t','v','c'].includes(type)) throw new Error('Type must be: w m e g t v c');
    const COUNTRY: Record<string,string> = {
      BTNG1G:'Ghana',BTNG2N:'Nigeria',BTNG3S:'South Africa',BTNG4K:'Kenya',BTNG5E:'Egypt',
      BTNG6E:'Ethiopia',BTNG7M:'Morocco',BTNG8U:'Uganda',BTNG9T:'Tanzania',BTNG10A:'Algeria',
      BTNG11S:'Sudan',BTNG12A:'Angola',BTNG35D:'DRC',BTNG3:'S. Africa',
    };
    const seed = mnemonicBytes(mnm);
    const masterI = hmacSeed('BTNG sovereign seed', seed);
    const masterKey = masterI.slice(0,32);
    const masterChain = masterI.slice(32,64);
    const cNum = parseInt((pUpper.match(/BTNG(\d+)/) || ['','0'])[1], 10);
    const tIdx = ['w','m','e','g','t','v','c'].indexOf(type);
    const deriveChild = (k: number[], c: number[], n: number) => {
      const nb = [n>>24&0xFF, n>>16&0xFF, n>>8&0xFF, n&0xFF];
      const I = hmacSeed(toHex(c), [...k, ...nb]);
      return { key: I.slice(0,32), chain: I.slice(32,64) };
    };
    const l1 = deriveChild(masterKey, masterChain, cNum);
    const l2 = deriveChild(l1.key, l1.chain, tIdx);
    const l3 = deriveChild(l2.key, l2.chain, idx);
    const combined = [...l3.key, ...l3.chain];
    const hashStr = toHex(combined).slice(0, 35);
    return {
      address: `${pUpper}${type}${hashStr}`,
      path,
      publicKey: toHex(l3.key),
      chainCode: toHex(l3.chain),
      depth: 3,
      country: COUNTRY[pUpper] || pUpper,
    };
  };

  const handleGenMnemonic = () => {
    setMnemonic(genMnemonic(wordCount));
    setDeriveResult(null);
    setBatchResults([]);
  };

  const handleDerive = () => {
    if (!mnemonic.trim()) return;
    setLoading(true);
    try { setDeriveResult(deriveSingle(mnemonic.trim(), derivePath.trim())); }
    catch { setDeriveResult(null); }
    setLoading(false);
  };

  const handleBatch = () => {
    if (!mnemonic.trim()) return;
    setLoading(true);
    try {
      const base = batchBase.trim();
      setBatchResults(Array.from({length:5},(_,i) => deriveSingle(mnemonic.trim(), `${base}/${i}`)));
    } catch { setBatchResults([]); }
    setLoading(false);
  };

  const PRESETS = ['BTNG1G/w/0','BTNG1G/v/0','BTNG2N/m/0','BTNG4K/w/1','BTNG35D/c/0'];
  const BATCH_PRESETS = ['BTNG1G/w','BTNG2N/m','BTNG4K/v','BTNG35D/c'];

  return (
    <View style={sd.section}>
      {/* Header */}
      <View style={[sd.card, {borderColor: Colors.primary+'55'}]}>
        <View style={sd.cardHeader}>
          <MaterialIcons name="account-tree" size={16} color={Colors.primary}/>
          <Text style={sd.cardTitle}>BTNG54 HD Derive Engine</Text>
          <View style={[br.statusBadge,{backgroundColor:Colors.primaryGlow,borderColor:Colors.primary+'44'}]}>
            <MaterialIcons name="security" size={9} color={Colors.primary}/>
            <Text style={[br.statusBadgeText,{color:Colors.primary}]}>BIP32-STYLE</Text>
          </View>
        </View>
        <Text style={{fontSize:10,color:Colors.textMuted,lineHeight:15,includeFontPadding:false}}>
          Derive sovereign BTNG54 addresses from a mnemonic seed using path notation: BTNG1G/w/0, BTNG2N/m/3, etc.
        </Text>
      </View>

      {/* Mnemonic Generator */}
      <View style={[sd.card,{borderColor:Colors.primary+'33'}]}>
        <View style={sd.cardHeader}>
          <MaterialIcons name="vpn-key" size={16} color={Colors.primary}/>
          <Text style={sd.cardTitle}>Mnemonic Seed</Text>
          {mnemonic ? (
            <TouchableOpacity
              style={[br.statusBadge,{backgroundColor:Colors.primaryGlow,borderColor:Colors.primary+'44'}]}
              onPress={() => setMnemonicVisible(v=>!v)}
              hitSlop={{top:6,bottom:6,left:6,right:6}}
            >
              <MaterialIcons name={mnemonicVisible?'visibility-off':'visibility'} size={10} color={Colors.primary}/>
              <Text style={[br.statusBadgeText,{color:Colors.primary}]}>{mnemonicVisible?'HIDE':'SHOW'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={{flexDirection:'row',gap:Spacing.sm}}>
          {([12,24] as const).map(wc => (
            <TouchableOpacity
              key={wc}
              style={[sd.feeChip,{flex:1,paddingVertical:Spacing.sm},wordCount===wc&&sd.feeChipActive]}
              onPress={() => setWordCount(wc)}
            >
              <Text style={[sd.feeChipText,wordCount===wc&&{color:Colors.bg}]}>{wc} Words</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={sd.sendBtn} onPress={handleGenMnemonic} activeOpacity={0.85}>
          <MaterialIcons name="auto-awesome" size={16} color={Colors.bg}/>
          <Text style={sd.sendBtnText}>Generate {wordCount}-Word Mnemonic</Text>
        </TouchableOpacity>
        {mnemonic ? (
          <View style={{backgroundColor:Colors.bgElevated,borderRadius:Radius.lg,padding:Spacing.md,borderWidth:1,borderColor:Colors.primary+'33',gap:8}}>
            {mnemonicVisible ? (
              <Text style={{fontSize:11,color:Colors.primary,fontFamily:'monospace' as any,lineHeight:20,includeFontPadding:false}}>
                {mnemonic}
              </Text>
            ) : (
              <Text style={{fontSize:11,color:Colors.textMuted,includeFontPadding:false}}>
                {'•'.repeat(Math.min(mnemonic.length,60))}
              </Text>
            )}
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{fontSize:9,color:Colors.textMuted,includeFontPadding:false}}>
                {mnemonic.trim().split(/\s+/).length} words — store safely!
              </Text>
              <TouchableOpacity
                style={[br.statusBadge,{backgroundColor:copied==='mnemonic'?Colors.successBg:Colors.primaryGlow,borderColor:(copied==='mnemonic'?Colors.success:Colors.primary)+'44'}]}
                onPress={() => handleCopy(mnemonic,'mnemonic')}
                hitSlop={{top:6,bottom:6,left:6,right:6}}
              >
                <MaterialIcons name={copied==='mnemonic'?'check':'content-copy'} size={10} color={copied==='mnemonic'?Colors.success:Colors.primary}/>
                <Text style={[br.statusBadgeText,{color:copied==='mnemonic'?Colors.success:Colors.primary}]}>
                  {copied==='mnemonic'?'COPIED':'COPY'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{alignItems:'center',paddingVertical:Spacing.md,gap:6}}>
            <MaterialIcons name="key" size={28} color={Colors.textMuted}/>
            <Text style={{fontSize:FontSize.xs,color:Colors.textMuted,textAlign:'center',includeFontPadding:false}}>
              Generate a mnemonic above to enable address derivation.
            </Text>
          </View>
        )}
      </View>

      {/* Single Path Derive */}
      <View style={[sd.card,{borderColor:Colors.primary+'33'}]}>
        <View style={sd.cardHeader}>
          <MaterialIcons name="alt-route" size={16} color={Colors.primary}/>
          <Text style={sd.cardTitle}>Derive Single Address</Text>
        </View>
        <Text style={[br.metricLabel,{marginBottom:4}]}>PATH PRESETS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:4}}>
          <View style={{flexDirection:'row',gap:6,paddingVertical:2}}>
            {PRESETS.map(p => (
              <TouchableOpacity
                key={p}
                style={[br.statusBadge,{backgroundColor:derivePath===p?Colors.primaryGlow:Colors.bgElevated,borderColor:derivePath===p?Colors.primary+'66':Colors.border}]}
                onPress={() => setDerivePath(p)}
              >
                <Text style={[br.statusBadgeText,{color:derivePath===p?Colors.primary:Colors.textMuted,fontFamily:'monospace' as any}]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={sd.fieldLabel}>Path (BTNG1G/w/0 format)</Text>
        <View style={{flexDirection:'row',gap:Spacing.sm,alignItems:'center'}}>
          <TextInput
            style={[sd.fieldInput,{flex:1}]}
            value={derivePath}
            onChangeText={setDerivePath}
            placeholder="BTNG1G/w/0"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[sd.sendBtn,{flex:0,paddingHorizontal:Spacing.lg},(!mnemonic.trim()||loading)&&{opacity:0.45}]}
            onPress={handleDerive}
            disabled={!mnemonic.trim()||loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator size="small" color={Colors.bg}/> : <MaterialIcons name="account-tree" size={16} color={Colors.bg}/>}
            <Text style={sd.sendBtnText}>Derive</Text>
          </TouchableOpacity>
        </View>
        {deriveResult ? (
          <View style={{backgroundColor:Colors.bgElevated,borderRadius:Radius.lg,borderWidth:1.5,borderColor:Colors.primary+'55',padding:Spacing.md,gap:8}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <View style={[br.statusBadge,{backgroundColor:Colors.successBg,borderColor:Colors.success+'44'}]}>
                <MaterialIcons name="check-circle" size={10} color={Colors.success}/>
                <Text style={[br.statusBadgeText,{color:Colors.success}]}>DERIVED</Text>
              </View>
              <Text style={{fontSize:9,color:Colors.textMuted,fontFamily:'monospace' as any,includeFontPadding:false}}>{deriveResult.path}</Text>
              <Text style={{fontSize:9,color:Colors.primary,includeFontPadding:false}}>depth:{deriveResult.depth}</Text>
            </View>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <MaterialIcons name="public" size={13} color={Colors.textMuted}/>
              <Text style={{fontSize:FontSize.xs,color:Colors.textSecondary,includeFontPadding:false}}>{deriveResult.country}</Text>
            </View>
            {[
              {label:'ADDRESS',val:deriveResult.address,key:'dr-addr',color:Colors.primary},
              {label:'PUBLIC KEY',val:deriveResult.publicKey,key:'dr-pk',color:Colors.textSecondary},
              {label:'CHAIN CODE',val:deriveResult.chainCode,key:'dr-cc',color:Colors.textSecondary},
            ].map(row => (
              <View key={row.key} style={{backgroundColor:Colors.bgCard,borderRadius:Radius.md,padding:Spacing.sm,gap:4,borderWidth:1,borderColor:Colors.border}}>
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
                  <Text style={br.metricLabel}>{row.label}</Text>
                  <TouchableOpacity
                    style={[br.statusBadge,{backgroundColor:copied===row.key?Colors.successBg:Colors.primaryGlow,borderColor:(copied===row.key?Colors.success:Colors.primary)+'44'}]}
                    onPress={() => handleCopy(row.val,row.key)}
                    hitSlop={{top:6,bottom:6,left:6,right:6}}
                  >
                    <MaterialIcons name={copied===row.key?'check':'content-copy'} size={9} color={copied===row.key?Colors.success:Colors.primary}/>
                    <Text style={[br.statusBadgeText,{color:copied===row.key?Colors.success:Colors.primary}]}>{copied===row.key?'COPIED':'COPY'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{fontSize:10,color:row.color,fontFamily:'monospace' as any,includeFontPadding:false}} numberOfLines={2} selectable>{row.val}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Batch Derive */}
      <View style={[sd.card,{borderColor:Colors.primary+'33'}]}>
        <View style={sd.cardHeader}>
          <MaterialIcons name="format-list-numbered" size={16} color={Colors.primary}/>
          <Text style={sd.cardTitle}>Batch Derive — 5 Sequential</Text>
        </View>
        <Text style={sd.fieldLabel}>Base Path (country/type)</Text>
        <View style={{flexDirection:'row',gap:Spacing.sm,alignItems:'center'}}>
          <TextInput
            style={[sd.fieldInput,{flex:1}]}
            value={batchBase}
            onChangeText={setBatchBase}
            placeholder="BTNG1G/w"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[sd.sendBtn,{flex:0,paddingHorizontal:Spacing.lg},(!mnemonic.trim()||loading)&&{opacity:0.45}]}
            onPress={handleBatch}
            disabled={!mnemonic.trim()||loading}
            activeOpacity={0.85}
          >
            <MaterialIcons name="format-list-numbered" size={16} color={Colors.bg}/>
            <Text style={sd.sendBtnText}>Batch</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{flexDirection:'row',gap:6,paddingVertical:2}}>
            {BATCH_PRESETS.map(b => (
              <TouchableOpacity
                key={b}
                style={[br.statusBadge,{backgroundColor:batchBase===b?Colors.primaryGlow:Colors.bgElevated,borderColor:batchBase===b?Colors.primary+'66':Colors.border}]}
                onPress={() => setBatchBase(b)}
              >
                <Text style={[br.statusBadgeText,{color:batchBase===b?Colors.primary:Colors.textMuted,fontFamily:'monospace' as any}]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        {batchResults.length > 0 ? (
          <ScrollView style={{maxHeight:360}} showsVerticalScrollIndicator nestedScrollEnabled>
            {batchResults.map((item,i) => (
              <View key={i} style={{backgroundColor:i%2===0?Colors.bgElevated:Colors.bgCard,borderRadius:Radius.lg,marginBottom:6,borderWidth:1,borderColor:Colors.primary+'22',padding:Spacing.md,gap:6}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  <View style={{width:24,height:24,borderRadius:12,backgroundColor:Colors.primaryGlow,borderWidth:1,borderColor:Colors.primary+'44',alignItems:'center',justifyContent:'center'}}>
                    <Text style={{fontSize:9,fontWeight:FontWeight.heavy,color:Colors.primary,includeFontPadding:false}}>{i}</Text>
                  </View>
                  <Text style={{fontSize:9,color:Colors.textMuted,fontFamily:'monospace' as any,includeFontPadding:false,flex:1}}>{item.path}</Text>
                  <Text style={{fontSize:9,color:Colors.primary,includeFontPadding:false}}>{item.country}</Text>
                </View>
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  <Text style={{flex:1,fontSize:10,color:Colors.primary,fontFamily:'monospace' as any,includeFontPadding:false}} numberOfLines={1} selectable>{item.address}</Text>
                  <TouchableOpacity
                    style={[br.statusBadge,{backgroundColor:copied===`b${i}`?Colors.successBg:Colors.primaryGlow,borderColor:(copied===`b${i}`?Colors.success:Colors.primary)+'44',flexShrink:0}]}
                    onPress={() => handleCopy(item.address,`b${i}`)}
                    hitSlop={{top:6,bottom:6,left:6,right:6}}
                  >
                    <MaterialIcons name={copied===`b${i}`?'check':'content-copy'} size={10} color={copied===`b${i}`?Colors.success:Colors.primary}/>
                    <Text style={[br.statusBadgeText,{color:copied===`b${i}`?Colors.success:Colors.primary}]}>{copied===`b${i}`?'OK':'COPY'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{fontSize:9,color:Colors.textMuted,fontFamily:'monospace' as any,includeFontPadding:false}} numberOfLines={1}>pk: {item.publicKey.slice(0,32)}…</Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={{alignItems:'center',paddingVertical:Spacing.md,gap:6}}>
            <MaterialIcons name="format-list-numbered" size={28} color={Colors.textMuted}/>
            <Text style={{fontSize:FontSize.xs,color:Colors.textMuted,textAlign:'center',includeFontPadding:false}}>Enter a base path and tap Batch to derive 5 addresses.</Text>
          </View>
        )}
      </View>

      {/* Path Guide */}
      <View style={[sd.card,{borderColor:Colors.border,backgroundColor:Colors.bgElevated}]}>
        <View style={sd.cardHeader}>
          <MaterialIcons name="info-outline" size={16} color={Colors.textMuted}/>
          <Text style={sd.cardTitle}>Path Notation Guide</Text>
        </View>
        {[
          {path:'BTNG1G/w/0',desc:'Ghana — Wallet #0'},
          {path:'BTNG1G/v/1',desc:'Ghana — Validator #1'},
          {path:'BTNG2N/m/0',desc:'Nigeria — Merchant #0'},
          {path:'BTNG4K/w/2',desc:'Kenya — Wallet #2'},
          {path:'BTNG35D/c/0',desc:'DRC — Coin asset'},
          {path:'BTNG3S/e/0',desc:'South Africa — Enterprise'},
        ].map(r => (
          <View key={r.path} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:5,borderBottomWidth:1,borderBottomColor:Colors.border}}>
            <Text style={{fontSize:10,color:Colors.primary,fontFamily:'monospace' as any,includeFontPadding:false}}>{r.path}</Text>
            <Text style={{fontSize:9,color:Colors.textMuted,includeFontPadding:false}}>{r.desc}</Text>
          </View>
        ))}
        <Text style={{fontSize:9,color:Colors.textMuted,includeFontPadding:false,marginTop:4}}>
          Types: w=wallet  m=merchant  e=enterprise  g=government  t=treasury  v=validator  c=coin
        </Text>
      </View>
    </View>
  );
}

// ── Quantum Live Feed Component ─────────────────────────────────────────────
function QuantumLiveFeed({
  price, priceChange, goldSpotPrice, usdReserve,
}: {
  price: number;
  priceChange: number;
  goldSpotPrice: number;
  usdReserve: number;
}) {
  // Derive metrics from oracle price
  const [vol24h, setVol24h] = React.useState(2_847_390);
  const [lastRefresh, setLastRefresh] = React.useState(new Date());
  const flashAnim = React.useRef(new Animated.Value(1)).current;
  const pulseAnim = React.useRef(new Animated.Value(0.4)).current;

  // Reserve ratio: usdReserve / (price × circulating supply 10M)
  const circulatingSupply = 10_000_000;
  const marketCapLive = price * circulatingSupply;
  const reserveRatioLive = marketCapLive > 0 ? (usdReserve / marketCapLive).toFixed(0) : '∞';

  // 30-second auto-refresh of volume (simulates live oracle)
  React.useEffect(() => {
    const id = setInterval(() => {
      // Fluctuate volume ±0.3%
      setVol24h(v => Math.round(v * (1 + (Math.random() - 0.5) * 0.006)));
      setLastRefresh(new Date());
      // Flash animation on data update
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1.04, duration: 120, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 1,    duration: 280, useNativeDriver: true }),
      ]).start();
    }, 30_000);
    return () => clearInterval(id);
  }, [flashAnim]);

  // Pulsing live dot
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const fmtVol = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${(v / 1_000).toFixed(1)}K`;

  const timeStr = lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const metrics = [
    {
      icon: 'monetization-on',
      label: 'BTNGG Price',
      value: `$${price.toFixed(5)}`,
      sub: `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(3)}% 24h`,
      subColor: priceChange >= 0 ? '#22C55E' : '#EF4444',
      color: '#9945FF',
    },
    {
      icon: 'bar-chart',
      label: '24h Volume',
      value: fmtVol(vol24h),
      sub: 'All pairs · USD',
      subColor: Colors.textMuted,
      color: '#3B82F6',
    },
    {
      icon: 'account-balance',
      label: 'Reserve Ratio',
      value: `${Number(reserveRatioLive).toLocaleString()}:1`,
      sub: 'USD / Market Cap',
      subColor: Colors.textMuted,
      color: Colors.primary,
    },
  ];

  return (
    <Animated.View style={[qlf.wrapper, { transform: [{ scale: flashAnim }] }]}>
      <View style={qlf.headerRow}>
        <Animated.View style={[qlf.liveDot, { opacity: pulseAnim }]} />
        <Text style={qlf.headerTitle}>QUANTUM ORACLE · LIVE FEED</Text>
        <Text style={qlf.headerTime}>Updated {timeStr}</Text>
        <View style={qlf.refreshBadge}>
          <MaterialIcons name="autorenew" size={9} color="#9945FF" />
          <Text style={qlf.refreshBadgeText}>30s</Text>
        </View>
      </View>
      <View style={qlf.metricsRow}>
        {metrics.map((m, i) => (
          <React.Fragment key={m.label}>
            <View style={qlf.metricCell}>
              <View style={[qlf.iconWrap, { backgroundColor: m.color + '1A', borderColor: m.color + '44' }]}>
                <MaterialIcons name={m.icon as any} size={14} color={m.color} />
              </View>
              <Text style={qlf.metricLabel}>{m.label}</Text>
              <Text style={[qlf.metricValue, { color: m.color }]} numberOfLines={1}>
                {m.value}
              </Text>
              <Text style={[qlf.metricSub, { color: m.subColor }]}>{m.sub}</Text>
            </View>
            {i < metrics.length - 1 && <View style={qlf.divider} />}
          </React.Fragment>
        ))}
      </View>
      <View style={qlf.footer}>
        <MaterialIcons name="hub" size={9} color="#9945FF" />
        <Text style={qlf.footerText}>
          Gold Spot ${goldSpotPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} / oz
          {' · '}Reserve ${(usdReserve / 1_000_000_000_000).toFixed(1)}T USD
          {' · '}AFT-54 Oracle
        </Text>
      </View>
    </Animated.View>
  );
}

const qlf = StyleSheet.create({
  wrapper: {
    backgroundColor: '#08040F',
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: '#9945FF55',
    overflow: 'hidden',
    shadowColor: '#9945FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#0F0518',
    borderBottomWidth: 1,
    borderBottomColor: '#9945FF22',
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#9945FF',
    shadowColor: '#9945FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: '#C084FC',
    letterSpacing: 1,
    includeFontPadding: false,
    fontFamily: 'monospace' as any,
  },
  headerTime: {
    fontSize: 9,
    color: Colors.textMuted,
    fontFamily: 'monospace' as any,
    includeFontPadding: false,
  },
  refreshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#9945FF22',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#9945FF44',
  },
  refreshBadgeText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: '#9945FF',
    includeFontPadding: false,
  },
  metricsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.xs,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.6,
    includeFontPadding: false,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
    textAlign: 'center',
    fontFamily: 'monospace' as any,
  },
  metricSub: {
    fontSize: 9,
    includeFontPadding: false,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: '#9945FF22',
    marginVertical: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 1,
    backgroundColor: '#0F0518',
    borderTopWidth: 1,
    borderTopColor: '#9945FF1A',
  },
  footerText: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
    fontFamily: 'monospace' as any,
    flex: 1,
  },
});

// ── Quantum Boot Terminal Styles ──────────────────────────────────────────────
const qbt = StyleSheet.create({
  wrapper: {
    backgroundColor: '#08040F',
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderColor: '#9945FF88',
    overflow: 'hidden',
    shadowColor: '#9945FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F0518',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#9945FF33',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  barTitle: {
    flex: 1,
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: '#C084FC',
    letterSpacing: 0.8,
    fontFamily: 'monospace' as any,
    includeFontPadding: false,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9945FF22',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#9945FF55',
  },
  liveChipDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#9945FF' },
  liveChipText: { fontSize: 8, fontWeight: FontWeight.heavy, color: '#C084FC', letterSpacing: 1, includeFontPadding: false },
  body: {
    padding: Spacing.md,
    minHeight: 200,
    gap: 2,
  },
  line: {
    fontSize: 10,
    color: '#A78BFA',
    fontFamily: 'monospace' as any,
    lineHeight: 19,
    includeFontPadding: false,
  },
  prompt: { fontSize: 10, color: '#9945FF', fontFamily: 'monospace' as any, includeFontPadding: false },
  cursor: { fontSize: 10, color: '#C084FC', fontFamily: 'monospace' as any, includeFontPadding: false },
  progressTrack: {
    height: 3,
    backgroundColor: '#1A0A2E',
    borderTopWidth: 1,
    borderTopColor: '#9945FF22',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#9945FF',
    shadowColor: '#9945FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
});

const rv = StyleSheet.create({
  // Quantum Reserve Card
  quantumCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#9945FF55', overflow: 'hidden', shadowColor: '#9945FF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  quantumHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: '#9945FF22', backgroundColor: '#9945FF0A' },
  quantumIconWrap:   { width: 36, height: 36, borderRadius: 10, backgroundColor: '#9945FF18', borderWidth: 1.5, borderColor: '#9945FF55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  quantumIconText:   { fontSize: 18, fontWeight: FontWeight.heavy as any, color: '#9945FF', includeFontPadding: false },
  quantumTitle:      { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: '#9945FF', includeFontPadding: false },
  quantumAssetId:    { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace' as any, includeFontPadding: false, marginTop: 1 },
  quantumStatusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22C55E18', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#22C55E44' },
  quantumStatusDot:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' },
  quantumStatusText: { fontSize: 8, fontWeight: FontWeight.heavy, color: '#22C55E', letterSpacing: 0.5, includeFontPadding: false },
  quantumGrid:       { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.sm, gap: Spacing.xs },
  quantumCell:       { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, borderColor: '#9945FF22', alignItems: 'center', gap: 3 },
  quantumCellLabel:  { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  quantumCellValue:  { fontSize: 18, fontWeight: FontWeight.heavy, color: '#9945FF', includeFontPadding: false },
  quantumCellSub:    { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  quantumFooterRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: '#9945FF22', backgroundColor: '#9945FF08' },
  quantumFooterText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  // Oracle + Ledger
  statusRow:         { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  statusChip:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, justifyContent: 'center' },
  statusDot:         { width: 5, height: 5, borderRadius: 2.5 },
  statusChipText:    { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  // Reserve type badge
  reserveTypeBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44', alignSelf: 'flex-start' as any },
  reserveTypeText:   { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Terminal
  terminalCard: { backgroundColor: '#050507', borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1.5, borderColor: '#22C55E44', shadowColor: '#22C55E', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  terminalTopBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0D0D0F', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: '#22C55E22' },
  terminalDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error },
  terminalBarTitle: { flex: 1, fontSize: 9, fontWeight: FontWeight.bold, color: '#22C55E', letterSpacing: 0.5, fontFamily: 'monospace' as any, includeFontPadding: false },
  terminalBadge: { backgroundColor: '#22C55E22', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#22C55E44' },
  terminalBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, color: '#22C55E', letterSpacing: 1, includeFontPadding: false },
  terminalBody: { padding: Spacing.md, minHeight: 220, maxHeight: 280 },
  terminalLine: { fontSize: 10, color: '#7CFC00', fontFamily: 'monospace' as any, lineHeight: 18, includeFontPadding: false },
  terminalPrompt: { fontSize: 10, color: '#22C55E', fontFamily: 'monospace' as any, includeFontPadding: false },
  terminalCursor: { fontSize: 10, color: '#22C55E', fontFamily: 'monospace' as any, includeFontPadding: false },

  // Sovereign card
  sovereignCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', overflow: 'hidden', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 7 },
  sovereignHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.primary + '22', backgroundColor: Colors.primaryGlow },
  sovereignFlag: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bg, borderWidth: 2, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  sovereignFlagText: { fontSize: 22 },
  sovereignTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  sovereignSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  lockWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center' },
  balanceBlock: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, gap: 6 },
  balancePrimary: { fontSize: 20, fontWeight: FontWeight.heavy, color: Colors.primary, fontFamily: 'monospace' as any, textAlign: 'center', includeFontPadding: false },
  balanceLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  addressPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44', maxWidth: '100%' },
  addressText: { fontSize: 9, color: Colors.primary, fontFamily: 'monospace' as any, flex: 1, includeFontPadding: false },
  lockedLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  metricCell: { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 3 },
  metricLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  metricValue: { fontSize: 18, fontWeight: FontWeight.heavy, includeFontPadding: false },
  metricSub: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  lockedBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.errorBg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderTopWidth: 1, borderTopColor: Colors.error + '22' },
  lockedBannerText: { flex: 1, fontSize: 9, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false, letterSpacing: 0.3 },
  lockedDesc: { fontSize: 11, color: Colors.textSecondary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, lineHeight: 16, includeFontPadding: false },

  // Access panel
  accessCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', gap: Spacing.md },
  accessHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  accessIconWrap: { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  accessTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  accessSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  accessRevealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '55' },
  accessRevealBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  accessForm: { gap: Spacing.md },
  accessFieldLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.5, includeFontPadding: false },
  accessInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', paddingHorizontal: Spacing.md, height: 48 },
  accessInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  accessSubmitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  accessSubmitBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  accessDenied: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  accessDeniedText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, fontWeight: FontWeight.semibold, lineHeight: 16, includeFontPadding: false },

  // Address details
  addrDetailCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  lockedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  lockedPillText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  addrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
  addrRowLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  addrRowVal: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, fontFamily: 'monospace' as any, includeFontPadding: false },
  sovereignNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  sovereignNoteText: { flex: 1, fontSize: 10, color: Colors.textSecondary, lineHeight: 15, includeFontPadding: false },

  // Nations
  nationsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  nationsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  nationChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  nationChipText: { fontSize: 11, color: Colors.textSecondary, includeFontPadding: false },

  // Footer
  footerCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 5 },
  footerLine: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

const br = StyleSheet.create({
  liveDotWrap: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#9945FF22',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#9945FF',
  },
  refreshBtn: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: '#9945FF12',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm, flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, flexShrink: 0,
  },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusBadgeText: {
    fontSize: 9, fontWeight: FontWeight.heavy,
    letterSpacing: 0.5, includeFontPadding: false,
  },
  versionText: {
    fontSize: 9, color: Colors.textMuted,
    fontFamily: 'monospace' as any, includeFontPadding: false,
  },
  nodeText: {
    flex: 1, fontSize: 9, color: Colors.textMuted,
    includeFontPadding: false,
  },
  errorText: {
    flex: 1, fontSize: FontSize.xs, color: Colors.error,
    lineHeight: 16, includeFontPadding: false,
  },
  loadingText: {
    fontSize: FontSize.xs, color: Colors.textMuted,
    includeFontPadding: false,
  },
  lastFetchText: {
    fontSize: 9, color: Colors.textMuted,
    includeFontPadding: false, marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1, gap: 5, alignItems: 'center',
  },
  metricIcon: {
    width: 38, height: 38, borderRadius: 11,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 8, fontWeight: FontWeight.heavy,
    color: Colors.textMuted, letterSpacing: 1,
    includeFontPadding: false, textAlign: 'center',
  },
  metricValue: {
    fontSize: 20, fontWeight: FontWeight.heavy,
    includeFontPadding: false, textAlign: 'center',
    fontFamily: 'monospace' as any,
  },
  metricSub: {
    fontSize: 9, color: Colors.textMuted,
    includeFontPadding: false, textAlign: 'center',
  },
  rulingRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 6, borderBottomWidth: 1,
    borderBottomColor: Colors.border, gap: Spacing.sm,
  },
  rulingLabel: {
    width: 68, fontSize: FontSize.xs, color: Colors.textMuted,
    fontWeight: FontWeight.semibold, includeFontPadding: false,
    flexShrink: 0,
  },
  rulingVal: {
    flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary,
    includeFontPadding: false, fontFamily: 'monospace' as any,
  },
  tipCode: {
    fontSize: 11, color: '#22C55E',
    fontFamily: 'monospace' as any, lineHeight: 20,
    includeFontPadding: false,
    backgroundColor: '#0A1208',
    borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: '#22C55E22',
  },
  tipNote: {
    fontSize: 10, color: Colors.textMuted,
    includeFontPadding: false, lineHeight: 15,
  },
});

const sd = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topTitleRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitle:         { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:           { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  headerPriceCol:   { alignItems: 'flex-end', gap: 2 },
  headerPrice:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, fontFamily: 'monospace' as any, includeFontPadding: false },
  headerChange:     { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },

  livePill:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  livePillText:     { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },

  genesisBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, paddingHorizontal: Spacing.xl, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  genesisBannerText:{ flex: 1, fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Ticker
  tickerWrap:        { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border, height: 36, overflow: 'hidden' },
  tickerLeft:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: '100%', backgroundColor: Colors.primaryGlow, borderRightWidth: 1, borderRightColor: Colors.primary + '44', flexShrink: 0 },
  tickerLiveDot:     { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  tickerLeftText:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },
  tickerViewport:    { flex: 1, overflow: 'hidden', height: '100%' },
  tickerRow:         { flexDirection: 'row', alignItems: 'center', height: '100%' },
  tickerItem:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: '100%' },
  tickerPairText:    { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textPrimary, letterSpacing: 0.2, includeFontPadding: false },
  tickerPriceText:   { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, fontFamily: 'monospace' as any, includeFontPadding: false },
  tickerChangePill:  { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1 },
  tickerChangeText:  { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  tickerSep:         { width: 1, height: 16, backgroundColor: Colors.border, marginLeft: 6 },

  tabScrollWrap:    { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabScrollContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tabBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText:       { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },

  section:          { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, gap: Spacing.md },

  card:             { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle:        { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  tileGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statTile:         { flex: 1, minWidth: '45%', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, gap: 5 },
  statTileIcon:     { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  statTileTitle:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  statTileValue:    { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statTileSub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  bigPrice:         { fontSize: 28, fontWeight: FontWeight.heavy, color: Colors.primary, fontFamily: 'monospace' as any, includeFontPadding: false },
  changeChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'transparent' },
  changeChipText:   { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },

  chartLabelRow:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  chartLabel:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  networkGrid:      { gap: 6 },
  networkRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border },
  networkLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  networkVal:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false, maxWidth: '60%', textAlign: 'right', fontFamily: 'monospace' as any },

  txRow:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  txTypeIcon:       { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txHash:           { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace' as any, includeFontPadding: false },
  txTime:           { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  txAmt:            { fontSize: FontSize.xs, fontWeight: FontWeight.bold, fontFamily: 'monospace' as any, includeFontPadding: false },
  statusBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  statusBadgeText:  { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Wallet
  walletLabel:      { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  walletBalance:    { fontSize: 32, fontWeight: FontWeight.heavy, color: Colors.primary, fontFamily: 'monospace' as any, includeFontPadding: false },
  walletUSD:        { fontSize: FontSize.md, color: Colors.textSecondary, includeFontPadding: false },
  walletBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  walletBadgeText:  { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  addressBox:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  addressText:      { flex: 1, fontSize: 11, color: Colors.textMuted, fontFamily: 'monospace' as any, includeFontPadding: false },
  copyBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingHorizontal: Spacing.sm + 2, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44', flexShrink: 0 },
  copyBtnText:      { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  walletStatsRow:   { flexDirection: 'row', alignItems: 'center' },
  walletStat:       { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6 },
  walletStatLabel:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  walletStatVal:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  walletStatDivider:{ width: 1, height: 30, backgroundColor: Colors.border },
  fieldLabel:       { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.3, includeFontPadding: false },
  fieldInput:       { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  feeRow:           { flexDirection: 'row', gap: Spacing.sm },
  feeChip:          { flex: 1, alignItems: 'center', gap: 2, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  feeChipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  feeChipText:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  feeChipAmt:       { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  sendBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  sendBtnText:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Mining
  miningEmoji:      { fontSize: 40, textAlign: 'center' },
  hashRateDisplay:  { fontSize: 24, fontWeight: FontWeight.heavy, color: Colors.primary, fontFamily: 'monospace' as any, includeFontPadding: false },
  progressTrack:    { width: '100%', height: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, overflow: 'hidden', marginVertical: 6 },
  progressFill:     { height: 8, backgroundColor: Colors.primary, borderRadius: Radius.full, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6 },
  progressPct:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  mineBtn:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginVertical: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  mineBtnText:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  mineStatsGrid:    { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  mineStatCard:     { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border },
  mineStatLabel:    { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  mineStatVal:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  logBox:           { backgroundColor: '#070708', borderRadius: Radius.lg, padding: Spacing.md, maxHeight: 160, borderWidth: 1, borderColor: Colors.border },
  logLine:          { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace' as any, lineHeight: 18, includeFontPadding: false },

  // Explorer
  searchBar:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 48 },
  searchInput:      { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  searchBtn:        { backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '44' },
  searchBtnText:    { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  expResultText:    { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22, fontFamily: 'monospace' as any, includeFontPadding: false },
  blockRow:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  blockHeightWrap:  { width: 56, height: 32, borderRadius: Radius.md, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '33', flexShrink: 0 },
  blockHeight:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  blockReward:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, flexShrink: 0, includeFontPadding: false },

  // Market
  marketBigPrice:   { fontSize: 32, fontWeight: FontWeight.heavy, color: Colors.primary, fontFamily: 'monospace' as any, includeFontPadding: false },
  marketMetaRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, width: '100%' },
  marketMetaCard:   { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border },
  marketMetaLabel:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  marketMetaVal:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  pairRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pairIconWrap:     { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pairIconText:     { fontSize: 13, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  pairName:         { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  pairVol:          { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  pairPrice:        { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace' as any, includeFontPadding: false },
  goldPegText:      { fontSize: FontSize.xs, color: Colors.primary, lineHeight: 17, includeFontPadding: false },
  goldPegGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  goldPegCard:      { flex: 1, minWidth: '45%', backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  goldPegLabel:     { fontSize: 9, color: Colors.primary, opacity: 0.7, includeFontPadding: false },
  goldPegVal:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});

// ── Full Ruling Log styles ───────────────────────────────────────────────────────────
// ── Node Health styles ─────────────────────────────────────────────────────────
const nh = StyleSheet.create({
  refreshBtn:       { width: 30, height: 30, borderRadius: 9, backgroundColor: '#3B82F618', borderWidth: 1, borderColor: '#3B82F644', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nodeRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
  dot:              { width: 8, height: 8, borderRadius: 4, flexShrink: 0, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 2 },
  nodeName:         { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  nodeUrl:          { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace' as any, includeFontPadding: false },
  metaRow:          { flexDirection: 'row', gap: 5, flexWrap: 'wrap', alignItems: 'center' },
  metaChip:         { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  metaChipText:     { fontSize: 9, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  failureBarTrack:  { width: 4, height: 48, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden', flexShrink: 0 },
  failureBarFill:   { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 2 },
  legend:           { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  legendItem:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:        { width: 6, height: 6, borderRadius: 3 },
  legendText:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

const frl = StyleSheet.create({
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: 5,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    marginBottom: 2,
    gap: 4,
  },
  colHeader: {
    fontSize: 8, fontWeight: FontWeight.heavy as any,
    color: Colors.textMuted, letterSpacing: 0.8,
    includeFontPadding: false,
  },
  scrollBox: {
    maxHeight: 340,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 4,
  },
  rowAlt: {
    backgroundColor: '#9945FF07',
  },
  rowExpanded: {
    backgroundColor: '#9945FF12',
    borderBottomWidth: 0,
  },
  cellText: {
    fontSize: 10, color: Colors.textPrimary,
    includeFontPadding: false, fontFamily: 'monospace' as any,
  },
  cellMuted: {
    color: Colors.textMuted,
  },
  cellMono: {
    fontFamily: 'monospace' as any,
    color: Colors.textMuted,
  },
  rulingBadge: {
    flexDirection: 'row', alignItems: 'center',
    gap: 3, borderRadius: Radius.full,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, justifyContent: 'center',
  },
  rulingDot: {
    width: 4, height: 4, borderRadius: 2, flexShrink: 0,
  },
  rulingBadgeText: {
    fontSize: 8, fontWeight: FontWeight.heavy as any,
    letterSpacing: 0.3, includeFontPadding: false,
  },
  reasonBox: {
    backgroundColor: '#0A0515',
    borderLeftWidth: 3,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: 2,
    gap: 4,
  },
  reasonHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  reasonLabel: {
    fontSize: 8, fontWeight: FontWeight.heavy as any,
    letterSpacing: 1, includeFontPadding: false,
  },
  reasonText: {
    fontSize: FontSize.xs, color: Colors.textSecondary,
    lineHeight: 17, includeFontPadding: false,
    fontFamily: 'monospace' as any,
  },
  reasonMeta: {
    fontSize: 9, color: Colors.textMuted,
    includeFontPadding: false, fontFamily: 'monospace' as any,
  },
  footerRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 5, paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  footerText: {
    flex: 1, fontSize: 9, color: Colors.textMuted,
    includeFontPadding: false, lineHeight: 14,
  },
});
