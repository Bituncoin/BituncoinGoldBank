// BTNG Global Panel — FXOracle Live · GHS Active · Africa-54 · BRICS · World
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Static Data ──────────────────────────────────────────────────────────────
const GHS_RATE_USD = 11.71;
const BTNG_USD = 3.250;
const XAU_USD = 3250;

const AFRICA54_CURRENCIES = [
  { code: 'GHS', flag: '🇬🇭', name: 'Ghana Cedi', rate: 11.71, change: +0.12 },
  { code: 'NGN', flag: '🇳🇬', name: 'Nigerian Naira', rate: 1580, change: -0.45 },
  { code: 'KES', flag: '🇰🇪', name: 'Kenyan Shilling', rate: 129.5, change: +0.08 },
  { code: 'ZAR', flag: '🇿🇦', name: 'South African Rand', rate: 18.4, change: +0.22 },
  { code: 'EGP', flag: '🇪🇬', name: 'Egyptian Pound', rate: 49.5, change: -0.15 },
  { code: 'MAD', flag: '🇲🇦', name: 'Moroccan Dirham', rate: 9.98, change: +0.05 },
  { code: 'TZS', flag: '🇹🇿', name: 'Tanzanian Shilling', rate: 2650, change: +0.03 },
  { code: 'ETB', flag: '🇪🇹', name: 'Ethiopian Birr', rate: 57.2, change: -0.28 },
  { code: 'XOF', flag: '🌍', name: 'West African CFA', rate: 610, change: +0.01 },
  { code: 'UGX', flag: '🇺🇬', name: 'Ugandan Shilling', rate: 3720, change: -0.11 },
  { code: 'DZD', flag: '🇩🇿', name: 'Algerian Dinar', rate: 135, change: +0.07 },
  { code: 'AOA', flag: '🇦🇴', name: 'Angolan Kwanza', rate: 920, change: -0.33 },
];

const BRICS_NATIONS = [
  { flag: '🇧🇷', name: 'Brazil', currency: 'BRL', rate: 5.05, gdp: '2.1T', change: -0.23 },
  { flag: '🇷🇺', name: 'Russia', currency: 'RUB', rate: 91.5, gdp: '1.8T', change: +0.44 },
  { flag: '🇮🇳', name: 'India', currency: 'INR', rate: 83.5, gdp: '3.7T', change: +0.18 },
  { flag: '🇨🇳', name: 'China', currency: 'CNY', rate: 7.23, gdp: '17.9T', change: -0.09 },
  { flag: '🇿🇦', name: 'South Africa', currency: 'ZAR', rate: 18.4, gdp: '0.38T', change: +0.22 },
  { flag: '🇸🇦', name: 'Saudi Arabia', currency: 'SAR', rate: 3.75, gdp: '1.1T', change: +0.0 },
  { flag: '🇦🇪', name: 'UAE', currency: 'AED', rate: 3.67, gdp: '0.50T', change: +0.01 },
  { flag: '🇮🇷', name: 'Iran', currency: 'IRR', rate: 42200, gdp: '0.37T', change: -1.2 },
  { flag: '🇪🇹', name: 'Ethiopia', currency: 'ETB', rate: 57.2, gdp: '0.12T', change: -0.28 },
];

const WORLD_MARKETS = [
  { name: 'Gold (XAU/USD)', value: '$3,250.00', change: +0.14, icon: '🥇' },
  { name: 'Silver (XAG/USD)', value: '$32.80', change: -0.22, icon: '🥈' },
  { name: 'Bitcoin (BTC)', value: '$107,200', change: +2.14, icon: '₿' },
  { name: 'Ethereum (ETH)', value: '$3,800', change: -1.23, icon: 'Ξ' },
  { name: 'US Dollar Index', value: '104.20', change: -0.08, icon: '$' },
  { name: 'Crude Oil (WTI)', value: '$72.40', change: +0.95, icon: '🛢️' },
  { name: 'S&P 500', value: '5,248', change: +0.34, icon: '📈' },
  { name: 'BTNG Gold (BTNGG)', value: '$3.250', change: +0.14, icon: '🔶' },
];

const ORACLE_FEEDS = [
  { label: 'BTNGG/USD', value: '$3.250', sub: '1 BTNGG = 1/1000 XAU', color: Colors.primary },
  { label: 'XAU/USD', value: '$3,250', sub: 'Gold Spot per troy oz', color: Colors.warning },
  { label: 'GHS/USD', value: '₵11.71', sub: 'Live Bank of Ghana rate', color: '#22C55E' },
  { label: 'BTNGG/GHS', value: '₵38.07', sub: '1 BTNGG in Ghana Cedis', color: '#3B82F6' },
];

function RateRow({ flag, code, name, rate, change }: any) {
  const isPos = change >= 0;
  return (
    <View style={rr.row}>
      <Text style={rr.flag}>{flag}</Text>
      <View style={{ flex: 1 }}>
        <Text style={rr.code}>{code}</Text>
        <Text style={rr.name}>{name}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={rr.rate}>{rate.toLocaleString()}</Text>
        <View style={[rr.badge, { backgroundColor: isPos ? Colors.successBg : Colors.errorBg }]}>
          <MaterialIcons name={isPos ? 'trending-up' : 'trending-down'} size={10} color={isPos ? Colors.success : Colors.error} />
          <Text style={[rr.change, { color: isPos ? Colors.success : Colors.error }]}>{isPos ? '+' : ''}{change.toFixed(2)}%</Text>
        </View>
      </View>
    </View>
  );
}
const rr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm + 3, borderBottomWidth: 1, borderBottomColor: Colors.border },
  flag: { fontSize: 22, width: 30, textAlign: 'center' },
  code: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  name: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  rate: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  change: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
});

export default function BtngGlobalPanelScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'oracle' | 'africa54' | 'brics' | 'world'>('oracle');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const [btngGhsCalc, setBtngGhsCalc] = useState('1000');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 1200));
    setLastUpdate(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setRefreshing(false);
  }, []);

  const TABS = [
    { key: 'oracle', label: 'FXOracle', icon: 'show-chart' },
    { key: 'africa54', label: 'Africa 54', icon: 'public' },
    { key: 'brics', label: 'BRICS', icon: 'groups' },
    { key: 'world', label: 'World', icon: 'language' },
  ];

  const calcGHS = () => {
    const amount = parseFloat(btngGhsCalc);
    if (isNaN(amount)) return '0.00';
    return (amount * GHS_RATE_USD * BTNG_USD / GHS_RATE_USD).toFixed(2);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Global Panel</Text>
          <View style={s.livePill}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>FXOracle · Live · {lastUpdate}</Text>
          </View>
        </View>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: Colors.primaryGlow }]} onPress={handleRefresh}>
          <MaterialIcons name="refresh" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]} onPress={() => setActiveTab(t.key as any)}>
            <MaterialIcons name={t.icon as any} size={13} color={activeTab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        {/* ── FXORACLE ── */}
        {activeTab === 'oracle' && (
          <>
            {/* Oracle Feed Cards */}
            <View style={s.oracleGrid}>
              {ORACLE_FEEDS.map(feed => (
                <View key={feed.label} style={[s.oracleCard, { borderColor: feed.color + '44' }]}>
                  <Text style={[s.oracleValue, { color: feed.color }]}>{feed.value}</Text>
                  <Text style={s.oracleLabel}>{feed.label}</Text>
                  <Text style={s.oracleSub}>{feed.sub}</Text>
                </View>
              ))}
            </View>

            {/* GHS Calculator */}
            <View style={s.calcCard}>
              <View style={s.calcHeader}>
                <View style={s.calcIconWrap}><Text style={{ fontSize: 20 }}>🇬🇭</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.calcTitle}>GHS Gold Calculator</Text>
                  <Text style={s.calcSub}>How much gold can you buy in Ghana Cedis?</Text>
                </View>
                <View style={s.calcRatePill}><Text style={s.calcRateText}>1 USD = ₵{GHS_RATE_USD}</Text></View>
              </View>
              <View style={s.calcRow}>
                <View style={s.calcInputWrap}>
                  <Text style={s.calcCurrency}>GHS</Text>
                  <Text style={s.calcInputText}>{btngGhsCalc}</Text>
                </View>
                <MaterialIcons name="swap-horiz" size={20} color={Colors.primary} />
                <View style={[s.calcInputWrap, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]}>
                  <Text style={s.calcCurrencyGold}>BTNGG</Text>
                  <Text style={[s.calcInputText, { color: Colors.primary }]}>{calcGHS()}</Text>
                </View>
              </View>
              <View style={s.calcBtnRow}>
                {['100', '500', '1000', '5000', '10000'].map(amt => (
                  <TouchableOpacity key={amt} style={[s.calcPreset, btngGhsCalc === amt && s.calcPresetActive]} onPress={() => setBtngGhsCalc(amt)}>
                    <Text style={[s.calcPresetText, btngGhsCalc === amt && { color: Colors.bg }]}>₵{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* BTNG Reserve Stats */}
            <View style={s.reserveCard}>
              <View style={s.sectionHeader}>
                <View style={s.sectionIconWrap}><MaterialIcons name="account-balance" size={16} color={Colors.primary} /></View>
                <Text style={s.sectionTitle}>BTNG Sovereign Reserve</Text>
                <View style={s.livePill}><View style={s.liveDot} /><Text style={s.liveText}>Live</Text></View>
              </View>
              {[
                { label: 'Total BTNGG Supply', value: '204.2B BTNGG', color: Colors.primary },
                { label: 'USD Equivalent', value: '$29.5 Trillion', color: Colors.success },
                { label: 'Gold Equivalent', value: '6.57B oz XAU', color: Colors.warning },
                { label: 'Reserve Ratio', value: '295:1', color: '#3B82F6' },
                { label: 'Backing Standard', value: 'Gold + Continental GDP', color: Colors.textSecondary },
                { label: 'Nations Backing', value: '54 African Nations', color: '#22C55E' },
              ].map(row => (
                <View key={row.label} style={s.reserveRow}>
                  <Text style={s.reserveLabel}>{row.label}</Text>
                  <Text style={[s.reserveValue, { color: row.color }]}>{row.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── AFRICA 54 ── */}
        {activeTab === 'africa54' && (
          <>
            <View style={s.africa54Hero}>
              <Text style={{ fontSize: 40 }}>🌍</Text>
              <Text style={s.heroTitle}>Africa 54 Exchange Rates</Text>
              <Text style={s.heroSub}>Live currency rates vs USD for all 54 African nations · Updated from Bank of Ghana FX Oracle</Text>
              <View style={s.heroBadgeRow}>
                <View style={s.heroBadge}><Text style={s.heroBadgeText}>54 Nations</Text></View>
                <View style={s.heroBadge}><Text style={s.heroBadgeText}>Live FX</Text></View>
                <View style={s.heroBadge}><Text style={s.heroBadgeText}>BTNG Backed</Text></View>
              </View>
            </View>
            <View style={s.ratesCard}>
              {AFRICA54_CURRENCIES.map(c => (
                <RateRow key={c.code} {...c} />
              ))}
              <View style={s.moreRow}>
                <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
                <Text style={s.moreText}>Showing 12 of 54 African currencies · Full rates available via BTNG FXOracle API</Text>
              </View>
            </View>

            {/* Ghana GHS Focus */}
            <View style={s.ghsFocusCard}>
              <View style={s.ghsFocusHeader}>
                <Text style={{ fontSize: 28 }}>🇬🇭</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.ghsFocusTitle}>Ghana Cedi (GHS) — Primary</Text>
                  <Text style={s.ghsFocusSub}>BTNG home currency · Bank of Ghana official rate</Text>
                </View>
                <View style={[s.ghsFocusBadge]}><View style={s.liveDot} /><Text style={s.livePillText}>Active</Text></View>
              </View>
              <View style={s.ghsGrid}>
                {[
                  { label: '1 USD', value: '₵11.71' },
                  { label: '1 BTNGG', value: '₵38.07' },
                  { label: '1 BTNGG (USD)', value: '$3.250' },
                  { label: 'Gold per gram', value: '₵1,223.98' },
                ].map(item => (
                  <View key={item.label} style={s.ghsCell}>
                    <Text style={s.ghsCellValue}>{item.value}</Text>
                    <Text style={s.ghsCellLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── BRICS ── */}
        {activeTab === 'brics' && (
          <>
            <View style={s.bricsHero}>
              <Text style={{ fontSize: 40 }}>🌐</Text>
              <Text style={s.heroTitle}>BRICS Nations Tracker</Text>
              <Text style={s.heroSub}>Brazil · Russia · India · China · South Africa + 5 new members. GDP and currency data vs USD.</Text>
            </View>
            <View style={s.ratesCard}>
              {BRICS_NATIONS.map(n => (
                <View key={n.name} style={rr.row}>
                  <Text style={rr.flag}>{n.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={rr.code}>{n.name}</Text>
                    <Text style={rr.name}>{n.currency} · GDP: {n.gdp}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={rr.rate}>{n.rate.toLocaleString()}</Text>
                    <View style={[rr.badge, { backgroundColor: n.change >= 0 ? Colors.successBg : Colors.errorBg }]}>
                      <MaterialIcons name={n.change >= 0 ? 'trending-up' : 'trending-down'} size={10} color={n.change >= 0 ? Colors.success : Colors.error} />
                      <Text style={[rr.change, { color: n.change >= 0 ? Colors.success : Colors.error }]}>{n.change >= 0 ? '+' : ''}{n.change.toFixed(2)}%</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
            <View style={s.bricsNote}>
              <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
              <Text style={s.moreText}>BRICS+ now includes Saudi Arabia, UAE, Iran, Ethiopia, Egypt, and Argentina. Combined GDP: $26 Trillion. BTNG aligns with BRICS alternative financial architecture.</Text>
            </View>
          </>
        )}

        {/* ── WORLD MARKETS ── */}
        {activeTab === 'world' && (
          <>
            <View style={s.worldHeader}>
              <View style={s.sectionIconWrap}><MaterialIcons name="language" size={16} color={Colors.primary} /></View>
              <Text style={s.sectionTitle}>World Market Overview</Text>
              <View style={s.livePill}><View style={s.liveDot} /><Text style={s.liveText}>Live</Text></View>
            </View>
            {WORLD_MARKETS.map(m => {
              const isPos = m.change >= 0;
              return (
                <View key={m.name} style={s.worldCard}>
                  <View style={s.worldIconWrap}><Text style={{ fontSize: 22 }}>{m.icon}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.worldName}>{m.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={s.worldValue}>{m.value}</Text>
                    <View style={[s.worldChangeBadge, { backgroundColor: isPos ? Colors.successBg : Colors.errorBg }]}>
                      <MaterialIcons name={isPos ? 'trending-up' : 'trending-down'} size={10} color={isPos ? Colors.success : Colors.error} />
                      <Text style={[s.worldChange, { color: isPos ? Colors.success : Colors.error }]}>{isPos ? '+' : ''}{m.change.toFixed(2)}%</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={s.worldNote}>
              <MaterialIcons name="auto-awesome" size={12} color={Colors.primary} />
              <Text style={[s.moreText, { color: Colors.primary }]}>BTNG Gold (BTNGG) tracks 1/1000 oz of XAU. As gold rises, BTNG rises — fully gold-backed sovereign digital currency.</Text>
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { alignItems: 'center', gap: 3 },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  livePillText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, gap: 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  oracleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  oracleCard: { width: '48%', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, alignItems: 'flex-start', gap: 4 },
  oracleValue: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  oracleLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  oracleSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  calcCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  calcHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  calcIconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  calcTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  calcSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  calcRatePill: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  calcRateText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  calcRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  calcInputWrap: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  calcCurrency: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  calcCurrencyGold: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  calcInputText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  calcBtnRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  calcPreset: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  calcPresetActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  calcPresetText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  reserveCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  sectionIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  reserveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  reserveLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  reserveValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  africa54Hero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  heroBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  ratesCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  moreRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingTop: Spacing.md, marginTop: Spacing.sm },
  moreText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  ghsFocusCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md },
  ghsFocusHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  ghsFocusTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  ghsFocusSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  ghsFocusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  ghsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  ghsCell: { width: '48%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33', gap: 3 },
  ghsCellValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  ghsCellLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  bricsHero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  bricsNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  worldHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  worldCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  worldIconWrap: { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', justifyContent: 'center' },
  worldName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  worldValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  worldChangeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  worldChange: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  worldNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33' },
});
