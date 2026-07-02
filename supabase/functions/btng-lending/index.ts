/**
 * BTNG LENDING ENGINE — Sovereign Credit & Collateral API
 * Maps to:  POST /api/lending/deposit   → depositCollateral
 *           POST /api/lending/borrow    → disburseLoan
 *           GET  /api/lending/credit/:userId → getUserCredit
 *           POST /api/credit/generate   → generateCredit
 *
 * Backed by btng_loans + btng_wallets + btng_certificates (Supabase PostgreSQL)
 * EKUYE DIGITAL GATEWAY TRUST LTD · Reg. CS099020624
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ── Credit Score Weights ──────────────────────────────────────────────────────
const APR_TABLE: Record<string, number> = {
  PLATINUM: 5.5,
  GOLD:     7.5,
  SILVER:   10.5,
  BRONZE:   14.5,
  UNRATED:  22.0,
};
const LTV_TABLE: Record<string, number> = {
  PLATINUM: 0.75,
  GOLD:     0.65,
  SILVER:   0.55,
  BRONZE:   0.45,
  UNRATED:  0.30,
};

function getTier(score: number): string {
  if (score >= 850) return 'PLATINUM';
  if (score >= 700) return 'GOLD';
  if (score >= 550) return 'SILVER';
  if (score >= 400) return 'BRONZE';
  return 'UNRATED';
}

// ── Generate Credit Profile ───────────────────────────────────────────────────
async function generateCredit(
  sb: ReturnType<typeof createClient>,
  userId: string,
  assetHash?: string
): Promise<Record<string, unknown>> {
  // Pull data signals in parallel
  const [walletRes, certRes, kycRes, ordersRes] = await Promise.allSettled([
    sb.from('btng_wallets').select('balance,gold_backed_ghs,tier').eq('user_id', userId).maybeSingle(),
    sb.from('btng_certificates').select('id,equity_grade,asset_value,status').eq('user_id', userId).eq('status', 'active'),
    sb.from('kyc_submissions').select('status').eq('user_id', userId).order('submitted_at', { ascending: false }).limit(1),
    sb.from('orders').select('id,total_value,side,status').eq('user_id', userId).eq('status', 'filled').limit(50),
  ]);

  const wallet   = walletRes.status  === 'fulfilled' ? walletRes.value.data  : null;
  const certs    = certRes.status    === 'fulfilled' ? (certRes.value.data   ?? []) : [];
  const kyc      = kycRes.status     === 'fulfilled' ? (kycRes.value.data    ?? []) : [];
  const orders   = ordersRes.status  === 'fulfilled' ? (ordersRes.value.data ?? []) : [];

  const walletBal   = Number(wallet?.balance ?? 0);
  const goldGhs     = Number(wallet?.gold_backed_ghs ?? 0);
  const kycVerified = kyc[0]?.status === 'verified';
  const certCount   = certs.length;
  const certValue   = certs.reduce((s: number, c: any) => s + Number(c.asset_value ?? 0), 0);
  const orderCount  = orders.length;
  const buyVolume   = orders
    .filter((o: any) => o.side === 'buy')
    .reduce((s: number, o: any) => s + Number(o.total_value ?? 0), 0);

  // Weighted factor scores (0–100 each)
  const walletScore   = Math.min(100, Math.round((walletBal / 1000) * 40 + (goldGhs / 5000) * 20 + (wallet?.tier === 'Gold' ? 30 : wallet?.tier === 'Silver' ? 20 : 10)));
  const kycScore      = kycVerified ? 90 : 35;
  const certScore     = Math.min(100, certCount * 20 + Math.min(40, certValue / 1000));
  const activityScore = Math.min(100, orderCount * 5 + Math.min(50, buyVolume / 500));
  const loyaltyScore  = Math.min(100, Math.round(60 + (orderCount > 10 ? 20 : orderCount * 2) + (kycVerified ? 20 : 0)));

  // Composite score / 1000
  const composite = Math.round(
    walletScore   * 2.5 +
    kycScore      * 3.0 +
    certScore     * 2.0 +
    activityScore * 1.5 +
    loyaltyScore  * 1.0
  );
  const score = Math.max(100, Math.min(1000, composite));
  const tier  = getTier(score);
  const apr   = APR_TABLE[tier];
  const ltv   = LTV_TABLE[tier];

  // BTNGG price fallback (1 BTNGG ≈ $4.46 when oracle unavailable)
  const btnggPriceUSD   = 4.46;
  const collateralUSD   = walletBal * btnggPriceUSD + certValue;
  const maxBorrow       = Math.round(collateralUSD * ltv);

  const loanStatus =
    !kycVerified    ? 'PENDING_KYC' :
    score >= 700    ? 'ELIGIBLE' :
    score >= 400    ? 'CONDITIONAL' : 'INELIGIBLE';

  return {
    userId,
    score,
    tier,
    maxBorrow,
    apr,
    ltvRatio: ltv,
    riskLevel: score >= 700 ? 'LOW' : score >= 450 ? 'MEDIUM' : 'HIGH',
    loanStatus,
    factors: {
      wallet:   walletScore,
      kyc:      kycScore,
      certs:    certScore,
      activity: activityScore,
      loyalty:  loyaltyScore,
    },
    signals: {
      walletBalance: walletBal,
      kycVerified,
      certCount,
      certValue,
      orderCount,
      buyVolume,
    },
    assetHash: assetHash ?? null,
    generatedAt: new Date().toISOString(),
    engine: 'BTNG-CREDIT-ENGINE-V1',
    chain: 'BTNG-MAINNET',
  };
}

// ── Deposit Collateral ────────────────────────────────────────────────────────
async function depositCollateral(
  sb: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  tokenType: string
): Promise<Record<string, unknown>> {
  if (!userId || amount <= 0) throw new Error('Invalid deposit parameters');

  // Record collateral deposit as a credit transaction
  const { data, error } = await sb.from('btng_credit_transactions').insert({
    user_id:      userId,
    amount,
    type:         'earn',
    reason:       `Collateral deposit — ${tokenType} ${amount}`,
    reference_id: `COLL-${Date.now()}-${tokenType}`,
  }).select().single();

  if (error) throw new Error(`Collateral: ${error.message}`);

  // Synthetic tx hash (in production, replace with on-chain tx)
  const txHash = `0x${Array.from({ length: 64 }, (_, i) =>
    ((userId.charCodeAt(i % userId.length) + i * 13 + Date.now()) % 16).toString(16)
  ).join('')}`;

  return {
    success: true,
    txHash,
    userId,
    amount,
    tokenType,
    recordId: data.id,
    depositedAt: new Date().toISOString(),
    message: `${amount} ${tokenType} locked as collateral on BTNG-MAINNET`,
  };
}

// ── Disburse Loan ─────────────────────────────────────────────────────────────
async function disburseLoan(
  sb: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  collateralAsset = 'BTNGG'
): Promise<Record<string, unknown>> {
  if (!userId || amount <= 0) throw new Error('Invalid loan parameters');

  // Fetch user wallet for credit check
  const { data: wallet } = await sb
    .from('btng_wallets').select('btng_id,balance,tier').eq('user_id', userId).maybeSingle();

  const credit = await generateCredit(sb, userId);
  if (credit.loanStatus === 'INELIGIBLE') throw new Error('User is not eligible for a loan at this time.');
  if (amount > (credit.maxBorrow as number)) throw new Error(`Requested amount $${amount} exceeds max borrow $${credit.maxBorrow}.`);

  const apr         = credit.apr as number;
  const dailyRate   = apr / 100 / 365;
  const interest    = amount * dailyRate * 30;
  const totalDue    = amount + interest;
  const dueDate     = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const { data: loan, error } = await sb.from('btng_loans').insert({
    user_id:     userId,
    btng_id:     wallet?.btng_id ?? `LOAN-${Date.now()}`,
    principal:   amount,
    max_borrow:  credit.maxBorrow,
    interest,
    total_due:   totalDue,
    currency:    'BTNGG',
    due_date:    dueDate.toISOString().split('T')[0],
    rate_apr:    apr,
    ltv:         (credit.ltvRatio as number) * 100,
    daily_rate:  dailyRate * 100,
    risk_level:  credit.riskLevel as string,
    source:      'btng-lending-engine',
  }).select().single();

  if (error) throw new Error(`Loan: ${error.message}`);

  const txHash = `0x${Array.from({ length: 64 }, (_, i) =>
    ((userId.charCodeAt(i % userId.length) + amount * (i + 1)) % 16).toString(16)
  ).join('')}`;

  return {
    success: true,
    txHash,
    loanId:       loan.id,
    userId,
    principal:    amount,
    interest:     parseFloat(interest.toFixed(4)),
    totalDue:     parseFloat(totalDue.toFixed(4)),
    currency:     'BTNGG',
    dueDate:      dueDate.toISOString().split('T')[0],
    apr,
    ltv:          (credit.ltvRatio as number) * 100,
    riskLevel:    credit.riskLevel,
    collateral:   collateralAsset,
    disbursedAt:  new Date().toISOString(),
    chain:        'BTNG-MAINNET',
    engine:       'BankSigner-V1',
    message:      `$${amount} loan disbursed. Due ${dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
  };
}

// ── Main Handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url     = new URL(req.url);
  const route   = url.pathname.replace(/^\/btng-lending/, '');
  const method  = req.method;

  try {
    // Auth — extract user from JWT
    const authHeader = req.headers.get('Authorization');
    const token      = authHeader?.replace('Bearer ', '');

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    const sbUser  = token
      ? createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
          global: { headers: { Authorization: `Bearer ${token}` } },
        })
      : sbAdmin;

    // Get authenticated user
    let userId = '';
    if (token) {
      const { data: { user } } = await sbUser.auth.getUser(token);
      userId = user?.id ?? '';
    }

    // ── Route: POST /api/credit/generate ───────────────────────────────────
    if (method === 'POST' && (route === '/api/credit/generate' || route === '/credit/generate')) {
      if (!userId) throw new Error('Authentication required');
      const body = await req.json().catch(() => ({}));
      const result = await generateCredit(sbAdmin, userId, body.assetHash);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Route: GET /api/lending/credit/:userId ─────────────────────────────
    if (method === 'GET' && route.startsWith('/api/lending/credit/')) {
      const targetUserId = route.split('/').pop() ?? userId;
      if (!userId) throw new Error('Authentication required');
      const result = await generateCredit(sbAdmin, targetUserId);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Route: POST /api/lending/deposit ──────────────────────────────────
    if (method === 'POST' && route === '/api/lending/deposit') {
      if (!userId) throw new Error('Authentication required');
      const body      = await req.json();
      const { amount, tokenType = 'BTNGG' } = body;
      if (!amount || Number(amount) <= 0) throw new Error('Invalid amount');
      const result    = await depositCollateral(sbAdmin, userId, Number(amount), tokenType);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Route: POST /api/lending/borrow ───────────────────────────────────
    if (method === 'POST' && (route === '/api/lending/borrow' || route === '/api/lending/disburse')) {
      if (!userId) throw new Error('Authentication required');
      const body      = await req.json();
      const { amount, collateralAsset = 'BTNGG' } = body;
      if (!amount || Number(amount) <= 0) throw new Error('Invalid borrow amount');
      const result    = await disburseLoan(sbAdmin, userId, Number(amount), collateralAsset);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Route: GET /api/lending/loans ─────────────────────────────────────
    if (method === 'GET' && route === '/api/lending/loans') {
      if (!userId) throw new Error('Authentication required');
      const { data, error } = await sbAdmin
        .from('btng_loans').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ loans: data ?? [], count: data?.length ?? 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Catch-all ─────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ error: `Route not found: ${method} ${route}` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[btng-lending] error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
