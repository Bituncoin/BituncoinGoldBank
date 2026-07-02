/**
 * app/cloudflare-pages.tsx
 * Cloudflare Pages Deployments Manager
 *
 * Shows all Pages projects under the bituncoin account:
 *  • Project list — subdomain, custom domains, source repo, production branch
 *  • Latest deployment — status, commit hash, commit message, build duration
 *  • Deployment history per project (expandable, last 10)
 *  • Stage pipeline timeline (queued → clone → build → deploy)
 *  • Trigger Deploy button — POST /pages/projects/{name}/deployments
 *
 * Uses stored API token from cloudflareService.ts (same as other CF screens).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Animated, Easing,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import {
  getCFToken,
  listPagesProjects, listPagesDeployments, triggerPagesDeployment,
  deployDurationSec, formatDuration,
  type CloudflarePagesProject, type CloudflarePagesDeployment,
  type CloudflarePagesDeploymentStage,
} from '@/services/cloudflareService';

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_ACCOUNT_ID = 'e2d017e4674fbc13224b06b65209ebe1';

/** Known pages projects (fallback when API is unavailable or returns empty) */
const KNOWN_PROJECTS = [
  {
    name: 'patient-king-306d',
    subdomain: 'patient-king-306d.pages.dev',
    color: '#22C55E',
    icon: 'security',
    ago: '6 days ago',
    branch: 'main',
    repo: 'bituncoin/patient-king',
  },
  {
    name: 'btng-tiny-bar-1111',
    subdomain: 'btng-tiny-bar-1111.pages.dev',
    color: '#3B82F6',
    icon: 'bar-chart',
    ago: '2 months ago',
    branch: 'main',
    repo: 'bituncoin/btng-tiny-bar',
  },
  {
    name: 'sweet-wood-eabe',
    subdomain: 'sweet-wood-eabe.pages.dev',
    color: '#F59E0B',
    icon: 'code',
    ago: '3 months ago',
    branch: 'main',
    repo: 'bituncoin/sweet-wood',
  },
  {
    name: 'bituncoin',
    subdomain: 'bituncoin.pages.dev',
    color: '#8B5CF6',
    icon: 'currency-bitcoin',
    ago: '3 months ago',
    branch: 'main',
    repo: 'bituncoin/bituncoin',
  },
] as const;

// ─── Stage config ─────────────────────────────────────────────────────────────

type StageStatus = 'success' | 'failure' | 'active' | 'idle' | 'skipped';

const STAGE_META: Record<string, { label: string; icon: string }> = {
  queued:     { label: 'Queued',      icon: 'schedule'      },
  initialize: { label: 'Initialize',  icon: 'settings'      },
  clone_repo: { label: 'Clone Repo',  icon: 'file-download' },
  build:      { label: 'Build',       icon: 'build'         },
  deploy:     { label: 'Deploy',      icon: 'rocket-launch' },
};

const STAGE_STATUS_COLOR: Record<StageStatus, string> = {
  success: '#22C55E',
  failure: '#EF4444',
  active:  '#F59E0B',
  idle:    '#6B7280',
  skipped: '#9CA3AF',
};

// ─── Deploy status ────────────────────────────────────────────────────────────

type DeployStatus = 'success' | 'failure' | 'active' | 'idle' | 'canceled';

const DEPLOY_STATUS_CFG: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  success:  { color: '#22C55E', bg: '#22C55E10', border: '#22C55E44', icon: 'check-circle',   label: 'Success'  },
  failure:  { color: '#EF4444', bg: '#EF444410', border: '#EF444444', icon: 'cancel',          label: 'Failed'   },
  active:   { color: '#F59E0B', bg: '#F59E0B10', border: '#F59E0B44', icon: 'pending',         label: 'Building' },
  idle:     { color: '#6B7280', bg: '#6B728010', border: '#6B728044', icon: 'hourglass-empty', label: 'Idle'     },
  canceled: { color: '#9CA3AF', bg: '#9CA3AF10', border: '#9CA3AF44', icon: 'block',           label: 'Canceled' },
};

function getDeployStatusCfg(status?: string) {
  return DEPLOY_STATUS_CFG[status ?? 'idle'] ?? DEPLOY_STATUS_CFG['idle'];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeSince(dateStr?: string | null): string {
  if (!dateStr) return 'unknown';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 30) return `${Math.floor(days / 30)}mo ago`;
    if (days > 0)  return `${days}d ago`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs > 0)   return `${hrs}h ago`;
    const mins = Math.floor(diff / 60000);
    if (mins > 0)  return `${mins}m ago`;
    return 'just now';
  } catch { return 'unknown'; }
}

function shortHash(hash?: string): string {
  if (!hash) return '—';
  return hash.slice(0, 7);
}

function buildDuration(deployment: CloudflarePagesDeployment): string {
  // Find build stage
  const buildStage = deployment.stages?.find(s => s.name === 'build');
  if (buildStage) {
    const sec = deployDurationSec(buildStage.started_on, buildStage.ended_on);
    return formatDuration(sec);
  }
  // Fallback: total deployment time
  const sec = deployDurationSec(deployment.created_on, deployment.modified_on);
  return formatDuration(sec);
}

function getOverallStatus(deployment?: CloudflarePagesDeployment): string {
  if (!deployment) return 'idle';
  return deployment.latest_stage?.status ?? 'idle';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.9, duration: 850, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1,   duration: 850, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.28, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Stage Pipeline Timeline ──────────────────────────────────────────────────

function StagePipeline({ stages }: { stages: CloudflarePagesDeploymentStage[] }) {
  const ordered = ['queued', 'initialize', 'clone_repo', 'build', 'deploy'];
  const stageMap: Record<string, CloudflarePagesDeploymentStage> = {};
  stages.forEach(s => { stageMap[s.name] = s; });

  return (
    <View style={sp.wrap}>
      {ordered.map((name, idx) => {
        const stage  = stageMap[name];
        const status = (stage?.status ?? 'idle') as StageStatus;
        const color  = STAGE_STATUS_COLOR[status] ?? '#6B7280';
        const meta   = STAGE_META[name] ?? { label: name, icon: 'settings' };
        const dur    = deployDurationSec(stage?.started_on ?? null, stage?.ended_on ?? null);
        const isLast = idx === ordered.length - 1;

        return (
          <View key={name} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ alignItems: 'center' }}>
              <View style={[sp.dot, { backgroundColor: color + '22', borderColor: color + '66' }]}>
                <MaterialIcons
                  name={status === 'active' ? 'pending' : status === 'success' ? 'check' : status === 'failure' ? 'close' : meta.icon as any}
                  size={11}
                  color={color}
                />
              </View>
              {!isLast && <View style={[sp.line, { backgroundColor: status === 'success' ? color + '55' : Colors.border }]} />}
            </View>
            <View style={[sp.labelWrap, isLast && { paddingBottom: 0 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[sp.label, { color: status === 'idle' ? Colors.textMuted : Colors.textPrimary }]}>
                  {meta.label}
                </Text>
                <View style={[sp.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <Text style={[sp.badgeText, { color }]}>{status.toUpperCase()}</Text>
                </View>
                {dur > 0 && (
                  <Text style={sp.dur}>{formatDuration(dur)}</Text>
                )}
              </View>
              {stage?.started_on && (
                <Text style={sp.time}>{timeSince(stage.started_on)}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const sp = StyleSheet.create({
  wrap:      { gap: 0 },
  dot:       { width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  line:      { width: 2, height: 14, marginLeft: 13 },
  labelWrap: { flex: 1, paddingLeft: Spacing.sm, paddingBottom: 14, paddingTop: 4 },
  label:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  badge:     { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1 },
  badgeText: { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  dur:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  time:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
});

// ─── Deployment Row (in history list) ────────────────────────────────────────

function DeploymentRow({
  deployment,
  color,
  onViewPipeline,
}: {
  deployment: CloudflarePagesDeployment;
  color: string;
  onViewPipeline: (d: CloudflarePagesDeployment) => void;
}) {
  const status = getOverallStatus(deployment);
  const cfg    = getDeployStatusCfg(status);
  const hash   = deployment.deployment_trigger?.metadata?.commit_hash;
  const msg    = deployment.deployment_trigger?.metadata?.commit_message;
  const branch = deployment.deployment_trigger?.metadata?.branch;
  const dur    = buildDuration(deployment);
  const trigger = deployment.deployment_trigger?.type ?? 'api';
  const isProd  = deployment.environment === 'production';

  return (
    <View style={dr.row}>
      <View style={[dr.dot, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}>
        <MaterialIcons name={cfg.icon as any} size={13} color={cfg.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <View style={[dr.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[dr.badgeText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
          </View>
          {isProd && (
            <View style={[dr.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
              <Text style={[dr.badgeText, { color }]}>PROD</Text>
            </View>
          )}
          {branch && (
            <View style={[dr.badge, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
              <MaterialIcons name="call-split" size={9} color={Colors.textMuted} />
              <Text style={[dr.badgeText, { color: Colors.textMuted }]}>{branch}</Text>
            </View>
          )}
          <Text style={dr.time}>{timeSince(deployment.created_on)}</Text>
        </View>
        {msg && (
          <Text style={dr.msg} numberOfLines={1}>{msg}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {hash && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialIcons name="commit" size={10} color={Colors.textMuted} />
              <Text style={dr.hash} selectable>{shortHash(hash)}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="timer" size={10} color={Colors.textMuted} />
            <Text style={dr.meta}>{dur}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name={trigger === 'push' ? 'upload' : 'api'} size={10} color={Colors.textMuted} />
            <Text style={dr.meta}>{trigger}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        style={[dr.pipelineBtn, { borderColor: color + '44', backgroundColor: color + '08' }]}
        onPress={() => onViewPipeline(deployment)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.8}
      >
        <MaterialIcons name="account-tree" size={13} color={color} />
      </TouchableOpacity>
    </View>
  );
}

const dr = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  dot:         { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  badgeText:   { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  time:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  msg:         { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic', includeFontPadding: false },
  hash:        { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  meta:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  pipelineBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'center' },
});

// ─── Pages Project Card ───────────────────────────────────────────────────────

function PagesProjectCard({
  project,
  knownMeta,
  deploying,
  onTriggerDeploy,
}: {
  project: CloudflarePagesProject | null;
  knownMeta: typeof KNOWN_PROJECTS[number];
  deploying: boolean;
  onTriggerDeploy: (projectName: string) => void;
}) {
  const [expanded,      setExpanded]      = useState(false);
  const [pipelineOpen,  setPipelineOpen]  = useState(false);
  const [selectedDeploy,setSelectedDeploy]= useState<CloudflarePagesDeployment | null>(null);
  const [history,       setHistory]       = useState<CloudflarePagesDeployment[]>([]);
  const [historyLoading,setHistoryLoading]= useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const color  = knownMeta.color;
  const latest = project?.latest_deployment ?? project?.canonical_deployment;
  const status = getOverallStatus(latest);
  const cfg    = getDeployStatusCfg(status);

  const commitHash = latest?.deployment_trigger?.metadata?.commit_hash;
  const commitMsg  = latest?.deployment_trigger?.metadata?.commit_message;
  const branch     = project?.production_branch ?? latest?.deployment_trigger?.metadata?.branch ?? knownMeta.branch;
  const subdomain  = project?.subdomain ? `${project.subdomain}.pages.dev` : knownMeta.subdomain;
  const domains    = project?.domains ?? [];
  const repo       = project?.source?.config
    ? `${project.source.config.owner ?? ''}/${project.source.config.repo_name ?? ''}`
    : knownMeta.repo;
  const dur = latest ? buildDuration(latest) : '—';
  const deployed = latest ? timeSince(latest.created_on) : knownMeta.ago;

  const loadHistory = useCallback(async () => {
    if (!project || historyLoaded) return;
    setHistoryLoading(true);
    try {
      const tok = await import('@/services/cloudflareService').then(m => m.getCFToken());
      if (!tok) return;
      const { data } = await listPagesDeployments(KNOWN_ACCOUNT_ID, project.name, tok);
      if (data) setHistory(data);
      setHistoryLoaded(true);
    } finally { setHistoryLoading(false); }
  }, [project, historyLoaded]);

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !historyLoaded) loadHistory();
  };

  const openPipeline = (d: CloudflarePagesDeployment) => {
    setSelectedDeploy(d);
    setPipelineOpen(true);
  };

  return (
    <View style={[pc.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      {/* Header */}
      <View style={pc.header}>
        <View style={[pc.iconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <MaterialIcons name={knownMeta.icon as any} size={22} color={color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Text style={[pc.name, { color }]}>{knownMeta.name}</Text>
            <View style={[pc.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
              {status === 'active' ? <LiveDot color={cfg.color} size={4} /> : <MaterialIcons name={cfg.icon as any} size={9} color={cfg.color} />}
              <Text style={[pc.statusPillText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={pc.subdomain} numberOfLines={1}>{subdomain}</Text>
        </View>
        <TouchableOpacity
          style={[pc.expandBtn, expanded && { backgroundColor: color + '18', borderColor: color + '44' }]}
          onPress={toggleExpand}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={expanded ? color : Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Quick stats row */}
      <View style={pc.statsRow}>
        <View style={[pc.stat, { backgroundColor: color + '08', borderColor: color + '22' }]}>
          <MaterialIcons name="commit" size={11} color={color} />
          <Text style={[pc.statVal, { color }]}>{shortHash(commitHash)}</Text>
          <Text style={pc.statKey}>commit</Text>
        </View>
        <View style={[pc.stat, { backgroundColor: '#22C55E08', borderColor: '#22C55E22' }]}>
          <MaterialIcons name="timer" size={11} color="#22C55E" />
          <Text style={[pc.statVal, { color: '#22C55E' }]}>{dur}</Text>
          <Text style={pc.statKey}>build time</Text>
        </View>
        <View style={[pc.stat, { backgroundColor: '#3B82F608', borderColor: '#3B82F622' }]}>
          <MaterialIcons name="call-split" size={11} color="#3B82F6" />
          <Text style={[pc.statVal, { color: '#3B82F6' }]} numberOfLines={1}>{branch}</Text>
          <Text style={pc.statKey}>branch</Text>
        </View>
        <View style={[pc.stat, { backgroundColor: '#8B5CF608', borderColor: '#8B5CF622' }]}>
          <MaterialIcons name="schedule" size={11} color="#8B5CF6" />
          <Text style={[pc.statVal, { color: '#8B5CF6' }]}>{deployed}</Text>
          <Text style={pc.statKey}>deployed</Text>
        </View>
      </View>

      {/* Commit message */}
      {commitMsg && (
        <View style={[pc.commitMsgWrap, { borderColor: color + '33', backgroundColor: color + '05' }]}>
          <MaterialIcons name="code" size={11} color={color} style={{ flexShrink: 0 }} />
          <Text style={[pc.commitMsg, { color: Colors.textSecondary }]} numberOfLines={1} italic>{commitMsg}</Text>
        </View>
      )}

      {/* Custom domains */}
      {domains.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          {domains.slice(0, 3).map(d => (
            <View key={d} style={[pc.domainChip, { borderColor: color + '55', backgroundColor: color + '10' }]}>
              <MaterialIcons name="language" size={9} color={color} />
              <Text style={[pc.domainChipText, { color }]} numberOfLines={1}>{d}</Text>
            </View>
          ))}
          {domains.length > 3 && (
            <View style={[pc.domainChip, { borderColor: Colors.border }]}>
              <Text style={[pc.domainChipText, { color: Colors.textMuted }]}>+{domains.length - 3}</Text>
            </View>
          )}
        </View>
      )}

      {/* Repo row */}
      {repo && (
        <View style={[pc.repoRow, { borderColor: Colors.border }]}>
          <MaterialIcons name="source" size={12} color={Colors.textMuted} />
          <Text style={pc.repoText} numberOfLines={1}>{repo}</Text>
          <TouchableOpacity
            style={pc.copyBtn}
            onPress={() => Clipboard.setStringAsync(repo).catch(()=>{})}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons name="content-copy" size={11} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Trigger Deploy button */}
      <TouchableOpacity
        style={[pc.deployBtn, { borderColor: color, backgroundColor: color + '15' }, deploying && { opacity: 0.5 }]}
        onPress={() => onTriggerDeploy(knownMeta.name)}
        disabled={deploying}
        activeOpacity={0.87}
      >
        {deploying
          ? <ActivityIndicator size="small" color={color} />
          : <MaterialIcons name="rocket-launch" size={16} color={color} />}
        <Text style={[pc.deployBtnText, { color }]}>
          {deploying ? 'Deploying…' : 'Trigger Deploy'}
        </Text>
        <View style={[pc.deployBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[pc.deployBadgeText, { color }]}>AD HOC</Text>
        </View>
      </TouchableOpacity>

      {/* Expanded: deployment history + pipeline */}
      {expanded && (
        <View style={pc.expandedSection}>
          {/* Pipeline for latest deployment */}
          {latest && latest.stages && latest.stages.length > 0 && (
            <View style={{ gap: Spacing.sm }}>
              <Text style={[pc.sectionLabel, { color }]}>LATEST BUILD PIPELINE</Text>
              <View style={[pc.pipelineWrap, { borderColor: color + '33', backgroundColor: color + '04' }]}>
                <StagePipeline stages={latest.stages} />
              </View>
            </View>
          )}

          {/* Deployment history */}
          <View style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[pc.sectionLabel, { color }]}>DEPLOYMENT HISTORY</Text>
              {historyLoading && <ActivityIndicator size="small" color={color} />}
            </View>
            {historyLoading && history.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                <ActivityIndicator size="small" color={color} />
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>Loading history…</Text>
              </View>
            ) : history.length > 0 ? (
              <>
                {history.slice(0, 8).map(d => (
                  <DeploymentRow
                    key={d.id}
                    deployment={d}
                    color={color}
                    onViewPipeline={openPipeline}
                  />
                ))}
              </>
            ) : (
              /* If no live history but we have latest deploy, show it */
              latest ? (
                <DeploymentRow deployment={latest} color={color} onViewPipeline={openPipeline} />
              ) : (
                <View style={{ paddingVertical: 10 }}>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>
                    No deployment history available — connect API token for live data.
                  </Text>
                </View>
              )
            )}
          </View>

          {/* Build config */}
          {project?.build_config?.build_command && (
            <View style={{ gap: Spacing.sm }}>
              <Text style={[pc.sectionLabel, { color }]}>BUILD CONFIG</Text>
              <View style={[pc.buildConfigWrap, { borderColor: Colors.border }]}>
                {[
                  { label: 'Build command',  value: project.build_config.build_command,   mono: true  },
                  { label: 'Output dir',     value: project.build_config.destination_dir ?? '/',  mono: true  },
                  { label: 'Root dir',       value: project.build_config.root_dir ?? '/',  mono: true  },
                ].map(row => (
                  <View key={row.label} style={pc.buildRow}>
                    <Text style={pc.buildLabel}>{row.label}</Text>
                    <Text style={[pc.buildVal, row.mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]} numberOfLines={1} selectable>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Pipeline Modal */}
      {pipelineOpen && selectedDeploy && (
        <View style={pc.pipelineModal}>
          <View style={[pc.pipelineModalInner, { borderColor: color + '55' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
              <View style={[pc.pipelineModalIcon, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                <MaterialIcons name="account-tree" size={16} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[pc.pipelineModalTitle, { color }]}>Build Pipeline</Text>
                <Text style={pc.pipelineModalSub}>
                  {shortHash(selectedDeploy.deployment_trigger?.metadata?.commit_hash)} · {timeSince(selectedDeploy.created_on)}
                </Text>
              </View>
              <TouchableOpacity
                style={pc.pipelineModalClose}
                onPress={() => { setPipelineOpen(false); setSelectedDeploy(null); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {selectedDeploy.stages && selectedDeploy.stages.length > 0
              ? <StagePipeline stages={selectedDeploy.stages} />
              : <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>No stage data available for this deployment.</Text>}
            <View style={[pc.pipelineUrlRow, { borderColor: color + '33', backgroundColor: color + '08' }]}>
              <MaterialIcons name="link" size={12} color={color} />
              <Text style={[pc.pipelineUrlText, { color }]} numberOfLines={1} selectable>{selectedDeploy.url}</Text>
              <TouchableOpacity onPress={() => Clipboard.setStringAsync(selectedDeploy.url).catch(()=>{})} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <MaterialIcons name="content-copy" size={12} color={color} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const pc = StyleSheet.create({
  card:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md, overflow: 'visible' },
  header:         { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  iconWrap:       { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:           { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statusPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  statusPillText: { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  subdomain:      { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  expandBtn:      { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statsRow:       { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  stat:           { flex: 1, minWidth: '22%', flexDirection: 'column', alignItems: 'center', gap: 4, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 },
  statVal:        { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  statKey:        { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  commitMsgWrap:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  commitMsg:      { flex: 1, fontSize: FontSize.xs, includeFontPadding: false },
  domainChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, maxWidth: 200 },
  domainChipText: { fontSize: 9, fontWeight: '700' as any, includeFontPadding: false },
  repoRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgElevated, paddingHorizontal: 9, paddingVertical: 5 },
  repoText:       { flex: 1, fontSize: 10, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  copyBtn:        { width: 24, height: 24, borderRadius: 7, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deployBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, borderWidth: 1.5, paddingVertical: Spacing.md - 2 },
  deployBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  deployBadge:    { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  deployBadgeText:{ fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  expandedSection:{ gap: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border + '55' },
  sectionLabel:   { fontSize: 9, fontWeight: '800' as any, letterSpacing: 0.9, includeFontPadding: false },
  pipelineWrap:   { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  buildConfigWrap:{ borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', backgroundColor: Colors.bgElevated },
  buildRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  buildLabel:     { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  buildVal:       { fontSize: 10, color: Colors.textSecondary, includeFontPadding: false, maxWidth: '65%', textAlign: 'right' },
  // Pipeline modal (inline overlay)
  pipelineModal:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,6,8,0.88)', borderRadius: Radius.xl, justifyContent: 'flex-start', padding: Spacing.md, zIndex: 99 },
  pipelineModalInner: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  pipelineModalIcon:  { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pipelineModalTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  pipelineModalSub:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  pipelineModalClose: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pipelineUrlRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  pipelineUrlText:    { flex: 1, fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({
  projects,
  loading,
}: {
  projects: CloudflarePagesProject[];
  loading: boolean;
}) {
  const successCount = projects.filter(p => getOverallStatus(p.latest_deployment ?? p.canonical_deployment) === 'success').length;
  const buildingCount = projects.filter(p => getOverallStatus(p.latest_deployment ?? p.canonical_deployment) === 'active').length;
  const total = projects.length || KNOWN_PROJECTS.length;

  const items = [
    { icon: 'dns',           label: 'Projects',  value: loading ? '…' : String(total),            color: Colors.primary  },
    { icon: 'check-circle',  label: 'Passing',   value: loading ? '…' : String(successCount || total), color: '#22C55E'   },
    { icon: 'pending',       label: 'Building',  value: loading ? '…' : String(buildingCount),     color: '#F59E0B'       },
    { icon: 'pages',         label: 'Platform',  value: 'Pages',                                   color: '#F6821F'       },
  ];

  return (
    <View style={ss.strip}>
      {items.map((item, idx) => (
        <View key={item.label} style={[ss.item, idx < items.length - 1 && { borderRightWidth: 1, borderRightColor: Colors.border + '55' }]}>
          <View style={[ss.icon, { backgroundColor: item.color + '18', borderColor: item.color + '33' }]}>
            <MaterialIcons name={item.icon as any} size={13} color={item.color} />
          </View>
          <Text style={[ss.val, { color: item.color }]}>{item.value}</Text>
          <Text style={ss.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const ss = StyleSheet.create({
  strip: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  item:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.md },
  icon:  { width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  val:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label: { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CloudflarePagesScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { showAlert } = useAlert();

  const [apiToken,   setApiToken]   = useState('');
  const [connected,  setConnected]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [lastRefresh,setLastRefresh]= useState<Date | null>(null);

  const [projects,   setProjects]   = useState<CloudflarePagesProject[]>([]);
  const [deploying,  setDeploying]  = useState<Record<string, boolean>>({});

  // Restore token on mount
  useEffect(() => {
    (async () => {
      const { getCFToken } = await import('@/services/cloudflareService');
      const tok = await getCFToken();
      if (tok) { setApiToken(tok); setConnected(true); loadProjects(tok); }
    })();
  }, []);

  const loadProjects = useCallback(async (token: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const { data, error } = await listPagesProjects(KNOWN_ACCOUNT_ID, token);
    if (!isRefresh) setLoading(false);
    if (isRefresh) setRefreshing(false);
    if (data) setProjects(data);
    if (error) console.warn('[Pages] listPagesProjects:', error);
    setLastRefresh(new Date());
  }, []);

  const handleRefresh = useCallback(() => {
    if (apiToken) loadProjects(apiToken, true);
  }, [apiToken, loadProjects]);

  const handleTriggerDeploy = useCallback(async (projectName: string) => {
    showAlert(
      'Trigger Deploy?',
      `Start a new ad-hoc deployment for "${projectName}"?\n\nThis will redeploy the latest commit on the production branch.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deploy', style: 'default', onPress: async () => {
            setDeploying(prev => ({ ...prev, [projectName]: true }));
            const { data, error } = await triggerPagesDeployment(KNOWN_ACCOUNT_ID, projectName, apiToken);
            setDeploying(prev => ({ ...prev, [projectName]: false }));
            if (error) {
              showAlert('Deploy Failed', error);
              return;
            }
            if (data) {
              const status = getOverallStatus(data);
              const cfg    = getDeployStatusCfg(status);
              showAlert(
                'Deployment Triggered',
                `${projectName} is now ${cfg.label.toLowerCase()}.\nDeployment ID: ${data.short_id ?? data.id.slice(0, 8)}`,
              );
              // Refresh projects to show updated status
              if (apiToken) loadProjects(apiToken);
            }
          },
        },
      ],
    );
  }, [apiToken, showAlert, loadProjects]);

  // Build merged list: always show KNOWN_PROJECTS, enriching with live API data where available
  const mergedProjects = KNOWN_PROJECTS.map(kp => ({
    knownMeta: kp,
    project: projects.find(p => p.name === kp.name) ?? null,
  }));

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Pages Manager</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={connected ? Colors.success : Colors.textMuted} size={5} />
            <Text style={[s.topSub, { color: connected ? Colors.success : Colors.textMuted }]}>
              {connected
                ? `${KNOWN_PROJECTS.length} projects · ${lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading…'}`
                : 'No API token · Open DNS Manager'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.iconBtn, connected && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={() => connected ? loadProjects(apiToken, true) : router.push('/cloudflare-dns' as any)}
          disabled={refreshing || loading}
          activeOpacity={0.8}
        >
          {refreshing || loading
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <MaterialIcons name={connected ? 'refresh' : 'cloud-off'} size={18} color={connected ? Colors.primary : Colors.textMuted} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* NOT CONNECTED banner */}
        {!connected && (
          <View style={s.noTokenCard}>
            <View style={s.noTokenIcon}>
              <MaterialIcons name="pages" size={38} color="#F6821F" />
            </View>
            <Text style={s.noTokenTitle}>Connect Cloudflare First</Text>
            <Text style={s.noTokenSub}>
              Add your Cloudflare API token to view live Pages project data, deployment history, and trigger new deployments for{' '}
              <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>bituncoin.world</Text>
              {' '}and{' '}
              <Text style={{ color: '#3B82F6', fontWeight: FontWeight.bold }}>bituncoin.cloud</Text>.
            </Text>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#F6821F', shadowColor: '#F6821F' }]}
              onPress={() => router.push('/cloudflare-dns' as any)}
              activeOpacity={0.87}
            >
              <MaterialIcons name="dns" size={17} color={Colors.bg} />
              <Text style={s.btnText}>Open DNS Manager</Text>
            </TouchableOpacity>
            <View style={[s.previewNote, { borderColor: '#F6821F44', backgroundColor: '#F6821F08' }]}>
              <MaterialIcons name="info-outline" size={12} color="#F6821F" />
              <Text style={[s.previewNoteText, { color: '#F6821F' }]}>
                Project cards below show estimated data. Connect your API token for live deployments, history, and build pipelines.
              </Text>
            </View>
          </View>
        )}

        {/* Summary */}
        <SummaryStrip projects={projects} loading={loading} />

        {/* Legend */}
        <View style={s.legend}>
          <View style={s.legendRow}>
            <MaterialIcons name="rocket-launch" size={12} color={Colors.textMuted} />
            <Text style={s.legendText}>Tap "Trigger Deploy" to start an ad-hoc deployment for any project</Text>
          </View>
          <View style={s.legendRow}>
            <MaterialIcons name="account-tree" size={12} color={Colors.textMuted} />
            <Text style={s.legendText}>Tap the pipeline icon on any deployment row to view the full stage timeline</Text>
          </View>
          <View style={s.legendRow}>
            <MaterialIcons name="keyboard-arrow-down" size={12} color={Colors.textMuted} />
            <Text style={s.legendText}>Expand a project card to see deployment history and build configuration</Text>
          </View>
        </View>

        {/* Project cards */}
        <View style={{ gap: Spacing.md }}>
          {mergedProjects.map(({ knownMeta, project }) => (
            <PagesProjectCard
              key={knownMeta.name}
              project={project}
              knownMeta={knownMeta}
              deploying={!!deploying[knownMeta.name]}
              onTriggerDeploy={handleTriggerDeploy}
            />
          ))}
        </View>

        {/* Quick Actions */}
        <View style={s.actionsCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <View style={[s.actIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
              <MaterialIcons name="bolt" size={16} color={Colors.primary} />
            </View>
            <Text style={s.actTitle}>Quick Actions</Text>
          </View>
          <View style={s.actGrid}>
            {[
              { icon: 'dashboard', label: 'Analytics',    route: '/cloudflare-dashboard', color: '#F6821F'       },
              { icon: 'code',      label: 'Workers',       route: '/cloudflare-workers',   color: '#22C55E'       },
              { icon: 'dns',       label: 'DNS Manager',   route: '/cloudflare-dns',        color: Colors.primary  },
              { icon: 'security',  label: 'Security',      route: '/btng-security-status',  color: '#EF4444'       },
            ].map(a => (
              <TouchableOpacity
                key={a.route}
                style={[s.actBtn, { borderColor: a.color + '44', backgroundColor: a.color + '08' }]}
                onPress={() => router.push(a.route as any)}
                activeOpacity={0.85}
              >
                <View style={[s.actBtnIcon, { backgroundColor: a.color + '18', borderColor: a.color + '33' }]}>
                  <MaterialIcons name={a.icon as any} size={16} color={a.color} />
                </View>
                <Text style={[s.actBtnLabel, { color: a.color }]} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <MaterialIcons name="pages" size={12} color={Colors.textMuted} />
          <Text style={s.footerText}>
            Cloudflare Pages · Account {KNOWN_ACCOUNT_ID.slice(0, 8)}…
            {connected && lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </Text>
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.bg },
  topBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:       { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#F6821F', includeFontPadding: false, letterSpacing: 0.4 },
  topSub:          { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  scroll:          { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  noTokenCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#F6821F44', padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  noTokenIcon:     { width: 84, height: 84, borderRadius: 22, backgroundColor: '#F6821F12', borderWidth: 2, borderColor: '#F6821F44', alignItems: 'center', justifyContent: 'center' },
  noTokenTitle:    { fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  noTokenSub:      { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  btn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  btnText:         { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  previewNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, alignSelf: 'stretch' },
  previewNoteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false },
  legend:          { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm + 3, gap: Spacing.sm },
  legendRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  legendText:      { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
  actionsCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  actIcon:         { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  actGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actBtn:          { width: '47%', flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.sm + 3, minHeight: 52 },
  actBtnIcon:      { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actBtnLabel:     { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  footer:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText:      { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});
