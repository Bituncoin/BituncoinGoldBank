/**
 * BTNGGoldChart — Live Gold Price Chart for BTNG Platform
 * Shows live XAU/USD price for all three BTNG gold units.
 * Technical data (source, provider, cache) stays hidden from users.
 */

import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';

// ── Interval options ─────────────────────────────────────────────────────────
const INTERVALS = [
  { label: '10m', value: 'ten_minute' },
  { label: '1h',  value: 'one_hour'  },
  { label: '6h',  value: 'six_hour'  },
  { label: '1d',  value: 'one_day'   },
  { label: '1w',  value: 'one_week'  },
  { label: '1m',  value: 'one_month' },
] as const;

type Interval = typeof INTERVALS[number]['value'];

function buildChartHTML(interval: Interval): string {
  const bg        = '#060608';
  const mutedColor= '#6B6B8A';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>Gold Price</title>
  <script type="text/javascript"
    src="https://www.bullionvault.com/chart/price-chart.min.js">
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: ${bg};
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #chartContainer {
      width: 100%;
      height: 100%;
      background: ${bg};
    }
    .bv-chart-container,
    .bv-chart-wrapper,
    canvas { background: ${bg} !important; }
    /* Hide any BullionVault branding/attribution rendered inside the chart */
    .bv-footer, .bv-credit, .bv-watermark,
    [class*="credit"], [class*="footer"], [class*="logo"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
  </style>
</head>
<body>
  <div id="chartContainer"></div>
  <script type="text/javascript">
    try {
      var options = {
        bullion:   'gold',
        currency:  'USD',
        timeframe: '${interval}',
        width:     '100%',
        height:    '100%',
      };
      var chartBV = new BullionVaultChart(options, 'chartContainer');
    } catch(e) {
      document.getElementById('chartContainer').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${mutedColor};font-size:13px;">Loading…</div>';
    }
  </script>
</body>
</html>`;
}

// ── Props ────────────────────────────────────────────────────────────────────
interface BTNGGoldChartProps {
  showUnits?: boolean;
  height?: number;
  compact?: boolean;
}

export function BTNGGoldChart({ showUnits = true, height = 340, compact = false }: BTNGGoldChartProps) {
  const [interval, setInterval] = useState<Interval>('one_day');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const webviewRef              = useRef<any>(null);

  const gold = useGoldOracle();
  const { getRate: getFxRate } = useExchangeRateContext();
  // Live GHS/USD rate — falls back to 11.8 (static) if API unavailable
  const ghsPerUsd = getFxRate('GHS') > 1 ? getFxRate('GHS') : 11.8;

  const TROY       = 31.1035;
  const KG_TROY    = 32.1507;
  const priceOz    = gold.priceUSD > 0 ? gold.priceUSD : 4_329.45;  // XAU/USD spot
  const btnggPrice = priceOz / 1000;          // BTNGG  = 1/1000 troy oz
  const btngGPrice = priceOz / TROY;          // BTNG-G = 1 gram
  const btngKgPrice= priceOz * KG_TROY;       // BTNG-KG = 1 kilogram
  const isPos      = gold.changePct24h >= 0;

  // African currency rates for gold price display
  const ngnPerUsd = getFxRate('NGN') > 1 ? getFxRate('NGN') : 1580;
  const kesPerUsd = getFxRate('KES') > 1 ? getFxRate('KES') : 129;
  const zarPerUsd = getFxRate('ZAR') > 1 ? getFxRate('ZAR') : 18.3;

  const html = buildChartHTML(interval);

  return (
    <View style={[styles.wrapper, { minHeight: height }]}>
      {/* Header — clean price display, no technical labels */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.goldIcon}><Text style={{ fontSize: 22 }}>🏅</Text></View>
          <View>
            <Text style={styles.headerTitle}>Gold Price · XAU/USD</Text>
            <View style={styles.headerSubRow}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeTxt}>LIVE</Text>
              </View>
              <Text style={styles.updateTxt}>Auto-refreshing</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          {gold.loading
            ? <ActivityIndicator size="small" color={Colors.kenteGold} />
            : <Text style={styles.spotPrice}>
                ${priceOz.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
          }
          <View style={[styles.changeBadge, { backgroundColor: isPos ? Colors.successBg : Colors.errorBg }]}>
            <MaterialIcons name={isPos ? 'arrow-drop-up' : 'arrow-drop-down'} size={14} color={isPos ? Colors.success : Colors.error} />
            <Text style={[styles.changeTxt, { color: isPos ? Colors.success : Colors.error }]}>
              {isPos ? '+' : ''}{gold.changePct24h.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Interval selector */}
      {!compact && (
        <View style={styles.intervalRow}>
          {INTERVALS.map(iv => (
            <TouchableOpacity
              key={iv.value}
              style={[styles.ivBtn, interval === iv.value && styles.ivBtnActive]}
              onPress={() => { setInterval(iv.value); setLoading(true); setError(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.ivTxt, interval === iv.value && styles.ivTxtActive]}>{iv.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Chart */}
      <View style={[styles.chartWrap, { height: Platform.OS === 'web' ? 220 : 300 }]}>
        {Platform.OS !== 'web' ? (
          <>
            {loading && !error && (
              <View style={styles.chartLoader}>
                <ActivityIndicator size="large" color={Colors.kenteGold} />
                <Text style={styles.chartLoaderTxt}>Loading gold chart…</Text>
              </View>
            )}
            {error && (
              <View style={styles.chartLoader}>
                <Text style={{ fontSize: 28 }}>📊</Text>
                <Text style={styles.chartLoaderTxt}>Chart unavailable</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => { setError(false); setLoading(true); webviewRef.current?.reload(); }}
                >
                  <Text style={styles.retryTxt}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            <WebView
              ref={webviewRef}
              originWhitelist={['*']}
              source={{ html, baseUrl: 'https://www.bullionvault.com' }}
              style={[styles.webview, (loading || error) && { opacity: 0 }]}
              scrollEnabled={false}
              bounces={false}
              onLoadStart={() => { setLoading(true); setError(false); }}
              onLoadEnd={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
            />
          </>
        ) : (
          /* Web preview — native bar chart */
          <View style={[styles.webFallback, { height: 220 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 110, paddingHorizontal: 16 }}>
              {[0.62,0.66,0.70,0.68,0.74,0.78,0.75,0.82,0.80,0.88,0.85,0.91,0.87,0.93,0.96,1.00].map((h, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: h * 110,
                    backgroundColor: i === 15 ? Colors.primary : Colors.kenteGold + (i > 10 ? 'CC' : '55'),
                    borderRadius: 3,
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.kenteGold, includeFontPadding: false }}>
                XAU/USD · ${priceOz.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Three BTNG Gold Units Strip */}
      {showUnits && (
        <View style={styles.unitsStrip}>
          {[
            { symbol: 'BTNGG',   label: '1/1000 oz', price: btnggPrice,  digits: 4 },
            { symbol: 'BTNG-G',  label: '1 gram',    price: btngGPrice,  digits: 2 },
            { symbol: 'BTNG-KG', label: '1 kilogram',price: btngKgPrice, digits: 0 },
          ].map((unit, i) => (
            <View key={unit.symbol} style={[styles.unitCell, i < 2 && styles.unitCellBorder]}>
              <Text style={styles.unitSymbol}>{unit.symbol}</Text>
              <Text style={styles.unitPrice}>
                ${unit.digits === 0
                  ? unit.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : unit.price.toFixed(unit.digits)
                }
              </Text>
              <Text style={styles.unitLabel}>{unit.label} XAU</Text>
              <View style={[styles.unitChg, { backgroundColor: isPos ? Colors.successBg : Colors.errorBg }]}>
                <MaterialIcons name={isPos ? 'arrow-drop-up' : 'arrow-drop-down'} size={10} color={isPos ? Colors.success : Colors.error} />
                <Text style={[styles.unitChgTxt, { color: isPos ? Colors.success : Colors.error }]}>
                  {isPos ? '+' : ''}{gold.changePct24h.toFixed(2)}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* World market reference row — scrollable to fit all 7 currency cells */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.worldRow}
        contentContainerStyle={styles.worldRowContent}
      >
        {[
          { label: 'USD/oz', value: `$${priceOz.toLocaleString('en-US', { maximumFractionDigits: 2 })}` },
          { label: 'USD/g',  value: `$${btngGPrice.toFixed(2)}` },
          { label: 'USD/kg', value: `$${btngKgPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
          { label: 'GHS/oz', value: `GH₵${Math.round(priceOz * ghsPerUsd).toLocaleString('en-US')}` },
          { label: 'NGN/oz', value: `₦${Math.round(priceOz * ngnPerUsd).toLocaleString('en-US')}` },
          { label: 'KES/oz', value: `KSh${Math.round(priceOz * kesPerUsd).toLocaleString('en-US')}` },
          { label: 'ZAR/oz', value: `R${(priceOz * zarPerUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
        ].map((ref, i, arr) => (
          <View key={ref.label} style={[styles.worldCell, i < arr.length - 1 && styles.worldCellBorder]}>
            <Text style={styles.worldLabel}>{ref.label}</Text>
            <Text style={styles.worldValue}>{ref.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.kenteGold + '55',
    overflow: 'hidden',
    shadowColor: Colors.kenteGold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  goldIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.warningBg, borderWidth: 1,
    borderColor: Colors.kenteGold + '44',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '44',
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveBadgeTxt: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.6, color: Colors.success, includeFontPadding: false },
  updateTxt: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  headerRight: { alignItems: 'flex-end', gap: 3 },
  spotPrice: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.kenteGold, includeFontPadding: false },
  changeBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  changeTxt: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  intervalRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  ivBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 6,
    borderRadius: Radius.md, borderWidth: 1, borderColor: 'transparent',
  },
  ivBtnActive: { backgroundColor: Colors.kenteGold + '22', borderColor: Colors.kenteGold + '66' },
  ivTxt: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  ivTxtActive: { color: Colors.kenteGold, fontWeight: FontWeight.heavy },
  chartWrap: { width: '100%', position: 'relative', backgroundColor: Colors.bg },
  webview: { flex: 1, backgroundColor: Colors.bg },
  chartLoader: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bg, zIndex: 2,
  },
  chartLoaderTxt: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  retryBtn: {
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary,
  },
  retryTxt: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  webFallback: {
    alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.bg,
  },
  unitsStrip: {
    flexDirection: 'row',
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  unitCell: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, gap: 3 },
  unitCellBorder: { borderRightWidth: 1, borderRightColor: Colors.border },
  unitSymbol: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.kenteGold, includeFontPadding: false },
  unitPrice: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'center' },
  unitLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  unitChg: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1 },
  unitChgTxt: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  worldRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  worldRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  worldCell: { width: 82, alignItems: 'center', paddingVertical: Spacing.sm, gap: 2 },
  worldCellBorder: { borderRightWidth: 1, borderRightColor: Colors.border },
  worldLabel: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, letterSpacing: 0.3 },
  worldValue: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, textAlign: 'center' },
});
