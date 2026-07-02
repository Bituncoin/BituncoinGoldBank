import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'buy' | 'sell';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export function BTNGButton({
  title, onPress, variant = 'primary', size = 'md',
  disabled, loading, style, textStyle, fullWidth = false,
}: ButtonProps) {
  const btnStyle = [
    styles.base,
    styles[variant],
    styles[`size_${size}`],
    fullWidth && { width: '100%' as const },
    (disabled || loading) && styles.disabled,
    style,
  ];

  return (
    <TouchableOpacity style={btnStyle} onPress={onPress} disabled={disabled || loading} activeOpacity={0.75}>
      <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`], textStyle]}>
        {loading ? 'Loading...' : title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  // Variants
  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.surfaceLight },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary },
  danger: { backgroundColor: Colors.error },
  buy: { backgroundColor: Colors.success },
  sell: { backgroundColor: Colors.error },
  disabled: { opacity: 0.4 },
  // Sizes
  size_sm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, minHeight: 36 },
  size_md: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 4, minHeight: 48 },
  size_lg: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, minHeight: 56 },
  // Text
  text: { fontWeight: FontWeight.semibold, includeFontPadding: false },
  text_primary: { color: Colors.bg },
  text_secondary: { color: Colors.textPrimary },
  text_outline: { color: Colors.primary },
  text_danger: { color: '#fff' },
  text_buy: { color: '#fff' },
  text_sell: { color: '#fff' },
  textSize_sm: { fontSize: FontSize.sm },
  textSize_md: { fontSize: FontSize.md },
  textSize_lg: { fontSize: FontSize.lg },
});
