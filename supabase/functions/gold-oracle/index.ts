// Edge Function: gold-oracle
// Serves live XAU/USD price with a 25-second server-side DB cache.
// ─── Flow ───────────────────────────────────────────────────────────────────
//  1. Try to read a fresh row from `btng_oracle_cache` (expires_at > now()).
//     → Cache HIT  → return immediately (sub-5ms latency, zero external quota).
//     → Cache MISS → fetch from up to 5 external sources.
//  2. On a successful external fetch, upsert the result with
//     expires_at = now() + 25 seconds.
//  3. Return the price payload with source tagged as 'cache', 'live', or 'fallback'.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const CACHE_KEY           = 'XAU_USD';
// Separate cache key for yesterday's close — reused for up to 12h to avoid hammering Frankfurter
const CACHE_KEY_PREV_CLOSE = 'XAU_USD_PREV_CLOSE';
const CACHE_TTL_SEC        = 25;
const PREV_CLOSE_TTL_SEC   = 12 * 60 * 60;  // 12 hours — yesterday's close doesn't change
const FALLBACK_PRICE       = 4329.45;  // BullionVault live wholesale spot — June 6 2026
const FALLBACK_CHANGE      = -11.20;
const FALLBACK_PCT         = -0.258;

// ── Supabase admin client (service role — bypasses RLS for write) ─────────────
function getAdminClient() {
  const url  = Deno.env.get('SUPABASE_URL')!;
  const key  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Cache helpers ─────────────────────────────────────────────────────────────
async function readCache(supabase: ReturnType<typeof getAdminClient>): Promise<{
  hit: true;
  priceUSD: number;
  change24h: number;
  changePct24h: number;
  source: string;
  cachedAt: string;
} | { hit: false }> {
  try {
    const { data, error } = await supabase
      .from('btng_oracle_cache')
      .select('price_usd, change_24h, change_pct_24h, source, fetched_at, expires_at')
      .eq('key', CACHE_KEY)
      .gt('expires_at', new Date().toISOString())   // only fresh rows
      .maybeSingle();

    if (error) {
      console.warn('[gold-oracle] cache read error:', error.message);
      return { hit: false };
    }
    if (!data || data.price_usd <= 0) return { hit: false };

    console.log(`[gold-oracle] Cache HIT — $${data.price_usd} (source: ${data.source}), expires ${data.expires_at}`);
    return {
      hit: true,
      priceUSD:     data.price_usd,
      change24h:    data.change_24h,
      changePct24h: data.change_pct_24h,
      source:       data.source,
      cachedAt:     data.fetched_at,
    };
  } catch (e) {
    console.warn('[gold-oracle] cache read exception:', (e as Error).message);
    return { hit: false };
  }
}

async function writeCache(
  supabase: ReturnType<typeof getAdminClient>,
  price: number,
  change: number,
  changePct: number,
  source: string,
): Promise<void> {
  try {
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_SEC * 1_000);

    const { error } = await supabase
      .from('btng_oracle_cache')
      .upsert(
        {
          key:             CACHE_KEY,
          price_usd:       price,
          change_24h:      change,
          change_pct_24h:  changePct,
          source,
          fetched_at:      now.toISOString(),
          expires_at:      expiresAt.toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      console.warn('[gold-oracle] cache write error:', error.message);
    } else {
      console.log(`[gold-oracle] Cache WRITTEN — $${price} (${source}), TTL ${CACHE_TTL_SEC}s, expires ${expiresAt.toISOString()}`);
    }
  } catch (e) {
    console.warn('[gold-oracle] cache write exception:', (e as Error).message);
  }
}

// ── Fetch yesterday's XAU/USD close from Frankfurter dated endpoint ───────────
// Cache key: XAU_USD_PREV_CLOSE, TTL 12 hours (value doesn't change once set)
async function fetchYesterdayClose(
  supabase: ReturnType<typeof getAdminClient>
): Promise<number | null> {
  // 1. Try DB cache first (12h TTL — yesterday's price never changes)
  try {
    const { data } = await supabase
      .from('btng_oracle_cache')
      .select('price_usd, expires_at')
      .eq('key', CACHE_KEY_PREV_CLOSE)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (data?.price_usd && data.price_usd > 500) {
      console.log(`[gold-oracle] PrevClose cache HIT — $${data.price_usd}`);
      return data.price_usd;
    }
  } catch { /* ignore cache miss */ }

  // 2. Fetch yesterday's date string (UTC)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  try {
    const res = await fetch(
      `https://api.frankfurter.app/${yesterday}?from=XAU&to=USD`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = await res.json();
    const prevClose = data?.rates?.USD;
    if (typeof prevClose !== 'number' || prevClose < 500) return null;
    console.log(`[gold-oracle] Frankfurter yesterday (${yesterday}) XAU/USD: $${prevClose}`);
    // Write to DB cache (12h TTL)
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + PREV_CLOSE_TTL_SEC * 1_000);
    supabase.from('btng_oracle_cache').upsert(
      {
        key:            CACHE_KEY_PREV_CLOSE,
        price_usd:      prevClose,
        change_24h:     0,
        change_pct_24h: 0,
        source:         'frankfurter-prev-close',
        fetched_at:     now.toISOString(),
        expires_at:     expiresAt.toISOString(),
      },
      { onConflict: 'key' }
    ).then(({ error }) => {
      if (error) console.warn('[gold-oracle] PrevClose cache write error:', error.message);
      else console.log(`[gold-oracle] PrevClose cached for ${PREV_CLOSE_TTL_SEC}s`);
    });
    return prevClose;
  } catch (e) {
    clearTimeout(timer);
    console.warn('[gold-oracle] fetchYesterdayClose failed:', (e as Error).message);
    return null;
  }
}

// ── Generic fetch helper with timeout ────────────────────────────────────────
async function tryFetch(url: string, headers: Record<string, string> = {}, timeoutMs = 8_000): Promise<any> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── External price fetch (parallel race — first valid result wins) ───────────
async function fetchGoldPriceExternal(): Promise<{
  price: number;
  change: number;
  changePct: number;
  source: string;
}> {
  type GoldResult = { price: number; change: number; changePct: number; source: string };

  // Helper: wrap each source so it resolves to null on failure
  async function trySource(fn: () => Promise<GoldResult | null>): Promise<GoldResult | null> {
    try { return await fn(); } catch { return null; }
  }

  const apiKey  = Deno.env.get('COINGECKO_API_KEY');
  const baseUrl = apiKey
    ? 'https://pro-api.coingecko.com/api/v3'
    : 'https://api.coingecko.com/api/v3';
  const cgHdrs: Record<string, string> = {};
  if (apiKey) cgHdrs['x-cg-pro-api-key'] = apiKey;

  const sources: Promise<GoldResult | null>[] = [
    // Source 1: BullionVault gold price API — free, professional wholesale prices
    // Returns: { "status": { "price": { "USD": { "bid": 4329.45 } } } }
    trySource(async () => {
      const data = await tryFetch(
        'https://gold.api.bullionvault.com/gold-price-service.do?considerationCurrency=USD&securityClassNarrative=GOLD',
        { 'Accept': 'application/json', 'User-Agent': 'BTNG-Gold-Oracle/1.0' },
        6_000
      );
      const priceData = data?.status?.price?.USD;
      const price = priceData?.bid ?? priceData?.ask;
      if (typeof price === 'number' && price > 500) {
        // BullionVault returns price per troy oz in USD
        console.log(`[gold-oracle] BullionVault XAU/USD: $${price}`);
        return { price, change: 0, changePct: 0, source: 'bullionvault.com' };
      }
      return null;
    }),
    // Source 2: Frankfurter API — free, no key, supports XAU natively
    // Returns: { "rates": { "USD": 4329.45 }, "base": "XAU" }
    trySource(async () => {
      const data = await tryFetch(
        'https://api.frankfurter.app/latest?from=XAU&to=USD',
        { 'Accept': 'application/json' },
        6_000
      );
      const price = data?.rates?.USD;
      if (typeof price === 'number' && price > 500) {
        console.log(`[gold-oracle] Frankfurter XAU/USD: $${price}`);
        return { price, change: 0, changePct: 0, source: 'frankfurter.app' };
      }
      return null;
    }),
    // Source 3: fawazahmed0 CDN currency API — LIVE @latest endpoint (always today's price)
    // Returns: { "xau": { "usd": 4329.45 } }
    trySource(async () => {
      const data = await tryFetch(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.min.json',
        { 'Cache-Control': 'no-cache, no-store' },
        7_000
      );
      const price = data?.xau?.usd;
      // Accept only prices in realistic gold range (not stale/wrong values)
      if (typeof price === 'number' && price > 4_000 && price < 6_000) {
        console.log(`[gold-oracle] fawazahmed0 CDN @latest XAU/USD: $${price}`);
        return { price, change: 0, changePct: 0, source: 'fawazahmed0-cdn' };
      }
      return null;
    }),
    // Source 4: fawazahmed0 raw GitHub endpoint (bypass CDN cache) — today's dated endpoint
    trySource(async () => {
      const today = new Date().toISOString().split('T')[0];
      const data  = await tryFetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${today}/v1/currencies/xau.min.json`,
        { 'Cache-Control': 'no-cache, no-store' },
        7_000
      );
      const price = data?.xau?.usd;
      // Validate: must be in realistic 2026 gold price range
      if (typeof price === 'number' && price > 4_000 && price < 6_000) {
        console.log(`[gold-oracle] fawazahmed0 dated CDN XAU/USD: $${price}`);
        return { price, change: 0, changePct: 0, source: 'fawazahmed0-cdn-dated' };
      }
      return null;
    }),
    // Source 5: ExchangeRate-API XAU (free, no key)
    trySource(async () => {
      const data      = await tryFetch('https://open.er-api.com/v6/latest/XAU', {}, 6_000);
      const usdPerXau = data?.rates?.USD;
      if (typeof usdPerXau === 'number' && usdPerXau > 500) {
        console.log(`[gold-oracle] open.er-api XAU: $${usdPerXau}`);
        return { price: usdPerXau, change: 0, changePct: 0, source: 'er-api.com' };
      }
      return null;
    }),
    // Source 6: CoinGecko PAXG (with proper headers to avoid 400)
    trySource(async () => {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'BTNG-Gold-Oracle/1.0',
        ...cgHdrs,
      };
      const data      = await tryFetch(
        `${baseUrl}/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true`,
        headers, 6_000
      );
      const price     = data?.['pax-gold']?.usd;
      const changePct = data?.['pax-gold']?.usd_24h_change ?? 0;
      if (typeof price === 'number' && price > 500) {
        const change = price * (changePct / 100);
        console.log(`[gold-oracle] CoinGecko PAXG: $${price}`);
        return { price, change, changePct, source: `coingecko${apiKey ? '-pro' : ''}` };
      }
      return null;
    }),
  ];

  // Race all sources — return the first non-null result
  // allSettled so we wait for ALL to finish if none wins early
  const results = await Promise.allSettled(sources);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value !== null) {
      return r.value;
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  console.warn('[gold-oracle] All external sources failed — using fallback price');
  return {
    price:     FALLBACK_PRICE,
    change:    FALLBACK_CHANGE,
    changePct: FALLBACK_PCT,
    source:    'fallback',
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = getAdminClient();

    // BTNG unit conversion constants
    // 1 BTNGG = 1/1000 troy oz XAU
    // 1 BTNG-G = 1 gram XAU = 1/31.1035 troy oz
    // 1 BTNG-KG = 1 kg XAU = 32.1507 troy oz
    const BTNGG_OZ_FRACTION  = 1 / 1000;       // BTNGG: 1/1000 oz
    const TROY_OZ_TO_GRAM    = 31.1035;        // 1 troy oz = 31.1035 g
    const TROY_OZ_PER_KILO   = 32.1507;        // 1 kg = 32.1507 troy oz

    // ── 1. Try cache first ──────────────────────────────────────────────────
    const cached = await readCache(supabase);
    if (cached.hit) {
      return new Response(
        JSON.stringify({
          // XAU/USD spot price
          priceUSD:       cached.priceUSD,
          // Unit 1: BTNGG — 1/1000 troy oz gold
          priceBTNGG:     cached.priceUSD * BTNGG_OZ_FRACTION,
          // Unit 2: BTNG-G — per gram gold price (USD)
          pricePerGram:   cached.priceUSD / TROY_OZ_TO_GRAM,
          btngPerGram:    cached.priceUSD / TROY_OZ_TO_GRAM,
          // Unit 3: BTNG-KG — per kilogram gold price (USD)
          pricePerKilo:   cached.priceUSD * TROY_OZ_PER_KILO,
          // Derived helpers
          pricePerOz:     cached.priceUSD,
          change24h:      cached.change24h,
          changePct24h:   cached.changePct24h,
          source:         'cache',
          providerSource: cached.source,
          cachedAt:       cached.cachedAt,
          ts:             Date.now(),
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            // Tell edge CDN this response is fresh for up to 20s
            'Cache-Control': 'public, max-age=20',
            'X-Gold-Cache': 'HIT',
          },
        }
      );
    }

    // ── 2. Cache MISS — fetch current price AND yesterday's close in parallel ──
    console.log('[gold-oracle] Cache MISS — fetching from external sources…');
    const [spotResult, prevClose] = await Promise.all([
      fetchGoldPriceExternal(),
      fetchYesterdayClose(supabase),
    ]);
    const { price, source } = spotResult;
    // Compute real 24h change from yesterday's close if available
    let change    = spotResult.change;
    let changePct = spotResult.changePct;
    if (prevClose !== null && prevClose > 500 && price > 500) {
      const realChange    = price - prevClose;
      const realChangePct = (realChange / prevClose) * 100;
      change    = parseFloat(realChange.toFixed(4));
      changePct = parseFloat(realChangePct.toFixed(4));
      console.log(`[gold-oracle] Real 24h change: $${change} (${changePct.toFixed(3)}%) — today $${price} vs yesterday $${prevClose}`);
    }

    // ── 3. Write back to cache (fire-and-forget, don't await failure) ───────
    if (price > 0) {
      writeCache(supabase, price, change, changePct, source).catch(e =>
        console.warn('[gold-oracle] Background cache write failed:', e)
      );
    }

    // ── 4. Return fresh payload ─────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        // XAU/USD spot price
        priceUSD:       price,
        // Unit 1: BTNGG — 1/1000 troy oz gold
        priceBTNGG:     price * BTNGG_OZ_FRACTION,
        // Unit 2: BTNG-G — per gram gold price (USD)
        pricePerGram:   price / TROY_OZ_TO_GRAM,
        btngPerGram:    price / TROY_OZ_TO_GRAM,
        // Unit 3: BTNG-KG — per kilogram gold price (USD)
        pricePerKilo:   price * TROY_OZ_PER_KILO,
        // Derived helpers
        pricePerOz:     price,
        change24h:      change,
        changePct24h:   changePct,
        source:         source === 'fallback' ? 'fallback' : 'live',
        providerSource: source,
        cachedAt:       null,
        ts:             Date.now(),
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=25',
          'X-Gold-Cache': 'MISS',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gold-oracle] Unhandled error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
