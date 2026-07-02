/**
 * app/btng-swap.tsx
 * BTNG Gold Coin — Token Swap Screen
 * Live rates from gold oracle + crypto prices · Slippage selector ·
 * Confirmation modal · Records both legs in trade_history
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, Pressable, Animated, Easing, Platform, KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';
import { ZoneEngine } from '@/constants/zoneEngine';
import type { ZoneResolution } from '@/constants/zoneResolver';

const zoneEngine = new ZoneEngine();
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { useCryptoPrices } from '@/hooks/useCryptoPrices';

// ─── Swap Price Chart ────────────────────────────────────────────────────────
type SwapChartType = 'line' | 'candle';

function SwapPriceChart({
  fromToken,
  toToken,
  fromPrice,
  toPrice,
}: {
  fromToken: { symbol: string; color: string };
  toToken:   { symbol: string; color: string };
  fromPrice: number;
  toPrice:   number;
}) {
  const [chartType, setChartType] = useState<SwapChartType>('line');
  const screenW = Dimensions.get('window').width;
  const W = Math.max(1, screenW - Spacing.xl * 2 - 2);
  const H = 80;
  const PAD_X = 0;
  const PAD_Y = 10;
  const pair = `${fromToken.symbol}${toToken.symbol}`;

  // Seeded 7-day exchange rate history (rate = fromPrice / toPrice)
  const baseRate = useMemo(() => {
    if (fromPrice <= 0 || toPrice <= 0) return 1;
    return fromPrice / toPrice;
  }, [fromPrice, toPrice]);

  const closes = useMemo(() => {
    if (baseRate <= 0) return Array(7).fill(1);
    const pts: number[] = [];
    let v = baseRate * 0.95;
    for (let i = 0; i < 6; i++) {
      const s1 = pair.charCodeAt(i % pair.length);
      const s2 = pair.charCodeAt((i + 2) % pair.length);
      const delta = ((s1 * 13 + s2 * 7 + i * 31) % 100 - 48) * 0.003;
      v = Math.max(v * (1 + delta), 0.000001);
      pts.push(v);
    }
    pts.push(baseRate);
    return pts;
  }, [baseRate, pair]);

  const ohlc = useMemo(() => {
    return closes.map((close, i) => {
      const s1 = pair.charCodeAt(i % pair.length);
      const s2 = pair.charCodeAt((i + 1) % pair.length);
      const s3 = pair.charCodeAt((i + 3) % pair.length);
      const openDelta = ((s1 * 7 + i * 19) % 60 - 30) * 0.0018;
      const open = Math.max(close * (1 + openDelta), 0.000001);
      const high = Math.max(open, close) * (1 + ((s2 * 11 + i * 23) % 40) * 0.0005);
      const low  = Math.min(open, close) * (1 - ((s3 * 9  + i * 17) % 40) * 0.0005);
      return { open, high, low, close, bullish: close >= open };
    });
  }, [closes, pair]);

  const isPositive = closes[closes.length - 1] >= closes[0];
  const lineColor  = isPositive ? Colors.success : Colors.error;
  const changePct  = closes[0] > 0
    ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
    : 0;

  // Scale helpers
  const allVals = chartType === 'candle'
    ? ohlc.flatMap(c => [c.high, c.low])
    : closes;
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range  = maxVal - minVal || baseRate * 0.01;

  const toX = (i: number) => PAD_X + (i / (closes.length - 1)) * (W - PAD_X * 2);
  const toY = (v: number) => PAD_Y + (H - PAD_Y * 2) * (1 - (v - minVal) / range);

  // Line + area paths
  const linePath = closes.reduce((acc, v, i) => {
    const x = toX(i); const y = toY(v);
    if (i === 0) return `M ${x} ${y}`;
    const px = toX(i - 1); const py = toY(closes[i - 1]);
    const cpX = px + (x - px) * 0.5;
    return `${acc} C ${cpX} ${py}, ${cpX} ${y}, ${x} ${y}`;
  }, '');
  const areaPath = `${linePath} L ${toX(closes.length - 1)} ${H} L ${toX(0)} ${H} Z`;

  // Candle geometry
  const CANDLE_W = Math.max(6, (W / closes.length) * 0.55);
  const gradId = `swapGrad_${pair.replace(/[^a-zA-Z0-9]/g, '')}`;

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayLabels = closes.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (closes.length - 1 - i));
    return days[(d.getDay() + 6) % 7];
  });

  const fmtRate = (r: number) => {
    if (r === 0) return '—';
    if (r >= 1000) return r.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (r >= 1)    return r.toFixed(4);
    return r.toFixed(8);
  };

  const enterAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enterAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
  }, [enterAnim]);

  return (
    <Animated.View
      style={[spc.wrap, {
        opacity: enterAnim,
        transform: [{ scale: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }]}
    >
      {/* Header row */}
      <View style={spc.hdrRow}>
        {/* Pair label */}
        <View style={spc.pairWrap}>
          <View style={[spc.pairDot, { backgroundColor: fromToken.color }]} />
          <Text style={spc.pairText}>
            <Text style={{ color: fromToken.color }}>{fromToken.symbol}</Text>
            <Text style={{ color: Colors.textMuted }}>{' / '}</Text>
            <Text style={{ color: toToken.color }}>{toToken.symbol}</Text>
          </Text>
          <Text style={spc.pairSub}>7D Rate</Text>
        </View>

        {/* Chart type toggle */}
        <View style={spc.toggleRow}>
          {(['line', 'candle'] as SwapChartType[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[spc.toggleBtn, chartType === t && spc.toggleBtnActive]}
              onPress={() => setChartType(t)}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <MaterialIcons
                name={t === 'line' ? 'show-chart' : 'bar-chart'}
                size={11}
                color={chartType === t ? Colors.bg : Colors.textMuted}
              />
              <Text style={[spc.toggleText, chartType === t && spc.toggleTextActive]}>
                {t === 'line' ? 'Line' : 'OHLC'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Change badge */}
        <View style={[
          spc.changeBadge,
          {
            backgroundColor: isPositive ? Colors.successBg : Colors.errorBg,
            borderColor: (isPositive ? Colors.success : Colors.error) + '55',
          },
        ]}>
          <MaterialIcons
            name={isPositive ? 'trending-up' : 'trending-down'}
            size={11}
            color={isPositive ? Colors.success : Colors.error}
          />
          <Text style={[spc.changeText, { color: isPositive ? Colors.success : Colors.error }]}>
            {isPositive ? '+' : ''}{changePct.toFixed(2)}%
          </Text>
        </View>
      </View>

      {/* Current rate */}
      <View style={spc.rateRow}>
        <Text style={spc.rateLabel}>Current rate</Text>
        <Text style={[spc.rateValue, { color: fromToken.color }]}>
          1 {fromToken.symbol} = {fmtRate(baseRate)} {toToken.symbol}
        </Text>
      </View>

      {/* SVG Chart */}
      <Svg width={W} height={H}>
        {chartType === 'line' ? (
          <>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.3} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill={`url(#${gradId})`} />
            <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle
              cx={toX(closes.length - 1)}
              cy={toY(closes[closes.length - 1])}
              r={4.5}
              fill={lineColor}
              stroke={Colors.bgCard}
              strokeWidth={2}
            />
            <Circle cx={toX(0)} cy={toY(closes[0])} r={2.5} fill={lineColor} opacity={0.45} />
          </>
        ) : (
          <>
            {ohlc.map((c, i) => {
              const cx      = toX(i);
              const yHigh   = toY(c.high);
              const yLow    = toY(c.low);
              const yOpen   = toY(c.open);
              const yClose  = toY(c.close);
              const bodyTop = Math.min(yOpen, yClose);
              const bodyH   = Math.max(Math.abs(yOpen - yClose), 1.5);
              const fill    = c.bullish ? Colors.success : Colors.error;
              return (
                <React.Fragment key={i}>
                  <Path
                    d={`M ${cx} ${yHigh} L ${cx} ${yLow}`}
                    stroke={fill}
                    strokeWidth={1.2}
                    opacity={0.7}
                  />
                  <Path
                    d={`M ${cx - CANDLE_W / 2} ${bodyTop} L ${cx + CANDLE_W / 2} ${bodyTop} L ${cx + CANDLE_W / 2} ${bodyTop + bodyH} L ${cx - CANDLE_W / 2} ${bodyTop + bodyH} Z`}
                    fill={c.bullish ? fill : 'transparent'}
                    stroke={fill}
                    strokeWidth={1.2}
                  />
                </React.Fragment>
              );
            })}
          </>
        )}
      </Svg>

      {/* Day labels */}
      <View style={[spc.dayRow, { width: W }]}>
        {dayLabels.map((d, i) => (
          <Text
            key={i}
            style={[
              spc.dayLabel,
              i === dayLabels.length - 1 && { color: lineColor, fontWeight: FontWeight.bold },
            ]}
          >
            {d}
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}

const spc = StyleSheet.create({
  wrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 6,
    overflow: 'hidden',
  },
  hdrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pairWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  pairDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pairText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
  },
  pairSub: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
    marginLeft: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm - 1,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    fontSize: 8,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  toggleTextActive: {
    color: Colors.bg,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  changeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  rateLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  rateValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
    flexShrink: 1,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  dayLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    includeFontPadding: false,
    textAlign: 'center',
    flex: 1,
  },
});

// ─── Token Registry ───────────────────────────────────────────────────────────
interface SwapToken {
  id: string;
  name: string;
  symbol: string;
  logo: string;
  color: string;
  isGold: boolean;
  isStable: boolean;
}

const TOKENS: SwapToken[] = [
  { id: 'BTNGG', name: 'BTNG Gold Token',  symbol: 'BTNGG', logo: 'BG',  color: Colors.primary, isGold: true,  isStable: false },
  { id: 'USDT',  name: 'Tether USD',       symbol: 'USDT',  logo: '$',   color: '#26A17B', isGold: false, isStable: true  },
  { id: 'USDC',  name: 'USD Coin',         symbol: 'USDC',  logo: '$',   color: '#2775CA', isGold: false, isStable: true  },
  { id: 'BTC',   name: 'Bitcoin',          symbol: 'BTC',   logo: 'BTC', color: '#F7931A', isGold: false, isStable: false },
  { id: 'ETH',   name: 'Ethereum',         symbol: 'ETH',   logo: 'ETH', color: '#627EEA', isGold: false, isStable: false },
  { id: 'BNB',   name: 'BNB Chain',        symbol: 'BNB',   logo: 'BNB', color: '#F3BA2F', isGold: false, isStable: false },
  { id: 'SOL',   name: 'Solana',           symbol: 'SOL',   logo: 'SOL', color: '#9945FF', isGold: false, isStable: false },
  { id: 'XRP',   name: 'XRP',              symbol: 'XRP',   logo: 'XRP', color: '#0ECB81', isGold: false, isStable: false },
  { id: 'MATIC', name: 'Polygon',          symbol: 'MATIC', logo: 'POL', color: '#8247E5', isGold: false, isStable: false },
  { id: 'ADA',   name: 'Cardano',          symbol: 'ADA',   logo: 'ADA', color: '#3366FF', isGold: false, isStable: false },
  { id: 'DOGE',  name: 'Dogecoin',         symbol: 'DOGE',  logo: 'DGE', color: '#C2A633', isGold: false, isStable: false },
  { id: 'AVAX',  name: 'Avalanche',        symbol: 'AVAX',  logo: 'AVX', color: '#E84142', isGold: false, isStable: false },
];

const BTNG_COIN_IMG = require('@/assets/images/btng_coin_logo.jpg');

const SLIPPAGE_OPTIONS = [0.5, 1.0, 2.0] as const;
type SlippageOption = typeof SLIPPAGE_OPTIONS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTokenPrice(
  symbol: string,
  oraclePriceUSD: number,
  fullPrices: Record<string, { price: number }>,
): number {
  if (symbol === 'BTNGG') return oraclePriceUSD > 0 ? oraclePriceUSD / 1000 : 4.33;
  if (symbol === 'USDT' || symbol === 'USDC') return 1.0;
  return fullPrices[symbol]?.price ?? 0;
}

function fmt(n: number, dp = 6): string {
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toFixed(dp);
}

function fmtUSD(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

// ─── Token Logo ───────────────────────────────────────────────────────────────
function TokenLogo({ token, size = 40 }: { token: SwapToken; size?: number }) {
  if (token.isGold) {
    return (
      <Image
        source={BTNG_COIN_IMG}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={200}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: token.color + '22',
      borderWidth: 1.5,
      borderColor: token.color + '55',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.28, fontWeight: FontWeight.heavy, color: token.color, includeFontPadding: false }}>
        {token.logo}
      </Text>
    </View>
  );
}

// ─── Token Selector Modal ─────────────────────────────────────────────────────
function TokenSelectorModal({
  visible, onClose, onSelect, excludeId, prices,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (t: SwapToken) => void;
  excludeId: string;
  prices: Record<string, number>;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return TOKENS.filter(t =>
      t.id !== excludeId &&
      (t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    );
  }, [query, excludeId]);

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const slideAnim = useRef(new Animated.Value(500)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[ts.overlay, { opacity: overlayAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[ts.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={ts.handle} />
        <View style={ts.hdr}>
          <Text style={ts.hdrTitle}>Select Token</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={ts.searchRow}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={ts.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search token name or symbol"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <MaterialIcons name="close" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={ts.list}>
          {filtered.map(token => {
            const price = prices[token.symbol] ?? 0;
            return (
              <TouchableOpacity
                key={token.id}
                style={ts.tokenRow}
                onPress={() => { onSelect(token); onClose(); }}
                activeOpacity={0.75}
              >
                <TokenLogo token={token} size={42} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={ts.tokenSymbol}>{token.symbol}</Text>
                    {token.isGold && (
                      <View style={ts.goldBadge}>
                        <Text style={ts.goldBadgeText}>GOLD-BACKED</Text>
                      </View>
                    )}
                    {token.isStable && (
                      <View style={ts.stableBadge}>
                        <Text style={ts.stableBadgeText}>STABLE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={ts.tokenName}>{token.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={[ts.tokenPrice, { color: token.color }]}>
                    {price > 0 ? fmtUSD(price) : '—'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const ts = StyleSheet.create({
  overlay:      { ...StyleSheet.absoluteFillObject as any, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 30 },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  hdr:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  hdrTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  searchRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, marginHorizontal: Spacing.xl, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  searchInput:  { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, paddingVertical: 3 },
  list:         { paddingHorizontal: Spacing.xl },
  tokenRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tokenSymbol:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tokenName:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  tokenPrice:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  goldBadge:    { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: Colors.primary + '44' },
  goldBadgeText:{ fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },
  stableBadge:  { backgroundColor: '#26A17B18', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: '#26A17B44' },
  stableBadgeText: { fontSize: 7, fontWeight: FontWeight.heavy, color: '#26A17B', includeFontPadding: false, letterSpacing: 0.5 },
});

// ─── Confirmation Modal ───────────────────────────────────────────────────────
interface ConfirmSwapProps {
  visible: boolean;
  fromToken: SwapToken;
  toToken: SwapToken;
  fromAmount: number;
  toAmount: number;
  fromPriceUSD: number;
  toPriceUSD: number;
  slippage: SlippageOption;
  fee: number;
  priceImpact: number;
  minReceived: number;
  swapping: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmSwapModal({
  visible, fromToken, toToken, fromAmount, toAmount,
  fromPriceUSD, toPriceUSD, slippage, fee, priceImpact, minReceived,
  swapping, onCancel, onConfirm,
}: ConfirmSwapProps) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 600, duration: 200, useNativeDriver: true }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim]);

  const impactColor = priceImpact < 1 ? Colors.success : priceImpact < 3 ? Colors.warning : Colors.error;
  const feeUSD = fee * toPriceUSD;
  const fromValueUSD = fromAmount * fromPriceUSD;
  const toValueUSD = toAmount * toPriceUSD;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[cm.overlay, { opacity: overlayAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={swapping ? undefined : onCancel} />
      </Animated.View>
      <Animated.View style={[cm.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={cm.handle} />

        {/* Header */}
        <View style={cm.hdr}>
          <View style={cm.hdrIconWrap}>
            <MaterialIcons name="swap-horiz" size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cm.hdrTitle}>Confirm Swap</Text>
            <Text style={cm.hdrSub}>{fromToken.symbol} → {toToken.symbol}</Text>
          </View>
          {!swapping && (
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* From → To visual */}
        <View style={cm.arrowBlock}>
          {/* From */}
          <View style={cm.tokenBlock}>
            <TokenLogo token={fromToken} size={48} />
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text style={cm.tokenAmt}>{fmt(fromAmount)}</Text>
              <Text style={[cm.tokenSym, { color: fromToken.color }]}>{fromToken.symbol}</Text>
              <Text style={cm.tokenVal}>{fmtUSD(fromValueUSD)}</Text>
            </View>
          </View>
          {/* Arrow */}
          <View style={cm.arrowCircle}>
            <MaterialIcons name="arrow-forward" size={22} color={Colors.primary} />
          </View>
          {/* To */}
          <View style={cm.tokenBlock}>
            <TokenLogo token={toToken} size={48} />
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text style={cm.tokenAmt}>{fmt(toAmount)}</Text>
              <Text style={[cm.tokenSym, { color: toToken.color }]}>{toToken.symbol}</Text>
              <Text style={cm.tokenVal}>{fmtUSD(toValueUSD)}</Text>
            </View>
          </View>
        </View>

        {/* Details table */}
        <View style={cm.detailCard}>
          {[
            { label: 'Exchange Rate',  value: `1 ${fromToken.symbol} = ${fmt(fromPriceUSD / Math.max(toPriceUSD, 0.000001))} ${toToken.symbol}`,  color: Colors.textPrimary },
            { label: 'Price Impact',   value: `${priceImpact.toFixed(3)}%`,   color: impactColor },
            { label: 'Slippage',       value: `${slippage}%`,                color: Colors.warning },
            { label: 'Min Received',   value: `${fmt(minReceived)} ${toToken.symbol}`, color: Colors.textPrimary },
            { label: 'Swap Fee (0.3%)',value: `${fmt(fee, 8)} ${toToken.symbol} (${fmtUSD(feeUSD)})`, color: Colors.textMuted },
          ].map((row, i, arr) => (
            <View key={row.label} style={[cm.detailRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
              <Text style={cm.detailLabel}>{row.label}</Text>
              <Text style={[cm.detailVal, { color: row.color }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Warning if price impact high */}
        {priceImpact >= 2 && (
          <View style={[cm.impactWarn, { borderColor: impactColor + '55', backgroundColor: impactColor + '10' }]}>
            <MaterialIcons name="warning" size={14} color={impactColor} />
            <Text style={[cm.impactWarnText, { color: impactColor }]}>
              {priceImpact >= 3 ? 'High price impact — this swap may receive significantly less than expected.' : 'Moderate price impact — you may receive less than the displayed amount.'}
            </Text>
          </View>
        )}

        {/* Confirm button */}
        <TouchableOpacity
          style={[cm.confirmBtn, swapping && { opacity: 0.65 }]}
          onPress={onConfirm}
          disabled={swapping}
          activeOpacity={0.85}
        >
          {swapping
            ? <ActivityIndicator color={Colors.bg} size="small" />
            : <MaterialIcons name="check-circle" size={20} color={Colors.bg} />
          }
          <Text style={cm.confirmBtnText}>{swapping ? 'Processing Swap…' : 'Confirm Swap'}</Text>
        </TouchableOpacity>
        <Text style={cm.disclaimer}>
          Swap is simulated on BTNG Sovereign Chain. Prices are indicative based on live oracle data.
        </Text>
      </Animated.View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay:       { ...StyleSheet.absoluteFillObject as any, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:         { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bgCard, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36 },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  hdr:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.primaryGlow },
  hdrIconWrap:   { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  hdrTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  hdrSub:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  arrowBlock:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.lg, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  tokenBlock:    { flex: 1, alignItems: 'center', gap: Spacing.sm },
  tokenAmt:      { fontSize: 17, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'center' },
  tokenSym:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  tokenVal:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  arrowCircle:   { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center' },
  detailCard:    { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.sm },
  detailRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  detailLabel:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  detailVal:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false, flexShrink: 1, textAlign: 'right', maxWidth: '65%' },
  impactWarn:    { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginHorizontal: Spacing.xl, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  impactWarnText:{ flex: 1, fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },
  confirmBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, marginHorizontal: Spacing.xl, borderRadius: Radius.xl, paddingVertical: Spacing.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6, marginTop: Spacing.sm },
  confirmBtnText:{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  disclaimer:    { fontSize: 9, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, includeFontPadding: false },
});

// ─── Recent Swap Card ─────────────────────────────────────────────────────────
interface SwapRecord {
  id: string;
  coin: string;
  amount: number;
  price: number | null;
  total_usd: number | null;
  note: string | null;
  created_at: string;
}

function RecentSwapRow({ rec }: { rec: SwapRecord }) {
  const noteParts = rec.note?.match(/Swap (\w+) → (\w+)/);
  const from = noteParts?.[1] ?? rec.coin;
  const to = noteParts?.[2] ?? '?';
  const fromToken = TOKENS.find(t => t.symbol === from);
  const toToken = TOKENS.find(t => t.symbol === to);
  const d = new Date(rec.created_at);
  const timeStr = `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <View style={rs.row}>
      <View style={rs.icons}>
        <View style={[rs.iconCircle, { backgroundColor: (fromToken?.color ?? Colors.primary) + '22', borderColor: (fromToken?.color ?? Colors.primary) + '55' }]}>
          <Text style={{ fontSize: 9, fontWeight: FontWeight.heavy, color: fromToken?.color ?? Colors.primary }}>{from.slice(0, 3)}</Text>
        </View>
        <MaterialIcons name="arrow-forward" size={10} color={Colors.textMuted} />
        <View style={[rs.iconCircle, { backgroundColor: (toToken?.color ?? Colors.success) + '22', borderColor: (toToken?.color ?? Colors.success) + '55' }]}>
          <Text style={{ fontSize: 9, fontWeight: FontWeight.heavy, color: toToken?.color ?? Colors.success }}>{to.slice(0, 3)}</Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={rs.swapLabel}>Swap {from} → {to}</Text>
        <Text style={rs.timeLabel}>{timeStr}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={rs.amtText}>{fmt(rec.amount)} {from}</Text>
        {rec.total_usd ? (
          <Text style={rs.usdText}>{fmtUSD(rec.total_usd)}</Text>
        ) : null}
      </View>
      <View style={rs.doneBadge}>
        <Text style={rs.doneBadgeText}>DONE</Text>
      </View>
    </View>
  );
}

const rs = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  icons:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconCircle:    { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  swapLabel:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  timeLabel:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  amtText:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  usdText:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  doneBadge:     { backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '44' },
  doneBadgeText: { fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false, letterSpacing: 0.5 },
});

// ─── Main Swap Screen ─────────────────────────────────────────────────────────
export default function BTNGSwapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { priceUSD: goldOracleUSD, loading: oracleLoading, refresh: refreshOracle, source: oracleSource } = useGoldOracle();
  const { fullPrices, loading: pricesLoading, refresh: refreshPrices, source: pricesSource } = useCryptoPrices();

  // Token state
  const [fromToken, setFromToken] = useState<SwapToken>(TOKENS[0]); // BTNGG
  const [toToken,   setToToken]   = useState<SwapToken>(TOKENS[1]); // USDT
  const [fromAmount, setFromAmount] = useState('');
  const [slippage,   setSlippage]   = useState<SlippageOption>(0.5);

  // Modal state
  const [tokenModal,   setTokenModal]   = useState<'from' | 'to' | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [swapping,     setSwapping]     = useState(false);

  // ── Zone Engine state ────────────────────────────────────────────────────
  const [activeZone, setActiveZone]     = useState<ZoneResolution | null>(null);
  const [zoneBlocked, setZoneBlocked]   = useState<{ reason: string; maxAmount: number } | null>(null);

  // Recent swaps
  const [recentSwaps, setRecentSwaps] = useState<SwapRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // FROM token live balance
  const [fromBalance, setFromBalance]               = useState<number | null>(null);
  const [fromBalanceLoading, setFromBalanceLoading] = useState(false);
  const [toBalance, setToBalance]                   = useState<number | null>(null);
  const [toBalanceLoading, setToBalanceLoading]     = useState(false);

  // ── Resolve zone on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    try {
      const profileUser = user as any;
      const country: string = profileUser?.country ?? profileUser?.registeredCountry ?? 'GH';
      const rawKyc: string  = profileUser?.kyc_status ?? 'pending';
      const kycLevel: 'NONE' | 'BASIC' | 'FULL' =
        rawKyc === 'approved' ? 'FULL' :
        rawKyc === 'pending'  ? 'BASIC' : 'NONE';
      const resolution = zoneEngine.resolveZone({
        userId: user.id,
        registeredCountry: country,
        kycLevel,
        userTier: 'STANDARD',
      });
      setActiveZone(resolution);
    } catch (e) {
      console.warn('[ZoneEngine] resolve failed:', e);
    }
  }, [user?.id]);

  // Flip animation
  const flipAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse the live dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // ── Prices map ───────────────────────────────────────────────────────────────
  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    TOKENS.forEach(t => {
      m[t.symbol] = getTokenPrice(t.symbol, goldOracleUSD, fullPrices as any);
    });
    return m;
  }, [goldOracleUSD, fullPrices]);

  const fromPrice = priceMap[fromToken.symbol] ?? 0;
  const toPrice   = priceMap[toToken.symbol]   ?? 0;

  // ── Swap math ────────────────────────────────────────────────────────────────
  const fromAmountNum = parseFloat(fromAmount.replace(/,/g, '')) || 0;
  const swapRate     = toPrice > 0 ? fromPrice / toPrice : 0;    // TO tokens per 1 FROM token
  const rawOutput    = fromAmountNum * swapRate;
  const feeRate      = 0.003;                                     // 0.3% protocol fee
  const feeAmount    = rawOutput * feeRate;
  const outputAfterFee = rawOutput - feeAmount;
  const minReceived  = outputAfterFee * (1 - slippage / 100);
  const priceImpact  = fromAmountNum > 0 ? Math.min(0.08 + (fromAmountNum * fromPrice) / 500000, 3.5) : 0; // simulated

  const fromValueUSD = fromAmountNum * fromPrice;
  const toValueUSD   = outputAfterFee * toPrice;

  // ── Rate string ──────────────────────────────────────────────────────────────
  const rateStr = swapRate > 0
    ? `1 ${fromToken.symbol} = ${fmt(swapRate)} ${toToken.symbol}`
    : '—';

  const inverseRateStr = (swapRate > 0 && toPrice > 0 && fromPrice > 0)
    ? `1 ${toToken.symbol} = ${fmt(1 / swapRate)} ${fromToken.symbol}`
    : '';

  // ── TO token balance ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) { setToBalance(null); return; }
    let cancelled = false;
    setToBalance(null);
    setToBalanceLoading(true);
    (async () => {
      try {
        const sb = getSupabaseClient();
        if (toToken.symbol === 'BTNGG') {
          const { data } = await sb
            .from('btng_wallets')
            .select('balance')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!cancelled) setToBalance(data?.balance ?? 0);
        } else {
          const { data } = await sb
            .from('trade_history')
            .select('type, amount')
            .eq('user_id', user.id)
            .eq('coin', toToken.symbol);
          if (!cancelled && data) {
            const net = (data as any[]).reduce((acc, row) => {
              if (['buy', 'deposit', 'receive'].includes(row.type))    return acc + (row.amount ?? 0);
              if (['sell', 'withdraw', 'send', 'transfer'].includes(row.type)) return acc - (row.amount ?? 0);
              return acc;
            }, 0);
            setToBalance(Math.max(0, net));
          } else if (!cancelled) {
            setToBalance(0);
          }
        }
      } catch { if (!cancelled) setToBalance(0); }
      if (!cancelled) setToBalanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, toToken.symbol]);

  // ── FROM token balance ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) { setFromBalance(null); return; }
    let cancelled = false;
    setFromBalance(null);
    setFromBalanceLoading(true);
    (async () => {
      try {
        const sb = getSupabaseClient();
        if (fromToken.symbol === 'BTNGG') {
          // Live balance from btng_wallets
          const { data } = await sb
            .from('btng_wallets')
            .select('balance')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!cancelled) setFromBalance(data?.balance ?? 0);
        } else {
          // Net position = sum(buys+deposits) - sum(sells+withdrawals) from trade_history
          const { data } = await sb
            .from('trade_history')
            .select('type, amount')
            .eq('user_id', user.id)
            .eq('coin', fromToken.symbol);
          if (!cancelled && data) {
            const net = (data as any[]).reduce((acc, row) => {
              if (['buy', 'deposit', 'receive'].includes(row.type))    return acc + (row.amount ?? 0);
              if (['sell', 'withdraw', 'send', 'transfer'].includes(row.type)) return acc - (row.amount ?? 0);
              return acc;
            }, 0);
            setFromBalance(Math.max(0, net));
          } else if (!cancelled) {
            setFromBalance(0);
          }
        }
      } catch { if (!cancelled) setFromBalance(0); }
      if (!cancelled) setFromBalanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, fromToken.symbol]);

  // ── Flip tokens ──────────────────────────────────────────────────────────────
  const handleFlip = useCallback(() => {
    Animated.sequence([
      Animated.timing(flipAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
    setFromToken(prev => { setToToken(prev); return toToken; });
    setFromAmount(outputAfterFee > 0 ? fmt(outputAfterFee, 6) : '');
  }, [toToken, outputAfterFee, flipAnim]);

  const flipRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  // ── Fetch recent swaps ────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!user?.id) return;
    setLoadingHistory(true);
    try {
      const sb = getSupabaseClient();
      const { data } = await sb
        .from('trade_history')
        .select('id,coin,amount,price,total_usd,note,created_at')
        .eq('user_id', user.id)
        .eq('type', 'sell')
        .like('note', 'Swap %')
        .order('created_at', { ascending: false })
        .limit(8);
      if (data) setRecentSwaps(data as SwapRecord[]);
    } catch { /* silent */ }
    setLoadingHistory(false);
  }, [user?.id]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // ── Validation ───────────────────────────────────────────────────────────────
  const canSwap = fromAmountNum > 0 && fromPrice > 0 && toPrice > 0 && swapRate > 0;

  const handleSwapPress = useCallback(() => {
    if (!user) {
      showAlert('Sign In Required', 'Please sign in to swap tokens.');
      return;
    }
    if (!canSwap) {
      showAlert('Invalid Amount', 'Enter a valid amount to swap.');
      return;
    }

    // ── Zone rule check ──────────────────────────────────────────────────────
    setZoneBlocked(null);
    if (activeZone) {
      try {
        const decision = zoneEngine.evaluateRules({
          userId:  user.id,
          zoneId:  activeZone.zoneId,
          assetId: fromToken.symbol === 'BTNGG' ? 'BTNGG' : fromToken.symbol,
          amount:  fromAmountNum,
          action:  'SWAP',
        });
        if (!decision.allowed) {
          setZoneBlocked({
            reason:    decision.reason ?? 'Zone swap limit exceeded.',
            maxAmount: decision.maxAmount ?? 0,
          });
          return;
        }
      } catch (e) {
        console.warn('[ZoneEngine] evaluate failed:', e);
      }
    }

    setConfirmModal(true);
  }, [user, canSwap, activeZone, fromToken.symbol, fromAmountNum, showAlert]);

  // ── Execute swap ──────────────────────────────────────────────────────────────
  const handleConfirmSwap = useCallback(async () => {
    if (!user?.id || !canSwap) return;
    setSwapping(true);
    try {
      const sb = getSupabaseClient();
      const swapNote = `Swap ${fromToken.symbol} → ${toToken.symbol}`;
      const now = new Date().toISOString();

      // Leg 1: Sell FROM token
      const leg1 = {
        user_id:    user.id,
        type:       'sell',
        coin:       fromToken.symbol,
        coin_name:  fromToken.name,
        amount:     fromAmountNum,
        price:      fromPrice,
        total_usd:  fromValueUSD,
        fee:        feeAmount * toPrice,
        status:     'completed',
        note:       swapNote,
      };

      // Leg 2: Buy TO token
      const leg2 = {
        user_id:    user.id,
        type:       'buy',
        coin:       toToken.symbol,
        coin_name:  toToken.name,
        amount:     outputAfterFee,
        price:      toPrice,
        total_usd:  toValueUSD,
        fee:        0,
        status:     'completed',
        note:       swapNote,
      };

      const { error } = await sb
        .from('trade_history')
        .insert([leg1, leg2]);

      if (error) {
        showAlert('Swap Failed', error.message);
        return;
      }

      setConfirmModal(false);
      setFromAmount('');
      await fetchHistory();

      showAlert(
        'Swap Complete',
        `Successfully swapped ${fmt(fromAmountNum)} ${fromToken.symbol} for ~${fmt(outputAfterFee)} ${toToken.symbol}.\n\nBoth legs recorded in your trade history.`
      );
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Swap failed. Please try again.');
    } finally {
      setSwapping(false);
    }
  }, [
    user, canSwap, fromToken, toToken,
    fromAmountNum, fromPrice, toPrice, fromValueUSD, toValueUSD,
    feeAmount, outputAfterFee, fetchHistory, showAlert,
  ]);

  const isLive = oracleSource === 'live' || pricesSource === 'live';
  const btnggPrice = priceMap['BTNGG'] ?? 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>BTNG Swap</Text>
            <Text style={styles.headerSub}>Sovereign token exchange · 54 Africa Nations</Text>
          </View>
          <View style={[styles.liveBadge, { backgroundColor: isLive ? Colors.successBg : Colors.warningBg, borderColor: (isLive ? Colors.success : Colors.warning) + '44' }]}>
            <Animated.View style={[styles.liveDot, { backgroundColor: isLive ? Colors.success : Colors.warning, opacity: pulseAnim }]} />
            <Text style={[styles.liveText, { color: isLive ? Colors.success : Colors.warning }]}>
              {oracleLoading || pricesLoading ? 'SYNCING' : isLive ? 'LIVE' : 'CACHED'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { refreshOracle(); refreshPrices(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="refresh" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Oracle strip ── */}
        <View style={styles.oracleStrip}>
          <Image source={BTNG_COIN_IMG} style={styles.oracleCoin} contentFit="cover" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.oracleLabel}>BTNGG Live Price · 1/1000 oz XAU</Text>
            <Text style={styles.oraclePrice}>
              {btnggPrice > 0 ? fmtUSD(btnggPrice) : '—'}
            </Text>
          </View>
          <View style={styles.oracleRight}>
            {TOKENS.filter(t => !t.isGold && !t.isStable && ['BTC', 'ETH', 'SOL'].includes(t.symbol)).map(t => (
              <View key={t.id} style={styles.oracleMiniTicker}>
                <Text style={[styles.oracleMiniSym, { color: t.color }]}>{t.symbol}</Text>
                <Text style={styles.oracleMiniPrice}>
                  {priceMap[t.symbol] > 0 ? fmtUSD(priceMap[t.symbol]) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 7-Day Pair Price Chart ── */}
        {(fromPrice > 0 || toPrice > 0) && (
          <SwapPriceChart
            fromToken={fromToken}
            toToken={toToken}
            fromPrice={fromPrice > 0 ? fromPrice : 1}
            toPrice={toPrice > 0 ? toPrice : 1}
          />
        )}

        {/* ── Slippage Selector ── */}
        <View style={styles.slippageCard}>
          <View style={styles.slippageHeader}>
            <MaterialIcons name="tune" size={14} color={Colors.textMuted} />
            <Text style={styles.slippageLabel}>Slippage Tolerance</Text>
            <View style={styles.slippageHint}>
              <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.slippageHintText}>Max price movement you accept</Text>
            </View>
          </View>
          <View style={styles.slippageRow}>
            {SLIPPAGE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[styles.slippageBtn, slippage === opt && styles.slippageBtnActive]}
                onPress={() => setSlippage(opt)}
                activeOpacity={0.8}
              >
                <Text style={[styles.slippageBtnText, slippage === opt && styles.slippageBtnTextActive]}>
                  {opt}%
                </Text>
                {opt === 0.5 && <Text style={[styles.slippageTag, slippage === opt && { color: Colors.bg }]}>Safe</Text>}
                {opt === 1.0 && <Text style={[styles.slippageTag, slippage === opt && { color: Colors.bg }]}>Mid</Text>}
                {opt === 2.0 && <Text style={[styles.slippageTag, slippage === opt && { color: Colors.bg }]}>Fast</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Swap Card ── */}
        <View style={styles.swapCard}>
          {/* ── FROM token ── */}
          <View style={styles.tokenSection}>
            <View style={styles.tokenSectionHeader}>
              <Text style={styles.tokenSectionLabel}>FROM</Text>
              <View style={styles.tokenHeaderRight}>
                <Text style={styles.tokenPrice}>
                  {fromPrice > 0 ? fmtUSD(fromPrice) + ' / ' + fromToken.symbol : '—'}
                </Text>
                {user ? (
                  fromBalanceLoading ? (
                    <ActivityIndicator size="small" color={Colors.textMuted} />
                  ) : fromBalance !== null ? (
                    <View style={styles.balanceRow}>
                      <MaterialIcons name="account-balance-wallet" size={10} color={Colors.textMuted} />
                      <Text style={styles.balanceText}>
                        {fmt(fromBalance, 6)} {fromToken.symbol}
                      </Text>
                      {fromBalance > 0 ? (
                        <TouchableOpacity
                          style={styles.maxBtn}
                          onPress={() => setFromAmount(String(fromBalance))}
                          activeOpacity={0.8}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Text style={styles.maxBtnText}>MAX</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null
                ) : null}
              </View>
            </View>

            <View style={styles.tokenInputRow}>
              {/* Token selector */}
              <TouchableOpacity
                style={[styles.tokenSelector, { borderColor: fromToken.color + '55', backgroundColor: fromToken.color + '0C' }]}
                onPress={() => setTokenModal('from')}
                activeOpacity={0.85}
              >
                <TokenLogo token={fromToken} size={32} />
                <View style={{ gap: 1 }}>
                  <Text style={[styles.tokenSelectorSymbol, { color: fromToken.color }]}>{fromToken.symbol}</Text>
                  <Text style={styles.tokenSelectorName} numberOfLines={1}>{fromToken.name}</Text>
                </View>
                <MaterialIcons name="keyboard-arrow-down" size={16} color={fromToken.color} />
              </TouchableOpacity>

              {/* Amount input */}
              <View style={styles.amountInputWrap}>
                <TextInput
                  style={styles.amountInput}
                  value={fromAmount}
                  onChangeText={v => setFromAmount(v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.000000"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                {fromValueUSD > 0 && (
                  <Text style={styles.amountUSD}>{fmtUSD(fromValueUSD)}</Text>
                )}
              </View>
            </View>

            {/* Quick percent buttons */}
            <View style={styles.percentRow}>
              {[25, 50, 75, 100].map(pct => (
                <TouchableOpacity
                  key={pct}
                  style={styles.percentBtn}
                  onPress={() => {
                    if (fromBalance !== null && fromBalance > 0) {
                      // Use real balance when available
                      setFromAmount(String((fromBalance * pct / 100).toFixed(8)));
                    } else if (fromPrice > 0) {
                      // Fallback: reference $10 per button tap
                      const refAmt = 10;
                      setFromAmount(String((refAmt * pct / 100).toFixed(4)));
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.percentBtnText}>{pct}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Flip button ── */}
          <View style={styles.flipRow}>
            <View style={styles.flipDivider} />
            <Animated.View style={{ transform: [{ rotate: flipRotate }] }}>
              <TouchableOpacity
                style={styles.flipBtn}
                onPress={handleFlip}
                activeOpacity={0.8}
              >
                <MaterialIcons name="swap-vert" size={22} color={Colors.primary} />
              </TouchableOpacity>
            </Animated.View>
            <View style={styles.flipDivider} />
          </View>

          {/* ── TO token ── */}
          <View style={styles.tokenSection}>
            <View style={styles.tokenSectionHeader}>
              <Text style={styles.tokenSectionLabel}>TO (ESTIMATED)</Text>
              <View style={styles.tokenHeaderRight}>
                <Text style={styles.tokenPrice}>
                  {toPrice > 0 ? fmtUSD(toPrice) + ' / ' + toToken.symbol : '—'}
                </Text>
                {user ? (
                  toBalanceLoading ? (
                    <ActivityIndicator size="small" color={Colors.textMuted} />
                  ) : toBalance !== null ? (
                    <View style={styles.balanceRow}>
                      <MaterialIcons name="account-balance-wallet" size={10} color={Colors.textMuted} />
                      <Text style={styles.balanceText}>
                        {fmt(toBalance, 6)} {toToken.symbol}
                      </Text>
                    </View>
                  ) : null
                ) : null}
              </View>
            </View>

            <View style={styles.tokenInputRow}>
              {/* Token selector */}
              <TouchableOpacity
                style={[styles.tokenSelector, { borderColor: toToken.color + '55', backgroundColor: toToken.color + '0C' }]}
                onPress={() => setTokenModal('to')}
                activeOpacity={0.85}
              >
                <TokenLogo token={toToken} size={32} />
                <View style={{ gap: 1 }}>
                  <Text style={[styles.tokenSelectorSymbol, { color: toToken.color }]}>{toToken.symbol}</Text>
                  <Text style={styles.tokenSelectorName} numberOfLines={1}>{toToken.name}</Text>
                </View>
                <MaterialIcons name="keyboard-arrow-down" size={16} color={toToken.color} />
              </TouchableOpacity>

              {/* Output (read-only) */}
              <View style={[styles.amountInputWrap, { backgroundColor: Colors.bgElevated }]}>
                <Text style={[styles.amountInput, {
                  color: canSwap && outputAfterFee > 0 ? Colors.success : Colors.textMuted,
                  paddingVertical: 12,
                }]}>
                  {canSwap && outputAfterFee > 0 ? fmt(outputAfterFee) : '0.000000'}
                </Text>
                {toValueUSD > 0 && (
                  <Text style={styles.amountUSD}>{fmtUSD(toValueUSD)}</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ── Rate Info ── */}
        {canSwap && (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <MaterialIcons name="show-chart" size={13} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Rate</Text>
              <Text style={styles.infoValue}>{rateStr}</Text>
            </View>
            {inverseRateStr ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="compare-arrows" size={13} color={Colors.textMuted} />
                <Text style={styles.infoLabel}>Inverse</Text>
                <Text style={styles.infoValue}>{inverseRateStr}</Text>
              </View>
            ) : null}
            <View style={styles.infoRow}>
              <MaterialIcons name="speed" size={13} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Price Impact</Text>
              <Text style={[styles.infoValue, {
                color: priceImpact < 1 ? Colors.success : priceImpact < 3 ? Colors.warning : Colors.error,
              }]}>
                {priceImpact.toFixed(3)}%
              </Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialIcons name="arrow-downward" size={13} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Min Received</Text>
              <Text style={styles.infoValue}>
                {fmt(minReceived)} {toToken.symbol}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <MaterialIcons name="account-balance" size={13} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Swap Fee (0.3%)</Text>
              <Text style={styles.infoValue}>
                {fmt(feeAmount, 8)} {toToken.symbol}
              </Text>
            </View>

            {/* Route */}
            <View style={styles.routeRow}>
              <MaterialIcons name="alt-route" size={11} color={Colors.textMuted} />
              <Text style={styles.routeLabel}>Route:</Text>
              <View style={styles.routeChips}>
                {[fromToken, toToken].map((t, i) => (
                  <React.Fragment key={t.id}>
                    <View style={[styles.routeChip, { backgroundColor: t.color + '18', borderColor: t.color + '44' }]}>
                      <Text style={[styles.routeChipText, { color: t.color }]}>{t.symbol}</Text>
                    </View>
                    {i < 1 && <MaterialIcons name="arrow-forward" size={10} color={Colors.textMuted} />}
                  </React.Fragment>
                ))}
              </View>
              <View style={styles.routeEngine}>
                <Text style={styles.routeEngineText}>BTNG DEX</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Zone Block Banner ───────────────────────────────────────────── */}
        {zoneBlocked ? (
          <View style={styles.zoneBlockBanner}>
            <View style={styles.zoneBlockHeader}>
              <MaterialIcons name="block" size={18} color="#EF4444" />
              <Text style={styles.zoneBlockTitle}>Swap Blocked by Zone Policy</Text>
            </View>
            <Text style={styles.zoneBlockReason}>{zoneBlocked.reason}</Text>
            {zoneBlocked.maxAmount > 0 ? (
              <View style={styles.zoneBlockLimitRow}>
                <MaterialIcons name="info-outline" size={13} color="#EF4444" />
                <Text style={styles.zoneBlockLimit}>
                  Max swap in{' '}
                  <Text style={{ fontWeight: FontWeight.heavy }}>
                    {activeZone?.zoneId.replace(/_/g, ' ')}
                  </Text>
                  {': '}{zoneBlocked.maxAmount.toLocaleString()} BTNGG
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.zoneBlockKycBtn}
              onPress={() => router.push('/kyc' as any)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="verified-user" size={14} color={Colors.primary} />
              <Text style={styles.zoneBlockKycText}>Upgrade KYC to unlock higher limits</Text>
              <MaterialIcons name="arrow-forward" size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Swap Button ── */}
        <TouchableOpacity
          style={[styles.swapBtn, (!canSwap || !user) && styles.swapBtnDisabled]}
          onPress={handleSwapPress}
          activeOpacity={0.85}
        >
          <MaterialIcons name="currency-exchange" size={22} color={Colors.bg} />
          <Text style={styles.swapBtnText}>
            {!user ? 'Sign In to Swap' : !canSwap ? 'Enter Amount' : `Swap ${fromToken.symbol} → ${toToken.symbol}`}
          </Text>
        </TouchableOpacity>

        {/* ── BTNG DEX Info ── */}
        <View style={styles.dexInfoCard}>
          <View style={styles.dexInfoRow}>
            <MaterialIcons name="security" size={13} color={Colors.primary} />
            <Text style={styles.dexInfoText}>BTNG Sovereign DEX · 54 Africa Nations</Text>
          </View>
          <View style={styles.dexInfoRow}>
            <MaterialIcons name="verified-user" size={13} color={Colors.success} />
            <Text style={styles.dexInfoText}>Gold-backed liquidity · BTNGG Oracle pricing</Text>
          </View>
          <View style={styles.dexInfoRow}>
            <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
            <Text style={[styles.dexInfoText, { color: Colors.textMuted }]}>All swaps are simulated on BTNG Sovereign Chain and recorded in your trade history for audit.</Text>
          </View>
        </View>

        {/* ── Recent Swaps ── */}
        {user && (
          <View style={styles.recentCard}>
            <View style={styles.recentHeader}>
              <MaterialIcons name="history" size={15} color={Colors.primary} />
              <Text style={styles.recentTitle}>Recent Swaps</Text>
              {loadingHistory && <ActivityIndicator size="small" color={Colors.primary} />}
              <TouchableOpacity onPress={fetchHistory} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <MaterialIcons name="refresh" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {recentSwaps.length === 0 && !loadingHistory ? (
              <View style={styles.recentEmpty}>
                <MaterialIcons name="swap-horiz" size={28} color={Colors.textMuted} />
                <Text style={styles.recentEmptyText}>No swaps yet</Text>
                <Text style={styles.recentEmptySub}>Your swap history will appear here after your first trade.</Text>
              </View>
            ) : (
              recentSwaps.map(rec => <RecentSwapRow key={rec.id} rec={rec} />)
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Token Selector Modal ── */}
      <TokenSelectorModal
        visible={tokenModal !== null}
        onClose={() => setTokenModal(null)}
        onSelect={tok => {
          if (tokenModal === 'from') setFromToken(tok);
          else setToToken(tok);
          setTokenModal(null);
        }}
        excludeId={tokenModal === 'from' ? toToken.id : fromToken.id}
        prices={priceMap}
      />

      {/* ── Confirm Modal ── */}
      <ConfirmSwapModal
        visible={confirmModal}
        fromToken={fromToken}
        toToken={toToken}
        fromAmount={fromAmountNum}
        toAmount={outputAfterFee}
        fromPriceUSD={fromPrice}
        toPriceUSD={toPrice}
        slippage={slippage}
        fee={feeAmount}
        priceImpact={priceImpact}
        minReceived={minReceived}
        swapping={swapping}
        onCancel={() => !swapping && setConfirmModal(false)}
        onConfirm={handleConfirmSwap}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, includeFontPadding: false,
  },
  headerSub: {
    fontSize: 9, color: Colors.textMuted,
    includeFontPadding: false, marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1,
  },
  liveDot:  { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },

  // Oracle Strip
  oracleStrip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.xl, marginTop: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  oracleCoin:      { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: Colors.primary },
  oracleLabel:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  oraclePrice:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  oracleRight:     { gap: 4, alignItems: 'flex-end' },
  oracleMiniTicker:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  oracleMiniSym:   { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  oracleMiniPrice: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  // Slippage
  slippageCard: {
    marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: Spacing.sm,
  },
  slippageHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slippageLabel:   { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  slippageHint:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  slippageHintText:{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  slippageRow:     { flexDirection: 'row', gap: Spacing.sm },
  slippageBtn: {
    flex: 1, alignItems: 'center', gap: 2,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg, borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  slippageBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  slippageBtnText: {
    fontSize: FontSize.sm, fontWeight: FontWeight.heavy,
    color: Colors.textPrimary, includeFontPadding: false,
  },
  slippageBtnTextActive: { color: Colors.bg },
  slippageTag: {
    fontSize: 8, fontWeight: FontWeight.semibold,
    color: Colors.textMuted, includeFontPadding: false,
  },

  // Swap Card
  swapCard: {
    marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tokenSection:       { padding: Spacing.md, gap: Spacing.sm },
  tokenSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tokenSectionLabel:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  tokenHeaderRight:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  tokenPrice:         { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  balanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  balanceText: {
    fontSize: 9, color: Colors.textMuted,
    includeFontPadding: false, fontWeight: FontWeight.semibold,
  },
  maxBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 3,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35, shadowRadius: 4, elevation: 2,
  },
  maxBtnText: {
    fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg,
    letterSpacing: 0.5, includeFontPadding: false,
  },
  tokenInputRow:      { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm },
  tokenSelector: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm,
    borderRadius: Radius.lg, borderWidth: 1.5,
    minWidth: 120, maxWidth: 150, flexShrink: 0,
  },
  tokenSelectorSymbol: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  tokenSelectorName:   { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, maxWidth: 60 },
  amountInputWrap: {
    flex: 1, backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 4, gap: 2,
    justifyContent: 'center',
    minHeight: 60,
  },
  amountInput: {
    fontSize: 18, fontWeight: FontWeight.heavy, color: Colors.textPrimary,
    includeFontPadding: false, paddingVertical: 8,
  },
  amountUSD: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  percentRow: { flexDirection: 'row', gap: 6 },
  percentBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 5,
    borderRadius: Radius.md, backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  percentBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },

  // Flip button
  flipRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  flipDivider: { flex: 1, height: 1, backgroundColor: Colors.border },
  flipBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 2, borderColor: Colors.primary + '66',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },

  // Info Card
  infoCard: {
    marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  infoLabel: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  infoValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'right', maxWidth: '60%' },

  // Route row
  routeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.bgElevated,
  },
  routeLabel:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  routeChips:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  routeChip:      { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  routeChipText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  routeEngine:    { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  routeEngineText:{ fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },

  // Swap Button
  swapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
    borderRadius: Radius.xl, paddingVertical: Spacing.lg + 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  swapBtnDisabled: { opacity: 0.4 },
  swapBtnText: {
    fontSize: FontSize.md, fontWeight: FontWeight.bold,
    color: Colors.bg, includeFontPadding: false,
  },

  // Zone block banner
  zoneBlockBanner: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    backgroundColor: '#EF444412',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EF444455',
    padding: Spacing.md,
    gap: 8,
  },
  zoneBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoneBlockTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.heavy,
    color: '#EF4444',
    includeFontPadding: false,
    flex: 1,
  },
  zoneBlockReason: {
    fontSize: FontSize.xs,
    color: '#FCA5A5',
    lineHeight: 18,
    includeFontPadding: false,
  },
  zoneBlockLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EF444420',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  zoneBlockLimit: {
    fontSize: FontSize.xs,
    color: '#FCA5A5',
    includeFontPadding: false,
    flex: 1,
  },
  zoneBlockKycBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 2,
  },
  zoneBlockKycText: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },

  // DEX Info Card
  dexInfoCard: {
    marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: 8,
  },
  dexInfoRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dexInfoText: { flex: 1, fontSize: 10, color: Colors.textSecondary, lineHeight: 14, includeFontPadding: false },

  // Recent Swaps
  recentCard: {
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  recentHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.primaryGlow,
  },
  recentTitle:    { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  recentEmpty:    { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  recentEmptyText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  recentEmptySub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, paddingHorizontal: Spacing.xl, lineHeight: 14 },
});
