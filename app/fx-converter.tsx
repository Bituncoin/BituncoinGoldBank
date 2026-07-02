import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, FlatList, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { AFRICAN_CURRENCIES } from '@/constants/africanCurrencies';
import { useCryptoPrices } from '@/hooks/useCryptoPrices';
import { CryptoPrices } from '@/services/cryptoPriceService';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { useRateAlerts, RateAlert } from '@/hooks/useRateAlerts';
import { useAlert } from '@/template';

// ─── Asset model ─────────────────────────────────────────────────────────────
interface Asset {
  code: string;
  name: string;
  flag: string;
  symbol: string;
  usdRate: number;
  isCrypto?: boolean;
  color?: string;
  country?: string;
}

function buildCryptoAssets(prices: CryptoPrices): Asset[] {
  return [
    { code: 'BTNG', name: 'BTNG Gold Coin', flag: '🪙', symbol: 'BTNG', usdRate: 1 / prices.BTNG, isCrypto: true, color: '#D4A017' },
    { code: 'BTC',  name: 'Bitcoin',         flag: '₿',  symbol: 'BTC',  usdRate: 1 / prices.BTC,  isCrypto: true, color: '#F7931A' },
    { code: 'ETH',  name: 'Ethereum',        flag: 'Ξ',  symbol: 'ETH',  usdRate: 1 / prices.ETH,  isCrypto: true, color: '#627EEA' },
    { code: 'BNB',  name: 'BNB',             flag: '⬡',  symbol: 'BNB',  usdRate: 1 / prices.BNB,  isCrypto: true, color: '#F0B90B' },
    { code: 'SOL',  name: 'Solana',          flag: '◎',  symbol: 'SOL',  usdRate: 1 / prices.SOL,  isCrypto: true, color: '#9945FF' },
    { code: 'USD',  name: 'US Dollar',       flag: '🇺🇸', symbol: '$',    usdRate: 1,                isCrypto: false, color: '#22C55E' },
  ];
}

function buildAllAssets(prices: CryptoPrices, fxRates: Record<string, number> = {}): Asset[] {
  const cryptoAssets = buildCryptoAssets(prices);
  const africanAssets: Asset[] = AFRICAN_CURRENCIES.map(c => ({
    ...c,
    usdRate: fxRates[c.code] ?? c.usdRate,
    isCrypto: false,
  }));
  const all = [...cryptoAssets, ...africanAssets];
  return all.filter((a, idx, arr) => arr.findIndex(x => x.code === a.code && x.name === a.name) === idx);
}

function convert(amount: number, from: Asset, to: Asset): number {
  if (!amount || isNaN(amount)) return 0;
  const usdValue = amount / from.usdRate;
  return usdValue * to.usdRate;
}

function getUSDValue(amount: number, asset: Asset): number {
  return amount / asset.usdRate;
}

function formatAmount(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1000)      return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (n >= 1)         return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return n.toFixed(8).replace(/\.?0+$/, '');
}

function formatPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1)     return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toFixed(6);
}

function formatTimestamp(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface ConversionRecord {
  id: string;
  fromCode: string;
  fromFlag: string;
  toCode: string;
  toFlag: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  time: string;
}

const CROSS_RATE_CODES = ['BTNG', 'BTC', 'ETH', 'USD', 'GHS', 'NGN', 'KES', 'ZAR', 'EGP'];

// ─── Alert Setup Modal ────────────────────────────────────────────────────────
interface AlertModalProps {
  visible: boolean;
  fromAsset: Asset;
  toAsset: Asset;
  currentRate: number;
  onClose: () => void;
  onSave: (targetRate: number, condition: 'above' | 'below') => void;
  existingAlerts: RateAlert[];
  onRemove: (id: string) => void;
  onReset: (id: string) => void;
}

function AlertSetupModal({
  visible, fromAsset, toAsset, currentRate, onClose, onSave,
  existingAlerts, onRemove, onReset,
}: AlertModalProps) {
  const [targetInput, setTargetInput] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');

  useEffect(() => {
    if (visible) {
      // Pre-fill with a sensible suggestion: +5% for above, -5% for below
      setTargetInput(condition === 'above'
        ? formatAmount(currentRate * 1.05)
        : formatAmount(currentRate * 0.95)
      );
    }
  }, [visible, condition, currentRate]);

  const handleConditionChange = (c: 'above' | 'below') => {
    setCondition(c);
    setTargetInput(c === 'above'
      ? formatAmount(currentRate * 1.05)
      : formatAmount(currentRate * 0.95)
    );
  };

  const canSave = !!targetInput && parseFloat(targetInput) > 0 && parseFloat(targetInput) !== currentRate;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={alertStyles.overlay}>
          <View style={alertStyles.sheet}>
            {/* Header */}
            <View style={alertStyles.header}>
              <View style={alertStyles.headerLeft}>
                <MaterialIcons name="notifications-active" size={20} color={Colors.primary} />
                <Text style={alertStyles.title}>Rate Alert</Text>
              </View>
              <TouchableOpacity style={alertStyles.closeBtn} onPress={onClose}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Current Rate Display */}
            <View style={alertStyles.rateDisplay}>
              <Text style={alertStyles.rateDisplayLabel}>Current Rate</Text>
              <View style={alertStyles.rateDisplayRow}>
                <Text style={alertStyles.rateDisplayFlag}>{fromAsset.flag}</Text>
                <Text style={alertStyles.rateDisplayText}>
                  1 {fromAsset.code} = {formatAmount(currentRate)} {toAsset.code}
                </Text>
                <Text style={alertStyles.rateDisplayFlag}>{toAsset.flag}</Text>
              </View>
            </View>

            {/* Condition Picker */}
            <View style={alertStyles.conditionRow}>
              <Text style={alertStyles.inputLabel}>Alert me when rate goes</Text>
              <View style={alertStyles.conditionToggle}>
                {(['above', 'below'] as const).map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      alertStyles.conditionBtn,
                      condition === c && {
                        backgroundColor: c === 'above' ? Colors.success : Colors.error,
                        borderColor: c === 'above' ? Colors.success : Colors.error,
                      },
                    ]}
                    onPress={() => handleConditionChange(c)}
                  >
                    <MaterialIcons
                      name={c === 'above' ? 'arrow-upward' : 'arrow-downward'}
                      size={14}
                      color={condition === c ? Colors.bg : Colors.textMuted}
                    />
                    <Text style={[
                      alertStyles.conditionBtnText,
                      condition === c && { color: Colors.bg, fontWeight: FontWeight.bold },
                    ]}>
                      {c === 'above' ? 'Above' : 'Below'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Target Rate Input */}
            <View style={alertStyles.inputGroup}>
              <Text style={alertStyles.inputLabel}>Target Rate ({toAsset.code} per 1 {fromAsset.code})</Text>
              <View style={alertStyles.inputRow}>
                <Text style={alertStyles.inputPrefix}>{toAsset.flag}</Text>
                <TextInput
                  style={alertStyles.input}
                  value={targetInput}
                  onChangeText={setTargetInput}
                  keyboardType="decimal-pad"
                  placeholder={formatAmount(currentRate)}
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={alertStyles.inputSuffix}>{toAsset.code}</Text>
              </View>
              {targetInput && parseFloat(targetInput) > 0 && (
                <Text style={[
                  alertStyles.inputHint,
                  { color: condition === 'above' ? Colors.success : Colors.error },
                ]}>
                  {condition === 'above' ? '↑' : '↓'} {Math.abs(((parseFloat(targetInput) - currentRate) / currentRate) * 100).toFixed(1)}% from current rate
                </Text>
              )}
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[alertStyles.saveBtn, !canSave && { opacity: 0.4 }]}
              onPress={() => {
                if (canSave) {
                  onSave(parseFloat(targetInput), condition);
                  onClose();
                }
              }}
              disabled={!canSave}
            >
              <MaterialIcons name="notifications-active" size={17} color={Colors.bg} />
              <Text style={alertStyles.saveBtnText}>Set Alert</Text>
            </TouchableOpacity>

            {/* Existing Alerts for this Pair */}
            {existingAlerts.length > 0 && (
              <View style={alertStyles.existingSection}>
                <Text style={alertStyles.existingTitle}>
                  Active Alerts for {fromAsset.code} / {toAsset.code}
                </Text>
                {existingAlerts.map(a => (
                  <View key={a.id} style={[
                    alertStyles.existingRow,
                    a.triggeredAt ? alertStyles.existingTriggered : null,
                  ]}>
                    <View style={alertStyles.existingLeft}>
                      <MaterialIcons
                        name={a.condition === 'above' ? 'arrow-upward' : 'arrow-downward'}
                        size={14}
                        color={a.condition === 'above' ? Colors.success : Colors.error}
                      />
                      <View style={{ gap: 2 }}>
                        <Text style={alertStyles.existingRate}>
                          {a.condition === 'above' ? '≥' : '≤'} {formatAmount(a.targetRate)} {a.toCode}
                        </Text>
                        {a.triggeredAt ? (
                          <Text style={[alertStyles.existingStatus, { color: Colors.primary }]}>
                            ✓ Triggered {new Date(a.triggeredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        ) : (
                          <Text style={alertStyles.existingStatus}>
                            Set at {formatAmount(a.currentRateAtCreation)}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={alertStyles.existingActions}>
                      {a.triggeredAt ? (
                        <TouchableOpacity
                          style={alertStyles.existingActionBtn}
                          onPress={() => onReset(a.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="refresh" size={15} color={Colors.primary} />
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        style={alertStyles.existingActionBtn}
                        onPress={() => onRemove(a.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function FXConverterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  const { prices, loading: pricesLoading, error: cryptoPricesError, lastUpdated: cryptoUpdated, refresh: refreshCrypto } = useCryptoPrices();
  const { rates: fxRates, loading: fxLoading, error: fxError, lastUpdated: fxUpdated, refresh: refreshFX } = useExchangeRateContext();
  const { alerts, addAlert, removeAlert, resetAlert, checkAlerts, getAlertsForPair } = useRateAlerts();

  const loading = pricesLoading || fxLoading;
  const pricesError = cryptoPricesError || fxError;
  const lastUpdated = fxUpdated ?? cryptoUpdated;
  const refresh = () => { refreshCrypto(); refreshFX(); };

  const cryptoAssets = useMemo(() => buildCryptoAssets(prices), [prices]);
  const allAssets    = useMemo(() => buildAllAssets(prices, fxRates), [prices, fxRates]);

  const [fromAsset, setFromAsset] = useState<Asset>(() => buildCryptoAssets(prices).find(a => a.code === 'BTNG')!);
  const [toAsset,   setToAsset]   = useState<Asset>(() => {
    const all = buildAllAssets(prices);
    return all.find(a => a.code === 'GHS' && (a as any).country === 'Ghana') ?? all.find(a => a.code === 'GHS')!;
  });

  // Keep asset usdRate in sync when prices update
  useEffect(() => {
    const updatedFrom = allAssets.find(a => a.code === fromAsset.code && a.name === fromAsset.name);
    const updatedTo   = allAssets.find(a => a.code === toAsset.code   && a.name === toAsset.name);
    if (updatedFrom) setFromAsset(updatedFrom);
    if (updatedTo)   setToAsset(updatedTo);
  }, [prices, allAssets, fromAsset.code, fromAsset.name, toAsset.code, toAsset.name]);

  const [fromInput, setFromInput] = useState('1');
  const [picking,   setPicking]   = useState<'from' | 'to' | null>(null);
  const [searchQ,   setSearchQ]   = useState('');
  const [history,   setHistory]   = useState<ConversionRecord[]>([]);

  // ── Alert state ─────────────────────────────────────────────────────────
  const [alertTarget, setAlertTarget] = useState<Asset | null>(null); // which cross-rate row bell was tapped
  const prevRatesRef = useRef<Record<string, number>>({});

  // Check alerts whenever rates refresh (fires once per threshold crossing)
  useEffect(() => {
    if (loading || Object.keys(fxRates).length === 0) return;

    // Build a rate resolver: 1 fromCode → X toCode
    const getRatePair = (fromCode: string, toCode: string): number => {
      const from = allAssets.find(a => a.code === fromCode);
      const to   = allAssets.find(a => a.code === toCode);
      if (!from || !to) return 0;
      return convert(1, from, to);
    };

    checkAlerts(getRatePair, (alert, liveRate) => {
      const fromAssetInfo = allAssets.find(a => a.code === alert.fromCode);
      const toAssetInfo   = allAssets.find(a => a.code === alert.toCode);
      const fromFlag = fromAssetInfo?.flag ?? '';
      const toFlag   = toAssetInfo?.flag ?? '';

      showAlert(
        `${fromFlag} Rate Alert Triggered!`,
        `1 ${alert.fromCode} = ${formatAmount(liveRate)} ${alert.toCode} ${toFlag}\n\n` +
        `Your target: ${alert.condition === 'above' ? '≥' : '≤'} ${formatAmount(alert.targetRate)} ${alert.toCode}`,
        [{ text: 'Dismiss', style: 'default' }]
      );
    });
  }, [fxRates, prices, loading]);

  // ── computed ─────────────────────────────────────────────────────────────
  const fromNum   = parseFloat(fromInput) || 0;
  const toNum     = useMemo(() => convert(fromNum, fromAsset, toAsset), [fromNum, fromAsset, toAsset]);
  const toDisplay = formatAmount(toNum);

  const rate1     = convert(1, fromAsset, toAsset);
  const rateLabel = `1 ${fromAsset.code} = ${formatAmount(rate1)} ${toAsset.code}`;
  const usdValue  = getUSDValue(fromNum, fromAsset);

  // ── picker filter ─────────────────────────────────────────────────────────
  const pickerList = useMemo(() => {
    const q       = searchQ.trim().toLowerCase();
    const exclude = picking === 'from' ? toAsset : fromAsset;
    const base    = allAssets.filter(a => !(a.code === exclude.code && a.name === exclude.name));
    if (!q) return base;
    return base.filter(
      a => a.code.toLowerCase().includes(q) ||
           a.name.toLowerCase().includes(q) ||
           (a.country ?? '').toLowerCase().includes(q)
    );
  }, [searchQ, picking, fromAsset, toAsset, allAssets]);

  const crossRateRows = useMemo(() => {
    return CROSS_RATE_CODES
      .map(code => allAssets.find(a => a.code === code))
      .filter((a): a is Asset => !!a && !(a.code === fromAsset.code && a.name === fromAsset.name));
  }, [fromAsset, allAssets]);

  // Total active (non-triggered) alerts count
  const activeAlertCount = alerts.filter(a => !a.triggeredAt).length;

  // ── actions ───────────────────────────────────────────────────────────────
  const handleSwap = () => {
    const prev = fromAsset;
    setFromAsset(toAsset);
    setToAsset(prev);
    setFromInput(toDisplay);
  };

  const handleSaveToHistory = () => {
    if (!fromNum) return;
    const record: ConversionRecord = {
      id:         Date.now().toString(),
      fromCode:   fromAsset.code,
      fromFlag:   fromAsset.flag,
      toCode:     toAsset.code,
      toFlag:     toAsset.flag,
      fromAmount: `${fromInput} ${fromAsset.code}`,
      toAmount:   `${toDisplay} ${toAsset.code}`,
      rate:       rateLabel,
      time:       new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    };
    setHistory(prev => [record, ...prev].slice(0, 12));
  };

  const handlePickerSelect = (asset: Asset) => {
    if (picking === 'from') setFromAsset(asset);
    else setToAsset(asset);
    setPicking(null);
    setSearchQ('');
  };

  const openPicker = (side: 'from' | 'to') => {
    setSearchQ('');
    setPicking(side);
  };

  const handleSetAlert = (toAssetTarget: Asset) => {
    setAlertTarget(toAssetTarget);
  };

  const handleSaveAlert = async (targetRate: number, condition: 'above' | 'below') => {
    if (!alertTarget) return;
    const currentRate = convert(1, fromAsset, alertTarget);
    await addAlert(fromAsset.code, alertTarget.code, targetRate, condition, currentRate);
    showAlert(
      'Alert Set',
      `You will be notified when 1 ${fromAsset.code} goes ${condition} ${formatAmount(targetRate)} ${alertTarget.code}.`
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>FX Converter</Text>
            <Text style={styles.headerSub}>Crypto + 54 African currencies</Text>
          </View>
          <View style={styles.headerActions}>
            {activeAlertCount > 0 && (
              <View style={styles.alertCountBadge}>
                <MaterialIcons name="notifications-active" size={13} color={Colors.primary} />
                <Text style={styles.alertCountText}>{activeAlertCount}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.refreshBtn} onPress={refresh} disabled={pricesLoading}>
              {pricesLoading
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <MaterialIcons name="refresh" size={18} color={Colors.primary} />}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Live Price Ticker Row ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tickerScroll}
            contentContainerStyle={styles.tickerContent}
          >
            {cryptoAssets.filter(a => a.isCrypto && a.code !== 'USD').map(a => (
              <View key={a.code} style={[styles.tickerChip, { borderColor: (a.color ?? Colors.primary) + '55' }]}>
                <Text style={styles.tickerFlag}>{a.flag}</Text>
                <Text style={[styles.tickerCode, { color: a.color ?? Colors.primary }]}>{a.code}</Text>
                <Text style={styles.tickerPrice}>${formatPrice(1 / a.usdRate)}</Text>
              </View>
            ))}
          </ScrollView>

          {/* ── Rate Badge + Live Indicator ── */}
          <View style={styles.rateBadgeRow}>
            <View style={styles.rateBadge}>
              <MaterialIcons name="show-chart" size={13} color={Colors.primary} />
              <Text style={styles.rateBadgeText} numberOfLines={1}>{rateLabel}</Text>
            </View>
            {loading ? (
              <View style={styles.statusBadge}>
                <ActivityIndicator size="small" color={Colors.warning} style={{ transform: [{ scale: 0.7 }] }} />
                <Text style={[styles.statusText, { color: Colors.warning }]}>Updating…</Text>
              </View>
            ) : pricesError ? (
              <TouchableOpacity style={[styles.statusBadge, styles.statusError]} onPress={refresh}>
                <MaterialIcons name="wifi-off" size={12} color={Colors.error} />
                <Text style={[styles.statusText, { color: Colors.error }]}>Retry</Text>
              </TouchableOpacity>
            ) : lastUpdated ? (
              <View style={[styles.statusBadge, styles.statusLive]}>
                <View style={styles.liveDot} />
                <Text style={[styles.statusText, { color: Colors.success }]}>
                  Live · {formatTimestamp(lastUpdated)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* USD equivalent */}
          <View style={styles.usdRowWrap}>
            <View style={styles.usdBadge}>
              <Text style={styles.usdBadgeText}>
                ≈&nbsp;${usdValue >= 1000
                  ? usdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </Text>
            </View>
          </View>

          {/* ── Converter Card ── */}
          <View style={styles.converterCard}>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>YOU SEND</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity style={styles.assetSelector} onPress={() => openPicker('from')} activeOpacity={0.8}>
                  <Text style={styles.assetFlag}>{fromAsset.flag}</Text>
                  <Text style={styles.assetCode}>{fromAsset.code}</Text>
                  <MaterialIcons name="keyboard-arrow-down" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
                <TextInput
                  style={styles.amountInput}
                  value={fromInput}
                  onChangeText={setFromInput}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                />
              </View>
              {fromAsset.isCrypto && fromAsset.code !== 'USD' && (
                <Text style={[styles.assetSubName, { color: fromAsset.color ?? Colors.primary }]}>
                  {fromAsset.name} · ${formatPrice(1 / fromAsset.usdRate)} USD
                  {fromAsset.code === 'BTNG' && <Text style={styles.mockTag}> (mock)</Text>}
                </Text>
              )}
            </View>

            <View style={styles.swapRow}>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.swapBtn} onPress={handleSwap} activeOpacity={0.8}>
                <MaterialIcons name="swap-vert" size={22} color={Colors.primary} />
              </TouchableOpacity>
              <View style={styles.divider} />
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>YOU RECEIVE</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity style={styles.assetSelector} onPress={() => openPicker('to')} activeOpacity={0.8}>
                  <Text style={styles.assetFlag}>{toAsset.flag}</Text>
                  <Text style={styles.assetCode}>{toAsset.code}</Text>
                  <MaterialIcons name="keyboard-arrow-down" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
                <View style={styles.resultBox}>
                  <Text style={styles.resultText} numberOfLines={1} adjustsFontSizeToFit>
                    {toDisplay}
                  </Text>
                </View>
              </View>
              {toAsset.isCrypto && toAsset.code !== 'USD' && (
                <Text style={[styles.assetSubName, { color: toAsset.color ?? Colors.primary }]}>
                  {toAsset.name} · ${formatPrice(1 / toAsset.usdRate)} USD
                  {toAsset.code === 'BTNG' && <Text style={styles.mockTag}> (mock)</Text>}
                </Text>
              )}
            </View>

            <TouchableOpacity style={styles.convertBtn} onPress={handleSaveToHistory} activeOpacity={0.8}>
              <MaterialIcons name="bookmark-add" size={18} color={Colors.bg} />
              <Text style={styles.convertBtnText}>Save to History</Text>
            </TouchableOpacity>
          </View>

          {/* ── Quick Amount Chips ── */}
          <View style={styles.quickRow}>
            {['0.1', '0.5', '1', '10', '100', '1000'].map(v => (
              <TouchableOpacity key={v} style={styles.quickChip} onPress={() => setFromInput(v)} activeOpacity={0.75}>
                <Text style={styles.quickChipText}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── FX Source Badge ── */}
          {lastUpdated && !loading && (
            <View style={[styles.rateTableCard, { marginBottom: Spacing.sm }]}>
              <View style={styles.fxSourceRow}>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>ExchangeRate-API</Text>
                </View>
                <Text style={styles.fxSourceLabel}>African FX · {formatTimestamp(lastUpdated)}</Text>
                <TouchableOpacity onPress={refresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="refresh" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Live Crypto Prices ── */}
          <View style={styles.rateTableCard}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Live Crypto Prices</Text>
              {lastUpdated && !loading && (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>CoinGecko</Text>
                </View>
              )}
              {loading && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>
            {cryptoAssets.filter(a => a.isCrypto && a.code !== 'USD').map((a, i, arr) => (
              <View key={a.code} style={[styles.rateTableRow, i < arr.length - 1 && styles.rateTableRowBorder]}>
                <View style={styles.rateTableLeft}>
                  <Text style={styles.rateTableFlag}>{a.flag}</Text>
                  <View>
                    <Text style={[styles.rateTableCode, { color: a.color ?? Colors.textPrimary }]}>{a.code}</Text>
                    <Text style={styles.rateTableName}>{a.name}</Text>
                  </View>
                </View>
                <View style={styles.rateTableRight}>
                  <Text style={styles.rateTableValue}>${formatPrice(1 / a.usdRate)}</Text>
                  {a.code === 'BTNG' && <Text style={styles.mockTag}>mock</Text>}
                </View>
              </View>
            ))}
          </View>

          {/* ── Cross Rates Table with Alert Bells ── */}
          <View style={styles.rateTableCard}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Cross Rates · 1 {fromAsset.code}</Text>
              <View style={styles.alertHint}>
                <MaterialIcons name="notifications-none" size={13} color={Colors.textMuted} />
                <Text style={styles.alertHintText}>Tap 🔔 to set alert</Text>
              </View>
            </View>

            <View style={styles.rateTableHeader}>
              <Text style={styles.rateTableHeaderCell}>Asset</Text>
              <Text style={[styles.rateTableHeaderCell, { flex: 1, textAlign: 'right', marginRight: 40 }]}>Rate</Text>
            </View>

            {crossRateRows.map((a, i, arr) => {
              const pairAlerts = getAlertsForPair(fromAsset.code, a.code);
              const activeAlerts = pairAlerts.filter(al => !al.triggeredAt);
              const triggeredAlerts = pairAlerts.filter(al => al.triggeredAt);
              const hasActive = activeAlerts.length > 0;
              const hasTriggered = triggeredAlerts.length > 0;
              const crossRate = convert(1, fromAsset, a);

              return (
                <View key={a.code + a.name} style={[styles.rateTableRow, i < arr.length - 1 && styles.rateTableRowBorder]}>
                  <View style={styles.rateTableLeft}>
                    <Text style={styles.rateTableFlag}>{a.flag}</Text>
                    <View style={{ gap: 1 }}>
                      <Text style={styles.rateTableCode}>{a.code}</Text>
                      {/* Alert count badge under code */}
                      {hasActive && (
                        <View style={styles.pairAlertBadge}>
                          <View style={styles.pairAlertDot} />
                          <Text style={styles.pairAlertText}>{activeAlerts.length} alert{activeAlerts.length > 1 ? 's' : ''}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.crossRateRight}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.rateTableValue}>{formatAmount(crossRate)}</Text>
                      {/* Triggered indicator */}
                      {hasTriggered && (
                        <Text style={styles.triggeredBadge}>✓ Alert fired</Text>
                      )}
                    </View>

                    {/* Bell icon button */}
                    <TouchableOpacity
                      style={[
                        styles.bellBtn,
                        hasActive && styles.bellBtnActive,
                        hasTriggered && !hasActive && styles.bellBtnTriggered,
                      ]}
                      onPress={() => handleSetAlert(a)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.75}
                    >
                      <MaterialIcons
                        name={hasActive ? 'notifications-active' : hasTriggered ? 'notifications-off' : 'notifications-none'}
                        size={16}
                        color={hasActive ? Colors.primary : hasTriggered ? Colors.warning : Colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Active Alerts Summary Card ── */}
          {alerts.length > 0 && (
            <View style={styles.rateTableCard}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>My Rate Alerts</Text>
                <View style={styles.livePill}>
                  <MaterialIcons name="notifications-active" size={11} color={Colors.success} />
                  <Text style={styles.livePillText}>{activeAlertCount} active</Text>
                </View>
              </View>
              {alerts.map((a, i, arr) => (
                <View key={a.id} style={[styles.alertSummaryRow, i < arr.length - 1 && styles.rateTableRowBorder]}>
                  <View style={[
                    styles.alertConditionIcon,
                    { backgroundColor: (a.condition === 'above' ? Colors.success : Colors.error) + '22' },
                  ]}>
                    <MaterialIcons
                      name={a.condition === 'above' ? 'arrow-upward' : 'arrow-downward'}
                      size={13}
                      color={a.condition === 'above' ? Colors.success : Colors.error}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.alertSummaryPair}>
                      {a.fromCode} / {a.toCode}
                    </Text>
                    <Text style={styles.alertSummaryTarget}>
                      {a.condition === 'above' ? '≥' : '≤'} {formatAmount(a.targetRate)} {a.toCode}
                    </Text>
                  </View>
                  {a.triggeredAt ? (
                    <View style={styles.alertFiredBadge}>
                      <Text style={styles.alertFiredText}>Fired</Text>
                    </View>
                  ) : (
                    <View style={styles.alertActiveBadge}>
                      <View style={styles.alertActiveDot} />
                      <Text style={styles.alertActiveText}>Watching</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => removeAlert(a.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: Spacing.sm }}
                  >
                    <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* ── Conversion History ── */}
          {history.length > 0 && (
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.sectionTitle}>Recent Conversions</Text>
                <TouchableOpacity onPress={() => setHistory([])}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
              {history.map(rec => (
                <View key={rec.id} style={styles.historyRow}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyFlags}>{rec.fromFlag} → {rec.toFlag}</Text>
                    <Text style={styles.historyAmount}>{rec.fromAmount}</Text>
                    <Text style={styles.historyRate}>{rec.rate}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyResult}>{rec.toAmount}</Text>
                    <Text style={styles.historyTime}>{rec.time}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>

        {/* ── Asset Picker Modal ── */}
        <Modal visible={picking !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(null)}>
          <View style={[styles.modalContainer, { paddingTop: insets.top + 12 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Select {picking === 'from' ? 'Source' : 'Target'} Asset
              </Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => { setPicking(null); setSearchQ(''); }}>
                <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearch}>
              <MaterialIcons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search crypto or currency…"
                placeholderTextColor={Colors.textMuted}
                value={searchQ}
                onChangeText={setSearchQ}
                autoCorrect={false}
                autoCapitalize="none"
                autoFocus
              />
              {searchQ.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQ('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {searchQ.length === 0 && (
              <View style={styles.cryptoQuickRow}>
                {cryptoAssets.map(a => {
                  const active = (picking === 'from' ? fromAsset : toAsset).code === a.code;
                  return (
                    <TouchableOpacity
                      key={a.code}
                      style={[styles.cryptoChip, active && { borderColor: a.color ?? Colors.primary, backgroundColor: (a.color ?? Colors.primary) + '22' }]}
                      onPress={() => handlePickerSelect(a)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cryptoChipFlag}>{a.flag}</Text>
                      <View>
                        <Text style={[styles.cryptoChipCode, { color: active ? (a.color ?? Colors.primary) : Colors.textPrimary }]}>{a.code}</Text>
                        {a.isCrypto && a.code !== 'USD' && (
                          <Text style={[styles.cryptoChipPrice, { color: a.color ?? Colors.primary }]}>${formatPrice(1 / a.usdRate)}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <FlatList
              data={pickerList}
              keyExtractor={item => `${item.code}-${item.name}`}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 32 }}
              ItemSeparatorComponent={() => <View style={styles.modalSep} />}
              renderItem={({ item }) => {
                const isActive =
                  (picking === 'from' ? fromAsset : toAsset).code === item.code &&
                  (picking === 'from' ? fromAsset : toAsset).name === item.name;
                return (
                  <Pressable style={({ pressed }) => [styles.modalRow, pressed && { opacity: 0.7 }]} onPress={() => handlePickerSelect(item)}>
                    <Text style={styles.modalFlag}>{item.flag}</Text>
                    <View style={styles.modalRowInfo}>
                      <View style={styles.modalRowTop}>
                        <Text style={[styles.modalRowCode, item.isCrypto && { color: item.color ?? Colors.primary }]}>{item.code}</Text>
                        {item.country && <Text style={styles.modalRowCountry}>{item.country}</Text>}
                        {item.isCrypto && item.code !== 'USD' && (
                          <View style={[styles.cryptoTag, { backgroundColor: (item.color ?? Colors.primary) + '22', borderColor: (item.color ?? Colors.primary) + '55' }]}>
                            <Text style={[styles.cryptoTagText, { color: item.color ?? Colors.primary }]}>CRYPTO</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.modalRowName}>{item.name}</Text>
                    </View>
                    <View style={styles.modalRowRate}>
                      {item.isCrypto && item.code !== 'USD' ? (
                        <><Text style={styles.modalRateText}>${formatPrice(1 / item.usdRate)}</Text><Text style={styles.modalRateLabel}>USD</Text></>
                      ) : item.code !== 'USD' ? (
                        <><Text style={styles.modalRateText}>{item.usdRate}</Text><Text style={styles.modalRateLabel}>per $</Text></>
                      ) : null}
                    </View>
                    {isActive && <MaterialIcons name="check-circle" size={20} color={Colors.primary} style={{ marginLeft: 8 }} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </Modal>

        {/* ── Alert Setup Modal ── */}
        {alertTarget && (
          <AlertSetupModal
            visible={alertTarget !== null}
            fromAsset={fromAsset}
            toAsset={alertTarget}
            currentRate={convert(1, fromAsset, alertTarget)}
            onClose={() => setAlertTarget(null)}
            onSave={handleSaveAlert}
            existingAlerts={getAlertsForPair(fromAsset.code, alertTarget.code)}
            onRemove={removeAlert}
            onReset={resetAlert}
          />
        )}

      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Alert Modal Styles ───────────────────────────────────────────────────────
const alertStyles = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(6,6,8,0.85)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border, paddingBottom: 36 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:            { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  closeBtn:         { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },

  rateDisplay:      { backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md, gap: 6, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center' },
  rateDisplayLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.8, includeFontPadding: false },
  rateDisplayRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateDisplayFlag:  { fontSize: 22 },
  rateDisplayText:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  conditionRow:     { gap: 8 },
  conditionToggle:  { flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border },
  conditionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, borderWidth: 1, borderColor: 'transparent' },
  conditionBtnText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  inputGroup:       { gap: 6 },
  inputLabel:       { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  inputRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  inputPrefix:      { fontSize: 18, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  input:            { flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, paddingVertical: Spacing.md, includeFontPadding: false },
  inputSuffix:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, paddingHorizontal: Spacing.md, includeFontPadding: false },
  inputHint:        { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false, paddingLeft: 2 },

  saveBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2 },
  saveBtnText:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  existingSection:  { gap: 8 },
  existingTitle:    { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.8, includeFontPadding: false },
  existingRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  existingTriggered:{ opacity: 0.7 },
  existingLeft:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  existingRate:     { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  existingStatus:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  existingActions:  { flexDirection: 'row', gap: 8 },
  existingActionBtn:{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
});

// ─── Main Screen Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  // Header
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.sm },
  backBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  headerCenter:     { flex: 1, alignItems: 'center' },
  headerTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub:        { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  headerActions:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '55' },
  alertCountBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '55' },
  alertCountText:   { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Ticker
  tickerScroll:     { marginBottom: Spacing.sm },
  tickerContent:    { paddingHorizontal: Spacing.xl, gap: Spacing.sm, paddingVertical: 4 },
  tickerChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1 },
  tickerFlag:       { fontSize: 14 },
  tickerCode:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  tickerPrice:      { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },

  // Rate badge
  rateBadgeRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, marginBottom: Spacing.xs, gap: Spacing.sm },
  rateBadge:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: Colors.primary + '55' },
  rateBadgeText:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false, flexShrink: 1 },
  statusBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  statusLive:       { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  statusError:      { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' },
  statusText:       { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  liveDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },

  usdRowWrap:       { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  usdBadge:         { alignSelf: 'flex-start', backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  usdBadgeText:     { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },

  // Converter card
  converterCard:    { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.md, marginBottom: Spacing.md },
  inputBlock:       { gap: 6 },
  inputLabel:       { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.8, includeFontPadding: false },
  inputRow:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  assetSelector:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, minWidth: 110 },
  assetFlag:        { fontSize: 20 },
  assetCode:        { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flex: 1 },
  assetSubName:     { fontSize: FontSize.xs, fontWeight: FontWeight.medium, includeFontPadding: false, marginLeft: 2 },
  mockTag:          { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  amountInput:      { flex: 1, fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, paddingVertical: 8 },
  resultBox:        { flex: 1, alignItems: 'flex-end', paddingVertical: 8 },
  resultText:       { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  swapRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  divider:          { flex: 1, height: 1, backgroundColor: Colors.border },
  swapBtn:          { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.primary },
  convertBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, marginTop: Spacing.sm },
  convertBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Quick chips
  quickRow:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.lg },
  quickChip:        { backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border },
  quickChipText:    { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Rate tables
  rateTableCard:    { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, marginBottom: Spacing.md },
  sectionTitleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sectionTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  livePill:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  livePillText:     { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  fxSourceRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fxSourceLabel:    { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  rateTableHeader:  { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.xs },
  rateTableHeaderCell: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  rateTableRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  rateTableRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rateTableLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateTableRight:   { alignItems: 'flex-end', gap: 2 },
  rateTableFlag:    { fontSize: 18, width: 28 },
  rateTableCode:    { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  rateTableName:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  rateTableValue:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Alert hint in section title
  alertHint:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  alertHintText:    { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Cross rate row with bell
  crossRateRight:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bellBtn:          { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  bellBtnActive:    { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '66' },
  bellBtnTriggered: { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '55' },

  // Pair alert badge under code
  pairAlertBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pairAlertDot:     { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  pairAlertText:    { fontSize: 9, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  triggeredBadge:   { fontSize: 9, color: Colors.warning, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Alert summary card rows
  alertSummaryRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10 },
  alertConditionIcon:{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  alertSummaryPair: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  alertSummaryTarget:{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  alertFiredBadge:  { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  alertFiredText:   { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  alertActiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  alertActiveDot:   { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.success },
  alertActiveText:  { fontSize: 10, color: Colors.success, fontWeight: FontWeight.bold, includeFontPadding: false },

  // History
  historyCard:      { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, marginBottom: Spacing.md },
  historyHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  clearText:        { fontSize: FontSize.sm, color: Colors.error, fontWeight: FontWeight.semibold, includeFontPadding: false },
  historyRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  historyLeft:      { gap: 2 },
  historyFlags:     { fontSize: FontSize.md },
  historyAmount:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  historyRate:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  historyRight:     { alignItems: 'flex-end', gap: 2 },
  historyResult:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  historyTime:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Asset picker modal
  modalContainer:   { flex: 1, backgroundColor: Colors.bg },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
  modalTitle:       { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalClose:       { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  modalSearch:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 46 },
  modalSearchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  cryptoQuickRow:   { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.md },
  cryptoChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  cryptoChipFlag:   { fontSize: 16 },
  cryptoChipCode:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  cryptoChipPrice:  { fontSize: 9, includeFontPadding: false },
  modalSep:         { height: 1, backgroundColor: Colors.border, marginLeft: 52 },
  modalRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, gap: Spacing.md },
  modalFlag:        { fontSize: 24, width: 36, textAlign: 'center' },
  modalRowInfo:     { flex: 1, gap: 2 },
  modalRowTop:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalRowCode:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalRowCountry:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  cryptoTag:        { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  cryptoTagText:    { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  modalRowName:     { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  modalRowRate:     { alignItems: 'flex-end', gap: 1 },
  modalRateText:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  modalRateLabel:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});
