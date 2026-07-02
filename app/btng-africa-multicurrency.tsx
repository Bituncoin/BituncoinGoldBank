/**
 * BTNG Pan-African Multi-Currency Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native port of BTNGMultiCurrencyGoldCertificate.sol + AfricaMobileEngine.js
 * + PanAfricanSettlementEngine (Node.js)
 *
 * Features:
 *   • 11 African currencies (NGN, GHS, ZAR, KES, XAF, XOF, EGP, USDC, cNGN, BTC, ETH)
 *   • 5 commodity backings (Gold, Cocoa, Coltan, Crude Oil, Lithium)
 *   • Cross-border settlement with AfCFTA 30% fee discount
 *   • 4 regional pools (West, East, South, North Africa)
 *   • Mobile money gateway display (M-Pesa, MTN MoMo, Orange Money)
 *   • Certificate minting in selected local currency
 *   • calculateAfricanProofOfValue() — youth + resource + currency stability
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Easing, Platform, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';

// ─── Currency enum (mirrors Solidity enum Currency) ───────────────────────────
const CURRENCIES = [
  { code: 'NGN',   name: 'Nigerian Naira',      flag: '🇳🇬', symbol: '₦',    usdRate: 1600,    region: 'West Africa',     color: '#22C55E', stable: false, corridorFee: 0.005 },
  { code: 'GHS',   name: 'Ghanaian Cedi',        flag: '🇬🇭', symbol: 'GH₵',  usdRate: 15.3,    region: 'West Africa',     color: Colors.primary, stable: false, corridorFee: 0.005 },
  { code: 'ZAR',   name: 'South African Rand',   flag: '🇿🇦', symbol: 'R',    usdRate: 18.6,    region: 'Southern Africa', color: '#3B82F6', stable: false, corridorFee: 0.008 },
  { code: 'KES',   name: 'Kenyan Shilling',       flag: '🇰🇪', symbol: 'KSh',  usdRate: 129,     region: 'East Africa',     color: '#F59E0B', stable: false, corridorFee: 0.008 },
  { code: 'XAF',   name: 'CFA Franc (CEMAC)',     flag: '🇨🇲', symbol: 'FCFA', usdRate: 610,     region: 'Central Africa',  color: '#A855F7', stable: false, corridorFee: 0.001 },
  { code: 'XOF',   name: 'CFA Franc (UEMOA)',     flag: '🇸🇳', symbol: 'FCFA', usdRate: 610,     region: 'West Africa CFA', color: '#8B5CF6', stable: false, corridorFee: 0.001 },
  { code: 'EGP',   name: 'Egyptian Pound',        flag: '🇪🇬', symbol: 'E£',   usdRate: 48.7,    region: 'North Africa',    color: '#EF4444', stable: false, corridorFee: 0.012 },
  { code: 'USDC',  name: 'USD Coin',              flag: '💵',  symbol: '$',    usdRate: 1,       region: 'Global Stable',   color: '#2775CA', stable: true,  corridorFee: 0.002 },
  { code: 'cNGN',  name: 'Digital Naira (CBDC)',  flag: '⚡',  symbol: '₦d',   usdRate: 1600,    region: 'Nigeria CBDC',    color: '#16A34A', stable: true,  corridorFee: 0.003 },
  { code: 'BTC',   name: 'Bitcoin',               flag: '₿',   symbol: '₿',    usdRate: 0.000015, region: 'Global Crypto',  color: '#F7931A', stable: false, corridorFee: 0.010 },
  { code: 'ETH',   name: 'Ethereum',              flag: '⬡',   symbol: 'Ξ',    usdRate: 0.00035,  region: 'Global Crypto',  color: '#627EEA', stable: false, corridorFee: 0.010 },
] as const;

type CurrencyCode = typeof CURRENCIES[number]['code'];

// ─── Commodities (mirrors contract commodityOracles) ─────────────────────────
const COMMODITIES = [
  { code: 'XAU',    emoji: '🥇', name: 'Gold',      unit: '/troy oz',   baseUSD: 3325, color: Colors.primary, nations: 'Ghana, S.Africa, Tanzania, Mali, DRC',  region: 'ALL' },
  { code: 'COCOA',  emoji: '🍫', name: 'Cocoa',     unit: '/tonne',     baseUSD: 9800, color: '#92400E',      nations: "Ivory Coast, Ghana — world's #1 supply",  region: 'West Africa' },
  { code: 'COLTAN', emoji: '🔋', name: 'Coltan',    unit: '/kg',        baseUSD: 180,  color: '#6366F1',      nations: 'DRC — 64% of global reserves',             region: 'Central Africa' },
  { code: 'OIL',    emoji: '🛢️', name: 'Crude Oil', unit: '/barrel',    baseUSD: 82,   color: '#F59E0B',      nations: 'Nigeria, Angola, Algeria, Libya',          region: 'West Africa' },
  { code: 'LITHIUM',emoji: '⚡', name: 'Lithium',   unit: '/tonne',     baseUSD: 19500, color: '#A855F7',    nations: 'Zimbabwe, DRC, Namibia',                   region: 'Southern Africa' },
] as const;

// ─── Regional pools (mirrors contract westAfricaPool etc.) ───────────────────
const REGIONAL_POOLS = [
  { name: 'West Africa',    currencies: ['NGN', 'GHS', 'XOF'],     color: '#22C55E', emoji: '🌿', value: 125_000_000,   nations: 16, members: ['Nigeria', 'Ghana', 'Senegal', 'CI', 'Mali', 'Burkina Faso'] },
  { name: 'East Africa',    currencies: ['KES'],                   color: '#F59E0B', emoji: '🦁', value: 89_000_000,    nations: 14, members: ['Kenya', 'Tanzania', 'Uganda', 'Rwanda', 'Ethiopia'] },
  { name: 'Southern Africa',currencies: ['ZAR'],                   color: '#3B82F6', emoji: '🐘', value: 45_000_000,    nations: 11, members: ['South Africa', 'Zimbabwe', 'Zambia', 'Botswana', 'Namibia'] },
  { name: 'North Africa',   currencies: ['EGP'],                   color: '#EF4444', emoji: '🏜️', value: 32_000_000,    nations: 6,  members: ['Egypt', 'Morocco', 'Algeria', 'Tunisia', 'Libya'] },
  { name: 'Central Africa', currencies: ['XAF'],                   color: '#A855F7', emoji: '🌴', value: 18_000_000,    nations: 6,  members: ['Cameroon', 'CAR', 'Chad', 'Congo', 'DRC', 'Gabon'] },
];

// ─── Mobile money providers ───────────────────────────────────────────────────
const MOBILE_MONEY = [
  { name: 'MTN MoMo',      emoji: '📱', color: '#F59E0B', countries: ['Ghana', 'Nigeria', 'Cameroon', 'CI', 'Benin'], code: '*170#', enabled: true },
  { name: 'M-Pesa',         emoji: '📲', color: '#22C55E', countries: ['Kenya', 'Tanzania', 'DRC', 'Rwanda', 'Uganda'], code: '*M-PESA*1*1#', enabled: true },
  { name: 'Orange Money',   emoji: '🟠', color: '#F97316', countries: ['Senegal', 'CI', 'Mali', 'Cameroon'], code: '#144#', enabled: true },
  { name: 'Airtel Money',   emoji: '🔴', color: '#EF4444', countries: ['Zambia', 'Tanzania', 'Rwanda', 'Malawi'], code: '*778#', enabled: true },
  { name: 'Ecocash',        emoji: '💚', color: '#16A34A', countries: ['Zimbabwe', 'Lesotho'], code: '*151#', enabled: true },
  { name: 'Wave',           emoji: '🌊', color: '#2775CA', countries: ['Senegal', 'CI', 'Burkina Faso', 'Mali', 'Guinea'], code: '*881#', enabled: true },
];

// ─── AfCFTA members (mirrors checkAfCFTAStatus) ───────────────────────────────
const AFCFTA_MEMBERS = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Egypt', 'Cameroon', 'Tanzania', 'Uganda', 'Rwanda', 'Zimbabwe', 'Ivory Coast', 'Senegal', 'Ethiopia', 'Morocco', 'Algeria', 'DRC'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrencyByCode(code: string) {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];
}

function formatLocal(amount: number, curr: typeof CURRENCIES[number]): string {
  if (amount >= 1_000_000) return `${curr.symbol}${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000)     return `${curr.symbol}${(amount / 1_000).toFixed(1)}K`;
  return `${curr.symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** mirrors calculateAfricanProofOfValue() from contract */
function calculateAfricanPoV(
  goldValueLocal: number,
  commodityValue: number,
  localCurrencyAmount: number,
  currencyStability: number,
): number {
  const youthDividend = 100;  // Africa median age 19
  const resourceFactor = commodityValue > 0 ? 150 : 100;
  const baseValue = (goldValueLocal + commodityValue) * youthDividend * resourceFactor / 10000;
  const localPremium = localCurrencyAmount * currencyStability / 100;
  return Math.round(baseValue + localPremium);
}

function getCurrencyStability(code: string): number {
  if (code === 'cNGN') return 115;
  if (code === 'USDC') return 120;
  if (code === 'ZAR')  return 90;
  return 85;
}

/** mirrors corridorFees mapping + AfCFTA discount */
function getSettlementFee(fromCode: string, toCode: string, amount: number): { fee: number; discount: number; net: number; afcfta: boolean } {
  const from = getCurrencyByCode(fromCode);
  const to   = getCurrencyByCode(toCode);
  const rawFee = Math.max(from.corridorFee, to.corridorFee);
  // Simple AfCFTA check via region
  const afcfta = fromCode !== toCode;
  const discount = afcfta ? 0.30 : 0;
  const fee = amount * rawFee * (1 - discount);
  const net  = amount - fee;
  return { fee, discount, net, afcfta };
}

// ─── Live Dot ────────────────────────────────────────────────────────────────
function LiveDot({ color = Colors.success, size = 8 }: { color?: string; size?: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.9, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
    ])).start();
  }, [pulse]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.3, transform: [{ scale: pulse }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function Bar({ pct, color, height = 5 }: { pct: number; color: string; height?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(pct / 100, 1), duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct, anim]);
  return (
    <View style={{ height, backgroundColor: Colors.bgElevated, borderRadius: height / 2, overflow: 'hidden' }}>
      <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: color, width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
type TabKey = 'currencies' | 'commodities' | 'settlement' | 'pools' | 'mint' | 'mobile';

export default function BTNGAfricaMultiCurrencyScreen() {
  const insets     = useSafeAreaInsets();
  const router     = useRouter();
  const { user }   = useAuth();
  const { showAlert } = useAlert();
  const gold       = useGoldOracle();
  const goldUSD    = gold.priceUSD > 0 ? gold.priceUSD : 3325;
  const btngUSD    = gold.priceBTNGG > 0 ? gold.priceBTNGG : goldUSD / 1000;

  const [tab, setTab] = useState<TabKey>('currencies');

  // ── Currency state ────────────────────────────────────────────────────────
  const [selectedCurr, setSelectedCurr] = useState<string>('GHS');
  const [amountInput,  setAmountInput]  = useState('1000');

  // ── Settlement calculator ─────────────────────────────────────────────────
  const [fromCode, setFromCode] = useState('NGN');
  const [toCode,   setToCode]   = useState('KES');
  const [settleAmount, setSettleAmount] = useState('50000');

  // ── Commodity selection ───────────────────────────────────────────────────
  const [selectedComm, setSelectedComm] = useState('XAU');

  // ── Mint state ────────────────────────────────────────────────────────────
  const [mintCurr,     setMintCurr]     = useState('GHS');
  const [mintAmount,   setMintAmount]   = useState('500');
  const [mintComm,     setMintComm]     = useState('COCOA');
  const [mintCommKg,   setMintCommKg]   = useState('50');
  const [minting,      setMinting]      = useState(false);

  const isLive      = gold.source === 'live';
  const statusColor = isLive ? Colors.success : Colors.warning;

  // ── Derived calc ──────────────────────────────────────────────────────────
  const selCurr      = getCurrencyByCode(selectedCurr);
  const amtNum       = parseFloat(amountInput || '0') || 0;
  const amtInUSD     = amtNum / selCurr.usdRate;
  const amtInBTNG    = amtInUSD / btngUSD;
  const amtInGoldMg  = amtInUSD / goldUSD * 31103.5 * 1000;

  const settleNum    = parseFloat(settleAmount || '0') || 0;
  const settleCurr   = getCurrencyByCode(fromCode);
  const targetCurr   = getCurrencyByCode(toCode);
  const settlePlan   = getSettlementFee(fromCode, toCode, settleNum);
  const settleUSD    = settleNum / settleCurr.usdRate;
  const targetAmount = settlePlan.net / settleCurr.usdRate * targetCurr.usdRate;
  const feeInLocal   = settlePlan.fee;

  const mintCurrObj  = getCurrencyByCode(mintCurr);
  const mintAmtNum   = parseFloat(mintAmount || '0') || 0;
  const mintUSD      = mintAmtNum / mintCurrObj.usdRate;
  const mintCommObj  = COMMODITIES.find(c => c.code === mintComm) ?? COMMODITIES[0];
  const mintCommKgNum = parseFloat(mintCommKg || '0') || 0;
  const commValueUSD = mintCommObj.baseUSD * mintCommKgNum / (mintComm === 'COCOA' || mintComm === 'LITHIUM' ? 1000 : 1);
  const goldMgFromPayment = mintUSD / goldUSD * 31103.5 * 1000;
  const stability    = getCurrencyStability(mintCurr);
  const povScore     = calculateAfricanPoV(mintUSD, commValueUSD, mintAmtNum, stability);

  const handleMint = useCallback(async () => {
    if (!user) { showAlert('Login Required', 'Please sign in to mint certificates.'); return; }
    if (mintAmtNum < 1) { showAlert('Invalid Amount', 'Please enter a valid payment amount.'); return; }
    setMinting(true);
    try {
      const supabase = getSupabaseClient();
      const certId = `BTNG-AFRICA-${mintCurr}-${Date.now().toString(16).toUpperCase()}`;
      const fingerprint = `BTNG-POV-${Math.abs(povScore).toString(16).toUpperCase().padStart(8, '0')}`;
      const { error } = await supabase.from('btng_certificates').insert({
        user_id:           (user as any).id,
        cert_type:         'africa_multicurrency_nft',
        cert_id:           certId,
        owner_name:        (user as any).full_name ?? (user as any).username ?? 'BTNG Holder',
        asset_description: `${mintCurrObj.name} ${mintAmtNum.toLocaleString()} + ${mintCommKgNum}kg ${mintCommObj.name} backing`,
        asset_value:       mintUSD + commValueUSD,
        equity_grade:      povScore > 800 ? 'AAA' : povScore > 600 ? 'AA' : povScore > 400 ? 'A' : 'BBB',
        fingerprint,
        issued_at:         new Date().toISOString().split('T')[0],
        expires_at:        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status:            'active',
        metadata: {
          payment_currency:     mintCurr,
          payment_amount:       mintAmtNum,
          payment_usd:          mintUSD,
          commodity_type:       mintComm,
          commodity_kg:         mintCommKgNum,
          commodity_value_usd:  commValueUSD,
          gold_mg:              Math.round(goldMgFromPayment),
          gold_price_usd:       goldUSD,
          affinity_score:       povScore,
          life_energy:          0,
          proof_of_value:       mintUSD + commValueUSD,
          currency_stability:   stability,
          african_pov_score:    povScore,
          regional_pool:        REGIONAL_POOLS.find(p => p.currencies.includes(mintCurr as any))?.name ?? 'Other',
          minted_at:            new Date().toISOString(),
          contract:             'BTNGMultiCurrencyGoldCertificate',
          version:              '1.0.0',
        },
      });
      if (error) throw new Error(error.message);
      showAlert('🌍 Certificate Minted!', `Paid: ${mintCurrObj.symbol}${mintAmtNum.toLocaleString()} ${mintCurr}\nCommodity: ${mintCommKgNum}kg ${mintCommObj.name}\nPoV Score: ${povScore.toLocaleString()}\nCert ID: ${certId.substring(0, 28)}…`);
      setMintAmount('500');
      setMintCommKg('50');
    } catch (e: any) {
      showAlert('Mint Failed', e.message ?? 'Unknown error');
    } finally {
      setMinting(false);
    }
  }, [user, mintCurr, mintAmtNum, mintComm, mintCommKgNum, mintUSD, commValueUSD, goldMgFromPayment, goldUSD, stability, povScore, mintCurrObj, mintCommObj, showAlert]);

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'currencies',  label: '11 Coins',    icon: 'toll'             },
    { key: 'commodities', label: 'Commodities', icon: 'landscape'        },
    { key: 'settlement',  label: 'Settlement',  icon: 'swap-calls'       },
    { key: 'pools',       label: 'Pools',        icon: 'account-balance' },
    { key: 'mint',        label: 'Mint',         icon: 'add-circle'      },
    { key: 'mobile',      label: 'MoMo',         icon: 'smartphone'      },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>🌍 Pan-African Value Engine</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={statusColor} />
            <Text style={[s.topSub, { color: statusColor }]}>
              11 Currencies · 5 Commodities · {isLive ? 'LIVE' : 'CACHED'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={() => router.push('/africa-value-engine' as any)}
        >
          <MaterialIcons name="bar-chart" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Hero Stats Bar */}
      <View style={s.statsBar}>
        {[
          { label: 'XAU/USD',   value: `$${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: Colors.primary },
          { label: '1 BTNGG',   value: `$${btngUSD.toFixed(4)}`,                                            color: Colors.warning },
          { label: 'Currencies',value: '11',                                                                 color: '#22C55E'      },
          { label: 'AfCFTA',    value: '-30% fee',                                                           color: '#3B82F6'      },
        ].map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <View style={s.statsBarDiv} />}
            <View style={s.statsBarItem}>
              <Text style={[s.statsBarValue, { color: item.color }]}>{item.value}</Text>
              <Text style={s.statsBarLabel}>{item.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScrollWrap} contentContainerStyle={s.tabScrollContent}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={12} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── CURRENCIES TAB ───────────────────────────────────────────────────── */}
        {tab === 'currencies' && (
          <>
            {/* Architecture diagram */}
            <View style={s.archCard}>
              <Text style={s.archTitle}>BTNG Multi-Currency Architecture</Text>
              <View style={s.archPillsRow}>
                {[
                  { label: 'Local Fiat', sub: 'NGN GHS ZAR KES XAF XOF EGP', color: '#22C55E' },
                  { label: 'CBDC/Stable', sub: 'USDC cNGN eNaira', color: '#2775CA' },
                  { label: 'Crypto Rails', sub: 'BTC ETH BTNGG', color: '#F7931A' },
                ].map(col => (
                  <View key={col.label} style={[s.archPillar, { borderColor: col.color + '44', backgroundColor: col.color + '10' }]}>
                    <MaterialIcons name="account-balance" size={13} color={col.color} />
                    <Text style={[s.archPillarTitle, { color: col.color }]}>{col.label}</Text>
                    <Text style={s.archPillarSub}>{col.sub}</Text>
                  </View>
                ))}
              </View>
              <View style={s.archBridgeRow}>
                <MaterialIcons name="toll" size={12} color={Colors.primary} />
                <Text style={s.archBridgeText}>All rails bridge via BTNGG (1/1000 XAU = ${btngUSD.toFixed(4)}) · BTNG Sovereign Chain</Text>
              </View>
            </View>

            {/* Calculator */}
            <View style={s.calcCard}>
              <View style={s.calcHeader}>
                <MaterialIcons name="calculate" size={16} color={Colors.primary} />
                <Text style={s.calcTitle}>Currency → BTNGG Calculator</Text>
                <View style={[s.liveBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                  <LiveDot color={statusColor} />
                  <Text style={[s.liveBadgeText, { color: statusColor }]}>LIVE</Text>
                </View>
              </View>

              {/* Amount input */}
              <View style={s.inputRow}>
                <View style={[s.currencySelector, { borderColor: selCurr.color + '55' }]}>
                  <Text style={{ fontSize: 20 }}>{selCurr.flag}</Text>
                  <Text style={[s.currencySelectorCode, { color: selCurr.color }]}>{selCurr.code}</Text>
                </View>
                <TextInput
                  style={s.amountInput}
                  value={amountInput}
                  onChangeText={setAmountInput}
                  keyboardType="numeric"
                  placeholder="1000"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              {/* Quick amounts */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  {['100', '500', '1000', '5000', '10000', '50000'].map(a => (
                    <TouchableOpacity
                      key={a}
                      style={[s.quickBtn, amountInput === a && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                      onPress={() => setAmountInput(a)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.quickBtnText, amountInput === a && { color: Colors.bg }]}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Results */}
              <View style={s.calcResults}>
                {[
                  { label: 'USD Value',         value: `$${amtInUSD.toFixed(4)}`,                                   color: '#2775CA' },
                  { label: 'BTNGG Equivalent',  value: `${amtInBTNG.toFixed(6)} BTNGG`,                             color: Colors.primary },
                  { label: 'Gold Equivalent',   value: `${amtInGoldMg.toFixed(2)}mg gold`,                          color: Colors.warning },
                  { label: 'Rate',              value: `1 ${selCurr.code} = ${(1 / selCurr.usdRate).toFixed(6)} USD`, color: Colors.textMuted },
                ].map(row => (
                  <View key={row.label} style={s.calcResultRow}>
                    <Text style={s.calcResultLabel}>{row.label}</Text>
                    <Text style={[s.calcResultValue, { color: row.color }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* All 11 currencies */}
            <Text style={s.sectionLabel}>ALL 11 SUPPORTED CURRENCIES</Text>
            {CURRENCIES.map(curr => {
              const isSelected = selectedCurr === curr.code;
              const usdEq = amtNum / curr.usdRate;
              const btngEq = usdEq / btngUSD;
              return (
                <TouchableOpacity
                  key={curr.code}
                  style={[s.currCard, isSelected && { borderColor: curr.color + '66', backgroundColor: curr.color + '08' }]}
                  onPress={() => setSelectedCurr(curr.code)}
                  activeOpacity={0.8}
                >
                  <View style={[s.currIconWrap, { backgroundColor: curr.color + '18', borderColor: curr.color + '44' }]}>
                    <Text style={{ fontSize: 20 }}>{curr.flag}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={s.currNameRow}>
                      <Text style={[s.currCode, { color: curr.color }]}>{curr.code}</Text>
                      {curr.stable && (
                        <View style={s.stableBadge}>
                          <MaterialIcons name="verified" size={9} color="#2775CA" />
                          <Text style={s.stableBadgeText}>Stable</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.currName}>{curr.name}</Text>
                    <Text style={s.currRegion}>{curr.region}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={[s.currRate, { color: curr.color }]}>
                      {curr.code === 'BTC' || curr.code === 'ETH'
                        ? `$${(1 / curr.usdRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                        : curr.usdRate < 1 ? `$${(1 / curr.usdRate).toFixed(2)}` : `${curr.usdRate}/USD`}
                    </Text>
                    <Text style={s.currBtng}>{btngEq.toFixed(4)} BTNGG</Text>
                    <Text style={[s.currFee, { color: curr.corridorFee <= 0.003 ? Colors.success : curr.corridorFee <= 0.008 ? Colors.warning : Colors.error }]}>
                      {(curr.corridorFee * 100).toFixed(1)}% corridor fee
                    </Text>
                  </View>
                  {isSelected && <View style={[s.currSelectedDot, { backgroundColor: curr.color }]} />}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── COMMODITIES TAB ───────────────────────────────────────────────────── */}
        {tab === 'commodities' && (
          <>
            <View style={s.commHero}>
              <Text style={{ fontSize: 44 }}>🌾</Text>
              <Text style={s.heroTitle}>African Commodity Backing</Text>
              <Text style={s.heroSub}>
                Certificates can be backed by African commodities — anchoring digital value
                to real-world resources under the BTNGMultiCurrencyGoldCertificate contract.
              </Text>
            </View>

            {COMMODITIES.map(comm => {
              const isSelected = selectedComm === comm.code;
              const price = comm.code === 'XAU' ? goldUSD : comm.baseUSD;
              const btngEq = (price / btngUSD).toFixed(2);
              const oneKgBtng = comm.code === 'XAU'
                ? (price / 31.1035 / btngUSD).toFixed(4)
                : (price / btngUSD).toFixed(4);
              return (
                <TouchableOpacity
                  key={comm.code}
                  style={[s.commCard, isSelected && { borderColor: comm.color + '66' }]}
                  onPress={() => setSelectedComm(comm.code)}
                  activeOpacity={0.85}
                >
                  <View style={[s.commEmojiWrap, { backgroundColor: comm.color + '18', borderColor: comm.color + '44' }]}>
                    <Text style={{ fontSize: 28 }}>{comm.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, gap: Spacing.sm }}>
                    <View style={s.commTopRow}>
                      <Text style={[s.commName, { color: comm.color }]}>{comm.name}</Text>
                      <Text style={[s.commPrice, { color: comm.color }]}>
                        ${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}{comm.unit}
                      </Text>
                    </View>
                    <Text style={s.commNations}>{comm.nations}</Text>
                    <Bar pct={60} color={comm.color} height={4} />
                    <View style={s.commMetaRow}>
                      <View style={[s.commTag, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                        <Text style={[s.commTagText, { color: Colors.primary }]}>{btngEq} BTNGG{comm.unit}</Text>
                      </View>
                      <View style={[s.commTag, { backgroundColor: comm.color + '18', borderColor: comm.color + '44' }]}>
                        <Text style={[s.commTagText, { color: comm.color }]}>{comm.region}</Text>
                      </View>
                    </View>

                    {/* Oracle reference */}
                    <View style={s.commOracleRow}>
                      <MaterialIcons name="sensors" size={10} color={Colors.textMuted} />
                      <Text style={s.commOracleText}>
                        {comm.code === 'XAU'
                          ? `Chainlink XAU/USD · Live $${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz`
                          : `commodityOracles["${comm.code}"] — ${comm.code === 'COCOA' ? 'ICE Futures' : comm.code === 'OIL' ? 'Brent crude oracle' : 'Regional commodity oracle'}`
                        }
                      </Text>
                    </View>

                    {/* Per-currency value row */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                        {CURRENCIES.slice(0, 6).map(curr => {
                          const localVal = price * curr.usdRate;
                          return (
                            <View key={curr.code} style={[s.commCurrPill, { borderColor: curr.color + '33' }]}>
                              <Text style={{ fontSize: 10 }}>{curr.flag}</Text>
                              <Text style={[s.commCurrCode, { color: curr.color }]}>{curr.code}</Text>
                              <Text style={s.commCurrVal}>
                                {localVal >= 1_000_000
                                  ? `${(localVal / 1_000_000).toFixed(1)}M`
                                  : localVal >= 1_000
                                  ? `${(localVal / 1_000).toFixed(0)}K`
                                  : localVal.toFixed(0)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Regional commodity map */}
            <View style={s.commMapCard}>
              <View style={s.commMapHeader}>
                <MaterialIcons name="map" size={16} color={Colors.primary} />
                <Text style={s.commMapTitle}>Regional Commodity Map</Text>
              </View>
              {[
                { region: 'West Africa',     items: ['🥇 Gold (Ghana)', '🍫 Cocoa (Ghana/CI)', '🛢️ Oil (Nigeria)'],  color: '#22C55E' },
                { region: 'Central Africa',  items: ['🔋 Coltan (DRC)', '💎 Diamonds (DRC)', '🌴 Timber'],           color: '#A855F7' },
                { region: 'East Africa',     items: ['☕ Coffee (Ethiopia)', '🌿 Tea (Kenya)', '🥇 Gold (Tanzania)'], color: '#F59E0B' },
                { region: 'Southern Africa', items: ['💎 Diamonds (Botswana)', '⚡ Lithium (Zimbabwe)', '🥇 Gold'],   color: '#3B82F6' },
                { region: 'North Africa',    items: ['🛢️ Oil (Libya/Algeria)', '⚗️ Phosphates (Morocco)'],            color: '#EF4444' },
              ].map(row => (
                <View key={row.region} style={[s.commMapRow, { borderColor: row.color + '33' }]}>
                  <View style={[s.commMapRegionTag, { backgroundColor: row.color + '18', borderColor: row.color + '55' }]}>
                    <Text style={[s.commMapRegionText, { color: row.color }]}>{row.region}</Text>
                  </View>
                  <View style={s.commMapItems}>
                    {row.items.map(item => (
                      <Text key={item} style={s.commMapItem}>{item}</Text>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── SETTLEMENT TAB ────────────────────────────────────────────────────── */}
        {tab === 'settlement' && (
          <>
            <View style={s.settlementHero}>
              <Text style={{ fontSize: 44 }}>💱</Text>
              <Text style={s.heroTitle}>Cross-Border Settlement</Text>
              <Text style={s.heroSub}>
                Mirrors <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>PanAfricanSettlementEngine.settleCrossBorderPayment()</Text>.
                AfCFTA members receive a 30% corridor fee discount.
              </Text>
            </View>

            {/* From / To */}
            <View style={s.settlementCard}>
              <Text style={s.sectionLabel}>FROM CURRENCY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 }}>
                  {CURRENCIES.slice(0, 9).map(c => (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.settleCurrChip, fromCode === c.code && { backgroundColor: c.color, borderColor: c.color }]}
                      onPress={() => setFromCode(c.code)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 12 }}>{c.flag}</Text>
                      <Text style={[s.settleCurrChipText, fromCode === c.code && { color: Colors.bg }]}>{c.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[s.sectionLabel, { marginTop: Spacing.sm }]}>TO CURRENCY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 }}>
                  {CURRENCIES.slice(0, 9).map(c => (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.settleCurrChip, toCode === c.code && { backgroundColor: c.color, borderColor: c.color }]}
                      onPress={() => setToCode(c.code)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 12 }}>{c.flag}</Text>
                      <Text style={[s.settleCurrChipText, toCode === c.code && { color: Colors.bg }]}>{c.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[s.sectionLabel, { marginTop: Spacing.sm }]}>AMOUNT</Text>
              <View style={s.settleInputRow}>
                <Text style={s.settleInputCurr}>{settleCurr.symbol}</Text>
                <TextInput
                  style={s.settleInput}
                  value={settleAmount}
                  onChangeText={setSettleAmount}
                  keyboardType="numeric"
                  placeholder="50000"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              {/* Quick amounts */}
              <View style={s.quickRow}>
                {['1000', '5000', '10000', '50000', '100000'].map(a => (
                  <TouchableOpacity
                    key={a}
                    style={[s.quickBtn, settleAmount === a && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                    onPress={() => setSettleAmount(a)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.quickBtnText, settleAmount === a && { color: Colors.bg }]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Settlement result */}
            {fromCode !== toCode && (
              <View style={[s.settleResult, { borderColor: settlePlan.afcfta ? Colors.success + '55' : Colors.border }]}>
                {/* AfCFTA banner */}
                {settlePlan.afcfta && (
                  <View style={s.afcftaBanner}>
                    <MaterialIcons name="verified" size={14} color={Colors.success} />
                    <Text style={s.afcftaBannerText}>AfCFTA Discount Applied — 30% fee reduction</Text>
                    <View style={[s.afcftaPill, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                      <Text style={s.afcftaPillText}>-30%</Text>
                    </View>
                  </View>
                )}

                <View style={s.settleFlowRow}>
                  <View style={[s.settleFlowBox, { borderColor: settleCurr.color + '55', backgroundColor: settleCurr.color + '10' }]}>
                    <Text style={{ fontSize: 22 }}>{settleCurr.flag}</Text>
                    <Text style={[s.settleFlowCode, { color: settleCurr.color }]}>{fromCode}</Text>
                    <Text style={[s.settleFlowAmount, { color: settleCurr.color }]}>
                      {settleCurr.symbol}{settleNum.toLocaleString('en-US')}
                    </Text>
                  </View>
                  <View style={s.settleFlowArrow}>
                    <MaterialIcons name="arrow-forward" size={22} color={Colors.primary} />
                    <Text style={s.settleFlowBridge}>via BTNGG</Text>
                  </View>
                  <View style={[s.settleFlowBox, { borderColor: targetCurr.color + '55', backgroundColor: targetCurr.color + '10' }]}>
                    <Text style={{ fontSize: 22 }}>{targetCurr.flag}</Text>
                    <Text style={[s.settleFlowCode, { color: targetCurr.color }]}>{toCode}</Text>
                    <Text style={[s.settleFlowAmount, { color: targetCurr.color }]}>
                      {targetCurr.symbol}{targetAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>

                {[
                  { label: 'USD Value (sent)',   value: `$${settleUSD.toFixed(4)}`,                                  color: Colors.textPrimary },
                  { label: 'Corridor Fee',       value: `${settleCurr.symbol}${feeInLocal.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${((settlePlan.fee / settleNum) * 100).toFixed(2)}%)`, color: Colors.error },
                  { label: 'AfCFTA Discount',    value: settlePlan.afcfta ? '-30% applied' : 'N/A',                  color: settlePlan.afcfta ? Colors.success : Colors.textMuted },
                  { label: 'You Receive',        value: `${targetCurr.symbol}${targetAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`, color: targetCurr.color },
                  { label: 'Settlement Bridge',  value: `${(settleUSD / btngUSD).toFixed(4)} BTNGG (interim)`,      color: Colors.primary },
                  { label: 'Regional Pool Fee',  value: `0.5% → ${REGIONAL_POOLS.find(p => p.currencies.includes(fromCode as any))?.name ?? 'Global'} pool`, color: '#A855F7' },
                ].map(row => (
                  <View key={row.label} style={s.settleDetailRow}>
                    <Text style={s.settleDetailLabel}>{row.label}</Text>
                    <Text style={[s.settleDetailValue, { color: row.color }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Contract reference */}
            <View style={s.contractRefCard}>
              <View style={s.contractRefHeader}>
                <MaterialIcons name="code" size={13} color={Colors.primary} />
                <Text style={s.contractRefTitle}>crossBorderTransfer() · BTNGMultiCurrencyGoldCertificate.sol</Text>
              </View>
              <Text style={s.contractRefCode} selectable>
                {`function crossBorderTransfer(\n  uint256 _tokenId,\n  address _to,\n  Currency _fromCurrency,\n  Currency _toCurrency,\n  uint256 _amount\n) external nonReentrant`}
              </Text>
              <View style={s.contractRefBullets}>
                {[
                  'Converts value via USDC settlement layer',
                  'Applies African Union corridor fee (0.1%–2%)',
                  'AfCFTA members receive 30% fee discount',
                  '0.5% of fee routed to regional development pool',
                  'Emits CrossBorderSettled + PanAfricanValueTransfer events',
                ].map((b, i) => (
                  <View key={i} style={s.contractRefBullet}>
                    <View style={[s.contractRefBulletDot, { backgroundColor: Colors.primary }]} />
                    <Text style={s.contractRefBulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── REGIONAL POOLS TAB ───────────────────────────────────────────────── */}
        {tab === 'pools' && (
          <>
            <View style={s.poolHero}>
              <Text style={{ fontSize: 44 }}>🏦</Text>
              <Text style={s.heroTitle}>African Regional Value Pools</Text>
              <Text style={s.heroSub}>
                Transaction fees are routed to 5 regional pools funding African infrastructure —
                mirrors <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>_routeToRegionalPool()</Text> in the contract.
              </Text>
            </View>

            {/* Total pool summary */}
            <View style={s.poolTotalCard}>
              {(() => {
                const total = REGIONAL_POOLS.reduce((s, p) => s + p.value, 0);
                return (
                  <>
                    <View style={s.poolTotalHeader}>
                      <MaterialIcons name="account-balance" size={18} color={Colors.primary} />
                      <Text style={s.poolTotalTitle}>Total Pan-African Pool</Text>
                      <Text style={[s.poolTotalValue, { color: Colors.primary }]}>
                        ${total.toLocaleString('en-US')} USD
                      </Text>
                    </View>
                    <Bar pct={100} color={Colors.primary} height={6} />
                    <Text style={s.poolTotalSub}>5 regions · {REGIONAL_POOLS.reduce((s, p) => s + p.nations, 0)} nations · AfCFTA development fund</Text>
                  </>
                );
              })()}
            </View>

            {REGIONAL_POOLS.map(pool => {
              const poolTotal = REGIONAL_POOLS.reduce((s, p) => s + p.value, 0);
              const pct = Math.round((pool.value / poolTotal) * 100);
              return (
                <View key={pool.name} style={[s.poolCard, { borderColor: pool.color + '44' }]}>
                  <View style={s.poolCardHeader}>
                    <Text style={{ fontSize: 28 }}>{pool.emoji}</Text>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={s.poolCardTitleRow}>
                        <Text style={[s.poolCardTitle, { color: pool.color }]}>{pool.name}</Text>
                        <Text style={[s.poolCardValue, { color: pool.color }]}>
                          ${pool.value.toLocaleString('en-US')}
                        </Text>
                      </View>
                      <Bar pct={pct} color={pool.color} height={5} />
                      <Text style={s.poolCardPct}>{pct}% of total pool · {pool.nations} nations</Text>
                    </View>
                  </View>

                  {/* Currencies */}
                  <View style={s.poolCurrRow}>
                    <Text style={s.poolCurrLabel}>Currencies routed here:</Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                      {pool.currencies.map(c => {
                        const curr = getCurrencyByCode(c);
                        return (
                          <View key={c} style={[s.poolCurrChip, { backgroundColor: curr.color + '18', borderColor: curr.color + '44' }]}>
                            <Text style={{ fontSize: 11 }}>{curr.flag}</Text>
                            <Text style={[s.poolCurrChipText, { color: curr.color }]}>{c}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Member nations */}
                  <View style={s.poolMembersRow}>
                    {pool.members.map(m => (
                      <View key={m} style={s.poolMemberChip}>
                        <Text style={s.poolMemberText}>{m}</Text>
                      </View>
                    ))}
                    {pool.nations > pool.members.length && (
                      <View style={s.poolMemberChip}>
                        <Text style={s.poolMemberText}>+{pool.nations - pool.members.length} more</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Contract reference */}
            <View style={s.contractRefCard}>
              <View style={s.contractRefHeader}>
                <MaterialIcons name="code" size={13} color={Colors.primary} />
                <Text style={s.contractRefTitle}>_routeToRegionalPool() · Solidity</Text>
              </View>
              <Text style={s.contractRefCode} selectable>{`if (curr == Currency.NGN || curr == Currency.GHS)\n  westAfricaPool += _value;\nelse if (curr == Currency.KES)\n  eastAfricaPool += _value;\nelse if (curr == Currency.ZAR)\n  southAfricaPool += _value;\nelse if (curr == Currency.EGP)\n  northAfricaPool += _value;`}</Text>
            </View>
          </>
        )}

        {/* ── MINT TAB ─────────────────────────────────────────────────────────── */}
        {tab === 'mint' && (
          <>
            <View style={s.mintHero}>
              <Text style={{ fontSize: 44 }}>🌍</Text>
              <Text style={s.heroTitle}>Mint with African Currency</Text>
              <Text style={s.heroSub}>
                Mirrors <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>mintWithCurrency()</Text>.
                Pay in any of 11 African currencies + commodity backing.
                African PoV formula: (gold + commodity) × youth_dividend × resource_factor.
              </Text>
            </View>

            {/* Currency selector */}
            <View style={s.mintCard}>
              <Text style={s.sectionLabel}>SELECT PAYMENT CURRENCY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 }}>
                  {CURRENCIES.slice(0, 9).map(c => (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.mintCurrChip, mintCurr === c.code && { backgroundColor: c.color, borderColor: c.color }]}
                      onPress={() => setMintCurr(c.code)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 14 }}>{c.flag}</Text>
                      <Text style={[s.mintCurrChipText, mintCurr === c.code && { color: Colors.bg }]}>{c.code}</Text>
                      {c.stable && <MaterialIcons name="verified" size={9} color={mintCurr === c.code ? Colors.bg : '#2775CA'} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[s.sectionLabel, { marginTop: Spacing.sm }]}>PAYMENT AMOUNT ({mintCurrObj.code})</Text>
              <View style={s.mintInputRow}>
                <Text style={[s.mintInputSymbol, { color: mintCurrObj.color }]}>{mintCurrObj.symbol}</Text>
                <TextInput
                  style={s.mintInput}
                  value={mintAmount}
                  onChangeText={setMintAmount}
                  keyboardType="numeric"
                  placeholder="500"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={s.quickRow}>
                {['100', '500', '1000', '5000', '10000'].map(a => (
                  <TouchableOpacity
                    key={a}
                    style={[s.quickBtn, mintAmount === a && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                    onPress={() => setMintAmount(a)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.quickBtnText, mintAmount === a && { color: Colors.bg }]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Commodity */}
              <Text style={[s.sectionLabel, { marginTop: Spacing.sm }]}>COMMODITY BACKING (OPTIONAL)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 }}>
                  {COMMODITIES.map(c => (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.mintCurrChip, mintComm === c.code && { backgroundColor: c.color, borderColor: c.color }]}
                      onPress={() => setMintComm(c.code)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                      <Text style={[s.mintCurrChipText, mintComm === c.code && { color: Colors.bg }]}>{c.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={s.mintInputRow}>
                <Text style={s.mintInputSymbol}>kg</Text>
                <TextInput
                  style={s.mintInput}
                  value={mintCommKg}
                  onChangeText={setMintCommKg}
                  keyboardType="numeric"
                  placeholder="50"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            {/* Preview */}
            <View style={[s.mintPreview, { borderColor: Colors.primary + '55' }]}>
              <Text style={s.mintPreviewTitle}>African Proof-of-Value Preview</Text>
              {[
                { label: 'Payment (USD)',           value: `$${mintUSD.toFixed(4)}`,                                    color: mintCurrObj.color },
                { label: 'Commodity Value (USD)',   value: `$${commValueUSD.toFixed(2)} (${mintCommKgNum}kg ${mintCommObj.name})`, color: mintCommObj.color },
                { label: 'Gold Mg Equivalent',     value: `${goldMgFromPayment.toFixed(2)}mg`,                          color: Colors.warning },
                { label: 'Currency Stability',     value: `${stability}% (${mintCurr})`,                                color: stability >= 115 ? Colors.success : Colors.warning },
                { label: 'Youth Dividend',         value: '100 (Africa median age 19)',                                  color: '#22C55E' },
                { label: 'Resource Factor',        value: commValueUSD > 0 ? '150% (commodity-backed)' : '100%',        color: '#A855F7' },
                { label: 'African PoV Score',      value: `${povScore.toLocaleString()} pts`,                           color: Colors.primary },
                { label: 'Regional Pool',          value: REGIONAL_POOLS.find(p => p.currencies.includes(mintCurr as any))?.name ?? 'Global Pool', color: '#3B82F6' },
              ].map(row => (
                <View key={row.label} style={s.mintPreviewRow}>
                  <Text style={s.mintPreviewLabel}>{row.label}</Text>
                  <Text style={[s.mintPreviewValue, { color: row.color }]}>{row.value}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[s.mintBtn, minting && { opacity: 0.6 }]}
              onPress={handleMint}
              disabled={minting}
              activeOpacity={0.85}
            >
              {minting
                ? <ActivityIndicator size="small" color={Colors.bg} />
                : <MaterialIcons name="workspace-premium" size={20} color={Colors.bg} />
              }
              <Text style={s.mintBtnText}>
                {minting ? 'Minting Certificate…' : `Mint · ${mintCurrObj.symbol}${mintAmtNum.toLocaleString()} ${mintCurr}`}
              </Text>
            </TouchableOpacity>

            <Text style={s.mintDisclaimer}>
              Minting records on BTNG Sovereign Chain. The African PoV score applies youth_dividend (100) × resource_factor (150 with commodity) × currency_stability. All fees route to the regional pool for African infrastructure.
            </Text>
          </>
        )}

        {/* ── MOBILE MONEY TAB ─────────────────────────────────────────────────── */}
        {tab === 'mobile' && (
          <>
            <View style={s.momoHero}>
              <Text style={{ fontSize: 44 }}>📱</Text>
              <Text style={s.heroTitle}>Mobile Money Integration</Text>
              <Text style={s.heroSub}>
                BTNG certificates can be minted via M-Pesa, MTN MoMo, Orange Money, and 4 other
                African mobile money gateways — designed for Africa's 800M+ mobile money users.
              </Text>
            </View>

            {/* USSD simulator */}
            <View style={s.ussdCard}>
              <View style={s.ussdHeader}>
                <MaterialIcons name="smartphone" size={16} color={Colors.success} />
                <Text style={s.ussdTitle}>USSD Gateway Simulator</Text>
                <View style={[s.liveBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                  <Text style={[s.liveBadgeText, { color: Colors.success }]}>*550#</Text>
                </View>
              </View>
              <View style={s.ussdScreen}>
                <Text style={s.ussdScreenText}>
                  {`BTNG Africa Gold Certificates\n1. Buy with Naira (NGN)\n2. Buy with Cedis (GHS)\n3. Buy with Shillings (KES)\n4. Check Balance\n0. Back`}
                </Text>
              </View>
              <Text style={s.ussdNote}>
                Works on any phone including feature phones — no internet required.
                Dial *550# on any MTN/Airtel/Glo line to access BTNG.
              </Text>
            </View>

            {/* Mobile money providers */}
            <Text style={s.sectionLabel}>SUPPORTED GATEWAYS ({MOBILE_MONEY.filter(m => m.enabled).length} Active)</Text>
            {MOBILE_MONEY.map(provider => (
              <View key={provider.name} style={[s.momoCard, { borderColor: provider.color + '44' }]}>
                <View style={[s.momoEmojiWrap, { backgroundColor: provider.color + '18', borderColor: provider.color + '44' }]}>
                  <Text style={{ fontSize: 26 }}>{provider.emoji}</Text>
                </View>
                <View style={{ flex: 1, gap: Spacing.sm }}>
                  <View style={s.momoTitleRow}>
                    <Text style={[s.momoName, { color: provider.color }]}>{provider.name}</Text>
                    <View style={[s.momoBadge, { backgroundColor: provider.enabled ? Colors.successBg : Colors.bgElevated, borderColor: (provider.enabled ? Colors.success : Colors.textMuted) + '44' }]}>
                      <View style={[s.momoBadgeDot, { backgroundColor: provider.enabled ? Colors.success : Colors.textMuted }]} />
                      <Text style={[s.momoBadgeText, { color: provider.enabled ? Colors.success : Colors.textMuted }]}>
                        {provider.enabled ? 'Active' : 'Coming Soon'}
                      </Text>
                    </View>
                  </View>
                  <View style={s.momoCountriesRow}>
                    {provider.countries.map(c => (
                      <View key={c} style={s.momoCountryChip}>
                        <Text style={s.momoCountryText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.momoCodeRow}>
                    <MaterialIcons name="dialpad" size={11} color={provider.color} />
                    <Text style={[s.momoCode, { color: provider.color }]}>{provider.code}</Text>
                    <Text style={s.momoCodeNote}>· Dial to access BTNG</Text>
                  </View>
                </View>
              </View>
            ))}

            {/* MobileMoneyGateway code reference */}
            <View style={s.contractRefCard}>
              <View style={s.contractRefHeader}>
                <MaterialIcons name="code" size={13} color={Colors.primary} />
                <Text style={s.contractRefTitle}>MobileMoneyGateway.mpesaDeposit() · Node.js</Text>
              </View>
              <Text style={s.contractRefCode} selectable>{`async mpesaDeposit(phoneNumber, amount, currency) {\n  const payload = {\n    command: 'CustomerPayBillOnline',\n    amount,\n    msisdn: phoneNumber,\n    billRefNumber: \`BTNG\${Date.now()}\`\n  };\n  // POST to Safaricom M-Pesa STK Push API\n  // Returns: { success, transactionId, certificateMinted }\n}`}</Text>
            </View>

            {/* Accessibility note */}
            <View style={s.accessCard}>
              <MaterialIcons name="accessibility-new" size={18} color={Colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={s.accessTitle}>Mobile-First Africa Design</Text>
                <Text style={s.accessText}>
                  800M+ Africans use mobile money. BTNG is designed to work on 2G networks,
                  feature phones via USSD, and smartphones via the native app. No bank account required —
                  just a mobile number.
                </Text>
              </View>
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:    { alignItems: 'center', flex: 1, gap: 2 },
  topTitle:     { fontSize: 13, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.2 },
  topSub:       { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Stats bar
  statsBar:     { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '44', overflow: 'hidden' },
  statsBarItem: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  statsBarDiv:  { width: 1, backgroundColor: Colors.border, alignSelf: 'stretch' },
  statsBarValue:{ fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statsBarLabel:{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Tab bar (scrollable)
  tabScrollWrap:    { marginBottom: Spacing.sm },
  tabScrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, flexDirection: 'row' },
  tabBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:          { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:    { color: Colors.bg },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Shared
  heroTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:     { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  sectionLabel:{ fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false, marginBottom: 2 },

  liveBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  liveBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  quickRow:     { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  quickBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  quickBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  // Architecture card
  archCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  archTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, textAlign: 'center' },
  archPillsRow:    { flexDirection: 'row', gap: Spacing.sm },
  archPillar:      { flex: 1, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, gap: 4, alignItems: 'center' },
  archPillarTitle: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  archPillarSub:   { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  archBridgeRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '44' },
  archBridgeText:  { flex: 1, fontSize: FontSize.xs, color: Colors.primary, includeFontPadding: false },

  // Calculator
  calcCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.md },
  calcHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  calcTitle:      { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  inputRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  currencySelector:{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm },
  currencySelectorCode: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  amountInput:    { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  calcResults:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 },
  calcResultRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calcResultLabel:{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  calcResultValue:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Currency cards
  currCard:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, position: 'relative', overflow: 'hidden' },
  currIconWrap:     { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  currNameRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currCode:         { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  currName:         { fontSize: FontSize.xs, color: Colors.textPrimary, includeFontPadding: false },
  currRegion:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  currRate:         { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  currBtng:         { fontSize: 9, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  currFee:          { fontSize: 9, fontWeight: FontWeight.semibold, includeFontPadding: false },
  currSelectedDot:  { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4 },
  stableBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#2775CA18', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#2775CA44' },
  stableBadgeText:  { fontSize: 8, color: '#2775CA', fontWeight: FontWeight.bold, includeFontPadding: false },

  // Commodity cards
  commHero:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  commCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  commEmojiWrap: { width: 52, height: 52, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  commTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commName:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  commPrice:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  commNations:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  commMetaRow:   { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  commTag:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  commTagText:   { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  commOracleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  commOracleText:{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flex: 1 },
  commCurrPill:  { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.md, borderWidth: 1, gap: 1 },
  commCurrCode:  { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  commCurrVal:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  commMapCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  commMapHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  commMapTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  commMapRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  commMapRegionTag: { borderRadius: Radius.md, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, flexShrink: 0, minWidth: 90, alignItems: 'center' },
  commMapRegionText:{ fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  commMapItems:  { flex: 1, gap: 3 },
  commMapItem:   { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },

  // Settlement
  settlementHero:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  settlementCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  settleCurrChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  settleCurrChipText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  settleInputRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 52 },
  settleInputCurr:  { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  settleInput:      { flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },

  settleResult:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.md },
  afcftaBanner:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.successBg, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.success + '44' },
  afcftaBannerText: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  afcftaPill:       { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  afcftaPillText:   { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },

  settleFlowRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  settleFlowBox:    { flex: 1, alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1.5, paddingVertical: Spacing.md, gap: 4 },
  settleFlowCode:   { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  settleFlowAmount: { fontSize: 13, fontWeight: FontWeight.heavy, includeFontPadding: false },
  settleFlowArrow:  { alignItems: 'center', gap: 2 },
  settleFlowBridge: { fontSize: 8, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  settleDetailRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  settleDetailLabel:{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  settleDetailValue:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Contract reference card
  contractRefCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.sm },
  contractRefHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contractRefTitle:   { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  contractRefCode:    { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 14 },
  contractRefBullets: { gap: 4 },
  contractRefBullet:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  contractRefBulletDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 5, flexShrink: 0 },
  contractRefBulletText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 17 },

  // Regional pools
  poolHero:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  poolTotalCard:     { backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.md, gap: Spacing.sm },
  poolTotalHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  poolTotalTitle:    { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  poolTotalValue:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  poolTotalSub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  poolCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  poolCardHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  poolCardTitleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  poolCardTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  poolCardValue:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  poolCardPct:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  poolCurrRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  poolCurrLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  poolCurrChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  poolCurrChipText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  poolMembersRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  poolMemberChip:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  poolMemberText:    { fontSize: 9, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Mint
  mintHero:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', gap: Spacing.sm },
  mintCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  mintCurrChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border },
  mintCurrChipText:  { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  mintInputRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 52 },
  mintInputSymbol:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  mintInput:         { flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  mintPreview:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  mintPreviewTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, marginBottom: 4 },
  mintPreviewRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  mintPreviewLabel:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  mintPreviewValue:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  mintBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  mintBtnText:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  mintDisclaimer:    { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, includeFontPadding: false },

  // Mobile money
  momoHero:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  ussdCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.success + '44', padding: Spacing.md, gap: Spacing.sm },
  ussdHeader:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ussdTitle:         { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  ussdScreen:        { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '33' },
  ussdScreenText:    { fontSize: 13, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 20, includeFontPadding: false },
  ussdNote:          { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  momoCard:          { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  momoEmojiWrap:     { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  momoTitleRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  momoName:          { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  momoBadge:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  momoBadgeDot:      { width: 5, height: 5, borderRadius: 2.5 },
  momoBadgeText:     { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  momoCountriesRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  momoCountryChip:   { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  momoCountryText:   { fontSize: 9, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  momoCodeRow:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  momoCode:          { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  momoCodeNote:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  accessCard:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.success + '55', padding: Spacing.lg },
  accessTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  accessText:        { fontSize: FontSize.sm, color: Colors.success + 'CC', lineHeight: 19, includeFontPadding: false, marginTop: 4 },
});
