// BTNG Gold — Portfolio Service
import { getSupabaseClient } from '@/template';

export interface PortfolioStats {
  total_portfolio_value: number;
  total_pnl: number;
  total_pnl_pct: number;
}

/** Fetch the latest portfolio stats for a user from user_profiles */
export async function fetchPortfolioStats(userId: string): Promise<{ data: PortfolioStats | null; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('user_profiles')
    .select('total_portfolio_value, total_pnl, total_pnl_pct')
    .eq('id', userId)
    .single();

  if (error) return { data: null, error: error.message };

  return {
    data: {
      total_portfolio_value: Number(data.total_portfolio_value ?? 0),
      total_pnl: Number(data.total_pnl ?? 0),
      total_pnl_pct: Number(data.total_pnl_pct ?? 0),
    },
    error: null,
  };
}

/** Manually trigger a portfolio recalculation via the DB function */
export async function triggerPortfolioRecalc(userId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client.rpc('recalculate_user_portfolio', { p_user_id: userId });
  return { error: error?.message ?? null };
}
