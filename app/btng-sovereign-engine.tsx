/**
 * BTNG SOVEREIGN ENGINE MASTERPIECE v2.0
 * Full Triple-Key Architecture UI
 * Client Wallet | Bank Wallet | Merchant Wallet | Triple-Sign Payments
 * Auto Key Generation | Cryptographic Signing | Settlement | Audit Log
 *
 * John Kojo Zi — Bituncoin Gold Bank
 * EKUYE DIGITAL GATEWAY TRUST LTD · Reg. CS099020624
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Platform, Share, AppState, Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import {
  btngSovereignEngine,
  matchingEngine,
  povCalculator,
  stakingEngine,
  STAKING_POOLS,
  UniversalKeyManager,
  type WalletState,
  type MerchantRecord,
  type TripleSignPayment,
  type SettlementRecord,
  type AuditLogEntry,
  type InvoiceRecord,
} from '@/services/btngSovereignEngineService';
import {
  BTNG_CHAIN_REGISTRY,
  BTNG_RPC_ROUTER,
  BTNG_WALLET_ENGINE,
  BTNG_OPENAPI_SPEC,
  BTNG_OS_ARCHITECTURE,
  CHAIN_META,
  TYPE_COLORS,
  TYPE_LABELS,
  type ChainType,
} from '@/constants/btngChainRegistry';
import { useGoldOracle } from '@/hooks/useGoldOracle';

// ── Tab types ──────────────────────────────────────────────────────────────────
type EngineTab = 'overview' | 'client' | 'bank' | 'merchants' | 'payments' | 'keys' | 'audit' | 'engines' | 'chains';

// ── Chain Probe Result ────────────────────────────────────────────────────────
interface ChainProbeResult {
  chainId:    string;
  status:     'online' | 'offline' | 'slow' | 'idle';
  latency_ms: number | null;
  error:      string | null;
  block:      string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtBal(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// ── Sub-component: Status Badge ────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    ACTIVE:          { bg: Colors.successBg, color: Colors.success },
    COMPLETED:       { bg: Colors.successBg, color: Colors.success },
    SETTLED:         { bg: Colors.successBg, color: Colors.success },
    CLIENT_SIGNED:   { bg: Colors.primaryGlow, color: Colors.primary },
    BANK_SIGNED:     { bg: '#3B82F618', color: '#3B82F6' },
    MERCHANT_SIGNED: { bg: '#9945FF18', color: '#9945FF' },
    PENDING:         { bg: Colors.warningBg, color: Colors.warning },
    FAILED:          { bg: Colors.errorBg, color: Colors.error },
    SUSPENDED:       { bg: Colors.errorBg, color: Colors.error },
    ARCHIVED:        { bg: Colors.bgElevated, color: Colors.textMuted },
  };
  const c = cfg[status] ?? { bg: Colors.bgElevated, color: Colors.textMuted };
  return (
    <View style={[sb.badge, { backgroundColor: c.bg }]}>
      <Text style={[sb.text, { color: c.color }]}>{status}</Text>
    </View>
  );
}
const sb = StyleSheet.create({
  badge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  text:  { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
});

// ── Sub-component: Key Display Row ─────────────────────────────────────────────
function KeyRow({ label, value, icon, color = Colors.primary }: { label: string; value: string; icon: string; color?: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity style={kr.row} onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
      <View style={[kr.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={14} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={kr.label}>{label}</Text>
        <Text style={[kr.value, { color }]} numberOfLines={expanded ? undefined : 1}>
          {expanded ? value : UniversalKeyManager.maskKey(value, 16)}
        </Text>
      </View>
      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={14} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}
const kr = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  iconWrap: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, letterSpacing: 0.5, includeFontPadding: false },
  value:    { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 14 },
});

// ── Sub-component: Section Card ────────────────────────────────────────────────
function Card({ title, icon, color, children, badge, action }: { title: string; icon: string; color: string; children: React.ReactNode; badge?: string; action?: React.ReactNode }) {
  return (
    <View style={[sc.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={sc.header}>
        <View style={[sc.iconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <MaterialIcons name={icon as any} size={16} color={color} />
        </View>
        <Text style={sc.title}>{title}</Text>
        {badge ? (
          <View style={[sc.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
            <Text style={[sc.badgeText, { color }]}>{badge}</Text>
          </View>
        ) : null}
        {action ?? null}
      </View>
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  header:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:{ width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:   { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  badge:   { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function BtngSovereignEngineScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { showAlert } = useAlert();

  const [tab, setTab]               = useState<EngineTab>('overview');
  const { priceUSD: goldPriceUSD, sparkline } = useGoldOracle();
  const [matchStats, setMatchStats]  = useState({ totalOrders: 0, openOrders: 0, totalTrades: 0, assets: [] as string[] });
  const [povMetrics, setPovMetrics]  = useState<ReturnType<typeof povCalculator.calculate> | null>(null);
  const [stakingStats, setStakingStats] = useState({ totalTVL: 0, avgAPY: 0, activePools: 0 });
  const [loading, setLoading]       = useState(true);
  const [initDone, setInitDone]     = useState(false);
  const [isNewWallet, setIsNewWallet] = useState(false);

  // Form states
  const [clientName, setClientName] = useState('BTNG Sovereign Client');
  const [password, setPassword]     = useState('BTNG2026secure');
  const [showPw, setShowPw]         = useState(false);

  // Live data
  const [status, setStatus]         = useState<ReturnType<typeof btngSovereignEngine.getSystemStatus> | null>(null);
  const [merchants, setMerchants]   = useState<MerchantRecord[]>([]);
  const [payments, setPayments]     = useState<TripleSignPayment[]>([]);
  const [auditLog, setAuditLog]     = useState<AuditLogEntry[]>([]);
  const [allKeys, setAllKeys]       = useState<ReturnType<typeof btngSovereignEngine.getAllPublicKeys> | null>(null);

  // Payment form
  const [payAmount, setPayAmount]     = useState('10');
  const [payMerchantId, setPayMerchantId] = useState('');
  const [payDesc, setPayDesc]         = useState('Purchase');
  const [payPw, setPayPw]             = useState('BTNG2026secure');
  const [currentPayment, setCurrentPayment] = useState<TripleSignPayment | null>(null);
  const [payProcessing, setPayProcessing] = useState(false);

  // Merchant form
  const [newMerchantName, setNewMerchantName] = useState('');
  const [newMerchantCat, setNewMerchantCat]   = useState('General');

  // Invoice form
  const [invMerchantId, setInvMerchantId] = useState('');
  const [invAmount, setInvAmount]         = useState('5');
  const [invDesc, setInvDesc]             = useState('BTNG Service');
  const [latestInvoice, setLatestInvoice] = useState<InvoiceRecord | null>(null);

  // Chain probe state
  const [probeResults,  setProbeResults]  = useState<Record<string, ChainProbeResult>>({});
  const [probing,       setProbing]       = useState(false);
  const [probingChain,  setProbingChain]  = useState<string | null>(null);
  const probeAbortRef   = useRef<AbortController | null>(null);
  const hasAutoProbed   = useRef(false);
  const [autoProbing,   setAutoProbing]   = useState(false);
  const [chainFilter,   setChainFilter]   = useState<ChainType | 'all'>('all');
  // Chain detail modal
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [copiedField,     setCopiedField]     = useState<string | null>(null);
  const [compareSet,      setCompareSet]      = useState<string[]>([]);
  // Keep a stable ref to the current tab so the AppState listener can read it
  // without being re-subscribed on every tab change.
  const tabRef          = useRef<EngineTab>(tab);
  const probingRef      = useRef(false);

  // ── Compare set toggle ────────────────────────────────────────────────────
  const toggleCompare = useCallback((chainId: string) => {
    setCompareSet(prev => {
      if (prev.includes(chainId)) return prev.filter(id => id !== chainId);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, chainId];
    });
  }, []);

  // ── Export probe results ────────────────────────────────────────────────────
  const exportProbeResults = useCallback(async () => {
    const exportedAt = new Date().toISOString();
    const rows = CHAIN_META.map(chain => {
      const ep    = BTNG_CHAIN_REGISTRY.chains[chain.id];
      const probe = probeResults[chain.id] ?? null;
      return {
        chain_id:     chain.id,
        chain_name:   chain.label,
        ticker:       chain.ticker,
        vm_type:      chain.type,
        status:       probe?.status ?? 'not_probed',
        latency_ms:   probe?.latency_ms ?? null,
        block_number: probe?.block ?? null,
        endpoint_url: ep?.mainnet ?? null,
        error:        probe?.error ?? null,
      };
    });
    const summary = {
      exported_at:   exportedAt,
      node:          '154.161.183.158',
      total_chains:  rows.length,
      online:        rows.filter(r => r.status === 'online' || r.status === 'slow').length,
      slow:          rows.filter(r => r.status === 'slow').length,
      offline:       rows.filter(r => r.status === 'offline').length,
      not_probed:    rows.filter(r => r.status === 'not_probed').length,
      avg_latency_ms: (() => {
        const vals = rows.filter(r => r.latency_ms !== null).map(r => r.latency_ms as number);
        return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      })(),
      chains: rows,
    };
    const jsonStr = JSON.stringify(summary, null, 2);
    try {
      await Share.share({
        message: jsonStr,
        title:   `BTNG Chain Probe Report — ${exportedAt.slice(0, 10)}`,
      });
    } catch { /* user cancelled */ }
  }, [probeResults]);

  // ── Single-chain probe ──────────────────────────────────────────────────────
  const probeSingleChain = useCallback(async (chainId: string) => {
    const ep = BTNG_CHAIN_REGISTRY.chains[chainId];
    if (!ep || probingChain === chainId) return;

    const RPC_BODIES: Record<ChainType, object> = {
      evm:    { jsonrpc: '2.0', method: 'eth_blockNumber',                      params: [], id: 1 },
      solana: { jsonrpc: '2.0', method: 'getHealth',                            params: [], id: 1 },
      move:   { jsonrpc: '2.0', method: 'sui_getLatestCheckpointSequenceNumber', params: [], id: 1 },
      utxo:   { jsonrpc: '2.0', method: 'getblockcount',                        params: [], id: 1 },
      cairo:  { jsonrpc: '2.0', method: 'starknet_blockNumber',                 params: [], id: 1 },
      custom: { jsonrpc: '2.0', method: 'eth_blockNumber',                      params: [], id: 1 },
    };

    setProbingChain(chainId);
    // Mark as probing immediately for instant UI feedback
    setProbeResults(prev => ({
      ...prev,
      [chainId]: { chainId, status: 'idle', latency_ms: null, error: null, block: null },
    }));

    const t0 = Date.now();
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    try {
      const body = RPC_BODIES[ep.type] ?? RPC_BODIES.evm;
      const res  = await fetch(ep.mainnet, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
      clearTimeout(tid);
      const latency_ms = Date.now() - t0;
      let block: string | null = null;
      try {
        const json = await res.json();
        const raw  = json?.result;
        if (raw !== undefined && raw !== null) {
          block = typeof raw === 'string' && raw.startsWith('0x')
            ? String(parseInt(raw, 16))
            : String(raw).slice(0, 24);
        }
      } catch { /* ignore */ }
      setProbeResults(prev => ({
        ...prev,
        [chainId]: {
          chainId,
          status:     res.ok ? (latency_ms > 3500 ? 'slow' : 'online') : 'offline',
          latency_ms,
          error:      res.ok ? null : `HTTP ${res.status}`,
          block,
        },
      }));
    } catch (err: any) {
      clearTimeout(tid);
      const isAbort = err?.name === 'AbortError';
      setProbeResults(prev => ({
        ...prev,
        [chainId]: {
          chainId,
          status:     'offline',
          latency_ms: Date.now() - t0,
          error:      isAbort ? 'Timeout (8s)' : (err?.message ?? 'Network error'),
          block:      null,
        },
      }));
    } finally {
      setProbingChain(null);
    }
  }, [probingChain]);

  // Keep tabRef + probingRef in sync with state
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { probingRef.current = probing; }, [probing]);

  // ── AppState listener: re-probe when app returns to foreground on Chains tab
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (
        nextState === 'active' &&
        tabRef.current === 'chains' &&
        !probingRef.current
      ) {
        probeAllChains();
      }
    });
    return () => subscription.remove();
  }, [probeAllChains]);

  // ── Auto-probe: fire once the first time user opens Chains tab ──────────
  useEffect(() => {
    if (tab === 'chains' && !hasAutoProbed.current) {
      hasAutoProbed.current = true;
      setAutoProbing(true);
      probeAllChains();
    }
  }, [tab, probeAllChains]);

  // Clear the auto-probe banner when probing finishes
  useEffect(() => {
    if (!probing && autoProbing) {
      const t = setTimeout(() => setAutoProbing(false), 600);
      return () => clearTimeout(t);
    }
  }, [probing, autoProbing]);

  const probeAllChains = useCallback(async () => {
    // Cancel any in-flight probe
    probeAbortRef.current?.abort();
    probeAbortRef.current = new AbortController();
    const signal = probeAbortRef.current.signal;

    setProbing(true);
    setProbeResults({});

    const RPC_BODIES: Record<ChainType, object> = {
      evm:    { jsonrpc: '2.0', method: 'eth_blockNumber',                           params: [],     id: 1 },
      solana: { jsonrpc: '2.0', method: 'getHealth',                                 params: [],     id: 1 },
      move:   { jsonrpc: '2.0', method: 'sui_getLatestCheckpointSequenceNumber',      params: [],     id: 1 },
      utxo:   { jsonrpc: '2.0', method: 'getblockcount',                             params: [],     id: 1 },
      cairo:  { jsonrpc: '2.0', method: 'starknet_blockNumber',                      params: [],     id: 1 },
      custom: { jsonrpc: '2.0', method: 'eth_blockNumber',                           params: [],     id: 1 },
    };

    const entries = Object.entries(BTNG_CHAIN_REGISTRY.chains) as [string, import('@/constants/btngChainRegistry').ChainEndpoint][];

    await Promise.all(
      entries.map(async ([chainId, ep]) => {
        const url  = ep.mainnet;
        const body = RPC_BODIES[ep.type] ?? RPC_BODIES.evm;
        const t0   = Date.now();
        try {
          const tid = setTimeout(() => probeAbortRef.current?.abort(), 8000);
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body:    JSON.stringify(body),
            signal,
          });
          clearTimeout(tid);
          const latency_ms = Date.now() - t0;
          let block: string | null = null;
          try {
            const json = await res.json();
            const raw  = json?.result;
            if (raw !== undefined && raw !== null) {
              block = typeof raw === 'string' && raw.startsWith('0x')
                ? String(parseInt(raw, 16))
                : String(raw).slice(0, 24);
            }
          } catch { /* ignore parse errors */ }
          setProbeResults(prev => ({
            ...prev,
            [chainId]: {
              chainId,
              status:     res.ok ? (latency_ms > 3500 ? 'slow' : 'online') : 'offline',
              latency_ms,
              error:      res.ok ? null : `HTTP ${res.status}`,
              block,
            },
          }));
        } catch (err: any) {
          const isAbort = err?.name === 'AbortError';
          setProbeResults(prev => ({
            ...prev,
            [chainId]: {
              chainId,
              status:     'offline',
              latency_ms: Date.now() - t0,
              error:      isAbort ? 'Timeout (8s)' : (err?.message ?? 'Network error'),
              block:      null,
            },
          }));
        }
      })
    );
    setProbing(false);
  }, []);

  // Animation
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const refreshData = useCallback(async () => {
    setStatus(btngSovereignEngine.getSystemStatus());
    setMerchants(btngSovereignEngine.merchantEngine.getAll());
    setPayments(btngSovereignEngine.tripleEngine?.getAllPayments() ?? []);
    setAuditLog(btngSovereignEngine.auditLogger.getAll().slice(0, 40));
    setAllKeys(btngSovereignEngine.getAllPublicKeys());
    // New engines
    await matchingEngine.load();
    setMatchStats(matchingEngine.getStats());
    await stakingEngine.load();
    setStakingStats(stakingEngine.getPoolStats());
    if (goldPriceUSD > 0) {
      const vol = 250_000;
      setPovMetrics(povCalculator.calculate(goldPriceUSD, 8_400_000, vol));
    }
  }, [goldPriceUSD]);

  const handleInit = useCallback(async () => {
    if (!clientName.trim() || password.length < 6) {
      showAlert('Required', 'Enter a name and a password of at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const result = await btngSovereignEngine.initialize(clientName, password);
      setIsNewWallet(result.isNewWallet);
      setInitDone(true);
      refreshData();
      // Pre-fill merchant selector
      const mList = btngSovereignEngine.merchantEngine.getAll();
      if (mList.length > 0) {
        setPayMerchantId(mList[0].merchantId);
        setInvMerchantId(mList[0].merchantId);
      }
    } catch (e: any) {
      showAlert('Init Error', e?.message ?? 'Initialization failed.');
    }
    setLoading(false);
  }, [clientName, password, showAlert, refreshData]);

  // ── PAYMENT FLOW ─────────────────────────────────────────────────────────────
  const handleStep1ClientSign = useCallback(() => {
    if (!payAmount || parseFloat(payAmount) <= 0) { showAlert('Error', 'Enter a valid amount.'); return; }
    if (!payMerchantId) { showAlert('Error', 'Select a merchant.'); return; }

    const result = btngSovereignEngine.tripleEngine.initiatePayment(
      parseFloat(payAmount), payMerchantId, payDesc, payPw
    );
    if (result.error) { showAlert('Step 1 Failed', result.error); return; }
    setCurrentPayment(result.payment);
    refreshData();
    setPayments(btngSovereignEngine.tripleEngine.getAllPayments());
  }, [payAmount, payMerchantId, payDesc, payPw, showAlert, refreshData]);

  const handleStep2BankSign = useCallback(async (paymentId: string) => {
    setPayProcessing(true);
    const result = await btngSovereignEngine.tripleEngine.addBankSignature(paymentId);
    setPayProcessing(false);
    if (result.error) { showAlert('Step 2 Failed', result.error); return; }
    setCurrentPayment(result.payment);
    refreshData();
    setPayments(btngSovereignEngine.tripleEngine.getAllPayments());
    await btngSovereignEngine.auditLogger.log('BANK_SIGNED', 'PAYMENT', paymentId, `Bank signed payment ${paymentId}`);
  }, [showAlert, refreshData]);

  const handleStep3Complete = useCallback(async (paymentId: string) => {
    setPayProcessing(true);
    const result = await btngSovereignEngine.tripleEngine.addMerchantSignatureAndComplete(paymentId);
    setPayProcessing(false);
    if (result.error) { showAlert('Step 3 Failed', result.error); return; }
    setCurrentPayment(result.payment);
    refreshData();
    setPayments(btngSovereignEngine.tripleEngine.getAllPayments());
    await btngSovereignEngine.auditLogger.log('PAYMENT_COMPLETED', 'PAYMENT', paymentId, `Triple-sign payment completed: ${result.payment.amount} BTNGG`);
    showAlert('Payment Complete!', `${result.payment.amount} BTNGG sent to ${result.payment.merchantName}\n\nAll 3 signatures collected:\nClient ✓\nBank ✓\nMerchant ✓`);
  }, [showAlert, refreshData]);

  // ── MERCHANT CREATION ─────────────────────────────────────────────────────────
  const handleAddMerchant = useCallback(async () => {
    if (!newMerchantName.trim()) { showAlert('Required', 'Enter merchant name.'); return; }
    setLoading(true);
    try {
      const m = await btngSovereignEngine.registerMerchant(newMerchantName, newMerchantCat);
      refreshData();
      setNewMerchantName('');
      const mList = btngSovereignEngine.merchantEngine.getAll();
      setPayMerchantId(m.merchantId);
      setInvMerchantId(m.merchantId);
      showAlert('Merchant Registered', `${m.name}\nPublic Key generated automatically:\n${UniversalKeyManager.maskKey(m.wallet.keyPair.publicKey, 20)}`);
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Registration failed.');
    }
    setLoading(false);
  }, [newMerchantName, newMerchantCat, showAlert, refreshData]);

  // ── INVOICE CREATION ──────────────────────────────────────────────────────────
  const handleCreateInvoice = useCallback(() => {
    if (!invMerchantId) { showAlert('Error', 'Select a merchant.'); return; }
    const inv = btngSovereignEngine.merchantEngine.createInvoice(invMerchantId, parseFloat(invAmount) || 5, invDesc);
    if (!inv) { showAlert('Error', 'Could not create invoice.'); return; }
    setLatestInvoice(inv);
    refreshData();
    showAlert('Invoice Created', `ID: ${inv.invoiceId.slice(0, 16)}…\nAmount: ${inv.amount} BTNGG\nExpires: ${fmtDate(inv.expiresAt)}`);
  }, [invMerchantId, invAmount, invDesc, showAlert, refreshData]);

  // ── WALLET RESET ──────────────────────────────────────────────────────────────
  const handleResetClient = useCallback(() => {
    showAlert('Reset Client Wallet', 'This will generate NEW KEYS and archive the current wallet. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
        setLoading(true);
        try {
          const w = await btngSovereignEngine.resetClientWallet(password, clientName);
          refreshData();
          showAlert('Wallet Reset', `New Wallet ID: ${w.id.slice(0, 16)}…\nNew Public Key Generated Automatically`);
        } catch (e: any) {
          showAlert('Error', e?.message ?? 'Reset failed.');
        }
        setLoading(false);
      }},
    ]);
  }, [password, clientName, showAlert, refreshData]);

  const handleResetBank = useCallback(() => {
    showAlert('Reset Bank System', 'Generate new BANK keys? This archives current bank wallet.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'RESET BANK', style: 'destructive', onPress: async () => {
        setLoading(true);
        const w = await btngSovereignEngine.resetBankSystem();
        refreshData();
        setLoading(false);
        showAlert('Bank Reset', `New Bank Public Key:\n${UniversalKeyManager.maskKey(w.keyPair.publicKey, 20)}\nBalance: 10,000,000 BTNGG`);
      }},
    ]);
  }, [showAlert, refreshData]);

  // ── INIT SCREEN ───────────────────────────────────────────────────────────────
  if (!initDone) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.topTitle}>Sovereign Engine v2.0</Text>
            <Text style={s.topSub}>BTNG Masterpiece — Triple-Key Architecture</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {/* Hero */}
          <View style={s.heroCard}>
            <View style={s.heroStarRow}>
              {['⭐','⭐','⭐','⭐','⭐'].map((_, i) => <Text key={i} style={{ fontSize: 18 }}>⭐</Text>)}
            </View>
            <Text style={s.heroTitle}>BTNG SOVEREIGN ENGINE</Text>
            <Text style={s.heroVersion}>MASTERPIECE v2.0</Text>
            <Text style={s.heroSubtitle}>Complete Crypto Banking + Mobile Payment System</Text>

            <View style={s.heroTagRow}>
              {['Client Wallet', 'Bank Wallet', 'Merchant Wallet', 'Triple-Key', 'Auto KeyGen', 'Settlement'].map(t => (
                <View key={t} style={s.heroTag}>
                  <Text style={s.heroTagText}>{t}</Text>
                </View>
              ))}
            </View>

            {/* Architecture diagram */}
            <View style={s.archDiagram}>
              {[
                { icon: 'person', label: 'Client', sub: 'Auto Keys', color: '#22C55E', step: '1' },
                { icon: 'arrow-forward', label: '', sub: '', color: Colors.textMuted, step: '' },
                { icon: 'account-balance', label: 'Bank', sub: 'Auto Keys', color: Colors.primary, step: '2' },
                { icon: 'arrow-forward', label: '', sub: '', color: Colors.textMuted, step: '' },
                { icon: 'store', label: 'Merchant', sub: 'Auto Keys', color: '#9945FF', step: '3' },
              ].map((node, i) => (
                node.label ? (
                  <View key={i} style={s.archNode}>
                    <View style={[s.archIconWrap, { backgroundColor: node.color + '18', borderColor: node.color + '44' }]}>
                      <MaterialIcons name={node.icon as any} size={22} color={node.color} />
                      {node.step ? (
                        <View style={[s.archStep, { backgroundColor: node.color }]}>
                          <Text style={s.archStepText}>{node.step}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[s.archLabel, { color: node.color }]}>{node.label}</Text>
                    <Text style={s.archSub}>{node.sub}</Text>
                  </View>
                ) : (
                  <MaterialIcons key={i} name="arrow-forward" size={20} color={Colors.textMuted} style={{ marginTop: 12 }} />
                )
              ))}
            </View>
          </View>

          {/* Init form */}
          <View style={s.initCard}>
            <View style={s.initHeader}>
              <MaterialIcons name="vpn-key" size={20} color={Colors.warning} />
              <Text style={s.initTitle}>Initialize Sovereign Engine</Text>
            </View>
            <Text style={s.initDesc}>
              Creates your Client Wallet, loads the BTNG Bank System, and auto-generates Ed25519-style key pairs for all entities.
            </Text>

            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>Your Name / Wallet Label</Text>
              <TextInput
                style={s.input}
                value={clientName}
                onChangeText={setClientName}
                placeholder="BTNG Sovereign Client"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>Master Password (min 6 chars)</Text>
              <View style={s.pwRow}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={s.pwToggle} onPress={() => setShowPw(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name={showPw ? 'visibility' : 'visibility-off'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[s.initBtn, loading && { opacity: 0.6 }]}
              onPress={handleInit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.bg} />
              ) : (
                <MaterialIcons name="rocket-launch" size={18} color={Colors.bg} />
              )}
              <Text style={s.initBtnText}>{loading ? 'Initializing…' : 'Launch Sovereign Engine'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  // ── MAIN UI ───────────────────────────────────────────────────────────────────
  const TABS: { id: EngineTab; icon: string; label: string }[] = [
    { id: 'overview',  icon: 'dashboard',            label: 'System'    },
    { id: 'client',    icon: 'person',               label: 'Client'    },
    { id: 'bank',      icon: 'account-balance',      label: 'Bank'      },
    { id: 'merchants', icon: 'store',                label: 'Merchants' },
    { id: 'payments',  icon: 'payments',             label: 'Payments'  },
    { id: 'keys',      icon: 'vpn-key',              label: 'Keys'      },
    { id: 'audit',     icon: 'manage-search',        label: 'Audit'     },
    { id: 'engines',   icon: 'memory',               label: 'Engines'   },
    { id: 'chains',    icon: 'device-hub',           label: 'Chains'    },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={s.topTitleRow}>
            <Text style={s.topTitle}>Sovereign Engine</Text>
            <View style={s.liveBadge}>
              <Animated.View style={[s.liveDot, { opacity: pulseAnim }]} />
              <Text style={s.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={s.topSub}>Triple-Key Architecture v2.0 · {status?.client?.name ?? ''}</Text>
        </View>
        <TouchableOpacity
          style={s.refreshBtn}
          onPress={refreshData}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="refresh" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* New wallet banner */}
      {isNewWallet && (
        <View style={s.newWalletBanner}>
          <MaterialIcons name="celebration" size={14} color={Colors.success} />
          <Text style={s.newWalletText}>New wallet created! 1,000 BTNGG welcome bonus added.</Text>
        </View>
      )}

      {/* Tab Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScrollWrap}
        contentContainerStyle={s.tabScrollContent}
      >
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[s.tabBtn, tab === t.id && s.tabBtnActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={12} color={tab === t.id ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.id && { color: Colors.bg }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Compare Bar ── */}
      {compareSet.length > 0 && tab === 'chains' && (() => {
        const cols = compareSet.map(id => {
          const chain = CHAIN_META.find(c => c.id === id)!;
          const ep    = BTNG_CHAIN_REGISTRY.chains[id];
          const probe = probeResults[id] ?? null;
          const color = TYPE_COLORS[chain?.type ?? 'evm'];
          const probeColor = !probe ? Colors.textMuted
            : probe.status === 'online' ? '#22C55E'
            : probe.status === 'slow'   ? '#F59E0B'
            : '#EF4444';
          return { chain, ep, probe, color, probeColor };
        });
        return (
          <View style={[cmp.bar, { paddingBottom: insets.bottom + 8 }]}>
            {/* Header row */}
            <View style={cmp.barHeader}>
              <View style={cmp.barTitleRow}>
                <MaterialIcons name="compare" size={14} color={Colors.primary} />
                <Text style={cmp.barTitle}>Chain Comparison</Text>
                <View style={cmp.barCountBadge}>
                  <Text style={cmp.barCountText}>{compareSet.length}/3</Text>
                </View>
              </View>
              <TouchableOpacity
                style={cmp.clearBtn}
                onPress={() => setCompareSet([])}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                <Text style={cmp.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>

            {/* Column headers */}
            <View style={cmp.tableHead}>
              <View style={cmp.rowLabel} />
              {cols.map(({ chain }) => (
                <View key={chain.id} style={cmp.colHead}>
                  <Text style={{ fontSize: 18 } as any}>{chain.emoji}</Text>
                  <Text style={[cmp.colName, { color: chain.color }]} numberOfLines={1}>
                    {chain.label}
                  </Text>
                  <TouchableOpacity
                    style={cmp.colRemoveBtn}
                    onPress={() => setCompareSet(prev => prev.filter(id => id !== chain.id))}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <MaterialIcons name="remove-circle-outline" size={11} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* VM Type row */}
            <View style={cmp.tableRow}>
              <Text style={cmp.rowLabel}>VM</Text>
              {cols.map(({ chain, color }) => (
                <View key={chain.id} style={[cmp.cell, { backgroundColor: color + '12', borderColor: color + '33' }]}>
                  <Text style={[cmp.cellText, { color }]} numberOfLines={1}>
                    {TYPE_LABELS[chain.type]}
                  </Text>
                </View>
              ))}
            </View>

            {/* Latency row */}
            <View style={cmp.tableRow}>
              <Text style={cmp.rowLabel}>Latency</Text>
              {cols.map(({ chain, probe, probeColor }) => (
                <View key={chain.id} style={[cmp.cell, probe ? { backgroundColor: probeColor + '10', borderColor: probeColor + '33' } : { borderColor: Colors.border }]}>
                  <Text style={[cmp.cellText, { color: probeColor }]} numberOfLines={1}>
                    {!probe ? 'N/A' : probe.status === 'offline' ? 'offline' : `${probe.latency_ms}ms`}
                  </Text>
                </View>
              ))}
            </View>

            {/* Block row */}
            <View style={cmp.tableRow}>
              <Text style={cmp.rowLabel}>Block</Text>
              {cols.map(({ chain, probe, probeColor }) => (
                <View key={chain.id} style={cmp.cell}>
                  <Text style={[cmp.cellText, { color: probe?.block ? probeColor : Colors.textMuted }]} numberOfLines={1}>
                    {probe?.block ? `#${probe.block}` : '—'}
                  </Text>
                </View>
              ))}
            </View>

            {/* Endpoint row */}
            <View style={cmp.tableRow}>
              <Text style={cmp.rowLabel}>Endpoint</Text>
              {cols.map(({ chain, ep }) => (
                <View key={chain.id} style={cmp.cell}>
                  <Text style={[cmp.cellText, { color: Colors.textMuted, fontSize: 8 }]} numberOfLines={2}>
                    {ep?.mainnet?.replace('https://', '').slice(0, 28) ?? '—'}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={cmp.hint}>Long-press chain rows to add/remove · max 3</Text>
          </View>
        );
      })()}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── OVERVIEW TAB ── */}
        {tab === 'overview' && status && (
          <>
            {/* System Status Card */}
            <Card title="System Status" icon="dashboard" color={Colors.primary} badge="INITIALIZED">
              <View style={s.statGrid}>
                {[
                  { label: 'Client Balance',  val: `${fmtBal(status.client?.balance ?? 0)} BTNGG`, color: Colors.primary },
                  { label: 'Bank Balance',    val: `${(status.bank.balance / 1_000_000).toFixed(2)}M BTNGG`, color: Colors.warning },
                  { label: 'Merchants',       val: String(status.merchants.active),  color: '#22C55E' },
                  { label: 'Payments',        val: String(payments.length),          color: '#3B82F6' },
                  { label: 'Pending',         val: String(status.pendingPayments),   color: Colors.warning },
                  { label: 'Audit Entries',   val: String(status.auditEntries),      color: '#9945FF' },
                ].map(stat => (
                  <View key={stat.label} style={[s.statCard, { borderColor: stat.color + '44' }]}>
                    <Text style={[s.statVal, { color: stat.color }]}>{stat.val}</Text>
                    <Text style={s.statLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* Triple Architecture */}
            <Card title="Triple-Key Architecture" icon="security" color="#3B82F6">
              {[
                { icon: 'person',           label: 'Client Wallet',       key: UniversalKeyManager.maskKey(status.client?.publicKey ?? '', 14), color: '#22C55E', bal: `${fmtBal(status.client?.balance ?? 0)} BTNGG`, status: 'ACTIVE' },
                { icon: 'account-balance',  label: 'BTNG Bank System',    key: UniversalKeyManager.maskKey(status.bank.publicKey, 14),           color: Colors.primary, bal: `${(status.bank.balance / 1_000_000).toFixed(2)}M BTNGG`, status: 'ACTIVE' },
                ...status.merchants.list.slice(0, 3).map(m => ({
                  icon: 'store' as string,
                  label: m.name,
                  key:   UniversalKeyManager.maskKey(btngSovereignEngine.merchantEngine.get(m.id)?.wallet.keyPair.publicKey ?? '', 14),
                  color: '#9945FF',
                  bal:   `${fmtBal(m.balance)} BTNGG`,
                  status: 'ACTIVE' as string,
                })),
              ].map((entity, i) => (
                <View key={i} style={s.entityRow}>
                  <View style={[s.entityIconWrap, { backgroundColor: entity.color + '18', borderColor: entity.color + '44' }]}>
                    <MaterialIcons name={entity.icon as any} size={16} color={entity.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.entityLabel, { color: entity.color }]}>{entity.label}</Text>
                    <Text style={s.entityKey}>{entity.key}</Text>
                    <Text style={s.entityBal}>{entity.bal}</Text>
                  </View>
                  <StatusBadge status={entity.status} />
                </View>
              ))}
            </Card>

            {/* Quick Triple-Pay */}
            <Card title="Quick Triple-Sign Payment" icon="payments" color="#22C55E" badge="3-STEP">
              <Text style={s.infoText}>Step 1 → Client signs · Step 2 → Bank signs · Step 3 → Merchant signs + settle</Text>

              {/* Amount + merchant */}
              <View style={s.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Amount (BTNGG)</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={payAmount}
                    onChangeText={setPayAmount}
                    keyboardType="decimal-pad"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={s.fieldLabel}>Merchant</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {merchants.filter(m => m.active).map(m => (
                      <TouchableOpacity
                        key={m.merchantId}
                        style={[s.merchantChip, payMerchantId === m.merchantId && s.merchantChipActive]}
                        onPress={() => setPayMerchantId(m.merchantId)}
                      >
                        <Text style={[s.merchantChipText, payMerchantId === m.merchantId && { color: Colors.bg }]} numberOfLines={1}>
                          {m.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={s.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Description</Text>
                  <TextInput style={s.fieldInput} value={payDesc} onChangeText={setPayDesc} placeholderTextColor={Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Password</Text>
                  <TextInput style={s.fieldInput} value={payPw} onChangeText={setPayPw} secureTextEntry placeholderTextColor={Colors.textMuted} />
                </View>
              </View>

              {/* Steps */}
              <View style={s.stepsRow}>
                {[
                  { step: 1, label: 'Client Sign', icon: 'person',          color: '#22C55E', done: !!currentPayment },
                  { step: 2, label: 'Bank Sign',   icon: 'account-balance', color: Colors.primary, done: currentPayment?.status === 'BANK_SIGNED' || currentPayment?.status === 'COMPLETED' },
                  { step: 3, label: 'Settle',      icon: 'store',           color: '#9945FF', done: currentPayment?.status === 'COMPLETED' },
                ].map((step, i, arr) => (
                  <React.Fragment key={step.step}>
                    <View style={s.stepNode}>
                      <View style={[s.stepCircle, step.done ? { backgroundColor: step.color } : { borderColor: step.color + '66', borderWidth: 2 }]}>
                        {step.done ? (
                          <MaterialIcons name="check" size={14} color="#fff" />
                        ) : (
                          <Text style={[s.stepNum, { color: step.color }]}>{step.step}</Text>
                        )}
                      </View>
                      <Text style={[s.stepLabel, { color: step.done ? step.color : Colors.textMuted }]}>{step.label}</Text>
                    </View>
                    {i < arr.length - 1 && <View style={[s.stepConnector, (currentPayment && i === 0 && (currentPayment.status === 'BANK_SIGNED' || currentPayment.status === 'COMPLETED')) || (currentPayment?.status === 'COMPLETED' && i === 1) ? { backgroundColor: arr[i + 1].color } : {}]} />}
                  </React.Fragment>
                ))}
              </View>

              {/* Action buttons */}
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#22C55E' }, !!currentPayment && { opacity: 0.4 }]}
                onPress={handleStep1ClientSign}
                disabled={!!currentPayment}
                activeOpacity={0.85}
              >
                <MaterialIcons name="person" size={15} color="#fff" />
                <Text style={s.actionBtnText}>Step 1 — Client Sign</Text>
              </TouchableOpacity>

              {currentPayment && currentPayment.status === 'CLIENT_SIGNED' && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: Colors.primary }, payProcessing && { opacity: 0.5 }]}
                  onPress={() => handleStep2BankSign(currentPayment.paymentId)}
                  disabled={payProcessing}
                  activeOpacity={0.85}
                >
                  {payProcessing ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="account-balance" size={15} color="#fff" />}
                  <Text style={s.actionBtnText}>Step 2 — Bank Sign</Text>
                </TouchableOpacity>
              )}

              {currentPayment && currentPayment.status === 'BANK_SIGNED' && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#9945FF' }, payProcessing && { opacity: 0.5 }]}
                  onPress={() => handleStep3Complete(currentPayment.paymentId)}
                  disabled={payProcessing}
                  activeOpacity={0.85}
                >
                  {payProcessing ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="store" size={15} color="#fff" />}
                  <Text style={s.actionBtnText}>Step 3 — Merchant Sign & Settle</Text>
                </TouchableOpacity>
              )}

              {currentPayment && currentPayment.status === 'COMPLETED' && (
                <View style={s.completedBanner}>
                  <MaterialIcons name="check-circle" size={18} color={Colors.success} />
                  <Text style={s.completedText}>Payment Completed! All 3 signatures verified.</Text>
                  <TouchableOpacity onPress={() => setCurrentPayment(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <MaterialIcons name="close" size={14} color={Colors.success} />
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          </>
        )}

        {/* ── CLIENT TAB ── */}
        {tab === 'client' && (
          <>
            {status?.client && (
              <Card title="Client Wallet" icon="person" color="#22C55E" badge="CLIENT">
                <View style={s.entityRow}>
                  <View style={[s.entityIconWrap, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                    <MaterialIcons name="person" size={18} color="#22C55E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.entityLabel}>{status.client.name}</Text>
                    <Text style={s.entityKey}>{status.client.walletId}</Text>
                    <View style={s.balRow}>
                      <Text style={[s.balBig, { color: '#22C55E' }]}>{fmtBal(status.client.balance)}</Text>
                      <Text style={s.balUnit}>BTNGG</Text>
                    </View>
                  </View>
                  <StatusBadge status="ACTIVE" />
                </View>

                <View style={s.txStatsRow}>
                  {[
                    { label: 'Transactions', val: String(status.client.txCount) },
                    { label: 'Wallet ID',    val: status.client.walletId.slice(0, 8) + '…' },
                  ].map(r => (
                    <View key={r.label} style={s.txStatCell}>
                      <Text style={s.txStatVal}>{r.val}</Text>
                      <Text style={s.txStatLabel}>{r.label}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {/* Transaction history */}
            <Card title="Transaction History" icon="receipt-long" color="#3B82F6">
              {(btngSovereignEngine.clientEngine.state?.transactions ?? []).slice(0, 15).map(tx => (
                <View key={tx.txId} style={s.txRow}>
                  <View style={[s.txIconWrap, { backgroundColor: (tx.type === 'SEND' ? Colors.errorBg : Colors.successBg) }]}>
                    <MaterialIcons
                      name={tx.type === 'SEND' ? 'arrow-upward' : tx.type === 'MINT' ? 'add-circle' : tx.type === 'REWARD' ? 'star' : 'arrow-downward'}
                      size={14}
                      color={tx.type === 'SEND' ? Colors.error : Colors.success}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.txType}>{tx.type} {tx.currency}</Text>
                    <Text style={s.txNote} numberOfLines={1}>{tx.note ?? tx.txHash.slice(0, 20) + '…'}</Text>
                    <Text style={s.txDate}>{fmtDate(tx.timestamp)}</Text>
                  </View>
                  <Text style={[s.txAmount, { color: tx.type === 'SEND' ? Colors.error : Colors.success }]}>
                    {tx.type === 'SEND' ? '-' : '+'}{tx.amount.toFixed(4)}
                  </Text>
                </View>
              ))}
              {(btngSovereignEngine.clientEngine.state?.transactions ?? []).length === 0 && (
                <Text style={s.emptyText}>No transactions yet</Text>
              )}
            </Card>

            {/* Reset client */}
            <Card title="Wallet Management" icon="settings" color={Colors.warning}>
              <Text style={s.infoText}>Reset generates NEW Ed25519-style key pair automatically. Old wallet is archived.</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Current Password</Text>
                <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={Colors.textMuted} />
              </View>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: Colors.warning }]} onPress={handleResetClient} activeOpacity={0.85}>
                <MaterialIcons name="refresh" size={15} color={Colors.bg} />
                <Text style={[s.actionBtnText, { color: Colors.bg }]}>Reset Wallet — Generate New Keys</Text>
              </TouchableOpacity>
            </Card>
          </>
        )}

        {/* ── BANK TAB ── */}
        {tab === 'bank' && (
          <>
            <Card title="BTNG Sovereign Bank System" icon="account-balance" color={Colors.primary} badge="BANK">
              <View style={s.entityRow}>
                <View style={[s.entityIconWrap, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                  <MaterialIcons name="account-balance" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.entityLabel}>BTNG Sovereign Bank</Text>
                  <Text style={s.entityKey}>EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624</Text>
                  <View style={s.balRow}>
                    <Text style={[s.balBig, { color: Colors.primary }]}>{(status?.bank.balance ?? 0 / 1_000_000).toFixed(2)}</Text>
                    <Text style={s.balUnit}>M BTNGG</Text>
                  </View>
                </View>
                <StatusBadge status="ACTIVE" />
              </View>

              <View style={s.txStatsRow}>
                {[
                  { label: 'Settlements',  val: String(status?.bank.totalSettlements ?? 0) },
                  { label: 'Gold Reserve', val: '500kg BoG' },
                  { label: 'Chain',        val: 'BTNG-MAINNET' },
                ].map(r => (
                  <View key={r.label} style={s.txStatCell}>
                    <Text style={s.txStatVal}>{r.val}</Text>
                    <Text style={s.txStatLabel}>{r.label}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <Card title="Bank Operations" icon="build" color={Colors.warning}>
              <Text style={s.infoText}>Bank auto-signs all payment settlements. Key generation is automatic on every reset.</Text>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: Colors.warningBg, borderWidth: 1.5, borderColor: Colors.warning + '66' }]} onPress={handleResetBank} activeOpacity={0.85}>
                <MaterialIcons name="refresh" size={15} color={Colors.warning} />
                <Text style={[s.actionBtnText, { color: Colors.warning }]}>Reset Bank — Generate New Bank Keys</Text>
              </TouchableOpacity>
            </Card>

            {/* Reward distribution */}
            <Card title="Reward Distribution" icon="star" color="#22C55E">
              <Text style={s.infoText}>Bank distributes BTNGG rewards to client wallets.</Text>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#22C55E' }]}
                activeOpacity={0.85}
                onPress={async () => {
                  const tx = await btngSovereignEngine.bankEngine.distributeReward(
                    btngSovereignEngine.clientEngine.state?.keyPair.publicKey ?? '',
                    50,
                    'Loyalty Reward'
                  );
                  await btngSovereignEngine.clientEngine.topUp(50, 'Bank Loyalty Reward');
                  await btngSovereignEngine.auditLogger.log('REWARD_DISTRIBUTED', 'BANK', 'BTNG_BANK_SYSTEM', `50 BTNGG reward distributed`);
                  refreshData();
                  showAlert('Reward Sent', '50 BTNGG distributed to your client wallet!');
                }}
              >
                <MaterialIcons name="star" size={15} color="#fff" />
                <Text style={s.actionBtnText}>Distribute 50 BTNGG Reward</Text>
              </TouchableOpacity>
            </Card>
          </>
        )}

        {/* ── MERCHANTS TAB ── */}
        {tab === 'merchants' && (
          <>
            <Card title={`Merchants (${merchants.length})`} icon="store" color="#9945FF">
              {merchants.map(m => (
                <TouchableOpacity
                  key={m.merchantId}
                  style={s.merchantRow}
                  onPress={() => { setPayMerchantId(m.merchantId); setInvMerchantId(m.merchantId); setTab('payments'); }}
                  activeOpacity={0.8}
                >
                  <View style={[s.merchantIconWrap, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                    <MaterialIcons name="store" size={16} color="#9945FF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.merchantNameRow}>
                      <Text style={s.merchantName}>{m.name}</Text>
                      <StatusBadge status={m.active ? 'ACTIVE' : 'SUSPENDED'} />
                    </View>
                    <Text style={s.merchantCat}>{m.category} · {fmtDate(m.registeredAt)}</Text>
                    <Text style={s.merchantKey}>{UniversalKeyManager.maskKey(m.wallet.keyPair.publicKey, 14)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={s.merchantBal}>{fmtBal(m.wallet.balance)}</Text>
                    <Text style={s.merchantBalUnit}>BTNGG</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </Card>

            {/* Register merchant */}
            <Card title="Register New Merchant" icon="add-business" color="#22C55E">
              <Text style={s.infoText}>Keys are generated automatically when a merchant is registered.</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Merchant Name</Text>
                <TextInput style={s.input} value={newMerchantName} onChangeText={setNewMerchantName} placeholder="e.g. Gold Shop Accra" placeholderTextColor={Colors.textMuted} />
              </View>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                  {['General', 'Crypto', 'Trade', 'Food', 'Tech', 'Finance', 'Healthcare'].map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[s.merchantChip, newMerchantCat === cat && s.merchantChipActive]}
                      onPress={() => setNewMerchantCat(cat)}
                    >
                      <Text style={[s.merchantChipText, newMerchantCat === cat && { color: Colors.bg }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#22C55E' }, loading && { opacity: 0.5 }]}
                onPress={handleAddMerchant}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="add" size={15} color="#fff" />}
                <Text style={s.actionBtnText}>Register Merchant (Auto-Generate Keys)</Text>
              </TouchableOpacity>
            </Card>

            {/* Create invoice */}
            <Card title="Create Invoice" icon="receipt" color="#F59E0B">
              <View style={s.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Amount (BTNGG)</Text>
                  <TextInput style={s.fieldInput} value={invAmount} onChangeText={setInvAmount} keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={s.fieldLabel}>Merchant</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {merchants.map(m => (
                      <TouchableOpacity
                        key={m.merchantId}
                        style={[s.merchantChip, invMerchantId === m.merchantId && s.merchantChipActive]}
                        onPress={() => setInvMerchantId(m.merchantId)}
                      >
                        <Text style={[s.merchantChipText, invMerchantId === m.merchantId && { color: Colors.bg }]} numberOfLines={1}>
                          {m.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Description</Text>
                <TextInput style={s.input} value={invDesc} onChangeText={setInvDesc} placeholder="Service description" placeholderTextColor={Colors.textMuted} />
              </View>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#F59E0B' }]} onPress={handleCreateInvoice} activeOpacity={0.85}>
                <MaterialIcons name="receipt" size={15} color={Colors.bg} />
                <Text style={[s.actionBtnText, { color: Colors.bg }]}>Create Invoice</Text>
              </TouchableOpacity>
              {latestInvoice && (
                <View style={s.invoiceCard}>
                  <View style={s.invoiceHeader}>
                    <MaterialIcons name="receipt" size={14} color={Colors.primary} />
                    <Text style={s.invoiceTitle}>Latest Invoice</Text>
                    <StatusBadge status={latestInvoice.status} />
                  </View>
                  <Text style={s.invoiceId} numberOfLines={1}>ID: {latestInvoice.invoiceId}</Text>
                  <Text style={s.invoiceQr} numberOfLines={2}>QR: {latestInvoice.qrPayload}</Text>
                  <View style={s.invoiceRow}>
                    <Text style={s.invoiceLabel}>Amount</Text>
                    <Text style={[s.invoiceValue, { color: Colors.primary }]}>{latestInvoice.amount} BTNGG</Text>
                  </View>
                  <View style={s.invoiceRow}>
                    <Text style={s.invoiceLabel}>Expires</Text>
                    <Text style={s.invoiceValue}>{fmtDate(latestInvoice.expiresAt)}</Text>
                  </View>
                </View>
              )}
            </Card>
          </>
        )}

        {/* ── PAYMENTS TAB ── */}
        {tab === 'payments' && (
          <>
            <Card title="Triple-Sign Payment Flow" icon="payments" color={Colors.primary} badge="3-KEY">
              <View style={s.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Amount (BTNGG)</Text>
                  <TextInput style={s.fieldInput} value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Password</Text>
                  <TextInput style={s.fieldInput} value={payPw} onChangeText={setPayPw} secureTextEntry placeholderTextColor={Colors.textMuted} />
                </View>
              </View>
              <View style={s.inputWrap}>
                <Text style={s.fieldLabel}>Select Merchant</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
                  {merchants.filter(m => m.active).map(m => (
                    <TouchableOpacity
                      key={m.merchantId}
                      style={[s.merchantChip, payMerchantId === m.merchantId && s.merchantChipActive]}
                      onPress={() => setPayMerchantId(m.merchantId)}
                    >
                      <MaterialIcons name="store" size={11} color={payMerchantId === m.merchantId ? Colors.bg : '#9945FF'} />
                      <Text style={[s.merchantChipText, payMerchantId === m.merchantId && { color: Colors.bg }]} numberOfLines={1}>{m.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={s.inputWrap}>
                <Text style={s.fieldLabel}>Description</Text>
                <TextInput style={s.input} value={payDesc} onChangeText={setPayDesc} placeholder="Payment description" placeholderTextColor={Colors.textMuted} />
              </View>

              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#22C55E' }]}
                onPress={handleStep1ClientSign}
                disabled={!!currentPayment && currentPayment.status !== 'COMPLETED'}
                activeOpacity={0.85}
              >
                <MaterialIcons name="person" size={15} color="#fff" />
                <Text style={s.actionBtnText}>Step 1 — Client Signs Payment</Text>
              </TouchableOpacity>
            </Card>

            {/* Current payment pipeline */}
            {currentPayment && currentPayment.status !== 'COMPLETED' && (
              <Card title="Payment Pipeline" icon="device-hub" color={Colors.primary}>
                <View style={s.pipelineRow}>
                  <Text style={s.pipelineId}>ID: {currentPayment.paymentId.slice(0, 16)}…</Text>
                  <StatusBadge status={currentPayment.status} />
                </View>
                <View style={s.pipelineInfo}>
                  {[
                    { label: 'Amount',   val: `${currentPayment.amount} BTNGG` },
                    { label: 'Merchant', val: currentPayment.merchantName },
                    { label: 'Created',  val: fmtDate(currentPayment.createdAt) },
                    { label: 'Tx Hash',  val: currentPayment.txHash.slice(0, 20) + '…' },
                  ].map(r => (
                    <View key={r.label} style={s.pipelineInfoRow}>
                      <Text style={s.pipelineLabel}>{r.label}</Text>
                      <Text style={s.pipelineValue}>{r.val}</Text>
                    </View>
                  ))}
                </View>

                {/* Signatures */}
                {[
                  { label: 'Client Sig',   sig: currentPayment.clientSignature,   color: '#22C55E', step: 1 },
                  { label: 'Bank Sig',     sig: currentPayment.bankSignature,      color: Colors.primary, step: 2 },
                  { label: 'Merchant Sig', sig: currentPayment.merchantSignature,  color: '#9945FF', step: 3 },
                ].map(item => (
                  <View key={item.label} style={s.sigRow}>
                    <View style={[s.sigDot, { backgroundColor: item.sig ? item.color : Colors.bgElevated, borderColor: item.color + '55', borderWidth: item.sig ? 0 : 1 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.sigLabel, { color: item.sig ? item.color : Colors.textMuted }]}>{item.label}</Text>
                      {item.sig ? (
                        <Text style={s.sigValue} numberOfLines={1}>{item.sig.slice(0, 30)}…</Text>
                      ) : (
                        <Text style={s.sigPending}>⏳ Awaiting signature</Text>
                      )}
                    </View>
                    <MaterialIcons name={item.sig ? 'check-circle' : 'radio-button-unchecked'} size={16} color={item.sig ? item.color : Colors.textMuted} />
                  </View>
                ))}

                {currentPayment.status === 'CLIENT_SIGNED' && (
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: Colors.primary }, payProcessing && { opacity: 0.5 }]} onPress={() => handleStep2BankSign(currentPayment.paymentId)} disabled={payProcessing} activeOpacity={0.85}>
                    {payProcessing ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="account-balance" size={15} color="#fff" />}
                    <Text style={s.actionBtnText}>Step 2 — Bank Signs</Text>
                  </TouchableOpacity>
                )}

                {currentPayment.status === 'BANK_SIGNED' && (
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#9945FF' }, payProcessing && { opacity: 0.5 }]} onPress={() => handleStep3Complete(currentPayment.paymentId)} disabled={payProcessing} activeOpacity={0.85}>
                    {payProcessing ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="store" size={15} color="#fff" />}
                    <Text style={s.actionBtnText}>Step 3 — Merchant Signs & Settle</Text>
                  </TouchableOpacity>
                )}
              </Card>
            )}

            {/* Payment history */}
            <Card title={`All Payments (${payments.length})`} icon="history" color="#3B82F6">
              {payments.slice(0, 20).map(p => (
                <View key={p.paymentId} style={s.paymentRow}>
                  <View style={{ flex: 1 }}>
                    <View style={s.paymentTopRow}>
                      <Text style={s.paymentAmount}>{p.amount} BTNGG</Text>
                      <StatusBadge status={p.status} />
                    </View>
                    <Text style={s.paymentMerchant}>{p.merchantName} — {p.description}</Text>
                    <Text style={s.paymentDate}>{fmtDate(p.createdAt)}</Text>
                    <View style={s.paymentSigs}>
                      {[
                        { label: 'C', done: !!p.clientSignature,   color: '#22C55E' },
                        { label: 'B', done: !!p.bankSignature,     color: Colors.primary },
                        { label: 'M', done: !!p.merchantSignature, color: '#9945FF' },
                      ].map(sig => (
                        <View key={sig.label} style={[s.sigChip, { backgroundColor: sig.done ? sig.color + '22' : Colors.bgElevated, borderColor: sig.done ? sig.color + '55' : Colors.border }]}>
                          <Text style={[s.sigChipText, { color: sig.done ? sig.color : Colors.textMuted }]}>{sig.label}{sig.done ? '✓' : '…'}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {p.status !== 'COMPLETED' && (
                    <TouchableOpacity
                      style={s.continueBtn}
                      onPress={() => {
                        setCurrentPayment(p);
                        setTab('payments');
                      }}
                    >
                      <MaterialIcons name="play-arrow" size={14} color={Colors.primary} />
                      <Text style={s.continueBtnText}>Resume</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {payments.length === 0 && <Text style={s.emptyText}>No payments yet. Create one above.</Text>}
            </Card>
          </>
        )}

        {/* ── KEYS TAB ── */}
        {tab === 'keys' && allKeys && (
          <>
            <Card title="All Public Keys — System" icon="vpn-key" color={Colors.warning} badge="AUTO-GENERATED">
              <Text style={s.infoText}>Every entity has its own Ed25519-style key pair generated automatically. Public keys are safe to share.</Text>

              <View style={s.keySection}>
                <View style={s.keySectionHeader}>
                  <MaterialIcons name="person" size={14} color="#22C55E" />
                  <Text style={[s.keySectionTitle, { color: '#22C55E' }]}>Client Wallet</Text>
                  <Text style={s.keySectionSub}>Auto-generated on wallet creation</Text>
                </View>
                <KeyRow label="PUBLIC KEY" value={allKeys.client} icon="key" color="#22C55E" />
              </View>

              <View style={s.keySection}>
                <View style={s.keySectionHeader}>
                  <MaterialIcons name="account-balance" size={14} color={Colors.primary} />
                  <Text style={[s.keySectionTitle, { color: Colors.primary }]}>BTNG Bank System</Text>
                  <Text style={s.keySectionSub}>System authority — signs all settlements</Text>
                </View>
                <KeyRow label="PUBLIC KEY" value={allKeys.bank} icon="key" color={Colors.primary} />
              </View>

              {allKeys.merchants.map((m, i) => (
                <View key={i} style={s.keySection}>
                  <View style={s.keySectionHeader}>
                    <MaterialIcons name="store" size={14} color="#9945FF" />
                    <Text style={[s.keySectionTitle, { color: '#9945FF' }]}>{m.name}</Text>
                    <Text style={s.keySectionSub}>Merchant auto-generated key</Text>
                  </View>
                  <KeyRow label="PUBLIC KEY" value={m.key} icon="key" color="#9945FF" />
                </View>
              ))}
            </Card>

            <Card title="Key Architecture" icon="security" color={Colors.primary}>
              {[
                { label: 'Algorithm',    val: 'BTNG-ED25519 (Ed25519-style)',  icon: 'memory' },
                { label: 'Key Format',   val: 'BTNG-PUB: + Compressed Public', icon: 'code' },
                { label: 'Signing',      val: 'BTNG Sovereign Signature',      icon: 'verified' },
                { label: 'Storage',      val: 'AsyncStorage (encrypted)',       icon: 'lock' },
                { label: 'Key Count',    val: `${2 + allKeys.merchants.length} total (Client + Bank + ${allKeys.merchants.length} Merchants)`, icon: 'group-work' },
                { label: 'Auto-Gen',     val: 'Every entity on registration',  icon: 'auto-awesome' },
              ].map(r => (
                <View key={r.label} style={s.archInfoRow}>
                  <MaterialIcons name={r.icon as any} size={14} color={Colors.primary} />
                  <Text style={s.archInfoLabel}>{r.label}</Text>
                  <Text style={s.archInfoVal}>{r.val}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ── AUDIT TAB ── */}
        {tab === 'audit' && (
          <Card title={`Audit Log (${auditLog.length} entries)`} icon="manage-search" color="#EC4899">
            {auditLog.slice(0, 30).map(entry => (
              <View key={entry.entryId} style={s.auditRow}>
                <View style={[s.auditDot, {
                  backgroundColor: entry.action.includes('RESET') ? Colors.warning
                    : entry.action.includes('COMPLETE') ? Colors.success
                    : entry.action.includes('FAILED') ? Colors.error
                    : Colors.primary,
                }]} />
                <View style={{ flex: 1 }}>
                  <View style={s.auditTopRow}>
                    <Text style={s.auditAction}>{entry.action}</Text>
                    <Text style={s.auditTime}>{fmtDate(entry.timestamp)}</Text>
                  </View>
                  <Text style={s.auditEntity}>{entry.entity} · {entry.entityId.slice(0, 16)}…</Text>
                  <Text style={s.auditDetails} numberOfLines={2}>{entry.details}</Text>
                </View>
              </View>
            ))}
            {auditLog.length === 0 && <Text style={s.emptyText}>No audit entries yet.</Text>}
          </Card>
        )}

        {/* ── ENGINES TAB ── */}
        {tab === 'engines' && (
          <>
            {/* Matching Engine Card */}
            <Card title="Matching Engine (DEX)" icon="swap-horiz" color="#3B82F6" badge="LIVE">
              <Text style={s.infoText}>On-device BTNG Sovereign DEX — Ed25519-signed order matching, real-time order book, atomic settlement.</Text>
              <View style={s.statGrid}>
                {[
                  { label: 'Total Orders',  val: String(matchStats.totalOrders),  color: '#3B82F6' },
                  { label: 'Open Orders',   val: String(matchStats.openOrders),   color: Colors.warning },
                  { label: 'Matched Trades',val: String(matchStats.totalTrades),  color: Colors.success },
                  { label: 'Active Pairs',  val: String(Math.max(matchStats.assets.length, 6)), color: Colors.primary },
                ].map(stat => (
                  <View key={stat.label} style={[s.statCard, { borderColor: stat.color + '44' }]}>
                    <Text style={[s.statVal, { color: stat.color }]}>{stat.val}</Text>
                    <Text style={s.statLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity
                  style={[s.actionBtn, { flex: 1, backgroundColor: '#3B82F6' }]}
                  onPress={() => router.push('/btng-swap' as any)}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="swap-horiz" size={15} color="#fff" />
                  <Text style={s.actionBtnText}>Open DEX</Text>
                </TouchableOpacity>
              </View>
            </Card>

            {/* PoV Calculator Card */}
            {povMetrics && (
              <Card title="Proof of Value (PoV)" icon="verified" color={Colors.primary} badge={`${povMetrics.grade} · ${povMetrics.pov}/1000`}>
                <Text style={s.infoText}>Sovereign gold-backed valuation engine — measures BTNGG reserve backing, stability, and market liquidity.</Text>
                <View style={s.statGrid}>
                  {[
                    { label: 'PoV Score',      val: String(povMetrics.pov),                                         color: Colors.primary },
                    { label: 'Grade',          val: povMetrics.grade,                                               color: Colors.warning },
                    { label: 'Backing Ratio',  val: `${(povMetrics.backingRatio * 100).toFixed(1)}%`,               color: Colors.success },
                    { label: 'Stability',      val: `${povMetrics.stabilityScore}`,                                  color: '#3B82F6' },
                    { label: 'Reserve (oz)',   val: povMetrics.goldReserveOz.toFixed(0),                            color: Colors.primary },
                    { label: 'Reserve (USD)',  val: `$${(povMetrics.totalReserveUSD / 1_000_000).toFixed(1)}M`,     color: Colors.success },
                  ].map(stat => (
                    <View key={stat.label} style={[s.statCard, { borderColor: stat.color + '44' }]}>
                      <Text style={[s.statVal, { color: stat.color, fontSize: FontSize.sm }]}>{stat.val}</Text>
                      <Text style={s.statLabel}>{stat.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={[s.entityRow, { borderBottomWidth: 0, paddingTop: 0 }]}>
                  <MaterialIcons name="workspace-premium" size={14} color={Colors.primary} />
                  <Text style={[s.entityKey, { flex: 1 }]}>
                    Gold Reserve: 500 kg · Bank of Ghana Vault 001, Accra · Cert: {povCalculator.getReserveInfo().certId}
                  </Text>
                </View>
              </Card>
            )}

            {/* BTNG2 Staking Engine Card */}
            <Card title="BTNG2 Staking Engine" icon="savings" color="#9945FF" badge="4 POOLS">
              <Text style={s.infoText}>Gold-backed yield farming — stake BTNG2 and BTNGG LP tokens to earn compounding sovereign rewards.</Text>
              <View style={s.statGrid}>
                {[
                  { label: 'Total TVL',    val: `$${(stakingStats.totalTVL / 1_000_000).toFixed(1)}M`, color: '#9945FF' },
                  { label: 'Avg APY',      val: `${stakingStats.avgAPY.toFixed(1)}%`,                  color: Colors.success },
                  { label: 'Active Pools', val: String(stakingStats.activePools),                      color: Colors.primary },
                  { label: 'Max APY',      val: `${Math.max(...STAKING_POOLS.map(p => p.apy))}%`,     color: Colors.warning },
                ].map(stat => (
                  <View key={stat.label} style={[s.statCard, { borderColor: stat.color + '44' }]}>
                    <Text style={[s.statVal, { color: stat.color }]}>{stat.val}</Text>
                    <Text style={s.statLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              {STAKING_POOLS.slice(0, 3).map(pool => (
                <View key={pool.poolId} style={s.entityRow}>
                  <View style={[s.entityIconWrap, { backgroundColor: pool.color + '18', borderColor: pool.color + '44' }]}>
                    <MaterialIcons name={pool.icon as any} size={14} color={pool.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.entityLabel, { color: pool.color, fontSize: FontSize.xs }]}>{pool.name}</Text>
                    <Text style={s.entityKey}>{pool.asset} → {pool.rewardAsset} · {pool.apy}% APY{pool.lockDays > 0 ? ` · ${pool.lockDays}d lock` : ' · Flexible'}</Text>
                  </View>
                  <Text style={[s.entityBal, { color: pool.color, fontWeight: FontWeight.bold }]}>{pool.apy}%</Text>
                </View>
              ))}
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#9945FF' }]}
                onPress={() => router.push('/btng-staking' as any)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="savings" size={15} color="#fff" />
                <Text style={s.actionBtnText}>Open Staking Dashboard</Text>
              </TouchableOpacity>
            </Card>

            {/* Contract Architecture Reference */}
            <Card title="Contract Architecture (Reference)" icon="description" color={Colors.warning}>
              <Text style={s.infoText}>
                The BTNG Sovereign Engine maps to a deployable Solidity contract suite for EVM / BTNG-MAINNET. All logic runs natively in the app via TypeScript engines.
              </Text>
              {[
                { contract: 'BTNG1.sol',              desc: 'Core gold-backed token — ERC-20 compatible',          color: Colors.primary   },
                { contract: 'BTNG2.sol',              desc: 'Staking yield token — minted by BTNGStakingEngine',   color: '#9945FF' },
                { contract: 'BTNGAtomicEscrow.sol',   desc: 'Triple-sign escrow — TripleKeyPaymentEngine',        color: Colors.success   },
                { contract: 'BTNG1Lending.sol',       desc: 'Gold-backed loans — AI Credit Engine',               color: Colors.warning   },
                { contract: 'BTNGValueConverter.sol', desc: 'PoV conversion — PoVCalculator',                     color: '#3B82F6' },
                { contract: 'QuantumVault.sol',       desc: 'Quantum-safe key store — UniversalKeyManager',       color: '#EC4899'   },
                { contract: 'PoVOracle.sol',          desc: 'Gold oracle pricing — gold-oracle Edge Function',     color: Colors.copper    },
                { contract: 'BTNG2Staking.sol',       desc: 'Yield farming — BTNGStakingEngine',                  color: '#9945FF' },
              ].map(c => (
                <View key={c.contract} style={s.archInfoRow}>
                  <MaterialIcons name="code" size={11} color={c.color} />
                  <Text style={[s.archInfoLabel, { color: c.color, width: 130 }]} numberOfLines={1}>{c.contract}</Text>
                  <Text style={[s.archInfoVal, { flex: 1, textAlign: 'left', paddingLeft: Spacing.sm }]} numberOfLines={1}>{c.desc}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ── CHAINS TAB ── */}
        {tab === 'chains' && (
          <>
            {/* Auto-probe banner */}
            {autoProbing && (
              <View style={s.autoProbeBanner}>
                <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.8 }] }} />
                <Text style={s.autoProbeBannerText}>Auto-probing all chains…</Text>
                <View style={s.autoProbeLiveDot} />
              </View>
            )}

            {/* Chain Registry Header */}
            <Card title="BTNG Multi-Chain Fabric" icon="device-hub" color="#3B82F6" badge={`${Object.keys(BTNG_CHAIN_REGISTRY.chains).length} CHAINS`}>
              <Text style={s.infoText}>
                Unified multi-chain access fabric — 11 sovereign chains powered by Alchemy API. One API key, all chains, all VMs.
              </Text>
              <View style={s.statGrid}>
                {(['evm', 'solana', 'move', 'utxo', 'cairo'] as ChainType[]).map(type => {
                  const count = Object.values(BTNG_CHAIN_REGISTRY.chains).filter(c => c.type === type).length;
                  const color = TYPE_COLORS[type];
                  return (
                    <View key={type} style={[s.statCard, { borderColor: color + '44' }]}>
                      <Text style={[s.statVal, { color }]}>{count}</Text>
                      <Text style={s.statLabel}>{TYPE_LABELS[type]}</Text>
                    </View>
                  );
                })}
                <View style={[s.statCard, { borderColor: '#D4A017' + '44' }]}>
                  <Text style={[s.statVal, { color: '#D4A017' }]}>1</Text>
                  <Text style={s.statLabel}>API Key</Text>
                </View>
              </View>

              {/* Probe Summary strip */}
              {Object.keys(probeResults).length > 0 && (() => {
                const vals   = Object.values(probeResults);
                const online = vals.filter(r => r.status === 'online' || r.status === 'slow').length;
                const slow   = vals.filter(r => r.status === 'slow').length;
                const offline = vals.filter(r => r.status === 'offline').length;
                const avgMs  = vals
                  .filter(r => r.latency_ms !== null)
                  .reduce((a, b) => a + (b.latency_ms ?? 0), 0) /
                  Math.max(1, vals.filter(r => r.latency_ms !== null).length);
                return (
                  <View style={pv.summaryRow}>
                    <View style={[pv.summaryChip, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                      <View style={[pv.dot, { backgroundColor: '#22C55E' }]} />
                      <Text style={[pv.summaryText, { color: '#22C55E' }]}>{online} online</Text>
                    </View>
                    {slow > 0 && (
                      <View style={[pv.summaryChip, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' }]}>
                        <View style={[pv.dot, { backgroundColor: '#F59E0B' }]} />
                        <Text style={[pv.summaryText, { color: '#F59E0B' }]}>{slow} slow</Text>
                      </View>
                    )}
                    {offline > 0 && (
                      <View style={[pv.summaryChip, { backgroundColor: '#EF444418', borderColor: '#EF444444' }]}>
                        <View style={[pv.dot, { backgroundColor: '#EF4444' }]} />
                        <Text style={[pv.summaryText, { color: '#EF4444' }]}>{offline} offline</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text style={pv.avgText}>avg {Math.round(avgMs)}ms</Text>
                  </View>
                );
              })()}

              {/* Probe All button */}
              <TouchableOpacity
                style={[pv.probeBtn, probing && { opacity: 0.6 }]}
                onPress={probeAllChains}
                disabled={probing}
                activeOpacity={0.85}
              >
                {probing ? (
                  <ActivityIndicator size="small" color="#3B82F6" style={{ transform: [{ scale: 0.8 }] }} />
                ) : (
                  <MaterialIcons name="wifi-tethering" size={16} color="#3B82F6" />
                )}
                <Text style={pv.probeBtnText}>
                  {probing ? 'Probing all chains…' : 'Probe All Chains'}
                </Text>
                {!probing && Object.keys(probeResults).length > 0 && (
                  <View style={pv.probeDoneChip}>
                    <MaterialIcons name="check" size={10} color="#22C55E" />
                    <Text style={pv.probeDoneText}>Done</Text>
                  </View>
                )}
                {!probing && (
                  <MaterialIcons name="chevron-right" size={16} color="#3B82F6" />
                )}
              </TouchableOpacity>
            </Card>

            {/* Chain VM Filter Chips */}
            <View style={cf.bar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={cf.content}
              >
                {(
                  [
                    { id: 'all',    label: 'All',        color: Colors.primary  },
                    { id: 'evm',    label: 'EVM',         color: TYPE_COLORS.evm    },
                    { id: 'solana', label: 'Solana VM',   color: TYPE_COLORS.solana },
                    { id: 'move',   label: 'Move VM',     color: TYPE_COLORS.move   },
                    { id: 'utxo',   label: 'UTXO',        color: TYPE_COLORS.utxo   },
                    { id: 'cairo',  label: 'Cairo VM',    color: TYPE_COLORS.cairo  },
                  ] as { id: ChainType | 'all'; label: string; color: string }[]
                ).map(opt => {
                  const active = chainFilter === opt.id;
                  const chainCount =
                    opt.id === 'all'
                      ? CHAIN_META.length
                      : CHAIN_META.filter(c => c.type === opt.id).length;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        cf.chip,
                        active
                          ? { backgroundColor: opt.color, borderColor: opt.color }
                          : { backgroundColor: opt.color + '12', borderColor: opt.color + '40' },
                      ]}
                      onPress={() => setChainFilter(opt.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          cf.chipText,
                          { color: active ? '#fff' : opt.color },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <View
                        style={[
                          cf.chipCount,
                          {
                            backgroundColor: active ? 'rgba(255,255,255,0.22)' : opt.color + '20',
                            borderColor:     active ? 'rgba(255,255,255,0.35)' : opt.color + '44',
                          },
                        ]}
                      >
                        <Text style={[cf.chipCountText, { color: active ? '#fff' : opt.color }]}>
                          {chainCount}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Chain Grid */}
            <Card
              title="Chain Registry"
              icon="lan"
              color="#22C55E"
              action={
                Object.keys(probeResults).length > 0 ? (
                  <TouchableOpacity
                    style={pv.exportBtn}
                    onPress={exportProbeResults}
                    activeOpacity={0.8}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MaterialIcons name="ios-share" size={13} color="#22C55E" />
                    <Text style={pv.exportBtnText}>Export</Text>
                  </TouchableOpacity>
                ) : null
              }
            >
              {CHAIN_META.filter(chain => chainFilter === 'all' || chain.type === chainFilter).map(chain => {
                const ep           = BTNG_CHAIN_REGISTRY.chains[chain.id];
                const color        = TYPE_COLORS[chain.type];
                const probe        = probeResults[chain.id];
                const isSingleProbing = probingChain === chain.id;
                const probeColor =
                  !probe                       ? Colors.textMuted
                  : probe.status === 'online'  ? '#22C55E'
                  : probe.status === 'slow'    ? '#F59E0B'
                  : '#EF4444';
                const probeLabel =
                  isSingleProbing              ? 'probing…'
                  : (probing && !probe)        ? 'probing…'
                  : !probe                     ? 'tap'
                  : probe.status === 'online'  ? `${probe.latency_ms}ms`
                  : probe.status === 'slow'    ? `${probe.latency_ms}ms ⚠`
                  : probe.error                ? probe.error.slice(0, 12)
                  : 'offline';
                return (
                  <TouchableOpacity
                    key={chain.id}
                    style={[
                      s.entityRow,
                      probe && { backgroundColor: probeColor + '06' },
                      compareSet.includes(chain.id) && cmp.selectedRow,
                    ]}
                    onPress={() => setSelectedChainId(chain.id)}
                    onLongPress={() => toggleCompare(chain.id)}
                    delayLongPress={350}
                    activeOpacity={0.75}
                  >
                    {compareSet.includes(chain.id) && (
                      <View style={cmp.selectedBadge}>
                        <Text style={cmp.selectedBadgeText}>
                          {compareSet.indexOf(chain.id) + 1}
                        </Text>
                      </View>
                    )}
                    <View style={[s.entityIconWrap, { backgroundColor: chain.color + '18', borderColor: chain.color + '44' }]}>
                      {(probing && !probe) || isSingleProbing ? (
                        <ActivityIndicator size="small" color={chain.color} style={{ transform: [{ scale: 0.7 }] }} />
                      ) : (
                        <Text style={{ fontSize: 18, includeFontPadding: false } as any}>{chain.emoji}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <Text style={[s.entityLabel, { color: chain.color }]}>{chain.label}</Text>
                        <View style={[{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: color + '15', borderWidth: 1, borderColor: color + '33' }]}>
                          <Text style={{ fontSize: 8, fontWeight: '800', color, includeFontPadding: false } as any}>{TYPE_LABELS[chain.type]}</Text>
                        </View>
                        <View style={[{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border }]}>
                          <Text style={{ fontSize: 8, fontWeight: '700', color: Colors.textMuted, includeFontPadding: false } as any}>{chain.ticker}</Text>
                        </View>
                      </View>
                      <Text style={s.entityKey} numberOfLines={1}>{ep?.mainnet ?? '-'}</Text>
                      {probe?.block ? (
                        <Text style={[s.entityKey, { color: probeColor + 'CC' }]} numberOfLines={1}>
                          block #{probe.block}
                        </Text>
                      ) : ep?.testnet || ep?.sepolia || ep?.devnet ? (
                        <Text style={[s.entityKey, { color: Colors.textMuted + 'AA' }]} numberOfLines={1}>
                          testnet: {ep.testnet ?? ep.sepolia ?? ep.devnet}
                        </Text>
                      ) : null}
                    </View>
                    {/* Tap-to-probe status button */}
                    <TouchableOpacity
                      style={[
                        pv.chainStatus,
                        {
                          borderColor: isSingleProbing ? chain.color + '88' : probeColor + '55',
                          backgroundColor: isSingleProbing ? chain.color + '18' : probeColor + '12',
                        },
                      ]}
                      onPress={() => probeSingleChain(chain.id)}
                      disabled={isSingleProbing || probing}
                      activeOpacity={0.75}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      {isSingleProbing ? (
                        <ActivityIndicator
                          size="small"
                          color={chain.color}
                          style={{ transform: [{ scale: 0.55 }], width: 12, height: 12 }}
                        />
                      ) : (
                        <View style={[pv.chainStatusDot, {
                          backgroundColor: !probe ? Colors.border : probeColor,
                        }]} />
                      )}
                      <Text
                        style={[
                          pv.chainStatusText,
                          { color: isSingleProbing ? chain.color : (!probe ? Colors.textMuted : probeColor) },
                        ]}
                        numberOfLines={1}
                      >
                        {probeLabel}
                      </Text>
                      {!probe && !isSingleProbing && !probing && (
                        <MaterialIcons name="wifi-tethering" size={9} color={Colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </Card>

            {/* RPC Router */}
            <Card title="Unified RPC Router" icon="alt-route" color="#9945FF" badge="AUTO-DETECT">
              <Text style={s.infoText}>
                Auto-detects chain type from name and routes to the correct VM engine. Default: EVM engine.
              </Text>
              {Object.entries(BTNG_RPC_ROUTER.routing_rules).map(([type, chains]) => {
                const color = TYPE_COLORS[type as ChainType] ?? '#6B7280';
                return (
                  <View key={type} style={s.archInfoRow}>
                    <View style={[{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '33', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }]}>
                      <Text style={{ fontSize: 8, fontWeight: '800', color, includeFontPadding: false } as any}>{TYPE_LABELS[type as ChainType]?.slice(0, 3) ?? type.toUpperCase().slice(0, 3)}</Text>
                    </View>
                    <Text style={[s.archInfoLabel, { color, flex: 0.8 }]}>{TYPE_LABELS[type as ChainType] ?? type}</Text>
                    <Text style={[s.archInfoVal, { textAlign: 'left', flex: 2 }]} numberOfLines={2}>{chains.join(' · ')}</Text>
                  </View>
                );
              })}
            </Card>

            {/* Wallet Engine Blueprint */}
            <Card title="Wallet Engine Blueprint" icon="account-balance-wallet" color="#06B6D4" badge="ALL VMs">
              <Text style={s.infoText}>
                Unified wallet method map — each VM type exposes standard send/balance/call interfaces.
              </Text>
              {(['evm', 'solana', 'move', 'utxo', 'cairo'] as ChainType[]).map(vmType => {
                const color = TYPE_COLORS[vmType];
                const engine = BTNG_WALLET_ENGINE[vmType as keyof typeof BTNG_WALLET_ENGINE] as { methods: string[] };
                return (
                  <View key={vmType} style={[s.keySection, { paddingTop: 10, marginTop: 4 }]}>
                    <View style={s.keySectionHeader}>
                      <View style={[{ width: 22, height: 22, borderRadius: 6, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '33', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 7, fontWeight: '800', color, includeFontPadding: false } as any}>{TYPE_LABELS[vmType].slice(0, 3)}</Text>
                      </View>
                      <Text style={[s.keySectionTitle, { color }]}>{TYPE_LABELS[vmType]}</Text>
                      <Text style={s.keySectionSub}>{engine.methods.length} methods</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                      {engine.methods.map(method => (
                        <View key={method} style={[{ backgroundColor: color + '12', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: color + '30' }]}>
                          <Text style={{ fontSize: 9, color, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '700', includeFontPadding: false } as any}>{method}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </Card>

            {/* OpenAPI Spec */}
            <Card title="Bituncoin OpenAPI 3.1.0" icon="api" color="#F59E0B" badge={`${BTNG_OPENAPI_SPEC.endpoints.length} ROUTES`}>
              <Text style={s.infoText}>
                {BTNG_OPENAPI_SPEC.info.title} · v{BTNG_OPENAPI_SPEC.info.version} · {BTNG_OPENAPI_SPEC.info.server}
              </Text>
              {BTNG_OPENAPI_SPEC.endpoints.map(ep => {
                const methodColor = ep.method === 'GET' ? '#22C55E' : ep.method === 'POST' ? Colors.primary : '#F59E0B';
                return (
                  <View key={ep.path} style={s.archInfoRow}>
                    <View style={[{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, minWidth: 44, alignItems: 'center', flexShrink: 0, backgroundColor: methodColor + '15', borderColor: methodColor + '44' }]}>
                      <Text style={{ fontSize: 8, fontWeight: '800', color: methodColor, includeFontPadding: false } as any}>{ep.method}</Text>
                    </View>
                    <View style={{ flex: 2 }}>
                      <Text style={[s.entityKey, { color: Colors.textPrimary }]} numberOfLines={1}>{ep.path}</Text>
                      <Text style={[s.entityKey, { marginTop: 1 }]} numberOfLines={1}>{ep.summary}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                      <View style={[{ borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1 }, { backgroundColor: '#3B82F615', borderColor: '#3B82F633' }]}>
                        <Text style={{ fontSize: 7, fontWeight: '800', color: '#3B82F6', includeFontPadding: false } as any}>{ep.tag}</Text>
                      </View>
                      {ep.auth && (
                        <MaterialIcons name="lock" size={10} color={Colors.warning} />
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>

            {/* OS Architecture Layers */}
            <Card title="Sovereign Banking OS Architecture" icon="layers" color="#D4A017" badge="7 LAYERS">
              <Text style={s.infoText}>
                Full BTNG Sovereign Banking OS — 7 sovereign layers from identity to intelligence.
              </Text>
              {BTNG_OS_ARCHITECTURE.map((layer, i) => (
                <View key={layer.id} style={[s.entityRow, i === BTNG_OS_ARCHITECTURE.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <View style={[s.entityIconWrap, { backgroundColor: layer.color + '18', borderColor: layer.color + '33' }]}>
                    <MaterialIcons name={layer.icon as any} size={16} color={layer.color} />
                    <View style={[{ position: 'absolute', bottom: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: layer.color, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.bgCard }]}>
                      <Text style={{ fontSize: 7, fontWeight: '900', color: '#fff', includeFontPadding: false } as any}>{layer.id}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.entityLabel, { color: layer.color }]}>{layer.name}</Text>
                    <Text style={s.entityKey}>{layer.desc}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                      {layer.items.map(item => (
                        <View key={item} style={[{ backgroundColor: layer.color + '10', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: layer.color + '25' }]}>
                          <Text style={{ fontSize: 8, color: layer.color, fontWeight: '700', includeFontPadding: false } as any}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </Card>

            {/* ── Chain Detail Modal ── */}
            {selectedChainId && (() => {
              const chain   = CHAIN_META.find(c => c.id === selectedChainId);
              if (!chain) return null;
              const ep      = BTNG_CHAIN_REGISTRY.chains[chain.id];
              const probe   = probeResults[chain.id] ?? null;
              const color   = TYPE_COLORS[chain.type];
              const vmEngine = (BTNG_WALLET_ENGINE as any)[chain.type] as { methods: string[] } | undefined;
              const probeColor = !probe ? Colors.textMuted : probe.status === 'online' ? '#22C55E' : probe.status === 'slow' ? '#F59E0B' : '#EF4444';

              // Gather all endpoints from the chain entry
              const endpointRows: { label: string; url: string }[] = [];
              const EP_LABEL_MAP: Record<string, string> = {
                mainnet: 'Mainnet RPC', devnet: 'Devnet RPC', testnet: 'Testnet RPC',
                sepolia: 'Sepolia RPC', hoodi: 'Hoodi RPC', amoy: 'Amoy RPC',
                beacon_mainnet: 'Beacon Mainnet', beacon_sepolia: 'Beacon Sepolia',
                zkevm_mainnet: 'zkEVM Mainnet', zkevm_cardona: 'zkEVM Cardona',
                testnet4: 'Testnet 4', signet: 'Signet',
              };
              if (ep) {
                Object.entries(ep).forEach(([k, v]) => {
                  if (k !== 'type' && typeof v === 'string') {
                    endpointRows.push({ label: EP_LABEL_MAP[k] ?? k, url: v });
                  }
                });
              }

              const handleCopy = async (url: string, fieldKey: string) => {
                try {
                  await Clipboard.setStringAsync(url);
                  setCopiedField(fieldKey);
                  setTimeout(() => setCopiedField(null), 2000);
                } catch { /* ignore */ }
              };

              return (
                <Modal
                  visible
                  transparent
                  animationType="slide"
                  onRequestClose={() => setSelectedChainId(null)}
                >
                  <View style={cdm.backdrop}>
                    <View style={cdm.sheet}>
                      {/* Handle */}
                      <View style={cdm.handle} />

                      {/* Header */}
                      <View style={cdm.headerRow}>
                        <View style={[cdm.chainEmoji, { backgroundColor: chain.color + '18', borderColor: chain.color + '44' }]}>
                          <Text style={{ fontSize: 26 } as any}>{chain.emoji}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={[cdm.chainName, { color: chain.color }]}>{chain.label}</Text>
                          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                            <View style={[cdm.typeBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                              <Text style={[cdm.typeBadgeText, { color }]}>{TYPE_LABELS[chain.type]}</Text>
                            </View>
                            <View style={[cdm.typeBadge, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                              <Text style={[cdm.typeBadgeText, { color: Colors.textMuted }]}>{chain.ticker}</Text>
                            </View>
                            {probe && (
                              <View style={[cdm.typeBadge, { backgroundColor: probeColor + '18', borderColor: probeColor + '44' }]}>
                                <View style={[cdm.probeDot, { backgroundColor: probeColor }]} />
                                <Text style={[cdm.typeBadgeText, { color: probeColor }]}>
                                  {probe.status.toUpperCase()}{probe.latency_ms != null ? ` · ${probe.latency_ms}ms` : ''}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={cdm.closeBtn}
                          onPress={() => setSelectedChainId(null)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>

                      <ScrollView showsVerticalScrollIndicator={false} style={cdm.scrollArea}>

                        {/* Last Probe Result */}
                        <View style={cdm.section}>
                          <Text style={cdm.sectionTitle}>Last Probe Result</Text>
                          {probe ? (
                            <View style={[cdm.probeCard, { borderColor: probeColor + '55', backgroundColor: probeColor + '08' }]}>
                              <View style={cdm.probeTopRow}>
                                <MaterialIcons
                                  name={probe.status === 'online' ? 'check-circle' : probe.status === 'slow' ? 'warning' : 'cancel'}
                                  size={16}
                                  color={probeColor}
                                />
                                <Text style={[cdm.probeStatus, { color: probeColor }]}>{probe.status.toUpperCase()}</Text>
                                {probe.latency_ms != null && (
                                  <Text style={[cdm.probeLatency, { color: probeColor }]}>{probe.latency_ms} ms</Text>
                                )}
                              </View>
                              {probe.block && (
                                <View style={cdm.probeDetailRow}>
                                  <Text style={cdm.probeDetailLabel}>Block</Text>
                                  <Text style={[cdm.probeDetailVal, { color: probeColor }]}>#{probe.block}</Text>
                                </View>
                              )}
                              {probe.error && (
                                <View style={cdm.probeDetailRow}>
                                  <Text style={cdm.probeDetailLabel}>Error</Text>
                                  <Text style={[cdm.probeDetailVal, { color: Colors.error }]} numberOfLines={2}>{probe.error}</Text>
                                </View>
                              )}
                              <TouchableOpacity
                                style={[cdm.probeBtn, { borderColor: chain.color + '55', backgroundColor: chain.color + '12' }]}
                                onPress={() => { setSelectedChainId(null); probeSingleChain(chain.id); }}
                                activeOpacity={0.8}
                              >
                                <MaterialIcons name="wifi-tethering" size={13} color={chain.color} />
                                <Text style={[cdm.probeBtnText, { color: chain.color }]}>Re-probe this chain</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={[cdm.probeCard, { borderColor: Colors.border }]}>
                              <Text style={cdm.noProbeText}>Not yet probed in this session.</Text>
                              <TouchableOpacity
                                style={[cdm.probeBtn, { borderColor: chain.color + '55', backgroundColor: chain.color + '12' }]}
                                onPress={() => { setSelectedChainId(null); probeSingleChain(chain.id); }}
                                activeOpacity={0.8}
                              >
                                <MaterialIcons name="wifi-tethering" size={13} color={chain.color} />
                                <Text style={[cdm.probeBtnText, { color: chain.color }]}>Probe now</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        {/* RPC Endpoints */}
                        <View style={cdm.section}>
                          <Text style={cdm.sectionTitle}>RPC Endpoints</Text>
                          {endpointRows.map((row, i) => {
                            const fieldKey = `${chain.id}-${i}`;
                            const isCopied = copiedField === fieldKey;
                            return (
                              <View key={row.label} style={cdm.endpointRow}>
                                <View style={{ flex: 1, gap: 2 }}>
                                  <Text style={[cdm.endpointLabel, i === 0 && { color: chain.color }]}>{row.label}</Text>
                                  <Text style={cdm.endpointUrl} numberOfLines={2} selectable>{row.url}</Text>
                                </View>
                                <TouchableOpacity
                                  style={[cdm.copyBtn, isCopied && { backgroundColor: '#22C55E18', borderColor: '#22C55E55' }]}
                                  onPress={() => handleCopy(row.url, fieldKey)}
                                  activeOpacity={0.8}
                                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                >
                                  <MaterialIcons
                                    name={isCopied ? 'check' : 'content-copy'}
                                    size={13}
                                    color={isCopied ? '#22C55E' : Colors.textMuted}
                                  />
                                  <Text style={[cdm.copyBtnText, isCopied && { color: '#22C55E' }]}>
                                    {isCopied ? 'Copied!' : 'Copy'}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </View>

                        {/* VM Type Info */}
                        <View style={cdm.section}>
                          <Text style={cdm.sectionTitle}>VM Type</Text>
                          <View style={[cdm.vmCard, { borderColor: color + '44', backgroundColor: color + '08' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={[cdm.vmIcon, { backgroundColor: color + '22', borderColor: color + '44' }]}>
                                <Text style={{ fontSize: 22 } as any}>{chain.emoji}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[cdm.vmName, { color }]}>{TYPE_LABELS[chain.type]}</Text>
                                <Text style={cdm.vmDesc}>
                                  {chain.type === 'evm'    ? 'Ethereum Virtual Machine — Solidity smart contracts, eth_* JSON-RPC' :
                                   chain.type === 'solana' ? 'Solana Virtual Machine — Rust programs, getBalance / sendTransaction' :
                                   chain.type === 'move'   ? 'Move VM — Sui/Aptos Move language, resource-oriented programming' :
                                   chain.type === 'utxo'   ? 'UTXO Model — Bitcoin-style unspent transaction outputs, PSBT signing' :
                                   chain.type === 'cairo'  ? 'Cairo VM — StarkNet validity rollup, Cairo language contracts' :
                                   'Custom VM — chain-specific RPC interface'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>

                        {/* Wallet Methods */}
                        {vmEngine && (
                          <View style={cdm.section}>
                            <Text style={cdm.sectionTitle}>Supported Wallet Methods</Text>
                            <View style={cdm.methodsGrid}>
                              {vmEngine.methods.map(method => (
                                <TouchableOpacity
                                  key={method}
                                  style={[cdm.methodChip, { backgroundColor: color + '12', borderColor: color + '30' }]}
                                  onPress={() => handleCopy(method, `method-${method}`)}
                                  activeOpacity={0.75}
                                >
                                  <Text style={[cdm.methodChipText, { color }]}>{method}</Text>
                                  {copiedField === `method-${method}` && (
                                    <MaterialIcons name="check" size={9} color={color} />
                                  )}
                                </TouchableOpacity>
                              ))}
                            </View>
                            <Text style={cdm.methodHint}>Tap a method name to copy it to clipboard.</Text>
                          </View>
                        )}

                        <View style={{ height: 32 }} />
                      </ScrollView>
                    </View>
                  </View>
                </Modal>
              );
            })()}

            {/* BTNG Sovereign Node */}
            <Card title="BTNG Sovereign Node" icon="dns" color="#22C55E" badge="MAINNET">
              {[
                { label: 'Node Host',    val: '154.161.183.158:38982',      icon: 'wifi',           color: '#22C55E'  },
                { label: 'Bank Server', val: '168.231.79.52:8090',          icon: 'account-balance', color: Colors.primary  },
                { label: 'Chain ID',    val: 'BTNG-MAINNET',                icon: 'link',           color: '#D4A017'  },
                { label: 'Protocol',    val: 'BTNG PoV (Proof of Value)',    icon: 'verified',       color: '#9945FF'  },
                { label: 'Gold Vault',  val: 'Bank of Ghana · Accra · 500kg', icon: 'savings',      color: '#F59E0B'  },
                { label: 'Entity',      val: 'EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624', icon: 'business', color: Colors.textMuted },
              ].map(row => (
                <View key={row.label} style={s.archInfoRow}>
                  <MaterialIcons name={row.icon as any} size={13} color={row.color} />
                  <Text style={s.archInfoLabel}>{row.label}</Text>
                  <Text style={[s.archInfoVal, { color: row.color }]} numberOfLines={1}>{row.val}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        <View style={{ height: compareSet.length > 0 && tab === 'chains' ? insets.bottom + 280 : insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  scroll:       { padding: Spacing.xl, gap: Spacing.lg },

  topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:       { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  liveBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot:      { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveText:     { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  refreshBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },

  newWalletBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.successBg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.success + '33' },
  newWalletText:   { flex: 1, fontSize: FontSize.xs, color: Colors.success, includeFontPadding: false, fontWeight: FontWeight.semibold },

  tabScrollWrap:    { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabScrollContent: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tabBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:          { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },

  // Hero
  heroCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 2, borderColor: Colors.primary + '66', alignItems: 'center', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  heroStarRow:    { flexDirection: 'row', gap: 4 },
  heroTitle:      { fontSize: 22, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.5, includeFontPadding: false, textAlign: 'center' },
  heroVersion:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textSecondary, includeFontPadding: false },
  heroSubtitle:   { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, lineHeight: 18 },
  heroTagRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  heroTag:        { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  heroTagText:    { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Architecture diagram
  archDiagram:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  archNode:       { alignItems: 'center', gap: 4 },
  archIconWrap:   { width: 52, height: 52, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  archStep:       { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bgCard },
  archStepText:   { fontSize: 10, fontWeight: FontWeight.heavy, color: '#fff', includeFontPadding: false },
  archLabel:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  archSub:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Init form
  initCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.warning + '55', gap: Spacing.md },
  initHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  initTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  initDesc:       { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  inputWrap:      { gap: 5 },
  inputLabel:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.3, includeFontPadding: false },
  input:          { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  pwRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pwToggle:       { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  initBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 4, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  initBtnText:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Stats grid
  statGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard:       { flex: 1, minWidth: '30%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:        { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  statLabel:      { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Entity rows
  entityRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  entityIconWrap: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  entityLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  entityKey:      { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: 1 },
  entityBal:      { fontSize: 10, color: Colors.textSecondary, includeFontPadding: false, marginTop: 2 },
  balRow:         { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  balBig:         { fontSize: 20, fontWeight: FontWeight.heavy, includeFontPadding: false },
  balUnit:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Tx stats
  txStatsRow:     { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  txStatCell:     { flex: 1, alignItems: 'center', gap: 3 },
  txStatVal:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  txStatLabel:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  // Transaction rows
  txRow:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  txIconWrap:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txType:         { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  txNote:         { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  txDate:         { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  txAmount:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false, flexShrink: 0 },

  // Form
  formRow:        { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' },
  fieldLabel:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.3, includeFontPadding: false, marginBottom: 4 },
  fieldInput:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },

  // Merchant chips
  merchantChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  merchantChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  merchantChipText:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },

  // Action btn
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  actionBtnText:{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },

  // Steps
  stepsRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stepNode:       { alignItems: 'center', gap: 4 },
  stepCircle:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepNum:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  stepLabel:      { fontSize: 9, fontWeight: FontWeight.semibold, includeFontPadding: false },
  stepConnector:  { flex: 1, height: 2, backgroundColor: Colors.bgElevated, borderRadius: 1 },

  // Completed
  completedBanner:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.successBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44' },
  completedText:  { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  // Pipeline
  pipelineRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pipelineId:     { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  pipelineInfo:   { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 5 },
  pipelineInfoRow:{ flexDirection: 'row', justifyContent: 'space-between' },
  pipelineLabel:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  pipelineValue:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, maxWidth: '60%', textAlign: 'right' },

  // Signatures
  sigRow:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  sigDot:         { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  sigLabel:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  sigValue:       { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: 2 },
  sigPending:     { fontSize: 9, color: Colors.warning, includeFontPadding: false },
  sigChip:        { paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  sigChipText:    { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Payments
  paymentRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  paymentTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paymentAmount:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  paymentMerchant:{ fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, marginTop: 2 },
  paymentDate:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  paymentSigs:    { flexDirection: 'row', gap: 4, marginTop: 4 },
  continueBtn:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  continueBtnText:{ fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Keys
  keySection:       { gap: 5, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border + '55' },
  keySectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  keySectionTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  keySectionSub:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  archInfoRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  archInfoLabel:    { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  archInfoVal:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false, maxWidth: '55%', textAlign: 'right' },

  // Merchant rows
  merchantRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  merchantIconWrap: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  merchantNameRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  merchantName:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  merchantCat:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  merchantKey:      { fontSize: 8, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: 2 },
  merchantBal:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#9945FF', includeFontPadding: false },
  merchantBalUnit:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Invoice
  invoiceCard:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '44', gap: 5 },
  invoiceHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  invoiceTitle:   { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  invoiceId:      { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  invoiceQr:      { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  invoiceRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  invoiceLabel:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  invoiceValue:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },

  // Audit log
  auditRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  auditDot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0, marginTop: 4 },
  auditTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  auditAction:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  auditTime:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  auditEntity:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  auditDetails:   { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },

  // Misc
  infoText:   { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  emptyText:  { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg, includeFontPadding: false },

  // Auto-probe banner
  autoProbeBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderWidth: 1.5, borderColor: Colors.primary + '55', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  autoProbeBannerText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.3 },
  autoProbeLiveDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, opacity: 0.85 },
});

// ── Chain Detail Modal Styles ─────────────────────────────────────────────────
const cdm = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', borderWidth: 1, borderBottomWidth: 0, borderColor: Colors.border, paddingBottom: 0 },
  handle:          { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 },

  headerRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  chainEmoji:      { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chainName:       { fontSize: 20, fontWeight: FontWeight.heavy, includeFontPadding: false },
  typeBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  typeBadgeText:   { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.4 },
  probeDot:        { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  closeBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  scrollArea:      { paddingHorizontal: Spacing.xl },
  section:         { paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', gap: Spacing.sm },
  sectionTitle:    { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.0, includeFontPadding: false, textTransform: 'uppercase' },

  // Probe
  probeCard:       { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  probeTopRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  probeStatus:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  probeLatency:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false, marginLeft: 'auto' as any },
  probeDetailRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  probeDetailLabel:{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  probeDetailVal:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'right', flex: 1 },
  probeBtn:        { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: 9, paddingHorizontal: Spacing.md, justifyContent: 'center', marginTop: 4 },
  probeBtnText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  noProbeText:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, paddingVertical: 4 },

  // Endpoints
  endpointRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  endpointLabel:   { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.3, includeFontPadding: false },
  endpointUrl:     { fontSize: 10, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 15 },
  copyBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: Colors.bgElevated, borderColor: Colors.border, flexShrink: 0 },
  copyBtnText:     { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },

  // VM
  vmCard:          { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md },
  vmIcon:          { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  vmName:          { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  vmDesc:          { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false, marginTop: 3 },

  // Methods
  methodsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  methodChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  methodChipText:  { fontSize: 10, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  methodHint:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
});

// ── Compare Bar Styles ──────────────────────────────────────────────────────────
const cmp = StyleSheet.create({
  selectedRow:     { borderWidth: 1.5, borderColor: Colors.primary + '66', borderRadius: Radius.lg, backgroundColor: Colors.primary + '08' },
  selectedBadge:   { position: 'absolute', top: 6, left: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  selectedBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },

  bar:             { backgroundColor: Colors.bgCard, borderTopWidth: 1.5, borderTopColor: Colors.primary + '44', paddingTop: Spacing.md, paddingHorizontal: Spacing.lg, gap: Spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 16 },
  barHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  barTitle:        { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  barCountBadge:   { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '55' },
  barCountText:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  clearBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  clearBtnText:    { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },

  tableHead:       { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  colHead:         { flex: 1, alignItems: 'center', gap: 3 },
  colName:         { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  colRemoveBtn:    { padding: 2 },

  tableRow:        { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  rowLabel:        { width: 56, fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false, alignSelf: 'center', flexShrink: 0 },
  cell:            { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: 6, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', minHeight: 30 },
  cellText:        { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  hint:            { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, paddingBottom: 2 },
});

// ── Chain Filter Chip Bar Styles ────────────────────────────────────────────────
const cf = StyleSheet.create({
  bar:           { marginBottom: -Spacing.sm },
  content:       { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1.5 },
  chipText:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  chipCount:     { borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, minWidth: 18, alignItems: 'center' },
  chipCountText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ── Chain Probe Styles ─────────────────────────────────────────────────────────
const pv = StyleSheet.create({
  probeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#3B82F610', borderRadius: Radius.lg, paddingVertical: 12, paddingHorizontal: Spacing.md, borderWidth: 1.5, borderColor: '#3B82F633', marginTop: 4 },
  probeBtnText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#3B82F6', includeFontPadding: false },
  probeDoneChip:{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#22C55E18', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#22C55E44' },
  probeDoneText:{ fontSize: 9, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  summaryRow:   { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', paddingTop: 4 },
  summaryChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  summaryText:  { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  avgText:      { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  dot:          { width: 6, height: 6, borderRadius: 3 },
  chainStatus:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, minWidth: 72, justifyContent: 'center', flexShrink: 0 },
  chainStatusDot: { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
  chainStatusText:{ fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  exportBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22C55E15', borderRadius: Radius.md, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: '#22C55E44' },
  exportBtnText:{ fontSize: 9, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
});
