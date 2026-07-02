// BTNG Gold — Binary Trading Screen
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Easing, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { useWallet } from '@/contexts/WalletContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ─── Config ───────────────────────────────────────────────────────────────────
const COINS = [
  { symbol: 'BTC',  name: 'Bitcoin',   icon: '₿',  basePrice: 67_500, volatility: 0.004 },
  { symbol: 'ETH',  name: 'Ethereum',  icon: 'Ξ',  basePrice: 3_480,  volatility: 0.005 },
  { symbol: 'BTNG', name: 'BTNG Gold', icon: '🪙', basePrice: 4.20,   volatility: 0.008 },
  { symbol: 'BNB',  name: 'BNB',       icon: '⬡',  basePrice: 598,    volatility: 0.006 },
  { symbol: 'SOL',  name: 'Solana',    icon: '◎',  basePrice: 178,    volatility: 0.007 },
];

const DURATIONS = [
  { label: '30s', seconds: 30 },
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
];

const PAYOUT_RATE = 0.85; // 85% profit on win
const QUICK_STAKES = [10, 25, 50, 100, 250];

type TradePhase = 'setup' | 'active' | 'result';
type Direction = 'up' | 'down';

interface BinaryTrade {
  id: string;
  coin: string;
  coinIcon: string;
  direction: Direction;
  stake: number;
  entryPrice: number;
  exitPrice: number | null;
  duration: number;
  won: boolean | null;
  pnl: number | null;
  timestamp: string;
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function fmtPrice(coin: typeof COINS[0], price: number): string {
  if (price >= 1000) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)    return '$' + price.toFixed(3);
  return '$' + price.toFixed(6);
}

function fmtUsd(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Seeded random-walk generator for deterministic per-coin tick
function randomDelta(base: number, volatility: number): number {
  return base * volatility * (Math.random() * 2 - 1);
}

// ─── Mini Live Chart ──────────────────────────────────────────────────────────
function LiveChart({
  prices,
  width,
  height,
  direction,
  entryPrice,
}: {
  prices: number[];
  width: number;
  height: number;
  direction: Direction | null;
  entryPrice: number | null;
}) {
  if (prices.length < 2) return <View style={{ width, height }} />;

  const MIN = Math.min(...prices) * 0.9995;
  const MAX = Math.max(...prices) * 1.0005;
  const RANGE = MAX - MIN || 1;

  const W = width;
  const H = height;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - ((p - MIN) / RANGE) * H;
    return `${x},${y}`;
  });

  const currentY = H - ((prices[prices.length - 1] - MIN) / RANGE) * H;
  const entryY   = entryPrice != null ? H - ((entryPrice - MIN) / RANGE) * H : null;

  const upColor   = Colors.success;
  const downColor = Colors.error;
  const lineColor = direction
    ? (direction === 'up' ? upColor : downColor)
    : Colors.primary;

  return (
    <View style={{ width, height, overflow: 'hidden', borderRadius: Radius.md }}>
      {/* SVG-like using Views */}
      <View style={StyleSheet.absoluteFillObject}>
        {/* Gradient background */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Colors.bgElevated }]} />

        {/* Price line — drawn as a series of thin segments via absolute positioned dots */}
        {prices.slice(1).map((p, i) => {
          const x1 = (i / (prices.length - 1)) * W;
          const y1 = H - ((prices[i] - MIN) / RANGE) * H;
          const x2 = ((i + 1) / (prices.length - 1)) * W;
          const y2 = H - ((p - MIN) / RANGE) * H;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: x1,
                top: y1,
                width: len + 1,
                height: 2,
                backgroundColor: lineColor,
                opacity: 0.85,
                transform: [{ rotate: `${angle}deg` }, { translateY: -1 }],
                transformOrigin: '0 50%',
              }}
            />
          );
        })}

        {/* Entry price horizontal line */}
        {entryY != null && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: entryY - 0.5,
              width: W,
              height: 1,
              backgroundColor: Colors.warning,
              opacity: 0.7,
            }}
          />
        )}

        {/* Current price dot */}
        <View
          style={{
            position: 'absolute',
            left: W - 6,
            top: currentY - 5,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: lineColor,
            borderWidth: 2,
            borderColor: Colors.bgCard,
          }}
        />
      </View>
    </View>
  );
}

// ─── Countdown Ring ───────────────────────────────────────────────────────────
function CountdownRing({
  remaining,
  total,
  direction,
}: {
  remaining: number;
  total: number;
  direction: Direction;
}) {
  const pct = remaining / total;
  const color = direction === 'up' ? Colors.success : Colors.error;

  return (
    <View style={styles.countdownWrap}>
      {/* Outer ring via border */}
      <View style={[styles.countdownRingOuter, { borderColor: color + '33' }]}>
        <View style={[styles.countdownRingInner, { borderColor: color }]}>
          <Text style={[styles.countdownSec, { color }]}>{remaining}</Text>
          <Text style={styles.countdownLabel}>sec left</Text>
        </View>
      </View>
      {/* Progress arc — approximated via a rotating half-circle mask trick */}
      <View
        style={[
          styles.countdownProgress,
          {
            borderLeftColor: pct > 0.5 ? color : 'transparent',
            borderTopColor: pct > 0.25 ? color : 'transparent',
            borderRightColor: color,
            borderBottomColor: pct > 0.75 ? color : 'transparent',
          },
        ]}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BinaryTradingScreen() {
  const insets      = useSafeAreaInsets();
  const router      = useRouter();
  const { showAlert } = useAlert();
  const { practiceBalance, executePracticeTrade } = useWallet();
  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();
  const showLocalConversion = selectedCurrency.code !== 'USD';
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;
  const SCREEN_W = Dimensions.get('window').width;

  // ── Form state ─────────────────────────────────────────────────────────────
  const [selectedCoin, setSelectedCoin] = useState(COINS[0]);
  const [duration, setDuration]         = useState(DURATIONS[0]);
  const [stakeText, setStakeText]       = useState('25');
  const [direction, setDirection]       = useState<Direction | null>(null);

  // ── Live price simulation ──────────────────────────────────────────────────
  const [livePrice, setLivePrice]   = useState(selectedCoin.basePrice);
  const [priceHistory, setPriceHistory] = useState<number[]>([selectedCoin.basePrice]);
  const [priceUp, setPriceUp]       = useState(true); // tick direction for indicator
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Trade phase ─────────────────────────────────────────────────────────────
  const [phase, setPhase]           = useState<TradePhase>('setup');
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [remaining, setRemaining]   = useState(0);
  const [history, setHistory]       = useState<BinaryTrade[]>([]);

  // ── Animations ────────────────────────────────────────────────────────────
  const pricePulse = useRef(new Animated.Value(1)).current;
  const resultScale = useRef(new Animated.Value(0.7)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const [tradeResult, setTradeResult] = useState<BinaryTrade | null>(null);

  // ─── Tick: simulate price ──────────────────────────────────────────────────
  const startTick = useCallback((coin: typeof COINS[0]) => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setLivePrice(prev => {
        const delta = randomDelta(prev, coin.volatility);
        const next  = Math.max(prev * 0.9, prev + delta);
        setPriceUp(delta >= 0);

        // Pulse animation on tick
        Animated.sequence([
          Animated.timing(pricePulse, { toValue: 1.06, duration: 80, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
          Animated.timing(pricePulse, { toValue: 1,    duration: 140, useNativeDriver: true }),
        ]).start();

        setPriceHistory(h => {
          const next2 = [...h, next];
          return next2.length > 60 ? next2.slice(-60) : next2;
        });
        return next;
      });
    }, 1000);
  }, [pricePulse]);

  useEffect(() => {
    startTick(selectedCoin);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [selectedCoin]);

  // ── Switch coin: reset prices ──────────────────────────────────────────────
  const handleCoinSelect = useCallback((coin: typeof COINS[0]) => {
    if (phase !== 'setup') return;
    setSelectedCoin(coin);
    setLivePrice(coin.basePrice);
    setPriceHistory([coin.basePrice]);
    startTick(coin);
  }, [phase, startTick]);

  // ── Place trade ─────────────────────────────────────────────────────────────
  const handlePlace = useCallback(async (dir: Direction) => {
    const stake = parseFloat(stakeText);
    if (!stake || stake <= 0) { showAlert('Invalid Stake', 'Enter a valid stake amount.'); return; }
    if (stake > practiceBalance) { showAlert('Insufficient Balance', `Your practice balance is ${fmtUsd(practiceBalance)}.`); return; }

    setDirection(dir);
    setPhase('active');
    setEntryPrice(livePrice);
    setRemaining(duration.seconds);

    // Deduct stake from practice balance immediately
    await executePracticeTrade(
      selectedCoin.symbol.toLowerCase() === 'btng' ? 'btng' : selectedCoin.symbol.toLowerCase(),
      'buy',
      stake / livePrice,
    );

    // Countdown
    let secs = duration.seconds;
    const timer = setInterval(() => {
      secs -= 1;
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(timer);
        finalizeTrade(dir, stake, livePrice);
      }
    }, 1000);
  }, [stakeText, practiceBalance, livePrice, selectedCoin, duration, executePracticeTrade]);

  // ── Finalize ────────────────────────────────────────────────────────────────
  const finalizeTrade = useCallback((dir: Direction, stake: number, entry: number) => {
    setLivePrice(prev => {
      const exitPrice = prev;
      const won =
        dir === 'up'   ? exitPrice > entry :
        dir === 'down' ? exitPrice < entry :
        false;

      const pnl = won ? stake * PAYOUT_RATE : -stake;

      const result: BinaryTrade = {
        id: Date.now().toString(),
        coin: selectedCoin.symbol,
        coinIcon: selectedCoin.icon,
        direction: dir,
        stake,
        entryPrice: entry,
        exitPrice,
        duration: duration.seconds,
        won,
        pnl,
        timestamp: new Date().toISOString(),
      };

      setTradeResult(result);
      setHistory(h => [result, ...h.slice(0, 19)]);
      setPhase('result');

      // Add payout or already deducted stake. If won, return stake + profit
      if (won) {
        executePracticeTrade(
          selectedCoin.symbol.toLowerCase() === 'btng' ? 'btng' : selectedCoin.symbol.toLowerCase(),
          'sell',
          (stake + stake * PAYOUT_RATE) / exitPrice,
        );
      }

      // Animate result card
      resultScale.setValue(0.7);
      resultOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(resultScale,   { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 200 }),
        Animated.timing(resultOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

      return exitPrice;
    });
  }, [selectedCoin, duration, resultScale, resultOpacity, executePracticeTrade]);

  // ── Reset ────────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setPhase('setup');
    setDirection(null);
    setEntryPrice(null);
    setTradeResult(null);
    setRemaining(0);
  }, []);

  const stake = parseFloat(stakeText) || 0;
  const payout = stake * PAYOUT_RATE;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.title}>Binary Trading</Text>
            <View style={styles.practicePill}>
              <MaterialIcons name="science" size={11} color={Colors.warning} />
              <Text style={styles.practicePillText}>PRACTICE MODE</Text>
            </View>
          </View>
          <View style={styles.balancePill}>
            <Text style={styles.balancePillText}>{fmtUsd(practiceBalance)}</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Coin Selector ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.coinScroll} contentContainerStyle={styles.coinScrollContent}>
            {COINS.map(c => (
              <TouchableOpacity
                key={c.symbol}
                style={[styles.coinChip, selectedCoin.symbol === c.symbol && styles.coinChipActive]}
                onPress={() => handleCoinSelect(c)}
                activeOpacity={0.8}
              >
                <Text style={styles.coinChipIcon}>{c.icon}</Text>
                <Text style={[styles.coinChipSymbol, selectedCoin.symbol === c.symbol && { color: Colors.primary }]}>
                  {c.symbol}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── Price Ticker ── */}
          <View style={styles.tickerCard}>
            <View style={styles.tickerTop}>
              <View style={styles.tickerLeft}>
                <Text style={styles.tickerCoinName}>{selectedCoin.name}</Text>
                <Animated.Text
                  style={[
                    styles.tickerPrice,
                    { color: priceUp ? Colors.success : Colors.error, transform: [{ scale: pricePulse }] },
                  ]}
                >
                  {fmtPrice(selectedCoin, livePrice)}
                </Animated.Text>
                <View style={[styles.tickerDir, { backgroundColor: (priceUp ? Colors.success : Colors.error) + '22' }]}>
                  <MaterialIcons
                    name={priceUp ? 'arrow-drop-up' : 'arrow-drop-down'}
                    size={16}
                    color={priceUp ? Colors.success : Colors.error}
                  />
                  <Text style={[styles.tickerDirText, { color: priceUp ? Colors.success : Colors.error }]}>
                    {priceUp ? 'Rising' : 'Falling'}
                  </Text>
                </View>
              </View>

              {/* Countdown (active phase) */}
              {phase === 'active' && direction && (
                <CountdownRing remaining={remaining} total={duration.seconds} direction={direction} />
              )}
            </View>

            {/* Live chart */}
            <LiveChart
              prices={priceHistory}
              width={SCREEN_W - Spacing.xl * 2 - 32}
              height={110}
              direction={phase === 'active' ? direction : null}
              entryPrice={entryPrice}
            />

            {/* Entry price indicator */}
            {phase === 'active' && entryPrice && (
              <View style={styles.entryPriceRow}>
                <View style={styles.entryPriceDot} />
                <Text style={styles.entryPriceLabel}>Entry</Text>
                <Text style={styles.entryPriceValue}>{fmtPrice(selectedCoin, entryPrice)}</Text>
                <View style={styles.entryPriceDivider} />
                <Text style={styles.entryPriceLabel}>Current</Text>
                <Text style={[styles.entryPriceValue, { color: livePrice >= entryPrice ? Colors.success : Colors.error }]}>
                  {fmtPrice(selectedCoin, livePrice)}
                </Text>
                {direction && (
                  <View style={[styles.tradeDirBadge, { backgroundColor: (direction === 'up' ? Colors.success : Colors.error) + '22', borderColor: (direction === 'up' ? Colors.success : Colors.error) + '44' }]}>
                    <MaterialIcons
                      name={direction === 'up' ? 'trending-up' : 'trending-down'}
                      size={12}
                      color={direction === 'up' ? Colors.success : Colors.error}
                    />
                    <Text style={[styles.tradeDirText, { color: direction === 'up' ? Colors.success : Colors.error }]}>
                      {direction.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Result Card ── */}
          {phase === 'result' && tradeResult && (
            <Animated.View
              style={[
                styles.resultCard,
                {
                  borderColor: tradeResult.won ? Colors.success + '66' : Colors.error + '66',
                  backgroundColor: tradeResult.won ? Colors.successBg : Colors.errorBg,
                  transform: [{ scale: resultScale }],
                  opacity: resultOpacity,
                },
              ]}
            >
              <View style={[styles.resultIconWrap, { backgroundColor: (tradeResult.won ? Colors.success : Colors.error) + '22' }]}>
                <MaterialIcons
                  name={tradeResult.won ? 'emoji-events' : 'sentiment-dissatisfied'}
                  size={40}
                  color={tradeResult.won ? Colors.success : Colors.error}
                />
              </View>
              <Text style={[styles.resultTitle, { color: tradeResult.won ? Colors.success : Colors.error }]}>
                {tradeResult.won ? 'You Won! 🎉' : 'You Lost'}
              </Text>
              <Text style={styles.resultSub}>
                {tradeResult.coin} went {livePrice >= (tradeResult.entryPrice) ? 'UP' : 'DOWN'} — you predicted {tradeResult.direction.toUpperCase()}
              </Text>

              <View style={styles.resultStats}>
                {[
                  { label: 'Stake',       value: fmtUsd(tradeResult.stake),      color: Colors.textPrimary,  usd: tradeResult.stake },
                  { label: 'Entry',       value: fmtPrice(selectedCoin, tradeResult.entryPrice), color: Colors.textSecondary, usd: null },
                  { label: 'Exit',        value: fmtPrice(selectedCoin, tradeResult.exitPrice!),  color: Colors.textSecondary, usd: null },
                  { label: tradeResult.won ? 'Profit' : 'Loss', value: (tradeResult.won ? '+' : '-') + fmtUsd(Math.abs(tradeResult.pnl!)), color: tradeResult.won ? Colors.success : Colors.error, usd: Math.abs(tradeResult.pnl ?? 0), isProfit: true, isWon: tradeResult.won },
                ].map(s => (
                  <View key={s.label} style={styles.resultStat}>
                    <Text style={styles.resultStatLabel}>{s.label}</Text>
                    <Text style={[styles.resultStatValue, { color: s.color }]}>{s.value}</Text>
                    {showLocalConversion && s.usd != null && s.usd > 0 && (() => {
                      const localVal = convertUSDRaw(s.usd);
                      const sign = (s as any).isProfit ? ((s as any).isWon ? '+' : '-') : '';
                      return (
                        <View style={styles.localBadge}>
                          <Text style={styles.localBadgeFlag}>{selectedCurrency.flag}</Text>
                          <Text style={[styles.localBadgeText, { color: s.color }]}>
                            {sign}{selectedCurrency.symbol}{localVal >= 1000
                              ? localVal.toLocaleString('en-US', { maximumFractionDigits: 0 })
                              : localVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                ))}
              </View>

              <TouchableOpacity style={[styles.tradeAgainBtn, { backgroundColor: tradeResult.won ? Colors.success : Colors.primary }]} onPress={handleReset}>
                <MaterialIcons name="replay" size={18} color={Colors.bg} />
                <Text style={styles.tradeAgainText}>Trade Again</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── Setup Panel (hidden during active/result) ── */}
          {phase === 'setup' && (
            <>
              {/* Duration */}
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Duration</Text>
                <View style={styles.durationRow}>
                  {DURATIONS.map(d => (
                    <TouchableOpacity
                      key={d.label}
                      style={[styles.durationBtn, duration.seconds === d.seconds && styles.durationBtnActive]}
                      onPress={() => setDuration(d)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.durationLabel, duration.seconds === d.seconds && styles.durationLabelActive]}>
                        {d.label}
                      </Text>
                      <Text style={[styles.durationSub, duration.seconds === d.seconds && { color: Colors.primary }]}>
                        {d.seconds === 30 ? 'Quick' : d.seconds === 60 ? 'Standard' : 'Extended'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Stake */}
              <View style={styles.panel}>
                <View style={styles.panelTitleRow}>
                  <Text style={styles.panelTitle}>Stake Amount</Text>
                  <Text style={styles.balanceHint}>Balance: {fmtUsd(practiceBalance)}</Text>
                </View>

                <View style={styles.stakeInputRow}>
                  <Text style={styles.stakePrefix}>$</Text>
                  <TextInput
                    style={styles.stakeInput}
                    value={stakeText}
                    onChangeText={v => setStakeText(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                  />
                  <View style={styles.payoutBadge}>
                    <Text style={styles.payoutLabel}>Win</Text>
                    <Text style={styles.payoutValue}>+{fmtUsd(payout)}</Text>
                  </View>
                </View>

                <View style={styles.quickStakeRow}>
                  {QUICK_STAKES.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.quickStake, stakeText === String(s) && styles.quickStakeActive]}
                      onPress={() => setStakeText(String(s))}
                    >
                      <Text style={[styles.quickStakeText, stakeText === String(s) && styles.quickStakeTextActive]}>
                        ${s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Payout summary */}
                <View style={styles.payoutRow}>
                  <View style={styles.payoutItem}>
                    <Text style={styles.payoutItemLabel}>Payout Rate</Text>
                    <Text style={styles.payoutItemValue}>{(PAYOUT_RATE * 100).toFixed(0)}%</Text>
                  </View>
                  <View style={styles.payoutDivider} />
                  <View style={styles.payoutItem}>
                    <Text style={styles.payoutItemLabel}>If Win</Text>
                    <Text style={[styles.payoutItemValue, { color: Colors.success }]}>+{fmtUsd(payout)}</Text>
                    {showLocalConversion && payout > 0 && (() => {
                      const localPayout = convertUSDRaw(payout);
                      return (
                        <View style={styles.localBadge}>
                          <Text style={styles.localBadgeFlag}>{selectedCurrency.flag}</Text>
                          <Text style={[styles.localBadgeText, { color: Colors.success }]}>
                            +{selectedCurrency.symbol}{localPayout >= 1000
                              ? localPayout.toLocaleString('en-US', { maximumFractionDigits: 0 })
                              : localPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                  <View style={styles.payoutDivider} />
                  <View style={styles.payoutItem}>
                    <Text style={styles.payoutItemLabel}>If Lose</Text>
                    <Text style={[styles.payoutItemValue, { color: Colors.error }]}>-{fmtUsd(stake)}</Text>
                    {showLocalConversion && stake > 0 && (() => {
                      const localStake = convertUSDRaw(stake);
                      return (
                        <View style={styles.localBadge}>
                          <Text style={styles.localBadgeFlag}>{selectedCurrency.flag}</Text>
                          <Text style={[styles.localBadgeText, { color: Colors.error }]}>
                            -{selectedCurrency.symbol}{localStake >= 1000
                              ? localStake.toLocaleString('en-US', { maximumFractionDigits: 0 })
                              : localStake.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>
                {/* Live rate pill beneath payout row */}
                {showLocalConversion && stake > 0 && (
                  <View style={styles.liveRateRow}>
                    <View style={styles.liveRatePill}>
                      {ratesLoading ? null : <View style={styles.liveDot} />}
                      <Text style={styles.liveRateText}>
                        {rateTimestamp ? `Live · ${rateTimestamp}` : 'Live'}
                      </Text>
                    </View>
                    <Text style={styles.liveRateHint}>
                      1 USD = {convertUSDRaw(1).toLocaleString('en-US', { maximumFractionDigits: 2 })} {selectedCurrency.code}
                    </Text>
                  </View>
                )}
              </View>

              {/* UP / DOWN Buttons */}
              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={[styles.ctaBtn, styles.ctaUp, (!stake || stake > practiceBalance) && styles.ctaBtnDisabled]}
                  onPress={() => handlePlace('up')}
                  disabled={!stake || stake > practiceBalance}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="trending-up" size={28} color="#fff" />
                  <Text style={styles.ctaBtnLabel}>UP</Text>
                  <Text style={styles.ctaBtnSub}>Price will rise</Text>
                </TouchableOpacity>

                <View style={styles.ctaDivider}>
                  <View style={styles.ctaVsCircle}>
                    <Text style={styles.ctaVsText}>VS</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.ctaBtn, styles.ctaDown, (!stake || stake > practiceBalance) && styles.ctaBtnDisabled]}
                  onPress={() => handlePlace('down')}
                  disabled={!stake || stake > practiceBalance}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="trending-down" size={28} color="#fff" />
                  <Text style={styles.ctaBtnLabel}>DOWN</Text>
                  <Text style={styles.ctaBtnSub}>Price will fall</Text>
                </TouchableOpacity>
              </View>

              {stake > practiceBalance && (
                <Text style={styles.errorHint}>Stake exceeds practice balance</Text>
              )}
            </>
          )}

          {/* ── Active Trade Status ── */}
          {phase === 'active' && direction && (
            <View style={[styles.activeCard, { borderColor: (direction === 'up' ? Colors.success : Colors.error) + '55' }]}>
              <View style={[styles.activeBadge, { backgroundColor: (direction === 'up' ? Colors.success : Colors.error) + '22' }]}>
                <MaterialIcons
                  name={direction === 'up' ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={direction === 'up' ? Colors.success : Colors.error}
                />
                <Text style={[styles.activeBadgeText, { color: direction === 'up' ? Colors.success : Colors.error }]}>
                  {direction.toUpperCase()} — {selectedCoin.symbol}
                </Text>
              </View>

              <View style={styles.activeStats}>
                <View style={styles.activeStat}>
                  <Text style={styles.activeStatLabel}>Stake</Text>
                  <Text style={styles.activeStatValue}>{fmtUsd(stake)}</Text>
                  {showLocalConversion && stake > 0 && (() => {
                    const localStake = convertUSDRaw(stake);
                    return (
                      <View style={styles.localBadge}>
                        <Text style={styles.localBadgeFlag}>{selectedCurrency.flag}</Text>
                        <Text style={styles.localBadgeText}>
                          {selectedCurrency.symbol}{localStake >= 1000
                            ? localStake.toLocaleString('en-US', { maximumFractionDigits: 0 })
                            : localStake.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
                <View style={styles.activeStatDivider} />
                <View style={styles.activeStat}>
                  <Text style={styles.activeStatLabel}>Potential Win</Text>
                  <Text style={[styles.activeStatValue, { color: Colors.success }]}>+{fmtUsd(payout)}</Text>
                  {showLocalConversion && payout > 0 && (() => {
                    const localPayout = convertUSDRaw(payout);
                    return (
                      <View style={styles.localBadge}>
                        <Text style={styles.localBadgeFlag}>{selectedCurrency.flag}</Text>
                        <Text style={[styles.localBadgeText, { color: Colors.success }]}>
                          +{selectedCurrency.symbol}{localPayout >= 1000
                            ? localPayout.toLocaleString('en-US', { maximumFractionDigits: 0 })
                            : localPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
                <View style={styles.activeStatDivider} />
                <View style={styles.activeStat}>
                  <Text style={styles.activeStatLabel}>Duration</Text>
                  <Text style={styles.activeStatValue}>{duration.label}</Text>
                  {showLocalConversion && rateTimestamp && (
                    <View style={styles.liveRatePill}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveRateText}>Live</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Live P&L indicator */}
              {entryPrice && (
                <View style={styles.livePnl}>
                  {(() => {
                    const priceMove = livePrice - entryPrice;
                    const isWinning =
                      (direction === 'up' && priceMove > 0) ||
                      (direction === 'down' && priceMove < 0);
                    return (
                      <>
                        <View style={[styles.livePnlDot, { backgroundColor: isWinning ? Colors.success : Colors.error }]} />
                        <Text style={[styles.livePnlText, { color: isWinning ? Colors.success : Colors.error }]}>
                          {isWinning ? 'Currently WINNING' : 'Currently LOSING'}
                        </Text>
                        <Text style={styles.livePnlMove}>
                          {priceMove >= 0 ? '+' : ''}{selectedCoin.basePrice >= 1000
                            ? priceMove.toFixed(2)
                            : priceMove.toFixed(5)
                          }
                        </Text>
                      </>
                    );
                  })()}
                </View>
              )}
            </View>
          )}

          {/* ── Trade History ── */}
          {history.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historySectionTitle}>Recent Trades</Text>
              {history.slice(0, 10).map(t => (
                <View key={t.id} style={[styles.historyRow, { borderLeftColor: t.won ? Colors.success : Colors.error }]}>
                  <View style={[styles.historyIcon, { backgroundColor: (t.won ? Colors.success : Colors.error) + '22' }]}>
                    <Text style={{ fontSize: 16 }}>{t.coinIcon}</Text>
                  </View>
                  <View style={styles.historyInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.historyTitle}>{t.coin}</Text>
                      <View style={[styles.historyDirBadge, { backgroundColor: (t.direction === 'up' ? Colors.success : Colors.error) + '22' }]}>
                        <MaterialIcons
                          name={t.direction === 'up' ? 'trending-up' : 'trending-down'}
                          size={11}
                          color={t.direction === 'up' ? Colors.success : Colors.error}
                        />
                        <Text style={[styles.historyDirText, { color: t.direction === 'up' ? Colors.success : Colors.error }]}>
                          {t.direction.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.historySub}>
                      {fmtPrice(selectedCoin, t.entryPrice)} → {t.exitPrice ? fmtPrice(selectedCoin, t.exitPrice) : '—'}  •  {t.duration}s
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[styles.historyPnl, { color: t.won ? Colors.success : Colors.error }]}>
                      {t.won ? '+' : '-'}{fmtUsd(Math.abs(t.pnl ?? 0))}
                    </Text>
                    {showLocalConversion && (t.pnl ?? 0) !== 0 && (() => {
                      const localPnl = convertUSDRaw(Math.abs(t.pnl ?? 0));
                      return (
                        <View style={styles.localBadge}>
                          <Text style={styles.localBadgeFlag}>{selectedCurrency.flag}</Text>
                          <Text style={[styles.localBadgeText, { color: t.won ? Colors.success : Colors.error }]}>
                            {t.won ? '+' : '-'}{selectedCurrency.symbol}{localPnl >= 1000
                              ? localPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })
                              : localPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      );
                    })()}
                    <View style={[styles.historyResult, { backgroundColor: (t.won ? Colors.success : Colors.error) + '22' }]}>
                      <Text style={[styles.historyResultText, { color: t.won ? Colors.success : Colors.error }]}>
                        {t.won ? 'WIN' : 'LOSS'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Stats summary if history has items */}
          {history.length >= 3 && (
            <View style={styles.statsCard}>
              <Text style={styles.statsSectionTitle}>Session Stats</Text>
              <View style={styles.statsRow}>
                {[
                  { label: 'Trades',   value: String(history.length) },
                  { label: 'Win Rate', value: `${((history.filter(h => h.won).length / history.length) * 100).toFixed(0)}%`, color: Colors.success },
                  { label: 'Net PnL',  value: (history.reduce((s, h) => s + (h.pnl ?? 0), 0) >= 0 ? '+' : '') + fmtUsd(history.reduce((s, h) => s + (h.pnl ?? 0), 0)), color: history.reduce((s, h) => s + (h.pnl ?? 0), 0) >= 0 ? Colors.success : Colors.error },
                  { label: 'Best Win', value: '+' + fmtUsd(Math.max(...history.filter(h => h.won).map(h => h.pnl ?? 0), 0)), color: Colors.success },
                ].map(s => (
                  <View key={s.label} style={styles.statItem}>
                    <Text style={[styles.statValue, s.color ? { color: s.color } : {}]}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.disclaimerText}>
              Binary trading uses <Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>virtual practice funds only</Text>. No real money is at risk. For educational simulation purposes only.
            </Text>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  practicePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.warningBg, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 2,
    borderWidth: 1, borderColor: Colors.warning + '55',
  },
  practicePillText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.warning, letterSpacing: 0.5, includeFontPadding: false },
  balancePill: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  balancePillText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.lg },

  // Coin Selector
  coinScroll: { marginHorizontal: -Spacing.xl },
  coinScrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  coinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 9,
    borderWidth: 1, borderColor: Colors.border, minWidth: 72,
  },
  coinChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  coinChipIcon: { fontSize: 16 },
  coinChipSymbol: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  // Ticker Card
  tickerCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md,
    overflow: 'hidden',
  },
  tickerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tickerLeft: { gap: 5 },
  tickerCoinName: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  tickerPrice: { fontSize: 28, fontWeight: FontWeight.heavy, includeFontPadding: false },
  tickerDir: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  tickerDirText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  entryPriceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  entryPriceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning },
  entryPriceLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  entryPriceValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  entryPriceDivider: { width: 1, height: 14, backgroundColor: Colors.border, marginHorizontal: 4 },
  tradeDirBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1,
  },
  tradeDirText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Result Card
  resultCard: {
    borderRadius: Radius.xl, borderWidth: 1.5,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.lg,
  },
  resultIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  resultTitle: { fontSize: 26, fontWeight: FontWeight.heavy, includeFontPadding: false },
  resultSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  resultStats: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    width: '100%',
  },
  resultStat: {
    flex: 1, minWidth: '40%', backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    padding: Spacing.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  resultStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  resultStatValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  tradeAgainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl,
    minWidth: 180,
  },
  tradeAgainText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Setup panels
  panel: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md,
  },
  panelTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceHint: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  durationRow: { flexDirection: 'row', gap: Spacing.sm },
  durationBtn: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: Spacing.md,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  durationBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  durationLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  durationLabelActive: { color: Colors.primary },
  durationSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  stakeInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 2, borderColor: Colors.primary + '66', overflow: 'hidden',
  },
  stakePrefix: { paddingHorizontal: Spacing.lg, fontSize: 24, fontWeight: FontWeight.bold, color: Colors.primary },
  stakeInput: {
    flex: 1, paddingVertical: Spacing.md,
    fontSize: 24, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false,
  },
  payoutBadge: {
    backgroundColor: Colors.successBg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderLeftWidth: 1, borderLeftColor: Colors.success + '44', alignItems: 'center', gap: 2,
    minWidth: 72,
  },
  payoutLabel: { fontSize: 9, color: Colors.success, fontWeight: FontWeight.bold, includeFontPadding: false },
  payoutValue: { fontSize: FontSize.sm, color: Colors.success, fontWeight: FontWeight.bold, includeFontPadding: false },

  quickStakeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  quickStake: {
    paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
  },
  quickStakeActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  quickStakeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  quickStakeTextActive: { color: Colors.primary },

  payoutRow: {
    flexDirection: 'row', backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  payoutItem: { flex: 1, alignItems: 'center', gap: 3 },
  payoutItemLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  payoutItemValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  payoutDivider: { width: 1, backgroundColor: Colors.border },

  // UP / DOWN CTA
  ctaRow: { flexDirection: 'row', gap: 0, alignItems: 'center', height: 110 },
  ctaBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: Radius.xl, paddingVertical: Spacing.lg,
    height: '100%',
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaUp:   { backgroundColor: Colors.success },
  ctaDown: { backgroundColor: Colors.error },
  ctaBtnLabel: { fontSize: 22, fontWeight: FontWeight.heavy, color: '#fff', includeFontPadding: false },
  ctaBtnSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', includeFontPadding: false },
  ctaDivider: { width: 32, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  ctaVsCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.bgCard, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaVsText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },

  errorHint: { fontSize: FontSize.xs, color: Colors.error, textAlign: 'center', includeFontPadding: false },

  // Active card
  activeCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1.5, padding: Spacing.lg, gap: Spacing.md,
  },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  activeBadgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  activeStats: { flexDirection: 'row' },
  activeStat: { flex: 1, alignItems: 'center', gap: 3 },
  activeStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  activeStatValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  activeStatDivider: { width: 1, backgroundColor: Colors.border },
  livePnl: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  livePnlDot: { width: 8, height: 8, borderRadius: 4 },
  livePnlText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, includeFontPadding: false },
  livePnlMove: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Countdown
  countdownWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  countdownRingOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  countdownRingInner: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgCard, gap: 1 },
  countdownSec: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  countdownLabel: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  countdownProgress: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    borderWidth: 3,
    borderLeftColor: 'transparent', borderTopColor: 'transparent',
    borderRightColor: 'transparent', borderBottomColor: 'transparent',
  },

  // History
  historySection: { gap: Spacing.sm },
  historySectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 4 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    gap: Spacing.md, borderLeftWidth: 3,
  },
  historyIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  historyInfo: { flex: 1, gap: 3 },
  historyTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historySub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  historyPnl: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  historyDirBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  historyDirText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  historyResult: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  historyResultText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Session stats
  statsCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.primary + '33',
    padding: Spacing.lg, gap: Spacing.md,
  },
  statsSectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statsRow: { flexDirection: 'row' },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Local currency badge
  localBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '33', marginTop: 2 },
  localBadgeFlag: { fontSize: 9 },
  localBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Live rate row beneath payout summary
  liveRateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveRatePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveRateText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  liveRateHint: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Disclaimer
  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    paddingHorizontal: Spacing.sm,
  },
  disclaimerText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
});

// Expose Spacing.xxl fallback (in case theme doesn't define it)
const Spacing_xxl = (Spacing as any).xxl ?? 32;
