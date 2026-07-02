// BTNG AI Credit Dashboard — Sovereign Credit Scoring & Loan Issuance
// Powered by BTNG Brain Engine · Gold-Backed Credit System
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { useBtngWallet } from '@/hooks/useBtngWallet';
import {
  generateCredit as edgeFnGenerateCredit,
  disburseLoan as edgeFnDisburseLoan,
  getUserLoans,
  type LoanRecord,
} from '@/services/lendingService';

// ── Types ─────────────────────────────────────────────────────────────────────
type CreditTier = 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'UNRATED';
type LoanStatus = 'ELIGIBLE' | 'CONDITIONAL' | 'PENDING_KYC' | 'INELIGIBLE';

interface CreditProfile {
  score: number;
  tier: CreditTier;
  maxBorrow: number;
  apr: number;
  ltvRatio: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: CreditFactor[];
  loanStatus: LoanStatus;
  recommendations: string[];
  generatedAt: string;
}

interface CreditFactor {
  label: string;
  score: number;
  weight: number;
  status: 'positive' | 'neutral' | 'negative';
  detail: string;
}

interface ActiveLoan {
  id: string;
  principal: number;
  maxBorrow: number;
  interest: number;
  totalDue: number;
  dueDate: string;
  rateApr: number;
  ltv: number;
  currency: string;
  riskLevel: string;
  createdAt: string;
}

// ── Credit Tier Config ────────────────────────────────────────────────────────
const TIER_CONFIG: Record<CreditTier, { color: string; bg: string; icon: string; label: string }> = {
  PLATINUM: { color: '#E2E8F0', bg: '#E2E8F018', icon: 'workspace-premium', label: 'Platinum' },
  GOLD:     { color: Colors.primary, bg: Colors.primaryGlow, icon: 'military-tech', label: 'Gold' },
  SILVER:   { color: '#94A3B8', bg: '#94A3B818', icon: 'shield', label: 'Silver' },
  BRONZE:   { color: '#CD7F32', bg: '#CD7F3218', icon: 'verified', label: 'Bronze' },
  UNRATED:  { color: Colors.textMuted, bg: Colors.bgElevated, icon: 'help-outline', label: 'Unrated' },
};

const LOAN_STATUS_CONFIG: Record<LoanStatus, { color: string; bg: string; label: string; icon: string }> = {
  ELIGIBLE:       { color: Colors.success, bg: Colors.successBg, label: 'Eligible',       icon: 'check-circle' },
  CONDITIONAL:    { color: Colors.warning, bg: Colors.warningBg, label: 'Conditional',     icon: 'warning' },
  PENDING_KYC:    { color: '#3B82F6',      bg: '#3B82F618',      label: 'Pending KYC',     icon: 'assignment-ind' },
  INELIGIBLE:     { color: Colors.error,   bg: Colors.errorBg,   label: 'Not Eligible',    icon: 'block' },
};

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, tier }: { score: number; tier: CreditTier }) {
  const tc = TIER_CONFIG[tier];
  const pct = score / 1000;
  const anim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1100, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [score, pct]);

  const SIZE = 160;
  const STROKE = 14;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;

  return (
    <View style={sr.wrap}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        {/* Background ring */}
        <View style={[sr.ringBg, { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: STROKE, borderColor: Colors.bgElevated }]} />
        {/* Score text in center */}
        <View style={sr.center}>
          <MaterialIcons name={tc.icon as any} size={20} color={tc.color} />
          <Text style={[sr.scoreNum, { color: tc.color }]}>{score}</Text>
          <Text style={sr.scoreLabel}>/ 1000</Text>
          <View style={[sr.tierBadge, { backgroundColor: tc.bg, borderColor: tc.color + '55' }]}>
            <Text style={[sr.tierText, { color: tc.color }]}>{tc.label}</Text>
          </View>
        </View>
        {/* Animated arc — simplified as opacity glow */}
        <Animated.View style={[sr.glow, { width: SIZE + 20, height: SIZE + 20, borderRadius: (SIZE + 20) / 2, borderColor: tc.color, opacity: pulseAnim }]} />
      </View>
    </View>
  );
}

const sr = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: Spacing.md },
  ringBg: { position: 'absolute' },
  center: { alignItems: 'center', gap: 2 },
  scoreNum: { fontSize: 36, fontWeight: FontWeight.heavy, includeFontPadding: false, fontFamily: 'monospace' as any },
  scoreLabel: { fontSize: 11, color: Colors.textMuted, includeFontPadding: false },
  tierBadge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 3, borderWidth: 1, marginTop: 4 },
  tierText: { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  glow: { position: 'absolute', borderWidth: 2 },
});

// ── Factor Bar ────────────────────────────────────────────────────────────────
function FactorBar({ factor }: { factor: CreditFactor }) {
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: factor.score / 100,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [factor.score]);

  const barColor = factor.status === 'positive' ? Colors.success
    : factor.status === 'negative' ? Colors.error
    : Colors.warning;

  return (
    <View style={fb.row}>
      <View style={fb.labelCol}>
        <Text style={fb.label}>{factor.label}</Text>
        <Text style={fb.detail} numberOfLines={1}>{factor.detail}</Text>
      </View>
      <View style={fb.barWrap}>
        <View style={fb.barTrack}>
          <Animated.View style={[fb.barFill, {
            width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            backgroundColor: barColor,
          }]} />
        </View>
        <Text style={[fb.score, { color: barColor }]}>{factor.score}</Text>
      </View>
    </View>
  );
}

const fb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  labelCol: { width: 120, gap: 2 },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  detail: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  barWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barTrack: { flex: 1, height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  score: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false, width: 28, textAlign: 'right' },
});

// ── Loan Request Form ─────────────────────────────────────────────────────────
interface LoanFormProps {
  profile: CreditProfile;
  goldPriceUSD: number;
  onSubmit: (amount: number, collateral: string) => Promise<void>;
  submitting: boolean;
}

function LoanRequestForm({ profile, goldPriceUSD, onSubmit, submitting }: LoanFormProps) {
  const [amount, setAmount] = useState('');
  const [collateral, setCollateral] = useState('BTNGG');
  const amtNum = parseFloat(amount) || 0;
  const valid = amtNum > 0 && amtNum <= profile.maxBorrow;
  const dailyInterest = amtNum * (profile.apr / 100 / 365);
  const monthlyInterest = dailyInterest * 30;
  const totalDue = amtNum + monthlyInterest;
  const btnggEquiv = goldPriceUSD > 0 ? amtNum / (goldPriceUSD / 1000) : 0;

  const COLLATERAL_OPTIONS = [
    { id: 'BTNGG', label: 'BTNGG Gold', icon: 'monetization-on', color: Colors.primary },
    { id: 'BTC',   label: 'Bitcoin',    icon: 'currency-bitcoin', color: '#F7931A' },
    { id: 'ETH',   label: 'Ethereum',   icon: 'token',            color: '#627EEA' },
  ];

  return (
    <View style={lf.wrap}>
      <View style={lf.header}>
        <MaterialIcons name="account-balance" size={16} color={Colors.primary} />
        <Text style={lf.title}>Apply for Sovereign Loan</Text>
        <View style={[lf.maxBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
          <Text style={lf.maxBadgeText}>Max ${profile.maxBorrow.toLocaleString()}</Text>
        </View>
      </View>

      <Text style={lf.fieldLabel}>Loan Amount (USD)</Text>
      <View style={lf.amountRow}>
        <TextInput
          style={lf.amountInput}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />
        <Text style={lf.amountCurrency}>USD</Text>
      </View>

      {amtNum > 0 && amtNum > profile.maxBorrow && (
        <View style={lf.errorRow}>
          <MaterialIcons name="error-outline" size={12} color={Colors.error} />
          <Text style={lf.errorText}>Exceeds your max limit of ${profile.maxBorrow.toLocaleString()}</Text>
        </View>
      )}

      {amtNum > 0 && amtNum <= profile.maxBorrow && (
        <View style={lf.previewCard}>
          <View style={lf.previewRow}><Text style={lf.previewLabel}>Principal</Text><Text style={lf.previewVal}>${amtNum.toFixed(2)}</Text></View>
          <View style={lf.previewRow}><Text style={lf.previewLabel}>APR Rate</Text><Text style={[lf.previewVal, { color: Colors.warning }]}>{profile.apr}%</Text></View>
          <View style={lf.previewRow}><Text style={lf.previewLabel}>30-Day Interest</Text><Text style={[lf.previewVal, { color: Colors.error }]}>${monthlyInterest.toFixed(2)}</Text></View>
          <View style={[lf.previewRow, { borderBottomWidth: 0 }]}>
            <Text style={lf.previewLabel}>Total Due (30d)</Text>
            <Text style={[lf.previewVal, { color: Colors.success, fontWeight: FontWeight.heavy }]}>${totalDue.toFixed(2)}</Text>
          </View>
          {btnggEquiv > 0 && (
            <View style={lf.btnggRow}>
              <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
              <Text style={lf.btnggText}>≈ {btnggEquiv.toFixed(4)} BTNGG collateral required</Text>
            </View>
          )}
        </View>
      )}

      <Text style={lf.fieldLabel}>Collateral Asset</Text>
      <View style={lf.collateralRow}>
        {COLLATERAL_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[lf.collateralChip, collateral === opt.id && { backgroundColor: opt.color + '22', borderColor: opt.color }]}
            onPress={() => setCollateral(opt.id)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={opt.icon as any} size={14} color={collateral === opt.id ? opt.color : Colors.textMuted} />
            <Text style={[lf.collateralText, collateral === opt.id && { color: opt.color }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[lf.submitBtn, (!valid || submitting) && { opacity: 0.5 }]}
        onPress={() => valid && onSubmit(amtNum, collateral)}
        disabled={!valid || submitting}
        activeOpacity={0.85}
      >
        {submitting
          ? <ActivityIndicator size="small" color={Colors.bg} />
          : <MaterialIcons name="account-balance" size={18} color={Colors.bg} />}
        <Text style={lf.submitBtnText}>{submitting ? 'Processing…' : 'Apply for Loan'}</Text>
      </TouchableOpacity>

      <Text style={lf.disclaimer}>
        Sovereign loans are gold-backed and governed by BTNG Credit Engine. Collateral is held in escrow during the loan period.
      </Text>
    </View>
  );
}

const lf = StyleSheet.create({
  wrap: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  maxBadge: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  maxBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  fieldLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.3, includeFontPadding: false },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', paddingHorizontal: Spacing.md, height: 52 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false, fontFamily: 'monospace' as any },
  amountCurrency: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.error + '44' },
  errorText: { fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  previewCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  previewLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  previewVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  btnggRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.primaryGlow },
  btnggText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  collateralRow: { flexDirection: 'row', gap: Spacing.sm },
  collateralChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  collateralText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  submitBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  disclaimer: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', lineHeight: 14, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AICreditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const { priceUSD: goldPriceUSD } = useGoldOracle();
  const { wallet } = useBtngWallet();

  const [tab, setTab] = useState<'score' | 'loans' | 'history' | 'apply'>('score');
  const [profile, setProfile] = useState<CreditProfile | null>(null);
  const [generating, setGenerating] = useState(false);
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loanHistory, setLoanHistory] = useState<ActiveLoan[]>([]);
  const scorePulse = useRef(new Animated.Value(0.4)).current;

  // Pulse animation for the score dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scorePulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(scorePulse, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scorePulse]);

  // Load active loans via Edge Function (GET /api/lending/loans)
  const loadLoans = useCallback(async () => {
    if (!user?.id) return;
    setLoansLoading(true);
    const { data: edgeData, error } = await getUserLoans();
    if (edgeData?.loans) {
      setActiveLoans(edgeData.loans.slice(0, 3) as any);
      setLoanHistory(edgeData.loans as any);
    } else {
      // Fallback direct DB read
      try {
        const sb = getSupabaseClient();
        const { data } = await sb.from('btng_loans').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (data) { setActiveLoans(data.slice(0, 3) as any); setLoanHistory(data as any); }
      } catch (_) {}
    }
    setLoansLoading(false);
  }, [user?.id]);

  useEffect(() => { loadLoans(); }, [loadLoans]);

  // Generate credit score via btng-lending Edge Function (BankSigner-V1)
  const generateCreditScore = useCallback(async () => {
    if (!user) { showAlert('Sign In Required', 'Please sign in to generate your credit score.'); return; }
    setGenerating(true);
    try {
      const { data: raw, error } = await edgeFnGenerateCredit();

      if (error || !raw) {
        // Fallback: compute locally from DB if Edge Function unavailable
        const sb = getSupabaseClient();
        const [walletRes, certRes, kycRes, ordersRes] = await Promise.allSettled([
          sb.from('btng_wallets').select('balance,gold_backed_ghs,tier').eq('user_id', user.id).maybeSingle(),
          sb.from('btng_certificates').select('id,equity_grade,asset_value,status').eq('user_id', user.id).eq('status', 'active'),
          sb.from('kyc_submissions').select('status').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(1),
          sb.from('orders').select('id,total_value,side,status').eq('user_id', user.id).eq('status', 'filled').limit(50),
        ]);
        const walletData  = walletRes.status  === 'fulfilled' ? walletRes.value.data  : null;
        const certs       = certRes.status    === 'fulfilled' ? (certRes.value.data   ?? []) : [];
        const kycData     = kycRes.status     === 'fulfilled' ? (kycRes.value.data    ?? []) : [];
        const orders      = ordersRes.status  === 'fulfilled' ? (ordersRes.value.data ?? []) : [];
        const walletBal   = Number(walletData?.balance ?? 0);
        const goldGhs     = Number(walletData?.gold_backed_ghs ?? 0);
        const kycVerified = kycData[0]?.status === 'verified';
        const certCount   = certs.length;
        const certValue   = certs.reduce((s: number, c: any) => s + Number(c.asset_value ?? 0), 0);
        const orderCount  = orders.length;
        const buyVolume   = orders.filter((o: any) => o.side === 'buy').reduce((s: number, o: any) => s + Number(o.total_value ?? 0), 0);
        const walletScore   = Math.min(100, Math.round((walletBal / 1000) * 40 + (goldGhs / 5000) * 20 + (walletData?.tier === 'Gold' ? 30 : walletData?.tier === 'Silver' ? 20 : 10)));
        const kycScore      = kycVerified ? 90 : 35;
        const certScore     = Math.min(100, certCount * 20 + Math.min(40, certValue / 1000));
        const activityScore = Math.min(100, orderCount * 5 + Math.min(50, buyVolume / 500));
        const loyaltyScore  = Math.min(100, Math.round(60 + (orderCount > 10 ? 20 : orderCount * 2) + (kycVerified ? 20 : 0)));
        const composite = Math.round(walletScore * 2.5 + kycScore * 3.0 + certScore * 2.0 + activityScore * 1.5 + loyaltyScore * 1.0);
        const score = Math.max(100, Math.min(1000, composite));
        const tier: CreditTier = score >= 850 ? 'PLATINUM' : score >= 700 ? 'GOLD' : score >= 550 ? 'SILVER' : score >= 400 ? 'BRONZE' : 'UNRATED';
        const aprMap: Record<CreditTier, number> = { PLATINUM: 5.5, GOLD: 7.5, SILVER: 10.5, BRONZE: 14.5, UNRATED: 22 };
        const ltvMap: Record<CreditTier, number> = { PLATINUM: 0.75, GOLD: 0.65, SILVER: 0.55, BRONZE: 0.45, UNRATED: 0.30 };
        const ltv = ltvMap[tier];
        const collateralUSD = walletBal * (goldPriceUSD > 0 ? goldPriceUSD / 1000 : 4.46) + certValue;
        const maxBorrow = Math.round(collateralUSD * ltv);
        const loanStatus: LoanStatus = !kycVerified ? 'PENDING_KYC' : score >= 700 ? 'ELIGIBLE' : score >= 400 ? 'CONDITIONAL' : 'INELIGIBLE';
        setProfile({
          score, tier, maxBorrow, apr: aprMap[tier], ltvRatio: ltv,
          riskLevel: score >= 700 ? 'LOW' : score >= 450 ? 'MEDIUM' : 'HIGH',
          loanStatus, generatedAt: new Date().toISOString(),
          factors: [
            { label: 'Gold Wallet',      score: walletScore,   weight: 25, status: walletScore >= 60 ? 'positive' : walletScore >= 30 ? 'neutral' : 'negative',     detail: `${walletBal.toFixed(2)} BTNGG` },
            { label: 'KYC Identity',     score: kycScore,      weight: 30, status: kycVerified ? 'positive' : 'negative',    detail: kycVerified ? 'Identity verified' : 'KYC not completed' },
            { label: 'Certificates',     score: certScore,     weight: 20, status: certCount > 0 ? 'positive' : 'neutral',   detail: `${certCount} certs · $${certValue.toFixed(0)}` },
            { label: 'Trading Activity', score: activityScore, weight: 15, status: orderCount > 5 ? 'positive' : 'neutral',  detail: `${orderCount} trades` },
            { label: 'Platform Loyalty', score: loyaltyScore,  weight: 10, status: loyaltyScore >= 70 ? 'positive' : 'neutral', detail: 'Usage + KYC + history' },
          ],
          recommendations: [
            ...(!kycVerified ? ['Complete KYC to unlock full credit eligibility'] : []),
            ...(walletBal < 100 ? ['Increase BTNGG wallet balance to improve credit limit'] : []),
            ...(certCount === 0 ? ['Create asset certificates to strengthen credit profile'] : []),
          ].slice(0, 3),
        });
        setGenerating(false);
        return;
      }

      // Map Edge Function response to CreditProfile shape
      const tier = raw.tier as CreditTier;
      setProfile({
        score:          raw.score,
        tier,
        maxBorrow:      raw.maxBorrow,
        apr:            raw.apr,
        ltvRatio:       raw.ltvRatio,
        riskLevel:      raw.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
        loanStatus:     raw.loanStatus as LoanStatus,
        generatedAt:    raw.generatedAt,
        factors: [
          { label: 'Gold Wallet',      score: raw.factors.wallet,   weight: 25, status: raw.factors.wallet   >= 60 ? 'positive' : raw.factors.wallet   >= 30 ? 'neutral' : 'negative', detail: `${raw.signals.walletBalance.toFixed(2)} BTNGG` },
          { label: 'KYC Identity',     score: raw.factors.kyc,      weight: 30, status: raw.signals.kycVerified ? 'positive' : 'negative',  detail: raw.signals.kycVerified ? 'Identity verified' : 'KYC not completed' },
          { label: 'Certificates',     score: raw.factors.certs,    weight: 20, status: raw.signals.certCount > 0 ? 'positive' : 'neutral',  detail: `${raw.signals.certCount} certs · $${raw.signals.certValue.toFixed(0)}` },
          { label: 'Trading Activity', score: raw.factors.activity, weight: 15, status: raw.signals.orderCount > 5 ? 'positive' : 'neutral', detail: `${raw.signals.orderCount} trades · $${raw.signals.buyVolume.toFixed(0)}` },
          { label: 'Platform Loyalty', score: raw.factors.loyalty,  weight: 10, status: raw.factors.loyalty >= 70 ? 'positive' : 'neutral',  detail: 'Usage + KYC + history' },
        ],
        recommendations: [
          ...(!raw.signals.kycVerified    ? ['Complete KYC to unlock full credit eligibility'] : []),
          ...(raw.signals.walletBalance < 100 ? ['Increase BTNGG wallet balance to improve credit limit'] : []),
          ...(raw.signals.certCount === 0 ? ['Create asset certificates to strengthen credit profile'] : []),
          ...(raw.signals.orderCount < 5  ? ['Increase trading activity to demonstrate financial behaviour'] : []),
          ...(raw.score < 700             ? ['Maintain consistent activity over 90 days for a tier upgrade'] : []),
        ].slice(0, 3),
      });
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Failed to generate credit score.');
    }
    setGenerating(false);
  }, [user, goldPriceUSD, showAlert]);

  // Auto-generate on mount if user is logged in
  useEffect(() => {
    if (user) generateCreditScore();
  }, [user?.id]);

  // Submit loan via btng-lending Edge Function (bankSigner.disburseLoan)
  const handleLoanSubmit = useCallback(async (amount: number, collateralAsset: string) => {
    if (!user || !profile) return;
    setSubmitting(true);
    const { data, error } = await edgeFnDisburseLoan(amount, collateralAsset);
    if (error || !data) {
      // Fallback: write directly to btng_loans table
      const sb = getSupabaseClient();
      const dailyRate = profile.apr / 100 / 365;
      const interest  = amount * dailyRate * 30;
      const totalDue  = amount + interest;
      const dueDate   = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      const { error: dbErr } = await sb.from('btng_loans').insert({
        user_id: user.id, btng_id: wallet?.btng_id ?? `LOAN-${Date.now()}`,
        principal: amount, max_borrow: profile.maxBorrow, interest, total_due: totalDue,
        currency: 'BTNGG', due_date: dueDate.toISOString().split('T')[0],
        rate_apr: profile.apr, ltv: profile.ltvRatio * 100, daily_rate: dailyRate * 100,
        risk_level: profile.riskLevel, source: 'ai_credit_engine_local',
      });
      if (dbErr) { showAlert('Error', dbErr.message); setSubmitting(false); return; }
      showAlert(
        'Loan Application Submitted',
        `Your sovereign loan of $${amount.toLocaleString()} has been submitted.\n\nTotal due in 30 days: $${totalDue.toFixed(2)}\nAPR: ${profile.apr}%`,
        [{ text: 'View Loans', onPress: () => setTab('loans') }, { text: 'OK', style: 'cancel' }]
      );
    } else {
      showAlert(
        'Loan Disbursed — BankSigner-V1',
        `${data.message}\n\nTx: ${data.txHash.slice(0, 20)}…\nEngine: ${data.engine}`,
        [{ text: 'View Loans', onPress: () => setTab('loans') }, { text: 'OK', style: 'cancel' }]
      );
    }
    await loadLoans();
    setTab('loans');
    setSubmitting(false);
  }, [user, profile, wallet, showAlert, loadLoans]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>AI Credit Engine</Text>
          <Text style={styles.topSub}>BTNG Sovereign Credit Scoring System</Text>
        </View>
        <View style={styles.aiPill}>
          <Animated.View style={[styles.aiDot, { opacity: scorePulse }]} />
          <Text style={styles.aiPillText}>LIVE</Text>
        </View>
      </View>

      {/* Genesis Banner */}
      <View style={styles.banner}>
        <MaterialIcons name="workspace-premium" size={12} color={Colors.primary} />
        <Text style={styles.bannerText}>Gold-Backed Credit · 54 Africa Nations · BTNG Sovereign Engine v2.0</Text>
      </View>

      {/* Tab Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScrollWrap} contentContainerStyle={styles.tabScrollContent}>
        {([
          { id: 'score',   icon: 'analytics',         label: 'Credit Score' },
          { id: 'apply',   icon: 'account-balance',    label: 'Apply'        },
          { id: 'loans',   icon: 'receipt-long',       label: 'My Loans'     },
          { id: 'history', icon: 'history',            label: 'History'      },
        ] as { id: typeof tab; icon: string; label: string }[]).map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={13} color={tab === t.id ? Colors.bg : Colors.textMuted} />
            <Text style={[styles.tabBtnText, tab === t.id && { color: Colors.bg }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

        {/* ── SCORE TAB ── */}
        {tab === 'score' && (
          <View style={styles.section}>
            {!user ? (
              <View style={styles.authCard}>
                <MaterialIcons name="lock-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.authTitle}>Sign In to View Credit Score</Text>
                <Text style={styles.authSub}>Your sovereign credit profile is generated from your wallet, certificates, and trading activity.</Text>
                <TouchableOpacity style={styles.authBtn} onPress={() => router.push('/login')}>
                  <MaterialIcons name="login" size={16} color={Colors.bg} />
                  <Text style={styles.authBtnText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : generating ? (
              <View style={styles.generatingCard}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.generatingTitle}>AI Credit Engine Running</Text>
                <Text style={styles.generatingSub}>Analyzing wallet data, certificates, KYC status, and trading history…</Text>
                {['Wallet Analysis', 'KYC Verification Check', 'Certificate Valuation', 'Activity Scoring', 'Risk Assessment'].map((step, i) => (
                  <View key={step} style={styles.genStepRow}>
                    <MaterialIcons name="radio-button-checked" size={12} color={Colors.primary} />
                    <Text style={styles.genStepText}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : profile ? (
              <>
                {/* Score Ring */}
                <View style={styles.scoreCard}>
                  <ScoreRing score={profile.score} tier={profile.tier} />

                  {/* KPIs */}
                  <View style={styles.kpiGrid}>
                    <View style={[styles.kpiCell, { borderColor: Colors.primary + '33' }]}>
                      <Text style={styles.kpiLabel}>MAX BORROW</Text>
                      <Text style={[styles.kpiValue, { color: Colors.primary }]}>
                        ${profile.maxBorrow.toLocaleString()}
                      </Text>
                      <Text style={styles.kpiSub}>USD</Text>
                    </View>
                    <View style={[styles.kpiCell, { borderColor: Colors.warning + '33' }]}>
                      <Text style={styles.kpiLabel}>APR RATE</Text>
                      <Text style={[styles.kpiValue, { color: Colors.warning }]}>{profile.apr}%</Text>
                      <Text style={styles.kpiSub}>Annual</Text>
                    </View>
                    <View style={[styles.kpiCell, { borderColor: '#3B82F633' }]}>
                      <Text style={styles.kpiLabel}>LTV RATIO</Text>
                      <Text style={[styles.kpiValue, { color: '#3B82F6' }]}>{(profile.ltvRatio * 100).toFixed(0)}%</Text>
                      <Text style={styles.kpiSub}>Gold-backed</Text>
                    </View>
                    <View style={[styles.kpiCell, {
                      borderColor: (profile.riskLevel === 'LOW' ? Colors.success : profile.riskLevel === 'MEDIUM' ? Colors.warning : Colors.error) + '33',
                    }]}>
                      <Text style={styles.kpiLabel}>RISK LEVEL</Text>
                      <Text style={[styles.kpiValue, {
                        color: profile.riskLevel === 'LOW' ? Colors.success : profile.riskLevel === 'MEDIUM' ? Colors.warning : Colors.error,
                        fontSize: FontSize.md,
                      }]}>{profile.riskLevel}</Text>
                      <Text style={styles.kpiSub}>Assessment</Text>
                    </View>
                  </View>

                  {/* Loan Status */}
                  {(() => {
                    const ls = LOAN_STATUS_CONFIG[profile.loanStatus];
                    return (
                      <View style={[styles.loanStatusRow, { backgroundColor: ls.bg, borderColor: ls.color + '44' }]}>
                        <MaterialIcons name={ls.icon as any} size={16} color={ls.color} />
                        <Text style={[styles.loanStatusText, { color: ls.color }]}>Loan Status: {ls.label}</Text>
                        {profile.loanStatus === 'ELIGIBLE' && (
                          <TouchableOpacity
                            style={[styles.applyNowBtn, { backgroundColor: ls.color }]}
                            onPress={() => setTab('apply')}
                          >
                            <Text style={styles.applyNowText}>Apply Now</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })()}

                  {/* Generated timestamp */}
                  <Text style={styles.genTimestamp}>
                    Generated {new Date(profile.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · AI Credit Engine v2.0
                  </Text>
                </View>

                {/* Credit Factors */}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <MaterialIcons name="analytics" size={16} color={Colors.primary} />
                    <Text style={styles.cardTitle}>Credit Score Breakdown</Text>
                  </View>
                  {profile.factors.map((f, i) => (
                    <FactorBar key={f.label} factor={f} />
                  ))}
                  <View style={styles.factorLegend}>
                    {[
                      { color: Colors.success, label: 'Positive' },
                      { color: Colors.warning, label: 'Neutral' },
                      { color: Colors.error, label: 'Negative' },
                    ].map(l => (
                      <View key={l.label} style={styles.factorLegendItem}>
                        <View style={[styles.factorLegendDot, { backgroundColor: l.color }]} />
                        <Text style={styles.factorLegendText}>{l.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Recommendations */}
                {profile.recommendations.length > 0 && (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <MaterialIcons name="lightbulb-outline" size={16} color={Colors.primary} />
                      <Text style={styles.cardTitle}>AI Recommendations</Text>
                    </View>
                    {profile.recommendations.map((rec, i) => (
                      <View key={i} style={styles.recRow}>
                        <View style={styles.recDot} />
                        <Text style={styles.recText}>{rec}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Refresh Button */}
                <TouchableOpacity style={styles.refreshScoreBtn} onPress={generateCreditScore} activeOpacity={0.85}>
                  <MaterialIcons name="autorenew" size={16} color={Colors.primary} />
                  <Text style={styles.refreshScoreBtnText}>Refresh Credit Score</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.generateCard}>
                <MaterialIcons name="psychology" size={52} color={Colors.primary} />
                <Text style={styles.generateTitle}>Generate Your Credit Score</Text>
                <Text style={styles.generateSub}>
                  The AI Credit Engine analyzes your BTNG wallet, certificates, KYC status, and trading history to generate a sovereign credit score.
                </Text>
                <TouchableOpacity style={styles.generateBtn} onPress={generateCreditScore} activeOpacity={0.85}>
                  <MaterialIcons name="bolt" size={18} color={Colors.bg} />
                  <Text style={styles.generateBtnText}>Generate Score Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── APPLY TAB ── */}
        {tab === 'apply' && (
          <View style={styles.section}>
            {!user ? (
              <View style={styles.authCard}>
                <MaterialIcons name="lock-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.authTitle}>Sign In to Apply for a Loan</Text>
                <TouchableOpacity style={styles.authBtn} onPress={() => router.push('/login')}>
                  <Text style={styles.authBtnText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : !profile ? (
              <View style={styles.generateCard}>
                <MaterialIcons name="analytics" size={48} color={Colors.textMuted} />
                <Text style={styles.generateTitle}>Generate Your Credit Score First</Text>
                <TouchableOpacity style={[styles.generateBtn, { backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.primary }]}
                  onPress={() => setTab('score')} activeOpacity={0.85}>
                  <MaterialIcons name="analytics" size={16} color={Colors.primary} />
                  <Text style={[styles.generateBtnText, { color: Colors.primary }]}>View Credit Score</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Credit Summary */}
                <View style={styles.creditSummaryCard}>
                  <View style={styles.cardHeader}>
                    <MaterialIcons name={TIER_CONFIG[profile.tier].icon as any} size={18} color={TIER_CONFIG[profile.tier].color} />
                    <Text style={[styles.cardTitle, { color: TIER_CONFIG[profile.tier].color }]}>
                      {TIER_CONFIG[profile.tier].label} Tier · Score {profile.score}
                    </Text>
                    <Text style={[styles.aprBadge, { color: Colors.warning }]}>{profile.apr}% APR</Text>
                  </View>
                  <View style={styles.creditSummaryRow}>
                    <View style={styles.creditSummaryCell}>
                      <Text style={styles.creditSummaryLabel}>Max Borrow</Text>
                      <Text style={[styles.creditSummaryValue, { color: Colors.primary }]}>${profile.maxBorrow.toLocaleString()}</Text>
                    </View>
                    <View style={styles.creditSummarySep} />
                    <View style={styles.creditSummaryCell}>
                      <Text style={styles.creditSummaryLabel}>LTV</Text>
                      <Text style={[styles.creditSummaryValue, { color: '#3B82F6' }]}>{(profile.ltvRatio * 100).toFixed(0)}%</Text>
                    </View>
                    <View style={styles.creditSummarySep} />
                    <View style={styles.creditSummaryCell}>
                      <Text style={styles.creditSummaryLabel}>Risk</Text>
                      <Text style={[styles.creditSummaryValue, {
                        color: profile.riskLevel === 'LOW' ? Colors.success : profile.riskLevel === 'MEDIUM' ? Colors.warning : Colors.error,
                      }]}>{profile.riskLevel}</Text>
                    </View>
                  </View>
                </View>

                <LoanRequestForm
                  profile={profile}
                  goldPriceUSD={goldPriceUSD}
                  onSubmit={handleLoanSubmit}
                  submitting={submitting}
                />
              </>
            )}
          </View>
        )}

        {/* ── LOANS TAB ── */}
        {tab === 'loans' && (
          <View style={styles.section}>
            {loansLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.loadingText}>Loading loans…</Text>
              </View>
            ) : activeLoans.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="account-balance" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Active Loans</Text>
                <Text style={styles.emptySub}>Apply for a sovereign loan using your gold-backed credit.</Text>
                <TouchableOpacity style={styles.generateBtn} onPress={() => setTab('apply')} activeOpacity={0.85}>
                  <MaterialIcons name="add" size={16} color={Colors.bg} />
                  <Text style={styles.generateBtnText}>Apply for Loan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              activeLoans.map(loan => (
                <View key={loan.id} style={[styles.loanCard, { borderLeftColor: Colors.primary, borderLeftWidth: 3 }]}>
                  <View style={styles.cardHeader}>
                    <MaterialIcons name="receipt" size={16} color={Colors.primary} />
                    <Text style={styles.cardTitle}>BTNG Sovereign Loan</Text>
                    <View style={[styles.riskBadge, {
                      backgroundColor: loan.riskLevel === 'LOW' ? Colors.successBg : loan.riskLevel === 'MEDIUM' ? Colors.warningBg : Colors.errorBg,
                      borderColor: (loan.riskLevel === 'LOW' ? Colors.success : loan.riskLevel === 'MEDIUM' ? Colors.warning : Colors.error) + '44',
                    }]}>
                      <Text style={[styles.riskBadgeText, {
                        color: loan.riskLevel === 'LOW' ? Colors.success : loan.riskLevel === 'MEDIUM' ? Colors.warning : Colors.error,
                      }]}>{loan.riskLevel} RISK</Text>
                    </View>
                  </View>
                  {[
                    { label: 'Principal',    value: `$${Number(loan.principal).toFixed(2)}`,  color: Colors.primary },
                    { label: 'Interest',     value: `$${Number(loan.interest).toFixed(2)}`,   color: Colors.warning },
                    { label: 'Total Due',    value: `$${Number(loan.total_due).toFixed(2)}`,  color: Colors.error },
                    { label: 'APR Rate',     value: `${Number(loan.rate_apr).toFixed(1)}%`,   color: undefined },
                    { label: 'LTV',          value: `${Number(loan.ltv).toFixed(0)}%`,        color: undefined },
                    { label: 'Currency',     value: loan.currency,                            color: Colors.primary },
                    { label: 'Due Date',     value: loan.due_date,                            color: Colors.warning },
                  ].map(row => (
                    <View key={row.label} style={styles.loanDetailRow}>
                      <Text style={styles.loanDetailLabel}>{row.label}</Text>
                      <Text style={[styles.loanDetailValue, row.color ? { color: row.color } : {}]}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <View style={styles.section}>
            {loansLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.loadingText}>Loading history…</Text>
              </View>
            ) : loanHistory.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="history" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Loan History</Text>
                <Text style={styles.emptySub}>Your loan applications will appear here.</Text>
              </View>
            ) : (
              loanHistory.map((loan, i) => (
                <View key={loan.id ?? i} style={styles.historyRow}>
                  <View style={[styles.historyIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                    <MaterialIcons name="account-balance" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.historyTitle}>Loan · ${Number(loan.principal).toFixed(2)}</Text>
                    <Text style={styles.historyMeta}>Due: {loan.due_date} · APR: {Number(loan.rate_apr).toFixed(1)}%</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[styles.historyValue, { color: Colors.error }]}>-${Number(loan.total_due).toFixed(2)}</Text>
                    <Text style={styles.historyDate}>{new Date(loan.created_at ?? Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  aiPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  aiDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  aiPillText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, paddingHorizontal: Spacing.xl, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  bannerText: { flex: 1, fontSize: 9, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tabScrollWrap: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabScrollContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  section: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, gap: Spacing.md },
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  // Auth / Generate
  authCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  authTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  authSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  authBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  authBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  generateCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.lg },
  generateTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  generateSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, paddingHorizontal: Spacing.xxl, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  generateBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Generating State
  generatingCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md },
  generatingTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  generatingSub: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, includeFontPadding: false },
  genStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  genStepText: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },

  // Score Card
  scoreCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  kpiCell: { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 3 },
  kpiLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  kpiValue: { fontSize: 20, fontWeight: FontWeight.heavy, includeFontPadding: false },
  kpiSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  loanStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1 },
  loanStatusText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  applyNowBtn: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5 },
  applyNowText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  genTimestamp: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Factors
  factorLegend: { flexDirection: 'row', gap: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  factorLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  factorLegendDot: { width: 7, height: 7, borderRadius: 3.5 },
  factorLegendText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Recommendations
  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 4, flexShrink: 0 },
  recText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },

  refreshScoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, paddingVertical: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  refreshScoreBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Credit Summary
  creditSummaryCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  aprBadge: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  creditSummaryRow: { flexDirection: 'row' },
  creditSummaryCell: { flex: 1, alignItems: 'center', gap: 3 },
  creditSummarySep: { width: 1, backgroundColor: Colors.border },
  creditSummaryLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  creditSummaryValue: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Loans
  loanCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  riskBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  riskBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  loanDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border },
  loanDetailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  loanDetailValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  // Empty / Loading
  emptyCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  loadingWrap: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  // History
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  historyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  historyTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  historyMeta: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  historyRight: { alignItems: 'flex-end', gap: 3 },
  historyValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  historyDate: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});
