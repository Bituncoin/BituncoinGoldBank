/**
 * services/cloudflareService.ts
 * Cloudflare API v4 service — Zones + DNS Record management
 *
 * Docs: https://developers.cloudflare.com/api/
 * Base: https://api.cloudflare.com/client/v4
 *
 * Supports:
 *  GET    /zones                                   — list account zones
 *  GET    /zones/{zone_id}/dns_records             — list DNS records
 *  POST   /zones/{zone_id}/dns_records             — create DNS record
 *  PUT    /zones/{zone_id}/dns_records/{id}        — update DNS record
 *  DELETE /zones/{zone_id}/dns_records/{id}        — delete DNS record
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CF_BASE         = 'https://api.cloudflare.com/client/v4';
const CF_TOKEN_KEY    = '@btng_cloudflare_api_token';
const CF_ZONE_MAP_KEY = '@btng_cloudflare_zone_map';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudflareZone {
  id:          string;
  name:        string;
  status:      string;           // 'active' | 'pending' | 'initializing' | 'moved' | 'deleted'
  paused:      boolean;
  type:        string;
  name_servers: string[];
  original_name_servers: string[];
  modified_on: string;
  created_on:  string;
  plan?: { name: string };
}

export interface CloudflareDNSRecord {
  id:         string;
  zone_id:    string;
  zone_name:  string;
  name:       string;
  type:       DNSRecordType;
  content:    string;
  proxiable:  boolean;
  proxied:    boolean;
  ttl:        number;             // 1 = auto
  locked:     boolean;
  meta?:      { auto_added?: boolean; managed_by_apps?: boolean };
  created_on: string;
  modified_on: string;
  priority?:  number;             // MX, SRV
  comment?:   string;
  tags?:      string[];
}

export type DNSRecordType =
  | 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS'
  | 'SRV' | 'CAA' | 'PTR' | 'SOA' | 'SSHFP' | 'TLSA' | 'HTTPS';

export interface CreateDNSRecordInput {
  type:      DNSRecordType;
  name:      string;
  content:   string;
  ttl?:      number;              // 1 = auto, 60-86400
  proxied?:  boolean;
  priority?: number;              // MX, SRV
  comment?:  string;
}

export interface UpdateDNSRecordInput extends Partial<CreateDNSRecordInput> {}

export interface CFResult<T> {
  data?:  T;
  error?: string;
}

// ─── Token storage ────────────────────────────────────────────────────────────

export async function saveCFToken(token: string): Promise<void> {
  await AsyncStorage.setItem(CF_TOKEN_KEY, token.trim());
}

export async function getCFToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CF_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearCFToken(): Promise<void> {
  await AsyncStorage.removeItem(CF_TOKEN_KEY);
  await AsyncStorage.removeItem(CF_ZONE_MAP_KEY);
}

// ─── Zone map cache ───────────────────────────────────────────────────────────

export async function getCachedZoneMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(CF_ZONE_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveCachedZoneMap(map: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(CF_ZONE_MAP_KEY, JSON.stringify(map));
}

// ─── Request helper ───────────────────────────────────────────────────────────

async function cfFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<CFResult<T>> {
  try {
    const res = await fetch(`${CF_BASE}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        ...(options.headers ?? {}),
      },
    });

    let body: any;
    try { body = await res.json(); } catch { body = {}; }

    if (!res.ok || body?.success === false) {
      const msg = body?.errors?.[0]?.message ?? body?.message ?? `HTTP ${res.status}`;
      return { error: `Cloudflare: ${msg}` };
    }

    return { data: body.result ?? body };
  } catch (e: any) {
    return { error: e?.message ?? 'Network error' };
  }
}

// ─── Zones ────────────────────────────────────────────────────────────────────

/** Fetch all zones for the account. Caches domain → zone_id map. */
export async function listZones(token: string): Promise<CFResult<CloudflareZone[]>> {
  const result = await cfFetch<CloudflareZone[]>(
    '/zones?per_page=50&status=active',
    token,
  );
  if (result.data) {
    const map: Record<string, string> = {};
    result.data.forEach(z => { map[z.name] = z.id; });
    await saveCachedZoneMap(map);
  }
  return result;
}

/** Get a single zone by ID. */
export async function getZone(zoneId: string, token: string): Promise<CFResult<CloudflareZone>> {
  return cfFetch<CloudflareZone>(`/zones/${zoneId}`, token);
}

// ─── DNS Records ──────────────────────────────────────────────────────────────

/** List all DNS records for a zone, optionally filtered by type. */
export async function listDNSRecords(
  zoneId: string,
  token: string,
  type?: DNSRecordType,
): Promise<CFResult<CloudflareDNSRecord[]>> {
  const query = type ? `?type=${type}&per_page=500` : '?per_page=500';
  return cfFetch<CloudflareDNSRecord[]>(
    `/zones/${zoneId}/dns_records${query}`,
    token,
  );
}

/** Create a new DNS record. */
export async function createDNSRecord(
  zoneId: string,
  input: CreateDNSRecordInput,
  token: string,
): Promise<CFResult<CloudflareDNSRecord>> {
  return cfFetch<CloudflareDNSRecord>(
    `/zones/${zoneId}/dns_records`,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/** Update an existing DNS record. */
export async function updateDNSRecord(
  zoneId: string,
  recordId: string,
  input: UpdateDNSRecordInput,
  token: string,
): Promise<CFResult<CloudflareDNSRecord>> {
  return cfFetch<CloudflareDNSRecord>(
    `/zones/${zoneId}/dns_records/${recordId}`,
    token,
    { method: 'PUT', body: JSON.stringify(input) },
  );
}

/** Delete a DNS record. */
export async function deleteDNSRecord(
  zoneId: string,
  recordId: string,
  token: string,
): Promise<CFResult<{ id: string }>> {
  return cfFetch<{ id: string }>(
    `/zones/${zoneId}/dns_records/${recordId}`,
    token,
    { method: 'DELETE' },
  );
}

// ─── Convenience ──────────────────────────────────────────────────────────────

/** Verify an API token by calling /user/tokens/verify */
export async function verifyCFToken(token: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(`${CF_BASE}/user/tokens/verify`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      return { valid: false, error: body?.errors?.[0]?.message ?? `HTTP ${res.status}` };
    }
    return { valid: body?.result?.status === 'active' };
  } catch (e: any) {
    return { valid: false, error: e?.message ?? 'Network error' };
  }
}

/** Group records by type for display. */
export function groupRecordsByType(
  records: CloudflareDNSRecord[],
): Record<string, CloudflareDNSRecord[]> {
  const grouped: Record<string, CloudflareDNSRecord[]> = {};
  for (const r of records) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }
  return grouped;
}

/** DNS record type configuration for UI */
export const DNS_TYPE_CONFIG: Record<
  DNSRecordType,
  { color: string; bg: string; border: string; icon: string; desc: string; needsPriority: boolean; proxiable: boolean }
> = {
  A:      { color: '#22C55E', bg: '#22C55E10', border: '#22C55E44', icon: 'computer',     desc: 'IPv4 address',       needsPriority: false, proxiable: true  },
  AAAA:   { color: '#3B82F6', bg: '#3B82F610', border: '#3B82F644', icon: 'computer',     desc: 'IPv6 address',       needsPriority: false, proxiable: true  },
  CNAME:  { color: '#8B5CF6', bg: '#8B5CF610', border: '#8B5CF644', icon: 'alt-route',    desc: 'Alias/canonical',    needsPriority: false, proxiable: true  },
  TXT:    { color: '#F59E0B', bg: '#F59E0B10', border: '#F59E0B44', icon: 'text-fields',  desc: 'Text record',        needsPriority: false, proxiable: false },
  MX:     { color: '#EF4444', bg: '#EF444410', border: '#EF444444', icon: 'email',        desc: 'Mail exchange',      needsPriority: true,  proxiable: false },
  NS:     { color: '#10B981', bg: '#10B98110', border: '#10B98144', icon: 'dns',          desc: 'Name server',        needsPriority: false, proxiable: false },
  SRV:    { color: '#6366F1', bg: '#6366F110', border: '#6366F144', icon: 'settings',     desc: 'Service locator',    needsPriority: true,  proxiable: false },
  CAA:    { color: '#EC4899', bg: '#EC489910', border: '#EC489944', icon: 'verified',     desc: 'CA Authorization',   needsPriority: false, proxiable: false },
  PTR:    { color: '#9CA3AF', bg: '#9CA3AF10', border: '#9CA3AF44', icon: 'swap-horiz',   desc: 'Reverse DNS',        needsPriority: false, proxiable: false },
  SOA:    { color: '#D4A017', bg: '#D4A01710', border: '#D4A01744', icon: 'source',       desc: 'Start of authority', needsPriority: false, proxiable: false },
  SSHFP:  { color: '#7C3AED', bg: '#7C3AED10', border: '#7C3AED44', icon: 'security',     desc: 'SSH fingerprint',    needsPriority: false, proxiable: false },
  TLSA:   { color: '#0EA5E9', bg: '#0EA5E910', border: '#0EA5E944', icon: 'lock',         desc: 'TLS auth',           needsPriority: false, proxiable: false },
  HTTPS:  { color: '#14B8A6', bg: '#14B8A610', border: '#14B8A644', icon: 'https',        desc: 'HTTPS binding',      needsPriority: false, proxiable: false },
};

export const MAIN_RECORD_TYPES: DNSRecordType[] = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'];

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface ZoneAnalyticsTotals {
  requests: {
    all: number;
    cached: number;
    uncached: number;
    ssl?: { encrypted: number; unencrypted: number };
    http_status?: Record<string, number>;
  };
  bandwidth: { all: number; cached: number; uncached: number };
  threats: { all: number; type?: Record<string, number> };
  pageviews: { all: number };
  uniques: { all: number };
}

export interface ZoneAnalytics {
  totals: ZoneAnalyticsTotals;
  timeseries?: any[];
}

/**
 * GET /zones/{zone_id}/analytics/dashboard
 * Fetch zone-level analytics (requests, bandwidth, threats, uniques).
 * since / until: relative minutes (e.g. -10080 = last 7 days)
 */
export async function getZoneAnalytics(
  zoneId: string,
  token: string,
  since = -10080,
  until = 0,
): Promise<CFResult<ZoneAnalytics>> {
  return cfFetch<ZoneAnalytics>(
    `/zones/${zoneId}/analytics/dashboard?since=${since}&until=${until}&continuous=true`,
    token,
  );
}

// ─── Workers ─────────────────────────────────────────────────────────────────

export interface CloudflareWorkerScript {
  id: string;
  etag: string;
  created_on: string;
  modified_on: string;
  usage_model?: string;
  handlers?: string[];
  last_deployed_from?: string;
}

/**
 * GET /accounts/{account_id}/workers/scripts
 * List all Worker scripts deployed under the account.
 */
export async function listWorkerScripts(
  accountId: string,
  token: string,
): Promise<CFResult<CloudflareWorkerScript[]>> {
  return cfFetch<CloudflareWorkerScript[]>(
    `/accounts/${accountId}/workers/scripts`,
    token,
  );
}

// ─── Zero Trust / Access ──────────────────────────────────────────────────────

export interface CloudflareAccessApp {
  id: string;
  name: string;
  domain: string;
  type: string;
  session_duration: string;
  created_at: string;
  updated_at: string;
}

/**
 * GET /accounts/{account_id}/access/apps
 * List all Zero Trust Access applications.
 */
export async function listAccessApps(
  accountId: string,
  token: string,
): Promise<CFResult<CloudflareAccessApp[]>> {
  return cfFetch<CloudflareAccessApp[]>(
    `/accounts/${accountId}/access/apps`,
    token,
  );
}

// ─── Gateway / DNS Policies ───────────────────────────────────────────────────

export interface CloudflareGatewayPolicy {
  id: string;
  name: string;
  action: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GET /accounts/{account_id}/gateway/rules
 * List Gateway (DNS) firewall policies.
 */
export async function listGatewayPolicies(
  accountId: string,
  token: string,
): Promise<CFResult<CloudflareGatewayPolicy[]>> {
  return cfFetch<CloudflareGatewayPolicy[]>(
    `/accounts/${accountId}/gateway/rules`,
    token,
  );
}

// ─── Tunnels ──────────────────────────────────────────────────────────────────

export interface CloudflareTunnel {
  id: string;
  name: string;
  status: string;
  created_at: string;
  deleted_at?: string;
}

/**
 * GET /accounts/{account_id}/cfd_tunnel
 * List Cloudflare Tunnels.
 */
export async function listTunnels(
  accountId: string,
  token: string,
): Promise<CFResult<CloudflareTunnel[]>> {
  return cfFetch<CloudflareTunnel[]>(
    `/accounts/${accountId}/cfd_tunnel?is_deleted=false&per_page=25`,
    token,
  );
}

// ─── Security / Firewall Events ───────────────────────────────────────────────

export interface ZoneSecuritySummary {
  total: number;
  by_action?: Record<string, number>;
  by_type?: Record<string, number>;
}

/**
 * GET /zones/{zone_id}/security/analytics
 * Fetch security event analytics (threats blocked, type breakdown).
 */
export async function getSecurityAnalytics(
  zoneId: string,
  token: string,
): Promise<CFResult<any>> {
  return cfFetch<any>(
    `/zones/${zoneId}/security/analytics?metrics=count&dimensions=action&date_range=168h`,
    token,
  );
}

// ─── Account ─────────────────────────────────────────────────────────────────

export interface CloudflareAccount {
  id: string;
  name: string;
  created_on: string;
  settings?: { enforce_twofactor?: boolean; use_account_custom_ns_by_default?: boolean };
}

/**
 * GET /accounts
 * Fetch the authenticated user's accounts.
 */
export async function listAccounts(
  token: string,
): Promise<CFResult<CloudflareAccount[]>> {
  return cfFetch<CloudflareAccount[]>('/accounts?per_page=5', token);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

// ─── Workers Analytics (GraphQL) ────────────────────────────────────────────

export interface WorkerDailyStats {
  date:        string;     // 'YYYY-MM-DD'
  requests:    number;
  errors:      number;
  cpuTimeP50:  number;     // microseconds
  cpuTimeP90:  number;
  subrequests: number;
}

export interface WorkerScriptAnalytics {
  scriptName:    string;
  totalRequests: number;
  totalErrors:   number;
  errorRate:     number;   // 0-1
  cpuTimeP50:    number;   // microseconds
  cpuTimeP90:    number;
  daily:         WorkerDailyStats[];
}

/**
 * POST https://api.cloudflare.com/client/v4/graphql
 * Fetch Workers invocation analytics for all scripts (or a single script)
 * for the past 7 days via Cloudflare GraphQL Analytics API.
 */
export async function getWorkersAnalytics(
  accountId: string,
  token: string,
  scriptName?: string,
): Promise<CFResult<WorkerScriptAnalytics[]>> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const until = new Date().toISOString().split('T')[0];

  const scriptFilter = scriptName ? `, scriptName: "${scriptName}"` : '';

  const query = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        workersAnalyticsDailyGroups(
          limit: 10000
          filter: { date_geq: "${since}", date_leq: "${until}"${scriptFilter} }
          orderBy: [date_ASC]
        ) {
          dimensions { scriptName date }
          sum { requests errors subrequests }
          quantiles { cpuTimeP50 cpuTimeP90 }
        }
      }
    }
  }`;

  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok || body?.errors?.length) {
      const msg = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
      return { error: `GraphQL: ${msg}` };
    }

    const groups: any[] =
      body?.data?.viewer?.accounts?.[0]?.workersAnalyticsDailyGroups ?? [];

    // Aggregate per scriptName
    const map: Record<string, WorkerScriptAnalytics> = {};
    for (const g of groups) {
      const name = g.dimensions?.scriptName ?? 'unknown';
      if (!map[name]) {
        map[name] = { scriptName: name, totalRequests: 0, totalErrors: 0, errorRate: 0, cpuTimeP50: 0, cpuTimeP90: 0, daily: [] };
      }
      const req = g.sum?.requests ?? 0;
      const err = g.sum?.errors   ?? 0;
      map[name].totalRequests += req;
      map[name].totalErrors   += err;
      map[name].cpuTimeP50     = Math.max(map[name].cpuTimeP50, g.quantiles?.cpuTimeP50 ?? 0);
      map[name].cpuTimeP90     = Math.max(map[name].cpuTimeP90, g.quantiles?.cpuTimeP90 ?? 0);
      map[name].daily.push({
        date:        g.dimensions?.date ?? '',
        requests:    req,
        errors:      err,
        cpuTimeP50:  g.quantiles?.cpuTimeP50 ?? 0,
        cpuTimeP90:  g.quantiles?.cpuTimeP90 ?? 0,
        subrequests: g.sum?.subrequests ?? 0,
      });
    }
    for (const s of Object.values(map)) {
      s.errorRate = s.totalRequests > 0 ? s.totalErrors / s.totalRequests : 0;
    }
    return { data: Object.values(map) };
  } catch (e: any) {
    return { error: e?.message ?? 'Network error' };
  }
}

// ─── Worker Routes ────────────────────────────────────────────────────────────

export interface CloudflareWorkerRoute {
  id:      string;
  pattern: string;
  script:  string;
}

/**
 * GET /zones/{zone_id}/workers/routes
 * List all Worker routes attached to a zone.
 */
export async function listWorkerRoutes(
  zoneId: string,
  token: string,
): Promise<CFResult<CloudflareWorkerRoute[]>> {
  return cfFetch<CloudflareWorkerRoute[]>(
    `/zones/${zoneId}/workers/routes`,
    token,
  );
}

/**
 * GET /accounts/{account_id}/workers/scripts/{script_name}
 * Fetch metadata for a single Worker script.
 */
export async function getWorkerScript(
  accountId: string,
  scriptName: string,
  token: string,
): Promise<CFResult<CloudflareWorkerScript>> {
  return cfFetch<CloudflareWorkerScript>(
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}`,
    token,
  );
}

/** Format CPU microseconds to readable string */
export function formatCPU(us: number): string {
  if (us === 0) return '—';
  if (us < 1000) return `${us}µs`;
  return `${(us / 1000).toFixed(1)}ms`;
}

/** Format bytes to human-readable (KB / MB / GB). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format large numbers with K/M suffixes. */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Pages API ───────────────────────────────────────────────────────────────

export interface CloudflarePagesDeploymentStage {
  name:       string;    // 'queued' | 'initialize' | 'clone_repo' | 'build' | 'deploy'
  status:     string;    // 'success' | 'failure' | 'active' | 'idle' | 'skipped'
  started_on: string | null;
  ended_on:   string | null;
}

export interface CloudflarePagesDeployment {
  id:                string;
  short_id:          string;
  project_id:        string;
  project_name:      string;
  environment:       string;   // 'production' | 'preview'
  url:               string;
  created_on:        string;
  modified_on:       string;
  latest_stage:      CloudflarePagesDeploymentStage;
  deployment_trigger: {
    type:     string;  // 'push' | 'api' | 'ad_hoc'
    metadata: {
      branch?:       string;
      commit_hash?:  string;
      commit_message?: string;
    };
  };
  stages:            CloudflarePagesDeploymentStage[];
  build_config?: {
    build_command?:     string;
    destination_dir?:   string;
    root_dir?:          string;
    web_analytics_tag?: string;
  };
  source?: {
    type:   string;   // 'github' | 'gitlab'
    config: {
      owner?:      string;
      repo_name?:  string;
      production_branch?: string;
    };
  };
  aliases: string[];
  is_skipped: boolean;
  files?: Record<string, string>;
}

export interface CloudflarePagesProject {
  id:           string;
  name:         string;
  subdomain:    string;   // project.pages.dev
  domains:      string[];
  source?: {
    type:   string;
    config: {
      owner?:             string;
      repo_name?:         string;
      production_branch?: string;
      pr_comments_enabled?: boolean;
      deployments_enabled?: boolean;
    };
  };
  build_config: {
    build_command?:   string;
    destination_dir?: string;
    root_dir?:        string;
  };
  deployment_configs: {
    production?: {
      env_vars?: Record<string, { value: string }>;
      compatibility_date?: string;
      compatibility_flags?: string[];
    };
    preview?: {
      env_vars?: Record<string, { value: string }>;
    };
  };
  latest_deployment?: CloudflarePagesDeployment;
  canonical_deployment?: CloudflarePagesDeployment;
  created_on:   string;
  modified_on:  string;
  production_branch: string;
}

/**
 * GET /accounts/{account_id}/pages/projects
 * List all Pages projects under the account.
 */
export async function listPagesProjects(
  accountId: string,
  token: string,
): Promise<CFResult<CloudflarePagesProject[]>> {
  return cfFetch<CloudflarePagesProject[]>(
    `/accounts/${accountId}/pages/projects?per_page=25`,
    token,
  );
}

/**
 * GET /accounts/{account_id}/pages/projects/{project_name}
 * Fetch a single Pages project with its latest_deployment.
 */
export async function getPagesProject(
  accountId: string,
  projectName: string,
  token: string,
): Promise<CFResult<CloudflarePagesProject>> {
  return cfFetch<CloudflarePagesProject>(
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`,
    token,
  );
}

/**
 * GET /accounts/{account_id}/pages/projects/{project_name}/deployments
 * List deployments for a Pages project (newest first).
 */
export async function listPagesDeployments(
  accountId: string,
  projectName: string,
  token: string,
  page = 1,
): Promise<CFResult<CloudflarePagesDeployment[]>> {
  return cfFetch<CloudflarePagesDeployment[]>(
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments?per_page=10&page=${page}`,
    token,
  );
}

/**
 * POST /accounts/{account_id}/pages/projects/{project_name}/deployments
 * Trigger a new deployment (ad-hoc / manual redeploy).
 */
export async function triggerPagesDeployment(
  accountId: string,
  projectName: string,
  token: string,
): Promise<CFResult<CloudflarePagesDeployment>> {
  return cfFetch<CloudflarePagesDeployment>(
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

/**
 * DELETE /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}
 * Delete (cancel) a specific Pages deployment.
 */
export async function deletePagesDeployment(
  accountId: string,
  projectName: string,
  deploymentId: string,
  token: string,
): Promise<CFResult<unknown>> {
  return cfFetch<unknown>(
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments/${deploymentId}`,
    token,
    { method: 'DELETE' },
  );
}

// ─── SSL / TLS ───────────────────────────────────────────────────────────────

export type SSLMode = 'off' | 'flexible' | 'full' | 'strict';

export interface SSLSetting {
  id:         string;   // 'ssl'
  value:      SSLMode;
  editable:   boolean;
  modified_on: string;
}

export interface SSLVerificationRecord {
  brand_check:             boolean;
  cert_pack_uuid:          string;
  certificate_status:      string;  // 'active' | 'pending_validation' | 'expired' | ...
  signature:               string;
  type:                    string;  // 'universal' | 'dedicated'
  validation_errors?:      { message: string }[];
  validation_type?:        string;
  verification_info?: {
    record_name:   string;
    record_target: string;
  };
  issued_on?:   string;
  expires_on?:  string;
  hosts?:       string[];
}

export interface HSSTSetting {
  enabled:            boolean;
  max_age:            number;
  include_subdomains: boolean;
  nosniff:            boolean;
  preload:            boolean;
}

export interface AlwaysHTTPSSetting {
  id:    string;
  value: 'on' | 'off';
}

export interface TLSVersionSetting {
  id:    string;
  value: string;  // '1.0' | '1.1' | '1.2' | '1.3'
}

/**
 * GET /zones/{zone_id}/settings/ssl
 * Get the current SSL/TLS encryption mode.
 */
export async function getSSLSetting(
  zoneId: string,
  token: string,
): Promise<CFResult<SSLSetting>> {
  return cfFetch<SSLSetting>(`/zones/${zoneId}/settings/ssl`, token);
}

/**
 * PATCH /zones/{zone_id}/settings/ssl
 * Update the SSL/TLS encryption mode.
 */
export async function updateSSLSetting(
  zoneId: string,
  mode: SSLMode,
  token: string,
): Promise<CFResult<SSLSetting>> {
  return cfFetch<SSLSetting>(
    `/zones/${zoneId}/settings/ssl`,
    token,
    { method: 'PATCH', body: JSON.stringify({ value: mode }) },
  );
}

/**
 * GET /zones/{zone_id}/ssl/verification
 * Get the SSL/TLS certificate verification status.
 */
export async function getSSLVerification(
  zoneId: string,
  token: string,
): Promise<CFResult<SSLVerificationRecord[]>> {
  return cfFetch<SSLVerificationRecord[]>(`/zones/${zoneId}/ssl/verification`, token);
}

/**
 * GET /zones/{zone_id}/settings/always_use_https
 */
export async function getAlwaysHTTPS(
  zoneId: string,
  token: string,
): Promise<CFResult<AlwaysHTTPSSetting>> {
  return cfFetch<AlwaysHTTPSSetting>(`/zones/${zoneId}/settings/always_use_https`, token);
}

/**
 * PATCH /zones/{zone_id}/settings/always_use_https
 */
export async function updateAlwaysHTTPS(
  zoneId: string,
  value: 'on' | 'off',
  token: string,
): Promise<CFResult<AlwaysHTTPSSetting>> {
  return cfFetch<AlwaysHTTPSSetting>(
    `/zones/${zoneId}/settings/always_use_https`,
    token,
    { method: 'PATCH', body: JSON.stringify({ value }) },
  );
}

/**
 * GET /zones/{zone_id}/settings/security_header (HSTS)
 */
export async function getHSTSSetting(
  zoneId: string,
  token: string,
): Promise<CFResult<{ id: string; value: HSSTSetting }>> {
  return cfFetch<{ id: string; value: HSSTSetting }>(
    `/zones/${zoneId}/settings/security_header`,
    token,
  );
}

/**
 * PATCH /zones/{zone_id}/settings/security_header (HSTS)
 */
export async function updateHSTSSetting(
  zoneId: string,
  hsts: Partial<HSSTSetting>,
  token: string,
): Promise<CFResult<{ id: string; value: HSSTSetting }>> {
  return cfFetch<{ id: string; value: HSSTSetting }>(
    `/zones/${zoneId}/settings/security_header`,
    token,
    { method: 'PATCH', body: JSON.stringify({ value: { strict_transport_security: hsts } }) },
  );
}

/**
 * GET /zones/{zone_id}/settings/min_tls_version
 */
export async function getTLSMinVersion(
  zoneId: string,
  token: string,
): Promise<CFResult<TLSVersionSetting>> {
  return cfFetch<TLSVersionSetting>(`/zones/${zoneId}/settings/min_tls_version`, token);
}

/**
 * PATCH /zones/{zone_id}/settings/min_tls_version
 */
export async function updateTLSMinVersion(
  zoneId: string,
  version: string,
  token: string,
): Promise<CFResult<TLSVersionSetting>> {
  return cfFetch<TLSVersionSetting>(
    `/zones/${zoneId}/settings/min_tls_version`,
    token,
    { method: 'PATCH', body: JSON.stringify({ value: version }) },
  );
}

// ─── WAF (Web Application Firewall) ─────────────────────────────────────────

export type WAFPackageDetectionMode = 'traditional' | 'anomaly';
export type WAFPackageActionMode    = 'simulate' | 'block' | 'challenge';
export type WAFSensitivity          = 'high' | 'medium' | 'low' | 'off';
export type WAFGroupMode            = 'on' | 'off' | 'default';

export interface CloudflareWAFPackage {
  id:              string;
  name:            string;
  description:     string;
  zone_id:         string;
  status:          'active' | 'not-active';
  action_mode:     WAFPackageActionMode;
  detection_mode:  WAFPackageDetectionMode;
  sensitivity?:    WAFSensitivity;   // OWASP only
}

export interface CloudflareWAFGroup {
  id:                   string;
  name:                 string;
  description:          string;
  package_id:           string;
  rules_count:          number;
  modified_rules_count: number;
  mode:                 WAFGroupMode;
}

/**
 * GET /zones/{zone_id}/firewall/waf/packages
 * List all WAF managed rule packages for a zone.
 */
export async function listWAFPackages(
  zoneId: string,
  token: string,
): Promise<CFResult<CloudflareWAFPackage[]>> {
  return cfFetch<CloudflareWAFPackage[]>(
    `/zones/${zoneId}/firewall/waf/packages?per_page=50`,
    token,
  );
}

/**
 * PATCH /zones/{zone_id}/firewall/waf/packages/{package_id}
 * Update a WAF package (action_mode, sensitivity, status).
 */
export async function updateWAFPackage(
  zoneId: string,
  packageId: string,
  data: { action_mode?: WAFPackageActionMode; sensitivity?: WAFSensitivity; status?: 'active' | 'not-active' },
  token: string,
): Promise<CFResult<CloudflareWAFPackage>> {
  return cfFetch<CloudflareWAFPackage>(
    `/zones/${zoneId}/firewall/waf/packages/${packageId}`,
    token,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
}

/**
 * GET /zones/{zone_id}/firewall/waf/packages/{package_id}/groups
 * List rule groups within a WAF package.
 */
export async function listWAFGroups(
  zoneId: string,
  packageId: string,
  token: string,
): Promise<CFResult<CloudflareWAFGroup[]>> {
  return cfFetch<CloudflareWAFGroup[]>(
    `/zones/${zoneId}/firewall/waf/packages/${packageId}/groups?per_page=100`,
    token,
  );
}

/**
 * PATCH /zones/{zone_id}/firewall/waf/packages/{package_id}/groups/{group_id}
 * Update the mode for a rule group (on / off / default).
 */
export async function updateWAFGroup(
  zoneId: string,
  packageId: string,
  groupId: string,
  mode: WAFGroupMode,
  token: string,
): Promise<CFResult<CloudflareWAFGroup>> {
  return cfFetch<CloudflareWAFGroup>(
    `/zones/${zoneId}/firewall/waf/packages/${packageId}/groups/${groupId}`,
    token,
    { method: 'PATCH', body: JSON.stringify({ mode }) },
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Duration in seconds between two ISO date strings */
export function deployDurationSec(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  try {
    return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  } catch { return 0; }
}

/** Format deployment duration: "1m 23s" or "42s" */
export function formatDuration(sec: number): string {
  if (sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
