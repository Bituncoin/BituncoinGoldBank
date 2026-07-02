import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAlert } from '@/template';
import { useWallet } from '@/contexts/WalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTrading } from '@/hooks/useTrading';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { MiniChart, BTNGButton } from '@/components';
import { COINS, RECENT_TRADES, CHART_POINTS_24H, PRICE_HISTORY_7D, BTNG_PRICE } from '@/constants/mockData';
import { useLiveOrderBook } from '@/hooks/useLiveOrderBook';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { Screen } from '@/constants/theme';
import { Image } from 'expo-image';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { Order } from '@/services/tradingService';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ZoneEngine } from '@/constants/zoneEngine';
import type { ZoneResolution } from '@/constants/zoneResolver';

const zoneEngine = new ZoneEngine();

const TIME_FRAMES = ['1H', '4H', '1D', '1W', '1M'];
const ORDER_TYPES = ['Limit', 'Market', 'Stop-Limit'];

// Three BTNG gold units — prices are updated live from the gold oracle in the component
const BTNG_PICKER_COINS_BASE = [
  {
    id: 'btng',
    symbol: 'BTNGG',
    name: 'Bituncoin Gold (1/1000 oz)',
    price: 4.3295,
    change24h: 0,
    balance: 0,
    isBtng: true,
    unit: '1/1000 oz',
    unitLabel: 'BTNGG',
  },
  {
    id: 'btng-g',
    symbol: 'BTNG-G',
    name: 'Bituncoin Gold (1 gram)',
    price: 139.19,
    change24h: 0,
    balance: 0,
    isBtng: true,
    unit: '1 gram',
    unitLabel: 'BTNG-G',
  },
  {
    id: 'btng-kg',
    symbol: 'BTNG-KG',
    name: 'Bituncoin Gold (1 kg)',
    price: 139_195,
    change24h: 0,
    balance: 0,
    isBtng: true,
    unit: '1 kg',
    unitLabel: 'BTNG-KG',
  },
];

// All picker coins — BTNG first, then standard (gold prices patched live in component)
const ALL_PICKER_COINS_BASE = [...BTNG_PICKER_COINS_BASE, ...COINS.slice(0, 5)] as any[];

const STATUS_COLORS: Record<string, string> = {
  filled: Colors.success,
  pending: Colors.warning,
  cancelled: Colors.error,
  partial: Colors.info,
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function TradeScreen() {
  const insets = useSafeAreaInsets();
  const { executeTrade, coins, pricesSource, pricesLastUpdated, refreshPrices } = useWallet();
  // Live gold oracle for BTNG unit prices
  const gold = useGoldOracle();
  const TROY = 31.1035;
  const { user } = useAuth();
  const { showAlert } = useAlert();

  // ── Read coinId param FIRST — before state that depends on it ────────────
  const { coinId } = useLocalSearchParams<{ coinId?: string }>();

  // ── Coin selection state — defined before all hooks that use `coin` ──────
  const getInitialCoin = () => {
    const pool = ALL_PICKER_COINS_BASE;
    if (!coinId) return pool[0];
    const found = pool.find((c: any) => c.id === coinId);
    return found ?? pool[0];
  };
  const [selectedCoin, setSelectedCoin] = useState<any>(() => getInitialCoin());
  const [tf, setTf] = useState('1D');
  const [orderType, setOrderType] = useState('Market');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState(String(COINS[0].price));
  const [tab, setTab] = useState<'chart' | 'book' | 'trades' | 'orders'>('chart');

  // ── Zone Engine state ────────────────────────────────────────────────────
  const [activeZone, setActiveZone] = useState<ZoneResolution | null>(null);

  useFocusEffect(
    useCallback(() => {
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
        console.warn('[ZoneEngine] trade resolve failed:', e);
      }
    }, [user?.id])
  );

  // Build live-priced picker coins from gold oracle
  const liveBtngCoins = useMemo(() => {
    const xau = gold.priceUSD > 0 ? gold.priceUSD : 4329.45;
    return [
      { ...BTNG_PICKER_COINS_BASE[0], price: xau / 1000,       change24h: gold.changePct24h },
      { ...BTNG_PICKER_COINS_BASE[1], price: xau / TROY,       change24h: gold.changePct24h },
      { ...BTNG_PICKER_COINS_BASE[2], price: xau * 32.1507,    change24h: gold.changePct24h },
    ];
  }, [gold.priceUSD, gold.changePct24h]);

  const ALL_PICKER_COINS = useMemo(() => [
    ...liveBtngCoins,
    ...COINS.slice(0, 5),
  ] as any[], [liveBtngCoins]);

  // Merge live prices into the selected coin — must be derived BEFORE useLiveOrderBook
  const livePicked = ALL_PICKER_COINS.find((c: any) => c.id === selectedCoin.id);
  const coin = (livePicked ?? coins.find(c => c.id === selectedCoin.id) ?? selectedCoin) as any;
  const isPositive = (coin?.change24h ?? 0) >= 0;

  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);

  // When coinId param changes (e.g. navigated from Market), update selected coin
  useEffect(() => {
    if (coinId) {
      const found = ALL_PICKER_COINS.find((c: any) => c.id === coinId);
      if (found) {
        setSelectedCoin(found);
        setPrice(String(found.price.toFixed(found.price >= 1000 ? 0 : 4)));
      }
    }
  }, [coinId]); // coinId is the only trigger needed
  const isTablet = dims.width >= 768;
  const isDesktop = dims.width >= 1024;
  // Adaptive chart/panel sizes
  const chartW = isDesktop ? Math.min(dims.width * 0.55, 800) : isTablet ? Math.min(dims.width * 0.55, 540) : dims.width - 48;
  const chartH = isTablet ? 240 : 160;

  const {
    orders,
    history,
    loadingOrders,
    placing,
    submitOrder,
    totalBuyVolume,
    totalSellVolume,
    totalFeesPaid,
    filledOrdersCount,
  } = useTrading(user?.id);

  // ── Live order book — coin is resolved above, safe to use here ──────────
  const {
    book: liveBook,
    loading: bookLoading,
    isLive: bookIsLive,
    lastUpdated: bookUpdated,
    countdown: bookCountdown,
    refresh: refreshBook,
  } = useLiveOrderBook(coin?.symbol ?? 'BTNGG');

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();

  // Live local currency conversion for order summary
  const tradePrice = orderType === 'Market' ? coin.price : (parseFloat(price) || coin.price);
  const totalUSD = useMemo(() => {
    const qty = parseFloat(amount) || 0;
    return qty > 0 ? qty * tradePrice : 0;
  }, [amount, tradePrice]);
  const localTotal = totalUSD > 0 ? convertUSDRaw(totalUSD) : 0;
  const showLocalConversion = selectedCurrency.code !== 'USD' && totalUSD > 0;
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  // Filter orders for this coin
  const coinOrders = orders.filter(o => o.coin_symbol === coin.symbol);

  // Helper: format price with correct decimals based on magnitude
  const fmtLivePrice = (p: number) =>
    p >= 1000
      ? p.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : p >= 1
      ? p.toFixed(4)
      : p.toFixed(6);

  // Helper: format volume
  const fmtVol = (v: number) =>
    v >= 1e9 ? `${(v / 1e9).toFixed(1)}B`
    : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M`
    : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K`
    : v.toFixed(2);

  const handleTrade = async () => {
    const qty = parseFloat(amount);
    if (!qty || qty <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid quantity.');
      return;
    }

    const tradePrice = orderType === 'Market' ? coin.price : parseFloat(price);
    if (!tradePrice || tradePrice <= 0) {
      showAlert('Invalid Price', 'Please enter a valid price.');
      return;
    }

    // Execute in wallet context (local balance update)
    const result = await executeTrade(coin.id, side, qty);

    if (!result.success) {
      showAlert('Trade Failed', result.message);
      return;
    }

    // Persist to Supabase if authenticated
    if (user?.id) {
      const { error } = await submitOrder({
        userId: user.id,
        coinSymbol: coin.symbol,
        coinName: coin.name,
        side,
        orderType: (orderType.toLowerCase().replace('-', '-') as any),
        quantity: qty,
        price: tradePrice,
        limitPrice: orderType !== 'Market' ? tradePrice : undefined,
      });

      if (error) {
        // Order placed locally, just notify about sync issue
        showAlert('Order Filled', `${result.message}\n(Sync pending: ${error})`);
        return;
      }
    }

    setAmount('');
    showAlert(
      side === 'buy' ? '✅ Buy Order Filled' : '✅ Sell Order Filled',
      `${qty} ${coin.symbol} ${side === 'buy' ? 'purchased' : 'sold'} at $${tradePrice.toLocaleString()}\nTotal: $${(qty * tradePrice).toFixed(2)} · Fee: $${(qty * tradePrice * 0.001).toFixed(4)}`
    );
  };

  // Compute High/Low/Vol — prefer live order book data, fall back to derived estimates
  const highDisplay = liveBook && liveBook.high24h > 0
    ? `$${fmtLivePrice(liveBook.high24h)}`
    : `$${fmtLivePrice(coin.price * 1.04)}`;
  const lowDisplay = liveBook && liveBook.low24h > 0
    ? `$${fmtLivePrice(liveBook.low24h)}`
    : `$${fmtLivePrice(coin.price * 0.96)}`;
  const volDisplay = liveBook && liveBook.volume24h > 0
    ? fmtVol(liveBook.volume24h)
    : coin.price > 1000 ? '48.3B' : '312M';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Coin Picker */}
      <View style={[styles.topBar, isTablet && styles.topBarTablet]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coinPicker}>
          {ALL_PICKER_COINS.map((c: any) => {
            const isActive = selectedCoin.id === c.id;
            const isBtng = Boolean(c.isBtng);
            return (
              <TouchableOpacity key={c.id}
                style={[
                  styles.coinChip,
                  isActive && styles.coinChipActive,
                  isBtng && !isActive && styles.coinChipBtng,
                  isBtng && isActive && styles.coinChipBtngActive,
                ]}
                onPress={() => { setSelectedCoin(c); setPrice(String(c.price)); }}>
                {isBtng ? (
                  <View style={styles.coinChipLogoWrap}>
                    <Image
                      source={require('@/assets/images/btng_coin_logo.jpg')}
                      style={styles.coinChipLogo}
                      contentFit="cover"
                      transition={200}
                    />
                  </View>
                ) : null}
                <Text style={[
                  styles.coinChipText,
                  isActive && { color: isBtng ? Colors.bg : Colors.bg },
                  isBtng && !isActive && { color: Colors.kenteGold },
                ]}>
                  {c.symbol}/USDT
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isTablet ? (
        // ── TABLET: side-by-side chart + order panel ──────────────────────
        <View style={styles.tabletLayout}>
          <ScrollView style={styles.tabletLeft} showsVerticalScrollIndicator={false}>
            <View style={styles.priceHeader}>
              <View style={styles.pairIdentityRow}>
                {(selectedCoin as any).isBtng ? (
                  <View style={styles.pairLogoWrap}>
                    <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.pairLogo} contentFit="cover" transition={200} />
                  </View>
                ) : null}
                <View style={[styles.pairNameBadge, (selectedCoin as any).isBtng && styles.pairNameBadgeBtng]}>
                  <Text style={[styles.pairNameText, (selectedCoin as any).isBtng && { color: Colors.kenteGold }]}>{coin.symbol} / USDT</Text>
                  {(selectedCoin as any).isBtng ? <MaterialIcons name="verified" size={12} color={Colors.kenteGold} /> : null}
                </View>
              </View>
              <View style={styles.priceStatsRow}>
                <View>
                  <Text style={styles.currentPrice}>${coin.price >= 1000 ? coin.price.toLocaleString() : coin.price.toFixed(4)}</Text>
                  <View style={[styles.changePill, { backgroundColor: isPositive ? Colors.successBg : Colors.errorBg }]}>
                    <Text style={{ color: isPositive ? Colors.success : Colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, includeFontPadding: false }}>{isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%</Text>
                  </View>
                </View>
                <View style={styles.priceStats}>
                  <View style={styles.priceStat}><Text style={styles.priceStatLabel}>High</Text><Text style={styles.priceStatValue}>{highDisplay}</Text></View>
                  <View style={styles.priceStat}><Text style={styles.priceStatLabel}>Low</Text><Text style={styles.priceStatValue}>{lowDisplay}</Text></View>
                  <View style={styles.priceStat}><Text style={styles.priceStatLabel}>Vol</Text><Text style={styles.priceStatValue}>{volDisplay}</Text></View>
                </View>
              </View>
            </View>
            <View style={styles.chartSection}>
              <View style={styles.tfRow}>
                {TIME_FRAMES.map(t => (
                  <TouchableOpacity key={t} style={[styles.tfBtn, tf === t && styles.tfBtnActive]} onPress={() => setTf(t)}>
                    <Text style={[styles.tfText, tf === t && styles.tfTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.chartWrapper}>
                <MiniChart data={tf === '1W' ? PRICE_HISTORY_7D : CHART_POINTS_24H} width={chartW} height={chartH} color={isPositive ? Colors.success : Colors.error} showFill key={`chart-tablet-${coin.id}-${tf}`} />
              </View>
            </View>
            <LiveOrderBookPanel
              book={liveBook}
              loading={bookLoading}
              isLive={bookIsLive}
              lastUpdated={bookUpdated}
              countdown={bookCountdown}
              onRefresh={refreshBook}
              coin={coin}
              compact
            />
            <View style={{ height: 40 }} />
          </ScrollView>
          <ScrollView style={styles.tabletRight} showsVerticalScrollIndicator={false}>
            <View style={[styles.orderPanel, { marginHorizontal: 0, marginTop: Spacing.md }]}>
              <View style={styles.orderSidePicker}>
                <TouchableOpacity style={[styles.sideBtn, side === 'buy' && styles.sideBtnBuy]} onPress={() => setSide('buy')}><Text style={[styles.sideBtnText, side === 'buy' && { color: '#fff' }]}>BUY</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.sideBtn, side === 'sell' && styles.sideBtnSell]} onPress={() => setSide('sell')}><Text style={[styles.sideBtnText, side === 'sell' && { color: '#fff' }]}>SELL</Text></TouchableOpacity>
              </View>
              <View style={styles.orderTypeRow}>
                {ORDER_TYPES.map(ot => (<TouchableOpacity key={ot} style={[styles.otBtn, orderType === ot && styles.otBtnActive]} onPress={() => setOrderType(ot)}><Text style={[styles.otText, orderType === ot && styles.otTextActive]}>{ot}</Text></TouchableOpacity>))}
              </View>
              {orderType !== 'Market' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Price (USDT)</Text>
                  <TextInput style={styles.tradeInput} value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor={Colors.textMuted} />
                </View>
              )}
              {activeZone ? (
                <View style={styles.zoneInfoStrip}>
                  <View style={styles.zoneInfoLeft}>
                    <MaterialIcons name="travel-explore" size={13} color={Colors.primary} />
                    <Text style={styles.zoneInfoName} numberOfLines={1}>
                      {activeZone.zoneId.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={styles.zoneInfoChip}>
                    <Text style={styles.zoneInfoChipLabel}>MAX SWAP</Text>
                    <Text style={styles.zoneInfoChipVal}>
                      {activeZone.config.maxSwapAmount >= 1000
                        ? `${(activeZone.config.maxSwapAmount / 1000).toFixed(0)}K`
                        : activeZone.config.maxSwapAmount}
                    </Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount ({coin.symbol})</Text>
                <TextInput style={styles.tradeInput} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.quickAmts}>
                {['25%', '50%', '75%', '100%'].map(p => (<TouchableOpacity key={p} style={styles.quickAmtBtn} onPress={() => setAmount(String((coin.balance * parseInt(p) / 100).toFixed(4)))}><Text style={styles.quickAmtText}>{p}</Text></TouchableOpacity>))}
              </View>
              <View style={styles.orderSummary}>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Estimated Total</Text><Text style={styles.summaryVal}>{amount ? `$${(parseFloat(amount) * tradePrice).toFixed(2)}` : '--'}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Fee (0.1%)</Text><Text style={styles.summarySubVal}>{amount ? `$${(parseFloat(amount) * tradePrice * 0.001).toFixed(4)}` : '--'}</Text></View>
              </View>
              <BTNGButton title={side === 'buy' ? `Buy ${coin.symbol}` : `Sell ${coin.symbol}`} onPress={handleTrade} variant={side === 'buy' ? 'buy' : 'sell'} size="lg" fullWidth loading={placing} />
              <View style={styles.availableRow}><Text style={styles.availLabel}>Available</Text><Text style={styles.availVal}>{coin.balance.toFixed(4)} {coin.symbol}</Text></View>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      ) : (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Price Header */}
        <View style={styles.priceHeader}>
          {/* Trade pair identity row — shows BTNG coin logo for BTNG assets */}
          <View style={styles.pairIdentityRow}>
            {(selectedCoin as any).isBtng ? (
              <View style={styles.pairLogoWrap}>
                <Image
                  source={require('@/assets/images/btng_coin_logo.jpg')}
                  style={styles.pairLogo}
                  contentFit="cover"
                  transition={200}
                />
              </View>
            ) : null}
            <View style={[
              styles.pairNameBadge,
              (selectedCoin as any).isBtng && styles.pairNameBadgeBtng,
            ]}>
              <Text style={[
                styles.pairNameText,
                (selectedCoin as any).isBtng && { color: Colors.kenteGold },
              ]}>
                {coin.symbol} / USDT
              </Text>
              {(selectedCoin as any).isBtng ? (
                <MaterialIcons name="verified" size={12} color={Colors.kenteGold} />
              ) : null}
            </View>
          </View>
          {/* Price + stats row */}
          <View style={styles.priceStatsRow}>
            <View>
              <Text style={styles.currentPrice}>
                ${coin.price >= 1000 ? coin.price.toLocaleString() : coin.price.toFixed(4)}
              </Text>
              <View style={[styles.changePill, { backgroundColor: isPositive ? Colors.successBg : Colors.errorBg }]}>
                <Text style={{ color: isPositive ? Colors.success : Colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, includeFontPadding: false }}>
                  {isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%
                </Text>
              </View>
            </View>
            <View style={styles.priceStats}>
              <View style={styles.priceStat}>
                <Text style={styles.priceStatLabel}>High</Text>
                <Text style={styles.priceStatValue}>{highDisplay}</Text>
              </View>
              <View style={styles.priceStat}>
                <Text style={styles.priceStatLabel}>Low</Text>
                <Text style={styles.priceStatValue}>{lowDisplay}</Text>
              </View>
              <View style={styles.priceStat}>
                <Text style={styles.priceStatLabel}>Vol</Text>
                <Text style={styles.priceStatValue}>{volDisplay}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* My Trading Stats (when signed in) */}
        {user && (orders.length > 0 || totalBuyVolume > 0) && (
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>Orders</Text>
              <Text style={[styles.statPillVal, { color: Colors.primary }]}>{filledOrdersCount}</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>Bought</Text>
              <Text style={[styles.statPillVal, { color: Colors.success }]}>${totalBuyVolume.toFixed(0)}</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>Sold</Text>
              <Text style={[styles.statPillVal, { color: Colors.warning }]}>${totalSellVolume.toFixed(0)}</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>Fees</Text>
              <Text style={[styles.statPillVal, { color: Colors.textSecondary }]}>${totalFeesPaid.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.chartTabs}>
          {(['chart', 'book', 'trades', 'orders'] as const).map(t => (
            <TouchableOpacity key={t}
              style={[styles.chartTab, tab === t && styles.chartTabActive]}
              onPress={() => setTab(t)}>
              <Text style={[styles.chartTabText, tab === t && styles.chartTabTextActive]}>
                {t === 'chart' ? 'Chart' : t === 'book' ? 'Book' : t === 'trades' ? 'Market' : 'My Orders'}
              </Text>
              {t === 'orders' && orders.length > 0 && (
                <View style={styles.ordersBadge}>
                  <Text style={styles.ordersBadgeText}>{Math.min(orders.length, 99)}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart */}
        {tab === 'chart' && (
          <View style={styles.chartSection}>
            <View style={styles.tfRow}>
              {TIME_FRAMES.map(t => (
                <TouchableOpacity key={t} style={[styles.tfBtn, tf === t && styles.tfBtnActive]} onPress={() => setTf(t)}>
                  <Text style={[styles.tfText, tf === t && styles.tfTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.chartWrapper}>
              <MiniChart
                data={tf === '1W' ? PRICE_HISTORY_7D : CHART_POINTS_24H}
                width={chartW} height={chartH}
                color={isPositive ? Colors.success : Colors.error}
                showFill
                key={`chart-mobile-${coin.id}-${tf}`}
              />
            </View>
          </View>
        )}

        {/* Order Book — Live */}
        {tab === 'book' && (
          <LiveOrderBookPanel
            book={liveBook}
            loading={bookLoading}
            isLive={bookIsLive}
            lastUpdated={bookUpdated}
            countdown={bookCountdown}
            onRefresh={refreshBook}
            coin={coin}
          />
        )}

        {/* Market Trades — prices scaled to the currently selected coin */}
        {tab === 'trades' && (
          <View style={styles.tradeList}>
            {RECENT_TRADES.map((t, i) => {
              // Scale mock trade prices to the live coin price so values are realistic
              const scaledPrice = BTNG_PRICE > 0 ? coin.price * (t.price / BTNG_PRICE) : coin.price;
              const priceStr = scaledPrice >= 1000
                ? scaledPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : scaledPrice >= 1
                ? scaledPrice.toFixed(3)
                : scaledPrice.toFixed(6);
              return (
                <View key={i} style={styles.tradeRow}>
                  <Text style={[styles.tradePrice, { color: t.type === 'buy' ? Colors.success : Colors.error }]}>{priceStr}</Text>
                  <Text style={styles.tradeAmt}>{t.amount.toLocaleString()}</Text>
                  <Text style={styles.tradeTime}>{t.time}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* My Orders (live from DB) */}
        {tab === 'orders' && (
          <View style={styles.myOrdersSection}>
            {!user ? (
              <View style={styles.authPrompt}>
                <MaterialIcons name="lock-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.authPromptTitle}>Sign in to view orders</Text>
                <Text style={styles.authPromptSub}>Your order history is saved securely in the cloud.</Text>
              </View>
            ) : loadingOrders ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.loadingText}>Loading orders...</Text>
              </View>
            ) : orders.length === 0 ? (
              <View style={styles.emptyOrders}>
                <MaterialIcons name="receipt-long" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyOrdersTitle}>No orders yet</Text>
                <Text style={styles.emptyOrdersSub}>Place your first trade below</Text>
              </View>
            ) : (
              <>
                <View style={styles.ordersListHeader}>
                  <Text style={styles.ordersListHeaderText}>Pair</Text>
                  <Text style={styles.ordersListHeaderText}>Side / Qty</Text>
                  <Text style={styles.ordersListHeaderText}>Total</Text>
                  <Text style={styles.ordersListHeaderText}>Status</Text>
                </View>
                {orders.slice(0, 20).map(order => (
                  <OrderRow key={order.id} order={order} />
                ))}
                {orders.length > 20 && (
                  <Text style={styles.moreOrders}>+{orders.length - 20} more orders in History</Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Order Panel */}
        <View style={styles.orderPanel}>
          <View style={styles.orderSidePicker}>
            <TouchableOpacity style={[styles.sideBtn, side === 'buy' && styles.sideBtnBuy]} onPress={() => setSide('buy')}>
              <Text style={[styles.sideBtnText, side === 'buy' && { color: '#fff' }]}>BUY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sideBtn, side === 'sell' && styles.sideBtnSell]} onPress={() => setSide('sell')}>
              <Text style={[styles.sideBtnText, side === 'sell' && { color: '#fff' }]}>SELL</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.orderTypeRow}>
            {ORDER_TYPES.map(ot => (
              <TouchableOpacity key={ot}
                style={[styles.otBtn, orderType === ot && styles.otBtnActive]}
                onPress={() => setOrderType(ot)}>
                <Text style={[styles.otText, orderType === ot && styles.otTextActive]}>{ot}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {orderType !== 'Market' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Price (USDT)</Text>
              <TextInput
                style={styles.tradeInput}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          )}

          {activeZone ? (
            <View style={styles.zoneInfoStrip}>
              <View style={styles.zoneInfoLeft}>
                <MaterialIcons name="travel-explore" size={13} color={Colors.primary} />
                <Text style={styles.zoneInfoName} numberOfLines={1}>
                  {activeZone.zoneId.replace(/_/g, ' ')}
                </Text>
              </View>
              <View style={styles.zoneInfoChip}>
                <Text style={styles.zoneInfoChipLabel}>MAX SWAP</Text>
                <Text style={styles.zoneInfoChipVal}>
                  {activeZone.config.maxSwapAmount >= 1000
                    ? `${(activeZone.config.maxSwapAmount / 1000).toFixed(0)}K`
                    : activeZone.config.maxSwapAmount}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Amount ({coin.symbol})</Text>
            <TextInput
              style={styles.tradeInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.quickAmts}>
            {['25%', '50%', '75%', '100%'].map(p => (
              <TouchableOpacity key={p} style={styles.quickAmtBtn}
                onPress={() => setAmount(String((coin.balance * parseInt(p) / 100).toFixed(4)))}>
                <Text style={styles.quickAmtText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.orderSummary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Estimated Total</Text>
              <Text style={styles.summaryVal}>{amount ? `$${(parseFloat(amount) * tradePrice).toFixed(2)}` : '--'}</Text>
            </View>
            {showLocalConversion && (
              <View style={styles.localConversionRow}>
                <View style={styles.localConversionArrow}>
                  <MaterialIcons name="arrow-downward" size={10} color={Colors.primary} />
                </View>
                <View style={styles.localConversionBadge}>
                  <Text style={styles.localConversionFlag}>{selectedCurrency.flag}</Text>
                  <Text style={styles.localConversionText}>
                    {selectedCurrency.symbol}
                    {localTotal >= 1000
                      ? localTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })
                      : localTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {' '}{selectedCurrency.code}
                  </Text>
                </View>
                <View style={styles.liveRatePill}>
                  {ratesLoading ? (
                    <ActivityIndicator size="small" color={Colors.success} style={{ transform: [{ scale: 0.55 }] }} />
                  ) : (
                    <View style={styles.liveDot} />
                  )}
                  <Text style={styles.liveRateText}>
                    {rateTimestamp ? `Live · ${rateTimestamp}` : 'Live'}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Fee (0.1%)</Text>
              <Text style={styles.summarySubVal}>{amount ? `$${(parseFloat(amount) * tradePrice * 0.001).toFixed(4)}` : '--'}</Text>
            </View>
          </View>

          <BTNGButton
            title={side === 'buy' ? `Buy ${coin.symbol}` : `Sell ${coin.symbol}`}
            onPress={handleTrade}
            variant={side === 'buy' ? 'buy' : 'sell'}
            size="lg"
            fullWidth
            loading={placing}
          />

          <View style={styles.availableRow}>
            <Text style={styles.availLabel}>Available</Text>
            <Text style={styles.availVal}>{coin.balance.toFixed(4)} {coin.symbol}</Text>
          </View>

          {!user && (
            <View style={styles.anonNote}>
              <MaterialIcons name="info-outline" size={13} color={Colors.warning} />
              <Text style={styles.anonNoteText}>Sign in to save order history to the cloud</Text>
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
      )}
    </View>
  );
}

// ── Live Order Book Panel ──────────────────────────────────────────────────
import type { LiveOrderBook } from '@/hooks/useLiveOrderBook';

function LiveOrderBookPanel({
  book, loading, isLive, lastUpdated, countdown, onRefresh, coin, compact,
}: {
  book: LiveOrderBook | null;
  loading: boolean;
  isLive: boolean;
  lastUpdated: Date | null;
  countdown: number;
  onRefresh: () => void;
  coin: any;
  compact?: boolean;
}) {
  if (loading && !book) {
    return (
      <View style={[styles.orderBook, { alignItems: 'center', paddingVertical: 32 }]}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={[styles.bookHeader, { marginTop: 10 }]}>Connecting to order book...</Text>
      </View>
    );
  }

  const asks  = book?.asks  ?? [];
  const bids  = book?.bids  ?? [];
  const spread    = book?.spread     ?? 0;
  const spreadPct = book?.spreadPct  ?? 0;
  const maxVol = Math.max(
    ...asks.map(a => a.amount),
    ...bids.map(b => b.amount),
    1,
  );

  const priceDecimals = (book?.midPrice ?? 1) > 100 ? 2 : (book?.midPrice ?? 1) > 1 ? 4 : 6;
  const fmt = (p: number) => p.toFixed(priceDecimals);
  const fmtVol = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000   ? `${(v / 1_000).toFixed(1)}K`
    : v.toFixed(2);
  const ts = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const showLevels = compact ? Math.min(asks.length, 6) : asks.length;

  return (
    <View style={styles.orderBook}>
      {/* Live status bar */}
      <View style={styles.bookStatusBar}>
        <View style={styles.bookStatusLeft}>
          <View style={[styles.bookLiveDot, { backgroundColor: isLive ? Colors.success : Colors.warning }]} />
          <Text style={[styles.bookLiveText, { color: isLive ? Colors.success : Colors.warning }]}>
            {isLive ? 'LIVE' : 'CACHED'}
          </Text>
          {ts && <Text style={styles.bookTsText}>· {ts}</Text>}
        </View>
        <View style={styles.bookStatusRight}>
          {/* Countdown bar */}
          <View style={styles.countdownBarWrap}>
            <View
              style={[
                styles.countdownBar,
                { width: `${(countdown / 10) * 100}%`, backgroundColor: isLive ? Colors.success : Colors.warning },
              ]}
            />
          </View>
          <Text style={styles.bookCdText}>{countdown}s</Text>
          <TouchableOpacity
            onPress={onRefresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.bookRefreshBtn}
          >
            {loading
              ? <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
              : <MaterialIcons name="refresh" size={14} color={Colors.primary} />
            }
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bookCol}>
        {/* Column headers */}
        <View style={styles.bookColHeader}>
          <Text style={[styles.bookColHeaderText, { flex: 1 }]}>Price (USDT)</Text>
          <Text style={[styles.bookColHeaderText, { flex: 1, textAlign: 'center' }]}>Size</Text>
          <Text style={[styles.bookColHeaderText, { flex: 1, textAlign: 'right' }]}>Total</Text>
        </View>

        {/* Asks — top, red side */}
        {asks.slice(0, showLevels).reverse().map((a, i) => (
          <View key={`ask-${i}`} style={styles.bookRow}>
            <View style={[styles.bookFillAsk, { width: `${(a.amount / maxVol) * 100}%` }]} />
            <Text style={[styles.bookPrice, { color: Colors.error, flex: 1 }]}>{fmt(a.price)}</Text>
            <Text style={[styles.bookAmt, { flex: 1, textAlign: 'center' }]}>{fmtVol(a.amount)}</Text>
            <Text style={[styles.bookTotal, { flex: 1 }]}>{fmtVol(a.total)}</Text>
          </View>
        ))}

        {/* Spread row */}
        <View style={styles.spreadRow}>
          <View style={styles.spreadLeft}>
            <MaterialIcons name="unfold-more" size={12} color={Colors.primary} />
            <Text style={styles.spreadLabel}>Spread</Text>
          </View>
          <Text style={styles.spreadVal}>{fmt(spread)}</Text>
          <View style={[styles.spreadPctChip, { backgroundColor: Colors.primaryGlow }]}>
            <Text style={styles.spreadPctText}>{spreadPct.toFixed(3)}%</Text>
          </View>
        </View>

        {/* Bids — bottom, green side */}
        {bids.slice(0, showLevels).map((b, i) => (
          <View key={`bid-${i}`} style={styles.bookRow}>
            <View style={[styles.bookFillBid, { width: `${(b.amount / maxVol) * 100}%` }]} />
            <Text style={[styles.bookPrice, { color: Colors.success, flex: 1 }]}>{fmt(b.price)}</Text>
            <Text style={[styles.bookAmt, { flex: 1, textAlign: 'center' }]}>{fmtVol(b.amount)}</Text>
            <Text style={[styles.bookTotal, { flex: 1 }]}>{fmtVol(b.total)}</Text>
          </View>
        ))}
      </View>

      {/* 24h stats footer */}
      {!compact && book && (
        <View style={styles.bookStatsRow}>
          <View style={styles.bookStat}>
            <Text style={styles.bookStatLabel}>High</Text>
            <Text style={[styles.bookStatVal, { color: Colors.success }]}>${fmt(book.high24h)}</Text>
          </View>
          <View style={styles.bookStatDiv} />
          <View style={styles.bookStat}>
            <Text style={styles.bookStatLabel}>Low</Text>
            <Text style={[styles.bookStatVal, { color: Colors.error }]}>${fmt(book.low24h)}</Text>
          </View>
          <View style={styles.bookStatDiv} />
          <View style={styles.bookStat}>
            <Text style={styles.bookStatLabel}>Volume</Text>
            <Text style={styles.bookStatVal}>{fmtVol(book.volume24h)}</Text>
          </View>
          <View style={styles.bookStatDiv} />
          <View style={styles.bookStat}>
            <Text style={styles.bookStatLabel}>24h</Text>
            <Text style={[styles.bookStatVal, { color: book.change24h >= 0 ? Colors.success : Colors.error }]}>
              {book.change24h >= 0 ? '+' : ''}{book.change24h.toFixed(2)}%
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function OrderRow({ order }: { order: Order }) {
  const sideColor = order.side === 'buy' ? Colors.success : Colors.error;
  const statusColor = STATUS_COLORS[order.status] ?? Colors.textMuted;
  return (
    <View style={styles.orderRow}>
      <View style={styles.orderRowPair}>
        <Text style={styles.orderRowPairText}>{order.coin_symbol}/USDT</Text>
        <Text style={styles.orderRowType}>{order.order_type}</Text>
      </View>
      <View style={styles.orderRowSide}>
        <View style={[styles.orderSideBadge, { backgroundColor: sideColor + '22' }]}>
          <Text style={[styles.orderSideBadgeText, { color: sideColor }]}>{order.side.toUpperCase()}</Text>
        </View>
        <Text style={styles.orderRowQty}>{order.quantity.toFixed(4)}</Text>
      </View>
      <View style={styles.orderRowTotal}>
        <Text style={styles.orderRowTotalText}>${order.total_value.toFixed(2)}</Text>
        <Text style={styles.orderRowPrice}>@ ${order.price.toFixed(3)}</Text>
      </View>
      <View style={[styles.orderStatusBadge, { backgroundColor: statusColor + '22' }]}>
        <View style={[styles.orderStatusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.orderStatusText, { color: statusColor }]}>{order.status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  topBarTablet: { paddingHorizontal: Spacing.xl },
  tabletLayout: { flex: 1, flexDirection: 'row' },
  tabletLeft: { flex: 1.5, borderRightWidth: 1, borderRightColor: Colors.border },
  tabletRight: { flex: 1, backgroundColor: Colors.bgCard, maxWidth: 420 },
  coinPicker: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  coinChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, height: 34, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 },
  coinChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  coinChipBtng: { backgroundColor: Colors.warningBg, borderColor: Colors.kenteGold + '66', borderWidth: 1.5 },
  coinChipBtngActive: { backgroundColor: Colors.kenteGold, borderColor: Colors.kenteGold },
  coinChipLogoWrap: { width: 18, height: 18, borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: Colors.kenteGold + '44' },
  coinChipLogo: { width: 18, height: 18, borderRadius: 9 },
  coinChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  // Trade pair identity row
  pairIdentityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 6 },
  pairLogoWrap: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: Colors.kenteGold + '88', shadowColor: Colors.kenteGold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 },
  pairLogo: { width: 36, height: 36, borderRadius: 18 },
  pairNameBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  pairNameBadgeBtng: { backgroundColor: Colors.warningBg, borderColor: Colors.kenteGold + '55' },
  pairNameText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  priceHeader: { flexDirection: 'column', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  priceStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  currentPrice: { fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 4 },
  changePill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  priceStats: { gap: 8, alignItems: 'flex-end' },
  priceStat: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  priceStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  priceStatValue: { fontSize: 11, color: Colors.textPrimary, fontWeight: FontWeight.medium, includeFontPadding: false, flexShrink: 1 },
  statsRow: { flexDirection: 'row', marginHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  statPill: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 2 },
  statPillLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  statPillVal: { fontSize: 11, fontWeight: FontWeight.bold, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  chartTabs: { flexDirection: 'row', marginHorizontal: Spacing.lg, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  chartTab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  chartTabActive: { backgroundColor: Colors.primary },
  chartTabText: { fontSize: 11, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  chartTabTextActive: { color: Colors.bg },
  ordersBadge: { backgroundColor: Colors.error, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  ordersBadgeText: { fontSize: 9, color: '#fff', fontWeight: FontWeight.bold, includeFontPadding: false },
  chartSection: { paddingHorizontal: Spacing.lg },
  tfRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  tfBtn: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tfBtnActive: { backgroundColor: Colors.surfaceLight, borderColor: Colors.primary },
  tfText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },
  tfTextActive: { color: Colors.primary },
  chartWrapper: { alignItems: 'center', marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  orderBook: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  bookStatusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm, paddingHorizontal: 2 },
  bookStatusLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bookStatusRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bookLiveDot: { width: 7, height: 7, borderRadius: 3.5 },
  bookLiveText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  bookTsText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  countdownBarWrap: { width: 44, height: 4, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden', borderWidth: 0.5, borderColor: Colors.border },
  countdownBar: { height: '100%', borderRadius: 2 },
  bookCdText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, minWidth: 14, textAlign: 'right' },
  bookRefreshBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '44' },
  bookCol: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  bookColHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '88', marginBottom: 2 },
  bookColHeaderText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, flex: 1, textAlign: 'center', letterSpacing: 0.3 },
  bookHeader: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, marginBottom: 4, includeFontPadding: false },
  bookRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, position: 'relative', overflow: 'hidden', minHeight: 24 },
  bookFillAsk: { position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: Colors.error + '18' },
  bookFillBid: { position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: Colors.success + '18' },
  bookFill: { position: 'absolute', top: 0, left: 0, bottom: 0 },
  bookPrice: { fontSize: 11, fontWeight: FontWeight.semibold, includeFontPadding: false, flexShrink: 1 },
  bookAmt: { fontSize: 11, color: Colors.textSecondary, includeFontPadding: false, flexShrink: 1 },
  bookTotal: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'right', includeFontPadding: false },
  spreadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border + '88', marginVertical: 3, gap: Spacing.sm },
  spreadLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  spreadLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  spreadVal: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  spreadPctChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary + '44' },
  spreadPctText: { fontSize: 9, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  bookStatsRow: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, marginTop: Spacing.sm, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  bookStat: { flex: 1, alignItems: 'center', gap: 3 },
  bookStatLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  bookStatVal: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  bookStatDiv: { width: 1, backgroundColor: Colors.border },
  tradeList: { paddingHorizontal: Spacing.lg, gap: 6, marginBottom: Spacing.md },
  tradeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.sm },
  tradePrice: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tradeAmt: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  tradeTime: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  // My Orders tab
  myOrdersSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, gap: Spacing.sm },
  authPrompt: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  authPromptTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  authPromptSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  loadingWrap: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, includeFontPadding: false },
  emptyOrders: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyOrdersTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptyOrdersSub: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  ordersListHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 6 },
  ordersListHeaderText: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, flex: 1, textAlign: 'center', includeFontPadding: false },
  orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  orderRowPair: { flex: 1, gap: 2 },
  orderRowPairText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1 },
  orderRowType: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  orderRowSide: { flex: 1, alignItems: 'center', gap: 3 },
  orderSideBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  orderSideBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  orderRowQty: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  orderRowTotal: { flex: 1, alignItems: 'center', gap: 2 },
  orderRowTotalText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1 },
  orderRowPrice: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  orderStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  orderStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  orderStatusText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  moreOrders: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm, includeFontPadding: false },

  // Order Panel
  orderPanel: { marginHorizontal: Spacing.lg, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  orderSidePicker: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: 3, gap: 3 },
  sideBtn: { flex: 1, paddingVertical: Spacing.sm + 2, alignItems: 'center', borderRadius: Radius.md },
  sideBtnBuy: { backgroundColor: Colors.success },
  sideBtnSell: { backgroundColor: Colors.error },
  sideBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  orderTypeRow: { flexDirection: 'row', gap: Spacing.sm },
  otBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  otBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  otText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },
  otTextActive: { color: Colors.primary },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  tradeInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 50 },
  quickAmts: { flexDirection: 'row', gap: Spacing.sm },
  quickAmtBtn: { flex: 1, paddingVertical: 7, borderRadius: Radius.md, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  quickAmtText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  orderSummary: { paddingVertical: Spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  summaryVal: { fontSize: 12, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, flexShrink: 1, textAlign: 'right' },
  summarySubVal: { fontSize: 11, color: Colors.textMuted, includeFontPadding: false, flexShrink: 1, textAlign: 'right' },
  localConversionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  localConversionArrow: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '55' },
  localConversionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 2, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  localConversionFlag: { fontSize: 13 },
  localConversionText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  liveRatePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveRateText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  availableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  availLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  availVal: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  anonNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '44' },
  anonNoteText: { fontSize: FontSize.xs, color: Colors.warning, flex: 1, includeFontPadding: false },

  // Zone info strip
  zoneInfoStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '33', paddingHorizontal: Spacing.md, paddingVertical: 7 },
  zoneInfoLeft: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, overflow: 'hidden' },
  zoneInfoName: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.3, flexShrink: 1 },
  zoneInfoChip: { alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 8, paddingVertical: 3, gap: 1, flexShrink: 0 },
  zoneInfoChipLabel: { fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.4, includeFontPadding: false },
  zoneInfoChipVal: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});
