/**
 * BTNG Custom Server — Supabase Edge Function
 * ─────────────────────────────────────────────────────────────────────────────
 * A flexible serverless HTTP handler modelled on a Node.js Express server.
 * Supports GET / POST routing, JSON bodies, CORS, and auth-aware responses.
 *
 * Routes
 * ──────
 *  GET  /btng-custom-server               → health check
 *  GET  /btng-custom-server/status        → network / sovereign status
 *  GET  /btng-custom-server/blocks        → simulated block explorer data
 *  GET  /btng-custom-server/tx/:id        → transaction lookup stub
 *  GET  /btng-custom-server/credit/:uid   → user credit score stub
 *  POST /btng-custom-server/echo          → echoes JSON body
 *  POST /btng-custom-server/order         → order submission stub
 *  POST /btng-custom-server/convert       → PoV conversion stub
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── CORS ─────────────────────────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Max-Age':       '86400',
};

function corsResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return corsResponse({ success: false, error: message }, status);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function randomHex(len: number): string {
  const chars = '0123456789abcdef';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * 16)]).join('');
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** GET / — health check */
function handleRoot(): Response {
  return corsResponse({
    success:  true,
    service:  'btng-custom-server',
    version:  '1.0.0',
    network:  'BTNG-MAINNET',
    nations:  54,
    ts:       new Date().toISOString(),
    message:  'BTNG Sovereign Edge Function is live.',
  });
}

/** GET /status — sovereign network status */
async function handleStatus(): Promise<Response> {
  // Try to pull live gold price from the gold-oracle edge function
  let goldPrice = 29500;
  let btcPrice  = 65000;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const oracleRes = await fetch(`${supabaseUrl}/functions/v1/gold-oracle`, {
      headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (oracleRes.ok) {
      const oracleData = await oracleRes.json();
      if (oracleData?.price_usd)      goldPrice = oracleData.price_usd;
      if (oracleData?.btc_price_usd)  btcPrice  = oracleData.btc_price_usd;
    }
  } catch { /* fallback values stay */ }

  return corsResponse({
    success:     true,
    status:      'online',
    network:     'BTNG Sovereign Network',
    chain_id:    'BTNG-MAINNET',
    nations:     54,
    reserve_usd: '29500000000000',
    gold_usd:    goldPrice,
    btc_usd:     btcPrice,
    node:        '168.231.79.52:64799',
    ts:          new Date().toISOString(),
  });
}

/** GET /blocks — simulated block explorer data */
function handleBlocks(url: URL): Response {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10', 10), 50);
  const baseHeight = 1_000_000 + Math.floor(Math.random() * 5000);

  const blocks = Array.from({ length: limit }, (_, i) => ({
    height:       baseHeight - i,
    hash:         `0x${randomHex(64)}`,
    parent_hash:  `0x${randomHex(64)}`,
    miner:        `BTNG-54-${randomHex(32).toUpperCase()}`,
    timestamp:    now() - i * 15,
    tx_count:     Math.floor(Math.random() * 30) + 1,
    gas_used:     Math.floor(Math.random() * 21_000_000),
    size_bytes:   Math.floor(Math.random() * 50_000) + 1000,
    status:       'confirmed',
    network:      'BTNG-MAINNET',
  }));

  return corsResponse({
    success: true,
    count:   blocks.length,
    tip:     baseHeight,
    blocks,
  });
}

/** GET /tx/:id — transaction lookup */
function handleTransaction(txId: string): Response {
  if (!txId || txId.length < 4) {
    return errorResponse('Invalid transaction ID', 400);
  }
  return corsResponse({
    success: true,
    tx: {
      id:           txId,
      hash:         txId.startsWith('0x') ? txId : `0x${txId}`,
      block_height: 1_000_000 + Math.floor(Math.random() * 5000),
      timestamp:    now() - Math.floor(Math.random() * 3600),
      from:         `BTNG-54-${randomHex(32).toUpperCase()}`,
      to:           `BTNG-54-${randomHex(32).toUpperCase()}`,
      amount:       (Math.random() * 10000).toFixed(4),
      asset:        'BTNGG',
      fee:          (Math.random() * 0.01).toFixed(6),
      status:       'confirmed',
      confirmations: Math.floor(Math.random() * 100) + 6,
      network:      'BTNG-MAINNET',
    },
  });
}

/** GET /credit/:uid — AI credit score stub */
async function handleCreditGet(uid: string, req: Request): Promise<Response> {
  if (!uid) return errorResponse('User ID required', 400);

  // Try to pull real loan data from the DB
  let loanCount = 0;
  try {
    const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase     = createClient(supabaseUrl, serviceKey);
    const { count }    = await supabase.from('btng_loans').select('*', { count: 'exact', head: true }).eq('btng_id', uid);
    loanCount          = count ?? 0;
  } catch { /* fallback */ }

  const baseScore  = 600 + Math.floor(Math.random() * 350);
  const creditLimit = baseScore * 12.5;

  return corsResponse({
    success:      true,
    user_id:      uid,
    score:        baseScore,
    grade:        baseScore >= 850 ? 'AAA' : baseScore >= 750 ? 'AA' : baseScore >= 650 ? 'A' : 'BBB',
    credit_limit: creditLimit,
    currency:     'BTNGG',
    loan_count:   loanCount,
    factors: {
      payment_history: 35,
      asset_equity:    30,
      credit_length:   15,
      new_credit:      10,
      credit_mix:      10,
    },
    ts: new Date().toISOString(),
  });
}

/** POST /echo — echoes body */
async function handleEcho(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    return corsResponse({
      success: true,
      echo:    body,
      ts:      new Date().toISOString(),
    });
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
}

/** POST /order — P2P order submission stub */
async function handleOrder(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { orderData, signature } = body ?? {};
    if (!orderData) return errorResponse('orderData is required', 400);
    if (!signature)  return errorResponse('signature is required', 400);

    const orderId = orderData.orderId ?? `BTNG_ORD_${randomHex(16).toUpperCase()}`;
    return corsResponse({
      success:   true,
      orderId,
      status:    'pending',
      message:   'Order submitted to BTNG matching engine.',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return errorResponse('Invalid order payload', 400);
  }
}

/** POST /convert — PoV conversion stub */
async function handleConvert(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { token, amount } = body ?? {};
    if (!token)  return errorResponse('token is required', 400);
    if (!amount) return errorResponse('amount is required', 400);

    const usdValue   = parseFloat(amount) * (Math.random() * 2 + 0.5);
    const confidence = Math.floor(Math.random() * 30) + 70; // 70–100

    if (confidence < 70) {
      return errorResponse('Low PoV confidence — conversion rejected', 422);
    }

    return corsResponse({
      success:    true,
      token,
      amount_in:  parseFloat(amount),
      usd_value:  parseFloat(usdValue.toFixed(4)),
      confidence,
      btngg_out:  parseFloat((usdValue / 0.85).toFixed(4)),
      rate:       'BTNG_POV_ORACLE',
      ts:         new Date().toISOString(),
    });
  } catch {
    return errorResponse('Invalid conversion payload', 400);
  }
}

// ─── Main router ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  // ── Preflight ────────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url      = new URL(req.url);
  const method   = req.method.toUpperCase();

  // Strip function prefix so paths work whether called directly or via gateway
  // e.g. /btng-custom-server/status  or  /status
  const rawPath  = url.pathname;
  const basePath = rawPath.replace(/^\/btng-custom-server/, '') || '/';
  const segments = basePath.split('/').filter(Boolean); // ['status'] | ['tx', '<id>'] …

  try {
    // ── GET routes ──────────────────────────────────────────────────────────
    if (method === 'GET') {
      if (segments.length === 0 || basePath === '/') {
        return handleRoot();
      }
      if (segments[0] === 'status') {
        return await handleStatus();
      }
      if (segments[0] === 'blocks') {
        return handleBlocks(url);
      }
      if (segments[0] === 'tx' && segments[1]) {
        return handleTransaction(segments[1]);
      }
      if (segments[0] === 'credit' && segments[1]) {
        return await handleCreditGet(segments[1], req);
      }
      return errorResponse(`Unknown GET route: ${basePath}`, 404);
    }

    // ── POST routes ─────────────────────────────────────────────────────────
    if (method === 'POST') {
      if (segments[0] === 'echo') {
        return await handleEcho(req);
      }
      if (segments[0] === 'order') {
        return await handleOrder(req);
      }
      if (segments[0] === 'convert') {
        return await handleConvert(req);
      }
      return errorResponse(`Unknown POST route: ${basePath}`, 404);
    }

    return errorResponse(`Method ${method} not allowed`, 405);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[btng-custom-server] Unhandled error:', msg);
    return errorResponse(msg, 500);
  }
});
