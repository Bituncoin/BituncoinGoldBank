/**
 * BTNG712 SSL Certificate Pinning Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Initialises SSL public-key pinning for all sovereign BTNG domains so the
 * app refuses TLS connections whose certificate public key does not match a
 * pre-approved hash — blocking Man-in-the-Middle (MITM) attacks even when
 * the device trusts a rogue Certificate Authority.
 *
 * Library:  react-native-ssl-public-key-pinning
 * Install:  npm install react-native-ssl-public-key-pinning
 * Docs:     https://github.com/frw/react-native-ssl-public-key-pinning
 *
 * ⚠️  PRODUCTION NOTE
 *     The placeholder hash values in constants/securityConfig.ts MUST be
 *     replaced with real SHA-256 public-key hashes before going live.
 *     If a hash mismatch occurs the library throws a network error — your
 *     users will lose connectivity to that domain until the app is updated.
 *     Always include at least one BACKUP hash to allow safe rotation.
 *
 * ⚠️  DEVELOPMENT MODE
 *     SSL pinning is automatically disabled in development (__DEV__ === true)
 *     because Metro dev-server certificates do not match production hashes.
 *     Set FORCE_SSL_PINNING = true to override during testing.
 */

import { SSL_PIN_CONFIG } from '@/constants/securityConfig';

// ─── Control flags ────────────────────────────────────────────────────────────

/**
 * Set to true to enable pinning in development builds.
 * Leave false to avoid breaking hot-reload / Metro.
 */
const FORCE_SSL_PINNING = false;

// ─── State ────────────────────────────────────────────────────────────────────

let _initialized = false;
let _available   = false;   // whether the native module loaded successfully

export interface SslPinningStatus {
  initialized: boolean;
  available:   boolean;
  mode:        'active' | 'disabled_dev' | 'disabled_placeholder' | 'unavailable';
  domains:     string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Checks whether all public-key hashes are still placeholders.
 * If so, pinning is skipped (to avoid locking out the app before production
 * keys have been configured).
 */
function hasPlaceholderHashes(): boolean {
  return Object.values(SSL_PIN_CONFIG).some(cfg =>
    cfg.publicKeyHashes.some(h => h.includes('AAAAAAAAAA') || h.includes('BBBBBBBBBBB'))
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Must be called once at app startup (before any network requests to
 * sovereign nodes).  Idempotent — safe to call multiple times.
 *
 * Recommended placement:  app/_layout.tsx  useEffect on mount
 *  (but add it there ONLY as an additive call — do not modify _layout.tsx)
 *  Instead, call it from liveDataBootstrap.ts or a dedicated security bootstrap.
 */
export async function initSslPinning(): Promise<SslPinningStatus> {
  if (_initialized) {
    return getStatus();
  }

  // Skip in development unless forced
  if (__DEV__ && !FORCE_SSL_PINNING) {
    console.info('[SslPinningService] Disabled in development mode (__DEV__ = true).');
    _initialized = true;
    _available   = false;
    return getStatus();
  }

  // Skip if hashes are still placeholders
  if (hasPlaceholderHashes()) {
    console.warn(
      '[SslPinningService] Public-key hashes are still placeholders. ' +
      'SSL pinning is DISABLED until real hashes are configured in ' +
      'constants/securityConfig.ts — SSL_PIN_CONFIG.'
    );
    _initialized = true;
    _available   = false;
    return getStatus();
  }

  try {
    const { initializeSslPinning } = await import('react-native-ssl-public-key-pinning');
    await initializeSslPinning(SSL_PIN_CONFIG);
    _initialized = true;
    _available   = true;
    console.info(
      '[SslPinningService] ✅ SSL pinning ACTIVE for domains:',
      Object.keys(SSL_PIN_CONFIG).join(', ')
    );
  } catch (err: any) {
    _initialized = true;
    _available   = false;
    console.warn(
      '[SslPinningService] Could not initialise SSL pinning:',
      err?.message ?? err,
      '\nInstall the native module:  npm install react-native-ssl-public-key-pinning'
    );
  }

  return getStatus();
}

/**
 * Returns the current SSL pinning status without triggering initialisation.
 */
export function getStatus(): SslPinningStatus {
  let mode: SslPinningStatus['mode'];
  if (_available) {
    mode = 'active';
  } else if (__DEV__ && !FORCE_SSL_PINNING) {
    mode = 'disabled_dev';
  } else if (hasPlaceholderHashes()) {
    mode = 'disabled_placeholder';
  } else {
    mode = 'unavailable';
  }

  return {
    initialized: _initialized,
    available:   _available,
    mode,
    domains:     Object.keys(SSL_PIN_CONFIG),
  };
}

/**
 * Returns true when SSL pinning is actively enforced.
 */
export function isSslPinningActive(): boolean {
  return _available;
}
