import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ZoneEngine } from '@/constants/zoneEngine';
import type { ZoneResolution } from '@/constants/zoneResolver';
import type { ZoneRuleDecision } from '@/constants/zoneRules';
import { ZONES } from '@/constants/zones';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

// ── Engine singleton ──────────────────────────────────────────────────────────
const engine = new ZoneEngine();

// ── Zone metadata ─────────────────────────────────────────────────────────────
const ZONE_META: Record<string, {
  color: string;
  flag: string;
  countries: string[];
  region: string;
  icon: string;
}> = {
  AFRICA_CRYPTO_ZONE: {
    color: '#D4A017',
    flag: '🌍',
    countries: ['GH', 'NG', 'KE', 'TZ', 'ZA', 'UG', 'ET', 'RW', 'CI', 'SN'],
    region: 'Sub-Saharan & West Africa',
    icon: 'public',
  },
  EU_CRYPTO_ZONE: {
    color: '#3B82F6',
    flag: '🇪🇺',
    countries: ['GB', 'FR', 'DE', 'NL', 'ES', 'IT', 'SE', 'PL', 'PT', 'AT'],
    region: 'European Union + UK',
    icon: 'euro',
  },
  US_CRYPTO_ZONE: {
    color: '#10B981',
    flag: '🇺🇸',
    countries: ['US', 'CA', 'MX'],
    region: 'North America',
    icon: 'attach-money',
  },
  GLOBAL_LIGHT_ZONE: {
    color: '#8B5CF6',
    flag: '🌐',
    countries: ['ALL_OTHER', 'KYC=NONE'],
    region: 'Global Fallback (Non-KYC)',
    icon: 'language',
  },
};

const ACTIONS: Array<'SEND' | 'SWAP' | 'WITHDRAW' | 'DEPOSIT'> = ['SEND', 'SWAP', 'WITHDRAW', 'DEPOSIT'];

// ── Live pulse dot ────────────────────────────────────────────────────────────
function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[pd.dot, { backgroundColor: color, opacity: anim }]} />;
}
const pd = StyleSheet.create({ dot: { width: 8, height: 8, borderRadius: 4 } });

// ── Single Zone Card ──────────────────────────────────────────────────────────
function ZoneLiveCard({
  zone,
  activeZoneId,
  evalAction,
  evalAsset,
  evalAmount,
}: {
  zone: typeof ZONES[0];
  activeZoneId: string | null;
  evalAction: 'SEND' | 'SWAP' | 'WITHDRAW' | 'DEPOSIT';
  evalAsset: string;
  evalAmount: string;
}) {
  const meta = ZONE_META[zone.id] ?? { color: Colors.primary, flag: '🌐', countries: [], region: '', icon: 'language' };
  const isActive = activeZoneId === zone.id;
  const parsedAmt = parseFloat(evalAmount) || 0;

  let decision: ZoneRuleDecision | null = null;
  if (parsedAmt > 0 && evalAsset.trim()) {
    try {
      decision = engine.evaluateRules({
        userId: 'live-preview',
        zoneId: zone.id as any,
        assetId: evalAsset.trim(),
        amount: parsedAmt,
        action: evalAction as any,
      });
    } catch { /* ignore */ }
  }

  const allowed = decision?.allowed ?? null;
  const limitForAction =
    evalAction === 'SEND'     ? zone.maxSendAmount :
    evalAction === 'SWAP'     ? zone.maxSwapAmount :
    evalAction === 'WITHDRAW' ? zone.maxWithdrawAmount :
    evalAction === 'DEPOSIT'  ? zone.maxSendAmount : 0;

  const usagePct = parsedAmt > 0 && limitForAction > 0
    ? Math.min(100, (parsedAmt / limitForAction) * 100)
    : 0;

  return (
    <View style={[zc.card, { borderColor: meta.color + (isActive ? 'CC' : '44') }, isActive && { borderWidth: 2 }]}>
      {/* Header */}
      <View style={[zc.header, { backgroundColor: meta.color + '12' }]}>
        <View style={zc.headerLeft}>
          <PulseDot color={meta.color} />
          <Text style={[zc.zoneId, { color: meta.color }]}>{zone.id.replace(/_/g, ' ')}</Text>
        </View>
        <View style={zc.headerRight}>
          <Text style={zc.flag}>{meta.flag}</Text>
          {isActive && (
            <View style={[zc.activePill, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
              <MaterialIcons name="my-location" size={10} color={meta.color} />
              <Text style={[zc.activePillText, { color: meta.color }]}>YOUR ZONE</Text>
            </View>
          )}
        </View>
      </View>

      {/* Region + node */}
      <View style={zc.infoRow}>
        <MaterialIcons name={meta.icon as any} size={13} color={meta.color} />
        <Text style={zc.region}>{meta.region}</Text>
      </View>
      <View style={zc.nodeRow}>
        <MaterialIcons name="dns" size={11} color={Colors.textMuted} />
        <Text style={zc.nodeUrl} numberOfLines={1}>{zone.nodeUrl}</Text>
      </View>

      {/* Countries */}
      <View style={zc.countriesRow}>
        {meta.countries.slice(0, 6).map(c => (
          <View key={c} style={[zc.countryChip, { backgroundColor: meta.color + '15', borderColor: meta.color + '44' }]}>
            <Text style={[zc.countryChipText, { color: meta.color }]}>{c}</Text>
          </View>
        ))}
        {meta.countries.length > 6 && (
          <View style={[zc.countryChip, { backgroundColor: meta.color + '10', borderColor: meta.color + '33' }]}>
            <Text style={[zc.countryChipText, { color: meta.color }]}>+{meta.countries.length - 6}</Text>
          </View>
        )}
      </View>

      {/* Limit bars */}
      <View style={zc.limitsSection}>
        {[
          { label: 'SEND',     val: zone.maxSendAmount,     isEval: evalAction === 'SEND' },
          { label: 'SWAP',     val: zone.maxSwapAmount,     isEval: evalAction === 'SWAP' },
          { label: 'WITHDRAW', val: zone.maxWithdrawAmount, isEval: evalAction === 'WITHDRAW' },
        ].map(item => {
          const pct = item.isEval && parsedAmt > 0 && item.val > 0
            ? Math.min(100, (parsedAmt / item.val) * 100) : 0;
          const overLimit = pct >= 100;
          return (
            <View key={item.label} style={zc.limitRow}>
              <Text style={[zc.limitLabel, item.isEval && { color: meta.color }]}>{item.label}</Text>
              <View style={zc.limitBarWrap}>
                <View style={[zc.limitBar, {
                  width: `${Math.min(100, pct)}%` as any,
                  backgroundColor: overLimit ? '#EF4444' : meta.color,
                }]} />
              </View>
              <Text style={[zc.limitVal, overLimit && { color: '#EF4444' }]}>
                {item.val >= 1000 ? `${(item.val / 1000).toFixed(0)}K` : item.val}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Rule decision */}
      {decision !== null ? (
        <View style={[zc.decisionBanner, allowed ? zc.decisionAllowed : zc.decisionBlocked]}>
          <MaterialIcons
            name={allowed ? 'check-circle' : 'cancel'}
            size={16}
            color={allowed ? Colors.success : '#EF4444'}
          />
          <View style={{ flex: 1 }}>
            <Text style={[zc.decisionTitle, { color: allowed ? Colors.success : '#EF4444' }]}>
              {allowed ? `${evalAction} ALLOWED` : `${evalAction} BLOCKED`}
            </Text>
            {!allowed && decision.reason ? (
              <Text style={zc.decisionReason} numberOfLines={2}>{decision.reason}</Text>
            ) : null}
            {!allowed && decision.maxAmount ? (
              <Text style={zc.decisionMax}>Max: {decision.maxAmount.toLocaleString()}</Text>
            ) : null}
          </View>
          {parsedAmt > 0 && limitForAction > 0 ? (
            <View style={[zc.usagePill, { backgroundColor: allowed ? Colors.successBg : '#EF444420' }]}>
              <Text style={[zc.usagePct, { color: allowed ? Colors.success : '#EF4444' }]}>
                {usagePct.toFixed(0)}%
              </Text>
              <Text style={[zc.usageOf, { color: allowed ? Colors.success : '#EF4444' }]}>used</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const zc = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    gap: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '88',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  zoneId: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  flag: { fontSize: 18 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  activePillText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.4 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  region: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  nodeUrl: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flex: 1 },
  countriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  countryChip: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  countryChipText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  limitsSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '77',
    gap: 6,
  },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  limitLabel: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    width: 56,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  limitBarWrap: {
    flex: 1,
    height: 5,
    backgroundColor: Colors.bgElevated,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  limitBar: { height: 5, borderRadius: 3 },
  limitVal: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    includeFontPadding: false,
    minWidth: 30,
    textAlign: 'right',
  },
  decisionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '77',
  },
  decisionAllowed: { backgroundColor: '#10B98110' },
  decisionBlocked: { backgroundColor: '#EF444410' },
  decisionTitle: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  decisionReason: { fontSize: 9, color: '#FCA5A5', includeFontPadding: false, marginTop: 2 },
  decisionMax: { fontSize: 9, color: '#FCA5A5', fontWeight: FontWeight.bold, includeFontPadding: false, marginTop: 1 },
  usagePill: {
    alignItems: 'center',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 1,
  },
  usagePct: { fontSize: 12, fontWeight: FontWeight.heavy, includeFontPadding: false },
  usageOf: { fontSize: 8, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BTNGZoneEngineDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Auto-detect current user's zone
  const [userZoneId, setUserZoneId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    try {
      const p = user as any;
      const country: string = p?.country ?? p?.registeredCountry ?? 'GH';
      const rawKyc: string = p?.kyc_status ?? 'pending';
      const kycLevel: 'NONE' | 'BASIC' | 'FULL' =
        rawKyc === 'approved' ? 'FULL' :
        rawKyc === 'pending'  ? 'BASIC' : 'NONE';
      const res = engine.resolveZone({ userId: user.id, registeredCountry: country, kycLevel, userTier: 'STANDARD' });
      setUserZoneId(res.zoneId);
    } catch { /* ignore */ }
  }, [user?.id]);

  // Rule evaluator (shared across all zone cards)
  const [evalAction, setEvalAction] = useState<'SEND' | 'SWAP' | 'WITHDRAW' | 'DEPOSIT'>('SEND');
  const [evalAsset, setEvalAsset] = useState('BTNGG');
  const [evalAmount, setEvalAmount] = useState('500');

  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);
  const isTablet = dims.width >= 768;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <MaterialIcons name="travel-explore" size={20} color={Colors.primary} />
          <Text style={s.headerTitle}>Global Zone Engine</Text>
        </View>
        <View style={s.headerLiveBadge}>
          <PulseDot color={Colors.success} />
          <Text style={s.headerLiveText}>LIVE</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Your Zone Detected ──────────────────────────────────────────── */}
        {userZoneId ? (
          <View style={[s.yourZoneBanner, { borderColor: (ZONE_META[userZoneId]?.color ?? Colors.primary) + '66' }]}>
            <MaterialIcons name="my-location" size={16} color={ZONE_META[userZoneId]?.color ?? Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.yourZoneLabel, { color: ZONE_META[userZoneId]?.color ?? Colors.primary }]}>
                YOUR ACTIVE ZONE
              </Text>
              <Text style={s.yourZoneName}>
                {userZoneId.replace(/_/g, ' ')}
              </Text>
            </View>
            <Text style={s.yourZoneFlag}>{ZONE_META[userZoneId]?.flag ?? '🌐'}</Text>
          </View>
        ) : null}

        {/* ── Rule Evaluator ─────────────────────────────────────────────── */}
        <View style={s.evalCard}>
          <View style={s.evalHeader}>
            <View style={s.evalIconWrap}>
              <MaterialIcons name="rule" size={18} color={Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.evalTitle}>Live Rule Evaluator</Text>
              <Text style={s.evalSub}>Applied across all zones simultaneously</Text>
            </View>
          </View>

          {/* Action pills */}
          <View style={s.actionRow}>
            {ACTIONS.map(a => (
              <TouchableOpacity
                key={a}
                style={[s.actionPill, evalAction === a && s.actionPillActive]}
                onPress={() => setEvalAction(a)}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={a === 'SEND' ? 'send' : a === 'SWAP' ? 'swap-horiz' : a === 'WITHDRAW' ? 'output' : 'input'}
                  size={12}
                  color={evalAction === a ? '#060608' : Colors.textMuted}
                />
                <Text style={[s.actionPillText, evalAction === a && s.actionPillTextActive]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Inputs */}
          <View style={s.evalInputRow}>
            <View style={[s.evalInputGroup, { flex: 1 }]}>
              <Text style={s.evalInputLabel}>ASSET</Text>
              <TextInput
                style={s.evalInput}
                value={evalAsset}
                onChangeText={setEvalAsset}
                placeholder="BTNGG"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
            </View>
            <View style={[s.evalInputGroup, { flex: 1.2 }]}>
              <Text style={s.evalInputLabel}>AMOUNT</Text>
              <TextInput
                style={s.evalInput}
                value={evalAmount}
                onChangeText={setEvalAmount}
                placeholder="500"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={s.evalHintRow}>
            <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
            <Text style={s.evalHint}>Changes apply instantly to all zone cards below</Text>
          </View>
        </View>

        {/* ── All Zones Grid ─────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>ALL ACTIVE ZONES  ·  {ZONES.length} LIVE</Text>
        <View style={isTablet ? s.zonesGrid : s.zonesList}>
          {ZONES.map(zone => (
            <View key={zone.id} style={isTablet ? s.zoneGridItem : undefined}>
              <ZoneLiveCard
                zone={zone}
                activeZoneId={userZoneId}
                evalAction={evalAction}
                evalAsset={evalAsset}
                evalAmount={evalAmount}
              />
            </View>
          ))}
        </View>

        {/* ── Summary Matrix ─────────────────────────────────────────────── */}
        <View style={s.matrixCard}>
          <View style={s.matrixHeader}>
            <MaterialIcons name="grid-on" size={16} color={Colors.primary} />
            <Text style={s.matrixTitle}>Zone Limit Matrix</Text>
          </View>
          {/* Column headers */}
          <View style={s.matrixRow}>
            <Text style={[s.matrixCell, s.matrixHeadCell, { flex: 1.8 }]}>ZONE</Text>
            <Text style={[s.matrixCell, s.matrixHeadCell]}>SEND</Text>
            <Text style={[s.matrixCell, s.matrixHeadCell]}>SWAP</Text>
            <Text style={[s.matrixCell, s.matrixHeadCell]}>OUT</Text>
          </View>
          {ZONES.map((zone, i) => {
            const meta = ZONE_META[zone.id];
            const isActive = userZoneId === zone.id;
            return (
              <View key={zone.id} style={[s.matrixRow, i % 2 === 0 && { backgroundColor: Colors.bgElevated + '44' }, isActive && { backgroundColor: (meta?.color ?? Colors.primary) + '12' }]}>
                <View style={[s.matrixCell, { flex: 1.8, flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                  <View style={[s.matrixDot, { backgroundColor: meta?.color ?? Colors.primary }]} />
                  <Text style={[s.matrixZoneName, { color: meta?.color ?? Colors.primary }]} numberOfLines={1}>
                    {zone.id.replace(/_ZONE|_CRYPTO/g, '').replace(/_/g, ' ')}
                  </Text>
                </View>
                <Text style={[s.matrixCell, s.matrixVal]}>
                  {zone.maxSendAmount >= 1000 ? `${(zone.maxSendAmount / 1000).toFixed(0)}K` : zone.maxSendAmount}
                </Text>
                <Text style={[s.matrixCell, s.matrixVal]}>
                  {zone.maxSwapAmount >= 1000 ? `${(zone.maxSwapAmount / 1000).toFixed(0)}K` : zone.maxSwapAmount}
                </Text>
                <Text style={[s.matrixCell, s.matrixVal]}>
                  {zone.maxWithdrawAmount >= 1000 ? `${(zone.maxWithdrawAmount / 1000).toFixed(0)}K` : zone.maxWithdrawAmount}
                </Text>
              </View>
            );
          })}
          <View style={s.matrixFooter}>
            <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
            <Text style={s.matrixFooterText}>Limits in BTNGG units · Gold coin special limit: 5,000 max per tx</Text>
          </View>
        </View>

        {/* ── Node Endpoints ─────────────────────────────────────────────── */}
        <View style={s.nodesCard}>
          <View style={s.matrixHeader}>
            <MaterialIcons name="dns" size={16} color={Colors.primary} />
            <Text style={s.matrixTitle}>Node Endpoints</Text>
          </View>
          {ZONES.map(zone => {
            const meta = ZONE_META[zone.id];
            return (
              <View key={zone.id} style={s.nodeEndpointRow}>
                <View style={[s.nodeEndpointDot, { backgroundColor: meta?.color ?? Colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.nodeEndpointZone, { color: meta?.color ?? Colors.primary }]}>
                    {zone.id.replace(/_/g, ' ')}
                  </Text>
                  <Text style={s.nodeEndpointUrl} numberOfLines={1}>{zone.nodeUrl}</Text>
                </View>
                <View style={[s.nodeStatusChip, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                  <PulseDot color={Colors.success} />
                  <Text style={s.nodeStatusText}>ACTIVE</Text>
                </View>
              </View>
            );
          })}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    fontSize: FontSize.lg, fontWeight: FontWeight.heavy,
    color: Colors.textPrimary, includeFontPadding: false,
  },
  headerLiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.successBg,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.success + '44',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  headerLiveText: {
    fontSize: 10, fontWeight: FontWeight.heavy,
    color: Colors.success, includeFontPadding: false, letterSpacing: 0.8,
  },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  yourZoneBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl, borderWidth: 1.5,
    padding: Spacing.md,
  },
  yourZoneLabel: {
    fontSize: 9, fontWeight: FontWeight.heavy,
    letterSpacing: 0.8, includeFontPadding: false,
  },
  yourZoneName: {
    fontSize: FontSize.md, fontWeight: FontWeight.heavy,
    color: Colors.textPrimary, includeFontPadding: false, marginTop: 2,
  },
  yourZoneFlag: { fontSize: 28 },

  evalCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.success + '44',
    overflow: 'hidden',
  },
  evalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.successBg + '55',
  },
  evalIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.successBg,
    borderWidth: 1, borderColor: Colors.success + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  evalTitle: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, includeFontPadding: false,
  },
  evalSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },

  actionRow: {
    flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
  },
  actionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  actionPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionPillText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  actionPillTextActive: { color: '#060608' },

  evalInputRow: {
    flexDirection: 'row', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
  },
  evalInputGroup: { gap: 5 },
  evalInputLabel: {
    fontSize: 9, fontWeight: FontWeight.heavy,
    color: Colors.textMuted, letterSpacing: 0.5,
  },
  evalInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4,
    fontSize: FontSize.sm, color: Colors.textPrimary,
    includeFontPadding: false,
  },
  evalHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
  },
  evalHint: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  sectionTitle: {
    fontSize: 10, fontWeight: FontWeight.heavy,
    color: Colors.textMuted, letterSpacing: 1,
    includeFontPadding: false,
    paddingHorizontal: 2,
  },

  zonesList: { gap: Spacing.md },
  zonesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  zoneGridItem: { width: '48%' },

  matrixCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  matrixHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.primaryGlow,
  },
  matrixTitle: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold,
    color: Colors.primary, includeFontPadding: false,
  },
  matrixRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '55',
  },
  matrixHeadCell: {
    fontSize: 9, fontWeight: FontWeight.heavy,
    color: Colors.textMuted, letterSpacing: 0.5,
  },
  matrixCell: {
    flex: 1, fontSize: 10,
    color: Colors.textSecondary,
    includeFontPadding: false,
    textAlign: 'center',
  },
  matrixDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  matrixZoneName: {
    fontSize: 10, fontWeight: FontWeight.heavy,
    includeFontPadding: false, flexShrink: 1,
  },
  matrixVal: {
    fontSize: 10, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, includeFontPadding: false,
    textAlign: 'center',
  },
  matrixFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    padding: Spacing.sm + 2, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.bgElevated,
  },
  matrixFooterText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  nodesCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  nodeEndpointRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3,
    borderTopWidth: 1, borderTopColor: Colors.border + '55',
  },
  nodeEndpointDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  nodeEndpointZone: {
    fontSize: 10, fontWeight: FontWeight.heavy,
    includeFontPadding: false,
  },
  nodeEndpointUrl: {
    fontSize: 9, color: Colors.textMuted,
    includeFontPadding: false, marginTop: 2,
  },
  nodeStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  nodeStatusText: {
    fontSize: 8, fontWeight: FontWeight.heavy,
    color: Colors.success, includeFontPadding: false, letterSpacing: 0.5,
  },
});
