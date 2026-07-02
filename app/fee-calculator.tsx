// BTNG Gold — Fee Calculator Screen
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';

// ─── Coin Data ────────────────────────────────────────────────────────────────
interface CoinConfig {
  symbol: string;
  name: string;
  icon: string;
  priceUsd: number;          // approximate price for USD conversion
  withdrawalFee: number;     // in coin units
  networkLabel: string;
  minWithdraw: number;
}

const COINS: CoinConfig[] = [
  { symbol: 'BTNG', name: 'BTNG Gold',       icon: '🪙', priceUsd: 4.20,    withdrawalFee: 0,        networkLabel: 'BTNG Chain', minWithdraw: 10    },
  { symbol: 'BTC',  name: 'Bitcoin',         icon: '₿',  priceUsd: 67500,   withdrawalFee: 0.0005,   networkLabel: 'Bitcoin',    minWithdraw: 0.001 },
  { symbol: 'ETH',  name: 'Ethereum',        icon: 'Ξ',  priceUsd: 3480,    withdrawalFee: 0.005,    networkLabel: 'ERC-20',     minWithdraw: 0.01  },
  { symbol: 'USDT', name: 'Tether',          icon: '₮',  priceUsd: 1,       withdrawalFee: 1,        networkLabel: 'TRC-20',     minWithdraw: 10    },
  { symbol: 'BNB',  name: 'BNB',             icon: '⬡',  priceUsd: 598,     withdrawalFee: 0.001,    networkLabel: 'BEP-20',     minWithdraw: 0.01  },
  { symbol: 'SOL',  name: 'Solana',          icon: '◎',  priceUsd: 178,     withdrawalFee: 0.01,     networkLabel: 'Solana',     minWithdraw: 0.05  },
  { symbol: 'XRP',  name: 'XRP',             icon: '✕',  priceUsd: 0.62,    withdrawalFee: 0.25,     networkLabel: 'XRP Ledger', minWithdraw: 20    },
  { symbol: 'ADA',  name: 'Cardano',         icon: '₳',  priceUsd: 0.48,    withdrawalFee: 1,        networkLabel: 'Cardano',    minWithdraw: 5     },
  { symbol: 'DOGE', name: 'Dogecoin',        icon: 'Ð',  priceUsd: 0.165,   withdrawalFee: 5,        networkLabel: 'Dogecoin',   minWithdraw: 50    },
  { symbol: 'MATIC',name: 'Polygon',         icon: '⬡',  priceUsd: 0.88,    withdrawalFee: 0.1,      networkLabel: 'Polygon',    minWithdraw: 1     },
];

// ─── Fee Rates ────────────────────────────────────────────────────────────────
const SPOT_FEE_RATE   = 0.001;   // 0.1%
const P2P_FEE_RATE    = 0.005;   // 0.5%
const MAKER_FEE_RATE  = 0.0008;  // 0.08%
const TAKER_FEE_RATE  = 0.001;   // 0.1%

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 8): string {
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1)   return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toFixed(decimals).replace(/\.?0+$/, '');
}

function fmtUsd(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type TradeType = 'spot' | 'p2p' | 'withdraw';

export default function FeeCalculatorScreen() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const { showAlert } = useAlert();

  const [selectedCoin, setSelectedCoin] = useState<CoinConfig>(COINS[0]);
  const [amountText, setAmountText]   = useState('1000');
  const [tradeType, setTradeType]     = useState<TradeType>('spot');
  const [showCoinPicker, setShowCoinPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();

  const showLocalConversion = selectedCurrency.code !== 'USD';
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const amount = useMemo(() => {
    const n = parseFloat(amountText.replace(/,/g, ''));
    return isNaN(n) || n < 0 ? 0 : n;
  }, [amountText]);

  // ── Fee Computation ─────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const price = selectedCoin.priceUsd;
    const amountUsd = amount * price;

    if (tradeType === 'spot') {
      const spotFee     = amount * SPOT_FEE_RATE;
      const makerFee    = amount * MAKER_FEE_RATE;
      const takerFee    = amount * TAKER_FEE_RATE;
      const netReceived = amount - spotFee;
      return {
        rows: [
          { label: 'Trade Amount',    value: `${fmt(amount)} ${selectedCoin.symbol}`,    usd: fmtUsd(amountUsd),         color: Colors.textPrimary },
          { label: 'Spot Fee (0.10%)', value: `${fmt(spotFee)} ${selectedCoin.symbol}`,  usd: fmtUsd(spotFee * price),   color: Colors.error       },
          { label: 'Maker Fee (0.08%)',value: `${fmt(makerFee)} ${selectedCoin.symbol}`, usd: fmtUsd(makerFee * price),  color: Colors.warning     },
          { label: 'Taker Fee (0.10%)',value: `${fmt(takerFee)} ${selectedCoin.symbol}`, usd: fmtUsd(takerFee * price),  color: Colors.warning     },
        ],
        netLabel: 'Net Received (after Taker)',
        netValue: `${fmt(netReceived)} ${selectedCoin.symbol}`,
        netUsd:   fmtUsd(netReceived * price),
        totalFeeUsd: fmtUsd(spotFee * price),
        totalFeeCoins: `${fmt(spotFee)} ${selectedCoin.symbol}`,
        savingsRow: { label: 'Maker Saving vs Taker', value: fmtUsd((takerFee - makerFee) * price) },
      };
    }

    if (tradeType === 'p2p') {
      const p2pFee      = amount * P2P_FEE_RATE;
      const netReceived = amount - p2pFee;
      const escrowFee   = amount * 0.001;  // 0.1% escrow
      return {
        rows: [
          { label: 'Trade Amount',       value: `${fmt(amount)} ${selectedCoin.symbol}`,    usd: fmtUsd(amountUsd),             color: Colors.textPrimary },
          { label: 'P2P Platform Fee (0.50%)', value: `${fmt(p2pFee)} ${selectedCoin.symbol}`, usd: fmtUsd(p2pFee * price),    color: Colors.error       },
          { label: 'Escrow Service (0.10%)',  value: `${fmt(escrowFee)} ${selectedCoin.symbol}`, usd: fmtUsd(escrowFee * price), color: Colors.warning    },
          { label: 'Payment Method Fee', value: 'Varies',                                    usd: 'by provider',                 color: Colors.textMuted   },
        ],
        netLabel: 'Net P2P Received',
        netValue: `${fmt(netReceived)} ${selectedCoin.symbol}`,
        netUsd:   fmtUsd(netReceived * price),
        totalFeeUsd: fmtUsd(p2pFee * price),
        totalFeeCoins: `${fmt(p2pFee)} ${selectedCoin.symbol}`,
        savingsRow: { label: 'Spot vs P2P saving', value: fmtUsd((p2pFee - amount * SPOT_FEE_RATE) * price) },
      };
    }

    // withdraw
    const withdrawFee   = selectedCoin.withdrawalFee;
    const withdrawFeeUsd = withdrawFee * price;
    const netReceived   = Math.max(0, amount - withdrawFee);
    const networkFeeUsd = withdrawFeeUsd * 0.8; // approx network portion
    const btngFeeUsd    = withdrawFeeUsd * 0.2; // BTNG platform portion

    return {
      rows: [
        { label: 'Withdrawal Amount',   value: `${fmt(amount)} ${selectedCoin.symbol}`,       usd: fmtUsd(amountUsd),           color: Colors.textPrimary },
        { label: 'Network Fee',          value: `${fmt(withdrawFee * 0.8)} ${selectedCoin.symbol}`, usd: fmtUsd(networkFeeUsd), color: Colors.error       },
        { label: 'BTNG Platform Fee',    value: `${fmt(withdrawFee * 0.2)} ${selectedCoin.symbol}`, usd: fmtUsd(btngFeeUsd),    color: Colors.warning     },
        { label: 'Min Withdrawal',       value: `${fmt(selectedCoin.minWithdraw)} ${selectedCoin.symbol}`, usd: fmtUsd(selectedCoin.minWithdraw * price), color: Colors.textMuted },
      ],
      netLabel: 'You Will Receive',
      netValue: netReceived > 0 ? `${fmt(netReceived)} ${selectedCoin.symbol}` : 'Below minimum',
      netUsd:   netReceived > 0 ? fmtUsd(netReceived * price) : '—',
      totalFeeUsd: fmtUsd(withdrawFeeUsd),
      totalFeeCoins: `${fmt(withdrawFee)} ${selectedCoin.symbol}`,
      savingsRow: { label: 'Network', value: selectedCoin.networkLabel },
    };
  }, [amount, selectedCoin, tradeType]);

  // ── Copy Result ──────────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const text = [
      `BTNG Fee Calculator — ${tradeType.toUpperCase()}`,
      `Coin: ${selectedCoin.symbol} (${selectedCoin.name})`,
      `Amount: ${fmt(amount)} ${selectedCoin.symbol}`,
      ...calc.rows.map(r => `${r.label}: ${r.value} (${r.usd})`),
      `${calc.netLabel}: ${calc.netValue} (${calc.netUsd})`,
      `Total Fee: ${calc.totalFeeCoins} = ${calc.totalFeeUsd}`,
    ].join('\n');
    Clipboard.setStringAsync(text).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [tradeType, selectedCoin, amount, calc]);

  const TYPES: { key: TradeType; label: string; icon: string }[] = [
    { key: 'spot',     label: 'Spot',    icon: 'swap-horiz'       },
    { key: 'p2p',      label: 'P2P',     icon: 'people'           },
    { key: 'withdraw', label: 'Withdraw', icon: 'arrow-upward'    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Fee Calculator</Text>
        <TouchableOpacity style={[styles.copyHeaderBtn, copied && styles.copyHeaderBtnDone]} onPress={handleCopy}>
          <MaterialIcons name={copied ? 'check' : 'content-copy'} size={16} color={copied ? Colors.success : Colors.primary} />
          <Text style={[styles.copyHeaderText, copied && { color: Colors.success }]}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Trade Type Selector */}
        <View style={styles.typeRow}>
          {TYPES.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeBtn, tradeType === t.key && styles.typeBtnActive]}
              onPress={() => setTradeType(t.key)}
              activeOpacity={0.8}
            >
              <MaterialIcons name={t.icon as any} size={16} color={tradeType === t.key ? Colors.bg : Colors.textMuted} />
              <Text style={[styles.typeBtnText, tradeType === t.key && styles.typeBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input Card */}
        <View style={styles.inputCard}>
          {/* Coin Selector */}
          <Text style={styles.inputLabel}>Select Coin / Pair</Text>
          <TouchableOpacity style={styles.coinSelector} onPress={() => setShowCoinPicker(v => !v)} activeOpacity={0.8}>
            <View style={styles.coinSelectorLeft}>
              <View style={styles.coinIconBadge}>
                <Text style={styles.coinIconText}>{selectedCoin.icon}</Text>
              </View>
              <View>
                <Text style={styles.coinSymbol}>{selectedCoin.symbol}/USDT</Text>
                <Text style={styles.coinName}>{selectedCoin.name}</Text>
              </View>
            </View>
            <View style={styles.coinSelectorRight}>
              <Text style={styles.coinPrice}>{fmtUsd(selectedCoin.priceUsd)}</Text>
              <MaterialIcons name={showCoinPicker ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>

          {/* Coin Picker Dropdown */}
          {showCoinPicker && (
            <View style={styles.coinDropdown}>
              {COINS.map(coin => (
                <TouchableOpacity
                  key={coin.symbol}
                  style={[styles.coinOption, selectedCoin.symbol === coin.symbol && styles.coinOptionActive]}
                  onPress={() => { setSelectedCoin(coin); setShowCoinPicker(false); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.coinOptionLeft}>
                    <Text style={styles.coinOptionIcon}>{coin.icon}</Text>
                    <View>
                      <Text style={[styles.coinOptionSymbol, selectedCoin.symbol === coin.symbol && { color: Colors.primary }]}>
                        {coin.symbol}
                      </Text>
                      <Text style={styles.coinOptionName}>{coin.name}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.coinOptionPrice}>{fmtUsd(coin.priceUsd)}</Text>
                    <Text style={styles.coinOptionFee}>Fee: {fmt(coin.withdrawalFee)} {coin.symbol}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Amount Input */}
          <View style={{ height: Spacing.lg }} />
          <Text style={styles.inputLabel}>Trade Amount ({selectedCoin.symbol})</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.amountSuffix}>
              <Text style={styles.amountSuffixText}>{selectedCoin.symbol}</Text>
            </View>
          </View>
          <Text style={styles.amountUsd}>≈ {fmtUsd(amount * selectedCoin.priceUsd)}</Text>
          {showLocalConversion && amount > 0 && (
            <View style={styles.localConversionRow}>
              <View style={styles.localConversionArrow}>
                <MaterialIcons name="arrow-downward" size={12} color={Colors.primary} />
              </View>
              <View style={styles.localConversionBadge}>
                <Text style={styles.localConversionFlag}>{selectedCurrency.flag}</Text>
                <Text style={styles.localConversionText}>
                  {selectedCurrency.symbol}
                  {(() => { const v = convertUSDRaw(amount * selectedCoin.priceUsd); return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); })()} {selectedCurrency.code}
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

          {/* Quick Amount Presets */}
          <View style={styles.presetRow}>
            {['100', '500', '1000', '5000', '10000'].map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.preset, amountText === p && styles.presetActive]}
                onPress={() => setAmountText(p)}
              >
                <Text style={[styles.presetText, amountText === p && styles.presetTextActive]}>
                  {parseInt(p) >= 1000 ? `${parseInt(p) / 1000}K` : p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Fee Breakdown */}
        <View style={styles.breakdownCard}>
          <View style={styles.breakdownHeader}>
            <MaterialIcons name="calculate" size={18} color={Colors.primary} />
            <Text style={styles.breakdownTitle}>Fee Breakdown</Text>
            <View style={styles.tradeBadge}>
              <Text style={styles.tradeBadgeText}>{tradeType.toUpperCase()}</Text>
            </View>
          </View>

          {calc.rows.map((row, i) => {
            const usdNum = parseFloat(row.usd.replace(/[^0-9.]/g, ''));
            const localFee = showLocalConversion && usdNum > 0 && !isNaN(usdNum)
              ? convertUSDRaw(usdNum)
              : null;
            return (
              <View key={i} style={[styles.feeRow, i < calc.rows.length - 1 && styles.feeRowBorder]}>
                <View style={styles.feeRowLeft}>
                  <Text style={styles.feeLabel}>{row.label}</Text>
                  <Text style={styles.feeUsd}>{row.usd}</Text>
                  {localFee !== null && (
                    <Text style={styles.feeLocalUsd}>
                      {selectedCurrency.flag} {selectedCurrency.symbol}
                      {localFee >= 1000
                        ? localFee.toLocaleString('en-US', { maximumFractionDigits: 0 })
                        : localFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {' '}{selectedCurrency.code}
                    </Text>
                  )}
                </View>
                <Text style={[styles.feeValue, { color: row.color }]} numberOfLines={1}>{row.value}</Text>
              </View>
            );
          })}
        </View>

        {/* Net Received Highlight */}
        <View style={styles.netCard}>
          <View style={styles.netLeft}>
            <MaterialIcons name="account-balance-wallet" size={22} color={Colors.primary} />
            <View style={{ gap: 2 }}>
              <Text style={styles.netLabel}>{calc.netLabel}</Text>
              <Text style={styles.netUsd}>{calc.netUsd}</Text>
              {showLocalConversion && (() => {
                const usdNum = parseFloat(calc.netUsd.replace(/[^0-9.]/g, ''));
                if (!usdNum || isNaN(usdNum)) return null;
                const localNet = convertUSDRaw(usdNum);
                return (
                  <View style={styles.netLocalRow}>
                    <Text style={styles.netLocalFlag}>{selectedCurrency.flag}</Text>
                    <Text style={styles.netLocalText}>
                      {selectedCurrency.symbol}
                      {localNet >= 1000
                        ? localNet.toLocaleString('en-US', { maximumFractionDigits: 0 })
                        : localNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {' '}{selectedCurrency.code}
                    </Text>
                  </View>
                );
              })()}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={styles.netValue} numberOfLines={1}>{calc.netValue}</Text>
            {showLocalConversion && rateTimestamp && (
              <View style={styles.liveRatePill}>
                {ratesLoading ? (
                  <ActivityIndicator size="small" color={Colors.success} style={{ transform: [{ scale: 0.55 }] }} />
                ) : (
                  <View style={styles.liveDot} />
                )}
                <Text style={styles.liveRateText}>Live · {rateTimestamp}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Summary Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statCellLabel}>Total Fee</Text>
            <Text style={styles.statCellValue} numberOfLines={1}>{calc.totalFeeCoins}</Text>
            <Text style={styles.statCellUsd}>{calc.totalFeeUsd}</Text>
            {showLocalConversion && (() => {
              const usdNum = parseFloat(calc.totalFeeUsd.replace(/[^0-9.]/g, ''));
              if (!usdNum || isNaN(usdNum)) return null;
              const localFee = convertUSDRaw(usdNum);
              return (
                <Text style={[styles.statCellUsd, { color: Colors.primary }]} numberOfLines={1}>
                  {selectedCurrency.flag} {selectedCurrency.symbol}
                  {localFee >= 1000
                    ? localFee.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : localFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {' '}{selectedCurrency.code}
                </Text>
              );
            })()}
          </View>
          <View style={[styles.statCell, styles.statCellBorder]}>
            <Text style={styles.statCellLabel}>{calc.savingsRow.label}</Text>
            <Text style={[styles.statCellValue, { color: Colors.success }]} numberOfLines={1}>
              {calc.savingsRow.value}
            </Text>
            <Text style={styles.statCellUsd}>
              {tradeType === 'spot' ? 'maker saves' : tradeType === 'p2p' ? 'more than spot' : 'network'}
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statCellLabel}>Effective Rate</Text>
            <Text style={[styles.statCellValue, { color: Colors.primary }]}>
              {tradeType === 'spot' ? '0.10%' : tradeType === 'p2p' ? '0.50%' : 'Fixed'}
            </Text>
            <Text style={styles.statCellUsd}>per trade</Text>
          </View>
        </View>

        {/* Rate Comparison Table */}
        <View style={styles.compCard}>
          <Text style={styles.compTitle}>Platform Rate Comparison</Text>
          {[
            { label: 'Spot Taker Fee',  rate: '0.10%', note: 'Market orders',  highlight: tradeType === 'spot'     },
            { label: 'Spot Maker Fee',  rate: '0.08%', note: 'Limit orders',   highlight: false                     },
            { label: 'P2P Trade Fee',   rate: '0.50%', note: 'Peer to Peer',   highlight: tradeType === 'p2p'      },
            { label: 'Withdrawal Fee',  rate: 'Fixed', note: 'Per coin/network', highlight: tradeType === 'withdraw'},
            { label: 'Deposit Fee',     rate: 'FREE',  note: 'All methods',    highlight: false                     },
          ].map((r, i) => (
            <View key={i} style={[styles.compRow, r.highlight && styles.compRowHighlight, i > 0 && styles.compRowBorder]}>
              <View style={styles.compRowLeft}>
                {r.highlight && <View style={styles.compDot} />}
                <Text style={[styles.compLabel, r.highlight && { color: Colors.textPrimary }]}>{r.label}</Text>
              </View>
              <View style={styles.compRowRight}>
                <Text style={[styles.compRate, r.highlight && { color: Colors.primary }]}>{r.rate}</Text>
                <Text style={styles.compNote}>{r.note}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <MaterialIcons name="info-outline" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>
            Fees shown are indicative. Actual fees may vary by trading pair, volume tier, and payment method. BTNG Gold members enjoy 10% fee discount.
          </Text>
        </View>

        {/* Copy Result Button */}
        <TouchableOpacity
          style={[styles.copyBtn, copied && styles.copyBtnDone]}
          onPress={handleCopy}
          activeOpacity={0.85}
        >
          <MaterialIcons name={copied ? 'check-circle' : 'content-copy'} size={20} color={copied ? Colors.success : Colors.bg} />
          <Text style={[styles.copyBtnText, copied && { color: Colors.success }]}>
            {copied ? 'Calculation Copied!' : 'Copy Full Calculation'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  copyHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  copyHeaderBtnDone: { borderColor: Colors.success + '44', backgroundColor: Colors.successBg },
  copyHeaderText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },

  content: { paddingHorizontal: Spacing.xl, paddingBottom: 24, gap: Spacing.xl },

  // Trade Type Selector
  typeRow: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 4, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10, borderRadius: Radius.md,
  },
  typeBtnActive: { backgroundColor: Colors.primary },
  typeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  typeBtnTextActive: { color: Colors.bg },

  // Input Card
  inputCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl,
  },
  inputLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.5, marginBottom: Spacing.sm, includeFontPadding: false },

  coinSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  coinSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  coinIconBadge: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  coinIconText: { fontSize: 20 },
  coinSymbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  coinName: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  coinSelectorRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coinPrice: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Coin Dropdown
  coinDropdown: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  coinOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  coinOptionActive: { backgroundColor: Colors.primaryGlow },
  coinOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinOptionIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  coinOptionSymbol: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  coinOptionName: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  coinOptionPrice: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  coinOptionFee: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Amount Input
  amountRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 2, borderColor: Colors.primary + '66', overflow: 'hidden',
  },
  amountInput: {
    flex: 1, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    fontSize: 24, fontWeight: FontWeight.bold, color: Colors.textPrimary,
    includeFontPadding: false,
  },
  amountSuffix: {
    backgroundColor: Colors.primaryGlow, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderLeftWidth: 1, borderLeftColor: Colors.primary + '44',
    minWidth: 64, alignItems: 'center', justifyContent: 'center',
  },
  amountSuffixText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  amountUsd: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 6, includeFontPadding: false },

  // Presets
  presetRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, flexWrap: 'wrap' },
  preset: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
  },
  presetActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  presetText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  presetTextActive: { color: Colors.primary },

  // Breakdown Card
  breakdownCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: 0,
  },
  breakdownHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: Spacing.lg,
  },
  breakdownTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tradeBadge: {
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  tradeBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  feeRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  feeRowLeft: { flex: 1, gap: 2 },
  feeLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  feeUsd: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  feeValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, textAlign: 'right', maxWidth: 160, includeFontPadding: false },

  // Local currency conversion
  localConversionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  localConversionArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '55' },
  localConversionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '44' },
  localConversionFlag: { fontSize: 15 },
  localConversionText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  liveRatePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveRateText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  feeLocalUsd: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  netLocalRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  netLocalFlag: { fontSize: 13 },
  netLocalText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Net Received
  netCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl,
    borderWidth: 2, borderColor: Colors.primary,
    padding: Spacing.xl,
  },
  netLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  netLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  netUsd: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  netValue: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, maxWidth: 160, textAlign: 'right', includeFontPadding: false },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row', backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  statCell: { flex: 1, padding: Spacing.md, alignItems: 'center', gap: 4 },
  statCellBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  statCellLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  statCellValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.error, textAlign: 'center', includeFontPadding: false },
  statCellUsd: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Rate Comparison
  compCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl,
  },
  compTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.md, includeFontPadding: false },
  compRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  compRowHighlight: { backgroundColor: Colors.primaryGlow, marginHorizontal: -Spacing.xl, paddingHorizontal: Spacing.xl },
  compRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  compRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  compDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  compLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  compRowRight: { alignItems: 'flex-end', gap: 2 },
  compRate: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  compNote: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Info Banner
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primary + '33', padding: Spacing.md,
  },
  infoText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },

  // Copy Button
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2, minHeight: 52,
  },
  copyBtnDone: { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '44' },
  copyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
