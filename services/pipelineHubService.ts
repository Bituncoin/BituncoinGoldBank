// BTNG Pipeline Hub Service — Aggregated stats across all three pipelines

import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

export interface PipelineStats {
  total: number;
  success: number;
  failed: number;
  lastTimestamp: string | null;
  successRate: number;
}

export interface ActivityEvent {
  id: string;
  type: 'verification' | 'minting' | 'certificate';
  title: string;
  subtitle: string;
  status: string;
  timestamp: string;
  value?: number;
  valueUnit?: string;
  icon: string;
  color: string;
}

export interface PipelineHubData {
  verification: PipelineStats;
  minting: PipelineStats;
  certificate: PipelineStats;
  activity: ActivityEvent[];
  lastRefreshed: string;
}

// ── Fetch Verification Stats ───────────────────────────────────────────────

async function fetchVerificationStats(userId: string): Promise<PipelineStats> {
  const { data } = await supabase
    .from('btng_verification_receipts')
    .select('id, status, created_at, trust_score')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const rows = data ?? [];
  const total = rows.length;
  const success = rows.filter(r => r.status === 'completed').length;
  const failed = total - success;
  const lastTimestamp = rows[0]?.created_at ?? null;

  return {
    total,
    success,
    failed,
    lastTimestamp,
    successRate: total > 0 ? Math.round((success / total) * 100) : 0,
  };
}

// ── Fetch Minting Stats ────────────────────────────────────────────────────

async function fetchMintingStats(userId: string): Promise<PipelineStats> {
  const { data } = await supabase
    .from('btng_mint_receipts')
    .select('id, status, created_at, amount_minted')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const rows = data ?? [];
  const total = rows.length;
  const success = rows.filter(r => r.status === 'completed').length;
  const failed = total - success;
  const lastTimestamp = rows[0]?.created_at ?? null;

  return {
    total,
    success,
    failed,
    lastTimestamp,
    successRate: total > 0 ? Math.round((success / total) * 100) : 0,
  };
}

// ── Fetch Certificate Stats ────────────────────────────────────────────────

async function fetchCertificateStats(userId: string): Promise<PipelineStats> {
  const { data } = await supabase
    .from('btng_certificates')
    .select('id, status, created_at, asset_value, equity_grade')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const rows = data ?? [];
  const total = rows.length;
  const success = rows.filter(r => r.status === 'active').length;
  const failed = rows.filter(r => r.status === 'expired' || r.status === 'revoked').length;
  const lastTimestamp = rows[0]?.created_at ?? null;

  return {
    total,
    success,
    failed,
    lastTimestamp,
    successRate: total > 0 ? Math.round((success / total) * 100) : 0,
  };
}

// ── Fetch Combined Activity Feed ───────────────────────────────────────────

async function fetchActivityFeed(userId: string): Promise<ActivityEvent[]> {
  const [{ data: verData }, { data: mintData }, { data: certData }] = await Promise.all([
    supabase
      .from('btng_verification_receipts')
      .select('id, verification_id, status, created_at, trust_score, doc_type, owner_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('btng_mint_receipts')
      .select('id, mint_id, status, created_at, amount_minted, equity_id, risk_tier')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('btng_certificates')
      .select('id, cert_id, status, created_at, asset_value, cert_type, equity_grade, owner_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const events: ActivityEvent[] = [];

  (verData ?? []).forEach(r => {
    events.push({
      id: r.id,
      type: 'verification',
      title: 'Verification Pipeline',
      subtitle: `${(r.doc_type ?? 'document').replace(/_/g, ' ')} · Trust: ${r.trust_score ?? 0}/100`,
      status: r.status ?? 'completed',
      timestamp: r.created_at,
      value: r.trust_score,
      valueUnit: 'Trust',
      icon: 'verified-user',
      color: '#3B82F6',
    });
  });

  (mintData ?? []).forEach(r => {
    events.push({
      id: r.id,
      type: 'minting',
      title: 'Minting Pipeline',
      subtitle: `${(r.amount_minted ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} BTNGG minted`,
      status: r.status ?? 'completed',
      timestamp: r.created_at,
      value: r.amount_minted,
      valueUnit: 'BTNGG',
      icon: 'flash-on',
      color: '#D4A017',
    });
  });

  (certData ?? []).forEach(r => {
    events.push({
      id: r.id,
      type: 'certificate',
      title: 'Certificate Engine',
      subtitle: `Grade ${r.equity_grade ?? 'D'} · ${(r.cert_type ?? 'CERT').replace(/_/g, ' ')}`,
      status: r.status ?? 'active',
      timestamp: r.created_at,
      value: r.asset_value,
      valueUnit: 'BTNGG',
      icon: 'workspace-premium',
      color: '#22C55E',
    });
  });

  // Sort combined by timestamp descending, take top 10
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, 10);
}

// ── Main fetch ─────────────────────────────────────────────────────────────

export async function fetchPipelineHubData(userId: string): Promise<PipelineHubData> {
  const [verification, minting, certificate, activity] = await Promise.all([
    fetchVerificationStats(userId),
    fetchMintingStats(userId),
    fetchCertificateStats(userId),
    fetchActivityFeed(userId),
  ]);

  return {
    verification,
    minting,
    certificate,
    activity,
    lastRefreshed: new Date().toISOString(),
  };
}
