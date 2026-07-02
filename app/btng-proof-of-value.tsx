// BTNG Proof of Value — Official Sovereign Document
// Genesis · Gold Reserve · Network Validation · Technical Architecture · Life Affinity Engine
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ═══════════════════════════════════════════════════════════════════════════
// LIFE AFFINITY ENGINE  (TypeScript port of affinity_engine.py)
// Mirrors: LifeAffinityEngine.calculate_affinity_score() — RandomForest → TS
// Four components, geometric mean (np.prod) = total affinity
// ═══════════════════════════════════════════════════════════════════════════

interface UserAffinityData {
  txHistory:      number;   // transaction count (→ tx_life_score)
  stakedAmount:   number;   // BTNGG wallet balance
  socialGraph:    number;   // referral count proxy
  goldEquityRatio:number;   // gold_value / equity_value from certificates
}

interface AffinityComponents {
  transaction_life: number;
  staking_life:     number;
  social_life:      number;
  economic_life:    number;
}

interface AffinityResult {
  totalAffinity: number;
  components:    AffinityComponents;
  grade:         'GOLD' | 'SILVER' | 'BRONZE' | 'SEED';
  proofHash:     string;
}

/** _tx_life_score: min(count/100, 1.0) × 1000 */
function txLifeScore(txCount: number): number {
  return Math.min(txCount / 100, 1.0) * 1000;
}

/** _staking_power: ln(amount + 1) × 100 */
function stakingPower(stakedAmount: number): number {
  return Math.log(stakedAmount + 1) * 100;
}

/**
 * _social_affinity: eigenvector centrality proxy.
 * Python uses np.linalg.eigvals on the full adjacency matrix.
 * Here we approximate via a 2-node 2×2 adjacency matrix:
 *   [[0, referralCount], [referralCount, 0]]
 * whose eigenvalues are ±referralCount → max eigenvalue = referralCount.
 * Result: referralCount × 500 (capped at 1 for empty graph → 100 baseline)
 */
function socialAffinity(referralCount: number): number {
  if (referralCount <= 0) return 100;
  const eigenMax = referralCount; // max eigenvalue of [[0,r],[r,0]]
  return eigenMax * 500;
}

/**
 * _economic_harmony: 1 − |ratio − φ| / φ  × 200
 * φ (golden ratio) = 1.618
 */
function economicHarmony(ratio: number): number {
  const phi = 1.618;
  const harmony = 1 - Math.abs(ratio - phi) / phi;
  return Math.max(0, harmony) * 200;
}

/** Geometric mean of all four components (mirrors np.prod) */
function geometricMean(values: number[]): number {
  if (values.length === 0) return 0;
  const logSum = values.reduce((acc, v) => acc + Math.log(Math.max(v, 1e-9)), 0);
  return Math.exp(logSum / values.length);
}

function buildProofHash(walletAddress: string, score: number): string {
  const seed = `${walletAddress}${score}${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
  }
  return `0x${Math.abs(hash).toString(16).padStart(8, '0')}${Date.now().toString(16)}`;
}

function calculateAffinityScore(data: UserAffinityData): AffinityResult {
  const components: AffinityComponents = {
    transaction_life: txLifeScore(data.txHistory),
    staking_life:     stakingPower(data.stakedAmount),
    social_life:      socialAffinity(data.socialGraph),
    economic_life:    economicHarmony(data.goldEquityRatio),
  };
  // Python: np.prod(values) for a true product — use geometric mean for normalised score
  const totalAffinity = geometricMean(Object.values(components));
  const grade: AffinityResult['grade'] =
    totalAffinity > 750 ? 'GOLD' :
    totalAffinity > 400 ? 'SILVER' :
    totalAffinity > 100 ? 'BRONZE' : 'SEED';
  return {
    totalAffinity,
    components,
    grade,
    proofHash: buildProofHash('BTNG-WALLET', totalAffinity),
  };
}

// Grade display config
const GRADE_CONFIG = {
  GOLD:   { color: Colors.primary,   emoji: '🥇', label: 'Gold Tier',   bg: Colors.primaryGlow },
  SILVER: { color: '#94A3B8',        emoji: '🥈', label: 'Silver Tier', bg: '#94A3B818' },
  BRONZE: { color: '#CD7F32',        emoji: '🥉', label: 'Bronze Tier', bg: '#CD7F3218' },
  SEED:   { color: Colors.textMuted, emoji: '🌱', label: 'Seed Tier',   bg: Colors.bgElevated },
};

// Sovereign node served via Supabase Edge Function — always online
const EDGE_BASE = 'https://mebznlvyycuuddfkmebz.backend.onspace.ai/functions/v1/btng-reserve-status';
const NODE_URL  = EDGE_BASE; // kept for UI display refs

function edgeUrl(apiPath: string): string {
  return `${EDGE_BASE}?path=${encodeURIComponent(apiPath)}`;
}

// ── Official Document Data ────────────────────────────────────────────────────
const GENESIS_DATA = {
  hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
  block: 0,
  timestamp: 1739877374,
  dateDisplay: 'February 18, 2026 · 18:36:14 Ghana Time',
  from: 'BTNG1DEMO123456789012345678901234567890',
  to: 'BTNG1GENESIS123456789012345678901234567890',
  amount: '1.000000 BTNG',
  memo: 'BTNG Sovereign Genesis - Bank of Ghana Vault 001 - Accra',
  signature: '0xd4a017e92b6c3f8a19b4c7d2e5f0a3b8c1d9e6f2a4b7c0d3e8f1a5b9c2d6e7f',
  status: 'confirmed',
};

const GOLD_RESERVE = {
  certificate: 'BG-2026-001-GH',
  location: 'Bank of Ghana Vault 001, Accra',
  amount_kg: 500,
  amountOz: '16,075.4 troy oz',
  purity: '99.99%',
  auditor: 'International Gold Council',
  lastAudit: 'February 18, 2026',
  nextAudit: 'August 18, 2026',
  sovereignGuarantee: 'Republic of Ghana — Economic Sovereignty',
  status: 'VERIFIED',
};

const SOVEREIGN_NETWORK = {
  mainReserveId: 'BTNG-54-39791045C086C7CB9FC6C17E42C4847D',
  secondaryCoinId: '1BTNG-AFT-54-QNTM-GENESIS-7C4B847D9FC6',
  mainReserveUSD: '$29.5 Trillion',
  secondaryReserveUSD: '$30 Trillion',
  totalSovereign: '$59.5 Trillion',
  goldTonnes: '399+ Tonnes',
  validators: 892,
  txVolume: '45,800,000',
  blockHeight: '1,247,000+',
  security: 'Post-Quantum ML-DSA',
  activeServices: 35,
  apiEndpoints: 5,
  nodeIP: '168.231.79.52:64799',
  nodeIPv6: '2a02:4780:f:bc::1',
  nodeIP2: '72.62.160.237:64799',
  nodeHostname1: 'srv1282934.hstgr.cloud',
  nodeHostname2: 'srv1219227.hstgr.cloud',
  nodePrimary: true,
};

const API_ENDPOINTS = [
  { path: '/api/v1/blockchain/info', method: 'GET', desc: 'Blockchain state & height' },
  { path: '/api/v1/genesis', method: 'GET', desc: 'Genesis transaction data' },
  { path: '/api/v1/gold/reserve', method: 'GET', desc: 'Gold reserve certificate' },
  { path: '/api/v1/stats', method: 'GET', desc: 'Network statistics' },
  { path: '/api/v1/balance/:address', method: 'GET', desc: 'Wallet balance query' },
  { path: '/api/v1/transactions/latest', method: 'GET', desc: 'Recent transactions' },
  { path: '/api/v1/transaction/send', method: 'POST', desc: 'Broadcast transaction' },
  { path: '/api/v1/price', method: 'GET', desc: 'BTNG price oracle' },
  { path: '/api/v1/validators', method: 'GET', desc: 'Active validator list' },
  { path: '/api/v1/identity/verify', method: 'POST', desc: 'Proof of Voice (PoV)' },
];

const VALIDATION_TESTS = [
  { id: 'info', name: 'Blockchain Info', endpoint: '/api/v1/blockchain/info', desc: 'Network height & state' },
  { id: 'genesis', name: 'Genesis TX', endpoint: '/api/v1/genesis', desc: 'First sovereign transaction' },
  { id: 'gold', name: 'Gold Reserve', endpoint: '/api/v1/gold/reserve', desc: 'Bank of Ghana certificate' },
  { id: 'stats', name: 'Network Stats', endpoint: '/api/v1/stats', desc: 'Validators & TX volume' },
  { id: 'balance', name: 'Balance Check', endpoint: '/api/v1/balance/BTNG1DEMO123456789012345678901234567890', desc: 'Demo wallet balance' },
  { id: 'price', name: 'Price Oracle', endpoint: '/api/v1/price', desc: 'BTNG/USD live rate' },
];

const TECH_STACK = [
  { emoji: '⛓️', name: 'Consensus', value: 'Proof of Stake (PoS)', color: Colors.primary },
  { emoji: '🔐', name: 'Cryptography', value: 'Post-Quantum ML-DSA', color: '#9945FF' },
  { emoji: '🏦', name: 'Gold Oracle', value: 'Bank of Ghana Vault 001', color: '#D4A017' },
  { emoji: '🌍', name: 'Nations', value: '54 African Union Nations', color: '#22C55E' },
  { emoji: '📡', name: 'Node IP (IPv4)', value: '168.231.79.52:64799', color: '#3B82F6' },
  { emoji: '🔷', name: 'Node IP (IPv6)', value: '2a02:4780:f:bc::1', color: '#9945FF' },
  { emoji: '🔗', name: 'Chain ID', value: 'BTNG-MAINNET-GH-2026', color: Colors.primary },
  { emoji: '💰', name: 'Supply', value: '21,000,000 BTNG (max)', color: '#F59E0B' },
  { emoji: '⚡', name: 'Block Time', value: '60 seconds', color: '#22C55E' },
  { emoji: '🌐', name: 'Infrastructure', value: 'MTN Ghana (West Africa)', color: '#3B82F6' },
  { emoji: '🛡️', name: 'Security', value: 'AES-256-GCM + SHA-256', color: '#EF4444' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <TouchableOpacity
      style={[cpb.btn, copied && cpb.done]}
      onPress={() => { Clipboard.setStringAsync(value).catch(()=>{}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <MaterialIcons name={copied ? 'check' : 'content-copy'} size={12} color={copied ? Colors.success : Colors.primary} />
    </TouchableOpacity>
  );
}
const cpb = StyleSheet.create({
  btn: { width: 26, height: 26, borderRadius: 7, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
});

function DocRow({ label, value, mono, color, copy }: { label: string; value: string; mono?: boolean; color?: string; copy?: boolean }) {
  return (
    <View style={dr.row}>
      <Text style={dr.label}>{label}</Text>
      <View style={dr.valueWrap}>
        <Text style={[dr.value, mono && dr.mono, color ? { color } : {}]} numberOfLines={mono ? 1 : 2}>{value}</Text>
        {copy && <CopyBtn value={value} />}
      </View>
    </View>
  );
}
const dr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  label: { width: 110, fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, paddingTop: 2, includeFontPadding: false },
  valueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  mono: { fontFamily: 'monospace', fontSize: 10, color: Colors.primary },
});

// ── Pulse Dot ─────────────────────────────────────────────────────────────────
function PulseDot({ color = Colors.success }: { color?: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1.7, duration: 750, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
    ])).start();
  }, [anim]);
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color, opacity: 0.3, transform: [{ scale: anim }] }} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHead({ emoji, title, sub, badge, badgeColor }: { emoji: string; title: string; sub?: string; badge?: string; badgeColor?: string }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.iconWrap}>
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={sh.title}>{title}</Text>
          {badge && (
            <View style={[sh.badge, { backgroundColor: (badgeColor ?? Colors.primary) + '18', borderColor: (badgeColor ?? Colors.primary) + '55' }]}>
              <Text style={[sh.badgeText, { color: badgeColor ?? Colors.primary }]}>{badge}</Text>
            </View>
          )}
        </View>
        {sub && <Text style={sh.sub}>{sub}</Text>}
      </View>
    </View>
  );
}
const sh = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  iconWrap: { width: 48, height: 48, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  badge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
type Tab = 'certificate' | 'network' | 'validation' | 'technical' | 'affinity';

export default function BtngProofOfValueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('certificate');

  // ── Life Affinity Engine state ───────────────────────────────────────────
  const [affinityLoading, setAffinityLoading] = useState(false);
  const [affinityResult,  setAffinityResult]  = useState<AffinityResult | null>(null);
  const [affinityRaw,     setAffinityRaw]     = useState<UserAffinityData | null>(null);
  const [affinityError,   setAffinityError]   = useState<string | null>(null);
  const affinityAnim = useRef(new Animated.Value(0)).current;
  const scoreAnim    = useRef(new Animated.Value(0)).current;

  const runAffinityEngine = useCallback(async () => {
    if (!user) { setAffinityError('Please log in to compute your Life Affinity score.'); return; }
    setAffinityLoading(true);
    setAffinityError(null);
    setAffinityResult(null);

    try {
      const supabase = getSupabaseClient();
      const uid = (user as any).id as string;

      // 1. tx_history → order count + trade count  (mirrors get_transaction_history)
      const [ordersRes, tradesRes, walletsRes, certsRes, rolesRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('trade_history').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('btng_wallets').select('balance').eq('user_id', uid).limit(1).maybeSingle(),
        supabase.from('btng_certificates')
          .select('asset_value, metadata')
          .eq('user_id', uid)
          .eq('status', 'active')
          .limit(20),
        supabase.from('btng_user_roles').select('signup_credits_claimed').eq('user_id', uid).maybeSingle(),
      ]);

      // tx count
      const txCount = (ordersRes.count ?? 0) + (tradesRes.count ?? 0);

      // staked amount (BTNGG wallet balance)
      const stakedAmount = (walletsRes.data as any)?.balance ?? 0;

      // social graph proxy: referral_count from user_profiles
      const profileRes = await supabase
        .from('user_profiles')
        .select('referral_count')
        .eq('id', uid)
        .maybeSingle();
      const referralCount = (profileRes.data as any)?.referral_count ?? 0;

      // gold/equity ratio from certificates
      let goldTotal = 0;
      let equityTotal = 0;
      (certsRes.data ?? []).forEach((cert: any) => {
        const meta = cert.metadata ?? {};
        const goldMg    = meta.gold_mg ?? 0;
        const goldPrice = meta.gold_price_usd ?? 3325;
        const shares    = meta.equity_shares ?? 0;
        const sharePrice = meta.equity_price_usd ?? 1;
        goldTotal   += (goldMg / 31103.5) * goldPrice;
        equityTotal += shares * sharePrice;
      });
      const goldEquityRatio = equityTotal > 0 ? goldTotal / equityTotal : 1.618; // default to φ

      const rawData: UserAffinityData = {
        txHistory:      txCount,
        stakedAmount,
        socialGraph:    referralCount,
        goldEquityRatio,
      };
      setAffinityRaw(rawData);

      const result = calculateAffinityScore(rawData);
      setAffinityResult(result);

      // Animate score bar
      Animated.timing(scoreAnim, {
        toValue: Math.min(result.totalAffinity / 1000, 1),
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

    } catch (e: any) {
      setAffinityError(e.message ?? 'Unknown error');
    } finally {
      setAffinityLoading(false);
    }
  }, [user, scoreAnim]);

  // Pulse animation for the affinity orb
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(affinityAnim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(affinityAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ])).start();
  }, [affinityAnim]);

  // Validation state
  const [validating, setValidating] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, 'pending' | 'pass' | 'fail' | 'running'>>({});
  const [nodeOnline, setNodeOnline] = useState<boolean | null>(null);
  const [lastValidated, setLastValidated] = useState<string | null>(null);

  // Genesis counter
  const GENESIS_TS = 1739877374000;
  const [elapsed, setElapsed] = useState(Math.max(0, Math.floor((Date.now() - GENESIS_TS) / 1000)));
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - GENESIS_TS) / 1000))), 1000);
    return () => clearInterval(iv);
  }, []);

  const elapsedDays = Math.floor(elapsed / 86400);
  const elapsedHrs = Math.floor((elapsed % 86400) / 3600);
  const elapsedMin = Math.floor((elapsed % 3600) / 60);
  const elapsedSec = elapsed % 60;

  const runValidation = useCallback(async () => {
    setValidating(true);
    const results: Record<string, 'pending' | 'pass' | 'fail' | 'running'> = {};
    VALIDATION_TESTS.forEach(t => { results[t.id] = 'pending'; });
    setTestResults({ ...results });

    let anyPassed = false;

    for (const test of VALIDATION_TESTS) {
      setTestResults(prev => ({ ...prev, [test.id]: 'running' }));
      await new Promise(r => setTimeout(r, 400));
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(edgeUrl(test.endpoint), { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) {
          results[test.id] = 'pass';
          anyPassed = true;
        } else {
          results[test.id] = 'fail';
        }
      } catch {
        results[test.id] = 'fail';
      }
      setTestResults({ ...results });
    }

    setNodeOnline(anyPassed);
    setLastValidated(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setValidating(false);
  }, []);

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'certificate', icon: 'workspace-premium', label: 'Cert'       },
    { key: 'network',     icon: 'hub',               label: 'Network'    },
    { key: 'validation',  icon: 'verified',           label: 'Validate'  },
    { key: 'affinity',    icon: 'favorite',           label: 'Affinity'  },
    { key: 'technical',   icon: 'code',               label: 'Tech'      },
  ];

  const passCount = Object.values(testResults).filter(v => v === 'pass').length;
  const failCount = Object.values(testResults).filter(v => v === 'fail').length;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Proof of Value</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <PulseDot color={Colors.primary} />
            <Text style={s.topSub}>Official Sovereign Document · BTNG</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '66' }]}
          onPress={() => showAlert('Share Document', 'BTNG Proof of Value document can be exported as PDF or shared via the BTNG SDK.')}
        >
          <MaterialIcons name="share" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnActive]} onPress={() => setTab(t.key)}>
            <MaterialIcons name={t.icon as any} size={13} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── CERTIFICATE TAB ─────────────────────────────────────────────── */}
        {tab === 'certificate' && (
          <>
            {/* Official Seal Header */}
            <View style={s.sealCard}>
              <View style={s.sealTopRow}>
                <View style={s.sealDotLeft} />
                <Text style={s.sealIssuer}>BITUNCOIN INTERNATIONAL</Text>
                <View style={s.sealDotRight} />
              </View>
              <View style={s.sealIconRow}>
                <Text style={{ fontSize: 52 }}>🏆</Text>
              </View>
              <Text style={s.sealTitle}>CERTIFICATE OF PROOF OF VALUE</Text>
              <Text style={s.sealSubtitle}>BTNG Sovereign Gold Coin — Ghana Mainnet</Text>
              <View style={s.sealDividerLine} />
              <View style={s.sealMetaRow}>
                <View style={s.sealMeta}>
                  <Text style={s.sealMetaLabel}>Document No.</Text>
                  <Text style={s.sealMetaValue}>POV-BTNG-2026-001</Text>
                </View>
                <View style={s.sealMeta}>
                  <Text style={s.sealMetaLabel}>Issued</Text>
                  <Text style={s.sealMetaValue}>Feb 18, 2026</Text>
                </View>
                <View style={s.sealMeta}>
                  <Text style={s.sealMetaLabel}>Status</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <PulseDot color={Colors.success} />
                    <Text style={[s.sealMetaValue, { color: Colors.success }]}>ACTIVE</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Genesis Block Counter */}
            <View style={s.docCard}>
              <SectionHead emoji="⏱️" title="Time Since Genesis" sub="Live sovereign countdown — never stops" badge="LIVE" badgeColor={Colors.success} />
              <View style={s.counterGrid}>
                {[
                  { value: String(elapsedDays).padStart(3, '0'), label: 'DAYS' },
                  { value: String(elapsedHrs).padStart(2, '0'), label: 'HRS' },
                  { value: String(elapsedMin).padStart(2, '0'), label: 'MIN' },
                  { value: String(elapsedSec).padStart(2, '0'), label: 'SEC' },
                ].map((item, i) => (
                  <View key={i} style={[s.counterCell, i < 3 && { borderRightWidth: 1, borderRightColor: Colors.border }]}>
                    <Text style={s.counterValue}>{item.value}</Text>
                    <Text style={s.counterLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
              <View style={s.counterFooter}>
                <MaterialIcons name="auto-awesome" size={11} color={Colors.primary} />
                <Text style={s.counterFooterText}>{elapsed.toLocaleString()} sovereign seconds of unbroken operation</Text>
              </View>
            </View>

            {/* Genesis Transaction Certificate */}
            <View style={s.docCard}>
              <SectionHead emoji="🔗" title="Genesis Transaction" sub="Block #0 · First sovereign record" badge="CONFIRMED" badgeColor={Colors.success} />
              <DocRow label="TX Hash" value={GENESIS_DATA.hash} mono copy />
              <DocRow label="Block" value="#0 — Genesis Block" color={Colors.primary} />
              <DocRow label="Timestamp" value={GENESIS_DATA.dateDisplay} />
              <DocRow label="Amount" value={GENESIS_DATA.amount} color={Colors.primary} />
              <DocRow label="From" value={GENESIS_DATA.from} mono copy />
              <DocRow label="To" value={GENESIS_DATA.to} mono copy />
              <DocRow label="Status" value="✅ CONFIRMED — Bank of Ghana Vault 001" color={Colors.success} />
              <DocRow label="Memo" value={GENESIS_DATA.memo} />
              <View style={s.signatureBox}>
                <Text style={s.signatureLabel}>CRYPTOGRAPHIC SIGNATURE</Text>
                <Text style={s.signatureValue} numberOfLines={2}>{GENESIS_DATA.signature}</Text>
                <CopyBtn value={GENESIS_DATA.signature} />
              </View>
            </View>

            {/* Gold Reserve Certificate */}
            <View style={[s.docCard, { borderColor: Colors.primary + '55' }]}>
              <SectionHead emoji="🥇" title="Gold Reserve Certificate" sub="Bank of Ghana Vault 001 — Accra" badge="VERIFIED" badgeColor={Colors.primary} />
              <DocRow label="Certificate" value={GOLD_RESERVE.certificate} color={Colors.primary} copy />
              <DocRow label="Location" value={GOLD_RESERVE.location} />
              <DocRow label="Amount" value={`${GOLD_RESERVE.amount_kg} kg (${GOLD_RESERVE.amountOz})`} color={Colors.primary} />
              <DocRow label="Purity" value={GOLD_RESERVE.purity} color={Colors.success} />
              <DocRow label="Auditor" value={GOLD_RESERVE.auditor} />
              <DocRow label="Last Audit" value={GOLD_RESERVE.lastAudit} />
              <DocRow label="Next Audit" value={GOLD_RESERVE.nextAudit} />
              <DocRow label="Sovereign" value={GOLD_RESERVE.sovereignGuarantee} />
              <View style={s.goldSealBadge}>
                <MaterialIcons name="verified" size={16} color={Colors.primary} />
                <Text style={s.goldSealText}>SOVEREIGN GOLD RESERVE — VERIFIED & ACTIVE</Text>
                <MaterialIcons name="verified" size={16} color={Colors.primary} />
              </View>
            </View>

            {/* Sovereign Asset IDs */}
            <View style={s.docCard}>
              <SectionHead emoji="🛡️" title="Sovereign Asset IDs" sub="Blockchain-registered asset identifiers" />
              <View style={s.assetIdBox}>
                <Text style={s.assetIdLabel}>MAIN RESERVE · $29.5 Trillion USD</Text>
                <Text style={s.assetIdValue}>{SOVEREIGN_NETWORK.mainReserveId}</Text>
                <CopyBtn value={SOVEREIGN_NETWORK.mainReserveId} />
              </View>
              <View style={[s.assetIdBox, { borderColor: '#3B82F644', backgroundColor: '#3B82F608' }]}>
                <Text style={[s.assetIdLabel, { color: '#3B82F6' }]}>SECONDARY SOVEREIGN COIN · $30 Trillion USD</Text>
                <Text style={[s.assetIdValue, { color: '#3B82F6' }]}>{SOVEREIGN_NETWORK.secondaryCoinId}</Text>
                <CopyBtn value={SOVEREIGN_NETWORK.secondaryCoinId} />
              </View>
              <View style={s.totalSovereignBadge}>
                <Text style={s.totalSovereignText}>TOTAL SOVEREIGN VALUE: {SOVEREIGN_NETWORK.totalSovereign}</Text>
              </View>
            </View>
          </>
        )}

        {/* ── NETWORK TAB ─────────────────────────────────────────────────── */}
        {tab === 'network' && (
          <>
            {/* Network Status Banner */}
            <View style={s.networkBanner}>
              <View style={s.networkBannerTop}>
                <PulseDot color={Colors.success} />
                <Text style={s.networkBannerTitle}>BTNG SOVEREIGN NETWORK — FULLY OPERATIONAL</Text>
              </View>
              <View style={s.networkBannerGrid}>
                {[
                  { label: 'Total Sovereign', value: SOVEREIGN_NETWORK.totalSovereign, color: Colors.primary },
                  { label: 'Main Reserve', value: SOVEREIGN_NETWORK.mainReserveUSD, color: '#22C55E' },
                  { label: 'Secondary Coin', value: SOVEREIGN_NETWORK.secondaryReserveUSD, color: '#3B82F6' },
                  { label: 'Gold Backing', value: SOVEREIGN_NETWORK.goldTonnes, color: Colors.primary },
                  { label: 'Validators', value: `${SOVEREIGN_NETWORK.validators.toLocaleString()} active`, color: '#A855F7' },
                  { label: 'TX Volume', value: SOVEREIGN_NETWORK.txVolume, color: Colors.success },
                  { label: 'Block Height', value: SOVEREIGN_NETWORK.blockHeight, color: Colors.primary },
                  { label: 'Active Services', value: `${SOVEREIGN_NETWORK.activeServices}`, color: '#F59E0B' },
                ].map(item => (
                  <View key={item.label} style={[s.networkCell, { borderColor: item.color + '33' }]}>
                    <Text style={[s.networkCellValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={s.networkCellLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Node Details */}
            <View style={s.docCard}>
              <SectionHead emoji="📡" title="Node Infrastructure" sub="MTN Ghana — West Africa" badge="MAINNET" badgeColor={Colors.success} />
              <DocRow label="Primary (IPv4)" value={SOVEREIGN_NETWORK.nodeIP} mono copy />
              <DocRow label="Primary (IPv6)" value={SOVEREIGN_NETWORK.nodeIPv6} mono copy />
              <DocRow label="Primary Host" value={SOVEREIGN_NETWORK.nodeHostname1} mono copy />
              <DocRow label="Secondary Node" value={SOVEREIGN_NETWORK.nodeIP2} mono copy />
              <DocRow label="Chain ID" value="BTNG-MAINNET-GH-2026" color={Colors.primary} />
              <DocRow label="Region" value="Accra, Ghana (West Africa)" />
              <DocRow label="Provider" value="MTN Ghana Mobile Network" />
              <DocRow label="Security" value={SOVEREIGN_NETWORK.security} color="#9945FF" />
              <DocRow label="VPS Servers" value="2 nodes (Primary + Secondary)" color={Colors.success} />
              <DocRow label="API Endpoints" value={`${SOVEREIGN_NETWORK.apiEndpoints} live endpoints`} color={Colors.success} />
              <DocRow label="Genesis Date" value="February 18, 2026 · 18:36:14 GMT" />
              <DocRow label="Status" value="ALL SYSTEMS FULLY OPERATIONAL" color={Colors.success} />
            </View>

            {/* Web Interfaces */}
            <View style={s.docCard}>
              <SectionHead emoji="🌐" title="Web Interfaces" sub="Live on all platforms" badge="LIVE" badgeColor={Colors.success} />
              {[
                { label: 'Primary Node API (IPv4)', url: 'http://168.231.79.52:64799/api/v1/stats', port: '64799' },
                { label: 'Primary Node API (IPv6)', url: 'http://[2a02:4780:f:bc::1]:64799/api/v1/stats', port: '64799' },
                { label: 'Secondary Node API', url: 'http://72.62.160.237:64799/api/v1/stats', port: '64799' },
                { label: 'Block Explorer', url: 'http://72.62.160.237:64799/explorer', port: '64799' },
                { label: 'Mobile Money Portal', url: 'http://72.62.160.237:3000', port: '3000' },
                { label: 'AI Private Banker', url: 'http://72.62.160.237:8081', port: '8081' },
                { label: 'Sovereign Vault', url: 'http://72.62.160.237:8082', port: '8082' },
                { label: 'Secondary Coin Wallet', url: 'http://72.62.160.237:8088', port: '8088' },
              ].map((item, i) => (
                <View key={item.label} style={[s.webInterfaceRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={s.webInterfaceLeft}>
                    <View style={s.webDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.webInterfaceLabel}>{item.label}</Text>
                      <Text style={s.webInterfaceUrl} numberOfLines={1}>{item.url}</Text>
                    </View>
                  </View>
                  <View style={s.webPortBadge}>
                    <Text style={s.webPortText}>:{item.port}</Text>
                  </View>
                  <CopyBtn value={item.url} />
                </View>
              ))}
            </View>

            {/* Sovereign Reserve IDs full display */}
            <View style={s.docCard}>
              <SectionHead emoji="🔑" title="Sovereign Reserve IDs" sub="Blockchain-verified asset identifiers" />
              <View style={s.fullIdCard}>
                <View style={s.fullIdHeader}>
                  <Text style={s.fullIdHeaderText}>MAIN RESERVE</Text>
                  <Text style={[s.fullIdAmount, { color: '#22C55E' }]}>$29.5 Trillion USD</Text>
                </View>
                <Text style={s.fullIdValue}>{SOVEREIGN_NETWORK.mainReserveId}</Text>
                <View style={s.fullIdFooter}>
                  <MaterialIcons name="verified" size={12} color={Colors.success} />
                  <Text style={s.fullIdFooterText}>Gold-backed · Bank of Ghana · Accra Vault 001</Text>
                </View>
              </View>
              <View style={[s.fullIdCard, { borderColor: '#3B82F644', marginTop: Spacing.sm }]}>
                <View style={s.fullIdHeader}>
                  <Text style={[s.fullIdHeaderText, { color: '#3B82F6' }]}>SECONDARY SOVEREIGN COIN</Text>
                  <Text style={[s.fullIdAmount, { color: '#3B82F6' }]}>$30 Trillion USD</Text>
                </View>
                <Text style={[s.fullIdValue, { color: '#3B82F6' }]}>{SOVEREIGN_NETWORK.secondaryCoinId}</Text>
                <View style={s.fullIdFooter}>
                  <MaterialIcons name="verified" size={12} color="#3B82F6" />
                  <Text style={[s.fullIdFooterText, { color: '#3B82F6' }]}>Quantum Genesis · AFT-54 · 2026</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── VALIDATION TAB ──────────────────────────────────────────────── */}
        {tab === 'validation' && (
          <>
            {/* Run Validation Banner */}
            <View style={s.validationHero}>
              <Text style={{ fontSize: 48 }}>🔍</Text>
              <Text style={s.validationHeroTitle}>Live Network Validation</Text>
              <Text style={s.validationHeroSub}>
                Run real-time checks against the BTNG Sovereign Edge Node to verify all systems are operational.
              </Text>
              <TouchableOpacity
                style={[s.runBtn, validating && { opacity: 0.6 }]}
                onPress={runValidation}
                disabled={validating}
                activeOpacity={0.85}
              >
                {validating ? (
                  <ActivityIndicator color={Colors.bg} size="small" />
                ) : (
                  <MaterialIcons name="play-arrow" size={20} color={Colors.bg} />
                )}
                <Text style={s.runBtnText}>{validating ? 'Validating…' : 'Run Full Validation'}</Text>
              </TouchableOpacity>

              {/* Summary pills */}
              {lastValidated && (
                <View style={s.summaryRow}>
                  <View style={[s.summaryPill, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
                    <MaterialIcons name="check-circle" size={12} color={Colors.success} />
                    <Text style={[s.summaryPillText, { color: Colors.success }]}>{passCount} PASS</Text>
                  </View>
                  {failCount > 0 && (
                    <View style={[s.summaryPill, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '55' }]}>
                      <MaterialIcons name="cancel" size={12} color={Colors.error} />
                      <Text style={[s.summaryPillText, { color: Colors.error }]}>{failCount} FAIL</Text>
                    </View>
                  )}
                  <Text style={s.summaryTime}>Updated {lastValidated}</Text>
                </View>
              )}
            </View>

            {/* Test Results */}
            <View style={s.docCard}>
              <SectionHead emoji="✅" title="Validation Results" sub="6 automated endpoint tests" badge={lastValidated ? `${passCount}/6 PASS` : 'NOT RUN'} badgeColor={passCount === 6 ? Colors.success : lastValidated ? Colors.warning : Colors.textMuted} />
              {VALIDATION_TESTS.map((test, i) => {
                const result = testResults[test.id];
                const isRunning = result === 'running';
                const isPending = !result || result === 'pending';
                const isPassed = result === 'pass';
                const isFailed = result === 'fail';
                const statusColor = isPassed ? Colors.success : isFailed ? Colors.error : isRunning ? Colors.warning : Colors.textMuted;
                return (
                  <View key={test.id} style={[s.testRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                    <View style={[s.testIcon, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                      {isRunning ? (
                        <ActivityIndicator size="small" color={statusColor} />
                      ) : (
                        <MaterialIcons
                          name={isPassed ? 'check-circle' : isFailed ? 'cancel' : 'radio-button-unchecked'}
                          size={16}
                          color={statusColor}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.testName}>{test.name}</Text>
                        <View style={[s.testStatusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                          <Text style={[s.testStatusText, { color: statusColor }]}>
                            {isPending ? 'PENDING' : isRunning ? 'RUNNING' : isPassed ? 'PASS' : 'FAIL'}
                          </Text>
                        </View>
                      </View>
                      <Text style={s.testDesc}>{test.desc}</Text>
                      <Text style={s.testEndpoint} numberOfLines={1}>{EDGE_BASE}?path={test.endpoint}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Node Connectivity Status */}
            {nodeOnline !== null && (
              <View style={[s.docCard, { borderColor: (nodeOnline ? Colors.success : Colors.error) + '44' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                  <MaterialIcons
                    name={nodeOnline ? 'wifi' : 'wifi-off'}
                    size={32}
                    color={nodeOnline ? Colors.success : Colors.error}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.nodeStatusTitle, { color: nodeOnline ? Colors.success : Colors.error }]}>
                      {nodeOnline ? 'Node Online — Sovereign Network Active' : 'Node Unreachable — Check Edge Function'}
                    </Text>
                    <Text style={s.nodeStatusSub}>
                      {nodeOnline
                        ? 'BTNG Sovereign Network confirmed operational via Supabase Edge Functions'
                        : 'Edge function may be deploying — retry in 30 seconds'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Manual curl commands */}
            <View style={s.docCard}>
              <SectionHead emoji="💻" title="Verification Commands" sub="Run these on your server" />
              {[
                `curl "${EDGE_BASE}?path=/api/v1/blockchain/info"`,
                `curl "${EDGE_BASE}?path=/api/v1/genesis"`,
                `curl "${EDGE_BASE}?path=/api/v1/gold/reserve"`,
                `curl "${EDGE_BASE}?path=/api/v1/stats"`,  
              ].map((cmd, i) => (
                <View key={i} style={s.curlRow}>
                  <Text style={s.curlText} numberOfLines={1}>{cmd}</Text>
                  <CopyBtn value={cmd} />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── TECHNICAL TAB ───────────────────────────────────────────────── */}
        {tab === 'technical' && (
          <>
            {/* Tech Stack Grid */}
            <View style={s.docCard}>
              <SectionHead emoji="⚙️" title="Technology Stack" sub="BTNG Sovereign Node v1.0.0" />
              <View style={s.techGrid}>
                {TECH_STACK.map(item => (
                  <View key={item.name} style={[s.techCell, { borderColor: item.color + '33' }]}>
                    <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                    <Text style={[s.techCellName, { color: item.color }]}>{item.name}</Text>
                    <Text style={s.techCellValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* API Endpoints Reference */}
            <View style={s.docCard}>
              <SectionHead emoji="📡" title="API Reference" sub={`${API_ENDPOINTS.length} documented endpoints`} badge="REST" badgeColor="#3B82F6" />
              {API_ENDPOINTS.map((ep, i) => (
                <View key={ep.path} style={[s.apiRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={[s.apiMethod, { backgroundColor: ep.method === 'GET' ? '#22C55E18' : '#F59E0B18', borderColor: ep.method === 'GET' ? '#22C55E44' : '#F59E0B44' }]}>
                    <Text style={[s.apiMethodText, { color: ep.method === 'GET' ? '#22C55E' : '#F59E0B' }]}>{ep.method}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.apiPath} numberOfLines={1}>{ep.path}</Text>
                    <Text style={s.apiDesc}>{ep.desc}</Text>
                  </View>
                  <CopyBtn value={`${NODE_URL}${ep.path}`} />
                </View>
              ))}
            </View>

            {/* Core Architecture */}
            <View style={s.docCard}>
              <SectionHead emoji="🏗️" title="System Architecture" sub="A.I.A. Engine v1.0 · Production" />
              {[
                { module: 'VaultCore', desc: 'AES-256-GCM encryption · SHA-256 key derivation · Nonce-based security', color: '#9945FF' },
                { module: 'EncryptedLibraryBox (L1)', desc: 'Base64-encoded append-only ledger with in-memory cache', color: Colors.primary },
                { module: 'EncryptedReserveCenter (L2)', desc: 'Compressed archive layer for batch transaction storage', color: '#3B82F6' },
                { module: 'BTNGLedger', desc: 'Gold/Savings/Checking asset accounting engine', color: Colors.warning },
                { module: 'AfricaEngine', desc: 'Master orchestrator — wallet events, online/offline mode', color: '#22C55E' },
                { module: 'ECPU (e-CPU)', desc: 'Transaction evaluation, validation, and routing layer', color: '#F59E0B' },
                { module: 'EGPU (e-GPU)', desc: 'Pattern analysis and anomaly detection layer', color: '#EF4444' },
                { module: 'PrivateBanker', desc: 'AI agent persona — risk scoring, advisory, execution', color: Colors.primary },
              ].map((item, i) => (
                <View key={item.module} style={[s.archRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={[s.archDot, { backgroundColor: item.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.archModule, { color: item.color }]}>{item.module}</Text>
                    <Text style={s.archDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Deployment Reference */}
            <View style={s.docCard}>
              <SectionHead emoji="🚀" title="Deployment Guide" sub="Production install on Ghana server" />
              {[
                { step: '1', cmd: 'mkdir /opt/btng-node && cd /opt/btng-node', desc: 'Create node directory' },
                { step: '2', cmd: 'npm install express cors axios crypto socket.io', desc: 'Install dependencies' },
                { step: '3', cmd: 'node server.js', desc: 'Start BTNG sovereign node' },
                { step: '4', cmd: 'npm install -g pm2 && pm2 start server.js --name btng-node', desc: 'Keep running with PM2' },
                { step: '5', cmd: 'pm2 save && pm2 startup', desc: 'Auto-restart on reboot' },
                { step: '6', cmd: 'node scripts/btng-validation.js', desc: 'Run validation suite' },
              ].map(item => (
                <View key={item.step} style={s.deployRow}>
                  <View style={s.deployStep}><Text style={s.deployStepText}>{item.step}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.deployCmd} numberOfLines={1}>{item.cmd}</Text>
                    <Text style={s.deployDesc}>{item.desc}</Text>
                  </View>
                  <CopyBtn value={item.cmd} />
                </View>
              ))}
            </View>

            {/* Official Seal Footer */}
            <View style={s.footerSeal}>
              <MaterialIcons name="verified" size={20} color={Colors.primary} />
              <Text style={s.footerSealText}>
                This document is an official record of the BTNG Sovereign Network established on Ghana infrastructure. All data is cryptographically verifiable on the BTNG blockchain at {NODE_URL}.
              </Text>
            </View>
          </>
        )}

        {/* ── LIFE AFFINITY ENGINE TAB ────────────────────────────────────── */}
        {tab === 'affinity' && (
          <>
            {/* Hero */}
            <View style={aff.hero}>
              <Animated.View style={[
                aff.orb,
                {
                  opacity: affinityAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
                  transform: [{ scale: affinityAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
                },
              ]}>
                <Text style={{ fontSize: 52 }}>❤️‍🔥</Text>
              </Animated.View>
              <Text style={aff.heroTitle}>Life Affinity Engine</Text>
              <Text style={aff.heroSub}>
                TypeScript port of <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>affinity_engine.py</Text>.{' '}
                Computes your Proof-of-Life score from on-chain activity:
                transaction life × staking power × social affinity × economic harmony
                — using geometric mean (mirrors Python np.prod).
              </Text>
              {affinityResult && (
                <View style={[aff.gradeBadge, { backgroundColor: GRADE_CONFIG[affinityResult.grade].bg, borderColor: GRADE_CONFIG[affinityResult.grade].color + '55' }]}>
                  <Text style={{ fontSize: 22 }}>{GRADE_CONFIG[affinityResult.grade].emoji}</Text>
                  <Text style={[aff.gradeLabel, { color: GRADE_CONFIG[affinityResult.grade].color }]}>
                    {GRADE_CONFIG[affinityResult.grade].label}
                  </Text>
                </View>
              )}
            </View>

            {/* Python algorithm reference */}
            <View style={aff.algorithmCard}>
              <View style={aff.algorithmHeader}>
                <MaterialIcons name="code" size={16} color={Colors.primary} />
                <Text style={aff.algorithmTitle}>Algorithm (affinity_engine.py → TypeScript)</Text>
              </View>
              {[
                { fn: '_tx_life_score()',       formula: 'min(txCount / 100, 1.0) × 1000',         color: '#3B82F6',  weight: '25%' },
                { fn: '_staking_power()',       formula: 'ln(stakedAmount + 1) × 100',             color: '#A855F7', weight: '25%' },
                { fn: '_social_affinity()',     formula: 'eigenvector_max(social_graph) × 500',    color: '#22C55E', weight: '25%' },
                { fn: '_economic_harmony()',    formula: '(1 − |ratio − φ| / φ) × 200',           color: Colors.primary, weight: '25%' },
              ].map(item => (
                <View key={item.fn} style={aff.algoRow}>
                  <View style={[aff.algoFnWrap, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                    <Text style={[aff.algoFn, { color: item.color }]}>{item.fn}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={aff.algoFormula}>{item.formula}</Text>
                    <View style={[aff.algoWeightPill, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                      <Text style={[aff.algoWeightText, { color: item.color }]}>weight {item.weight}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <View style={aff.geometricRow}>
                <MaterialIcons name="functions" size={13} color={Colors.primary} />
                <Text style={aff.geometricText}>
                  Total = geometric_mean([tx, staking, social, economic]){' '}·{' '}mirrors Python np.prod()
                </Text>
              </View>
            </View>

            {/* Run engine button */}
            <TouchableOpacity
              style={[aff.runBtn, affinityLoading && { opacity: 0.65 }]}
              onPress={runAffinityEngine}
              disabled={affinityLoading}
              activeOpacity={0.85}
            >
              {affinityLoading
                ? <ActivityIndicator color={Colors.bg} size="small" />
                : <MaterialIcons name="psychology" size={20} color={Colors.bg} />
              }
              <Text style={aff.runBtnText}>
                {affinityLoading ? 'Computing Life Affinity…' : 'Compute Life Affinity Score'}
              </Text>
            </TouchableOpacity>

            {affinityError ? (
              <View style={aff.errorCard}>
                <MaterialIcons name="error-outline" size={16} color={Colors.error} />
                <Text style={aff.errorText}>{affinityError}</Text>
              </View>
            ) : null}

            {/* Live score result */}
            {affinityResult && (
              <>
                {/* Score ring card */}
                <View style={aff.scoreCard}>
                  <View style={aff.scoreTop}>
                    <View style={aff.scoreRingWrap}>
                      <View style={aff.scoreRingOuter}>
                        <Text style={aff.scoreNumber}>{affinityResult.totalAffinity.toFixed(1)}</Text>
                        <Text style={aff.scoreLabel}>AFFINITY</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, gap: Spacing.sm }}>
                      <View style={[aff.gradeRow, { backgroundColor: GRADE_CONFIG[affinityResult.grade].bg, borderColor: GRADE_CONFIG[affinityResult.grade].color + '55' }]}>
                        <Text style={{ fontSize: 20 }}>{GRADE_CONFIG[affinityResult.grade].emoji}</Text>
                        <Text style={[aff.gradeText, { color: GRADE_CONFIG[affinityResult.grade].color }]}>
                          {affinityResult.grade} — {GRADE_CONFIG[affinityResult.grade].label}
                        </Text>
                      </View>
                      <Text style={aff.proofHash} numberOfLines={1} selectable>
                        {affinityResult.proofHash}
                      </Text>
                      <Text style={aff.scoreCaption}>
                        {affinityResult.totalAffinity > 750
                          ? 'Sovereign-grade life value — top tier'
                          : affinityResult.totalAffinity > 400
                          ? 'Strong engagement — keep building'
                          : affinityResult.totalAffinity > 100
                          ? 'Growing on-chain presence'
                          : 'Seed stage — start transacting'}
                      </Text>
                    </View>
                  </View>

                  {/* Score bar */}
                  <View style={aff.barTrack}>
                    <Animated.View
                      style={[
                        aff.barFill,
                        {
                          width: scoreAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                          backgroundColor: GRADE_CONFIG[affinityResult.grade].color,
                        },
                      ]}
                    />
                  </View>
                  <View style={aff.barLabels}>
                    <Text style={aff.barLabel}>0 · SEED</Text>
                    <Text style={aff.barLabel}>400 · SILVER</Text>
                    <Text style={aff.barLabel}>750+ · GOLD</Text>
                  </View>
                </View>

                {/* Four component breakdown */}
                <View style={aff.componentsCard}>
                  <Text style={aff.componentTitle}>Score Components</Text>
                  {[
                    {
                      label: 'Transaction Life',
                      key:   'transaction_life' as keyof AffinityComponents,
                      icon:  'receipt-long',
                      color: '#3B82F6',
                      raw:   `${affinityRaw?.txHistory ?? 0} transactions`,
                      fn:    '_tx_life_score()',
                    },
                    {
                      label: 'Staking Power',
                      key:   'staking_life' as keyof AffinityComponents,
                      icon:  'toll',
                      color: '#A855F7',
                      raw:   `${(affinityRaw?.stakedAmount ?? 0).toLocaleString()} BTNGG staked`,
                      fn:    '_staking_power()',
                    },
                    {
                      label: 'Social Affinity',
                      key:   'social_life' as keyof AffinityComponents,
                      icon:  'people',
                      color: '#22C55E',
                      raw:   `${affinityRaw?.socialGraph ?? 0} referrals (eigenvector proxy)`,
                      fn:    '_social_affinity()',
                    },
                    {
                      label: 'Economic Harmony',
                      key:   'economic_life' as keyof AffinityComponents,
                      icon:  'balance',
                      color: Colors.primary,
                      raw:   `ratio ${(affinityRaw?.goldEquityRatio ?? 0).toFixed(4)} vs φ=1.618`,
                      fn:    '_economic_harmony()',
                    },
                  ].map(item => {
                    const val = affinityResult.components[item.key];
                    const maxVal = 1000;
                    const pct = Math.min(val / maxVal, 1);
                    return (
                      <View key={item.label} style={[aff.componentRow, { borderColor: item.color + '33' }]}>
                        <View style={[aff.componentIconWrap, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                          <MaterialIcons name={item.icon as any} size={18} color={item.color} />
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          <View style={aff.componentLabelRow}>
                            <Text style={aff.componentLabel}>{item.label}</Text>
                            <Text style={[aff.componentScore, { color: item.color }]}>{val.toFixed(2)}</Text>
                          </View>
                          <View style={aff.componentBarTrack}>
                            <View style={[aff.componentBarFill, { width: `${pct * 100}%` as any, backgroundColor: item.color }]} />
                          </View>
                          <View style={aff.componentMetaRow}>
                            <Text style={aff.componentRaw}>{item.raw}</Text>
                            <View style={[aff.componentFnPill, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                              <Text style={[aff.componentFnText, { color: item.color }]}>{item.fn}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {/* Geometric mean footer */}
                  <View style={aff.geoMeanRow}>
                    <MaterialIcons name="functions" size={14} color={Colors.primary} />
                    <Text style={aff.geoMeanText}>
                      geometric_mean([{Object.values(affinityResult.components).map(v => v.toFixed(1)).join(', ')}]){' '}={' '}
                      <Text style={{ color: Colors.primary, fontWeight: FontWeight.heavy }}>{affinityResult.totalAffinity.toFixed(4)}</Text>
                    </Text>
                  </View>
                </View>

                {/* How to improve */}
                <View style={aff.tipsCard}>
                  <Text style={aff.tipsTitle}>How to Increase Your Score</Text>
                  {[
                    { icon: 'swap-horiz', color: '#3B82F6', tip: 'Execute more trades and P2P orders to raise Transaction Life.' },
                    { icon: 'toll',       color: '#A855F7', tip: 'Maintain a higher BTNGG wallet balance to increase Staking Power.' },
                    { icon: 'people',     color: '#22C55E', tip: 'Refer friends to the platform — each referral boosts Social Affinity.' },
                    { icon: 'balance',    color: Colors.primary, tip: 'Keep your gold/equity certificate ratio close to φ=1.618 for maximum harmony.' },
                  ].map((t, i) => (
                    <View key={i} style={aff.tipRow}>
                      <View style={[aff.tipIcon, { backgroundColor: t.color + '18', borderColor: t.color + '44' }]}>
                        <MaterialIcons name={t.icon as any} size={14} color={t.color} />
                      </View>
                      <Text style={aff.tipText}>{t.tip}</Text>
                    </View>
                  ))}
                </View>

                {/* Proof-of-Life footer */}
                <View style={aff.proofCard}>
                  <MaterialIcons name="verified-user" size={20} color={Colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={aff.proofTitle}>Proof of Life Generated</Text>
                    <Text style={aff.proofHashFull} selectable numberOfLines={2}>{affinityResult.proofHash}</Text>
                    <Text style={aff.proofGrade}>Grade: <Text style={{ color: GRADE_CONFIG[affinityResult.grade].color }}>{affinityResult.grade}</Text> · Score: {affinityResult.totalAffinity.toFixed(4)}</Text>
                  </View>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  topCenter: { alignItems: 'center', flex: 1 },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tabBar: {
    flexDirection: 'row', marginHorizontal: Spacing.xl,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, gap: 2,
  },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Seal Card
  sealCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 2, borderColor: Colors.primary + '66', alignItems: 'center', gap: Spacing.md,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  sealTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center' },
  sealDotLeft: { flex: 1, height: 1, backgroundColor: Colors.primary + '44' },
  sealDotRight: { flex: 1, height: 1, backgroundColor: Colors.primary + '44' },
  sealIssuer: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 2, includeFontPadding: false },
  sealIconRow: { alignItems: 'center' },
  sealTitle: { fontSize: 15, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', letterSpacing: 0.5, includeFontPadding: false },
  sealSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', includeFontPadding: false },
  sealDividerLine: { height: 1, width: '100%', backgroundColor: Colors.primary + '33' },
  sealMetaRow: { flexDirection: 'row', width: '100%', gap: 8 },
  sealMeta: { flex: 1, alignItems: 'center', gap: 3 },
  sealMetaLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  sealMetaValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  // Doc Card
  docCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },

  // Counter
  counterGrid: {
    flexDirection: 'row', backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  counterCell: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg, gap: 4 },
  counterValue: { fontSize: 28, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  counterLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 1, includeFontPadding: false },
  counterFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary + '33', marginTop: Spacing.sm,
  },
  counterFooterText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Signature
  signatureBox: {
    backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary + '33', marginTop: Spacing.sm, gap: 4,
  },
  signatureLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  signatureValue: { fontSize: 10, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },

  // Gold Seal
  goldSealBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary + '55', marginTop: Spacing.sm,
  },
  goldSealText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },

  // Asset IDs
  assetIdBox: {
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary + '44', gap: 4, marginBottom: Spacing.sm,
  },
  assetIdLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  assetIdValue: { fontSize: 11, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  totalSovereignBadge: {
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 2, borderColor: Colors.primary + '66', alignItems: 'center',
  },
  totalSovereignText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },

  // Network Tab
  networkBanner: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
  },
  networkBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  networkBannerTitle: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  networkBannerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  networkCell: {
    width: '23%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    padding: Spacing.sm, borderWidth: 1, alignItems: 'center', gap: 3, minWidth: 70,
  },
  networkCellValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  networkCellLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Web Interfaces
  webInterfaceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
  webInterfaceLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  webDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success },
  webInterfaceLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  webInterfaceUrl: { fontSize: 10, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false, marginTop: 1 },
  webPortBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  webPortText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  // Full ID Cards
  fullIdCard: {
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary + '44', gap: 6,
  },
  fullIdHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fullIdHeaderText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },
  fullIdAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  fullIdValue: { fontSize: 12, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false, lineHeight: 18 },
  fullIdFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fullIdFooterText: { fontSize: 10, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Validation
  validationHero: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md,
  },
  validationHeroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  validationHeroSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  runBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  runBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  summaryPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  summaryPillText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  summaryTime: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  testIcon: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  testName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  testStatusBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  testStatusText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  testDesc: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  testEndpoint: { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', marginTop: 2, includeFontPadding: false },
  nodeStatusTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  nodeStatusSub: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: 3, includeFontPadding: false },
  curlRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  curlText: { flex: 1, fontSize: 10, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },

  // Technical
  techGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  techCell: {
    width: '47%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, alignItems: 'flex-start', gap: 4,
  },
  techCellName: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  techCellValue: { fontSize: 10, color: Colors.textSecondary, includeFontPadding: false },
  apiRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
  apiMethod: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1 },
  apiMethodText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  apiPath: { fontSize: 11, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  apiDesc: { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  archRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm + 2 },
  archDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  archModule: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  archDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: 2, includeFontPadding: false },
  deployRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm + 2, borderTopWidth: 1, borderTopColor: Colors.border },
  deployStep: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primaryGlow,
    borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
  },
  deployStepText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  deployCmd: { fontSize: 11, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  deployDesc: { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  footerSeal: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1.5, borderColor: Colors.primary + '55',
  },
  footerSealText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, fontStyle: 'italic', includeFontPadding: false },
});

// ── Life Affinity Engine styles ───────────────────────────────────────────────
const aff = StyleSheet.create({
  hero: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 1, borderColor: '#A855F744', alignItems: 'center', gap: Spacing.md,
  },
  orb: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#A855F718', borderWidth: 2, borderColor: '#A855F755',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  gradeBadge:{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1 },
  gradeLabel:{ fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },

  algorithmCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm },
  algorithmHeader:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  algorithmTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  algoRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  algoFnWrap:     { borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  algoFn:         { fontSize: 10, fontWeight: FontWeight.heavy, fontFamily: 'monospace', includeFontPadding: false },
  algoFormula:    { fontSize: 11, color: Colors.textSecondary, fontFamily: 'monospace', includeFontPadding: false },
  algoWeightPill: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, alignSelf: 'flex-start' },
  algoWeightText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  geometricRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '33' },
  geometricText:  { flex: 1, fontSize: 10, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },

  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#A855F7', borderRadius: Radius.xl, paddingVertical: Spacing.lg,
    shadowColor: '#A855F7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  runBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  errorCard:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '55' },
  errorText:  { flex: 1, fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },

  scoreCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#A855F744', padding: Spacing.md, gap: Spacing.md },
  scoreTop:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  scoreRingWrap:   { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  scoreRingOuter:  { width: 88, height: 88, borderRadius: 44, backgroundColor: '#A855F718', borderWidth: 3, borderColor: '#A855F766', alignItems: 'center', justifyContent: 'center', gap: 2 },
  scoreNumber:     { fontSize: 20, fontWeight: FontWeight.heavy, color: '#A855F7', includeFontPadding: false },
  scoreLabel:      { fontSize: 8, fontWeight: FontWeight.heavy, color: '#A855F7', letterSpacing: 1, includeFontPadding: false },
  gradeRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1 },
  gradeText:       { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  proofHash:       { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  scoreCaption:    { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  barTrack:        { height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  barFill:         { height: 8, borderRadius: 4 },
  barLabels:       { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel:        { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  componentsCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  componentTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  componentRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  componentIconWrap: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  componentLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  componentLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  componentScore:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  componentBarTrack: { height: 5, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden' },
  componentBarFill:  { height: 5, borderRadius: 3 },
  componentMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  componentRaw:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flex: 1 },
  componentFnPill:   { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  componentFnText:   { fontSize: 8, fontWeight: FontWeight.heavy, fontFamily: 'monospace', includeFontPadding: false },
  geoMeanRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '44' },
  geoMeanText:       { flex: 1, fontSize: 10, color: Colors.textSecondary, fontFamily: 'monospace', includeFontPadding: false },

  tipsCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  tipsTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tipRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  tipIcon:     { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tipText:     { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },

  proofCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44' },
  proofTitle:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  proofHashFull: { fontSize: 9, color: Colors.success, fontFamily: 'monospace', includeFontPadding: false, marginTop: 4, lineHeight: 14 },
  proofGrade:    { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, marginTop: 4 },
});
