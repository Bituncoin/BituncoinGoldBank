/**
 * BTNG712 Verified Circuit Breaker Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Combines liveness checking + sovereign handshake into a single smart
 * node-selection layer.  Any component or service that needs to reach a
 * sovereign BTNG node should call getVerifiedLiveNode() rather than
 * hard-coding an IP address.
 *
 * Features
 * ────────
 *  • Tries nodes in priority order (Edge > Primary VPS > Secondary VPS)
 *  • Skips nodes that fail the liveness ping
 *  • Skips nodes that fail the sovereign ECDSA handshake
 *  • Quarantines nodes that breach MAX_NODE_FAILURES for NODE_QUARANTINE_MS
 *  • Exposes status/metrics for the admin dashboard
 *  • Thread-safe single-flight: concurrent callers share the same resolution
 *
 * Usage
 * ─────
 *   import { getVerifiedLiveNode } from '@/services/verifiedBreakerService';
 *
 *   const node = await getVerifiedLiveNode();
 *   const res  = await fetch(`${node.url}/api/v1/stats`);
 */

import {
  SOVEREIGN_NODES,
  NODE_PING_TIMEOUT_MS,
  MAX_NODE_FAILURES,
  NODE_QUARANTINE_MS,
  type SovereignNode,
} from '@/constants/securityConfig';
import { pingNode, verifyNodeIdentity, type HandshakeResult } from '@/services/handshakeService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifiedNode {
  url:       string;
  name:      string;
  isEdge:    boolean;
  handshake: HandshakeResult;
  resolvedAt: Date;
}

export interface NodeHealth {
  url:             string;
  name:            string;
  failures:        number;
  quarantinedUntil: number;  // epoch ms, 0 = not quarantined
  lastVerified:    number;   // epoch ms, 0 = never
  lastResult:      'pass' | 'fail' | 'unknown';
}

// ─── In-memory state ──────────────────────────────────────────────────────────

const healthMap = new Map<string, NodeHealth>();

// Initialise health tracking for every configured node
SOVEREIGN_NODES.forEach(n => {
  healthMap.set(n.url, {
    url:              n.url,
    name:             n.name,
    failures:         0,
    quarantinedUntil: 0,
    lastVerified:     0,
    lastResult:       'unknown',
  });
});

// Single-flight: while a resolution is in-progress, concurrent callers await
// the same promise rather than spawning N parallel handshakes.
let _inflight: Promise<VerifiedNode> | null = null;

// Last successfully resolved node (used as a fast-path cache for 30s)
let _cached: { node: VerifiedNode; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isQuarantined(health: NodeHealth): boolean {
  return health.quarantinedUntil > Date.now();
}

function recordFailure(url: string): void {
  const h = healthMap.get(url);
  if (!h) return;
  h.failures += 1;
  h.lastResult = 'fail';
  if (h.failures >= MAX_NODE_FAILURES) {
    h.quarantinedUntil = Date.now() + NODE_QUARANTINE_MS;
    console.warn(
      `[VerifiedBreaker] ⚠️  Node quarantined for ${NODE_QUARANTINE_MS / 1000}s: ${h.name}`
    );
  }
  healthMap.set(url, h);
}

function recordSuccess(url: string): void {
  const h = healthMap.get(url);
  if (!h) return;
  h.failures        = 0;
  h.quarantinedUntil = 0;
  h.lastVerified    = Date.now();
  h.lastResult      = 'pass';
  healthMap.set(url, h);
}

async function tryNode(node: SovereignNode): Promise<VerifiedNode | null> {
  const health = healthMap.get(node.url);

  // Skip quarantined nodes
  if (health && isQuarantined(health)) {
    const remaining = Math.ceil((health.quarantinedUntil - Date.now()) / 1000);
    console.info(
      `[VerifiedBreaker] Skipping quarantined node "${node.name}" (${remaining}s remaining)`
    );
    return null;
  }

  // ── Step 1: Liveness ping ────────────────────────────────────────────────
  const alive = await pingNode(node.url, NODE_PING_TIMEOUT_MS);
  if (!alive) {
    console.info(`[VerifiedBreaker] Node offline: ${node.name}`);
    recordFailure(node.url);
    return null;
  }

  // ── Step 2: Sovereign handshake ──────────────────────────────────────────
  const handshake = await verifyNodeIdentity(node as any);
  if (!handshake.verified) {
    console.warn(
      `[VerifiedBreaker] ❌ Handshake FAILED for "${node.name}": ${handshake.error}`
    );
    recordFailure(node.url);
    return null;
  }

  recordSuccess(node.url);
  console.info(
    `[VerifiedBreaker] ✅ Verified "${node.name}" in ${handshake.durationMs}ms`
  );

  return {
    url:        node.url,
    name:       node.name,
    isEdge:     (node as any).isEdge ?? false,
    handshake,
    resolvedAt: new Date(),
  };
}

async function resolveNode(): Promise<VerifiedNode> {
  for (const node of SOVEREIGN_NODES) {
    const verified = await tryNode(node);
    if (verified) return verified;
  }
  throw new Error(
    '[VerifiedBreaker] CRITICAL: No secure sovereign nodes are reachable. ' +
    'All nodes failed liveness or handshake verification.'
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the first sovereign node that passes both liveness and handshake.
 *
 * • Uses a 30-second warm cache to avoid re-handshaking on every API call.
 * • Uses single-flight to coalesce concurrent resolution attempts.
 * • Throws if no node passes — callers should handle this gracefully.
 *
 * @param forceRefresh  Set true to bypass the cache and re-verify.
 */
export async function getVerifiedLiveNode(forceRefresh = false): Promise<VerifiedNode> {
  // Fast-path: return cached node if still fresh
  if (!forceRefresh && _cached && _cached.expiresAt > Date.now()) {
    return _cached.node;
  }

  // Single-flight: coalesce concurrent callers
  if (_inflight) return _inflight;

  _inflight = resolveNode()
    .then(node => {
      _cached   = { node, expiresAt: Date.now() + CACHE_TTL_MS };
      _inflight = null;
      return node;
    })
    .catch(err => {
      _inflight = null;
      throw err;
    });

  return _inflight;
}

/**
 * Force-invalidates the node cache so the next call re-runs verification.
 * Call this after a network error to trigger immediate re-discovery.
 */
export function invalidateNodeCache(): void {
  _cached = null;
  console.info('[VerifiedBreaker] Node cache invalidated — will re-verify on next call.');
}

/**
 * Returns a snapshot of the health state for every configured node.
 * Useful for admin dashboards and diagnostics screens.
 */
export function getNodeHealthSnapshot(): NodeHealth[] {
  return Array.from(healthMap.values()).map(h => ({ ...h }));
}

/**
 * Releases a node from quarantine manually.
 * Useful for admin-triggered "retry" actions.
 */
export function releaseNodeFromQuarantine(nodeUrl: string): void {
  const h = healthMap.get(nodeUrl);
  if (!h) return;
  h.failures        = 0;
  h.quarantinedUntil = 0;
  healthMap.set(nodeUrl, h);
  invalidateNodeCache();
  console.info(`[VerifiedBreaker] Node released from quarantine: ${nodeUrl}`);
}

/**
 * Convenience wrapper: fetches a URL via the first verified node.
 * Automatically prepends the verified node URL if path starts with '/api'.
 *
 * @param apiPath  e.g. '/api/v1/stats'  or a full URL
 * @param options  standard RequestInit
 */
export async function verifiedFetch(
  apiPath: string,
  options?: RequestInit
): Promise<Response> {
  const node = await getVerifiedLiveNode();

  let fullUrl: string;
  if (apiPath.startsWith('http')) {
    fullUrl = apiPath;
  } else if (node.isEdge) {
    // Edge function uses ?path= query parameter convention
    fullUrl = `${node.url}?path=${encodeURIComponent(apiPath)}`;
  } else {
    fullUrl = `${node.url}${apiPath}`;
  }

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'X-BTNG-Client':   'BTNG712-Mobile',
      'X-BTNG-Node':     node.name,
      ...(options?.headers ?? {}),
    },
  });

  // On server error, invalidate cache so next call tries a different node
  if (res.status >= 500) {
    invalidateNodeCache();
  }

  return res;
}
