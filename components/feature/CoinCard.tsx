import React from 'react';
import { View, Text, StyleSheet, ViewStyle, ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// Gold coin image source — used for all three BTNG gold units
const BTNG_COIN_IMG = require('@/assets/images/btng_coin_logo.jpg');
const GOLD_SYMBOLS = new Set(['BTNGG', 'BTNG-G', 'BTNG-KG', 'BTNG']);

interface CoinCardProps {
  symbol: string;
  name: string;
  logo: string;
  price: number;
  change24h: number;
  color: string;
  balance?: number;
  showBalance?: boolean;
  style?: ViewStyle;
  /** Optional override image — if not supplied, BTNG gold symbols auto-use btng_coin_logo.jpg */
  imageSource?: ImageSourcePropType | null;
}

export function CoinCard({ symbol, name, logo, price, change24h, color, balance, showBalance, style, imageSource }: CoinCardProps) {
  const isPositive = change24h >= 0;
  const portfolioValue = balance ? balance * price : 0;

  // Auto-use gold coin image for BTNG gold units
  const resolvedImage = imageSource !== undefined
    ? imageSource
    : GOLD_SYMBOLS.has(symbol)
      ? BTNG_COIN_IMG
      : null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.left}>
        <View style={[styles.logo, { backgroundColor: color + '22', borderColor: color + '44' }]}>
          {resolvedImage ? (
            <Image
              source={resolvedImage}
              style={styles.logoImg}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <Text style={[styles.logoText, { color }]}>{logo}</Text>
          )}
        </View>
        <View style={styles.nameCol}>
          <Text style={styles.symbol}>{symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>${price >= 1000 ? (price / 1000).toFixed(1) + 'K' : price.toFixed(3)}</Text>
        <View style={[styles.changeBadge, { backgroundColor: isPositive ? Colors.successBg : Colors.errorBg }]}>
          <Text style={[styles.change, { color: isPositive ? Colors.success : Colors.error }]}>
            {isPositive ? '+' : ''}{change24h.toFixed(2)}%
          </Text>
        </View>
        {showBalance && balance !== undefined && (
          <Text style={styles.value}>${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  logo: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  logoImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  logoText: { fontSize: 20, fontWeight: FontWeight.bold },
  nameCol: { flex: 1, minWidth: 0 },
  symbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  name: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  right: { alignItems: 'flex-end', gap: 3 },
  price: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  changeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  change: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  value: { fontSize: FontSize.sm, color: Colors.textGold, fontWeight: FontWeight.medium, includeFontPadding: false },
});
