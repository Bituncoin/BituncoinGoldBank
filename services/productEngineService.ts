// BTNG Product Engine Service
// Handles: Identity minting, Product Credits, Loan → Certificate, Trader Discount

import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

// ── Types ──────────────────────────────────────────────────────────────────

export type UserRole = 'client' | 'trader' | 'both';

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  identity_minted: boolean;
  identity_nft_id: string | null;
  signup_credits_claimed: boolean;
  discount_eligible: boolean;
  discount_bps: number;
  created_at: string;
  updated_at: string;
}

export interface ProductCredits {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'earn' | 'spend' | 'bonus' | 'referral';
  reason: string;
  reference_id?: string;
  created_at: string;
}

export interface LoanProduct {
  type: 'short_term' | 'long_term';
  label: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  durationDays: number;
  aprPct: number;
  ltv: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export const LOAN_PRODUCTS: LoanProduct[] = [
  {
    type: 'short_term',
    label: 'BTNG Gold Express Loan',
    description: 'Fast gold-backed short-term credit for active traders',
    minAmount: 50,
    maxAmount: 5000,
    durationDays: 30,
    aprPct: 8.5,
    ltv: 75,
    riskLevel: 'LOW',
  },
  {
    type: 'long_term',
    label: 'BTNG Equity-Backed Loan',
    description: 'Long-term loan backed by gold certificate equity',
    minAmount: 1000,
    maxAmount: 100000,
    durationDays: 365,
    aprPct: 14.5,
    ltv: 60,
    riskLevel: 'MEDIUM',
  },
];

const SIGNUP_CREDIT_REWARD = 100; // BTNGPC on sign-up
const REFERRAL_CREDIT_BONUS = 50; // BTNGPC for referral
const DISCOUNT_BPS = 1000; // 10% = 1000 basis points

// ── Helpers ────────────────────────────────────────────────────────────────

function generateNftId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

function generateLoanId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LOAN-${ts}-${rand}`;
}

// ── Role Management ─────────────────────────────────────────────────────────

export async function getUserRole(userId: string): Promise<{ data: UserRoleRecord | null; error: string | null }> {
  const { data, error } = await supabase
    .from('btng_user_roles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as UserRoleRecord | null, error: null };
}

export async function setUserRole(
  userId: string,
  role: UserRole
): Promise<{ data: UserRoleRecord | null; error: string | null }> {
  const now = new Date().toISOString();
  const { data: existing } = await getUserRole(userId);

  if (existing) {
    const { data, error } = await supabase
      .from('btng_user_roles')
      .update({ role, updated_at: now })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as UserRoleRecord, error: null };
  }

  const { data, error } = await supabase
    .from('btng_user_roles')
    .insert({ user_id: userId, role })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as UserRoleRecord, error: null };
}

// ── Identity Minting ─────────────────────────────────────────────────────────

export async function mintIdentity(
  userId: string,
  walletAddress: string,
  role: UserRole
): Promise<{ success: boolean; nftId: string | null; error: string | null }> {
  // Check if already minted
  const { data: roleRec } = await getUserRole(userId);
  if (roleRec?.identity_minted) {
    return { success: true, nftId: roleRec.identity_nft_id, error: null };
  }

  const nftId = generateNftId('BTNG-ID');
  const now = new Date().toISOString();

  // Write to btng_identities
  const { error: idError } = await supabase.from('btng_identities').insert({
    user_id: userId,
    btng_id: nftId,
    wallet_address: walletAddress || `0x${userId.replace(/-/g, '').slice(0, 40)}`,
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'OK',
    registered_at: now,
    source: 'product_engine',
  });
  if (idError) return { success: false, nftId: null, error: idError.message };

  // Mark minted in role record
  if (roleRec) {
    await supabase
      .from('btng_user_roles')
      .update({ identity_minted: true, identity_nft_id: nftId, updated_at: now })
      .eq('user_id', userId);
  } else {
    await supabase.from('btng_user_roles').insert({
      user_id: userId,
      role,
      identity_minted: true,
      identity_nft_id: nftId,
    });
  }

  return { success: true, nftId, error: null };
}

// ── Product Credits ─────────────────────────────────────────────────────────

export async function getProductCredits(userId: string): Promise<{ data: ProductCredits | null; error: string | null }> {
  const { data, error } = await supabase
    .from('btng_product_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as ProductCredits | null, error: null };
}

export async function getCreditHistory(userId: string): Promise<{ data: CreditTransaction[]; error: string | null }> {
  const { data, error } = await supabase
    .from('btng_credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return { data: [], error: error.message };
  return { data: (data as CreditTransaction[]) ?? [], error: null };
}

export async function mintSignupCredits(
  userId: string,
  referralCode?: string
): Promise<{ success: boolean; amount: number; error: string | null }> {
  // Check if already claimed
  const { data: roleRec } = await getUserRole(userId);
  if (roleRec?.signup_credits_claimed) {
    return { success: false, amount: 0, error: 'Signup credits already claimed' };
  }

  const baseAmount = SIGNUP_CREDIT_REWARD;
  const bonusAmount = referralCode ? REFERRAL_CREDIT_BONUS : 0;
  const totalAmount = baseAmount + bonusAmount;

  // Upsert credits balance
  const { data: existing } = await getProductCredits(userId);
  if (existing) {
    await supabase
      .from('btng_product_credits')
      .update({
        balance: existing.balance + totalAmount,
        total_earned: existing.total_earned + totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else {
    await supabase.from('btng_product_credits').insert({
      user_id: userId,
      balance: totalAmount,
      total_earned: totalAmount,
    });
  }

  // Record transactions
  await supabase.from('btng_credit_transactions').insert({
    user_id: userId,
    amount: baseAmount,
    type: 'earn',
    reason: 'Sign-up reward — BTNG Identity Verified',
  });

  if (bonusAmount > 0) {
    await supabase.from('btng_credit_transactions').insert({
      user_id: userId,
      amount: bonusAmount,
      type: 'referral',
      reason: `Referral bonus — Code: ${referralCode}`,
      reference_id: referralCode,
    });
  }

  // Mark claimed
  await supabase
    .from('btng_user_roles')
    .update({ signup_credits_claimed: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return { success: true, amount: totalAmount, error: null };
}

export async function spendCredits(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<{ success: boolean; newBalance: number; error: string | null }> {
  const { data: credits } = await getProductCredits(userId);
  if (!credits || credits.balance < amount) {
    return { success: false, newBalance: credits?.balance ?? 0, error: 'Insufficient product credits' };
  }

  const newBalance = credits.balance - amount;
  await supabase
    .from('btng_product_credits')
    .update({ balance: newBalance, total_spent: credits.total_spent + amount, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  await supabase.from('btng_credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type: 'spend',
    reason,
    reference_id: referenceId,
  });

  return { success: true, newBalance, error: null };
}

// ── Loan → Certificate Engine ────────────────────────────────────────────────

export interface LoanApprovalResult {
  success: boolean;
  loanId: string | null;
  certId: string | null;
  certNftId: string | null;
  interestAmount: number;
  totalDue: number;
  dueDate: string;
  error: string | null;
}

export async function approveLoanAndMintCertificate(
  userId: string,
  walletAddress: string,
  loanProduct: LoanProduct,
  principal: number,
  ownerName: string,
  renewedFromCertId?: string
): Promise<LoanApprovalResult> {
  const loanId = generateLoanId();
  const certNftId = generateNftId('BTNG-CERT');
  const now = new Date();
  const dueDate = new Date(now.getTime() + loanProduct.durationDays * 24 * 60 * 60 * 1000);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const dailyRate = loanProduct.aprPct / 100 / 365;
  const interest = principal * dailyRate * loanProduct.durationDays;
  const totalDue = principal + interest;
  const maxBorrow = (principal * loanProduct.ltv) / 100;

  // Write to btng_loans
  const { error: loanError } = await supabase.from('btng_loans').insert({
    user_id: userId,
    btng_id: loanId,
    wallet_address: walletAddress || `0x${userId.replace(/-/g, '').slice(0, 40)}`,
    principal,
    max_borrow: maxBorrow,
    interest: parseFloat(interest.toFixed(4)),
    total_due: parseFloat(totalDue.toFixed(4)),
    currency: 'BTNGG',
    due_date: dueDateStr,
    rate_apr: loanProduct.aprPct,
    ltv: loanProduct.ltv,
    daily_rate: parseFloat((dailyRate * 100).toFixed(6)),
    risk_level: loanProduct.riskLevel,
    source: 'product_engine',
  });
  if (loanError) return { success: false, loanId: null, certId: null, certNftId: null, interestAmount: 0, totalDue: 0, dueDate: '', error: loanError.message };

  // Mint certificate NFT record
  const assetValue = principal * 1.0; // 1:1 gold backing
  const equityGrade = assetValue >= 50000 ? 'A' : assetValue >= 10000 ? 'B' : assetValue >= 1000 ? 'C' : 'D';
  const fingerprint = `${loanId}-${certNftId}-${Date.now()}`;

  const { data: certData, error: certError } = await supabase
    .from('btng_certificates')
    .insert({
      user_id: userId,
      cert_type: loanProduct.type === 'short_term' ? 'BTNG_GOLD_EXPRESS' : 'BTNG_EQUITY_BACKED',
      cert_id: certNftId,
      owner_name: ownerName,
      asset_description: `${loanProduct.label} — Loan #${loanId} — ${loanProduct.durationDays}D @ ${loanProduct.aprPct}% APR`,
      asset_value: assetValue,
      equity_grade: equityGrade,
      fingerprint,
      issued_at: now.toISOString().split('T')[0],
      expires_at: dueDateStr,
      status: 'active',
      renewed_from_cert_id: renewedFromCertId ?? null,
      metadata: {
        loan_id: loanId,
        principal,
        total_due: totalDue,
        due_date: dueDateStr,
        loan_type: loanProduct.type,
        discount_bps: DISCOUNT_BPS,
        tradeable: true,
        ...(renewedFromCertId ? { renewed_from: renewedFromCertId } : {}),
      },
    })
    .select()
    .single();

  if (certError) return { success: false, loanId, certId: null, certNftId: null, interestAmount: 0, totalDue: 0, dueDate: '', error: certError.message };

  // Auto-enable trader discount if user holds certificate
  await supabase
    .from('btng_user_roles')
    .update({ discount_eligible: true, discount_bps: DISCOUNT_BPS, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return {
    success: true,
    loanId,
    certId: (certData as any)?.id ?? null,
    certNftId,
    interestAmount: parseFloat(interest.toFixed(4)),
    totalDue: parseFloat(totalDue.toFixed(4)),
    dueDate: dueDateStr,
    error: null,
  };
}

// ── Discount Engine ─────────────────────────────────────────────────────────

export async function calculateDiscount(
  userId: string,
  feeAmount: number
): Promise<{ discountBps: number; discountAmount: number; finalAmount: number; eligible: boolean }> {
  const { data: roleRec } = await getUserRole(userId);
  if (!roleRec?.discount_eligible || roleRec.discount_bps === 0) {
    return { discountBps: 0, discountAmount: 0, finalAmount: feeAmount, eligible: false };
  }

  // Also verify they still hold at least one active certificate
  const { data: certs } = await supabase
    .from('btng_certificates')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);

  const hasCert = (certs ?? []).length > 0;
  if (!hasCert) {
    return { discountBps: 0, discountAmount: 0, finalAmount: feeAmount, eligible: false };
  }

  const discountBps = roleRec.discount_bps;
  const discountAmount = (feeAmount * discountBps) / 10000;
  const finalAmount = feeAmount - discountAmount;

  return {
    discountBps,
    discountAmount: parseFloat(discountAmount.toFixed(4)),
    finalAmount: parseFloat(finalAmount.toFixed(4)),
    eligible: true,
  };
}

// ── Full onboarding flow ─────────────────────────────────────────────────────

export async function runSignupProductEngine(
  userId: string,
  walletAddress: string,
  role: UserRole,
  referralCode?: string
): Promise<{
  roleSet: boolean;
  identityMinted: boolean;
  nftId: string | null;
  creditsGranted: number;
  error: string | null;
}> {
  // Step 1: Set role
  const { error: roleError } = await setUserRole(userId, role);
  if (roleError) return { roleSet: false, identityMinted: false, nftId: null, creditsGranted: 0, error: roleError };

  // Step 2: Mint identity
  const { nftId, error: idError } = await mintIdentity(userId, walletAddress, role);
  if (idError) return { roleSet: true, identityMinted: false, nftId: null, creditsGranted: 0, error: idError };

  // Step 3: Mint signup credits
  const { amount } = await mintSignupCredits(userId, referralCode);

  return {
    roleSet: true,
    identityMinted: true,
    nftId,
    creditsGranted: amount,
    error: null,
  };
}
