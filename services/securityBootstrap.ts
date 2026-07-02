/**
 * BTNG712 Security Bootstrap
 * ─────────────────────────────────────────────────────────────────────────────
 * Single entry-point that initialises ALL security layers in the correct order:
 *
 *   1.  SSL Certificate Pinning  (network layer — must be first)
 *   2.  Sovereign Handshake pre-warm  (discovers the best verified node early)
 *
 * Call this from liveDataBootstrap.ts or any service that runs at startup.
 * It is deliberately separate from app/_layout.tsx to honour the constraint
 * of NEVER modifying existing files.
 *
 * Usage
 * ─────
 *   import { bootstrapSecurity } from '@/services/securityBootstrap';
 *   await bootstrapSecurity();         // call once after app mount
 */

import { initSslPinning }         from '@/services/sslPinningService';
import { getVerifiedLiveNode }    from '@/services/verifiedBreakerService';

export interface SecurityBootstrapResult {
  sslPinning: {
    initialized: boolean;
    mode:        string;
    domains:     string[];
  };
  nodeDiscovery: {
    success:     boolean;
    nodeName?:   string;
    nodeUrl?:    string;
    error?:      string;
    durationMs:  number;
  };
  overallStatus: 'SECURE' | 'PARTIAL' | 'DEGRADED';
}

let _bootstrapped = false;
let _result: SecurityBootstrapResult | null = null;

/**
 * Idempotent security bootstrap.
 * Subsequent calls return the cached result from the first run.
 *
 * @param forceReinit  Set true to re-run even if already bootstrapped.
 */
export async function bootstrapSecurity(
  forceReinit = false
): Promise<SecurityBootstrapResult> {
  if (_bootstrapped && !forceReinit && _result) {
    return _result;
  }

  console.info('[SecurityBootstrap] 🔐 Initialising BTNG712 security layers…');
  const t0 = Date.now();

  // ── 1. SSL Pinning ────────────────────────────────────────────────────────
  const pinStatus = await initSslPinning();

  // ── 2. Node Discovery (pre-warm handshake) ────────────────────────────────
  const nodeStart = Date.now();
  let nodeDiscovery: SecurityBootstrapResult['nodeDiscovery'];

  try {
    const node = await getVerifiedLiveNode(true); // force re-verify on boot
    nodeDiscovery = {
      success:    true,
      nodeName:   node.name,
      nodeUrl:    node.url,
      durationMs: Date.now() - nodeStart,
    };
    console.info(
      `[SecurityBootstrap] ✅ Sovereign node verified: "${node.name}" (${nodeDiscovery.durationMs}ms)`
    );
  } catch (err: any) {
    nodeDiscovery = {
      success:    false,
      error:      err?.message ?? 'Node discovery failed',
      durationMs: Date.now() - nodeStart,
    };
    console.warn('[SecurityBootstrap] ⚠️  Node discovery failed:', nodeDiscovery.error);
  }

  // ── Determine overall status ──────────────────────────────────────────────
  let overallStatus: SecurityBootstrapResult['overallStatus'];
  if (pinStatus.mode === 'active' && nodeDiscovery.success) {
    overallStatus = 'SECURE';
  } else if (nodeDiscovery.success) {
    overallStatus = 'PARTIAL';   // node works but SSL pinning inactive
  } else {
    overallStatus = 'DEGRADED';  // no verified node available
  }

  _result = {
    sslPinning: {
      initialized: pinStatus.initialized,
      mode:        pinStatus.mode,
      domains:     pinStatus.domains,
    },
    nodeDiscovery,
    overallStatus,
  };

  _bootstrapped = true;

  const totalMs = Date.now() - t0;
  console.info(
    `[SecurityBootstrap] Status: ${overallStatus} (total: ${totalMs}ms)`
  );

  return _result;
}

/**
 * Returns the last bootstrap result without re-running.
 * Returns null if bootstrapSecurity() has never been called.
 */
export function getLastBootstrapResult(): SecurityBootstrapResult | null {
  return _result;
}

/**
 * Quick check — returns true if the security bootstrap completed successfully
 * with at least a verified sovereign node.
 */
export function isSecurityReady(): boolean {
  return _bootstrapped && (_result?.nodeDiscovery.success ?? false);
}
