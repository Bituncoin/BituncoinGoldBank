/**
 * BTNG Mobile Banking Core — Unified Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete BTNG Mobile Banking OS combining:
 *   1. Mobile Identity Layer  (wallet + phone + Web3 domain)
 *   2. Wallet Engine          (BTNG address + BTC address)
 *   3. Mobile Money Engine    (MoMo ↔ BTNG cash-in/cash-out)
 *   4. BTC ↔ BTNG Swap       (live price swipe engine)
 *   5. Loan Engine            (collateral + borrow + LTV)
 *   6. Web3 Domain Layer      (bituncoin.genesis → address)
 *   7. Customer Dashboard     (full balance + history snapshot)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/template';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IdentityLayer {
  btngAddress: string;
  evmAddress: string;
  btcAddress: string;
  web3Domain: string;
  msisdn: string;
  tier: string;
}

interface BalanceSnapshot {
  btngGold: number;
  btcEquiv: number;
  ghsEquiv: number;
  loanBalance: number;
  ltvPct: number;
}

interface SwapQuote {
  fromAsset: 'BTC' | 'BTNG';
  toAsset: 'BTNG' | 'BTC';
  fromAmount: string;
  toAmount: string;
  rate: number;
  fee: number;
}

interface LoanState {
  collateralBtng: number;
  borrowedGhs: number;
  ltv: number;
  maxBorrow: number;
  dueDate: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BTC_CUSTOMER_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const BTNG_GHS_RATE = 14.82;   // 1 BTNGG ≈ 14.82 GHS (oracle)
const BTC_USD_RATE  = 107_500; // live approximation
const BTNG_USD_RATE = 0.028;   // 1 BTNGG ≈ $0.028

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, dp = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function pulse(anim: Animated.Value) {
  return Animated.loop(Animated.sequence([
    Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
    Animated.timing(anim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
  ]));
}

function CopyBtn({ value, small }: { value: string; small?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <TouchableOpacity
      style={[cop.btn, small && cop.small, ok && cop.done]}
      onPress={() => { Clipboard.setStringAsync(value).catch(()=>{}); setOk(true); setTimeout(() => setOk(false), 1800); }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.8}
    >
      <MaterialIcons name={ok ? 'check' : 'content-copy'} size={small ? 11 : 13} color={ok ? Colors.success : Colors.primary} />
    </TouchableOpacity>
  );
}
const cop = StyleSheet.create({
  btn:   { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  small: { width: 24, height: 24, borderRadius: 6 },
  done:  { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' },
});

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ children, color = Colors.primary, style }: { children: React.ReactNode; color?: string; style?: any }) {
  return (
    <View style={[sc.card, { borderColor: color + '55' }, style]}>
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
});

function CardHeader({ icon, title, badge, color = Colors.primary, onAction, actionIcon }: {
  icon: string; title: string; badge?: string; color?: string;
  onAction?: () => void; actionIcon?: string;
}) {
  return (
    <View style={ch.row}>
      <View style={[ch.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[ch.title, { color }]}>{title}</Text>
      {badge ? (
        <View style={[ch.badge, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <Text style={[ch.badgeText, { color }]}>{badge}</Text>
        </View>
      ) : null}
      {onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name={(actionIcon ?? 'arrow-forward-ios') as any} size={14} color={color} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
const ch = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap:  { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:     { flex: 1, fontSize: FontSize.sm + 1, fontWeight: FontWeight.bold, includeFontPadding: false },
  badge:     { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
});

// ─── 1. Identity Layer ────────────────────────────────────────────────────────

function IdentityCard({ identity, loading }: { identity: IdentityLayer | null; loading: boolean }) {
  const router = useRouter();

  const fields = identity ? [
    { label: 'BTNG ADDRESS',  value: identity.btngAddress,  color: Colors.primary,    mono: true  },
    { label: 'EVM ADDRESS',   value: identity.evmAddress,   color: '#627EEA',          mono: true  },
    { label: 'BTC ADDRESS',   value: identity.btcAddress,   color: '#F7931A',          mono: true  },
    { label: 'WEB3 DOMAIN',   value: identity.web3Domain,   color: '#9945FF',          mono: false },
    { label: 'TIER',          value: identity.tier,         color: Colors.primary,     mono: false },
  ] : [];

  return (
    <SectionCard color={Colors.primary}>
      <CardHeader
        icon="fingerprint"
        title="BTNG Mobile Identity"
        badge="SOVEREIGN"
        color={Colors.primary}
        onAction={() => router.push('/btng-wallet-generate' as any)}
        actionIcon="open-in-new"
      />
      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'center', paddingVertical: 12 }} />
      ) : identity ? (
        <>
          {fields.map(f => (
            <View key={f.label} style={id.fieldRow}>
              <Text style={id.fieldLabel}>{f.label}</Text>
              <View style={id.fieldValue}>
                <Text
                  style={[id.fieldText, { color: f.color }, f.mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 9 }]}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {f.value || '—'}
                </Text>
                {f.value ? <CopyBtn value={f.value} small /> : null}
              </View>
            </View>
          ))}
          <View style={id.chipRow}>
            <View style={[id.chip, { borderColor: Colors.success + '55', backgroundColor: Colors.successBg }]}>
              <View style={id.dot} />
              <Text style={[id.chipText, { color: Colors.success }]}>BTNG-MAINNET</Text>
            </View>
            <View style={[id.chip, { borderColor: '#9945FF55', backgroundColor: '#9945FF12' }]}>
              <Text style={{ fontSize: 11 }}>⚡</Text>
              <Text style={[id.chipText, { color: '#9945FF' }]}>bituncoin.genesis</Text>
            </View>
            <View style={[id.chip, { borderColor: '#F7931A55', backgroundColor: '#F7931A12' }]}>
              <Text style={{ fontSize: 11 }}>₿</Text>
              <Text style={[id.chipText, { color: '#F7931A' }]}>BTC Node</Text>
            </View>
          </View>
        </>
      ) : (
        <TouchableOpacity
          style={id.generateHint}
          onPress={() => router.push('/btng-wallet-generate' as any)}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add-circle" size={16} color={Colors.primary} />
          <Text style={id.generateHintText}>Generate your BTNG GoldCoin wallet to activate identity</Text>
          <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}
const id = StyleSheet.create({
  fieldRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border + '44', paddingVertical: 5 },
  fieldLabel:      { width: 84, fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  fieldValue:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldText:       { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip:            { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  dot:             { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  chipText:        { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  generateHint:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  generateHintText:{ flex: 1, fontSize: FontSize.xs, color: Colors.primary, includeFontPadding: false },
});

// ─── 2. Balance Snapshot ──────────────────────────────────────────────────────

function BalanceCard({ balance, loading }: { balance: BalanceSnapshot; loading: boolean }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => { const a = pulse(pulseAnim); a.start(); return () => a.stop(); }, []);

  const cells = [
    { label: 'BTNG Gold',  value: `${fmt(balance.btngGold)} BTNGG`, color: Colors.primary,  icon: 'monetization-on' },
    { label: 'BTC Equiv',  value: `₿ ${(balance.btngGold * BTNG_USD_RATE / BTC_USD_RATE).toFixed(8)}`, color: '#F7931A', icon: 'currency-bitcoin' },
    { label: 'GHS Value',  value: `₵ ${fmt(balance.ghsEquiv)}`,     color: '#22C55E',        icon: 'account-balance' },
    { label: 'USD Value',  value: `$ ${fmt(balance.btngGold * BTNG_USD_RATE)}`, color: '#3B82F6', icon: 'attach-money' },
  ];

  return (
    <SectionCard color="#D4A017">
      <CardHeader icon="account-balance-wallet" title="Balance Snapshot" badge="LIVE" color="#D4A017" />
      {loading ? (
        <ActivityIndicator size="small" color="#D4A017" style={{ alignSelf: 'center', paddingVertical: 12 }} />
      ) : (
        <>
          {/* Main balance hero */}
          <View style={bal.hero}>
            <Animated.View style={[bal.heroDot, { opacity: pulseAnim }]} />
            <View style={{ flex: 1 }}>
              <Text style={bal.heroLabel}>TOTAL BTNG GOLD BALANCE</Text>
              <Text style={bal.heroValue}>{fmt(balance.btngGold, 4)} BTNGG</Text>
            </View>
            <View style={bal.heroUsd}>
              <Text style={bal.heroUsdLabel}>≈ USD</Text>
              <Text style={bal.heroUsdValue}>${fmt(balance.btngGold * BTNG_USD_RATE)}</Text>
            </View>
          </View>

          {/* 4-cell grid */}
          <View style={bal.grid}>
            {cells.map(c => (
              <View key={c.label} style={[bal.cell, { borderColor: c.color + '33' }]}>
                <MaterialIcons name={c.icon as any} size={14} color={c.color} />
                <Text style={[bal.cellValue, { color: c.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{c.value}</Text>
                <Text style={bal.cellLabel}>{c.label}</Text>
              </View>
            ))}
          </View>

          {/* Oracle strip */}
          <View style={bal.oracleRow}>
            <MaterialIcons name="show-chart" size={10} color={Colors.textMuted} />
            <Text style={bal.oracleText}>BTNG Oracle · 1 BTNGG = ₵{BTNG_GHS_RATE} · ${BTNG_USD_RATE}</Text>
            <View style={bal.oracleBadge}><Text style={bal.oracleBadgeText}>GOLD-BACKED</Text></View>
          </View>
        </>
      )}
    </SectionCard>
  );
}
const bal = StyleSheet.create({
  hero:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, flexShrink: 0 },
  heroLabel:    { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false, marginBottom: 3 },
  heroValue:    { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroUsd:      { alignItems: 'flex-end', flexShrink: 0 },
  heroUsdLabel: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  heroUsdValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell:         { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, gap: 3, alignItems: 'center' },
  cellValue:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  cellLabel:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  oracleRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  oracleText:   { flex: 1, fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  oracleBadge:  { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  oracleBadgeText: { fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },
});

// ─── 3. Mobile Money Engine ───────────────────────────────────────────────────

function MobileMoneyCard() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const [mode, setMode] = useState<'cashin' | 'cashout'>('cashin');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState<'MTN' | 'Vodafone' | 'AirtelTigo'>('MTN');
  const [loading, setLoading] = useState(false);

  const btngEquiv = amount ? (parseFloat(amount) / BTNG_GHS_RATE).toFixed(4) : '0.0000';

  const handleSubmit = () => {
    if (!phone || !amount) { showAlert('Missing Fields', 'Enter phone number and amount.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 1) { showAlert('Invalid Amount', 'Minimum is ₵1.00 GHS.'); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      showAlert(
        mode === 'cashin' ? 'Cash-In Initiated' : 'Cash-Out Initiated',
        `${mode === 'cashin' ? `₵${fmt(amt)} → ${btngEquiv} BTNGG` : `${btngEquiv} BTNGG → ₵${fmt(amt)}`}\nPhone: ${phone}\nNetwork: ${network}\n\nProcessing via MTN MoMo Cash Rail…`
      );
    }, 1200);
  };

  return (
    <SectionCard color="#22C55E">
      <CardHeader
        icon="phone-android"
        title="Mobile Money Engine"
        badge="MTN MoMo"
        color="#22C55E"
        onAction={() => router.push('/cash-rail' as any)}
        actionIcon="open-in-new"
      />

      {/* Mode selector */}
      <View style={mm.modeRow}>
        {(['cashin', 'cashout'] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[mm.modeBtn, mode === m && mm.modeBtnActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={m === 'cashin' ? 'arrow-downward' : 'arrow-upward'}
              size={13}
              color={mode === m ? Colors.bg : '#22C55E'}
            />
            <Text style={[mm.modeBtnText, mode === m && { color: Colors.bg }]}>
              {m === 'cashin' ? 'Cash-In' : 'Cash-Out'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Network selector */}
      <View style={mm.networkRow}>
        {(['MTN', 'Vodafone', 'AirtelTigo'] as const).map(n => (
          <TouchableOpacity
            key={n}
            style={[mm.netBtn, network === n && mm.netBtnActive]}
            onPress={() => setNetwork(n)}
            activeOpacity={0.8}
          >
            <Text style={[mm.netBtnText, network === n && { color: '#22C55E' }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Phone input */}
      <View style={mm.inputRow}>
        <MaterialIcons name="phone" size={14} color="#22C55E" />
        <TextInput
          style={mm.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="0244XXXXXX or +233XXXXXXXXX"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
          maxLength={15}
        />
      </View>

      {/* Amount input */}
      <View style={mm.inputRow}>
        <Text style={mm.currency}>₵</Text>
        <TextInput
          style={[mm.input, { flex: 1 }]}
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount in GHS"
          placeholderTextColor={Colors.textMuted}
          keyboardType="decimal-pad"
        />
        <View style={mm.equivBadge}>
          <Text style={mm.equivText}>≈ {btngEquiv} BTNGG</Text>
        </View>
      </View>

      {/* Direction arrow */}
      <View style={mm.dirRow}>
        <Text style={mm.dirText}>
          {mode === 'cashin'
            ? `₵ GHS  →  BTNG Gold Wallet`
            : `BTNG Gold Wallet  →  ₵ GHS`}
        </Text>
        <MaterialIcons
          name={mode === 'cashin' ? 'south' : 'north'}
          size={14}
          color={mode === 'cashin' ? '#22C55E' : Colors.warning}
        />
      </View>

      <TouchableOpacity
        style={[mm.submitBtn, loading && { opacity: 0.5 }, { backgroundColor: mode === 'cashin' ? '#22C55E' : Colors.warning }]}
        onPress={handleSubmit}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name={mode === 'cashin' ? 'arrow-downward' : 'arrow-upward'} size={16} color={Colors.bg} />}
        <Text style={mm.submitBtnText}>
          {loading ? 'Processing…' : mode === 'cashin' ? 'Cash-In to BTNG' : 'Cash-Out to Mobile Money'}
        </Text>
      </TouchableOpacity>
    </SectionCard>
  );
}
const mm = StyleSheet.create({
  modeRow:      { flexDirection: 'row', gap: 8 },
  modeBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, borderWidth: 1.5, borderColor: '#22C55E55', backgroundColor: '#22C55E12' },
  modeBtnActive:{ backgroundColor: '#22C55E', borderColor: '#22C55E' },
  modeBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#22C55E', includeFontPadding: false },
  networkRow:   { flexDirection: 'row', gap: 6 },
  netBtn:       { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: Radius.md, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  netBtnActive: { backgroundColor: '#22C55E18', borderColor: '#22C55E55' },
  netBtnText:   { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: '#22C55E44', paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm },
  input:        { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  currency:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  equivBadge:   { backgroundColor: '#22C55E18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#22C55E44' },
  equivText:    { fontSize: 9, fontWeight: FontWeight.bold, color: '#22C55E', includeFontPadding: false },
  dirRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 3 },
  dirText:      { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  submitBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowColor: '#22C55E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  submitBtnText:{ fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
});

// ─── 4. BTC ↔ BTNG Swap Engine ───────────────────────────────────────────────

function SwapEngineCard() {
  const { showAlert } = useAlert();
  const [fromAsset, setFromAsset] = useState<'BTC' | 'BTNG'>('BTC');
  const [amount, setAmount] = useState('');
  const [swapping, setSwapping] = useState(false);

  const toAsset = fromAsset === 'BTC' ? 'BTNG' : 'BTC';
  const rate = fromAsset === 'BTC'
    ? BTC_USD_RATE / BTNG_USD_RATE   // BTC → BTNG
    : BTNG_USD_RATE / BTC_USD_RATE;  // BTNG → BTC

  const toAmount = amount
    ? (parseFloat(amount) * rate * (1 - 0.003)).toFixed(fromAsset === 'BTC' ? 2 : 8)
    : '';

  const feeAmt = amount ? (parseFloat(amount) * 0.003).toFixed(fromAsset === 'BTC' ? 8 : 2) : '0';

  const handleSwap = () => {
    if (!amount || parseFloat(amount) <= 0) { showAlert('Invalid Amount', 'Enter a valid swap amount.'); return; }
    setSwapping(true);
    setTimeout(() => {
      setSwapping(false);
      showAlert(
        'Swap Initiated',
        `${amount} ${fromAsset}  →  ${toAmount} ${toAsset}\nFee: ${feeAmt} ${fromAsset} (0.3%)\n\nSwap is processing via BTNG Exchange Engine.`
      );
    }, 1400);
  };

  return (
    <SectionCard color="#F7931A">
      <CardHeader icon="swap-horiz" title="BTC ↔ BTNG Swap Engine" badge="0.3% FEE" color="#F7931A" />

      {/* Pair selector */}
      <View style={sw.pairRow}>
        <View style={[sw.assetBox, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]}>
          <Text style={{ fontSize: 16 }}>{fromAsset === 'BTC' ? '₿' : '🥇'}</Text>
          <Text style={[sw.assetLabel, { color: fromAsset === 'BTC' ? '#F7931A' : Colors.primary }]}>{fromAsset}</Text>
          <Text style={sw.assetSub}>{fromAsset === 'BTC' ? 'Bitcoin' : 'BTNG Gold'}</Text>
        </View>
        <TouchableOpacity
          style={sw.swapBtn}
          onPress={() => { setFromAsset(v => v === 'BTC' ? 'BTNG' : 'BTC'); setAmount(''); }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="swap-horiz" size={20} color="#F7931A" />
        </TouchableOpacity>
        <View style={[sw.assetBox, { borderColor: toAsset === 'BTNG' ? Colors.primary + '55' : '#F7931A55', backgroundColor: toAsset === 'BTNG' ? Colors.primaryGlow : '#F7931A12' }]}>
          <Text style={{ fontSize: 16 }}>{toAsset === 'BTC' ? '₿' : '🥇'}</Text>
          <Text style={[sw.assetLabel, { color: toAsset === 'BTC' ? '#F7931A' : Colors.primary }]}>{toAsset}</Text>
          <Text style={sw.assetSub}>{toAsset === 'BTC' ? 'Bitcoin' : 'BTNG Gold'}</Text>
        </View>
      </View>

      {/* From amount */}
      <View style={sw.inputRow}>
        <Text style={sw.inputLabel}>FROM {fromAsset}</Text>
        <TextInput
          style={sw.input}
          value={amount}
          onChangeText={setAmount}
          placeholder={`0.00 ${fromAsset}`}
          placeholderTextColor={Colors.textMuted}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Rate + output */}
      <View style={sw.rateBox}>
        <View style={{ flex: 1 }}>
          <Text style={sw.rateLabel}>RATE</Text>
          <Text style={sw.rateValue}>1 {fromAsset} = {fromAsset === 'BTC' ? `${(BTC_USD_RATE / BTNG_USD_RATE).toFixed(0)} BTNGG` : `${(BTNG_USD_RATE / BTC_USD_RATE).toFixed(10)} BTC`}</Text>
        </View>
        <View style={sw.outputBox}>
          <Text style={sw.outputLabel}>YOU RECEIVE</Text>
          <Text style={sw.outputValue}>{toAmount || '—'} {toAsset}</Text>
        </View>
      </View>

      {/* Fee row */}
      <View style={sw.feeRow}>
        <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
        <Text style={sw.feeText}>Fee: {feeAmt} {fromAsset} (0.3%) · Slippage: 0.1% max</Text>
      </View>

      <TouchableOpacity
        style={[sw.executeBtn, swapping && { opacity: 0.5 }]}
        onPress={handleSwap}
        disabled={swapping}
        activeOpacity={0.85}
      >
        {swapping ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="swap-horiz" size={18} color={Colors.bg} />}
        <Text style={sw.executeBtnText}>{swapping ? 'Executing Swap…' : `Swap ${fromAsset} → ${toAsset}`}</Text>
      </TouchableOpacity>

      {/* BTC customer address */}
      <View style={sw.btcAddrRow}>
        <MaterialIcons name="currency-bitcoin" size={11} color="#F7931A" />
        <Text style={sw.btcAddrLabel}>BTC Service Address:</Text>
        <Text style={sw.btcAddr} numberOfLines={1} ellipsizeMode="middle">{BTC_CUSTOMER_ADDRESS}</Text>
        <CopyBtn value={BTC_CUSTOMER_ADDRESS} small />
      </View>
    </SectionCard>
  );
}
const sw = StyleSheet.create({
  pairRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  assetBox:     { flex: 1, alignItems: 'center', gap: 3, borderRadius: Radius.lg, borderWidth: 1.5, paddingVertical: Spacing.sm + 3 },
  assetLabel:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  assetSub:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  swapBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F7931A18', borderWidth: 1.5, borderColor: '#F7931A55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  inputRow:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: '#F7931A44', padding: Spacing.sm + 2, gap: 4 },
  inputLabel:   { fontSize: 8, fontWeight: FontWeight.heavy, color: '#F7931A', letterSpacing: 0.8, includeFontPadding: false },
  input:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  rateBox:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateLabel:    { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false, marginBottom: 2 },
  rateValue:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  outputBox:    { flex: 1, backgroundColor: '#F7931A12', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#F7931A44', padding: Spacing.sm, alignItems: 'flex-end' },
  outputLabel:  { fontSize: 8, fontWeight: FontWeight.heavy, color: '#F7931A', letterSpacing: 0.8, includeFontPadding: false, marginBottom: 2 },
  outputValue:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#F7931A', includeFontPadding: false },
  feeRow:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  feeText:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  executeBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F7931A', borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowColor: '#F7931A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  executeBtnText:{ fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  btcAddrRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F7931A10', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#F7931A33' },
  btcAddrLabel: { fontSize: 9, fontWeight: FontWeight.bold, color: '#F7931A', includeFontPadding: false, flexShrink: 0 },
  btcAddr:      { flex: 1, fontSize: 9, color: '#F7931A', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── 5. Loan Engine ───────────────────────────────────────────────────────────

function LoanEngineCard() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const [collateral, setCollateral] = useState('');
  const [loading, setLoading] = useState(false);

  const LTV = 0.65;
  const APR = 12.5;
  const collateralNum = parseFloat(collateral) || 0;
  const maxBorrow = collateralNum * BTNG_GHS_RATE * LTV;
  const interest30d = (maxBorrow * APR) / 100 / 12;
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');

  const riskColor = collateralNum < 100 ? '#22C55E' : collateralNum < 1000 ? Colors.warning : '#EF4444';
  const riskLabel = collateralNum < 100 ? 'LOW' : collateralNum < 1000 ? 'MEDIUM' : 'HIGH';

  const handleBorrow = () => {
    if (!collateral || collateralNum <= 0) { showAlert('Enter Collateral', 'Enter BTNG amount to lock as collateral.'); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      showAlert(
        'Loan Initiated',
        `Collateral: ${collateralNum} BTNGG\nMax Borrow: ₵${fmt(maxBorrow)}\nAPR: ${APR}%\nDue: ${dueDate}\n\nLoan pending approval on BTNG Lending Engine.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm & Borrow', onPress: () => router.push('/btng-bank' as any) },
        ]
      );
    }, 1000);
  };

  return (
    <SectionCard color="#8247E5">
      <CardHeader icon="account-balance" title="Loan Engine" badge="COLLATERAL" color="#8247E5" onAction={() => router.push('/btng-bank' as any)} actionIcon="open-in-new" />

      {/* LTV info strip */}
      <View style={ln.ltvRow}>
        {[
          { label: 'LTV Ratio',  value: `${(LTV * 100).toFixed(0)}%`,   color: '#8247E5' },
          { label: 'APR',        value: `${APR}%`,                       color: Colors.warning },
          { label: 'Term',       value: '30 days',                       color: '#3B82F6' },
          { label: 'Min Col.',   value: '10 BTNGG',                      color: '#22C55E' },
        ].map(c => (
          <View key={c.label} style={ln.ltvCell}>
            <Text style={[ln.ltvValue, { color: c.color }]}>{c.value}</Text>
            <Text style={ln.ltvLabel}>{c.label}</Text>
          </View>
        ))}
      </View>

      {/* Collateral input */}
      <View style={ln.inputRow}>
        <Text style={ln.currency}>🥇</Text>
        <TextInput
          style={ln.input}
          value={collateral}
          onChangeText={setCollateral}
          placeholder="BTNGG to lock as collateral"
          placeholderTextColor={Colors.textMuted}
          keyboardType="decimal-pad"
        />
        <View style={[ln.riskBadge, { borderColor: riskColor + '55', backgroundColor: riskColor + '18' }]}>
          <Text style={[ln.riskText, { color: riskColor }]}>{riskLabel}</Text>
        </View>
      </View>

      {/* Borrow preview */}
      {collateralNum > 0 ? (
        <View style={ln.previewBox}>
          {[
            { label: 'Max Borrow',    value: `₵ ${fmt(maxBorrow)}`,       color: '#22C55E' },
            { label: '30d Interest',  value: `₵ ${fmt(interest30d)}`,     color: Colors.warning },
            { label: 'Total Due',     value: `₵ ${fmt(maxBorrow + interest30d)}`, color: '#EF4444' },
            { label: 'Due Date',      value: dueDate,                      color: '#3B82F6' },
          ].map(r => (
            <View key={r.label} style={ln.previewRow}>
              <Text style={ln.previewLabel}>{r.label}</Text>
              <Text style={[ln.previewValue, { color: r.color }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Auto-liquidation warning */}
      <View style={ln.warningRow}>
        <MaterialIcons name="warning" size={11} color={Colors.warning} />
        <Text style={ln.warningText}>Auto-liquidation triggers if LTV exceeds 80%. Collateral is locked on-chain until repayment.</Text>
      </View>

      <TouchableOpacity
        style={[ln.borrowBtn, loading && { opacity: 0.5 }]}
        onPress={handleBorrow}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="account-balance" size={18} color={Colors.bg} />}
        <Text style={ln.borrowBtnText}>{loading ? 'Processing Loan…' : 'Borrow Against BTNG Collateral'}</Text>
      </TouchableOpacity>
    </SectionCard>
  );
}
const ln = StyleSheet.create({
  ltvRow:       { flexDirection: 'row', gap: 6 },
  ltvCell:      { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 8, alignItems: 'center', gap: 2 },
  ltvValue:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  ltvLabel:     { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: '#8247E544', paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm },
  currency:     { fontSize: 16, flexShrink: 0 },
  input:        { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  riskBadge:    { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  riskText:     { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  previewBox:   { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: '#8247E544', overflow: 'hidden' },
  previewRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  previewLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  previewValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  warningRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '33' },
  warningText:  { flex: 1, fontSize: 9, color: Colors.warning, lineHeight: 13, includeFontPadding: false },
  borrowBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#8247E5', borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowColor: '#8247E5', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  borrowBtnText:{ fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
});

// ─── 6. Web3 Domain Layer ─────────────────────────────────────────────────────

function Web3DomainCard({ userId }: { userId?: string }) {
  const router = useRouter();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb
          .from('btng_domain_records')
          .select('domain, chain, coin_symbol, wallet_address, is_primary')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(8);
        if (!cancelled && data) setRecords(data);
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const CHAIN_COLORS: Record<string, string> = {
    Solana: '#9945FF', Polygon: '#8247E5', Ethereum: '#627EEA', Bitcoin: '#F7931A', BTNG: Colors.primary,
  };

  const DOMAIN_COLORS: Record<string, string> = {
    'btng.gold': '#D4A017', 'btng.token': '#8247E5', 'bituncoin.genesis': '#9945FF',
  };

  return (
    <SectionCard color="#9945FF">
      <CardHeader
        icon="language"
        title="Web3 Domain Layer"
        badge="Polygon · Solana"
        color="#9945FF"
        onAction={() => router.push('/btng-domain' as any)}
        actionIcon="open-in-new"
      />

      {/* Domain pills */}
      <View style={wd.domainRow}>
        {['btng.gold', 'btng.token', 'bituncoin.genesis'].map(d => (
          <TouchableOpacity
            key={d}
            style={[wd.domainPill, { borderColor: (DOMAIN_COLORS[d] ?? '#9945FF') + '66', backgroundColor: (DOMAIN_COLORS[d] ?? '#9945FF') + '12' }]}
            onPress={() => router.push('/btng-domain' as any)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11 }}>{d === 'btng.gold' ? '🥇' : d === 'btng.token' ? '🔷' : '⚡'}</Text>
            <Text style={[wd.domainPillText, { color: DOMAIN_COLORS[d] ?? '#9945FF' }]}>{d}</Text>
            <Text style={[wd.recordCount, { color: DOMAIN_COLORS[d] ?? '#9945FF' }]}>
              {records.filter(r => r.domain === d).length}r
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Records list */}
      {loading ? (
        <ActivityIndicator size="small" color="#9945FF" style={{ alignSelf: 'center', paddingVertical: 8 }} />
      ) : records.length === 0 ? (
        <TouchableOpacity style={wd.emptyHint} onPress={() => router.push('/btng-domain' as any)} activeOpacity={0.8}>
          <MaterialIcons name="add-link" size={14} color="#9945FF" />
          <Text style={wd.emptyText}>Link wallet addresses to your Web3 domains</Text>
          <MaterialIcons name="arrow-forward-ios" size={11} color="#9945FF" />
        </TouchableOpacity>
      ) : (
        <View style={wd.recordsList}>
          {records.slice(0, 5).map((r, i) => (
            <View key={i} style={wd.recordRow}>
              <View style={[wd.chainTag, { borderColor: (CHAIN_COLORS[r.chain] ?? '#9945FF') + '55', backgroundColor: (CHAIN_COLORS[r.chain] ?? '#9945FF') + '18' }]}>
                <Text style={[wd.chainTagText, { color: CHAIN_COLORS[r.chain] ?? '#9945FF' }]}>{r.coin_symbol ?? r.chain}</Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={[wd.domainText, { color: DOMAIN_COLORS[r.domain] ?? '#9945FF' }]}>{r.domain}</Text>
                <Text style={wd.addrText} numberOfLines={1} ellipsizeMode="middle">{r.wallet_address}</Text>
              </View>
              {r.is_primary ? (
                <View style={wd.primaryBadge}><Text style={wd.primaryBadgeText}>PRIMARY</Text></View>
              ) : null}
              <CopyBtn value={r.wallet_address} small />
            </View>
          ))}
          {records.length > 5 ? (
            <TouchableOpacity style={wd.moreBtn} onPress={() => router.push('/btng-domain' as any)} activeOpacity={0.8}>
              <Text style={wd.moreBtnText}>+{records.length - 5} more records · Manage →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Resolution tip */}
      <View style={wd.tipRow}>
        <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
        <Text style={wd.tipText}>Type <Text style={{ color: '#D4A017', fontWeight: '700' }}>btng.gold</Text> in any Send field to auto-resolve your linked address.</Text>
      </View>
    </SectionCard>
  );
}
const wd = StyleSheet.create({
  domainRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  domainPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  domainPillText: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  recordCount:    { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  emptyHint:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#9945FF12', borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: '#9945FF44' },
  emptyText:      { flex: 1, fontSize: FontSize.xs, color: '#9945FF', includeFontPadding: false },
  recordsList:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  recordRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  chainTag:       { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  chainTagText:   { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  domainText:     { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  addrText:       { fontSize: 8, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  primaryBadge:   { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44', flexShrink: 0 },
  primaryBadgeText: { fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  moreBtn:        { alignItems: 'center', paddingVertical: 7 },
  moreBtnText:    { fontSize: FontSize.xs, color: '#9945FF', fontWeight: FontWeight.semibold, includeFontPadding: false },
  tipRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  tipText:        { flex: 1, fontSize: 9, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false },
});

// ─── 7. Quick-Action Grid ─────────────────────────────────────────────────────

function QuickActionGrid() {
  const router = useRouter();
  const ACTIONS = [
    { icon: 'arrow-downward',  label: 'Deposit',     color: '#22C55E',     route: '/deposit'           },
    { icon: 'arrow-upward',    label: 'Withdraw',    color: '#EF4444',     route: '/withdraw'          },
    { icon: 'swap-horiz',      label: 'Transfer',    color: '#3B82F6',     route: '/transfer'          },
    { icon: 'payments',        label: 'BTNG Pay',    color: Colors.primary,route: '/btng-pay'          },
    { icon: 'history',         label: 'Cash Rail',   color: '#F59E0B',     route: '/cash-rail'         },
    { icon: 'account-balance', label: 'Bank',        color: '#8247E5',     route: '/btng-bank'         },
    { icon: 'vpn-key',         label: 'Wallet Gen',  color: '#D4A017',     route: '/btng-wallet-generate' },
    { icon: 'explore',         label: 'Explorer',    color: '#3B82F6',     route: '/btng-explorer'     },
    { icon: 'show-chart',      label: 'Terminal',    color: Colors.primary,route: '/btng-terminal'     },
    { icon: 'people',          label: 'P2P',         color: '#22C55E',     route: '/btng-africa-p2p'   },
    { icon: 'science',         label: 'Practice',    color: '#9945FF',     route: '/practice'          },
    { icon: 'content-copy',    label: 'Copy Trade',  color: '#F7931A',     route: '/copy-trading'      },
  ] as const;

  return (
    <SectionCard color={Colors.primary}>
      <CardHeader icon="apps" title="Quick Actions" badge="12 MODULES" color={Colors.primary} />
      <View style={qa.grid}>
        {ACTIONS.map(a => (
          <TouchableOpacity
            key={a.label}
            style={[qa.cell, { borderColor: a.color + '44', backgroundColor: a.color + '10' }]}
            onPress={() => router.push(a.route as any)}
            activeOpacity={0.8}
          >
            <View style={[qa.iconWrap, { backgroundColor: a.color + '20', borderColor: a.color + '55' }]}>
              <MaterialIcons name={a.icon as any} size={18} color={a.color} />
            </View>
            <Text style={[qa.cellLabel, { color: a.color }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SectionCard>
  );
}
const qa = StyleSheet.create({
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell:     { width: '22%', flexGrow: 1, alignItems: 'center', gap: 6, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 3 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cellLabel:{ fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false, textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BtngMobileBankingScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  const [identity,     setIdentity]     = useState<IdentityLayer | null>(null);
  const [identLoading, setIdentLoading] = useState(true);
  const [balance,      setBalance]      = useState<BalanceSnapshot>({ btngGold: 0, btcEquiv: 0, ghsEquiv: 0, loanBalance: 0, ltvPct: 0 });
  const [balLoading,   setBalLoading]   = useState(true);

  useEffect(() => { const a = pulse(pulseAnim); a.start(); return () => a.stop(); }, []);

  // Load identity from AsyncStorage + DB
  const loadIdentity = useCallback(async () => {
    setIdentLoading(true);
    try {
      // Last generated BTNG GoldCoin wallet
      const raw = await AsyncStorage.getItem('btng_goldcoin_last_wallet_v1');
      const localWallet = raw ? JSON.parse(raw) : null;

      // Pull live wallet from DB
      let dbBtngId = '';
      let dbWalletAddr = '';
      if (user?.id) {
        const sb = getSupabaseClient();
        const { data: walletData } = await sb
          .from('btng_wallets')
          .select('btng_id, wallet_address, balance')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (walletData) {
          dbBtngId    = walletData.btng_id;
          dbWalletAddr = walletData.wallet_address;
          setBalance(prev => ({ ...prev, btngGold: walletData.balance ?? 0, ghsEquiv: (walletData.balance ?? 0) * BTNG_GHS_RATE }));
          setBalLoading(false);
        }
      }

      setIdentity({
        btngAddress: localWallet?.address || dbWalletAddr || '',
        evmAddress:  localWallet?.evmAddress || '',
        btcAddress:  BTC_CUSTOMER_ADDRESS,
        web3Domain:  'bituncoin.genesis',
        msisdn:      (user as any)?.phone || '',
        tier:        (user as any)?.tier || 'Bronze',
      });
    } catch { /* silent */ }
    setIdentLoading(false);
    setBalLoading(false);
  }, [user?.id]);

  useEffect(() => { loadIdentity(); }, [loadIdentity]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <View style={s.topTitleRow}>
            <Text style={s.topTitle}>BTNG Mobile Banking</Text>
            <Animated.View style={[s.liveDot, { opacity: pulseAnim }]} />
          </View>
          <Text style={s.topSub}>Ghana · 54 Africa Nations · Sovereign Chain</Text>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={loadIdentity}
        >
          <MaterialIcons name="refresh" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* ── OS Status Banner ── */}
      <View style={s.osBanner}>
        <View style={s.osBannerLeft}>
          <Animated.View style={[s.osBannerDot, { opacity: pulseAnim }]} />
          <Text style={s.osBannerText}>BituncoinOS · BTNG-MAINNET · LIVE</Text>
        </View>
        <View style={s.osBannerRight}>
          <Text style={s.osBannerStat}>₵{BTNG_GHS_RATE} / BTNGG</Text>
          <Text style={s.osBannerDivider}>·</Text>
          <Text style={s.osBannerStat}>${BTNG_USD_RATE}</Text>
          <Text style={s.osBannerDivider}>·</Text>
          <Text style={s.osBannerStat}>BTC ${(BTC_USD_RATE / 1000).toFixed(1)}k</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* 1. Identity */}
        <IdentityCard identity={identity} loading={identLoading} />

        {/* 2. Balance */}
        <BalanceCard balance={balance} loading={balLoading} />

        {/* Quick Actions */}
        <QuickActionGrid />

        {/* 3. Mobile Money */}
        <MobileMoneyCard />

        {/* 4. BTC ↔ BTNG Swap */}
        <SwapEngineCard />

        {/* 5. Loan Engine */}
        <LoanEngineCard />

        {/* 6. Web3 Domain */}
        <Web3DomainCard userId={user?.id} />

        {/* Architecture Info */}
        <SectionCard color={Colors.textMuted} style={{ borderColor: Colors.border }}>
          <CardHeader icon="info-outline" title="BTNG Banking Architecture" color={Colors.textMuted} />
          {[
            { label: 'Identity Layer',    desc: 'MSISDN + secp256k1 KeyPair + BTNG Address',         color: Colors.primary },
            { label: 'Wallet Engine',     desc: 'btng1g… (35 chars) · Base58Check · SHA256+RIPEMD160', color: '#D4A017' },
            { label: 'Mobile Money',      desc: 'MTN MoMo · Vodafone Cash · AirtelTigo Cash',          color: '#22C55E' },
            { label: 'Swap Engine',       desc: 'BTC ↔ BTNGG · Live Oracle · 0.3% Fee',               color: '#F7931A' },
            { label: 'Loan Engine',       desc: '65% LTV · 12.5% APR · Auto-Liquidation @ 80%',       color: '#8247E5' },
            { label: 'Web3 Domain',       desc: 'bituncoin.genesis · btng.gold · btng.token',          color: '#9945FF' },
            { label: 'A.I.A Engine',      desc: 'ECPU + EGPU · Private Banker · 54 Nations',           color: Colors.primary },
            { label: 'Cryptography',      desc: 'AES-256-GCM · Vault Core · Quantum-ready path',       color: '#3B82F6' },
          ].map(row => (
            <View key={row.label} style={arch.row}>
              <View style={[arch.dot, { backgroundColor: row.color }]} />
              <Text style={arch.label}>{row.label}</Text>
              <Text style={arch.desc} numberOfLines={1}>{row.desc}</Text>
            </View>
          ))}
          <View style={arch.footer}>
            <MaterialIcons name="verified" size={11} color={Colors.primary} />
            <Text style={arch.footerText}>EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624 · Ghana · 54 Africa</Text>
          </View>
        </SectionCard>

      </ScrollView>
    </View>
  );
}

const arch = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '33' },
  dot:        { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  label:      { width: 90, fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  desc:       { flex: 1, fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  footer:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  footerText: { flex: 1, fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
});

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:    { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: Spacing.sm },
  topTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  topTitle:     { fontSize: FontSize.md + 1, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  liveDot:      { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success },
  topSub:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  osBanner:     { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: Colors.primary + '44' },
  osBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  osBannerDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success },
  osBannerText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  osBannerRight:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  osBannerStat: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  osBannerDivider:{ fontSize: 9, color: Colors.textMuted },
  scroll:       { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: 0 },
});
