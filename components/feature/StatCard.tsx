import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  style?: ViewStyle;
}

export function StatCard({ label, value, sub, color = Colors.primary, style }: StatCardProps) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flex: 1,
  },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false, marginBottom: 4 },
  value: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, includeFontPadding: false },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
});
