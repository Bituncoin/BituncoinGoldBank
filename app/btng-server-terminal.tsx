/**
 * app/btng-server-terminal.tsx
 * BTNG Server Terminal — Read-Only Command Output Viewer
 *
 * Sends predefined safe commands to POST /api/admin/exec on port 8090.
 * Displays output in a monospace terminal-style card with copy and share buttons.
 * Bearer token protected — reuses SecureStore key 'btng_admin_token'.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Easing, ActivityIndicator, Platform,
  Share, Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const BANK_HOST    = '168.231.79.52';
const BANK_PORT    = 8090;
const EXEC_URL     = `http://${BANK_HOST}:${BANK_PORT}/api/admin/exec`;
const TOKEN_KEY    = 'btng_admin_token';
const REQUEST_TIMEOUT_MS = 12_000;

// ─── BTNG Network Node ────────────────────────────────────────────────────────
const BTNG_NODE_HOST = '154.161.183.158';
const BTNG_NODE_PORT = 38982;
const BTNG_NODE_BASE = `http://${BTNG_NODE_HOST}:${BTNG_NODE_PORT}`;
const BTNG_CLI_TIMEOUT_MS = 10_000;

// ─── BTNG Network CLI Endpoints ─────────────────────────────────────────────

interface CliEndpoint {
  id:          string;
  label:       string;
  method:      'GET' | 'POST';
  path:        string;          // may contain :param placeholders
  params?:     CliParam[];
  icon:        string;
  color:       string;
  desc:        string;
  category:    string;
  bodyBuilder?: (inputs: Record<string, string>) => object;
}

interface CliParam {
  key:         string;
  label:       string;
  placeholder: string;
  default?:    string;
}

const CLI_ENDPOINTS: CliEndpoint[] = [
  {
    id:       'health',
    label:    'Health Check',
    method:   'GET',
    path:     '/health',
    icon:     'favorite',
    color:    '#22C55E',
    desc:     'Check BTNG node health and uptime status',
    category: 'Node',
  },
  {
    id:       'mining_info',
    label:    'Mining Info',
    method:   'GET',
    path:     '/mining/info',
    icon:     'memory',
    color:    '#D4A017',
    desc:     'Current mining difficulty, height, and network status',
    category: 'Mining',
  },
  {
    id:       'mining_hashrate',
    label:    'Hashrate',
    method:   'GET',
    path:     '/mining/hashrate',
    icon:     'speed',
    color:    '#F59E0B',
    desc:     'Current network hashrate and mining statistics',
    category: 'Mining',
  },
  {
    id:       'oracle_price',
    label:    'Oracle Price',
    method:   'GET',
    path:     '/oracle/price',
    icon:     'show-chart',
    color:    '#8B5CF6',
    desc:     'Live BTNG gold-backed price from oracle',
    category: 'Oracle',
  },
  {
    id:       'oracle_marketcap',
    label:    'Market Cap',
    method:   'GET',
    path:     '/oracle/marketcap',
    icon:     'pie-chart',
    color:    '#A78BFA',
    desc:     'BTNG total market capitalisation',
    category: 'Oracle',
  },
  {
    id:       'explorer_block',
    label:    'Block Lookup',
    method:   'GET',
    path:     '/explorer/block/:id',
    params:   [{ key: 'id', label: 'Block ID / Height', placeholder: 'e.g. 1 or 12458', default: '1' }],
    icon:     'view-module',
    color:    '#60A5FA',
    desc:     'Look up a block by height or hash from the explorer',
    category: 'Explorer',
  },
  {
    id:       'explorer_tx',
    label:    'TX Lookup',
    method:   'GET',
    path:     '/explorer/tx/:hash',
    params:   [{ key: 'hash', label: 'Transaction Hash (0x…)', placeholder: 'e.g. 0xabc123…', default: '' }],
    icon:     'receipt-long',
    color:    '#34D399',
    desc:     'Fetch transaction details by hash from the explorer',
    category: 'Explorer',
  },
  {
    id:       'explorer_address',
    label:    'Address Info',
    method:   'GET',
    path:     '/explorer/address/:addr',
    params:   [{ key: 'addr', label: 'Wallet Address (GH…)', placeholder: 'e.g. GH0x1234…', default: '' }],
    icon:     'account-balance-wallet',
    color:    '#06B6D4',
    desc:     'Fetch address details and transaction history',
    category: 'Explorer',
  },
  {
    id:       'wallet_balance',
    label:    'Wallet Balance',
    method:   'GET',
    path:     '/wallet/balance/:address',
    params:   [{ key: 'address', label: 'Wallet Address', placeholder: 'e.g. GH0x1234…', default: '' }],
    icon:     'account-balance-wallet',
    color:    '#F472B6',
    desc:     'Get BTNG balance for a wallet address',
    category: 'Wallet',
  },
  {
    id:       'wallet_send',
    label:    'Send BTNG',
    method:   'POST',
    path:     '/wallet/send',
    params:   [
      { key: 'from',      label: 'From Address',  placeholder: 'e.g. GH0xABC…',  default: '' },
      { key: 'to',        label: 'To Address',    placeholder: 'e.g. GH0xDEF…',  default: '' },
      { key: 'amount',    label: 'Amount (BTNG)', placeholder: 'e.g. 10',         default: '' },
      { key: 'signature', label: 'Signature',     placeholder: 'cryptographic signature', default: '' },
    ],
    bodyBuilder: (inputs) => ({
      from:      inputs['from'],
      to:        inputs['to'],
      amount:    parseFloat(inputs['amount'] ?? '0'),
      signature: inputs['signature'],
    }),
    icon:     'send',
    color:    '#FB923C',
    desc:     'Broadcast a signed BTNG transaction to the network',
    category: 'Wallet',
  },
];

const CLI_CATEGORIES = ['All', 'Node', 'Mining', 'Oracle', 'Explorer', 'Wallet'];

// ─── Price Sample ────────────────────────────────────────────────────────────

interface PriceSample {
  price:  number;
  ts:     string;  // short HH:MM label
  ts_ms:  number;
}

// Extract a numeric price from oracle/price JSON response
function extractOraclePrice(json: object | null): number | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, any>;
  // Try common field names returned by BTNG oracle
  const candidates = [
    j['price'], j['btng_usd'], j['btng_price'], j['value'],
    j['data']?.['price'], j['result']?.['price'],
    j['gold_price'], j['rate'], j['usd'],
  ];
  for (const c of candidates) {
    const n = parseFloat(String(c ?? ''));
    if (!isNaN(n) && n > 0) return n;
  }
  // Fallback: first numeric value in the object
  for (const v of Object.values(j)) {
    if (typeof v === 'number' && v > 0) return v;
  }
  return null;
}

// ─── Oracle Price Sparkline ────────────────────────────────────────────────────

const SPARKLINE_COLOR   = '#8B5CF6';
const MAX_PRICE_SAMPLES = 10;
const AUTO_FETCH_MS     = 60_000;

function OraclePriceSparkline({ samples, fetching, nextFetchIn }: {
  samples:     PriceSample[];
  fetching:    boolean;
  nextFetchIn: number;  // seconds until next auto-fetch
}) {
  const MAX_BAR_H = 56;
  const SLOTS     = MAX_PRICE_SAMPLES;

  // Pad with nulls at the left when fewer than SLOTS samples
  const slots: (PriceSample | null)[] = [
    ...Array.from({ length: Math.max(0, SLOTS - samples.length) }, () => null),
    ...samples.slice(-SLOTS),
  ];

  const maxPrice = Math.max(...samples.map(s => s.price), 0.0001);
  const minPrice = Math.min(...samples.map(s => s.price), 0);
  const range    = maxPrice - minPrice || 0.0001;

  // Fixed array of SLOTS Animated.Values
  const barAnims = useRef(
    Array.from({ length: SLOTS }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const anims = slots.map((slot, i) =>
      Animated.timing(barAnims[i], {
        toValue:  slot ? Math.max(0.04, (slot.price - minPrice) / range) : 0,
        duration: 480 + i * 40,
        easing:   Easing.out(Easing.cubic),
        useNativeDriver: false,
      })
    );
    Animated.parallel(anims).start();
  }, [samples.length, maxPrice, minPrice]);

  const latestSample = samples[samples.length - 1] ?? null;
  const prevSample   = samples[samples.length - 2] ?? null;
  const priceDelta   = latestSample && prevSample
    ? latestSample.price - prevSample.price
    : 0;
  const trendColor   = priceDelta >= 0 ? '#22C55E' : '#EF4444';
  const trendIcon    = priceDelta >= 0 ? 'trending-up' : 'trending-down';

  // Countdown ring fill: nextFetchIn / (AUTO_FETCH_MS / 1000)
  const countdownPct = Math.max(0, Math.min(1, nextFetchIn / (AUTO_FETCH_MS / 1000)));

  return (
    <View style={sp.card}>
      {/* Header */}
      <View style={sp.header}>
        <View style={[sp.iconWrap, { backgroundColor: SPARKLINE_COLOR + '18', borderColor: SPARKLINE_COLOR + '44' }]}>
          <MaterialIcons name="show-chart" size={14} color={SPARKLINE_COLOR} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sp.title}>BTNG/USD Price History</Text>
          <Text style={sp.subtitle}>Auto-refreshed every 60s · last {samples.length} sample{samples.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Live price badge */}
        {latestSample ? (
          <View style={[sp.priceBadge, { backgroundColor: SPARKLINE_COLOR + '15', borderColor: SPARKLINE_COLOR + '44' }]}>
            <Text style={[sp.priceVal, { color: SPARKLINE_COLOR }]}>
              ${latestSample.price < 0.01
                  ? latestSample.price.toFixed(6)
                  : latestSample.price < 1
                    ? latestSample.price.toFixed(4)
                    : latestSample.price.toFixed(2)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <MaterialIcons name={trendIcon as any} size={10} color={trendColor} />
              <Text style={[sp.priceDelta, { color: trendColor }]}>
                {priceDelta >= 0 ? '+' : ''}{priceDelta.toFixed(4)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Countdown / fetching indicator */}
        <View style={sp.countdownWrap}>
          {fetching ? (
            <ActivityIndicator size="small" color={SPARKLINE_COLOR} style={{ transform: [{ scale: 0.7 }] }} />
          ) : (
            <View style={sp.countdownRing}>
              <View
                style={[
                  sp.countdownFill,
                  {
                    height: `${(1 - countdownPct) * 100}%` as any,
                    backgroundColor: SPARKLINE_COLOR,
                  },
                ]}
              />
              <Text style={sp.countdownText}>{nextFetchIn}s</Text>
            </View>
          )}
        </View>
      </View>

      {samples.length === 0 ? (
        <View style={sp.empty}>
          <MaterialIcons name="hourglass-empty" size={22} color={Colors.textMuted} />
          <Text style={sp.emptyText}>Fetching first sample from oracle…</Text>
        </View>
      ) : (
        <View style={sp.chartArea}>
          {/* Y-axis max */}
          <Text style={sp.yLabel}>
            {maxPrice < 0.01 ? maxPrice.toFixed(6) : maxPrice < 1 ? maxPrice.toFixed(4) : maxPrice.toFixed(2)}
          </Text>

          {/* Bars */}
          <View style={sp.barsRow}>
            {slots.map((slot, i) => {
              const isLatest = slot !== null && slot === slots.filter(Boolean).slice(-1)[0];
              return (
                <View key={i} style={sp.barCol}>
                  {/* Price micro-label above latest bar */}
                  {isLatest && slot ? (
                    <Text style={[sp.barTopLabel, { color: SPARKLINE_COLOR }]}>
                      {slot.price < 0.01 ? slot.price.toFixed(5) : slot.price.toFixed(3)}
                    </Text>
                  ) : (
                    <Text style={sp.barTopLabel}>{' '}</Text>
                  )}

                  <View style={[sp.barTrack, { height: MAX_BAR_H }]}>
                    <Animated.View
                      style={[
                        sp.bar,
                        {
                          height: barAnims[i].interpolate({
                            inputRange:  [0, 1],
                            outputRange: [0, MAX_BAR_H],
                          }),
                          backgroundColor: slot
                            ? isLatest
                              ? SPARKLINE_COLOR
                              : SPARKLINE_COLOR + 'AA'
                            : Colors.bgElevated,
                        },
                      ]}
                    />
                    {isLatest && (
                      <View style={[sp.barGlow, { shadowColor: SPARKLINE_COLOR }]} />
                    )}
                  </View>

                  {/* Time label */}
                  <Text style={[sp.barTs, { color: slot ? Colors.textMuted : Colors.border, opacity: slot ? 1 : 0.3 }]} numberOfLines={1}>
                    {slot ? slot.ts : '--'}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Baseline */}
          <View style={sp.baseline} />

          {/* Y-axis min */}
          <Text style={sp.yLabelMin}>
            {minPrice < 0.01 ? minPrice.toFixed(6) : minPrice < 1 ? minPrice.toFixed(4) : minPrice.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Recent samples list */}
      {samples.length > 1 && (
        <View style={sp.sampleList}>
          {[...samples].reverse().slice(0, 4).map((s, i) => {
            const prev = [...samples].reverse()[i + 1];
            const delta = prev ? s.price - prev.price : 0;
            const col   = delta >= 0 ? '#22C55E' : '#EF4444';
            return (
              <View key={s.ts_ms} style={[sp.sampleRow, i === 0 && { backgroundColor: SPARKLINE_COLOR + '0C', borderColor: SPARKLINE_COLOR + '44' }]}>
                <View style={[sp.sampleDot, { backgroundColor: i === 0 ? SPARKLINE_COLOR : Colors.textMuted }]} />
                <Text style={sp.sampleTs}>{s.ts}</Text>
                <View style={{ flex: 1 }} />
                <Text style={[sp.samplePrice, { color: i === 0 ? SPARKLINE_COLOR : Colors.textSecondary }]}>
                  ${s.price < 0.01 ? s.price.toFixed(6) : s.price < 1 ? s.price.toFixed(4) : s.price.toFixed(2)} BTNG
                </Text>
                {prev ? (
                  <View style={[sp.deltaBadge, { backgroundColor: col + '18', borderColor: col + '33' }]}>
                    <MaterialIcons name={delta >= 0 ? 'arrow-drop-up' : 'arrow-drop-down'} size={11} color={col} />
                    <Text style={[sp.deltaText, { color: col }]}>
                      {Math.abs(delta).toFixed(4)}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* Footer note */}
      <View style={sp.footer}>
        <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
        <Text style={sp.footerText}>
          Prices fetched automatically every 60s from {BTNG_NODE_BASE}/oracle/price · tap Oracle Price button to refresh manually
        </Text>
      </View>
    </View>
  );
}

const sp = StyleSheet.create({
  card:          { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: SPARKLINE_COLOR + '33', overflow: 'hidden', marginTop: 2 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: SPARKLINE_COLOR + '08', borderBottomWidth: 1, borderBottomColor: SPARKLINE_COLOR + '22' },
  iconWrap:      { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:         { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  subtitle:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  priceBadge:    { borderRadius: Radius.lg, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, alignItems: 'center', gap: 2 },
  priceVal:      { fontSize: 13, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  priceDelta:    { fontSize: 8, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  countdownWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  countdownRing: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: SPARKLINE_COLOR + '44', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  countdownFill: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: SPARKLINE_COLOR + '25' },
  countdownText: { fontSize: 7, fontWeight: FontWeight.heavy, color: SPARKLINE_COLOR, includeFontPadding: false, zIndex: 1 },
  empty:         { alignItems: 'center', gap: 6, paddingVertical: Spacing.lg },
  emptyText:     { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  chartArea:     { position: 'relative', paddingLeft: 42, paddingBottom: 24, paddingTop: 4, paddingRight: Spacing.md },
  yLabel:        { position: 'absolute', left: 0, top: 4, width: 38, fontSize: 7, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, textAlign: 'right' },
  yLabelMin:     { position: 'absolute', left: 0, bottom: 24, width: 38, fontSize: 7, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, textAlign: 'right' },
  barsRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barCol:        { flex: 1, alignItems: 'center', gap: 2 },
  barTrack:      { width: '100%', justifyContent: 'flex-end', backgroundColor: Colors.bgCard, borderRadius: 3, overflow: 'visible', borderWidth: 1, borderColor: Colors.border },
  bar:           { width: '100%', borderRadius: 3 },
  barGlow:       { position: 'absolute', top: -2, left: 0, right: 0, height: 4, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 4 },
  barTopLabel:   { fontSize: 6, fontWeight: FontWeight.heavy, color: SPARKLINE_COLOR, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, textAlign: 'center', marginBottom: 1 },
  barTs:         { fontSize: 6, textAlign: 'center', includeFontPadding: false, lineHeight: 8, marginTop: 1 },
  baseline:      { position: 'absolute', left: 42, right: Spacing.md, bottom: 24, height: 1, backgroundColor: SPARKLINE_COLOR + '33' },
  sampleList:    { gap: 4, borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.sm },
  sampleRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  sampleDot:     { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
  sampleTs:      { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  samplePrice:   { fontSize: 10, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  deltaBadge:    { flexDirection: 'row', alignItems: 'center', gap: 1, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  deltaText:     { fontSize: 8, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  footer:        { flexDirection: 'row', alignItems: 'flex-start', gap: 5, padding: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  footerText:    { flex: 1, fontSize: 8, color: Colors.textMuted, includeFontPadding: false, lineHeight: 11 },
});

// ─── CLI Result ───────────────────────────────────────────────────────────────

interface CliResult {
  id:         string;
  endpoint:   CliEndpoint;
  url:        string;
  status:     number | null;
  json:       object | null;
  rawText:    string;
  elapsed_ms: number;
  ts:         string;
  error:      string | null;
}

// ─── JSON Tree Renderer ───────────────────────────────────────────────────────

function JsonLine({ k, v, depth = 0 }: { k?: string; v: any; depth?: number }) {
  const indent = depth * 14;
  if (v === null || v === undefined) {
    return (
      <View style={{ flexDirection: 'row', marginLeft: indent }}>
        {k ? <Text style={jt.key}>{`"${k}"`}<Text style={jt.colon}>{': '}</Text></Text> : null}
        <Text style={jt.null}>null</Text>
      </View>
    );
  }
  if (typeof v === 'boolean') {
    return (
      <View style={{ flexDirection: 'row', marginLeft: indent }}>
        {k ? <Text style={jt.key}>{`"${k}"`}<Text style={jt.colon}>{': '}</Text></Text> : null}
        <Text style={jt.bool}>{v ? 'true' : 'false'}</Text>
      </View>
    );
  }
  if (typeof v === 'number') {
    return (
      <View style={{ flexDirection: 'row', marginLeft: indent }}>
        {k ? <Text style={jt.key}>{`"${k}"`}<Text style={jt.colon}>{': '}</Text></Text> : null}
        <Text style={jt.num}>{String(v)}</Text>
      </View>
    );
  }
  if (typeof v === 'string') {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginLeft: indent }}>
        {k ? <Text style={jt.key}>{`"${k}"`}<Text style={jt.colon}>{': '}</Text></Text> : null}
        <Text style={jt.str} selectable numberOfLines={3} ellipsizeMode="tail">{`"${v}"`}</Text>
      </View>
    );
  }
  if (Array.isArray(v)) {
    return (
      <View style={{ marginLeft: indent }}>
        {k ? <Text style={jt.key}>{`"${k}"`}<Text style={jt.bracket}>{': ['}</Text></Text> : <Text style={jt.bracket}>[</Text>}
        {v.slice(0, 12).map((item, i) => (
          <JsonLine key={i} v={item} depth={depth + 1} />
        ))}
        {v.length > 12 && <Text style={[jt.muted, { marginLeft: (depth + 1) * 14 }]}>…+{v.length - 12} more</Text>}
        <Text style={[jt.bracket, { marginLeft: indent }]}>{']'}</Text>
      </View>
    );
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    return (
      <View style={{ marginLeft: indent }}>
        {k ? <Text style={jt.key}>{`"${k}"`}<Text style={jt.bracket}>{': {'}</Text></Text> : <Text style={jt.bracket}>{'{'}</Text>}
        {keys.slice(0, 24).map(ck => (
          <JsonLine key={ck} k={ck} v={v[ck]} depth={depth + 1} />
        ))}
        {keys.length > 24 && <Text style={[jt.muted, { marginLeft: (depth + 1) * 14 }]}>…+{keys.length - 24} more keys</Text>}
        <Text style={[jt.bracket, { marginLeft: indent }]}>{'}'}</Text>
      </View>
    );
  }
  return <Text style={[jt.str, { marginLeft: indent }]}>{String(v)}</Text>;
}

const jt = StyleSheet.create({
  key:    { fontSize: 10, color: '#93C5FD', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  colon:  { color: '#9CA3AF' },
  str:    { fontSize: 10, color: '#86EFAC', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, flexShrink: 1 },
  num:    { fontSize: 10, color: '#FCD34D', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  bool:   { fontSize: 10, color: '#F472B6', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  null:   { fontSize: 10, color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  bracket:{ fontSize: 10, color: '#D4A017', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  muted:  { fontSize: 9,  color: '#4B5563', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── CLI Output Panel ─────────────────────────────────────────────────────────

function CliOutputPanel({ result, onClose }: { result: CliResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const slideAnim = useRef(new Animated.Value(20)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(opacAnim,  { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [result.id]);

  const handleCopy = () => {
    const text = result.error
      ? `# ERROR ${result.url}\n${result.error}`
      : `# ${result.endpoint.method} ${result.url}\n# Status: ${result.status} · ${result.elapsed_ms}ms · ${result.ts}\n\n${JSON.stringify(result.json ?? result.rawText, null, 2)}`;
    try { Clipboard.setString(text); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleShare = async () => {
    const text = result.error
      ? `BTNG CLI\n${result.url}\n\nERROR:\n${result.error}`
      : `BTNG CLI\n${result.url}\nStatus: ${result.status} · ${result.elapsed_ms}ms\n${result.ts}\n\n${JSON.stringify(result.json ?? result.rawText, null, 2)}`;
    try { await Share.share({ message: text, title: `BTNG CLI: ${result.endpoint.label}` }); } catch {}
  };

  const ok = !result.error && result.status !== null && result.status >= 200 && result.status < 300;
  const statusColor = result.error ? '#EF4444' : ok ? '#22C55E' : '#F59E0B';

  return (
    <Animated.View style={[clo.wrap, { transform: [{ translateY: slideAnim }], opacity: opacAnim, borderColor: result.endpoint.color + '44' }]}>
      {/* Header */}
      <View style={clo.header}>
        <View style={[clo.methodBadge, { backgroundColor: result.endpoint.method === 'GET' ? '#22C55E18' : '#F59E0B18', borderColor: result.endpoint.method === 'GET' ? '#22C55E44' : '#F59E0B44' }]}>
          <Text style={[clo.methodText, { color: result.endpoint.method === 'GET' ? '#22C55E' : '#F59E0B' }]}>{result.endpoint.method}</Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[clo.urlText, { color: result.endpoint.color }]} numberOfLines={1}>{result.url}</Text>
          <View style={clo.metaRow}>
            <View style={[clo.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '33' }]}>
              <Text style={[clo.statusText, { color: statusColor }]}>
                {result.status !== null ? `HTTP ${result.status}` : 'ERR'}
              </Text>
            </View>
            <Text style={clo.metaMuted}>{result.elapsed_ms}ms · {result.ts}</Text>
          </View>
        </View>
        <TouchableOpacity style={[clo.iconBtn, copied && { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]} onPress={handleCopy} activeOpacity={0.8}>
          <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={copied ? '#22C55E' : Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={clo.iconBtn} onPress={handleShare} activeOpacity={0.8}>
          <MaterialIcons name="share" size={13} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={clo.iconBtn} onPress={onClose} activeOpacity={0.8}>
          <MaterialIcons name="close" size={13} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Body */}
      <ScrollView style={clo.body} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {result.error ? (
          <Text style={clo.errText} selectable>{result.error}</Text>
        ) : result.json !== null ? (
          <View style={{ paddingVertical: 4 }}>
            <JsonLine v={result.json} depth={0} />
          </View>
        ) : (
          <Text style={clo.rawText} selectable>{result.rawText || '(empty response)'}</Text>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={clo.footer}>
        <MaterialIcons name="wifi" size={10} color={Colors.textMuted} />
        <Text style={clo.footerText}>
          {result.error ? 'request failed' : `${BTNG_NODE_HOST}:${BTNG_NODE_PORT} · ${result.endpoint.method} ${result.endpoint.path}`}
        </Text>
        {copied && (
          <View style={clo.copiedBadge}>
            <MaterialIcons name="check" size={9} color="#22C55E" />
            <Text style={clo.copiedText}>Copied!</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const clo = StyleSheet.create({
  wrap:        { backgroundColor: '#070710', borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: Spacing.sm + 2, backgroundColor: '#0F0F1A', borderBottomWidth: 1, borderBottomColor: '#FFFFFF10' },
  methodBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0, marginTop: 2, alignSelf: 'flex-start' },
  methodText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  urlText:     { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  statusText:  { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  metaMuted:   { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  iconBtn:     { width: 26, height: 26, borderRadius: 7, backgroundColor: '#FFFFFF08', borderWidth: 1, borderColor: '#FFFFFF10', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body:        { maxHeight: 320, padding: Spacing.md },
  errText:     { fontSize: 10, color: '#FCA5A5', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  rawText:     { fontSize: 10, color: '#E5E7EB', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  footer:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#FFFFFF08' },
  footerText:  { flex: 1, fontSize: 9, color: '#374151', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  copiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#22C55E15', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#22C55E33' },
  copiedText:  { fontSize: 9, color: '#22C55E', fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ─── CLI Endpoint Button ──────────────────────────────────────────────────────

function CliEndpointBtn({
  ep, isRunning, isLast, onPress,
}: {
  ep: CliEndpoint;
  isRunning: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const pressAnim = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(pressAnim, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(pressAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
      <TouchableOpacity
        style={[
          ceb.btn,
          { borderColor: ep.color + '33' },
          isRunning && { borderColor: ep.color + 'BB', backgroundColor: ep.color + '10' },
          isLast    && { borderColor: ep.color + 'CC', backgroundColor: ep.color + '14' },
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={isRunning}
      >
        {/* Method badge */}
        <View style={[ceb.methodWrap, { backgroundColor: ep.method === 'GET' ? '#22C55E18' : '#F59E0B18', borderColor: ep.method === 'GET' ? '#22C55E44' : '#F59E0B44' }]}>
          <Text style={[ceb.methodText, { color: ep.method === 'GET' ? '#22C55E' : '#F59E0B' }]}>{ep.method}</Text>
        </View>
        {/* Icon */}
        <View style={[ceb.iconWrap, { backgroundColor: ep.color + '18', borderColor: ep.color + '33' }]}>
          {isRunning ? (
            <ActivityIndicator size="small" color={ep.color} style={{ transform: [{ scale: 0.7 }] }} />
          ) : (
            <MaterialIcons name={ep.icon as any} size={14} color={ep.color} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[ceb.label, { color: ep.color }]} numberOfLines={1}>{ep.label}</Text>
          <Text style={ceb.path} numberOfLines={1}>{ep.path}</Text>
          <Text style={ceb.desc} numberOfLines={1}>{ep.desc}</Text>
        </View>
        <View style={[ceb.catBadge, { backgroundColor: ep.color + '12', borderColor: ep.color + '30' }]}>
          <Text style={[ceb.catText, { color: ep.color }]}>{ep.category}</Text>
        </View>
        {isRunning
          ? <SpinnerDots color={ep.color} />
          : <MaterialIcons name="play-arrow" size={16} color={ep.color + 'AA'} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

const ceb = StyleSheet.create({
  btn:        { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, minHeight: 58 },
  methodWrap: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 },
  methodText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  iconWrap:   { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:      { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  path:       { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  desc:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  catBadge:   { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  catText:    { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
});

// ─── CLI Param Input Form ─────────────────────────────────────────────────────

function CliParamForm({ ep, onRun, isRunning }: {
  ep: CliEndpoint;
  onRun: (inputs: Record<string, string>) => void;
  isRunning: boolean;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    ep.params?.forEach(p => { init[p.key] = p.default ?? ''; });
    return init;
  });

  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 1, duration: 240, useNativeDriver: false }),
      Animated.timing(opacAnim,  { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[cpf.card, { borderColor: ep.color + '44', opacity: opacAnim }]}>
      <View style={cpf.header}>
        <MaterialIcons name="tune" size={14} color={ep.color} />
        <Text style={[cpf.title, { color: ep.color }]}>Parameters · {ep.path}</Text>
      </View>
      {ep.params!.map(p => (
        <View key={p.key} style={cpf.fieldRow}>
          <Text style={cpf.fieldLabel}>{p.label}</Text>
          <TextInput
            style={[cpf.fieldInput, { borderColor: inputs[p.key] ? ep.color + '55' : Colors.border }]}
            value={inputs[p.key]}
            onChangeText={v => setInputs(prev => ({ ...prev, [p.key]: v }))}
            placeholder={p.placeholder}
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ))}
      <TouchableOpacity
        style={[cpf.runBtn, { backgroundColor: ep.color, shadowColor: ep.color }, isRunning && { opacity: 0.55 }]}
        onPress={() => onRun(inputs)}
        disabled={isRunning}
        activeOpacity={0.85}
      >
        {isRunning
          ? <ActivityIndicator size="small" color={Colors.bg} style={{ transform: [{ scale: 0.8 }] }} />
          : <MaterialIcons name="play-arrow" size={18} color={Colors.bg} />}
        <Text style={cpf.runBtnText}>{isRunning ? 'Requesting…' : `Run ${ep.method} ${ep.label}`}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const cpf = StyleSheet.create({
  card:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  header:    { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title:     { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  fieldRow:  { gap: 4 },
  fieldLabel:{ fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false, letterSpacing: 0.3, textTransform: 'uppercase' as any },
  fieldInput:{ height: 40, backgroundColor: Colors.bgCard, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.sm + 2, fontSize: FontSize.xs, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  runBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, paddingVertical: 12, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4, marginTop: 2 },
  runBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
});

// ─── BTNG Network CLI Panel ───────────────────────────────────────────────────

function BTNGNetworkCliPanel() {
  const [cliCatFilter,   setCliCatFilter]   = useState('All');
  const [cliRunningId,   setCliRunningId]   = useState<string | null>(null);
  const [cliResults,     setCliResults]     = useState<CliResult[]>([]);
  const [activeCliRes,   setActiveCliRes]   = useState<CliResult | null>(null);
  const [selectedEp,     setSelectedEp]     = useState<CliEndpoint | null>(null);
  const [cliHistory,     setCliHistory]     = useState<CliResult[]>([]);
  const [showCliHistory, setShowCliHistory] = useState(false);

  // ── Oracle Price Sparkline state ─────────────────────────────────────────
  const [priceSamples,   setPriceSamples]   = useState<PriceSample[]>([]);
  const [priceFetching,  setPriceFetching]  = useState(false);
  const [nextFetchIn,    setNextFetchIn]    = useState(AUTO_FETCH_MS / 1000);
  const autoFetchTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimer   = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOraclePrice = useCallback(async () => {
    setPriceFetching(true);
    setNextFetchIn(AUTO_FETCH_MS / 1000);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), BTNG_CLI_TIMEOUT_MS);
      const res = await fetch(`${BTNG_NODE_BASE}/oracle/price`, {
        method:  'GET',
        signal:  controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(tid);
      let json: object | null = null;
      try {
        const raw = await res.text();
        json = JSON.parse(raw);
      } catch { /* ignore */ }
      const price = extractOraclePrice(json);
      if (price !== null) {
        const now = new Date();
        const ts  = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setPriceSamples(prev => [
          ...prev.slice(-(MAX_PRICE_SAMPLES - 1)),
          { price, ts, ts_ms: now.getTime() },
        ]);
      }
    } catch { /* network error — skip sample */ } finally {
      setPriceFetching(false);
    }
  }, []);

  // Auto-fetch on mount and every 60s, with live countdown
  useEffect(() => {
    fetchOraclePrice();
    // countdown tick
    countdownTimer.current = setInterval(() => {
      setNextFetchIn(prev => Math.max(0, prev - 1));
    }, 1000);
    // auto re-fetch
    autoFetchTimer.current = setInterval(() => {
      fetchOraclePrice();
      setNextFetchIn(AUTO_FETCH_MS / 1000);
    }, AUTO_FETCH_MS);
    return () => {
      if (autoFetchTimer.current)  clearInterval(autoFetchTimer.current);
      if (countdownTimer.current)  clearInterval(countdownTimer.current);
    };
  }, [fetchOraclePrice]);

  // When oracle_price result arrives, extract and record price sample
  useEffect(() => {
    if (!activeCliRes || activeCliRes.endpoint.id !== 'oracle_price') return;
    if (activeCliRes.error || !activeCliRes.json) return;
    const price = extractOraclePrice(activeCliRes.json);
    if (price === null) return;
    const now = new Date();
    const ts  = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setPriceSamples(prev => {
      // Avoid duplicate if auto-fetch just ran
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.price - price) < 0.000001 && now.getTime() - last.ts_ms < 5000) return prev;
      return [...prev.slice(-(MAX_PRICE_SAMPLES - 1)), { price, ts, ts_ms: now.getTime() }];
    });
    // Reset auto-fetch countdown since we just got fresh data
    setNextFetchIn(AUTO_FETCH_MS / 1000);
  }, [activeCliRes?.id]);

  const filteredEps = cliCatFilter === 'All'
    ? CLI_ENDPOINTS
    : CLI_ENDPOINTS.filter(e => e.category === cliCatFilter);

  // Build URL from endpoint + inputs
  const buildUrl = (ep: CliEndpoint, inputs: Record<string, string> = {}): string => {
    let path = ep.path;
    (ep.params ?? []).forEach(p => {
      path = path.replace(`:${p.key}`, encodeURIComponent(inputs[p.key] ?? ''));
    });
    return `${BTNG_NODE_BASE}${path}`;
  };

  const runCliEndpoint = useCallback(async (ep: CliEndpoint, inputs: Record<string, string> = {}) => {
    setSelectedEp(null);
    setCliRunningId(ep.id);
    const url = buildUrl(ep, inputs);
    const startTime = Date.now();
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), BTNG_CLI_TIMEOUT_MS);

      const fetchOpts: RequestInit = {
        method:  ep.method,
        signal:  controller.signal,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      };
      if (ep.method === 'POST' && ep.bodyBuilder) {
        fetchOpts.body = JSON.stringify(ep.bodyBuilder(inputs));
      }

      const res = await fetch(url, fetchOpts);
      clearTimeout(timer);
      const elapsed_ms = Date.now() - startTime;

      let json: object | null = null;
      let rawText = '';
      let errorMsg: string | null = null;

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        json = await res.json().catch(() => null);
        if (json === null) rawText = '(invalid JSON)';
      } else {
        rawText = await res.text().catch(() => '');
        // Try to parse as JSON anyway
        try { json = JSON.parse(rawText); rawText = ''; } catch {}
      }

      if (!res.ok) {
        errorMsg = `HTTP ${res.status} ${res.statusText}${json ? '\n' + JSON.stringify(json, null, 2) : rawText ? '\n' + rawText : ''}`;
      }

      const result: CliResult = { id: `${ep.id}-${Date.now()}`, endpoint: ep, url, status: res.status, json, rawText, elapsed_ms, ts, error: errorMsg };
      setCliResults(prev => [result, ...prev].slice(0, 30));
      setCliHistory(prev => [result, ...prev].slice(0, 50));
      setActiveCliRes(result);
    } catch (err: any) {
      const elapsed_ms = Date.now() - startTime;
      const isTimeout = err?.name === 'AbortError';
      const result: CliResult = {
        id: `${ep.id}-${Date.now()}`, endpoint: ep, url, status: null,
        json: null, rawText: '',
        elapsed_ms, ts,
        error: isTimeout
          ? `Request timed out after ${BTNG_CLI_TIMEOUT_MS / 1000}s — node may be offline or unreachable at ${BTNG_NODE_HOST}:${BTNG_NODE_PORT}`
          : `Connection failed: ${err?.message ?? 'unknown error'}\n\nEndpoint: ${url}\nNode: ${BTNG_NODE_HOST}:${BTNG_NODE_PORT}`,
      };
      setCliResults(prev => [result, ...prev].slice(0, 30));
      setCliHistory(prev => [result, ...prev].slice(0, 50));
      setActiveCliRes(result);
    } finally {
      setCliRunningId(null);
    }
  }, []);

  const handleEpPress = (ep: CliEndpoint) => {
    if (ep.params && ep.params.length > 0) {
      // Show param form
      setSelectedEp(prev => prev?.id === ep.id ? null : ep);
    } else {
      runCliEndpoint(ep, {});
    }
  };

  return (
    <View style={nc.panel}>
      {/* Panel Header */}
      <View style={nc.panelHeader}>
        <View style={nc.panelIconWrap}>
          <MaterialIcons name="lan" size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={nc.panelTitle}>BTNG Network CLI</Text>
          <Text style={nc.panelSub}>{BTNG_NODE_HOST}:{BTNG_NODE_PORT} · {CLI_ENDPOINTS.length} endpoints</Text>
        </View>
        <TouchableOpacity
          style={[nc.histBtn, showCliHistory && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}
          onPress={() => setShowCliHistory(p => !p)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="history" size={16} color={showCliHistory ? Colors.primary : Colors.textMuted} />
          {cliHistory.length > 0 && (
            <View style={nc.histBadge}>
              <Text style={nc.histBadgeText}>{cliHistory.length > 9 ? '9+' : cliHistory.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Node status info strip */}
      <View style={nc.nodeStrip}>
        <View style={nc.nodeStripLeft}>
          <View style={[nc.nodeDot, { backgroundColor: Colors.success }]} />
          <Text style={nc.nodeStripText}>node · {BTNG_NODE_HOST}:{BTNG_NODE_PORT}</Text>
        </View>
        <Text style={nc.nodeStripNote}>No auth required · public endpoints</Text>
      </View>

      {/* Active CLI output */}
      {activeCliRes ? (
        <CliOutputPanel result={activeCliRes} onClose={() => setActiveCliRes(null)} />
      ) : null}

      {/* Oracle Price Sparkline — shown below oracle/price results */}
      {(activeCliRes?.endpoint.id === 'oracle_price' || priceSamples.length > 0) ? (
        <OraclePriceSparkline
          samples={priceSamples}
          fetching={priceFetching}
          nextFetchIn={nextFetchIn}
        />
      ) : null}

      {/* CLI History */}
      {showCliHistory && cliHistory.length > 0 ? (
        <View style={nc.histCard}>
          <View style={nc.histHeader}>
            <MaterialIcons name="history" size={13} color={Colors.textMuted} />
            <Text style={nc.histTitle}>CLI History</Text>
            <Text style={nc.histCount}>{cliHistory.length} calls</Text>
            <TouchableOpacity
              style={nc.clearHistBtn}
              onPress={() => { setCliHistory([]); setCliResults([]); setActiveCliRes(null); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="delete-sweep" size={13} color={Colors.textMuted} />
              <Text style={nc.clearHistText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {cliHistory.slice(0, 8).map(r => {
            const ok = !r.error && r.status !== null && r.status >= 200 && r.status < 300;
            const col = r.error ? '#EF4444' : ok ? '#22C55E' : '#F59E0B';
            return (
              <TouchableOpacity
                key={r.id}
                style={[nc.histRow, activeCliRes?.id === r.id && { backgroundColor: r.endpoint.color + '12', borderColor: r.endpoint.color + '44' }]}
                onPress={() => { setActiveCliRes(r); setShowCliHistory(false); }}
                activeOpacity={0.8}
              >
                <View style={[nc.histRowDot, { backgroundColor: col }]} />
                <View style={[nc.histMethodBadge, { backgroundColor: r.endpoint.method === 'GET' ? '#22C55E18' : '#F59E0B18', borderColor: r.endpoint.method === 'GET' ? '#22C55E33' : '#F59E0B33' }]}>
                  <Text style={[nc.histMethodText, { color: r.endpoint.method === 'GET' ? '#22C55E' : '#F59E0B' }]}>{r.endpoint.method}</Text>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[nc.histRowLabel, { color: r.endpoint.color }]} numberOfLines={1}>{r.endpoint.label}</Text>
                  <Text style={nc.histRowUrl} numberOfLines={1}>{r.url.replace(BTNG_NODE_BASE, '')}</Text>
                </View>
                <Text style={[nc.histRowStatus, { color: col }]}>{r.status !== null ? r.status : 'ERR'}</Text>
                <Text style={nc.histRowMs}>{r.elapsed_ms}ms</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Category filter */}
      <View style={nc.catWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={nc.catContent}>
          {CLI_CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[nc.catChip, cat === cliCatFilter && nc.catChipActive]}
              onPress={() => setCliCatFilter(cat)}
              activeOpacity={0.8}
            >
              <Text style={[nc.catText, cat === cliCatFilter && nc.catTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Endpoint grid */}
      <View style={nc.epGrid}>
        <View style={nc.epGridHdr}>
          <MaterialIcons name="api" size={12} color={Colors.textMuted} />
          <Text style={nc.epGridHdrText}>
            {cliCatFilter === 'All' ? `All Endpoints (${CLI_ENDPOINTS.length})` : `${cliCatFilter} (${filteredEps.length})`}
          </Text>
          {cliRunningId && (
            <View style={nc.runPill}>
              <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.55 }] }} />
              <Text style={nc.runPillText}>Fetching…</Text>
            </View>
          )}
        </View>

        {filteredEps.map(ep => (
          <View key={ep.id}>
            <CliEndpointBtn
              ep={ep}
              isRunning={cliRunningId === ep.id}
              isLast={activeCliRes?.endpoint.id === ep.id}
              onPress={() => handleEpPress(ep)}
            />
            {/* Param form for this endpoint */}
            {selectedEp?.id === ep.id && ep.params && ep.params.length > 0 ? (
              <CliParamForm
                ep={ep}
                isRunning={cliRunningId === ep.id}
                onRun={(inputs) => runCliEndpoint(ep, inputs)}
              />
            ) : null}
          </View>
        ))}
      </View>

      {/* Node reference */}
      <View style={nc.refCard}>
        <View style={nc.refHeader}>
          <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
          <Text style={nc.refTitle}>BTNG Node · {BTNG_NODE_HOST}:{BTNG_NODE_PORT}</Text>
        </View>
        {[
          { method: 'GET', path: '/health',                  desc: 'Node health and version' },
          { method: 'GET', path: '/mining/info',             desc: 'Difficulty, block height, network' },
          { method: 'GET', path: '/mining/hashrate',         desc: 'Network hashrate stats' },
          { method: 'GET', path: '/oracle/price',            desc: 'Live BTNG/USD price from oracle' },
          { method: 'GET', path: '/oracle/marketcap',        desc: 'Total market capitalisation' },
          { method: 'GET', path: '/explorer/block/:id',      desc: 'Block by height or hash' },
          { method: 'GET', path: '/explorer/tx/:hash',       desc: 'Transaction by hash' },
          { method: 'GET', path: '/explorer/address/:addr',  desc: 'Address details + tx history' },
          { method: 'GET', path: '/wallet/balance/:address', desc: 'Wallet BTNG balance' },
          { method: 'POST',path: '/wallet/send',             desc: 'Broadcast signed transaction' },
        ].map(row => (
          <View key={row.path} style={nc.refRow}>
            <View style={[nc.refMethodBadge, { backgroundColor: row.method === 'GET' ? '#22C55E15' : '#F59E0B15', borderColor: row.method === 'GET' ? '#22C55E33' : '#F59E0B33' }]}>
              <Text style={[nc.refMethodText, { color: row.method === 'GET' ? '#22C55E' : '#F59E0B' }]}>{row.method}</Text>
            </View>
            <Text style={nc.refPath} selectable>{row.path}</Text>
            <Text style={nc.refDesc}>{row.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const nc = StyleSheet.create({
  panel:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xxl, borderWidth: 1.5, borderColor: Colors.primary + '33', overflow: 'hidden' },
  panelHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  panelIconWrap:  { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  panelTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  panelSub:       { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: 2 },
  histBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  histBadge:      { position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  histBadgeText:  { fontSize: 7, fontWeight: FontWeight.heavy, color: '#060608', includeFontPadding: false },
  nodeStrip:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: 9, backgroundColor: '#22C55E08', borderBottomWidth: 1, borderBottomColor: '#22C55E22' },
  nodeStripLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nodeDot:        { width: 7, height: 7, borderRadius: 3.5 },
  nodeStripText:  { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  nodeStripNote:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  // history
  histCard:       { margin: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, gap: Spacing.xs },
  histHeader:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  histTitle:      { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  histCount:      { fontSize: 9, color: Colors.textMuted, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border, includeFontPadding: false },
  clearHistBtn:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  clearHistText:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  histRow:        { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard, marginTop: 4 },
  histRowDot:     { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  histMethodBadge:{ borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, flexShrink: 0 },
  histMethodText: { fontSize: 7, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  histRowLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  histRowUrl:     { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  histRowStatus:  { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  histRowMs:      { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  // category filter
  catWrap:        { borderBottomWidth: 1, borderBottomColor: Colors.border },
  catContent:     { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: 7 },
  catChip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, height: 32, justifyContent: 'center' },
  catChipActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catText:        { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },
  catTextActive:  { color: Colors.bg, fontWeight: FontWeight.bold },
  // endpoint grid
  epGrid:         { padding: Spacing.md, gap: Spacing.sm },
  epGridHdr:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 2 },
  epGridHdrText:  { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  runPill:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  runPillText:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  // reference card
  refCard:        { margin: Spacing.md, marginTop: 0, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 3 },
  refHeader:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  refTitle:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  refRow:         { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  refMethodBadge: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  refMethodText:  { fontSize: 7, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  refPath:        { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  refDesc:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 1 },
});

// ─── Predefined Safe Commands ────────────────────────────────────────────────

interface Command {
  id:       string;
  label:    string;
  cmd:      string;
  icon:     string;
  color:    string;
  desc:     string;
  category: string;
}

const COMMANDS: Command[] = [
  {
    id:       'uptime',
    label:    'uptime',
    cmd:      'uptime',
    icon:     'schedule',
    color:    '#22C55E',
    desc:     'System uptime and load averages',
    category: 'System',
  },
  {
    id:       'df',
    label:    'df -h',
    cmd:      'df -h',
    icon:     'storage',
    color:    '#60A5FA',
    desc:     'Disk usage for all filesystems',
    category: 'Disk',
  },
  {
    id:       'free',
    label:    'free -m',
    cmd:      'free -m',
    icon:     'memory',
    color:    '#8B5CF6',
    desc:     'Memory usage in megabytes',
    category: 'Memory',
  },
  {
    id:       'ps',
    label:    'ps top mem',
    cmd:      'ps aux --sort=-%mem | head -10',
    icon:     'bar-chart',
    color:    '#F59E0B',
    desc:     'Top 10 processes by memory usage',
    category: 'Processes',
  },
  {
    id:       'pm2',
    label:    'pm2 list',
    cmd:      'pm2 list',
    icon:     'dns',
    color:    '#D4A017',
    desc:     'PM2 process manager status',
    category: 'PM2',
  },
  {
    id:       'uname',
    label:    'uname -a',
    cmd:      'uname -a',
    icon:     'info-outline',
    color:    '#34D399',
    desc:     'Kernel and OS version info',
    category: 'System',
  },
  {
    id:       'who',
    label:    'who',
    cmd:      'who',
    icon:     'person',
    color:    '#FB7185',
    desc:     'Currently logged-in users',
    category: 'System',
  },
  {
    id:       'df_inodes',
    label:    'df -i',
    cmd:      'df -i',
    icon:     'insert-drive-file',
    color:    '#38BDF8',
    desc:     'Inode usage per filesystem',
    category: 'Disk',
  },
  {
    id:       'top_cpu',
    label:    'ps top cpu',
    cmd:      'ps aux --sort=-%cpu | head -10',
    icon:     'speed',
    color:    '#EF4444',
    desc:     'Top 10 processes by CPU usage',
    category: 'Processes',
  },
  {
    id:       'netstat',
    label:    'ss -tuln',
    cmd:      'ss -tuln',
    icon:     'wifi',
    color:    '#A78BFA',
    desc:     'Open TCP/UDP listening ports',
    category: 'Network',
  },
  {
    id:       'env_node',
    label:    'node -v',
    cmd:      'node -v && npm -v',
    icon:     'code',
    color:    '#4ADE80',
    desc:     'Node.js and npm versions',
    category: 'Runtime',
  },
  {
    id:       'pm2_logs_tail',
    label:    'pm2 logs --lines 20',
    cmd:      'pm2 logs --lines 20 --nostream 2>&1 | tail -20',
    icon:     'list-alt',
    color:    '#FCD34D',
    desc:     'Last 20 lines of PM2 logs',
    category: 'PM2',
  },
];

const CATEGORIES = ['All', 'System', 'Disk', 'Memory', 'Processes', 'PM2', 'Network', 'Runtime'];

// ─── Output Result ────────────────────────────────────────────────────────────

interface CmdResult {
  id:         string;
  cmd:        Command;
  output:     string;
  exitCode:   number | null;
  elapsed_ms: number;
  ts:         string;
  error:      string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function escapeAnsi(str: string): string {
  // Strip ANSI escape codes for clean terminal display
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
}

// ─── AnimatedProgressBar ─────────────────────────────────────────────────────

function SpinnerDots({ color = Colors.primary }: { color?: string }) {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1,   duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color, opacity: d }}
        />
      ))}
    </View>
  );
}

// ─── Command Button ───────────────────────────────────────────────────────────

function CmdButton({
  cmd,
  isRunning,
  isLast,
  onPress,
}: {
  cmd:       Command;
  isRunning: boolean;
  isLast:    boolean;
  onPress:   () => void;
}) {
  const pressAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(pressAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(pressAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
      <TouchableOpacity
        style={[
          cb.btn,
          { borderColor: cmd.color + '44' },
          isRunning && { borderColor: cmd.color + 'AA', backgroundColor: cmd.color + '12' },
          isLast    && { borderColor: cmd.color + 'CC', backgroundColor: cmd.color + '18' },
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={isRunning}
      >
        <View style={[cb.iconWrap, { backgroundColor: cmd.color + '18', borderColor: cmd.color + '44' }]}>
          {isRunning ? (
            <ActivityIndicator size="small" color={cmd.color} style={{ transform: [{ scale: 0.7 }] }} />
          ) : (
            <MaterialIcons name={cmd.icon as any} size={14} color={cmd.color} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[cb.label, { color: cmd.color }]} numberOfLines={1}>{cmd.label}</Text>
          <Text style={cb.desc} numberOfLines={1}>{cmd.desc}</Text>
        </View>
        <View style={[cb.catBadge, { backgroundColor: cmd.color + '15', borderColor: cmd.color + '33' }]}>
          <Text style={[cb.catText, { color: cmd.color }]}>{cmd.category}</Text>
        </View>
        {isRunning && (
          <SpinnerDots color={cmd.color} />
        )}
        {!isRunning && (
          <MaterialIcons name="play-arrow" size={16} color={cmd.color + 'AA'} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const cb = StyleSheet.create({
  btn:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, minHeight: 52 },
  iconWrap: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  desc:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  catBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  catText:  { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
});

// ─── Output Panel ─────────────────────────────────────────────────────────────

function OutputPanel({
  result,
  onClose,
}: {
  result:  CmdResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const slideAnim = useRef(new Animated.Value(20)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(opacAnim,  { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [result.id]);

  const handleCopy = async () => {
    const text = result.error
      ? `# ERROR: ${result.cmd.cmd}\n${result.error}`
      : `# ${result.cmd.cmd}\n# Exit: ${result.exitCode ?? '?'} · ${fmtElapsed(result.elapsed_ms)} · ${result.ts}\n\n${result.output}`;
    try {
      Clipboard.setString(text);
    } catch {
      // Clipboard may not be available everywhere
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleShare = async () => {
    const text = result.error
      ? `BTNG Server Terminal\nCommand: ${result.cmd.cmd}\n\nERROR:\n${result.error}`
      : `BTNG Server Terminal\nCommand: ${result.cmd.cmd}\nExit: ${result.exitCode ?? '?'} · ${fmtElapsed(result.elapsed_ms)}\nTime: ${result.ts}\n\n${result.output}`;
    try {
      await Share.share({ message: text, title: `BTNG CMD: ${result.cmd.label}` });
    } catch { /* user cancelled */ }
  };

  const isSuccess = !result.error && (result.exitCode === 0 || result.exitCode === null);
  const statusColor = result.error ? '#EF4444' : isSuccess ? '#22C55E' : '#F59E0B';

  return (
    <Animated.View style={[op.wrap, { transform: [{ translateY: slideAnim }], opacity: opacAnim }]}>
      {/* Header */}
      <View style={op.header}>
        <View style={[op.termDot, { backgroundColor: statusColor + '20', borderColor: statusColor + '44' }]}>
          <MaterialIcons
            name={result.error ? 'error-outline' : isSuccess ? 'check-circle-outline' : 'warning-amber'}
            size={14}
            color={statusColor}
          />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[op.headerCmd, { color: result.cmd.color }]} numberOfLines={1}>
            $ {result.cmd.cmd}
          </Text>
          <View style={op.headerMeta}>
            <View style={[op.exitBadge, { backgroundColor: statusColor + '15', borderColor: statusColor + '33' }]}>
              <Text style={[op.exitText, { color: statusColor }]}>
                exit {result.exitCode ?? '?'}
              </Text>
            </View>
            <Text style={op.metaItem}>{fmtElapsed(result.elapsed_ms)}</Text>
            <Text style={op.metaSep}>·</Text>
            <Text style={op.metaItem}>{result.ts}</Text>
          </View>
        </View>

        {/* Action buttons */}
        <TouchableOpacity style={[op.actionBtn, copied && { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]} onPress={handleCopy} activeOpacity={0.8}>
          <MaterialIcons name={copied ? 'check' : 'content-copy'} size={14} color={copied ? '#22C55E' : Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={op.actionBtn} onPress={handleShare} activeOpacity={0.8}>
          <MaterialIcons name="share" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={op.actionBtn} onPress={onClose} activeOpacity={0.8}>
          <MaterialIcons name="close" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Terminal body */}
      <ScrollView
        style={op.termBody}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {result.error ? (
          <Text style={op.errorOutput} selectable>{result.error}</Text>
        ) : (
          <Text style={op.termOutput} selectable>
            {result.output.trim() || '(no output)'}
          </Text>
        )}
      </ScrollView>

      {/* Footer line count */}
      <View style={op.footer}>
        <MaterialIcons name="terminal" size={10} color={Colors.textMuted} />
        <Text style={op.footerText}>
          {result.error
            ? 'command failed'
            : `${result.output.trim().split('\n').length} line${result.output.trim().split('\n').length !== 1 ? 's' : ''} · ${result.output.length} chars`}
        </Text>
        {copied && (
          <View style={op.copiedBadge}>
            <MaterialIcons name="check" size={9} color="#22C55E" />
            <Text style={op.copiedText}>Copied!</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const op = StyleSheet.create({
  wrap:       { backgroundColor: '#0A0A0A', borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.sm + 2, backgroundColor: '#111111', borderBottomWidth: 1, borderBottomColor: Colors.border },
  termDot:    { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  headerCmd:  { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  exitBadge:  { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  exitText:   { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  metaItem:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  metaSep:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  actionBtn:  { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  termBody:   { maxHeight: 280, padding: Spacing.md },
  termOutput: { fontSize: 11, color: '#E5E7EB', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17, includeFontPadding: false },
  errorOutput:{ fontSize: 11, color: '#FCA5A5', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17, includeFontPadding: false },
  footer:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#FFFFFF0A' },
  footerText: { flex: 1, fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copiedBadge:{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#22C55E15', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#22C55E33' },
  copiedText: { fontSize: 9, color: '#22C55E', fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryRow({
  result,
  onSelect,
  isActive,
}: {
  result:   CmdResult;
  onSelect: () => void;
  isActive: boolean;
}) {
  const isSuccess = !result.error && (result.exitCode === 0 || result.exitCode === null);
  const color = result.error ? '#EF4444' : isSuccess ? '#22C55E' : '#F59E0B';

  return (
    <TouchableOpacity
      style={[hr.row, isActive && { backgroundColor: result.cmd.color + '12', borderColor: result.cmd.color + '44' }]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      <View style={[hr.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[hr.cmd, { color: result.cmd.color }]} numberOfLines={1}>$ {result.cmd.cmd}</Text>
        <Text style={hr.ts}>{result.ts} · {fmtElapsed(result.elapsed_ms)}</Text>
      </View>
      <View style={[hr.exitBadge, { backgroundColor: color + '15', borderColor: color + '33' }]}>
        <Text style={[hr.exitText, { color }]}>exit {result.exitCode ?? '?'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const hr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard, marginBottom: 4 },
  dot:       { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  cmd:       { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  ts:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  exitBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  exitText:  { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BTNGServerTerminalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [token,       setToken]       = useState('');
  const [showToken,   setShowToken]   = useState(false);
  const [rememberTok, setRememberTok] = useState(true);
  const [tokenSaved,  setTokenSaved]  = useState(false);

  const [catFilter,   setCatFilter]   = useState('All');
  const [runningId,   setRunningId]   = useState<string | null>(null);
  const [results,     setResults]     = useState<CmdResult[]>([]);
  const [activeResult,setActiveResult]= useState<CmdResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Save token debounce
  const tokenSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load token on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then(val => {
      if (val) { setToken(val); setTokenSaved(true); }
    }).catch(() => {});
  }, []);

  // ── Save token debounced ────────────────────────────────────────────────────
  useEffect(() => {
    if (!rememberTok) return;
    if (tokenSaveTimer.current) clearTimeout(tokenSaveTimer.current);
    tokenSaveTimer.current = setTimeout(async () => {
      if (token.trim()) {
        await SecureStore.setItemAsync(TOKEN_KEY, token.trim()).catch(() => {});
        setTokenSaved(true);
      }
    }, 600);
    return () => { if (tokenSaveTimer.current) clearTimeout(tokenSaveTimer.current); };
  }, [token, rememberTok]);

  const toggleRemember = async () => {
    const next = !rememberTok;
    setRememberTok(next);
    if (!next) {
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      setTokenSaved(false);
    }
  };

  // ── Execute command ─────────────────────────────────────────────────────────
  const runCommand = useCallback(async (cmd: Command) => {
    if (runningId) return;
    if (!token.trim()) return;
    setRunningId(cmd.id);

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(EXEC_URL, {
        method:  'POST',
        signal:  controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token.trim()}`,
        },
        body: JSON.stringify({ command: cmd.cmd }),
      });
      clearTimeout(timer);

      const elapsed_ms = Date.now() - startTime;
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      let exitCode: number | null = null;
      let output   = '';
      let errorMsg: string | null = null;

      if (!res.ok) {
        let errBody = '';
        try { errBody = await res.text(); } catch {}
        errorMsg = `HTTP ${res.status} ${res.statusText}${errBody ? '\n' + errBody : ''}`;
      } else {
        const json = await res.json().catch(() => null);
        if (json) {
          output   = escapeAnsi(json.output   ?? json.stdout ?? json.result ?? JSON.stringify(json, null, 2));
          exitCode = json.exit_code ?? json.exitCode ?? json.code ?? null;
          if (json.success === false || json.error) {
            errorMsg = json.error ?? 'Command returned error';
          }
        } else {
          output = escapeAnsi(await res.text().catch(() => ''));
        }
      }

      const result: CmdResult = {
        id:         `${cmd.id}-${Date.now()}`,
        cmd,
        output,
        exitCode,
        elapsed_ms,
        ts,
        error: errorMsg,
      };

      setResults(prev => [result, ...prev].slice(0, 30));
      setActiveResult(result);
    } catch (err: any) {
      const elapsed_ms = Date.now() - startTime;
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const isTimeout = err?.name === 'AbortError';

      const result: CmdResult = {
        id:         `${cmd.id}-${Date.now()}`,
        cmd,
        output:     '',
        exitCode:   -1,
        elapsed_ms,
        ts,
        error: isTimeout
          ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s — server may be offline or unreachable.`
          : `Connection failed: ${err?.message ?? 'unknown error'}\n\nMake sure the bank server is running at ${EXEC_URL}`,
      };

      setResults(prev => [result, ...prev].slice(0, 30));
      setActiveResult(result);
    } finally {
      setRunningId(null);
    }
  }, [token, runningId]);

  // ── Filtered commands ───────────────────────────────────────────────────────
  const filteredCmds = catFilter === 'All'
    ? COMMANDS
    : COMMANDS.filter(c => c.category === catFilter);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Server Terminal</Text>
          <Text style={s.topSub}>Read-only · {BANK_HOST}:{BANK_PORT} · Bearer protected</Text>
        </View>
        <TouchableOpacity
          style={[s.iconBtn, showHistory && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}
          onPress={() => setShowHistory(p => !p)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="history" size={20} color={showHistory ? Colors.primary : Colors.textMuted} />
          {results.length > 0 && (
            <View style={s.histBadge}>
              <Text style={s.histBadgeText}>{results.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Terminal Header Card ─────────────────────────────────────── */}
        <View style={s.termHero}>
          <View style={s.termHeroLeft}>
            <View style={s.termDots}>
              <View style={[s.termCircle, { backgroundColor: '#EF4444' }]} />
              <View style={[s.termCircle, { backgroundColor: '#F59E0B' }]} />
              <View style={[s.termCircle, { backgroundColor: '#22C55E' }]} />
            </View>
            <Text style={s.termHeroTitle}>BTNG ~ root@srv1282934</Text>
          </View>
          <View style={s.termHeroMeta}>
            <View style={[s.termPill, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' }} />
              <Text style={{ fontSize: 9, color: '#22C55E', fontWeight: FontWeight.heavy, includeFontPadding: false } as any}>
                Ubuntu 26.04 LTS
              </Text>
            </View>
            <View style={[s.termPill, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
              <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false } as any}>
                168.231.79.52
              </Text>
            </View>
          </View>
        </View>

        {/* ── Bearer Token Card ─────────────────────────────────────────── */}
        <View style={s.tokenCard}>
          <View style={s.tokenCardHeader}>
            <View style={[s.tokenIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
              <MaterialIcons name="vpn-key" size={14} color={Colors.primary} />
            </View>
            <Text style={s.tokenTitle}>Admin Bearer Token</Text>
            {tokenSaved && (
              <View style={s.savedChip}>
                <MaterialIcons name="lock" size={9} color="#22C55E" />
                <Text style={s.savedChipText}>SAVED</Text>
              </View>
            )}
          </View>
          <View style={s.tokenInputRow}>
            <TextInput
              style={s.tokenInput}
              value={token}
              onChangeText={setToken}
              secureTextEntry={!showToken}
              placeholder="Enter BTNG_SECRET bearer token…"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {token.length > 0 && (
              <TouchableOpacity
                style={s.tokenIconBtn}
                onPress={() => { setToken(''); SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}); setTokenSaved(false); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.tokenIconBtn} onPress={() => setShowToken(p => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name={showToken ? 'visibility-off' : 'visibility'} size={15} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          {/* Remember toggle */}
          <TouchableOpacity style={s.rememberRow} onPress={toggleRemember} activeOpacity={0.8}>
            <View style={[s.toggleTrack, rememberTok && { backgroundColor: Colors.primary + '30', borderColor: Colors.primary + '66' }]}>
              <View style={[s.toggleThumb, rememberTok && { backgroundColor: Colors.primary, transform: [{ translateX: 14 }] }]} />
            </View>
            <Text style={s.rememberLabel}>Remember token on this device</Text>
          </TouchableOpacity>
          {!token.trim() && (
            <View style={s.tokenWarning}>
              <MaterialIcons name="info-outline" size={11} color={Colors.warning} />
              <Text style={s.tokenWarningText}>Enter your BTNG_SECRET to execute commands</Text>
            </View>
          )}
        </View>

        {/* ── Active Output ────────────────────────────────────────────── */}
        {activeResult ? (
          <OutputPanel result={activeResult} onClose={() => setActiveResult(null)} />
        ) : null}

        {/* ── History Panel ────────────────────────────────────────────── */}
        {showHistory && results.length > 0 ? (
          <View style={s.historyCard}>
            <View style={s.historyHeader}>
              <MaterialIcons name="history" size={14} color={Colors.textMuted} />
              <Text style={s.historyTitle}>Command History</Text>
              <Text style={s.historyCount}>{results.length} runs</Text>
              <TouchableOpacity
                style={s.clearHistBtn}
                onPress={() => { setResults([]); setActiveResult(null); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="delete-sweep" size={14} color={Colors.textMuted} />
                <Text style={s.clearHistText}>Clear</Text>
              </TouchableOpacity>
            </View>
            {results.map(r => (
              <HistoryRow
                key={r.id}
                result={r}
                isActive={activeResult?.id === r.id}
                onSelect={() => { setActiveResult(r); setShowHistory(false); }}
              />
            ))}
          </View>
        ) : null}

        {/* ── Category Filter ───────────────────────────────────────────── */}
        <View style={s.catWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catContent}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.catChip, cat === catFilter && s.catChipActive]}
                onPress={() => setCatFilter(cat)}
                activeOpacity={0.8}
              >
                <Text style={[s.catText, cat === catFilter && s.catTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Command Grid ─────────────────────────────────────────────── */}
        <View style={s.cmdGrid}>
          <View style={s.cmdGridHeader}>
            <MaterialIcons name="terminal" size={14} color={Colors.textMuted} />
            <Text style={s.cmdGridTitle}>
              {catFilter === 'All' ? `All Commands (${COMMANDS.length})` : `${catFilter} (${filteredCmds.length})`}
            </Text>
            {runningId && (
              <View style={s.runningPill}>
                <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.6 }] }} />
                <Text style={s.runningText}>Running…</Text>
              </View>
            )}
          </View>

          {filteredCmds.map((cmd) => (
            <CmdButton
              key={cmd.id}
              cmd={cmd}
              isRunning={runningId === cmd.id}
              isLast={activeResult?.cmd.id === cmd.id}
              onPress={() => runCommand(cmd)}
            />
          ))}
        </View>

        {/* ── Setup Guide ─────────────────────────────────────────────── */}
        <View style={s.setupCard}>
          <View style={s.setupHeader}>
            <MaterialIcons name="build" size={14} color={Colors.textMuted} />
            <Text style={s.setupTitle}>Server Setup — /api/admin/exec</Text>
          </View>
          <Text style={s.setupDesc}>
            Add the exec endpoint to sdk/btng-bank-server.js on port 8090.
            The endpoint runs whitelisted commands via child_process.exec.
          </Text>
          <View style={s.setupCode}>
            <Text style={s.setupCodeText} selectable>{`// Add to sdk/btng-bank-server.js
const { exec } = require('child_process');

const ALLOWED = [
  'uptime','df -h','df -i','free -m','who','uname -a',
  'ps aux --sort=-%mem | head -10',
  'ps aux --sort=-%cpu | head -10',
  'pm2 list','pm2 logs --lines 20 --nostream 2>&1 | tail -20',
  'ss -tuln','node -v && npm -v',
];

app.post('/api/admin/exec', requireAuth, (req, res) => {
  const { command } = req.body ?? {};
  if (!ALLOWED.includes(command)) {
    return res.status(403).json({ success:false, error:'Command not allowed' });
  }
  exec(command, { timeout: 10000 }, (err, stdout, stderr) => {
    res.json({
      success:   !err,
      command,
      output:    stdout || stderr || '',
      exit_code: err ? err.code ?? 1 : 0,
    });
  });
});`}</Text>
          </View>
          <View style={[s.setupNote, { backgroundColor: '#22C55E10', borderColor: '#22C55E33' }]}>
            <MaterialIcons name="info-outline" size={11} color="#22C55E" />
            <Text style={[s.setupNoteText, { color: '#22C55E' }]}>
              Restart: pm2 restart btng-bank — then this terminal is live.
            </Text>
          </View>
        </View>

        {/* ── BTNG Network CLI Panel ───────────────────────────────── */}
        <BTNGNetworkCliPanel />

        {/* ── Info Footer ─────────────────────────────────────────────── */}
        <View style={s.infoCard}>
          <MaterialIcons name="security" size={13} color={Colors.textMuted} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.infoTitle}>Security Notes</Text>
            <Text style={s.infoLine}>• Only predefined safe commands are whitelisted server-side</Text>
            <Text style={s.infoLine}>• Bearer token required — same as Admin panel (BTNG_SECRET)</Text>
            <Text style={s.infoLine}>• All output is read-only — no write operations permitted</Text>
            <Text style={s.infoLine}>• Token stored encrypted via expo-secure-store on device</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  topBar:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter: { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  topSub:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  histBadge: { position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  histBadgeText: { fontSize: 7, fontWeight: FontWeight.heavy, color: '#060608', includeFontPadding: false },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Terminal Hero
  termHero:       { backgroundColor: '#111111', borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  termHeroLeft:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  termDots:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  termCircle:     { width: 11, height: 11, borderRadius: 5.5 },
  termHeroTitle:  { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: '#E5E7EB', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  termHeroMeta:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  termPill:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },

  // Token Card
  tokenCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  tokenCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tokenIcon:       { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tokenTitle:      { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  savedChip:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#22C55E15', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#22C55E33' },
  savedChipText:   { fontSize: 8, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false, letterSpacing: 0.5 },
  tokenInputRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, gap: 6 },
  tokenInput:      { flex: 1, height: 44, fontSize: FontSize.sm, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  tokenIconBtn:    { padding: 7 },
  rememberRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingTop: 2 },
  toggleTrack:     { width: 34, height: 20, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', paddingHorizontal: 2, flexShrink: 0 },
  toggleThumb:     { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.textMuted },
  rememberLabel:   { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  tokenWarning:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: 8, borderWidth: 1, borderColor: Colors.warning + '33' },
  tokenWarningText:{ flex: 1, fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },

  // History
  historyCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  historyTitle:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historyCount:  { fontSize: 9, color: Colors.textMuted, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border, includeFontPadding: false },
  clearHistBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearHistText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Category filter
  catWrap:    { marginHorizontal: -Spacing.xl },
  catContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, paddingBottom: 2 },
  catChip:    { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, height: 34, justifyContent: 'center' },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catText:    { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },
  catTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },

  // Command grid
  cmdGrid:       { gap: Spacing.sm },
  cmdGridHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 2 },
  cmdGridTitle:  { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  runningPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  runningText:   { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  // Setup card
  setupCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  setupHeader:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  setupTitle:    { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  setupDesc:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 17, includeFontPadding: false },
  setupCode:     { backgroundColor: '#060608', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  setupCodeText: { fontSize: 9, color: '#D4A017', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14, includeFontPadding: false },
  setupNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: Radius.md, padding: 9, borderWidth: 1 },
  setupNoteText: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, lineHeight: 16, includeFontPadding: false },

  // Info footer
  infoCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  infoTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false, marginBottom: 3 },
  infoLine:  { fontSize: 10, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
});
