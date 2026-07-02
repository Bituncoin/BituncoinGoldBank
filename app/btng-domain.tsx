/**
 * BTNG Web3 Domain Portfolio Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages BTNG Freename domains minted on Polygon (ERC-721) and Solana W3:
 *   • bituncoin.genesis — Solana W3 domain
 *   • btng.gold  — Sovereign gold banking domain
 *   • btng.token — CRYPTO category W3 SLD with DeFi wallet + email hosting
 *
 * Tabs: Portfolio · Records · Add · Settings · Verify
 * Domain switcher selects active domain for Records / Add / Settings / Verify.
 * Records persist to btng_domain_records (OnSpace Cloud, RLS enabled).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Easing, Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';
import { reverseResolveAddressFull, fetchNamespaces, setBlockchainAddress, type FreenameZoneResult, type FreenameNamespace } from '@/services/freenameResolverService';
import {
  fetchZoneForDomain, syncZoneRecords, getCurrentFreenameUser,
  createZoneRecords, deleteZoneRecord,
  type FreenameZoneMgmt, type FreenameRecordMgmt,
} from '@/services/freenameManagementService';
import { useAuth0Api } from '@/hooks/useAuth0Api';

// ─── Customer Service Bitcoin Address ────────────────────────────────────────
const BTC_CUSTOMER_SERVICE_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

// ─── Domain Registry ──────────────────────────────────────────────────────────
const DOMAIN_REGISTRY = {
  'bituncoin.genesis': {
    domain:          'bituncoin.genesis',
    displayName:     'bituncoin.genesis',
    namespace:       'W3 · SOL',
    emoji:           '⚡',
    color:           '#9945FF',
    chainColor:      '#9945FF',
    contractShort:   'A3bYvnAb…U1dLQ9cr',
    contractFull:    'A3bYvnAbvB2nSu1KzJHyeyqVH4AzPScYGf5fQ7xpeA3TZiWpmNoTR4gbfUmbuCNUwC2BGm18Vxyhs7HU1dLQ9cr',
    tokenId:         null as string | null,
    ownerAddress:    '0xc9b4cf095C32fEbAE79389922c5a718247F6332b' as string | null,
    defiWallet:      'DAqCpTpQN1JNCDYLXWir28q1J2eXSufiNNADsSnUQTBZ' as string | null,
    defiConnected:   true,
    purchasePrice:   '$3.50' as string | null,
    renewalPrice:    null as string | null,
    estimatedValue:  '$0' as string | null,
    estimator:       'HumbleWorth' as string | null,
    transferLock:    false,
    autoRenewal:     false,
    expiryDate:      null as string | null,
    category:        'WEB3 IDENTITY',
    mintDate:        '26 Jun 2026',
    nftFormat:       'SPL',
    chain:           'Solana',
    registry:        'W3 Domains',
    hasEmailHosting: false,
    description:     'Solana W3 domain — minted on BTNG sovereign infrastructure. Primary Web3 identity on the Solana blockchain.',
  },
  'btng.gold': {
    domain:          'btng.gold',
    displayName:     'btng.gold',
    namespace:       'GOLD',
    emoji:           '🥇',
    color:           '#D4A017',
    chainColor:      '#8247E5',
    contractShort:   '0xc7aaab...efbf2e',
    contractFull:    '0xc7aaabd2a09c7be1c65d15d494efbf2e',
    tokenId:         null as string | null,
    ownerAddress:    null as string | null,
    defiWallet:      null as string | null,
    defiConnected:   false,
    purchasePrice:   null as string | null,
    renewalPrice:    null as string | null,
    estimatedValue:  null as string | null,
    estimator:       null as string | null,
    transferLock:    false,
    autoRenewal:     false,
    expiryDate:      null as string | null,
    category:        'FINANCE',
    mintDate:        '25 Jun 2026',
    nftFormat:       'ERC721',
    chain:           'Polygon',
    registry:        'Freename',
    hasEmailHosting: false,
    description:     'Sovereign gold banking domain — primary Web3 identity for BTNG Gold Coin across 54 African nations.',
  },
  'btng.token': {
    domain:          'btng.token',
    displayName:     'btng.token',
    namespace:       'TOKEN · W3 SLD',
    emoji:           '🔷',
    color:           '#8247E5',
    chainColor:      '#8247E5',
    contractShort:   '0xab106bbb...2eea695d',
    contractFull:    '0xab106bbb2eea695d',
    tokenId:         '186993402989047...',
    ownerAddress:    '0xc9b4cf095c32f...',
    defiWallet:      '8jPHBCam...nnKnvMte',
    defiConnected:   true,
    purchasePrice:   '$34.65',
    renewalPrice:    '$99.00/yr',
    estimatedValue:  '$0',
    estimator:       'HumbleWorth',
    transferLock:    true,
    autoRenewal:     false,
    expiryDate:      null as string | null,
    category:        'CRYPTO',
    mintDate:        '25 Jun 2026',
    nftFormat:       'ERC721',
    chain:           'Polygon',
    registry:        'Freename',
    hasEmailHosting: true,
    description:     'CRYPTO category W3 SLD — ERC-721 on Polygon with DeFi wallet connected, transfer lock ON, and Web3 email hosting.',
  },
} as const;

type DomainKey = keyof typeof DOMAIN_REGISTRY;
const ALL_DOMAINS: DomainKey[] = ['bituncoin.genesis', 'btng.gold', 'btng.token'];

// helper: cycle to next domain
const nextDomain = (current: DomainKey): DomainKey =>
  ALL_DOMAINS[(ALL_DOMAINS.indexOf(current) + 1) % ALL_DOMAINS.length];

// ─── Email Providers ──────────────────────────────────────────────────────────
const EMAIL_PROVIDERS = [
  {
    name:  'EtherMail',
    emoji: '📧',
    color: '#3B82F6',
    desc:  'Anonymous Web3 email with blockchain encryption. Connect your ETH wallet address as your inbox.',
    url:   'https://ethermail.io',
  },
  {
    name:  'Mailchain',
    emoji: '✉️',
    color: '#8247E5',
    desc:  'Send and receive email using your blockchain address. Works across ETH, Polygon, Solana, and more.',
    url:   'https://mailchain.com',
  },
  {
    name:  'LedgerMail',
    emoji: '🔐',
    color: '#1C1C1E',
    desc:  'Hardware wallet secured email hosting via Ledger integration. Maximum security for sensitive communications.',
    url:   'https://ledger.com',
  },
];

// ─── Supported chains ─────────────────────────────────────────────────────────
const CHAINS: { key: string; label: string; symbol: string; emoji: string; color: string; placeholder: string }[] = [
  { key: 'BTNG',    label: 'BTNG Gold Coin',  symbol: 'BTNGG', emoji: '🥇', color: '#D4A017', placeholder: 'BTNG-GOLD-GH-...' },
  { key: 'ETH',     label: 'Ethereum',        symbol: 'ETH',   emoji: '🔷', color: '#627EEA', placeholder: '0x...' },
  { key: 'POLYGON', label: 'Polygon',         symbol: 'MATIC', emoji: '🟣', color: '#8247E5', placeholder: '0x...' },
  { key: 'BTC',     label: 'Bitcoin',         symbol: 'BTC',   emoji: '🟠', color: '#F7931A', placeholder: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
  { key: 'BNB',     label: 'BNB Chain',       symbol: 'BNB',   emoji: '🟡', color: '#F0B90B', placeholder: '0x...' },
  { key: 'SOL',     label: 'Solana',          symbol: 'SOL',   emoji: '💎', color: '#9945FF', placeholder: 'sol...' },
  { key: 'USDT',    label: 'Tether (TRC-20)', symbol: 'USDT',  emoji: '💵', color: '#26A17B', placeholder: 'T...' },
  { key: 'XRP',     label: 'Ripple',          symbol: 'XRP',   emoji: '🔵', color: '#346AA9', placeholder: 'r...' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface DomainRecord {
  id: string;
  user_id: string;
  domain: string;
  chain: string;
  coin_symbol: string;
  wallet_address: string;
  label: string | null;
  is_primary: boolean;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

type TabKey = 'portfolio' | 'records' | 'add' | 'settings' | 'verify';

// ─── Live Dot ─────────────────────────────────────────────────────────────────
function LiveDot({ color = Colors.success, size = 8 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.8, duration: 800, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1,   duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.28, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Copy Row ─────────────────────────────────────────────────────────────────
function CopyRow({ label, value, color = Colors.primary, mono = false }: { label: string; value: string; color?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { Clipboard.setStringAsync(value).catch(()=>{}); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <View style={cr.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={cr.label}>{label}</Text>
        <Text style={[cr.value, { color }, mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 }]} selectable numberOfLines={1} ellipsizeMode="middle">{value}</Text>
      </View>
      <TouchableOpacity style={[cr.btn, copied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]} onPress={handleCopy} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name={copied ? 'check' : 'content-copy'} size={14} color={copied ? Colors.success : Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
const cr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  label: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  value: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  btn:   { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BTNGDomainScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { user }      = useAuth();
  const { showAlert } = useAlert();
  const supabase      = getSupabaseClient();
  const {
    isAuthenticated: freenameAuth,
    login:           freenameLogin,
    logout:          freenameLogout,
    operationLoading:freenameOpLoading,
    error:           freenameError,
    userInfo:        freenameUserInfo,
    getAccessToken,
  } = useAuth0Api();

  const [tab,            setTab]           = useState<TabKey>('portfolio');
  const [selectedDomain, setSelectedDomain]= useState<DomainKey>('bituncoin.genesis');

  const cfg = DOMAIN_REGISTRY[selectedDomain];

  // ── Records state ──────────────────────────────────────────────────────────
  const [records,         setRecords]         = useState<DomainRecord[]>([]);
  const [recordsLoading,  setRecordsLoading]  = useState(false);
  const [recordsRefresh,  setRecordsRefresh]  = useState(false);
  const [allRecords,      setAllRecords]      = useState<Record<DomainKey, DomainRecord[]>>({ 'bituncoin.genesis': [], 'btng.gold': [], 'btng.token': [] });
  const [portfolioLoading,setPortfolioLoading]= useState(false);

  // ── BTC Customer Service QR modal ─────────────────────────────────────────
  const [btcCsModal,       setBtcCsModal]       = useState(false);
  const [btcCsShareLoading,setBtcCsShareLoading]= useState(false);
  const btcCsQrRef = useRef<any>(null);

  // ── Bulk BTC link state ───────────────────────────────────────────────────
  const [bulkLinkLoading, setBulkLinkLoading] = useState(false);
  const [bulkLinkResult,  setBulkLinkResult]  = useState<{ linked: number; skipped: number } | null>(null);

  // ── Share Modal ─────────────────────────────────────────────────────────────
  const [shareModal,    setShareModal]    = useState<{ domain: DomainKey } | null>(null);
  const [shareLoading,  setShareLoading]  = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const qrRefs = useRef<Record<string, any>>({});

  // ── Payment QR modal ───────────────────────────────────────────────────────
  const [addressQrModal,    setAddressQrModal]    = useState<{ address: string; chain: string; domain: DomainKey; color: string; emoji: string } | null>(null);
  const [payQrShareLoading, setPayQrShareLoading] = useState(false);
  const payQrRef = useRef<any>(null);

  // ── Add Record form ────────────────────────────────────────────────────────
  const [selChain,   setSelChain]   = useState(CHAINS[0]);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel,   setNewLabel]   = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // ── Verify tab ─────────────────────────────────────────────────────────────
  const [verifyDomain,  setVerifyDomain]  = useState('bituncoin.genesis');
  const [domainChainFilter, setDomainChainFilter] = useState<'All' | 'Polygon' | 'Solana'>('All');
  const [verifyChain,   setVerifyChain]   = useState('SOL');
  const [verifyResult,  setVerifyResult]  = useState<DomainRecord | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError,   setVerifyError]   = useState('');

  // ── Reverse Lookup ──────────────────────────────────────────────────────────
  const [reverseAddr,    setReverseAddr]    = useState('');
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseError,   setReverseError]   = useState('');
  const [reverseResults, setReverseResults] = useState<FreenameZoneResult[] | null>(null);

  // ── Freename API state ──────────────────────────────────────────────────────
  const [namespaces,       setNamespaces]       = useState<FreenameNamespace[]>([]);
  const [namespacesLoaded, setNamespacesLoaded] = useState(false);
  const [publishLoading,   setPublishLoading]   = useState(false);
  const [publishResult,    setPublishResult]    = useState<{ success: boolean; message: string } | null>(null);
  const [freenameUser,     setFreenameUser]     = useState('');
  const [freenamePass,     setFreenamePass]     = useState('');

  // ── Freename Management API state ────────────────────────────────────────────
  const [zoneData,         setZoneData]         = useState<Record<string, FreenameZoneMgmt | null>>({});
  const [zoneLoading,      setZoneLoading]      = useState(false);
  const [syncLoading,      setSyncLoading]      = useState(false);
  const [syncResult,       setSyncResult]       = useState<{ synced: number; domain: string } | null>(null);
  const [apiRecords,       setApiRecords]       = useState<FreenameRecordMgmt[]>([]);
  const [freenameProfile,  setFreenameProfile]  = useState<{ uuid: string; username: string; email: string } | null>(null);

  // ── Load records for a specific domain (declared before handleBulkLinkBTC) ──
  const loadRecordsRef = React.useRef<(domain: DomainKey, isRefresh?: boolean) => Promise<void>>();

  const loadRecordsImpl = useCallback(async (domain: DomainKey, isRefresh = false) => {
    if (!user) return;
    if (domain === selectedDomain) {
      if (isRefresh) setRecordsRefresh(true); else setRecordsLoading(true);
    }
    try {
      const { data, error } = await supabase
        .from('btng_domain_records')
        .select('*')
        .eq('user_id', (user as any).id)
        .eq('domain', domain)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false });
      if (!error && data) {
        const rows = data as DomainRecord[];
        setRecords(prev => domain === selectedDomain ? rows : prev);
        setAllRecords(prev => ({ ...prev, [domain]: rows }));
      }
    } catch { /* silent */ } finally {
      if (domain === selectedDomain) {
        if (isRefresh) setRecordsRefresh(false); else setRecordsLoading(false);
      }
    }
  }, [user, selectedDomain]);

  loadRecordsRef.current = loadRecordsImpl;

  const loadPortfolioRef = React.useRef<() => Promise<void>>();

  const loadPortfolioImpl = useCallback(async () => {
    if (!user) return;
    setPortfolioLoading(true);
    await Promise.all(ALL_DOMAINS.map(d => loadRecordsRef.current!(d)));
    setPortfolioLoading(false);
  }, [user]);

  loadPortfolioRef.current = loadPortfolioImpl;

  // ── Bulk link BTC to all 3 domains in parallel ────────────────────────────
  const handleBulkLinkBTC = useCallback(async () => {
    if (!user) { showAlert('Login Required', 'Please sign in to link records.'); return; }
    setBulkLinkLoading(true);
    setBulkLinkResult(null);
    try {
      const results = await Promise.all(
        ALL_DOMAINS.map(async (dk) => {
          const { data: existing } = await supabase
            .from('btng_domain_records')
            .select('id')
            .eq('user_id', (user as any).id)
            .eq('domain', dk)
            .eq('chain', 'BTC')
            .eq('wallet_address', BTC_CUSTOMER_SERVICE_ADDRESS)
            .maybeSingle();
          if (existing) return 'skipped';
          const { error } = await supabase.from('btng_domain_records').insert({
            user_id:        (user as any).id,
            domain:         dk,
            chain:          'BTC',
            coin_symbol:    'BTC',
            wallet_address: BTC_CUSTOMER_SERVICE_ADDRESS,
            label:          'BTNG Customer Service BTC',
            is_primary:     true,
            verified:       false,
          });
          return error ? 'error' : 'linked';
        })
      );
      const linked  = results.filter(r => r === 'linked').length;
      const skipped = results.filter(r => r === 'skipped').length;
      setBulkLinkResult({ linked, skipped });
      if (linked > 0) {
        showAlert(
          'BTC Linked',
          `${BTC_CUSTOMER_SERVICE_ADDRESS.slice(0, 16)}… added to ${linked} domain${linked !== 1 ? 's' : ''}.${skipped > 0 ? ` (${skipped} already existed)` : ''}`
        );
        await loadPortfolioRef.current!();
      } else {
        showAlert('Already Linked', 'BTC customer service address is already linked to all domains.');
      }
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Bulk link failed.');
    } finally {
      setBulkLinkLoading(false);
    }
  }, [user, supabase, showAlert]);

  // ── Share QR handler ────────────────────────────────────────────────────────
  const handleShareQR = useCallback(async (domain: DomainKey) => {
    const ref = qrRefs.current[domain];
    if (!ref) {
      showAlert('Not Ready', 'QR code not yet rendered — please try again in a moment.');
      return;
    }
    setShareLoading(true);
    ref.toDataURL(async (data: string) => {
      try {
        const fileName = `btng_${domain.replace('.', '_')}_qr.png`;
        const filePath = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(filePath, data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'image/png',
            dialogTitle: `Share ${domain} — BTNG Web3 Domain`,
            UTI: 'public.png',
          });
        } else {
          showAlert('QR Saved', `QR code for ${domain} has been saved to app storage.`);
        }
      } catch (e: any) {
        showAlert('Share Error', e?.message ?? 'Failed to share QR code.');
      } finally {
        setShareLoading(false);
      }
    });
  }, [showAlert]);

  // Stable aliases used throughout the component
  const loadRecords = loadRecordsImpl;
  const loadPortfolio = loadPortfolioImpl;

  useEffect(() => {
    if (tab === 'portfolio') loadPortfolio();
    else if (tab === 'records') {
      loadRecords(selectedDomain);
      if (freenameAuth) loadZoneData(selectedDomain);
    }
    else if (tab === 'settings') {
      if (freenameAuth) loadZoneData(selectedDomain);
    }
    else if (tab === 'verify') loadNamespaces();
  }, [tab, selectedDomain, freenameAuth]);

  // ── Add record ─────────────────────────────────────────────────────────────
  const handleAddRecord = useCallback(async () => {
    if (!user) { showAlert('Login Required', 'Please sign in to add domain records.'); return; }
    const addr = newAddress.trim();
    if (!addr) { showAlert('Address Required', 'Enter a wallet address for this chain.'); return; }
    setAddLoading(true);
    try {
      const isPrimary = records.filter(r => r.chain === selChain.key).length === 0;
      const { error } = await supabase.from('btng_domain_records').insert({
        user_id: (user as any).id, domain: selectedDomain,
        chain: selChain.key, coin_symbol: selChain.symbol,
        wallet_address: addr, label: newLabel.trim() || null,
        is_primary: isPrimary, verified: false,
      });
      if (error) throw new Error(error.message);
      showAlert('Record Added', `${selChain.symbol} address linked to ${selectedDomain}`);
      setNewAddress(''); setNewLabel('');
      setTab('records');
      await loadRecords(selectedDomain);
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Could not add record.');
    } finally { setAddLoading(false); }
  }, [user, newAddress, newLabel, selChain, records, selectedDomain, loadRecords, showAlert]);

  // ── Set primary ────────────────────────────────────────────────────────────
  const handleSetPrimary = useCallback(async (record: DomainRecord) => {
    if (!user) return;
    try {
      await supabase.from('btng_domain_records').update({ is_primary: false }).eq('user_id', (user as any).id).eq('domain', selectedDomain).eq('chain', record.chain);
      await supabase.from('btng_domain_records').update({ is_primary: true }).eq('id', record.id);
      await loadRecords(selectedDomain);
    } catch { /* silent */ }
  }, [user, selectedDomain, loadRecords]);

  // ── Delete record ──────────────────────────────────────────────────────────
  const handleDelete = useCallback((record: DomainRecord) => {
    showAlert('Remove Record', `Remove ${record.coin_symbol} from ${selectedDomain}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('btng_domain_records').delete().eq('id', record.id);
        await loadRecords(selectedDomain);
      }},
    ]);
  }, [showAlert, selectedDomain, loadRecords]);

  // ── Reverse resolver ────────────────────────────────────────────────────────
  const handleReverseResolve = useCallback(async () => {
    const addr = reverseAddr.trim();
    if (!addr) { showAlert('Address Required', 'Enter a wallet address to reverse-resolve.'); return; }
    setReverseLoading(true);
    setReverseResults(null);
    setReverseError('');
    try {
      const results = await reverseResolveAddressFull(addr);
      if (results.length === 0) setReverseError(`No Freename domains found for this address`);
      else setReverseResults(results);
    } catch (e: any) {
      setReverseError(e?.message ?? 'Reverse lookup failed.');
    } finally {
      setReverseLoading(false);
    }
  }, [reverseAddr, showAlert]);

  // ── Verify resolver ────────────────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    setVerifyLoading(true); setVerifyResult(null); setVerifyError('');
    const domainLower = verifyDomain.toLowerCase().trim();
    const chainUpper  = verifyChain.toUpperCase().trim();
    try {
      // Step 0: W3 Domains Solana resolver for bituncoin.genesis
      if (domainLower === 'bituncoin.genesis') {
        const { resolveW3Domain } = require('@/services/freenameResolverService');
        try {
          const w3 = await resolveW3Domain(domainLower, chainUpper);
          if (w3) {
            // Build a synthetic DomainRecord for display
            setVerifyResult({
              id: 'w3-resolved',
              user_id: '',
              domain: domainLower,
              chain: chainUpper,
              coin_symbol: chainUpper,
              wallet_address: w3.wallet_address,
              label: `W3 Domains · Solana (${w3.record_type ?? 'SOL'})`,
              is_primary: true,
              verified: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as DomainRecord);
            setVerifyLoading(false);
            return;
          }
        } catch { /* fall through to local */ }
      }

      // Step 1: Freename FNS resolver for btng.gold / btng.token
      if (domainLower !== 'bituncoin.genesis') {
        const { resolveDomainFromFreename } = require('@/services/freenameResolverService');
        try {
          const fns = await resolveDomainFromFreename(domainLower, chainUpper);
          if (fns) {
            setVerifyResult({
              id: 'freename-resolved',
              user_id: '',
              domain: domainLower,
              chain: chainUpper,
              coin_symbol: chainUpper,
              wallet_address: fns.wallet_address,
              label: `Freename FNS (${fns.record_type ?? chainUpper})`,
              is_primary: true,
              verified: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as DomainRecord);
            setVerifyLoading(false);
            return;
          }
        } catch { /* fall through to local DB */ }
      }

      // Step 2: Local btng_domain_records
      const { data, error } = await supabase
        .from('btng_domain_records').select('*')
        .eq('domain', domainLower)
        .eq('chain', chainUpper)
        .eq('is_primary', true).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) setVerifyError(`No primary record for ${verifyDomain} on ${verifyChain}`);
      else setVerifyResult(data as DomainRecord);
    } catch (e: any) { setVerifyError(e.message ?? 'Resolver lookup failed.'); }
    finally { setVerifyLoading(false); }
  }, [verifyDomain, verifyChain]);

  // ── Freename namespace loader ─────────────────────────────────────────────────
  const loadNamespaces = useCallback(async () => {
    if (namespacesLoaded) return;
    const ns = await fetchNamespaces();
    setNamespaces(ns);
    setNamespacesLoaded(true);
  }, [namespacesLoaded]);

  // ── Load live zone data from Freename Management API ─────────────────────────
  const loadZoneData = useCallback(async (domainName: string) => {
    if (!freenameAuth) return;
    setZoneLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const { zone } = await fetchZoneForDomain(domainName, token);
      setZoneData(prev => ({ ...prev, [domainName]: zone }));
      if (!freenameProfile) {
        const profile = await getCurrentFreenameUser(token);
        if (profile) setFreenameProfile(profile);
      }
    } catch { } finally { setZoneLoading(false); }
  }, [freenameAuth, getAccessToken, freenameProfile]);

  // ── Sync records from Freename into local DB ──────────────────────────────────
  const handleSyncFromFreename = useCallback(async () => {
    if (!user || !freenameAuth) {
      showAlert('Freename Not Connected', 'Connect your Freename account in the Settings tab first.');
      return;
    }
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const token = await getAccessToken();
      if (!token) { showAlert('Auth Error', 'Could not get access token.'); return; }
      const { records: fRecords, zone, error } = await syncZoneRecords(selectedDomain, token);
      if (error) { showAlert('Sync Error', error); return; }
      if (zone) setZoneData(prev => ({ ...prev, [selectedDomain]: zone }));
      setApiRecords(fRecords);
      if (fRecords.length === 0) { showAlert('No Records', 'No records found on Freename for ' + selectedDomain + '.'); return; }
      let synced = 0;
      for (const rec of fRecords) {
        if (!rec.type || ['A', 'CNAME', 'NS', 'TXT', 'MX'].includes(rec.type.toUpperCase())) continue;
        const chain = rec.type.toUpperCase() === 'MATIC' ? 'POLYGON' : rec.type.toUpperCase();
        const existing = records.find(r => r.chain === chain && r.wallet_address === rec.value);
        if (existing) continue;
        const { error: insErr } = await supabase.from('btng_domain_records').insert({
          user_id: (user as any).id, domain: selectedDomain, chain,
          coin_symbol: rec.type.toUpperCase(), wallet_address: rec.value,
          label: 'Synced from Freename', is_primary: false, verified: true,
        });
        if (!insErr) synced++;
      }
      setSyncResult({ synced, domain: selectedDomain });
      if (synced > 0) { showAlert('Sync Complete', synced + ' new record' + (synced !== 1 ? 's' : '') + ' synced from Freename.'); await loadRecords(selectedDomain); }
      else showAlert('Up to Date', 'All Freename records are already in your local DB.');
    } catch (e: any) {
      showAlert('Sync Failed', e?.message ?? 'Unknown error.');
    } finally { setSyncLoading(false); }
  }, [user, freenameAuth, getAccessToken, selectedDomain, records, loadRecords, showAlert]);

  // ── Delete a record from Freename Management API ──────────────────────────────
  const handleDeleteFromFreename = useCallback(async (freenameUuid: string, label: string) => {
    if (!freenameAuth) { showAlert('Not Connected', 'Connect your Freename account in Settings first.'); return; }
    showAlert('Delete from Freename?', 'Remove "' + label + '" from the Freename registry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const token = await getAccessToken();
        if (!token) return;
        const { success, error } = await deleteZoneRecord(freenameUuid, token);
        if (success) { showAlert('Deleted', 'Record removed from Freename registry.'); await loadZoneData(selectedDomain); }
        else showAlert('Error', error ?? 'Could not delete record.');
      }},
    ]);
  }, [freenameAuth, getAccessToken, selectedDomain, loadZoneData, showAlert]);

  // ── Freename login ────────────────────────────────────────────────────────────
  const handleFreenameLogin = useCallback(async () => {
    if (!freenameUser.trim() || !freenamePass.trim()) {
      showAlert('Required', 'Enter your Freename username and password.');
      return;
    }
    const result = await freenameLogin(freenameUser.trim(), freenamePass.trim());
    if (result.success) {
      showAlert('Connected', 'Freename account connected. You can now publish addresses to the on-chain registry.');
      setFreenamePass('');
    }
  }, [freenameUser, freenamePass, freenameLogin, showAlert]);

  // ── Set blockchain address on Freename ────────────────────────────────────────
  const handleSetAddress = useCallback(async (domainName: string, address: string) => {
    setPublishLoading(true);
    setPublishResult(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        showAlert('Not Connected', 'Connect your Freename account in Settings → Freename API.');
        return;
      }
      const result = await setBlockchainAddress(domainName, address, token);
      setPublishResult({
        success: result.success,
        message: result.success ? (result.message ?? 'Address saved on Freename.') : (result.error ?? 'Publish failed.'),
      });
      if (result.success) showAlert('Published', `${address.slice(0, 16)}… linked to ${domainName} on Freename registry.`);
      else showAlert('Freename Error', result.error ?? 'Could not save address on Freename.');
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Publish failed.');
    } finally {
      setPublishLoading(false);
    }
  }, [getAccessToken, showAlert]);

  // ── Export records to CSV ────────────────────────────────────────────────────
  const handleExportRecords = useCallback(async () => {
    const filtered = ALL_DOMAINS.filter(dk =>
      domainChainFilter === 'All' || DOMAIN_REGISTRY[dk].chain === domainChainFilter
    );
    const allRows: DomainRecord[] = [];
    filtered.forEach(dk => { (allRecords[dk] ?? []).forEach(r => allRows.push(r)); });
    if (allRows.length === 0) {
      showAlert('No Records', 'No records to export for the selected chain filter.');
      return;
    }
    setExportLoading(true);
    try {
      const header = 'domain,chain,coin_symbol,wallet_address,is_primary,label,verified,created_at\n';
      const rows = allRows.map(r =>
        `"${r.domain}","${r.chain}","${r.coin_symbol}","${r.wallet_address}",${r.is_primary},"${r.label ?? ''}",${r.verified},"${r.created_at}"`
      ).join('\n');
      const csvContent = header + rows;
      const fileName = `btng_domains_${domainChainFilter.toLowerCase()}_${Date.now()}.csv`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Export BTNG Domain Records',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        showAlert('Exported', `${allRows.length} record${allRows.length !== 1 ? 's' : ''} saved to ${fileName}`);
      }
    } catch (e: any) {
      showAlert('Export Error', e?.message ?? 'Could not export records.');
    } finally {
      setExportLoading(false);
    }
  }, [domainChainFilter, allRecords, showAlert]);

  // ── Share BTC CS QR ───────────────────────────────────────────────────────
  const handleShareBtcCsQr = useCallback(async () => {
    if (!btcCsQrRef.current) return;
    setBtcCsShareLoading(true);
    btcCsQrRef.current.toDataURL(async (data: string) => {
      try {
        const fp = `${FileSystem.documentDirectory}btng_btc_cs_qr.png`;
        await FileSystem.writeAsStringAsync(fp, data, { encoding: FileSystem.EncodingType.Base64 });
        const ok = await Sharing.isAvailableAsync();
        if (ok) await Sharing.shareAsync(fp, { mimeType: 'image/png', dialogTitle: 'BTNG BTC Customer Service QR', UTI: 'public.png' });
        else showAlert('QR Saved', 'Bitcoin QR code saved to app storage.');
      } catch (e: any) {
        showAlert('Error', e?.message ?? 'Share failed.');
      } finally {
        setBtcCsShareLoading(false);
      }
    });
  }, [showAlert]);

  const chainCfg = (key: string) => CHAINS.find(c => c.key === key) ?? CHAINS[0];

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'portfolio', label: 'Portfolio', icon: 'dashboard'       },
    { key: 'records',   label: 'Records',   icon: 'link'            },
    { key: 'add',       label: 'Add',       icon: 'add-circle'      },
    { key: 'settings',  label: 'Settings',  icon: 'settings'        },
    { key: 'verify',    label: 'Verify',    icon: 'verified-user'   },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Web3 Domains</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color="#9945FF" size={6} />
            <Text style={[s.topSub, { color: '#9945FF' }]}>{ALL_DOMAINS.length} Domains · Polygon + Solana</Text>
          </View>
        </View>
        <View style={[s.backBtn, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
          <Text style={{ fontSize: 18 }}>🌐</Text>
        </View>
      </View>

      {/* Domain Switcher */}
      <View style={s.domainSwitcher}>
        {ALL_DOMAINS.map(dk => {
          const dc = DOMAIN_REGISTRY[dk];
          const isActive = selectedDomain === dk;
          return (
            <TouchableOpacity
              key={dk}
              style={[s.domainSwitchBtn, isActive && { backgroundColor: dc.color, borderColor: dc.color }]}
              onPress={() => setSelectedDomain(dk)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14 }}>{dc.emoji}</Text>
              <Text style={[s.domainSwitchText, isActive && { color: Colors.bg }]} numberOfLines={1}>{dc.domain}</Text>
              {isActive && (
                <View style={[s.domainSwitchDot, { backgroundColor: Colors.bg }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={11} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── PORTFOLIO TAB ───────────────────────────────────────────────── */}
        {tab === 'portfolio' && (
          <>
            {/* Portfolio hero */}
            <View style={s.portfolioHero}>
              <View style={s.portfolioHeroLeft}>
                <Text style={s.portfolioHeroTitle}>Web3 Domain Portfolio</Text>
                <Text style={s.portfolioHeroSub}>{ALL_DOMAINS.length} domains · Polygon + Solana</Text>
              </View>
              <View style={s.portfolioStatsRow}>
                <View style={[s.portfolioStatPill, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                  <MaterialIcons name="check-circle" size={11} color="#22C55E" />
                  <Text style={[s.portfolioStatText, { color: '#22C55E' }]}>MINTED</Text>
                </View>
                <View style={[s.portfolioStatPill, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                  <Text style={{ fontSize: 10 }}>⚡</Text>
                  <Text style={[s.portfolioStatText, { color: '#9945FF' }]}>SOL+POL</Text>
                </View>
              </View>
            </View>

            {/* ── Bitcoin Customer Service Address Card ── */}
            <View style={[s.card, { borderColor: '#F7931A99', borderWidth: 2 }]}>
              <View style={s.cardHeader}>
                <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: '#F7931A18', borderWidth: 1.5, borderColor: '#F7931A66', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Text style={{ fontSize: 24 }}>🟠</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.cardTitle, { color: '#F7931A' }]}>BTC Customer Service</Text>
                  <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>
                    Official Bitcoin support address · All BTNG domains
                  </Text>
                </View>
                <View style={[s.mintedBadge, { backgroundColor: '#F7931A18', borderColor: '#F7931A55' }]}>
                  <LiveDot color="#F7931A" size={5} />
                  <Text style={[s.mintedBadgeText, { color: '#F7931A' }]}>LIVE</Text>
                </View>
              </View>

              {/* Address row */}
              <View style={[s.recAddress, { borderColor: '#F7931A55', backgroundColor: '#F7931A0A' }]}>
                <MaterialIcons name="currency-bitcoin" size={14} color="#F7931A" />
                <Text
                  style={[s.recAddressText, { color: '#F7931A', flex: 1 }]}
                  selectable
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {BTC_CUSTOMER_SERVICE_ADDRESS}
                </Text>
                <TouchableOpacity
                  onPress={() => { Clipboard.setString(BTC_CUSTOMER_SERVICE_ADDRESS); showAlert('Copied', 'Bitcoin customer service address copied to clipboard.'); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="content-copy" size={13} color="#F7931A" />
                </TouchableOpacity>
              </View>

              {/* Info grid */}
              <View style={{ gap: 3 }}>
                {[
                  { label: 'Network',  value: 'Bitcoin Mainnet',            color: Colors.textPrimary },
                  { label: 'Format',   value: 'Legacy P2PKH · Base58Check', color: '#F7931A' },
                  { label: 'Purpose',  value: 'Customer Support Payments',  color: Colors.success },
                  { label: 'Scope',    value: 'All BTNG Domains · 3 registries', color: Colors.primary },
                ].map(row => (
                  <View key={row.label} style={[s.summaryRow, { borderBottomColor: '#F7931A22' }]}>
                    <Text style={s.summaryLabel}>{row.label}</Text>
                    <Text style={[s.summaryValue, { color: row.color, maxWidth: '62%', textAlign: 'right' }]} numberOfLines={1}>
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Warning */}
              <View style={[s.defiNote, { borderColor: '#F7931A33', backgroundColor: '#F7931A08' }]}>
                <MaterialIcons name="info-outline" size={12} color="#F7931A" />
                <Text style={[s.defiNoteText, { color: '#F7931A' }]}>
                  Always verify this address before sending. Bitcoin transactions are irreversible.
                </Text>
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity
                  style={[s.copyAllBtn, { flex: 1, borderColor: '#F7931A55', backgroundColor: '#F7931A0E' }]}
                  onPress={() => { Clipboard.setString(BTC_CUSTOMER_SERVICE_ADDRESS); showAlert('Copied', 'BTC customer service address copied.'); }}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="content-copy" size={13} color="#F7931A" />
                  <Text style={[s.copyAllBtnText, { color: '#F7931A', fontSize: 11 }]}>Copy BTC Address</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.exportBtn, { flex: 1, borderColor: '#F7931A55', backgroundColor: '#F7931A12' }]}
                  onPress={() => setBtcCsModal(true)}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="qr-code" size={13} color="#F7931A" />
                  <Text style={[s.exportBtnText, { color: '#F7931A' }]}>Payment QR</Text>
                </TouchableOpacity>
              </View>

              {/* ── Bulk Link BTC to All 3 Domains ── */}
              <TouchableOpacity
                style={[s.syncBtn, { borderColor: '#F7931A66', backgroundColor: '#F7931A10' }, bulkLinkLoading && { opacity: 0.55 }]}
                onPress={handleBulkLinkBTC}
                disabled={bulkLinkLoading}
                activeOpacity={0.85}
              >
                {bulkLinkLoading
                  ? <ActivityIndicator size="small" color="#F7931A" />
                  : <MaterialIcons name="link" size={14} color="#F7931A" />}
                <Text style={[s.syncBtnText, { color: '#F7931A', flex: 1 }]}>
                  {bulkLinkLoading ? 'Linking to all domains…' : 'Link BTC to All Domains'}
                </Text>
                {bulkLinkResult && !bulkLinkLoading ? (
                  <View style={[s.syncBadge, { backgroundColor: bulkLinkResult.linked > 0 ? Colors.success : Colors.textMuted }]}>
                    <Text style={s.syncBadgeText}>
                      {bulkLinkResult.linked > 0 ? `+${bulkLinkResult.linked}` : 'Done'}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    {ALL_DOMAINS.map(dk => (
                      <Text key={dk} style={{ fontSize: 11 }}>{DOMAIN_REGISTRY[dk].emoji}</Text>
                    ))}
                  </View>
                )}
              </TouchableOpacity>

              {/* Bulk result feedback */}
              {bulkLinkResult && !bulkLinkLoading ? (
                <View style={[s.defiNote, { borderColor: '#F7931A33', backgroundColor: '#F7931A08' }]}>
                  <MaterialIcons
                    name={bulkLinkResult.linked > 0 ? 'check-circle' : 'info-outline'}
                    size={12}
                    color={bulkLinkResult.linked > 0 ? Colors.success : Colors.textMuted}
                  />
                  <Text style={[s.defiNoteText, { color: bulkLinkResult.linked > 0 ? Colors.success : Colors.textMuted }]}>
                    {bulkLinkResult.linked > 0
                      ? `BTC address linked to ${bulkLinkResult.linked} domain${bulkLinkResult.linked !== 1 ? 's' : ''}${bulkLinkResult.skipped > 0 ? ` · ${bulkLinkResult.skipped} already existed` : ''}.`
                      : 'BTC address already linked to all domains.'}
                  </Text>
                </View>
              ) : null}

              {/* Quick-link to Add tab pre-filled */}
              <TouchableOpacity
                style={[s.syncBtn, { borderColor: '#F7931A44', backgroundColor: '#F7931A08' }]}
                onPress={() => {
                  const btcIdx = CHAINS.findIndex(c => c.key === 'BTC');
                  if (btcIdx >= 0) setSelChain(CHAINS[btcIdx]);
                  setNewAddress(BTC_CUSTOMER_SERVICE_ADDRESS);
                  setNewLabel('BTNG Customer Service BTC');
                  setTab('add');
                }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="add-link" size={14} color="#F7931A" />
                <Text style={[s.syncBtnText, { color: '#F7931A' }]}>
                  Link this address to {selectedDomain}
                </Text>
                <MaterialIcons name="arrow-forward-ios" size={11} color="#F7931A" />
              </TouchableOpacity>
            </View>

            {/* Domain cards */}
            {ALL_DOMAINS.map(dk => {
              const dc = DOMAIN_REGISTRY[dk];
              const domainRecs = allRecords[dk] ?? [];
              const isSelected = selectedDomain === dk;
              return (
                <TouchableOpacity
                  key={dk}
                  style={[s.portfolioDomainCard, { borderColor: dc.color + (isSelected ? 'AA' : '44'), borderWidth: isSelected ? 2 : 1 }]}
                  onPress={() => { setSelectedDomain(dk); setTab('records'); }}
                  activeOpacity={0.88}
                >
                  {/* Card header */}
                  <View style={[s.portfolioCardHeader, { backgroundColor: dc.color + '10' }]}>
                    <View style={[s.portfolioCardEmoji, { backgroundColor: dc.color + '18', borderColor: dc.color + '44' }]}>
                      <Text style={{ fontSize: 28 }}>{dc.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={[s.portfolioCardDomain, { color: dc.color }]}>{dc.domain}</Text>
                        <View style={[s.portfolioCardCategory, { backgroundColor: dc.color + '18', borderColor: dc.color + '44' }]}>
                          <Text style={[s.portfolioCardCategoryText, { color: dc.color }]}>{dc.category}</Text>
                        </View>
                        <View style={[s.portfolioCardNs, { backgroundColor: dc.color + '12', borderColor: dc.color + '33' }]}>
                          <Text style={[s.portfolioCardNsText, { color: dc.color }]}>{dc.nftFormat}</Text>
                        </View>
                      </View>
                      <Text style={s.portfolioCardDesc} numberOfLines={2}>{dc.description}</Text>
                    </View>
                    <View style={[s.mintedBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' }} />
                      <Text style={[s.mintedBadgeText, { color: '#22C55E' }]}>LIVE</Text>
                    </View>
                  </View>

                  {/* Key info grid */}
                  <View style={s.portfolioInfoGrid}>
                    {[
                      { label: 'Mint Date',   value: dc.mintDate,                  color: Colors.textPrimary },
                      { label: 'Chain',       value: dc.chain,                     color: dc.color           },
                      { label: 'Contract',    value: dc.contractShort,             color: dc.color           },
                      { label: 'Records',     value: `${domainRecs.length} linked`, color: Colors.success    },
                      ...(dc.purchasePrice ? [{ label: 'Paid', value: dc.purchasePrice, color: Colors.warning }] : []),
                      ...(dc.renewalPrice ? [{ label: 'Renewal', value: dc.renewalPrice, color: '#F59E0B' }] : []),
                      ...(dc.estimatedValue ? [{ label: 'Est. Value', value: `${dc.estimatedValue} (${dc.estimator})`, color: Colors.textMuted }] : []),
                      ...(dc.defiConnected ? [{ label: 'DeFi Wallet', value: dc.defiWallet ?? '', color: '#22C55E' }] : []),
                    ].map(row => (
                      <View key={row.label} style={s.portfolioInfoRow}>
                        <Text style={s.portfolioInfoLabel}>{row.label}</Text>
                        <Text style={[s.portfolioInfoValue, { color: row.color }]} numberOfLines={1}>{row.value}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Status badges */}
                  <View style={s.portfolioStatusRow}>
                    {dc.defiConnected && (
                      <View style={[s.portfolioStatusChip, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                        <MaterialIcons name="account-balance-wallet" size={10} color="#22C55E" />
                        <Text style={[s.portfolioStatusChipText, { color: '#22C55E' }]}>DeFi Connected</Text>
                      </View>
                    )}
                    {dc.transferLock && (
                      <View style={[s.portfolioStatusChip, { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '44' }]}>
                        <MaterialIcons name="lock" size={10} color={Colors.warning} />
                        <Text style={[s.portfolioStatusChipText, { color: Colors.warning }]}>Transfer Lock</Text>
                      </View>
                    )}
                    {dc.hasEmailHosting && (
                      <View style={[s.portfolioStatusChip, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                        <MaterialIcons name="email" size={10} color="#3B82F6" />
                        <Text style={[s.portfolioStatusChipText, { color: '#3B82F6' }]}>Email Hosting</Text>
                      </View>
                    )}
                    <View style={[s.portfolioStatusChip, { backgroundColor: dc.color + '12', borderColor: dc.color + '33' }]}>
                      <Text style={[s.portfolioStatusChipText, { color: dc.color }]}>{dc.chain}</Text>
                    </View>
                  </View>

                  {/* Card footer: tap hint + share + genesis explorer link */}
                  <View style={s.portfolioTapRow}>
                    <Text style={s.portfolioTapText}>Tap to manage records</Text>
                    <TouchableOpacity
                      style={[s.shareQrBtn, { borderColor: dc.color + '55', backgroundColor: dc.color + '12' }]}
                      onPress={() => setShareModal({ domain: dk })}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="qr-code" size={12} color={dc.color} />
                      <Text style={[s.shareQrBtnText, { color: dc.color }]}>Share</Text>
                    </TouchableOpacity>
                    {dk === 'bituncoin.genesis' && (
                      <TouchableOpacity
                        style={[s.shareQrBtn, { borderColor: '#14F19555', backgroundColor: '#14F19510' }]}
                        onPress={() => router.push('/btng-genesis-domain' as any)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="sensors" size={12} color="#14F195" />
                        <Text style={[s.shareQrBtnText, { color: '#14F195' }]}>RPC</Text>
                      </TouchableOpacity>
                    )}
                    <MaterialIcons name="arrow-forward-ios" size={11} color={dc.color} />
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Portfolio summary */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="analytics" size={16} color={Colors.primary} />
                <Text style={s.cardTitle}>Portfolio Summary</Text>
                {portfolioLoading && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>
              {[
                { label: 'Total Domains',           value: String(ALL_DOMAINS.length),                                                    color: Colors.primary },
                { label: 'Total Records',            value: `${ALL_DOMAINS.reduce((s, d) => s + (allRecords[d]?.length ?? 0), 0)}`,        color: Colors.success },
                { label: 'bituncoin.genesis records',value: `${allRecords['bituncoin.genesis']?.length ?? 0}`,                            color: '#9945FF' },
                { label: 'btng.gold records',        value: `${allRecords['btng.gold']?.length ?? 0}`,                                    color: '#D4A017' },
                { label: 'btng.token records',       value: `${allRecords['btng.token']?.length ?? 0}`,                                   color: '#8247E5' },
                { label: 'BTC Customer Service',     value: BTC_CUSTOMER_SERVICE_ADDRESS.slice(0, 22) + '…',                              color: '#F7931A' },
                { label: 'Registries',               value: 'Freename · W3 Domains',                                                     color: Colors.textSecondary },
                { label: 'Blockchains',              value: 'Solana + Polygon',                                                           color: '#9945FF' },
                { label: 'Mint Dates',               value: '25–26 Jun 2026',                                                             color: Colors.success },
              ].map(row => (
                <View key={row.label} style={s.summaryRow}>
                  <Text style={s.summaryLabel}>{row.label}</Text>
                  <Text style={[s.summaryValue, { color: row.color, maxWidth: '60%', textAlign: 'right' }]} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Mirror info */}
            <View style={[s.card, { borderColor: Colors.primary + '44' }]}>
              <View style={s.cardHeader}>
                <MaterialIcons name="sync" size={15} color={Colors.primary} />
                <Text style={s.cardTitle}>Web2 → Web3 Mirror</Text>
                <View style={[s.mintedBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
                  <LiveDot color={Colors.primary} size={5} />
                  <Text style={[s.mintedBadgeText, { color: Colors.primary }]}>ACTIVE</Text>
                </View>
              </View>
              <Text style={s.cardDesc}>
                All domains are mirrored on Web3 registries. Resolve wallet addresses for{' '}
                <Text style={{ color: '#9945FF', fontWeight: FontWeight.bold }}>bituncoin.genesis</Text>,{' '}
                <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>btng.gold</Text>, and{' '}
                <Text style={{ color: '#8247E5', fontWeight: FontWeight.bold }}>btng.token</Text> — enabling MetaMask-style send-to-domain transfers.
              </Text>
            </View>
          </>
        )}

        {/* ── RECORDS TAB ─────────────────────────────────────────────────── */}
        {tab === 'records' && (
          <>
            {/* Domain context banner */}
            <View style={[s.domainContextBanner, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '0A' }]}>
              <Text style={{ fontSize: 20 }}>{cfg.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.domainContextDomain, { color: cfg.color }]}>{cfg.domain}</Text>
                <Text style={s.domainContextSub}>{cfg.category} · {cfg.chain} · {cfg.nftFormat}</Text>
              </View>
              <TouchableOpacity
                style={[s.switchBtn, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '12' }]}
                onPress={() => setSelectedDomain(nextDomain(selectedDomain))}
                activeOpacity={0.8}
              >
                <MaterialIcons name="swap-horiz" size={14} color={cfg.color} />
                <Text style={[s.switchBtnText, { color: cfg.color }]}>Switch</Text>
              </TouchableOpacity>
            </View>

            {/* BTC Customer Service quick-link banner */}
            <TouchableOpacity
              style={[s.card, { borderColor: '#F7931A55', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]}
              onPress={() => {
                const btcIdx = CHAINS.findIndex(c => c.key === 'BTC');
                if (btcIdx >= 0) setSelChain(CHAINS[btcIdx]);
                setNewAddress(BTC_CUSTOMER_SERVICE_ADDRESS);
                setNewLabel('BTNG Customer Service BTC');
                setTab('add');
              }}
              activeOpacity={0.87}
            >
              <View style={[s.recEmoji, { backgroundColor: '#F7931A18', borderColor: '#F7931A55' }]}>
                <Text style={{ fontSize: 22 }}>🟠</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.recChain, { color: '#F7931A' }]}>Link BTC Customer Service Address</Text>
                <Text style={s.recLabel} numberOfLines={1} ellipsizeMode="middle">
                  {BTC_CUSTOMER_SERVICE_ADDRESS}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { Clipboard.setString(BTC_CUSTOMER_SERVICE_ADDRESS); showAlert('Copied', 'BTC address copied.'); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="content-copy" size={14} color="#F7931A" />
              </TouchableOpacity>
              <MaterialIcons name="arrow-forward-ios" size={13} color="#F7931A" />
            </TouchableOpacity>

            {/* Genesis Tx explorer shortcut */}
            {selectedDomain === 'bituncoin.genesis' && (
              <TouchableOpacity
                style={[s.card, { borderColor: '#14F19555', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]}
                onPress={() => router.push('/btng-genesis-domain' as any)}
                activeOpacity={0.87}
              >
                <View style={[s.recEmoji, { backgroundColor: '#9945FF22', borderColor: '#9945FF55' }]}>
                  <MaterialIcons name="sensors" size={20} color="#9945FF" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.recChain, { color: '#14F195' }]}>Solana RPC Explorer</Text>
                  <Text style={s.recLabel}>Live balance, mint receipt, tx history</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={13} color="#14F195" />
              </TouchableOpacity>
            )}

            {/* Live zone status strip */}
            {freenameAuth && zoneData[selectedDomain] ? (() => {
              const z = zoneData[selectedDomain]!;
              const sc = z.status === 'OK' ? Colors.success : z.status === 'PENDING' ? Colors.warning : z.status === 'ERROR' ? Colors.error : Colors.textMuted;
              return (
                <View style={[s.zoneLiveCard, { borderColor: sc + '55', backgroundColor: sc + '12' }]}>
                  <MaterialIcons name="cloud-done" size={13} color={sc} />
                  <Text style={[s.zoneLiveStatus, { color: sc }]}>FREENAME · {z.status}</Text>
                  <Text style={s.zoneLiveUuid} numberOfLines={1} ellipsizeMode="middle">{z.uuid}</Text>
                  {zoneLoading && <ActivityIndicator size="small" color={sc} />}
                </View>
              );
            })() : null}

            {/* Action row */}
            <View style={s.actionRow}>
              <TouchableOpacity style={s.refreshBtn} onPress={() => loadRecords(selectedDomain, true)} activeOpacity={0.85}>
                {recordsRefresh ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={16} color={Colors.primary} />}
                <Text style={s.refreshBtnText}>{recordsRefresh ? 'Refreshing…' : 'Refresh'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.addBtn} onPress={() => setTab('add')} activeOpacity={0.85}>
                <MaterialIcons name="add" size={16} color={Colors.bg} />
                <Text style={s.addBtnText}>Add Record</Text>
              </TouchableOpacity>
            </View>

            {/* Sync from Freename Management API */}
            {freenameAuth ? (
              <TouchableOpacity
                style={[s.syncBtn, syncLoading && { opacity: 0.5 }]}
                onPress={handleSyncFromFreename}
                disabled={syncLoading}
                activeOpacity={0.85}
              >
                {syncLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="cloud-download" size={14} color={Colors.primary} />}
                <Text style={s.syncBtnText}>{syncLoading ? 'Syncing from Freename…' : 'Sync Records from Freename API'}</Text>
                {syncResult?.domain === selectedDomain && !syncLoading ? (
                  <View style={s.syncBadge}><Text style={s.syncBadgeText}>{syncResult.synced} new</Text></View>
                ) : null}
              </TouchableOpacity>
            ) : null}

            {recordsLoading && records.length === 0 ? (
              <View style={s.loadingWrap}><ActivityIndicator color={Colors.primary} /><Text style={s.loadingText}>Loading records…</Text></View>
            ) : records.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={{ fontSize: 48 }}>🔗</Text>
                <Text style={s.emptyTitle}>No Records Linked</Text>
                <Text style={s.emptySub}>Link your wallet addresses to <Text style={{ color: cfg.color, fontWeight: FontWeight.bold }}>{cfg.domain}</Text> so others can send crypto directly.</Text>
                <TouchableOpacity style={[s.addFirstBtn, { backgroundColor: cfg.color }]} onPress={() => setTab('add')} activeOpacity={0.85}>
                  <MaterialIcons name="add-circle" size={15} color={Colors.bg} />
                  <Text style={s.addFirstBtnText}>Add First Record</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={s.statsRow}>
                  {[
                    { label: 'Total',    value: records.length,                                 color: cfg.color       },
                    { label: 'Chains',   value: [...new Set(records.map(r => r.chain))].length, color: '#8247E5'       },
                    { label: 'Primary',  value: records.filter(r => r.is_primary).length,       color: Colors.success  },
                    { label: 'Verified', value: records.filter(r => r.verified).length,         color: Colors.warning  },
                  ].map(stat => (
                    <View key={stat.label} style={[s.statCell, { borderColor: stat.color + '44' }]}>
                      <Text style={[s.statVal, { color: stat.color }]}>{stat.value}</Text>
                      <Text style={s.statLabel}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                {records.map(rec => {
                  const cc = chainCfg(rec.chain);
                  return (
                    <View key={rec.id} style={[s.recCard, { borderLeftColor: cc.color, borderLeftWidth: 3 }]}>
                      <View style={s.recHeader}>
                        <View style={[s.recEmoji, { backgroundColor: cc.color + '18', borderColor: cc.color + '44' }]}>
                          <Text style={{ fontSize: 22 }}>{cc.emoji}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={s.recTitleRow}>
                            <Text style={[s.recChain, { color: cc.color }]}>{rec.chain}</Text>
                            {rec.is_primary && (
                              <View style={[s.recBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
                                <MaterialIcons name="star" size={9} color={Colors.primary} />
                                <Text style={[s.recBadgeText, { color: Colors.primary }]}>PRIMARY</Text>
                              </View>
                            )}
                            {rec.verified && (
                              <View style={[s.recBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
                                <MaterialIcons name="verified" size={9} color={Colors.success} />
                                <Text style={[s.recBadgeText, { color: Colors.success }]}>VERIFIED</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.recLabel}>{rec.label ?? cc.label}</Text>
                        </View>
                        <View style={s.recActions}>
                          {!rec.is_primary && (
                            <TouchableOpacity style={s.recActionBtn} onPress={() => handleSetPrimary(rec)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <MaterialIcons name="star-outline" size={16} color={Colors.warning} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity style={[s.recActionBtn, { borderColor: Colors.error + '44' }]} onPress={() => handleDelete(rec)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <MaterialIcons name="delete-outline" size={16} color={Colors.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={[s.recAddress, { borderColor: cc.color + '33', backgroundColor: cc.color + '07' }]}>
                        <MaterialIcons name="link" size={12} color={cc.color} />
                        <Text style={[s.recAddressText, { color: cc.color }]} selectable numberOfLines={1} ellipsizeMode="middle">{rec.wallet_address}</Text>
                        <TouchableOpacity onPress={() => Clipboard.setString(rec.wallet_address)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <MaterialIcons name="content-copy" size={12} color={cc.color} />
                        </TouchableOpacity>
                      </View>
                      <View style={s.recMeta}>
                        <MaterialIcons name="schedule" size={10} color={Colors.textMuted} />
                        <Text style={s.recMetaText}>{new Date(rec.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                        <View style={s.metaDot} />
                        <Text style={s.recMetaText}>{rec.coin_symbol}</Text>
                        <View style={s.metaDot} />
                        <Text style={s.recMetaText}>{rec.domain}</Text>
                      </View>
                      {!rec.is_primary && (
                        <TouchableOpacity style={s.setPrimaryHint} onPress={() => handleSetPrimary(rec)} activeOpacity={0.8}>
                          <MaterialIcons name="star-border" size={11} color={Colors.warning} />
                          <Text style={s.setPrimaryHintText}>Set as primary for {rec.chain} resolution</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ── ADD RECORD TAB ──────────────────────────────────────────────── */}
        {tab === 'add' && (
          <>
            {/* Domain context */}
            <View style={[s.domainContextBanner, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '0A' }]}>
              <Text style={{ fontSize: 20 }}>{cfg.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.domainContextDomain, { color: cfg.color }]}>{cfg.domain}</Text>
                <Text style={s.domainContextSub}>Adding record to this domain</Text>
              </View>
              <TouchableOpacity style={[s.switchBtn, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '12' }]} onPress={() => setSelectedDomain(nextDomain(selectedDomain))} activeOpacity={0.8}>
                <MaterialIcons name="swap-horiz" size={14} color={cfg.color} />
                <Text style={[s.switchBtnText, { color: cfg.color }]}>Switch</Text>
              </TouchableOpacity>
            </View>

            {/* BTC customer service quick-fill banner */}
            {selChain.key === 'BTC' || newAddress === '' ? (
              <TouchableOpacity
                style={[s.card, { borderColor: '#F7931A55', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#F7931A08' }]}
                onPress={() => {
                  const btcIdx = CHAINS.findIndex(c => c.key === 'BTC');
                  if (btcIdx >= 0) setSelChain(CHAINS[btcIdx]);
                  setNewAddress(BTC_CUSTOMER_SERVICE_ADDRESS);
                  setNewLabel('BTNG Customer Service BTC');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 20 }}>🟠</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.recChain, { color: '#F7931A', fontSize: FontSize.xs }]}>
                    Use BTC Customer Service Address
                  </Text>
                  <Text style={s.recLabel} numberOfLines={1} ellipsizeMode="middle">
                    {BTC_CUSTOMER_SERVICE_ADDRESS}
                  </Text>
                </View>
                <View style={[s.recBadge, { backgroundColor: '#F7931A18', borderColor: '#F7931A44' }]}>
                  <Text style={[s.recBadgeText, { color: '#F7931A' }]}>TAP TO FILL</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            <View style={s.addHero}>
              <Text style={{ fontSize: 36 }}>🔗</Text>
              <Text style={s.heroTitle}>Link Wallet Address</Text>
              <Text style={s.heroSub}>Add a wallet address to <Text style={{ color: cfg.color, fontWeight: FontWeight.bold }}>{cfg.domain}</Text> for MetaMask-style resolution.</Text>
            </View>

            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="device-hub" size={16} color={cfg.color} />
                <Text style={s.cardTitle}>Select Chain</Text>
              </View>
              <View style={s.chainGrid}>
                {CHAINS.map(c => (
                  <TouchableOpacity key={c.key} style={[s.chainCard, selChain.key === c.key && { borderColor: c.color, backgroundColor: c.color + '12' }]} onPress={() => setSelChain(c)} activeOpacity={0.8}>
                    <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
                    <Text style={[s.chainCardKey, { color: c.color }]}>{c.key}</Text>
                    <Text style={s.chainCardLabel}>{c.label}</Text>
                    {selChain.key === c.key && <View style={[s.chainSelDot, { backgroundColor: c.color }]} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={{ fontSize: 18 }}>{selChain.emoji}</Text>
                <Text style={s.cardTitle}>{selChain.label} Address</Text>
                <View style={[s.chainPill, { backgroundColor: selChain.color + '18', borderColor: selChain.color + '55' }]}>
                  <Text style={[s.chainPillText, { color: selChain.color }]}>{selChain.symbol}</Text>
                </View>
              </View>
              <Text style={s.inputLabel}>WALLET ADDRESS *</Text>
              <TextInput style={[s.inputField, { borderColor: selChain.color + '66' }]} value={newAddress} onChangeText={setNewAddress} placeholder={selChain.placeholder} placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} />
              <Text style={[s.inputLabel, { marginTop: Spacing.sm }]}>LABEL (OPTIONAL)</Text>
              <TextInput style={[s.inputField, { borderColor: Colors.border }]} value={newLabel} onChangeText={setNewLabel} placeholder={'e.g. "Main BTNG Wallet"'} placeholderTextColor={Colors.textMuted} />
              <View style={[s.previewBox, { borderColor: selChain.color + '44' }]}>
                <MaterialIcons name="link" size={13} color={selChain.color} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.previewTitle, { color: selChain.color }]}>{cfg.domain} → {selChain.symbol}</Text>
                  <Text style={s.previewAddr} numberOfLines={1} ellipsizeMode="middle">{newAddress || selChain.placeholder}</Text>
                </View>
              </View>
              <TouchableOpacity style={[s.addFirstBtn, { backgroundColor: cfg.color }, (!newAddress.trim() || addLoading) && { opacity: 0.4 }]} onPress={handleAddRecord} disabled={!newAddress.trim() || addLoading} activeOpacity={0.85}>
                {addLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="add-link" size={18} color={Colors.bg} />}
                <Text style={s.addFirstBtnText}>{addLoading ? 'Linking…' : `Link ${selChain.symbol} to ${cfg.domain}`}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── SETTINGS TAB ────────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <>
            {/* Domain context */}
            <View style={[s.domainContextBanner, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '0A' }]}>
              <Text style={{ fontSize: 20 }}>{cfg.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.domainContextDomain, { color: cfg.color }]}>{cfg.domain}</Text>
                <Text style={s.domainContextSub}>{cfg.nftFormat} · {cfg.chain} · {cfg.registry}</Text>
              </View>
              <TouchableOpacity style={[s.switchBtn, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '12' }]} onPress={() => setSelectedDomain(nextDomain(selectedDomain))} activeOpacity={0.8}>
                <MaterialIcons name="swap-horiz" size={14} color={cfg.color} />
                <Text style={[s.switchBtnText, { color: cfg.color }]}>Switch</Text>
              </TouchableOpacity>
            </View>

            {/* BTC Customer Service in Settings */}
            <View style={[s.card, { borderColor: '#F7931A66' }]}>
              <View style={s.cardHeader}>
                <Text style={{ fontSize: 20 }}>🟠</Text>
                <Text style={[s.cardTitle, { color: '#F7931A' }]}>BTC Customer Service</Text>
                <TouchableOpacity
                  style={[s.switchBtn, { borderColor: '#F7931A55', backgroundColor: '#F7931A12' }]}
                  onPress={() => setBtcCsModal(true)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="qr-code" size={12} color="#F7931A" />
                  <Text style={[s.switchBtnText, { color: '#F7931A' }]}>QR</Text>
                </TouchableOpacity>
              </View>
              <CopyRow label="BTC Address" value={BTC_CUSTOMER_SERVICE_ADDRESS} color="#F7931A" mono />
              <CopyRow label="Network"     value="Bitcoin Mainnet · Legacy P2PKH" color={Colors.textSecondary} />
              <CopyRow label="Purpose"     value="Customer Support Payments"       color={Colors.success} />
            </View>

            {/* Domain Info */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="info-outline" size={16} color={cfg.color} />
                <Text style={[s.cardTitle, { color: cfg.color }]}>Domain Details</Text>
                <View style={[s.chainPill, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '55' }]}>
                  <Text style={[s.chainPillText, { color: cfg.color }]}>{cfg.chain}</Text>
                </View>
              </View>
              <CopyRow label="Domain Name"    value={cfg.domain}        color={cfg.color} />
              <CopyRow label="Contract / Tx"  value={cfg.contractFull}  color={cfg.color}  mono />
              <CopyRow label="NFT Format"     value={cfg.nftFormat}     color={Colors.textPrimary} />
              <CopyRow label="Registry"       value={cfg.registry}      color={Colors.textSecondary} />
              <CopyRow label="Category"       value={cfg.category}      color={cfg.color} />
              <CopyRow label="Minted On"      value={cfg.mintDate}      color={Colors.success} />
              {cfg.tokenId && <CopyRow label="Token ID"  value={cfg.tokenId} color={cfg.color} mono />}
              {cfg.ownerAddress && <CopyRow label="Owner Address" value={cfg.ownerAddress} color={cfg.color} mono />}
            </View>

            {/* Valuation & Renewal */}
            {(cfg.purchasePrice || cfg.renewalPrice || cfg.estimatedValue) && (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="attach-money" size={16} color={Colors.warning} />
                  <Text style={[s.cardTitle, { color: Colors.warning }]}>Valuation & Renewal</Text>
                </View>
                {cfg.purchasePrice && <CopyRow label="Purchase Price"   value={cfg.purchasePrice}  color={Colors.warning} />}
                {cfg.renewalPrice  && <CopyRow label="Renewal Price"    value={cfg.renewalPrice}   color={Colors.warning} />}
                {cfg.estimatedValue && (
                  <View style={s.settingsInfoRow}>
                    <Text style={s.settingsInfoLabel}>Estimated Value</Text>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={[s.settingsInfoValue, { color: cfg.color }]}>{cfg.estimatedValue}</Text>
                      {cfg.estimator && <Text style={s.settingsInfoSub}>by {cfg.estimator}</Text>}
                    </View>
                  </View>
                )}
                <View style={[s.settingsInfoRow, { borderBottomWidth: 0 }]}>
                  <Text style={s.settingsInfoLabel}>Auto Renewal</Text>
                  <View style={[s.statusPill, { backgroundColor: cfg.autoRenewal ? Colors.successBg : Colors.bgElevated, borderColor: (cfg.autoRenewal ? Colors.success : Colors.textMuted) + '44' }]}>
                    <Text style={[s.statusPillText, { color: cfg.autoRenewal ? Colors.success : Colors.textMuted }]}>{cfg.autoRenewal ? 'ON' : 'N/A'}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* DeFi Wallet */}
            {cfg.defiWallet && (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="account-balance-wallet" size={16} color="#22C55E" />
                  <Text style={[s.cardTitle, { color: '#22C55E' }]}>DeFi Wallet</Text>
                  <View style={[s.statusPill, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                    <LiveDot color="#22C55E" size={5} />
                    <Text style={[s.statusPillText, { color: '#22C55E' }]}>CONNECTED</Text>
                  </View>
                </View>
                <Text style={s.cardDesc}>A DeFi wallet is connected to this domain, enabling on-chain asset management and token resolution.</Text>
                <CopyRow label="Wallet Address" value={cfg.defiWallet} color="#22C55E" mono />
                <View style={[s.defiNote, { borderColor: '#22C55E33', backgroundColor: '#22C55E08' }]}>
                  <MaterialIcons name="info-outline" size={12} color="#22C55E" />
                  <Text style={s.defiNoteText}>Keep your private keys secure — consider a hardware wallet like Ledger.</Text>
                </View>
              </View>
            )}

            {/* Transfer Lock */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="lock" size={16} color={cfg.transferLock ? Colors.warning : Colors.success} />
                <Text style={[s.cardTitle, { color: cfg.transferLock ? Colors.warning : Colors.success }]}>Transfer Lock</Text>
                <View style={[s.statusPill, {
                  backgroundColor: cfg.transferLock ? Colors.warningBg : Colors.successBg,
                  borderColor: (cfg.transferLock ? Colors.warning : Colors.success) + '55',
                }]}>
                  <MaterialIcons name={cfg.transferLock ? 'lock' : 'lock-open'} size={10} color={cfg.transferLock ? Colors.warning : Colors.success} />
                  <Text style={[s.statusPillText, { color: cfg.transferLock ? Colors.warning : Colors.success }]}>{cfg.transferLock ? 'ON' : 'OFF'}</Text>
                </View>
              </View>
              <Text style={s.cardDesc}>
                {cfg.transferLock
                  ? 'Transfer lock is ENABLED. This domain cannot be transferred within the registry. It does not prevent on-chain transfers from your own wallet.'
                  : 'Transfer lock is OFF. This domain can be freely transferred within the registry and on-chain.'}
              </Text>
              {cfg.transferLock && (
                <View style={[s.lockNote, { borderColor: Colors.warning + '44', backgroundColor: Colors.warningBg }]}>
                  <MaterialIcons name="warning" size={13} color={Colors.warning} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.lockNoteTitle}>Domain Cannot Be Transferred</Text>
                    <Text style={s.lockNoteText}>Ensure your private keys are safe. Consider using a hardware wallet like Ledger for on-chain security.</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Email Hosting */}
            {cfg.hasEmailHosting && (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="email" size={16} color="#3B82F6" />
                  <Text style={[s.cardTitle, { color: '#3B82F6' }]}>Web3 Email Hosting</Text>
                  <View style={[s.statusPill, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                    <Text style={[s.statusPillText, { color: '#3B82F6' }]}>CONFIGURE</Text>
                  </View>
                </View>
                <Text style={s.cardDesc}>
                  Connect a Web3 email provider to <Text style={{ color: cfg.color, fontWeight: FontWeight.bold }}>{cfg.domain}</Text>. Send and receive email using your blockchain address.
                </Text>
                {EMAIL_PROVIDERS.map(ep => (
                  <View key={ep.name} style={[s.emailProviderCard, { borderColor: ep.color + '44' }]}>
                    <View style={[s.emailProviderEmoji, { backgroundColor: ep.color + '18', borderColor: ep.color + '44' }]}>
                      <Text style={{ fontSize: 22 }}>{ep.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[s.emailProviderName, { color: ep.color }]}>{ep.name}</Text>
                      <Text style={s.emailProviderDesc}>{ep.desc}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.emailProviderBtn, { borderColor: ep.color + '55', backgroundColor: ep.color + '12' }]}
                      onPress={() => showAlert(ep.name, `Configure ${ep.name} for ${cfg.domain}.\n\nVisit ${ep.url} to set up Web3 email hosting for your domain.`)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="open-in-new" size={14} color={ep.color} />
                      <Text style={[s.emailProviderBtnText, { color: ep.color }]}>Setup</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={[s.defiNote, { borderColor: '#3B82F633', backgroundColor: '#3B82F608' }]}>
                  <MaterialIcons name="info-outline" size={12} color="#3B82F6" />
                  <Text style={[s.defiNoteText, { color: '#3B82F6' }]}>Web3 email lets you receive messages at <Text style={{ fontWeight: FontWeight.bold }}>{cfg.domain}</Text> — no central server, blockchain-verified identity.</Text>
                </View>
              </View>
            )}

            {/* Domain Image / Customization */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="image" size={16} color={cfg.color} />
                <Text style={s.cardTitle}>Customization</Text>
              </View>
              <Text style={s.cardDesc}>
                Upload a unique banner image for <Text style={{ color: cfg.color, fontWeight: FontWeight.bold }}>{cfg.domain}</Text> on the registry dashboard. Max 5MB.
              </Text>
              <TouchableOpacity
                style={[s.customizationBtn, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '10' }]}
                onPress={() => showAlert('Domain Image', `Upload your domain banner image on ${cfg.registry} dashboard.\n\n${cfg.domain} → Customization → Domain Image`)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="upload" size={16} color={cfg.color} />
                <Text style={[s.customizationBtnText, { color: cfg.color }]}>Upload Domain Image</Text>
                <MaterialIcons name="open-in-new" size={14} color={cfg.color} />
              </TouchableOpacity>
            </View>

            {/* Solana explorer link (genesis only) */}
            {selectedDomain === 'bituncoin.genesis' && (
              <TouchableOpacity
                style={[s.card, { borderColor: '#9945FF55', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]}
                onPress={() => router.push('/btng-genesis-domain' as any)}
                activeOpacity={0.87}
              >
                <View style={[s.recEmoji, { backgroundColor: '#9945FF22', borderColor: '#9945FF55' }]}>
                  <MaterialIcons name="sensors" size={22} color="#9945FF" />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[s.cardTitle, { color: '#9945FF' }]}>Solana RPC Explorer</Text>
                  <Text style={s.cardDesc}>Live balance, mint tx receipt, and Solscan links for bituncoin.genesis</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color="#9945FF" />
              </TouchableOpacity>
            )}

            {/* Live Zone Status from Freename Management API */}
            {freenameAuth ? (() => {
              const z = zoneData[selectedDomain];
              const sc = !z ? Colors.textMuted : z.status === 'OK' ? Colors.success : z.status === 'PENDING' ? Colors.warning : z.status === 'ERROR' ? Colors.error : Colors.textMuted;
              return (
                <View style={[s.card, { borderColor: sc + '44' }]}>
                  <View style={s.cardHeader}>
                    <MaterialIcons name="cloud" size={15} color={sc} />
                    <Text style={[s.cardTitle, { color: sc }]}>Freename Zone · Live</Text>
                    {zoneLoading
                      ? <ActivityIndicator size="small" color={sc} />
                      : (
                        <TouchableOpacity
                          style={[s.switchBtn, { borderColor: sc + '44', backgroundColor: sc + '10' }]}
                          onPress={() => loadZoneData(selectedDomain)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <MaterialIcons name="refresh" size={12} color={sc} />
                          <Text style={[s.switchBtnText, { color: sc }]}>Refresh</Text>
                        </TouchableOpacity>
                      )}
                  </View>
                  {z ? (
                    <>
                      <View style={[s.settingsInfoRow]}>
                        <Text style={s.settingsInfoLabel}>Status</Text>
                        <View style={[s.statusPill, { backgroundColor: sc + '18', borderColor: sc + '55' }]}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sc }} />
                          <Text style={[s.statusPillText, { color: sc }]}>{z.status}</Text>
                        </View>
                      </View>
                      <CopyRow label="Zone UUID" value={z.uuid} color={sc} mono />
                      {z.createdAt ? <CopyRow label="Registered" value={new Date(z.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} color={Colors.textSecondary} /> : null}
                      {z.expirationDate ? <CopyRow label="Expires" value={z.expirationDate} color={Colors.warning} /> : null}
                      {z.profileRegistry ? <CopyRow label="Profile Registry" value={z.profileRegistry.name} color={cfg.color} /> : null}
                      {apiRecords.filter(r => !['A','CNAME','NS','TXT','MX'].includes(r.type.toUpperCase())).length > 0 ? (
                        <View style={{ gap: 4, marginTop: 6 }}>
                          <Text style={s.inputLabel}>FREENAME CRYPTO RECORDS</Text>
                          {apiRecords.filter(r => !['A','CNAME','NS','TXT','MX'].includes(r.type.toUpperCase())).map((rec, i) => (
                            <View key={rec.uuid ?? String(i)} style={[s.recAddress, { borderColor: cfg.color + '33', backgroundColor: cfg.color + '07' }]}>
                              <View style={[s.recBadge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}>
                                <Text style={[s.recBadgeText, { color: cfg.color }]}>{rec.type}</Text>
                              </View>
                              <Text style={[s.recAddressText, { color: Colors.textPrimary, flex: 1 }]} numberOfLines={1} ellipsizeMode="middle">{rec.value}</Text>
                              {rec.uuid ? (
                                <TouchableOpacity onPress={() => handleDeleteFromFreename(rec.uuid, rec.type + ': ' + rec.value.slice(0, 16) + '...')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                  <MaterialIcons name="delete-outline" size={14} color={Colors.error} />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <TouchableOpacity style={[s.addFirstBtn, { backgroundColor: sc + '18', borderWidth: 1, borderColor: sc + '44' }]} onPress={() => loadZoneData(selectedDomain)} activeOpacity={0.85}>
                      <MaterialIcons name="cloud-queue" size={16} color={sc} />
                      <Text style={[s.addFirstBtnText, { color: sc }]}>Load Zone from Freename</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })() : null}

            {/* Freename account profile */}
            {freenameProfile ? (
              <View style={[s.card, { borderColor: Colors.primary + '44' }]}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="account-circle" size={15} color={Colors.primary} />
                  <Text style={[s.cardTitle, { color: Colors.primary }]}>Freename Account</Text>
                </View>
                <CopyRow label="Username" value={freenameProfile.username} color={Colors.primary} />
                <CopyRow label="Email"    value={freenameProfile.email}    color={Colors.textSecondary} />
                <CopyRow label="UUID"     value={freenameProfile.uuid}     color={Colors.textMuted} mono />
              </View>
            ) : null}

            {/* Zone Browser shortcut */}
            <TouchableOpacity
              style={[s.card, { borderColor: Colors.primary + '55', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]}
              onPress={() => router.push('/btng-zone-search' as any)}
              activeOpacity={0.87}
            >
              <View style={[s.recEmoji, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                <MaterialIcons name="manage-search" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[s.cardTitle, { color: Colors.primary }]}>Zone Browser</Text>
                <Text style={s.cardDesc}>Whois lookup, availability checker, your full zone portfolio &amp; status management.</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.primary} />
            </TouchableOpacity>

            {/* Freename reference */}
            <View style={[s.card, { borderColor: '#8247E544' }]}>
              <View style={s.cardHeader}>
                <MaterialIcons name="open-in-new" size={15} color="#8247E5" />
                <Text style={[s.cardTitle, { color: '#8247E5' }]}>Manage on {cfg.registry}</Text>
              </View>
              <Text style={s.cardDesc}>Full domain management (transfer, renewal, image, DNS) is available on the {cfg.registry} dashboard.</Text>
              {[
                { label: 'Dashboard URL',  value: cfg.chain === 'Solana' ? 'app.w3.domains/portfolio' : 'app.freename.io/dashboard', color: '#8247E5' },
                { label: 'Domain',         value: cfg.domain,                        color: cfg.color  },
              ].map(row => (
                <CopyRow key={row.label} label={row.label} value={row.value} color={row.color} />
              ))}
            </View>

            {/* Freename API Connect */}
            <View style={[s.card, { borderColor: freenameAuth ? Colors.success + '55' : Colors.warning + '44' }]}>
              <View style={s.cardHeader}>
                <MaterialIcons name="api" size={16} color={freenameAuth ? Colors.success : Colors.warning} />
                <Text style={[s.cardTitle, { color: freenameAuth ? Colors.success : Colors.warning }]}>Freename API Access</Text>
                <View style={[s.statusPill, { backgroundColor: freenameAuth ? Colors.successBg : Colors.warningBg, borderColor: (freenameAuth ? Colors.success : Colors.warning) + '55' }]}>
                  <LiveDot color={freenameAuth ? Colors.success : Colors.warning} size={5} />
                  <Text style={[s.statusPillText, { color: freenameAuth ? Colors.success : Colors.warning }]}>
                    {freenameAuth ? 'CONNECTED' : 'NOT LINKED'}
                  </Text>
                </View>
              </View>
              <Text style={s.cardDesc}>
                Connect your Freename account to publish wallet addresses directly to the on-chain registry — enabling resolution in MetaMask, WalletConnect, and all compatible wallets.
              </Text>
              {freenameAuth ? (
                <>
                  {freenameUserInfo?.email ? (
                    <View style={[s.defiNote, { borderColor: Colors.success + '33', backgroundColor: Colors.successBg }]}>
                      <MaterialIcons name="account-circle" size={14} color={Colors.success} />
                      <Text style={[s.defiNoteText, { color: Colors.success }]}>
                        Logged in as <Text style={{ fontWeight: FontWeight.bold }}>{freenameUserInfo.email}</Text>
                      </Text>
                    </View>
                  ) : null}
                  {(() => {
                    const domRecs = allRecords[selectedDomain] ?? [];
                    const firstRec = domRecs.find(r => r.is_primary) ?? domRecs[0];
                    return firstRec ? (
                      <View style={{ gap: Spacing.sm }}>
                        <Text style={s.inputLabel}>PUBLISH TO FREENAME · {cfg.domain}</Text>
                        <View style={[s.recAddress, { borderColor: cfg.color + '44', backgroundColor: cfg.color + '07' }]}>
                          <MaterialIcons name="link" size={12} color={cfg.color} />
                          <Text style={[s.recAddressText, { color: cfg.color }]} numberOfLines={1} ellipsizeMode="middle">
                            {firstRec.wallet_address}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[s.addFirstBtn, { backgroundColor: Colors.success }, publishLoading && { opacity: 0.5 }]}
                          onPress={() => handleSetAddress(cfg.domain, firstRec.wallet_address)}
                          disabled={publishLoading}
                          activeOpacity={0.85}
                        >
                          {publishLoading
                            ? <ActivityIndicator size="small" color={Colors.bg} />
                            : <MaterialIcons name="cloud-upload" size={17} color={Colors.bg} />}
                          <Text style={s.addFirstBtnText}>{publishLoading ? 'Publishing…' : 'Publish to Freename Registry'}</Text>
                        </TouchableOpacity>
                        {publishResult ? (
                          <View style={[s.defiNote, {
                            borderColor: (publishResult.success ? Colors.success : Colors.error) + '44',
                            backgroundColor: publishResult.success ? Colors.successBg : Colors.errorBg,
                          }]}>
                            <MaterialIcons name={publishResult.success ? 'check-circle' : 'error-outline'} size={13}
                              color={publishResult.success ? Colors.success : Colors.error} />
                            <Text style={[s.defiNoteText, { color: publishResult.success ? Colors.success : Colors.error }]}>
                              {publishResult.message}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={s.resolveEmpty}>Add a wallet record first (Records tab) to publish it to Freename.</Text>
                    );
                  })()}
                  <TouchableOpacity
                    style={[s.switchBtn, { borderColor: Colors.error + '44', backgroundColor: Colors.errorBg, alignSelf: 'flex-start', marginTop: Spacing.sm }]}
                    onPress={() => freenameLogout()}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="logout" size={13} color={Colors.error} />
                    <Text style={[s.switchBtnText, { color: Colors.error }]}>Disconnect</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.inputLabel}>FREENAME USERNAME</Text>
                  <TextInput
                    style={[s.inputField, { borderColor: Colors.warning + '44' }]}
                    value={freenameUser}
                    onChangeText={setFreenameUser}
                    placeholder="your-freename-username"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[s.inputLabel, { marginTop: Spacing.sm }]}>PASSWORD</Text>
                  <TextInput
                    style={[s.inputField, { borderColor: Colors.warning + '44' }]}
                    value={freenamePass}
                    onChangeText={setFreenamePass}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                  {freenameError ? (
                    <View style={[s.defiNote, { borderColor: Colors.error + '44', backgroundColor: Colors.errorBg }]}>
                      <MaterialIcons name="error-outline" size={12} color={Colors.error} />
                      <Text style={[s.defiNoteText, { color: Colors.error }]}>{freenameError}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[s.addFirstBtn, { backgroundColor: Colors.warning }, (freenameOpLoading || !freenameUser.trim() || !freenamePass.trim()) && { opacity: 0.45 }]}
                    onPress={handleFreenameLogin}
                    disabled={freenameOpLoading || !freenameUser.trim() || !freenamePass.trim()}
                    activeOpacity={0.85}
                  >
                    {freenameOpLoading
                      ? <ActivityIndicator size="small" color={Colors.bg} />
                      : <MaterialIcons name="login" size={17} color={Colors.bg} />}
                    <Text style={s.addFirstBtnText}>{freenameOpLoading ? 'Connecting…' : 'Connect Freename Account'}</Text>
                  </TouchableOpacity>
                  <View style={[s.defiNote, { borderColor: Colors.warning + '33', backgroundColor: Colors.warningBg }]}>
                    <MaterialIcons name="info-outline" size={12} color={Colors.warning} />
                    <Text style={[s.defiNoteText, { color: Colors.warning }]}>
                      Use your Freename.io credentials. Tokens are stored securely on-device and auto-refreshed.
                    </Text>
                  </View>
                </>
              )}
            </View>
          </>
        )}

        {/* ── VERIFY TAB ──────────────────────────────────────────────────── */}
        {tab === 'verify' && (
          <>
            <View style={s.addHero}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={s.heroTitle}>Domain Resolver</Text>
              <Text style={s.heroSub}>
                Resolve the primary wallet address for any BTNG domain on any chain — mimics MetaMask ENS resolution.
              </Text>
            </View>

            {/* Quick-fill buttons */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 2 }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: 2 }}>
                {ALL_DOMAINS.map(dk => {
                  const dc = DOMAIN_REGISTRY[dk];
                  return (
                    <TouchableOpacity key={dk} style={[s.quickFillBtn, { borderColor: dc.color + '55', backgroundColor: dc.color + '10' }]}
                      onPress={() => {
                        setVerifyDomain(dk);
                        // Auto-select the native chain for this domain
                        if (dk === 'bituncoin.genesis') setVerifyChain('SOL');
                        else setVerifyChain('ETH');
                      }}
                      activeOpacity={0.8}>
                      <Text style={{ fontSize: 14 }}>{dc.emoji}</Text>
                      <Text style={[s.quickFillText, { color: dc.color }]}>{dk}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="travel-explore" size={16} color={Colors.primary} />
                <Text style={s.cardTitle}>Resolve Domain</Text>
              </View>
              <Text style={s.inputLabel}>DOMAIN NAME</Text>
              <TextInput style={[s.inputField, { borderColor: Colors.primary + '55' }]} value={verifyDomain} onChangeText={setVerifyDomain} placeholder="btng.gold, btng.token, or bituncoin.genesis" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} />
              <Text style={[s.inputLabel, { marginTop: Spacing.sm }]}>CHAIN</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  {CHAINS.map(c => (
                    <TouchableOpacity key={c.key} style={[s.chainChip, verifyChain === c.key && { borderColor: c.color, backgroundColor: c.color + '18' }]} onPress={() => setVerifyChain(c.key)} activeOpacity={0.8}>
                      <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                      <Text style={[s.chainChipText, verifyChain === c.key && { color: c.color, fontWeight: FontWeight.bold }]}>{c.key}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity style={[s.addFirstBtn, verifyLoading && { opacity: 0.5 }]} onPress={handleVerify} disabled={verifyLoading} activeOpacity={0.85}>
                {verifyLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="search" size={17} color={Colors.bg} />}
                <Text style={s.addFirstBtnText}>{verifyLoading ? 'Resolving…' : `Resolve ${verifyDomain} on ${verifyChain}`}</Text>
              </TouchableOpacity>

              {verifyResult && (
                <View style={[s.verifyResult, { borderColor: Colors.success + '66', backgroundColor: Colors.successBg }]}>
                  <View style={s.verifyResultHeader}>
                    <MaterialIcons name="check-circle" size={22} color={Colors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.verifyResultTitle, { color: Colors.success }]}>Record Found</Text>
                      <Text style={[s.verifyResultSub, { color: Colors.success }]}>{verifyResult.domain} → {verifyResult.chain}</Text>
                    </View>
                    {verifyResult.is_primary && (
                      <View style={[s.recBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
                        <MaterialIcons name="star" size={9} color={Colors.primary} />
                        <Text style={[s.recBadgeText, { color: Colors.primary }]}>PRIMARY</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.verifyResultBody}>
                    {[
                      { label: 'Resolved Address', value: verifyResult.wallet_address, color: chainCfg(verifyResult.chain).color },
                      { label: 'Chain',            value: verifyResult.chain,           color: Colors.textPrimary },
                      { label: 'Symbol',           value: verifyResult.coin_symbol,     color: Colors.textPrimary },
                      { label: 'Label',            value: verifyResult.label ?? '(none)', color: Colors.textMuted },
                    ].map(row => (
                      <View key={row.label} style={s.verifyRow}>
                        <Text style={s.verifyRowLabel}>{row.label}</Text>
                        <Text style={[s.verifyRowValue, { color: row.color }]} selectable numberOfLines={1} ellipsizeMode="middle">{row.value}</Text>
                      </View>
                    ))}
                    <TouchableOpacity style={[s.copyAddrBtn, { borderColor: chainCfg(verifyResult.chain).color + '55', backgroundColor: chainCfg(verifyResult.chain).color + '10' }]} onPress={() => Clipboard.setString(verifyResult!.wallet_address)} activeOpacity={0.8}>
                      <MaterialIcons name="content-copy" size={14} color={chainCfg(verifyResult.chain).color} />
                      <Text style={[s.copyAddrBtnText, { color: chainCfg(verifyResult.chain).color }]}>Copy Resolved Address</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {verifyError !== '' && (
                <View style={[s.verifyResult, { borderColor: Colors.error + '55', backgroundColor: Colors.errorBg }]}>
                  <View style={s.verifyResultHeader}>
                    <MaterialIcons name="error-outline" size={20} color={Colors.error} />
                    <Text style={[s.verifyResultTitle, { color: Colors.error }]}>{verifyError}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── Reverse Lookup ── */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="find-replace" size={16} color={'#8247E5'} />
                <Text style={[s.cardTitle, { color: '#8247E5' }]}>Reverse Lookup</Text>
                <View style={[s.chainPill, { backgroundColor: '#8247E518', borderColor: '#8247E544' }]}>
                  <Text style={[s.chainPillText, { color: '#8247E5' }]}>Address → Domain</Text>
                </View>
              </View>
              <Text style={s.cardDesc}>
                Enter any wallet address to discover all Freename Web3 domains linked to it — powered by the Freename reverse resolver API.
              </Text>
              <Text style={s.inputLabel}>WALLET ADDRESS</Text>
              <TextInput
                style={[s.inputField, { borderColor: '#8247E566' }]}
                value={reverseAddr}
                onChangeText={v => { setReverseAddr(v); setReverseResults(null); setReverseError(''); }}
                placeholder="0x... or BTNG-GOLD-... or bc1..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {/* Quick-fill with active wallet domain addresses */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                {ALL_DOMAINS.map(dk => {
                  const dc = DOMAIN_REGISTRY[dk];
                  const recs = allRecords[dk] ?? [];
                  const first = recs.find(r => r.chain === 'ETH') ?? recs.find(r => r.chain === 'SOL') ?? recs[0];
                  if (!first) return null;
                  return (
                    <TouchableOpacity
                      key={dk}
                      style={[s.chainChip, { borderColor: dc.color + '55', backgroundColor: dc.color + '10' }]}
                      onPress={() => { setReverseAddr(first.wallet_address); setReverseResults(null); setReverseError(''); }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 12 }}>{dc.emoji}</Text>
                      <Text style={[s.chainChipText, { color: dc.color, fontWeight: FontWeight.bold }]}
                        numberOfLines={1}>{first.wallet_address.slice(0, 14)}…</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[s.addFirstBtn, { backgroundColor: '#8247E5', shadowColor: '#8247E5' }, (reverseLoading || !reverseAddr.trim()) && { opacity: 0.45 }]}
                onPress={handleReverseResolve}
                disabled={reverseLoading || !reverseAddr.trim()}
                activeOpacity={0.85}
              >
                {reverseLoading
                  ? <ActivityIndicator size="small" color={Colors.bg} />
                  : <MaterialIcons name="find-replace" size={17} color={Colors.bg} />}
                <Text style={s.addFirstBtnText}>{reverseLoading ? 'Looking up…' : 'Reverse Resolve Address'}</Text>
              </TouchableOpacity>

              {/* Error */}
              {reverseError !== '' && (
                <View style={[s.verifyResult, { borderColor: Colors.warning + '55', backgroundColor: Colors.warningBg }]}>
                  <View style={s.verifyResultHeader}>
                    <MaterialIcons name="search-off" size={18} color={Colors.warning} />
                    <Text style={[s.verifyResultTitle, { color: Colors.warning }]}>{reverseError}</Text>
                  </View>
                </View>
              )}

              {/* Results */}
              {reverseResults !== null && reverseResults.length > 0 && (
                <View style={{ gap: Spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons name="check-circle" size={14} color={'#8247E5'} />
                    <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#8247E5', includeFontPadding: false }}>
                      {reverseResults.length} domain{reverseResults.length !== 1 ? 's' : ''} found
                    </Text>
                  </View>
                  {reverseResults.map((res, idx) => (
                    <View key={idx} style={[s.reverseResultCard, { borderColor: '#8247E544' }]}>
                      {/* Domain row */}
                      <View style={s.reverseResultHeader}>
                        <View style={s.reverseResultIconWrap}>
                          <MaterialIcons name="language" size={18} color="#8247E5" />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[s.reverseResultHost, { color: '#8247E5' }]}>{res.host}</Text>
                          <Text style={s.reverseResultSub}>{res.network} · {res.tld.toUpperCase()} · {res.isSld ? 'SLD' : 'TLD'}</Text>
                        </View>
                        <View style={[s.chainPill, { backgroundColor: '#8247E518', borderColor: '#8247E544' }]}>
                          <Text style={[s.chainPillText, { color: '#8247E5' }]}>🟣 POLYGON</Text>
                        </View>
                      </View>
                      {/* Token ID */}
                      {res.tokenId ? (
                        <View style={s.reverseTokenRow}>
                          <MaterialIcons name="token" size={11} color={Colors.textMuted} />
                          <Text style={s.reverseTokenText} numberOfLines={1} ellipsizeMode="middle">
                            Token ID: {res.tokenId}
                          </Text>
                        </View>
                      ) : null}
                      {/* Crypto records */}
                      {res.records.filter(r => r.type !== 'A' && r.type !== 'NS' && r.type !== 'CNAME').slice(0, 5).map((rec, ri) => (
                        <View key={ri} style={s.reverseRecRow}>
                          <View style={s.reverseRecType}>
                            <Text style={s.reverseRecTypeText}>{rec.type}</Text>
                          </View>
                          <Text style={s.reverseRecVal} numberOfLines={1} ellipsizeMode="middle">{rec.value}</Text>
                          <TouchableOpacity
                            onPress={() => Clipboard.setString(rec.value)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <MaterialIcons name="content-copy" size={11} color={Colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {res.records.filter(r => r.type !== 'A' && r.type !== 'NS' && r.type !== 'CNAME').length > 5 && (
                        <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 }}>
                          +{res.records.filter(r => r.type !== 'A' && r.type !== 'NS' && r.type !== 'CNAME').length - 5} more records
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Resolve all domains card */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <MaterialIcons name="compare-arrows" size={15} color={Colors.primary} />
                <Text style={s.cardTitle}>BTNG Domain Resolution</Text>
              </View>

              {/* Chain filter strip */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {(['All', 'Polygon', 'Solana'] as const).map(chain => {
                  const isActive = domainChainFilter === chain;
                  const chainColor = chain === 'Polygon' ? '#8247E5' : chain === 'Solana' ? '#9945FF' : Colors.primary;
                  const chainEmoji = chain === 'Polygon' ? '🟣' : chain === 'Solana' ? '⚡' : '🌐';
                  const matchDomains = chain === 'All'
                    ? ALL_DOMAINS
                    : ALL_DOMAINS.filter(dk => DOMAIN_REGISTRY[dk].chain === chain);
                  const matchCount = matchDomains.length;
                  const recordCount = matchDomains.reduce((sum, dk) => sum + (allRecords[dk]?.length ?? 0), 0);
                  return (
                    <TouchableOpacity
                      key={chain}
                      style={[
                        s.chainFilterBtn,
                        isActive && { backgroundColor: chainColor, borderColor: chainColor },
                      ]}
                      onPress={() => setDomainChainFilter(chain)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 11 }}>{chainEmoji}</Text>
                      <Text style={[s.chainFilterText, isActive && { color: Colors.bg }]}>{chain}</Text>
                      <View style={[
                        s.chainFilterCount,
                        { backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : chainColor + '18', borderColor: isActive ? 'rgba(255,255,255,0.28)' : chainColor + '44' },
                      ]}>
                        <Text style={[s.chainFilterCountText, { color: isActive ? Colors.bg : chainColor }]}>{matchCount}d · {recordCount}r</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Filtered domain list */}
              {(() => {
                const filtered = ALL_DOMAINS.filter(dk =>
                  domainChainFilter === 'All' || DOMAIN_REGISTRY[dk].chain === domainChainFilter
                );
                if (filtered.length === 0) {
                  return (
                    <View style={[s.resolveRow, { borderColor: Colors.border, backgroundColor: Colors.bgElevated }]}>
                      <MaterialIcons name="filter-list-off" size={16} color={Colors.textMuted} />
                      <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>
                        No domains on the <Text style={{ fontWeight: FontWeight.bold }}>{domainChainFilter}</Text> chain.
                      </Text>
                    </View>
                  );
                }
                return filtered.map(dk => {
                  const dc = DOMAIN_REGISTRY[dk];
                  const recs = allRecords[dk] ?? [];
                  const primaryRecs = recs.filter(r => r.is_primary);
                  return (
                    <View key={dk} style={[s.resolveRow, { borderColor: dc.color + '33', backgroundColor: dc.color + '07' }]}>
                      <View style={[s.resolveEmoji, { backgroundColor: dc.color + '18', borderColor: dc.color + '44' }]}>
                        <Text style={{ fontSize: 18 }}>{dc.emoji}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[s.resolveDomain, { color: dc.color }]}>{dc.domain}</Text>
                          <View style={[s.resolveChainTag, { backgroundColor: dc.color + '18', borderColor: dc.color + '44' }]}>
                            <Text style={[s.resolveChainTagText, { color: dc.color }]}>{dc.chain}</Text>
                          </View>
                        </View>
                        {primaryRecs.length > 0 ? (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={{ marginTop: 2 }}
                            contentContainerStyle={{ flexDirection: 'row', gap: 5, paddingRight: 4 }}
                          >
                            {primaryRecs.map(r => {
                              const cc = chainCfg(r.chain);
                              return (
                                <TouchableOpacity
                                  key={r.id}
                                  style={[
                                    s.resolveChipItem,
                                    { borderColor: cc.color + '55', backgroundColor: cc.color + '10' },
                                  ]}
                                  onLongPress={() => setAddressQrModal({
                                    address: r.wallet_address,
                                    chain:   r.chain,
                                    domain:  dk,
                                    color:   cc.color,
                                    emoji:   cc.emoji,
                                  })}
                                  delayLongPress={400}
                                  activeOpacity={0.75}
                                >
                                  <Text style={{ fontSize: 10 }}>{cc.emoji}</Text>
                                  <Text style={[s.resolveChipChain, { color: cc.color }]}>{r.chain}</Text>
                                  <Text style={s.resolveChipAddr} numberOfLines={1}>
                                    {r.wallet_address.slice(0, 10)}
                                  </Text>
                                  <MaterialIcons name="qr-code" size={9} color={cc.color} />
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        ) : (
                          <Text style={s.resolveEmpty}>No records linked yet</Text>
                        )}
                      </View>
                      <View style={[s.resolveCountPill, { backgroundColor: dc.color + '18', borderColor: dc.color + '44' }]}>
                        <Text style={[s.resolveCountText, { color: dc.color }]}>{recs.length}</Text>
                      </View>
                    </View>
                  );
                });
              })()}

              {/* Copy All Primary Addresses + Export Records */}
              {(() => {
                const filtered = ALL_DOMAINS.filter(dk =>
                  domainChainFilter === 'All' || DOMAIN_REGISTRY[dk].chain === domainChainFilter
                );
                const lines: string[] = [];
                filtered.forEach(dk => {
                  const recs = allRecords[dk] ?? [];
                  recs.filter(r => r.is_primary).forEach(r => {
                    lines.push(`${dk} → ${r.chain}: ${r.wallet_address}`);
                  });
                });
                const totalRecs = filtered.reduce((s, dk) => s + (allRecords[dk]?.length ?? 0), 0);
                if (lines.length === 0 && totalRecs === 0) return null;
                return (
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    {lines.length > 0 && (
                      <TouchableOpacity
                        style={[s.copyAllBtn, { flex: 1 }]}
                        onPress={() => {
                          Clipboard.setStringAsync(lines.join('\n')).catch(()=>{});
                          showAlert('Copied', `${lines.length} primary address${lines.length !== 1 ? 'es' : ''} copied to clipboard.`);
                        }}
                        activeOpacity={0.85}
                      >
                        <MaterialIcons name="content-copy" size={13} color={Colors.primary} />
                        <Text style={[s.copyAllBtnText, { fontSize: 10 }]} numberOfLines={1}>
                          Copy Primary ({lines.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                    {totalRecs > 0 && (
                      <TouchableOpacity
                        style={[s.exportBtn, exportLoading && { opacity: 0.5 }]}
                        onPress={handleExportRecords}
                        disabled={exportLoading}
                        activeOpacity={0.85}
                      >
                        {exportLoading
                          ? <ActivityIndicator size="small" color={Colors.success} />
                          : <MaterialIcons name="file-download" size={13} color={Colors.success} />}
                        <Text style={s.exportBtnText} numberOfLines={1}>
                          {exportLoading ? 'Saving…' : `Export CSV (${totalRecs})`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
            </View>

            {/* Supported Namespaces */}
            {namespaces.length > 0 && (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="hub" size={15} color={Colors.primary} />
                  <Text style={s.cardTitle}>Resolver Namespaces</Text>
                  <View style={[s.chainPill, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                    <Text style={[s.chainPillText, { color: Colors.primary }]}>{namespaces.length} ACTIVE</Text>
                  </View>
                </View>
                <Text style={s.cardDesc}>
                  Namespaces enabled for resolution on the Freename API. BTNG domains use the FNS namespace.
                </Text>
                {namespaces.map(ns => {
                  const nsColor = ns.shortname === 'FNS' ? Colors.primary : ns.shortname === 'ENS' ? '#627EEA' : '#4D4D9F';
                  return (
                    <View key={ns.shortname} style={[s.resolveRow, { borderColor: nsColor + '33', backgroundColor: nsColor + '08' }]}>
                      <View style={[s.resolveEmoji, { backgroundColor: nsColor + '18', borderColor: nsColor + '44' }]}>
                        <MaterialIcons name="verified" size={18} color={nsColor} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[s.resolveDomain, { color: nsColor }]}>{ns.shortname}</Text>
                          {ns.shortname === 'FNS' && (
                            <View style={[s.chainPill, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                              <Text style={[s.chainPillText, { color: Colors.primary }]}>BTNG</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.resolveRecord}>{ns.name}</Text>
                        <Text style={[s.resolveRecord, { color: '#8247E5' }]} numberOfLines={1} ellipsizeMode="middle">
                          {ns.smartContractAddress}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* ── BTC Customer Service Payment QR Modal ─────────────────────────────── */}
      <Modal
        visible={btcCsModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setBtcCsModal(false); setBtcCsShareLoading(false); }}
      >
        <View style={pqr.overlay}>
          <View style={pqr.sheet}>

            {/* Header */}
            <View style={pqr.header}>
              <View style={[pqr.chainBadge, { backgroundColor: '#F7931A18', borderColor: '#F7931A55' }]}>
                <Text style={{ fontSize: 20 }}>🟠</Text>
                <Text style={[pqr.chainLabel, { color: '#F7931A' }]}>BTC</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={pqr.headerTitle}>Customer Service BTC</Text>
                <Text style={pqr.headerSub} numberOfLines={1}>BTNG Gold Coin · Bitcoin Mainnet</Text>
              </View>
              <TouchableOpacity
                style={pqr.closeBtn}
                onPress={() => { setBtcCsModal(false); setBtcCsShareLoading(false); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="close" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* QR Code */}
            <View style={pqr.qrWrap}>
              <View style={pqr.qrCard}>
                <QRCode
                  value={BTC_CUSTOMER_SERVICE_ADDRESS}
                  size={192}
                  color="#000000"
                  backgroundColor="#FFFFFF"
                  getRef={(c: any) => { btcCsQrRef.current = c; }}
                />
              </View>
              <View style={[pqr.scanHint, { borderColor: '#F7931A55', backgroundColor: '#F7931A08' }]}>
                <MaterialIcons name="qr-code-scanner" size={12} color="#F7931A" />
                <Text style={[pqr.scanHintText, { color: '#F7931A' }]}>Scan to send BTC — Customer Service</Text>
              </View>
            </View>

            {/* Address block */}
            <View style={[pqr.addrBox, { borderColor: '#F7931A55', backgroundColor: '#F7931A07' }]}>
              <MaterialIcons name="currency-bitcoin" size={13} color="#F7931A" />
              <Text style={[pqr.addrText, { color: '#F7931A' }]} selectable numberOfLines={2}>
                {BTC_CUSTOMER_SERVICE_ADDRESS}
              </Text>
              <TouchableOpacity
                onPress={() => { Clipboard.setString(BTC_CUSTOMER_SERVICE_ADDRESS); showAlert('Copied', 'BTC customer service address copied.'); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="content-copy" size={14} color="#F7931A" />
              </TouchableOpacity>
            </View>

            {/* Info grid */}
            <View style={pqr.infoRow}>
              {[
                { label: 'Network',  value: 'Mainnet',      color: '#F7931A' },
                { label: 'Format',   value: 'P2PKH Legacy', color: Colors.textPrimary },
                { label: 'Symbol',   value: 'BTC',          color: '#F7931A' },
                { label: 'Purpose',  value: 'Support',      color: Colors.success },
              ].map(row => (
                <View key={row.label} style={pqr.infoCell}>
                  <Text style={pqr.infoCellLabel}>{row.label}</Text>
                  <Text style={[pqr.infoCellValue, { color: row.color }]} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Warning */}
            <View style={[pqr.warnBox, { borderColor: Colors.warning + '44', backgroundColor: Colors.warningBg }]}>
              <MaterialIcons name="warning" size={12} color={Colors.warning} />
              <Text style={pqr.warnText}>
                Verify the full address before sending. Bitcoin transactions are irreversible and cannot be refunded.
              </Text>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <TouchableOpacity
                style={[pqr.copyBtn, { flex: 1 }]}
                onPress={() => { Clipboard.setString(BTC_CUSTOMER_SERVICE_ADDRESS); showAlert('Copied', 'BTC address copied.'); }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="content-copy" size={15} color="#F7931A" />
                <Text style={[pqr.copyBtnText, { color: '#F7931A' }]}>Copy Address</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[pqr.shareBtn, { flex: 1, backgroundColor: '#F7931A', shadowColor: '#F7931A' }, btcCsShareLoading && { opacity: 0.6 }]}
                onPress={handleShareBtcCsQr}
                disabled={btcCsShareLoading}
                activeOpacity={0.85}
              >
                {btcCsShareLoading
                  ? <ActivityIndicator size="small" color={Colors.bg} />
                  : <MaterialIcons name="share" size={15} color={Colors.bg} />}
                <Text style={pqr.shareBtnText}>{btcCsShareLoading ? 'Saving…' : 'Share QR'}</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ── Payment Address QR Modal ────────────────────────────────────────── */}
      <Modal
        visible={addressQrModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setAddressQrModal(null); setPayQrShareLoading(false); }}
      >
        {addressQrModal ? (() => {
          const { address, chain, domain: qrDomain, color: qrColor, emoji: qrEmoji } = addressQrModal;
          const dc = DOMAIN_REGISTRY[qrDomain];
          const handleSharePayQr = async () => {
            if (!payQrRef.current) return;
            setPayQrShareLoading(true);
            payQrRef.current.toDataURL(async (data: string) => {
              try {
                const fileName = `btng_pay_${chain}_${Date.now()}.png`;
                const filePath = `${FileSystem.documentDirectory}${fileName}`;
                await FileSystem.writeAsStringAsync(filePath, data, { encoding: FileSystem.EncodingType.Base64 });
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(filePath, { mimeType: 'image/png', dialogTitle: `Send ${chain} to ${qrDomain}`, UTI: 'public.png' });
                } else {
                  showAlert('QR Saved', `Payment QR for ${chain} saved to app storage.`);
                }
              } catch (e: any) {
                showAlert('Share Error', e?.message ?? 'Failed to share QR.');
              } finally {
                setPayQrShareLoading(false);
              }
            });
          };
          return (
            <View style={pqr.overlay}>
              <View style={pqr.sheet}>

                {/* Header */}
                <View style={pqr.header}>
                  <View style={[pqr.chainBadge, { backgroundColor: qrColor + '18', borderColor: qrColor + '44' }]}>
                    <Text style={{ fontSize: 20 }}>{qrEmoji}</Text>
                    <Text style={[pqr.chainLabel, { color: qrColor }]}>{chain}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={pqr.headerTitle}>Payment QR</Text>
                    <Text style={pqr.headerSub} numberOfLines={1}>{qrDomain}</Text>
                  </View>
                  <TouchableOpacity
                    style={pqr.closeBtn}
                    onPress={() => { setAddressQrModal(null); setPayQrShareLoading(false); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* QR Code */}
                <View style={pqr.qrWrap}>
                  <View style={pqr.qrCard}>
                    <QRCode
                      value={address}
                      size={192}
                      color="#000000"
                      backgroundColor="#FFFFFF"
                      getRef={(c: any) => { payQrRef.current = c; }}
                    />
                  </View>
                  <View style={[pqr.scanHint, { borderColor: qrColor + '44', backgroundColor: qrColor + '08' }]}>
                    <MaterialIcons name="qr-code-scanner" size={12} color={qrColor} />
                    <Text style={[pqr.scanHintText, { color: qrColor }]}>Scan to send {chain} directly</Text>
                  </View>
                </View>

                {/* Address block */}
                <View style={[pqr.addrBox, { borderColor: qrColor + '44', backgroundColor: qrColor + '07' }]}>
                  <MaterialIcons name="link" size={12} color={qrColor} />
                  <Text style={[pqr.addrText, { color: qrColor }]} selectable numberOfLines={2}>{address}</Text>
                  <TouchableOpacity
                    onPress={() => { Clipboard.setString(address); showAlert('Copied', `${chain} address copied to clipboard.`); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="content-copy" size={14} color={qrColor} />
                  </TouchableOpacity>
                </View>

                {/* Domain + chain info row */}
                <View style={pqr.infoRow}>
                  {[
                    { label: 'Domain',  value: dc.domain,    color: dc.color    },
                    { label: 'Chain',   value: chain,        color: qrColor     },
                    { label: 'Symbol',  value: chainCfg(chain).symbol, color: qrColor },
                    { label: 'Network', value: dc.chain,     color: Colors.textSecondary },
                  ].map(row => (
                    <View key={row.label} style={pqr.infoCell}>
                      <Text style={pqr.infoCellLabel}>{row.label}</Text>
                      <Text style={[pqr.infoCellValue, { color: row.color }]} numberOfLines={1}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Warning */}
                <View style={[pqr.warnBox, { borderColor: Colors.warning + '44', backgroundColor: Colors.warningBg }]}>
                  <MaterialIcons name="warning" size={12} color={Colors.warning} />
                  <Text style={pqr.warnText}>Always verify the full address before sending. Crypto transactions are irreversible.</Text>
                </View>

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity
                    style={[pqr.copyBtn, { flex: 1 }]}
                    onPress={() => { Clipboard.setString(address); showAlert('Copied', `${chain} address copied.`); }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="content-copy" size={15} color={qrColor} />
                    <Text style={[pqr.copyBtnText, { color: qrColor }]}>Copy Address</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[pqr.shareBtn, { flex: 1, backgroundColor: qrColor, shadowColor: qrColor }, payQrShareLoading && { opacity: 0.6 }]}
                    onPress={handleSharePayQr}
                    disabled={payQrShareLoading}
                    activeOpacity={0.85}
                  >
                    {payQrShareLoading
                      ? <ActivityIndicator size="small" color={Colors.bg} />
                      : <MaterialIcons name="share" size={15} color={Colors.bg} />}
                    <Text style={pqr.shareBtnText}>{payQrShareLoading ? 'Saving…' : 'Share QR'}</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </View>
          );
        })() : null}
      </Modal>

      {/* ── Share Domain QR Modal ───────────────────────────────────────────── */}
      <Modal
        visible={shareModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setShareModal(null); setShareLoading(false); }}
      >
        {shareModal ? (() => {
          const d  = shareModal.domain;
          const dc = DOMAIN_REGISTRY[d];
          return (
            <View style={qrs.overlay}>
              <View style={qrs.sheet}>

                {/* Header */}
                <View style={qrs.header}>
                  <Text style={{ fontSize: 24 }}>{dc.emoji}</Text>
                  <Text style={[qrs.headerDomain, { color: dc.color }]}>{d}</Text>
                  <TouchableOpacity
                    style={qrs.closeBtn}
                    onPress={() => { setShareModal(null); setShareLoading(false); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* QR Code */}
                <View style={qrs.qrWrap}>
                  <View style={qrs.qrCard}>
                    <QRCode
                      value={d}
                      size={180}
                      color="#000000"
                      backgroundColor="#FFFFFF"
                      getRef={(c: any) => { qrRefs.current[d] = c; }}
                    />
                  </View>
                  <Text style={[qrs.qrDomain, { color: dc.color }]}>{d}</Text>
                  <Text style={qrs.qrSub}>Scan to resolve BTNG Web3 Domain</Text>
                  <View style={[qrs.chainBadge, { backgroundColor: dc.color + '18', borderColor: dc.color + '44' }]}>
                    <Text style={[qrs.chainBadgeText, { color: dc.color }]}>{dc.chain} · {dc.nftFormat} · {dc.registry}</Text>
                  </View>
                </View>

                {/* Info */}
                <View style={qrs.infoRow}>
                  <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
                  <Text style={qrs.infoText}>
                    Compatible with MetaMask, WalletConnect, and any Web3 wallet that supports domain resolution.
                  </Text>
                </View>

                {/* Share button */}
                <TouchableOpacity
                  style={[qrs.shareBtn, { backgroundColor: dc.color, shadowColor: dc.color }, shareLoading && { opacity: 0.6 }]}
                  onPress={() => handleShareQR(d)}
                  disabled={shareLoading}
                  activeOpacity={0.85}
                >
                  {shareLoading
                    ? <ActivityIndicator size="small" color={Colors.bg} />
                    : <MaterialIcons name="share" size={18} color={Colors.bg} />
                  }
                  <Text style={qrs.shareBtnText}>
                    {shareLoading ? 'Generating image…' : 'Share QR Code'}
                  </Text>
                </TouchableOpacity>

                {/* Copy domain name */}
                <TouchableOpacity
                  style={qrs.copyBtn}
                  onPress={() => {
                    Clipboard.setString(d);
                    showAlert('Copied', `"${d}" copied to clipboard.`);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="content-copy" size={14} color={dc.color} />
                  <Text style={[qrs.copyBtnText, { color: dc.color }]}>Copy Domain Name</Text>
                </TouchableOpacity>

              </View>
            </View>
          );
        })() : null}
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:             { flex: 1, backgroundColor: Colors.bg },
  topBar:                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:               { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:             { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:              { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },
  topSub:                { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },

  domainSwitcher:        { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: 3, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  domainSwitchBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border, position: 'relative' },
  domainSwitchText:      { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  domainSwitchDot:       { position: 'absolute', bottom: 3, width: 18, height: 3, borderRadius: 1.5 },

  tabRow:                { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  tabBtn:                { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: Spacing.sm - 1, borderRadius: Radius.md },
  tabBtnActive:          { backgroundColor: Colors.primary },
  tabText:               { fontSize: 9, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:         { color: Colors.bg },

  scroll:                { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  card:                  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  cardHeader:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle:             { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardDesc:              { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },

  chainPill:             { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  chainPillText:         { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },

  domainContextBanner:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3 },
  domainContextDomain:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  domainContextSub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  switchBtn:             { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm - 1, borderRadius: Radius.full, borderWidth: 1 },
  switchBtnText:         { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },

  portfolioHero:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  portfolioHeroLeft:     { gap: 3 },
  portfolioHeroTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  portfolioHeroSub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  portfolioStatsRow:     { flexDirection: 'row', gap: Spacing.sm },
  portfolioStatPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  portfolioStatText:     { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.6, includeFontPadding: false },

  portfolioDomainCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, overflow: 'hidden' },
  portfolioCardHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  portfolioCardEmoji:    { width: 54, height: 54, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  portfolioCardDomain:   { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
  portfolioCardCategory: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  portfolioCardCategoryText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  portfolioCardNs:       { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  portfolioCardNsText:   { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  portfolioCardDesc:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  mintedBadge:           { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  mintedBadgeText:       { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },

  portfolioInfoGrid:     { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: 4 },
  portfolioInfoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '33' },
  portfolioInfoLabel:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  portfolioInfoValue:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false, maxWidth: '60%', textAlign: 'right' },

  portfolioStatusRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  portfolioStatusChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  portfolioStatusChipText: { fontSize: 9, fontWeight: FontWeight.semibold, includeFontPadding: false },

  portfolioTapRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderTopWidth: 1, borderTopColor: Colors.border + '44' },
  portfolioTapText:      { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  summaryRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  summaryLabel:          { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  summaryValue:          { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  actionRow:             { flexDirection: 'row', gap: Spacing.sm },
  refreshBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.primary + '55' },
  refreshBtnText:        { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  addBtn:                { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  addBtnText:            { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  loadingWrap:           { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText:           { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  emptyWrap:             { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle:            { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:              { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, includeFontPadding: false, paddingHorizontal: Spacing.lg },

  statsRow:              { flexDirection: 'row', gap: Spacing.sm },
  statCell:              { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:               { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:             { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  recCard:               { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, overflow: 'hidden' },
  recHeader:             { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  recEmoji:              { width: 46, height: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recTitleRow:           { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  recChain:              { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  recBadge:              { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  recBadgeText:          { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  recLabel:              { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  recActions:            { flexDirection: 'row', gap: 6, flexShrink: 0 },
  recActionBtn:          { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  recAddress:            { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  recAddressText:        { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  recMeta:               { flexDirection: 'row', alignItems: 'center', gap: 5 },
  recMetaText:           { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  metaDot:               { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  setPrimaryHint:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '44' },
  setPrimaryHintText:    { flex: 1, fontSize: 10, color: Colors.warning, includeFontPadding: false },

  addHero:               { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', gap: Spacing.sm },
  heroTitle:             { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  heroSub:               { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  chainGrid:             { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chainCard:             { width: '22%', flex: 1, alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, paddingVertical: Spacing.md, paddingHorizontal: 4, position: 'relative', overflow: 'hidden', minWidth: 70 },
  chainCardKey:          { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  chainCardLabel:        { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  chainSelDot:           { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl },

  addFirstBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  addFirstBtnText:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  inputLabel:            { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  inputField:            { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  previewBox:            { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  previewTitle:          { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  previewAddr:           { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  statusPill:            { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  statusPillText:        { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  settingsInfoRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  settingsInfoLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  settingsInfoValue:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  settingsInfoSub:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  defiNote:              { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  defiNoteText:          { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  lockNote:              { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  lockNoteTitle:         { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  lockNoteText:          { fontSize: FontSize.xs, color: Colors.warning, lineHeight: 15, includeFontPadding: false },
  emailProviderCard:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  emailProviderEmoji:    { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emailProviderName:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  emailProviderDesc:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
  emailProviderBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, flexShrink: 0 },
  emailProviderBtnText:  { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  customizationBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4 },
  customizationBtnText:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },

  quickFillBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  quickFillText:         { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  chainChip:             { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  chainChipText:         { fontSize: 11, color: Colors.textMuted, includeFontPadding: false },
  verifyResult:          { borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.md, marginTop: Spacing.sm },
  verifyResultHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  verifyResultTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  verifyResultSub:       { fontSize: FontSize.xs, includeFontPadding: false, marginTop: 2 },
  verifyResultBody:      { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 },
  verifyRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  verifyRowLabel:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  verifyRowValue:        { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, textAlign: 'right', includeFontPadding: false },
  copyAddrBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 2, marginTop: Spacing.sm },
  copyAddrBtnText:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  resolveRow:            { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  resolveEmoji:          { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resolveDomain:         { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  resolveRecord:         { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  resolveEmpty:          { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  resolveCountPill:      { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  resolveCountText:      { fontSize: 12, fontWeight: FontWeight.heavy, includeFontPadding: false },

  copyAllBtn:          { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '55', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4 },
  copyAllBtnText:      { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  copyAllBtnBadge:     { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  copyAllBtnBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  exportBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.successBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '55', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4 },
  exportBtnText:       { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  chainFilterBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 3, paddingHorizontal: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.border },
  chainFilterText:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  chainFilterCount:     { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1 },
  chainFilterCountText: { fontSize: 9, fontWeight: FontWeight.heavy as any, includeFontPadding: false },

  resolveChipItem:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  resolveChipChain:    { fontSize: 9, fontWeight: FontWeight.heavy as any, includeFontPadding: false },
  resolveChipAddr:     { fontSize: 9, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, maxWidth: 72 },

  resolveChainTag:      { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  resolveChainTagText:  { fontSize: 8, fontWeight: FontWeight.heavy as any, includeFontPadding: false },

  zoneLiveCard:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  zoneLiveStatus:   { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.6, includeFontPadding: false },
  zoneLiveUuid:     { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  syncBtn:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3 },
  syncBtnText:      { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  syncBadge:        { backgroundColor: Colors.success, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  syncBadgeText:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },

  shareQrBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  shareQrBtnText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  reverseResultCard:    { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, overflow: 'hidden' },
  reverseResultHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reverseResultIconWrap:{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#8247E518', borderWidth: 1, borderColor: '#8247E544', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reverseResultHost:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  reverseResultSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  reverseTokenRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  reverseTokenText:     { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  reverseRecRow:        { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  reverseRecType:       { backgroundColor: '#8247E518', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#8247E544', flexShrink: 0 },
  reverseRecTypeText:   { fontSize: 9, fontWeight: FontWeight.heavy, color: '#8247E5', includeFontPadding: false },
  reverseRecVal:        { flex: 1, fontSize: 9, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── Payment Address QR Modal Styles ────────────────────────────────────────
const pqr = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(6,6,8,0.92)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  sheet:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chainBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5, flexShrink: 0 },
  chainLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  headerTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  headerSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  closeBtn:      { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  qrWrap:        { alignItems: 'center', gap: Spacing.sm },
  qrCard:        { padding: Spacing.md + 2, backgroundColor: '#FFFFFF', borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.border + '55', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  scanHint:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  scanHintText:  { fontSize: 11, fontWeight: FontWeight.semibold, includeFontPadding: false },
  addrBox:       { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  addrText:      { flex: 1, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: FontWeight.semibold, lineHeight: 15, includeFontPadding: false },
  infoRow:       { flexDirection: 'row', gap: Spacing.sm },
  infoCell:      { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 2 },
  infoCellLabel: { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false, letterSpacing: 0.5 },
  infoCellValue: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  warnBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  warnText:      { flex: 1, fontSize: 10, color: Colors.warning, lineHeight: 14, includeFontPadding: false },
  copyBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.md - 2, borderWidth: 1, borderColor: Colors.border },
  copyBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  shareBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg, paddingVertical: Spacing.md - 2, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.28, shadowRadius: 6, elevation: 4 },
  shareBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ─── Share QR Modal Styles ────────────────────────────────────────────────────
const qrs = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(6,6,8,0.88)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  sheet:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerDomain:  { flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  closeBtn:      { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  qrWrap:        { alignItems: 'center', gap: Spacing.sm },
  qrCard:        { padding: Spacing.lg, backgroundColor: '#FFFFFF', borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.border + '55', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  qrDomain:      { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  qrSub:         { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  chainBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  chainBadgeText:{ fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  infoRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.border },
  infoText:      { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
  shareBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  shareBtnText:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  copyBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  copyBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
});
