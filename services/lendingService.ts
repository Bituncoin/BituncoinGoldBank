/**
 * BTNG Lending Service
 * Maps Node.js backend routes to the btng-lending Edge Function:
 *   POST /api/lending/deposit   → depositCollateral()
 *   POST /api/lending/borrow    → disburseLoan()
 *   GET  /api/lending/credit/:id → getUserCredit()
 *   POST /api/credit/generate   → generateCredit()
 *   GET  /api/lending/loans      → getUserLoans()
 */

import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ── Types (mirrors BankSigner output) ────────────────────────────────────────

export interface CreditProfile {
  userId: string;
  score: number;
  tier: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'UNRATED';
  maxBorrow: number;
  apr: number;
  ltvRatio: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  loanStatus: 'ELIGIBLE' | 'CONDITIONAL' | 'PENDING_KYC' | 'INELIGIBLE';
  factors: {
    wallet: number;
    kyc: number;
    certs: number;
    activity: number;
    loyalty: number;
  };
  signals: {
    walletBalance: number;
    kycVerified: boolean;
    certCount: number;
    certValue: number;
    orderCount: number;
    buyVolume: number;
  };
  assetHash: string | null;
  generatedAt: string;
  engine: string;
  chain: string;
}

export interface DepositResult {
  success: boolean;
  txHash: string;
  userId: string;
  amount: number;
  tokenType: string;
  recordId: string;
  depositedAt: string;
  message: string;
}

export interface LoanResult {
  success: boolean;
  txHash: string;
  loanId: string;
  userId: string;
  principal: number;
  interest: number;
  totalDue: number;
  currency: string;
  dueDate: string;
  apr: number;
  ltv: number;
  riskLevel: string;
  collateral: string;
  disbursedAt: string;
  chain: string;
  engine: string;
  message: string;
}

export interface LoanRecord {
  id: string;
  btng_id: string;
  principal: number;
  max_borrow: number;
  interest: number;
  total_due: number;
  currency: string;
  due_date: string;
  rate_apr: number;
  ltv: number;
  daily_rate: number;
  risk_level: string;
  source: string;
  created_at: string;
}

// ── Helper: handle Edge Function errors ──────────────────────────────────────
async function invoke<T>(fnName: string, opts: {
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Promise<{ data: T | null; error: string | null }> {
  const sb = getSupabaseClient();

  // Build path with optional query string
  let path = '';
  if (opts.query) {
    const qs = new URLSearchParams(opts.query).toString();
    path = qs ? `?${qs}` : '';
  }

  const { data, error } = await sb.functions.invoke(fnName, {
    body: opts.body ?? {},
    headers: opts.method === 'GET' ? { 'X-HTTP-Method': 'GET' } : undefined,
  });

  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const text = await error.context?.text?.();
        msg = text ? `[${error.context?.status ?? 500}] ${text}` : msg;
      } catch { /* ignore */ }
    }
    return { data: null, error: msg };
  }

  return { data: data as T, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API  (mirrors Node.js BankSigner + server.js routes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/credit/generate
 * Equivalent to: bankSigner.generateLocalCredit(userId, assetHash)
 */
export async function generateCredit(
  assetHash?: string
): Promise<{ data: CreditProfile | null; error: string | null }> {
  return invoke<CreditProfile>('btng-lending', {
    body: { route: '/credit/generate', assetHash: assetHash ?? null },
  });
}

/**
 * GET /api/lending/credit/:userId
 * Equivalent to: bankSigner.getUserCredit(userId)
 */
export async function getUserCredit(
  userId: string
): Promise<{ data: CreditProfile | null; error: string | null }> {
  return invoke<CreditProfile>('btng-lending', {
    body: { route: `/lending/credit/${userId}` },
  });
}

/**
 * POST /api/lending/deposit
 * Equivalent to: bankSigner.depositCollateral(user, amount, tokenType)
 */
export async function depositCollateral(
  amount: number,
  tokenType: 'BTNGG' | 'BTC' | 'ETH' | string = 'BTNGG'
): Promise<{ data: DepositResult | null; error: string | null }> {
  return invoke<DepositResult>('btng-lending', {
    body: { route: '/lending/deposit', amount, tokenType },
  });
}

/**
 * POST /api/lending/borrow
 * Equivalent to: bankSigner.disburseLoan(user, amount)
 */
export async function disburseLoan(
  amount: number,
  collateralAsset: 'BTNGG' | 'BTC' | 'ETH' | string = 'BTNGG'
): Promise<{ data: LoanResult | null; error: string | null }> {
  return invoke<LoanResult>('btng-lending', {
    body: { route: '/lending/borrow', amount, collateralAsset },
  });
}

/**
 * GET /api/lending/loans
 * Returns all user loans from btng_loans table
 */
export async function getUserLoans(): Promise<{ data: { loans: LoanRecord[]; count: number } | null; error: string | null }> {
  return invoke<{ loans: LoanRecord[]; count: number }>('btng-lending', {
    body: { route: '/lending/loans' },
  });
}
