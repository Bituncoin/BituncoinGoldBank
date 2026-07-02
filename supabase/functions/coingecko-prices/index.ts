// Edge Function: coingecko-prices
// Fetches live crypto prices from CoinGecko API server-side.
// Supports Pro API keys, Demo API keys, and falls back to public endpoint.
// The COINGECKO_API_KEY is never exposed to the client.

import { corsHeaders } from '../_shared/cors.ts';

const CG_PRO_BASE  = 'https://pro-api.coingecko.com/api/v3';
const CG_FREE_BASE = 'https://api.coingecko.com/api/v3';

async function fetchPrices(
  idsParam: string,
  baseUrl: string,
  authHeaders: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: string }> {
  const url =
    `${baseUrl}/simple/price` +
    `?ids=${idsParam}` +
    `&vs_currencies=usd` +
    `&include_24hr_change=true` +
    `&include_24hr_vol=true` +
    `&include_24hr_high=true` +
    `&include_24hr_low=true` +
    `&precision=full`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...authHeaders },
      signal: controller.signal,
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ids } = (await req.json()) as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'ids array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiKey    = Deno.env.get('COINGECKO_API_KEY') ?? '';
    const idsParam  = ids.join(',');

    let raw: { ok: boolean; status: number; body: string } | null = null;
    let source = 'free';

    // ── Attempt 1: Pro API (Pro key → pro-api.coingecko.com) ────────────────
    if (apiKey) {
      console.log('[coingecko-prices] Trying Pro API…');
      raw = await fetchPrices(idsParam, CG_PRO_BASE, { 'x-cg-pro-api-key': apiKey });

      if (raw.ok) {
        source = 'pro';
        console.log('[coingecko-prices] Pro API OK');
      } else {
        console.warn(`[coingecko-prices] Pro API ${raw.status} — trying Demo header on free base…`);

        // ── Attempt 2: Demo key header on free endpoint ──────────────────────
        raw = await fetchPrices(idsParam, CG_FREE_BASE, { 'x-cg-demo-api-key': apiKey });

        if (raw.ok) {
          source = 'demo';
          console.log('[coingecko-prices] Demo API OK');
        } else {
          console.warn(`[coingecko-prices] Demo API ${raw.status} — trying unauthenticated free endpoint…`);

          // ── Attempt 3: Unauthenticated free endpoint (last resort) ─────────
          raw = await fetchPrices(idsParam, CG_FREE_BASE, {});
          source = 'free';
        }
      }
    } else {
      // No key configured — try unauthenticated free endpoint directly
      console.log('[coingecko-prices] No API key — using unauthenticated free endpoint');
      raw = await fetchPrices(idsParam, CG_FREE_BASE, {});
      source = 'free';
    }

    if (!raw || !raw.ok) {
      const status = raw?.status ?? 500;
      const body   = raw?.body ?? 'Unknown error';
      console.error(`[coingecko-prices] All attempts failed. Last status ${status}: ${body}`);
      return new Response(
        JSON.stringify({ error: `CoinGecko: ${status} ${body}` }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = JSON.parse(raw.body) as Record<string, Record<string, number>>;

    // Normalize response into flat structure
    const result: Record<string, {
      price:     number;
      change24h: number;
      high24h:   number;
      low24h:    number;
      volume24h: number;
    }> = {};

    for (const [cgId, entry] of Object.entries(data)) {
      if (entry?.usd !== undefined) {
        result[cgId] = {
          price:     entry.usd,
          change24h: entry.usd_24h_change     ?? 0,
          high24h:   entry.usd_24h_high       ?? (entry.usd * 1.02),
          low24h:    entry.usd_24h_low        ?? (entry.usd * 0.98),
          volume24h: entry.usd_24h_vol        ?? 0,
        };
      }
    }

    console.log(`[coingecko-prices] Returned ${Object.keys(result).length} prices (source: ${source})`);

    return new Response(
      JSON.stringify({ data: result, source, ts: Date.now() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[coingecko-prices] Unhandled error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
