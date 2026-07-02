
/**
 * app/btng-genesis-domain.tsx
 * bituncoin.genesis — Solana W3 Domain Viewer
 *
 * Displays the minted Solana-based "bituncoin.genesis" domain with:
 *  • Full Solana transaction details (signature, slot, blockhash, fee, CUs)
 *  • DeFi wallet connection (0xc9b4cf09...47F6332b)
 *  • Domain portfolio card with HumbleWorth valuation
 *  • On-chain explorer links for Solana signatures
 *  • Connected wallet & mint receipt display
 *  • Live Solana RPC lookup (balance + recent tx history)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, Platform, Linking, ActivityIndicator,
} from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import QRCode from 'react-native-qrcode-svg';

// ─── Domain Config ────────────────────────────────────────────────────────────

const DOMAIN = {
  name:            'bituncoin.genesis',
  displayEmoji:    '⚡',
  color:           '#9945FF',
  accentColor:     '#14F195',
  chain:           'Solana',
  chainShort:      'SOL',
  mintDate:        'Jun 26, 2026',
  mintTimestamp:   'Jun 26, 2026 at 13:59:34 EDT',
  estimatedValue:  '$0',
  estimator:       'HumbleWorth',
  purchasePrice:   '$3.50',
  namespace:       'W3',
  tld:             'genesis',
  sld:             'bituncoin',
  category:        'WEB3 IDENTITY',
  txSignature:  'A3bYvnAbvB2nSu1KzJHyeyqVH4AzPScYGf5fQ7xpeA3TZiWpmNoTR4gbfUmbuCNUwC2BGm18Vxyhs7HU1dLQ9cr',
  txShort:      'A3bYvnAb…U1dLQ9cr',
  txStatus:     'Success',
  txConfirmation: 'Finalized (MAX Confirmations)',
  feePayer:     'DAqCpTpQN1JNCDYLXWir28q1J2eXSufiNNADsSnUQTBZ',
  feePayerShort:'DAqCpTpQ…nUQTBZ',
  slot:         '429,070,708',
  recentBlockhash: '2u9eFTfufRuQPpx2wRSbm7UCVQvHkPgFG1QyvD4kJncy',
  blockhashShort:  '2u9eFTfu…4kJncy',
  fee:           '◎0.000015859',
  txCost:        '70,666',
  cuConsumed:    '66,019',
  cuLimit:       '85,824',
  txVersion:     '0',
  defiWalletFull:  '0xc9b4cf095C32fEbAE79389922c5a718247F6332b',
  defiWalletShort: '0xc9b4cf09…47F6332b',
  defiConnected:   true,
  solscanBase:  'https://solscan.io/tx/',
  solanaFmBase: 'https://solana.fm/tx/',
} as const;

const STATUS_COLOR  = '#22C55E';
const CHAIN_COLOR   = DOMAIN.color;
const ACCENT_COLOR  = DOMAIN.accentColor;

// ─── Solana RPC ───────────────────────────────────────────────────────────────

const SOL_RPC          = 'https://api.mainnet-beta.solana.com';
const FEE_PAYER        = 'DAqCpTpQN1JNCDYLXWir28q1J2eXSufiNNADsSnUQTBZ';
const LAMPORTS_PER_SOL = 1_000_000_000;

interface SolSignature {
  signature: string;
  slot:      number;
  blockTime: number | null;
  err:       unknown | null;
  memo:      string | null;
}

async function solRpc<T>(method: string, params: unknown[]): Promise<{ result?: T; error?: string }> {
  try {
    const res = await fetch(SOL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json();
    if (json.error) return { error: json.error.message ?? 'RPC error' };
    return { result: json.result };
  } catch (e: any) {
    return { error: e?.message ?? 'Network error' };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.9, duration: 850, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1,   duration: 850, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.28, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

function CopyRow({
  label, value, mono = false, color = Colors.textSecondary,
}: { label: string; value: string; mono?: boolean; color?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={cr.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={cr.label}>{label}</Text>
        <Text
          style={[cr.value, { color }, mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 }]}
          numberOfLines={1}
          ellipsizeMode="middle"
          selectable
        >
          {value}
        </Text>
      </View>
      <TouchableOpacity
        style={[cr.btn, copied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}
        onPress={() => { ExpoClipboard.setStringAsync(value).catch(()=>{}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={copied ? Colors.success : Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
const cr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  label: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  value: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  btn:   { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

function SectionTitle({ icon, label, color = Colors.textPrimary, badge }: { icon: string; label: string; color?: string; badge?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 }}>
      <View style={[st.icon, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={14} color={color} />
      </View>
      <Text style={[st.label, { color }]}>{label}</Text>
      {badge !== undefined && (
        <View style={[st.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[st.badgeText, { color }]}>{badge}</Text>
        </View>
      )}
    </View>
  );
}
const st = StyleSheet.create({
  icon:      { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:     { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  badge:     { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
});

function CUBar({ consumed, limit, color }: { consumed: number; limit: number; color: string }) {
  const pct = Math.min(consumed / limit, 1);
  const pctLabel = ((consumed / limit) * 100).toFixed(1) + '%';
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 9, color: Colors.textMuted, fontWeight: '700' as any, includeFontPadding: false }}>COMPUTE UNITS</Text>
        <Text style={{ fontSize: 9, color, fontWeight: '800' as any, includeFontPadding: false }}>{pctLabel} used</Text>
      </View>
      <View style={{ height: 7, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>
          Consumed: <Text style={{ color, fontWeight: '700' as any }}>{consumed.toLocaleString()}</Text>
        </Text>
        <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>
          Limit: <Text style={{ color: Colors.textSecondary, fontWeight: '700' as any }}>{limit.toLocaleString()}</Text>
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BTNGGenesisDomainScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { showAlert } = useAlert();
  const [showQR,      setShowQR] = useState(false);
  const qrRef = useRef<any>(null);

  // ── Solana RPC state ──────────────────────────────────────────────────────
  const [solBalance,   setSolBalance]   = useState<number | null>(null);
  const [solSigs,      setSolSigs]      = useState<SolSignature[]>([]);
  const [solLoading,   setSolLoading]   = useState(false);
  const [solError,     setSolError]     = useState('');
  const [solLastFetch, setSolLastFetch] = useState<Date | null>(null);
  const [solStatus,    setSolStatus]    = useState<'idle' | 'live' | 'error'>('idle');

  const openExplorer = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      showAlert('Open Explorer', 'Copy the URL from clipboard and open in your browser.');
    });
  }, [showAlert]);

  // ── Fetch Solana RPC data ─────────────────────────────────────────────────
  const fetchSolanaData = useCallback(async () => {
    setSolLoading(true);
    setSolError('');
    try {
      const [balRes, sigRes] = await Promise.all([
        solRpc<{ value: number }>('getBalance', [FEE_PAYER]),
        solRpc<SolSignature[]>('getSignaturesForAddress', [FEE_PAYER, { limit: 10 }]),
      ]);
      if (balRes.error) {
        setSolError(balRes.error);
        setSolStatus('error');
      } else {
        const lamports = balRes.result?.value ?? 0;
        setSolBalance(lamports / LAMPORTS_PER_SOL);
        setSolStatus('live');
      }
      if (!sigRes.error && sigRes.result) {
        setSolSigs(sigRes.result);
      }
      setSolLastFetch(new Date());
    } catch (e: any) {
      setSolError(e?.message ?? 'RPC lookup failed');
      setSolStatus('error');
    } finally {
      setSolLoading(false);
    }
  }, []);

  useEffect(() => { fetchSolanaData(); }, [fetchSolanaData]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={[s.topTitle, { color: CHAIN_COLOR }]}>{DOMAIN.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={ACCENT_COLOR} size={5} />
            <Text style={[s.topSub, { color: ACCENT_COLOR }]}>Solana · Finalized · W3 Domain</Text>
          </View>
        </View>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: CHAIN_COLOR + '18', borderColor: CHAIN_COLOR + '44' }]} onPress={() => setShowQR(v => !v)} activeOpacity={0.8}>
          <MaterialIcons name="qr-code" size={20} color={CHAIN_COLOR} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── HERO CARD ──────────────────────────────────────────────────── */}
        <View style={[s.heroCard, { borderColor: CHAIN_COLOR + '66' }]}>
          <View style={[s.heroHeader, { backgroundColor: CHAIN_COLOR + '0E' }]}>
            <View style={[s.heroEmoji, { backgroundColor: CHAIN_COLOR + '22', borderColor: CHAIN_COLOR + '55' }]}>
              <Text style={{ fontSize: 40 }}>{DOMAIN.displayEmoji}</Text>
              <View style={s.heroSolBadge}>
                <Text style={{ fontSize: 10 }}>◎</Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={[s.heroDomain, { color: CHAIN_COLOR }]}>{DOMAIN.name}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                <View style={[s.heroPill, { backgroundColor: STATUS_COLOR + '18', borderColor: STATUS_COLOR + '44' }]}>
                  <LiveDot color={STATUS_COLOR} size={4} />
                  <Text style={[s.heroPillText, { color: STATUS_COLOR }]}>FINALIZED</Text>
                </View>
                <View style={[s.heroPill, { backgroundColor: CHAIN_COLOR + '18', borderColor: CHAIN_COLOR + '44' }]}>
                  <Text style={{ fontSize: 9 }}>◎</Text>
                  <Text style={[s.heroPillText, { color: CHAIN_COLOR }]}>SOLANA</Text>
                </View>
                <View style={[s.heroPill, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                  <Text style={[s.heroPillText, { color: Colors.textMuted }]}>{DOMAIN.category}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={s.heroGrid}>
            {[
              { icon: 'attach-money', label: 'Purchase Price', value: DOMAIN.purchasePrice, color: Colors.warning  },
              { icon: 'trending-up',  label: 'Est. Value',     value: DOMAIN.estimatedValue, color: Colors.textMuted },
              { icon: 'schedule',     label: 'Minted',         value: DOMAIN.mintDate,       color: ACCENT_COLOR    },
              { icon: 'receipt',      label: 'SOL Fee',        value: DOMAIN.fee,             color: CHAIN_COLOR     },
            ].map(item => (
              <View key={item.label} style={[s.heroStat, { borderColor: item.color + '33', backgroundColor: item.color + '08' }]}>
                <MaterialIcons name={item.icon as any} size={13} color={item.color} />
                <Text style={[s.heroStatVal, { color: item.color }]}>{item.value}</Text>
                <Text style={s.heroStatLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={[s.valuationNote, { borderColor: Colors.border, backgroundColor: Colors.bgElevated }]}>
            <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
            <Text style={s.valuationNoteText}>
              Estimated value <Text style={{ fontWeight: '700' as any, color: Colors.textSecondary }}>{DOMAIN.estimatedValue}</Text> by <Text style={{ color: CHAIN_COLOR, fontWeight: '700' as any }}>{DOMAIN.estimator}</Text> · Purchase price <Text style={{ color: Colors.warning, fontWeight: '700' as any }}>{DOMAIN.purchasePrice}</Text>
            </Text>
          </View>
        </View>

        {/* ── QR CODE ────────────────────────────────────────────────────── */}
        {showQR && (
          <View style={[s.card, { borderColor: CHAIN_COLOR + '55', alignItems: 'center', gap: Spacing.md }]}>
            <SectionTitle icon="qr-code" label="Domain QR Code" color={CHAIN_COLOR} />
            <View style={[s.qrWrap, { borderColor: CHAIN_COLOR + '44' }]}>
              <QRCode
                value={DOMAIN.name}
                size={180}
                color="#000000"
                backgroundColor="#FFFFFF"
                getRef={(r: any) => { qrRef.current = r; }}
              />
            </View>
            <Text style={[s.qrLabel, { color: CHAIN_COLOR }]}>{DOMAIN.name}</Text>
            <Text style={s.qrSub}>Scan to resolve this W3 domain on Solana</Text>
            <TouchableOpacity
              style={[s.explorerBtn, { borderColor: CHAIN_COLOR + '55', backgroundColor: CHAIN_COLOR + '10' }]}
              onPress={() => { ExpoClipboard.setStringAsync(DOMAIN.name).catch(()=>{}); showAlert('Copied', '"' + DOMAIN.name + '" copied to clipboard.'); }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="content-copy" size={14} color={CHAIN_COLOR} />
              <Text style={[s.explorerBtnText, { color: CHAIN_COLOR }]}>Copy Domain Name</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── TRANSACTION SUMMARY ─────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: STATUS_COLOR + '44' }]}>
          <SectionTitle icon="receipt" label="Transaction Summary" color={STATUS_COLOR} />
          <View style={[s.txStatusStrip, { borderColor: STATUS_COLOR + '44', backgroundColor: STATUS_COLOR + '08' }]}>
            <View style={[s.txStatusIcon, { backgroundColor: STATUS_COLOR + '22', borderColor: STATUS_COLOR + '55' }]}>
              <MaterialIcons name="check-circle" size={22} color={STATUS_COLOR} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[s.txStatusLabel, { color: STATUS_COLOR }]}>{DOMAIN.txStatus}</Text>
              <Text style={s.txStatusSub}>{DOMAIN.txConfirmation}</Text>
            </View>
            <View style={[s.txVersionBadge, { backgroundColor: CHAIN_COLOR + '18', borderColor: CHAIN_COLOR + '44' }]}>
              <Text style={[s.txVersionText, { color: CHAIN_COLOR }]}>v{DOMAIN.txVersion}</Text>
            </View>
          </View>
          <CopyRow label="Signature" value={DOMAIN.txSignature} mono color={CHAIN_COLOR} />
          <CopyRow label="Fee Payer" value={DOMAIN.feePayer} mono color={Colors.textSecondary} />
          <CopyRow label="Recent Blockhash" value={DOMAIN.recentBlockhash} mono color={Colors.textMuted} />
          <View style={s.txMetaGrid}>
            {[
              { icon: 'layers',      label: 'Slot',      value: DOMAIN.slot,              color: CHAIN_COLOR },
              { icon: 'schedule',    label: 'Timestamp', value: DOMAIN.mintTimestamp,     color: Colors.textSecondary },
              { icon: 'payments',    label: 'Fee',       value: DOMAIN.fee,               color: Colors.warning },
              { icon: 'receipt-long',label: 'TX Cost',   value: DOMAIN.txCost + ' CUs',  color: Colors.textSecondary },
            ].map(item => (
              <View key={item.label} style={[s.txMetaCell, { borderColor: item.color + '33', backgroundColor: item.color + '07' }]}>
                <MaterialIcons name={item.icon as any} size={12} color={item.color} />
                <Text style={[s.txMetaVal, { color: item.color }]} numberOfLines={1}>{item.value}</Text>
                <Text style={s.txMetaLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <CUBar
            consumed={parseInt(DOMAIN.cuConsumed.replace(',', ''))}
            limit={parseInt(DOMAIN.cuLimit.replace(',', ''))}
            color={ACCENT_COLOR}
          />
        </View>

        {/* ── INSPECT TAB DETAIL ──────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: CHAIN_COLOR + '44' }]}>
          <SectionTitle icon="manage-search" label="Transaction Inspect" color={CHAIN_COLOR} />
          <View style={[s.inspectBox, { borderColor: CHAIN_COLOR + '33', backgroundColor: CHAIN_COLOR + '06' }]}>
            {[
              { label: 'Status',               value: DOMAIN.txStatus,         color: STATUS_COLOR },
              { label: 'Confirmation',          value: DOMAIN.txConfirmation,   color: STATUS_COLOR },
              { label: 'Slot',                  value: DOMAIN.slot,             color: CHAIN_COLOR  },
              { label: 'Transaction Version',   value: 'Version ' + DOMAIN.txVersion, color: Colors.textSecondary },
              { label: 'Fee',                   value: DOMAIN.fee,              color: Colors.warning },
              { label: 'Transaction Cost',      value: DOMAIN.txCost + ' CUs', color: Colors.textSecondary },
              { label: 'CUs Consumed / Limit',  value: DOMAIN.cuConsumed + ' / ' + DOMAIN.cuLimit, color: ACCENT_COLOR },
              { label: 'Timestamp',             value: DOMAIN.mintTimestamp,    color: Colors.textSecondary },
            ].map((row, i) => (
              <View key={row.label} style={[s.inspectRow, i === 7 && { borderBottomWidth: 0 }]}>
                <Text style={s.inspectLabel}>{row.label}</Text>
                <Text style={[s.inspectValue, { color: row.color }]} numberOfLines={2} selectable>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── DEFI WALLET ─────────────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: ACCENT_COLOR + '55' }]}>
          <SectionTitle icon="account-balance-wallet" label="DeFi Wallet" color={ACCENT_COLOR} />
          <View style={[s.walletCard, { borderColor: ACCENT_COLOR + '33', backgroundColor: ACCENT_COLOR + '06' }]}>
            <View style={[s.walletIconWrap, { backgroundColor: ACCENT_COLOR + '22', borderColor: ACCENT_COLOR + '55' }]}>
              <MaterialIcons name="account-balance-wallet" size={28} color={ACCENT_COLOR} />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <LiveDot color={ACCENT_COLOR} size={5} />
                <Text style={[s.walletConnected, { color: ACCENT_COLOR }]}>CONNECTED</Text>
              </View>
              <Text style={[s.walletAddr, { color: CHAIN_COLOR }]} selectable numberOfLines={1} ellipsizeMode="middle">
                {DOMAIN.defiWalletFull}
              </Text>
              <TouchableOpacity style={s.walletCopyBtn} onPress={() => { ExpoClipboard.setStringAsync(DOMAIN.defiWalletFull).catch(()=>{}); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <MaterialIcons name="content-copy" size={12} color={Colors.textMuted} />
                <Text style={s.walletCopyText}>Copy full address</Text>
              </TouchableOpacity>
            </View>
          </View>
          <CopyRow label="Full Wallet Address" value={DOMAIN.defiWalletFull} mono color={CHAIN_COLOR} />
          <View style={[s.infoNote, { borderColor: CHAIN_COLOR + '33', backgroundColor: CHAIN_COLOR + '06' }]}>
            <MaterialIcons name="info-outline" size={12} color={CHAIN_COLOR} />
            <Text style={[s.infoNoteText, { color: CHAIN_COLOR }]}>
              This wallet is the owner of the <Text style={{ fontWeight: '700' as any }}>{DOMAIN.name}</Text> domain on Solana. Keep your private keys secure.
            </Text>
          </View>
        </View>

        {/* ── SOLANA RPC LIVE LOOKUP ────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: CHAIN_COLOR + '55' }]}>

          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <View style={[s.rpcIcon, { backgroundColor: CHAIN_COLOR + '18', borderColor: CHAIN_COLOR + '44' }]}>
              <MaterialIcons name="sensors" size={18} color={CHAIN_COLOR} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rpcTitle, { color: CHAIN_COLOR }]}>Live Wallet Lookup</Text>
              <Text style={s.rpcSub}>Solana RPC · api.mainnet-beta.solana.com</Text>
            </View>
            {/* Status pill */}
            <View style={[s.rpcStatusPill, {
              backgroundColor: solStatus === 'live' ? '#22C55E18' : solStatus === 'error' ? '#EF444418' : Colors.bgElevated,
              borderColor:     solStatus === 'live' ? '#22C55E44' : solStatus === 'error' ? '#EF444444' : Colors.border,
            }]}>
              {solStatus === 'live'  && <LiveDot color="#22C55E" size={5} />}
              {solStatus === 'error' && <MaterialIcons name="error-outline" size={10} color="#EF4444" />}
              {solStatus === 'idle'  && <MaterialIcons name="cloud-queue"   size={10} color={Colors.textMuted} />}
              <Text style={[s.rpcStatusText, {
                color: solStatus === 'live' ? '#22C55E' : solStatus === 'error' ? '#EF4444' : Colors.textMuted,
              }]}>
                {solStatus === 'live' ? 'LIVE' : solStatus === 'error' ? 'ERROR' : 'IDLE'}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.rpcRefreshBtn, solLoading && { opacity: 0.5 }]}
              onPress={fetchSolanaData}
              disabled={solLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.8}
            >
              {solLoading
                ? <ActivityIndicator size="small" color={CHAIN_COLOR} />
                : <MaterialIcons name="refresh" size={16} color={CHAIN_COLOR} />}
            </TouchableOpacity>
          </View>

          {/* Fee Payer address */}
          <View style={[s.rpcAddressRow, { borderColor: CHAIN_COLOR + '33', backgroundColor: CHAIN_COLOR + '06' }]}>
            <MaterialIcons name="account-balance-wallet" size={12} color={CHAIN_COLOR} />
            <Text style={[s.rpcAddressText, { color: CHAIN_COLOR }]} selectable numberOfLines={1} ellipsizeMode="middle">
              {FEE_PAYER}
            </Text>
            <TouchableOpacity onPress={() => ExpoClipboard.setStringAsync(FEE_PAYER).catch(()=>{})} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <MaterialIcons name="content-copy" size={11} color={CHAIN_COLOR} />
            </TouchableOpacity>
          </View>

          {/* Error state */}
          {solError !== '' && (
            <View style={[s.rpcErrorCard, { borderColor: '#EF444444', backgroundColor: '#EF444410' }]}>
              <MaterialIcons name="error-outline" size={14} color="#EF4444" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#EF4444', includeFontPadding: false }}>
                  RPC Error
                </Text>
                <Text style={{ fontSize: FontSize.xs, color: '#FCA5A5', lineHeight: 15, includeFontPadding: false }}>
                  {solError}
                </Text>
                <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>
                  Solana mainnet RPC may rate-limit unauthenticated requests. Tap refresh to retry.
                </Text>
              </View>
            </View>
          )}

          {/* SOL Balance card */}
          {solBalance !== null && (
            <View style={[s.rpcBalanceCard, { borderColor: CHAIN_COLOR + '44', backgroundColor: CHAIN_COLOR + '08' }]}>
              <View style={[s.rpcBalanceIcon, { backgroundColor: CHAIN_COLOR + '22', borderColor: CHAIN_COLOR + '55' }]}>
                <Text style={{ fontSize: 26 }}>◎</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.rpcBalanceLabel}>SOL BALANCE</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={[s.rpcBalanceAmount, { color: CHAIN_COLOR }]}>
                    {solBalance.toFixed(6)}
                  </Text>
                  <Text style={[s.rpcBalanceSymbol, { color: CHAIN_COLOR }]}>SOL</Text>
                </View>
                <Text style={s.rpcBalanceSub}>
                  {(solBalance * LAMPORTS_PER_SOL).toLocaleString()} lamports
                </Text>
              </View>
              <View style={[s.rpcNetworkBadge, { backgroundColor: CHAIN_COLOR + '18', borderColor: CHAIN_COLOR + '44' }]}>
                <Text style={[s.rpcNetworkText, { color: CHAIN_COLOR }]}>MAINNET</Text>
              </View>
            </View>
          )}

          {/* Loading skeleton for balance */}
          {solLoading && solBalance === null && (
            <View style={[s.rpcBalanceCard, { borderColor: Colors.border, backgroundColor: Colors.bgElevated, gap: Spacing.sm }]}>
              <ActivityIndicator size="small" color={CHAIN_COLOR} />
              <Text style={{ fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false }}>
                Fetching balance from Solana mainnet…
              </Text>
            </View>
          )}

          {/* Recent transaction signatures */}
          {(solSigs.length > 0 || (solLoading && solSigs.length === 0)) && (
            <View style={{ gap: Spacing.sm }}>
              {/* Section label */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="history" size={13} color={ACCENT_COLOR} />
                <Text style={{ fontSize: 9, fontWeight: '800' as any, color: ACCENT_COLOR, letterSpacing: 0.8, includeFontPadding: false }}>
                  RECENT TRANSACTIONS · {FEE_PAYER.slice(0, 8)}…
                </Text>
                {solSigs.length > 0 && (
                  <View style={[s.rpcSigCount, { backgroundColor: ACCENT_COLOR + '18', borderColor: ACCENT_COLOR + '44' }]}>
                    <Text style={[s.rpcSigCountText, { color: ACCENT_COLOR }]}>{solSigs.length}</Text>
                  </View>
                )}
              </View>

              {/* Signatures loading */}
              {solLoading && solSigs.length === 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                  <ActivityIndicator size="small" color={ACCENT_COLOR} />
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>Loading transaction signatures…</Text>
                </View>
              ) : (
                <View style={[s.rpcSigList, { borderColor: CHAIN_COLOR + '33' }]}>
                  {solSigs.map((sig, idx) => {
                    const isLast   = idx === solSigs.length - 1;
                    const isMintTx = sig.signature === DOMAIN.txSignature;
                    const hasErr   = sig.err !== null;
                    const statusColor = hasErr ? '#EF4444' : '#22C55E';
                    const txDate = sig.blockTime
                      ? new Date(sig.blockTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—';

                    return (
                      <View
                        key={sig.signature}
                        style={[
                          s.rpcSigRow,
                          !isLast && { borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
                          isMintTx && { backgroundColor: CHAIN_COLOR + '08' },
                        ]}
                      >
                        <View style={[s.rpcSigDot, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                          <MaterialIcons
                            name={hasErr ? 'cancel' : 'check-circle'}
                            size={11}
                            color={statusColor}
                          />
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text
                            style={[s.rpcSigHash, { color: isMintTx ? CHAIN_COLOR : Colors.textSecondary }]}
                            selectable
                            numberOfLines={1}
                            ellipsizeMode="middle"
                          >
                            {sig.signature}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <MaterialIcons name="layers" size={9} color={Colors.textMuted} />
                              <Text style={s.rpcSigMeta}>{sig.slot.toLocaleString()}</Text>
                            </View>
                            {sig.blockTime ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <MaterialIcons name="schedule" size={9} color={Colors.textMuted} />
                                <Text style={s.rpcSigMeta}>{txDate}</Text>
                              </View>
                            ) : null}
                            {isMintTx && (
                              <View style={[s.rpcMintBadge, { backgroundColor: CHAIN_COLOR + '18', borderColor: CHAIN_COLOR + '44' }]}>
                                <Text style={[s.rpcMintBadgeText, { color: CHAIN_COLOR }]}>⚡ MINT TX</Text>
                              </View>
                            )}
                            {sig.memo ? (
                              <Text style={[s.rpcSigMeta, { color: ACCENT_COLOR }]} numberOfLines={1}>{sig.memo}</Text>
                            ) : null}
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => ExpoClipboard.setStringAsync(sig.signature).catch(()=>{})}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <MaterialIcons name="content-copy" size={11} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Last fetch time */}
          {solLastFetch && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <MaterialIcons name="cloud-done" size={10} color={Colors.textMuted} />
              <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>
                Last updated {solLastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </Text>
            </View>
          )}
        </View>

        {/* ── DOMAIN DETAILS ──────────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: CHAIN_COLOR + '44' }]}>
          <SectionTitle icon="language" label="Domain Details" color={CHAIN_COLOR} />
          <CopyRow label="Full Domain"    value={DOMAIN.name}          color={CHAIN_COLOR} />
          <CopyRow label="TLD"            value={DOMAIN.tld}           color={CHAIN_COLOR} />
          <CopyRow label="SLD"            value={DOMAIN.sld}           color={Colors.textSecondary} />
          <CopyRow label="Namespace"      value={DOMAIN.namespace}     color={Colors.textMuted} />
          <CopyRow label="Chain"          value={DOMAIN.chain}         color={CHAIN_COLOR} />
          <CopyRow label="Category"       value={DOMAIN.category}      color={Colors.textPrimary} />
          <CopyRow label="Mint Timestamp" value={DOMAIN.mintTimestamp} color={Colors.textSecondary} />
          <CopyRow label="Mint Tx"        value={DOMAIN.txSignature}   mono color={CHAIN_COLOR} />
        </View>

        {/* ── MINT RECEIPT ────────────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: Colors.warning + '44' }]}>
          <SectionTitle icon="receipt-long" label="Mint Receipt" color={Colors.warning} />
          <View style={[s.receiptBox, { borderColor: Colors.warning + '33', backgroundColor: Colors.warning + '06' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <View style={[s.receiptIcon, { backgroundColor: Colors.warning + '22', borderColor: Colors.warning + '55' }]}>
                <Text style={{ fontSize: 20 }}>⚡</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.receiptTitle, { color: Colors.warning }]}>{DOMAIN.name}</Text>
                <Text style={s.receiptSub}>Minted on {DOMAIN.mintDate}</Text>
              </View>
              <View style={[s.receiptBadge, { backgroundColor: STATUS_COLOR + '18', borderColor: STATUS_COLOR + '44' }]}>
                <Text style={[s.receiptBadgeText, { color: STATUS_COLOR }]}>✓ SUCCESS</Text>
              </View>
            </View>
            {[
              { label: 'Domain',       value: DOMAIN.name,            color: CHAIN_COLOR },
              { label: 'Chain',        value: DOMAIN.chain,           color: CHAIN_COLOR },
              { label: 'Wallet',       value: DOMAIN.defiWalletShort, color: ACCENT_COLOR },
              { label: 'Purchase',     value: DOMAIN.purchasePrice,   color: Colors.warning },
              { label: 'SOL Fee',      value: DOMAIN.fee,             color: Colors.warning },
              { label: 'Slot',         value: DOMAIN.slot,            color: Colors.textSecondary },
              { label: 'Tx Signature', value: DOMAIN.txShort,         color: Colors.textMuted, mono: true },
            ].map(row => (
              <View key={row.label} style={s.receiptRow}>
                <Text style={s.receiptRowLabel}>{row.label}</Text>
                <Text style={[s.receiptRowValue, { color: row.color }, (row as any).mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]} selectable numberOfLines={1} ellipsizeMode="middle">
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── EXPLORER LINKS ──────────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: CHAIN_COLOR + '44' }]}>
          <SectionTitle icon="open-in-new" label="Blockchain Explorer" color={CHAIN_COLOR} />
          <Text style={s.explorerDesc}>
            View this transaction on Solana blockchain explorers. Verify the mint status, fee payer, compute units, and finalization.
          </Text>
          <View style={{ gap: Spacing.sm }}>
            {[
              { name: 'Solscan',   url: DOMAIN.solscanBase + DOMAIN.txSignature,  color: '#9945FF', icon: 'search',    desc: 'Detailed Solana transaction explorer' },
              { name: 'Solana FM', url: DOMAIN.solanaFmBase + DOMAIN.txSignature, color: '#14F195', icon: 'analytics', desc: 'Solana FM multi-cluster explorer'      },
            ].map(ex => (
              <TouchableOpacity
                key={ex.name}
                style={[s.explorerCard, { borderColor: ex.color + '44', backgroundColor: ex.color + '08' }]}
                onPress={() => openExplorer(ex.url)}
                activeOpacity={0.87}
              >
                <View style={[s.explorerIconWrap, { backgroundColor: ex.color + '18', borderColor: ex.color + '44' }]}>
                  <MaterialIcons name={ex.icon as any} size={18} color={ex.color} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[s.explorerName, { color: ex.color }]}>{ex.name}</Text>
                  <Text style={s.explorerDesc2}>{ex.desc}</Text>
                </View>
                <MaterialIcons name="open-in-new" size={16} color={ex.color} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[s.explorerBtn, { borderColor: CHAIN_COLOR + '44', backgroundColor: CHAIN_COLOR + '08' }]}
              onPress={() => { ExpoClipboard.setStringAsync(DOMAIN.solscanBase + DOMAIN.txSignature).catch(()=>{}); showAlert('Copied', 'Solscan explorer URL copied to clipboard.'); }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="link" size={14} color={CHAIN_COLOR} />
              <Text style={[s.explorerBtnText, { color: CHAIN_COLOR }]}>Copy Explorer URL</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── PORTFOLIO POSITION ──────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: Colors.primary + '44' }]}>
          <SectionTitle icon="dashboard" label="Portfolio Position" color={Colors.primary} />
          <View style={s.portfolioGrid}>
            {[
              { icon: 'language',       label: 'Domain',      value: DOMAIN.name,           color: CHAIN_COLOR },
              { icon: 'layers',         label: 'Chain',       value: DOMAIN.chain,          color: CHAIN_COLOR },
              { icon: 'attach-money',   label: 'Cost Basis',  value: DOMAIN.purchasePrice,  color: Colors.warning },
              { icon: 'trending-flat',  label: 'Curr. Value', value: DOMAIN.estimatedValue, color: Colors.textMuted },
              { icon: 'category',       label: 'Category',    value: DOMAIN.category,       color: Colors.textSecondary },
              { icon: 'calendar-today', label: 'Acquired',    value: DOMAIN.mintDate,       color: Colors.success },
            ].map(item => (
              <View key={item.label} style={[s.portfolioCell, { borderColor: item.color + '33', backgroundColor: item.color + '07' }]}>
                <MaterialIcons name={item.icon as any} size={12} color={item.color} />
                <Text style={[s.portfolioCellVal, { color: item.color }]} numberOfLines={1}>{item.value}</Text>
                <Text style={s.portfolioCellLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <View style={[s.infoNote, { borderColor: Colors.primary + '33', backgroundColor: Colors.primaryGlow }]}>
            <MaterialIcons name="info-outline" size={12} color={Colors.primary} />
            <Text style={[s.infoNoteText, { color: Colors.primary }]}>
              Valuation powered by <Text style={{ fontWeight: '700' as any }}>HumbleWorth</Text>. Domain value reflects current market demand for .genesis TLD assets on Solana.
            </Text>
          </View>
        </View>

        {/* ── RELATED DOMAINS ─────────────────────────────────────────────── */}
        <View style={[s.card, { borderColor: Colors.border }]}>
          <SectionTitle icon="account-tree" label="Related Domains" color={Colors.primary} />
          <View style={{ gap: Spacing.sm }}>
            {[
              { domain: 'btng.gold',  chain: 'Polygon',    color: '#D4A017', emoji: '🥇', route: '/btng-domain'    },
              { domain: 'btng.token', chain: 'Polygon',    color: '#8247E5', emoji: '🔷', route: '/btng-domain'    },
              { domain: 'btng.gold',  chain: 'Cloudflare', color: '#F6821F', emoji: '☁️', route: '/cloudflare-dns' },
            ].map(rel => (
              <TouchableOpacity
                key={rel.domain + rel.chain}
                style={[s.relatedCard, { borderColor: rel.color + '44', backgroundColor: rel.color + '07' }]}
                onPress={() => router.push(rel.route as any)}
                activeOpacity={0.87}
              >
                <View style={[s.relatedEmoji, { backgroundColor: rel.color + '18', borderColor: rel.color + '44' }]}>
                  <Text style={{ fontSize: 18 }}>{rel.emoji}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.relatedDomain, { color: rel.color }]}>{rel.domain}</Text>
                  <Text style={s.relatedChain}>{rel.chain}</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={13} color={rel.color} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={{ fontSize: 9 }}>◎</Text>
          <Text style={s.footerText}>
            bituncoin.genesis · Solana Mainnet · Slot {DOMAIN.slot}
          </Text>
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.bg },
  topBar:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:           { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:         { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:          { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.4 },
  topSub:            { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  scroll:            { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  card:              { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },

  heroCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden' },
  heroHeader:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  heroEmoji:         { width: 68, height: 68, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  heroSolBadge:      { position: 'absolute', bottom: -3, right: -3, width: 20, height: 20, borderRadius: 10, backgroundColor: '#9945FF', borderWidth: 2, borderColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  heroDomain:        { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  heroPill:          { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  heroPillText:      { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  heroGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: Spacing.md },
  heroStat:          { flex: 1, minWidth: '44%', alignItems: 'center', gap: 5, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 3, paddingHorizontal: 8 },
  heroStatVal:       { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  heroStatLabel:     { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  valuationNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, margin: Spacing.md, marginTop: 0 },
  valuationNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },

  qrWrap:            { padding: Spacing.md, backgroundColor: '#FFFFFF', borderRadius: Radius.xl, borderWidth: 1.5, alignSelf: 'center' },
  qrLabel:           { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  qrSub:             { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  txStatusStrip:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  txStatusIcon:      { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txStatusLabel:     { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  txStatusSub:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  txVersionBadge:    { borderRadius: Radius.lg, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  txVersionText:     { fontSize: 10, fontWeight: '800' as any, includeFontPadding: false },
  txMetaGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  txMetaCell:        { flex: 1, minWidth: '44%', alignItems: 'center', gap: 4, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 3, paddingHorizontal: 6 },
  txMetaVal:         { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  txMetaLabel:       { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  inspectBox:        { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  inspectRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border + '44', gap: Spacing.sm },
  inspectLabel:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0, maxWidth: '44%' },
  inspectValue:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'right', flex: 1 },

  walletCard:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  walletIconWrap:    { width: 56, height: 56, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  walletConnected:   { fontSize: 10, fontWeight: '800' as any, letterSpacing: 0.6, includeFontPadding: false },
  walletAddr:        { fontSize: FontSize.xs, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  walletCopyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  walletCopyText:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  receiptBox:        { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 6 },
  receiptIcon:       { width: 44, height: 44, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  receiptTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  receiptSub:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  receiptBadge:      { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  receiptBadgeText:  { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  receiptRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '33', gap: Spacing.sm },
  receiptRowLabel:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  receiptRowValue:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'right', flex: 1 },

  explorerDesc:      { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  explorerCard:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  explorerIconWrap:  { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  explorerName:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  explorerDesc2:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  explorerBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 3 },
  explorerBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },

  portfolioGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  portfolioCell:     { flex: 1, minWidth: '44%', alignItems: 'center', gap: 5, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 4, paddingHorizontal: 6 },
  portfolioCellVal:  { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  portfolioCellLabel:{ fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  infoNote:          { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  infoNoteText:      { flex: 1, fontSize: FontSize.xs, lineHeight: 15, includeFontPadding: false },

  relatedCard:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  relatedEmoji:      { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  relatedDomain:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  relatedChain:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  footer:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText:        { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // ── Solana RPC ────────────────────────────────────────────────────────────
  rpcIcon:           { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rpcTitle:          { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  rpcSub:            { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  rpcStatusPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1 },
  rpcStatusText:     { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  rpcRefreshBtn:     { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rpcAddressRow:     { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.sm + 2, paddingVertical: 7 },
  rpcAddressText:    { flex: 1, fontSize: 10, fontWeight: FontWeight.semibold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  rpcErrorCard:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  rpcBalanceCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  rpcBalanceIcon:    { width: 56, height: 56, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rpcBalanceLabel:   { fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  rpcBalanceAmount:  { fontSize: 26, fontWeight: FontWeight.heavy, includeFontPadding: false },
  rpcBalanceSymbol:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  rpcBalanceSub:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  rpcNetworkBadge:   { borderRadius: Radius.lg, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, alignSelf: 'flex-start', flexShrink: 0 },
  rpcNetworkText:    { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  rpcSigCount:       { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  rpcSigCountText:   { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  rpcSigList:        { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  rpcSigRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm + 2 },
  rpcSigDot:         { width: 26, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  rpcSigHash:        { fontSize: 10, fontWeight: FontWeight.semibold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  rpcSigMeta:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  rpcMintBadge:      { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1 },
  rpcMintBadgeText:  { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
});
