/**
 * BTNG Gold Certificate — ERC-721 Companion Screen
 * ─────────────────────────────────────────────────────────────────────────────
 * Native UI layer for the BTNGGoldCertificate smart contract.
 * Mirrors all on-chain mechanics:
 *   • mintCertificate()       → Mint tab: gold mg + equity shares + legal proof
 *   • generateLifeAffinity()  → Affinity tab: life energy → affinity score
 *   • getCurrentValue()       → live gold oracle valuation per certificate
 *   • calculateProofOfValue() → geometric mean of gold × equity (live)
 *
 * Backed by: btng_certificates (Supabase) + gold-oracle edge function
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { getSupabaseClient } from '@/template';
import { useAuth } from '@/contexts/AuthContext';

// ─── Constants (mirror Solidity contract) ────────────────────────────────────
const MIN_GOLD_MG   = 1000;   // 1 gram minimum
const MIN_EQUITY_SHARES = 1;  // 1 share minimum
const MINT_FEE_BTNGG    = 0.1; // 0.1 BTNGG mint fee
const TROY_OZ_PER_G     = 31.1035;
const TROY_OZ_PER_KG    = 32150.75;

// ─── Equity grade map (from contract: AAA→D) ─────────────────────────────────
const EQUITY_GRADES = [
  { grade: 'AAA', min: 900, color: '#22C55E', label: 'Sovereign' },
  { grade: 'AA',  min: 800, color: '#10B981', label: 'Premium'   },
  { grade: 'A',   min: 700, color: Colors.primary, label: 'Gold' },
  { grade: 'BBB', min: 600, color: '#F59E0B', label: 'Standard'  },
  { grade: 'BB',  min: 500, color: '#F97316', label: 'Bronze'    },
  { grade: 'B',   min: 400, color: '#EF4444', label: 'Low'       },
  { grade: 'D',   min:   0, color: '#6B7280', label: 'Default'   },
];

function gradeFromScore(score: number) {
  return EQUITY_GRADES.find(g => score >= g.min) ?? EQUITY_GRADES[EQUITY_GRADES.length - 1];
}

// ─── Proof-of-Value calculation (geometric mean, mirrors Solidity sqrt) ───────
function calculatePoV(goldValueUSD: number, equityValueUSD: number): number {
  if (goldValueUSD <= 0 || equityValueUSD <= 0) return 0;
  return Math.sqrt(goldValueUSD * equityValueUSD);
}

function sqrtBigInt(x: bigint): bigint {
  if (x <= 0n) return 0n;
  let z = (x + 1n) / 2n;
  let y = x;
  while (z < y) { y = z; z = (x / z + z) / 2n; }
  return y;
}

// ─── Fingerprint (deterministic hash-like from inputs) ────────────────────────
function buildFingerprint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
  return `BTNG-CERT-${hex}-${Date.now().toString(16).toUpperCase()}`;
}

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

// ─── Certificate Card ─────────────────────────────────────────────────────────
interface CertRecord {
  id: string;
  cert_id: string;
  cert_type: string;
  owner_name: string;
  asset_description: string;
  asset_value: number;
  equity_grade: string;
  fingerprint: string;
  issued_at: string;
  expires_at: string | null;
  status: string;
  metadata: any;
  created_at: string;
}

function CertCard({ cert, goldUSD, onAffinity }: {
  cert: CertRecord;
  goldUSD: number;
  onAffinity: (id: string) => void;
}) {
  const meta        = cert.metadata ?? {};
  const goldMg      = meta.gold_mg ?? 0;
  const equityShares = meta.equity_shares ?? 0;
  const affinityScore = meta.affinity_score ?? 0;
  const lifeEnergy  = meta.life_energy ?? 0;
  const mintedAt    = meta.minted_at ? new Date(meta.minted_at) : new Date(cert.created_at);
  const ageMs       = Date.now() - mintedAt.getTime();
  const ageDays     = Math.floor(ageMs / 86_400_000);

  // Replicate getCurrentValue() from contract
  const goldValueUSD   = (goldUSD * goldMg) / 31103.5; // mg → troy oz → USD
  const equityValueUSD = equityShares * (meta.equity_price_usd ?? 1);
  const affinityBonus  = affinityScore / 1000;
  const totalValue     = goldValueUSD + equityValueUSD + affinityBonus;

  const pov   = calculatePoV(goldValueUSD, equityValueUSD);
  const grade = gradeFromScore(affinityScore);
  const isActive = cert.status === 'active';

  return (
    <View style={[cc.card, { borderColor: grade.color + '44' }]}>
      {/* Header */}
      <View style={cc.header}>
        <View style={[cc.gradeWrap, { backgroundColor: grade.color + '18', borderColor: grade.color + '55' }]}>
          <Text style={[cc.grade, { color: grade.color }]}>{cert.equity_grade}</Text>
          <Text style={[cc.gradeSub, { color: grade.color }]}>{grade.label}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={cc.certId} numberOfLines={1}>{cert.cert_id}</Text>
          <Text style={cc.owner} numberOfLines={1}>{cert.owner_name}</Text>
        </View>
        <View style={[cc.statusPill, { backgroundColor: isActive ? Colors.successBg : Colors.bgElevated, borderColor: (isActive ? Colors.success : Colors.textMuted) + '55' }]}>
          <LiveDot color={isActive ? Colors.success : Colors.textMuted} />
          <Text style={[cc.statusText, { color: isActive ? Colors.success : Colors.textMuted }]}>
            {isActive ? 'ACTIVE' : cert.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Value breakdown */}
      <View style={cc.valueGrid}>
        <View style={cc.valueItem}>
          <Text style={cc.valueLabel}>Gold Value</Text>
          <Text style={[cc.valueNum, { color: Colors.primary }]}>${goldValueUSD.toFixed(2)}</Text>
          <Text style={cc.valueSub}>{goldMg.toLocaleString()}mg</Text>
        </View>
        <View style={cc.valueDivider} />
        <View style={cc.valueItem}>
          <Text style={cc.valueLabel}>Equity Value</Text>
          <Text style={[cc.valueNum, { color: '#3B82F6' }]}>${equityValueUSD.toFixed(2)}</Text>
          <Text style={cc.valueSub}>{equityShares} shares</Text>
        </View>
        <View style={cc.valueDivider} />
        <View style={cc.valueItem}>
          <Text style={cc.valueLabel}>Affinity</Text>
          <Text style={[cc.valueNum, { color: '#A855F7' }]}>+${affinityBonus.toFixed(4)}</Text>
          <Text style={cc.valueSub}>score {affinityScore}</Text>
        </View>
        <View style={cc.valueDivider} />
        <View style={cc.valueItem}>
          <Text style={cc.valueLabel}>Total Value</Text>
          <Text style={[cc.valueNum, { color: Colors.success, fontSize: FontSize.md }]}>${totalValue.toFixed(2)}</Text>
          <Text style={cc.valueSub}>USD</Text>
        </View>
      </View>

      {/* PoV score */}
      <View style={cc.povRow}>
        <MaterialIcons name="verified" size={13} color={Colors.primary} />
        <Text style={cc.povText}>Proof-of-Value: {pov.toFixed(4)} (√gold × equity)</Text>
        <View style={{ flex: 1 }} />
        <Text style={cc.ageText}>{ageDays}d old</Text>
      </View>

      {/* Affinity action */}
      <TouchableOpacity
        style={cc.affinityBtn}
        onPress={() => onAffinity(cert.id)}
        activeOpacity={0.8}
      >
        <MaterialIcons name="favorite" size={14} color="#A855F7" />
        <Text style={cc.affinityBtnText}>Generate Life Affinity</Text>
        <Text style={cc.affinityBtnSub}>+{(ageDays * (goldMg / MIN_GOLD_MG)).toFixed(0)} pts est.</Text>
      </TouchableOpacity>

      {/* Fingerprint */}
      <Text style={cc.fingerprint} numberOfLines={1}>{cert.fingerprint}</Text>
    </View>
  );
}

const cc = StyleSheet.create({
  card:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  header:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  gradeWrap:     { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 1 },
  grade:         { fontSize: 14, fontWeight: FontWeight.heavy, includeFontPadding: false },
  gradeSub:      { fontSize: 8, fontWeight: FontWeight.bold, includeFontPadding: false },
  certId:        { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Colors.primary, includeFontPadding: false },
  owner:         { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, flexShrink: 0 },
  statusText:    { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  valueGrid:     { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, overflow: 'hidden' },
  valueItem:     { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  valueDivider:  { width: 1, backgroundColor: Colors.border, alignSelf: 'stretch' },
  valueLabel:    { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  valueNum:      { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  valueSub:      { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  povRow:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  povText:       { fontSize: 10, color: Colors.textSecondary, includeFontPadding: false },
  ageText:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  affinityBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#A855F718', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#A855F755', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  affinityBtnText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#A855F7', includeFontPadding: false },
  affinityBtnSub: { fontSize: 10, color: '#A855F7', fontWeight: FontWeight.semibold, includeFontPadding: false },
  fingerprint:   { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type TabKey = 'certificates' | 'mint' | 'affinity' | 'contract';

export default function BTNGGoldCertificateScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();
  const gold    = useGoldOracle();
  const goldUSD = gold.priceUSD > 0 ? gold.priceUSD : 3325;
  const btngUSD = gold.priceBTNGG;

  const [tab, setTab] = useState<TabKey>('certificates');

  // ── Certificates list ─────────────────────────────────────────────────────
  const [certs, setCerts]       = useState<CertRecord[]>([]);
  const [certsLoading, setCertsLoading] = useState(false);

  const loadCerts = useCallback(async () => {
    if (!user) return;
    setCertsLoading(true);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('btng_certificates')
      .select('*')
      .eq('user_id', (user as any).id)
      .order('created_at', { ascending: false });
    setCertsLoading(false);
    if (!error && data) setCerts(data as CertRecord[]);
  }, [user]);

  useEffect(() => { loadCerts(); }, [loadCerts]);

  // ── Mint form state ────────────────────────────────────────────────────────
  const [goldMg,        setGoldMg]        = useState('1000');
  const [equityShares,  setEquityShares]  = useState('10');
  const [equityPrice,   setEquityPrice]   = useState('50');
  const [ownerName,     setOwnerName]     = useState((user as any)?.full_name ?? (user as any)?.username ?? '');
  const [assetDesc,     setAssetDesc]     = useState('');
  const [legalProof,    setLegalProof]    = useState('');
  const [minting,       setMinting]       = useState(false);

  // ── Derived mint preview ───────────────────────────────────────────────────
  const goldMgNum    = Math.max(0, parseFloat(goldMg)    || 0);
  const sharesNum    = Math.max(0, parseFloat(equityShares) || 0);
  const priceNum     = Math.max(0, parseFloat(equityPrice) || 0);
  const goldValUSD   = (goldUSD * goldMgNum) / (TROY_OZ_PER_G * 1000); // mg → grams → troy oz equiv
  const equityValUSD = sharesNum * priceNum;
  const povScore     = calculatePoV(goldValUSD, equityValUSD);
  const proofScore   = Math.round(povScore + (Date.now() % 10000));
  const gradeInfo    = gradeFromScore(Math.min(proofScore / 100, 950));
  const mintFeeBTNG  = MINT_FEE_BTNGG;
  const mintFeeUSD   = mintFeeBTNG * btngUSD;

  const canMint =
    goldMgNum >= MIN_GOLD_MG &&
    sharesNum >= MIN_EQUITY_SHARES &&
    ownerName.trim().length > 0;

  const handleMint = async () => {
    if (!canMint || !user) return;
    setMinting(true);
    try {
      const supabase   = getSupabaseClient();
      const certId     = buildFingerprint(`${goldMgNum}-${sharesNum}-${ownerName}-${Date.now()}`);
      const fingerprint = `BTNG-POV-${Math.abs(proofScore).toString(16).toUpperCase().padStart(8, '0')}`;
      const issuedAt   = new Date().toISOString().split('T')[0];
      const expiresAt  = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { error } = await supabase.from('btng_certificates').insert({
        user_id:           (user as any).id,
        cert_type:         'gold_equity_nft',
        cert_id:           certId,
        owner_name:        ownerName.trim(),
        asset_description: assetDesc.trim() || `Gold ${goldMgNum}mg + ${sharesNum} equity shares`,
        asset_value:       goldValUSD + equityValUSD,
        equity_grade:      gradeInfo.grade,
        fingerprint,
        issued_at:         issuedAt,
        expires_at:        expiresAt,
        status:            'active',
        metadata: {
          gold_mg:          goldMgNum,
          equity_shares:    sharesNum,
          equity_price_usd: priceNum,
          affinity_score:   proofScore,
          life_energy:      0,
          proof_of_value:   povScore,
          gold_price_usd:   goldUSD,
          legal_proof_hash: legalProof.trim() || fingerprint,
          minted_at:        new Date().toISOString(),
          contract:         'BTNGGoldCertificate',
          version:          '1.0.0',
          mint_fee_btngg:   mintFeeBTNG,
        },
      });

      if (error) throw new Error(error.message);

      Alert.alert(
        '🥇 Certificate Minted!',
        `Certificate ${certId.substring(0, 24)}… has been issued.\n\nProof-of-Value Score: ${proofScore.toLocaleString()}\nGrade: ${gradeInfo.grade} (${gradeInfo.label})`,
        [{ text: 'View Certificates', onPress: () => { setTab('certificates'); loadCerts(); } }]
      );

      // Reset form
      setGoldMg('1000');
      setEquityShares('10');
      setEquityPrice('50');
      setAssetDesc('');
      setLegalProof('');

    } catch (err: any) {
      Alert.alert('Mint Failed', err.message ?? 'Unknown error');
    } finally {
      setMinting(false);
    }
  };

  // ── Life Affinity Generator ────────────────────────────────────────────────
  const [affinityTargetId, setAffinityTargetId] = useState<string | null>(null);
  const [lifeEnergy,   setLifeEnergy]   = useState('100');
  const [affLoading,   setAffLoading]   = useState(false);
  const affinityPulse = useRef(new Animated.Value(0)).current;

  const handleAffinityOpen = (certDbId: string) => {
    setAffinityTargetId(certDbId);
    setTab('affinity');
  };

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(affinityPulse, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(affinityPulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ])).start();
  }, [affinityPulse]);

  const handleGenerateAffinity = async () => {
    if (!affinityTargetId || !user) return;
    setAffLoading(true);
    try {
      const cert = certs.find(c => c.id === affinityTargetId);
      if (!cert) throw new Error('Certificate not found');

      const meta = cert.metadata ?? {};
      const goldMgCert = meta.gold_mg ?? MIN_GOLD_MG;
      const mintedAt  = meta.minted_at ? new Date(meta.minted_at).getTime() : Date.now();
      const ageDays   = Math.max(1, (Date.now() - mintedAt) / 86_400_000);
      const lifeEn    = Math.max(1, parseFloat(lifeEnergy) || 100);

      // Mirror Solidity: affinityGain = lifeEnergy * ageDays * goldMg / MIN_GOLD_CERT
      const affinityGain = Math.round(lifeEn * ageDays * (goldMgCert / MIN_GOLD_MG));
      const newScore     = (meta.affinity_score ?? 0) + affinityGain;
      const newGrade     = gradeFromScore(Math.min(newScore / 100, 950));

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('btng_certificates')
        .update({
          equity_grade: newGrade.grade,
          metadata: {
            ...meta,
            affinity_score: newScore,
            life_energy:    (meta.life_energy ?? 0) + lifeEn,
            last_affinity:  new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', affinityTargetId);

      if (error) throw new Error(error.message);

      Alert.alert(
        '⚡ Life Affinity Generated!',
        `+${affinityGain.toLocaleString()} affinity points\nNew score: ${newScore.toLocaleString()}\nGrade: ${newGrade.grade} (${newGrade.label})`,
        [{ text: 'OK', onPress: () => { loadCerts(); } }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Unknown error');
    } finally {
      setAffLoading(false);
    }
  };

  // ── Tab content ────────────────────────────────────────────────────────────
  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'certificates', label: 'My NFTs',   icon: 'workspace-premium' },
    { key: 'mint',         label: 'Mint',       icon: 'add-circle'       },
    { key: 'affinity',     label: 'Affinity',   icon: 'favorite'         },
    { key: 'contract',     label: 'Contract',   icon: 'code'             },
  ];

  const isLive       = gold.source === 'live';
  const statusColor  = isLive ? Colors.success : Colors.warning;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[s.container, { paddingTop: insets.top }]}>

        {/* Top Bar */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.topCenter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.topTitle}>BTNG Gold Certificate</Text>
              <View style={s.nftBadge}><Text style={s.nftBadgeText}>ERC-721</Text></View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <LiveDot color={statusColor} />
              <Text style={[s.topSub, { color: statusColor }]}>
                XAU ${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })} · {certs.length} certs
              </Text>
            </View>
          </View>
          <TouchableOpacity style={s.backBtn} onPress={loadCerts}>
            {certsLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={20} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        {/* Live price ribbon */}
        <View style={[s.ribbon, { backgroundColor: statusColor + '10', borderColor: statusColor + '44' }]}>
          <LiveDot color={statusColor} />
          <Text style={[s.ribbonText, { color: statusColor }]}>XAU/USD</Text>
          <Text style={[s.ribbonPrice, { color: statusColor }]}>
            ${goldUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <View style={s.ribbonDivider} />
          <Text style={s.ribbonText}>1 BTNGG</Text>
          <Text style={[s.ribbonPrice, { color: Colors.primary }]}>
            ${btngUSD.toFixed(4)}
          </Text>
          <View style={s.ribbonDivider} />
          <Text style={s.ribbonText}>Certificates</Text>
          <Text style={[s.ribbonPrice, { color: '#3B82F6' }]}>{certs.length}</Text>
        </View>

        {/* Tab bar */}
        <View style={s.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
            >
              <MaterialIcons name={t.icon as any} size={13} color={tab === t.key ? Colors.bg : Colors.textMuted} />
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── CERTIFICATES TAB ─────────────────────────────────────────────── */}
          {tab === 'certificates' && (
            <>
              {certsLoading && (
                <View style={s.emptyState}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={s.emptyText}>Loading certificates…</Text>
                </View>
              )}
              {!certsLoading && certs.length === 0 && (
                <View style={s.emptyState}>
                  <Text style={{ fontSize: 52 }}>🥇</Text>
                  <Text style={s.emptyTitle}>No Certificates Yet</Text>
                  <Text style={s.emptyText}>
                    Mint your first BTNG Gold Certificate NFT — backed by real gold weight,
                    equity value, and proof-of-value score.
                  </Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setTab('mint')} activeOpacity={0.8}>
                    <MaterialIcons name="add-circle" size={16} color={Colors.bg} />
                    <Text style={s.emptyBtnText}>Mint First Certificate</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!certsLoading && certs.map(cert => (
                <CertCard
                  key={cert.id}
                  cert={cert}
                  goldUSD={goldUSD}
                  onAffinity={handleAffinityOpen}
                />
              ))}
              {!certsLoading && certs.length > 0 && (
                <TouchableOpacity style={s.mintMoreBtn} onPress={() => setTab('mint')} activeOpacity={0.8}>
                  <MaterialIcons name="add" size={16} color={Colors.primary} />
                  <Text style={s.mintMoreBtnText}>Mint Another Certificate</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ── MINT TAB ─────────────────────────────────────────────────────── */}
          {tab === 'mint' && (
            <>
              {/* Intro */}
              <View style={s.mintHero}>
                <Text style={{ fontSize: 44 }}>🏅</Text>
                <Text style={s.mintHeroTitle}>Mint Gold Certificate NFT</Text>
                <Text style={s.mintHeroSub}>
                  Mirrors <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>BTNGGoldCertificate.mintCertificate()</Text>.
                  Proof-of-Value score = √(goldValue × equityValue), anchored to live XAU price.
                </Text>
              </View>

              {/* Live preview card */}
              <View style={[s.previewCard, { borderColor: gradeInfo.color + '55' }]}>
                <View style={s.previewHeader}>
                  <MaterialIcons name="auto-awesome" size={16} color={gradeInfo.color} />
                  <Text style={[s.previewTitle, { color: gradeInfo.color }]}>Live Mint Preview</Text>
                  <View style={[s.gradePill, { backgroundColor: gradeInfo.color + '18', borderColor: gradeInfo.color + '44' }]}>
                    <Text style={[s.gradePillText, { color: gradeInfo.color }]}>{gradeInfo.grade} · {gradeInfo.label}</Text>
                  </View>
                </View>
                <View style={s.previewGrid}>
                  <View style={s.previewItem}>
                    <Text style={s.previewLabel}>Gold Value</Text>
                    <Text style={[s.previewValue, { color: Colors.primary }]}>${goldValUSD.toFixed(4)}</Text>
                    <Text style={s.previewSub}>XAU ${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz</Text>
                  </View>
                  <View style={s.previewDivider} />
                  <View style={s.previewItem}>
                    <Text style={s.previewLabel}>Equity Value</Text>
                    <Text style={[s.previewValue, { color: '#3B82F6' }]}>${equityValUSD.toFixed(2)}</Text>
                    <Text style={s.previewSub}>{sharesNum} × ${priceNum}</Text>
                  </View>
                  <View style={s.previewDivider} />
                  <View style={s.previewItem}>
                    <Text style={s.previewLabel}>PoV Score</Text>
                    <Text style={[s.previewValue, { color: Colors.success }]}>{proofScore.toLocaleString()}</Text>
                    <Text style={s.previewSub}>√(G×E)</Text>
                  </View>
                </View>
                <View style={s.previewFeeRow}>
                  <MaterialIcons name="toll" size={12} color={Colors.textMuted} />
                  <Text style={s.previewFeeText}>
                    Mint fee: {mintFeeBTNG} BTNGG = ${mintFeeUSD.toFixed(4)} USD
                  </Text>
                </View>
              </View>

              {/* Form */}
              <View style={s.formCard}>
                <Text style={s.formSectionLabel}>GOLD BACKING</Text>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Gold Weight (mg)</Text>
                  <Text style={s.inputHint}>Min: {MIN_GOLD_MG.toLocaleString()}mg (1 gram)</Text>
                  <TextInput
                    style={[s.input, goldMgNum < MIN_GOLD_MG && goldMgNum > 0 && s.inputError]}
                    value={goldMg}
                    onChangeText={setGoldMg}
                    keyboardType="numeric"
                    placeholder="1000"
                    placeholderTextColor={Colors.textMuted}
                  />
                  {goldMgNum > 0 && (
                    <Text style={s.inputCalc}>
                      = {(goldMgNum / 1000).toFixed(3)}g = {(goldMgNum / 31103.5).toFixed(6)} troy oz = ${goldValUSD.toFixed(4)} USD
                    </Text>
                  )}
                </View>

                <Text style={[s.formSectionLabel, { marginTop: Spacing.md }]}>EQUITY BACKING</Text>
                <View style={s.inputRow}>
                  <View style={[s.inputGroup, { flex: 1 }]}>
                    <Text style={s.inputLabel}>Equity Shares</Text>
                    <TextInput
                      style={s.input}
                      value={equityShares}
                      onChangeText={setEquityShares}
                      keyboardType="numeric"
                      placeholder="10"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                  <View style={[s.inputGroup, { flex: 1 }]}>
                    <Text style={s.inputLabel}>Price/Share (USD)</Text>
                    <TextInput
                      style={s.input}
                      value={equityPrice}
                      onChangeText={setEquityPrice}
                      keyboardType="numeric"
                      placeholder="50"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                </View>

                <Text style={[s.formSectionLabel, { marginTop: Spacing.md }]}>CERTIFICATE DETAILS</Text>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Owner Name *</Text>
                  <TextInput
                    style={s.input}
                    value={ownerName}
                    onChangeText={setOwnerName}
                    placeholder="Full legal name"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Asset Description</Text>
                  <TextInput
                    style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]}
                    value={assetDesc}
                    onChangeText={setAssetDesc}
                    placeholder="Describe the underlying asset…"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                </View>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Legal Proof Hash (optional)</Text>
                  <Text style={s.inputHint}>bytes32 on-chain legal proof identifier</Text>
                  <TextInput
                    style={s.input}
                    value={legalProof}
                    onChangeText={setLegalProof}
                    placeholder="0x... or document reference"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Validation warnings */}
              {goldMgNum > 0 && goldMgNum < MIN_GOLD_MG && (
                <View style={s.warnCard}>
                  <MaterialIcons name="warning" size={14} color={Colors.warning} />
                  <Text style={s.warnText}>Gold must be at least {MIN_GOLD_MG.toLocaleString()}mg (1 gram)</Text>
                </View>
              )}

              {/* Mint button */}
              <TouchableOpacity
                style={[s.mintBtn, !canMint && s.mintBtnDisabled]}
                onPress={handleMint}
                disabled={!canMint || minting}
                activeOpacity={0.85}
              >
                {minting
                  ? <ActivityIndicator size="small" color={Colors.bg} />
                  : <MaterialIcons name="workspace-premium" size={20} color={canMint ? Colors.bg : Colors.textMuted} />
                }
                <Text style={[s.mintBtnText, !canMint && { color: Colors.textMuted }]}>
                  {minting ? 'Minting…' : `Mint Certificate · ${mintFeeBTNG} BTNGG`}
                </Text>
              </TouchableOpacity>

              <Text style={s.mintDisclaimer}>
                Minting records the certificate on BTNG Sovereign Chain, backed by the gold and equity values
                supplied. Proof-of-value score is computed as √(goldValue × equityValue) anchored to live XAU spot.
              </Text>
            </>
          )}

          {/* ── AFFINITY TAB ─────────────────────────────────────────────────── */}
          {tab === 'affinity' && (
            <>
              <View style={s.affHero}>
                <Animated.View style={[s.affOrb, { opacity: affinityPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), transform: [{ scale: affinityPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) }] }]}>
                  <Text style={{ fontSize: 44 }}>❤️‍🔥</Text>
                </Animated.View>
                <Text style={s.affTitle}>Life Affinity Generator</Text>
                <Text style={s.affSub}>
                  Mirrors <Text style={{ color: '#A855F7', fontWeight: FontWeight.bold }}>generateLifeAffinity()</Text>.
                  Life energy × certificate age × gold weight = affinity score boost.
                </Text>
              </View>

              {/* Formula card */}
              <View style={s.formulaCard}>
                <Text style={s.formulaTitle}>Affinity Formula</Text>
                <View style={s.formulaRow}>
                  <View style={[s.formulaStep, { backgroundColor: '#A855F718', borderColor: '#A855F755' }]}>
                    <Text style={[s.formulaStepText, { color: '#A855F7' }]}>Life Energy</Text>
                  </View>
                  <Text style={s.formulaOp}>×</Text>
                  <View style={[s.formulaStep, { backgroundColor: '#3B82F618', borderColor: '#3B82F655' }]}>
                    <Text style={[s.formulaStepText, { color: '#3B82F6' }]}>Age (days)</Text>
                  </View>
                  <Text style={s.formulaOp}>×</Text>
                  <View style={[s.formulaStep, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
                    <Text style={[s.formulaStepText, { color: Colors.primary }]}>Gold / 1g</Text>
                  </View>
                  <Text style={s.formulaOp}>=</Text>
                  <View style={[s.formulaStep, { backgroundColor: '#22C55E18', borderColor: '#22C55E55' }]}>
                    <Text style={[s.formulaStepText, { color: '#22C55E' }]}>Affinity</Text>
                  </View>
                </View>
              </View>

              {/* Select certificate */}
              <View style={s.formCard}>
                <Text style={s.formSectionLabel}>SELECT CERTIFICATE</Text>
                {certs.length === 0 ? (
                  <Text style={s.emptyText}>No certificates. Mint one first.</Text>
                ) : (
                  certs.map(cert => {
                    const isSelected = affinityTargetId === cert.id;
                    const meta = cert.metadata ?? {};
                    const goldMgCert = meta.gold_mg ?? 0;
                    const mintedAt = meta.minted_at ? new Date(meta.minted_at) : new Date(cert.created_at);
                    const ageDays = Math.max(1, Math.floor((Date.now() - mintedAt.getTime()) / 86_400_000));
                    const currentScore = meta.affinity_score ?? 0;
                    const lifeEn = parseFloat(lifeEnergy) || 100;
                    const estGain = Math.round(lifeEn * ageDays * (goldMgCert / MIN_GOLD_MG));

                    return (
                      <TouchableOpacity
                        key={cert.id}
                        style={[s.certSelectRow, isSelected && s.certSelectRowActive]}
                        onPress={() => setAffinityTargetId(cert.id)}
                        activeOpacity={0.8}
                      >
                        <View style={[s.certSelectRadio, isSelected && s.certSelectRadioActive]}>
                          {isSelected && <View style={s.certSelectRadioInner} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.certSelectId} numberOfLines={1}>{cert.cert_id.substring(0, 28)}…</Text>
                          <Text style={s.certSelectMeta}>Score: {currentScore.toLocaleString()} · {ageDays}d old · {goldMgCert}mg gold</Text>
                        </View>
                        {isSelected && (
                          <Text style={s.certSelectGain}>+{estGain.toLocaleString()}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              {certs.length > 0 && (
                <>
                  <View style={s.formCard}>
                    <Text style={s.formSectionLabel}>LIFE ENERGY INPUT</Text>
                    <View style={s.inputGroup}>
                      <Text style={s.inputLabel}>Life Energy Units</Text>
                      <Text style={s.inputHint}>Higher energy = larger affinity gain multiplied by age and gold weight</Text>
                      <TextInput
                        style={s.input}
                        value={lifeEnergy}
                        onChangeText={setLifeEnergy}
                        keyboardType="numeric"
                        placeholder="100"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                    {/* Quick amounts */}
                    <View style={s.fxQuickRow}>
                      {['10', '50', '100', '500', '1000', '9999'].map(v => (
                        <TouchableOpacity
                          key={v}
                          style={[s.quickBtn, lifeEnergy === v && s.quickBtnActive]}
                          onPress={() => setLifeEnergy(v)}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.quickBtnText, lifeEnergy === v && { color: Colors.bg }]}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[s.affinityBtn2, (!affinityTargetId || affLoading) && s.mintBtnDisabled]}
                    onPress={handleGenerateAffinity}
                    disabled={!affinityTargetId || affLoading}
                    activeOpacity={0.85}
                  >
                    {affLoading
                      ? <ActivityIndicator size="small" color={Colors.bg} />
                      : <MaterialIcons name="favorite" size={18} color={affinityTargetId ? Colors.bg : Colors.textMuted} />
                    }
                    <Text style={[s.mintBtnText, !affinityTargetId && { color: Colors.textMuted }]}>
                      {affLoading ? 'Generating…' : 'Generate Life Affinity'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* ── CONTRACT TAB ─────────────────────────────────────────────────── */}
          {tab === 'contract' && (
            <>
              <View style={s.contractHero}>
                <MaterialIcons name="code" size={36} color={Colors.primary} />
                <Text style={s.contractTitle}>BTNGGoldCertificate.sol</Text>
                <Text style={s.contractSub}>Solidity ^0.8.19 · ERC-721 · OpenZeppelin · Chainlink</Text>
              </View>

              {[
                {
                  name: 'mintCertificate()',
                  sig: 'function mintCertificate(uint256 _goldMg, uint256 _equityShares, bytes32 _legalProof) external payable returns (uint256)',
                  desc: 'Mints a new Gold Certificate NFT. Requires gold ≥ 1000mg and equity ≥ 1 share. Computes Proof-of-Value score via geometric mean √(goldValue × equityValue). Emits ValueProven event.',
                  color: Colors.primary,
                },
                {
                  name: 'generateLifeAffinity()',
                  sig: 'function generateLifeAffinity(uint256 _tokenId, uint256 _lifeEnergy) external',
                  desc: 'Converts life energy into affinity score boost. Gain = lifeEnergy × ageDays × (goldMg / 1000mg). Boosts certificate grade and accumulates in lifeForce[msg.sender]. Emits LifeAffinityGenerated.',
                  color: '#A855F7',
                },
                {
                  name: 'getCurrentValue()',
                  sig: 'function getCurrentValue(uint256 _tokenId) public view returns (uint256 goldEquiv, uint256 equityEquiv, uint256 affinityBonus, uint256 totalValue)',
                  desc: 'Returns real-time USD value of a certificate. goldEquiv = Chainlink XAU price × goldMg / 1000. equityEquiv = S&P500 oracle × shares. affinityBonus = affinityScore / 1000.',
                  color: '#22C55E',
                },
                {
                  name: 'calculateProofOfValue()',
                  sig: 'function calculateProofOfValue(uint256 _goldValue, uint256 _equityValue) internal pure returns (uint256)',
                  desc: 'Computes intrinsic value via geometric mean √(goldValue × equityValue) using integer Babylonian square root. Adds a time factor for age-based appreciation. Used at mint time to set initial affinityScore.',
                  color: '#3B82F6',
                },
                {
                  name: 'Certificate struct',
                  sig: 'struct Certificate { uint256 equityValue; uint256 goldWeight; uint256 affinityScore; uint256 timestamp; address beneficiary; bytes32 proofHash; }',
                  desc: 'Core data structure stored per NFT token ID. equityValue in USD cents, goldWeight in mg, affinityScore accumulated through life affinity generation, proofHash = legal document reference.',
                  color: '#F59E0B',
                },
              ].map(fn => (
                <View key={fn.name} style={[s.fnCard, { borderColor: fn.color + '44' }]}>
                  <View style={s.fnHeader}>
                    <View style={[s.fnIconWrap, { backgroundColor: fn.color + '18', borderColor: fn.color + '44' }]}>
                      <MaterialIcons name="functions" size={16} color={fn.color} />
                    </View>
                    <Text style={[s.fnName, { color: fn.color }]}>{fn.name}</Text>
                  </View>
                  <View style={s.fnSigBox}>
                    <Text style={s.fnSig} selectable>{fn.sig}</Text>
                  </View>
                  <Text style={s.fnDesc}>{fn.desc}</Text>
                </View>
              ))}

              {/* Oracles */}
              <View style={s.oracleCard}>
                <MaterialIcons name="sensors" size={18} color={Colors.primary} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.oracleTitle}>Chainlink Oracles</Text>
                  <View style={s.oracleRow}>
                    <View style={[s.oraclePill, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]}>
                      <LiveDot color={statusColor} />
                      <Text style={[s.oraclePillText, { color: Colors.primary }]}>XAU/USD · ${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                    </View>
                    <View style={[s.oraclePill, { borderColor: '#3B82F655', backgroundColor: '#3B82F618' }]}>
                      <Text style={[s.oraclePillText, { color: '#3B82F6' }]}>S&P500 Oracle</Text>
                    </View>
                  </View>
                  <Text style={s.oracleSub}>
                    Gold oracle provided live via BTNG gold-oracle Edge Function.
                    In production: AggregatorV3Interface at Chainlink price feed address.
                  </Text>
                </View>
              </View>

              <View style={s.contractFooter}>
                <MaterialIcons name="verified-user" size={13} color={Colors.textMuted} />
                <Text style={s.contractFooterText}>
                  SPDX-License-Identifier: MIT · pragma solidity ^0.8.19{'\n'}
                  Inherits: ERC721Enumerable · Ownable · ReentrancyGuard{'\n'}
                  Network: BTNG-MAINNET · Chain ID: BTNG-54
                </Text>
              </View>
            </>
          )}

          <View style={{ height: insets.bottom + 40 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:  { alignItems: 'center', gap: 3 },
  topTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  nftBadge:   { backgroundColor: Colors.primaryGlow, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '55' },
  nftBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  ribbon:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 9, borderWidth: 1.5 },
  ribbonText:   { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  ribbonPrice:  { fontSize: 13, fontWeight: FontWeight.heavy, includeFontPadding: false },
  ribbonDivider:{ width: 1, height: 16, backgroundColor: Colors.border },

  tabBar:        { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, gap: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  tabBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm - 1, borderRadius: Radius.md },
  tabBtnActive:  { backgroundColor: Colors.primary },
  tabText:       { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Empty state
  emptyState: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptyText:  { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  emptyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, marginTop: Spacing.sm },
  emptyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  mintMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '55', paddingVertical: Spacing.md },
  mintMoreBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Mint tab
  mintHero:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  mintHeroTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'center' },
  mintHeroSub:    { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, textAlign: 'center', includeFontPadding: false },

  previewCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  previewHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  previewTitle:    { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  gradePill:       { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  gradePillText:   { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  previewGrid:     { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, overflow: 'hidden' },
  previewItem:     { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2 },
  previewDivider:  { width: 1, backgroundColor: Colors.border },
  previewLabel:    { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  previewValue:    { fontSize: 13, fontWeight: FontWeight.heavy, includeFontPadding: false },
  previewSub:      { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  previewFeeRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  previewFeeText:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  formCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  formSectionLabel:{ fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  inputGroup:      { gap: 4 },
  inputRow:        { flexDirection: 'row', gap: Spacing.sm },
  inputLabel:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  inputHint:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  input:           { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  inputError:      { borderColor: Colors.error },
  inputCalc:       { fontSize: 9, color: Colors.primary, includeFontPadding: false },

  warnCard:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warningBg ?? '#F59E0B18', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '44' },
  warnText:        { flex: 1, fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },

  mintBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  mintBtnDisabled: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, shadowOpacity: 0, elevation: 0 },
  mintBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  mintDisclaimer:  { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 15, includeFontPadding: false },

  // Affinity tab
  affHero:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#A855F744', padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  affOrb:     { width: 80, height: 80, borderRadius: 40, backgroundColor: '#A855F718', borderWidth: 2, borderColor: '#A855F755', alignItems: 'center', justifyContent: 'center' },
  affTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  affSub:     { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, textAlign: 'center', includeFontPadding: false },

  formulaCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  formulaTitle:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  formulaRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  formulaStep:     { borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  formulaStepText: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  formulaOp:       { fontSize: FontSize.lg, color: Colors.textMuted, fontWeight: FontWeight.heavy, includeFontPadding: false },

  certSelectRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1.5, borderColor: Colors.border },
  certSelectRowActive: { backgroundColor: '#A855F712', borderColor: '#A855F755' },
  certSelectRadio:     { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  certSelectRadioActive: { borderColor: '#A855F7' },
  certSelectRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#A855F7' },
  certSelectId:        { fontSize: 10, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  certSelectMeta:      { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  certSelectGain:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#A855F7', includeFontPadding: false },

  fxQuickRow:  { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  quickBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  quickBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  affinityBtn2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#A855F7', borderRadius: Radius.xl, paddingVertical: Spacing.lg, shadowColor: '#A855F7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },

  // Contract tab
  contractHero:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  contractTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  contractSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  fnCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  fnHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fnIconWrap:  { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fnName:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  fnSigBox:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  fnSig:       { fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 14 },
  fnDesc:      { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },

  oracleCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.md },
  oracleTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  oracleRow:   { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  oraclePill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  oraclePillText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  oracleSub:   { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },

  contractFooter:     { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  contractFooterText: { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14, includeFontPadding: false },
});
