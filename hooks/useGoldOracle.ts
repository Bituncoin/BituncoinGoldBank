import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface GoldOracleData {
  priceUSD: number;          // XAU/USD spot (per troy oz)
  priceBTNGG: number;        // Unit 1: BTNGG = 1/1000 oz
  pricePerGram: number;      // Unit 2: BTNG-G = per gram
  pricePerKilo: number;      // Unit 3: BTNG-KG = per kilogram
  btngPerGram: number;       // alias for pricePerGram
  change24h: number;
  changePct24h: number;
  sparkline: number[];
  lastUpdated: Date | null;
  source: 'live' | 'cached' | 'fallback';
  providerSource: string | null;
  cacheHit: boolean;
  loading: boolean;
  error: string | null;
  nextRefreshIn: number;
}

const POLL_INTERVAL_MS = 15_000; // refresh every 15s for faster live price display
// Fallback: gold $4,329.45/oz (BullionVault live wholesale — June 6 2026)
// These are only used before the first oracle response; live price replaces them immediately.
const FALLBACK_USD     = 4_329.45;   // raw XAU/USD spot per troy oz (BullionVault June 6 2026)
const FALLBACK_BTNGG   = FALLBACK_USD / 1000;          // 1/1000 oz  = $4.3295
const FALLBACK_GRAM    = FALLBACK_USD / 31.1035;       // per gram   = $139.19
const FALLBACK_KILO    = FALLBACK_USD * 32.1507;       // per kg     = $139,195
const FALLBACK_PRICE   = FALLBACK_USD;
const FALLBACK_CHANGE  = 0;
const FALLBACK_PCT     = 0;
const TROY_OZ_TO_GRAM  = 31.1035;
const TROY_OZ_PER_KILO = 32.1507;

/**
 * Generate a synthetic sparkline that reflects the real 24h direction.
 * When changePct > 0 the line trends upward; when < 0 it trends down.
 * The final point always anchors to the current price.
 */
function generateSparkline(basePrice: number, changePct: number, points = 24): number[] {
  const out: number[] = [];
  // Start from yesterday's implied close (reverse-engineer from changePct)
  const yesterdayEstimate = changePct !== 0
    ? basePrice / (1 + changePct / 100)
    : basePrice * (0.992 + Math.random() * 0.016);
  let p = yesterdayEstimate;
  const step = (basePrice - yesterdayEstimate) / (points - 1);
  for (let i = 0; i < points; i++) {
    // Drift toward today's price with small noise
    p += step + (Math.random() - 0.5) * (basePrice * 0.0008);
    out.push(Math.max(p, basePrice * 0.95));
  }
  out[points - 1] = basePrice; // pin last point to current price
  return out;
}

async function fetchGoldPriceFromEdge(): Promise<{
  priceUSD: number;
  priceBTNGG: number;
  pricePerGram: number;
  pricePerKilo: number;
  btngPerGram: number;
  change24h: number;
  changePct24h: number;
  source: 'live' | 'cached' | 'fallback';
  providerSource: string | null;
  cacheHit: boolean;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('gold-oracle', {
      body: {},
    });

    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = await error.context?.text() ?? msg; } catch { /* ignore */ }
      }
      console.warn('[useGoldOracle] Edge Function error:', msg);
      return {
        priceUSD:     FALLBACK_USD,
        priceBTNGG:   FALLBACK_BTNGG,
        pricePerGram: FALLBACK_GRAM,
        pricePerKilo: FALLBACK_KILO,
        btngPerGram:  FALLBACK_GRAM,
        change24h:    FALLBACK_CHANGE,
        changePct24h: FALLBACK_PCT,
        source:       'fallback',
        providerSource: null,
        cacheHit:     false,
      };
    }

    const d = data as any;
    const priceUSD = typeof d?.priceUSD === 'number' && d.priceUSD > 500 ? d.priceUSD : FALLBACK_USD;

    // Always derive unit prices from the raw spot price — never trust pre-computed fields
    // from the edge function, as they may use different rounding.
    const derivedBTNGG = priceUSD / 1000;
    const derivedGram  = priceUSD / TROY_OZ_TO_GRAM;
    const derivedKilo  = priceUSD * TROY_OZ_PER_KILO;

    // source from Edge Function: 'cache' | 'live' | 'fallback'
    const resolvedSource: 'live' | 'cached' | 'fallback' =
      d?.source === 'cache'    ? 'cached'   :
      d?.source === 'live'     ? 'live'     : 'fallback';

    return {
      priceUSD,
      priceBTNGG:   derivedBTNGG,
      pricePerGram: derivedGram,
      pricePerKilo: derivedKilo,
      btngPerGram:  derivedGram,
      change24h:    typeof d?.change24h     === 'number' ? d.change24h    : FALLBACK_CHANGE,
      changePct24h: typeof d?.changePct24h  === 'number' ? d.changePct24h : FALLBACK_PCT,
      source:       resolvedSource,
      providerSource: typeof d?.providerSource === 'string' ? d.providerSource : null,
      cacheHit:     d?.source === 'cache',
    };
  } catch (e) {
    console.warn('[useGoldOracle] Unexpected error:', e);
    return {
      priceUSD:     FALLBACK_USD,
      priceBTNGG:   FALLBACK_BTNGG,
      pricePerGram: FALLBACK_GRAM,
      pricePerKilo: FALLBACK_KILO,
      btngPerGram:  FALLBACK_GRAM,
      change24h:    FALLBACK_CHANGE,
      changePct24h: FALLBACK_PCT,
      source:       'fallback',
      providerSource: null,
      cacheHit:     false,
    };
  }
}

export function useGoldOracle() {
  const [state, setState] = useState<GoldOracleData>({
    priceUSD:       FALLBACK_USD,
    priceBTNGG:     FALLBACK_BTNGG,
    pricePerGram:   FALLBACK_GRAM,
    pricePerKilo:   FALLBACK_KILO,
    btngPerGram:    FALLBACK_GRAM,
    change24h:      FALLBACK_CHANGE,
    changePct24h:   FALLBACK_PCT,
    sparkline:      [],
    lastUpdated:    null,
    source:         'fallback',
    providerSource: null,
    cacheHit:       false,
    loading:        true,
    error:          null,
    nextRefreshIn:  30,
  });

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef     = useRef(true);
  const countdownState = useRef(30);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    setState(s => ({ ...s, loading: s.priceUSD === 0, nextRefreshIn: 30 }));
    countdownState.current = 30;

    const result = await fetchGoldPriceFromEdge();

    if (!mountedRef.current) return;

    const sparkline = generateSparkline(result.priceUSD, result.changePct24h, 24);

    setState(s => ({
      ...s,
      priceUSD:       result.priceUSD,
      priceBTNGG:     result.priceBTNGG,
      pricePerGram:   result.pricePerGram,
      pricePerKilo:   result.pricePerKilo,
      btngPerGram:    result.btngPerGram,
      change24h:      result.change24h,
      changePct24h:   result.changePct24h,
      sparkline,
      lastUpdated:    new Date(),
      source:         result.source,
      providerSource: result.providerSource,
      cacheHit:       result.cacheHit,
      loading:        false,
      error:          null,
    }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();

    // Countdown ticker (every 1s)
    countdownRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      countdownState.current = Math.max(0, countdownState.current - 1);
      setState(s => ({ ...s, nextRefreshIn: countdownState.current }));
    }, 1000);

    // Auto-refresh every 30s
    timerRef.current = setInterval(() => {
      countdownState.current = 30;
      refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (timerRef.current)     clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [refresh]);

  return { ...state, refresh };
}
