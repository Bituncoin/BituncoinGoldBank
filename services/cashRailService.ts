// Cash Rail Service — MTN MoMo merchant transaction history
// Reads/writes cash_rail_transactions table for the Ekuye Digital Gateway merchant.

import { getSupabaseClient } from '@/template';
import { BTNG_MERCHANT } from '@/constants/merchantConfig';

export type TransactionStatus = 'pending' | 'completed' | 'failed';
export type StatusFilter = 'all' | TransactionStatus;

export interface CashRailTransaction {
  id: string;
  merchant_id: string;
  payer_msisdn: string;
  payer_name: string | null;
  reference_id: string;
  amount_ghs: number;
  status: TransactionStatus;
  network: string;
  currency: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashRailStats {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  totalVolumeGHS: number;
  completedVolumeGHS: number;
}

export interface FetchTransactionsParams {
  status?: StatusFilter;
  limit?: number;
  offset?: number;
  search?: string;
}

/** Fetch paginated transactions for the configured merchant. */
export async function fetchCashRailTransactions(
  params: FetchTransactionsParams = {}
): Promise<{ data: CashRailTransaction[]; count: number } | { error: string }> {
  try {
    const supabase = getSupabaseClient();
    const { status = 'all', limit = 30, offset = 0, search } = params;

    let query = supabase
      .from('cash_rail_transactions')
      .select('*', { count: 'exact' })
      .eq('merchant_id', BTNG_MERCHANT.merchantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (search?.trim()) {
      const s = search.trim();
      query = query.or(
        `payer_msisdn.ilike.%${s}%,payer_name.ilike.%${s}%,reference_id.ilike.%${s}%`
      );
    }

    const { data, error, count } = await query;
    if (error) return { error: error.message };
    return { data: (data ?? []) as CashRailTransaction[], count: count ?? 0 };
  } catch (e: any) {
    return { error: e?.message ?? 'Failed to fetch transactions' };
  }
}

/** Compute summary stats across all transactions for this merchant. */
export async function fetchCashRailStats(): Promise<CashRailStats | { error: string }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('cash_rail_transactions')
      .select('status, amount_ghs')
      .eq('merchant_id', BTNG_MERCHANT.merchantId);

    if (error) return { error: error.message };
    const rows = (data ?? []) as Pick<CashRailTransaction, 'status' | 'amount_ghs'>[];

    const stats: CashRailStats = {
      total: rows.length,
      completed: 0,
      pending: 0,
      failed: 0,
      totalVolumeGHS: 0,
      completedVolumeGHS: 0,
    };

    for (const row of rows) {
      const amt = Number(row.amount_ghs) || 0;
      stats.totalVolumeGHS += amt;
      if (row.status === 'completed') {
        stats.completed++;
        stats.completedVolumeGHS += amt;
      } else if (row.status === 'pending') {
        stats.pending++;
      } else if (row.status === 'failed') {
        stats.failed++;
      }
    }

    return stats;
  } catch (e: any) {
    return { error: e?.message ?? 'Failed to fetch stats' };
  }
}

/** Update transaction status (admin only). */
export async function updateTransactionStatus(
  id: string,
  status: TransactionStatus
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('cash_rail_transactions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    return { error: error?.message ?? null };
  } catch (e: any) {
    return { error: e?.message ?? 'Update failed' };
  }
}

/** Add a new MoMo transaction record. */
export async function insertCashRailTransaction(
  tx: Omit<CashRailTransaction, 'id' | 'created_at' | 'updated_at'>
): Promise<{ data: CashRailTransaction | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('cash_rail_transactions')
      .insert({
        ...tx,
        merchant_id: BTNG_MERCHANT.merchantId,
        network: 'MTN MoMo',
        currency: 'GHS',
      })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as CashRailTransaction, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message ?? 'Insert failed' };
  }
}

/** Batch-update the status of multiple transactions (admin only). */
export async function batchUpdateTransactionStatus(
  ids: string[],
  status: TransactionStatus
): Promise<{ updatedCount: number; error: string | null }> {
  if (ids.length === 0) return { updatedCount: 0, error: null };
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('cash_rail_transactions')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select('id');
    if (error) return { updatedCount: 0, error: error.message };
    return { updatedCount: (data ?? []).length, error: null };
  } catch (e: any) {
    return { updatedCount: 0, error: e?.message ?? 'Batch update failed' };
  }
}

/** Format GHS amount with thousands separator. */
export function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a compact volume (e.g. 1,500 → "1.5K"). */
export function formatCompactGHS(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return formatGHS(amount);
}
