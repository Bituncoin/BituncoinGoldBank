import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { CoinCard, MiniChart, SectionHeader } from '@/components';
import { FXTicker } from '@/components/feature/FXTicker';
import { COINS, BTNG_PRICE, BTNG_CHANGE_24H, CHART_POINTS_24H } from '@/constants/mockData';
import { Screen } from '@/constants/theme';
import { useAutoRefresh } from '@/hooks/useLivePoll';
import { getSupabaseClient } from '@/template';

const CATEGORIES = ['All', 'Owned', 'Trending', 'DeFi', 'Stablecoins'];

export default function MarketScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { coins, totalValue, pricesLoading, pricesLastUpdated, pricesSource, refreshPrices } = useWallet();
  const { watchlist, addToWatchlist, removeFromWatchlist, isWatched, activeNotification, alerts } = useWatchlist();
  const { getRate: getFxRate } = useExchangeRateContext();
  // Live GHS/USD — falls back to 11.8 (static fallback from africanCurrencies) if API unavailable
  const ghsPerUsd = getFxRate('GHS') > 1 ? getFxRate('GHS') : 11.8;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  // ── Mining stats ────────────────────────────────────────────────────────────
  const [miningStats, setMiningStats] = useState<{ totalShares: number; activeMiners: number; latestBlock: number } | null>(null);
  const [miningLoading, setMiningLoading] = useState(false);

  const fetchMiningStats = async (silent = false) => {
    if (!silent) setMiningLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('mining_shares')
        .select('miner_address, block_height');
      if (!error && data) {
        const totalShares   = data.length;
        const activeMiners  = new Set(data.map((r: any) => r.miner_address)).size;
        const latestBlock   = data.reduce((mx: number, r: any) => Math.max(mx, r.block_height ?? 0), 0);
        setMiningStats({ totalShares, activeMiners, latestBlock });
      }
    } catch { /* non-critical — silently ignore */ } finally {
      if (!silent) setMiningLoading(false);
    }
  };

  // Initial fetch + 60s auto-refresh
  useEffect(() => {
    fetchMiningStats();
    const t = setInterval(() => fetchMiningStats(true), 60_000);
    return () => clearInterval(t);
  }, []);

  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);
  const isTablet = dims.width >= 768;
  const isDesktop = dims.width >= 1024;
  const hPad = isDesktop ? Spacing.xxl * 2 : isTablet ? Spacing.xxl : Spacing.xl;

  // ── Auto-refresh market data every 30s ─────────────────────────────────
  const { countdown: marketCountdown } = useAutoRefresh(() => {
    refreshPrices();
    refreshGold();
  }, 30_000);

  // ── Live BTNG price from gold oracle ────────────────────────────────────
  const {
    priceUSD: goldPriceUSD,
    priceBTNGG,
    pricePerGram,
    pricePerKilo,
    changePct24h: goldChange24h,
    sparkline: goldSparkline,
    source: goldSource,
    loading: goldLoading,
    refresh: refreshGold,
  } = useGoldOracle();

  // Three gold unit prices — derived directly from oracle, never recomputed
  const TROY = 31.1035;
  const liveXAU = goldPriceUSD > 0 ? goldPriceUSD : 4_329.45;
  const liveBtngg = liveXAU / 1000; // BTNGG  = 1/1000 oz
  const liveBtngG = liveXAU / TROY; // BTNG-G = 1 gram
  const liveBtngKg = liveXAU * 32.1507; // BTNG-KG = 1 kg

  const liveBtngPrice = liveBtngg;
  // Use oracle's real 24h change; show 0 until the first oracle response resolves
  const liveBtngChange = goldChange24h;
  const liveChartPoints = goldSparkline.length >= 4
    ? goldSparkline.map(v => v / 1000)
    : CHART_POINTS_24H;
  const isPositive = liveBtngChange >= 0;

  const isLive = goldSource === 'live' || pricesSource === 'live';
  const lastTs = pricesLastUpdated
    ? pricesLastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const userData = user as Record<string, any>;

  const filtered = coins.filter(c => {
    const matchSearch = c.symbol.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase());
    if (category === 'Owned') return matchSearch && c.isOwned;
    if (category === 'Stablecoins') return matchSearch && ['USDT'].includes(c.symbol);
    if (category === 'DeFi') return matchSearch && ['ADA', 'AVAX', 'DOT', 'MATIC', 'SOL'].includes(c.symbol);
    return matchSearch;
  });

  // 24h PnL from live prices (rough estimate: sum of owned coins × price change)
  const livePortfolioPnl = coins
    .filter(c => c.isOwned && c.balance > 0)
    .reduce((sum, c) => {
      const pnl = c.balance * c.price * (c.change24h / 100);
      return sum + pnl;
    }, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning,</Text>
            <Text style={styles.userName}>{userData?.full_name ?? userData?.username ?? 'Trader'} 👋</Text>
          </View>
          <View style={styles.headerActions}>
            {/* Live data indicator */}
            <TouchableOpacity
              style={[styles.liveIndicatorBtn, { borderColor: isLive ? Colors.success + '55' : Colors.warning + '55' }]}
              onPress={() => { refreshPrices(); refreshGold(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {pricesLoading || goldLoading
                ? <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
                : <View style={[styles.liveDot, { backgroundColor: isLive ? Colors.success : Colors.warning }]} />
              }
              <Text style={[styles.liveText, { color: isLive ? Colors.success : Colors.warning }]}>
                {pricesLoading ? 'Updating…' : isLive ? `LIVE${lastTs ? ' · ' + lastTs : ''}` : `Refresh ${marketCountdown}s`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/watchlist')}>
              <MaterialIcons name="bookmark" size={20} color={Colors.primary} />
              {alerts.filter(a => a.status === 'active').length > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{alerts.filter(a => a.status === 'active').length}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')}>
              <MaterialIcons name="notifications-none" size={22} color={Colors.textSecondary} />
              {activeNotification && <View style={styles.bellDot} />}
            </TouchableOpacity>
            <Image source={require('@/assets/images/btng_coin.jpg')} style={styles.avatar} contentFit="cover" transition={200} />
          </View>
        </View>

        {/* BTNG Hero Card — LIVE */}
        <TouchableOpacity style={[styles.heroCard, isTablet && styles.heroCardTablet]} onPress={() => router.push('/trade')} activeOpacity={0.85}>
          <View style={styles.heroBg} />
          <View style={styles.heroTop}>
            <View>
              <View style={styles.heroTagRow}>
                <View style={styles.heroTag}><Text style={styles.heroTagText}>BTNG GOLD COIN · BTNGG</Text></View>
                <View style={[styles.dataSourceBadge, { backgroundColor: isLive ? Colors.successBg : Colors.warningBg, borderColor: isLive ? Colors.success + '44' : Colors.warning + '44' }]}>
                  <View style={[styles.dataSourceDot, { backgroundColor: isLive ? Colors.success : Colors.warning }]} />
                  <Text style={[styles.dataSourceText, { color: isLive ? Colors.success : Colors.warning }]}>
                    {goldSource === 'live' ? 'LIVE ORACLE' : goldSource === 'cached' ? 'CACHED' : 'DEMO'}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>${liveBtngPrice.toFixed(4)}</Text>
              <Text style={styles.heroPriceUnit}>per 1/1000 oz XAU · Gold ${liveXAU.toLocaleString('en-US', { maximumFractionDigits: 2 })}/oz</Text>
              <View style={[styles.changeBadge, { backgroundColor: isPositive ? Colors.successBg : Colors.errorBg }]}>
                <MaterialIcons name={isPositive ? 'trending-up' : 'trending-down'} size={14} color={isPositive ? Colors.success : Colors.error} />
                <Text style={[styles.changeText, { color: isPositive ? Colors.success : Colors.error }]}>
                  {isPositive ? '+' : ''}{liveBtngChange.toFixed(3)}% today
                </Text>
              </View>
            </View>
            <MiniChart data={liveChartPoints} width={120} height={60} color={Colors.primary} />
          </View>
          {/* Three BTNG unit reference strip */}
          <View style={styles.goldUnitsStrip}>
            <View style={styles.goldUnit}>
              <Text style={styles.goldUnitLabel}>BTNGG (1/1000 oz)</Text>
              <Text style={styles.goldUnitVal}>${liveBtngg.toFixed(4)}</Text>
            </View>
            <View style={styles.goldUnitDiv} />
            <View style={styles.goldUnit}>
              <Text style={styles.goldUnitLabel}>BTNG-G (1 gram)</Text>
              <Text style={styles.goldUnitVal}>${liveBtngG.toFixed(2)}</Text>
            </View>
            <View style={styles.goldUnitDiv} />
            <View style={styles.goldUnit}>
              <Text style={styles.goldUnitLabel}>BTNG-KG (1 kg)</Text>
              <Text style={styles.goldUnitVal}>${liveBtngKg.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
            </View>
            <View style={styles.goldUnitDiv} />
            <View style={styles.goldUnit}>
              <Text style={styles.goldUnitLabel}>GHS/oz (live)</Text>
              <Text style={styles.goldUnitVal}>GH₵{(liveXAU * ghsPerUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Portfolio</Text>
              <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>BTNGG Balance</Text>
              <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{(coins.find(c => c.id === 'btng')?.balance ?? 0).toLocaleString()} BTNGG</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>24h PnL</Text>
              <Text style={[styles.heroStatValue, { color: livePortfolioPnl >= 0 ? Colors.success : Colors.error }]}>
                {livePortfolioPnl >= 0 ? '+' : ''}${Math.abs(livePortfolioPnl).toFixed(2)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* FX Ticker strip — live African currency rates */}
        <FXTicker />

        {/* Quick Actions */}
        <View style={[styles.quickActions, isTablet && styles.quickActionsTablet]}>
          {[
            { icon: 'arrow-downward', label: 'Deposit', route: '/deposit' },
            { icon: 'arrow-upward', label: 'Withdraw', route: '/withdraw' },
            { icon: 'swap-horiz', label: 'Trade', route: '/trade' },
            { icon: 'people', label: 'Copy', route: '/copy-trading' },
            { icon: 'science', label: 'Practice', route: '/practice' },
          ].map(a => (
            <TouchableOpacity key={a.label} style={[styles.quickBtn, isTablet && styles.quickBtnTablet]} onPress={() => router.push(a.route as any)} activeOpacity={0.75}>
              <View style={[styles.quickIcon, isTablet && styles.quickIconTablet]}>
                <MaterialIcons name={a.icon as any} size={20} color={Colors.primary} />
              </View>
              <Text style={[styles.quickLabel, isTablet && styles.quickLabelTablet]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── BTNG Gold Factory Link Bar ─────────────────────────────── */}
        <View style={styles.factoryBar}>
          <TouchableOpacity
            style={styles.factoryMainBtn}
            onPress={() => router.push('/btng-gold-factory' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.factoryIconWrap}>
              <Text style={{ fontSize: 22 }}>🏭</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.factoryTitle}>BTNG Gold Factory</Text>
              <Text style={styles.factorySub}>Infinity Gold Producer · Stratum V2 Mining Pool</Text>
            </View>
            <View style={styles.factoryLiveDotWrap}>
              <View style={styles.factoryLiveDot} />
            </View>
            <MaterialIcons name="chevron-right" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <View style={styles.factoryDivider} />
          <View style={styles.factorySecondRow}>
            <TouchableOpacity
              style={styles.factorySmallBtn}
              onPress={() => router.push('/btng-gold-factory-leaderboard' as any)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="emoji-events" size={15} color="#FFD700" />
              <Text style={[styles.factorySmallText, { color: '#FFD700' }]}>Leaderboard</Text>
            </TouchableOpacity>
            <View style={styles.factorySmallDivider} />
            <TouchableOpacity
              style={styles.factorySmallBtn}
              onPress={() => router.push('/btng-ports-status' as any)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="sensors" size={15} color="#60A5FA" />
              <Text style={[styles.factorySmallText, { color: '#60A5FA' }]}>Port Health</Text>
            </TouchableOpacity>
            <View style={styles.factorySmallDivider} />
            <TouchableOpacity
              style={styles.factorySmallBtn}
              onPress={() => router.push('/btng-miner' as any)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="memory" size={15} color="#D4A017" />
              <Text style={[styles.factorySmallText, { color: '#D4A017' }]}>BTNG Miner</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Mining Stats Mini-Card ─────────────────────────────────────────── */}
        {(miningStats !== null || miningLoading) ? (
          <View style={styles.miningCard}>
            <View style={styles.miningCardLeft}>
              <Text style={{ fontSize: 16 }}>⛏️</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.miningCardTitle}>Live Mining Stats</Text>
                <Text style={styles.miningCardSub}>mining_shares · auto-refreshes every 60s</Text>
              </View>
              {miningLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
              ) : (
                <View style={styles.miningLiveDot} />
              )}
            </View>
            <View style={styles.miningStatsRow}>
              {[
                { label: 'Total Shares',   value: miningStats?.totalShares.toLocaleString()  ?? '…', color: Colors.primary, icon: 'bolt'  as const },
                { label: 'Active Miners',  value: miningStats?.activeMiners.toLocaleString() ?? '…', color: '#8B5CF6',       icon: 'group' as const },
                { label: 'Latest Block',   value: miningStats?.latestBlock  ? `#${miningStats.latestBlock.toLocaleString()}` : '…', color: '#22C55E', icon: 'link' as const },
              ].map(stat => (
                <View key={stat.label} style={[styles.miningStatCell, { borderColor: stat.color + '33' }]}>
                  <MaterialIcons name={stat.icon} size={13} color={stat.color} />
                  <Text style={[styles.miningStatVal, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={styles.miningStatLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search coins..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {pricesLoading && (
              <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.75 }] }} />
            )}
          </View>
        </View>

        {/* Category Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity key={cat} style={[styles.catChip, cat === category && styles.catChipActive]} onPress={() => setCategory(cat)}>
              <Text style={[styles.catText, cat === category && styles.catTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Coin List — live prices from WalletContext */}
        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <SectionHeader title="Market" actionLabel="See All" onAction={() => {}} />
            <TouchableOpacity style={styles.refreshBtn} onPress={() => { refreshPrices(); refreshGold(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {pricesLoading
                ? <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.75 }] }} />
                : <MaterialIcons name="refresh" size={16} color={Colors.primary} />
              }
            </TouchableOpacity>
          </View>
          <View style={[styles.coinList, isTablet && styles.coinListTablet]}>
            {filtered.map(coin => (
              <TouchableOpacity key={coin.id} onPress={() => router.push({ pathname: '/trade', params: { coinId: coin.id } } as any)} activeOpacity={0.8}>
                <View style={styles.coinRow}>
                  <View style={[{ flex: 1 }, isTablet && styles.coinRowCellTablet]}>
                    <CoinCard
                      symbol={coin.symbol}
                      name={coin.name}
                      logo={coin.logo}
                      price={coin.price}
                      change24h={coin.change24h}
                      color={coin.color}
                      balance={coin.balance}
                      showBalance={coin.isOwned}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.bookmarkBtn, isWatched(coin.id) && styles.bookmarkBtnActive]}
                    onPress={() => isWatched(coin.id) ? removeFromWatchlist(coin.id) : addToWatchlist(coin.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons
                      name={isWatched(coin.id) ? 'bookmark' : 'bookmark-border'}
                      size={18}
                      color={isWatched(coin.id) ? Colors.primary : Colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {/* Live data footer */}
          <View style={styles.dataFooter}>
            <View style={[styles.dataFooterDot, { backgroundColor: isLive ? Colors.success : Colors.warning }]} />
            <Text style={[styles.dataFooterText, { color: isLive ? Colors.success : Colors.warning }]}>
              {isLive
                ? `Live market data · Updated ${lastTs ?? 'just now'}`
                : 'Cached prices · Tap refresh to update'}
            </Text>
          </View>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  userName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  liveIndicatorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgCard, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm + 2, paddingVertical: 5,
    borderWidth: 1,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: Colors.primary },
  heroCard: {
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
    marginBottom: Spacing.lg,
  },
  heroCardTablet: { marginHorizontal: Spacing.xxl, padding: Spacing.xl },
  heroBg: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  heroTagRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  heroTag: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryGlow40,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  heroTagText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold, letterSpacing: 1, includeFontPadding: false },
  dataSourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1,
  },
  dataSourceDot: { width: 5, height: 5, borderRadius: 2.5 },
  dataSourceText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
  heroPrice: { fontSize: 26, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 4 },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  changeText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, includeFontPadding: false },
  heroPriceUnit: { fontSize: 9, color: Colors.primary + 'BB', includeFontPadding: false, marginBottom: 4, letterSpacing: 0.3 },
  goldUnitsStrip: { flexDirection: 'row', paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border + '88', marginBottom: 2 },
  goldUnit: { flex: 1, alignItems: 'center', gap: 2 },
  goldUnitDiv: { width: 1, backgroundColor: Colors.border },
  goldUnitLabel: { fontSize: 7, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center', letterSpacing: 0.1 },
  goldUnitVal: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, textAlign: 'center', flexShrink: 1 },
  heroStats: { flexDirection: 'row', paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginBottom: 3 },
  heroStatValue: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  heroDivider: { width: 1, backgroundColor: Colors.border },
  quickActions: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.lg },
  quickActionsTablet: { paddingHorizontal: Spacing.xxl, gap: Spacing.xl, justifyContent: 'center' },
  quickBtn: { flex: 1, alignItems: 'center', gap: 6 },
  quickBtnTablet: { flex: 0, width: 90 },
  quickIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  quickIconTablet: { width: 64, height: 64, borderRadius: 20 },
  quickLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  quickLabelTablet: { fontSize: FontSize.xs },
  searchRow: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, gap: Spacing.sm, height: 44 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  catScroll: { marginBottom: Spacing.md },
  catContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  catChip: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, height: 36, justifyContent: 'center' },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  catTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  listSection: { paddingHorizontal: Spacing.xl },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  coinList: { gap: Spacing.sm },
  coinListTablet: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  coinRowCellTablet: { minWidth: '45%', maxWidth: '48%' },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bookmarkBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  bookmarkBtnActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  dataFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  dataFooterDot: { width: 6, height: 6, borderRadius: 3 },
  dataFooterText: { fontSize: 9, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // ── Mining Stats Card ────────────────────────────────────────────────────────
  miningCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#D4A01744',
    overflow: 'hidden',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  miningCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  miningCardTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    includeFontPadding: false,
  },
  miningCardSub: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
    marginTop: 1,
  },
  miningLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22C55E',
    flexShrink: 0,
  },
  miningStatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  miningStatCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: 4,
  },
  miningStatVal: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
    textAlign: 'center',
  },
  miningStatLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    includeFontPadding: false,
    textAlign: 'center',
  },

  // ── Gold Factory Link Bar ──────────────────────────────────────────────────
  factoryBar: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: '#D4A01755',
    overflow: 'hidden',
  },
  factoryMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
  },
  factoryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#D4A01718',
    borderWidth: 1,
    borderColor: '#D4A01744',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  factoryTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    includeFontPadding: false,
  },
  factorySub: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
    marginTop: 2,
  },
  factoryLiveDotWrap: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E22',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  factoryLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  factoryDivider: {
    height: 1,
    backgroundColor: '#D4A01722',
  },
  factorySecondRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  factorySmallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
  },
  factorySmallText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
  },
  factorySmallDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: Colors.error, borderRadius: 7, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  bellBadgeText: { fontSize: 8, color: '#fff', fontWeight: FontWeight.bold, includeFontPadding: false },
  bellDot: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, borderWidth: 1.5, borderColor: Colors.bg },
});
