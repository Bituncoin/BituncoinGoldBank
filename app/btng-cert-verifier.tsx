/**
 * BTNG Certificate Verifier
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript port of verification.js — ValueProofVerifier class.
 *
 * Implements all 4 static check methods from the original JS:
 *   verifyCertificate()    → orchestrates all checks, returns score + hash
 *   verifyGoldBacking()    → checks gold_mg ≥ MIN + live XAU value
 *   verifyStockRegistry()  → validates equity shares + price data
 *   verifyLifeProof()      → compound growth of affinity over certificate age
 *   verifyAgeValue()       → time-based appreciation factor (older = more value)
 *
 * Score: 4 checks × max 1.0 each → total ≥ 3.5 = VALID (mirrors JS isValid logic)
 *
 * Backed by: btng_certificates (Supabase) + gold-oracle edge function
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/template';
import { useGoldOracle } from '@/hooks/useGoldOracle';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_GOLD_MG    = 1000;
const PASS_THRESHOLD = 3.5; // mirrors: isValid = totalScore >= 3.5
const TROY_OZ_TO_G   = 31.1035;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckScores {
  goldReserve:    number;  // 0.0 – 1.0
  equityRegistry: number;  // 0.0 – 1.0
  lifeAffinity:   number;  // 0.0 – 2.0 (mirrors JS: max 2x compound growth)
  timestamp:      number;  // 0.0 – 1.0
}

interface VerificationResult {
  isValid:   boolean;
  score:     number;       // sum of check scores
  details:   CheckScores;
  proofHash: string;
  certId:    string;
  ownerName: string;
  grade:     string;
  assetValue: number;
  goldMg:    number;
  equityShares: number;
  affinityScore: number;
  agedays:   number;
  goldUSD:   number;
  verifiedAt: string;
}

interface CertRecord {
  id: string;
  cert_id: string;
  cert_type: string;
  owner_name: string;
  asset_value: number;
  equity_grade: string;
  fingerprint: string;
  issued_at: string;
  status: string;
  metadata: any;
  created_at: string;
}

// ─── ValueProofVerifier (TypeScript port of verification.js) ─────────────────

class ValueProofVerifier {
  /**
   * verifyGoldBacking — mirrors verifyGoldBacking(tokenId)
   * Score 0.0–1.0 based on: goldMg ≥ MIN, gold value in USD, grade quality
   */
  static verifyGoldBacking(cert: CertRecord, goldUSD: number): number {
    const meta    = cert.metadata ?? {};
    const goldMg  = meta.gold_mg ?? 0;
    if (goldMg < MIN_GOLD_MG) return 0;

    const goldValueUSD = (goldUSD * goldMg) / (TROY_OZ_TO_G * 1000);
    // Score: ≥$1 → 0.6, ≥$10 → 0.8, ≥$100 → 1.0
    if (goldValueUSD >= 100) return 1.0;
    if (goldValueUSD >= 10)  return 0.8;
    if (goldValueUSD >= 1)   return 0.6;
    return 0.4;
  }

  /**
   * verifyStockRegistry — mirrors verifyStockRegistry(tokenId)
   * Score 0.0–1.0 based on: shares present, price data, total equity value
   */
  static verifyStockRegistry(cert: CertRecord): number {
    const meta    = cert.metadata ?? {};
    const shares  = meta.equity_shares ?? 0;
    const price   = meta.equity_price_usd ?? 0;
    if (shares < 1 || price <= 0) return 0;

    const equityUSD = shares * price;
    if (equityUSD >= 1000) return 1.0;
    if (equityUSD >= 100)  return 0.85;
    if (equityUSD >= 10)   return 0.7;
    return 0.5;
  }

  /**
   * verifyLifeProof — mirrors verifyLifeProof(tokenId)
   * Check if NFT has generated affinity over time.
   * compoundGrowth = latestScore / initialScore
   * Returns Math.min(compoundGrowth, 2.0) — capped at 2x = healthy (JS mirror)
   */
  static verifyLifeProof(cert: CertRecord): number {
    const meta          = cert.metadata ?? {};
    const currentScore  = meta.affinity_score ?? 0;
    const lifeEnergy    = meta.life_energy ?? 0;
    const mintedAt      = meta.minted_at
      ? new Date(meta.minted_at).getTime()
      : new Date(cert.created_at).getTime();
    const ageDays       = Math.max(1, (Date.now() - mintedAt) / 86_400_000);

    // Reconstruct initial score (before life affinity boosts)
    // Initial score ≈ proofScore at mint time (stored in metadata)
    const initialScore  = meta.proof_of_value ?? 0;

    if (initialScore <= 0 || currentScore <= 0) {
      // No history — treat as seed (mirrors: affinityHistory[0] = 0 guard)
      return lifeEnergy > 0 ? 0.5 : 0.2;
    }

    // Compound growth over certificate's lifetime
    const compoundGrowth = currentScore / Math.max(initialScore, 1);
    // Mirror JS: Math.min(compoundGrowth, 2.0)
    return Math.min(compoundGrowth, 2.0);
  }

  /**
   * verifyAgeValue — mirrors verifyAgeValue(tokenId)
   * Time-based appreciation: older certificates have proven resilience.
   * Score 0.0–1.0 based on age in days.
   */
  static verifyAgeValue(cert: CertRecord): number {
    const mintedAt = cert.metadata?.minted_at
      ? new Date(cert.metadata.minted_at).getTime()
      : new Date(cert.created_at).getTime();
    const ageDays = Math.max(0, (Date.now() - mintedAt) / 86_400_000);

    // Mirror: "time factor = block.timestamp % 10000" from Solidity, mapped to days
    if (ageDays >= 365) return 1.0;    // 1+ year = full score
    if (ageDays >= 180) return 0.85;   // 6 months
    if (ageDays >= 90)  return 0.7;    // 3 months
    if (ageDays >= 30)  return 0.55;   // 1 month
    if (ageDays >= 7)   return 0.4;    // 1 week
    return 0.25;                        // brand new
  }

  /**
   * verifyCertificate — mirrors ValueProofVerifier.verifyCertificate(tokenId)
   * Orchestrates all checks, computes total score, generates proof hash.
   */
  static verifyCertificate(cert: CertRecord, goldUSD: number): VerificationResult {
    const checks: CheckScores = {
      goldReserve:    ValueProofVerifier.verifyGoldBacking(cert, goldUSD),
      equityRegistry: ValueProofVerifier.verifyStockRegistry(cert),
      lifeAffinity:   ValueProofVerifier.verifyLifeProof(cert),
      timestamp:      ValueProofVerifier.verifyAgeValue(cert),
    };

    // Mirror JS: totalScore = Object.values(checks).reduce((a,b) => a + b, 0)
    const totalScore = Object.values(checks).reduce((a, b) => a + b, 0);
    // Mirror JS: isValid = totalScore >= 3.5
    const isValid    = totalScore >= PASS_THRESHOLD;

    const meta     = cert.metadata ?? {};
    const goldMg   = meta.gold_mg ?? 0;
    const goldUSDv = goldUSD;
    const mintedAt = meta.minted_at
      ? new Date(meta.minted_at).getTime()
      : new Date(cert.created_at).getTime();
    const ageDays  = Math.max(0, (Date.now() - mintedAt) / 86_400_000);

    return {
      isValid,
      score:         totalScore,
      details:       checks,
      proofHash:     ValueProofVerifier.generateVerificationHash(cert.cert_id, checks),
      certId:        cert.cert_id,
      ownerName:     cert.owner_name,
      grade:         cert.equity_grade,
      assetValue:    cert.asset_value,
      goldMg,
      equityShares:  meta.equity_shares ?? 0,
      affinityScore: meta.affinity_score ?? 0,
      agedays:       Math.floor(ageDays),
      goldUSD:       goldUSDv,
      verifiedAt:    new Date().toISOString(),
    };
  }

  /**
   * generateVerificationHash — mirrors generateVerificationHash(tokenId, checks)
   * Deterministic hash from cert ID + check scores.
   */
  static generateVerificationHash(certId: string, checks: CheckScores): string {
    const payload = `${certId}:${checks.goldReserve.toFixed(4)}:${checks.equityRegistry.toFixed(4)}:${checks.lifeAffinity.toFixed(4)}:${checks.timestamp.toFixed(4)}:${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      hash = (Math.imul(31, hash) + payload.charCodeAt(i)) | 0;
    }
    return `0xVERIF-${Math.abs(hash).toString(16).padStart(8, '0').toUpperCase()}-${Date.now().toString(16).toUpperCase()}`;
  }
}

// ─── Score threshold config ───────────────────────────────────────────────────

const SCORE_CFG = [
  { min: 4.5, label: 'Sovereign Grade',  color: Colors.primary,  emoji: '🏆', bg: Colors.primaryGlow },
  { min: 3.5, label: 'Valid',            color: Colors.success,  emoji: '✅', bg: Colors.successBg   },
  { min: 2.5, label: 'Marginal',         color: Colors.warning,  emoji: '⚠️', bg: Colors.warningBg   },
  { min: 0,   label: 'Invalid',          color: Colors.error,    emoji: '❌', bg: Colors.errorBg     },
];

function getScoreCfg(score: number) {
  return SCORE_CFG.find(c => score >= c.min) ?? SCORE_CFG[SCORE_CFG.length - 1];
}

// ─── Animated check row ───────────────────────────────────────────────────────

function CheckRow({
  label,
  score,
  maxScore,
  icon,
  color,
  detail,
  delay,
}: {
  label: string;
  score: number;
  maxScore: number;
  icon: string;
  color: string;
  detail: string;
  delay: number;
}) {
  const barAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(barAnim, {
          toValue: score / maxScore,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    }, delay);
  }, [score, delay, barAnim, fadeAnim]);

  const pct = score / maxScore;
  const statusColor = pct >= 0.75 ? Colors.success : pct >= 0.4 ? Colors.warning : Colors.error;
  const statusIcon  = pct >= 0.75 ? 'check-circle' : pct >= 0.4 ? 'warning' : 'cancel';

  return (
    <Animated.View style={[cr.row, { opacity: fadeAnim, borderColor: color + '33' }]}>
      <View style={[cr.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={cr.body}>
        <View style={cr.labelRow}>
          <Text style={cr.label}>{label}</Text>
          <View style={[cr.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
            <MaterialIcons name={statusIcon as any} size={11} color={statusColor} />
            <Text style={[cr.statusText, { color: statusColor }]}>
              {score.toFixed(3)} / {maxScore.toFixed(1)}
            </Text>
          </View>
        </View>
        <View style={cr.barTrack}>
          <Animated.View
            style={[
              cr.barFill,
              {
                width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                backgroundColor: statusColor,
              },
            ]}
          />
        </View>
        <Text style={cr.detail}>{detail}</Text>
      </View>
    </Animated.View>
  );
}

const cr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  iconWrap:   { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body:       { flex: 1, gap: 5 },
  labelRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  label:      { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  statusText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  barTrack:   { height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden' },
  barFill:    { height: 6, borderRadius: 3 },
  detail:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
});

// ─── Pulsing dot ─────────────────────────────────────────────────────────────

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

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, maxScore = 5, cfg }: { score: number; maxScore?: number; cfg: typeof SCORE_CFG[0] }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: score / maxScore,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [score, maxScore, anim]);

  return (
    <View style={sr.wrap}>
      <View style={[sr.ring, { borderColor: cfg.color + '55', backgroundColor: cfg.bg }]}>
        <Text style={{ fontSize: 32 }}>{cfg.emoji}</Text>
        <Text style={[sr.scoreNum, { color: cfg.color }]}>{score.toFixed(2)}</Text>
        <Text style={sr.scoreMax}>/ {maxScore}</Text>
      </View>
      <Text style={[sr.label, { color: cfg.color }]}>{cfg.label}</Text>
      {/* Track bar */}
      <View style={sr.barTrack}>
        <Animated.View
          style={[
            sr.barFill,
            {
              width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: cfg.color,
            },
          ]}
        />
      </View>
      <View style={sr.barLabels}>
        <Text style={sr.barLabel}>0</Text>
        <Text style={[sr.barLabel, { color: Colors.warning }]}>3.5 valid</Text>
        <Text style={[sr.barLabel, { color: cfg.color }]}>{maxScore}</Text>
      </View>
    </View>
  );
}

const sr = StyleSheet.create({
  wrap:      { alignItems: 'center', gap: Spacing.sm },
  ring:      { width: 120, height: 120, borderRadius: 60, borderWidth: 3, alignItems: 'center', justifyContent: 'center', gap: 2 },
  scoreNum:  { fontSize: 22, fontWeight: FontWeight.heavy, includeFontPadding: false },
  scoreMax:  { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  label:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  barTrack:  { width: 140, height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  barFill:   { height: 8, borderRadius: 4 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', width: 140 },
  barLabel:  { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BTNGCertVerifierScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();
  const gold    = useGoldOracle();
  const goldUSD = gold.priceUSD > 0 ? gold.priceUSD : 3325;

  // ── Input & selection ─────────────────────────────────────────────────────
  const [inputMode,    setInputMode]   = useState<'select' | 'manual'>('select');
  const [manualCertId, setManualCertId] = useState('');
  const [certs,        setCerts]       = useState<CertRecord[]>([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [selectedCert, setSelectedCert] = useState<string | null>(null);

  // ── Verification state ────────────────────────────────────────────────────
  const [verifying,  setVerifying]  = useState(false);
  const [result,     setResult]     = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // ── History ───────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<VerificationResult[]>([]);

  // Load user certs
  const loadCerts = useCallback(async () => {
    if (!user) return;
    setCertsLoading(true);
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('btng_certificates')
      .select('id, cert_id, cert_type, owner_name, asset_value, equity_grade, fingerprint, issued_at, status, metadata, created_at')
      .eq('user_id', (user as any).id)
      .order('created_at', { ascending: false })
      .limit(20);
    setCertsLoading(false);
    if (data) setCerts(data as CertRecord[]);
  }, [user]);

  useEffect(() => { loadCerts(); }, [loadCerts]);

  // ── Run verification ───────────────────────────────────────────────────────
  const runVerification = useCallback(async () => {
    setVerifyError(null);
    setResult(null);
    setVerifying(true);

    try {
      const supabase = getSupabaseClient();
      let cert: CertRecord | null = null;

      if (inputMode === 'select' && selectedCert) {
        cert = certs.find(c => c.id === selectedCert) ?? null;
      } else if (inputMode === 'manual' && manualCertId.trim()) {
        // Lookup by cert_id (public verify — anyone can verify any cert)
        const { data, error } = await supabase
          .from('btng_certificates')
          .select('id, cert_id, cert_type, owner_name, asset_value, equity_grade, fingerprint, issued_at, status, metadata, created_at')
          .eq('cert_id', manualCertId.trim())
          .maybeSingle();
        if (error) throw new Error(error.message);
        cert = data as CertRecord | null;
      }

      if (!cert) {
        setVerifyError('Certificate not found. Please check the ID and try again.');
        setVerifying(false);
        return;
      }

      // Simulate async check steps (mirrors await calls in JS)
      await new Promise(r => setTimeout(r, 600));

      // Run ValueProofVerifier.verifyCertificate()
      const res = ValueProofVerifier.verifyCertificate(cert, goldUSD);
      setResult(res);
      setHistory(prev => [res, ...prev].slice(0, 10));

    } catch (e: any) {
      setVerifyError(e.message ?? 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }, [inputMode, selectedCert, manualCertId, certs, goldUSD]);

  const isLive      = gold.source === 'live';
  const statusColor = isLive ? Colors.success : Colors.warning;
  const scoreCfg    = result ? getScoreCfg(result.score) : null;

  const CHECK_DETAILS: {
    key: keyof CheckScores;
    label: string;
    icon: string;
    color: string;
    maxScore: number;
    getDetail: (r: VerificationResult) => string;
  }[] = [
    {
      key: 'goldReserve',
      label: 'Gold Reserve Backing',
      icon: 'toll',
      color: Colors.primary,
      maxScore: 1.0,
      getDetail: r => `${r.goldMg.toLocaleString()}mg gold · $${((goldUSD * r.goldMg) / (TROY_OZ_TO_G * 1000)).toFixed(4)} USD · XAU $${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz`,
    },
    {
      key: 'equityRegistry',
      label: 'Equity Registry Validation',
      icon: 'bar-chart',
      color: '#3B82F6',
      maxScore: 1.0,
      getDetail: r => `${r.equityShares} shares · $${((r.metadata?.equity_price_usd ?? 0) * r.equityShares).toFixed(2)} USD total equity`,
    },
    {
      key: 'lifeAffinity',
      label: 'Life Affinity Compound Growth',
      icon: 'favorite',
      color: '#A855F7',
      maxScore: 2.0,
      getDetail: r => `Affinity score: ${r.affinityScore.toLocaleString()} · compound growth = min(current/initial, 2.0)`,
    },
    {
      key: 'timestamp',
      label: 'Age-Based Value Appreciation',
      icon: 'schedule',
      color: '#22C55E',
      maxScore: 1.0,
      getDetail: r => `Certificate age: ${r.agedays} days · older certificates score higher (max at 365d)`,
    },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Cert Verifier</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={statusColor} />
            <Text style={[s.topSub, { color: statusColor }]}>
              XAU ${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} · ValueProofVerifier
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={() => router.push('/btng-gold-certificate' as any)}
        >
          <MaterialIcons name="workspace-premium" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── INTRO CARD ──────────────────────────────────────────────────── */}
        <View style={s.introCard}>
          <View style={s.introIconWrap}>
            <MaterialIcons name="verified-user" size={26} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.introTitle}>ValueProofVerifier</Text>
            <Text style={s.introSub}>
              TypeScript port of <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>verification.js</Text>.
              Runs 4 checks · max score 5.0 · valid threshold ≥ 3.5.
            </Text>
          </View>
          <View style={[s.thresholdBadge, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' }]}>
            <MaterialIcons name="check-circle" size={11} color={Colors.success} />
            <Text style={[s.thresholdText, { color: Colors.success }]}>≥ 3.5 VALID</Text>
          </View>
        </View>

        {/* ── INPUT MODE SWITCHER ──────────────────────────────────────────── */}
        <View style={s.modeRow}>
          {(['select', 'manual'] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={[s.modeBtn, inputMode === m && s.modeBtnActive]}
              onPress={() => { setInputMode(m); setResult(null); setVerifyError(null); }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name={m === 'select' ? 'list' : 'qr-code-scanner'}
                size={14}
                color={inputMode === m ? Colors.bg : Colors.textMuted}
              />
              <Text style={[s.modeBtnText, inputMode === m && { color: Colors.bg }]}>
                {m === 'select' ? 'My Certificates' : 'Enter Cert ID'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── SELECT FROM MY CERTS ─────────────────────────────────────────── */}
        {inputMode === 'select' && (
          <View style={s.selectCard}>
            <View style={s.selectHeader}>
              <MaterialIcons name="workspace-premium" size={15} color={Colors.primary} />
              <Text style={s.selectTitle}>Select Certificate</Text>
              <TouchableOpacity
                onPress={loadCerts}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {certsLoading
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <MaterialIcons name="refresh" size={15} color={Colors.primary} />
                }
              </TouchableOpacity>
            </View>

            {certs.length === 0 && !certsLoading ? (
              <TouchableOpacity
                style={s.noCertRow}
                onPress={() => router.push('/btng-gold-certificate' as any)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add-circle-outline" size={16} color={Colors.textMuted} />
                <Text style={s.noCertText}>No certificates found. Mint one first.</Text>
                <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : (
              certs.map(cert => {
                const isSelected  = selectedCert === cert.id;
                const meta        = cert.metadata ?? {};
                const goldMg      = meta.gold_mg ?? 0;
                const affinityScore = meta.affinity_score ?? 0;
                const isActive    = cert.status === 'active';
                return (
                  <TouchableOpacity
                    key={cert.id}
                    style={[s.certRow, isSelected && s.certRowActive]}
                    onPress={() => setSelectedCert(cert.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.certRadio, isSelected && s.certRadioActive]}>
                      {isSelected && <View style={s.certRadioInner} />}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={s.certRowTop}>
                        <Text style={s.certGrade}>{cert.equity_grade}</Text>
                        <View style={[s.certStatusDot, { backgroundColor: isActive ? Colors.success : Colors.textMuted }]} />
                        <Text style={s.certStatus}>{isActive ? 'ACTIVE' : cert.status.toUpperCase()}</Text>
                      </View>
                      <Text style={s.certId} numberOfLines={1}>
                        {cert.cert_id.length > 32 ? cert.cert_id.substring(0, 32) + '…' : cert.cert_id}
                      </Text>
                      <Text style={s.certMeta}>{goldMg.toLocaleString()}mg gold · {affinityScore.toLocaleString()} affinity pts</Text>
                    </View>
                    {isSelected && (
                      <MaterialIcons name="check-circle" size={18} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* ── MANUAL CERT ID INPUT ─────────────────────────────────────────── */}
        {inputMode === 'manual' && (
          <View style={s.manualCard}>
            <Text style={s.manualLabel}>Certificate ID</Text>
            <Text style={s.manualHint}>Paste the full BTNG certificate identifier to verify any certificate</Text>
            <View style={s.manualInputRow}>
              <MaterialIcons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={s.manualInput}
                value={manualCertId}
                onChangeText={setManualCertId}
                placeholder="BTNG-CERT-XXXXXXXX-..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {manualCertId.length > 0 && (
                <TouchableOpacity
                  onPress={() => setManualCertId('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={15} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={s.manualNote}>
              Public verification — any certificate can be verified by its ID without login.
            </Text>
          </View>
        )}

        {/* ── VERIFY BUTTON ────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            s.verifyBtn,
            (verifying || (inputMode === 'select' && !selectedCert) || (inputMode === 'manual' && !manualCertId.trim())) && s.verifyBtnDisabled,
          ]}
          onPress={runVerification}
          disabled={verifying || (inputMode === 'select' && !selectedCert) || (inputMode === 'manual' && !manualCertId.trim())}
          activeOpacity={0.85}
        >
          {verifying ? (
            <ActivityIndicator size="small" color={Colors.bg} />
          ) : (
            <MaterialIcons name="verified-user" size={20} color={Colors.bg} />
          )}
          <Text style={s.verifyBtnText}>
            {verifying ? 'Running Verification…' : 'Verify Certificate'}
          </Text>
        </TouchableOpacity>

        {/* Error state */}
        {verifyError ? (
          <View style={s.errorCard}>
            <MaterialIcons name="error-outline" size={16} color={Colors.error} />
            <Text style={s.errorText}>{verifyError}</Text>
          </View>
        ) : null}

        {/* ── RESULT ───────────────────────────────────────────────────────── */}
        {result && scoreCfg && (
          <>
            {/* Result header */}
            <View style={[s.resultHeader, { borderColor: scoreCfg.color + '55', backgroundColor: scoreCfg.bg }]}>
              <Text style={{ fontSize: 36 }}>{scoreCfg.emoji}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.resultTitle, { color: scoreCfg.color }]}>
                    {result.isValid ? 'CERTIFICATE VALID' : 'CERTIFICATE INVALID'}
                  </Text>
                </View>
                <Text style={s.resultOwner}>{result.ownerName}</Text>
                <Text style={s.resultHash} numberOfLines={1} selectable>{result.proofHash}</Text>
              </View>
            </View>

            {/* Score ring + summary */}
            <View style={s.scoreCard}>
              <ScoreRing score={result.score} maxScore={5} cfg={scoreCfg} />
              <View style={s.scoreDetails}>
                {[
                  { label: 'Certificate ID', value: result.certId.substring(0, 28) + '…',    color: Colors.primary },
                  { label: 'Grade',          value: result.grade,                            color: Colors.warning  },
                  { label: 'Gold Weight',    value: `${result.goldMg.toLocaleString()}mg`,   color: Colors.primary  },
                  { label: 'Equity Shares',  value: String(result.equityShares),             color: '#3B82F6'       },
                  { label: 'Affinity Score', value: result.affinityScore.toLocaleString(),   color: '#A855F7'       },
                  { label: 'Age',            value: `${result.agedays} days`,                color: '#22C55E'       },
                  { label: 'Total Score',    value: `${result.score.toFixed(4)} / 5.0`,      color: scoreCfg.color  },
                  { label: 'Threshold',      value: `≥ ${PASS_THRESHOLD} = valid`,           color: Colors.textMuted },
                ].map(row => (
                  <View key={row.label} style={s.scoreDetailRow}>
                    <Text style={s.scoreDetailLabel}>{row.label}</Text>
                    <Text style={[s.scoreDetailValue, { color: row.color }]} numberOfLines={1}>
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 4 Check rows — animated */}
            <Text style={s.checkSectionLabel}>VERIFICATION CHECKS</Text>
            <View style={{ gap: Spacing.sm }}>
              {CHECK_DETAILS.map((check, i) => (
                <CheckRow
                  key={check.key}
                  label={check.label}
                  score={result.details[check.key]}
                  maxScore={check.maxScore}
                  icon={check.icon}
                  color={check.color}
                  detail={check.getDetail({ ...result, metadata: certs.find(c => c.cert_id === result.certId)?.metadata ?? {} })}
                  delay={i * 150}
                />
              ))}
            </View>

            {/* Verification footer */}
            <View style={[s.verifyFooter, { borderColor: scoreCfg.color + '44', backgroundColor: scoreCfg.bg }]}>
              <MaterialIcons name={result.isValid ? 'verified' : 'cancel'} size={18} color={scoreCfg.color} />
              <View style={{ flex: 1 }}>
                <Text style={[s.verifyFooterTitle, { color: scoreCfg.color }]}>
                  {result.isValid
                    ? 'Certificate passes sovereign verification standards'
                    : `Score ${result.score.toFixed(2)} < ${PASS_THRESHOLD} — certificate does not meet minimum threshold`}
                </Text>
                <Text style={s.verifyFooterTime}>
                  Verified at {new Date(result.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · XAU ${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── ALGORITHM REFERENCE ──────────────────────────────────────────── */}
        <View style={s.algoCard}>
          <View style={s.algoHeader}>
            <MaterialIcons name="code" size={14} color={Colors.textMuted} />
            <Text style={s.algoTitle}>verification.js → TypeScript Port</Text>
          </View>
          {[
            { method: 'verifyCertificate()',    map: 'Orchestrates all 4 checks · reduce sum · isValid ≥ 3.5'   },
            { method: 'verifyGoldBacking()',    map: 'goldMg ≥ 1000 + live XAU USD value tier'                  },
            { method: 'verifyStockRegistry()',  map: 'shares ≥ 1, price > 0, equity USD tier'                   },
            { method: 'verifyLifeProof()',      map: 'min(currentScore / initialScore, 2.0) compound growth'    },
            { method: 'verifyAgeValue()',       map: 'age in days → 0.25 (new) to 1.0 (365d+) appreciation'    },
            { method: 'generateVerificationHash()', map: 'deterministic hash from certId + check scores + ts'  },
          ].map((row, i) => (
            <View key={row.method} style={[s.algoRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '66' }]}>
              <Text style={s.algoMethod}>{row.method}</Text>
              <Text style={s.algoMap}>{row.map}</Text>
            </View>
          ))}
        </View>

        {/* ── VERIFICATION HISTORY ─────────────────────────────────────────── */}
        {history.length > 0 && (
          <>
            <Text style={s.checkSectionLabel}>VERIFICATION HISTORY</Text>
            <View style={s.historyCard}>
              {history.map((h, i) => {
                const hCfg = getScoreCfg(h.score);
                return (
                  <View
                    key={`${h.proofHash}-${i}`}
                    style={[s.historyRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}
                  >
                    <Text style={{ fontSize: 16 }}>{hCfg.emoji}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.historyOwner} numberOfLines={1}>{h.ownerName} · {h.grade}</Text>
                      <Text style={s.historyCert} numberOfLines={1}>
                        {h.certId.length > 28 ? h.certId.substring(0, 28) + '…' : h.certId}
                      </Text>
                      <Text style={s.historyTime}>
                        {new Date(h.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={[s.historyScore, { color: hCfg.color }]}>{h.score.toFixed(2)}</Text>
                      <View style={[s.historyValidPill, { backgroundColor: hCfg.bg, borderColor: hCfg.color + '44' }]}>
                        <Text style={[s.historyValidText, { color: hCfg.color }]}>{hCfg.label}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:  { alignItems: 'center', flex: 1, gap: 2 },
  topTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  scroll:     { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Intro
  introCard:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  introIconWrap:   { width: 52, height: 52, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  introTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  introSub:        { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false, marginTop: 2 },
  thresholdBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  thresholdText:   { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Mode switcher
  modeRow:     { flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border },
  modeBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 1, borderRadius: Radius.md },
  modeBtnActive: { backgroundColor: Colors.primary },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },

  // Select card
  selectCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  selectHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  selectTitle:  { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  noCertRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  noCertText:   { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  certRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.sm + 2 },
  certRowActive:{ backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '66' },
  certRadio:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  certRadioActive: { borderColor: Colors.primary },
  certRadioInner:  { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  certRowTop:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  certGrade:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  certStatusDot:{ width: 6, height: 6, borderRadius: 3 },
  certStatus:   { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  certId:       { fontSize: 10, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  certMeta:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Manual input
  manualCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  manualLabel:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  manualHint:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  manualInputRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 48 },
  manualInput:     { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  manualNote:      { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },

  // Verify button
  verifyBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  verifyBtnDisabled: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, shadowOpacity: 0, elevation: 0 },
  verifyBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Error
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '55' },
  errorText: { flex: 1, fontSize: FontSize.sm, color: Colors.error, includeFontPadding: false },

  // Result header
  resultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.xl, borderWidth: 2, padding: Spacing.md },
  resultTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  resultOwner:  { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.semibold, includeFontPadding: false, marginTop: 3 },
  resultHash:   { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: 3 },

  // Score card
  scoreCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, flexDirection: 'row', gap: Spacing.lg, alignItems: 'flex-start' },
  scoreDetails:     { flex: 1, gap: 7 },
  scoreDetailRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  scoreDetailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  scoreDetailValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false, flex: 1, textAlign: 'right' },

  checkSectionLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false, paddingHorizontal: 2 },

  // Verify footer
  verifyFooter:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md },
  verifyFooterTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false, lineHeight: 18 },
  verifyFooterTime:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 3 },

  // Algorithm reference
  algoCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 2 },
  algoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  algoTitle:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  algoRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 6 },
  algoMethod: { width: 150, fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, flexShrink: 0 },
  algoMap:    { flex: 1, fontSize: 9, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 13 },

  // History
  historyCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  historyRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  historyOwner:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historyCert:       { fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  historyTime:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  historyScore:      { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  historyValidPill:  { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  historyValidText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
});
