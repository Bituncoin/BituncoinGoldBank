/**
 * FXTicker — Live USD → African Currency rates, auto-scrolling horizontal strip
 * Sources rates from ExchangeRateContext (open.er-api.com, refreshes every 5 min).
 * Cycles through GHS, NGN, KES, ZAR, EGP every 3 seconds with a smooth scroll.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Animated, Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';

// ── Ticker currencies ─────────────────────────────────────────────────────────
const TICKERS = [
  { code: 'GHS', flag: '🇬🇭', name: 'Ghana Cedi',        symbol: '₵'  },
  { code: 'NGN', flag: '🇳🇬', name: 'Nigerian Naira',     symbol: '₦'  },
  { code: 'KES', flag: '🇰🇪', name: 'Kenyan Shilling',    symbol: 'KSh'},
  { code: 'ZAR', flag: '🇿🇦', name: 'South African Rand', symbol: 'R'  },
  { code: 'EGP', flag: '🇪🇬', name: 'Egyptian Pound',     symbol: '£'  },
];

// Each chip is approximately 148px wide + 8px gap
const CHIP_WIDTH = 156;

interface FXTickerProps {
  style?: any;
}

export function FXTicker({ style }: FXTickerProps) {
  const { getRate, loading, lastUpdated } = useExchangeRateContext();
  const scrollRef  = useRef<ScrollView>(null);
  const indexRef   = useRef(0);
  const pulseAnim  = useRef(new Animated.Value(0.4)).current;

  // Pulse the live dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Auto-scroll every 3 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % TICKERS.length;
      scrollRef.current?.scrollTo({
        x: indexRef.current * CHIP_WIDTH,
        animated: true,
      });
    }, 3_000);
    return () => clearInterval(timer);
  }, []);

  const lastUpdatedTxt = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={[styles.container, style]}>
      {/* Label */}
      <View style={styles.labelCol}>
        <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
        <Text style={styles.labelTxt}>FX</Text>
      </View>

      {/* Scrolling chips */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
        decelerationRate="fast"
        snapToInterval={CHIP_WIDTH}
        snapToAlignment="start"
      >
        {TICKERS.map((t, i) => {
          const rate = getRate(t.code);
          const formattedRate = rate >= 1000
            ? rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
            : rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          return (
            <View key={t.code} style={styles.chip}>
              <Text style={styles.flag}>{t.flag}</Text>
              <View style={styles.chipBody}>
                <View style={styles.chipTop}>
                  <Text style={styles.chipCode}>{t.code}</Text>
                  <Text style={styles.chipSep}>/USD</Text>
                </View>
                <Text style={styles.chipRate}>
                  {loading && !lastUpdated ? '—' : `${t.symbol}${formattedRate}`}
                </Text>
              </View>
              {/* Tiny up/down indicator — static for now, could wire to 24h change */}
              <MaterialIcons
                name={rate > 0 ? 'show-chart' : 'trending-flat'}
                size={12}
                color={Colors.textMuted}
                style={styles.chipIcon}
              />
            </View>
          );
        })}
      </ScrollView>

      {/* Timestamp */}
      {lastUpdatedTxt && (
        <Text style={styles.ts}>{lastUpdatedTxt}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.sm,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    minHeight: 52,
    overflow: 'hidden',
  },
  labelCol: {
    alignItems: 'center',
    gap: 4,
    paddingRight: Spacing.sm,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    marginRight: Spacing.sm,
    width: 26,
    flexShrink: 0,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  labelTxt: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    width: 148,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    gap: 6,
    flexShrink: 0,
  },
  flag: {
    fontSize: 20,
    lineHeight: 24,
    includeFontPadding: false,
  },
  chipBody: {
    flex: 1,
    gap: 1,
  },
  chipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  chipCode: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  chipSep: {
    fontSize: 8,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  chipRate: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
  chipIcon: {
    opacity: 0.5,
    flexShrink: 0,
  },
  ts: {
    fontSize: 8,
    color: Colors.textMuted,
    includeFontPadding: false,
    paddingLeft: 4,
    flexShrink: 0,
  },
});
