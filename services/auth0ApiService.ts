/**
 * services/auth0ApiService.ts
 * Auth0-based API authentication service
 *
 * Endpoints:
 *  POST /api/v1/auth/login              — login with username + password (no auth header required)
 *  POST /api/v1/auth/refresh            — get new access token using refresh token (Bearer required)
 *
 * Token lifecycle:
 *  access_token  — used in Authorization: Bearer for all API calls
 *  refresh_token — used to obtain a new access_token without re-login
 *  id_token      — identity claims (email, profile, etc.)
 *  expires_in    — lifetime in seconds (default: 2592000 = 30 days)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Configuration ─────────────────────────────────────────────────────────────
/** Base URL of the Auth0-protected API. Update to your actual endpoint. */
export const AUTH0_API_BASE = 'https://api.freename.io';

const STORAGE_KEY = '@btng_auth0_tokens';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Auth0Tokens {
  access_token:  string;
  refresh_token: string;
  id_token:      string;
  scope:         string;
  expires_in:    number;
  token_type:    string;
  /** Local timestamp (ms) when tokens were stored — used for expiry calculation */
  stored_at?:    number;
}

export interface Auth0Result {
  success: boolean;
  tokens?: Auth0Tokens;
  error?:  string;
}

// ── Login ─────────────────────────────────────────────────────────────────────
/**
 * Authenticate with username + password.
 * No Authorization header required.
 * Tokens are persisted to AsyncStorage on success.
 */
export async function auth0Login(
  username: string,
  password: string,
): Promise<Auth0Result> {
  try {
    const res = await fetch(`${AUTH0_API_BASE}/api/v1/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      return { success: false, error: `HTTP ${res.status}: ${body}` };
    }

    const tokens: Auth0Tokens = await res.json();
    tokens.stored_at = Date.now();

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    return { success: true, tokens };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Network error — check your connection.' };
  }
}

// ── Refresh Token ─────────────────────────────────────────────────────────────
/**
 * Exchange a refresh token for a new access token + id token.
 * Requires the current access token as a Bearer header.
 * The response does NOT include a new refresh_token — the existing one is kept.
 */
export async function auth0Refresh(
  refreshToken: string,
  accessToken:  string,
): Promise<Auth0Result> {
  try {
    const res = await fetch(`${AUTH0_API_BASE}/api/v1/auth/refresh`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      return { success: false, error: `HTTP ${res.status}: ${body}` };
    }

    const partial = await res.json();

    // Merge: keep existing refresh_token + scope (not returned by refresh endpoint)
    const existing = await getStoredTokens();
    const merged: Auth0Tokens = {
      ...(existing ?? {} as any),
      ...partial,
      stored_at: Date.now(),
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return { success: true, tokens: merged };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Network error — could not refresh token.' };
  }
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/** Retrieve tokens saved in AsyncStorage. Returns null if none found. */
export async function getStoredTokens(): Promise<Auth0Tokens | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Auth0Tokens;
  } catch {
    return null;
  }
}

/**
 * Check whether the access token has expired.
 * @param bufferSec - Seconds before actual expiry to treat as expired (default 60s)
 */
export function isTokenExpired(tokens: Auth0Tokens, bufferSec = 60): boolean {
  if (!tokens.stored_at) return true;
  const expiresAt = tokens.stored_at + tokens.expires_in * 1000 - bufferSec * 1000;
  return Date.now() >= expiresAt;
}

/** Delete all stored tokens (logout). */
export async function clearStoredTokens(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Returns a valid access token, auto-refreshing if it has expired.
 * Returns null if the user is not logged in or refresh fails.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens) return null;
  if (!isTokenExpired(tokens)) return tokens.access_token;

  const result = await auth0Refresh(tokens.refresh_token, tokens.access_token);
  return result.tokens?.access_token ?? null;
}

/**
 * Build a complete set of authenticated headers ready for fetch().
 * Returns null if the user is not authenticated.
 *
 * @example
 * const headers = await getAuth0Headers();
 * if (headers) {
 *   const res = await fetch(`${AUTH0_API_BASE}/api/v1/some-endpoint`, { headers });
 * }
 */
export async function getAuth0Headers(): Promise<Record<string, string> | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  };
}

/**
 * Decode the id_token JWT payload (base64 decode — no verification).
 * Returns null if the token is missing or malformed.
 */
export function decodeIdToken(idToken: string): Record<string, any> | null {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    // Base64 URL decode
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded  = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const json    = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
