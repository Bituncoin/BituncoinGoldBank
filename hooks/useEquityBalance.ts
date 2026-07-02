// BTNG Sovereign Equity Balance — fetches wallet + identity data from Supabase
import { useState, useCallback } from 'react';
import { getSupabaseClient } from '@/template';
import { generateFingerprint } from '@/services/btngCertificatesService';
import type { EquityBalance } from '@/constants/types';

// Re-export so existing imports from this hook continue to work
export type { EquityBalance };

function computeEquityHash(data: string): string {
  return generateFingerprint(data + Date.now().toString().slice(0, -4));
}

const BTNG_TO_USD = 1.175; // 1 BTNGG ≈ $1.175
const GHS_TO_USD  = 0.067; // 1 GHS ≈ $0.067
const USD_TO_TROY_OZ = 1.0 / 2350; // approximate gold price per oz

export function useEquityBalance(userId: string | undefined) {
  const [balance, setBalance]   = useState<EquityBalance | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();

    // Fetch wallet row (most recent) — use maybeSingle() to avoid 406 when no row exists
    const [walletRes, identityRes, loanRes] = await Promise.all([
      supabase
        .from('btng_wallets')
        .select('*')
        .eq('user_id', userId)
        .order('looked_up_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('btng_identities')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('btng_loans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const wallet   = walletRes.data;
    const identity = identityRes.data;
    const loan     = loanRes.data;

    // Build equity data from whatever we have (graceful fallback to zeros)
    const totalEquity      = wallet?.balance ?? 0;
    const goldBackedGhs    = wallet?.gold_backed_ghs ?? 0;
    const goldUsd          = goldBackedGhs * GHS_TO_USD;
    const assetBackedEquity = goldUsd / BTNG_TO_USD;
    const liquidEquity     = Math.max(0, totalEquity - assetBackedEquity) * 0.6;
    const loanEligible     = loan?.max_borrow ?? (totalEquity * BTNG_TO_USD * 0.7);

    const btngId      = identity?.btng_id ?? wallet?.btng_id ?? 'BTNG-XX-000000';
    const walletAddr  = identity?.wallet_address ?? wallet?.wallet_address ?? '0x0000000000000000000000000000000000000000';
    const tier        = wallet?.tier ?? identity?.tier ?? 'Bronze';
    const status      = identity?.status ?? wallet?.status ?? 'ACTIVE';

    const documentId  = `DOC-${btngId}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
    const hashSrc     = `${documentId}|${btngId}|${walletAddr}|${totalEquity}|${goldBackedGhs}`;
    const equityHash  = computeEquityHash(hashSrc);

    // Simulated import/export account and on-chain tx (would come from chain in production)
    const importExportId  = `IEGW-${btngId.replace('BTNG-', '')}-IMP`;
    const txHash          = `0x${generateFingerprint(documentId + walletAddr)}`;

    const now = new Date().toISOString();
    setRefreshedAt(now);

    setBalance({
      btng_id: btngId,
      wallet_address: walletAddr,
      sovereign_status: status === 'OK' || status === 'ACTIVE' ? 'VERIFIED — ACTIVE' : status,
      total_equity: totalEquity,
      asset_backed_equity: Math.round(assetBackedEquity * 100) / 100,
      liquid_equity: Math.round(liquidEquity * 100) / 100,
      loan_eligible_equity: Math.round(loanEligible * 100) / 100,
      gold_backed_ghs: goldBackedGhs,
      gold_oz_troy: goldUsd * USD_TO_TROY_OZ,
      usd_value: totalEquity * BTNG_TO_USD,
      tier,
      verified_at: now,
      document_id: documentId,
      equity_hash: equityHash,
      import_export_account_id: importExportId,
      on_chain_tx_hash: txHash,
    });

    setLoading(false);
  }, [userId]);

  return { balance, loading, error, refreshedAt, load };
}
