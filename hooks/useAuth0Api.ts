/**
 * hooks/useAuth0Api.ts
 * React hook for Auth0-based API authentication.
 *
 * Features:
 *  - Persisted session: restores stored tokens on mount
 *  - Auto-refresh: getAccessToken() transparently refreshes when expired
 *  - Operation loading state for button feedback
 *  - Identity claims decoded from id_token
 *
 * Usage:
 *   const { isAuthenticated, login, logout, getAccessToken } = useAuth0Api();
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  auth0Login,
  auth0Refresh,
  getStoredTokens,
  clearStoredTokens,
  isTokenExpired,
  decodeIdToken,
  Auth0Tokens,
  Auth0Result,
} from '@/services/auth0ApiService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Auth0UserInfo {
  email?:    string;
  name?:     string;
  nickname?: string;
  sub?:      string;
  picture?:  string;
  [key: string]: any;
}

export interface UseAuth0ApiState {
  /** The full token set, or null when not authenticated */
  tokens:           Auth0Tokens | null;
  /** True while restoring tokens from storage on first mount */
  loading:          boolean;
  /** True during login / refresh / logout operations */
  operationLoading: boolean;
  /** Error message from the last failed operation, or null */
  error:            string | null;
  /** True when a non-expired access token exists */
  isAuthenticated:  boolean;
  /** Decoded claims from the id_token (email, name, sub, …) */
  userInfo:         Auth0UserInfo | null;
  /** Date object for when the access token expires, or null */
  expiresAt:        Date | null;
  /** Remaining token lifetime in seconds (0 when expired/unknown) */
  remainingSec:     number;
}

export interface UseAuth0ApiActions {
  /** Authenticate with username + password */
  login:          (username: string, password: string) => Promise<Auth0Result>;
  /** Clear tokens and log out */
  logout:         () => Promise<void>;
  /** Manually refresh the access token */
  refresh:        () => Promise<boolean>;
  /**
   * Get a valid access token, auto-refreshing if needed.
   * Returns null when the user is not authenticated.
   */
  getAccessToken: () => Promise<string | null>;
  /** Clear the current error message */
  clearError:     () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth0Api(): UseAuth0ApiState & UseAuth0ApiActions {
  const [tokens,           setTokens]           = useState<Auth0Tokens | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [operationLoading, setOperationLoading] = useState(false);
  const [error,            setError]            = useState<string | null>(null);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isAuthenticated = useMemo(
    () => !!tokens && !isTokenExpired(tokens),
    [tokens],
  );

  const userInfo = useMemo(
    () => tokens?.id_token ? decodeIdToken(tokens.id_token) : null,
    [tokens],
  );

  const expiresAt = useMemo(() => {
    if (!tokens?.stored_at) return null;
    return new Date(tokens.stored_at + tokens.expires_in * 1000);
  }, [tokens]);

  const remainingSec = useMemo(() => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }, [expiresAt]);

  // ── Restore persisted tokens on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getStoredTokens();
      if (!cancelled) {
        setTokens(stored);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (
    username: string,
    password: string,
  ): Promise<Auth0Result> => {
    setOperationLoading(true);
    setError(null);

    const result = await auth0Login(username, password);

    if (result.success && result.tokens) {
      setTokens(result.tokens);
    } else {
      setError(result.error ?? 'Login failed. Please check your credentials.');
    }

    setOperationLoading(false);
    return result;
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    setOperationLoading(true);
    await clearStoredTokens();
    setTokens(null);
    setError(null);
    setOperationLoading(false);
  }, []);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refresh = useCallback(async (): Promise<boolean> => {
    if (!tokens) return false;
    setOperationLoading(true);

    const result = await auth0Refresh(tokens.refresh_token, tokens.access_token);

    setOperationLoading(false);
    if (result.success && result.tokens) {
      setTokens(result.tokens);
      return true;
    }

    setError(result.error ?? 'Token refresh failed. Please log in again.');
    return false;
  }, [tokens]);

  // ── Get valid access token (auto-refresh) ──────────────────────────────────
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!tokens) return null;
    if (!isTokenExpired(tokens)) return tokens.access_token;

    // Token expired — attempt silent refresh
    const ok = await refresh();
    // After refresh, tokens state may not have updated yet in this closure,
    // so read directly from the result via getStoredTokens
    if (!ok) return null;
    const fresh = await getStoredTokens();
    return fresh?.access_token ?? null;
  }, [tokens, refresh]);

  // ── Clear error ────────────────────────────────────────────────────────────
  const clearError = useCallback(() => setError(null), []);

  return {
    // State
    tokens,
    loading,
    operationLoading,
    error,
    isAuthenticated,
    userInfo,
    expiresAt,
    remainingSec,
    // Actions
    login,
    logout,
    refresh,
    getAccessToken,
    clearError,
  };
}
