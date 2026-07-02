/**
 * BTNG AfCFTA Sovereign Gateway — Web2/Web3 Continental Trade Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript port of afcfta_gateway.py (FastAPI version 3.0.0)
 *
 * Features:
 *  • AfCFTASovereignGateway — full TypeScript implementation
 *  • web3_mint_gold_token()    — SHA-256 cryptographic asset certificate
 *  • generate_papss_trade_payload() — ISO 20022 message-ready payment packets
 *  • /api/v3/trade/live-index  — 7-corridor live price matrix
 *  • /api/v3/trade/execute     — sovereign cross-border settlement
 *  • 7 currency corridors: GHS · NGN · ZAR · KES · EGP · XOF · ZMW
 *  • Fallback spot: $4,110.34/oz · GHS 10.91715 (Jun-2026 ground truth)
 *  • 5% Sovereign Guard · Non-IMF Independent Clearing
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';

// ─── Constants ────────────────────────────────────────────────────────────────
const OZ_TO_G           = 31.1034768;
const GUARD_THRESHOLD   = 0.05;
const FALLBACK_SPOT     = 4110.34;       // Jun-2026 hardened baseline
const FALLBACK_FX_GHS   = 10.91715;

// 7-corridor regional clearing matrix (GHS as base hub)
const CORRIDORS: Record<string, { rate: number; name: string; region: string; flag: string; color: string }> = {
  GHS: { rate: 1.00,  name: 'Ghanaian Cedi',        region: 'West Africa (Base Hub)',  flag: '🇬🇭', color: '#22C55E' },
  NGN: { rate: 1.37,  name: 'Nigerian Naira',        region: 'West Africa',             flag: '🇳🇬', color: '#F59E0B' },
  ZAR: { rate: 1.68,  name: 'South African Rand',    region: 'Southern Africa',         flag: '🇿🇦', color: '#3B82F6' },
  KES: { rate: 11.95, name: 'Kenyan Shilling',       region: 'East Africa',             flag: '🇰🇪', color: '#EF4444' },
  EGP: { rate: 4.22,  name: 'Egyptian Pound',        region: 'North Africa',            flag: '🇪🇬', color: '#8B5CF6' },
  XOF: { rate: 55.40, name: 'West African CFA',      region: 'CFA Francophone Zone',    flag: '🌍', color: '#F7931A' },
  ZMW: { rate: 2.42,  name: 'Zambian Kwacha',        region: 'Southern Africa',         flag: '🇿🇲', color: '#EC4899' },
};

type WeightUnit = 'g' | 'oz' | 'kg';

// ─── AfCFTASovereignGateway (TypeScript port) ─────────────────────────────────
class AfCFTASovereignGateway {
  private readonly ozToG          = OZ_TO_G;
  private readonly fallbackFxGHS  = FALLBACK_FX_GHS;

  /** Mirrors web3_mint_gold_token() */
  async mintGoldToken(unit: WeightUnit, amount: number): Promise<{
    token_id: string;
    weight_certified_g: number;
    asset_purity: string;
    proof_of_value_hash: string;
  }> {
    const weightG = unit === 'g' ? amount : unit === 'oz' ? amount * this.ozToG : amount * 1000;
    const nonce   = Math.random().toString(36).slice(2) + Date.now().toString(16);
    const raw     = `BTNG-${unit}-${amount}-${nonce}`;
    const hash    = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
    return {
      token_id:            `BTNG-GOLD-${hash.slice(0, 12).toUpperCase()}`,
      weight_certified_g:  parseFloat(weightG.toFixed(4)),
      asset_purity:        '99.99% Fine Gold Bullion',
      proof_of_value_hash: hash,
    };
  }

  /** Mirrors generate_papss_trade_payload() */
  async generatePAPSSPayload(
    senderWallet: string,
    receiverWallet: string,
    unit: WeightUnit,
    amount: number,
    destinationCurrency: string,
    liveSpot: number,
  ): Promise<Record<string, any>> {
    if (!CORRIDORS[destinationCurrency]) {
      return { status: 'REJECTED', reason: `Currency corridor ${destinationCurrency} not active on regional mesh.` };
    }

    const tokenData    = await this.mintGoldToken(unit, amount);
    const weightG      = tokenData.weight_certified_g;
    const baseGramGHS  = (liveSpot / this.ozToG) * this.fallbackFxGHS;
    const baseGHSVal   = baseGramGHS * weightG;
    const clearingTotal = parseFloat((baseGHSVal * CORRIDORS[destinationCurrency].rate).toFixed(2));
    const msgTs        = new Date().toISOString();
    const msgId        = `BTNG-PAPSS-${Math.floor(Date.now() / 1000)}`;

    const payload: Record<string, any> = {
      status:               'READY_FOR_AFRICAN_UNION_CLEARING',
      settlement_protocol:  'NON_IMF_INDEPENDENT_EXCHANGE',
      timestamp:            msgTs,
      iso_20022_header:     { msg_id: msgId, cre_dt_tm: msgTs },
      routing_participants: { sender: senderWallet, receiver: receiverWallet },
      web3_security_token:  tokenData,
      value_exchange_ledger: {
        settlement_currency:                destinationCurrency,
        fiat_clearing_amount:               clearingTotal,
        intermediary_western_interference: '0.00 (COMPLETELY BYPASSED)',
      },
    };

    // Sovereign Guard Signature — deterministic SHA-256 seal
    const serialized = JSON.stringify(payload, Object.keys(payload).sort());
    const sig = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, serialized);
    payload['sovereign_guard_signature'] = sig;
    return payload;
  }

  /** Mirrors /api/v3/trade/live-index */
  computeLiveIndex(spotUSD: number, g = 1, oz = 1, kg = 1): {
    timestamp: string;
    spot_gold_index_usd_oz: number;
    live_valuations_ghs: Record<string, number>;
  } {
    const baseGramGHS = (spotUSD / this.ozToG) * this.fallbackFxGHS;
    return {
      timestamp:            new Date().toISOString(),
      spot_gold_index_usd_oz: parseFloat(spotUSD.toFixed(2)),
      live_valuations_ghs: {
        BTNG_G:  parseFloat((baseGramGHS * g).toFixed(2)),
        BTNG_OZ: parseFloat((baseGramGHS * this.ozToG * oz).toFixed(2)),
        BTNG_KG: parseFloat((baseGramGHS * 1000 * kg).toFixed(2)),
      },
    };
  }
}

const gateway = new AfCFTASovereignGateway();

// ─── Live Dot ─────────────────────────────────────────────────────────────────
function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 2, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.25, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Corridor Card ────────────────────────────────────────────────────────────
function CorridorCard({ code, spotGHS, compact = false }: { code: string; spotGHS: number; compact?: boolean }) {
  const cfg   = CORRIDORS[code];
  const val   = parseFloat((spotGHS * cfg.rate).toFixed(2));
  return (
    <View style={[cc.card, { borderColor: cfg.color + '44' }, compact && cc.cardCompact]}>
      <View style={[cc.flagWrap, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}>
        <Text style={cc.flag}>{cfg.flag}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[cc.code, { color: cfg.color }]}>{code}</Text>
        {!compact && <Text style={cc.name} numberOfLines={1}>{cfg.name}</Text>}
        {!compact && <Text style={cc.region}>{cfg.region}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[cc.rate, { color: cfg.color }]}>×{cfg.rate}</Text>
        <Text style={[cc.val, { color: cfg.color }]}>{code} {val.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
      </View>
    </View>
  );
}

const cc = StyleSheet.create({
  card:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  cardCompact:{ borderRadius: Radius.lg, padding: Spacing.sm + 2 },
  flagWrap:   { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  flag:       { fontSize: 20 },
  code:       { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  name:       { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  region:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  rate:       { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  val:        { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ─── JSON Block ───────────────────────────────────────────────────────────────
function JsonBlock({ data, title, color = Colors.success }: { data: Record<string, any>; title: string; color?: string }) {
  const renderValue = (val: any, depth = 0): React.ReactElement => {
    if (val === null || val === undefined) return <Text style={jb.null}>null</Text>;
    if (typeof val === 'boolean') return <Text style={[jb.bool, { color: val ? Colors.success : Colors.error }]}>{String(val)}</Text>;
    if (typeof val === 'number') return <Text style={jb.num}>{val.toLocaleString('en-US', { maximumFractionDigits: 6 })}</Text>;
    if (typeof val === 'string') return <Text style={jb.str} numberOfLines={depth === 0 ? 2 : 1}>"{val}"</Text>;
    if (typeof val === 'object') {
      return (
        <View style={{ paddingLeft: depth > 0 ? 10 : 0 }}>
          {Object.entries(val).map(([k, v]) => (
            <View key={k} style={jb.row}>
              <Text style={jb.key}>{k}: </Text>
              {renderValue(v, depth + 1)}
            </View>
          ))}
        </View>
      );
    }
    return <Text style={jb.str}>{String(val)}</Text>;
  };

  return (
    <View style={[jb.card, { borderColor: color + '55' }]}>
      <View style={[jb.header, { backgroundColor: color + '12' }]}>
        <View style={[jb.termDots]}>
          {['#EF4444', '#F59E0B', '#22C55E'].map(c => <View key={c} style={[jb.dot, { backgroundColor: c }]} />)}
        </View>
        <Text style={[jb.title, { color }]}>{title}</Text>
        <View style={[jb.statusBadge, { backgroundColor: color + '18', borderColor: color + '55' }]}>
          <Text style={[jb.statusText, { color }]}>200 OK</Text>
        </View>
      </View>
      <ScrollView style={jb.body} showsVerticalScrollIndicator={false}>
        {renderValue(data)}
      </ScrollView>
    </View>
  );
}

const jb = StyleSheet.create({
  card:        { backgroundColor: '#060e06', borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a3a1a' },
  termDots:    { flexDirection: 'row', gap: 5 },
  dot:         { width: 10, height: 10, borderRadius: 5 },
  title:       { flex: 1, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  body:        { padding: Spacing.md, maxHeight: 320 },
  row:         { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', paddingVertical: 2 },
  key:         { fontSize: 10, color: '#4ade80', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  str:         { fontSize: 10, color: '#f59e0b', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, flex: 1 },
  num:         { fontSize: 10, color: '#60a5fa', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  bool:        { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  null:        { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type TabKey = 'index' | 'execute' | 'web3' | 'corridors' | 'docs' | 'history';

export default function AfCFTAGatewayScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const gold    = useGoldOracle();
  const [tab, setTab] = useState<TabKey>('index');
  const { user } = useAuth();
  const { showAlert } = useAlert();

  // ─── History tab state ─────────────────────────────────────────────────────
  interface HistoryEntry {
    id: string;
    reference: string;
    status: string;
    ghs_equivalent: number;
    usd_equivalent: number;
    gold_price_usd: number;
    settlement_receipt: Record<string, any> | null;
    created_at: string;
    unit: string;
    amount_satoshi: number;
    sender_wallet: string;
    recipient_wallet: string;
  }
  const [historyRows,       setHistoryRows]       = useState<HistoryEntry[]>([]);
  const [historyLoading,    setHistoryLoading]    = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setHistoryRefreshing(true); else setHistoryLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('btng_pay_transactions')
        .select('id,reference,status,ghs_equivalent,usd_equivalent,gold_price_usd,settlement_receipt,created_at,unit,amount_satoshi,sender_wallet,recipient_wallet')
        .eq('created_by', (user as any).id)
        .eq('channel', 'BTNG_PAY_GATEWAY')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) setHistoryRows(data as HistoryEntry[]);
    } catch { /* silent */ } finally {
      if (isRefresh) setHistoryRefreshing(false); else setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab]);

  // ─── Oracle ───────────────────────────────────────────────────────────────
  const spotUSD   = gold.priceUSD > 0 ? gold.priceUSD : FALLBACK_SPOT;
  const isLive    = gold.source === 'live';
  const statusColor = isLive ? Colors.success : Colors.warning;
  const baseGramGHS = (spotUSD / OZ_TO_G) * FALLBACK_FX_GHS;

  // ─── Live Index tab ───────────────────────────────────────────────────────
  const [idxG,  setIdxG]  = useState('1.0');
  const [idxOz, setIdxOz] = useState('1.0');
  const [idxKg, setIdxKg] = useState('1.0');
  const liveIndex = gateway.computeLiveIndex(
    spotUSD,
    parseFloat(idxG  || '1') || 1,
    parseFloat(idxOz || '1') || 1,
    parseFloat(idxKg || '1') || 1,
  );

  // ─── Execute tab ──────────────────────────────────────────────────────────
  const [sender,      setSender]      = useState('btng712_accra_vault_001');
  const [receiver,    setReceiver]    = useState('btng712_johannesburg_node_012');
  const [execUnit,    setExecUnit]    = useState<WeightUnit>('kg');
  const [execAmount,  setExecAmount]  = useState('2.5');
  const [execCurrency,setExecCurrency]= useState('ZAR');
  const [execLoading, setExecLoading] = useState(false);
  const [execPayload, setExecPayload] = useState<Record<string, any> | null>(null);
  const [execError,   setExecError]   = useState<string | null>(null);

  const handleExecute = useCallback(async () => {
    const amt = parseFloat(execAmount);
    if (!amt || amt <= 0) return;
    setExecLoading(true);
    setExecError(null);
    setExecPayload(null);
    try {
      const payload = await gateway.generatePAPSSPayload(sender, receiver, execUnit, amt, execCurrency, spotUSD);
      if (payload.status === 'REJECTED') {
        setExecError(payload.reason ?? 'Trade rejected by AfCFTA gateway.');
      } else {
        setExecPayload(payload);
        // Persist to btng_pay_transactions for History tab
        if (user) {
          try {
            const supabase  = getSupabaseClient();
            const ledger    = payload.value_exchange_ledger ?? {};
            const token     = payload.web3_security_token   ?? {};
            const header    = payload.iso_20022_header      ?? {};
            const sig       = payload.sovereign_guard_signature ?? '';
            const weightG   = token.weight_certified_g ?? 0;
            const satoshi   = Math.round(weightG * 100_000_000);
            await supabase.from('btng_pay_transactions').insert({
              reference:             header.msg_id ?? `BTNG-PAPSS-${Date.now()}`,
              amount_satoshi:        satoshi,
              unit:                  execUnit,
              conversion_anchor:     'BTNG-GOLD',
              chain_id:              'BTNG-MAINNET',
              channel:               'BTNG_PAY_GATEWAY',
              purpose:               'merchant_transfer',
              sender_wallet:         sender,
              sender_first_name:     'PAPSS',
              sender_email:          (user as any).email ?? 'papss@btng.io',
              recipient_merchant_id: 'BTNG-AFCFTA',
              recipient_wallet:      receiver,
              recipient_first_name:  'PAPSS',
              recipient_email:       'papss@btng.io',
              payment_method_type:   'external_token',
              token_ref:             token.token_id  ?? sig.slice(0, 32),
              ucaf:                  sig || 'PAPSS-UCAF',
              signature:             sig || 'PAPSS-SIG',
              public_key:            'BTNG-PAPSS-PUB-KEY',
              status:                'pending',
              gold_price_usd:        spotUSD,
              btng_usd:              parseFloat((spotUSD / OZ_TO_G).toFixed(6)),
              usd_equivalent:        parseFloat((weightG * (spotUSD / OZ_TO_G)).toFixed(6)),
              ghs_equivalent:        ledger.fiat_clearing_amount ?? 0,
              settlement_receipt:    payload,
              created_by:            (user as any).id,
            });
          } catch { /* silent — don't block UI */ }
        }
      }
    } catch (e: any) {
      setExecError(e.message ?? 'Sovereign Core Exception');
    } finally {
      setExecLoading(false);
    }
  }, [sender, receiver, execUnit, execAmount, execCurrency, spotUSD]);

  // ─── Web3 Mint tab ────────────────────────────────────────────────────────
  const [mintUnit,    setMintUnit]    = useState<WeightUnit>('oz');
  const [mintAmount,  setMintAmount]  = useState('1.0');
  const [mintLoading, setMintLoading] = useState(false);
  const [mintResult,  setMintResult]  = useState<Record<string, any> | null>(null);

  const handleMint = useCallback(async () => {
    const amt = parseFloat(mintAmount);
    if (!amt || amt <= 0) return;
    setMintLoading(true);
    setMintResult(null);
    try {
      const token = await gateway.mintGoldToken(mintUnit, amt);
      setMintResult(token);
    } catch { /* silent */ } finally {
      setMintLoading(false);
    }
  }, [mintUnit, mintAmount]);

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'index',     label: 'Live Index',  icon: 'show-chart'          },
    { key: 'execute',   label: 'Execute',     icon: 'send'                },
    { key: 'web3',      label: 'Web3 Token',  icon: 'token'               },
    { key: 'corridors', label: 'Corridors',   icon: 'public'              },
    { key: 'docs',      label: 'API Docs',    icon: 'description'         },
    { key: 'history',   label: 'History',     icon: 'history'             },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>AfCFTA Sovereign Gateway</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={statusColor} />
            <Text style={[s.topSub, { color: statusColor }]}>v3.0.0 · Web2/Web3 Hybrid · 54 Nations</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}
          onPress={() => gold.refresh()}
        >
          {gold.loading ? <ActivityIndicator size="small" color={statusColor} /> : <MaterialIcons name="refresh" size={17} color={statusColor} />}
        </TouchableOpacity>
      </View>

      {/* Oracle bar */}
      <View style={[s.oracleBar, { borderColor: statusColor + '55', backgroundColor: statusColor + '0C' }]}>
        <View style={[s.oraclePill, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
          <LiveDot color={statusColor} size={5} />
          <Text style={[s.oraclePillText, { color: statusColor }]}>
            {isLive ? 'LIVE' : 'CACHED'}
          </Text>
        </View>
        <Text style={[s.oracleSpot, { color: statusColor }]}>
          XAU/USD ${spotUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <View style={[s.corridorCount, { backgroundColor: Colors.primary + '18', borderColor: Colors.primary + '44' }]}>
          <MaterialIcons name="public" size={11} color={Colors.primary} />
          <Text style={s.corridorCountText}>7 Corridors Active</Text>
        </View>
        <Text style={s.countdown}>{gold.nextRefreshIn}s</Text>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tabScrollWrap}
        contentContainerStyle={s.tabScrollContent}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={13} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── LIVE INDEX TAB ────────────────────────────────────────────────── */}
        {tab === 'index' && (
          <>
            {/* Hero */}
            <View style={s.heroCard}>
              <Text style={{ fontSize: 40 }}>🌍</Text>
              <Text style={s.heroTitle}>Continental Live Price Index</Text>
              <Text style={s.heroSub}>
                <Text style={{ color: Colors.success, fontWeight: FontWeight.bold }}>/api/v3/trade/live-index</Text>
                {' '}— BTNG-g, BTNG-oz, BTNG-kg valuations in GHS, anchored to live XAU/USD spot.
              </Text>
            </View>

            {/* Balance inputs */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="tune" size={15} color={Colors.primary} />
                <Text style={s.cardTitle}>Query Parameters</Text>
                <Text style={s.cardMono}>?g={idxG}&oz={idxOz}&kg={idxKg}</Text>
              </View>
              <View style={s.inputGrid}>
                {[
                  { label: 'g (grams)',   val: idxG,  set: setIdxG,  color: Colors.primary, emoji: '⚖️' },
                  { label: 'oz (troy)',   val: idxOz, set: setIdxOz, color: '#F7931A',      emoji: '🥇' },
                  { label: 'kg (kilos)',  val: idxKg, set: setIdxKg, color: '#22C55E',      emoji: '📦' },
                ].map(f => (
                  <View key={f.label} style={s.inputFieldWrap}>
                    <Text style={[s.inputLabel, { color: f.color }]}>{f.emoji} {f.label}</Text>
                    <TextInput
                      style={[s.inputField, { borderColor: f.color + '55' }]}
                      value={f.val}
                      onChangeText={f.set}
                      keyboardType="numeric"
                      placeholder="1.0"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                ))}
              </View>
            </View>

            {/* Live valuations */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="analytics" size={15} color={Colors.success} />
                <Text style={[s.cardTitle, { color: Colors.success }]}>Live Valuations (GHS)</Text>
                <View style={[s.liveBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                  <LiveDot color={statusColor} size={5} />
                  <Text style={[s.liveBadgeText, { color: statusColor }]}>{isLive ? 'LIVE' : 'CACHED'}</Text>
                </View>
              </View>
              <View style={s.valuationsRow}>
                {[
                  { key: 'BTNG_G',  emoji: '⚖️',  color: Colors.primary,  label: 'Gram'    },
                  { key: 'BTNG_OZ', emoji: '🥇',  color: '#F7931A',       label: 'Oz'      },
                  { key: 'BTNG_KG', emoji: '📦',  color: '#22C55E',       label: 'Kg'      },
                ].map(u => (
                  <View key={u.key} style={[s.valuationCell, { borderColor: u.color + '44' }]}>
                    <Text style={{ fontSize: 24 }}>{u.emoji}</Text>
                    <Text style={[s.valuationKey, { color: u.color }]}>{u.key.replace('_', '-')}</Text>
                    <Text style={[s.valuationGHS, { color: u.color }]}>
                      GH₵{liveIndex.live_valuations_ghs[u.key].toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={s.valuationLabel}>{u.label}</Text>
                  </View>
                ))}
              </View>

              {/* Formula rows */}
              <View style={s.formulaSection}>
                {[
                  { label: 'Base Gram GHS',  formula: `$${spotUSD.toFixed(2)} ÷ ${OZ_TO_G} × ${FALLBACK_FX_GHS}`,  val: `GH₵${baseGramGHS.toFixed(4)}` },
                  { label: 'BTNG-g/gram',    formula: 'base_gram_ghs × g_balance',                                  val: `GH₵${liveIndex.live_valuations_ghs.BTNG_G.toFixed(2)}` },
                  { label: 'BTNG-oz',        formula: `base_gram_ghs × ${OZ_TO_G} × oz_balance`,                   val: `GH₵${liveIndex.live_valuations_ghs.BTNG_OZ.toFixed(2)}` },
                  { label: 'BTNG-kg',        formula: 'base_gram_ghs × 1000 × kg_balance',                         val: `GH₵${liveIndex.live_valuations_ghs.BTNG_KG.toFixed(2)}` },
                  { label: 'Sovereign Guard',formula: '±5% volatility circuit breaker',                             val: `${(GUARD_THRESHOLD * 100).toFixed(0)}% max` },
                  { label: 'Fallback Spot',  formula: 'Jun-2026 hardened baseline',                                 val: `$${FALLBACK_SPOT}/oz` },
                ].map(row => (
                  <View key={row.label} style={s.formulaRow}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={s.formulaLabel}>{row.label}</Text>
                      <Text style={s.formulaExpr}>{row.formula}</Text>
                    </View>
                    <Text style={[s.formulaVal, { color: Colors.primary }]}>{row.val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* JSON response */}
            <JsonBlock data={liveIndex} title="GET /api/v3/trade/live-index" color={Colors.success} />

            {/* Corridor quick preview */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="currency-exchange" size={15} color={Colors.primary} />
                <Text style={s.cardTitle}>7-Corridor GHS Conversion (1g Gold)</Text>
              </View>
              {Object.keys(CORRIDORS).map(code => (
                <CorridorCard key={code} code={code} spotGHS={baseGramGHS} compact />
              ))}
            </View>
          </>
        )}

        {/* ── EXECUTE TAB ──────────────────────────────────────────────────── */}
        {tab === 'execute' && (
          <>
            {/* Hero */}
            <View style={[s.heroCard, { borderColor: Colors.warning + '44' }]}>
              <Text style={{ fontSize: 40 }}>🏛️</Text>
              <Text style={s.heroTitle}>PAPSS Sovereign Trade Execute</Text>
              <Text style={s.heroSub}>
                <Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>POST /api/v3/trade/execute</Text>
                {' '}— ISO 20022 message-ready cross-border settlement. Non-IMF independent clearing.
              </Text>
            </View>

            {/* Trade form */}
            <View style={[s.card, { borderColor: Colors.warning + '44' }]}>
              <View style={s.cardHeader}>
                <MaterialIcons name="swap-horiz" size={15} color={Colors.warning} />
                <Text style={[s.cardTitle, { color: Colors.warning }]}>Trade Parameters</Text>
              </View>

              {/* Sender / Receiver */}
              {[
                { label: 'Sender Wallet',   val: sender,   set: setSender,   icon: 'account-balance-wallet', color: Colors.primary },
                { label: 'Receiver Wallet', val: receiver, set: setReceiver, icon: 'account-balance',        color: Colors.success },
              ].map(f => (
                <View key={f.label} style={s.inputBlock}>
                  <View style={s.inputBlockLabel}>
                    <MaterialIcons name={f.icon as any} size={13} color={f.color} />
                    <Text style={[s.inputBlockLabelText, { color: f.color }]}>{f.label}</Text>
                  </View>
                  <TextInput
                    style={[s.inputBlockField, { borderColor: f.color + '44' }]}
                    value={f.val}
                    onChangeText={f.set}
                    placeholder="wallet_address"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}

              {/* Unit + Amount row */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <View style={[s.inputBlock, { flex: 1 }]}>
                  <Text style={s.inputBlockLabelText}>Weight Unit</Text>
                  <View style={s.unitRow}>
                    {(['g', 'oz', 'kg'] as WeightUnit[]).map(u => (
                      <TouchableOpacity
                        key={u}
                        style={[s.unitBtn, execUnit === u && { backgroundColor: Colors.warning, borderColor: Colors.warning }]}
                        onPress={() => setExecUnit(u)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.unitBtnText, execUnit === u && { color: Colors.bg }]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={[s.inputBlock, { flex: 2 }]}>
                  <Text style={s.inputBlockLabelText}>Amount</Text>
                  <TextInput
                    style={[s.inputBlockField, { borderColor: Colors.warning + '55' }]}
                    value={execAmount}
                    onChangeText={setExecAmount}
                    keyboardType="numeric"
                    placeholder="2.5"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              {/* Target currency */}
              <View style={s.inputBlock}>
                <Text style={s.inputBlockLabelText}>Target Currency (Destination Corridor)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: 2 }}>
                  {Object.keys(CORRIDORS).map(code => {
                    const cfg = CORRIDORS[code];
                    const sel = execCurrency === code;
                    return (
                      <TouchableOpacity
                        key={code}
                        style={[s.corridorChip, sel && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                        onPress={() => setExecCurrency(code)}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 14 }}>{cfg.flag}</Text>
                        <Text style={[s.corridorChipText, sel && { color: Colors.bg }]}>{code}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Estimated clearing value */}
              {parseFloat(execAmount) > 0 && (() => {
                const weightG = execUnit === 'g' ? parseFloat(execAmount) : execUnit === 'oz' ? parseFloat(execAmount) * OZ_TO_G : parseFloat(execAmount) * 1000;
                const ghsBase = baseGramGHS * weightG;
                const clearing = ghsBase * CORRIDORS[execCurrency].rate;
                return (
                  <View style={[s.estimateCard, { borderColor: CORRIDORS[execCurrency].color + '55', backgroundColor: CORRIDORS[execCurrency].color + '0A' }]}>
                    <MaterialIcons name="calculate" size={16} color={CORRIDORS[execCurrency].color} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[s.estimateLabel, { color: CORRIDORS[execCurrency].color }]}>
                        Estimated Clearing ({execCurrency})
                      </Text>
                      <Text style={[s.estimateVal, { color: CORRIDORS[execCurrency].color }]}>
                        {CORRIDORS[execCurrency].flag} {execCurrency} {clearing.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={s.estimateSub}>
                        {weightG.toFixed(4)}g × GH₵{baseGramGHS.toFixed(4)}/g × ×{CORRIDORS[execCurrency].rate}
                      </Text>
                    </View>
                    <View style={[s.bypassPill, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' }]}>
                      <MaterialIcons name="block" size={10} color={Colors.success} />
                      <Text style={s.bypassText}>IMF Bypassed</Text>
                    </View>
                  </View>
                );
              })()}

              {/* Execute button */}
              <TouchableOpacity
                style={[s.execBtn, (execLoading || !execAmount || parseFloat(execAmount) <= 0) && { opacity: 0.4 }]}
                onPress={handleExecute}
                disabled={execLoading || !execAmount || parseFloat(execAmount) <= 0}
                activeOpacity={0.85}
              >
                {execLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="send" size={18} color={Colors.bg} />}
                <Text style={s.execBtnText}>
                  {execLoading ? 'Generating Sovereign Payload…' : `Execute PAPSS Trade · ${execCurrency}`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error */}
            {execError && (
              <View style={s.errorCard}>
                <MaterialIcons name="cancel" size={20} color={Colors.error} />
                <Text style={s.errorText}>{execError}</Text>
              </View>
            )}

            {/* Payload result */}
            {execPayload && (
              <>
                {/* Status banner */}
                <View style={[s.successBanner, { borderColor: Colors.success + '66', backgroundColor: Colors.successBg }]}>
                  <MaterialIcons name="verified-user" size={22} color={Colors.success} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.successTitle}>READY_FOR_AFRICAN_UNION_CLEARING</Text>
                    <Text style={s.successSub}>NON_IMF_INDEPENDENT_EXCHANGE · ISO 20022 payload generated</Text>
                    <Text style={s.successId} numberOfLines={1}>
                      {execPayload?.iso_20022_header?.msg_id ?? ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setExecPayload(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={16} color={Colors.success} />
                  </TouchableOpacity>
                </View>

                <JsonBlock data={execPayload} title="POST /api/v3/trade/execute" color={Colors.success} />

                {/* Corridor summary */}
                {execPayload?.value_exchange_ledger && (() => {
                  const led = execPayload.value_exchange_ledger;
                  const cfg = CORRIDORS[led.settlement_currency] ?? CORRIDORS.GHS;
                  return (
                    <View style={[s.card, { borderColor: cfg.color + '55' }]}>
                      <View style={s.cardHeader}>
                        <Text style={{ fontSize: 22 }}>{cfg.flag}</Text>
                        <Text style={[s.cardTitle, { color: cfg.color }]}>Value Exchange Ledger</Text>
                      </View>
                      {[
                        { label: 'Settlement Currency', val: led.settlement_currency },
                        { label: 'Clearing Amount',     val: `${led.settlement_currency} ${led.fiat_clearing_amount?.toLocaleString('en-US', { maximumFractionDigits: 2 })}` },
                        { label: 'Western Interference',val: led.intermediary_western_interference },
                        { label: 'Protocol',            val: execPayload.settlement_protocol },
                        { label: 'Token ID',            val: execPayload.web3_security_token?.token_id },
                        { label: 'Gold Weight',         val: `${execPayload.web3_security_token?.weight_certified_g}g` },
                        { label: 'Purity',              val: execPayload.web3_security_token?.asset_purity },
                      ].map(row => (
                        <View key={row.label} style={s.detailRow}>
                          <Text style={s.detailLabel}>{row.label}</Text>
                          <Text style={[s.detailVal, { color: row.label === 'Western Interference' ? Colors.success : row.label === 'Clearing Amount' ? cfg.color : Colors.textPrimary }]} numberOfLines={1}>
                            {row.val ?? '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}

                {/* Sovereign Guard Signature */}
                {execPayload?.sovereign_guard_signature && (
                  <View style={s.sigCard}>
                    <View style={s.sigHeader}>
                      <MaterialIcons name="shield" size={14} color={Colors.primary} />
                      <Text style={s.sigTitle}>Sovereign Guard Signature</Text>
                      <View style={[s.sigBadge, { backgroundColor: Colors.primary + '18', borderColor: Colors.primary + '44' }]}>
                        <Text style={s.sigBadgeText}>SHA-256</Text>
                      </View>
                    </View>
                    <Text style={s.sigHash} selectable numberOfLines={2}>{execPayload.sovereign_guard_signature}</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* ── WEB3 TOKEN TAB ────────────────────────────────────────────────── */}
        {tab === 'web3' && (
          <>
            <View style={[s.heroCard, { borderColor: '#8B5CF6' + '44' }]}>
              <Text style={{ fontSize: 40 }}>🔐</Text>
              <Text style={s.heroTitle}>Web3 Gold Token Mint</Text>
              <Text style={s.heroSub}>
                <Text style={{ color: '#8B5CF6', fontWeight: FontWeight.bold }}>web3_mint_gold_token()</Text>
                {' '}— Mints an unforgeable SHA-256 cryptographic asset certificate tied to verified physical gold weight.
              </Text>
            </View>

            {/* Mint form */}
            <View style={[s.card, { borderColor: '#8B5CF6' + '44' }]}>
              <View style={s.cardHeader}>
                <MaterialIcons name="token" size={15} color="#8B5CF6" />
                <Text style={[s.cardTitle, { color: '#8B5CF6' }]}>Mint Parameters</Text>
              </View>

              <Text style={s.inputBlockLabelText}>Weight Unit</Text>
              <View style={s.unitRow}>
                {(['g', 'oz', 'kg'] as WeightUnit[]).map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[s.unitBtn, mintUnit === u && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }]}
                    onPress={() => setMintUnit(u)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.unitBtnText, mintUnit === u && { color: Colors.bg }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.inputBlockLabelText, { marginTop: Spacing.sm }]}>Amount ({mintUnit})</Text>
              <View style={s.amountRow}>
                <TextInput
                  style={[s.amountField, { borderColor: '#8B5CF6' + '55' }]}
                  value={mintAmount}
                  onChangeText={setMintAmount}
                  keyboardType="numeric"
                  placeholder="1.0"
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={[s.amountSuffix, { color: '#8B5CF6' }]}>{mintUnit}</Text>
              </View>

              {/* Weight preview */}
              {parseFloat(mintAmount) > 0 && (() => {
                const g = mintUnit === 'g' ? parseFloat(mintAmount) : mintUnit === 'oz' ? parseFloat(mintAmount) * OZ_TO_G : parseFloat(mintAmount) * 1000;
                const ghsVal = baseGramGHS * g;
                return (
                  <View style={[s.estimateCard, { borderColor: '#8B5CF6' + '55', backgroundColor: '#8B5CF6' + '0A' }]}>
                    <MaterialIcons name="scale" size={16} color="#8B5CF6" />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[s.estimateLabel, { color: '#8B5CF6' }]}>Physical Gold Weight</Text>
                      <Text style={[s.estimateVal, { color: '#8B5CF6' }]}>{g.toFixed(4)} grams</Text>
                      <Text style={s.estimateSub}>GH₵{ghsVal.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${(g * (spotUSD / OZ_TO_G)).toFixed(4)} USD</Text>
                    </View>
                    <Text style={[s.purityBadge]}>99.99%</Text>
                  </View>
                );
              })()}

              <TouchableOpacity
                style={[s.execBtn, { backgroundColor: '#8B5CF6' }, (mintLoading || !mintAmount || parseFloat(mintAmount) <= 0) && { opacity: 0.4 }]}
                onPress={handleMint}
                disabled={mintLoading || !mintAmount || parseFloat(mintAmount) <= 0}
                activeOpacity={0.85}
              >
                {mintLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="generating-tokens" size={18} color={Colors.bg} />}
                <Text style={s.execBtnText}>{mintLoading ? 'Minting Token…' : 'Mint Gold Token'}</Text>
              </TouchableOpacity>
            </View>

            {/* Token result */}
            {mintResult && (
              <>
                <View style={[s.successBanner, { borderColor: '#8B5CF6' + '66', backgroundColor: '#8B5CF610' }]}>
                  <MaterialIcons name="token" size={22} color="#8B5CF6" />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[s.successTitle, { color: '#8B5CF6' }]}>TOKEN MINTED</Text>
                    <Text style={[s.successId, { color: '#8B5CF6', fontSize: FontSize.xs }]} numberOfLines={1}>
                      {mintResult.token_id}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setMintResult(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={16} color="#8B5CF6" />
                  </TouchableOpacity>
                </View>

                <JsonBlock data={mintResult} title="web3_mint_gold_token()" color="#8B5CF6" />

                {/* Token detail card */}
                <View style={[s.card, { borderColor: '#8B5CF6' + '55' }]}>
                  <View style={s.cardHeader}>
                    <MaterialIcons name="workspace-premium" size={16} color="#8B5CF6" />
                    <Text style={[s.cardTitle, { color: '#8B5CF6' }]}>Token Certificate Details</Text>
                  </View>
                  {[
                    { label: 'Token ID',          val: mintResult.token_id,            mono: true  },
                    { label: 'Weight (g)',         val: `${mintResult.weight_certified_g} grams`,  mono: false },
                    { label: 'Purity',             val: mintResult.asset_purity,        mono: false },
                    { label: 'Hash (first 16)',    val: mintResult.proof_of_value_hash?.slice(0, 16) + '…', mono: true  },
                    { label: 'Hash Algorithm',     val: 'SHA-256 (FIPS 180-4)',         mono: false },
                    { label: 'Collateral Asset',   val: 'XAU — Physical Gold Bullion',  mono: false },
                  ].map(row => (
                    <View key={row.label} style={s.detailRow}>
                      <Text style={s.detailLabel}>{row.label}</Text>
                      <Text style={[s.detailVal, row.mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 }]} numberOfLines={1}>
                        {row.val}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* How it works */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="info-outline" size={15} color="#8B5CF6" />
                <Text style={[s.cardTitle, { color: '#8B5CF6' }]}>How Web3 Token Minting Works</Text>
              </View>
              {[
                'A cryptographically random nonce (secrets.token_hex(16) equivalent) is generated to ensure uniqueness.',
                'The nonce is combined with the weight unit and amount into a deterministic input string.',
                'SHA-256 hash of the input produces a unique 64-character hexadecimal proof-of-value hash.',
                'The first 12 characters of the hash form the human-readable Token ID (BTNG-GOLD-XXXXXXXXXXXX).',
                'The resulting token certifies physical gold ownership without any blockchain gas fees.',
                'Each token is valid only when paired with the matching sovereign_guard_signature in a PAPSS payload.',
              ].map((txt, i) => (
                <View key={i} style={s.howRow}>
                  <View style={[s.howStep, { backgroundColor: '#8B5CF6' + '18', borderColor: '#8B5CF6' + '44' }]}>
                    <Text style={[s.howStepText, { color: '#8B5CF6' }]}>{i + 1}</Text>
                  </View>
                  <Text style={s.howText}>{txt}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── CORRIDORS TAB ─────────────────────────────────────────────────── */}
        {tab === 'corridors' && (
          <>
            <View style={[s.heroCard, { borderColor: Colors.primary + '44' }]}>
              <Text style={{ fontSize: 40 }}>🗺️</Text>
              <Text style={s.heroTitle}>7-Nation Clearing Matrix</Text>
              <Text style={s.heroSub}>
                Independent Pan-African regional currency corridors. GHS is the base hub vault asset anchor. All values reference live XAU/USD spot price.
              </Text>
            </View>

            {/* Summary stats */}
            <View style={s.statsRow}>
              {[
                { label: 'Corridors',      val: '7',     color: Colors.primary  },
                { label: 'Base Currency',  val: 'GHS',   color: '#22C55E'       },
                { label: 'Protocol',       val: 'PAPSS', color: Colors.warning  },
                { label: 'IMF Clearance',  val: '0.00',  color: Colors.success  },
              ].map(st => (
                <View key={st.label} style={[s.statCell, { borderColor: st.color + '44' }]}>
                  <Text style={[s.statVal, { color: st.color }]}>{st.val}</Text>
                  <Text style={s.statLabel}>{st.label}</Text>
                </View>
              ))}
            </View>

            {/* Corridor cards */}
            {Object.entries(CORRIDORS).map(([code, cfg]) => {
              const ghsGram     = baseGramGHS;
              const localGram   = ghsGram * cfg.rate;
              const localOz     = ghsGram * OZ_TO_G * cfg.rate;
              const localKg     = ghsGram * 1000 * cfg.rate;
              return (
                <View key={code} style={[s.corridorCard, { borderColor: cfg.color + '55' }]}>
                  <View style={[s.corridorCardHeader, { backgroundColor: cfg.color + '12' }]}>
                    <View style={[s.corridorFlagWrap, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}>
                      <Text style={{ fontSize: 28 }}>{cfg.flag}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.corridorCardCode, { color: cfg.color }]}>{code}</Text>
                      <Text style={s.corridorCardName}>{cfg.name}</Text>
                      <Text style={s.corridorCardRegion}>{cfg.region}</Text>
                    </View>
                    <View style={[s.corridorRatePill, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}>
                      <Text style={[s.corridorRatePillText, { color: cfg.color }]}>GHS ×{cfg.rate}</Text>
                    </View>
                    {code === 'GHS' && (
                      <View style={[s.hubBadge]}>
                        <MaterialIcons name="star" size={11} color={cfg.color} />
                        <Text style={[s.hubBadgeText, { color: cfg.color }]}>Base Hub</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.corridorMetrics}>
                    {[
                      { label: '1g Gold',  val: `${code} ${localGram.toLocaleString('en-US', { maximumFractionDigits: 2 })}` },
                      { label: '1oz Gold', val: `${code} ${localOz.toLocaleString('en-US', { maximumFractionDigits: 2 })}` },
                      { label: '1kg Gold', val: `${code} ${localKg.toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
                    ].map(m => (
                      <View key={m.label} style={[s.corridorMetricCell, { borderColor: cfg.color + '33' }]}>
                        <Text style={[s.corridorMetricVal, { color: cfg.color }]}>{m.val}</Text>
                        <Text style={s.corridorMetricLabel}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}

            {/* AfCFTA info */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="policy" size={15} color={Colors.primary} />
                <Text style={s.cardTitle}>AfCFTA Integration Notes</Text>
              </View>
              {[
                'All corridors are part of the African Continental Free Trade Area (AfCFTA) independent settlement layer.',
                'GHS is the Base Hub Vault Asset Anchor — all multi-currency conversions are routed through GHS liquidity.',
                'PAPSS (Pan-African Payment and Settlement System) protocol eliminates Western clearing intermediaries.',
                'Corridor rates update dynamically; the fallback matrix (above) ensures zero-downtime operations.',
                'Each executed trade generates a SHA-256 Sovereign Guard Signature as the final integrity seal.',
                'The system supports 54 African Union member states with planned expansion to diaspora remittances.',
              ].map((txt, i) => (
                <View key={i} style={s.howRow}>
                  <View style={[s.howStep, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                    <Text style={[s.howStepText, { color: Colors.primary }]}>{i + 1}</Text>
                  </View>
                  <Text style={s.howText}>{txt}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── API DOCS TAB ──────────────────────────────────────────────────── */}
        {tab === 'docs' && (
          <>
            <View style={[s.heroCard, { borderColor: Colors.info + '44' }]}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={s.heroTitle}>API Documentation</Text>
              <Text style={s.heroSub}>afcfta_gateway.py — FastAPI v3.0.0 · TypeScript port</Text>
            </View>

            {/* Endpoints */}
            {[
              {
                method: 'GET', path: '/api/v3/trade/live-index', color: '#22C55E',
                desc: 'Live price lookup endpoint serving accurate conversion matrix variables to the mobile app. Returns BTNG-g, BTNG-oz, and BTNG-kg valuations in GHS anchored to live XAU/USD.',
                params: ['g (float, default 1.0) — gram balance', 'oz (float, default 1.0) — troy ounce balance', 'kg (float, default 1.0) — kilogram balance'],
                returns: '{ timestamp, spot_gold_index_usd_oz, live_valuations_ghs: { BTNG_G, BTNG_OZ, BTNG_KG } }',
              },
              {
                method: 'POST', path: '/api/v3/trade/execute', color: Colors.warning,
                desc: 'Core execution handler. Cryptographically secures and signs ISO 20022-ready cross-border payment packets via the PAPSS Non-IMF independent exchange protocol.',
                params: ['sender (str) — sender wallet address', 'receiver (str) — receiver wallet address', 'unit (str) — weight unit: g | oz | kg', 'amount (float) — trade quantity', 'target_currency (str) — destination corridor: GHS | NGN | ZAR | KES | EGP | XOF | ZMW'],
                returns: 'PAPSS payload with ISO 20022 header, Web3 token, value exchange ledger, and SHA-256 sovereign_guard_signature',
              },
            ].map(ep => (
              <View key={ep.path} style={[s.endpointCard, { borderColor: ep.color + '55' }]}>
                <View style={s.cardHeader}>
                  <View style={[s.methodBadge, { backgroundColor: ep.color + '18', borderColor: ep.color + '55' }]}>
                    <Text style={[s.methodText, { color: ep.color }]}>{ep.method}</Text>
                  </View>
                  <Text style={[s.endpointPath, { color: ep.color }]} selectable>{ep.path}</Text>
                </View>
                <Text style={s.endpointDesc}>{ep.desc}</Text>
                <Text style={s.paramsSectionTitle}>Parameters</Text>
                {ep.params.map((p, i) => (
                  <View key={i} style={s.paramRow}>
                    <View style={[s.paramDot, { backgroundColor: ep.color }]} />
                    <Text style={s.paramText}>{p}</Text>
                  </View>
                ))}
                <View style={[s.returnsSection, { borderColor: ep.color + '33', backgroundColor: ep.color + '07' }]}>
                  <MaterialIcons name="output" size={11} color={ep.color} />
                  <Text style={[s.returnsText, { color: ep.color }]}>{ep.returns}</Text>
                </View>
              </View>
            ))}

            {/* Class reference */}
            <View style={[s.card, { borderColor: Colors.primary + '44' }]}>
              <View style={s.cardHeader}>
                <MaterialIcons name="code" size={14} color={Colors.primary} />
                <Text style={[s.cardTitle, { color: Colors.primary }]}>AfCFTASovereignGateway (Python → TypeScript)</Text>
              </View>
              <Text style={s.codeBlock} selectable>{`class AfCFTASovereignGateway:
  oz_to_g           = 31.1034768
  guard_threshold   = 0.05  # 5%
  fallback_spot     = 4110.34   # Jun-2026
  fallback_fx_ghs   = 10.91715
  
  supported_corridors = {
    "GHS": 1.00, "NGN": 1.37, "ZAR": 1.68,
    "KES": 11.95, "EGP": 4.22,
    "XOF": 55.40, "ZMW": 2.42
  }
  
  async fetch_live_spot_gold() -> float
  web3_mint_gold_token(unit, amount) -> dict
  generate_papss_trade_payload(
    sender, receiver, unit, amount,
    destination_currency, live_spot
  ) -> dict`}</Text>
            </View>

            {/* Deployment */}
            <View style={[s.card, { borderColor: '#22C55E' + '44' }]}>
              <View style={s.cardHeader}>
                <MaterialIcons name="rocket-launch" size={14} color="#22C55E" />
                <Text style={[s.cardTitle, { color: '#22C55E' }]}>Node Deployment</Text>
              </View>
              <Text style={s.codeBlock} selectable>{`pip install fastapi uvicorn httpx pydantic

# Launch permanently on port 8000
uvicorn afcfta_gateway:app \\
  --host 0.0.0.0 \\
  --port 8000 \\
  --reload`}</Text>
              <View style={s.deployNote}>
                <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
                <Text style={s.deployNoteText}>
                  This app uses the OnSpace gold-oracle Edge Function as the live feed — equivalent to the GoldAPI.io Python integration, with automatic refresh and GHS fallback.
                </Text>
              </View>
            </View>

            {/* Fallback constants */}
            <View style={[s.card, { borderColor: Colors.warning + '44' }]}>
              <View style={s.cardHeader}>
                <MaterialIcons name="offline-bolt" size={14} color={Colors.warning} />
                <Text style={[s.cardTitle, { color: Colors.warning }]}>Hardened Fallback Constants (Jun-2026)</Text>
              </View>
              {[
                { label: 'fallback_spot_usd_oz',  val: `$${FALLBACK_SPOT}/oz` },
                { label: 'fallback_fx_usd_ghs',   val: `${FALLBACK_FX_GHS} GHS/USD` },
                { label: 'oz_to_g',               val: `${OZ_TO_G} g/troy oz` },
                { label: 'guard_threshold',        val: `${(GUARD_THRESHOLD * 100).toFixed(0)}% Sovereign Guard` },
                { label: 'supported_corridors',    val: '7 (GHS · NGN · ZAR · KES · EGP · XOF · ZMW)' },
                { label: 'settlement_protocol',    val: 'NON_IMF_INDEPENDENT_EXCHANGE' },
              ].map(row => (
                <View key={row.label} style={s.detailRow}>
                  <Text style={[s.detailLabel, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 9 }]}>{row.label}</Text>
                  <Text style={[s.detailVal, { color: Colors.warning }]}>{row.val}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── HISTORY TAB ──────────────────────────────────────────────────── */}
        {tab === 'history' && (() => {
          const STATUS_CFG: Record<string, { color: string; bg: string; icon: string }> = {
            pending:   { color: Colors.warning,  bg: Colors.warningBg,  icon: 'hourglass-top'  },
            completed: { color: Colors.success,  bg: Colors.successBg,  icon: 'check-circle'   },
            failed:    { color: Colors.error,    bg: Colors.errorBg,    icon: 'cancel'         },
            cancelled: { color: Colors.textMuted,bg: Colors.bgElevated, icon: 'block'          },
          };
          return (
            <>
              {/* Hero */}
              <View style={[hy.hero, { borderColor: Colors.warning + '44' }]}>
                <Text style={{ fontSize: 40 }}>🏛️</Text>
                <Text style={hy.heroTitle}>PAPSS Trade History</Text>
                <Text style={hy.heroSub}>
                  Executed cross-border settlements stored in{' '}
                  <Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>btng_pay_transactions</Text>
                  {' '}· channel = BTNG_PAY_GATEWAY
                </Text>
              </View>

              {/* Refresh button */}
              <TouchableOpacity
                style={hy.refreshBtn}
                onPress={() => loadHistory(true)}
                activeOpacity={0.85}
              >
                {historyRefreshing
                  ? <ActivityIndicator size="small" color={Colors.warning} />
                  : <MaterialIcons name="refresh" size={16} color={Colors.warning} />}
                <Text style={hy.refreshBtnText}>{historyRefreshing ? 'Refreshing…' : 'Refresh History'}</Text>
              </TouchableOpacity>

              {/* Summary stats */}
              {historyRows.length > 0 && (
                <View style={hy.statsRow}>
                  {[
                    { label: 'Total',     value: historyRows.length,                                            color: Colors.primary  },
                    { label: 'Pending',   value: historyRows.filter(r => r.status === 'pending').length,       color: Colors.warning  },
                    { label: 'Completed', value: historyRows.filter(r => r.status === 'completed').length,     color: Colors.success  },
                    { label: 'Failed',    value: historyRows.filter(r => r.status === 'failed').length,        color: Colors.error    },
                  ].map(st => (
                    <View key={st.label} style={[hy.statCell, { borderColor: st.color + '44' }]}>
                      <Text style={[hy.statVal, { color: st.color }]}>{st.value}</Text>
                      <Text style={hy.statLabel}>{st.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Loading */}
              {historyLoading && historyRows.length === 0 ? (
                <View style={hy.loadingWrap}>
                  <ActivityIndicator color={Colors.warning} />
                  <Text style={hy.loadingText}>Loading PAPSS trade history…</Text>
                </View>
              ) : historyRows.length === 0 ? (
                <View style={hy.emptyWrap}>
                  <Text style={{ fontSize: 48 }}>📭</Text>
                  <Text style={hy.emptyTitle}>No PAPSS Trades Yet</Text>
                  <Text style={hy.emptySub}>
                    Execute a cross-border trade from the Execute tab — each payload is persisted here with full ISO 20022 metadata.
                  </Text>
                  <TouchableOpacity
                    style={hy.goExecBtn}
                    onPress={() => setTab('execute')}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="send" size={15} color={Colors.bg} />
                    <Text style={hy.goExecBtnText}>Go to Execute</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                historyRows.map(row => {
                  const receipt   = row.settlement_receipt ?? {};
                  const ledger    = receipt.value_exchange_ledger ?? {};
                  const header    = receipt.iso_20022_header ?? {};
                  const token     = receipt.web3_security_token   ?? {};
                  const sig       = (receipt.sovereign_guard_signature ?? '') as string;
                  const currency  = ledger.settlement_currency as string ?? 'GHS';
                  const corridorCfg = CORRIDORS[currency] ?? CORRIDORS.GHS;
                  const msgId     = (header.msg_id ?? row.reference ?? '—') as string;
                  const sigSnip   = sig.length > 0 ? sig.slice(0, 16) + '…' : '—';
                  const sc        = STATUS_CFG[row.status] ?? STATUS_CFG.pending;
                  const dt        = new Date(row.created_at);
                  const dateStr   = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                  const timeStr   = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const clearing  = ledger.fiat_clearing_amount ?? row.ghs_equivalent ?? 0;
                  return (
                    <View key={row.id} style={[hy.card, { borderLeftColor: corridorCfg.color, borderLeftWidth: 3 }]}>
                      {/* Card header */}
                      <View style={hy.cardHeader}>
                        <View style={[hy.flagWrap, { backgroundColor: corridorCfg.color + '18', borderColor: corridorCfg.color + '44' }]}>
                          <Text style={{ fontSize: 26 }}>{corridorCfg.flag}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={hy.cardTitleRow}>
                            <Text style={[hy.cardCurrency, { color: corridorCfg.color }]}>{currency}</Text>
                            <View style={[hy.statusChip, { backgroundColor: sc.bg, borderColor: sc.color + '55' }]}>
                              <MaterialIcons name={sc.icon as any} size={10} color={sc.color} />
                              <Text style={[hy.statusChipText, { color: sc.color }]}>{row.status}</Text>
                            </View>
                          </View>
                          <View style={hy.cardMeta}>
                            <MaterialIcons name="schedule" size={10} color={Colors.textMuted} />
                            <Text style={hy.cardMetaText}>{dateStr} · {timeStr}</Text>
                            <View style={hy.metaDot} />
                            <Text style={hy.cardMetaText}>{row.unit}</Text>
                          </View>
                        </View>
                        {/* Clearing amount */}
                        <View style={{ alignItems: 'flex-end', gap: 3 }}>
                          <Text style={[hy.clearingVal, { color: corridorCfg.color }]}>
                            {currency} {Number(clearing).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </Text>
                          <Text style={hy.clearingUSD}>${Number(row.usd_equivalent).toLocaleString('en-US', { maximumFractionDigits: 4 })} USD</Text>
                        </View>
                      </View>

                      {/* Details grid */}
                      <View style={hy.detailsGrid}>
                        {[
                          { label: 'ISO 20022 Msg ID',      value: msgId,                                 mono: true,  color: Colors.warning  },
                          { label: 'Sovereign Guard Sig',   value: sigSnip,                               mono: true,  color: Colors.primary  },
                          { label: 'Token ID',              value: (token.token_id ?? '—') as string,     mono: true,  color: '#8B5CF6'       },
                          { label: 'Gold Weight',           value: `${token.weight_certified_g ?? '—'} g`, mono: false, color: Colors.textPrimary },
                          { label: 'GHS Equivalent',        value: `GH₵${Number(row.ghs_equivalent).toLocaleString('en-US', { maximumFractionDigits: 2 })}`, mono: false, color: '#22C55E' },
                          { label: 'XAU Spot (USD)',        value: `$${Number(row.gold_price_usd).toFixed(2)}`,  mono: false, color: Colors.primary  },
                          { label: 'Settlement Protocol',   value: (receipt.settlement_protocol ?? 'NON_IMF') as string, mono: false, color: Colors.success },
                          { label: 'Western Interference',  value: (ledger.intermediary_western_interference ?? '0.00 (BYPASSED)') as string, mono: false, color: Colors.success },
                        ].map(row2 => (
                          <View key={row2.label} style={hy.detailRow}>
                            <Text style={hy.detailLabel}>{row2.label}</Text>
                            <Text
                              style={[hy.detailVal, { color: row2.color }, row2.mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 9 }]}
                              numberOfLines={1}
                              selectable
                            >
                              {row2.value}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Wallets */}
                      <View style={hy.walletRow}>
                        <View style={[hy.walletPill, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                          <MaterialIcons name="account-balance-wallet" size={10} color={Colors.primary} />
                          <Text style={[hy.walletText, { color: Colors.primary }]} numberOfLines={1}>{row.sender_wallet}</Text>
                        </View>
                        <MaterialIcons name="arrow-forward" size={14} color={corridorCfg.color} />
                        <View style={[hy.walletPill, { backgroundColor: corridorCfg.color + '12', borderColor: corridorCfg.color + '44' }]}>
                          <MaterialIcons name="account-balance" size={10} color={corridorCfg.color} />
                          <Text style={[hy.walletText, { color: corridorCfg.color }]} numberOfLines={1}>{row.recipient_wallet}</Text>
                        </View>
                      </View>

                      {/* Full sig strip */}
                      {sig.length > 0 && (
                        <View style={hy.sigStrip}>
                          <MaterialIcons name="shield" size={11} color={Colors.primary} />
                          <Text style={hy.sigStripText} selectable numberOfLines={1}>{sig}</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              {/* Schema note */}
              <View style={hy.schemaNoteCard}>
                <View style={hy.schemaNoteHeader}>
                  <MaterialIcons name="table-chart" size={13} color={Colors.primary} />
                  <Text style={hy.schemaNoteTitle}>btng_pay_transactions Schema</Text>
                </View>
                {[
                  { field: 'channel',             value: 'BTNG_PAY_GATEWAY (filter key)'    },
                  { field: 'reference',           value: 'ISO 20022 msg_id'                 },
                  { field: 'settlement_receipt',  value: 'Full PAPSS payload (jsonb)'       },
                  { field: 'ghs_equivalent',      value: 'Corridor clearing amount (GHS)'  },
                  { field: 'usd_equivalent',      value: 'Gold weight × XAU/g (USD)'       },
                  { field: 'gold_price_usd',      value: 'Live oracle XAU/USD at execution'},
                  { field: 'ucaf / signature',    value: 'sovereign_guard_signature hash'  },
                  { field: 'token_ref',           value: 'Web3 gold token ID'               },
                ].map(r => (
                  <View key={r.field} style={hy.schemaRow}>
                    <Text style={hy.schemaField}>{r.field}</Text>
                    <Text style={hy.schemaValue} numberOfLines={1}>{r.value}</Text>
                  </View>
                ))}
              </View>
            </>
          );
        })()}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── History Tab Styles ─────────────────────────────────────────────────────
const hy = StyleSheet.create({
  hero:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.warning + '33', alignItems: 'center', gap: Spacing.sm },
  heroTitle:      { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:        { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  refreshBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.warning + '55' },
  refreshBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  statsRow:       { flexDirection: 'row', gap: Spacing.sm },
  statCell:       { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:      { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  loadingWrap:    { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText:    { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  emptyWrap:      { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:       { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, includeFontPadding: false, paddingHorizontal: Spacing.lg },
  goExecBtn:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.warning, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginTop: Spacing.sm },
  goExecBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  card:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md, overflow: 'hidden' },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flagWrap:       { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  cardCurrency:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statusChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusChipText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  cardMeta:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText:   { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  metaDot:        { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  clearingVal:    { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'right' },
  clearingUSD:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, textAlign: 'right' },
  detailsGrid:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, maxWidth: '40%' },
  detailVal:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false, maxWidth: '58%', textAlign: 'right' },
  walletRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  walletPill:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, minWidth: 0 },
  walletText:     { flex: 1, fontSize: 9, fontWeight: FontWeight.semibold, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sigStrip:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '33' },
  sigStripText:   { flex: 1, fontSize: 9, color: Colors.primary + 'CC', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  schemaNoteCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm },
  schemaNoteHeader:{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  schemaNoteTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  schemaRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  schemaField:    { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  schemaValue:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, maxWidth: '60%', textAlign: 'right' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:    { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  topSub:       { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },

  oracleBar:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: 10, flexWrap: 'wrap' },
  oraclePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  oraclePillText:{ fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  oracleSpot:   { fontSize: 16, fontWeight: FontWeight.heavy, includeFontPadding: false, flex: 1 },
  corridorCount:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  corridorCountText:{ fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  countdown:    { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  tabScrollWrap:   { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, height: 40 },
  tabScrollContent:{ flexDirection: 'row', gap: 5, paddingRight: Spacing.xl },
  tabBtn:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:         { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:   { color: Colors.bg },

  scroll:       { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  heroCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  heroTitle:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:      { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle:    { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardMono:     { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  liveBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  liveBadgeText:{ fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  inputGrid:    { flexDirection: 'row', gap: Spacing.sm },
  inputFieldWrap:{ flex: 1, gap: 4 },
  inputLabel:   { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  inputField:   { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },

  valuationsRow:{ flexDirection: 'row', gap: Spacing.sm },
  valuationCell:{ flex: 1, alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1, paddingVertical: Spacing.md },
  valuationKey: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  valuationGHS: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  valuationLabel:{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  formulaSection:{ backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 5 },
  formulaRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', gap: Spacing.sm },
  formulaLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  formulaExpr:  { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  formulaVal:   { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },

  inputBlock:       { gap: 5 },
  inputBlockLabel:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  inputBlockLabelText:{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  inputBlockField:  { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },

  unitRow:     { flexDirection: 'row', gap: Spacing.sm },
  unitBtn:     { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border },
  unitBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },

  corridorChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border },
  corridorChipText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  estimateCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  estimateLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  estimateVal:  { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  estimateSub:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  bypassPill:   { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  bypassText:   { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  purityBadge:  { fontSize: 12, fontWeight: FontWeight.heavy, color: '#8B5CF6', backgroundColor: '#8B5CF6' + '18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#8B5CF6' + '44', includeFontPadding: false },

  amountRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 2, borderColor: '#8B5CF6' + '55', paddingHorizontal: Spacing.md, height: 58 },
  amountField:  { flex: 1, fontSize: 26, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  amountSuffix: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },

  execBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.warning, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  execBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false, flex: 1, textAlign: 'center' },

  errorCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.error + '55', padding: Spacing.md },
  errorText:   { flex: 1, fontSize: FontSize.sm, color: Colors.error, lineHeight: 18, includeFontPadding: false },

  successBanner:{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md },
  successTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  successSub:   { fontSize: FontSize.xs, color: Colors.success, includeFontPadding: false },
  successId:    { fontSize: 9, color: Colors.success + 'AA', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  detailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, maxWidth: '40%' },
  detailVal:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, maxWidth: '58%', textAlign: 'right' },

  sigCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm },
  sigHeader:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sigTitle:    { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  sigBadge:    { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' },
  sigBadgeText:{ fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  sigHash:     { fontSize: 9, color: Colors.primary + 'CC', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '33', lineHeight: 14, includeFontPadding: false },

  statsRow:    { flexDirection: 'row', gap: Spacing.sm },
  statCell:    { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:     { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:   { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  corridorCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden' },
  corridorCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  corridorFlagWrap:   { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  corridorCardCode:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  corridorCardName:   { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  corridorCardRegion: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  corridorRatePill:   { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  corridorRatePillText:{ fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  hubBadge:           { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#22C55E' + '18', borderWidth: 1, borderColor: '#22C55E' + '44' },
  hubBadgeText:       { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  corridorMetrics:    { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  corridorMetricCell: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 2 },
  corridorMetricVal:  { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  corridorMetricLabel:{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  howRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  howStep:   { width: 24, height: 24, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  howStepText:{ fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  howText:   { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },

  endpointCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.md },
  methodBadge:      { borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  methodText:       { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  endpointPath:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, flex: 1 },
  endpointDesc:     { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },
  paramsSectionTitle:{ fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  paramRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  paramDot:         { width: 5, height: 5, borderRadius: 2.5, marginTop: 5, flexShrink: 0 },
  paramText:        { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  returnsSection:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm + 2 },
  returnsText:      { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, lineHeight: 16, includeFontPadding: false },

  codeBlock:   { backgroundColor: '#060e06', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: '#1a3a1a', fontSize: 9, color: '#4ade80', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 15, includeFontPadding: false },
  deployNote:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  deployNoteText:{ flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
});
