/**
 * hooks/useDomainResolver.ts
 * Shared Web3 domain resolver hook — used across all Send / Transfer screens.
 *
 * Resolution order:
 *  0. W3 Domains Solana resolver  — bituncoin.genesis (Solana W3 domain)
 *  1. Freename FNS namespace      — btng.gold / btng.token (Polygon)
 *  2. Freename generic resolver   — fallback for any namespace
 *  3. Local btng_domain_records   — BTNG chain + final fallback
 *
 * Usage:
 *   const { resolving, resolvedRecord, resolveError, resolve, clear } = useDomainResolver();
 *   resolve('btng.gold', 'ETH');          // Freename / Polygon
 *   resolve('bituncoin.genesis', 'SOL');  // W3 Domains / Solana
 *   clear();                               // resets state
 */
import { useState, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/template';
import { resolveDomainFromFreename, resolveZone, resolveW3Domain } from '@/services/freenameResolverService';

// ─── Constants ────────────────────────────────────────────────────────────────

/** All BTNG domains supported by the resolver */
export const RESOLVABLE_DOMAINS = ['btng.gold', 'btng.token', 'bituncoin.genesis'] as const;

/** Domains that use the W3 Domains / Solana resolver */
const W3_SOLANA_DOMAINS = new Set(['bituncoin.genesis']);

/** Chains served exclusively from local btng_domain_records (not in Freename). */
const LOCAL_ONLY_CHAINS = new Set(['BTNG']);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedDomainRecord {
  domain:         string;
  chain:          string;
  wallet_address: string;
  coin_symbol:    string;
  /** Where the record was found */
  source?:        'freename' | 'local';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDomainResolver() {
  const [resolving,      setResolving]      = useState(false);
  const [resolvedRecord, setResolvedRecord] = useState<ResolvedDomainRecord | null>(null);
  const [resolveError,   setResolveError]   = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolve = useCallback(async (input: string, chain: string) => {
    const trimmed    = input.trim().toLowerCase();
    const chainUpper = chain.toUpperCase();

    if (!(RESOLVABLE_DOMAINS as readonly string[]).includes(trimmed)) {
      setResolvedRecord(null);
      setResolveError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setResolving(true);
      setResolvedRecord(null);
      setResolveError(null);

      // ── Step 0: W3 Domains / Solana resolver for bituncoin.genesis ────────
      if (W3_SOLANA_DOMAINS.has(trimmed)) {
        try {
          const w3Result = await resolveW3Domain(trimmed, chainUpper);
          if (w3Result) {
            setResolvedRecord({
              domain:         trimmed,
              chain:          chainUpper,
              wallet_address: w3Result.wallet_address,
              coin_symbol:    chainUpper,
              source:         'freename',
            });
            setResolving(false);
            return;
          }
        } catch { /* fall through to local DB */ }

        // W3 domain fallback — check local DB
        try {
          const supabase = getSupabaseClient();
          const { data } = await supabase
            .from('btng_domain_records')
            .select('domain, chain, wallet_address, coin_symbol')
            .eq('domain', trimmed)
            .eq('chain', chainUpper)
            .eq('is_primary', true)
            .limit(1)
            .maybeSingle();
          if (data) {
            setResolvedRecord({ ...(data as any), source: 'local' });
          } else {
            setResolveError(`No ${chain} record found for ${trimmed}`);
          }
        } catch (e: any) {
          setResolveError(e.message ?? 'Resolver lookup failed');
        } finally {
          setResolving(false);
        }
        return;
      }

      // ── Step 1: Freename FNS namespace (btng.gold / btng.token) ──────────
      if (!LOCAL_ONLY_CHAINS.has(chainUpper)) {
        try {
          const result = await resolveDomainFromFreename(trimmed, chainUpper);
          if (result) {
            setResolvedRecord({
              domain:         trimmed,
              chain:          chainUpper,
              wallet_address: result.wallet_address,
              coin_symbol:    chainUpper,
              source:         'freename',
            });
            setResolving(false);
            return;
          }
        } catch { /* fall through to zone resolver */ }

        // ── Step 2: Freename generic zone resolver (all namespaces: FNS/UD/ENS) ─
        try {
          const zoneResult = await resolveZone(trimmed, chainUpper);
          if (zoneResult) {
            setResolvedRecord({
              domain:         trimmed,
              chain:          chainUpper,
              wallet_address: zoneResult.wallet_address,
              coin_symbol:    chainUpper,
              source:         'freename',
            });
            setResolving(false);
            return;
          }
        } catch { /* fall through to local lookup */ }
      }

      // ── Step 3: Local btng_domain_records fallback ─────────────────────────
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('btng_domain_records')
          .select('domain, chain, wallet_address, coin_symbol')
          .eq('domain', trimmed)
          .eq('chain', chainUpper)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();

        if (error) throw new Error(error.message);

        if (!data) {
          setResolveError(`No ${chain} record found for ${trimmed}`);
        } else {
          setResolvedRecord({ ...(data as any), source: 'local' });
        }
      } catch (e: any) {
        setResolveError(e.message ?? 'Resolver lookup failed');
      } finally {
        setResolving(false);
      }
    }, 400);
  }, []);

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResolvedRecord(null);
    setResolveError(null);
    setResolving(false);
  }, []);

  return { resolving, resolvedRecord, resolveError, resolve, clear };
}
