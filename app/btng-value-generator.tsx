/**
 * BTNG Value Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native port of pages/generator.js (wagmi + react-chartjs-2 → RN)
 *
 * Implements:
 *  • Life Affinity Generator with animated energy bar (≈ lifeEnergy state)
 *  • Real-time Proof-of-Value streaming via polling (WebSocket → setInterval)
 *  • Certificate value card: goldEquiv, equityEquiv, affinityBonus, totalValue
 *  • "Generate More Life Value" flow → persists to btng_certificates
 *  • 24-point sparkline chart via react-native-svg (≈ react-chartjs-2 Line)
 *
 * Maps:
 *  useAccount()         → useAuth()
 *  useContractWrite()   → getSupabaseClient() insert
 *  WebSocket stream     → 10 s polling (backend doesn't support WS)
 *  Line chart           → custom SVG polyline sparkline
 *  /api/generate-affinity → affinity engine computed locally + gold-oracle edge fn
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Easing, Dimensions,
} from 'react-native';
import Svg, { Polyline, Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { useGoldOracle } from '@/hooks/useGoldOracle';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProofOfValueData {
  goldEquiv:     number;  // USD value of gold backing
  equityEquiv:   number;  // USD value of equity backing
  affinityBonus: number;  // accumulated affinity score / 1000
  totalValue:    number;  // sum of all three
  affinityScore: number;  // raw affinity score
  grade:         string;  // GOLD / SILVER / BRONZE / SEED
  proofHash:     string;  // deterministic hash
  timestamp:     number;  // unix ms
}

interface CertRecord {
  id: string;
  cert_id: string;
  asset_value: number;
  equity_grade: string;
  metadata: Record<string, any>;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000; // mirrors WebSocket('wss://value-oracle.btng.io') polling
const MIN_GOLD_MG      = 1000;   // mirrors BTNGGoldCertificate.sol MIN_GOLD_CERT
const TROY_OZ_PER_G    = 31.1035;

// Grade config
const GRADE_CFG: Record<string, { color: string; emoji: string; bg: string }> = {
  GOLD:   { color: Colors.primary, emoji: '🥇', bg: Colors.primaryGlow },
  SILVER: { color: '#94A3B8',      emoji: '🥈', bg: '#94A3B818'        },
  BRONZE: { color: '#CD7F32',      emoji: '🥉', bg: '#CD7F3218'        },
  SEED:   { color: Colors.textMuted, emoji: '🌱', bg: Colors.bgElevated },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic hash for proof ID — mirrors Web3.keccak256 pattern */
function buildProofHash(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return `0x${Math.abs(h).toString(16).padStart(8, '0')}${Date.now().toString(16)}`;
}

/** Life energy from user interaction — mirrors Math.random() * 1000 + Date.now() % 1000 */
function generateLifeEnergy(): number {
  const rng = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(rng);
    return (rng[0] % 1000) + (Date.now() % 1000);
  }
  return Math.random() * 1000 + (Date.now() % 1000);
}

/** Compute PoV from raw data — mirrors affinity_engine.py + getCurrentValue() */
function computeProofOfValue(
  goldUSD: number,
  goldMg: number,
  equityShares: number,
  equityPrice: number,
  affinityScore: number
): ProofOfValueData {
  const goldEquiv   = (goldUSD * goldMg) / (TROY_OZ_PER_G * 1000);
  const equityEquiv = equityShares * equityPrice;
  const affinityBonus = affinityScore / 1000;
  const totalValue  = goldEquiv + equityEquiv + affinityBonus;
  const grade =
    totalValue > 750 ? 'GOLD' :
    totalValue > 150 ? 'SILVER' :
    totalValue > 30  ? 'BRONZE' : 'SEED';
  return {
    goldEquiv,
    equityEquiv,
    affinityBonus,
    totalValue,
    affinityScore,
    grade,
    proofHash: buildProofHash(`${goldMg}-${equityShares}-${affinityScore}`),
    timestamp: Date.now(),
  };
}

// ─── Sparkline Chart (replaces react-chartjs-2 Line) ─────────────────────────

function SparklineChart({
  data,
  width,
  height,
  color,
}: {
  data: number[];
  width: number;
  height: number;
  color: string;
}) {
  if (!data || data.length < 2) return null;
  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = Math.max(max - min, 0.0001);
  const pad   = 6;
  const w     = width  - pad * 2;
  const h     = height - pad * 2;

  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * w;
      const y = pad + (1 - (v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0"  />
        </SvgGradient>
      </Defs>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Animated Energy Bar (replaces CSS width animation) ──────────────────────

function EnergyBar({ energy, maxEnergy = 2000 }: { energy: number; maxEnergy?: number }) {
  const anim     = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const pct = Math.min(energy / maxEnergy, 1);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [pct, anim]);

  useEffect(() => {
    if (energy <= 0) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.ease }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [energy, pulseAnim]);

  const barColor =
    pct > 0.75 ? Colors.primary :
    pct > 0.45 ? Colors.warning :
    pct > 0.2  ? '#3B82F6'     : Colors.textMuted;

  return (
    <View style={eb.container}>
      <View style={eb.track}>
        <Animated.View
          style={[
            eb.fill,
            {
              width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: barColor,
            },
          ]}
        />
        {/* Shimmer stripes */}
        {energy > 0 && (
          <Animated.View style={[eb.shimmer, { opacity: pulseAnim }]} />
        )}
      </View>
      <View style={eb.labelRow}>
        <Text style={eb.labelLeft}>0</Text>
        <Text style={[eb.labelCenter, { color: barColor }]}>
          {energy.toFixed(0)} Life Force Units
        </Text>
        <Text style={eb.labelRight}>{maxEnergy}</Text>
      </View>
    </View>
  );
}

const eb = StyleSheet.create({
  container:   { gap: 6 },
  track:       { height: 18, backgroundColor: Colors.bgElevated, borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, position: 'relative' },
  fill:        { height: '100%', borderRadius: 9 },
  shimmer:     { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 9 },
  labelRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelLeft:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  labelCenter: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  labelRight:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ─── Metric Card (mirrors Metric component from generator.js) ─────────────────

function Metric({
  label,
  value,
  unit,
  highlight,
  color,
}: {
  label:     string;
  value:     number;
  unit:      string;
  highlight?: boolean;
  color?:    string;
}) {
  const c = color ?? (highlight ? Colors.success : Colors.textPrimary);
  return (
    <View style={[mc.card, highlight && { borderColor: c + '55', backgroundColor: c + '08' }]}>
      <Text style={mc.label}>{label}</Text>
      <Text style={[mc.value, { color: c }]}>
        {value >= 1000
          ? `$${(value / 1000).toFixed(2)}K`
          : `$${value.toFixed(4)}`}{' '}
        <Text style={[mc.unit, { color: c + 'AA' }]}>{unit}</Text>
      </Text>
    </View>
  );
}

const mc = StyleSheet.create({
  card:  { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 4, alignItems: 'center' },
  label: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, textAlign: 'center', includeFontPadding: false },
  value: { fontSize: 12, fontWeight: FontWeight.heavy, textAlign: 'center', includeFontPadding: false },
  unit:  { fontSize: 9, fontWeight: FontWeight.medium, includeFontPadding: false },
});

// ─── Live Dot ────────────────────────────────────────────────────────────────

function LiveDot({ color = Colors.success }: { color?: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.9, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
    ])).start();
  }, [pulse]);
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color, opacity: 0.3, transform: [{ scale: pulse }] }} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BTNGValueGeneratorScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const gold    = useGoldOracle();
  const goldUSD = gold.priceUSD > 0 ? gold.priceUSD : 3325;

  // ── State (mirrors useState in generator.js) ──────────────────────────────
  const [lifeEnergy,   setLifeEnergy]   = useState(0);
  const [proofOfValue, setProofOfValue] = useState<ProofOfValueData | null>(null);
  const [generating,   setGenerating]   = useState(false);
  const [minting,      setMinting]      = useState(false);
  const [lastMinted,   setLastMinted]   = useState<string | null>(null);
  const [totalGenerated, setTotalGenerated] = useState(0);
  const [history,      setHistory]      = useState<number[]>([]); // sparkline data
  const [certs,        setCerts]        = useState<CertRecord[]>([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [selectedCert, setSelectedCert] = useState<string | null>(null);

  // Orb pulse animation
  const orbPulse = useRef(new Animated.Value(1)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(orbPulse, { toValue: 1.1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(orbPulse, { toValue: 0.95, duration: 1000, useNativeDriver: true }),
    ])).start();
  }, [orbPulse]);

  // ── Load user's certificates ──────────────────────────────────────────────
  const loadCerts = useCallback(async () => {
    if (!user) return;
    setCertsLoading(true);
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('btng_certificates')
      .select('id, cert_id, asset_value, equity_grade, metadata, created_at')
      .eq('user_id', (user as any).id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);
    setCertsLoading(false);
    if (data) {
      setCerts(data as CertRecord[]);
      // Auto-select the first certificate
      if (data.length > 0 && !selectedCert) {
        setSelectedCert(data[0].id);
      }
    }
  }, [user, selectedCert]);

  useEffect(() => { loadCerts(); }, [loadCerts]);

  // ── Real-time polling (replaces WebSocket) ─────────────────────────────────
  // Mirrors: ws.onmessage = (event) => { const valueData = JSON.parse(event.data); setProofOfValue(valueData); }
  useEffect(() => {
    if (!selectedCert || !certs.length) return;
    const cert = certs.find(c => c.id === selectedCert);
    if (!cert) return;

    const tick = () => {
      const meta         = cert.metadata ?? {};
      const goldMg       = meta.gold_mg ?? MIN_GOLD_MG;
      const equityShares = meta.equity_shares ?? 10;
      const equityPrice  = meta.equity_price_usd ?? 50;
      const affinityScore = meta.affinity_score ?? 0;

      // Add small live drift to gold price (± 0.05%) to simulate oracle stream
      const liveDrift = (Math.random() - 0.5) * goldUSD * 0.0005;
      const liveGold  = goldUSD + liveDrift;

      const pov = computeProofOfValue(liveGold, goldMg, equityShares, equityPrice, affinityScore + lifeEnergy * 0.01);
      setProofOfValue(pov);
      setHistory(prev => {
        const next = [...prev, pov.totalValue];
        return next.length > 24 ? next.slice(-24) : next;
      });
    };

    tick(); // initial
    const iv = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [selectedCert, certs, goldUSD, lifeEnergy]);

  // ── Generate Value (mirrors generateValue() in generator.js) ──────────────
  const handleGenerateValue = useCallback(async () => {
    if (generating) return;
    setGenerating(true);

    // Animate button press
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1,    duration: 160, useNativeDriver: true }),
    ]).start();

    // mirrors: const energy = Math.random() * 1000 + Date.now() % 1000
    const energy = generateLifeEnergy();
    setLifeEnergy(prev => Math.min(prev + energy, 2000));
    setTotalGenerated(prev => prev + 1);

    // Compute new PoV with boosted affinity
    await new Promise(r => setTimeout(r, 400)); // simulate /api/generate-affinity round-trip

    const cert = certs.find(c => c.id === selectedCert);
    if (cert) {
      const meta         = cert.metadata ?? {};
      const goldMg       = meta.gold_mg ?? MIN_GOLD_MG;
      const equityShares = meta.equity_shares ?? 10;
      const equityPrice  = meta.equity_price_usd ?? 50;
      const currentScore = meta.affinity_score ?? 0;
      const newScore     = currentScore + Math.round(energy * 0.1);
      const pov = computeProofOfValue(goldUSD, goldMg, equityShares, equityPrice, newScore);
      setProofOfValue(pov);
      setHistory(prev => {
        const next = [...prev, pov.totalValue];
        return next.length > 24 ? next.slice(-24) : next;
      });
    }

    setGenerating(false);
  }, [generating, btnScale, certs, selectedCert, goldUSD]);

  // ── Mint the proof (mirrors mintCertificate(proof.valueScore)) ─────────────
  const handleMintProof = useCallback(async () => {
    if (!proofOfValue || !user || !selectedCert) return;
    setMinting(true);
    try {
      const supabase = getSupabaseClient();
      const certSrc  = certs.find(c => c.id === selectedCert);
      const meta     = certSrc?.metadata ?? {};
      const affinityGain = Math.round(lifeEnergy * 0.1);
      const newScore     = (meta.affinity_score ?? 0) + affinityGain;

      const { error } = await supabase
        .from('btng_certificates')
        .update({
          equity_grade: proofOfValue.grade,
          metadata: {
            ...meta,
            affinity_score:   newScore,
            life_energy:      (meta.life_energy ?? 0) + lifeEnergy,
            proof_of_value:   proofOfValue.totalValue,
            gold_price_usd:   goldUSD,
            last_affinity:    new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedCert);

      if (error) throw new Error(error.message);
      setLastMinted(proofOfValue.proofHash);
      showAlert(
        'Value Proof Minted!',
        `Score: ${proofOfValue.totalValue.toFixed(4)}\nGrade: ${proofOfValue.grade}\nHash: ${proofOfValue.proofHash.slice(0, 22)}…`
      );
      await loadCerts();
    } catch (e: any) {
      showAlert('Mint Failed', e.message ?? 'Unknown error');
    } finally {
      setMinting(false);
    }
  }, [proofOfValue, user, selectedCert, certs, lifeEnergy, goldUSD, loadCerts, showAlert]);

  const dims = Dimensions.get('window');
  const chartWidth = Math.max(1, dims.width - Spacing.xl * 2 - Spacing.lg * 2 - 2);
  const isLive     = gold.source === 'live';
  const statusColor = isLive ? Colors.success : Colors.warning;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>⚡ LIFE AFFINITY GENERATOR ⚡</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={statusColor} />
            <Text style={[s.topSub, { color: statusColor }]}>
              XAU ${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz · {isLive ? 'LIVE' : 'CACHED'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={s.backBtn} onPress={() => router.push('/btng-gold-certificate' as any)}>
          <MaterialIcons name="workspace-premium" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── AFFINITY METER ─────────────────────────────────────────────────── */}
        <View style={s.meterCard}>
          {/* Orb */}
          <View style={s.orbRow}>
            <Animated.View style={[s.orb, { transform: [{ scale: orbPulse }] }]}>
              <Text style={{ fontSize: 52 }}>⚡</Text>
            </Animated.View>
            <View style={{ flex: 1, gap: Spacing.sm }}>
              <View style={s.energyHeaderRow}>
                <Text style={s.energyTitle}>Life Energy</Text>
                <View style={[s.generatedBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                  <MaterialIcons name="auto-awesome" size={10} color={Colors.primary} />
                  <Text style={s.generatedBadgeText}>{totalGenerated} cycles</Text>
                </View>
              </View>
              <EnergyBar energy={lifeEnergy} maxEnergy={2000} />
              <Text style={s.energySub}>
                Tap "Generate" to produce life force → affinity score boost
              </Text>
            </View>
          </View>

          {/* Generate button — mirrors onClick={generateValue} */}
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              style={[s.generateBtn, generating && { opacity: 0.6 }]}
              onPress={handleGenerateValue}
              disabled={generating}
              activeOpacity={0.85}
            >
              {generating ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <MaterialIcons name="flash-on" size={22} color={Colors.bg} />
              )}
              <Text style={s.generateBtnText}>
                {generating ? 'Computing…' : '🌟 GENERATE MORE LIFE VALUE 🌟'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* ── CERTIFICATE SELECTOR ──────────────────────────────────────────── */}
        <View style={s.certSelectorCard}>
          <View style={s.certSelectorHeader}>
            <MaterialIcons name="workspace-premium" size={16} color={Colors.primary} />
            <Text style={s.certSelectorTitle}>Active Certificate</Text>
            <TouchableOpacity
              style={s.certSelectorRefresh}
              onPress={loadCerts}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {certsLoading
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <MaterialIcons name="refresh" size={16} color={Colors.primary} />
              }
            </TouchableOpacity>
          </View>

          {certs.length === 0 ? (
            <TouchableOpacity
              style={s.noCertRow}
              onPress={() => router.push('/btng-gold-certificate' as any)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add-circle-outline" size={18} color={Colors.textMuted} />
              <Text style={s.noCertText}>No active certificates. Mint one to start generating value.</Text>
              <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.sm }}>
                {certs.map(cert => {
                  const isSelected = selectedCert === cert.id;
                  const gradeCfg   = GRADE_CFG[cert.equity_grade] ?? GRADE_CFG.SEED;
                  const goldMg     = cert.metadata?.gold_mg ?? 0;
                  const score      = cert.metadata?.affinity_score ?? 0;
                  return (
                    <TouchableOpacity
                      key={cert.id}
                      style={[
                        s.certChip,
                        isSelected && { backgroundColor: gradeCfg.bg, borderColor: gradeCfg.color + '66' },
                      ]}
                      onPress={() => setSelectedCert(cert.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 16 }}>{gradeCfg.emoji}</Text>
                      <View style={{ gap: 1 }}>
                        <Text style={[s.certChipGrade, { color: gradeCfg.color }]}>
                          {cert.equity_grade}
                        </Text>
                        <Text style={s.certChipMeta}>{goldMg}mg · {score.toLocaleString()} pts</Text>
                      </View>
                      {isSelected && <View style={[s.certChipDot, { backgroundColor: gradeCfg.color }]} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ── PROOF OF VALUE CARD ───────────────────────────────────────────── */}
        {/* Mirrors: {proofOfValue && (<div className="proof-card gold-border">…</div>)} */}
        {proofOfValue ? (
          <>
            <View style={[s.proofCard, { borderColor: (GRADE_CFG[proofOfValue.grade]?.color ?? Colors.primary) + '55' }]}>
              {/* Header */}
              <View style={s.proofHeader}>
                <View style={{ flex: 1 }}>
                  <View style={s.proofTitleRow}>
                    <Text style={s.proofTitle}>📜 PROOF OF VALUE CERTIFICATE</Text>
                    <View style={[
                      s.gradePill,
                      { backgroundColor: (GRADE_CFG[proofOfValue.grade]?.bg ?? Colors.bgElevated), borderColor: (GRADE_CFG[proofOfValue.grade]?.color ?? Colors.textMuted) + '66' }
                    ]}>
                      <Text style={{ fontSize: 14 }}>{GRADE_CFG[proofOfValue.grade]?.emoji ?? '🌱'}</Text>
                      <Text style={[s.gradePillText, { color: GRADE_CFG[proofOfValue.grade]?.color ?? Colors.textMuted }]}>
                        {proofOfValue.grade}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.proofHash} numberOfLines={1} selectable>
                    {proofOfValue.proofHash}
                  </Text>
                </View>
                {/* Live pulse */}
                <View style={s.proofLiveWrap}>
                  <LiveDot color={statusColor} />
                  <Text style={[s.proofLiveText, { color: statusColor }]}>LIVE</Text>
                </View>
              </View>

              {/* Value metrics — mirrors Metric components */}
              <View style={s.metricsGrid}>
                <Metric
                  label="Gold Equivalent"
                  value={proofOfValue.goldEquiv}
                  unit="USD"
                  color={Colors.primary}
                />
                <Metric
                  label="Equity Value"
                  value={proofOfValue.equityEquiv}
                  unit="USD"
                  color="#3B82F6"
                />
              </View>
              <View style={s.metricsGrid}>
                <Metric
                  label="Life Affinity"
                  value={proofOfValue.affinityBonus}
                  unit="❤️"
                  color="#A855F7"
                />
                <Metric
                  label="TOTAL VALUE"
                  value={proofOfValue.totalValue}
                  unit="USD"
                  highlight
                  color={Colors.success}
                />
              </View>

              {/* Sparkline — mirrors Line chart from react-chartjs-2 */}
              {history.length > 1 && (
                <View style={s.sparklineWrap}>
                  <View style={s.sparklineHeader}>
                    <MaterialIcons name="show-chart" size={13} color={statusColor} />
                    <Text style={[s.sparklineTitle, { color: statusColor }]}>
                      Live Value Stream · {history.length} points
                    </Text>
                    <Text style={s.sparklinePoll}>~{POLL_INTERVAL_MS / 1000}s poll</Text>
                  </View>
                  <SparklineChart
                    data={history}
                    width={chartWidth}
                    height={56}
                    color={statusColor}
                  />
                  <View style={s.sparklineFooter}>
                    <Text style={s.sparklineMin}>
                      Min ${Math.min(...history).toFixed(4)}
                    </Text>
                    <Text style={[s.sparklineMax, { color: statusColor }]}>
                      Max ${Math.max(...history).toFixed(4)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Affinity score bar */}
              <View style={s.affinityScoreRow}>
                <Text style={s.affinityScoreLabel}>Affinity Score</Text>
                <View style={s.affinityScoreTrack}>
                  <View
                    style={[
                      s.affinityScoreFill,
                      {
                        width: `${Math.min((proofOfValue.affinityScore / 1000) * 100, 100)}%` as any,
                        backgroundColor: GRADE_CFG[proofOfValue.grade]?.color ?? Colors.textMuted,
                      },
                    ]}
                  />
                </View>
                <Text style={[s.affinityScoreValue, { color: GRADE_CFG[proofOfValue.grade]?.color ?? Colors.textMuted }]}>
                  {proofOfValue.affinityScore.toLocaleString()}
                </Text>
              </View>

              {/* Timestamp */}
              <Text style={s.proofTimestamp}>
                Updated {new Date(proofOfValue.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · XAU ${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Mint button — mirrors mintCertificate(proof.valueScore) */}
            <TouchableOpacity
              style={[s.mintBtn, (!selectedCert || minting) && s.mintBtnDisabled]}
              onPress={handleMintProof}
              disabled={!selectedCert || minting}
              activeOpacity={0.85}
            >
              {minting
                ? <ActivityIndicator size="small" color={Colors.bg} />
                : <MaterialIcons name="verified" size={18} color={selectedCert ? Colors.bg : Colors.textMuted} />
              }
              <Text style={[s.mintBtnText, !selectedCert && { color: Colors.textMuted }]}>
                {minting ? 'Minting Proof…' : 'Mint Value Proof to Certificate'}
              </Text>
            </TouchableOpacity>

            {lastMinted && (
              <View style={s.lastMintedRow}>
                <MaterialIcons name="check-circle" size={13} color={Colors.success} />
                <Text style={s.lastMintedText} numberOfLines={1}>
                  Last minted: {lastMinted.slice(0, 26)}…
                </Text>
              </View>
            )}
          </>
        ) : (
          /* No proof yet — prompt user to generate */
          <View style={s.noproofCard}>
            <Text style={{ fontSize: 48 }}>📜</Text>
            <Text style={s.noproofTitle}>No Proof Yet</Text>
            <Text style={s.noproofSub}>
              {certs.length === 0
                ? 'Mint a Gold Certificate first, then generate life value to stream proof-of-value data.'
                : 'Tap "Generate" above to compute your first Proof-of-Value certificate.'}
            </Text>
          </View>
        )}

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
        <View style={s.howCard}>
          <Text style={s.howTitle}>How It Works</Text>
          {[
            { step: '1', icon: 'flash-on',      color: Colors.warning,  text: 'Each tap generates crypto-random life energy (≈ lifeEnergy state from generator.js)' },
            { step: '2', icon: 'calculate',      color: '#3B82F6',       text: 'Affinity engine computes goldEquiv + equityEquiv + affinityBonus = totalValue' },
            { step: '3', icon: 'show-chart',     color: statusColor,     text: 'Value streams live every 10s (replaces WebSocket from wss://value-oracle.btng.io)' },
            { step: '4', icon: 'workspace-premium', color: Colors.primary, text: 'Mint the proof to persist affinityScore upgrade on your Gold Certificate NFT' },
          ].map(row => (
            <View key={row.step} style={s.howRow}>
              <View style={[s.howStep, { backgroundColor: row.color + '18', borderColor: row.color + '44' }]}>
                <MaterialIcons name={row.icon as any} size={16} color={row.color} />
              </View>
              <Text style={s.howText}>{row.text}</Text>
            </View>
          ))}
        </View>

        {/* ── TECH REFERENCE ───────────────────────────────────────────────── */}
        <View style={s.techCard}>
          <View style={s.techCardHeader}>
            <MaterialIcons name="code" size={14} color={Colors.textMuted} />
            <Text style={s.techCardTitle}>generator.js → React Native Port</Text>
          </View>
          {[
            { web: 'useAccount()         ', rn: 'useAuth()' },
            { web: 'useContractWrite()   ', rn: 'supabase.from().update()' },
            { web: 'new WebSocket(wss:…) ', rn: 'setInterval() 10s poll' },
            { web: 'Line (react-chartjs-2)', rn: 'SVG Polyline sparkline' },
            { web: '/api/generate-affinity', rn: 'computeProofOfValue() local' },
            { web: 'mintCertificate()    ', rn: 'btng_certificates upsert' },
          ].map((row, i) => (
            <View key={i} style={s.techRow}>
              <Text style={s.techWeb} numberOfLines={1}>{row.web}</Text>
              <MaterialIcons name="arrow-forward" size={11} color={Colors.textMuted} />
              <Text style={s.techRN} numberOfLines={1}>{row.rn}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { alignItems: 'center', flex: 1, gap: 3 },
  topTitle:  { fontSize: 13, fontWeight: FontWeight.heavy, color: Colors.primary, textAlign: 'center', letterSpacing: 0.3, includeFontPadding: false },
  topSub:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  scroll:    { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Affinity Meter card
  meterCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', padding: Spacing.lg, gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 5 },
  orbRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  orb:             { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 18, elevation: 8 },
  energyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  energyTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  energySub:       { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  generatedBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  generatedBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  generateBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  generateBtnText: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false, letterSpacing: 0.3 },

  // Certificate selector
  certSelectorCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  certSelectorHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  certSelectorTitle:   { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  certSelectorRefresh: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  noCertRow:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  noCertText:          { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  certChip:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, position: 'relative' },
  certChipGrade:       { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  certChipMeta:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  certChipDot:         { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 3.5 },

  // Proof of Value card
  proofCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.lg, gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  proofHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  proofTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginBottom: 4 },
  proofTitle:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false, letterSpacing: 0.3 },
  gradePill:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  gradePillText:   { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  proofHash:       { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  proofLiveWrap:   { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  proofLiveText:   { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  metricsGrid:     { flexDirection: 'row', gap: Spacing.sm },

  // Sparkline
  sparklineWrap:   { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm + 2, gap: 4 },
  sparklineHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sparklineTitle:  { flex: 1, fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  sparklinePoll:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  sparklineFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  sparklineMin:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  sparklineMax:    { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Affinity score bar
  affinityScoreRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  affinityScoreLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, width: 72, includeFontPadding: false },
  affinityScoreTrack: { flex: 1, height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  affinityScoreFill:  { height: 6, borderRadius: 3 },
  affinityScoreValue: { fontSize: 10, fontWeight: FontWeight.heavy, width: 52, textAlign: 'right', includeFontPadding: false },

  proofTimestamp: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Mint button
  mintBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.success, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  mintBtnDisabled: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, shadowOpacity: 0, elevation: 0 },
  mintBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  lastMintedRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.success + '44' },
  lastMintedText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, fontFamily: 'monospace', includeFontPadding: false },

  // No proof
  noproofCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', padding: Spacing.xxl, gap: Spacing.md },
  noproofTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  noproofSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  // How it works
  howCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  howTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 4 },
  howRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  howStep:  { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  howText:  { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false, paddingTop: 2 },

  // Tech reference
  techCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 4 },
  techCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  techCardTitle:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  techRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  techWeb:        { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  techRN:         { flex: 1, fontSize: 9, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
});
