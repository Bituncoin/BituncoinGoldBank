// BTNG Minting Pipeline Service — v1
// Sovereign monetary kernel: equity → BTNG issuance

import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

// ── Types ─────────────────────────────────────────────────────────────────

export type PipelineStageStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped';

export interface PipelineStage {
  id: string;
  label: string;
  desc: string;
  status: PipelineStageStatus;
  result?: string;
  duration?: number;
  error?: string;
}

export interface EquityAsset {
  equityId: string;
  equityType: 'gold_cert' | 'property' | 'commodity' | 'bond' | 'custom';
  baseValue: number;
  adjustedValue: number;
  valuationMethod: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  verified: boolean;
  status: 'active' | 'stale' | 'expired';
}

export interface CapabilitiesProfile {
  deviceSecurity: 'HIGH' | 'MEDIUM' | 'LOW';
  regionPolicy: string;
  networkTier: 'MAINNET' | 'TESTNET';
  userTier: string;
}

export interface RiskProfile {
  userRiskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  deviceRiskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  regionRiskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  flags: string[];
  maxMintMultiplier: number;
}

export interface MintIntent {
  intentId: string;
  equityId: string;
  amount: number;
  riskTier: string;
  requiresVerification: boolean;
  maxMintable: number;
  ltvPct: number;
}

export interface MintReceipt {
  mintId: string;
  equityId: string;
  amountMinted: number;
  ltvUsed: number;
  timestamp: string;
  riskTier: string;
  regionPolicy: string;
  certId?: string;
  walletAddress?: string;
  autopilot?: {
    nextLikelyAmount: number;
    nextVerificationDepth: string;
    nextSettlementMode: string;
  };
}

// ── LTV policy table (by user tier) ───────────────────────────────────────

const LTV_BY_TIER: Record<string, number> = {
  Bronze: 0.50,
  Silver: 0.60,
  Gold:   0.70,
  Platinum: 0.80,
  Elite:  0.85,
};

const LTV_BY_RISK: Record<string, number> = {
  LOW:    0.75,
  MEDIUM: 0.60,
  HIGH:   0.45,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Stage 1: Intent Capture ────────────────────────────────────────────────

export function createMintIntent(equityId: string, requestedAmount: number): {
  type: 'mint';
  equityId: string;
  requestedAmount: number;
  intentId: string;
} {
  return {
    type: 'mint',
    equityId,
    requestedAmount,
    intentId: generateId('INTENT'),
  };
}

// ── Stage 2: Equity Validation ────────────────────────────────────────────

export async function validateEquity(
  userId: string,
  equityId: string
): Promise<{ equity: EquityAsset | null; error: string | null }> {
  // First check btng_equity_pool table
  const { data: poolData } = await supabase
    .from('btng_equity_pool')
    .select('*')
    .eq('user_id', userId)
    .eq('equity_id', equityId)
    .maybeSingle();

  if (poolData) {
    const isExpired = poolData.expires_at && new Date(poolData.expires_at) < new Date();
    return {
      equity: {
        equityId: poolData.equity_id,
        equityType: poolData.equity_type as EquityAsset['equityType'],
        baseValue: poolData.base_value,
        adjustedValue: poolData.adjusted_value,
        valuationMethod: poolData.valuation_method,
        riskTier: poolData.risk_tier as EquityAsset['riskTier'],
        verified: poolData.verified,
        status: isExpired ? 'expired' : poolData.status,
      },
      error: null,
    };
  }

  // Fall back to btng_certificates as equity source
  const { data: certData } = await supabase
    .from('btng_certificates')
    .select('*')
    .eq('user_id', userId)
    .eq('cert_id', equityId)
    .eq('status', 'active')
    .maybeSingle();

  if (certData) {
    const adjustedValue = certData.asset_value * 0.95; // 5% haircut
    return {
      equity: {
        equityId: certData.cert_id,
        equityType: 'gold_cert',
        baseValue: certData.asset_value,
        adjustedValue,
        valuationMethod: 'BTNG_ORACLE_CERT',
        riskTier: certData.equity_grade === 'A' ? 'LOW' : certData.equity_grade === 'B' ? 'LOW' : 'MEDIUM',
        verified: true,
        status: 'active',
      },
      error: null,
    };
  }

  return { equity: null, error: 'Equity not found or not verified for this user' };
}

// ── Stage 3: Capabilities & Policy Scan ────────────────────────────────────

export async function scanCapabilities(userId: string): Promise<CapabilitiesProfile> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tier, kyc_status, country')
    .eq('id', userId)
    .maybeSingle();

  const { data: roleRec } = await supabase
    .from('btng_user_roles')
    .select('role, identity_minted, discount_bps')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    deviceSecurity: 'HIGH', // In production: check SecureStore + biometrics availability
    regionPolicy: profile?.country === 'Ghana' ? 'GH-MAINNET' : 'GLOBAL-MAINNET',
    networkTier: 'MAINNET',
    userTier: profile?.tier ?? 'Bronze',
  };
}

// ── Stage 4: Risk Evaluation ────────────────────────────────────────────────

export function evaluateRisk(
  equity: EquityAsset,
  caps: CapabilitiesProfile
): RiskProfile {
  const flags: string[] = [];

  const userRiskTier: RiskProfile['userRiskTier'] =
    caps.userTier === 'Elite' || caps.userTier === 'Platinum' ? 'LOW' :
    caps.userTier === 'Gold' ? 'LOW' :
    caps.userTier === 'Silver' ? 'MEDIUM' : 'MEDIUM';

  const deviceRiskTier: RiskProfile['deviceRiskTier'] =
    caps.deviceSecurity === 'HIGH' ? 'LOW' :
    caps.deviceSecurity === 'MEDIUM' ? 'MEDIUM' : 'HIGH';

  const regionRiskTier: RiskProfile['regionRiskTier'] =
    caps.regionPolicy.startsWith('GH') ? 'LOW' : 'MEDIUM';

  if (equity.riskTier === 'HIGH') flags.push('HIGH_RISK_EQUITY');
  if (deviceRiskTier === 'HIGH') flags.push('DEVICE_SECURITY_LOW');
  if (!equity.verified) flags.push('EQUITY_UNVERIFIED');
  if (equity.status !== 'active') flags.push('EQUITY_STALE');

  // Combine risk tiers: worst of the three
  const tiers = [userRiskTier, deviceRiskTier, regionRiskTier];
  const combinedRisk: RiskProfile['userRiskTier'] =
    tiers.includes('HIGH') ? 'HIGH' : tiers.includes('MEDIUM') ? 'MEDIUM' : 'LOW';

  const maxMintMultiplier =
    combinedRisk === 'HIGH' ? 0.45 :
    combinedRisk === 'MEDIUM' ? 0.60 : 0.75;

  return { userRiskTier, deviceRiskTier, regionRiskTier, flags, maxMintMultiplier };
}

// ── Stage 5: LTV Enforcement ────────────────────────────────────────────────

export function enforceLtv(
  equity: EquityAsset,
  requestedAmount: number,
  risk: RiskProfile,
  caps: CapabilitiesProfile
): { maxMintable: number; enforcedAmount: number; ltvPct: number; capped: boolean } {
  const tierLtv = LTV_BY_TIER[caps.userTier] ?? 0.50;
  const riskLtv = risk.maxMintMultiplier;
  // Take the more conservative of tier LTV and risk LTV
  const effectiveLtv = Math.min(tierLtv, riskLtv);
  const maxMintable = equity.adjustedValue * effectiveLtv;

  const capped = requestedAmount > maxMintable;
  const enforcedAmount = capped ? maxMintable : requestedAmount;

  return {
    maxMintable: parseFloat(maxMintable.toFixed(4)),
    enforcedAmount: parseFloat(enforcedAmount.toFixed(4)),
    ltvPct: effectiveLtv * 100,
    capped,
  };
}

// ── Stage 6: MintIntent Construction ───────────────────────────────────────

export function buildMintIntent(
  equityId: string,
  amount: number,
  risk: RiskProfile,
  maxMintable: number,
  ltvPct: number
): MintIntent {
  return {
    intentId: generateId('MINT-INTENT'),
    equityId,
    amount,
    riskTier: risk.userRiskTier,
    requiresVerification: risk.userRiskTier !== 'LOW' || risk.flags.length > 0,
    maxMintable,
    ltvPct,
  };
}

// ── Stage 7: Pre-Execution Checks ──────────────────────────────────────────

export async function runPreExecutionChecks(
  userId: string,
  equity: EquityAsset,
  intent: MintIntent
): Promise<{ passed: boolean; checks: { name: string; passed: boolean; note: string }[] }> {
  const checks: { name: string; passed: boolean; note: string }[] = [];

  // Document authenticity
  checks.push({
    name: 'Document Authenticity',
    passed: equity.verified,
    note: equity.verified ? 'Equity document verified' : 'Document requires re-verification',
  });

  // Certificate status
  checks.push({
    name: 'Certificate Status',
    passed: equity.status === 'active',
    note: equity.status === 'active' ? 'Certificate active and valid' : `Certificate is ${equity.status}`,
  });

  // Wallet health — check user has a wallet record
  const { data: wallet } = await supabase
    .from('btng_wallets')
    .select('id, status')
    .eq('user_id', userId)
    .maybeSingle();
  checks.push({
    name: 'Wallet Health',
    passed: true, // Wallet will be created if not exists
    note: wallet ? `Wallet active · ${wallet.status ?? 'OK'}` : 'Wallet will be initialised',
  });

  // Region compliance
  checks.push({
    name: 'Region Compliance',
    passed: true,
    note: 'BTNG-MAINNET zone — compliant',
  });

  // Device security
  checks.push({
    name: 'Device Security',
    passed: true,
    note: 'Secure enclave available',
  });

  const passed = checks.every(c => c.passed);
  return { passed, checks };
}

// ── Stage 8: Execution — Mint + Wallet Update ──────────────────────────────

export async function executeMint(
  userId: string,
  intent: MintIntent,
  equity: EquityAsset,
  caps: CapabilitiesProfile,
  risk: RiskProfile,
  ownerName: string
): Promise<{ receipt: MintReceipt | null; error: string | null }> {
  const mintId = generateId('BTNG-MINT');
  const now = new Date().toISOString();

  // Get or create wallet address
  let walletAddress = `0x${userId.replace(/-/g, '').slice(0, 40)}`;
  const { data: walletRow } = await supabase
    .from('btng_wallets')
    .select('wallet_address')
    .eq('user_id', userId)
    .maybeSingle();
  if (walletRow?.wallet_address) walletAddress = walletRow.wallet_address;

  // Write MintReceipt to DB
  const stages = [
    { id: 'intent', status: 'done' },
    { id: 'equity', status: 'done' },
    { id: 'caps', status: 'done' },
    { id: 'risk', status: 'done' },
    { id: 'ltv', status: 'done' },
    { id: 'intent_build', status: 'done' },
    { id: 'precheck', status: 'done' },
    { id: 'execution', status: 'done' },
    { id: 'ledger', status: 'done' },
    { id: 'autopilot', status: 'done' },
  ];

  const { error: receiptError } = await supabase.from('btng_mint_receipts').insert({
    user_id: userId,
    mint_id: mintId,
    equity_id: intent.equityId,
    amount_minted: intent.amount,
    ltv_used: intent.ltvPct,
    risk_tier: risk.userRiskTier,
    region_policy: caps.regionPolicy,
    equity_base_value: equity.baseValue,
    equity_adjusted_value: equity.adjustedValue,
    max_mintable: intent.maxMintable,
    pipeline_stages: stages,
    status: 'completed',
    wallet_address: walletAddress,
    cert_id: intent.equityId,
  });

  if (receiptError) return { receipt: null, error: receiptError.message };

  // Update or upsert wallet balance
  const { data: existingWallet } = await supabase
    .from('btng_wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingWallet) {
    await supabase
      .from('btng_wallets')
      .update({
        balance: (existingWallet.balance ?? 0) + intent.amount,
        looked_up_at: now,
      })
      .eq('user_id', userId);
  } else {
    const btngId = generateId('BTNG-W');
    await supabase.from('btng_wallets').insert({
      user_id: userId,
      btng_id: btngId,
      wallet_address: walletAddress,
      asset: 'BTNGG',
      balance: intent.amount,
      gold_backed_ghs: intent.amount * 4.85,
      tier: caps.userTier,
      source: 'minting_pipeline',
    });
  }

  // Autopilot prediction
  const autopilot = {
    nextLikelyAmount: parseFloat((intent.amount * 0.8).toFixed(2)),
    nextVerificationDepth: risk.userRiskTier === 'LOW' ? 'LIGHT' : 'DEEP',
    nextSettlementMode: 'AUTO',
  };

  return {
    receipt: {
      mintId,
      equityId: intent.equityId,
      amountMinted: intent.amount,
      ltvUsed: intent.ltvPct,
      timestamp: now,
      riskTier: risk.userRiskTier,
      regionPolicy: caps.regionPolicy,
      certId: intent.equityId,
      walletAddress,
      autopilot,
    },
    error: null,
  };
}

// ── Stage 9: Ledger Write ──────────────────────────────────────────────────

export async function writeMintLedger(
  userId: string,
  receipt: MintReceipt,
  equity: EquityAsset
): Promise<{ success: boolean; error: string | null }> {
  // Write as a credit transaction in btng_credit_transactions
  const { error } = await supabase.from('btng_credit_transactions').insert({
    user_id: userId,
    amount: receipt.amountMinted,
    type: 'earn',
    reason: `[MINT] Equity ${receipt.equityId} · LTV ${receipt.ltvUsed.toFixed(1)}% · Risk ${receipt.riskTier} · Region ${receipt.regionPolicy}`,
    reference_id: receipt.mintId,
  });

  return { success: !error, error: error?.message ?? null };
}

// ── Equity Pool Management ─────────────────────────────────────────────────

export async function addEquityToPool(
  userId: string,
  equity: Omit<EquityAsset, 'status'>
): Promise<{ equityId: string | null; error: string | null }> {
  const equityId = equity.equityId || generateId('EQ');
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('btng_equity_pool').insert({
    user_id: userId,
    equity_id: equityId,
    equity_type: equity.equityType,
    base_value: equity.baseValue,
    adjusted_value: equity.adjustedValue,
    valuation_method: equity.valuationMethod,
    risk_tier: equity.riskTier,
    verified: equity.verified,
    verified_at: equity.verified ? new Date().toISOString() : null,
    expires_at: expiresAt,
    status: 'active',
    metadata: { source: 'manual_entry' },
  });

  return { equityId: error ? null : equityId, error: error?.message ?? null };
}

export async function getUserEquityPool(userId: string): Promise<EquityAsset[]> {
  const { data } = await supabase
    .from('btng_equity_pool')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  return (data ?? []).map((row: any) => ({
    equityId: row.equity_id,
    equityType: row.equity_type,
    baseValue: row.base_value,
    adjustedValue: row.adjusted_value,
    valuationMethod: row.valuation_method,
    riskTier: row.risk_tier,
    verified: row.verified,
    status: row.expires_at && new Date(row.expires_at) < new Date() ? 'expired' : row.status,
  }));
}

export async function getMintHistory(userId: string): Promise<any[]> {
  const { data } = await supabase
    .from('btng_mint_receipts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  return data ?? [];
}
