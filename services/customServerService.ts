/**
 * BTNG Custom Server Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed TypeScript client for the `btng-custom-server` Edge Function.
 * Wraps all GET/POST routes with proper error handling via FunctionsHttpError.
 *
 * Routes covered
 * ──────────────
 *  GET  /                   → health check      → getServerHealth()
 *  GET  /status             → network status    → getNetworkStatus()
 *  GET  /blocks             → block explorer    → getBlocks()
 *  GET  /tx/:id             → transaction       → getTransaction()
 *  GET  /credit/:uid        → AI credit score   → getCreditScore()
 *  POST /echo               → echo body         → echo()
 *  POST /order              → submit order      → submitOrder()
 *  POST /convert            → PoV conversion    → convertToken()
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/template';

// ─── Response envelope ────────────────────────────────────────────────────────
export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface ServerHealthResponse {
  success: boolean;
  service: string;
  version: string;
  network: string;
  nations: number;
  ts: string;
  message: string;
}

export interface NetworkStatusResponse {
  success: boolean;
  status: string;
  network: string;
  chain_id: string;
  nations: number;
  reserve_usd: string;
  gold_usd: number;
  btc_usd: number;
  node: string;
  ts: string;
}

export interface BlockRecord {
  height: number;
  hash: string;
  parent_hash: string;
  miner: string;
  timestamp: number;
  tx_count: number;
  gas_used: number;
  size_bytes: number;
  status: string;
  network: string;
}

export interface BlocksResponse {
  success: boolean;
  count: number;
  tip: number;
  blocks: BlockRecord[];
}

export interface TransactionRecord {
  id: string;
  hash: string;
  block_height: number;
  timestamp: number;
  from: string;
  to: string;
  amount: string;
  asset: string;
  fee: string;
  status: string;
  confirmations: number;
  network: string;
}

export interface TransactionResponse {
  success: boolean;
  tx: TransactionRecord;
}

export interface CreditFactors {
  payment_history: number;
  asset_equity: number;
  credit_length: number;
  new_credit: number;
  credit_mix: number;
}

export interface CreditScoreResponse {
  success: boolean;
  user_id: string;
  score: number;
  grade: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';
  credit_limit: number;
  currency: string;
  loan_count: number;
  factors: CreditFactors;
  ts: string;
}

export interface EchoResponse {
  success: boolean;
  echo: unknown;
  ts: string;
}

export interface OrderData {
  orderId?: string;
  maker?: string;
  taker?: string;
  sendAsset: string;
  sendAmount: string | number;
  receiveAsset: string;
  receiveAmount: string | number;
  hashlock?: string;
  timeoutBlocks?: number;
  [key: string]: unknown;
}

export interface OrderResponse {
  success: boolean;
  orderId: string;
  status: string;
  message: string;
  timestamp: string;
}

export interface ConvertResponse {
  success: boolean;
  token: string;
  amount_in: number;
  usd_value: number;
  confidence: number;
  btngg_out: number;
  rate: string;
  ts: string;
}

// ─── Core invoker ─────────────────────────────────────────────────────────────
/**
 * Invokes the btng-custom-server Edge Function and handles all error paths.
 * Uses body params to pass the path + method since functions.invoke() always
 * POSTs to the function URL. The Edge Function reads `_path` and `_method`
 * to route internally, or we fall back to a direct fetch for GET routes.
 */
async function invokeCustomServer<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
  } = {}
): Promise<ServiceResult<T>> {
  const { method = 'GET', body } = options;
  const supabase = getSupabaseClient();

  try {
    // For GET routes we pass the sub-path in the body so the Edge Function
    // can reconstruct the URL. Alternatively, call via raw fetch using the
    // function's public URL for true GET semantics.
    const invokeBody: Record<string, unknown> = {
      _path: path,
      _method: method,
      ...(body ?? {}),
    };

    // Use raw fetch for GET routes to avoid forcing POST semantics
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

    if (method === 'GET') {
      const session   = await supabase.auth.getSession();
      const token     = session?.data?.session?.access_token ?? anonKey;
      const endpoint  = `${supabaseUrl}/functions/v1/btng-custom-server${path}`;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'apikey': anonKey,
          },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const t = await res.text(); errMsg = `[${res.status}] ${t || errMsg}`; } catch { /* ignore */ }
        return { data: null, error: errMsg };
      }
      const json = await res.json() as T;
      return { data: json, error: null };
    }

    // POST routes via functions.invoke()
    const { data, error } = await supabase.functions.invoke<T>('btng-custom-server', {
      body: { ...body, _path: path },
    });

    if (error) {
      let errorMessage = error.message ?? 'Edge Function error';
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = (error as any).context?.status ?? 500;
          const textContent = await (error as any).context?.text?.();
          errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
        } catch {
          errorMessage = error.message ?? 'Failed to read response';
        }
      }
      return { data: null, error: errorMessage };
    }

    return { data: data ?? null, error: null };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { data: null, error: msg };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * GET / — Health check for the btng-custom-server Edge Function.
 */
export async function getServerHealth(): Promise<ServiceResult<ServerHealthResponse>> {
  return invokeCustomServer<ServerHealthResponse>('/', { method: 'GET' });
}

/**
 * GET /status — Sovereign network status (gold price, BTC, nations, node).
 */
export async function getNetworkStatus(): Promise<ServiceResult<NetworkStatusResponse>> {
  return invokeCustomServer<NetworkStatusResponse>('/status', { method: 'GET' });
}

/**
 * GET /blocks — Paginated block explorer data.
 * @param limit Number of blocks to return (max 50, default 10)
 */
export async function getBlocks(limit = 10): Promise<ServiceResult<BlocksResponse>> {
  const supabase = getSupabaseClient();
  const anonKey  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

  try {
    const session = await supabase.auth.getSession();
    const token   = session?.data?.session?.access_token ?? anonKey;
    const endpoint = `${supabaseUrl}/functions/v1/btng-custom-server/blocks?limit=${limit}`;

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const t = await res.text(); errMsg = `[${res.status}] ${t || errMsg}`; } catch { /* ignore */ }
      return { data: null, error: errMsg };
    }
    return { data: await res.json() as BlocksResponse, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * GET /tx/:id — Transaction lookup by ID or hash.
 * @param txId Transaction ID or hash
 */
export async function getTransaction(txId: string): Promise<ServiceResult<TransactionResponse>> {
  if (!txId || txId.trim().length < 4) {
    return { data: null, error: 'Transaction ID must be at least 4 characters' };
  }
  return invokeCustomServer<TransactionResponse>(`/tx/${encodeURIComponent(txId.trim())}`, { method: 'GET' });
}

/**
 * GET /credit/:uid — AI credit score for a given user / BTNG ID.
 * @param uid User ID or BTNG-54 address
 */
export async function getCreditScore(uid: string): Promise<ServiceResult<CreditScoreResponse>> {
  if (!uid || uid.trim().length === 0) {
    return { data: null, error: 'User ID is required' };
  }
  return invokeCustomServer<CreditScoreResponse>(`/credit/${encodeURIComponent(uid.trim())}`, { method: 'GET' });
}

/**
 * POST /echo — Echoes the supplied body back from the Edge Function.
 * Useful for connectivity testing and round-trip latency measurement.
 */
export async function echo(payload: Record<string, unknown>): Promise<ServiceResult<EchoResponse>> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase.functions.invoke<EchoResponse>('btng-custom-server', {
      body: { ...payload, _path: '/echo' },
    });
    if (error) {
      let errorMessage = error.message ?? 'Edge Function error';
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = (error as any).context?.status ?? 500;
          const text = await (error as any).context?.text?.();
          errorMessage = `[Code: ${statusCode}] ${text || error.message}`;
        } catch { /* ignore */ }
      }
      return { data: null, error: errorMessage };
    }
    return { data: data ?? null, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * POST /order — Submit a P2P atomic swap order to the BTNG matching engine.
 * @param orderData  Structured order payload (assets, amounts, hashlock, etc.)
 * @param signature  Maker's EIP-191 signature over the order hash
 */
export async function submitOrder(
  orderData: OrderData,
  signature: string
): Promise<ServiceResult<OrderResponse>> {
  if (!orderData) return { data: null, error: 'orderData is required' };
  if (!signature) return { data: null, error: 'signature is required' };

  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase.functions.invoke<OrderResponse>('btng-custom-server', {
      body: { _path: '/order', orderData, signature },
    });
    if (error) {
      let errorMessage = error.message ?? 'Edge Function error';
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = (error as any).context?.status ?? 500;
          const text = await (error as any).context?.text?.();
          errorMessage = `[Code: ${statusCode}] ${text || error.message}`;
        } catch { /* ignore */ }
      }
      return { data: null, error: errorMessage };
    }
    return { data: data ?? null, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * POST /convert — PoV-validated token → BTNGG conversion.
 * @param token   Token symbol or contract address to convert from
 * @param amount  Amount of the input token (as string or number)
 */
export async function convertToken(
  token: string,
  amount: string | number
): Promise<ServiceResult<ConvertResponse>> {
  if (!token)  return { data: null, error: 'token is required' };
  if (!amount) return { data: null, error: 'amount is required' };

  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase.functions.invoke<ConvertResponse>('btng-custom-server', {
      body: { _path: '/convert', token, amount },
    });
    if (error) {
      let errorMessage = error.message ?? 'Edge Function error';
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = (error as any).context?.status ?? 500;
          const text = await (error as any).context?.text?.();
          errorMessage = `[Code: ${statusCode}] ${text || error.message}`;
        } catch { /* ignore */ }
      }
      return { data: null, error: errorMessage };
    }
    return { data: data ?? null, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Convenience bundle ───────────────────────────────────────────────────────
/**
 * Fires a health + status check in parallel and returns both.
 * Useful for a dashboard "is the server alive?" check.
 */
export async function pingCustomServer(): Promise<{
  health: ServiceResult<ServerHealthResponse>;
  status: ServiceResult<NetworkStatusResponse>;
}> {
  const [health, status] = await Promise.all([
    getServerHealth(),
    getNetworkStatus(),
  ]);
  return { health, status };
}
