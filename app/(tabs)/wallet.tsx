
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Animated,
  TextInput, Modal, Pressable, Easing, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';

const BTNG_COIN_IMG = require('@/assets/images/btng_coin_logo.jpg');
const GOLD_SYMBOLS = new Set(['BTNGG', 'BTNG-G', 'BTNG-KG', 'BTNG']);
import Svg, { Path, Circle, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { LineChart } from 'react-native-chart-kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useWallet } from '@/contexts/WalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTrading } from '@/hooks/useTrading';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useNotifications } from '@/hooks/useNotifications';
import { usePortfolioChart } from '@/hooks/usePortfolioChart';
import { SectionHeader } from '@/components';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { TradeHistoryItem } from '@/services/tradingService';
import { useLivePoll } from '@/hooks/useLivePoll';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { useAlert, getSupabaseClient } from '@/template';
import { useDomainResolver, RESOLVABLE_DOMAINS } from '@/hooks/useDomainResolver';
import { ZoneEngine } from '@/constants/zoneEngine';
import type { ZoneResolution } from '@/constants/zoneResolver';

const zoneEngine = new ZoneEngine();

function ResolverChip({
  resolving, record, error, onAccept, onDismiss,
}: {
  resolving: boolean;
  record: { domain: string; chain: string; wallet_address: string; coin_symbol: string } | null;
  error: string | null;
  onAccept: (address: string) => void;
  onDismiss: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const visible = resolving || !!record || !!error;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: visible ? 1 : 0, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [visible, fadeAnim]);
  if (!visible) return null;
  return (
    <Animated.View style={[
      rchip.wrap,
      record ? rchip.wrapOk : error ? rchip.wrapErr : rchip.wrapLoading,
      { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] },
    ]}>
      {resolving ? (
        <View style={rchip.row}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={rchip.loadText}>Resolving domain record…</Text>
        </View>
      ) : record ? (
        <View style={rchip.row}>
          <MaterialIcons name="check-circle" size={16} color={Colors.success} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={rchip.okTitle}><Text style={{ color: Colors.success, fontWeight: FontWeight.heavy }}>{record.domain}</Text>{' → '}{record.chain}</Text>
            <Text style={rchip.okAddr} numberOfLines={1} ellipsizeMode="middle">{record.wallet_address}</Text>
            <Text style={rchip.okSub}>{record.coin_symbol} · Primary record</Text>
          </View>
          <TouchableOpacity style={rchip.fillBtn} onPress={() => onAccept(record.wallet_address)} activeOpacity={0.85}>
            <MaterialIcons name="arrow-downward" size={12} color={Colors.bg} />
            <Text style={rchip.fillBtnText}>Fill</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={14} color={Colors.success} />
          </TouchableOpacity>
        </View>
      ) : error ? (
        <View style={rchip.row}>
          <MaterialIcons name="error-outline" size={15} color={Colors.warning} />
          <Text style={[rchip.errText, { flex: 1 }]}>{error}</Text>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={13} color={Colors.warning} />
          </TouchableOpacity>
        </View>
      ) : null}
    </Animated.View>
  );
}
const rchip = StyleSheet.create({
  wrap:        { borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  wrapOk:      { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' },
  wrapErr:     { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '44' },
  wrapLoading: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  loadText:    { flex: 1, fontSize: FontSize.xs, color: Colors.primary, includeFontPadding: false },
  okTitle:     { fontSize: FontSize.xs, color: Colors.textPrimary, includeFontPadding: false },
  okAddr:      { fontSize: 10, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  okSub:       { fontSize: 9, color: Colors.success, includeFontPadding: false },
  errText:     { fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },
  fillBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.success, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  fillBtnText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
});
const rcs = StyleSheet.create({
  row:            { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  label:          { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  chip:           { paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  chipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:       { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  chipTextActive: { color: Colors.bg },
});

// ─── Quick Send Panel ─────────────────────────────────────────────────────────
function QuickSendPanel({ onFullTransfer }: { onFullTransfer: () => void }) {
  const { showAlert } = useAlert();
  const { resolving, resolvedRecord, resolveError, resolve, clear } = useDomainResolver();
  const [recipientInput, setRecipientInput] = useState('');
  const [resolverChain, setResolverChain]   = useState('BTNG');
  const [filledAddress, setFilledAddress]   = useState('');

  const handleInput = useCallback((v: string) => {
    setRecipientInput(v);
    setFilledAddress('');
    const trimmed = v.trim().toLowerCase();
    if (RESOLVABLE_DOMAINS.includes(trimmed)) resolve(trimmed, resolverChain);
    else clear();
  }, [resolve, clear, resolverChain]);

  const handleAccept = useCallback((address: string) => {
    setFilledAddress(address);
    setRecipientInput(address);
    clear();
  }, [clear]);

  const handleSend = useCallback(() => {
    if (!recipientInput.trim() && !filledAddress) {
      showAlert('Recipient Required', 'Enter a wallet address or type btng.gold / btng.token to resolve.');
      return;
    }
    onFullTransfer();
  }, [recipientInput, filledAddress, showAlert, onFullTransfer]);

  return (
    <View style={qsp.card}>
      <View style={qsp.header}>
        <View style={qsp.headerIcon}>
          <MaterialIcons name="send" size={15} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={qsp.headerTitle}>Quick Send</Text>
          <Text style={qsp.headerSub}>Resolve btng.gold · btng.token → wallet address</Text>
        </View>
        <View style={[qsp.web3Badge, { backgroundColor: '#8247E518', borderColor: '#8247E544' }]}>
          <Text style={{ fontSize: 9 }}>🌐</Text>
          <Text style={[qsp.web3BadgeText, { color: '#8247E5' }]}>Web3 DNS</Text>
        </View>
      </View>

      <View style={qsp.inputSection}>
        <View style={qsp.inputLabelRow}>
          <MaterialIcons name="person" size={11} color={Colors.textMuted} />
          <Text style={qsp.inputLabel}>Recipient Address or Web3 Domain</Text>
        </View>
        <View style={[qsp.inputRow, filledAddress ? { borderColor: Colors.success + '88' } : null]}>
          <MaterialIcons
            name={RESOLVABLE_DOMAINS.includes(recipientInput.trim().toLowerCase()) ? 'language' : 'account-balance-wallet'}
            size={16}
            color={filledAddress ? Colors.success : Colors.textMuted}
          />
          <TextInput
            style={qsp.textInput}
            value={recipientInput}
            onChangeText={handleInput}
            placeholder="BTNG-GOLD-GH-… or btng.gold / btng.token"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {recipientInput.length > 0 ? (
            <TouchableOpacity
              onPress={() => { setRecipientInput(''); setFilledAddress(''); clear(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Chain selector — visible when a domain is typed */}
        {RESOLVABLE_DOMAINS.includes(recipientInput.trim().toLowerCase()) && (
          <View style={rcs.row}>
            <MaterialIcons name="device-hub" size={11} color={Colors.textMuted} />
            <Text style={rcs.label}>Resolve on:</Text>
            {['BTNG', 'ETH', 'POLYGON', 'BTC', 'BNB', 'SOL'].map(c => (
              <TouchableOpacity
                key={c}
                style={[rcs.chip, resolverChain === c && rcs.chipActive]}
                onPress={() => { setResolverChain(c); resolve(recipientInput.trim().toLowerCase(), c); }}
                activeOpacity={0.8}
              >
                <Text style={[rcs.chipText, resolverChain === c && rcs.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Domain resolver chip */}
        <ResolverChip
          resolving={resolving}
          record={resolvedRecord}
          error={resolveError}
          onAccept={handleAccept}
          onDismiss={clear}
        />

        {/* Confirmed resolved address strip */}
        {filledAddress && !resolvedRecord && (
          <View style={qsp.resolvedStrip}>
            <MaterialIcons name="check-circle" size={12} color={Colors.success} />
            <Text style={qsp.resolvedText} numberOfLines={1} ellipsizeMode="middle">{filledAddress}</Text>
            <TouchableOpacity
              onPress={() => { setFilledAddress(''); setRecipientInput(''); clear(); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <MaterialIcons name="close" size={12} color={Colors.success} />
            </TouchableOpacity>
          </View>
        )}

        {/* Domain hint when input is empty */}
        {!recipientInput && (
          <Text style={qsp.hintText}>
            Type{' '}
            <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>btng.gold</Text>
            {' or '}
            <Text style={{ color: '#8247E5', fontWeight: FontWeight.bold }}>btng.token</Text>
            {' to auto-resolve a linked wallet address'}
          </Text>
        )}
      </View>

      {/* Domain quick-fill buttons */}
      <View style={qsp.domainRow}>
        {[{ key: 'btng.gold', emoji: '🪙', color: '#D4A017' }, { key: 'btng.token', emoji: '🔷', color: '#8247E5' }].map(d => (
          <TouchableOpacity
            key={d.key}
            style={[qsp.domainChip, { borderColor: d.color + '55', backgroundColor: d.color + '10' }]}
            onPress={() => handleInput(d.key)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 12 }}>{d.emoji}</Text>
            <Text style={[qsp.domainChipText, { color: d.color }]}>{d.key}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[qsp.fullTransferBtn]}
          onPress={onFullTransfer}
          activeOpacity={0.85}
        >
          <MaterialIcons name="open-in-new" size={13} color={Colors.primary} />
          <Text style={qsp.fullTransferText}>Full Transfer</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[qsp.sendBtn, (!recipientInput.trim() && !filledAddress) && qsp.sendBtnDisabled]}
        onPress={handleSend}
        activeOpacity={0.85}
      >
        <MaterialIcons name="send" size={16} color={Colors.bg} />
        <Text style={qsp.sendBtnText}>Continue to Send</Text>
      </TouchableOpacity>
    </View>
  );
}

const qsp = StyleSheet.create({
  card:           { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', marginBottom: Spacing.lg, overflow: 'hidden', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.primaryGlow },
  headerIcon:     { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  headerSub:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  web3Badge:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  web3BadgeText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  inputSection:   { padding: Spacing.md, gap: Spacing.sm },
  inputLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inputLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  inputRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: 48 },
  textInput:      { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, paddingVertical: 4 },
  resolvedStrip:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '44', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  resolvedText:   { flex: 1, fontSize: FontSize.xs, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  hintText:       { fontSize: 9, color: Colors.textMuted, paddingLeft: 2, lineHeight: 14, includeFontPadding: false },
  domainRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  domainChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  domainChipText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  fullTransferBtn:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  fullTransferText:{ fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  sendBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, margin: Spacing.md, marginTop: 0, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  sendBtnDisabled:{ opacity: 0.4 },
  sendBtnText:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
import { createBTNG3WalletAccount } from '@/services/btng3WalletService';
import {
  COUNTRY_META, generateBtngAddress, lookupBtngAddress,
  ADDRESS_TYPE_LABELS, ADDRESS_TYPE_ICONS, type AddressType, type CountryMeta, type GeneratedAddress,
} from '@/services/btngEngineService';
import { Screen } from '@/constants/theme';

const TX_ICONS: Record<string, string> = {
  buy: 'trending-up',
  sell: 'trending-down',
  deposit: 'arrow-downward',
  withdraw: 'arrow-upward',
  receive: 'call-received',
  send: 'call-made',
  transfer: 'swap-horiz',
};

const TX_COLORS: Record<string, string> = {
  buy: '#3B82F6',
  sell: '#F59E0B',
  deposit: '#22C55E',
  withdraw: '#EF4444',
  receive: '#22C55E',
  send: '#EF4444',
  transfer: '#9945FF',
};

const INFLOW_TYPES = ['deposit', 'receive', 'buy'];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini 7-Day Price Chart (for coin detail sheet)
// ─────────────────────────────────────────────────────────────────────────────
type MiniChartType = 'line' | 'candle';

function MiniPriceChart({ symbol, color, price }: { symbol: string; color: string; price: number }) {
  const screenW = Dimensions.get('window').width;
  const W = screenW - Spacing.xl * 2 - 2;
  const H = 72;
  const PAD_X = 0;
  const PAD_Y = 8;
  const [chartType, setChartType] = useState<MiniChartType>('line');

  // Seed 7 daily close prices
  const closes = React.useMemo(() => {
    if (price <= 0) return Array(7).fill(0.001);
    const pts: number[] = [];
    let v = price * 0.94;
    for (let i = 0; i < 6; i++) {
      const seed1 = symbol.charCodeAt(i % symbol.length);
      const seed2 = symbol.charCodeAt((i + 2) % symbol.length);
      const delta = ((seed1 * 13 + seed2 * 7 + i * 31) % 100 - 48) * 0.002;
      v = Math.max(v * (1 + delta), 0.0001);
      pts.push(v);
    }
    pts.push(price);
    return pts;
  }, [symbol, price]);

  // Build OHLC data seeded from symbol for each day
  const ohlc = React.useMemo(() => {
    return closes.map((close, i) => {
      const s1 = symbol.charCodeAt(i % symbol.length);
      const s2 = symbol.charCodeAt((i + 1) % symbol.length);
      const s3 = symbol.charCodeAt((i + 3) % symbol.length);
      const openDelta = ((s1 * 7 + i * 19) % 60 - 30) * 0.0015;
      const open = Math.max(close * (1 + openDelta), 0.0001);
      const wickUpPct = ((s2 * 11 + i * 23) % 40) * 0.0004;
      const wickDnPct = ((s3 * 9 + i * 17) % 40) * 0.0004;
      const high = Math.max(open, close) * (1 + wickUpPct);
      const low = Math.min(open, close) * (1 - wickDnPct);
      return { open, high, low, close, bullish: close >= open };
    });
  }, [closes, symbol]);

  const data = closes;
  const isPositive = data[data.length - 1] >= data[0];
  const lineColor = isPositive ? Colors.success : Colors.error;
  const gradId = `grad_${symbol}`;

  // Y-scale covers all OHLC extremes
  const allVals = chartType === 'candle'
    ? ohlc.flatMap(c => [c.high, c.low])
    : data;
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || price * 0.01;

  const toX = (i: number) => PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2);
  const toY = (v: number) => PAD_Y + (H - PAD_Y * 2) * (1 - (v - minVal) / range);

  // Line + area paths
  const linePath = data.reduce((acc, v, i) => {
    const x = toX(i); const y = toY(v);
    if (i === 0) return `M ${x} ${y}`;
    const prevX = toX(i - 1); const prevY = toY(data[i - 1]);
    const cpX = prevX + (x - prevX) * 0.5;
    return `${acc} C ${cpX} ${prevY}, ${cpX} ${y}, ${x} ${y}`;
  }, '');
  const areaPath = `${linePath} L ${toX(data.length - 1)} ${H} L ${toX(0)} ${H} Z`;

  // Candlestick geometry
  const CANDLE_W = Math.max(6, (W / data.length) * 0.55);
  const candleElements = React.useMemo(() => {
    return ohlc.map((c, i) => {
      const cx = toX(i);
      const yHigh = toY(c.high);
      const yLow = toY(c.low);
      const yOpen = toY(c.open);
      const yClose = toY(c.close);
      const bodyTop = Math.min(yOpen, yClose);
      const bodyBottom = Math.max(yOpen, yClose);
      const bodyH = Math.max(bodyBottom - bodyTop, 1.5);
      const fill = c.bullish ? Colors.success : Colors.error;
      return { cx, yHigh, yLow, bodyTop, bodyH, fill, bullish: c.bullish };
    });
  }, [ohlc, minVal, maxVal, range, W, H]);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayLabels = data.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (data.length - 1 - i));
    return days[(d.getDay() + 6) % 7];
  });

  const changePct = data[0] > 0 ? ((data[data.length - 1] - data[0]) / data[0]) * 100 : 0;

  return (
    <View style={mpc.wrap}>
      <View style={mpc.labelRow}>
        <Text style={mpc.chartTitle}>7D Price History</Text>

        {/* Chart type toggle */}
        <View style={mpc.toggleRow}>
          {(['line', 'candle'] as MiniChartType[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[mpc.toggleBtn, chartType === t && mpc.toggleBtnActive]}
              onPress={() => setChartType(t)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <MaterialIcons
                name={t === 'line' ? 'show-chart' : 'bar-chart'}
                size={11}
                color={chartType === t ? Colors.bgCard : Colors.textMuted}
              />
              <Text style={[mpc.toggleText, chartType === t && mpc.toggleTextActive]}>
                {t === 'line' ? 'Line' : 'OHLC'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[mpc.changePill, {
          backgroundColor: isPositive ? Colors.successBg : Colors.errorBg,
          borderColor: (isPositive ? Colors.success : Colors.error) + '44',
        }]}>
          <MaterialIcons
            name={isPositive ? 'trending-up' : 'trending-down'}
            size={10}
            color={isPositive ? Colors.success : Colors.error}
          />
          <Text style={[mpc.changePillText, { color: isPositive ? Colors.success : Colors.error }]}>
            {isPositive ? '+' : ''}{changePct.toFixed(2)}%
          </Text>
        </View>
      </View>

      <Svg width={W} height={H}>
        {chartType === 'line' ? (
          <>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.28} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill={`url(#${gradId})`} />
            <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1])} r={4} fill={lineColor} stroke={Colors.bgCard} strokeWidth={1.5} />
            <Circle cx={toX(0)} cy={toY(data[0])} r={2.5} fill={lineColor} opacity={0.5} />
          </>
        ) : (
          <>
            {candleElements.map((c, i) => (
              <React.Fragment key={i}>
                {/* Wick */}
                <Path
                  d={`M ${c.cx} ${c.yHigh} L ${c.cx} ${c.yLow}`}
                  stroke={c.fill}
                  strokeWidth={1.2}
                  opacity={0.75}
                />
                {/* Body */}
                <Path
                  d={`M ${c.cx - CANDLE_W / 2} ${c.bodyTop} L ${c.cx + CANDLE_W / 2} ${c.bodyTop} L ${c.cx + CANDLE_W / 2} ${c.bodyTop + c.bodyH} L ${c.cx - CANDLE_W / 2} ${c.bodyTop + c.bodyH} Z`}
                  fill={c.bullish ? c.fill : 'transparent'}
                  stroke={c.fill}
                  strokeWidth={1.2}
                />
              </React.Fragment>
            ))}
          </>
        )}
      </Svg>

      {/* Day labels */}
      <View style={[mpc.dayRow, { width: W }]}>
        {dayLabels.map((d, i) => (
          <Text
            key={i}
            style={[
              mpc.dayLabel,
              i === dayLabels.length - 1 && { color: lineColor, fontWeight: FontWeight.bold },
            ]}
          >
            {d}
          </Text>
        ))}
      </View>
    </View>
  );
}

const mpc = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 6,
  },
  chartTitle: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    flex: 1,
    marginHorizontal: 6,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
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
    color: Colors.bgCard,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  changePillText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
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

// ─────────────────────────────────────────────────────────────────────────────
// Coin Detail Bottom Sheet
// ─────────────────────────────────────────────────────────────────────────────
interface CoinDetailSheetProps {
  visible: boolean;
  coin: { id: string; symbol: string; logo: string; color: string; balance: number; price: number; name?: string };
  ghsRate: number;
  hideBalances: boolean;
  onClose: () => void;
  onTrade: () => void;
  onTransfer: () => void;
  onDeposit: () => void;
}

function CoinDetailSheet({ visible, coin, ghsRate, hideBalances, onClose, onTrade, onTransfer, onDeposit }: CoinDetailSheetProps) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: true }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim]);

  const value = coin.balance * coin.price;
  const ghsValue = value * ghsRate;

  // Simulated 24h change (seeded from coin symbol for consistency)
  const change24h = React.useMemo(() => {
    const seed = coin.symbol.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    return ((seed % 17) - 8) * 0.5; // -4% to +4%
  }, [coin.symbol]);
  const isPositiveChange = change24h >= 0;

  // Mini sparkline (simulated)
  const SPARK_W = 100;
  const SPARK_H = 32;
  const sparkData = React.useMemo(() => {
    const pts: number[] = [];
    let v = coin.price * 0.97;
    for (let i = 0; i < 12; i++) {
      const seed2 = (coin.symbol.charCodeAt(i % coin.symbol.length) * (i + 1) * 17) % 100;
      v = v * (1 + ((seed2 - 50) * 0.001));
      pts.push(v);
    }
    pts.push(coin.price);
    return pts;
  }, [coin.symbol, coin.price]);

  const sparkPoints = React.useMemo(() => {
    const min = Math.min(...sparkData);
    const max = Math.max(...sparkData);
    const range = max - min || 1;
    return sparkData.map((v, i) => ({
      x: (i / (sparkData.length - 1)) * SPARK_W,
      y: SPARK_H - ((v - min) / range) * SPARK_H,
    }));
  }, [sparkData]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Overlay */}
      <Animated.View style={[cd.overlay, { opacity: overlayAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[cd.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle bar */}
        <View style={cd.handle} />

        {/* Header */}
        <View style={cd.sheetHeader}>
          <View style={[cd.coinLogo, { backgroundColor: coin.color + '22', borderColor: coin.color + '55' }]}>
            {GOLD_SYMBOLS.has(coin.symbol) ? (
              <Image source={BTNG_COIN_IMG} style={{ width: 52, height: 52, borderRadius: 26 }} contentFit="cover" />
            ) : (
              <Text style={[cd.coinLogoText, { color: coin.color }]}>{coin.logo}</Text>
            )}
          </View>
          <View style={cd.coinTitleBlock}>
            <Text style={cd.coinSymbol}>{coin.symbol}</Text>
            {coin.name ? <Text style={cd.coinName}>{coin.name}</Text> : null}
          </View>
          <TouchableOpacity style={cd.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Mini 7-Day Chart */}
        <MiniPriceChart symbol={coin.symbol} color={coin.color} price={coin.price} />

        {/* Price row */}
        <View style={cd.priceSection}>
          <View style={cd.priceRow}>
            <View style={cd.priceBlock}>
              <Text style={cd.priceLabel}>CURRENT PRICE</Text>
              <Text style={[cd.priceValue, { color: coin.color }]}>
                {coin.price >= 1000
                  ? `$${coin.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$${coin.price.toFixed(4)}`}
              </Text>
            </View>
            <View style={cd.changeSpark}>
              {/* Mini sparkline */}
              <View style={{ width: SPARK_W, height: SPARK_H }}>
                {sparkPoints.slice(1).map((pt, i) => {
                  const prev = sparkPoints[i];
                  const dx = pt.x - prev.x;
                  const dy = pt.y - prev.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  return (
                    <View key={i} style={{
                      position: 'absolute', left: prev.x, top: prev.y,
                      width: len, height: 1.5,
                      backgroundColor: isPositiveChange ? Colors.success : Colors.error,
                      opacity: 0.6 + (i / sparkPoints.length) * 0.4,
                      transform: [{ rotate: `${angle}deg` }],
                    }} />
                  );
                })}
              </View>
              <View style={[cd.changeBadge, {
                backgroundColor: isPositiveChange ? Colors.successBg : Colors.errorBg,
                borderColor: (isPositiveChange ? Colors.success : Colors.error) + '55',
              }]}>
                <MaterialIcons
                  name={isPositiveChange ? 'trending-up' : 'trending-down'}
                  size={11}
                  color={isPositiveChange ? Colors.success : Colors.error}
                />
                <Text style={[cd.changeBadgeText, { color: isPositiveChange ? Colors.success : Colors.error }]}>
                  {isPositiveChange ? '+' : ''}{change24h.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Balance cards */}
        <View style={cd.balanceGrid}>
          <View style={[cd.balanceCell, { borderColor: coin.color + '33' }]}>
            <Text style={cd.balanceCellLabel}>Holdings</Text>
            <Text style={[cd.balanceCellValue, { color: coin.color }]}>
              {hideBalances
                ? '••••'
                : `${coin.balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${coin.symbol}`}
            </Text>
            <Text style={cd.balanceCellSub}>Balance</Text>
          </View>

          <View style={[cd.balanceCell, { borderColor: Colors.primary + '33' }]}>
            <Text style={cd.balanceCellLabel}>USD Value</Text>
            <Text style={[cd.balanceCellValue, { color: Colors.primary }]}>
              {hideBalances
                ? '••••'
                : `$${value >= 1000
                  ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : value.toFixed(4)}`}
            </Text>
            <Text style={cd.balanceCellSub}>@ market price</Text>
          </View>

          {ghsRate > 1 && (
            <View style={[cd.balanceCell, { borderColor: Colors.warning + '33' }]}>
              <Text style={cd.balanceCellLabel}>GHS Value</Text>
              <Text style={[cd.balanceCellValue, { color: Colors.warning }]}>
                {hideBalances
                  ? '₵ ••••'
                  : `₵ ${ghsValue >= 1000
                    ? ghsValue.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : ghsValue.toFixed(2)}`}
              </Text>
              <Text style={cd.balanceCellSub}>🇬🇭 GHS</Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={cd.statsRow}>
          <View style={cd.statItem}>
            <MaterialIcons name="show-chart" size={13} color={Colors.textMuted} />
            <Text style={cd.statLabel}>Market Cap</Text>
            <Text style={cd.statValue}>—</Text>
          </View>
          <View style={cd.statDivider} />
          <View style={cd.statItem}>
            <MaterialIcons name="swap-horiz" size={13} color={Colors.textMuted} />
            <Text style={cd.statLabel}>24h Volume</Text>
            <Text style={cd.statValue}>—</Text>
          </View>
          <View style={cd.statDivider} />
          <View style={cd.statItem}>
            <MaterialIcons name="pie-chart" size={13} color={Colors.textMuted} />
            <Text style={cd.statLabel}>Allocation</Text>
            <Text style={[cd.statValue, { color: coin.color }]}>
              {hideBalances ? '—' : `${value > 0 ? ((value / Math.max(value, 1)) * 100).toFixed(1) : '0'}%`}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <TouchableOpacity
          style={[cd.actionBtn, cd.depositBtn]}
          onPress={onDeposit}
          activeOpacity={0.85}
        >
          <MaterialIcons name="arrow-downward" size={18} color="#FFF" />
          <Text style={cd.depositBtnText}>Deposit {coin.symbol}</Text>
          <View style={cd.depositBadge}>
            <Text style={cd.depositBadgeText}>FUND</Text>
          </View>
        </TouchableOpacity>
        <View style={cd.actionRow}>
          <TouchableOpacity
            style={[cd.actionBtn, cd.tradeBtn]}
            onPress={onTrade}
            activeOpacity={0.85}
          >
            <MaterialIcons name="swap-horiz" size={18} color="#FFF" />
            <Text style={cd.tradeBtnText}>Trade</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[cd.actionBtn, cd.transferBtn]}
            onPress={onTransfer}
            activeOpacity={0.85}
          >
            <MaterialIcons name="send" size={18} color={Colors.primary} />
            <Text style={cd.transferBtnText}>Transfer</Text>
          </TouchableOpacity>
        </View>

        {/* Coin badge footer */}
        <View style={cd.footerRow}>
          <View style={[cd.footerDot, { backgroundColor: coin.color }]} />
          <Text style={cd.footerText}>{coin.symbol} · Gold-backed BTNG ecosystem asset</Text>
          <View style={[cd.footerBadge, { backgroundColor: coin.color + '22', borderColor: coin.color + '44' }]}>
            <Text style={[cd.footerBadgeText, { color: coin.color }]}>LIVE</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const cd = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  coinLogo: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  coinLogoText: { fontSize: 26, fontWeight: FontWeight.bold },
  coinTitleBlock: { flex: 1, gap: 2 },
  coinSymbol: { fontSize: 17, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  coinName: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  priceSection: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceBlock: { gap: 3 },
  priceLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  priceValue: { fontSize: 22, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: -0.3 },
  changeSpark: { alignItems: 'flex-end', gap: 8 },
  changeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1,
  },
  changeBadgeText: { fontSize: 11, fontWeight: FontWeight.bold, includeFontPadding: false },
  balanceGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  balanceCell: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    gap: 3,
    alignItems: 'center',
  },
  balanceCellLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  balanceCellValue: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center', flexShrink: 1 },
  balanceCellSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  statValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  depositBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  depositBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#FFF', includeFontPadding: false },
  depositBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  depositBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, color: '#FFF', includeFontPadding: false, letterSpacing: 0.5 },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
  },
  tradeBtn: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  tradeBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#FFF', includeFontPadding: false },
  transferBtn: {
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1.5,
    borderColor: Colors.primary + '66',
  },
  transferBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerDot: { width: 7, height: 7, borderRadius: 3.5 },
  footerText: { flex: 1, fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  footerBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1,
  },
  footerBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
});

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coins, totalValue } = useWallet();
  const { user } = useAuth();

  const { history, loadingHistory, orders, filledOrdersCount, totalBuyVolume, totalSellVolume, totalFeesPaid } = useTrading(user?.id);
  const { priceUSD: oraclePriceUSD, sparkline: sparklineData } = useGoldOracle();
  const { portfolioValue, pnl, pnlPct, isPositive: isPositivePnl, lastUpdated, loading: portfolioLoading, recalculate } = usePortfolio(user?.id);
  const { unreadCount } = useNotifications(user?.id);
  const { buckets, pctChange, isPositive: chartPositive, hasData: chartHasData } = usePortfolioChart(history);
  const { selectedCurrency, convertUSD, convertUSDRaw } = useCurrency();
  const { getRate, loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();

  // ── Declare ALL state hooks first before any derived computations ──────────

  // Refresh BTNG3 wallet card whenever this screen comes back into focus
  // ── Live polling — auto-refresh portfolio every 30s ────────────────────────
  const { tick: walletLiveTick } = useLivePoll(30_000);
  useEffect(() => {
    if (!user?.id) return;
    recalculate();
  }, [walletLiveTick, user?.id, recalculate]);

  const [btng3RefreshKey, setBtng3RefreshKey] = useState(0);

  // ── Zone Engine state ────────────────────────────────────────────────────
  const [activeZone, setActiveZone] = useState<ZoneResolution | null>(null);

  useFocusEffect(
    useCallback(() => {
      setBtng3RefreshKey(k => k + 1);
      // Re-resolve zone on every focus
      if (!user) return;
      try {
        const profileUser = user as any;
        const country: string = profileUser?.country ?? profileUser?.registeredCountry ?? 'GH';
        const rawKyc: string = profileUser?.kyc_status ?? 'pending';
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
        console.warn('[ZoneEngine] wallet resolve failed:', e);
      }
    }, [user?.id])
  );

  // BTNGG coin entry for Assets tab (fetched from btng_wallets)
  const [btng3AssetData, setBtng3AssetData] = useState<{
    balance: number;
    gold_backed_ghs: number;
    tier: string;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb
          .from('btng_wallets')
          .select('balance,gold_backed_ghs,tier')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!cancelled && data) setBtng3AssetData(data);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, btng3RefreshKey]);

  // Pulse animation for the live dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // ── Derived computations (safe — all hooks declared above) ──────────────────

  const liveRate = selectedCurrency.code !== 'USD' ? getRate(selectedCurrency.code) : 1;

  // Use live DB portfolio value when available, fall back to wallet context
  const displayValue = user && portfolioValue > 0 ? portfolioValue : totalValue;

  // BTNGG contribution to portfolio — btng3AssetData is declared above, no ReferenceError
  const btnggPricePerToken = oraclePriceUSD > 0 ? oraclePriceUSD / 1000 : 0;
  const btnggUsdValue = (btng3AssetData && btng3AssetData.balance > 0 && btnggPricePerToken > 0)
    ? btng3AssetData.balance * btnggPricePerToken
    : 0;
  const totalDisplayValue = displayValue + btnggUsdValue;

  const localTotal = convertUSDRaw(totalDisplayValue);

  // GHS portfolio value — always shown
  const ghsRate = getRate('GHS') || 0;
  const ghsTotal = totalDisplayValue * ghsRate;
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);
  const isTablet = dims.width >= 768;
  const isDesktop = dims.width >= 1024;
  const hPad = isDesktop ? Spacing.xxl * 2 : isTablet ? Spacing.xxl : Spacing.xl;

  const CHART_WIDTH = isDesktop
    ? Math.min(dims.width * 0.6, 860)
    : isTablet ? Math.min(dims.width - Spacing.xxl * 2 - 2, 600)
      : dims.width - Spacing.xl * 2 - 2;

  const [hideBalances, setHideBalances] = useState(false);
  const [tab, setTab] = useState<'assets' | 'history'>('assets');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'buy' | 'sell' | 'deposit' | 'withdraw'>('all');

  // Coin detail sheet state
  const [selectedCoin, setSelectedCoin] = useState<typeof coins[0] | null>(null);
  const [coinSheetVisible, setCoinSheetVisible] = useState(false);

  const openCoinSheet = useCallback((coin: typeof coins[0]) => {
    setSelectedCoin(coin);
    setCoinSheetVisible(true);
  }, []);

  const closeCoinSheet = useCallback(() => {
    setCoinSheetVisible(false);
  }, []);

  const showLocalHeader = selectedCurrency.code !== 'USD' && localTotal > 0 && !hideBalances;
  const hasBtnggContribution = btnggUsdValue > 0;

  const ownedCoins = coins.filter(c => c.isOwned && c.balance > 0);

  // Filtered history
  const filteredHistory = historyFilter === 'all'
    ? history
    : history.filter(h => h.type === historyFilter);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={isTablet ? styles.scrollTablet : undefined}>
        {/* Header */}
        <View style={[styles.header, isTablet && styles.headerTablet]}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>My Wallet</Text>
            <TouchableOpacity style={styles.currencyPill} onPress={() => router.push('/currency-selector' as any)}>
              <Text style={styles.currencyPillFlag}>{selectedCurrency.flag}</Text>
              <Text style={styles.currencyPillCode}>{selectedCurrency.code}</Text>
              <MaterialIcons name="keyboard-arrow-down" size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerActions} >
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications' as any)}>
              <MaterialIcons name="notifications" size={20} color={Colors.textSecondary} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setHideBalances(!hideBalances)}>
              <MaterialIcons name={hideBalances ? 'visibility-off' : 'visibility'} size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Portfolio Card */}
        <View style={[styles.portfolioCard, isTablet && styles.portfolioCardTablet, isDesktop && { marginHorizontal: hPad }]}>
          <View style={styles.portfolioLabelRow}>
            <Text style={styles.portfolioLabel}>Total Portfolio Value</Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={() => recalculate()} disabled={portfolioLoading}>
              {portfolioLoading
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <MaterialIcons name="refresh" size={16} color={Colors.primary} />
              }
            </TouchableOpacity>
          </View>
          <Text style={styles.portfolioValue}>
            {hideBalances ? '••••••' : `$${totalDisplayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </Text>

          {/* ── Active Zone Pill ── */}
          {activeZone ? (
            <View style={styles.activeZonePill}>
              <View style={styles.activeZoneDot} />
              <Text style={styles.activeZoneName} numberOfLines={1}>
                {activeZone.zoneId.replace(/_/g, ' ')}
              </Text>
              <View style={styles.activeZoneLimits}>
                {[
                  { label: 'SND', val: activeZone.config.maxSendAmount },
                  { label: 'SWP', val: activeZone.config.maxSwapAmount },
                  { label: 'WDR', val: activeZone.config.maxWithdrawAmount },
                ].map(item => (
                  <View key={item.label} style={styles.activeZoneLimitChip}>
                    <Text style={styles.activeZoneLimitLabel}>{item.label}</Text>
                    <Text style={styles.activeZoneLimitVal}>
                      {item.val >= 1000 ? `${(item.val / 1000).toFixed(0)}K` : item.val}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {hasBtnggContribution && !hideBalances && (
            <View style={styles.btnggContribRow}>
              <View style={styles.btnggContribDot} />
              <Text style={styles.btnggContribText}>Includes</Text>
              <Text style={styles.btnggContribValue}>₿3 ${btnggUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BTNGG</Text>
              <Text style={styles.btnggContribPct}>({totalDisplayValue > 0 ? ((btnggUsdValue / totalDisplayValue) * 100).toFixed(1) : '0'}%)</Text>
            </View>
          )}

          {/* GHS Portfolio Value — always visible */}
          {ghsRate > 1 && (
            <View style={styles.ghsTotalRow}>
              <Animated.View style={[styles.ghsTotalDot, { opacity: pulseAnim }]} />
              <Text style={styles.ghsTotalFlag}>🇬🇭</Text>
              <Text style={styles.ghsTotalValue}>
                {hideBalances
                  ? '₵ ••••• GHS'
                  : `₵ ${ghsTotal >= 1000
                    ? ghsTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : ghsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHS`}
              </Text>
              <Text style={styles.ghsTotalRate}>@ {ghsRate.toFixed(2)}</Text>
            </View>
          )}

          {showLocalHeader && (
            <TouchableOpacity style={styles.localValueBlock} onPress={() => router.push('/currency-selector' as any)} activeOpacity={0.75}>
              <View style={styles.localValueRow}>
                <Text style={styles.localValueFlag}>{selectedCurrency.flag}</Text>
                <Text style={styles.localValueText}>
                  {selectedCurrency.symbol}{localTotal >= 1000
                    ? localTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : localTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={styles.localValueCode}>{selectedCurrency.code}</Text>
              </View>
              <View style={styles.liveRateRow}>
                <Animated.View style={[styles.liveRateDot, { opacity: pulseAnim }]} />
                <Text style={styles.liveRateLabel}>Live rate</Text>
                <Text style={styles.liveRateValue}>
                  1 USD = {liveRate >= 1000
                    ? liveRate.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : liveRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedCurrency.code}
                </Text>
                {rateTimestamp && (
                  <Text style={styles.liveRateTime}>· {rateTimestamp}</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          <View style={styles.pnlRow}>
            <View style={[styles.pnlChip, { backgroundColor: isPositivePnl ? Colors.successBg : Colors.errorBg }]}>
              <MaterialIcons name={isPositivePnl ? 'trending-up' : 'trending-down'} size={14} color={isPositivePnl ? Colors.success : Colors.error} />
              <Text style={[styles.pnlText, { color: isPositivePnl ? Colors.success : Colors.error }]}>
                {isPositivePnl ? '+' : ''}${hideBalances ? '••••' : (pnl + btnggUsdValue).toFixed(2)} ({hideBalances ? '••' : totalDisplayValue > 0 ? Math.abs(((pnl + btnggUsdValue) / Math.max(totalDisplayValue, 1)) * 100).toFixed(1) : '0'}%)
              </Text>
            </View>
            {selectedCurrency.code !== 'USD' && !hideBalances && (pnl + btnggUsdValue) !== 0 && (() => {
              const localPnl = convertUSDRaw(Math.abs(pnl + btnggUsdValue));
              return (
                <View style={[styles.pnlLocalBadge, { backgroundColor: isPositivePnl ? Colors.successBg : Colors.errorBg, borderColor: (isPositivePnl ? Colors.success : Colors.error) + '44' }]}>
                  <Text style={styles.pnlLocalFlag}>{selectedCurrency.flag}</Text>
                  <Text style={[styles.pnlLocalText, { color: (pnl + btnggUsdValue) >= 0 ? Colors.success : Colors.error }]}>
                    {(pnl + btnggUsdValue) >= 0 ? '+' : '-'}{selectedCurrency.symbol}{localPnl >= 1000
                      ? localPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })
                      : localPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              );
            })()}
            <Text style={styles.pnlPeriod}>All time</Text>
            {lastUpdated && user && (
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
          </View>

          {/* Trading Stats (when signed in and have orders) */}
          {user && filledOrdersCount > 0 && (
            <View style={styles.tradingStats}>
              <View style={styles.tradingStatItem}>
                <Text style={styles.tradingStatVal}>{filledOrdersCount}</Text>
                <Text style={styles.tradingStatLabel}>Trades</Text>
              </View>
              <View style={styles.tradingStatDivider} />
              <View style={styles.tradingStatItem}>
                <Text style={[styles.tradingStatVal, { color: Colors.success }]}>${hideBalances ? '••••' : totalBuyVolume.toFixed(0)}</Text>
                <Text style={styles.tradingStatLabel}>Bought</Text>
              </View>
              <View style={styles.tradingStatDivider} />
              <View style={styles.tradingStatItem}>
                <Text style={[styles.tradingStatVal, { color: Colors.warning }]}>${hideBalances ? '••••' : totalSellVolume.toFixed(0)}</Text>
                <Text style={styles.tradingStatLabel}>Sold</Text>
              </View>
              <View style={styles.tradingStatDivider} />
              <View style={styles.tradingStatItem}>
                <Text style={[styles.tradingStatVal, { color: Colors.textMuted }]}>${hideBalances ? '••' : totalFeesPaid.toFixed(2)}</Text>
                <Text style={styles.tradingStatLabel}>Fees</Text>
              </View>
            </View>
          )}

          {/* Action Row */}
          <View style={styles.actionRow}>
            {[
              { icon: 'arrow-downward', label: 'Deposit', route: '/deposit' },
              { icon: 'arrow-upward', label: 'Withdraw', route: '/withdraw' },
              { icon: 'send', label: 'Transfer', route: '/transfer' },
              { icon: 'currency-exchange', label: 'Swap', route: '/btng-swap' },
              { icon: 'analytics', label: 'Credit', route: '/ai-credit' },
            ].map(a => (
              <TouchableOpacity key={a.label} style={styles.actionBtn}
                onPress={() => router.push(a.route as any)}
                activeOpacity={0.75}>
                <View style={styles.actionIcon}>
                  <MaterialIcons name={a.icon as any} size={20} color={Colors.primary} />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* BTNG3 Commercial Wallet */}
        {user && <BTNG3WalletCard userId={user.id} refreshKey={btng3RefreshKey} onNavigate={() => router.push('/btng3-wallet' as any)} />}

        {/* Quick Send Panel with Web3 Domain Resolver */}
        <QuickSendPanel onFullTransfer={() => router.push('/transfer' as any)} />

        {/* BTNG 54-Nation Identity Panel */}
        <BTNG54IdentityPanel />

        {/* BTNGG Price History Chart */}
        <BTNGPriceHistoryCard sparkline={sparklineData} priceUSD={oraclePriceUSD} buyHistory={history} hideBalances={hideBalances} />

        {/* Asset Allocation Donut Chart */}
        {ownedCoins.length > 0 && (
          <AssetAllocationChart coins={ownedCoins} totalValue={totalDisplayValue} hideBalances={hideBalances} />
        )}

        {/* 7-Day Portfolio Chart */}
        {user && !loadingHistory && chartHasData && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>7-Day Portfolio</Text>
                <Text style={styles.chartSub}>Cumulative net value</Text>
              </View>
              <View style={[
                styles.chartBadge,
                {
                  backgroundColor: chartPositive ? Colors.successBg : Colors.errorBg,
                  borderColor: chartPositive ? Colors.success + '44' : Colors.error + '44'
                },
              ]}>
                <MaterialIcons
                  name={chartPositive ? 'trending-up' : 'trending-down'}
                  size={13}
                  color={chartPositive ? Colors.success : Colors.error}
                />
                <Text style={[styles.chartPct, { color: chartPositive ? Colors.success : Colors.error }]}>
                  {chartPositive ? '+' : ''}{hideBalances ? '••' : pctChange.toFixed(1)}%
                </Text>
              </View>
            </View>

            <LineChart
              data={{
                labels: buckets.map(b => b.label),
                datasets: [{
                  data: hideBalances
                    ? buckets.map(() => 0)
                    : buckets.map(b => Math.max(0.01, b.value)),
                  strokeWidth: 2.5,
                }],
              }}
              width={CHART_WIDTH}
              height={140}
              withDots={true}
              withShadow={true}
              withInnerLines={false}
              withOuterLines={false}
              withVerticalLines={false}
              withHorizontalLines={false}
              withVerticalLabels={true}
              withHorizontalLabels={false}
              bezier
              chartConfig={{
                backgroundGradientFrom: Colors.bgCard,
                backgroundGradientTo: Colors.bgCard,
                backgroundGradientFromOpacity: 0,
                backgroundGradientToOpacity: 0,
                color: (opacity = 1) =>
                  chartPositive
                    ? `rgba(34, 197, 94, ${opacity})`
                    : `rgba(239, 68, 68, ${opacity})`,
                strokeWidth: 2.5,
                propsForDots: {
                  r: '3.5',
                  strokeWidth: '1.5',
                  stroke: chartPositive ? Colors.success : Colors.error,
                  fill: chartPositive ? Colors.success : Colors.error,
                },
                labelColor: () => Colors.textMuted,
                style: { borderRadius: 0 },
                fillShadowGradientFrom: chartPositive ? Colors.success : Colors.error,
                fillShadowGradientTo: Colors.bgCard,
                fillShadowGradientFromOpacity: 0.25,
                fillShadowGradientToOpacity: 0,
              }}
              style={styles.lineChart}
              formatYLabel={() => ''}
              decorator={() => null as any}
            />

            <View style={styles.chartDayRow}>
              {buckets.map((b, i) => (
                <View key={i} style={styles.chartDayCell}>
                  <Text style={styles.chartDayLabel}>{b.label}</Text>
                  {!hideBalances && b.value > 0 ? (
                    <Text style={[
                      styles.chartDayValue,
                      i === buckets.length - 1 && { color: chartPositive ? Colors.success : Colors.error },
                    ]}>
                      ${b.value >= 1000
                        ? (b.value / 1000).toFixed(1) + 'K'
                        : b.value.toFixed(0)
                      }
                    </Text>
                  ) : (
                    <Text style={styles.chartDayValue}>—</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Gold Price Oracle */}
        <GoldPriceOracleCard />

        {/* BTNG Gold Loan Calculator */}
        <BTNGLoanCalculator onNavigate={() => router.push('/btng-bank' as any)} />

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'assets' && styles.tabActive]} onPress={() => setTab('assets')}>
            <Text style={[styles.tabText, tab === 'assets' && styles.tabTextActive]}>Assets</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'history' && styles.tabActive]} onPress={() => setTab('history')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
              {history.length > 0 && (
                <View style={[styles.historyBadge, tab === 'history' && { backgroundColor: Colors.bg + '44' }]}>
                  <Text style={[styles.historyBadgeText, tab === 'history' && { color: Colors.bg }]}>{Math.min(history.length, 99)}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Assets Tab */}
        {tab === 'assets' && (
          <View style={[styles.section, isTablet && { paddingHorizontal: hPad }]}>
            <SectionHeader title="My Assets" actionLabel="Add Coin" onAction={() => router.push('/trade')} />

            {/* BTNGG native coin entry from btng_wallets */}
            {user && btng3AssetData !== null && (
              <BTNGGAssetCard
                balance={btng3AssetData.balance}
                goldBackedGhs={btng3AssetData.gold_backed_ghs}
                tier={btng3AssetData.tier}
                priceUSD={oraclePriceUSD > 0 ? oraclePriceUSD / 1000 : 0}
                hideBalances={hideBalances}
                onPress={() => openCoinSheet({
                  id: 'BTNGG',
                  symbol: 'BTNGG',
                  logo: '₿3',
                  color: Colors.primary,
                  balance: btng3AssetData.balance,
                  price: oraclePriceUSD > 0 ? oraclePriceUSD / 1000 : 0,
                  name: 'BTNG Gold Token',
                  isOwned: true,
                })}
                onNavigate={() => router.push('/btng3-wallet' as any)}
              />
            )}

            {ownedCoins.map(coin => {
              const value = coin.balance * coin.price;
              const allocation = totalValue > 0 ? (value / totalValue) * 100 : 0;
              const localValue = convertUSD(value);
              return (
                <TouchableOpacity
                  key={coin.id}
                  style={styles.assetCard}
                  activeOpacity={0.8}
                  onPress={() => openCoinSheet(coin)}
                >
                  <View style={[styles.assetLogo, { backgroundColor: coin.color + '22', borderColor: coin.color + '44' }]}>
                    {GOLD_SYMBOLS.has(coin.symbol) ? (
                      <Image source={BTNG_COIN_IMG} style={{ width: 46, height: 46, borderRadius: 23 }} contentFit="cover" />
                    ) : (
                      <Text style={[styles.assetLogoText, { color: coin.color }]}>{coin.logo}</Text>
                    )}
                  </View>
                  <View style={styles.assetInfo}>
                    <View style={styles.assetNameRow}>
                      <Text style={styles.assetSymbol}>{coin.symbol}</Text>
                      <Text style={styles.assetBalance}>
                        {hideBalances ? '••••' : `${coin.balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${coin.symbol}`}
                      </Text>
                    </View>
                    <View style={styles.assetAllocRow}>
                      <View style={styles.allocBar}>
                        <View style={[styles.allocFill, { width: `${allocation}%`, backgroundColor: coin.color }]} />
                      </View>
                      <Text style={styles.allocPct}>{allocation.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.assetValueRow}>
                      <Text style={styles.assetPrice}>${coin.price >= 1000 ? coin.price.toLocaleString() : coin.price.toFixed(3)}</Text>
                      <View style={styles.assetValueRight}>
                        <Text style={styles.assetValue}>
                          {hideBalances ? '••••' : (selectedCurrency.code !== 'USD' ? localValue : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)}
                        </Text>
                        <MaterialIcons name="chevron-right" size={14} color={Colors.textMuted} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <View style={[styles.section, isTablet && { paddingHorizontal: hPad }]}>
            <SectionHeader title="Transaction History" />

            {!user ? (
              <View style={styles.authPrompt}>
                <MaterialIcons name="lock-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.authPromptTitle}>Sign in to view history</Text>
                <Text style={styles.authPromptSub}>Your full trade history is saved securely.</Text>
                <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/login')}>
                  <Text style={styles.signInBtnText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : loadingHistory ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.loadingText}>Loading history...</Text>
              </View>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                  {(['all', 'buy', 'sell', 'deposit', 'withdraw'] as const).map(f => (
                    <TouchableOpacity key={f}
                      style={[styles.filterChip, historyFilter === f && styles.filterChipActive]}
                      onPress={() => setHistoryFilter(f)}>
                      <Text style={[styles.filterChipText, historyFilter === f && styles.filterChipTextActive]}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {filteredHistory.length === 0 ? (
                  <View style={styles.emptyHistory}>
                    <MaterialIcons name="receipt-long" size={40} color={Colors.textMuted} />
                    <Text style={styles.emptyHistoryTitle}>No transactions yet</Text>
                    <Text style={styles.emptyHistorySub}>
                      {historyFilter === 'all' ? 'Your trades will appear here.' : `No ${historyFilter} transactions found.`}
                    </Text>
                  </View>
                ) : (
                  filteredHistory.map(tx => (
                    <TxCard key={tx.id} tx={tx} hideBalances={hideBalances} />
                  ))
                )}
              </>
            )}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Coin Detail Bottom Sheet */}
      {selectedCoin ? (
        <CoinDetailSheet
          visible={coinSheetVisible}
          coin={selectedCoin}
          ghsRate={ghsRate}
          hideBalances={hideBalances}
          onClose={closeCoinSheet}
          onTrade={() => { closeCoinSheet(); router.push('/trade'); }}
          onTransfer={() => { closeCoinSheet(); router.push('/transfer'); }}
          onDeposit={() => { closeCoinSheet(); router.push(('/deposit?coin=' + selectedCoin.symbol) as any); }}
        />
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BTNG 54-Nation Identity Panel
// ─────────────────────────────────────────────────────────────────────────────
function BTNG54IdentityPanel() {
  const router = useRouter();
  const nations = [
    { flag: '🇬🇭', name: 'Ghana',        code: 'GH', currency: 'GHS' },
    { flag: '🇳🇬', name: 'Nigeria',       code: 'NG', currency: 'NGN' },
    { flag: '🇰🇪', name: 'Kenya',         code: 'KE', currency: 'KES' },
    { flag: '🇿🇦', name: 'South Africa',  code: 'ZA', currency: 'ZAR' },
    { flag: '🇪🇬', name: 'Egypt',         code: 'EG', currency: 'EGP' },
    { flag: '🇪🇹', name: 'Ethiopia',      code: 'ET', currency: 'ETB' },
    { flag: '🇹🇿', name: 'Tanzania',      code: 'TZ', currency: 'TZS' },
    { flag: '🇺🇬', name: 'Uganda',        code: 'UG', currency: 'UGX' },
    { flag: '🇲🇦', name: 'Morocco',       code: 'MA', currency: 'MAD' },
  ];
  return (
    <View style={styles.identityPanel}>
      <View style={styles.identityPanelHeader}>
        <MaterialIcons name="public" size={16} color={Colors.primary} />
        <Text style={styles.identityPanelTitle}>54 Africa Nations · BTNG Sovereign</Text>
        <TouchableOpacity onPress={() => router.push('/btng-private-banker' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.identityPanelLink}>Open Banker</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.identityNationRow}>
        {nations.map(n => (
          <TouchableOpacity key={n.code} style={styles.identityNationChip} onPress={() => router.push('/btng-private-banker' as any)} activeOpacity={0.75}>
            <Text style={styles.identityNationFlag}>{n.flag}</Text>
            <Text style={styles.identityNationCode}>{n.code}</Text>
            <Text style={styles.identityNationCurr}>{n.currency}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.identityNationChip, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]} onPress={() => router.push('/btng-private-banker' as any)} activeOpacity={0.75}>
          <Text style={{ fontSize: 16 }}>🌍</Text>
          <Text style={[styles.identityNationCode, { color: Colors.primary }]}>+45</Text>
          <Text style={[styles.identityNationCurr, { color: Colors.primary }]}>More</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BTNG3 Wallet Card
// ─────────────────────────────────────────────────────────────────────────────
function BTNG3WalletCard({ userId, refreshKey, onNavigate }: { userId: string; refreshKey: number; onNavigate: () => void }) {
  const [wallet, setWallet] = useState<{ balance: number; gold_backed_ghs: number; tier: string; btng_id: string; wallet_address: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const { priceUSD } = useGoldOracle();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb
          .from('btng_wallets')
          .select('balance,gold_backed_ghs,tier,btng_id,wallet_address')
          .eq('user_id', userId)
          .maybeSingle();
        if (!cancelled && data) setWallet(data as any);
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, refreshKey]);

  if (!wallet && !loading) return null;

  const pricePerToken = priceUSD > 0 ? priceUSD / 1000 : 0;
  const usdValue = wallet ? wallet.balance * pricePerToken : 0;

  return (
    <TouchableOpacity style={styles.btng3Card} onPress={onNavigate} activeOpacity={0.85}>
      <View style={styles.btng3Header}>
        <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.btng3Coin} contentFit="cover" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.btng3Title}>BTNG3 Gold Wallet</Text>
          <Text style={styles.btng3Sub} numberOfLines={1}>
            {wallet?.wallet_address ? `${wallet.wallet_address.slice(0, 14)}…` : 'Loading…'}
          </Text>
        </View>
        <View style={[styles.btng3TierBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
          <Text style={styles.btng3TierText}>{wallet?.tier ?? '—'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={18} color={Colors.primary} />
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginVertical: 12 }} />
      ) : wallet ? (
        <View style={styles.btng3Stats}>
          <View style={styles.btng3StatItem}>
            <Text style={styles.btng3StatVal}>{wallet.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })}</Text>
            <Text style={styles.btng3StatLabel}>BTNGG Balance</Text>
          </View>
          <View style={styles.btng3StatDiv} />
          <View style={styles.btng3StatItem}>
            <Text style={[styles.btng3StatVal, { color: Colors.primary }]}>
              {usdValue > 0 ? `$${usdValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
            </Text>
            <Text style={styles.btng3StatLabel}>USD Value</Text>
          </View>
          <View style={styles.btng3StatDiv} />
          <View style={styles.btng3StatItem}>
            <Text style={[styles.btng3StatVal, { color: Colors.success }]}>
              {wallet.gold_backed_ghs > 0 ? `₵${wallet.gold_backed_ghs.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
            </Text>
            <Text style={styles.btng3StatLabel}>Gold GHS</Text>
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BTNGG Asset Card
// ─────────────────────────────────────────────────────────────────────────────
function BTNGGAssetCard({ balance, goldBackedGhs, tier, priceUSD, hideBalances, onPress, onNavigate }: {
  balance: number; goldBackedGhs: number; tier: string; priceUSD: number;
  hideBalances: boolean; onPress: () => void; onNavigate: () => void;
}) {
  const usdValue = balance * priceUSD;
  return (
    <TouchableOpacity style={styles.assetCard} activeOpacity={0.8} onPress={onPress}>
      <View style={[styles.assetLogo, { backgroundColor: Colors.primary + '22', borderColor: Colors.primary + '44' }]}>
        <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={{ width: 46, height: 46, borderRadius: 23 }} contentFit="cover" />
      </View>
      <View style={styles.assetInfo}>
        <View style={styles.assetNameRow}>
          <Text style={styles.assetSymbol}>BTNGG</Text>
          <Text style={styles.assetBalance}>
            {hideBalances ? '••••' : `${balance.toLocaleString('en-US', { maximumFractionDigits: 4 })} BTNGG`}
          </Text>
        </View>
        <View style={styles.assetAllocRow}>
          <View style={[styles.allocBar]}>
            <View style={[styles.allocFill, { width: '100%', backgroundColor: Colors.primary }]} />
          </View>
          <Text style={styles.allocPct}>{tier}</Text>
        </View>
        <View style={styles.assetValueRow}>
          <Text style={styles.assetPrice}>${priceUSD >= 1000 ? priceUSD.toLocaleString() : priceUSD.toFixed(4)}</Text>
          <View style={styles.assetValueRight}>
            <Text style={styles.assetValue}>
              {hideBalances ? '••••' : `$${usdValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            </Text>
            <MaterialIcons name="chevron-right" size={14} color={Colors.textMuted} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BTNGG Price History Card
// ─────────────────────────────────────────────────────────────────────────────
function BTNGPriceHistoryCard({ sparkline, priceUSD, buyHistory, hideBalances }: {
  sparkline: number[]; priceUSD: number; buyHistory: TradeHistoryItem[]; hideBalances: boolean;
}) {
  const data = sparkline.length >= 4 ? sparkline : Array(24).fill(priceUSD > 0 ? priceUSD / 1000 : 4.33);
  const isPositive = data.length > 1 && data[data.length - 1] >= data[0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = Dimensions.get('window').width - Spacing.xl * 2 - 2;
  const H = 56;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  }));
  const pathD = pts.reduce((acc, p, i) =>
    i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '');
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${H} L 0 ${H} Z`;
  const color = isPositive ? Colors.success : Colors.error;
  const totalBought = buyHistory.filter(h => h.coin === 'BTNGG' || h.coin === 'BTNG').reduce((s, h) => s + (h.total_usd ?? 0), 0);

  return (
    <View style={styles.priceHistCard}>
      <View style={styles.priceHistHeader}>
        <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.priceHistCoin} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={styles.priceHistTitle}>BTNGG · Gold Price History</Text>
          <Text style={styles.priceHistSub}>Live oracle · 24h sparkline</Text>
        </View>
        <View style={[styles.priceHistBadge, { backgroundColor: isPositive ? Colors.successBg : Colors.errorBg, borderColor: (isPositive ? Colors.success : Colors.error) + '44' }]}>
          <MaterialIcons name={isPositive ? 'trending-up' : 'trending-down'} size={11} color={isPositive ? Colors.success : Colors.error} />
          <Text style={[styles.priceHistPct, { color: isPositive ? Colors.success : Colors.error }]}>
            {data.length > 1 && data[0] > 0 ? `${isPositive ? '+' : ''}${(((data[data.length - 1] - data[0]) / data[0]) * 100).toFixed(2)}%` : '—'}
          </Text>
        </View>
      </View>
      <View style={styles.priceHistPriceRow}>
        <Text style={styles.priceHistPrice}>
          {priceUSD > 0 ? `$${(priceUSD / 1000).toFixed(4)}` : '—'}
        </Text>
        <Text style={styles.priceHistPriceLabel}>per BTNGG (1/1000 oz XAU)</Text>
      </View>
      <Svg width={W} height={H + 4}>
        <Defs>
          <LinearGradient id="btnggGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.3} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={areaD} fill="url(#btnggGrad)" />
        <Path d={pathD} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={color} stroke={Colors.bgCard} strokeWidth={1.5} />
      </Svg>
      {totalBought > 0 && !hideBalances && (
        <View style={styles.priceHistFooter}>
          <Text style={styles.priceHistFooterText}>Total BTNGG bought: <Text style={{ color: Colors.primary, fontWeight: '700' }}>${totalBought.toFixed(2)}</Text></Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Allocation Donut Chart
// ─────────────────────────────────────────────────────────────────────────────
function AssetAllocationChart({ coins, totalValue, hideBalances }: {
  coins: { id: string; symbol: string; color: string; balance: number; price: number }[];
  totalValue: number; hideBalances: boolean;
}) {
  const W = 120; const R = 46; const CX = 60; const CY = 60; const STROKE = 14;
  const slices = coins.map(c => ({ ...c, value: c.balance * c.price })).filter(c => c.value > 0);
  const total = slices.reduce((s, c) => s + c.value, 0) || 1;
  let cumAngle = -90;
  const paths = slices.map(s => {
    const pct = s.value / total;
    const angle = pct * 360;
    const startRad = (cumAngle * Math.PI) / 180;
    const endRad = ((cumAngle + angle - 0.5) * Math.PI) / 180;
    cumAngle += angle;
    const x1 = CX + R * Math.cos(startRad);
    const y1 = CY + R * Math.sin(startRad);
    const x2 = CX + R * Math.cos(endRad);
    const y2 = CY + R * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    return { d: `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`, color: s.color, symbol: s.symbol, pct };
  });
  return (
    <View style={styles.allocChartCard}>
      <View style={styles.allocChartHeader}>
        <MaterialIcons name="pie-chart" size={15} color={Colors.primary} />
        <Text style={styles.allocChartTitle}>Asset Allocation</Text>
      </View>
      <View style={styles.allocChartBody}>
        <Svg width={W} height={W}>
          {paths.map((p, i) => (
            <Path key={i} d={p.d} stroke={p.color} strokeWidth={STROKE} fill="none" strokeLinecap="butt" />
          ))}
          <SvgText x={CX} y={CY - 6} textAnchor="middle" fontSize={10} fill={Colors.textMuted}>Total</SvgText>
          <SvgText x={CX} y={CY + 10} textAnchor="middle" fontSize={13} fill={Colors.textPrimary} fontWeight="bold">
            {hideBalances ? '••••' : `$${totalValue >= 1000 ? (totalValue / 1000).toFixed(1) + 'K' : totalValue.toFixed(0)}`}
          </SvgText>
        </Svg>
        <View style={styles.allocLegend}>
          {slices.slice(0, 6).map(s => (
            <View key={s.id} style={styles.allocLegendItem}>
              <View style={[styles.allocLegendDot, { backgroundColor: s.color }]} />
              <Text style={styles.allocLegendLabel}>{s.symbol}</Text>
              <Text style={styles.allocLegendPct}>{((s.value / total) * 100).toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gold Price Oracle Card
// ─────────────────────────────────────────────────────────────────────────────
function GoldPriceOracleCard() {
  const { priceUSD, priceBTNGG, pricePerGram, pricePerKilo, changePct24h, source, loading, refresh } = useGoldOracle();
  const isLive = source === 'live';
  const isPos = changePct24h >= 0;
  return (
    <View style={styles.oracleCard}>
      <View style={styles.oracleHeader}>
        <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.oracleCoin} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={styles.oracleTitle}>BTNG Gold Oracle · Live XAU</Text>
          <Text style={styles.oracleSub}>Real-time gold price feed</Text>
        </View>
        <View style={[styles.oracleLiveBadge, { backgroundColor: isLive ? Colors.successBg : Colors.warningBg, borderColor: (isLive ? Colors.success : Colors.warning) + '44' }]}>
          <View style={[styles.oracleLiveDot, { backgroundColor: isLive ? Colors.success : Colors.warning }]} />
          <Text style={[styles.oracleLiveText, { color: isLive ? Colors.success : Colors.warning }]}>{loading ? 'LOADING' : isLive ? 'LIVE' : 'CACHED'}</Text>
        </View>
        <TouchableOpacity onPress={refresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="refresh" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.oracleStats}>
        <View style={styles.oracleStatCell}>
          <Text style={styles.oracleStatLabel}>XAU / oz</Text>
          <Text style={styles.oracleStatVal}>${priceUSD > 0 ? priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</Text>
        </View>
        <View style={styles.oracleStatDiv} />
        <View style={styles.oracleStatCell}>
          <Text style={styles.oracleStatLabel}>BTNGG</Text>
          <Text style={[styles.oracleStatVal, { color: Colors.primary }]}>{priceBTNGG > 0 ? `$${priceBTNGG.toFixed(4)}` : '—'}</Text>
        </View>
        <View style={styles.oracleStatDiv} />
        <View style={styles.oracleStatCell}>
          <Text style={styles.oracleStatLabel}>per gram</Text>
          <Text style={styles.oracleStatVal}>{pricePerGram > 0 ? `$${pricePerGram.toFixed(2)}` : '—'}</Text>
        </View>
        <View style={styles.oracleStatDiv} />
        <View style={styles.oracleStatCell}>
          <Text style={styles.oracleStatLabel}>24h Change</Text>
          <Text style={[styles.oracleStatVal, { color: isPos ? Colors.success : Colors.error }]}>
            {isPos ? '+' : ''}{changePct24h.toFixed(3)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BTNG Loan Calculator
// ─────────────────────────────────────────────────────────────────────────────
function BTNGLoanCalculator({ onNavigate }: { onNavigate: () => void }) {
  const { priceUSD } = useGoldOracle();
  const [collateral, setCollateral] = useState('1000');
  const ltv = 0.6;
  const apr = 8.5;
  const collateralNum = parseFloat(collateral.replace(/,/g, '')) || 0;
  const maxBorrow = collateralNum * ltv;
  const dailyRate = apr / 365 / 100;
  const monthlyInterest = maxBorrow * dailyRate * 30;
  const btnggEquiv = priceUSD > 0 ? collateralNum / (priceUSD / 1000) : 0;
  return (
    <View style={styles.loanCard}>
      <View style={styles.loanHeader}>
        <MaterialIcons name="account-balance" size={16} color={Colors.primary} />
        <Text style={styles.loanTitle}>BTNG Gold Loan Calculator</Text>
        <TouchableOpacity style={styles.loanOpenBtn} onPress={onNavigate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.loanOpenText}>Open Bank</Text>
          <MaterialIcons name="arrow-forward" size={12} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.loanInputRow}>
        <Text style={styles.loanInputLabel}>Gold Collateral (USD)</Text>
        <TextInput
          style={styles.loanInput}
          value={collateral}
          onChangeText={setCollateral}
          keyboardType="numeric"
          placeholder="1000"
          placeholderTextColor={Colors.textMuted}
        />
      </View>
      <View style={styles.loanStats}>
        <View style={styles.loanStatCell}>
          <Text style={styles.loanStatLabel}>Max Borrow</Text>
          <Text style={[styles.loanStatVal, { color: Colors.primary }]}>${maxBorrow.toFixed(2)}</Text>
        </View>
        <View style={styles.loanStatDiv} />
        <View style={styles.loanStatCell}>
          <Text style={styles.loanStatLabel}>LTV</Text>
          <Text style={styles.loanStatVal}>{(ltv * 100).toFixed(0)}%</Text>
        </View>
        <View style={styles.loanStatDiv} />
        <View style={styles.loanStatCell}>
          <Text style={styles.loanStatLabel}>APR</Text>
          <Text style={styles.loanStatVal}>{apr}%</Text>
        </View>
        <View style={styles.loanStatDiv} />
        <View style={styles.loanStatCell}>
          <Text style={styles.loanStatLabel}>30d Interest</Text>
          <Text style={[styles.loanStatVal, { color: Colors.warning }]}>${monthlyInterest.toFixed(2)}</Text>
        </View>
      </View>
      {btnggEquiv > 0 && (
        <View style={styles.loanBtnggRow}>
          <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
          <Text style={styles.loanBtnggText}>
            ${collateralNum.toLocaleString()} ≈ <Text style={{ color: Colors.primary, fontWeight: '700' }}>{btnggEquiv.toLocaleString('en-US', { maximumFractionDigits: 2 })} BTNGG</Text> at live oracle price
          </Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Card
// ─────────────────────────────────────────────────────────────────────────────
function TxCard({ tx, hideBalances }: { tx: TradeHistoryItem; hideBalances: boolean }) {
  const icon = TX_ICONS[tx.type] ?? 'swap-horiz';
  const color = TX_COLORS[tx.type] ?? Colors.primary;
  const isInflow = INFLOW_TYPES.includes(tx.type);
  return (
    <View style={styles.txCard}>
      <View style={[styles.txIconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.txInfo}>
        <View style={styles.txRow}>
          <Text style={styles.txType}>{tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} {tx.coin}</Text>
          <Text style={[styles.txAmount, { color: isInflow ? Colors.success : Colors.error }]}>
            {hideBalances ? '••••' : `${isInflow ? '+' : '-'}${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${tx.coin}`}
          </Text>
        </View>
        <View style={styles.txRow}>
          <Text style={styles.txDate}>{formatDate(tx.created_at)}</Text>
          <Text style={styles.txTotal}>
            {hideBalances ? '••••' : tx.total_usd ? `$${tx.total_usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
          </Text>
        </View>
        {tx.status && tx.status !== 'completed' && (
          <View style={[styles.txStatusChip, { backgroundColor: (tx.status === 'pending' ? Colors.warning : Colors.success) + '18' }]}>
            <Text style={[styles.txStatusText, { color: tx.status === 'pending' ? Colors.warning : Colors.success }]}>{tx.status}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  scrollTablet: { paddingHorizontal: Spacing.xl },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg },
  headerTablet: { paddingHorizontal: Spacing.xxl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  currencyPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  currencyPillFlag: { fontSize: 14 },
  currencyPillCode: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  notifBadge: { position: 'absolute', top: -3, right: -3, backgroundColor: Colors.error, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  notifBadgeText: { fontSize: 8, color: '#fff', fontWeight: FontWeight.bold, includeFontPadding: false },

  // Portfolio Card
  portfolioCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.xl, gap: Spacing.sm },
  portfolioCardTablet: { marginHorizontal: 0 },
  portfolioLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  portfolioLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  refreshBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  portfolioValue: { fontSize: 28, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false, letterSpacing: -0.5 },

  btnggContribRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '33', alignSelf: 'flex-start' },
  btnggContribDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  btnggContribText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  btnggContribValue: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  btnggContribPct: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  ghsTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '33', alignSelf: 'flex-start' },
  ghsTotalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  ghsTotalFlag: { fontSize: 14 },
  ghsTotalValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  ghsTotalRate: { fontSize: 9, color: Colors.success, includeFontPadding: false, opacity: 0.75 },

  localValueBlock: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '33', gap: 4 },
  localValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  localValueFlag: { fontSize: 16 },
  localValueText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, flex: 1 },
  localValueCode: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false, opacity: 0.75 },
  liveRateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveRateDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveRateLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  liveRateValue: { fontSize: 9, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  liveRateTime: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  pnlRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  pnlChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5 },
  pnlText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  pnlLocalBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderWidth: 1 },
  pnlLocalFlag: { fontSize: 12 },
  pnlLocalText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  pnlPeriod: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false, letterSpacing: 0.3 },

  tradingStats: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  tradingStatItem: { flex: 1, alignItems: 'center', gap: 3 },
  tradingStatVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  tradingStatLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  tradingStatDivider: { width: 1, backgroundColor: Colors.border },

  actionRow: { flexDirection: 'row', gap: 0 },
  actionBtn: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },

  // BTNG3 Wallet Card
  btng3Card: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', marginBottom: Spacing.lg, overflow: 'hidden', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  btng3Header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.primary + '22', backgroundColor: Colors.primaryGlow },
  btng3Coin: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: Colors.primary },
  btng3Title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  btng3Sub: { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace' as any, includeFontPadding: false },
  btng3TierBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  btng3TierText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  btng3Stats: { flexDirection: 'row', padding: Spacing.md },
  btng3StatItem: { flex: 1, alignItems: 'center', gap: 3 },
  btng3StatVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  btng3StatLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  btng3StatDiv: { width: 1, backgroundColor: Colors.border },

  // Identity Panel
  identityPanel: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, overflow: 'hidden' },
  identityPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.primaryGlow },
  identityPanelTitle: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  identityPanelLink: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  identityNationRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 8 },
  identityNationChip: { alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.sm, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.border },
  identityNationFlag: { fontSize: 20 },
  identityNationCode: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  identityNationCurr: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  // BTNGG Price History
  priceHistCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, overflow: 'hidden', padding: Spacing.md, gap: Spacing.sm },
  priceHistHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  priceHistCoin: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.primary },
  priceHistTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  priceHistSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  priceHistBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  priceHistPct: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  priceHistPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  priceHistPrice: { fontSize: 20, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  priceHistPriceLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  priceHistFooter: { paddingTop: Spacing.xs, borderTopWidth: 1, borderTopColor: Colors.border },
  priceHistFooterText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Asset Allocation
  allocChartCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, padding: Spacing.md },
  allocChartHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  allocChartTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  allocChartBody: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  allocLegend: { flex: 1, gap: 6 },
  allocLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allocLegendDot: { width: 10, height: 10, borderRadius: 5 },
  allocLegendLabel: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  allocLegendPct: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // 7-Day Chart
  chartCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, overflow: 'hidden', paddingTop: Spacing.md },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  chartTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  chartSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  chartBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  chartPct: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  lineChart: { paddingRight: 0, marginLeft: Spacing.xl },
  chartDayRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  chartDayCell: { flex: 1, alignItems: 'center', gap: 2 },
  chartDayLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  chartDayValue: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  // Gold Oracle
  oracleCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', marginBottom: Spacing.lg, overflow: 'hidden' },
  oracleHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.primary + '22', backgroundColor: Colors.primaryGlow },
  oracleCoin: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: Colors.primary },
  oracleTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  oracleSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  oracleLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  oracleLiveDot: { width: 5, height: 5, borderRadius: 2.5 },
  oracleLiveText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  oracleStats: { flexDirection: 'row', padding: Spacing.md },
  oracleStatCell: { flex: 1, alignItems: 'center', gap: 3 },
  oracleStatLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  oracleStatVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  oracleStatDiv: { width: 1, backgroundColor: Colors.border },

  // Active Zone Pill
  activeZonePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44', alignSelf: 'flex-start', flexWrap: 'wrap' },
  activeZoneDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  activeZoneName: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.4, flexShrink: 1 },
  activeZoneLimits: { flexDirection: 'row', gap: 5 },
  activeZoneLimitChip: { alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 6, paddingVertical: 2, gap: 1 },
  activeZoneLimitLabel: { fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.4, includeFontPadding: false },
  activeZoneLimitVal: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Loan Calculator
  loanCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, padding: Spacing.md, gap: Spacing.sm },
  loanHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  loanTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  loanOpenBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  loanOpenText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  loanInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  loanInputLabel: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  loanInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, color: Colors.textPrimary, fontSize: FontSize.sm, width: 120, textAlign: 'right' },
  loanStats: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  loanStatCell: { flex: 1, alignItems: 'center', gap: 3 },
  loanStatLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  loanStatVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  loanStatDiv: { width: 1, backgroundColor: Colors.border },
  loanBtnggRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  loanBtnggText: { flex: 1, fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Tabs
  tabRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  tabBtn: { flex: 1, paddingVertical: Spacing.sm + 2, alignItems: 'center', borderRadius: Radius.md },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  historyBadge: { backgroundColor: Colors.primary, borderRadius: 8, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  historyBadgeText: { fontSize: 10, color: Colors.bg, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Section
  section: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.lg },

  // Asset Cards
  assetCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  assetLogo: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  assetLogoText: { fontSize: 22, fontWeight: FontWeight.bold },
  assetInfo: { flex: 1, gap: 5, minWidth: 0 },
  assetNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assetSymbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  assetBalance: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, flexShrink: 1, textAlign: 'right', maxWidth: '55%' },
  assetAllocRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  allocBar: { flex: 1, height: 4, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden' },
  allocFill: { height: 4, borderRadius: 2 },
  allocPct: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, minWidth: 36, textAlign: 'right' },
  assetValueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assetPrice: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  assetValueRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  assetValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  // History
  filterScroll: { marginBottom: Spacing.md },
  filterContent: { gap: Spacing.sm, paddingVertical: 2 },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, height: 34, justifyContent: 'center' },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  filterChipTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  emptyHistory: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyHistoryTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptyHistorySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  authPrompt: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  authPromptTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  authPromptSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  signInBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  signInBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  loadingWrap: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  // Tx Card
  txCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  txIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  txInfo: { flex: 1, gap: 4 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txType: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  txAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false, flexShrink: 1, textAlign: 'right' },
  txDate: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  txTotal: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  txStatusChip: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  txStatusText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
});