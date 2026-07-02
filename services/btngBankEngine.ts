// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BTNG Universal Banking Layer — UBL-1.0                                 ║
// ║  TypeScript sovereign banking core (React Native / OnSpace Cloud)        ║
// ║  Mirrors the FastAPI engine contract — falls back to local computation   ║
// ║  when no live backend URL is configured.                                 ║
// ║  Persists every query to Supabase (btng_wallets / btng_loans /           ║
// ║  btng_cards / btng_identities) for full per-user history.                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { getSupabaseClient } from '@/template';

// ── Constants ─────────────────────────────────────────────────────────────────
export const BTNG_GOLD_SYMBOL    = 'BTNGG';
export const BTNG_CHAIN_PREFIX   = 'btng1';
export const BASE_RATE_APR       = 0.08;
export const MAX_LTV             = 0.70;
export const PLATFORM_HEADER     = 'react-native';
export const UBL_VERSION         = 'UBL-1.0';
export const GOLD_RATE_GHS       = 9800;

export let BTNG_BANK_BASE_URL = '';
export function setBTNGBankBaseURL(url: string) {
  BTNG_BANK_BASE_URL = url.trim().replace(/\/$/, '');
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BTNGIdentityIn {
  btng_id: string;
  wallet: string;
  expires: string;
}

export interface BTNGIdentityOut {
  status: 'OK' | 'ERROR';
  btng_id: string;
  wallet: string;
  expires: string;
  registered_at: string;
}

export interface BTNGWalletOut {
  btng_id: string;
  wallet: string;
  asset: string;
  balance: number;
  gold_backed_ghs: number;
  tier: string;
  active: boolean;
  source: 'live' | 'local';
}

export interface BTNGLoanRequest {
  btng_id: string;
  principal: number;
  days: number;
}

export interface BTNGLoanQuoteOut {
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
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  source: 'live' | 'local';
}

export interface BTNGCardActivateIn {
  btng_id: string;
  wallet: string;
  expires?: string;
}

export interface BTNGCardActivateOut {
  status: 'ACTIVE' | 'PENDING' | 'ERROR';
  btng_id: string;
  wallet: string;
  card_number_masked: string;
  activated_at: string;
  expires: string;
  tier: string;
  source: 'live' | 'local';
}

export interface BTNGTransactionEvent {
  user_id: string;
  event_type: string;
  amount: number;
  asset: string;
  timestamp: string;
  decision: string;
  pattern: string;
  risk: string;
}

// ── Supabase history record types ─────────────────────────────────────────────
export interface BTNGWalletRecord {
  id: string;
  user_id: string;
  btng_id: string;
  wallet_address: string;
  asset: string;
  balance: number;
  gold_backed_ghs: number;
  tier: string;
  source: string;
  looked_up_at: string;
  created_at: string;
}

export interface BTNGLoanRecord {
  id: string;
  user_id: string;
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

export interface BTNGCardRecord {
  id: string;
  user_id: string;
  btng_id: string;
  wallet_address: string;
  card_number_masked: string;
  activated_at: string;
  expires: string;
  tier: string;
  status: string;
  source: string;
  created_at: string;
}

export interface BTNGIdentityRecord {
  id: string;
  user_id: string;
  btng_id: string;
  wallet_address: string;
  expires: string;
  status: string;
  registered_at: string;
  source: string;
  created_at: string;
}

// ── UBL HTTP Client ───────────────────────────────────────────────────────────
export function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-BTNG-Client': PLATFORM_HEADER,
    'X-BTNG-Chain': BTNG_CHAIN_PREFIX,
    'X-BTNG-UBL': UBL_VERSION,
    ...extra,
  };
}

async function ublFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  if (!BTNG_BANK_BASE_URL) return null;
  try {
    const res = await fetch(`${BTNG_BANK_BASE_URL}${path}`, {
      ...options,
      headers: { ...buildHeaders(), ...(options?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ── Supabase Persistence Helpers ──────────────────────────────────────────────
async function persistWallet(userId: string, result: BTNGWalletOut): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    // upsert on user_id so repeat lookups update instead of insert duplicates
    await supabase.from('btng_wallets').upsert({
      user_id: userId,
      btng_id: result.btng_id,
      wallet_address: result.wallet,
      asset: result.asset,
      balance: result.balance,
      gold_backed_ghs: result.gold_backed_ghs,
      tier: result.tier,
      source: result.source,
      looked_up_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch { /* non-blocking */ }
}

async function persistLoan(userId: string, result: BTNGLoanQuoteOut): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('btng_loans').insert({
      user_id: userId,
      btng_id: result.btng_id,
      principal: result.principal,
      max_borrow: result.max_borrow,
      interest: result.interest,
      total_due: result.total_due,
      currency: result.currency,
      due_date: result.due_date,
      rate_apr: result.rate_apr,
      ltv: result.ltv,
      daily_rate: result.daily_rate,
      risk_level: result.risk_level,
      source: result.source,
    });
  } catch { /* non-blocking */ }
}

async function persistCard(userId: string, result: BTNGCardActivateOut): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('btng_cards').insert({
      user_id: userId,
      btng_id: result.btng_id,
      wallet_address: result.wallet,
      card_number_masked: result.card_number_masked,
      activated_at: result.activated_at,
      expires: result.expires,
      tier: result.tier,
      status: result.status,
      source: result.source,
    });
  } catch { /* non-blocking */ }
}

async function persistIdentity(userId: string, result: BTNGIdentityOut): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('btng_identities').insert({
      user_id: userId,
      btng_id: result.btng_id,
      wallet_address: result.wallet,
      expires: result.expires,
      status: result.status,
      registered_at: result.registered_at,
      source: 'local',
    });
  } catch { /* non-blocking */ }
}

// ── History Fetch Functions ───────────────────────────────────────────────────
export async function fetchWalletHistory(userId: string, limit = 20): Promise<BTNGWalletRecord[]> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('btng_wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as BTNGWalletRecord[];
  } catch { return []; }
}

export async function fetchLoanHistory(userId: string, limit = 20): Promise<BTNGLoanRecord[]> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('btng_loans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as BTNGLoanRecord[];
  } catch { return []; }
}

export async function fetchCardHistory(userId: string, limit = 20): Promise<BTNGCardRecord[]> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('btng_cards')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as BTNGCardRecord[];
  } catch { return []; }
}

export async function fetchIdentityHistory(userId: string, limit = 20): Promise<BTNGIdentityRecord[]> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('btng_identities')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as BTNGIdentityRecord[];
  } catch { return []; }
}

export async function deleteHistoryRecord(
  table: 'btng_wallets' | 'btng_loans' | 'btng_cards' | 'btng_identities',
  id: string
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from(table).delete().eq('id', id);
    return { error: error?.message ?? null };
  } catch (e: any) { return { error: e?.message ?? 'Delete failed' }; }
}

// ── Register Identity ─────────────────────────────────────────────────────────
export async function registerIdentityAsync(
  input: BTNGIdentityIn,
  userId?: string
): Promise<BTNGIdentityOut> {
  const live = await ublFetch<Omit<BTNGIdentityOut, 'registered_at'>>('/identity', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const result = live
    ? { ...live, registered_at: new Date().toISOString() }
    : registerIdentity(input);
  if (userId) await persistIdentity(userId, result);
  return result;
}

export function registerIdentity(input: BTNGIdentityIn): BTNGIdentityOut {
  return {
    status: 'OK',
    btng_id: input.btng_id,
    wallet: input.wallet,
    expires: input.expires,
    registered_at: new Date().toISOString(),
  };
}

// ── Wallet Lookup ─────────────────────────────────────────────────────────────
export async function getWalletAsync(
  btngId: string,
  balanceGHS = 0,
  userId?: string
): Promise<BTNGWalletOut> {
  const live = await ublFetch<{ btng_id: string; wallet: string; asset: string; balance: number }>(
    `/wallet/${encodeURIComponent(btngId)}`
  );
  const result: BTNGWalletOut = live
    ? { ...live, gold_backed_ghs: balanceGHS, tier: walletTier(balanceGHS), active: true, source: 'live' }
    : getWallet(btngId, balanceGHS);
  if (userId) await persistWallet(userId, result);
  return result;
}

export function getWallet(btngId: string, balanceGHS = 0): BTNGWalletOut {
  const suffix = btngId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();
  const wallet = `${BTNG_CHAIN_PREFIX}${suffix}`;
  const goldBalance = balanceGHS > 0 ? balanceGHS / GOLD_RATE_GHS : 0;
  return {
    btng_id: btngId,
    wallet,
    asset: BTNG_GOLD_SYMBOL,
    balance: parseFloat(goldBalance.toFixed(6)),
    gold_backed_ghs: balanceGHS,
    tier: walletTier(balanceGHS),
    active: true,
    source: 'local',
  };
}

function walletTier(balanceGHS: number): string {
  if (balanceGHS >= 100_000) return 'Platinum';
  if (balanceGHS >= 50_000)  return 'Gold';
  if (balanceGHS >= 10_000)  return 'Silver';
  return 'Bronze';
}

// ── Loan Quote ────────────────────────────────────────────────────────────────
export async function loanQuoteAsync(
  req: BTNGLoanRequest,
  userId?: string
): Promise<BTNGLoanQuoteOut> {
  const live = await ublFetch<{
    btng_id: string; principal: number; max_borrow: number;
    interest: number; total_due: number; currency: string; due_date: string;
  }>('/loan/quote', { method: 'POST', body: JSON.stringify(req) });
  const localBase = loanQuote(req);
  const result: BTNGLoanQuoteOut = live
    ? { ...localBase, ...live, source: 'live' as const }
    : localBase;
  if (userId) await persistLoan(userId, result);
  return result;
}

export function loanQuote(req: BTNGLoanRequest): BTNGLoanQuoteOut {
  const maxBorrow  = req.principal * MAX_LTV;
  const dailyRate  = BASE_RATE_APR / 365;
  const interest   = maxBorrow * dailyRate * req.days;
  const totalDue   = maxBorrow + interest;
  const dueDate    = new Date(Date.now() + req.days * 86_400_000);
  const riskLevel: BTNGLoanQuoteOut['risk_level'] =
    req.principal > 50_000 ? 'HIGH' :
    req.principal > 10_000 ? 'MEDIUM' : 'LOW';
  return {
    btng_id: req.btng_id, principal: req.principal,
    max_borrow: parseFloat(maxBorrow.toFixed(2)),
    interest:   parseFloat(interest.toFixed(2)),
    total_due:  parseFloat(totalDue.toFixed(2)),
    currency: BTNG_GOLD_SYMBOL,
    due_date: dueDate.toISOString(),
    rate_apr: BASE_RATE_APR, ltv: MAX_LTV,
    daily_rate: parseFloat((dailyRate * 100).toFixed(4)),
    risk_level: riskLevel,
    source: 'local',
  };
}

// ── Card Activation ───────────────────────────────────────────────────────────
export async function activateCardAsync(
  btngId: string,
  wallet: string,
  expires?: string,
  userId?: string
): Promise<BTNGCardActivateOut> {
  const live = await ublFetch<{ status: string; btng_id: string; wallet: string; activated_at: string; expires?: string }>(
    '/card/activate',
    { method: 'POST', body: JSON.stringify({ btng_id: btngId, wallet, expires }) }
  );
  const localBase = activateCard(btngId, wallet, expires);
  const result: BTNGCardActivateOut = live
    ? { ...localBase, status: (live.status as any) ?? 'ACTIVE', activated_at: live.activated_at, expires: live.expires ?? localBase.expires, source: 'live' }
    : localBase;
  if (userId) await persistCard(userId, result);
  return result;
}

export function activateCard(btngId: string, wallet: string, expires?: string): BTNGCardActivateOut {
  const seed   = btngId.replace(/[^0-9]/g, '').padStart(16, '0').slice(-16);
  const masked = `${seed.slice(0, 4)} \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ${seed.slice(-4)}`;
  const tier   =
    btngId.toLowerCase().includes('plat') ? 'Platinum' :
    btngId.toLowerCase().includes('gold') ? 'Gold' : 'Silver';
  return {
    status: 'ACTIVE', btng_id: btngId, wallet,
    card_number_masked: masked,
    activated_at: new Date().toISOString(),
    expires: expires ?? new Date(Date.now() + 3 * 365 * 86_400_000).toISOString().slice(0, 10),
    tier, source: 'local',
  };
}

// ── Cognitive Engines ─────────────────────────────────────────────────────────
export function eCPUEvaluate(userId: string, amount: number, asset: string): string {
  if (amount > 500_000) return `[eCPU] FLAGGED: user=${userId} asset=${asset} amount=${amount} => MANUAL_REVIEW`;
  if (amount > 100_000) return `[eCPU] APPROVED_HIGH_VALUE: user=${userId} asset=${asset} amount=${amount} => VALIDATED`;
  return `[eCPU] APPROVED: user=${userId} asset=${asset} amount=${amount} => VALIDATED`;
}

export function eGPUAnalyze(userId: string, amount: number): string {
  const anomaly = amount > 1_000_000 ? 'ANOMALY_DETECTED' : 'NO_ANOMALY';
  return `[eGPU] Pattern Analysis: user=${userId} amount=${amount} => ${anomaly}`;
}

export function evaluateRisk(amount: number): { level: BTNGLoanQuoteOut['risk_level']; color: string; label: string } {
  if (amount > 50_000) return { level: 'HIGH',   color: '#EF4444', label: 'High Risk' };
  if (amount > 10_000) return { level: 'MEDIUM', color: '#F59E0B', label: 'Medium Risk' };
  return                      { level: 'LOW',    color: '#22C55E', label: 'Low Risk' };
}

export function processWalletEvent(userId: string, eventType: string, amount: number, asset: string): BTNGTransactionEvent {
  return {
    user_id: userId, event_type: eventType, amount, asset,
    timestamp: new Date().toISOString(),
    decision: eCPUEvaluate(userId, amount, asset),
    pattern:  eGPUAnalyze(userId, amount),
    risk:     evaluateRisk(amount).label,
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────
export function formatGHS(n: number): string {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function formatBTNGG(n: number): string {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}
export function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── SDK Reference Metadata ────────────────────────────────────────────────────
export const UBL_ENDPOINTS = [
  { method: 'GET',  path: '/wallet/:btng_id',  desc: 'Wallet lookup' },
  { method: 'POST', path: '/loan/quote',        desc: 'Loan calculator' },
  { method: 'POST', path: '/card/activate',     desc: 'Card activation' },
  { method: 'POST', path: '/identity',          desc: 'Identity registry' },
] as const;

export const UBL_PLATFORMS = [
  { platform: 'Backend',      icon: 'dns',          lang: 'FastAPI · Python', color: '#009688', note: 'uvicorn main:app' },
  { platform: 'Android',      icon: 'android',      lang: 'Kotlin · OkHttp',  color: '#3DDC84', note: 'BTNGClient.kt' },
  { platform: 'iOS',          icon: 'phone-iphone', lang: 'Swift · URLSession', color: '#F05138', note: 'BTNGClient.swift' },
  { platform: 'Web',          icon: 'language',     lang: 'JavaScript · Fetch', color: '#F7DF1E', note: 'btngClient.js' },
  { platform: 'React Native', icon: 'smartphone',   lang: 'TypeScript · RN',  color: '#61DAFB', note: 'btngBankEngine.ts' },
] as const;
