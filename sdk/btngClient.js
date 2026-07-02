// ╔══════════════════════════════════════════════════════════════════╗
// ║  BTNG WEB SDK — UBL-1.0                                         ║
// ║  JavaScript · Fetch API · All browsers & operating systems     ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// USAGE (import in any web project):
//   import { getWallet, loanQuote, activateCard } from './btngClient.js';
//
//   const wallet = await getWallet('BTNG-1234-5678');
//   const quote  = await loanQuote('BTNG-1234-5678', 10000, 90);

const BASE_URL      = 'https://btng-bank.yourdomain.com';
const UBL_VERSION   = 'UBL-1.0';
const CLIENT_TAG    = 'web';
const GOLD_SYMBOL   = 'BTNGG';
const BASE_RATE_APR = 0.08;
const MAX_LTV       = 0.70;

// ── Shared Headers ────────────────────────────────────────────────
function headers(extra = {}) {
  return {
    'Content-Type':   'application/json',
    'X-BTNG-Client':  CLIENT_TAG,
    'X-BTNG-UBL':     UBL_VERSION,
    'X-BTNG-Chain':   'btng1',
    ...extra,
  };
}

// ── Wallet Lookup ─────────────────────────────────────────────────
export async function getWallet(btngId) {
  try {
    const res = await fetch(`${BASE_URL}/wallet/${encodeURIComponent(btngId)}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Loan Quote ────────────────────────────────────────────────────
export async function loanQuote(btngId, principal, days) {
  try {
    const res = await fetch(`${BASE_URL}/loan/quote`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ btng_id: btngId, principal, days }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Card Activation ───────────────────────────────────────────────
export async function activateCard(btngId, wallet, expires) {
  try {
    const res = await fetch(`${BASE_URL}/card/activate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ btng_id: btngId, wallet, expires }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Identity Registration ─────────────────────────────────────────
export async function registerIdentity(btngId, wallet, expires) {
  try {
    const res = await fetch(`${BASE_URL}/identity`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ btng_id: btngId, wallet, expires }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Health Check ──────────────────────────────────────────────────
export async function healthCheck() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { headers: headers() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Local Loan Quote (offline fallback) ───────────────────────────
export function localLoanQuote(btngId, principal, days) {
  const maxBorrow = principal * MAX_LTV;
  const dailyRate = BASE_RATE_APR / 365.0;
  const interest  = maxBorrow * dailyRate * days;
  const totalDue  = maxBorrow + interest;
  const risk = principal > 50000 ? 'HIGH' : principal > 10000 ? 'MEDIUM' : 'LOW';
  return {
    btng_id:    btngId,
    principal,
    max_borrow: Math.round(maxBorrow * 100) / 100,
    interest:   Math.round(interest  * 100) / 100,
    total_due:  Math.round(totalDue  * 100) / 100,
    currency:   GOLD_SYMBOL,
    rate_apr:   BASE_RATE_APR,
    ltv:        MAX_LTV,
    risk_level: risk,
    source:     'local',
  };
}

export { BASE_URL, GOLD_SYMBOL, BASE_RATE_APR, MAX_LTV };
