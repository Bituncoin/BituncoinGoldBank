// Africa Free Trade Zone — AfCFTA Mobile Banking Platform
// First Africa mobile-first free trade zone powered by BTNG Gold Coin
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { AFRICAN_CURRENCIES, AfricanCurrency } from '@/constants/africanCurrencies';
import { useGoldOracle } from '@/hooks/useGoldOracle';

// ── Dashboard helpers ─────────────────────────────────────────────────────────
const CORRIDOR_BASE = [
  { id: 'gh-ng', from: '🇬🇭', to: '🇳🇬', label: 'Ghana → Nigeria',    base: 4200, color: '#22C55E',      sector: 'Agriculture'     },
  { id: 'za-zm', from: '🇿🇦', to: '🇿🇲', label: 'S.Africa → Zambia', base: 3600, color: Colors.primary, sector: 'Mining'          },
  { id: 'ke-tz', from: '🇰🇪', to: '🇹🇿', label: 'Kenya → Tanzania',  base: 2800, color: '#3B82F6',      sector: 'Manufacturing'   },
  { id: 'eg-et', from: '🇪🇬', to: '🇪🇹', label: 'Egypt → Ethiopia',  base: 1900, color: '#9945FF',      sector: 'Technology'      },
  { id: 'sn-ma', from: '🇸🇳', to: '🇲🇦', label: 'Senegal → Morocco', base: 1400, color: '#F59E0B',      sector: 'Services'        },
  { id: 'gh-ke', from: '🇬🇭', to: '🇰🇪', label: 'Ghana → Kenya',     base:  900, color: '#D4A017',      sector: 'FinTech & BTNG'  },
];
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS_24  = Array.from({ length: 12 }, (_, i) => `${(i * 2).toString().padStart(2, '0')}h`);

function randFluc(base: number, pct = 0.04): number {
  return Math.round(base * (1 + (Math.random() - 0.49) * pct));
}
function fmtMillions(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}B`;
  return `$${v.toFixed(0)}M`;
}
function fmtBTNG(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000)      return `${(v / 1000).toFixed(1)}K`;
  return `${v.toFixed(0)}`;
}

// ── Dashboard state types ─────────────────────────────────────────────────────
interface CorridorLive {
  id: string; from: string; to: string; label: string; color: string; sector: string;
  volToday: number; txCount: number; btngVol: number;
  changeSign: 1 | -1; changePct: number; spark: number[];
}
interface DashboardState {
  totalVol: number; totalTx: number; totalBtng: number; activePairs: number;
  weekData: number[]; hourData: number[]; corridors: CorridorLive[]; tick: number;
}

function buildInitialDash(): DashboardState {
  const corridors: CorridorLive[] = CORRIDOR_BASE.map(c => ({
    id: c.id, from: c.from, to: c.to, label: c.label, color: c.color, sector: c.sector,
    volToday:   c.base * (0.8 + Math.random() * 0.4),
    txCount:    Math.round(c.base * (200 + Math.random() * 100)),
    btngVol:    Math.round(c.base * 1000 * (0.9 + Math.random() * 0.2)),
    changeSign: Math.random() > 0.3 ? 1 : -1 as 1 | -1,
    changePct:  parseFloat((Math.random() * 4.5 + 0.2).toFixed(2)),
    spark:      Array.from({ length: 7 }, () => randFluc(c.base / 100, 0.12)),
  }));
  const totalVol  = corridors.reduce((a, c) => a + c.volToday, 0);
  const totalTx   = corridors.reduce((a, c) => a + c.txCount, 0);
  const totalBtng = corridors.reduce((a, c) => a + c.btngVol, 0);
  return {
    totalVol, totalTx, totalBtng, activePairs: 6, tick: 0,
    weekData: Array.from({ length: 7 }, (_, i) => randFluc(totalVol * (0.7 + i * 0.04), 0.08)),
    hourData: Array.from({ length: 12 }, (_, i) => {
      const peak = i >= 4 && i <= 8;
      return randFluc(totalVol / 12 * (peak ? 1.4 : 0.8), 0.15);
    }),
    corridors,
  };
}
function tickDash(prev: DashboardState): DashboardState {
  const corridors = prev.corridors.map(c => {
    const delta = randFluc(c.volToday, 0.025) - c.volToday;
    return {
      ...c,
      volToday:   Math.max(c.volToday + delta, 10),
      txCount:    c.txCount + Math.round(Math.random() * 150),
      btngVol:    c.btngVol + Math.round(Math.random() * 3000),
      changeSign: delta >= 0 ? 1 : -1 as 1 | -1,
      changePct:  parseFloat((Math.random() * 4.5 + 0.1).toFixed(2)),
      spark:      [...c.spark.slice(1), randFluc(c.spark[c.spark.length - 1], 0.08)],
    };
  });
  const totalVol  = corridors.reduce((a, c) => a + c.volToday, 0);
  const totalTx   = corridors.reduce((a, c) => a + c.txCount, 0);
  const totalBtng = corridors.reduce((a, c) => a + c.btngVol, 0);
  return {
    ...prev, corridors, totalVol, totalTx, totalBtng, tick: prev.tick + 1,
    hourData: [...prev.hourData.slice(0, 11), randFluc(prev.hourData[11], 0.06)],
    weekData: [...prev.weekData.slice(0, 6),  randFluc(prev.weekData[6],  0.04)],
  };
}

// ── AfCFTA Data ────────────────────────────────────────────────────────────────
const AFCFTA_STATS = {
  nations: 54,
  population: '1.4B',
  combinedGDP: '$3.1T',
  projectedGDP2030: '$6.7T',
  tradeVolume: '$595B',
  intraAfricanTrade: '17%',
  targetIntraAfrica: '52%',
  totalMarketSize: '$3.4T',
  establishment: 'January 1, 2021',
  secretariat: 'Accra, Ghana',
  memberStates: 54,
};

const TRADE_CORRIDORS = [
  { from: { flag: '🇬🇭', country: 'Ghana',        region: 'West Africa',     currency: 'GHS' }, to: { flag: '🇳🇬', country: 'Nigeria',      region: 'West Africa',     currency: 'NGN' }, volume: '$4.2B', growth: '+18.4%', sector: 'Agriculture & Cocoa',  color: '#22C55E',      active: true },
  { from: { flag: '🇰🇪', country: 'Kenya',         region: 'East Africa',     currency: 'KES' }, to: { flag: '🇹🇿', country: 'Tanzania',     region: 'East Africa',     currency: 'TZS' }, volume: '$2.8B', growth: '+12.1%', sector: 'Manufactured Goods',   color: '#3B82F6',      active: true },
  { from: { flag: '🇿🇦', country: 'South Africa',  region: 'Southern Africa', currency: 'ZAR' }, to: { flag: '🇿🇲', country: 'Zambia',       region: 'Southern Africa', currency: 'ZMW' }, volume: '$3.6B', growth: '+9.7%',  sector: 'Mining & Energy',      color: Colors.primary, active: true },
  { from: { flag: '🇪🇬', country: 'Egypt',         region: 'North Africa',    currency: 'EGP' }, to: { flag: '🇪🇹', country: 'Ethiopia',     region: 'East Africa',     currency: 'ETB' }, volume: '$1.9B', growth: '+22.3%', sector: 'Technology & Finance', color: '#9945FF',      active: true },
  { from: { flag: '🇸🇳', country: 'Senegal',       region: 'West Africa',     currency: 'XOF' }, to: { flag: '🇲🇦', country: 'Morocco',      region: 'North Africa',    currency: 'MAD' }, volume: '$1.4B', growth: '+15.6%', sector: 'Tourism & Services',   color: '#F59E0B',      active: true },
  { from: { flag: '🇬🇭', country: 'Ghana',         region: 'West Africa',     currency: 'GHS' }, to: { flag: '🇰🇪', country: 'Kenya',        region: 'East Africa',     currency: 'KES' }, volume: '$0.9B', growth: '+28.5%', sector: 'FinTech & BTNG',       color: Colors.primary, active: true },
];

const SECTORS = [
  { emoji: '🌾', name: 'Agriculture', value: '$248B', growth: '+14%', nations: 54, color: '#22C55E', desc: 'Cocoa, coffee, cashew, palm oil, grain' },
  { emoji: '⛏️', name: 'Mining', value: '$312B', growth: '+8%', nations: 38, color: Colors.primary, desc: 'Gold, diamonds, lithium, copper, coltan' },
  { emoji: '🏭', name: 'Manufacturing', value: '$187B', growth: '+19%', nations: 42, color: '#3B82F6', desc: 'Textiles, steel, cement, automobiles' },
  { emoji: '💻', name: 'Technology', value: '$94B', growth: '+34%', nations: 29, color: '#9945FF', desc: 'FinTech, mobile money, AI, software' },
  { emoji: '🏥', name: 'Healthcare', value: '$68B', growth: '+22%', nations: 54, color: '#EF4444', desc: 'Pharmaceuticals, medical devices, research' },
  { emoji: '⚡', name: 'Energy', value: '$156B', growth: '+11%', nations: 47, color: '#F59E0B', desc: 'Solar, oil, gas, hydroelectric, wind' },
  { emoji: '🚢', name: 'Logistics', value: '$82B', growth: '+16%', nations: 54, color: '#64748B', desc: 'Shipping, ports, aviation, rail, road' },
  { emoji: '🏦', name: 'Finance & BTNG', value: '$134B', growth: '+41%', nations: 54, color: Colors.primary, desc: 'Banking, BTNG Gold, crypto, insurance' },
];

const FEATURED_NATIONS = [
  { flag: '🇬🇭', name: 'Ghana',        role: 'AfCFTA Host',      currency: 'GHS', gdp: '$74B',  exports: 'Gold, Cocoa, Oil',         tier: 'Founding' },
  { flag: '🇳🇬', name: 'Nigeria',      role: 'Largest Economy',  currency: 'NGN', gdp: '$477B', exports: 'Oil, Gas, Agriculture',     tier: 'Tier 1' },
  { flag: '🇿🇦', name: 'South Africa', role: 'Industrial Hub',   currency: 'ZAR', gdp: '$380B', exports: 'Mining, Autos, Finance',    tier: 'Tier 1' },
  { flag: '🇰🇪', name: 'Kenya',        role: 'Tech Leader',      currency: 'KES', gdp: '$118B', exports: 'Tea, Coffee, FinTech',       tier: 'Tier 1' },
  { flag: '🇪🇬', name: 'Egypt',        role: 'North Gateway',    currency: 'EGP', gdp: '$476B', exports: 'Tourism, Suez, Oil',         tier: 'Tier 1' },
  { flag: '🇪🇹', name: 'Ethiopia',     role: 'Fastest Growing',  currency: 'ETB', gdp: '$156B', exports: 'Coffee, Gold, Flowers',      tier: 'Tier 2' },
];

const BTNG_FEATURES = [
  { icon: 'flash-on',     title: 'Instant Settlement', desc: 'Cross-border payments settle in seconds via BTNG blockchain',     color: Colors.primary },
  { icon: 'lock',         title: 'Zero FX Risk',       desc: 'BTNG is gold-backed — stable store of value across all 54 nations', color: '#22C55E' },
  { icon: 'attach-money', title: 'Near-Zero Fees',     desc: '0.1% transaction fee vs 8-15% traditional cross-border transfer',  color: '#F59E0B' },
  { icon: 'people',       title: 'Unbanked Access',    desc: '350M+ unbanked Africans get instant BTNG wallet via mobile',        color: '#3B82F6' },
  { icon: 'verified',     title: 'Sovereign Backed',   desc: 'Bank of Ghana gold vault + 54-nation AU sovereign guarantee',       color: '#9945FF' },
  { icon: 'public',       title: 'Pan-African',        desc: 'One currency, one wallet, 54 nations — true economic unity',        color: Colors.primary },
];

// ── Animated Counter ──────────────────────────────────────────────────────────
function AnimCounter({ value, color, size = FontSize.xl }: { value: string; color: string; size?: number }) {
  const anim = useRef(new Animated.Value(1)).current;
  const prevVal = useRef(value);
  useEffect(() => {
    if (prevVal.current !== value) {
      prevVal.current = value;
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.18, duration: 160, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(anim, { toValue: 1,    duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [value, anim]);
  return (
    <Animated.Text style={{
      fontSize: size, fontWeight: FontWeight.heavy as any,
      color, includeFontPadding: false,
      transform: [{ scale: anim }],
    }}>
      {value}
    </Animated.Text>
  );
}

// ── Mini Sparkline Bar ────────────────────────────────────────────────────────
function MiniBar({ values, color, height = 24 }: { values: number[]; color: string; height?: number }) {
  const max = Math.max(...values, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1.5, height }}>
      {values.map((v, i) => (
        <View key={i} style={{
          flex: 1,
          height: Math.max(3, (v / max) * height),
          backgroundColor: i === values.length - 1 ? color : color + '55',
          borderRadius: 2,
        }} />
      ))}
    </View>
  );
}

// ── 7-Day Bar Chart ────────────────────────────────────────────────────────────
function WeekChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const H = 60;
  return (
    <View style={{ height: H + 20, marginTop: 4 }}>
      {[0, 0.33, 0.66, 1].map((pct, i) => (
        <View key={i} style={{
          position: 'absolute', left: 0, right: 0, top: H * pct,
          height: 1, backgroundColor: Colors.border + '55',
        }} />
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', position: 'absolute', bottom: 20, left: 0, right: 0, height: H, gap: 3 }}>
        {data.map((v, i) => {
          const barH = Math.max(4, ((v - min) / range) * (H - 6) + 4);
          const isToday = i === data.length - 1;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: H }}>
              <View style={{
                width: '72%', height: barH,
                backgroundColor: isToday ? color : color + '44',
                borderRadius: 3,
              }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        {WEEK_DAYS.map((d, i) => (
          <View key={d} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{
              fontSize: 8,
              color: i === 6 ? color : Colors.textMuted,
              fontWeight: i === 6 ? FontWeight.heavy : FontWeight.regular,
              includeFontPadding: false,
            }}>
              {d}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Pulse Dot ──────────────────────────────────────────────────────────────────
function PulseDot({ color = Colors.success, size = 8 }: { color?: string; size?: number }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 2, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [a]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: size + 4, height: size + 4,
        borderRadius: (size + 4) / 2, backgroundColor: color,
        opacity: 0.25, transform: [{ scale: a }],
      }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────────
function SCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[scard.wrap, style]}>{children}</View>;
}
const scard = StyleSheet.create({
  wrap: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
});

// ── Stat Chip ─────────────────────────────────────────────────────────────────
function StatChip({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={[schip.wrap, { borderColor: color + '33' }]}>
      <View style={[schip.icon, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[schip.value, { color }]}>{value}</Text>
      <Text style={schip.label}>{label}</Text>
    </View>
  );
}
const schip = StyleSheet.create({
  wrap:  { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 5, minWidth: 80 },
  icon:  { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  label: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'overview' | 'corridors' | 'trade' | 'nations';

export default function AfricaFreeTradeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const gold = useGoldOracle();

  const [tab, setTab] = useState<Tab>('dashboard');
  const [tradeSending, setTradeSending] = useState(false);

  // ── Live Dashboard State ──────────────────────────────────────────────────
  const [dash, setDash] = useState<DashboardState>(() => buildInitialDash());
  const dashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef   = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    dashTimerRef.current = setInterval(() => {
      if (mountedRef.current) setDash(prev => tickDash(prev));
    }, 5000);
    return () => {
      mountedRef.current = false;
      if (dashTimerRef.current) clearInterval(dashTimerRef.current);
    };
  }, []);

  // Trade calculator state
  const [tradeFromIdx, setTradeFromIdx] = useState(0);
  const [tradeToIdx, setTradeToIdx]     = useState(36);
  const [tradeAmt, setTradeAmt]         = useState('100');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker]     = useState(false);
  const [search, setSearch]             = useState('');

  const btngPrice  = gold.priceUSD > 0 ? gold.priceUSD / 1000 : 3.32;
  const fromCurrency = AFRICAN_CURRENCIES[tradeFromIdx];
  const toCurrency   = AFRICAN_CURRENCIES[tradeToIdx];
  const parseAmt     = parseFloat(tradeAmt) || 0;
  const amtInUSD     = parseAmt / fromCurrency.usdRate;
  const btngNeeded   = amtInUSD / btngPrice;
  const amtReceived  = amtInUSD * toCurrency.usdRate;
  const feeLocal     = (amtInUSD * 0.001) * fromCurrency.usdRate;

  const filteredCurrencies = AFRICAN_CURRENCIES.filter(c =>
    c.country.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleExecuteTrade = useCallback(async () => {
    if (!parseAmt || parseAmt <= 0) { showAlert('Invalid Amount', 'Enter a valid amount to trade.'); return; }
    setTradeSending(true);
    await new Promise(r => setTimeout(r, 2200));
    setTradeSending(false);
    showAlert('Trade Executed', `Successfully sent ${fromCurrency.symbol}${parseAmt.toLocaleString()} (${fromCurrency.country}) to ${toCurrency.symbol}${amtReceived.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${toCurrency.country}) via BTNG bridge. TX settled in 3.2 seconds.`);
  }, [parseAmt, fromCurrency, toCurrency, amtReceived, showAlert]);

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'dashboard', icon: 'dashboard',  label: 'Dashboard' },
    { key: 'overview',  icon: 'public',     label: 'Overview'  },
    { key: 'corridors', icon: 'alt-route',  label: 'Corridors' },
    { key: 'trade',     icon: 'swap-horiz', label: 'Trade'     },
    { key: 'nations',   icon: 'flag',       label: 'Nations'   },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Top Bar ───────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Africa Free Trade Zone</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <PulseDot color={Colors.success} />
            <Text style={s.topSub}>AfCFTA · {AFCFTA_STATS.nations} Nations · BTNG Powered</Text>
          </View>
        </View>
        <View style={s.afcftaBadge}>
          <Text style={s.afcftaBadgeText}>LIVE</Text>
        </View>
      </View>

      {/* ── Price Strip ───────────────────────────────────────────── */}
      <View style={s.priceStrip}>
        {[
          { label: 'XAU/oz',    value: `$${gold.priceUSD > 0 ? gold.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '3,326'}` },
          { label: '1 BTNGG',   value: `$${btngPrice.toFixed(4)}` },
          { label: 'Trade Vol', value: fmtMillions(dash.totalVol) },
          { label: 'Nations',   value: '54 🌍' },
        ].map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <View style={s.priceDivider} />}
            <View style={s.priceItem}>
              <Text style={s.priceLabel}>{item.label}</Text>
              <Text style={[s.priceValue, { color: Colors.primary }]}>{item.value}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* ── Tab Bar ───────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabBarContent}
        style={s.tabBarScroll}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabActive]} onPress={() => setTab(t.key)}>
            <MaterialIcons name={t.icon as any} size={12} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ════════════════════════════════════════════════════════════
            DASHBOARD TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'dashboard' && (
          <>
            {/* Hero Total Volume */}
            <View style={ds.hero}>
              <View style={ds.heroTopRow}>
                <View style={ds.heroPill}>
                  <PulseDot color="#22C55E" size={6} />
                  <Text style={ds.heroPillText}>LIVE INTRA-AFRICAN TRADE DASHBOARD</Text>
                </View>
                <View style={ds.tickBadge}>
                  <Text style={ds.tickBadgeText}>⟳ 5s</Text>
                </View>
              </View>
              <Text style={ds.heroLabel}>Today's Total Volume</Text>
              <AnimCounter value={fmtMillions(dash.totalVol)} color={Colors.primary} size={38} />
              <Text style={ds.heroSub}>via BTNG Gold Bridge · AfCFTA 54 Nations</Text>
              <View style={ds.heroStatRow}>
                {[
                  { label: 'Transactions', value: dash.totalTx.toLocaleString(), color: '#3B82F6' },
                  { label: 'BTNG Settled', value: fmtBTNG(dash.totalBtng),       color: Colors.primary },
                  { label: 'Corridors',    value: `${dash.activePairs}`,          color: '#22C55E' },
                ].map((item, i) => (
                  <React.Fragment key={item.label}>
                    {i > 0 && <View style={ds.heroStatDivider} />}
                    <View style={ds.heroStat}>
                      <AnimCounter value={item.value} color={item.color} size={FontSize.lg} />
                      <Text style={ds.heroStatLabel}>{item.label}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>

            {/* 7-Day Chart */}
            <View style={ds.card}>
              <View style={ds.cardHeader}>
                <View style={[ds.cardIcon, { backgroundColor: Colors.primary + '18', borderColor: Colors.primary + '44' }]}>
                  <MaterialIcons name="bar-chart" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ds.cardTitle}>7-Day Trade Volume</Text>
                  <Text style={ds.cardSub}>Intra-African BTNG settlements (Mon–Sun)</Text>
                </View>
                <View style={ds.livePill}>
                  <PulseDot color="#22C55E" size={5} />
                  <Text style={ds.livePillText}>TODAY</Text>
                </View>
              </View>
              <WeekChart data={dash.weekData} color={Colors.primary} />
              <View style={ds.chartLegRow}>
                <View style={[ds.chartLegDot, { backgroundColor: Colors.primary }]} />
                <Text style={ds.chartLegText}>Today: </Text>
                <AnimCounter value={fmtMillions(dash.weekData[6])} color={Colors.primary} size={FontSize.sm} />
                <Text style={ds.chartLegText}>  ·  7d avg: </Text>
                <Text style={[ds.chartLegText, { color: Colors.textPrimary, fontWeight: FontWeight.bold }]}>
                  {fmtMillions(dash.weekData.reduce((a, b) => a + b, 0) / 7)}
                </Text>
              </View>
            </View>

            {/* Hourly Volume Bars */}
            <View style={ds.card}>
              <View style={ds.cardHeader}>
                <View style={[ds.cardIcon, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                  <MaterialIcons name="schedule" size={18} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ds.cardTitle}>Today's Hourly Volume</Text>
                  <Text style={ds.cardSub}>24h breakdown in 2-hour buckets</Text>
                </View>
              </View>
              <View style={{ gap: 5, marginTop: 2 }}>
                {dash.hourData.map((v, i) => {
                  const max = Math.max(...dash.hourData, 1);
                  const pct = Math.max(4, (v / max) * 100);
                  const isCurrent = i === 11;
                  return (
                    <View key={i} style={ds.hourRow}>
                      <Text style={ds.hourLabel}>{HOURS_24[i]}</Text>
                      <View style={ds.hourTrack}>
                        <View style={[ds.hourFill, {
                          width: `${pct}%` as any,
                          backgroundColor: isCurrent ? '#3B82F6' : '#3B82F655',
                        }]} />
                      </View>
                      <Text style={[ds.hourVal, isCurrent && { color: '#3B82F6' }]}>{fmtMillions(v)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Live Corridor Flows */}
            <View style={ds.card}>
              <View style={ds.cardHeader}>
                <View style={[ds.cardIcon, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                  <MaterialIcons name="alt-route" size={18} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ds.cardTitle}>Live Corridor Flows</Text>
                  <Text style={ds.cardSub}>Real-time BTNG bridge activity · 5s updates</Text>
                </View>
                <View style={ds.livePill}>
                  <PulseDot color="#22C55E" size={5} />
                  <Text style={ds.livePillText}>LIVE</Text>
                </View>
              </View>
              {dash.corridors.map((c, i) => (
                <View key={c.id} style={[ds.corridorRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={ds.cFlags}>
                    <Text style={ds.cFlag}>{c.from}</Text>
                    <MaterialIcons name="trending-flat" size={10} color={c.color} />
                    <Text style={ds.cFlag}>{c.to}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <Text style={[ds.cLabel, { color: c.color }]}>{c.label}</Text>
                      <View style={[ds.secBadge, { backgroundColor: c.color + '18', borderColor: c.color + '44' }]}>
                        <Text style={[ds.secBadgeText, { color: c.color }]}>{c.sector}</Text>
                      </View>
                    </View>
                    <Text style={ds.cMeta}>{c.txCount.toLocaleString()} TX · {fmtBTNG(c.btngVol)} BTNGG</Text>
                  </View>
                  <View style={{ width: 50, marginRight: 6 }}>
                    <MiniBar values={c.spark} color={c.color} height={22} />
                  </View>
                  <View style={ds.cVolWrap}>
                    <AnimCounter value={fmtMillions(c.volToday)} color={c.color} size={FontSize.sm} />
                    <View style={[ds.changeChip, {
                      backgroundColor: (c.changeSign === 1 ? '#22C55E' : Colors.error) + '18',
                      borderColor:     (c.changeSign === 1 ? '#22C55E' : Colors.error) + '44',
                    }]}>
                      <MaterialIcons
                        name={c.changeSign === 1 ? 'arrow-drop-up' : 'arrow-drop-down'}
                        size={12}
                        color={c.changeSign === 1 ? '#22C55E' : Colors.error}
                      />
                      <Text style={[ds.changeChipText, { color: c.changeSign === 1 ? '#22C55E' : Colors.error }]}>
                        {c.changePct}%
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Sector Volume Bars */}
            <View style={ds.card}>
              <View style={ds.cardHeader}>
                <View style={[ds.cardIcon, { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '44' }]}>
                  <MaterialIcons name="pie-chart" size={18} color={Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ds.cardTitle}>Volume by Sector</Text>
                  <Text style={ds.cardSub}>Today's distribution across trade sectors</Text>
                </View>
              </View>
              {[
                { name: 'Agriculture',         pct: 28, color: '#22C55E',      vol: dash.totalVol * 0.28 },
                { name: 'Mining & Energy',      pct: 22, color: Colors.primary, vol: dash.totalVol * 0.22 },
                { name: 'Manufacturing',        pct: 18, color: '#3B82F6',      vol: dash.totalVol * 0.18 },
                { name: 'Technology & FinTech', pct: 14, color: '#9945FF',      vol: dash.totalVol * 0.14 },
                { name: 'Services & Tourism',   pct: 11, color: '#F59E0B',      vol: dash.totalVol * 0.11 },
                { name: 'BTNG & Finance',       pct:  7, color: '#D4A017',      vol: dash.totalVol * 0.07 },
              ].map(sec => (
                <View key={sec.name} style={ds.secBarRow}>
                  <Text style={ds.secBarLabel}>{sec.name}</Text>
                  <View style={ds.secBarTrack}>
                    <View style={[ds.secBarFill, { width: `${sec.pct}%` as any, backgroundColor: sec.color }]} />
                  </View>
                  <View style={ds.secBarRight}>
                    <Text style={[ds.secBarPct, { color: sec.color }]}>{sec.pct}%</Text>
                    <Text style={ds.secBarVol}>{fmtMillions(sec.vol)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Live Metrics Grid */}
            <View style={[ds.card, { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }]}>
              {[
                { icon: 'bolt',         label: 'Avg Settlement', value: '2.8s',                                                                 color: Colors.primary },
                { icon: 'attach-money', label: 'Avg Fee',        value: '0.1%',                                                                 color: '#22C55E'      },
                { icon: 'people',       label: 'Active Traders', value: (12400 + dash.tick * 3).toLocaleString(),                                color: '#3B82F6'      },
                { icon: 'swap-horiz',   label: 'TX / Min',       value: (185 + Math.round(dash.tick % 10 * 3.2)).toLocaleString(),               color: '#9945FF'      },
              ].map(m => (
                <View key={m.label} style={[ds.metricCell, { borderColor: m.color + '33' }]}>
                  <View style={[ds.metricIcon, { backgroundColor: m.color + '18', borderColor: m.color + '44' }]}>
                    <MaterialIcons name={m.icon as any} size={15} color={m.color} />
                  </View>
                  <AnimCounter value={m.value} color={m.color} size={FontSize.md} />
                  <Text style={ds.metricLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
            OVERVIEW TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <>
            <View style={s.heroBanner}>
              <View style={s.heroTextWrap}>
                <View style={s.heroLivePill}>
                  <PulseDot color={Colors.success} />
                  <Text style={s.heroLiveText}>WORLD'S LARGEST FREE TRADE AREA</Text>
                </View>
                <Text style={s.heroTitle}>Africa Continental Free Trade Area</Text>
                <Text style={s.heroSub}>
                  The AfCFTA unites all 54 African nations into a single market of 1.4 billion
                  people with a combined GDP of $3.1 Trillion — now powered by BTNG Gold Coin
                  for instant, low-cost, gold-backed trade settlements.
                </Text>
                <View style={s.heroBadgeRow}>
                  <View style={s.heroBadge}><Text style={s.heroBadgeText}>📍 Secretariat: Accra, Ghana</Text></View>
                  <View style={[s.heroBadge, { borderColor: '#22C55E44', backgroundColor: '#22C55E18' }]}><Text style={[s.heroBadgeText, { color: '#22C55E' }]}>🚀 Since Jan 2021</Text></View>
                </View>
              </View>
            </View>
            <View style={s.statsGrid}>
              <StatChip icon="public"      label="Nations"    value="54"     color={Colors.primary} />
              <StatChip icon="people"      label="Population" value="1.4B"   color="#3B82F6" />
              <StatChip icon="bar-chart"   label="GDP"        value="$3.1T"  color="#22C55E" />
              <StatChip icon="trending-up" label="2030 GDP"   value="$6.7T"  color={Colors.warning} />
            </View>
            <View style={s.statsGrid}>
              <StatChip icon="swap-horiz"     label="Trade Vol."  value="$595B" color="#9945FF" />
              <StatChip icon="speed"          label="Intra-Africa" value="17%"  color={Colors.error} />
              <StatChip icon="flag"           label="Target 2030" value="52%"   color={Colors.success} />
              <StatChip icon="monetization-on" label="Market Size" value="$3.4T" color={Colors.primary} />
            </View>
            <View style={[s.sectionCard, { borderColor: Colors.primary + '66' }]}>
              <View style={s.sectionCardHeader}>
                <View style={s.sectionCardIcon}><Text style={{ fontSize: 26 }}>🪙</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionCardTitle}>BTNG Gold — Official AfCFTA Settlement Currency</Text>
                  <Text style={s.sectionCardSub}>Powering pan-African trade with gold-backed digital currency</Text>
                </View>
                <View style={s.liveBadge}><PulseDot color={Colors.success} /><Text style={s.liveBadgeText}>LIVE</Text></View>
              </View>
              <View style={s.featureGrid}>
                {BTNG_FEATURES.map(f => (
                  <View key={f.title} style={[s.featureCell, { borderColor: f.color + '33' }]}>
                    <View style={[s.featureCellIcon, { backgroundColor: f.color + '18', borderColor: f.color + '44' }]}>
                      <MaterialIcons name={f.icon as any} size={18} color={f.color} />
                    </View>
                    <Text style={[s.featureCellTitle, { color: f.color }]}>{f.title}</Text>
                    <Text style={s.featureCellDesc}>{f.desc}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={s.sectionCard}>
              <View style={s.sectionCardHeader}>
                <MaterialIcons name="pie-chart" size={20} color={Colors.primary} />
                <Text style={s.sectionCardTitle}>Key Trade Sectors</Text>
              </View>
              <View style={s.sectorGrid}>
                {SECTORS.map(sec => (
                  <TouchableOpacity key={sec.name} style={[s.sectorCard, { borderColor: sec.color + '44' }]}
                    onPress={() => showAlert(sec.name, `${sec.desc}\n\nValue: ${sec.value}\nGrowth: ${sec.growth}\nNations: ${sec.nations} countries`)} activeOpacity={0.78}>
                    <Text style={s.sectorEmoji}>{sec.emoji}</Text>
                    <Text style={[s.sectorName, { color: sec.color }]}>{sec.name}</Text>
                    <Text style={s.sectorValue}>{sec.value}</Text>
                    <View style={[s.sectorGrowthPill, { backgroundColor: sec.color + '18', borderColor: sec.color + '44' }]}>
                      <MaterialIcons name="trending-up" size={9} color={sec.color} />
                      <Text style={[s.sectorGrowth, { color: sec.color }]}>{sec.growth}</Text>
                    </View>
                    <Text style={s.sectorNations}>{sec.nations} nations</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.missionCard}>
              <Text style={{ fontSize: 32, textAlign: 'center' }}>🌍</Text>
              <Text style={s.missionTitle}>Africa's Economic Destiny</Text>
              <Text style={s.missionText}>
                The AfCFTA is projected to lift 30 million Africans out of extreme poverty by 2035 and generate $450B in
                additional income. BTNG Gold Coin is the financial infrastructure that makes this possible — a single,
                gold-backed, sovereign currency that transcends borders, languages, and colonial currency legacies.
              </Text>
              <View style={s.missionStatsRow}>
                {[
                  { value: '30M',  label: 'Out of poverty by 2035', color: '#22C55E'      },
                  { value: '$450B', label: 'Additional income',      color: Colors.primary },
                  { value: '350M', label: 'Unbanked access',         color: '#3B82F6'      },
                ].map(item => (
                  <View key={item.label} style={s.missionStat}>
                    <Text style={[s.missionStatValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={s.missionStatLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
            CORRIDORS TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'corridors' && (
          <>
            <SCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
                <View style={s.sectionIconWrap}><MaterialIcons name="alt-route" size={20} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionCardTitle}>Active Trade Corridors</Text>
                  <Text style={s.sectionCardSub}>Live BTNG-settled cross-border routes</Text>
                </View>
                <View style={s.liveBadge}><PulseDot color={Colors.success} /><Text style={s.liveBadgeText}>{TRADE_CORRIDORS.length} Active</Text></View>
              </View>
              <Text style={s.sectionDesc}>Each corridor uses BTNG Gold as the settlement bridge — eliminating FX conversion delays and 8–15% traditional transfer fees. Settlements complete in under 5 seconds.</Text>
            </SCard>
            {TRADE_CORRIDORS.map((corridor, i) => (
              <TouchableOpacity key={i} style={[s.corridorCard, { borderColor: corridor.color + '44' }]}
                onPress={() => showAlert(`${corridor.from.country} → ${corridor.to.country}`, `Sector: ${corridor.sector}\nAnnual Volume: ${corridor.volume}\nGrowth: ${corridor.growth}\n\nThis trade corridor uses BTNG Gold as the settlement currency, reducing transfer times from 3–5 days to under 5 seconds.`)}
                activeOpacity={0.82}>
                <View style={s.corridorHeader}>
                  <View style={[s.corridorStatus, { backgroundColor: corridor.color + '18', borderColor: corridor.color + '55' }]}>
                    <PulseDot color={corridor.color} size={6} />
                    <Text style={[s.corridorStatusText, { color: corridor.color }]}>ACTIVE</Text>
                  </View>
                  <Text style={[s.corridorVolume, { color: corridor.color }]}>{corridor.volume}/yr</Text>
                  <View style={[s.corridorGrowthPill, { backgroundColor: '#22C55E18', borderColor: '#22C55E55' }]}>
                    <MaterialIcons name="trending-up" size={10} color="#22C55E" />
                    <Text style={s.corridorGrowthText}>{corridor.growth}</Text>
                  </View>
                </View>
                <View style={s.corridorRoute}>
                  <View style={s.corridorEndpoint}>
                    <Text style={s.corridorFlag}>{corridor.from.flag}</Text>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={s.corridorCountry}>{corridor.from.country}</Text>
                      <Text style={s.corridorRegion}>{corridor.from.region}</Text>
                      <View style={[s.corridorCurrencyBadge, { backgroundColor: corridor.color + '18', borderColor: corridor.color + '44' }]}>
                        <Text style={[s.corridorCurrencyText, { color: corridor.color }]}>{corridor.from.currency}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.corridorBridge}>
                    <View style={[s.corridorBridgeLine, { backgroundColor: corridor.color + '55' }]} />
                    <View style={[s.corridorBridgeCenter, { backgroundColor: corridor.color + '18', borderColor: corridor.color + '66' }]}>
                      <Text style={{ fontSize: 14 }}>🪙</Text>
                      <Text style={[s.corridorBridgeLabel, { color: corridor.color }]}>BTNG</Text>
                    </View>
                    <View style={[s.corridorBridgeLine, { backgroundColor: corridor.color + '55' }]} />
                  </View>
                  <View style={[s.corridorEndpoint, { alignItems: 'flex-end' }]}>
                    <Text style={s.corridorFlag}>{corridor.to.flag}</Text>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={s.corridorCountry}>{corridor.to.country}</Text>
                      <Text style={s.corridorRegion}>{corridor.to.region}</Text>
                      <View style={[s.corridorCurrencyBadge, { backgroundColor: corridor.color + '18', borderColor: corridor.color + '44' }]}>
                        <Text style={[s.corridorCurrencyText, { color: corridor.color }]}>{corridor.to.currency}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={[s.corridorSectorRow, { backgroundColor: corridor.color + '10' }]}>
                  <MaterialIcons name="category" size={12} color={corridor.color} />
                  <Text style={[s.corridorSector, { color: corridor.color }]}>{corridor.sector}</Text>
                  <Text style={s.corridorSettlement}>⚡ &lt;5s settlement</Text>
                </View>
              </TouchableOpacity>
            ))}
            <SCard style={{ borderColor: Colors.primary + '55', alignItems: 'center', gap: Spacing.md }}>
              <MaterialIcons name="add-road" size={32} color={Colors.primary} />
              <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false } as any}>Open New Trade Corridor</Text>
              <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false } as any}>Any two AfCFTA member states can establish a BTNG-settled trade corridor. Contact the BTNG Sovereign Treasury to register your corridor.</Text>
              <TouchableOpacity style={s.corridorCTABtn}
                onPress={() => showAlert('Trade Corridor Registration', 'Contact the BTNG Sovereign Treasury at info@bituncoin.io to register your cross-border trade corridor.')}
                activeOpacity={0.85}>
                <MaterialIcons name="arrow-forward" size={16} color={Colors.bg} />
                <Text style={s.corridorCTAText}>Register Corridor</Text>
              </TouchableOpacity>
            </SCard>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
            TRADE TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'trade' && (
          <>
            <View style={[s.sectionCard, { borderColor: Colors.primary + '55' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md }}>
                <View style={[s.sectionIconWrap, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                  <MaterialIcons name="swap-horiz" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionCardTitle}>Cross-Border Trade Engine</Text>
                  <Text style={s.sectionCardSub}>BTNG bridge · 54 African currencies · 0.1% fee</Text>
                </View>
              </View>
              <Text style={s.tradeFieldLabel}>FROM</Text>
              <TouchableOpacity style={s.tradeCurrencyBtn} onPress={() => { setShowFromPicker(!showFromPicker); setShowToPicker(false); setSearch(''); }} activeOpacity={0.8}>
                <Text style={s.tradeCurrencyFlag}>{fromCurrency.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.tradeCurrencyName}>{fromCurrency.country}</Text>
                  <Text style={s.tradeCurrencyCode}>{fromCurrency.code} · {fromCurrency.name}</Text>
                </View>
                <MaterialIcons name={showFromPicker ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
              </TouchableOpacity>
              {showFromPicker && (
                <View style={s.pickerDropdown}>
                  <TextInput style={s.pickerSearch} value={search} onChangeText={setSearch} placeholder="Search country or code..." placeholderTextColor={Colors.textMuted} autoCorrect={false} />
                  <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                    {filteredCurrencies.map((cur) => (
                      <TouchableOpacity key={`from-${cur.code}-${cur.country}`} style={s.pickerItem}
                        onPress={() => { setTradeFromIdx(AFRICAN_CURRENCIES.indexOf(cur)); setShowFromPicker(false); setSearch(''); }}>
                        <Text style={s.pickerItemFlag}>{cur.flag}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.pickerItemCountry}>{cur.country}</Text>
                          <Text style={s.pickerItemCode}>{cur.code} · {cur.symbol}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              <Text style={[s.tradeFieldLabel, { marginTop: Spacing.md }]}>AMOUNT</Text>
              <View style={s.tradeAmtRow}>
                <View style={s.tradeAmtPrefix}><Text style={s.tradeAmtPrefixText}>{fromCurrency.symbol}</Text></View>
                <TextInput style={s.tradeAmtInput} value={tradeAmt} onChangeText={v => setTradeAmt(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={Colors.textMuted} />
                <Text style={s.tradeAmtCode}>{fromCurrency.code}</Text>
              </View>
              <View style={s.tradeBridgeRow}>
                <View style={[s.tradeBridgeLine, { flex: 1 }]} />
                <View style={s.tradeBridgeCenter}>
                  <Text style={{ fontSize: 20 }}>🪙</Text>
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    <Text style={s.tradeBridgeLabel}>via BTNG</Text>
                    <Text style={s.tradeBridgeBtngg}>{btngNeeded.toFixed(4)} BTNGG</Text>
                  </View>
                </View>
                <View style={[s.tradeBridgeLine, { flex: 1 }]} />
              </View>
              <Text style={s.tradeFieldLabel}>TO</Text>
              <TouchableOpacity style={[s.tradeCurrencyBtn, { borderColor: '#22C55E44' }]} onPress={() => { setShowToPicker(!showToPicker); setShowFromPicker(false); setSearch(''); }} activeOpacity={0.8}>
                <Text style={s.tradeCurrencyFlag}>{toCurrency.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.tradeCurrencyName}>{toCurrency.country}</Text>
                  <Text style={s.tradeCurrencyCode}>{toCurrency.code} · {toCurrency.name}</Text>
                </View>
                <MaterialIcons name={showToPicker ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
              </TouchableOpacity>
              {showToPicker && (
                <View style={s.pickerDropdown}>
                  <TextInput style={s.pickerSearch} value={search} onChangeText={setSearch} placeholder="Search country or code..." placeholderTextColor={Colors.textMuted} autoCorrect={false} />
                  <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                    {filteredCurrencies.map((cur) => (
                      <TouchableOpacity key={`to-${cur.code}-${cur.country}`} style={s.pickerItem}
                        onPress={() => { setTradeToIdx(AFRICAN_CURRENCIES.indexOf(cur)); setShowToPicker(false); setSearch(''); }}>
                        <Text style={s.pickerItemFlag}>{cur.flag}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.pickerItemCountry}>{cur.country}</Text>
                          <Text style={s.pickerItemCode}>{cur.code} · {cur.symbol}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              <View style={s.tradeResultBox}>
                <Text style={s.tradeResultLabel}>Recipient Receives</Text>
                <Text style={s.tradeResultAmt}>{toCurrency.symbol}{amtReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                <Text style={s.tradeResultCode}>{toCurrency.code} · {toCurrency.country}</Text>
              </View>
              <View style={s.tradeFeeRow}>
                {[
                  { label: 'Rate',      value: `1 ${fromCurrency.code} = ${(toCurrency.usdRate / fromCurrency.usdRate).toFixed(4)} ${toCurrency.code}` },
                  { label: 'Fee (0.1%)', value: `${fromCurrency.symbol}${feeLocal.toFixed(2)}` },
                  { label: 'Speed',     value: '< 5 seconds' },
                ].map(item => (
                  <View key={item.label} style={s.tradeFeeItem}>
                    <Text style={s.tradeFeeLabel}>{item.label}</Text>
                    <Text style={s.tradeFeeValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={[s.tradeExecBtn, tradeSending && { opacity: 0.6 }]} onPress={handleExecuteTrade} disabled={tradeSending} activeOpacity={0.85}>
                {tradeSending ? <ActivityIndicator color={Colors.bg} /> : <MaterialIcons name="send" size={18} color={Colors.bg} />}
                <Text style={s.tradeExecBtnText}>{tradeSending ? 'Processing via BTNG…' : 'Execute Free Trade'}</Text>
              </TouchableOpacity>
              <View style={s.tradeDisclaimer}>
                <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
                <Text style={s.tradeDisclaimerText}>Trades route through the BTNG Gold bridge. XAU-backed settlement ensures price stability across all 54 AfCFTA member currencies.</Text>
              </View>
            </View>
            <SCard>
              <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.md, includeFontPadding: false } as any}>How BTNG Trade Bridge Works</Text>
              {[
                { step: '1', text: `Sender sends ${fromCurrency.code} — converted to BTNG at live XAU rate`, icon: 'arrow-forward', color: Colors.primary },
                { step: '2', text: 'BTNG blockchain validates and broadcasts transaction in under 1 second', icon: 'verified', color: '#3B82F6' },
                { step: '3', text: `Recipient receives ${toCurrency.code} — converted from BTNG at destination rate`, icon: 'check-circle', color: '#22C55E' },
                { step: '4', text: 'Full audit trail written to BTNG sovereign blockchain at Bank of Ghana', icon: 'receipt-long', color: Colors.primary },
              ].map(step => (
                <View key={step.step} style={s.howStepRow}>
                  <View style={[s.howStepNum, { backgroundColor: step.color + '18', borderColor: step.color + '44' }]}>
                    <Text style={[s.howStepNumText, { color: step.color }]}>{step.step}</Text>
                  </View>
                  <MaterialIcons name={step.icon as any} size={14} color={step.color} style={{ marginTop: 2 }} />
                  <Text style={s.howStepText}>{step.text}</Text>
                </View>
              ))}
            </SCard>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
            NATIONS TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'nations' && (
          <>
            <SCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
                <MaterialIcons name="star" size={18} color={Colors.primary} />
                <Text style={s.sectionCardTitle}>Key Member States</Text>
                <View style={{ flex: 1 }} /><View style={s.liveBadge}><Text style={s.liveBadgeText}>54 Total</Text></View>
              </View>
              {FEATURED_NATIONS.map(nation => (
                <TouchableOpacity key={nation.name} style={s.nationCard}
                  onPress={() => showAlert(`${nation.flag} ${nation.name}`, `Role: ${nation.role}\nGDP: ${nation.gdp}\nCurrency: ${nation.currency}\nKey Exports: ${nation.exports}\n\nBTNG is accepted for all trade settlements in ${nation.name} via the AfCFTA agreement.`)}
                  activeOpacity={0.8}>
                  <Text style={s.nationFlag}>{nation.flag}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.nationName}>{nation.name}</Text>
                      <View style={[s.nationTierBadge, {
                        backgroundColor: nation.tier === 'Founding' ? Colors.primaryGlow : nation.tier === 'Tier 1' ? '#22C55E18' : '#3B82F618',
                        borderColor:     nation.tier === 'Founding' ? Colors.primary + '55' : nation.tier === 'Tier 1' ? '#22C55E55' : '#3B82F655',
                      }]}>
                        <Text style={[s.nationTierText, { color: nation.tier === 'Founding' ? Colors.primary : nation.tier === 'Tier 1' ? '#22C55E' : '#3B82F6' }]}>{nation.tier}</Text>
                      </View>
                    </View>
                    <Text style={s.nationRole}>{nation.role} · {nation.gdp}</Text>
                    <Text style={s.nationExports} numberOfLines={1}>{nation.exports}</Text>
                  </View>
                  <View style={s.nationCurrencyWrap}>
                    <Text style={s.nationCurrency}>{nation.currency}</Text>
                    <MaterialIcons name="chevron-right" size={14} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </SCard>
            <SCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
                <MaterialIcons name="language" size={18} color={Colors.primary} />
                <Text style={s.sectionCardTitle}>All 54 AfCFTA Currencies</Text>
              </View>
              <View style={s.currencyGrid}>
                {AFRICAN_CURRENCIES.slice(0, 40).map((cur, i) => (
                  <TouchableOpacity key={`${cur.code}-${i}`} style={s.currencyChip}
                    onPress={() => showAlert(`${cur.flag} ${cur.country}`, `Currency: ${cur.name} (${cur.code})\nSymbol: ${cur.symbol}\nRate: 1 USD = ${cur.usdRate.toLocaleString()} ${cur.code}\n\n1 BTNGG = ${(btngPrice * cur.usdRate).toFixed(2)} ${cur.code}`)}
                    activeOpacity={0.78}>
                    <Text style={s.currencyChipFlag}>{cur.flag}</Text>
                    <Text style={s.currencyChipCode}>{cur.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </SCard>
            <SCard>
              <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.md, includeFontPadding: false } as any}>Regional Economic Blocs</Text>
              {[
                { name: 'ECOWAS',   region: 'West Africa',     nations: 15, currency: 'XOF/XAF', flag: '🌍', color: '#22C55E'      },
                { name: 'EAC',      region: 'East Africa',     nations: 8,  currency: 'Multi',   flag: '🌍', color: '#3B82F6'      },
                { name: 'SADC',     region: 'Southern Africa', nations: 16, currency: 'Multi',   flag: '🌍', color: Colors.primary },
                { name: 'COMESA',   region: 'East & Central',  nations: 21, currency: 'Multi',   flag: '🌍', color: '#9945FF'      },
                { name: 'AMU',      region: 'North Africa',    nations: 5,  currency: 'Multi',   flag: '🌍', color: '#F59E0B'      },
                { name: 'CEN-SAD',  region: 'Sahel & Sahara',  nations: 29, currency: 'Multi',   flag: '🌍', color: '#64748B'      },
              ].map((bloc, i) => (
                <View key={bloc.name} style={[s.blocRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={[s.blocIcon, { backgroundColor: bloc.color + '18', borderColor: bloc.color + '44' }]}><Text style={{ fontSize: 16 }}>{bloc.flag}</Text></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[s.blocName, { color: bloc.color }]}>{bloc.name}</Text>
                      <View style={[s.blocNationsBadge, { backgroundColor: bloc.color + '18', borderColor: bloc.color + '44' }]}>
                        <Text style={[s.blocNationsText, { color: bloc.color }]}>{bloc.nations} nations</Text>
                      </View>
                    </View>
                    <Text style={s.blocRegion}>{bloc.region} · {bloc.currency}</Text>
                  </View>
                  <View style={s.liveBadge}><PulseDot color={bloc.color} size={5} /><Text style={[s.liveBadgeText, { color: bloc.color }]}>BTNG</Text></View>
                </View>
              ))}
            </SCard>
            <View style={[s.sectionCard, { borderColor: Colors.primary + '66' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                <Text style={{ fontSize: 28 }}>🇬🇭</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sectionCardTitle, { color: Colors.primary }]}>Ghana — AfCFTA Host and BTNG Origin</Text>
                  <Text style={s.sectionCardSub}>Secretariat: Accra · Bank of Ghana Gold Vault 001</Text>
                </View>
              </View>
              <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false } as any}>
                Ghana hosts the AfCFTA Secretariat in Accra and is the birthplace of BTNG Gold Coin. The Bank of Ghana's Vault 001 holds the 500kg gold reserve backing BTNG, making Ghana the financial anchor of pan-African free trade.
              </Text>
              <View style={s.ghanaStatsRow}>
                {[
                  { label: 'Gold Exports', value: '#1 in W.Africa', color: Colors.primary },
                  { label: 'BTNG Vault',   value: 'Vault 001',       color: Colors.warning },
                  { label: 'AfCFTA Role',  value: 'Secretariat Host', color: '#22C55E'     },
                ].map(item => (
                  <View key={item.label} style={[s.ghanaStat, { borderColor: item.color + '33' }]}>
                    <Text style={[s.ghanaStatValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={s.ghanaStatLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Dashboard Styles ──────────────────────────────────────────────────────────
const ds = StyleSheet.create({
  hero: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', gap: Spacing.sm,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 5,
  },
  heroTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  heroPill:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#22C55E18', borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: '#22C55E44' },
  heroPillText:  { fontSize: 8, fontWeight: FontWeight.heavy, color: '#22C55E', letterSpacing: 1, includeFontPadding: false },
  tickBadge:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  tickBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  heroLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  heroSub:       { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  heroStatRow:   { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md, marginTop: Spacing.xs },
  heroStat:      { flex: 1, alignItems: 'center', gap: 2 },
  heroStatDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  heroStatLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  card:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardIcon:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardSub:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  livePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, backgroundColor: '#22C55E10', borderColor: '#22C55E55' },
  livePillText: { fontSize: 8, fontWeight: FontWeight.heavy, color: '#22C55E', letterSpacing: 1, includeFontPadding: false },

  chartLegRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  chartLegDot:  { width: 8, height: 8, borderRadius: 4 },
  chartLegText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  hourRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, height: 14 },
  hourLabel: { width: 26, fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'right' },
  hourTrack: { flex: 1, height: 9, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  hourFill:  { height: 9, borderRadius: 3 },
  hourVal:   { width: 44, fontSize: 9, color: Colors.textSecondary, textAlign: 'right', includeFontPadding: false },

  corridorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
  cFlags:   { flexDirection: 'row', alignItems: 'center', gap: 2, width: 54 },
  cFlag:    { fontSize: 17 },
  cLabel:   { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  cMeta:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  secBadge:     { borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1 },
  secBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  cVolWrap:  { alignItems: 'flex-end', gap: 3, minWidth: 58 },
  changeChip:     { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.full, paddingHorizontal: 3, paddingVertical: 1, borderWidth: 1 },
  changeChipText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },

  secBarRow:   { gap: 3 },
  secBarLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  secBarTrack: { height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden' },
  secBarFill:  { height: 8, borderRadius: 4 },
  secBarRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secBarPct:   { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  secBarVol:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  metricCell:  { width: '47%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 4, minWidth: 120 },
  metricIcon:  { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

// ── Main Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.sm },
  backBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:     { flex: 1, alignItems: 'center' },
  topTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:        { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  afcftaBadge:   { backgroundColor: '#22C55E18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#22C55E55' },
  afcftaBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: '#22C55E', letterSpacing: 1, includeFontPadding: false },

  priceStrip:  { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  priceItem:   { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, gap: 2 },
  priceDivider:{ width: 1, backgroundColor: Colors.border, marginVertical: 6 },
  priceLabel:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  priceValue:  { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },

  tabBarScroll:   { maxHeight: 44, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  tabBarContent:  { flexDirection: 'row', gap: 4, paddingRight: 4 },
  tabBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabActive:      { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:        { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:  { color: Colors.bg },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  heroBanner:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 14, elevation: 5 },
  heroTextWrap:  { gap: Spacing.sm },
  heroLivePill:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55', alignSelf: 'flex-start' },
  heroLiveText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },
  heroTitle:     { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, lineHeight: 28, includeFontPadding: false },
  heroSub:       { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  heroBadgeRow:  { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginTop: Spacing.xs },
  heroBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  statsGrid: { flexDirection: 'row', gap: Spacing.sm },

  sectionCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sectionCardIcon:   { width: 48, height: 48, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  sectionCardTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionCardSub:    { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  sectionDesc:       { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },
  sectionIconWrap:   { width: 42, height: 42, borderRadius: 13, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },

  liveBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.success + '18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.5, includeFontPadding: false },

  featureGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  featureCell:      { width: '47%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, gap: 6, minWidth: 130 },
  featureCellIcon:  { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  featureCellTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  featureCellDesc:  { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },

  sectorGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  sectorCard:       { width: '23%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, alignItems: 'center', gap: 4, minWidth: 75 },
  sectorEmoji:      { fontSize: 24 },
  sectorName:       { fontSize: 10, fontWeight: FontWeight.heavy, textAlign: 'center', includeFontPadding: false },
  sectorValue:      { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', includeFontPadding: false },
  sectorGrowthPill: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  sectorGrowth:     { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  sectorNations:    { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  missionCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 14, elevation: 5 },
  missionTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, textAlign: 'center' },
  missionText:      { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  missionStatsRow:  { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md, gap: Spacing.sm },
  missionStat:      { flex: 1, alignItems: 'center', gap: 3 },
  missionStatValue: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  missionStatLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  corridorCard:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, gap: Spacing.md },
  corridorHeader:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  corridorStatus:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  corridorStatusText:   { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 1, includeFontPadding: false },
  corridorVolume:       { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.heavy, textAlign: 'center', includeFontPadding: false },
  corridorGrowthPill:   { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  corridorGrowthText:   { fontSize: 10, fontWeight: FontWeight.bold, color: '#22C55E', includeFontPadding: false },
  corridorRoute:        { flexDirection: 'row', alignItems: 'center' },
  corridorEndpoint:     { alignItems: 'center', gap: 4, width: 80 },
  corridorFlag:         { fontSize: 30 },
  corridorCountry:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  corridorRegion:       { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  corridorCurrencyBadge:{ borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  corridorCurrencyText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  corridorBridge:       { flex: 1, flexDirection: 'row', alignItems: 'center' },
  corridorBridgeLine:   { flex: 1, height: 2, borderRadius: 1 },
  corridorBridgeCenter: { alignItems: 'center', gap: 2, padding: 8, borderRadius: 14, borderWidth: 1 },
  corridorBridgeLabel:  { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  corridorSectorRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, padding: 8 },
  corridorSector:       { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  corridorSettlement:   { fontSize: 10, color: Colors.success, fontWeight: FontWeight.bold, includeFontPadding: false },
  corridorCTABtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  corridorCTAText:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  tradeFieldLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tradeCurrencyBtn:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  tradeCurrencyFlag: { fontSize: 28 },
  tradeCurrencyName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tradeCurrencyCode: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  pickerDropdown:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  pickerSearch:      { borderBottomWidth: 1, borderBottomColor: Colors.border, padding: Spacing.md, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  pickerItem:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  pickerItemFlag:    { fontSize: 22 },
  pickerItemCountry: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  pickerItemCode:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  tradeAmtRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, height: 56, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  tradeAmtPrefix:    { backgroundColor: Colors.primaryGlow, borderRadius: 8, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  tradeAmtPrefixText:{ fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.heavy, includeFontPadding: false },
  tradeAmtInput:     { flex: 1, fontSize: 20, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tradeAmtCode:      { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  tradeBridgeRow:    { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.sm },
  tradeBridgeLine:   { height: 2, backgroundColor: Colors.primary + '33', borderRadius: 1 },
  tradeBridgeCenter: { alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: 16, borderWidth: 1, borderColor: Colors.primary + '55', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  tradeBridgeLabel:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  tradeBridgeBtngg:  { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  tradeResultBox:    { backgroundColor: '#22C55E18', borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#22C55E55', alignItems: 'center', gap: 4 },
  tradeResultLabel:  { fontSize: FontSize.xs, color: '#22C55E', fontWeight: FontWeight.semibold, includeFontPadding: false },
  tradeResultAmt:    { fontSize: 32, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  tradeResultCode:   { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  tradeFeeRow:       { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.xs },
  tradeFeeItem:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tradeFeeLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  tradeFeeValue:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  tradeExecBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  tradeExecBtnText:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  tradeDisclaimer:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  tradeDisclaimerText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  howStepRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  howStepNum:        { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  howStepNumText:    { fontSize: 12, fontWeight: FontWeight.heavy, includeFontPadding: false },
  howStepText:       { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },

  nationCard:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  nationFlag:       { fontSize: 30 },
  nationName:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  nationTierBadge:  { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  nationTierText:   { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  nationRole:       { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  nationExports:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  nationCurrencyWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nationCurrency:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  currencyGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  currencyChip:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 3, minWidth: 48 },
  currencyChipFlag: { fontSize: 18 },
  currencyChipCode: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  blocRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  blocIcon:         { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  blocName:         { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  blocNationsBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  blocNationsText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  blocRegion:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  ghanaStatsRow:    { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  ghanaStat:        { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 3 },
  ghanaStatValue:   { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, textAlign: 'center', includeFontPadding: false },
  ghanaStatLabel:   { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});
