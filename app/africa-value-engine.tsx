// Africa Value Engine — LIVE Gold Oracle · $29.5T Continental Reserve · 54-Nation GDP
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useGoldOracle } from '@/hooks/useGoldOracle';

// ─── PAN-AFRICAN VALUE ENGINE DATA ────────────────────────────────────────────
const LOCAL_FIAT = [
  { code: 'NGN', flag: '🇳🇬', name: 'Nigerian Naira',     usdRate: 1600,  region: 'West Africa',     color: '#22C55E' },
  { code: 'GHS', flag: '🇬🇭', name: 'Ghanaian Cedi',      usdRate: 15.3,  region: 'West Africa',     color: Colors.primary },
  { code: 'ZAR', flag: '🇿🇦', name: 'South African Rand', usdRate: 18.6,  region: 'Southern Africa', color: '#3B82F6' },
  { code: 'KES', flag: '🇰🇪', name: 'Kenyan Shilling',    usdRate: 129,   region: 'East Africa',     color: '#F59E0B' },
  { code: 'XAF', flag: '🇨🇲', name: 'CFA Franc (CEMAC)',  usdRate: 610,   region: 'Central Africa',  color: '#A855F7' },
  { code: 'EGP', flag: '🇪🇬', name: 'Egyptian Pound',     usdRate: 48.7,  region: 'North Africa',    color: '#EF4444' },
];

const COMMODITIES = [
  { emoji: '🥇', code: 'XAU', name: 'Gold',     unit: '/troy oz',   baseUSD: 3325, color: Colors.primary, desc: 'Ghana, S.Africa, Tanzania, Mali' },
  { emoji: '🍫', code: 'CCO', name: 'Cocoa',    unit: '/tonne',     baseUSD: 9800, color: '#92400E',       desc: "Ivory Coast, Ghana — world's #1 supply" },
  { emoji: '🔋', code: 'COL', name: 'Coltan',   unit: '/kg',        baseUSD: 180,  color: '#6366F1',       desc: 'DRC — 64% of global reserves' },
  { emoji: '🛢️', code: 'OIL', name: 'Crude Oil', unit: '/barrel',   baseUSD: 82,   color: '#F59E0B',       desc: 'Nigeria, Angola, Algeria, Libya' },
  { emoji: '🌾', code: 'CAS', name: 'Cassava',  unit: '/tonne',     baseUSD: 280,  color: '#22C55E',       desc: 'Nigeria, DRC — largest global producer' },
  { emoji: '☕', code: 'COF', name: 'Coffee',   unit: '/bag 60kg',  baseUSD: 340,  color: '#78350F',       desc: 'Ethiopia, Uganda, Tanzania' },
];

const CROSS_BORDER = [
  { code: 'USDC',   name: 'USD Coin',  type: 'Stablecoin', emoji: '💵', color: '#2775CA',      peg: 'USD', desc: 'Fiat-backed · Circle / Coinbase' },
  { code: 'cNGN',   name: 'cNGN',      type: 'Stable',     emoji: '🇳🇬', color: '#22C55E',      peg: 'NGN', desc: 'CBN-backed · Nigerian digital naira' },
  { code: 'eNaira', name: 'eNaira',    type: 'CBDC',       emoji: '⚡',  color: '#16A34A',      peg: 'NGN', desc: 'Central Bank of Nigeria CBDC' },
  { code: 'BTC',    name: 'Bitcoin',   type: 'Crypto',     emoji: '₿',  color: '#F7931A',      peg: 'BTC', desc: 'Peer-to-peer · No counterparty risk' },
  { code: 'ETH',    name: 'Ethereum',  type: 'Crypto',     emoji: '⬡',  color: '#627EEA',      peg: 'ETH', desc: 'Smart contracts · EVM-compatible' },
  { code: 'BTNGG',  name: 'BTNG Gold', type: 'Sovereign',  emoji: '🥇', color: Colors.primary, peg: 'XAU', desc: 'African gold-backed · 54 nations' },
];

const AFRICA_GDP = [
  { flag: '🇳🇬', name: 'Nigeria',      gdp: '$477B', pop: '220M', resource: 'Oil & Gas',              share: 15.2 },
  { flag: '🇿🇦', name: 'South Africa', gdp: '$380B', pop: '60M',  resource: 'Mining & Finance',       share: 12.1 },
  { flag: '🇪🇬', name: 'Egypt',        gdp: '$476B', pop: '105M', resource: 'Tourism & Suez',         share: 15.1 },
  { flag: '🇰🇪', name: 'Kenya',        gdp: '$118B', pop: '55M',  resource: 'Agriculture & Tech',     share: 3.8  },
  { flag: '🇪🇹', name: 'Ethiopia',     gdp: '$156B', pop: '120M', resource: 'Coffee & Agriculture',   share: 5.0  },
  { flag: '🇹🇿', name: 'Tanzania',     gdp: '$85B',  pop: '63M',  resource: 'Gold & Tourism',         share: 2.7  },
  { flag: '🇬🇭', name: 'Ghana',        gdp: '$74B',  pop: '32M',  resource: 'Gold, Oil & Cocoa',      share: 2.4  },
  { flag: '🇲🇦', name: 'Morocco',      gdp: '$144B', pop: '37M',  resource: 'Phosphates & Tourism',   share: 4.6  },
  { flag: '🇩🇿', name: 'Algeria',      gdp: '$215B', pop: '45M',  resource: 'Hydrocarbons',           share: 6.8  },
  { flag: '🇦🇴', name: 'Angola',       gdp: '$98B',  pop: '34M',  resource: 'Oil & Diamonds',         share: 3.1  },
  { flag: '🇨🇮', name: 'Ivory Coast',  gdp: '$69B',  pop: '27M',  resource: 'Cocoa & Coffee',         share: 2.2  },
  { flag: '🇸🇩', name: 'Sudan',        gdp: '$22B',  pop: '45M',  resource: 'Gold & Cotton',          share: 0.7  },
];

const RESOURCES = [
  { emoji: '🥇', name: 'Gold',              percent: 35, color: Colors.primary, nations: 'Ghana, South Africa, Tanzania, Mali, DRC' },
  { emoji: '🛢️', name: 'Oil & Gas',         percent: 28, color: '#F59E0B',      nations: 'Nigeria, Angola, Algeria, Libya, Gabon' },
  { emoji: '💎', name: 'Diamonds & Gems',   percent: 8,  color: '#3B82F6',      nations: 'Botswana, DRC, Angola, Sierra Leone' },
  { emoji: '🌾', name: 'Agriculture',       percent: 14, color: '#22C55E',      nations: 'Ethiopia, Nigeria, Egypt, Kenya, Ghana' },
  { emoji: '⚡', name: 'Renewable Energy',  percent: 9,  color: '#A855F7',      nations: 'Morocco, Kenya, South Africa, Egypt' },
  { emoji: '🏔️', name: 'Minerals',          percent: 6,  color: '#64748B',      nations: 'DRC, Zambia, Zimbabwe, Guinea' },
];

// 6.57 billion troy oz — Africa's audited gold reserve
const GOLD_OZ_RESERVE = 6_570_000_000;
// 204.2 Billion BTNGG tokens total supply
const BTNGG_SUPPLY = 204_200_000_000;
// Secondary Sovereign Coin
const SECONDARY_RESERVE_USD = 30_000_000_000_000; // $30T fixed
const SECONDARY_COIN_ID = '1BTNG-AFT-54-QNTM-GENESIS-7C4B847D9FC6';
const MAIN_RESERVE_ID = 'BTNG-54-39791045C086C7CB9FC6C17E42C4847D';

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${percent}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 5, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  fill:  { height: 5, borderRadius: 3 },
});

function LiveDot({ color = Colors.success }: { color?: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.8, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [pulse]);
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color, opacity: 0.35, transform: [{ scale: pulse }] }} />
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 5 }} />
    </View>
  );
}

export default function AfricaValueEngineScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'exchange' | 'gdp' | 'resources' | 'backing'>('overview');
  const [refreshing, setRefreshing] = useState(false);

  // FX calculator state
  const [fxFrom, setFxFrom]     = useState(LOCAL_FIAT[1]); // GHS
  const [fxTo,   setFxTo]       = useState(LOCAL_FIAT[0]); // NGN
  const [fxAmount, setFxAmount] = useState('100');

  // ── Live Gold Oracle ────────────────────────────────────────────────────────
  const gold = useGoldOracle();

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await gold.refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  const goldPriceUSD  = gold.priceUSD > 0 ? gold.priceUSD : 3325.80;
  const btngPriceUSD  = gold.priceBTNGG > 0 ? gold.priceBTNGG : goldPriceUSD / 1000;
  const liveReserveUSD        = goldPriceUSD * GOLD_OZ_RESERVE;
  const liveReserveTrillions  = (liveReserveUSD / 1e12).toFixed(2);
  const liveReserveLabel      = `$${liveReserveTrillions}T`;
  const totalSovereignUSD     = liveReserveUSD + SECONDARY_RESERVE_USD;
  const totalSovereignLabel   = `$${(totalSovereignUSD / 1e12).toFixed(1)}T`;
  const btngMarketCapT        = (btngPriceUSD * BTNGG_SUPPLY / 1e12).toFixed(3);
  const backingRatio          = Math.round(liveReserveUSD / (btngPriceUSD * BTNGG_SUPPLY));

  function resourceValue(percent: number) {
    const val = (liveReserveUSD * percent) / 100;
    if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
    return `$${(val / 1e9).toFixed(0)}B`;
  }

  const TABS = [
    { key: 'overview',  label: 'Overview',  icon: 'dashboard'       },
    { key: 'exchange',  label: 'Exchange',  icon: 'swap-horiz'      },
    { key: 'gdp',       label: 'GDP',       icon: 'bar-chart'       },
    { key: 'resources', label: 'Resources', icon: 'landscape'       },
    { key: 'backing',   label: 'BTNG',      icon: 'verified'        },
  ];

  const isLive      = gold.source === 'live';
  const statusColor = isLive ? Colors.success : Colors.warning;
  const statusLabel = (gold.loading && gold.priceUSD === 0) ? 'LOADING…' : isLive ? 'LIVE' : 'CACHED';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Africa Value Engine</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={statusColor} />
            <Text style={[s.topSub, { color: statusColor }]}>{statusLabel} · {totalSovereignLabel} Sovereign</Text>
          </View>
        </View>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: statusColor + '22', borderColor: statusColor + '66' }]} onPress={handleManualRefresh}>
          {refreshing ? <ActivityIndicator size="small" color={statusColor} /> : <MaterialIcons name="refresh" size={20} color={statusColor} />}
        </TouchableOpacity>
      </View>

      {/* ── LIVE TICKER BAR ───────────────────────────────────────────────────── */}
      <View style={[s.tickerBar, { borderColor: statusColor + '55', backgroundColor: statusColor + '10' }]}>
        <View style={[s.tickerStatusPill, { backgroundColor: statusColor + '22', borderColor: statusColor + '55' }]}>
          <LiveDot color={statusColor} />
          <Text style={[s.tickerStatusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <View style={s.tickerPriceWrap}>
          <Text style={s.tickerSymbol}>XAU/USD</Text>
          {gold.loading && gold.priceUSD === 0 ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={[s.tickerPrice, { color: gold.changePct24h >= 0 ? Colors.success : Colors.error }]}>
              ${goldPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          )}
        </View>
        <View style={[s.changePill, { backgroundColor: gold.changePct24h >= 0 ? Colors.successBg : Colors.errorBg, borderColor: (gold.changePct24h >= 0 ? Colors.success : Colors.error) + '55' }]}>
          <MaterialIcons name={gold.changePct24h >= 0 ? 'trending-up' : 'trending-down'} size={12} color={gold.changePct24h >= 0 ? Colors.success : Colors.error} />
          <Text style={[s.changeText, { color: gold.changePct24h >= 0 ? Colors.success : Colors.error }]}>
            {gold.changePct24h >= 0 ? '+' : ''}{gold.changePct24h.toFixed(2)}%
          </Text>
        </View>
        <View style={s.tickerCountdown}>
          <MaterialIcons name="timer" size={11} color={Colors.textMuted} />
          <Text style={s.tickerCountdownText}>{gold.nextRefreshIn}s</Text>
        </View>
        {gold.lastUpdated ? (
          <Text style={s.feedTime} numberOfLines={1}>
            {gold.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        ) : null}
        <TouchableOpacity style={[s.tickerRefreshBtn, { borderColor: statusColor + '55' }]} onPress={handleManualRefresh} activeOpacity={0.75} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {refreshing ? <ActivityIndicator size="small" color={statusColor} /> : <MaterialIcons name="refresh" size={14} color={statusColor} />}
        </TouchableOpacity>
      </View>

      {/* BTNGG Live Price Row */}
      <View style={s.btngRow}>
        <View style={s.btngItem}>
          <Text style={s.btngItemLabel}>1 BTNGG</Text>
          <Text style={s.btngItemValue}>${btngPriceUSD.toFixed(4)}</Text>
        </View>
        <View style={s.btngDivider} />
        <View style={s.btngItem}>
          <Text style={s.btngItemLabel}>Main Reserve</Text>
          <Text style={[s.btngItemValue, { color: '#22C55E' }]}>{liveReserveLabel}</Text>
        </View>
        <View style={s.btngDivider} />
        <View style={s.btngItem}>
          <Text style={s.btngItemLabel}>Secondary Coin</Text>
          <Text style={[s.btngItemValue, { color: '#3B82F6' }]}>$30T</Text>
        </View>
        <View style={s.btngDivider} />
        <View style={s.btngItem}>
          <Text style={s.btngItemLabel}>Total Sovereign</Text>
          <Text style={[s.btngItemValue, { color: Colors.primary, fontSize: 11 }]}>{totalSovereignLabel}</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]} onPress={() => setActiveTab(t.key as any)}>
            <MaterialIcons name={t.icon as any} size={12} color={activeTab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <View style={s.hero}>
              <Text style={{ fontSize: 56 }}>🌍</Text>
              <Text style={s.heroTitle}>Africa: The World's Richest Continent</Text>
              <Text style={s.heroSub}>
                Africa holds 60% of the world's uncultivated arable land, 40% of global gold reserves,
                33% of mineral deposits, and 10% of oil. At today's XAU price of ${goldPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz,
                the continent's gold alone is worth {liveReserveLabel}.
              </Text>
              <View style={s.heroBadgeRow}>
                <View style={[s.heroBadge, { borderColor: Colors.primary + '44', backgroundColor: Colors.primaryGlow }]}>
                  <Text style={[s.heroBadgeText, { color: Colors.primary }]}>Total Sovereign {totalSovereignLabel}</Text>
                </View>
                <View style={[s.heroBadge, { borderColor: '#22C55E44', backgroundColor: '#22C55E18' }]}>
                  <Text style={[s.heroBadgeText, { color: '#22C55E' }]}>Main Reserve {liveReserveLabel}</Text>
                </View>
                <View style={[s.heroBadge, { borderColor: '#3B82F644', backgroundColor: '#3B82F618' }]}>
                  <Text style={[s.heroBadgeText, { color: '#3B82F6' }]}>Secondary $30T</Text>
                </View>
              </View>
            </View>

            <View style={s.connectionCard}>
              <View style={s.connectionHeader}>
                <MaterialIcons name="verified" size={18} color={Colors.primary} />
                <Text style={s.connectionTitle}>Sovereign Asset IDs</Text>
                <View style={{ flex: 1 }} />
                <View style={[s.sourcePill, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' }]}>
                  <Text style={[s.sourceText, { color: Colors.success }]}>VERIFIED</Text>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <View style={{ backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: 10, gap: 3 }}>
                  <Text style={{ fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false }}>MAIN RESERVE · {liveReserveLabel}</Text>
                  <Text style={{ fontSize: 11, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false }} numberOfLines={1}>{MAIN_RESERVE_ID}</Text>
                </View>
                <View style={{ backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: 10, gap: 3 }}>
                  <Text style={{ fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false }}>SECONDARY SOVEREIGN COIN · $30T</Text>
                  <Text style={{ fontSize: 11, color: '#3B82F6', fontFamily: 'monospace', includeFontPadding: false }} numberOfLines={1}>{SECONDARY_COIN_ID}</Text>
                </View>
              </View>
            </View>

            <View style={s.statsGrid}>
              {[
                { label: 'Continent GDP',    value: '$3.1T',            sub: 'Annual 2025',                           color: Colors.primary },
                { label: 'Gold Reserve',     value: liveReserveLabel,   sub: isLive ? '● Live XAU price' : '● Cached', color: '#22C55E' },
                { label: 'Population',       value: '1.4B',             sub: '2.9B by 2060',                          color: '#3B82F6' },
                { label: 'Gold Reserves',    value: '40%',              sub: 'Of global supply',                      color: Colors.warning },
                { label: 'XAU/oz Price',     value: `$${goldPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, sub: gold.changePct24h >= 0 ? `+${gold.changePct24h.toFixed(2)}% 24h` : `${gold.changePct24h.toFixed(2)}% 24h`, color: gold.changePct24h >= 0 ? Colors.success : Colors.error },
                { label: 'Oil Deposits',     value: '10%',              sub: 'Of world reserves',                     color: '#F59E0B' },
              ].map(stat => (
                <View key={stat.label} style={[s.statCard, { borderColor: stat.color + '33' }]}>
                  <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                  <Text style={s.statSub}>{stat.sub}</Text>
                </View>
              ))}
            </View>

            <View style={s.connectionCard}>
              <View style={s.connectionHeader}>
                <MaterialIcons name="link" size={18} color={Colors.primary} />
                <Text style={s.connectionTitle}>How BTNG is Backed by Africa</Text>
                <View style={{ flex: 1 }} />
                <View style={[s.sourcePill, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                  <LiveDot color={statusColor} />
                  <Text style={[s.sourceText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>
              <Text style={s.connectionText}>
                BTNG Gold (BTNGG) is backed by Africa's {liveReserveLabel} live-calculated gold reserve —
                6.57 billion troy oz at today's XAU spot price of ${goldPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/oz.
                Each BTNGG token is pegged to 1/1000 oz of XAU, anchored in the Bank of Ghana vault,
                with sovereign backing across all 54 African Union nations.
              </Text>
              <View style={s.connectionChips}>
                {['Gold Vault (Accra)', 'Continental GDP Backing', '54 Nation Sovereignty', 'Bank of Ghana', 'African Union'].map(chip => (
                  <View key={chip} style={s.chip}><Text style={s.chipText}>{chip}</Text></View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── PAN-AFRICAN VALUE ENGINE / EXCHANGE TAB ──────────────────────────── */}
        {activeTab === 'exchange' && (
          <>
            {/* Header */}
            <View style={s.exchHeader}>
              <View style={s.exchHeaderIconWrap}>
                <MaterialIcons name="swap-horiz" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.exchTitle}>Pan-African Value Engine</Text>
                <Text style={s.exchSub}>Local Fiat · Commodities · Cross-Border Rails</Text>
              </View>
              <View style={[s.exchLiveBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                <LiveDot color={statusColor} />
                <Text style={[s.exchLiveBadgeText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            </View>

            {/* ── Architecture table ────────────────────────────────────────── */}
            <View style={s.archTable}>
              <View style={s.archTableHeader}>
                <View style={[s.archTableHeaderCell, { borderColor: '#22C55E55' }]}>
                  <MaterialIcons name="account-balance" size={13} color="#22C55E" />
                  <Text style={[s.archTableHeaderText, { color: '#22C55E' }]}>Local Fiat</Text>
                </View>
                <View style={[s.archTableHeaderCell, { borderColor: Colors.primary + '55' }]}>
                  <MaterialIcons name="landscape" size={13} color={Colors.primary} />
                  <Text style={[s.archTableHeaderText, { color: Colors.primary }]}>Commodity</Text>
                </View>
                <View style={[s.archTableHeaderCell, { borderColor: '#3B82F655' }]}>
                  <MaterialIcons name="public" size={13} color="#3B82F6" />
                  <Text style={[s.archTableHeaderText, { color: '#3B82F6' }]}>Cross-Border</Text>
                </View>
              </View>

              {/* Row data — 6 rows, one per item */}
              {[0, 1, 2, 3, 4, 5].map(i => {
                const fiat = LOCAL_FIAT[i];
                const comm = COMMODITIES[i];
                const cb   = CROSS_BORDER[i];
                return (
                  <View key={i} style={s.archTableRow}>
                    <View style={s.archTableCell}>
                      <Text style={s.archCellFlag}>{fiat.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.archCellCode, { color: fiat.color }]}>{fiat.code}</Text>
                        <Text style={s.archCellSub} numberOfLines={1}>{fiat.usdRate >= 100 ? fiat.usdRate.toLocaleString('en-US', { maximumFractionDigits: 0 }) : fiat.usdRate.toFixed(1)}/USD</Text>
                      </View>
                    </View>
                    <View style={[s.archTableCell, { borderLeftWidth: 1, borderLeftColor: Colors.border }]}>
                      <Text style={{ fontSize: 14 }}>{comm.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.archCellCode, { color: comm.color }]}>{comm.code}</Text>
                        <Text style={s.archCellSub} numberOfLines={1}>${comm.code === 'XAU' ? goldPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 }) : comm.baseUSD.toLocaleString()}{comm.unit}</Text>
                      </View>
                    </View>
                    <View style={[s.archTableCell, { borderLeftWidth: 1, borderLeftColor: Colors.border }]}>
                      <Text style={{ fontSize: 14 }}>{cb.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.archCellCode, { color: cb.color }]}>{cb.code}</Text>
                        <View style={[s.archCellTypePill, { backgroundColor: cb.color + '18', borderColor: cb.color + '44' }]}>
                          <Text style={[s.archCellTypePillText, { color: cb.color }]}>{cb.type}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* FX Calculator */}
            <View style={s.fxCard}>
              <View style={s.fxCardHeader}>
                <MaterialIcons name="calculate" size={16} color={Colors.primary} />
                <Text style={s.fxCardTitle}>BTNG FX Calculator</Text>
                <View style={[s.exchLiveBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                  <MaterialIcons name="check-circle" size={10} color={Colors.success} />
                  <Text style={[s.exchLiveBadgeText, { color: Colors.success }]}>LIVE XAU</Text>
                </View>
              </View>

              {/* From / To selectors */}
              <View style={s.fxRow}>
                <View style={[s.fxSelector, { borderColor: fxFrom.color + '55' }]}>
                  <Text style={s.fxSelectorFlag}>{fxFrom.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.fxSelectorCode, { color: fxFrom.color }]}>{fxFrom.code}</Text>
                    <Text style={s.fxSelectorName} numberOfLines={1}>{fxFrom.region}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={s.fxSwapBtn}
                  onPress={() => { const t = fxFrom; setFxFrom(fxTo); setFxTo(t); }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="swap-horiz" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <View style={[s.fxSelector, { borderColor: fxTo.color + '55' }]}>
                  <Text style={s.fxSelectorFlag}>{fxTo.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.fxSelectorCode, { color: fxTo.color }]}>{fxTo.code}</Text>
                    <Text style={s.fxSelectorName} numberOfLines={1}>{fxTo.region}</Text>
                  </View>
                </View>
              </View>

              {/* Currency picker rows */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.sm }}>
                  {LOCAL_FIAT.map(f => (
                    <TouchableOpacity
                      key={f.code}
                      style={[s.fxCurrencyChip, fxFrom.code === f.code && { backgroundColor: f.color, borderColor: f.color }]}
                      onPress={() => setFxFrom(f)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 12 }}>{f.flag}</Text>
                      <Text style={[s.fxCurrencyChipText, fxFrom.code === f.code && { color: Colors.bg }]}>{f.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Amount & Result */}
              <View style={s.fxAmountRow}>
                <View style={s.fxAmountInput}>
                  <Text style={s.fxAmountLabel}>{fxFrom.code}</Text>
                  <Text style={s.fxAmountValue}>{parseFloat(fxAmount || '0').toLocaleString('en-US')}</Text>
                </View>
                <MaterialIcons name="east" size={18} color={Colors.textMuted} />
                <View style={[s.fxAmountInput, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]}>
                  <Text style={[s.fxAmountLabel, { color: Colors.primary }]}>{fxTo.code}</Text>
                  <Text style={[s.fxAmountValue, { color: Colors.primary }]}>
                    {(parseFloat(fxAmount || '0') * (fxTo.usdRate / fxFrom.usdRate)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              {/* BTNGG equivalent */}
              <View style={s.fxBtngRow}>
                <MaterialIcons name="toll" size={13} color={Colors.primary} />
                <Text style={s.fxBtngText}>
                  {fxAmount} {fxFrom.code} = {(parseFloat(fxAmount || '0') / fxFrom.usdRate / btngPriceUSD).toFixed(4)} BTNGG
                  {' '}· XAU ${goldPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz
                </Text>
              </View>

              {/* Quick amounts */}
              <View style={s.fxQuickRow}>
                {['10', '50', '100', '500', '1000'].map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={[s.fxQuickBtn, fxAmount === amt && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                    onPress={() => setFxAmount(amt)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.fxQuickText, fxAmount === amt && { color: Colors.bg }]}>{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fxRate}>
                1 {fxFrom.code} = {(fxTo.usdRate / fxFrom.usdRate).toFixed(4)} {fxTo.code}
                {'  ·  '}settled via BTNGG bridge
              </Text>
            </View>

            {/* Commodity details */}
            <Text style={s.exchSectionLabel}>COMMODITY VALUATIONS — LIVE XAU ANCHOR</Text>
            {COMMODITIES.map(c => {
              const price  = c.code === 'XAU' ? goldPriceUSD : c.baseUSD;
              const btngEq = (price / btngPriceUSD).toFixed(2);
              return (
                <View key={c.code} style={[s.commCard, { borderColor: c.color + '33' }]}>
                  <View style={[s.commEmoji, { backgroundColor: c.color + '15', borderColor: c.color + '33' }]}>
                    <Text style={{ fontSize: 24 }}>{c.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={s.commNameRow}>
                      <Text style={[s.commName, { color: c.color }]}>{c.name}</Text>
                      <Text style={[s.commPrice, { color: c.color }]}>${price.toLocaleString('en-US')}{c.unit}</Text>
                    </View>
                    <Text style={s.commDesc}>{c.desc}</Text>
                    <View style={s.commMetaRow}>
                      <View style={[s.commBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                        <MaterialIcons name="toll" size={9} color={Colors.primary} />
                        <Text style={[s.commBadgeText, { color: Colors.primary }]}>{btngEq} BTNGG</Text>
                      </View>
                      <View style={[s.commBadge, { backgroundColor: c.color + '10', borderColor: c.color + '33' }]}>
                        <Text style={[s.commBadgeText, { color: c.color }]}>{c.code}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Cross-Border rails */}
            <Text style={s.exchSectionLabel}>CROSS-BORDER RAILS</Text>
            {CROSS_BORDER.map(cb => (
              <View key={cb.code} style={[s.cbCard, { borderColor: cb.color + '33' }]}>
                <View style={[s.cbIconWrap, { backgroundColor: cb.color + '15', borderColor: cb.color + '33' }]}>
                  <Text style={{ fontSize: 22 }}>{cb.emoji}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.cbNameRow}>
                    <Text style={[s.cbName, { color: cb.color }]}>{cb.name}</Text>
                    <View style={[s.cbTypePill, { backgroundColor: cb.color + '18', borderColor: cb.color + '55' }]}>
                      <Text style={[s.cbTypePillText, { color: cb.color }]}>{cb.type}</Text>
                    </View>
                  </View>
                  <Text style={s.cbDesc}>{cb.desc}</Text>
                  <View style={s.cbPegRow}>
                    <MaterialIcons name="link" size={10} color={Colors.textMuted} />
                    <Text style={s.cbPegText}>Pegged to {cb.peg} · BTNG Bridge compatible</Text>
                  </View>
                </View>
              </View>
            ))}

            {/* Engine summary */}
            <View style={s.engineSummary}>
              <MaterialIcons name="account-tree" size={20} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.engineSummaryTitle}>How the Engine Works</Text>
                <Text style={s.engineSummaryText}>
                  BTNG bridges all three rails via a single BTNGG unit of account anchored to XAU spot price.
                  Local fiat can be exchanged to commodities or cross-border stablecoins instantly, with every
                  settlement recorded on the BTNG Sovereign chain across all 54 African Union nations.
                </Text>
                <View style={s.engineFlowRow}>
                  {['Local Fiat', '→', 'BTNGG', '→', 'Commodity / CBDC / Crypto'].map((step, i) => (
                    <Text
                      key={i}
                      style={[
                        s.engineFlowStep,
                        step === '→' ? { color: Colors.textMuted, fontSize: 16 } : { color: Colors.primary },
                      ]}
                    >{step}</Text>
                  ))}
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── GDP TAB ────────────────────────────────────────────────────────────── */}
        {activeTab === 'gdp' && (
          <>
            <View style={s.gdpHeader}>
              <Text style={s.sectionTitle}>54-Nation GDP Breakdown</Text>
              <Text style={s.sectionSub}>Top African economies by GDP contribution to BTNG reserve backing</Text>
            </View>
            {AFRICA_GDP.map(country => (
              <View key={country.name} style={s.gdpCard}>
                <Text style={s.gdpFlag}>{country.flag}</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.gdpNameRow}>
                    <Text style={s.gdpName}>{country.name}</Text>
                    <Text style={s.gdpGdp}>{country.gdp}</Text>
                  </View>
                  <Text style={s.gdpResource}>{country.resource}</Text>
                  <ProgressBar percent={country.share * 3} color={Colors.primary} />
                  <View style={s.gdpMetaRow}>
                    <View style={s.gdpChip}>
                      <MaterialIcons name="people" size={9} color={Colors.textMuted} />
                      <Text style={s.gdpChipText}>{country.pop}</Text>
                    </View>
                    <View style={[s.gdpChip, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                      <Text style={[s.gdpChipText, { color: Colors.primary }]}>{country.share.toFixed(1)}% share</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
            <View style={s.gdpNote}>
              <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
              <Text style={s.gdpNoteText}>
                Showing top 12 of 54 African economies. Total continental GDP: $3.1 Trillion annually.
                Projected to reach $15 Trillion by 2050 (AfDB forecast).
              </Text>
            </View>
          </>
        )}

        {/* ── RESOURCES TAB ─────────────────────────────────────────────────────── */}
        {activeTab === 'resources' && (
          <>
            <View style={s.resourceHero}>
              <Text style={{ fontSize: 40 }}>🏔️</Text>
              <Text style={s.heroTitle}>Natural Resource Wealth</Text>
              <Text style={s.heroSub}>
                Africa's total natural resource endowment — live-valued at today's XAU spot price of
                ${goldPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz
              </Text>
              <View style={[s.heroBadge, { borderColor: statusColor + '44', backgroundColor: statusColor + '18' }]}>
                <LiveDot color={statusColor} />
                <Text style={[s.heroBadgeText, { color: statusColor, marginLeft: 5 }]}>
                  {statusLabel} · XAU ${goldPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </Text>
              </View>
            </View>
            {RESOURCES.map(res => (
              <View key={res.name} style={[s.resourceCard, { borderColor: res.color + '33' }]}>
                <View style={s.resourceHeader}>
                  <Text style={s.resourceEmoji}>{res.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={s.resourceNameRow}>
                      <Text style={[s.resourceName, { color: res.color }]}>{res.name}</Text>
                      <Text style={[s.resourceValue, { color: res.color }]}>{resourceValue(res.percent)}</Text>
                    </View>
                    <ProgressBar percent={res.percent} color={res.color} />
                    <Text style={s.resourceNations} numberOfLines={1}>{res.nations}</Text>
                  </View>
                  <View style={[s.resourcePct, { backgroundColor: res.color + '18', borderColor: res.color + '44' }]}>
                    <Text style={[s.resourcePctText, { color: res.color }]}>{res.percent}%</Text>
                  </View>
                </View>
              </View>
            ))}
            <View style={s.resourceTotal}>
              <MaterialIcons name="account-balance" size={16} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.resourceTotalTitle}>Total Resource Value (Live)</Text>
                <Text style={s.resourceTotalValue}>{liveReserveLabel} USD</Text>
                <Text style={[s.resourceTotalTitle, { marginTop: 2 }]}>
                  XAU/USD: ${goldPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {statusLabel}
                </Text>
              </View>
              <View style={s.chip}><Text style={s.chipText}>BTNG Backing</Text></View>
            </View>
          </>
        )}

        {/* ── BTNG BACKING TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'backing' && (
          <>
            <View style={s.backingHero}>
              <Text style={{ fontSize: 48 }}>🔐</Text>
              <Text style={s.heroTitle}>BTNG Sovereign Backing</Text>
              <Text style={s.heroSub}>
                Every BTNGG token is backed by Africa's gold, GDP, and natural wealth — live-priced at
                XAU ${goldPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/oz and verified on the BTNG blockchain.
              </Text>
            </View>

            {[
              { label: 'Total Reserve Value (Live)', value: `${liveReserveLabel} USD`,     color: Colors.primary,   icon: 'account-balance', live: true  },
              { label: 'XAU Spot Price',             value: `$${goldPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / troy oz`, color: Colors.warning,  icon: 'toll',            live: true  },
              { label: '24h Gold Change',            value: `${gold.changePct24h >= 0 ? '+' : ''}${gold.changePct24h.toFixed(4)}%  ($${Math.abs(gold.change24h).toFixed(2)})`, color: gold.changePct24h >= 0 ? Colors.success : Colors.error, icon: gold.changePct24h >= 0 ? 'trending-up' : 'trending-down', live: true },
              { label: '1 BTNGG Price',              value: `$${btngPriceUSD.toFixed(6)} USD`, color: '#3B82F6',    icon: 'monetization-on', live: true  },
              { label: 'Backing Ratio (Live)',       value: `${backingRatio}:1`,              color: Colors.success, icon: 'verified',        live: true  },
              { label: 'Gold Oz Reserve',            value: '6,570,000,000 troy oz',          color: Colors.warning, icon: 'toll',            live: false },
              { label: 'BTNGG Total Supply',         value: '204.2 Billion tokens',           color: '#3B82F6',     icon: 'monetization-on', live: false },
              { label: 'Nations Backing BTNG',       value: '54 Nations',                     color: '#22C55E',     icon: 'public',          live: false },
              { label: 'Genesis Date',               value: 'Feb 18, 2026',                   color: Colors.textSecondary, icon: 'event',   live: false },
              { label: 'BTNG Market Cap',            value: `$${btngMarketCapT}T USD`,         color: Colors.primary, icon: 'bar-chart',      live: true  },
            ].map(item => (
              <View key={item.label} style={[s.backingCard, { borderColor: item.color + '33' }]}>
                <View style={[s.backingIconWrap, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                  <MaterialIcons name={item.icon as any} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.backingLabel}>{item.label}</Text>
                    {item.live && <LiveDot color={statusColor} />}
                  </View>
                  <Text style={[s.backingValue, { color: item.color }]}>{item.value}</Text>
                </View>
              </View>
            ))}

            <View style={s.howCard}>
              <Text style={s.howTitle}>How the Backing Works</Text>
              {[
                { step: '1', text: 'Bank of Ghana holds physical gold in Accra vault — audited quarterly by independent auditors.' },
                { step: '2', text: `BTNG Genesis smart contract pegs 1 BTNGG = 1/1000 troy oz XAU. At $${goldPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz, 1 BTNGG = $${btngPriceUSD.toFixed(4)}.` },
                { step: '3', text: 'African Union nations ratify the continental reserve as collateral for BTNG sovereign bonds.' },
                { step: '4', text: 'Citizens can verify reserve holdings via the /btng-reserve-status API endpoint at any time.' },
                { step: '5', text: 'Annual audit by Big-4 partner firm confirms gold purity, weight, and reserve ratio compliance.' },
              ].map(item => (
                <View key={item.step} style={s.howRow}>
                  <View style={s.howStepBadge}><Text style={s.howStepText}>{item.step}</Text></View>
                  <Text style={s.howRowText}>{item.text}</Text>
                </View>
              ))}
            </View>

            <View style={s.sovereignCard}>
              <MaterialIcons name="verified" size={20} color={Colors.success} />
              <Text style={s.sovereignText}>
                BTNG is the first fully African-sovereign digital currency — not owned by any foreign government,
                bank, or corporation. It belongs to the 54 nations and their 1.4 billion people.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:  { alignItems: 'center' },
  topTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Live Ticker Bar
  tickerBar:         { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: Spacing.xl, marginBottom: Spacing.xs, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1.5, flexWrap: 'wrap' },
  tickerStatusPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tickerStatusText:  { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 1, includeFontPadding: false },
  tickerPriceWrap:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tickerSymbol:      { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  tickerPrice:       { fontSize: 18, fontWeight: FontWeight.heavy, includeFontPadding: false },
  tickerCountdown:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tickerCountdownText: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tickerRefreshBtn:  { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  changePill:        { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  changeText:        { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  sourcePill:        { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  sourceText:        { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  feedTime:          { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // BTNGG row
  btngRow:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '44', overflow: 'hidden' },
  btngItem:       { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  btngDivider:    { width: 1, height: '70%', backgroundColor: Colors.border },
  btngItemLabel:  { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  btngItemValue:  { fontSize: 12, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },

  // Tab Bar (5 tabs — tighter)
  tabBar:        { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, gap: 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  tabBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: Spacing.sm - 1, borderRadius: Radius.md },
  tabBtnActive:  { backgroundColor: Colors.primary },
  tabText:       { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scroll:        { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Shared
  hero:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  heroTitle:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:      { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  heroBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge:    { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  heroBadgeText:{ fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },

  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard:     { width: '31%', flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 3 },
  statValue:    { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  statSub:      { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  connectionCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  connectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  connectionTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  connectionText:   { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  connectionChips:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip:             { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  chipText:         { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },

  // ── Exchange / Pan-African Value Engine ───────────────────────────────────
  exchHeader:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  exchHeaderIconWrap: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  exchTitle:          { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  exchSub:            { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  exchLiveBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, flexShrink: 0 },
  exchLiveBadgeText:  { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  exchSectionLabel:   { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.4, includeFontPadding: false, paddingHorizontal: 2 },

  // Architecture table
  archTable:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  archTableHeader:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgElevated },
  archTableHeaderCell:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm + 2, borderTopWidth: 3 },
  archTableHeaderText:{ fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  archTableRow:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  archTableCell:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  archCellFlag:       { fontSize: 16, width: 22, textAlign: 'center' },
  archCellCode:       { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  archCellSub:        { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  archCellTypePill:   { borderRadius: Radius.sm, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, alignSelf: 'flex-start', marginTop: 2 },
  archCellTypePillText: { fontSize: 7, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // FX Calculator
  fxCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.md },
  fxCardHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fxCardTitle:     { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  fxRow:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fxSelector:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.sm + 2 },
  fxSelectorFlag:  { fontSize: 22 },
  fxSelectorCode:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  fxSelectorName:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  fxSwapBtn:       { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fxCurrencyChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  fxCurrencyChipText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  fxAmountRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fxAmountInput:   { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, gap: 3 },
  fxAmountLabel:   { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  fxAmountValue:   { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  fxBtngRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '44' },
  fxBtngText:      { flex: 1, fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  fxQuickRow:      { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  fxQuickBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  fxQuickText:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  fxRate:          { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Commodity cards
  commCard:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  commEmoji:     { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  commNameRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commName:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  commPrice:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  commDesc:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  commMetaRow:   { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginTop: 2 },
  commBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  commBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Cross-border cards
  cbCard:          { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  cbIconWrap:      { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cbNameRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cbName:          { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false, flex: 1 },
  cbTypePill:      { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  cbTypePillText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  cbDesc:          { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  cbPegRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cbPegText:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Engine summary
  engineSummary:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.lg },
  engineSummaryTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, marginBottom: 6 },
  engineSummaryText:  { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },
  engineFlowRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginTop: Spacing.md },
  engineFlowStep:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },

  // GDP
  gdpHeader:    { gap: 4 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionSub:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  gdpCard:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  gdpFlag:      { fontSize: 26, width: 34, textAlign: 'center' },
  gdpNameRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gdpName:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  gdpGdp:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  gdpResource:  { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  gdpMetaRow:   { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginTop: 2 },
  gdpChip:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  gdpChipText:  { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  gdpNote:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  gdpNoteText:  { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },

  // Resources
  resourceHero:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  resourceCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1 },
  resourceHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  resourceEmoji:      { fontSize: 32, width: 40, textAlign: 'center' },
  resourceNameRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resourceName:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  resourceValue:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  resourceNations:    { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4, includeFontPadding: false },
  resourcePct:        { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resourcePctText:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  resourceTotal:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  resourceTotalTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  resourceTotalValue: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  // Backing
  backingHero:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  backingCard:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1 },
  backingIconWrap: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  backingLabel:    { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  backingValue:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold, includeFontPadding: false },

  howCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  howTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  howRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  howStepBadge:  { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  howStepText:   { fontSize: 12, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  howRowText:    { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },

  sovereignCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.success + '44' },
  sovereignText: { flex: 1, fontSize: FontSize.sm, color: Colors.success, lineHeight: 20, fontStyle: 'italic', fontWeight: FontWeight.semibold, includeFontPadding: false },
});
