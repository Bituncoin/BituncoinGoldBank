/**
 * BTNG Sovereign Bridge — React Native Service
 *
 * Mirrors the web sovereign-bridge.js pattern for the mobile app.
 *
 * Resolution order:
 *   1. Local Brain Gate  http://localhost:8087/govern  (dev / sovereign node)
 *   2. Edge Function     btng-brain-router             (cloud fallback)
 *
 * The app NEVER calls an anchor API until the Brain rules ALLOW.
 * Every decision is recorded in the Law Journal (btng_rulings table).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ── Configuration ─────────────────────────────────────────────────────────────
const BRAIN_GATE_URL   = 'http://localhost:8087/govern';
const BRAIN_HEALTH_URL = 'http://localhost:8087/health';
const SESSION_TOKEN_KEY = 'btng_session_token';
const BRAIN_TIMEOUT_MS  = 4000;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BrainContext {
  kyc_tier?:      number;   // 0 = none | 1 = basic | 2 = full
  jurisdiction?:  string;   // ISO country code e.g. "GH"
  risk_flag?:     boolean;
  is_customer?:   boolean;
  auth_tier?:     number;   // 1 = observer … 5 = sovereign council
  privacy_level?: 'standard' | 'maximum';
  user_id?:       string;
  email?:         string;
  target_loan?:   number;
  batch_size?:    number;
  mesh_scope?:    number;
}

export type Ruling =
  | 'ALLOW'
  | 'ALLOW_FULL'
  | 'ALLOW_REDUCED'
  | 'DENY'
  | 'ESCALATE_TO_BRANCH'
  | 'PASS'
  | 'ANCHORED';

export interface BrainDecision {
  session_id:      string;
  intent:          string;
  confidence:      number;
  ruling:          Ruling;
  tool:            string | null;
  policy_id:       string;
  policy?:         string;   // legacy alias
  reason:          string;
  network_node:    string;
  governed:        boolean;
  latency_ms:      number;
  external_token?: string;   // present on ALLOW rulings from local gate
  // client-side enrichment
  allowed:         boolean;
  bankerReply:     string;
}

// ── Natural language replies per ruling ───────────────────────────────────────
const RULER_REPLIES: Record<string, string> = {
  DENY:                'I am not permitted to assist with that under BTNG sovereign law.',
  ESCALATE_TO_BRANCH:  'I will connect you with your sovereign branch officer for this request.',
  ALLOW_REDUCED:       'I can assist with that — showing region-level information for your privacy tier.',
  ALLOW:               'Proceeding under BTNG policy.',
  ALLOW_FULL:          'Full access granted under your verified account tier.',
  PASS:                'I can help with that.',
  ANCHORED:            'Genesis anchor confirmed. This is the sovereign origin of the Law Journal — all rulings are measured from this immutable first entry.',
};

// ── Internal: timed fetch ─────────────────────────────────────────────────────
async function _timedFetch(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ── Session token helpers ─────────────────────────────────────────────────────
async function _getSessionToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; }
}

async function _saveSessionToken(token: string): Promise<void> {
  try { await AsyncStorage.setItem(SESSION_TOKEN_KEY, token); } catch {}
}

export async function clearSovereignSession(): Promise<void> {
  try { await AsyncStorage.removeItem(SESSION_TOKEN_KEY); } catch {}
}

// ── Check if the local Brain Gate is alive ────────────────────────────────────
export async function isBrainGateAlive(): Promise<boolean> {
  try {
    const res = await _timedFetch(BRAIN_HEALTH_URL, {}, BRAIN_TIMEOUT_MS);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Enrich a raw ruling with client-side fields ───────────────────────────────
function _enrich(raw: Record<string, any>): BrainDecision {
  const ruling  = raw.ruling as Ruling;
  const allowed = ['ALLOW', 'ALLOW_FULL', 'ALLOW_REDUCED', 'PASS', 'ANCHORED'].includes(ruling);
  return {
    ...raw,
    policy_id:   raw.policy_id ?? raw.policy ?? 'UNKNOWN',
    allowed,
    bankerReply: RULER_REPLIES[ruling] ?? 'Processing your request.',
  } as BrainDecision;
}

// ── Core: govern via local Brain Gate ────────────────────────────────────────
async function _governViaBrainGate(
  intent: string,
  context: BrainContext,
  sessionId: string,
): Promise<{ data: BrainDecision | null; error: string | null }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const savedToken = await _getSessionToken();
    if (savedToken) headers['X-BTNG-Sovereign-Session'] = savedToken;

    const res = await _timedFetch(
      BRAIN_GATE_URL,
      {
        method:  'POST',
        headers,
        body:    JSON.stringify({ intent, context, session_id: sessionId }),
      },
      BRAIN_TIMEOUT_MS,
    );

    if (!res.ok) return { data: null, error: `Brain Gate HTTP ${res.status}` };

    const raw = await res.json();

    // Persist external token for subsequent governed requests
    if (raw.external_token) await _saveSessionToken(raw.external_token);

    return { data: _enrich(raw), error: null };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { data: null, error: 'Brain Gate timeout — is brain_server.py running?' };
    }
    return { data: null, error: err?.message ?? 'Brain Gate unreachable' };
  }
}

// ── Fallback: govern via Edge Function ───────────────────────────────────────
async function _governViaEdgeFunction(
  input: string,
  context: BrainContext,
  sessionId?: string,
): Promise<{ data: BrainDecision | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('btng-brain-router', {
      body: { input, session_id: sessionId, context },
    });

    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = (await error.context?.text()) || msg; } catch {}
      }
      return { data: null, error: msg };
    }

    return { data: _enrich(data), error: null };
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Edge Function unreachable' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * btngGovern — sovereign gate check before any anchor call.
 *
 * Tries the local Brain Gate first (fast, HMAC-verified, logs to file journal).
 * Falls back to the cloud Edge Function if the gate is not running.
 *
 * Usage:
 *   const { data, error } = await btngGovern('intent_nft_verify', { jurisdiction: 'GH', auth_tier: 3 });
 *   if (!data?.allowed) return;          // DENY or ESCALATE handled by caller
 *   // safe to call anchor API with data.external_token in headers
 */
export async function btngGovern(
  intent: string,
  context: BrainContext = {},
  sessionId?: string,
): Promise<{ data: BrainDecision | null; error: string | null }> {
  const sid = sessionId ?? `mob-${Math.random().toString(36).slice(2, 10)}`;

  // Try local Brain Gate first
  const gateResult = await _governViaBrainGate(intent, context, sid);
  if (gateResult.data) return gateResult;

  // Gate is down — fall back to Edge Function (uses intent as input)
  return _governViaEdgeFunction(intent, context, sid);
}

/**
 * governedRoute — original API kept for backward compatibility.
 * New code should prefer btngGovern().
 */
export async function governedRoute(
  input: string,
  context: BrainContext = {},
  sessionId?: string,
): Promise<{ data: BrainDecision | null; error: string | null }> {
  return btngGovern(input, context, sessionId);
}

/**
 * btngFetch — governed drop-in for fetch() to any BTNG anchor endpoint.
 *
 * Calls btngGovern() first; on ALLOW attaches the external_token header
 * and removes any legacy static key before forwarding the request.
 *
 * Usage:
 *   const res = await btngFetch(
 *     'http://154.161.183.158:38982/api/v1/loans/music',
 *     { method: 'POST', body: JSON.stringify(payload) },
 *     'intent_nft_create_and_loan',
 *     { jurisdiction: 'GH', target_loan: 50000, auth_tier: 3 },
 *   );
 */
export async function btngFetch(
  url: string,
  options: RequestInit = {},
  intent: string,
  context: BrainContext = {},
): Promise<Response> {
  const { data: ruling, error } = await btngGovern(intent, context);

  if (error || !ruling) {
    throw new Error(error ?? 'Brain governance failed');
  }

  if (!ruling.allowed) {
    throw new Error(
      ruling.ruling === 'ESCALATE_TO_BRANCH'
        ? `LAW_ESCALATE:${ruling.policy_id}`
        : `LAW_DENY:${ruling.policy_id}`,
    );
  }

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };

  // Attach time-bound external token; NEVER the static legacy key
  if (ruling.external_token) {
    headers['X-BTNG-Sovereign-Session'] = ruling.external_token;
  }
  delete headers['X-BTNG-Sovereign-Key'];

  return fetch(url, { ...options, headers });
}

/**
 * Fetch the last N rulings from the Law Journal (cloud DB).
 */
export async function fetchRulings(limit = 50): Promise<{
  data: Array<{
    id:           string;
    ts:           string;
    session_id:   string;
    intent:       string;
    confidence:   number;
    policy_id:    string;
    ruling:       string;
    tool:         string | null;
    network_node: string;
    latency_ms:   number;
    reason:       string;
  }> | null;
  error: string | null;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('btng_rulings')
      .select('*')
      .order('ts', { ascending: false })
      .limit(limit);

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Failed to fetch rulings' };
  }
}
