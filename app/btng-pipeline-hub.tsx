import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { usePipelineHub } from '@/hooks/usePipelineHub';
import { ActivityEvent, PipelineStats } from '@/services/pipelineHubService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Pipeline config ──────────────────────────────────────────────────────────

const PIPELINES = [
  {
    id: 'verification',
    label: 'Verification Pipeline',
    tagline: 'Sovereign Identity Kernel',
    icon: 'verified-user',
    color: '#3B82F6',
    stages: 7,
    route: '/btng-verification-pipeline',
    stageLabels: ['Upload', 'Hash', 'Oracle', 'KYC', 'Cert', 'Equity', 'Autopilot'],
    statKey: 'verification' as const,
    metricLabel: 'Verifications',
    successLabel: 'Verified',
    failLabel: 'Failed',
    badge: 'Identity KYC',
  },
  {
    id: 'minting',
    label: 'Minting Pipeline',
    tagline: 'Sovereign Monetary Kernel',
    icon: 'flash-on',
    color: '#D4A017',
    stages: 10,
    route: '/btng-minting-pipeline',
    stageLabels: ['Intent', 'Equity', 'Caps', 'Risk', 'LTV', 'Intent Build', 'PreCheck', 'Execute', 'Ledger', 'Autopilot'],
    statKey: 'minting' as const,
    metricLabel: 'Mint Events',
    successLabel: 'Minted',
    failLabel: 'Failed',
    badge: 'btngd v1.0',
  },
  {
    id: 'certificate',
    label: 'Certificate Engine',
    tagline: 'BTNG Sovereign NFT Certificates',
    icon: 'workspace-premium',
    color: '#22C55E',
    stages: 6,
    route: '/btng-product-engine',
    stageLabels: ['Select', 'Grade', 'Fingerprint', 'NFT Metadata', 'Issue', 'Activate'],
    statKey: 'certificate' as const,
    metricLabel: 'Certificates',
    successLabel: 'Active',
    failLabel: 'Expired',
    badge: 'NFT · Gold',
  },
];

// ── Activity type config ───────────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  verification: { icon: 'verified-user',    color: '#3B82F6', label: 'Verification' },
  minting:      { icon: 'flash-on',         color: '#D4A017', label: 'Minting'      },
  certificate:  { icon: 'workspace-premium', color: '#22C55E', label: 'Certificate'  },
};

const STATUS_COLOR: Record<string, string> = {
  completed: '#22C55E',
  active:    '#22C55E',
  verified:  '#22C55E',
  pending:   '#F59E0B',
  failed:    '#EF4444',
  expired:   '#EF4444',
  revoked:   '#EF4444',
};

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function BtngPipelineHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { verification, minting, certificate, activity, loading, error, reload, lastRefreshed } = usePipelineHub();

  const overallTotal = verification.total + minting.total + certificate.total;
  const overallSuccess = verification.success + minting.success + certificate.success;
  const overallRate = overallTotal > 0 ? Math.round((overallSuccess / overallTotal) * 100) : 0;

  const formatTs = (ts: string | null) => {
    if (!ts) return 'Never run';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const statsMap: Record<string, PipelineStats> = { verification, minting, certificate };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pipeline Hub</Text>
          <Text style={styles.headerSub}>BituncoinOS · Sovereign Kernel Orchestrator</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={reload} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <MaterialIcons name="refresh" size={18} color={Colors.textMuted} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={Colors.primary} />}
      >
        {/* ── Hero Banner ── */}
        <View style={styles.heroBanner}>
          <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.heroCoin} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>BituncoinOS Pipeline Hub</Text>
            <Text style={styles.heroSub}>3 Active Kernels · btngd v1.0 · Sovereign Execution</Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{overallTotal}</Text>
                <Text style={styles.heroStatLbl}>Executions</Text>
              </View>
              <View style={styles.heroStatDiv} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatVal, { color: '#22C55E' }]}>{overallRate}%</Text>
                <Text style={styles.heroStatLbl}>Success</Text>
              </View>
              <View style={styles.heroStatDiv} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatVal, { color: Colors.primary }]}>23</Text>
                <Text style={styles.heroStatLbl}>Stages Total</Text>
              </View>
            </View>
          </View>
          <View style={styles.liveWrap}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {/* ── Overall health bar ── */}
        <View style={styles.healthWrap}>
          <View style={styles.healthRow}>
            <Text style={styles.healthLabel}>Overall Pipeline Health</Text>
            <Text style={[styles.healthPct, { color: overallRate >= 80 ? '#22C55E' : overallRate >= 50 ? '#F59E0B' : '#EF4444' }]}>
              {overallRate}%
            </Text>
          </View>
          <View style={styles.healthBar}>
            <View style={[styles.healthFill, {
              width: `${overallRate}%` as any,
              backgroundColor: overallRate >= 80 ? '#22C55E' : overallRate >= 50 ? '#F59E0B' : '#EF4444',
            }]} />
          </View>
          <Text style={styles.healthSub}>
            Last refreshed: {formatTs(lastRefreshed)}
          </Text>
        </View>

        {/* ── Pipeline Cards ── */}
        <Text style={styles.sectionLabel}>PIPELINE KERNELS</Text>
        {PIPELINES.map(pipeline => {
          const stats = statsMap[pipeline.statKey];
          return (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              stats={stats}
              formatTs={formatTs}
              onPress={() => router.push(pipeline.route as any)}
            />
          );
        })}

        {/* ── Activity Feed ── */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.sectionLabel}>COMBINED ACTIVITY FEED</Text>
            <View style={styles.activityCount}>
              <Text style={styles.activityCountText}>{activity.length}</Text>
            </View>
          </View>

          {loading && activity.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.loadingText}>Loading activity...</Text>
            </View>
          ) : activity.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialIcons name="timeline" size={44} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Activity Yet</Text>
              <Text style={styles.emptySub}>Run any pipeline to see events here</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push('/btng-verification-pipeline' as any)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="verified-user" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Start with Verification</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.feedList}>
              {activity.map((event, idx) => (
                <ActivityRow key={`${event.id}-${idx}`} event={event} formatTs={formatTs} isLast={idx === activity.length - 1} />
              ))}
            </View>
          )}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.quickGrid}>
          {[
            { label: 'Run Verification', icon: 'verified-user', color: '#3B82F6', route: '/btng-verification-pipeline' },
            { label: 'Run Minting',      icon: 'flash-on',      color: '#D4A017', route: '/btng-minting-pipeline'      },
            { label: 'Product Engine',   icon: 'auto-awesome',  color: '#22C55E', route: '/btng-product-engine'         },
            { label: 'Cert Scanner',     icon: 'qr-code-scanner', color: '#9945FF', route: '/cert-scanner'             },
          ].map(action => (
            <TouchableOpacity
              key={action.label}
              style={[styles.quickCard, { borderColor: action.color + '44' }]}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.85}
            >
              <View style={[styles.quickIcon, { backgroundColor: action.color + '18', borderColor: action.color + '44' }]}>
                <MaterialIcons name={action.icon as any} size={22} color={action.color} />
              </View>
              <Text style={[styles.quickLabel, { color: action.color }]} numberOfLines={2}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Error ── */}
        {error ? (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Pipeline Card ────────────────────────────────────────────────────────────

function PipelineCard({
  pipeline, stats, formatTs, onPress
}: {
  pipeline: typeof PIPELINES[number];
  stats: PipelineStats;
  formatTs: (ts: string | null) => string;
  onPress: () => void;
}) {
  const { color, stages, stageLabels } = pipeline;
  const hasRun = stats.total > 0;

  return (
    <TouchableOpacity style={[styles.pCard, { borderColor: color + '44' }]} onPress={onPress} activeOpacity={0.88}>
      {/* Card Header */}
      <View style={styles.pCardHeader}>
        <View style={[styles.pCardIcon, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <MaterialIcons name={pipeline.icon as any} size={26} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.pCardTitleRow}>
            <Text style={[styles.pCardTitle, { color }]}>{pipeline.label}</Text>
            <View style={[styles.pCardBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
              <Text style={[styles.pCardBadgeText, { color }]}>{pipeline.badge}</Text>
            </View>
          </View>
          <Text style={styles.pCardTagline}>{pipeline.tagline}</Text>
        </View>
        <View style={styles.pCardArrow}>
          <MaterialIcons name="arrow-forward-ios" size={14} color={color} />
        </View>
      </View>

      {/* Stage strip */}
      <View style={styles.pStageStrip}>
        {stageLabels.map((label, i) => (
          <View key={i} style={styles.pStageItem}>
            <View style={[styles.pStageDot, { backgroundColor: hasRun ? color : Colors.bgElevated, borderColor: color + '55' }]} />
            <Text style={[styles.pStageLabel, { color: hasRun ? color + 'CC' : Colors.textMuted }]} numberOfLines={1}>{label}</Text>
            {i < stageLabels.length - 1 && (
              <View style={[styles.pStageLine, { backgroundColor: hasRun ? color + '44' : Colors.border }]} />
            )}
          </View>
        ))}
      </View>
      <Text style={[styles.pStageCount, { color: color + 'BB' }]}>{stages}-Stage Kernel · btngd Execution</Text>

      {/* Divider */}
      <View style={[styles.pDivider, { backgroundColor: color + '22' }]} />

      {/* Stats Row */}
      <View style={styles.pStatsRow}>
        {/* Last run */}
        <View style={styles.pStat}>
          <MaterialIcons name="schedule" size={13} color={Colors.textMuted} />
          <View>
            <Text style={styles.pStatLabel}>Last Run</Text>
            <Text style={[styles.pStatVal, { color: hasRun ? Colors.textPrimary : Colors.textMuted }]}>
              {formatTs(stats.lastTimestamp)}
            </Text>
          </View>
        </View>

        <View style={styles.pStatDiv} />

        {/* Total */}
        <View style={styles.pStat}>
          <MaterialIcons name="receipt-long" size={13} color={Colors.textMuted} />
          <View>
            <Text style={styles.pStatLabel}>{pipeline.metricLabel}</Text>
            <Text style={[styles.pStatVal, { color: Colors.textPrimary }]}>{stats.total}</Text>
          </View>
        </View>

        <View style={styles.pStatDiv} />

        {/* Success / Fail */}
        <View style={styles.pStat}>
          <MaterialIcons name="pie-chart" size={13} color={Colors.textMuted} />
          <View>
            <Text style={styles.pStatLabel}>Success / Fail</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[styles.pStatVal, { color: '#22C55E' }]}>{stats.success}</Text>
              <Text style={[styles.pStatVal, { color: Colors.textMuted }]}>/</Text>
              <Text style={[styles.pStatVal, { color: stats.failed > 0 ? '#EF4444' : Colors.textMuted }]}>{stats.failed}</Text>
            </View>
          </View>
        </View>

        <View style={styles.pStatDiv} />

        {/* Success rate */}
        <View style={styles.pStat}>
          <MaterialIcons name="trending-up" size={13} color={Colors.textMuted} />
          <View>
            <Text style={styles.pStatLabel}>Success Rate</Text>
            <Text style={[styles.pStatVal, {
              color: stats.successRate >= 80 ? '#22C55E' : stats.successRate >= 50 ? '#F59E0B' : Colors.textMuted
            }]}>
              {stats.total > 0 ? `${stats.successRate}%` : '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Success rate bar */}
      {stats.total > 0 && (
        <View style={styles.pRateWrap}>
          <View style={styles.pRateBar}>
            <View style={[styles.pRateFill, {
              width: `${stats.successRate}%` as any,
              backgroundColor: stats.successRate >= 80 ? '#22C55E' : stats.successRate >= 50 ? '#F59E0B' : '#EF4444',
            }]} />
          </View>
        </View>
      )}

      {/* Run CTA */}
      <TouchableOpacity style={[styles.pRunBtn, { backgroundColor: color + '18', borderColor: color + '44' }]} onPress={onPress} activeOpacity={0.85}>
        <MaterialIcons name="play-arrow" size={16} color={color} />
        <Text style={[styles.pRunBtnText, { color }]}>Run Pipeline →</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Activity Row ─────────────────────────────────────────────────────────────

function ActivityRow({ event, formatTs, isLast }: { event: ActivityEvent; formatTs: (ts: string | null) => string; isLast: boolean }) {
  const cfg = ACTIVITY_CONFIG[event.type] ?? ACTIVITY_CONFIG.verification;
  const statusColor = STATUS_COLOR[event.status] ?? Colors.textMuted;

  return (
    <View style={[styles.feedRow, !isLast && styles.feedRowBorder]}>
      {/* Left: connector */}
      <View style={styles.feedLeft}>
        <View style={[styles.feedIcon, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}>
          <MaterialIcons name={cfg.icon as any} size={15} color={cfg.color} />
        </View>
        {!isLast && <View style={[styles.feedConnector, { backgroundColor: cfg.color + '22' }]} />}
      </View>

      {/* Body */}
      <View style={styles.feedBody}>
        <View style={styles.feedTitleRow}>
          <Text style={[styles.feedTitle, { color: cfg.color }]}>{event.title}</Text>
          <View style={[styles.feedStatusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
            <View style={[styles.feedStatusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.feedStatusText, { color: statusColor }]}>{event.status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.feedSub}>{event.subtitle}</Text>
        <View style={styles.feedMeta}>
          <MaterialIcons name="schedule" size={11} color={Colors.textMuted} />
          <Text style={styles.feedTime}>{formatTs(event.timestamp)}</Text>
          {event.value !== undefined && event.value > 0 && (
            <>
              <View style={styles.feedMetaDot} />
              <Text style={[styles.feedMetaVal, { color: cfg.color }]}>
                {typeof event.value === 'number'
                  ? event.value > 100
                    ? event.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : event.value.toString()
                  : event.value} {event.valueUnit}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Type badge */}
      <View style={[styles.feedTypeBadge, { backgroundColor: cfg.color + '12', borderColor: cfg.color + '33' }]}>
        <Text style={[styles.feedTypeBadgeText, { color: cfg.color }]}>{cfg.label.slice(0, 4).toUpperCase()}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  iconBtn:        { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub:      { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  scrollContent:  { paddingBottom: 24 },

  // Hero Banner
  heroBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.primary + '66', padding: Spacing.lg, marginHorizontal: Spacing.xl, gap: Spacing.md, marginBottom: Spacing.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  heroCoin:       { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: Colors.primary, flexShrink: 0 },
  heroTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub:        { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2, marginBottom: 8 },
  heroStatsRow:   { flexDirection: 'row', alignItems: 'center', gap: 0 },
  heroStat:       { alignItems: 'center', paddingHorizontal: 8 },
  heroStatVal:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  heroStatLbl:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  heroStatDiv:    { width: 1, height: 24, backgroundColor: Colors.border },
  liveWrap:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22C55E18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#22C55E44', alignSelf: 'flex-start' },
  liveDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  liveText:       { fontSize: 9, fontWeight: FontWeight.heavy, color: '#22C55E', letterSpacing: 0.8, includeFontPadding: false },

  // Health bar
  healthWrap:     { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, gap: 6 },
  healthRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  healthLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  healthPct:      { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  healthBar:      { height: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, overflow: 'hidden' },
  healthFill:     { height: '100%', borderRadius: Radius.full },
  healthSub:      { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Section label
  sectionLabel:   { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, includeFontPadding: false },

  // Pipeline card
  pCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.lg, marginHorizontal: Spacing.xl, marginBottom: Spacing.lg, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  pCardHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pCardIcon:      { width: 50, height: 50, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pCardTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pCardTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  pCardTagline:   { fontSize: 11, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  pCardBadge:     { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  pCardBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  pCardArrow:     { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Stage strip
  pStageStrip:    { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  pStageItem:     { flex: 1, alignItems: 'center', flexDirection: 'row' },
  pStageDot:      { width: 7, height: 7, borderRadius: 4, borderWidth: 1, flexShrink: 0 },
  pStageLine:     { flex: 1, height: 1.5 },
  pStageLabel:    { display: 'none' }, // hidden on mobile - too small
  pStageCount:    { fontSize: 9, includeFontPadding: false, letterSpacing: 0.5 },

  // Divider
  pDivider:       { height: 1 },

  // Stats row
  pStatsRow:      { flexDirection: 'row', alignItems: 'center' },
  pStat:          { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  pStatDiv:       { width: 1, height: 32, backgroundColor: Colors.border },
  pStatLabel:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  pStatVal:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Rate bar
  pRateWrap:      { gap: 3 },
  pRateBar:       { height: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, overflow: 'hidden' },
  pRateFill:      { height: '100%', borderRadius: Radius.full },

  // Run button
  pRunBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: 10 },
  pRunBtnText:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Activity section
  activitySection: { marginBottom: Spacing.lg },
  activityHeader:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, gap: 8 },
  activityCount:   { backgroundColor: Colors.primary + '22', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  activityCountText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  // Feed
  feedList:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, marginHorizontal: Spacing.xl, overflow: 'hidden' },
  feedRow:        { flexDirection: 'row', padding: Spacing.md, gap: Spacing.md, alignItems: 'flex-start' },
  feedRowBorder:  { borderBottomWidth: 1, borderBottomColor: Colors.border },
  feedLeft:       { alignItems: 'center', width: 32 },
  feedIcon:       { width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feedConnector:  { width: 2, flex: 1, marginTop: 4, minHeight: 12 },
  feedBody:       { flex: 1, gap: 3 },
  feedTitleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  feedTitle:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  feedSub:        { fontSize: 11, color: Colors.textSecondary, includeFontPadding: false },
  feedMeta:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  feedTime:       { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  feedMetaDot:    { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.textMuted },
  feedMetaVal:    { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  feedStatusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  feedStatusDot:  { width: 5, height: 5, borderRadius: 3 },
  feedStatusText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  feedTypeBadge:  { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, alignSelf: 'flex-start', flexShrink: 0 },
  feedTypeBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },

  // Loading / empty
  loadingBox:     { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl, gap: 8 },
  loadingText:    { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  emptyBox:       { alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.xl, gap: 10, marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border },
  emptyTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  emptySub:       { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  emptyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3B82F6', borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 11, marginTop: 4 },
  emptyBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },

  // Quick actions
  quickGrid:      { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.lg },
  quickCard:      { width: '47%', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, alignItems: 'center', gap: 8 },
  quickIcon:      { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quickLabel:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, textAlign: 'center', includeFontPadding: false },

  // Error
  errorBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: Spacing.xl, backgroundColor: '#EF444412', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#EF444433' },
  errorText:      { flex: 1, fontSize: FontSize.sm, color: '#EF4444', includeFontPadding: false },
});
