/**
 * constants/config.ts
 * Centralised runtime configuration for all external API integrations.
 * Update values here when connecting to live services.
 */

// ── Auth0 API ─────────────────────────────────────────────────────────────────
/** Base URL for the Auth0-protected management API */
export const AUTH0_API_BASE = 'https://api.freename.io';

// ── Freename Web3 DNS ─────────────────────────────────────────────────────────
/** Base URL for the Freename public resolver (used by useDomainResolver) */
export const FREENAME_API_BASE = 'https://api.freename.io';

/** Supported BTNG Web3 domain names — resolver UI domains */
export const BTNG_WEB3_DOMAINS = ['btng.gold', 'btng.token'] as const;

// ── BTNG Chain ────────────────────────────────────────────────────────────────
export const BTNG_CHAIN_ID   = 'BTNG-MAINNET';
export const BTNG_CHANNEL    = 'BTNG_PAY_GATEWAY';
export const BTNG_USD_PRICE  = 3.25;   // BTNGG fixed price (fallback)
export const XAU_USD_PRICE   = 3250;   // Gold spot fallback

// ── Polling intervals ─────────────────────────────────────────────────────────
export const CRYPTO_REFRESH_MS = 60_000;   // 1 minute
export const ORACLE_REFRESH_MS = 30_000;   // 30 seconds
export const WALLET_POLL_MS    = 30_000;   // 30 seconds

// ── Auth0 token storage ───────────────────────────────────────────────────────
export const AUTH0_TOKEN_STORAGE_KEY = '@btng_auth0_tokens';
