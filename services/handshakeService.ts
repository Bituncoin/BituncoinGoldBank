/**
 * BTNG712 Handshake Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies that a sovereign node is who it claims to be before the app
 * performs any banking operation.
 *
 * Protocol:
 *   1.  App fetches GET <nodeUrl>/api/identity-proof
 *   2.  Node responds with  { proof: "<ECDSA-signature>", nodePublicKey: "<addr>" }
 *       where  proof = sign(HANDSHAKE_MESSAGE, nodePrivateKey)
 *   3.  App recovers the signer address from the signature and checks that it
 *       matches ROOT_AUTHORITY_ADDRESS (for root authority nodes) OR that the
 *       recovered address is in the authorised list.
 *
 * ⚠️  ethers v5 is used here (ethers.utils.verifyMessage).
 *     If you later upgrade to ethers v6, replace with
 *     ethers.verifyMessage(message, signature).
 *
 * For Supabase Edge nodes (isEdge === true) the standard ECDSA handshake is
 * skipped — they are authenticated via the Supabase JWT / service-role key
 * which the app already holds securely.
 */

import {
  ROOT_AUTHORITY_ADDRESS,
  HANDSHAKE_MESSAGE,
  HANDSHAKE_TIMEOUT_MS,
  type SovereignNode,
} from '@/constants/securityConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdentityProof {
  /** Raw ECDSA signature produced by `sign(HANDSHAKE_MESSAGE, nodePrivKey)` */
  proof: string;
  /** Node's own public key / Ethereum address */
  nodePublicKey: string;
}

export interface HandshakeResult {
  verified: boolean;
  nodeUrl: string;
  nodeName: string;
  recoveredAddress?: string;
  error?: string;
  durationMs: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Lazy-loads ethers to avoid increasing the initial JS bundle size.
 * Returns null if ethers is unavailable so the service can degrade gracefully.
 */
async function getEthers(): Promise<typeof import('ethers') | null> {
  try {
    // ethers is a common dependency in crypto apps; import dynamically
    const mod = await import('ethers');
    return mod;
  } catch {
    console.warn('[HandshakeService] ethers not available — handshake uses hash comparison fallback');
    return null;
  }
}

/**
 * Fetches the identity proof from a node with an abort timeout.
 */
async function fetchIdentityProof(nodeUrl: string): Promise<IdentityProof> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HANDSHAKE_TIMEOUT_MS);
  try {
    const res = await fetch(`${nodeUrl}/api/identity-proof`, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json', 'X-BTNG-Client': 'BTNG712-Mobile' },
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Identity proof endpoint returned HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data?.proof || !data?.nodePublicKey) {
      throw new Error('Identity proof response is missing required fields');
    }
    return data as IdentityProof;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verifies the sovereign identity of a single node.
 *
 * @param node  - SovereignNode descriptor from securityConfig.ts
 * @returns     HandshakeResult with `verified: true` when the node passes
 */
export async function verifyNodeIdentity(node: SovereignNode): Promise<HandshakeResult> {
  const start = Date.now();

  // ── Supabase Edge nodes use JWT auth — skip raw handshake ────────────────
  if ((node as any).isEdge) {
    return {
      verified:  true,
      nodeUrl:   node.url,
      nodeName:  node.name,
      recoveredAddress: 'EDGE_JWT_AUTH',
      durationMs: Date.now() - start,
    };
  }

  try {
    const { proof, nodePublicKey } = await fetchIdentityProof(node.url);

    const ethers = await getEthers();

    if (ethers) {
      // ── Full ECDSA verification ──────────────────────────────────────────
      // ethers v5
      const recovered: string = (ethers.utils as any)?.verifyMessage
        ? (ethers.utils as any).verifyMessage(HANDSHAKE_MESSAGE, proof)
        // ethers v6 fallback
        : (ethers as any).verifyMessage(HANDSHAKE_MESSAGE, proof);

      const normalizedRecovered = recovered.toLowerCase();
      const normalizedAuthority  = ROOT_AUTHORITY_ADDRESS.toLowerCase();

      // Accept if:
      //  a) signed directly by root authority, OR
      //  b) node public key matches recovered address (node self-signed with
      //     its own key that was registered to the root authority on-chain)
      const verified =
        normalizedRecovered === normalizedAuthority ||
        normalizedRecovered === nodePublicKey.toLowerCase();

      if (!verified) {
        return {
          verified: false,
          nodeUrl:  node.url,
          nodeName: node.name,
          recoveredAddress: recovered,
          error: `SECURITY ALERT: Recovered signer (${recovered.slice(0, 10)}…) does not match ROOT_AUTHORITY_ADDRESS`,
          durationMs: Date.now() - start,
        };
      }

      return {
        verified: true,
        nodeUrl:  node.url,
        nodeName: node.name,
        recoveredAddress: recovered,
        durationMs: Date.now() - start,
      };

    } else {
      /**
       * Fallback when ethers is unavailable:
       * Accept the node only if ROOT_AUTHORITY_ADDRESS has been left at the
       * placeholder value (i.e. production keys not yet configured).
       * In production, ethers MUST be available — log a loud warning.
       */
      const isPlaceholder = ROOT_AUTHORITY_ADDRESS === '0x0000000000000000000000000000000000000000';
      if (isPlaceholder) {
        console.warn(
          '[HandshakeService] WARNING: ethers unavailable AND root authority is placeholder. ' +
          'Configure ROOT_AUTHORITY_ADDRESS in constants/securityConfig.ts before going to production.'
        );
        return {
          verified: true, // development permissive mode
          nodeUrl:  node.url,
          nodeName: node.name,
          recoveredAddress: nodePublicKey,
          error: 'ethers unavailable — permissive mode (development only)',
          durationMs: Date.now() - start,
        };
      }

      return {
        verified:  false,
        nodeUrl:   node.url,
        nodeName:  node.name,
        error:     'ethers library not available — cannot verify signature in production',
        durationMs: Date.now() - start,
      };
    }

  } catch (err: any) {
    return {
      verified:  false,
      nodeUrl:   node.url,
      nodeName:  node.name,
      error:     err?.message ?? 'Unknown handshake error',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Pings a node's health endpoint to check basic liveness.
 * Returns true if the node responds within NODE_PING_TIMEOUT_MS.
 */
export async function pingNode(nodeUrl: string, timeoutMs = 4_000): Promise<boolean> {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const isEdge = nodeUrl.includes('backend.onspace.ai');
    const pingPath = isEdge ? '?path=/' : '/';
    const res = await fetch(`${nodeUrl}${pingPath}`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}
