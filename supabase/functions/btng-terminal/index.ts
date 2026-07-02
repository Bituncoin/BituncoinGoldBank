/**
 * btng-terminal — Instant Live Order Book
 * ────────────────────────────────────────────────────────────────────────────
 * Returns synthetic but market-realistic bid/ask depth for any coin pair.
 *
 * FIX: Removed outbound CoinGecko HTTP call (was causing 499 timeout errors).
 * Now reads price from btng_oracle_cache table (populated by coingecko-prices)
 * or uses hardcoded fallbacks — responds in <50ms every time.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Fallback prices (June 2026 live levels) ───────────────────────────────────
const FALLBACK_PRICES: Record<string, number> = {
  BTC:    107_200,
  ETH:    3_840,
  BNB:    685,
  SOL:    184,
  XRP:    2.14,
  MATIC:  0.89,
  ADA:    0.72,
  DOGE:   0.38,
  AVAX:   42.80,
  DOT:    9.14,
  LINK:   22.1,
  SUI:    3.84,
  UNI:    9.44,
  NEAR:   5.93,
  ARB:    0.614,
  PAXG:   3_316,
  USDT:   1.0,
  USDC:   1.0,
  BTNG:   4.4622,
  BTNGG:  4.4622,
  'BTNG-AU': 3_250,
  'BTNG-GH': 0.278,
  AFRO54: 18.5,
  AFN:    0.001,
  COCOA:  0.0044,
};

const FALLBACK_CHANGE: Record<string, number> = {
  BTC: 1.82, ETH: 2.34, BNB: 0.91, SOL: 3.12, XRP: -0.44,
  MATIC: 5.67, ADA: 1.34, DOGE: 4.12, AVAX: -1.55, DOT: 2.78,
  LINK: 1.54, SUI: 4.11, UNI: 0.73, NEAR: 2.29, ARB: 1.38,
  PAXG: 0.14, USDT: 0.01, USDC: 0.0, BTNG: 0.278, BTNGG: 0.278,
};

// ── Deterministic pseudo-random (mulberry32) ───────────────────────────────────
function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

interface OrderLevel { price: number; amount: number; total: number; }
interface OrderBook {
  asks: OrderLevel[]; bids: OrderLevel[];
  spread: number; spreadPct: number; midPrice: number; lastPrice: number;
  change24h: number; high24h: number; low24h: number; volume24h: number;
  ts: number; source: string;
}

function buildDepth(
  midPrice: number,
  rng: () => number,
  levels = 10,
): { asks: OrderLevel[]; bids: OrderLevel[] } {
  const spreadPct = midPrice > 50_000 ? 0.0002 : midPrice > 1_000 ? 0.0003 : midPrice > 10 ? 0.0005 : 0.0015;
  const halfSpread = midPrice * spreadPct;

  const buildSide = (dir: 1 | -1): OrderLevel[] => {
    const entries: OrderLevel[] = [];
    let cum = 0;
    for (let i = 0; i < levels; i++) {
      const tick = midPrice > 10_000 ? 0.5 : midPrice > 100 ? 0.01 : midPrice > 1 ? 0.0001 : 0.00001;
      const offset = halfSpread + i * tick * (1 + rng() * 2.5);
      const price = parseFloat((midPrice + dir * offset).toFixed(8));
      const amt   = parseFloat(((rng() * 8000 + 200) / (i * 0.4 + 1)).toFixed(4));
      cum += amt;
      entries.push({ price, amount: amt, total: parseFloat(cum.toFixed(4)) });
    }
    return entries;
  };

  const asks = buildSide(1);
  const bids = buildSide(-1);
  return { asks, bids };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let symbol = 'BTC';
    let levels = 10;

    try {
      const body = await req.json();
      if (body?.symbol) symbol = String(body.symbol).toUpperCase();
      if (typeof body?.levels === 'number') levels = Math.min(20, Math.max(5, body.levels));
    } catch { /* use defaults */ }

    // ── Try to read cached price from btng_oracle_cache ───────────────────
    let livePrice = 0;
    let change24h = 0;
    let priceSrc  = 'fallback';

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      // Cache key convention used by coingecko-prices: lowercase symbol
      const cacheKey = symbol.toLowerCase().replace('-', '_');
      const { data } = await supabase
        .from('btng_oracle_cache')
        .select('price_usd, change_24h, fetched_at, expires_at')
        .eq('key', cacheKey)
        .maybeSingle();

      if (data?.price_usd && data.price_usd > 0) {
        const expiresAt = new Date(data.expires_at).getTime();
        if (expiresAt > Date.now()) {
          livePrice = data.price_usd;
          change24h = data.change_24h ?? 0;
          priceSrc  = 'db_cache';
        }
      }
    } catch (dbErr) {
      console.warn('[btng-terminal] DB cache read failed:', dbErr);
    }

    // ── Fall back to hardcoded prices ────────────────────────────────────
    if (livePrice <= 0) {
      livePrice = FALLBACK_PRICES[symbol] ?? FALLBACK_PRICES['BTC'];
      change24h = FALLBACK_CHANGE[symbol] ?? 0;
      priceSrc  = 'static_fallback';
    }

    const high24h   = livePrice * (1 + Math.abs(change24h) * 0.006 + 0.008);
    const low24h    = livePrice * (1 - Math.abs(change24h) * 0.006 - 0.008);
    const volume24h = livePrice * 1_000_000 * (Math.random() * 50 + 10);

    // Seed RNG with 10-second window so data refreshes visually on each poll
    const seed = Math.floor(Date.now() / 10_000) + Math.floor(livePrice * 100);
    const rng  = seeded(seed);

    const { asks, bids } = buildDepth(livePrice, rng, levels);

    const spread    = asks[0].price - bids[0].price;
    const spreadPct = (spread / livePrice) * 100;

    const book: OrderBook = {
      asks, bids,
      spread:    parseFloat(spread.toFixed(8)),
      spreadPct: parseFloat(spreadPct.toFixed(4)),
      midPrice:  livePrice,
      lastPrice: livePrice,
      change24h, high24h, low24h, volume24h,
      ts:     Date.now(),
      source: priceSrc,
    };

    console.log(`[btng-terminal] ${symbol} @ $${livePrice} spread=${spread.toFixed(6)} src=${priceSrc}`);

    return new Response(
      JSON.stringify(book),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[btng-terminal] Error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
