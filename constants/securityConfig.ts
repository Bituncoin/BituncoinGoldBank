/**
 * BTNG712 Sovereign Security Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * READ-ONLY constants used by the Handshake, SSL Pinning, and
 * Verified Circuit Breaker services.
 *
 * ⚠️  PRODUCTION CHECKLIST
 *   1.  Generate a Master Sovereign Keypair on an offline HSM.
 *   2.  Replace ROOT_AUTHORITY_ADDRESS below with your real secp256k1
 *       Ethereum-format address derived from that keypair.
 *   3.  For each node, sign the string "BTNG-SOVEREIGN-NODE-HANDSHAKE"
 *       with the node's unique private key, publish the signature at
 *       GET /api/identity-proof, and add the node address to
 *       AUTHORIZED_NODE_ADDRESSES.
 *   4.  Replace PUBLIC_KEY_HASHES with real SHA-256 hashes of your
 *       TLS leaf certificate public keys (openssl x509 -pubkey … | openssl pkey … | openssl dgst -sha256 -binary | base64)
 *   5.  Always include at least ONE backup hash to allow certificate
 *       rotation without forcing an emergency app update.
 */

// ── Root authority ────────────────────────────────────────────────────────────
/**
 * The Ethereum-format address that all BTNG712 node identity proofs must
 * be signed by.  Derived from the Master Sovereign Private Key (stored
 * in an offline HSM — never in code).
 */
export const ROOT_AUTHORITY_ADDRESS =
  '0x0000000000000000000000000000000000000000'; // ← replace in production

/**
 * The canonical message every node signs to prove sovereignty.
 * Must match the string signed on the server side (case-sensitive).
 */
export const HANDSHAKE_MESSAGE = 'BTNG-SOVEREIGN-NODE-HANDSHAKE';

// ── Authorized node pool (auto-selected by VerifiedBreakerService) ───────────
/**
 * Array of { url, name } objects representing every sovereign BTNG712 node.
 * The Verified Breaker will try nodes in order, skipping any that fail
 * liveness or the sovereign handshake.
 *
 * Priority order:
 *  1.  Supabase Edge Function (always available, no VPS dependency)
 *  2.  Primary Hostinger VPS (168.231.79.52)
 *  3.  Secondary Hostinger VPS (72.62.160.237)
 */
export const SOVEREIGN_NODES = [
  {
    url: 'https://mebznlvyycuuddfkmebz.backend.onspace.ai/functions/v1/btng-reserve-status',
    name: 'BTNG Edge Node (Supabase)',
    isEdge: true,      // Edge functions skip raw handshake — authenticated via JWT
  },
  {
    url: 'http://168.231.79.52:64799',
    name: 'Primary VPS — srv1282934.hstgr.cloud',
    isEdge: false,
  },
  {
    url: 'http://72.62.160.237:64799',
    name: 'Secondary VPS — srv1219227.hstgr.cloud',
    isEdge: false,
  },
] as const;

export type SovereignNode = (typeof SOVEREIGN_NODES)[number];

// ── SSL Certificate Pinning configuration ────────────────────────────────────
/**
 * Domain → SHA-256 public-key hashes mapping consumed by
 * react-native-ssl-public-key-pinning.
 *
 * How to generate a hash from your certificate:
 *   openssl s_client -connect yourdomain.com:443 \
 *     -servername yourdomain.com 2>/dev/null </dev/null \
 *     | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p' \
 *     | openssl x509 -noout -pubkey \
 *     | openssl pkey -pubin -outform der \
 *     | openssl dgst -sha256 -binary \
 *     | openssl base64
 */
export const SSL_PIN_CONFIG: Record<
  string,
  { includeSubdomains: boolean; publicKeyHashes: string[] }
> = {
  /**
   * Supabase / OnSpace backend domain.
   * Replace hashes with real values generated from the production certificate.
   */
  'mebznlvyycuuddfkmebz.backend.onspace.ai': {
    includeSubdomains: true,
    publicKeyHashes: [
      'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // ← primary (replace)
      'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', // ← backup  (replace)
    ],
  },
  /**
   * Primary sovereign VPS.
   */
  '168.231.79.52': {
    includeSubdomains: false,
    publicKeyHashes: [
      'sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=', // ← replace
      'sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=', // ← backup
    ],
  },
  /**
   * Secondary sovereign VPS.
   */
  '72.62.160.237': {
    includeSubdomains: false,
    publicKeyHashes: [
      'sha256/EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE=', // ← replace
      'sha256/FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF=', // ← backup
    ],
  },
};

// ── Timing / retry constants ──────────────────────────────────────────────────
/** How long (ms) to wait for a node liveness ping before moving to the next. */
export const NODE_PING_TIMEOUT_MS = 4_000;

/** How long (ms) to wait for a handshake response before aborting. */
export const HANDSHAKE_TIMEOUT_MS = 6_000;

/**
 * Maximum consecutive handshake failures before a node is temporarily
 * quarantined by the Verified Breaker.
 */
export const MAX_NODE_FAILURES = 3;

/** Quarantine duration (ms) after MAX_NODE_FAILURES is reached. */
export const NODE_QUARANTINE_MS = 5 * 60_000; // 5 minutes
