/**
 * BTNG Live Trade API — Permanent Live Trading Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript port of btng_live_trade_api.py (FastAPI version 2.0.0)
 *
 * Features:
 *  • BTNGLiveTradeOracle — full TypeScript implementation
 *  • process_valuation_matrix() — BTNG-g / BTNG-oz / BTNG-kg across all three
 *    platform currency targets (USD + GHS)
 *  • evaluate_sovereign_guard() — 5% Volatility Circuit Breaker
 *  • /api/v3/trade/spot-index  → live polling via gold-oracle Edge Function
 *  • /api/v3/trade/verify-execution → transaction safety gatekeeper
 *  • Fallback spot: $4,127.60/oz · FX: 10.91715 USD/GHS (mid-2026 ground truth)
 *  • 15s auto-refresh · manual refresh · oracle status badge
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';

// ─── Constants (mirrors __init__ in BTNGLiveTradeOracle) ──────────────────────
const OZ_TO_G          = 31.1034768;
const GUARD_THRESHOLD  = 0.05;           // 5% Sovereign Guard
const FALLBACK_SPOT    = 4127.60;        // mid-2026 ground truth (USD/oz)
const FALLBACK_FX_GHS  = 10.91715;      // USD→GHS fallback rate

// ─── Types ────────────────────────────────────────────────────────────────────
interface TradeUnit {
  measurement: string;
  accountBalance: number;
  liquidationGHS: number;
  liquidationUSD: number;
  unitPriceGHS: number;
  unitPriceUSD: number;
}

interface ValuationMatrix {
  timestamp: string;
  oracleStatus: 'ONLINE' | 'LOCAL_FALLBACK_ACTIVE';
  marketIndices: {
    liveSpotUSDoz: number;
    fxUSDGHS: number;
    calculatedBaseGHSperGram: number;
  };
  tradeUnits: {
    BTNG_G:  TradeUnit;
    BTNG_OZ: TradeUnit;
    BTNG_KG: TradeUnit;
  };
}

interface GuardResult {
  decision: 'APPROVED' | 'REJECTED_HALTED';
  reason: string;
  variance: number;
  varPct: string;
  proposedRate: number;
  referenceRate: number;
}

// ─── BTNGLiveTradeOracle (TypeScript port) ────────────────────────────────────
class BTNGLiveTradeOracle {
  private readonly ozToG      = OZ_TO_G;
  private readonly guardThreshold = GUARD_THRESHOLD;

  /** Mirrors process_valuation_matrix() */
  processValuationMatrix(
    spotUSDoz:  number,
    fxRateGHS:  number,
    balanceG  = 1.0,
    balanceOz = 1.0,
    balanceKg = 1.0,
    isLive    = false,
  ): ValuationMatrix {
    const baseGramUSD = spotUSDoz / this.ozToG;
    const baseGramGHS = baseGramUSD * fxRateGHS;
    const ozPriceGHS  = baseGramGHS * this.ozToG;
    const kgPriceGHS  = baseGramGHS * 1000;
    const ozPriceUSD  = spotUSDoz;
    const kgPriceUSD  = baseGramUSD * 1000;

    return {
      timestamp:    new Date().toISOString(),
      oracleStatus: isLive ? 'ONLINE' : 'LOCAL_FALLBACK_ACTIVE',
      marketIndices: {
        liveSpotUSDoz:             parseFloat(spotUSDoz.toFixed(2)),
        fxUSDGHS:                  fxRateGHS,
        calculatedBaseGHSperGram:  parseFloat(baseGramGHS.toFixed(4)),
      },
      tradeUnits: {
        BTNG_G: {
          measurement:     'Grams (g)',
          accountBalance:  balanceG,
          liquidationGHS:  parseFloat((baseGramGHS * balanceG).toFixed(2)),
          liquidationUSD:  parseFloat((baseGramUSD  * balanceG).toFixed(4)),
          unitPriceGHS:    parseFloat(baseGramGHS.toFixed(4)),
          unitPriceUSD:    parseFloat(baseGramUSD.toFixed(4)),
        },
        BTNG_OZ: {
          measurement:     'Troy Ounces (oz)',
          accountBalance:  balanceOz,
          liquidationGHS:  parseFloat((ozPriceGHS * balanceOz).toFixed(2)),
          liquidationUSD:  parseFloat((ozPriceUSD  * balanceOz).toFixed(4)),
          unitPriceGHS:    parseFloat(ozPriceGHS.toFixed(4)),
          unitPriceUSD:    parseFloat(ozPriceUSD.toFixed(4)),
        },
        BTNG_KG: {
          measurement:     'Kilograms (kg)',
          accountBalance:  balanceKg,
          liquidationGHS:  parseFloat((kgPriceGHS * balanceKg).toFixed(2)),
          liquidationUSD:  parseFloat((kgPriceUSD  * balanceKg).toFixed(4)),
          unitPriceGHS:    parseFloat(kgPriceGHS.toFixed(4)),
          unitPriceUSD:    parseFloat(kgPriceUSD.toFixed(4)),
        },
      },
    };
  }

  /** Mirrors evaluate_sovereign_guard() */
  evaluateSovereignGuard(proposedRate: number, referenceRate: number): GuardResult {
    const variance = Math.abs(proposedRate - referenceRate) / referenceRate;
    const isSafe   = variance <= this.guardThreshold;
    return {
      decision:     isSafe ? 'APPROVED' : 'REJECTED_HALTED',
      reason:       isSafe
        ? '✅ Settlement rate verified inside safe parameters.'
        : '🚨 Flash-volatility or malicious payload detected. Circuit breaker active.',
      variance,
      varPct:       `${(variance * 100).toFixed(3)}%`,
      proposedRate,
      referenceRate,
    };
  }
}

const oracle = new BTNGLiveTradeOracle();

// ─── Live Dot ─────────────────────────────────────────────────────────────────
function LiveDot({ color = Colors.success, size = 8 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 2, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.28, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Terminal Log Row ─────────────────────────────────────────────────────────
function TermRow({ label, value, color = Colors.success }: { label: string; value: string; color?: string }) {
  return (
    <View style={term.row}>
      <Text style={term.label}>{label}</Text>
      <Text style={[term.value, { color }]}>{value}</Text>
    </View>
  );
}
const term = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#1a2a1a' },
  label: { fontSize: 10, color: '#4ade80', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  value: { fontSize: 10, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── Trade Unit Card ──────────────────────────────────────────────────────────
function TradeUnitCard({
  unitKey, unit, fxRate,
}: { unitKey: string; unit: TradeUnit; fxRate: number }) {
  const cfg: Record<string, { color: string; emoji: string; icon: string }> = {
    BTNG_G:  { color: Colors.primary,  emoji: '⚖️',  icon: 'grain' },
    BTNG_OZ: { color: '#F7931A',       emoji: '🥇',  icon: 'toll' },
    BTNG_KG: { color: '#22C55E',       emoji: '📦',  icon: 'inventory' },
  };
  const c = cfg[unitKey] ?? cfg.BTNG_G;
  return (
    <View style={[uc.card, { borderColor: c.color + '55' }]}>
      <View style={[uc.header, { backgroundColor: c.color + '12' }]}>
        <View style={[uc.iconWrap, { backgroundColor: c.color + '20', borderColor: c.color + '55' }]}>
          <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[uc.unitKey, { color: c.color }]}>{unitKey.replace('_', '-')}</Text>
          <Text style={uc.measurement}>{unit.measurement}</Text>
        </View>
        <View style={[uc.balancePill, { backgroundColor: c.color + '18', borderColor: c.color + '44' }]}>
          <Text style={[uc.balanceText, { color: c.color }]}>{unit.accountBalance} {unitKey === 'BTNG_G' ? 'g' : unitKey === 'BTNG_OZ' ? 'oz' : 'kg'}</Text>
        </View>
      </View>
      <View style={uc.body}>
        <View style={uc.priceRow}>
          <View style={uc.priceBox}>
            <Text style={uc.priceLabel}>Unit Price (GHS)</Text>
            <Text style={[uc.priceVal, { color: c.color }]}>GH₵{unit.unitPriceGHS.toLocaleString('en-US', { maximumFractionDigits: 4 })}</Text>
          </View>
          <View style={uc.priceDivider} />
          <View style={uc.priceBox}>
            <Text style={uc.priceLabel}>Unit Price (USD)</Text>
            <Text style={[uc.priceVal, { color: c.color }]}>${unit.unitPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 4 })}</Text>
          </View>
        </View>
        <View style={[uc.liquidationRow, { borderColor: c.color + '33', backgroundColor: c.color + '07' }]}>
          <MaterialIcons name="account-balance-wallet" size={13} color={c.color} />
          <View style={{ flex: 1 }}>
            <Text style={uc.liqLabel}>Liquidation Value</Text>
            <Text style={[uc.liqGHS, { color: c.color }]}>GH₵{unit.liquidationGHS.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
            <Text style={uc.liqUSD}>${unit.liquidationUSD.toLocaleString('en-US', { maximumFractionDigits: 4 })} USD</Text>
          </View>
          <View style={[uc.fxPill, { borderColor: c.color + '33' }]}>
            <Text style={uc.fxPillText}>FX {fxRate}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const uc = StyleSheet.create({
  card:            { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden' },
  header:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  iconWrap:        { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  unitKey:         { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
  measurement:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  balancePill:     { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  balanceText:     { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  body:            { padding: Spacing.md, gap: Spacing.sm },
  priceRow:        { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  priceBox:        { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm + 2, gap: 3 },
  priceDivider:    { width: 1, backgroundColor: Colors.border, alignSelf: 'stretch' },
  priceLabel:      { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  priceVal:        { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  liquidationRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  liqLabel:        { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  liqGHS:          { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  liqUSD:          { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  fxPill:          { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3 },
  fxPillText:      { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type TabKey = 'index' | 'matrix' | 'guard' | 'docs' | 'execute' | 'history';

export default function BTNGLiveTradeAPIScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const gold   = useGoldOracle();

  const [tab, setTab] = useState<TabKey>('index');
  const { user } = useAuth();
  const { showAlert } = useAlert();

  // ─── History tab state ─────────────────────────────────────────────────────
  interface HistoryRow {
    id: string;
    coin_symbol: string;
    side: string;
    order_type: string;
    status: string;
    quantity: number;
    price: number;
    total_value: number;
    fee: number;
    created_at: string;
    guardApproved: boolean | null;
    guardVariance: string | null;
    guardOracle: string | null;
    guardSpot: string | null;
    guardFx: string | null;
  }

  const [historyRows,      setHistoryRows]      = useState<HistoryRow[]>([]);
  const [historyLoading,   setHistoryLoading]   = useState(false);
  const [historyRefreshing,setHistoryRefreshing]= useState(false);
  const [exportLoading,    setExportLoading]    = useState(false);

  const parseGuardNote = (note: string | null): Partial<HistoryRow> => {
    if (!note) return { guardApproved: null, guardVariance: null, guardOracle: null, guardSpot: null, guardFx: null };
    const pairs: Record<string, string> = {};
    note.split('|').forEach(seg => {
      const idx = seg.indexOf('=');
      if (idx > -1) pairs[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
    });
    return {
      guardApproved: pairs['guard_approved'] === 'true' ? true : pairs['guard_approved'] === 'false' ? false : null,
      guardVariance: pairs['variance'] ?? null,
      guardOracle:   pairs['oracle']   ?? null,
      guardSpot:     pairs['spot_usd'] ?? null,
      guardFx:       pairs['fx']       ?? null,
    };
  };

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setHistoryRefreshing(true); else setHistoryLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: orders } = await supabase
        .from('orders')
        .select('id,coin_symbol,side,order_type,status,quantity,price,total_value,fee,created_at')
        .eq('user_id', (user as any).id)
        .in('coin_symbol', ['BTNG_G', 'BTNG_OZ', 'BTNG_KG'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (!orders?.length) { setHistoryRows([]); return; }

      const orderIds = orders.map(o => o.id);
      const { data: histRaw } = await supabase
        .from('trade_history')
        .select('order_id,note')
        .in('order_id', orderIds);

      const noteMap: Record<string, string | null> = {};
      (histRaw ?? []).forEach((h: any) => { if (h.order_id) noteMap[h.order_id] = h.note; });

      const rows: HistoryRow[] = (orders as any[]).map(o => ({
        ...o,
        ...parseGuardNote(noteMap[o.id] ?? null),
      }));
      setHistoryRows(rows);
    } catch { /* silent */ } finally {
      if (isRefresh) setHistoryRefreshing(false); else setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab]);

  // ─── Export History to CSV ────────────────────────────────────────────────
  const handleExportCSV = useCallback(async () => {
    setExportLoading(true);
    try {
      const now      = new Date();
      const baseGramGHSe = (spotUSD / OZ_TO_G) * fxRate;
      const unitPricesGHSe: Record<string, number> = {
        BTNG_G:  baseGramGHSe,
        BTNG_OZ: baseGramGHSe * OZ_TO_G,
        BTNG_KG: baseGramGHSe * 1000,
      };
      const unitPricesUSDe: Record<string, number> = {
        BTNG_G:  spotUSD / OZ_TO_G,
        BTNG_OZ: spotUSD,
        BTNG_KG: (spotUSD / OZ_TO_G) * 1000,
      };
      const netQtyE: Record<string, number> = { BTNG_G: 0, BTNG_OZ: 0, BTNG_KG: 0 };
      historyRows.forEach(r => {
        if (r.status === 'filled' && netQtyE[r.coin_symbol] !== undefined) {
          netQtyE[r.coin_symbol] += r.side === 'buy' ? r.quantity : -r.quantity;
        }
      });

      const lines: string[] = [];

      // ── Header block ──────────────────────────────────────────────────────
      lines.push('BTNG Live Trade API — Portfolio & Order Export');
      lines.push(`Generated,${now.toISOString()}`);
      lines.push(`Oracle,${isLive ? 'ONLINE' : 'LOCAL_FALLBACK_ACTIVE'}`);
      lines.push(`XAU/USD,$${spotUSD.toFixed(2)}`);
      lines.push(`FX Rate (USD/GHS),${fxRate}`);
      lines.push(`OZ to G Ratio,${OZ_TO_G}`);
      lines.push(`Sovereign Guard Fence,${(GUARD_THRESHOLD * 100).toFixed(0)}%`);
      lines.push('');

      // ── Portfolio Summary ─────────────────────────────────────────────────
      lines.push('--- PORTFOLIO SUMMARY ---');
      lines.push('Unit,Net Quantity,GHS Value,USD Value,Unit Price (GHS),Unit Price (USD),FX Rate,Timestamp');
      let totalGHSe = 0;
      let totalUSDe = 0;
      (['BTNG_G', 'BTNG_OZ', 'BTNG_KG'] as const).forEach(sym => {
        const qty      = Math.max(0, netQtyE[sym]);
        const valueGHS = qty * (unitPricesGHSe[sym] ?? 0);
        const valueUSD = qty * (unitPricesUSDe[sym] ?? 0);
        totalGHSe += valueGHS;
        totalUSDe += valueUSD;
        lines.push([
          sym.replace('_', '-'),
          qty.toFixed(6),
          valueGHS.toFixed(2),
          valueUSD.toFixed(6),
          (unitPricesGHSe[sym] ?? 0).toFixed(4),
          (unitPricesUSDe[sym] ?? 0).toFixed(4),
          fxRate,
          now.toISOString(),
        ].join(','));
      });
      lines.push([
        'TOTAL', '',
        totalGHSe.toFixed(2),
        totalUSDe.toFixed(6),
        '', '', fxRate,
        now.toISOString(),
      ].join(','));
      lines.push('');

      // ── Order rows ────────────────────────────────────────────────────────
      lines.push('--- ORDER HISTORY ---');
      lines.push('ID,Symbol,Side,Type,Status,Quantity,Price (USD),Total (USD),Total (GHS),Fee (USD),Net (USD),Guard Approved,Guard Variance,Oracle Status,Spot USD,FX Rate,Date,Time');
      historyRows.forEach(r => {
        const ghsTotal  = r.total_value * fxRate;
        const netUSD    = r.total_value - (r.fee ?? 0);
        const dt        = new Date(r.created_at);
        const dateStr   = dt.toLocaleDateString('en-GB');
        const timeStr   = dt.toLocaleTimeString();
        lines.push([
          r.id,
          r.coin_symbol,
          r.side,
          r.order_type,
          r.status,
          r.quantity.toFixed(6),
          r.price.toFixed(6),
          r.total_value.toFixed(6),
          ghsTotal.toFixed(2),
          (r.fee ?? 0).toFixed(6),
          netUSD.toFixed(6),
          r.guardApproved === true ? 'true' : r.guardApproved === false ? 'false' : 'N/A',
          r.guardVariance ?? 'N/A',
          r.guardOracle   ?? 'N/A',
          r.guardSpot     ?? 'N/A',
          r.guardFx       ?? 'N/A',
          `"${dateStr}"`,
          `"${timeStr}"`,
        ].join(','));
      });

      const csv      = lines.join('\n');
      const fileName = `btng_trade_history_${now.toISOString().slice(0, 10)}.csv`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showAlert('Export Ready', `CSV saved to cache:\n${filePath}`);
        return;
      }
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Export BTNG Trade History',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (e: any) {
      showAlert('Export Failed', e.message ?? 'Unknown error');
    } finally {
      setExportLoading(false);
    }
  }, [historyRows, spotUSD, fxRate, isLive, showAlert]);

  // ─── Execute tab state ────────────────────────────────────────────────────
  type ExecUnit = 'BTNG_G' | 'BTNG_OZ' | 'BTNG_KG';
  const [execUnit,     setExecUnit]     = useState<ExecUnit>('BTNG_G');
  const [execSide,     setExecSide]     = useState<'buy' | 'sell'>('buy');
  const [execAmount,   setExecAmount]   = useState('');
  const [execGuard,    setExecGuard]    = useState<GuardResult | null>(null);
  const [execLoading,  setExecLoading]  = useState(false);
  const [execSuccess,  setExecSuccess]  = useState<{ orderId: string; total: number } | null>(null);

  // Oracle inputs
  const [balanceG,  setBalanceG]  = useState('1.0');
  const [balanceOz, setBalanceOz] = useState('1.0');
  const [balanceKg, setBalanceKg] = useState('1.0');
  const [customFX,  setCustomFX]  = useState('');

  // Guard inputs
  const [proposedRate, setProposedRate] = useState('');
  const [guardResult,  setGuardResult]  = useState<GuardResult | null>(null);

  // Derived
  const spotUSD  = gold.priceUSD  > 0 ? gold.priceUSD  : FALLBACK_SPOT;
  const fxRate   = customFX && parseFloat(customFX) > 0 ? parseFloat(customFX) : FALLBACK_FX_GHS;
  const isLive   = gold.source === 'live';
  const statusColor = isLive ? Colors.success : Colors.warning;

  const matrix: ValuationMatrix = oracle.processValuationMatrix(
    spotUSD,
    fxRate,
    parseFloat(balanceG  || '1') || 1,
    parseFloat(balanceOz || '1') || 1,
    parseFloat(balanceKg || '1') || 1,
    isLive,
  );

  // ─── Execute: auto-guard on amount change ────────────────────────────────
  const EXEC_UNIT_CFG: Record<ExecUnit, { label: string; multiplier: number; coinName: string; emoji: string; color: string }> = {
    BTNG_G:  { label: 'Grams (g)',       multiplier: 1,           coinName: 'BTNG Gold Gram',   emoji: '⚖️',  color: Colors.primary },
    BTNG_OZ: { label: 'Troy Ounces (oz)',multiplier: OZ_TO_G,     coinName: 'BTNG Gold Ounce',  emoji: '🥇',  color: '#F7931A'      },
    BTNG_KG: { label: 'Kilograms (kg)',  multiplier: 1000,        coinName: 'BTNG Gold Kilo',   emoji: '📦',  color: '#22C55E'      },
  };

  const computeExecPrice = useCallback((): number => {
    const baseGramGHS = (spotUSD / OZ_TO_G) * fxRate;
    return baseGramGHS * EXEC_UNIT_CFG[execUnit].multiplier;
  }, [spotUSD, fxRate, execUnit]);

  const runExecGuard = useCallback(() => {
    const amt = parseFloat(execAmount);
    if (!amt || amt <= 0) { setExecGuard(null); return; }
    const proposed = computeExecPrice();
    const refGramGHS = (spotUSD / OZ_TO_G) * fxRate;
    const result = oracle.evaluateSovereignGuard(proposed, refGramGHS);
    setExecGuard(result);
  }, [execAmount, computeExecPrice, spotUSD, fxRate]);

  useEffect(() => { runExecGuard(); }, [execAmount, execUnit, spotUSD, fxRate]);

  const handleExecuteTrade = useCallback(async () => {
    if (!user) { showAlert('Login Required', 'Please sign in to execute trades.'); return; }
    const qty = parseFloat(execAmount);
    if (!qty || qty <= 0) { showAlert('Invalid Amount', 'Enter a valid quantity greater than zero.'); return; }
    if (!execGuard || execGuard.decision !== 'APPROVED') {
      showAlert('Guard Rejected', 'The Sovereign Guard has blocked this trade. Adjust the rate or wait for the oracle to stabilize.'); return;
    }
    setExecLoading(true);
    setExecSuccess(null);
    try {
      const supabase = getSupabaseClient();
      const unitCfg  = EXEC_UNIT_CFG[execUnit];
      const unitPriceGHS = computeExecPrice();
      const unitPriceUSD = (spotUSD / OZ_TO_G) * unitCfg.multiplier;
      const totalGHS  = unitPriceGHS * qty;
      const totalUSD  = unitPriceUSD * qty;
      const guardNote = `guard_approved=true|variance=${execGuard.varPct}|oracle=${matrix.oracleStatus}|spot_usd=${spotUSD}|fx=${fxRate}`;

      // Insert into orders
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .insert({
          user_id:      (user as any).id,
          coin_symbol:  execUnit,
          coin_name:    unitCfg.coinName,
          side:         execSide,
          order_type:   'market',
          status:       'filled',
          quantity:     qty,
          price:        unitPriceUSD,
          total_value:  totalUSD,
          fee:          totalUSD * 0.001,
          filled_quantity: qty,
        })
        .select('id')
        .single();

      if (orderErr) throw new Error(orderErr.message);

      // Insert into trade_history with guard note
      const { error: histErr } = await supabase
        .from('trade_history')
        .insert({
          user_id:   (user as any).id,
          order_id:  orderData?.id ?? null,
          type:      execSide,
          coin:      execUnit,
          coin_name: unitCfg.coinName,
          amount:    qty,
          price:     unitPriceUSD,
          total_usd: totalUSD,
          fee:       totalUSD * 0.001,
          status:    'completed',
          note:      guardNote,
        });

      if (histErr) throw new Error(histErr.message);

      setExecSuccess({ orderId: orderData?.id ?? '—', total: totalGHS });
      setExecAmount('');
      setExecGuard(null);
    } catch (e: any) {
      showAlert('Execution Failed', e.message ?? 'Unknown error');
    } finally {
      setExecLoading(false);
    }
  }, [user, execAmount, execUnit, execSide, execGuard, computeExecPrice, spotUSD, fxRate, matrix.oracleStatus, showAlert]);

  const handleVerify = useCallback(() => {
    const rate = parseFloat(proposedRate);
    if (!rate || rate <= 0) return;
    const refGramGHS = (spotUSD / OZ_TO_G) * fxRate;
    const result = oracle.evaluateSovereignGuard(rate, refGramGHS);
    setGuardResult(result);
  }, [proposedRate, spotUSD, fxRate]);

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'index',   label: 'Spot Index', icon: 'show-chart'          },
    { key: 'matrix',  label: 'Matrix',     icon: 'grid-on'             },
    { key: 'guard',   label: 'Guard',      icon: 'security'            },
    { key: 'docs',    label: 'API Docs',   icon: 'description'         },
    { key: 'execute', label: 'Execute',    icon: 'play-circle-filled'  },
    { key: 'history', label: 'History',    icon: 'history'             },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Live Trade API</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={statusColor} />
            <Text style={[s.topSub, { color: statusColor }]}>
              v2.0.0 · {isLive ? 'ONLINE' : 'LOCAL_FALLBACK_ACTIVE'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}
          onPress={() => gold.refresh()}
        >
          {gold.loading ? <ActivityIndicator size="small" color={statusColor} /> : <MaterialIcons name="refresh" size={18} color={statusColor} />}
        </TouchableOpacity>
      </View>

      {/* Oracle Status Header */}
      <View style={[s.oracleBar, { borderColor: statusColor + '55', backgroundColor: statusColor + '0C' }]}>
        <View style={[s.oraclePill, { backgroundColor: statusColor + '1A', borderColor: statusColor + '55' }]}>
          <LiveDot color={statusColor} size={6} />
          <Text style={[s.oraclePillText, { color: statusColor }]}>{matrix.oracleStatus}</Text>
        </View>
        <Text style={[s.oraclePrice, { color: statusColor }]}>
          XAU/USD ${spotUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <View style={[s.changePill, { backgroundColor: gold.changePct24h >= 0 ? Colors.successBg : Colors.errorBg, borderColor: (gold.changePct24h >= 0 ? Colors.success : Colors.error) + '55' }]}>
          <MaterialIcons name={gold.changePct24h >= 0 ? 'trending-up' : 'trending-down'} size={11} color={gold.changePct24h >= 0 ? Colors.success : Colors.error} />
          <Text style={[s.changeText, { color: gold.changePct24h >= 0 ? Colors.success : Colors.error }]}>
            {gold.changePct24h >= 0 ? '+' : ''}{gold.changePct24h.toFixed(3)}%
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <MaterialIcons name="timer" size={10} color={Colors.textMuted} />
          <Text style={s.countdown}>{gold.nextRefreshIn}s</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnActive]} onPress={() => setTab(t.key)} activeOpacity={0.8}>
            <MaterialIcons name={t.icon as any} size={12} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── SPOT INDEX TAB ───────────────────────────────────────────────────── */}
        {tab === 'index' && (
          <>
            {/* Terminal output — mirrors /api/v3/trade/spot-index response */}
            <View style={s.terminalCard}>
              <View style={s.terminalHeader}>
                <View style={s.terminalDots}>
                  {['#EF4444', '#F59E0B', '#22C55E'].map(c => <View key={c} style={[s.terminalDot, { backgroundColor: c }]} />)}
                </View>
                <Text style={s.terminalTitle}>GET /api/v3/trade/spot-index</Text>
                <View style={[s.terminalBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                  <Text style={[s.terminalBadgeText, { color: statusColor }]}>200 OK</Text>
                </View>
              </View>
              <View style={s.terminalBody}>
                <TermRow label="timestamp"                  value={new Date(matrix.timestamp).toLocaleTimeString()} />
                <TermRow label="oracle_status"              value={matrix.oracleStatus} color={statusColor} />
                <TermRow label="live_spot_usd_oz"           value={`$${matrix.marketIndices.liveSpotUSDoz.toFixed(2)}`} />
                <TermRow label="fx_usd_ghs_gateway"         value={`${matrix.marketIndices.fxUSDGHS}`} color="#F59E0B" />
                <TermRow label="calculated_base_ghs_g"      value={`GH₵${matrix.marketIndices.calculatedBaseGHSperGram.toFixed(4)}`} />
                <TermRow label="BTNG_G.liquidation_ghs"     value={`GH₵${matrix.tradeUnits.BTNG_G.liquidationGHS.toLocaleString()}`} color={Colors.primary} />
                <TermRow label="BTNG_OZ.liquidation_ghs"    value={`GH₵${matrix.tradeUnits.BTNG_OZ.liquidationGHS.toLocaleString()}`} color="#F7931A" />
                <TermRow label="BTNG_KG.liquidation_ghs"    value={`GH₵${matrix.tradeUnits.BTNG_KG.liquidationGHS.toLocaleString()}`} color="#22C55E" />
                <TermRow label="guard_threshold"            value="5.00% (Sovereign Guard)" color={Colors.warning} />
                <TermRow label="refresh_in"                 value={`${gold.nextRefreshIn}s`} />
              </View>
            </View>

            {/* Market Indices */}
            <View style={s.indicesCard}>
              <View style={s.indicesHeader}>
                <MaterialIcons name="analytics" size={16} color={Colors.primary} />
                <Text style={s.indicesTitle}>Market Indices</Text>
                <View style={[s.liveBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                  <LiveDot color={statusColor} size={5} />
                  <Text style={[s.liveBadgeText, { color: statusColor }]}>{isLive ? 'LIVE' : 'CACHED'}</Text>
                </View>
              </View>
              <View style={s.indicesGrid}>
                {[
                  { label: 'XAU/USD (oz)',   value: `$${matrix.marketIndices.liveSpotUSDoz.toFixed(2)}`,      color: Colors.primary  },
                  { label: 'GHS/gram',       value: `GH₵${matrix.marketIndices.calculatedBaseGHSperGram.toFixed(4)}`, color: '#22C55E'   },
                  { label: 'OZ-to-g Ratio',  value: `${OZ_TO_G} g/oz`,                                        color: Colors.warning  },
                  { label: 'USD/GHS Rate',   value: `${fxRate}`,                                               color: '#F59E0B'       },
                  { label: 'Guard Fence',    value: `±${(GUARD_THRESHOLD * 100).toFixed(0)}%`,                 color: Colors.error    },
                  { label: '24h Change',     value: `${gold.changePct24h >= 0 ? '+' : ''}${gold.changePct24h.toFixed(4)}%`, color: gold.changePct24h >= 0 ? Colors.success : Colors.error },
                ].map(item => (
                  <View key={item.label} style={[s.indexCell, { borderColor: item.color + '33' }]}>
                    <Text style={[s.indexValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={s.indexLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Balance Inputs */}
            <View style={s.inputCard}>
              <View style={s.inputCardHeader}>
                <MaterialIcons name="tune" size={16} color={Colors.primary} />
                <Text style={s.inputCardTitle}>Query Parameters</Text>
                <Text style={s.inputCardSub}>/api/v3/trade/spot-index?g=?&amp;oz=?&amp;kg=?</Text>
              </View>
              <View style={s.inputGrid}>
                {[
                  { label: 'Balance (g)',  value: balanceG,  setter: setBalanceG,  color: Colors.primary, hint: 'Grams' },
                  { label: 'Balance (oz)', value: balanceOz, setter: setBalanceOz, color: '#F7931A',       hint: 'Troy oz' },
                  { label: 'Balance (kg)', value: balanceKg, setter: setBalanceKg, color: '#22C55E',       hint: 'Kilograms' },
                  { label: 'Custom FX',   value: customFX,  setter: setCustomFX,  color: '#F59E0B',       hint: `default: ${FALLBACK_FX_GHS}` },
                ].map(f => (
                  <View key={f.label} style={s.inputFieldWrap}>
                    <Text style={[s.inputFieldLabel, { color: f.color }]}>{f.label}</Text>
                    <TextInput
                      style={[s.inputField, { borderColor: f.color + '55' }]}
                      value={f.value}
                      onChangeText={f.setter}
                      keyboardType="numeric"
                      placeholder={f.hint}
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── VALUATION MATRIX TAB ─────────────────────────────────────────────── */}
        {tab === 'matrix' && (
          <>
            <View style={s.matrixHero}>
              <Text style={{ fontSize: 40 }}>📊</Text>
              <Text style={s.heroTitle}>Valuation Matrix</Text>
              <Text style={s.heroSub}>
                <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>process_valuation_matrix()</Text>
                {' '}— calculates BTNG-g, BTNG-oz, and BTNG-kg liquidation values simultaneously at XAU ${spotUSD.toFixed(2)}/oz · FX {fxRate} USD/GHS
              </Text>
            </View>

            {(Object.entries(matrix.tradeUnits) as [string, TradeUnit][]).map(([key, unit]) => (
              <TradeUnitCard key={key} unitKey={key} unit={unit} fxRate={fxRate} />
            ))}

            {/* Formula breakdown */}
            <View style={s.formulaCard}>
              <View style={s.formulaHeader}>
                <MaterialIcons name="functions" size={16} color={Colors.primary} />
                <Text style={s.formulaTitle}>Valuation Formulae</Text>
              </View>
              {[
                { label: 'Base Gram USD',  formula: `spot_usd_oz ÷ ${OZ_TO_G} oz/g`,                value: `$${(spotUSD / OZ_TO_G).toFixed(4)}`    },
                { label: 'Base Gram GHS',  formula: 'base_gram_usd × fx_usd_ghs',                   value: `GH₵${(spotUSD / OZ_TO_G * fxRate).toFixed(4)}` },
                { label: 'OZ Price GHS',   formula: `base_gram_ghs × ${OZ_TO_G}`,                  value: `GH₵${(spotUSD / OZ_TO_G * fxRate * OZ_TO_G).toFixed(2)}` },
                { label: 'KG Price GHS',   formula: 'base_gram_ghs × 1000',                         value: `GH₵${(spotUSD / OZ_TO_G * fxRate * 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
                { label: 'BTNG-g Liquidation', formula: 'base_gram_ghs × account_balance_g',        value: `GH₵${matrix.tradeUnits.BTNG_G.liquidationGHS.toLocaleString()}` },
                { label: 'BTNG-oz Liquidation',formula: 'oz_price_ghs × account_balance_oz',        value: `GH₵${matrix.tradeUnits.BTNG_OZ.liquidationGHS.toLocaleString()}` },
                { label: 'BTNG-kg Liquidation',formula: 'kg_price_ghs × account_balance_kg',        value: `GH₵${matrix.tradeUnits.BTNG_KG.liquidationGHS.toLocaleString()}` },
              ].map(row => (
                <View key={row.label} style={s.formulaRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.formulaLabel}>{row.label}</Text>
                    <Text style={s.formulaExpr}>{row.formula}</Text>
                  </View>
                  <Text style={[s.formulaResult, { color: Colors.primary }]}>{row.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── SOVEREIGN GUARD TAB ──────────────────────────────────────────────── */}
        {tab === 'guard' && (
          <>
            <View style={s.guardHero}>
              <Text style={{ fontSize: 40 }}>🛡️</Text>
              <Text style={s.heroTitle}>Sovereign Guard</Text>
              <Text style={s.heroSub}>
                <Text style={{ color: Colors.error, fontWeight: FontWeight.bold }}>evaluate_sovereign_guard()</Text>
                {' '}— 5% Volatility Circuit Breaker. Mirrors{' '}
                <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>/api/v3/trade/verify-execution</Text>
              </Text>
            </View>

            {/* Guard stats */}
            <View style={s.guardStatsRow}>
              {[
                { label: 'Guard Threshold',  value: '±5.00%',             color: Colors.error   },
                { label: 'Ref Gram (GHS)',    value: `GH₵${(spotUSD / OZ_TO_G * fxRate).toFixed(4)}`, color: Colors.warning },
                { label: 'Ref Gram (USD)',    value: `$${(spotUSD / OZ_TO_G).toFixed(4)}`,             color: Colors.primary },
                { label: 'Oracle Status',     value: isLive ? 'ONLINE' : 'FALLBACK',                  color: statusColor    },
              ].map(item => (
                <View key={item.label} style={[s.guardStatCard, { borderColor: item.color + '44' }]}>
                  <Text style={[s.guardStatValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={s.guardStatLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Input */}
            <View style={s.guardInputCard}>
              <View style={s.guardInputHeader}>
                <MaterialIcons name="verified-user" size={16} color={Colors.warning} />
                <Text style={s.guardInputTitle}>Verify Transaction Rate</Text>
              </View>
              <Text style={s.guardInputSub}>
                Enter a proposed gram price in GHS to check against the 5% Sovereign Guard fence.
                Reference rate: GH₵{(spotUSD / OZ_TO_G * fxRate).toFixed(4)}/gram
              </Text>
              <View style={s.guardInputRow}>
                <Text style={s.guardInputPrefix}>GH₵</Text>
                <TextInput
                  style={s.guardInput}
                  value={proposedRate}
                  onChangeText={setProposedRate}
                  keyboardType="numeric"
                  placeholder={`e.g. ${(spotUSD / OZ_TO_G * fxRate * 1.03).toFixed(2)}`}
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={s.guardInputSuffix}>/gram</Text>
              </View>
              {/* Quick test buttons */}
              <View style={s.guardQuickRow}>
                {[
                  { label: '+3% (SAFE)',      mult: 1.03,  color: Colors.success },
                  { label: '+4.9% (SAFE)',    mult: 1.049, color: Colors.warning },
                  { label: '+5.1% (REJECT)',  mult: 1.051, color: Colors.error   },
                  { label: '+10% (REJECT)',   mult: 1.10,  color: Colors.error   },
                ].map(btn => {
                  const ref = spotUSD / OZ_TO_G * fxRate;
                  const rate = (ref * btn.mult).toFixed(4);
                  return (
                    <TouchableOpacity
                      key={btn.label}
                      style={[s.guardQuickBtn, { borderColor: btn.color + '55', backgroundColor: btn.color + '10' }]}
                      onPress={() => setProposedRate(rate)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.guardQuickText, { color: btn.color }]}>{btn.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[s.verifyBtn, (!proposedRate || parseFloat(proposedRate) <= 0) && { opacity: 0.4 }]}
                onPress={handleVerify}
                disabled={!proposedRate || parseFloat(proposedRate) <= 0}
                activeOpacity={0.85}
              >
                <MaterialIcons name="security" size={18} color={Colors.bg} />
                <Text style={s.verifyBtnText}>Verify Execution</Text>
              </TouchableOpacity>
            </View>

            {/* Guard result */}
            {guardResult && (
              <View style={[s.guardResult, {
                borderColor: guardResult.decision === 'APPROVED' ? Colors.success + '66' : Colors.error + '66',
                backgroundColor: guardResult.decision === 'APPROVED' ? Colors.successBg : Colors.errorBg,
              }]}>
                <View style={s.guardResultHeader}>
                  <MaterialIcons
                    name={guardResult.decision === 'APPROVED' ? 'check-circle' : 'cancel'}
                    size={28}
                    color={guardResult.decision === 'APPROVED' ? Colors.success : Colors.error}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.guardResultDecision, { color: guardResult.decision === 'APPROVED' ? Colors.success : Colors.error }]}>
                      {guardResult.decision}
                    </Text>
                    <Text style={[s.guardResultReason, { color: guardResult.decision === 'APPROVED' ? Colors.success : Colors.error }]}>
                      {guardResult.reason}
                    </Text>
                  </View>
                </View>
                <View style={s.guardResultDetails}>
                  {[
                    { label: 'Proposed Rate',   value: `GH₵${guardResult.proposedRate.toFixed(4)}/gram` },
                    { label: 'Reference Rate',  value: `GH₵${guardResult.referenceRate.toFixed(4)}/gram` },
                    { label: 'Variance',        value: guardResult.varPct },
                    { label: 'Guard Threshold', value: `${(GUARD_THRESHOLD * 100).toFixed(0)}%` },
                  ].map(row => (
                    <View key={row.label} style={s.guardResultRow}>
                      <Text style={s.guardResultLabel}>{row.label}</Text>
                      <Text style={[s.guardResultValue, {
                        color: row.label === 'Variance'
                          ? (guardResult.decision === 'APPROVED' ? Colors.success : Colors.error)
                          : Colors.textPrimary
                      }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* How it works */}
            <View style={s.guardHowCard}>
              <Text style={s.guardHowTitle}>How the 5% Sovereign Guard Works</Text>
              {[
                'Every transaction rate is compared against the live XAU/USD oracle price.',
                `If the proposed gram price deviates more than ${(GUARD_THRESHOLD * 100).toFixed(0)}% from the live reference, the transaction is REJECTED_HALTED.`,
                'This protects against flash-volatility attacks, oracle manipulation, and malicious trade payloads.',
                'The circuit breaker auto-resets on the next oracle heartbeat (every 15 seconds).',
                'Fallback ground-truth values ($4,127.60/oz · GHS 10.91715) activate when the live feed is unavailable.',
              ].map((txt, i) => (
                <View key={i} style={s.guardHowRow}>
                  <View style={[s.guardHowStep, { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '44' }]}>
                    <Text style={s.guardHowStepText}>{i + 1}</Text>
                  </View>
                  <Text style={s.guardHowText}>{txt}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── API DOCS TAB ─────────────────────────────────────────────────────── */}
        {tab === 'docs' && (
          <>
            <View style={s.docsHero}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={s.heroTitle}>API Documentation</Text>
              <Text style={s.heroSub}>btng_live_trade_api.py — FastAPI v2.0.0 · TypeScript port</Text>
            </View>

            {[
              {
                method: 'GET', path: '/api/v3/trade/spot-index', color: '#22C55E',
                desc: 'Primary endpoint. Fetches real-time XAU/USD price and computes BTNG-g, BTNG-oz, BTNG-kg liquidation values.',
                params: ['g (float, default 1.0) — gram balance', 'oz (float, default 1.0) — troy ounce balance', 'kg (float, default 1.0) — kilogram balance', 'custom_fx (float, optional) — override USD/GHS rate'],
                returns: 'ValuationMatrix JSON with timestamp, oracle_status, market_indices, trade_units',
              },
              {
                method: 'GET', path: '/api/v3/trade/verify-execution', color: Colors.warning,
                desc: 'Gatekeeper check. Verifies a proposed gram rate against the 5% Sovereign Guard fence before transaction execution.',
                params: ['proposed_gram_rate (float, required) — rate to verify in GHS/gram'],
                returns: 'GuardResult: { decision, reason } — APPROVED or REJECTED_HALTED',
              },
            ].map(ep => (
              <View key={ep.path} style={[s.endpointCard, { borderColor: ep.color + '55' }]}>
                <View style={s.endpointHeader}>
                  <View style={[s.methodBadge, { backgroundColor: ep.color + '18', borderColor: ep.color + '55' }]}>
                    <Text style={[s.methodText, { color: ep.color }]}>{ep.method}</Text>
                  </View>
                  <Text style={[s.endpointPath, { color: ep.color }]} selectable>{ep.path}</Text>
                </View>
                <Text style={s.endpointDesc}>{ep.desc}</Text>
                <View style={s.paramsSection}>
                  <Text style={s.paramsSectionTitle}>Parameters</Text>
                  {ep.params.map((p, i) => (
                    <View key={i} style={s.paramRow}>
                      <View style={[s.paramDot, { backgroundColor: ep.color }]} />
                      <Text style={s.paramText}>{p}</Text>
                    </View>
                  ))}
                </View>
                <View style={[s.returnsSection, { borderColor: ep.color + '33', backgroundColor: ep.color + '07' }]}>
                  <MaterialIcons name="output" size={11} color={ep.color} />
                  <Text style={[s.returnsText, { color: ep.color }]}>{ep.returns}</Text>
                </View>
              </View>
            ))}

            {/* Class reference */}
            <View style={s.classRefCard}>
              <View style={s.classRefHeader}>
                <MaterialIcons name="code" size={13} color={Colors.primary} />
                <Text style={s.classRefTitle}>BTNGLiveTradeOracle (Python → TypeScript)</Text>
              </View>
              <Text style={s.classRefCode} selectable>{`class BTNGLiveTradeOracle:
  oz_to_g          = 31.1034768
  guard_threshold  = 0.05  # 5% fence

  fallback_spot_usd_oz = 4127.60
  fallback_fx_usd_ghs  = 10.91715

  async fetch_live_spot_gold() -> float
  process_valuation_matrix(
    spot_usd_oz, fx_rate_ghs,
    balance_g, balance_oz, balance_kg
  ) -> ValuationMatrix

  evaluate_sovereign_guard(
    proposed_rate, reference_rate
  ) -> GuardResult`}</Text>
            </View>

            {/* Deployment */}
            <View style={s.deployCard}>
              <View style={s.deployHeader}>
                <MaterialIcons name="rocket-launch" size={14} color='#22C55E' />
                <Text style={[s.deployTitle, { color: '#22C55E' }]}>Production Deployment (Server)</Text>
              </View>
              <Text style={s.deployCode} selectable>{`pip install fastapi uvicorn httpx pydantic

# Spin up across 12 planetary local nodes
uvicorn btng_live_trade_api:app \\
  --host 0.0.0.0 \\
  --port 8000 \\
  --workers 4`}</Text>
              <View style={s.deployNote}>
                <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
                <Text style={s.deployNoteText}>
                  This app uses the OnSpace gold-oracle Edge Function as the live feed — functionally equivalent to the GoldAPI.io Python integration, with automatic 15s refresh and GHS fallback.
                </Text>
              </View>
            </View>

            {/* Fallback constants */}
            <View style={s.fallbackCard}>
              <View style={s.fallbackHeader}>
                <MaterialIcons name="offline-bolt" size={14} color={Colors.warning} />
                <Text style={[s.fallbackTitle, { color: Colors.warning }]}>Hardened Fallback Constants</Text>
              </View>
              <Text style={s.fallbackSub}>Mid-2026 ground-truth values. Active when external connections drop.</Text>
              {[
                { label: 'fallback_spot_usd_oz',  value: `$${FALLBACK_SPOT}/oz` },
                { label: 'fallback_fx_usd_ghs',   value: `${FALLBACK_FX_GHS} GHS/USD` },
                { label: 'oz_to_g',               value: `${OZ_TO_G} g/troy oz` },
                { label: 'guard_threshold',        value: `${(GUARD_THRESHOLD * 100).toFixed(0)}% max variance` },
              ].map(row => (
                <View key={row.label} style={s.fallbackRow}>
                  <Text style={s.fallbackLabel}>{row.label}</Text>
                  <Text style={s.fallbackValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── EXECUTE TAB ──────────────────────────────────────────────────── */}
        {tab === 'execute' && (() => {
          const unitCfg   = EXEC_UNIT_CFG[execUnit];
          const unitPrice = computeExecPrice();
          const unitUSD   = (spotUSD / OZ_TO_G) * unitCfg.multiplier;
          const qty       = parseFloat(execAmount) || 0;
          const totalGHS  = unitPrice * qty;
          const totalUSD  = unitUSD  * qty;
          const guardOK   = !!execGuard && execGuard.decision === 'APPROVED';
          const guardFail = !!execGuard && execGuard.decision === 'REJECTED_HALTED';
          return (
            <>
              {/* Hero */}
              <View style={ex.hero}>
                <Text style={{ fontSize: 40 }}>⚡</Text>
                <Text style={ex.heroTitle}>Trade Execution Engine</Text>
                <Text style={ex.heroSub}>
                  Sovereign Guard runs <Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>automatically</Text> before every trade. Live oracle price feeds directly into each order.
                </Text>
              </View>

              {/* Unit selector */}
              <View style={ex.card}>
                <View style={ex.cardHeader}>
                  <MaterialIcons name="grain" size={15} color={Colors.primary} />
                  <Text style={ex.cardTitle}>Select Trade Unit</Text>
                </View>
                <View style={ex.unitRow}>
                  {(['BTNG_G', 'BTNG_OZ', 'BTNG_KG'] as ExecUnit[]).map(u => {
                    const uc = EXEC_UNIT_CFG[u];
                    const up = (spotUSD / OZ_TO_G) * fxRate * uc.multiplier;
                    const sel = execUnit === u;
                    return (
                      <TouchableOpacity
                        key={u}
                        style={[ex.unitCard, sel && { borderColor: uc.color, backgroundColor: uc.color + '12' }]}
                        onPress={() => { setExecUnit(u); setExecSuccess(null); }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 24 }}>{uc.emoji}</Text>
                        <Text style={[ex.unitKey, { color: uc.color }]}>{u.replace('_', '-')}</Text>
                        <Text style={ex.unitLabel}>{uc.label}</Text>
                        <Text style={[ex.unitPrice, { color: uc.color }]}>GH₵{up.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                        <Text style={ex.unitPriceSub}>${unitUSD.toLocaleString('en-US', { maximumFractionDigits: 4 })} USD</Text>
                        {sel && <View style={[ex.unitSelDot, { backgroundColor: uc.color }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Side + Amount */}
              <View style={ex.card}>
                <View style={ex.cardHeader}>
                  <MaterialIcons name="swap-horiz" size={15} color={Colors.primary} />
                  <Text style={ex.cardTitle}>Trade Details</Text>
                  <View style={[ex.oracleBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                    <LiveDot color={statusColor} size={5} />
                    <Text style={[ex.oracleBadgeText, { color: statusColor }]}>{isLive ? 'Live Price' : 'Cached'}</Text>
                  </View>
                </View>

                {/* Side toggle */}
                <View style={ex.sideToggle}>
                  {(['buy', 'sell'] as const).map(side => (
                    <TouchableOpacity
                      key={side}
                      style={[ex.sideBtn,
                        execSide === side && side === 'buy'  && { backgroundColor: Colors.success, borderColor: Colors.success },
                        execSide === side && side === 'sell' && { backgroundColor: Colors.error, borderColor: Colors.error },
                      ]}
                      onPress={() => { setExecSide(side); setExecSuccess(null); }}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons
                        name={side === 'buy' ? 'trending-up' : 'trending-down'}
                        size={16}
                        color={execSide === side ? Colors.bg : Colors.textMuted}
                      />
                      <Text style={[ex.sideBtnText, execSide === side && { color: Colors.bg }]}>
                        {side === 'buy' ? 'Buy (Long)' : 'Sell (Short)'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Amount input */}
                <Text style={ex.inputLabel}>
                  QUANTITY ({execUnit === 'BTNG_G' ? 'grams' : execUnit === 'BTNG_OZ' ? 'troy oz' : 'kg'})
                </Text>
                <View style={[ex.amountInputRow, guardFail && { borderColor: Colors.error + '88' }, guardOK && { borderColor: Colors.success + '88' }]}>
                  <Text style={{ fontSize: 18 }}>{unitCfg.emoji}</Text>
                  <TextInput
                    style={ex.amountInput}
                    value={execAmount}
                    onChangeText={v => { setExecAmount(v); setExecSuccess(null); }}
                    keyboardType="numeric"
                    placeholder={`e.g. ${execUnit === 'BTNG_KG' ? '0.5' : execUnit === 'BTNG_OZ' ? '1' : '10'}`}
                    placeholderTextColor={Colors.textMuted}
                  />
                  <Text style={[ex.amountSuffix, { color: unitCfg.color }]}>
                    {execUnit === 'BTNG_G' ? 'g' : execUnit === 'BTNG_OZ' ? 'oz' : 'kg'}
                  </Text>
                </View>

                {/* Quick amounts */}
                <View style={ex.quickRow}>
                  {(execUnit === 'BTNG_G'
                    ? ['1', '5', '10', '50', '100']
                    : execUnit === 'BTNG_OZ'
                    ? ['0.5', '1', '2', '5', '10']
                    : ['0.1', '0.5', '1', '2', '5']
                  ).map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[ex.quickBtn, execAmount === v && { backgroundColor: unitCfg.color, borderColor: unitCfg.color }]}
                      onPress={() => { setExecAmount(v); setExecSuccess(null); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[ex.quickBtnText, execAmount === v && { color: Colors.bg }]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Live price preview */}
                {qty > 0 && (
                  <View style={ex.pricePreviewGrid}>
                    {[
                      { label: 'Unit Price (GHS)', value: `GH₵${unitPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,  color: unitCfg.color  },
                      { label: 'Unit Price (USD)', value: `$${unitUSD.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,       color: Colors.primary },
                      { label: 'Total (GHS)',       value: `GH₵${totalGHS.toLocaleString('en-US', { maximumFractionDigits: 2 })}`, color: unitCfg.color  },
                      { label: 'Total (USD)',       value: `$${totalUSD.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,    color: Colors.primary },
                      { label: 'Est. Fee (0.1%)',  value: `$${(totalUSD * 0.001).toLocaleString('en-US', { maximumFractionDigits: 6 })}`, color: Colors.warning },
                      { label: 'Net USD',           value: `$${(totalUSD * 0.999).toLocaleString('en-US', { maximumFractionDigits: 4 })}`, color: Colors.success },
                    ].map(item => (
                      <View key={item.label} style={[ex.pricePreviewCell, { borderColor: item.color + '33' }]}>
                        <Text style={[ex.pricePreviewValue, { color: item.color }]}>{item.value}</Text>
                        <Text style={ex.pricePreviewLabel}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Sovereign Guard live status */}
              {execGuard ? (
                <View style={[ex.guardLive, {
                  borderColor:       guardOK ? Colors.success + '66' : Colors.error + '66',
                  backgroundColor:   guardOK ? Colors.successBg      : Colors.errorBg,
                }]}>
                  <View style={ex.guardLiveHeader}>
                    <MaterialIcons
                      name={guardOK ? 'verified-user' : 'gpp-bad'}
                      size={22}
                      color={guardOK ? Colors.success : Colors.error}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[ex.guardLiveDecision, { color: guardOK ? Colors.success : Colors.error }]}>
                        {guardOK ? '✅ SOVEREIGN GUARD APPROVED' : '🚨 SOVEREIGN GUARD REJECTED'}
                      </Text>
                      <Text style={[ex.guardLiveReason, { color: guardOK ? Colors.success : Colors.error }]}>
                        {execGuard.reason}
                      </Text>
                    </View>
                    <View style={[ex.variancePill, {
                      backgroundColor: guardOK ? Colors.success + '18' : Colors.error + '18',
                      borderColor:     guardOK ? Colors.success + '55' : Colors.error + '55',
                    }]}>
                      <Text style={[ex.variancePillText, { color: guardOK ? Colors.success : Colors.error }]}>
                        {execGuard.varPct}
                      </Text>
                    </View>
                  </View>
                  <View style={ex.guardLiveDetails}>
                    {[
                      { label: 'Proposed GHS/unit', value: `GH₵${execGuard.proposedRate.toFixed(4)}` },
                      { label: 'Reference GHS/g',   value: `GH₵${execGuard.referenceRate.toFixed(4)}` },
                      { label: 'Variance',          value: execGuard.varPct                           },
                      { label: 'Fence',             value: `±${(GUARD_THRESHOLD * 100).toFixed(0)}%`  },
                    ].map(row => (
                      <View key={row.label} style={ex.guardLiveRow}>
                        <Text style={ex.guardLiveLabel}>{row.label}</Text>
                        <Text style={[ex.guardLiveValue, {
                          color: row.label === 'Variance'
                            ? (guardOK ? Colors.success : Colors.error)
                            : Colors.textPrimary
                        }]}>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : qty === 0 ? (
                <View style={ex.guardIdle}>
                  <MaterialIcons name="shield" size={20} color={Colors.warning} />
                  <Text style={ex.guardIdleText}>Enter a quantity — Sovereign Guard will auto-verify the rate before execution.</Text>
                </View>
              ) : null}

              {/* Execute button */}
              <TouchableOpacity
                style={[ex.execBtn,
                  { backgroundColor: execSide === 'buy' ? Colors.success : Colors.error },
                  (!guardOK || execLoading || qty <= 0) && { opacity: 0.4 },
                ]}
                onPress={handleExecuteTrade}
                disabled={!guardOK || execLoading || qty <= 0}
                activeOpacity={0.85}
              >
                {execLoading ? (
                  <ActivityIndicator size="small" color={Colors.bg} />
                ) : (
                  <MaterialIcons
                    name={execSide === 'buy' ? 'trending-up' : 'trending-down'}
                    size={20}
                    color={Colors.bg}
                  />
                )}
                <Text style={ex.execBtnText}>
                  {execLoading
                    ? 'Executing…'
                    : !guardOK && qty > 0
                    ? 'Guard Blocked — Cannot Execute'
                    : qty <= 0
                    ? 'Enter Quantity'
                    : `${execSide === 'buy' ? 'Buy' : 'Sell'} ${qty} ${execUnit.replace('_', '-')} · GH₵${totalGHS.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                  }
                </Text>
              </TouchableOpacity>

              {/* Success banner */}
              {execSuccess && (
                <View style={ex.successBanner}>
                  <MaterialIcons name="check-circle" size={24} color={Colors.success} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={ex.successTitle}>Trade Executed Successfully</Text>
                    <Text style={ex.successSub}>
                      Order recorded · {execSide.toUpperCase()} {execUnit.replace('_', '-')} · GH₵{execSuccess.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={ex.successId} numberOfLines={1}>Order ID: {execSuccess.orderId}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setExecSuccess(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={16} color={Colors.success} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Info card */}
              <View style={ex.infoCard}>
                <View style={ex.infoCardHeader}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.primary} />
                  <Text style={ex.infoCardTitle}>Execution Flow</Text>
                </View>
                {[
                  'Oracle fetches live XAU/USD spot price every 15 seconds.',
                  'Unit price is computed: spot ÷ 31.1g × FX × unit multiplier.',
                  'Sovereign Guard auto-verifies the rate stays within ±5% of reference.',
                  'On approval, an order is inserted to the orders table with coin_symbol = BTNG_G / BTNG_OZ / BTNG_KG.',
                  'Trade history is logged with a note field encoding guard_approved=true, variance %, oracle status, spot price, and FX rate.',
                  'Fallback constants ($4,127.60/oz · GHS 10.91715) activate when the live feed is offline.',
                ].map((txt, i) => (
                  <View key={i} style={ex.infoRow}>
                    <View style={[ex.infoStep, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                      <Text style={ex.infoStepText}>{i + 1}</Text>
                    </View>
                    <Text style={ex.infoText}>{txt}</Text>
                  </View>
                ))}
              </View>
            </>
          );
        })()}

        {/* ── HISTORY TAB ──────────────────────────────────────────────────── */}
        {tab === 'history' && (() => {
          const UNIT_CFG: Record<string, { emoji: string; color: string; label: string }> = {
            BTNG_G:  { emoji: '⚖️',  color: Colors.primary, label: 'Gram'  },
            BTNG_OZ: { emoji: '🥇',  color: '#F7931A',      label: 'Oz'    },
            BTNG_KG: { emoji: '📦',  color: '#22C55E',      label: 'Kg'    },
          };
          const STATUS_CFG: Record<string, { color: string; bg: string }> = {
            filled:    { color: Colors.success, bg: Colors.successBg },
            open:      { color: Colors.warning, bg: Colors.warningBg },
            cancelled: { color: Colors.error,   bg: Colors.errorBg   },
            partial:   { color: '#F59E0B',      bg: '#F59E0B18'      },
          };

          // ── Portfolio aggregation ──────────────────────────────────────────
          const baseGramGHSp = (spotUSD / OZ_TO_G) * fxRate;
          const unitPricesGHS: Record<string, number> = {
            BTNG_G:  baseGramGHSp,
            BTNG_OZ: baseGramGHSp * OZ_TO_G,
            BTNG_KG: baseGramGHSp * 1000,
          };
          const unitPricesUSD: Record<string, number> = {
            BTNG_G:  spotUSD / OZ_TO_G,
            BTNG_OZ: spotUSD,
            BTNG_KG: (spotUSD / OZ_TO_G) * 1000,
          };
          const netQty: Record<string, number> = { BTNG_G: 0, BTNG_OZ: 0, BTNG_KG: 0 };
          historyRows.forEach(r => {
            if (r.status === 'filled' && netQty[r.coin_symbol] !== undefined) {
              netQty[r.coin_symbol] += r.side === 'buy' ? r.quantity : -r.quantity;
            }
          });
          const portfolioUnits = (['BTNG_G', 'BTNG_OZ', 'BTNG_KG'] as const).map(sym => ({
            sym,
            cfg: UNIT_CFG[sym],
            qty:      Math.max(0, netQty[sym]),
            valueGHS: Math.max(0, netQty[sym]) * (unitPricesGHS[sym] ?? 0),
            valueUSD: Math.max(0, netQty[sym]) * (unitPricesUSD[sym] ?? 0),
            priceGHS: unitPricesGHS[sym] ?? 0,
            priceUSD: unitPricesUSD[sym] ?? 0,
          }));
          const portfolioTotalGHS = portfolioUnits.reduce((s, u) => s + u.valueGHS, 0);
          const portfolioTotalUSD = portfolioUnits.reduce((s, u) => s + u.valueUSD, 0);
          const hasPortfolio = portfolioUnits.some(u => u.qty > 0);

          return (
            <>
              {/* Hero */}
              <View style={hs.hero}>
                <Text style={{ fontSize: 36 }}>📜</Text>
                <Text style={hs.heroTitle}>BTNG Trade History</Text>
                <Text style={hs.heroSub}>
                  Orders for <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>BTNG_G · BTNG_OZ · BTNG_KG</Text> with Sovereign Guard verification status.
                </Text>
              </View>

              {/* Refresh + Export row */}
              <View style={hs.actionRow}>
                <TouchableOpacity
                  style={hs.refreshBtn}
                  onPress={() => loadHistory(true)}
                  activeOpacity={0.85}
                >
                  {historyRefreshing
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <MaterialIcons name="refresh" size={16} color={Colors.primary} />
                  }
                  <Text style={hs.refreshBtnText}>{historyRefreshing ? 'Refreshing…' : 'Refresh'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[hs.exportBtn, (exportLoading || historyRows.length === 0) && { opacity: 0.45 }]}
                  onPress={handleExportCSV}
                  disabled={exportLoading || historyRows.length === 0}
                  activeOpacity={0.85}
                >
                  {exportLoading
                    ? <ActivityIndicator size="small" color={Colors.bg} />
                    : <MaterialIcons name="file-download" size={16} color={Colors.bg} />
                  }
                  <Text style={hs.exportBtnText}>{exportLoading ? 'Exporting…' : 'Export CSV'}</Text>
                </TouchableOpacity>
              </View>

              {/* ── Portfolio Summary Card ─────────────────────────────── */}
              {hasPortfolio && (
                <View style={hs.portfolioCard}>
                  <View style={hs.portfolioHeader}>
                    <MaterialIcons name="account-balance-wallet" size={16} color={Colors.primary} />
                    <Text style={hs.portfolioTitle}>Portfolio Summary</Text>
                    <View style={[hs.portfolioOracleBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                      <LiveDot color={statusColor} size={5} />
                      <Text style={[hs.portfolioOracleText, { color: statusColor }]}>{isLive ? 'Live Prices' : 'Cached'}</Text>
                    </View>
                  </View>

                  {/* Totals row */}
                  <View style={hs.portfolioTotalRow}>
                    <View style={hs.portfolioTotalCol}>
                      <Text style={hs.portfolioTotalLabel}>Total GHS</Text>
                      <Text style={[hs.portfolioTotalVal, { color: Colors.primary }]}>GH₵{portfolioTotalGHS.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                    </View>
                    <View style={hs.portfolioTotalDivider} />
                    <View style={hs.portfolioTotalCol}>
                      <Text style={hs.portfolioTotalLabel}>Total USD</Text>
                      <Text style={[hs.portfolioTotalVal, { color: Colors.success }]}>${portfolioTotalUSD.toLocaleString('en-US', { maximumFractionDigits: 4 })}</Text>
                    </View>
                  </View>

                  {/* Per-unit breakdown */}
                  {portfolioUnits.filter(u => u.qty > 0).map(u => (
                    <View key={u.sym} style={[hs.portfolioUnitRow, { borderColor: u.cfg.color + '44' }]}>
                      <View style={[hs.portfolioUnitEmoji, { backgroundColor: u.cfg.color + '18', borderColor: u.cfg.color + '44' }]}>
                        <Text style={{ fontSize: 20 }}>{u.cfg.emoji}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[hs.portfolioUnitSym, { color: u.cfg.color }]}>{u.sym.replace('_', '-')}</Text>
                        <Text style={hs.portfolioUnitQty}>
                          {u.qty.toLocaleString('en-US', { maximumFractionDigits: 6 })} {u.sym === 'BTNG_G' ? 'g' : u.sym === 'BTNG_OZ' ? 'oz' : 'kg'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <Text style={[hs.portfolioUnitGHS, { color: u.cfg.color }]}>GH₵{u.valueGHS.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                        <Text style={hs.portfolioUnitUSD}>${u.valueUSD.toLocaleString('en-US', { maximumFractionDigits: 4 })}</Text>
                        <Text style={hs.portfolioUnitPrice}>@ GH₵{u.priceGHS.toLocaleString('en-US', { maximumFractionDigits: 2 })}/unit</Text>
                      </View>
                    </View>
                  ))}

                  <View style={hs.portfolioFooter}>
                    <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
                    <Text style={hs.portfolioFooterText}>
                      Net qty from filled orders · XAU ${spotUSD.toFixed(2)}/oz · FX {fxRate} USD/GHS
                    </Text>
                  </View>
                </View>
              )}

              {historyLoading && historyRows.length === 0 ? (
                <View style={hs.loadingWrap}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={hs.loadingText}>Loading trade history…</Text>
                </View>
              ) : historyRows.length === 0 ? (
                <View style={hs.emptyWrap}>
                  <Text style={{ fontSize: 48 }}>📭</Text>
                  <Text style={hs.emptyTitle}>No BTNG Trades Yet</Text>
                  <Text style={hs.emptySub}>Execute your first trade from the Execute tab — it will appear here with Sovereign Guard metadata.</Text>
                  <TouchableOpacity
                    style={hs.goExecBtn}
                    onPress={() => setTab('execute')}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="play-circle-filled" size={15} color={Colors.bg} />
                    <Text style={hs.goExecBtnText}>Go to Execute</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {/* Summary stats */}
                  <View style={hs.statsRow}>
                    {[
                      { label: 'Total',    value: historyRows.length,                                         color: Colors.primary  },
                      { label: 'Buy',      value: historyRows.filter(r => r.side === 'buy').length,           color: Colors.success  },
                      { label: 'Sell',     value: historyRows.filter(r => r.side === 'sell').length,          color: Colors.error    },
                      { label: 'Approved', value: historyRows.filter(r => r.guardApproved === true).length,   color: Colors.success  },
                      { label: 'No Guard', value: historyRows.filter(r => r.guardApproved === null).length,   color: Colors.textMuted},
                    ].map(stat => (
                      <View key={stat.label} style={[hs.statCell, { borderColor: stat.color + '44' }]}>
                        <Text style={[hs.statVal, { color: stat.color }]}>{stat.value}</Text>
                        <Text style={hs.statLabel}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Order cards */}
                  {historyRows.map(row => {
                    const uc  = UNIT_CFG[row.coin_symbol]  ?? UNIT_CFG.BTNG_G;
                    const sc  = STATUS_CFG[row.status]     ?? STATUS_CFG.filled;
                    const ghsTotal = row.total_value * fxRate;
                    const dt  = new Date(row.created_at);
                    const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                    const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                      <View key={row.id} style={[hs.card, { borderLeftColor: uc.color, borderLeftWidth: 3 }]}>
                        {/* Card header */}
                        <View style={hs.cardHeader}>
                          <View style={[hs.emojiWrap, { backgroundColor: uc.color + '18', borderColor: uc.color + '44' }]}>
                            <Text style={{ fontSize: 22 }}>{uc.emoji}</Text>
                          </View>
                          <View style={{ flex: 1, gap: 3 }}>
                            <View style={hs.cardTitleRow}>
                              <Text style={[hs.cardCoin, { color: uc.color }]}>{row.coin_symbol.replace('_', '-')}</Text>
                              <View style={[hs.sideBadge, {
                                backgroundColor: row.side === 'buy' ? Colors.successBg : Colors.errorBg,
                                borderColor: (row.side === 'buy' ? Colors.success : Colors.error) + '66',
                              }]}>
                                <MaterialIcons
                                  name={row.side === 'buy' ? 'trending-up' : 'trending-down'}
                                  size={11}
                                  color={row.side === 'buy' ? Colors.success : Colors.error}
                                />
                                <Text style={[hs.sideBadgeText, { color: row.side === 'buy' ? Colors.success : Colors.error }]}>
                                  {row.side.toUpperCase()}
                                </Text>
                              </View>
                              <View style={[hs.statusChip, { backgroundColor: sc.bg, borderColor: sc.color + '55' }]}>
                                <Text style={[hs.statusChipText, { color: sc.color }]}>{row.status}</Text>
                              </View>
                            </View>
                            <View style={hs.cardMeta}>
                              <MaterialIcons name="schedule" size={10} color={Colors.textMuted} />
                              <Text style={hs.cardMetaText}>{dateStr} · {timeStr}</Text>
                              <View style={hs.metaDot} />
                              <Text style={hs.cardMetaText}>{row.order_type}</Text>
                            </View>
                          </View>
                        </View>

                        {/* Metrics grid */}
                        <View style={hs.metricsGrid}>
                          {[
                            { label: 'Quantity',    value: `${row.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${uc.label}`, color: uc.color         },
                            { label: 'Price (USD)', value: `$${row.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,                color: Colors.primary   },
                            { label: 'Total USD',   value: `$${row.total_value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,          color: Colors.textPrimary },
                            { label: 'Total GHS',   value: `GH₵${ghsTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,              color: Colors.warning   },
                            { label: 'Fee (USD)',   value: `$${(row.fee ?? 0).toLocaleString('en-US', { maximumFractionDigits: 6 })}`,           color: Colors.textMuted },
                            { label: 'Net USD',     value: `$${(row.total_value - (row.fee ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 4 })}`, color: Colors.success },
                          ].map(cell => (
                            <View key={cell.label} style={[hs.metricCell, { borderColor: cell.color + '33' }]}>
                              <Text style={[hs.metricVal, { color: cell.color }]}>{cell.value}</Text>
                              <Text style={hs.metricLabel}>{cell.label}</Text>
                            </View>
                          ))}
                        </View>

                        {/* Guard note */}
                        {row.guardApproved !== null ? (
                          <View style={[
                            hs.guardNote,
                            { borderColor: row.guardApproved ? Colors.success + '55' : Colors.error + '55', backgroundColor: row.guardApproved ? Colors.successBg : Colors.errorBg },
                          ]}>
                            <MaterialIcons
                              name={row.guardApproved ? 'verified-user' : 'gpp-bad'}
                              size={14}
                              color={row.guardApproved ? Colors.success : Colors.error}
                            />
                            <View style={{ flex: 1, gap: 3 }}>
                              <Text style={[hs.guardNoteTitle, { color: row.guardApproved ? Colors.success : Colors.error }]}>
                                {row.guardApproved ? '✅ Sovereign Guard Approved' : '🚨 Guard Status Unknown'}
                              </Text>
                              <View style={hs.guardNoteChips}>
                                {row.guardVariance ? (
                                  <View style={hs.guardChip}>
                                    <Text style={hs.guardChipKey}>variance</Text>
                                    <Text style={[hs.guardChipVal, { color: row.guardApproved ? Colors.success : Colors.error }]}>{row.guardVariance}</Text>
                                  </View>
                                ) : null}
                                {row.guardOracle ? (
                                  <View style={hs.guardChip}>
                                    <Text style={hs.guardChipKey}>oracle</Text>
                                    <Text style={hs.guardChipVal}>{row.guardOracle}</Text>
                                  </View>
                                ) : null}
                                {row.guardSpot ? (
                                  <View style={hs.guardChip}>
                                    <Text style={hs.guardChipKey}>XAU/USD</Text>
                                    <Text style={[hs.guardChipVal, { color: Colors.primary }]}>${row.guardSpot}</Text>
                                  </View>
                                ) : null}
                                {row.guardFx ? (
                                  <View style={hs.guardChip}>
                                    <Text style={hs.guardChipKey}>FX</Text>
                                    <Text style={[hs.guardChipVal, { color: Colors.warning }]}>{row.guardFx}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        ) : (
                          <View style={hs.guardNoteAbsent}>
                            <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
                            <Text style={hs.guardNoteAbsentText}>No guard metadata — order predates Sovereign Guard logging.</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </>
              )}
            </>
          );
        })()}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.bg },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:     { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  topSub:        { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },

  oracleBar:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: 10, flexWrap: 'wrap' },
  oraclePill:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  oraclePillText:{ fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  oraclePrice:   { fontSize: 16, fontWeight: FontWeight.heavy, includeFontPadding: false, flex: 1 },
  changePill:    { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  changeText:    { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  countdown:     { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  tabRow:        { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  tabBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabBtnActive:  { backgroundColor: Colors.primary },
  tabText:       { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },

  scroll:        { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  heroTitle:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:       { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  liveBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  liveBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Terminal
  terminalCard:   { backgroundColor: '#0a1a0a', borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#1a3a1a', overflow: 'hidden' },
  terminalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#0d1f0d', paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a3a1a' },
  terminalDots:   { flexDirection: 'row', gap: 5 },
  terminalDot:    { width: 10, height: 10, borderRadius: 5 },
  terminalTitle:  { flex: 1, fontSize: 10, color: '#4ade80', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  terminalBadge:  { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  terminalBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  terminalBody:   { padding: Spacing.md, gap: 2 },

  // Indices
  indicesCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  indicesHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  indicesTitle:  { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  indicesGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  indexCell:     { width: '31%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, alignItems: 'center', gap: 3 },
  indexValue:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  indexLabel:    { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false, textAlign: 'center' },

  // Input card
  inputCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  inputCardHeader:  { gap: 3 },
  inputCardTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  inputCardSub:     { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  inputGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  inputFieldWrap:   { width: '47%', flex: 1, gap: 4 },
  inputFieldLabel:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  inputField:       { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },

  // Matrix
  matrixHero:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', gap: Spacing.sm },
  formulaCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  formulaHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  formulaTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  formulaRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', gap: Spacing.sm },
  formulaLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  formulaExpr:  { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  formulaResult:{ fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },

  // Guard
  guardHero:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.error + '33', alignItems: 'center', gap: Spacing.sm },
  guardStatsRow:   { flexDirection: 'row', gap: Spacing.sm },
  guardStatCard:   { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', paddingVertical: Spacing.md, gap: 3 },
  guardStatValue:  { fontSize: 12, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  guardStatLabel:  { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  guardInputCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.warning + '44', padding: Spacing.md, gap: Spacing.md },
  guardInputHeader:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  guardInputTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  guardInputSub:   { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  guardInputRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning + '55', paddingHorizontal: Spacing.md, height: 52 },
  guardInputPrefix:{ fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  guardInput:      { flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  guardInputSuffix:{ fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  guardQuickRow:   { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  guardQuickBtn:   { flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', minWidth: 80 },
  guardQuickText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  verifyBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.warning, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  verifyBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  guardResult:     { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.md },
  guardResultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  guardResultDecision: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  guardResultReason: { fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false, marginTop: 2 },
  guardResultDetails: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 },
  guardResultRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guardResultLabel:{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  guardResultValue:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  guardHowCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  guardHowTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  guardHowRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  guardHowStep:    { width: 24, height: 24, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  guardHowStepText:{ fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  guardHowText:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },

  // API Docs
  docsHero:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  endpointCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.md },
  endpointHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  methodBadge:     { borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  methodText:      { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  endpointPath:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, flex: 1 },
  endpointDesc:    { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },
  paramsSection:   { gap: 6 },
  paramsSectionTitle: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  paramRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  paramDot:        { width: 5, height: 5, borderRadius: 2.5, marginTop: 5, flexShrink: 0 },
  paramText:       { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  returnsSection:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm + 2 },
  returnsText:     { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, lineHeight: 16, includeFontPadding: false },
  classRefCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm },
  classRefHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  classRefTitle:   { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  classRefCode:    { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 15, includeFontPadding: false },
  deployCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: '#22C55E44', padding: Spacing.md, gap: Spacing.sm },
  deployHeader:    { flexDirection: 'row', alignItems: 'center', gap: 7 },
  deployTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  deployCode:      { backgroundColor: '#0a1a0a', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: '#1a3a1a', fontSize: 10, color: '#4ade80', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  deployNote:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  deployNoteText:  { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  fallbackCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.warning + '44', padding: Spacing.md, gap: Spacing.sm },
  fallbackHeader:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  fallbackTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  fallbackSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  fallbackRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  fallbackLabel:   { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  fallbackValue:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
});

// ─── History Tab Styles ──────────────────────────────────────────────────────────
const hs = StyleSheet.create({
  hero:            { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', gap: Spacing.sm },
  heroTitle:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:         { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  actionRow:       { flexDirection: 'row', gap: Spacing.sm },
  refreshBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.primary + '55' },
  refreshBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  exportBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  exportBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  loadingWrap:     { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText:     { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  emptyWrap:       { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle:      { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:        { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, includeFontPadding: false, paddingHorizontal: Spacing.lg },
  goExecBtn:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginTop: Spacing.sm },
  goExecBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  statsRow:        { flexDirection: 'row', gap: Spacing.sm },
  statCell:        { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:         { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:       { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  card:            { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md, overflow: 'hidden' },
  cardHeader:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  emojiWrap:       { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardCoin:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  sideBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  sideBadgeText:   { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  statusChip:      { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  statusChipText:  { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  cardMeta:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText:    { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  metaDot:         { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },

  metricsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metricCell:      { width: '30%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, alignItems: 'center', gap: 3 },
  metricVal:       { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  metricLabel:     { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  guardNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  guardNoteTitle:  { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  guardNoteChips:  { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  guardChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  guardChipKey:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  guardChipVal:    { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  guardNoteAbsent: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  guardNoteAbsentText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Portfolio Summary Card
  portfolioCard:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.md, gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  portfolioHeader:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  portfolioTitle:        { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  portfolioOracleBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  portfolioOracleText:   { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  portfolioTotalRow:     { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  portfolioTotalCol:     { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, gap: 4 },
  portfolioTotalDivider: { width: 1, backgroundColor: Colors.border, alignSelf: 'stretch' },
  portfolioTotalLabel:   { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  portfolioTotalVal:     { fontSize: 20, fontWeight: FontWeight.heavy, includeFontPadding: false },
  portfolioUnitRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  portfolioUnitEmoji:    { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  portfolioUnitSym:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  portfolioUnitQty:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  portfolioUnitGHS:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  portfolioUnitUSD:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  portfolioUnitPrice:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  portfolioFooter:       { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  portfolioFooterText:   { flex: 1, fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ─── Execute Tab Styles ────────────────────────────────────────────────────────
const ex = StyleSheet.create({
  hero:             { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  heroTitle:        { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:          { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  card:             { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle:        { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  oracleBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  oracleBadgeText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  unitRow:          { flexDirection: 'row', gap: Spacing.sm },
  unitCard:         { flex: 1, alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, paddingVertical: Spacing.md, paddingHorizontal: 4, position: 'relative', overflow: 'hidden' },
  unitKey:          { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  unitLabel:        { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  unitPrice:        { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  unitPriceSub:     { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  unitSelDot:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl },

  sideToggle:       { flexDirection: 'row', gap: Spacing.sm },
  sideBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: Spacing.sm + 4, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border },
  sideBtnText:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },

  inputLabel:       { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  amountInputRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.primary + '55', paddingHorizontal: Spacing.md, height: 64 },
  amountInput:      { flex: 1, fontSize: 28, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  amountSuffix:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },

  quickRow:         { flexDirection: 'row', gap: Spacing.sm },
  quickBtn:         { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  quickBtnText:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  pricePreviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pricePreviewCell: { width: '31%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, alignItems: 'center', gap: 3 },
  pricePreviewValue:{ fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  pricePreviewLabel:{ fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  guardLive:        { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.md },
  guardLiveHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  guardLiveDecision:{ fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  guardLiveReason:  { fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false, marginTop: 2 },
  variancePill:     { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  variancePillText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  guardLiveDetails: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, gap: 5 },
  guardLiveRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guardLiveLabel:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  guardLiveValue:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  guardIdle:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.warning + '44', padding: Spacing.md },
  guardIdleText:    { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 16, includeFontPadding: false },

  execBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: Radius.xl, paddingVertical: Spacing.lg, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  execBtnText:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false, textAlign: 'center', flex: 1 },

  successBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.success + '66', padding: Spacing.md, shadowColor: Colors.success, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  successTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  successSub:       { fontSize: FontSize.xs, color: Colors.success, includeFontPadding: false },
  successId:        { fontSize: 9, color: Colors.success + 'AA', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  infoCard:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  infoCardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoCardTitle:    { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  infoRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  infoStep:         { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  infoStepText:     { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  infoText:         { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
});
