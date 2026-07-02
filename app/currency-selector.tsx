import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { AFRICAN_CURRENCIES, FEATURED_CURRENCIES, AfricanCurrency } from '@/constants/africanCurrencies';
import { useCurrency } from '@/contexts/CurrencyContext';

// Deduplicated unique currency entries keyed by code+country
const UNIQUE_CURRENCIES = AFRICAN_CURRENCIES.filter(
  (c, idx, arr) => arr.findIndex(x => x.code === c.code && x.country === c.country) === idx
);

export default function CurrencySelectorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectedCurrency, setCurrency } = useCurrency();
  const [query, setQuery] = useState('');

  const featured = UNIQUE_CURRENCIES.filter(c => FEATURED_CURRENCIES.includes(c.code));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UNIQUE_CURRENCIES;
    return UNIQUE_CURRENCIES.filter(
      c => c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q)
    );
  }, [query]);

  const handleSelect = (currency: AfricanCurrency) => {
    setCurrency(currency.code);
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Display Currency</Text>
          <Text style={styles.headerSub}>All 54 African currencies</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search currency, country..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Currently Selected */}
      <View style={styles.currentWrap}>
        <Text style={styles.sectionLabel}>Currently Selected</Text>
        <View style={styles.currentCard}>
          <Text style={styles.currentFlag}>{selectedCurrency.flag}</Text>
          <View style={styles.currentInfo}>
            <Text style={styles.currentCode}>{selectedCurrency.code}</Text>
            <Text style={styles.currentName}>{selectedCurrency.name} · {selectedCurrency.country}</Text>
          </View>
          <View style={styles.currentRate}>
            <Text style={styles.currentRateText}>1 USD = {selectedCurrency.usdRate.toLocaleString()} {selectedCurrency.symbol}</Text>
          </View>
        </View>
      </View>

      {/* Featured quick chips — only shown when no search */}
      {query.length === 0 && (
        <View style={styles.featuredWrap}>
          <Text style={styles.sectionLabel}>Popular</Text>
          <View style={styles.featuredRow}>
            {featured.map(c => {
              const isActive = selectedCurrency.code === c.code && selectedCurrency.country === c.country;
              return (
                <TouchableOpacity
                  key={`${c.code}-${c.country}`}
                  style={[styles.featuredChip, isActive && styles.featuredChipActive]}
                  onPress={() => handleSelect(c)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.featuredChipFlag}>{c.flag}</Text>
                  <Text style={[styles.featuredChipCode, isActive && styles.featuredChipCodeActive]}>{c.code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* All currencies list */}
      <Text style={[styles.sectionLabel, { paddingHorizontal: Spacing.xl, marginTop: Spacing.sm }]}>
        {query ? `Results (${filtered.length})` : `All African Currencies (${UNIQUE_CURRENCIES.length})`}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={item => `${item.code}-${item.country}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const isActive = selectedCurrency.code === item.code && selectedCurrency.country === item.country;
          return (
            <Pressable
              style={({ pressed }) => [styles.currencyRow, pressed && { opacity: 0.7 }]}
              onPress={() => handleSelect(item)}
            >
              <Text style={styles.flagText}>{item.flag}</Text>
              <View style={styles.currencyInfo}>
                <View style={styles.currencyTopRow}>
                  <Text style={styles.currencyCode}>{item.code}</Text>
                  <Text style={styles.currencyCountry}>{item.country}</Text>
                </View>
                <Text style={styles.currencyName}>{item.name}</Text>
              </View>
              <View style={styles.currencyRight}>
                <Text style={styles.currencyRate}>{item.symbol}{item.usdRate >= 1000 ? item.usdRate.toLocaleString('en-US', { maximumFractionDigits: 0 }) : item.usdRate}</Text>
                <Text style={styles.currencyRateLabel}>per USD</Text>
              </View>
              {isActive && (
                <View style={styles.checkMark}>
                  <MaterialIcons name="check-circle" size={20} color={Colors.primary} />
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },

  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 46 },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },

  currentWrap: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  sectionLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.5, marginBottom: Spacing.sm, includeFontPadding: false },
  currentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '55', gap: Spacing.md },
  currentFlag: { fontSize: 28 },
  currentInfo: { flex: 1, gap: 2 },
  currentCode: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  currentName: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  currentRate: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  currentRateText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  featuredWrap: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  featuredRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  featuredChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  featuredChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  featuredChipFlag: { fontSize: 16 },
  featuredChipCode: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  featuredChipCodeActive: { color: Colors.primary },

  listContent: { paddingHorizontal: Spacing.xl, paddingBottom: 32 },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 60 },
  currencyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, gap: Spacing.md },
  flagText: { fontSize: 26, width: 36, textAlign: 'center' },
  currencyInfo: { flex: 1, gap: 2 },
  currencyTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  currencyCode: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  currencyCountry: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  currencyName: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  currencyRight: { alignItems: 'flex-end', gap: 2 },
  currencyRate: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  currencyRateLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  checkMark: { marginLeft: Spacing.xs },
});
