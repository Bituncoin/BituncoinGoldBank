import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, KeyboardAvoidingView,
  Platform, Animated, FlatList, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { useP2P, useMyListings, useMyP2POrders } from '@/hooks/useP2P';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGButton, SectionHeader } from '@/components';
import { PAYMENT_METHODS } from '@/constants/mockData';
import { Screen } from '@/constants/theme';
import { P2PListing, P2POrder } from '@/services/p2pService';
import { AFRICAN_CURRENCIES, AfricanCurrency, convertUSDtoLocal, formatLocalCurrency } from '@/constants/africanCurrencies';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { getSupabaseClient } from '@/template';
import { Image } from 'expo-image';
import { useAutoRefresh } from '@/hooks/useLivePoll';
import { useLiveOrderBook } from '@/hooks/useLiveOrderBook';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { useP2PAlerts, P2PToast } from '@/hooks/useP2PAlerts';
import { useFocusEffect } from 'expo-router';
import { ZoneEngine } from '@/constants/zoneEngine';
import type { ZoneResolution } from '@/constants/zoneResolver';

const zoneEngine = new ZoneEngine();

// ── Gold coin image ───────────────────────────────────────────────────────────
const BTNG_COIN_IMG = require('@/assets/images/btng_coin_logo.jpg');
const GOLD_SYMBOLS = new Set(['BTNGG', 'BTNG-G', 'BTNG-KG', 'BTNG']);

// ── Alert target currencies ─────────────────────────────────────────────────
const ALERT_CURRENCIES = [
  { code: 'GHS', flag: '🇬🇭', name: 'Ghana Cedi' },
  { code: 'NGN', flag: '🇳🇬', name: 'Nigerian Naira' },
  { code: 'KES', flag: '🇰🇪', name: 'Kenyan Shilling' },
  { code: 'ZAR', flag: '🇿🇦', name: 'South African Rand' },
  { code: 'USD', flag: '🇺🇸', name: 'US Dollar' },
  { code: 'EUR', flag: '🇪🇺', name: 'Euro' },
];

// ── FX Ticker currencies ──────────────────────────────────────────────────
const FX_TICKER_CURRENCIES = [
  { code: 'GHS', flag: '🇬🇭', label: 'Ghana Cedi' },
  { code: 'NGN', flag: '🇳🇬', label: 'Nigerian Naira' },
  { code: 'KES', flag: '🇰🇪', label: 'Kenyan Shilling' },
  { code: 'ZAR', flag: '🇿🇦', label: 'South African Rand' },
  { code: 'EGP', flag: '🇪🇬', label: 'Egyptian Pound' },
  { code: 'MAD', flag: '🇲🇦', label: 'Moroccan Dirham' },
  { code: 'TZS', flag: '🇹🇿', label: 'Tanzanian Shilling' },
  { code: 'ETB', flag: '🇪🇹', label: 'Ethiopian Birr' },
];

// ── Comprehensive coin list (20+ major coins) ─────────────────────────────
const P2P_COINS = [
  'All', 'BTNGG', 'BTNG-G', 'BTNG-KG',
  'BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP',
  'ADA', 'DOGE', 'AVAX', 'MATIC', 'DOT',
  'LINK', 'UNI', 'ATOM', 'LTC', 'TRX',
  'USDC', 'SHIB', 'FIL', 'ICP', 'NEAR',
];

const COIN_INFO: Record<string, { name: string; logo: string; color: string; isGold?: boolean; price?: number }> = {
  BTNGG:    { name: 'Bituncoin Gold (1/1000 oz)', logo: '🏅', color: '#D4A017', isGold: true, price: 4.4622 },
  'BTNG-G': { name: 'BTNG Gold per Gram',         logo: '🥇', color: '#C8900A', isGold: true, price: 143.46 },
  'BTNG-KG':{ name: 'BTNG Gold per Kilogram',     logo: '🏆', color: '#B87333', isGold: true, price: 143_463 },
  BTNG:     { name: 'Bituncoin Gold',              logo: '🥇', color: '#D4A017', isGold: true },
  BTC:      { name: 'Bitcoin',        logo: '₿',  color: '#F7931A', price: 107_200 },
  ETH:      { name: 'Ethereum',       logo: 'Ξ',  color: '#627EEA', price: 3_840 },
  USDT:     { name: 'Tether',         logo: '₮',  color: '#26A17B', price: 1.0 },
  USDC:     { name: 'USD Coin',       logo: '◎',  color: '#2775CA', price: 1.0 },
  BNB:      { name: 'BNB Chain',      logo: '◈',  color: '#F0B90B', price: 685 },
  SOL:      { name: 'Solana',         logo: '◎',  color: '#9945FF', price: 184 },
  XRP:      { name: 'Ripple',         logo: '✕',  color: '#00AAE4', price: 2.14 },
  ADA:      { name: 'Cardano',        logo: '₳',  color: '#0033AD', price: 0.89 },
  DOGE:     { name: 'Dogecoin',       logo: 'Ð',  color: '#C2A633', price: 0.38 },
  AVAX:     { name: 'Avalanche',      logo: '▲',  color: '#E84142', price: 38.5 },
  MATIC:    { name: 'Polygon',        logo: '⬡',  color: '#8247E5', price: 0.89 },
  DOT:      { name: 'Polkadot',       logo: '●',  color: '#E6007A', price: 7.8 },
  LINK:     { name: 'Chainlink',      logo: '⬡',  color: '#2A5ADA', price: 18.4 },
  UNI:      { name: 'Uniswap',        logo: '🦄',  color: '#FF007A', price: 10.2 },
  ATOM:     { name: 'Cosmos',         logo: '⚛',  color: '#6F7390', price: 8.5 },
  LTC:      { name: 'Litecoin',       logo: 'Ł',  color: '#A6A9AA', price: 96.0 },
  TRX:      { name: 'TRON',           logo: '♦',  color: '#EF0027', price: 0.27 },
  SHIB:     { name: 'Shiba Inu',      logo: '🐕',  color: '#FFA409', price: 0.0000248 },
  FIL:      { name: 'Filecoin',       logo: '⬡',  color: '#0090FF', price: 5.8 },
  ICP:      { name: 'Internet Computer', logo: '∞', color: '#29ABE2', price: 12.4 },
  NEAR:     { name: 'NEAR Protocol',  logo: '◆',  color: '#00C08B', price: 6.2 },
};

// All 54 Africa currencies for exchange tab
const AFRICA_54_CURRENCIES = [
  { code: 'GHS', flag: '🇬🇭', name: 'Ghana Cedi', country: 'Ghana' },
  { code: 'NGN', flag: '🇳🇬', name: 'Nigerian Naira', country: 'Nigeria' },
  { code: 'KES', flag: '🇰🇪', name: 'Kenyan Shilling', country: 'Kenya' },
  { code: 'ZAR', flag: '🇿🇦', name: 'South African Rand', country: 'South Africa' },
  { code: 'EGP', flag: '🇪🇬', name: 'Egyptian Pound', country: 'Egypt' },
  { code: 'ETB', flag: '🇪🇹', name: 'Ethiopian Birr', country: 'Ethiopia' },
  { code: 'TZS', flag: '🇹🇿', name: 'Tanzanian Shilling', country: 'Tanzania' },
  { code: 'UGX', flag: '🇺🇬', name: 'Ugandan Shilling', country: 'Uganda' },
  { code: 'MAD', flag: '🇲🇦', name: 'Moroccan Dirham', country: 'Morocco' },
  { code: 'XOF', flag: '🇸🇳', name: 'West African CFA', country: 'Senegal/W.Africa' },
  { code: 'XAF', flag: '🇨🇲', name: 'Central African CFA', country: 'Cameroon/C.Africa' },
  { code: 'DZD', flag: '🇩🇿', name: 'Algerian Dinar', country: 'Algeria' },
  { code: 'AOA', flag: '🇦🇴', name: 'Angolan Kwanza', country: 'Angola' },
  { code: 'BWP', flag: '🇧🇼', name: 'Botswana Pula', country: 'Botswana' },
  { code: 'MZN', flag: '🇲🇿', name: 'Mozambican Metical', country: 'Mozambique' },
  { code: 'ZMW', flag: '🇿🇲', name: 'Zambian Kwacha', country: 'Zambia' },
  { code: 'RWF', flag: '🇷🇼', name: 'Rwandan Franc', country: 'Rwanda' },
  { code: 'TND', flag: '🇹🇳', name: 'Tunisian Dinar', country: 'Tunisia' },
  { code: 'MUR', flag: '🇲🇺', name: 'Mauritian Rupee', country: 'Mauritius' },
  { code: 'NAD', flag: '🇳🇦', name: 'Namibian Dollar', country: 'Namibia' },
  { code: 'GMD', flag: '🇬🇲', name: 'Gambian Dalasi', country: 'Gambia' },
  { code: 'SOS', flag: '🇸🇴', name: 'Somali Shilling', country: 'Somalia' },
  { code: 'SDG', flag: '🇸🇩', name: 'Sudanese Pound', country: 'Sudan' },
  { code: 'LYD', flag: '🇱🇾', name: 'Libyan Dinar', country: 'Libya' },
  { code: 'MGA', flag: '🇲🇬', name: 'Malagasy Ariary', country: 'Madagascar' },
  { code: 'MWK', flag: '🇲🇼', name: 'Malawian Kwacha', country: 'Malawi' },
  { code: 'ZWL', flag: '🇿🇼', name: 'Zimbabwean Dollar', country: 'Zimbabwe' },
  { code: 'GNF', flag: '🇬🇳', name: 'Guinean Franc', country: 'Guinea' },
  { code: 'CDF', flag: '🇨🇩', name: 'Congolese Franc', country: 'DR Congo' },
  { code: 'BIF', flag: '🇧🇮', name: 'Burundian Franc', country: 'Burundi' },
];

// Live exchange pairs for Exchange tab
const EXCHANGE_PAIRS = [
  { base: 'BTNGG', quote: 'GHS',  flag: '🇬🇭', label: 'BTNGG/GHS' },
  { base: 'BTNGG', quote: 'NGN',  flag: '🇳🇬', label: 'BTNGG/NGN' },
  { base: 'BTNGG', quote: 'KES',  flag: '🇰🇪', label: 'BTNGG/KES' },
  { base: 'BTNGG', quote: 'ZAR',  flag: '🇿🇦', label: 'BTNGG/ZAR' },
  { base: 'BTNGG', quote: 'USD',  flag: '🇺🇸', label: 'BTNGG/USD' },
  { base: 'BTC',   quote: 'GHS',  flag: '🇬🇭', label: 'BTC/GHS' },
  { base: 'BTC',   quote: 'NGN',  flag: '🇳🇬', label: 'BTC/NGN' },
  { base: 'ETH',   quote: 'GHS',  flag: '🇬🇭', label: 'ETH/GHS' },
  { base: 'ETH',   quote: 'NGN',  flag: '🇳🇬', label: 'ETH/NGN' },
  { base: 'USDT',  quote: 'GHS',  flag: '🇬🇭', label: 'USDT/GHS' },
  { base: 'USDT',  quote: 'NGN',  flag: '🇳🇬', label: 'USDT/NGN' },
  { base: 'SOL',   quote: 'GHS',  flag: '🇬🇭', label: 'SOL/GHS' },
  { base: 'BNB',   quote: 'GHS',  flag: '🇬🇭', label: 'BNB/GHS' },
  { base: 'XRP',   quote: 'GHS',  flag: '🇬🇭', label: 'XRP/GHS' },
  { base: 'ADA',   quote: 'GHS',  flag: '🇬🇭', label: 'ADA/GHS' },
];

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending:   Colors.warning,
  paid:      '#3B82F6',
  confirmed: Colors.info,
  completed: Colors.success,
  disputed:  Colors.error,
  cancelled: Colors.textMuted,
};

const PAYMENT_OPTIONS = [
  'MTN MoMo', 'Vodafone Cash', 'Airtel Money',
  'Bank Transfer', 'Bank Wire', 'SWIFT',
  'Payoneer', 'Paypal',
];

// All unique African currencies (deduped by code)
const UNIQUE_CURRENCY_CODES: { code: string; flag: string; country: string }[] = (() => {
  const seen = new Set<string>();
  return AFRICAN_CURRENCIES.filter(c => {
    if (seen.has(c.code)) return false;
    seen.add(c.code);
    return true;
  }).map(c => ({ code: c.code, flag: c.flag, country: c.country }));
})();

const CURRENCIES = ['GHS', 'USD', 'NGN', 'KES', 'ZAR', 'EGP', 'ETB', 'MAD', 'TZS', 'XOF', 'XAF', 'UGX', 'ZMW', 'RWF', 'TND'];
const COIN_CHOICES = ['BTNGG', 'BTNG-G', 'BTNG-KG', 'BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'MATIC', 'LTC'];

function getBadgeColor(badge: string | null): string {
  if (badge === 'Elite') return Colors.primary;
  if (badge === 'Premium') return Colors.copper;
  if (badge === 'Safe Trader') return Colors.success;
  return Colors.info;
}

function getTraderName(listing: P2PListing): string {
  const p = listing.user_profiles;
  return p?.full_name ?? p?.username ?? p?.email?.split('@')[0] ?? 'Trader';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCoinPrice(price: number): string {
  if (price <= 0) return '—';
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  if (price >= 1_000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function P2PScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user, isAuthenticated } = useAuth();
  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);
  const isTablet = dims.width >= 768;
  const isDesktop = dims.width >= 1024;
  const hPad = isDesktop ? Spacing.xxl * 2 : isTablet ? Spacing.xxl : Spacing.xl;

  // ── Zone Engine state ────────────────────────────────────────────────────
  const [activeZone, setActiveZone] = useState<ZoneResolution | null>(null);
  const [zoneBlocked, setZoneBlocked] = useState<{ reason: string; maxAmount: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      try {
        const profileUser = user as any;
        const country: string = profileUser?.country ?? profileUser?.registeredCountry ?? 'GH';
        const rawKyc: string = profileUser?.kyc_status ?? 'pending';
        const kycLevel: 'NONE' | 'BASIC' | 'FULL' =
          rawKyc === 'approved' ? 'FULL' :
          rawKyc === 'pending'  ? 'BASIC' : 'NONE';
        const resolution = zoneEngine.resolveZone({
          userId: user.id,
          registeredCountry: country,
          kycLevel,
          userTier: 'STANDARD',
        });
        setActiveZone(resolution);
      } catch (e) {
        console.warn('[ZoneEngine] p2p resolve failed:', e);
      }
    }, [user?.id])
  );

  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [filterCoin, setFilterCoin] = useState('All');
  const [filterCurrency, setFilterCurrency] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<'market' | 'exchange' | 'myads' | 'orders' | 'certs'>('market');

  // ── Quick Buy BTNG modal ──────────────────────────────────────────────────
  const [quickBuyUnit, setQuickBuyUnit] = useState<{ symbol: string; label: string; price: number; color: string } | null>(null);
  const [quickBuyAmount, setQuickBuyAmount] = useState('');
  const [quickBuyCurrency, setQuickBuyCurrency] = useState('GHS');

  // ── BTNG Certs tab state ──────────────────────────────────────────────────
  const [certs, setCerts] = useState<any[]>([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [certsFilter, setCertsFilter] = useState<'all' | 'BTNG_GOLD_EXPRESS' | 'BTNG_EQUITY_BACKED'>('all');
  const [selectedCert, setSelectedCert] = useState<any | null>(null);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);

  const loadCerts = useCallback(async () => {
    setCertsLoading(true);
    const supabase = getSupabaseClient();
    const query = supabase
      .from('btng_certificates')
      .select('*, user_profiles(full_name, username, email, kyc_status, tier)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    const { data } = await query;
    const tradeable = (data ?? []).filter((c: any) => c.metadata?.tradeable === true);
    setCerts(certsFilter === 'all' ? tradeable : tradeable.filter((c: any) => c.cert_type === certsFilter));
    setCertsLoading(false);
  }, [certsFilter]);

  useEffect(() => {
    if (mainTab === 'certs') loadCerts();
  }, [mainTab, loadCerts]);

  const handleCertOffer = async () => {
    if (!isAuthenticated) { showAlert('Sign In Required', 'Please sign in to make an offer.'); return; }
    if (!selectedCert) return;
    const amount = parseFloat(offerAmount);
    if (!amount || amount <= 0) { showAlert('Invalid Amount', 'Please enter a valid offer amount in BTNGG.'); return; }
    setOfferLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setOfferLoading(false);
    setSelectedCert(null);
    setOfferAmount('');
    showAlert('Offer Submitted', `Your offer of ${amount.toLocaleString()} BTNGG for certificate ${selectedCert.cert_id} has been submitted.`, [{ text: 'OK' }]);
  };

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { getRate } = useExchangeRateContext();

  // ── P2P Price Alerts ─────────────────────────────────────────────────────
  const { toasts: alertToasts, addAlert, removeAlertForListing, hasAlert, getAlert, dismissToast } = useP2PAlerts(getRate);
  const [alertListing, setAlertListing] = useState<P2PListing | null>(null);
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertTargetCurrency, setAlertTargetCurrency] = useState('GHS');
  const [alertSaving, setAlertSaving] = useState(false);

  const marketType = side === 'Buy' ? 'sell' : 'buy';
  const { listings: rawListings, loading: listingsLoading, refresh: refreshListings } = useP2P({ coin: filterCoin, type: marketType });
  const listings = filterCurrency ? rawListings.filter(l => l.currency === filterCurrency) : rawListings;

  const { listings: myListings, loading: myAdsLoading, acting: myAdsActing, posting, postListing, pauseListing, removeListing } = useMyListings(user?.id);
  const { orders: myOrders, loading: ordersLoading, acting: orderActing, initiateOrder, updateStatus } = useMyP2POrders(user?.id);

  const [tradeListing, setTradeListing] = useState<P2PListing | null>(null);
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradePayment, setTradePayment] = useState('');
  const [tradeLoading, setTradeLoading] = useState(false);

  // ── P2P Chat ─────────────────────────────────────────────────────────────
  const [chatOrder, setChatOrder] = useState<P2POrder | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; senderId: string; text: string; ts: number; type?: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<ScrollView | null>(null);

  const [showPostAd, setShowPostAd] = useState(false);
  const [adForm, setAdForm] = useState({
    coin: 'BTNGG', type: 'sell' as 'buy' | 'sell', price: '', currency: 'GHS',
    minAmount: '', maxAmount: '', availableAmount: '', paymentMethods: [] as string[],
    responseTime: '< 15 min', terms: '',
  });

  const toggleAdPayment = (pm: string) => {
    setAdForm(f => ({
      ...f,
      paymentMethods: f.paymentMethods.includes(pm) ? f.paymentMethods.filter(p => p !== pm) : [...f.paymentMethods, pm],
    }));
  };

  const handlePostAd = async () => {
    if (!user?.id) { showAlert('Sign In Required', 'Please sign in to post an ad.'); return; }
    if (!adForm.price || !adForm.minAmount || !adForm.maxAmount || !adForm.availableAmount) {
      showAlert('Missing Fields', 'Please fill in all required fields.'); return;
    }
    if (adForm.paymentMethods.length === 0) { showAlert('Payment Method Required', 'Select at least one payment method.'); return; }
    const coin = COIN_INFO[adForm.coin];
    const { error } = await postListing({
      userId: user.id, coinSymbol: adForm.coin, coinName: coin?.name ?? adForm.coin,
      type: adForm.type, price: parseFloat(adForm.price), currency: adForm.currency,
      minAmount: parseFloat(adForm.minAmount), maxAmount: parseFloat(adForm.maxAmount),
      availableAmount: parseFloat(adForm.availableAmount), paymentMethods: adForm.paymentMethods,
      responseTime: adForm.responseTime, country: 'Ghana', terms: adForm.terms || undefined,
    });
    if (error) { showAlert('Failed', error); return; }
    setShowPostAd(false);
    setAdForm({ coin: 'BTNGG', type: 'sell', price: '', currency: 'GHS', minAmount: '', maxAmount: '', availableAmount: '', paymentMethods: [], responseTime: '< 15 min', terms: '' });
    showAlert('Ad Posted', 'Your P2P listing is now live on the marketplace.');
    setMainTab('myads');
  };

  const handleOpenAlertModal = (listing: P2PListing) => {
    if (!isAuthenticated) { showAlert('Sign In Required', 'Please sign in to set price alerts.'); return; }
    const existing = getAlert(listing.id);
    if (existing) { setAlertTargetPrice(String(existing.targetPrice)); setAlertTargetCurrency(existing.targetCurrency); }
    else {
      const listingRate = getRate(listing.currency) || 1;
      const ghsRate = getRate('GHS') || 1;
      setAlertTargetPrice(((listing.price / listingRate) * ghsRate * 0.97).toFixed(2));
      setAlertTargetCurrency('GHS');
    }
    setAlertListing(listing);
  };

  const handleSaveAlert = async () => {
    if (!alertListing) return;
    const target = parseFloat(alertTargetPrice.replace(/,/g, ''));
    if (isNaN(target) || target <= 0) { showAlert('Invalid Price', 'Please enter a valid target price.'); return; }
    setAlertSaving(true);
    await new Promise(r => setTimeout(r, 300));
    const alertCurr = ALERT_CURRENCIES.find(c => c.code === alertTargetCurrency);
    addAlert({
      listingId: alertListing.id, coinSymbol: alertListing.coin_symbol,
      listingPrice: alertListing.price, listingCurrency: alertListing.currency,
      targetPrice: target, targetCurrency: alertTargetCurrency, triggered: false,
      traderName: getTraderName(alertListing),
    });
    setAlertSaving(false);
    setAlertListing(null);
    showAlert('Alert Set', `Alert set for ${alertListing.coin_symbol} at ${alertCurr?.flag ?? ''} ${target.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${alertTargetCurrency}.`, [{ text: 'OK' }]);
  };

  const handleRemoveAlert = (listing: P2PListing) => {
    showAlert('Remove Alert', `Remove price alert for ${listing.coin_symbol}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeAlertForListing(listing.id) },
    ]);
  };

  const handleOpenTrade = (listing: P2PListing) => {
    if (!isAuthenticated) { showAlert('Sign In Required', 'Please sign in to trade.'); return; }
    if (listing.user_id === user?.id) { showAlert('Own Listing', 'You cannot trade against your own listing.'); return; }
    setTradeListing(listing);
    setTradeAmount('');
    setTradePayment(listing.payment_methods[0] ?? '');
  };

  const handleConfirmTrade = async () => {
    if (!tradeListing || !user?.id) return;
    const qty = parseFloat(tradeAmount);
    if (!qty || qty <= 0) { showAlert('Invalid Amount', 'Please enter a valid amount.'); return; }
    if (qty < tradeListing.min_amount) { showAlert('Too Small', `Minimum is ${tradeListing.min_amount} ${tradeListing.currency}.`); return; }
    if (qty > tradeListing.max_amount) { showAlert('Too Large', `Maximum is ${tradeListing.max_amount.toLocaleString()} ${tradeListing.currency}.`); return; }
    if (!tradePayment) { showAlert('Select Payment', 'Please select a payment method.'); return; }

    // ── Zone rule check ──────────────────────────────────────────────────────
    setZoneBlocked(null);
    if (activeZone) {
      try {
        const decision = zoneEngine.evaluateRules({
          userId: user.id,
          zoneId: activeZone.zoneId,
          assetId: tradeListing.coin_symbol,
          amount: qty,
          action: 'SEND',
        });
        if (!decision.allowed) {
          setZoneBlocked({
            reason: decision.reason ?? 'Zone order limit exceeded.',
            maxAmount: decision.maxAmount ?? 0,
          });
          return;
        }
      } catch (e) {
        console.warn('[ZoneEngine] p2p evaluate failed:', e);
      }
    }

    setTradeLoading(true);
    const { data, error } = await initiateOrder({
      listingId: tradeListing.id, buyerId: user.id, sellerId: tradeListing.user_id,
      coinSymbol: tradeListing.coin_symbol, amount: qty, price: tradeListing.price,
      totalFiat: qty * tradeListing.price, currency: tradeListing.currency, paymentMethod: tradePayment,
    });
    setTradeLoading(false);
    if (error) { showAlert('Order Failed', error); return; }
    setTradeListing(null);
    showAlert('Order Created', `P2P order #${data!.id.slice(0, 8)} created.`, [{ text: 'View Orders', onPress: () => setMainTab('orders') }]);
    refreshListings();
  };

  const openChat = (order: P2POrder) => {
    setChatOrder(order);
    // Seed initial system message
    setChatMessages([
      { id: '0', senderId: 'system', text: `P2P Order opened. ${order.coin_symbol} · ${order.amount} @ ${order.price.toLocaleString()} ${order.currency}. Escrow is active — crypto is locked until both parties confirm.`, ts: Date.now() - 60000, type: 'system' },
    ]);
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !chatOrder || !user?.id) return;
    const msg = { id: String(Date.now()), senderId: user.id, text: chatInput.trim(), ts: Date.now() };
    setChatMessages(prev => [...prev, msg]);
    setChatInput('');
    // Simulate trader reply after 2s
    setTimeout(() => {
      const replies = [
        'Acknowledged. Please send payment to the provided account.',
        'Waiting for your payment confirmation.',
        'Please complete within the escrow window.',
        'I have received your message. Processing now.',
        'Payment window is active. Do not close the trade.',
      ];
      const reply = { id: String(Date.now() + 1), senderId: 'trader', text: replies[Math.floor(Math.random() * replies.length)], ts: Date.now() };
      setChatMessages(prev => [...prev, reply]);
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 2000);
  };

  const handleOrderAction = async (order: P2POrder, newStatus: 'paid' | 'completed' | 'cancelled') => {
    const isBuyer = order.buyer_id === user?.id;
    const action = newStatus === 'paid' ? 'confirm payment sent' : newStatus === 'completed' ? 'release crypto' : 'cancel this order';
    showAlert(newStatus === 'cancelled' ? 'Cancel Order' : 'Confirm Action', `Are you sure you want to ${action}?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: newStatus === 'cancelled' ? 'destructive' : 'default',
        onPress: async () => {
          const { error } = await updateStatus(order.id, newStatus, isBuyer);
          if (error) showAlert('Error', error);
          else if (newStatus === 'completed') {
            showAlert('Trade Complete', 'The P2P trade has been completed successfully.');
            if (chatOrder?.id === order.id) {
              setChatMessages(prev => [...prev, { id: String(Date.now()), senderId: 'system', text: 'Trade completed successfully. Funds released from escrow.', ts: Date.now(), type: 'system' }]);
            }
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.containerOuter}>
      {/* ── Floating Price Alert Toasts — always on top ── */}
      <View style={[styles.toastLayer, { top: insets.top + Spacing.sm }]} pointerEvents="box-none">
        {alertToasts.map(toast => (
          <AlertToast key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
        ))}
      </View>

    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, isTablet && styles.headerTablet, isDesktop && { paddingHorizontal: hPad }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>P2P Exchange</Text>
          <View style={styles.headerSubRow}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDotSmall} />
              <Text style={styles.liveLabel}>54 Africa Markets · 25+ Coins</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.postBtn} onPress={() => isAuthenticated ? setShowPostAd(true) : showAlert('Sign In Required', 'Please sign in to post a P2P ad.')}>
          <MaterialIcons name="add" size={18} color={Colors.primary} />
          <Text style={styles.postBtnText}>Post Ad</Text>
        </TouchableOpacity>
      </View>

      {/* BTNG Gold Unit Banner */}
      <BTNGGoldBanner onUnitPress={(unit) => { setQuickBuyUnit(unit); setQuickBuyAmount(''); }} />

      {/* Live FX Ticker */}
      <LiveFXTicker />

      {/* Main Tabs */}
      <View style={[styles.mainTabRow, isTablet && styles.mainTabRowTablet, isDesktop && { marginHorizontal: hPad }]}>
        {([
          ['market', 'Market'],
          ['exchange', 'Exchange'],
          ['myads', 'My Ads'],
          ['orders', 'Orders'],
          ['certs', 'Certs'],
        ] as const).map(([t, label]) => (
          <TouchableOpacity key={t} style={[styles.mainTab, mainTab === t && styles.mainTabActive]} onPress={() => setMainTab(t as any)}>
            <Text style={[styles.mainTabText, mainTab === t && styles.mainTabTextActive]} numberOfLines={1}>{label}</Text>
            {t === 'orders' && myOrders.filter(o => !['completed', 'cancelled'].includes(o.status)).length > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{myOrders.filter(o => !['completed', 'cancelled'].includes(o.status)).length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── MARKET TAB ── */}
      {mainTab === 'market' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 0 }}>

          {/* ── Active Zone Pill ── */}
          {activeZone ? (
            <View style={zoneStyles.pill}>
              <View style={zoneStyles.pillDot} />
              <Text style={zoneStyles.pillName} numberOfLines={1}>
                {activeZone.zoneId.replace(/_/g, ' ')}
              </Text>
              <View style={zoneStyles.pillLimits}>
                {[
                  { label: 'SND', val: activeZone.config.maxSendAmount },
                  { label: 'SWP', val: activeZone.config.maxSwapAmount },
                  { label: 'WDR', val: activeZone.config.maxWithdrawAmount },
                ].map(item => (
                  <View key={item.label} style={zoneStyles.limitChip}>
                    <Text style={zoneStyles.limitLabel}>{item.label}</Text>
                    <Text style={zoneStyles.limitVal}>
                      {item.val >= 1000 ? `${(item.val / 1000).toFixed(0)}K` : item.val}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Buy / Sell toggle */}
          <View style={[styles.toggleRow, { marginTop: 0 }]}>
            {(['Buy', 'Sell'] as const).map(s => (
              <TouchableOpacity key={s} style={[styles.toggleBtn, side === s && styles.toggleBtnActive]} onPress={() => setSide(s)}>
                <Text style={[styles.toggleText, side === s && { color: s === 'Buy' ? Colors.success : Colors.error }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Live BTNG Order Book — always visible */}
          <View style={{ marginBottom: Spacing.sm }}>
            <BTNGOrderBookPanel getRate={getRate} />
          </View>

          {/* Coin filter — horizontal scroll with all 25+ coins */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coinFilter} contentContainerStyle={styles.coinFilterContent}>
            {P2P_COINS.map(c => (
              <TouchableOpacity key={c} style={[styles.coinChip, filterCoin === c && styles.coinChipActive]} onPress={() => setFilterCoin(c)}>
                {GOLD_SYMBOLS.has(c) && c !== 'All' ? (
                  <Image source={BTNG_COIN_IMG} style={{ width: 14, height: 14, borderRadius: 7 }} contentFit="cover" />
                ) : c !== 'All' && COIN_INFO[c] ? (
                  <Text style={{ fontSize: 10 }}>{COIN_INFO[c].logo}</Text>
                ) : null}
                <Text style={[styles.coinChipText, filterCoin === c && styles.coinChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* African Currency filter bar */}
          <View style={styles.currencyBarWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.currencyBarContent}>
              <TouchableOpacity style={[styles.currencyBarChip, filterCurrency === null && styles.currencyBarChipActive]} onPress={() => setFilterCurrency(null)} activeOpacity={0.75}>
                <Text style={styles.currencyBarFlag}>🌍</Text>
                <Text style={[styles.currencyBarCode, filterCurrency === null && styles.currencyBarCodeActive]}>All</Text>
              </TouchableOpacity>
              {UNIQUE_CURRENCY_CODES.map(c => {
                const isActive = filterCurrency === c.code;
                return (
                  <TouchableOpacity key={c.code} style={[styles.currencyBarChip, isActive && styles.currencyBarChipActive]} onPress={() => setFilterCurrency(isActive ? null : c.code)} activeOpacity={0.75}>
                    <Text style={styles.currencyBarFlag}>{c.flag}</Text>
                    <Text style={[styles.currencyBarCode, isActive && styles.currencyBarCodeActive]}>{c.code}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {filterCurrency && (() => {
            const cur = AFRICAN_CURRENCIES.find(c => c.code === filterCurrency);
            return cur ? (
              <View style={styles.activeCurrencyBadge}>
                <Text style={styles.activeCurrencyFlag}>{cur.flag}</Text>
                <Text style={styles.activeCurrencyText}>Showing {cur.code} · {cur.name}</Text>
                <TouchableOpacity onPress={() => setFilterCurrency(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={14} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            ) : null;
          })()}

          {/* Listings */}
          <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
            {listingsLoading ? (
              <View style={styles.centerPad}><ActivityIndicator color={Colors.primary} /><Text style={styles.mutedText}>Loading listings...</Text></View>
            ) : listings.length === 0 ? (
              <View style={styles.centerPad}>
                <MaterialIcons name="people" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No listings found</Text>
                <Text style={styles.mutedText}>Be the first to post a {side.toLowerCase()} ad</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowPostAd(true)}>
                  <MaterialIcons name="add" size={16} color={Colors.bg} />
                  <Text style={styles.emptyBtnText}>Post Ad</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={isTablet ? styles.listingsGridTablet : undefined}>
                {listings.map(listing => (
                  <ListingCard key={listing.id} listing={listing} side={side} displayCurrency={selectedCurrency}
                    convertUSDRaw={convertUSDRaw} getRate={getRate} onTrade={() => handleOpenTrade(listing)}
                    hasAlert={hasAlert(listing.id)} onAlertPress={() => hasAlert(listing.id) ? handleRemoveAlert(listing) : handleOpenAlertModal(listing)}
                  />
                ))}
              </View>
            )}
            <View style={styles.paymentSection}>
              <SectionHeader title="Supported Payments" />
              <View style={styles.paymentGrid}>
                {PAYMENT_METHODS.map(pm => (
                  <View key={pm.id} style={[styles.paymentCard, { borderColor: pm.color + '44' }]}>
                    <Text style={styles.paymentIcon}>{pm.icon}</Text>
                    <Text style={styles.paymentName}>{pm.name}</Text>
                    <Text style={styles.paymentCountry}>{pm.country}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ height: 20 }} />
          </View>
        </ScrollView>
      )}

      {/* ── EXCHANGE TAB ── */}
      {mainTab === 'exchange' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
          {/* Live Exchange Terminal Header */}
          <ExchangeTerminal getRate={getRate} />

          {/* Live Trading Pairs Grid */}
          <LivePairsGrid getRate={getRate} onSelectPair={(pair) => {
            setFilterCoin(pair.base);
            setMainTab('market');
          }} />

          {/* Quick Swap */}
          <QuickSwapPanel getRate={getRate} />

          {/* 54 Africa Currency Matrix */}
          <Africa54Matrix getRate={getRate} />

          {/* All Coins Market Prices */}
          <AllCoinsPrices getRate={getRate} onBuy={(symbol) => {
            setFilterCoin(symbol);
            setSide('Buy');
            setMainTab('market');
          }} />

          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ── MY ADS TAB ── */}
      {mainTab === 'myads' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
          {!isAuthenticated ? <AuthPrompt /> : myAdsLoading ? (
            <View style={styles.centerPad}><ActivityIndicator color={Colors.primary} /></View>
          ) : myListings.length === 0 ? (
            <View style={styles.centerPad}>
              <MaterialIcons name="post-add" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No ads yet</Text>
              <Text style={styles.mutedText}>Post your first P2P listing to start trading</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowPostAd(true)}>
                <MaterialIcons name="add" size={16} color={Colors.bg} />
                <Text style={styles.emptyBtnText}>Post Ad</Text>
              </TouchableOpacity>
            </View>
          ) : myListings.map(listing => (
            <MyAdCard key={listing.id} listing={listing} acting={myAdsActing === listing.id}
              onTogglePause={() => pauseListing(listing.id, listing.status === 'open')}
              onDelete={() => showAlert('Delete Ad', 'Remove this listing?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => removeListing(listing.id) },
              ])}
            />
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ── MY ORDERS TAB ── */}
      {mainTab === 'orders' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
          {!isAuthenticated ? <AuthPrompt /> : ordersLoading ? (
            <View style={styles.centerPad}><ActivityIndicator color={Colors.primary} /></View>
          ) : myOrders.length === 0 ? (
            <View style={styles.centerPad}>
              <MaterialIcons name="receipt-long" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No P2P orders yet</Text>
              <Text style={styles.mutedText}>Your P2P trade history will appear here</Text>
            </View>
          ) : myOrders.map(order => (
            <P2POrderCard key={order.id} order={order} userId={user?.id ?? ''} acting={orderActing === order.id} onAction={handleOrderAction} onChat={() => openChat(order)} />
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ── BTNG CERTS TAB ── */}
      {mainTab === 'certs' && (
        <>
          <View style={styles.certTypeRow}>
            {([['all', 'All'], ['BTNG_GOLD_EXPRESS', 'Express'], ['BTNG_EQUITY_BACKED', 'Equity']] as const).map(([val, label]) => (
              <TouchableOpacity key={val} style={[styles.certTypeChip, certsFilter === val && styles.certTypeChipActive]} onPress={() => setCertsFilter(val as any)}>
                <Text style={[styles.certTypeChipText, certsFilter === val && styles.certTypeChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.certRefreshBtn} onPress={loadCerts}>
              <MaterialIcons name="refresh" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.certInfoBanner}>
            <View style={styles.certInfoBannerLeft}>
              <Image source={BTNG_COIN_IMG} style={styles.certInfoCoin} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.certInfoTitle}>BTNG Gold Certificate Marketplace</Text>
                <Text style={styles.certInfoSub}>Hold a certificate to unlock 10% trader discount on all fees &amp; equity bonds</Text>
              </View>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
            {certsLoading ? (
              <View style={styles.centerPad}><ActivityIndicator color={Colors.primary} /><Text style={styles.mutedText}>Loading certificates...</Text></View>
            ) : certs.length === 0 ? (
              <View style={styles.centerPad}>
                <MaterialIcons name="workspace-premium" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No tradeable certificates</Text>
                <Text style={styles.mutedText}>Apply for a BTNG Gold loan to mint your first certificate NFT</Text>
              </View>
            ) : certs.map((cert: any) => (
              <CertCard key={cert.id} cert={cert} isOwn={cert.user_id === user?.id}
                onOffer={() => { setSelectedCert(cert); setOfferAmount(''); }}
                onRenew={() => router.push({ pathname: '/btng-product-engine', params: { renewCertId: cert.cert_id } } as any)}
              />
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
        </>
      )}

      {/* ── QUICK BUY BTNG MODAL ── */}
      <Modal visible={quickBuyUnit !== null} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.tradeSheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.tradeSheetHeader}>
                <TouchableOpacity onPress={() => setQuickBuyUnit(null)}>
                  <MaterialIcons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <Text style={styles.tradeSheetTitle}>Trade {quickBuyUnit?.symbol} · BTNG Gold</Text>
                <View style={{ width: 22 }} />
              </View>
              {quickBuyUnit && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md, padding: Spacing.xl }}>
                  <View style={qb.identityCard}>
                    <View style={[qb.coinImgWrap, { borderColor: quickBuyUnit.color }]}>
                      <Image source={BTNG_COIN_IMG} style={qb.coinImg} contentFit="cover" />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[qb.coinSymbol, { color: quickBuyUnit.color }]}>{quickBuyUnit.symbol}</Text>
                      <Text style={qb.coinLabel}>Bituncoin Gold · {quickBuyUnit.label} XAU</Text>
                      <View style={[qb.pricePill, { backgroundColor: quickBuyUnit.color + '18', borderColor: quickBuyUnit.color + '44' }]}>
                        <Text style={[qb.priceText, { color: quickBuyUnit.color }]}>
                          {quickBuyUnit.price >= 1000 ? `$${quickBuyUnit.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${quickBuyUnit.price.toFixed(4)}`} / {quickBuyUnit.symbol}
                        </Text>
                        <View style={qb.liveDot} />
                        <Text style={qb.liveLabel}>LIVE</Text>
                      </View>
                    </View>
                  </View>

                  {/* All 3 units strip */}
                  <View style={qb.unitsStrip}>
                    <Text style={qb.unitsStripTitle}>ALL BTNG GOLD UNITS</Text>
                    {[
                      { symbol: 'BTNGG', label: '1/1000 oz', color: '#D4A017' },
                      { symbol: 'BTNG-G', label: '1 gram', color: '#C8900A' },
                      { symbol: 'BTNG-KG', label: '1 kg', color: '#B87333' },
                    ].map(u => {
                      const basePrice = quickBuyUnit.symbol === 'BTNGG' ? quickBuyUnit.price
                        : quickBuyUnit.symbol === 'BTNG-G' ? quickBuyUnit.price / 31.1035
                        : quickBuyUnit.price / 31103.5;
                      const unitPrice = u.symbol === 'BTNGG' ? basePrice : u.symbol === 'BTNG-G' ? basePrice * 31.1035 : basePrice * 31103.5;
                      return (
                        <TouchableOpacity key={u.symbol}
                          style={[qb.unitRow, u.symbol === quickBuyUnit.symbol && { backgroundColor: u.color + '18', borderColor: u.color + '55' }]}
                          onPress={() => setQuickBuyUnit({ ...u, price: unitPrice })} activeOpacity={0.8}>
                          <View style={[qb.unitImgWrap, { borderColor: u.color }]}>
                            <Image source={BTNG_COIN_IMG} style={qb.unitImg} contentFit="cover" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[qb.unitSymbol, { color: u.color }]}>{u.symbol}</Text>
                            <Text style={qb.unitLabel}>{u.label} XAU</Text>
                          </View>
                          <Text style={[qb.unitPriceText, { color: u.color }]}>
                            {unitPrice >= 1000 ? `$${unitPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${unitPrice.toFixed(4)}`}
                          </Text>
                          {u.symbol === quickBuyUnit.symbol && <MaterialIcons name="check-circle" size={18} color={u.color} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Currency selector */}
                  <View style={{ gap: 6 }}>
                    <Text style={styles.inputLabel}>Pay / Receive Currency</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                      {['GHS', 'USD', 'NGN', 'KES', 'ZAR', 'EUR'].map(c => (
                        <TouchableOpacity key={c}
                          style={[qb.currChip, quickBuyCurrency === c && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                          onPress={() => setQuickBuyCurrency(c)}>
                          <Text style={[qb.currChipText, quickBuyCurrency === c && { color: '#fff' }]}>
                            {c === 'GHS' ? '🇬🇭' : c === 'USD' ? '🇺🇸' : c === 'NGN' ? '🇳🇬' : c === 'KES' ? '🇰🇪' : c === 'ZAR' ? '🇿🇦' : '🇪🇺'} {c}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Amount ({quickBuyUnit.symbol})</Text>
                    <View style={styles.inputRow}>
                      <TextInput style={styles.tradeInput} value={quickBuyAmount} onChangeText={setQuickBuyAmount}
                        placeholder="Enter amount…" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" />
                      <View style={styles.inputCoin}><Text style={styles.inputCoinText}>{quickBuyUnit.symbol}</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      {['10', '50', '100', '500'].map(v => (
                        <TouchableOpacity key={v} style={qb.qtyChip} onPress={() => setQuickBuyAmount(v)} activeOpacity={0.8}>
                          <Text style={qb.qtyChipText}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {quickBuyAmount && parseFloat(quickBuyAmount) > 0 && (() => {
                    const qty = parseFloat(quickBuyAmount);
                    const usdTotal = qty * quickBuyUnit.price;
                    const localRate = getRate(quickBuyCurrency) || 1;
                    const localTotal = usdTotal * localRate;
                    return (
                      <View style={styles.tradeSummaryCard}>
                        <View style={styles.tradeSummaryRow}>
                          <Text style={styles.tradeSummaryLabel}>Amount</Text>
                          <Text style={[styles.tradeSummaryVal, { color: quickBuyUnit.color }]}>{qty.toLocaleString()} {quickBuyUnit.symbol}</Text>
                        </View>
                        <View style={styles.tradeSummaryRow}>
                          <Text style={styles.tradeSummaryLabel}>USD Value</Text>
                          <Text style={styles.tradeSummaryVal}>${usdTotal >= 1000 ? usdTotal.toLocaleString('en-US', { maximumFractionDigits: 0 }) : usdTotal.toFixed(2)}</Text>
                        </View>
                        <View style={styles.tradeSummaryRow}>
                          <Text style={styles.tradeSummaryLabel}>{quickBuyCurrency} Value</Text>
                          <Text style={[styles.tradeSummaryVal, { color: Colors.primary }]}>
                            {localTotal >= 1000 ? localTotal.toLocaleString('en-US', { maximumFractionDigits: 0 }) : localTotal.toFixed(2)} {quickBuyCurrency}
                          </Text>
                        </View>
                        <View style={styles.tradeSummaryRow}>
                          <Text style={styles.tradeSummaryLabel}>Fee (0.1%)</Text>
                          <Text style={styles.tradeSummaryLabel}>${(usdTotal * 0.001).toFixed(4)}</Text>
                        </View>
                      </View>
                    );
                  })()}

                  <View style={[styles.escrowNote, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                    <MaterialIcons name="people" size={13} color={Colors.primary} />
                    <Text style={[styles.escrowNoteText, { color: Colors.primary }]}>
                      Tap "Find P2P Ads" to browse live sellers, or "Post Ad" to list your own {quickBuyUnit.symbol} offer.
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                    <TouchableOpacity
                      style={[qb.primaryBtn, { flex: 2, backgroundColor: Colors.success }]}
                      onPress={() => { const u = quickBuyUnit; setQuickBuyUnit(null); setSide('Buy'); setFilterCoin(u.symbol); setMainTab('market'); }}
                      activeOpacity={0.85}>
                      <MaterialIcons name="search" size={18} color="#fff" />
                      <Text style={qb.primaryBtnText}>Find P2P Ads</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[qb.primaryBtn, { flex: 1, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary }]}
                      onPress={() => { setQuickBuyUnit(null); setShowPostAd(true); }} activeOpacity={0.85}>
                      <MaterialIcons name="add" size={18} color={Colors.primary} />
                      <Text style={[qb.primaryBtnText, { color: Colors.primary }]}>Post Ad</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── PRICE ALERT MODAL ── */}
      <Modal visible={alertListing !== null} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.tradeSheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.tradeSheetHeader}>
                <TouchableOpacity onPress={() => setAlertListing(null)}><MaterialIcons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
                <Text style={styles.tradeSheetTitle}>Set Price Alert</Text>
                <View style={{ width: 22 }} />
              </View>
              {alertListing && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md, padding: Spacing.xl }}>
                  <View style={alertStyles.listingInfoCard}>
                    <View style={alertStyles.listingInfoLeft}>
                      <Text style={alertStyles.listingInfoCoin}>{COIN_INFO[alertListing.coin_symbol]?.logo ?? '🪙'} {alertListing.coin_symbol}</Text>
                      <Text style={alertStyles.listingInfoTrader}>{getTraderName(alertListing)}</Text>
                    </View>
                    <View style={alertStyles.listingInfoRight}>
                      <Text style={alertStyles.listingInfoPrice}>{alertListing.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} {alertListing.currency}</Text>
                      <Text style={alertStyles.listingInfoLabel}>Current listing price</Text>
                    </View>
                  </View>
                  <View style={alertStyles.section}>
                    <Text style={styles.inputLabel}>Alert in Currency</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, paddingVertical: 4 }}>
                      {ALERT_CURRENCIES.map(c => {
                        const live = getRate(c.code);
                        const listingRate = getRate(alertListing.currency) || 1;
                        const priceConverted = (alertListing.price / listingRate) * (live || 1);
                        return (
                          <TouchableOpacity key={c.code}
                            style={[alertStyles.currChip, alertTargetCurrency === c.code && alertStyles.currChipActive]}
                            onPress={() => { setAlertTargetCurrency(c.code); setAlertTargetPrice((priceConverted * 0.97).toFixed(2)); }} activeOpacity={0.8}>
                            <Text style={alertStyles.currFlag}>{c.flag}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={[alertStyles.currCode, alertTargetCurrency === c.code && alertStyles.currCodeActive]}>{c.code}</Text>
                              {live > 0 && <Text style={alertStyles.currConverted}>≈ {priceConverted >= 1000 ? priceConverted.toLocaleString('en-US', { maximumFractionDigits: 0 }) : priceConverted.toFixed(2)}</Text>}
                            </View>
                            {alertTargetCurrency === c.code && <MaterialIcons name="check-circle" size={14} color={Colors.primary} />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                  <View style={alertStyles.section}>
                    <Text style={styles.inputLabel}>Target Price ({alertTargetCurrency})</Text>
                    <View style={styles.inputRow}>
                      <TextInput style={styles.tradeInput} value={alertTargetPrice} onChangeText={v => setAlertTargetPrice(v.replace(/[^0-9.]/g, ''))}
                        placeholder="Enter target price…" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" />
                      <View style={styles.inputCoin}><Text style={styles.inputCoinText}>{alertTargetCurrency}</Text></View>
                    </View>
                  </View>
                  {(() => {
                    const listingRate = getRate(alertListing.currency) || 1;
                    const targetRate = getRate(alertTargetCurrency) || 1;
                    const current = (alertListing.price / listingRate) * targetRate;
                    return (
                      <View style={alertStyles.quickRow}>
                        {[0.99, 0.97, 0.95, 0.90].map(pct => {
                          const sugg = (current * pct).toFixed(2);
                          return (
                            <TouchableOpacity key={pct}
                              style={[alertStyles.quickChip, alertTargetPrice === sugg && alertStyles.quickChipActive]}
                              onPress={() => setAlertTargetPrice(sugg)} activeOpacity={0.8}>
                              <Text style={[alertStyles.quickChipLabel, alertTargetPrice === sugg && alertStyles.quickChipLabelActive]}>-{((1 - pct) * 100).toFixed(0)}%</Text>
                              <Text style={[alertStyles.quickChipVal, alertTargetPrice === sugg && alertStyles.quickChipValActive]}>
                                {parseFloat(sugg) >= 1000 ? parseFloat(sugg).toLocaleString('en-US', { maximumFractionDigits: 0 }) : sugg}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })()}
                  <TouchableOpacity style={[alertStyles.saveBtn, alertSaving && { opacity: 0.6 }]} onPress={handleSaveAlert} disabled={alertSaving || !alertTargetPrice} activeOpacity={0.85}>
                    {alertSaving ? <ActivityIndicator color="#fff" /> : <><MaterialIcons name="notifications-active" size={18} color="#fff" /><Text style={alertStyles.saveBtnText}>Set Price Alert</Text></>}
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── CERT OFFER MODAL ── */}
      <Modal visible={selectedCert !== null} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.tradeSheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.tradeSheetHeader}>
                <TouchableOpacity onPress={() => setSelectedCert(null)}><MaterialIcons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
                <Text style={styles.tradeSheetTitle}>Buy / Offer Certificate</Text>
                <View style={{ width: 22 }} />
              </View>
              {selectedCert && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md, padding: Spacing.xl }}>
                  <View style={styles.certDetailCard}>
                    <View style={styles.certDetailHeader}>
                      <View style={styles.certDetailIconWrap}><MaterialIcons name="workspace-premium" size={28} color="#D4A017" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.certDetailId}>{selectedCert.cert_id}</Text>
                        <Text style={styles.certDetailType}>{selectedCert.cert_type?.replace(/_/g, ' ')}</Text>
                      </View>
                      <View style={[styles.certGradeBadge, { backgroundColor: '#D4A01718', borderColor: '#D4A01755' }]}>
                        <Text style={[styles.certGradeText, { color: '#D4A017' }]}>Grade {selectedCert.equity_grade}</Text>
                      </View>
                    </View>
                    <View style={styles.certDetailRows}>
                      <CertDetailRow label="Asset Value" value={`${(selectedCert.asset_value ?? 0).toLocaleString()} BTNGG`} color={Colors.primary} />
                      <CertDetailRow label="Issued" value={selectedCert.issued_at ?? '-'} />
                      <CertDetailRow label="Expires" value={selectedCert.expires_at ?? '-'} />
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Your Offer Amount (BTNGG)</Text>
                    <View style={styles.inputRow}>
                      <TextInput style={styles.tradeInput} value={offerAmount} onChangeText={setOfferAmount}
                        placeholder={String(selectedCert.asset_value ?? 100)} placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                      <View style={styles.inputCoin}><Text style={styles.inputCoinText}>BTNGG</Text></View>
                    </View>
                  </View>
                  <TouchableOpacity style={[styles.certOfferBtn, offerLoading && { opacity: 0.6 }]} onPress={handleCertOffer} disabled={offerLoading} activeOpacity={0.85}>
                    {offerLoading ? <ActivityIndicator color="#fff" /> : <><MaterialIcons name="local-offer" size={18} color="#fff" /><Text style={styles.certOfferBtnText}>Submit Offer</Text></>}
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── TRADE CONFIRM MODAL ── */}
      <Modal visible={tradeListing !== null} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.tradeSheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.tradeSheetHeader}>
                <TouchableOpacity onPress={() => setTradeListing(null)}><MaterialIcons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
                <Text style={styles.tradeSheetTitle}>{side} {tradeListing?.coin_symbol} · P2P</Text>
                <View style={{ width: 22 }} />
              </View>
              {tradeListing && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md, padding: Spacing.xl }}>
                  <View style={styles.tradeTraderRow}>
                    <View style={styles.traderAvatar}><Text style={styles.traderAvatarText}>{getTraderName(tradeListing)[0].toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.traderNameBig}>{getTraderName(tradeListing)}</Text>
                      <Text style={styles.traderStatsSm}>{tradeListing.completed_trades} trades · ⭐ {tradeListing.rating} · {tradeListing.response_time}</Text>
                    </View>
                    <View style={[styles.kycBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                      <MaterialIcons name="verified" size={11} color={Colors.success} />
                      <Text style={[styles.kycBadgeText, { color: Colors.success }]}>KYC</Text>
                    </View>
                  </View>
                  <View style={styles.tradePriceCard}>
                    <View style={styles.tradePriceRow}><Text style={styles.tradePriceLabel}>Price per {tradeListing.coin_symbol}</Text><Text style={styles.tradePriceVal}>{tradeListing.price.toLocaleString()} {tradeListing.currency}</Text></View>
                    <View style={styles.tradePriceRow}><Text style={styles.tradePriceLabel}>Limit</Text><Text style={styles.tradePriceVal}>{tradeListing.min_amount.toLocaleString()} – {tradeListing.max_amount.toLocaleString()} {tradeListing.currency}</Text></View>
                    <View style={styles.tradePriceRow}><Text style={styles.tradePriceLabel}>Available</Text><Text style={styles.tradePriceVal}>{tradeListing.available_amount.toLocaleString()} {tradeListing.coin_symbol}</Text></View>
                  </View>
                  {/* ── Zone Info Strip ── */}
                  {activeZone ? (
                    <View style={zoneStyles.tradeInfoStrip}>
                      <View style={zoneStyles.tradeInfoLeft}>
                        <MaterialIcons name="travel-explore" size={13} color={Colors.primary} />
                        <Text style={zoneStyles.tradeInfoName} numberOfLines={1}>
                          {activeZone.zoneId.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <View style={zoneStyles.tradeInfoChip}>
                        <Text style={zoneStyles.tradeInfoChipLabel}>MAX SND</Text>
                        <Text style={zoneStyles.tradeInfoChipVal}>
                          {activeZone.config.maxSendAmount >= 1000
                            ? `${(activeZone.config.maxSendAmount / 1000).toFixed(0)}K`
                            : activeZone.config.maxSendAmount}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Amount ({tradeListing.currency})</Text>
                    <View style={styles.inputRow}>
                      <TextInput style={styles.tradeInput} value={tradeAmount} onChangeText={setTradeAmount}
                        placeholder={`${tradeListing.min_amount}–${tradeListing.max_amount.toLocaleString()}`} placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                      <View style={styles.inputCoin}><Text style={styles.inputCoinText}>{tradeListing.currency}</Text></View>
                    </View>
                    {tradeAmount && parseFloat(tradeAmount) > 0 && (
                      <Text style={styles.tradeEstimate}>≈ {(parseFloat(tradeAmount) / tradeListing.price).toFixed(6)} {tradeListing.coin_symbol}</Text>
                    )}
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Payment Method</Text>
                    <View style={styles.pmRow}>
                      {tradeListing.payment_methods.map(pm => (
                        <TouchableOpacity key={pm} style={[styles.pmChip, tradePayment === pm && styles.pmChipActive]} onPress={() => setTradePayment(pm)}>
                          <Text style={[styles.pmChipText, tradePayment === pm && { color: Colors.bg }]}>{pm}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {tradeAmount && parseFloat(tradeAmount) > 0 && (
                    <View style={styles.tradeSummaryCard}>
                      <View style={styles.tradeSummaryRow}><Text style={styles.tradeSummaryLabel}>You {side === 'Buy' ? 'pay' : 'receive'}</Text><Text style={[styles.tradeSummaryVal, { color: Colors.primary }]}>{parseFloat(tradeAmount).toLocaleString()} {tradeListing.currency}</Text></View>
                      <View style={styles.tradeSummaryRow}><Text style={styles.tradeSummaryLabel}>You {side === 'Buy' ? 'receive' : 'pay'}</Text><Text style={styles.tradeSummaryVal}>{(parseFloat(tradeAmount) / tradeListing.price).toFixed(6)} {tradeListing.coin_symbol}</Text></View>
                    </View>
                  )}
                  {/* ── Zone Block Banner ── */}
                  {zoneBlocked ? (
                    <View style={zoneStyles.blockBanner}>
                      <View style={zoneStyles.blockHeader}>
                        <MaterialIcons name="block" size={18} color="#EF4444" />
                        <Text style={zoneStyles.blockTitle}>P2P Order Blocked by Zone Policy</Text>
                      </View>
                      <Text style={zoneStyles.blockReason}>{zoneBlocked.reason}</Text>
                      {zoneBlocked.maxAmount > 0 ? (
                        <View style={zoneStyles.blockLimitRow}>
                          <MaterialIcons name="info-outline" size={13} color="#EF4444" />
                          <Text style={zoneStyles.blockLimit}>
                            Max send in{' '}
                            <Text style={{ fontWeight: FontWeight.heavy }}>
                              {activeZone?.zoneId.replace(/_/g, ' ')}
                            </Text>
                            {': '}{zoneBlocked.maxAmount.toLocaleString()} {tradeListing.coin_symbol}
                          </Text>
                        </View>
                      ) : null}
                      <TouchableOpacity
                        style={zoneStyles.blockKycBtn}
                        onPress={() => { setTradeListing(null); router.push('/kyc' as any); }}
                        activeOpacity={0.85}
                      >
                        <MaterialIcons name="verified-user" size={14} color={Colors.primary} />
                        <Text style={zoneStyles.blockKycText}>Upgrade KYC to unlock higher limits</Text>
                        <MaterialIcons name="arrow-forward" size={14} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <BTNGButton title={`${side} ${tradeListing.coin_symbol}`} onPress={handleConfirmTrade} variant={side === 'Buy' ? 'buy' : 'sell'} size="lg" fullWidth loading={tradeLoading} />
                  <View style={styles.escrowNote}>
                    <MaterialIcons name="lock" size={13} color={Colors.success} />
                    <Text style={styles.escrowNoteText}>Crypto is held in escrow until payment is confirmed by both parties.</Text>
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>{/* end inner container */}

      {/* ── P2P CHAT MODAL ── */}
      <Modal visible={chatOrder !== null} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[chatStyles.sheet, { paddingBottom: insets.bottom }]}>
              <View style={chatStyles.header}>
                <TouchableOpacity onPress={() => setChatOrder(null)}><MaterialIcons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={chatStyles.headerTitle}>Trade Chat · {chatOrder?.coin_symbol}</Text>
                  <View style={chatStyles.escrowPill}>
                    <View style={chatStyles.escrowDot} />
                    <Text style={chatStyles.escrowPillText}>ESCROW ACTIVE · {chatOrder?.total_fiat.toLocaleString()} {chatOrder?.currency}</Text>
                  </View>
                </View>
                <View style={{ width: 22 }} />
              </View>
              {chatOrder && <EscrowTimerBar order={chatOrder} />}
              <ScrollView
                ref={chatScrollRef}
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
                onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
              >
                {chatMessages.map(msg => {
                  const isMe = msg.senderId === user?.id;
                  const isSystem = msg.type === 'system' || msg.senderId === 'system';
                  if (isSystem) {
                    return (
                      <View key={msg.id} style={chatStyles.systemMsg}>
                        <MaterialIcons name="info" size={12} color={Colors.primary} />
                        <Text style={chatStyles.systemMsgText}>{msg.text}</Text>
                      </View>
                    );
                  }
                  return (
                    <View key={msg.id} style={[chatStyles.msgRow, isMe && { alignSelf: 'flex-end' }]}>
                      <View style={[chatStyles.bubble, isMe ? chatStyles.bubbleMe : chatStyles.bubbleThem]}>
                        <Text style={[chatStyles.bubbleText, isMe && { color: Colors.bg }]}>{msg.text}</Text>
                        <Text style={[chatStyles.bubbleTime, isMe && { color: Colors.bg + 'BB' }]}>
                          {new Date(msg.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              <View style={chatStyles.inputRow}>
                <TextInput
                  style={chatStyles.input}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Type a message…"
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="send"
                  onSubmitEditing={sendChatMessage}
                />
                <TouchableOpacity style={[chatStyles.sendBtn, !chatInput.trim() && { opacity: 0.4 }]} onPress={sendChatMessage} disabled={!chatInput.trim()}>
                  <MaterialIcons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── POST AD MODAL ── */}
      <Modal visible={showPostAd} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.tradeSheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.tradeSheetHeader}>
                <TouchableOpacity onPress={() => setShowPostAd(false)}><MaterialIcons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
                <Text style={styles.tradeSheetTitle}>Post P2P Ad</Text>
                <TouchableOpacity style={[styles.postAdSubmitBtn, posting && { opacity: 0.6 }]} onPress={handlePostAd} disabled={posting}>
                  {posting ? <ActivityIndicator size="small" color={Colors.bg} /> : <Text style={styles.postAdSubmitText}>Post</Text>}
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }}>
                <View>
                  <Text style={styles.inputLabel}>I want to</Text>
                  <View style={styles.adTypePicker}>
                    {(['buy', 'sell'] as const).map(t => (
                      <TouchableOpacity key={t} style={[styles.adTypeBtn, adForm.type === t && (t === 'buy' ? styles.adTypeBuy : styles.adTypeSell)]} onPress={() => setAdForm(f => ({ ...f, type: t }))}>
                        <Text style={[styles.adTypeBtnText, adForm.type === t && { color: '#fff' }]}>{t === 'buy' ? 'Buy Crypto' : 'Sell Crypto'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View>
                  <Text style={styles.inputLabel}>Coin</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                    {COIN_CHOICES.map(c => {
                      const info = COIN_INFO[c];
                      return (
                        <TouchableOpacity key={c} style={[styles.adCoinBtn, adForm.coin === c && { backgroundColor: (info?.color ?? Colors.primary) + '22', borderColor: info?.color ?? Colors.primary }]} onPress={() => setAdForm(f => ({ ...f, coin: c }))}>
                          {GOLD_SYMBOLS.has(c) ? (
                            <Image source={BTNG_COIN_IMG} style={{ width: 16, height: 16, borderRadius: 8 }} contentFit="cover" />
                          ) : (
                            <Text style={styles.adCoinLogo}>{info?.logo}</Text>
                          )}
                          <Text style={[styles.adCoinText, adForm.coin === c && { color: info?.color ?? Colors.primary, fontWeight: FontWeight.bold }]}>{c}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
                <View>
                  <Text style={styles.inputLabel}>Currency</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, marginBottom: Spacing.sm }}>
                    {CURRENCIES.map(c => {
                      const cur = AFRICAN_CURRENCIES.find(x => x.code === c);
                      return (
                        <TouchableOpacity key={c} style={[styles.currencyBtn, adForm.currency === c && styles.currencyBtnActive]} onPress={() => setAdForm(f => ({ ...f, currency: c }))}>
                          {cur && <Text style={styles.currencyBtnFlag}>{cur.flag}</Text>}
                          <Text style={[styles.currencyBtnText, adForm.currency === c && { color: Colors.bg }]}>{c}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
                <View style={styles.adInputGroup}>
                  <Text style={styles.inputLabel}>Price per {adForm.coin} ({adForm.currency}) *</Text>
                  <TextInput style={styles.adInput} value={adForm.price} onChangeText={v => setAdForm(f => ({ ...f, price: v }))} placeholder="e.g. 4.85" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                </View>
                <View style={styles.adRowInputs}>
                  <View style={[styles.adInputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Min ({adForm.currency})</Text>
                    <TextInput style={styles.adInput} value={adForm.minAmount} onChangeText={v => setAdForm(f => ({ ...f, minAmount: v }))} placeholder="50" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                  </View>
                  <View style={[styles.adInputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Max ({adForm.currency})</Text>
                    <TextInput style={styles.adInput} value={adForm.maxAmount} onChangeText={v => setAdForm(f => ({ ...f, maxAmount: v }))} placeholder="5000" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                  </View>
                </View>
                <View style={styles.adInputGroup}>
                  <Text style={styles.inputLabel}>Available Amount ({adForm.coin}) *</Text>
                  <TextInput style={styles.adInput} value={adForm.availableAmount} onChangeText={v => setAdForm(f => ({ ...f, availableAmount: v }))} placeholder="e.g. 1000" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                </View>
                <View>
                  <Text style={styles.inputLabel}>Payment Methods *</Text>
                  <View style={styles.pmSelectGrid}>
                    {PAYMENT_OPTIONS.map(pm => (
                      <TouchableOpacity key={pm} style={[styles.pmSelectChip, adForm.paymentMethods.includes(pm) && styles.pmSelectChipActive]} onPress={() => toggleAdPayment(pm)}>
                        {adForm.paymentMethods.includes(pm) && <MaterialIcons name="check" size={12} color={Colors.bg} />}
                        <Text style={[styles.pmSelectChipText, adForm.paymentMethods.includes(pm) && { color: Colors.bg }]}>{pm}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.adInputGroup}>
                  <Text style={styles.inputLabel}>Trading Terms (optional)</Text>
                  <TextInput style={[styles.adInput, { minHeight: 72 }]} value={adForm.terms} onChangeText={v => setAdForm(f => ({ ...f, terms: v }))} placeholder="e.g. KYC verified only. Payment within 15 minutes." placeholderTextColor={Colors.textMuted} multiline textAlignVertical="top" />
                </View>
                <View style={styles.adDisclaimerCard}>
                  <MaterialIcons name="info-outline" size={13} color={Colors.warning} />
                  <Text style={styles.adDisclaimerText}>All P2P trades are protected by BTNG escrow. Crypto is held until both parties confirm the transaction.</Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone styles
// ─────────────────────────────────────────────────────────────────────────────
const zoneStyles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '44', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, flexWrap: 'wrap', alignSelf: 'flex-start' },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  pillName: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.4, flexShrink: 1 },
  pillLimits: { flexDirection: 'row', gap: 5 },
  limitChip: { alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 6, paddingVertical: 2, gap: 1 },
  limitLabel: { fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.4, includeFontPadding: false },
  limitVal: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  blockBanner: { backgroundColor: '#EF444412', borderRadius: Radius.md, borderWidth: 1, borderColor: '#EF444455', padding: Spacing.md, gap: 8 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#EF4444', includeFontPadding: false, flex: 1 },
  blockReason: { fontSize: FontSize.xs, color: '#FCA5A5', lineHeight: 18, includeFontPadding: false },
  blockLimitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF444420', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  blockLimit: { fontSize: FontSize.xs, color: '#FCA5A5', includeFontPadding: false, flex: 1 },
  blockKycBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 12, paddingVertical: 9, marginTop: 2 },
  blockKycText: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  // Trade confirm modal zone info strip
  tradeInfoStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '33', paddingHorizontal: Spacing.md, paddingVertical: 7 },
  tradeInfoLeft: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, overflow: 'hidden' },
  tradeInfoName: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.3, flexShrink: 1 },
  tradeInfoChip: { alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary + '44', paddingHorizontal: 8, paddingVertical: 3, gap: 1, flexShrink: 0 },
  tradeInfoChipLabel: { fontSize: 7, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.4, includeFontPadding: false },
  tradeInfoChipVal: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Exchange Terminal Header
// ─────────────────────────────────────────────────────────────────────────────
function ExchangeTerminal({ getRate }: { getRate: (code: string) => number }) {
  const { priceBTNGG, source, loading } = useGoldOracle();
  const ghsRate = getRate('GHS') || 1;
  const ngnRate = getRate('NGN') || 1;
  const btcUsd = 107_200;
  const ethUsd = 3_840;
  const isLive = source === 'live';

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.2, duration: 800, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const topPairs = [
    { symbol: 'BTNGG', price: priceBTNGG, currency: 'USD', change: +0.278, color: '#D4A017', isGold: true },
    { symbol: 'BTNGG', price: priceBTNGG * ghsRate, currency: 'GHS', change: +0.278, color: '#D4A017', isGold: true },
    { symbol: 'BTC', price: btcUsd * ghsRate, currency: 'GHS', change: +2.14, color: '#F7931A', isGold: false },
    { symbol: 'ETH', price: ethUsd * ghsRate, currency: 'GHS', change: -1.23, color: '#627EEA', isGold: false },
    { symbol: 'BTNGG', price: priceBTNGG * ngnRate, currency: 'NGN', change: +0.278, color: '#D4A017', isGold: true },
    { symbol: 'BTC', price: btcUsd, currency: 'USD', change: +2.14, color: '#F7931A', isGold: false },
  ];

  return (
    <View style={ex.card}>
      <View style={ex.header}>
        <View style={ex.headerLeft}>
          <Image source={BTNG_COIN_IMG} style={ex.headerCoin} contentFit="cover" />
          <View>
            <Text style={ex.headerTitle}>BTNG Exchange Terminal</Text>
            <Text style={ex.headerSub}>Live crypto × 54 Africa fiat pairs</Text>
          </View>
        </View>
        <View style={[ex.liveBadge, { backgroundColor: isLive ? Colors.successBg : Colors.warningBg, borderColor: (isLive ? Colors.success : Colors.warning) + '44' }]}>
          <Animated.View style={[ex.liveDot, { opacity: pulseAnim, backgroundColor: isLive ? Colors.success : Colors.warning }]} />
          <Text style={[ex.liveText, { color: isLive ? Colors.success : Colors.warning }]}>{loading ? 'SYNCING' : isLive ? 'LIVE' : 'CACHED'}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ex.pairsRow}>
        {topPairs.map((p, i) => (
          <View key={i} style={[ex.pairCard, { borderColor: p.color + '44' }]}>
            {p.isGold ? (
              <Image source={BTNG_COIN_IMG} style={ex.pairCoin} contentFit="cover" />
            ) : (
              <View style={[ex.pairLogoWrap, { backgroundColor: p.color + '22' }]}>
                <Text style={[ex.pairLogo, { color: p.color }]}>{COIN_INFO[p.symbol]?.logo ?? '🪙'}</Text>
              </View>
            )}
            <Text style={[ex.pairSymbol, { color: p.color }]}>{p.symbol}/{p.currency}</Text>
            <Text style={ex.pairPrice}>
              {p.currency === 'NGN' || p.currency === 'TZS' || p.currency === 'UGX'
                ? p.price >= 1000 ? p.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : p.price.toFixed(2)
                : p.price >= 1000 ? p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })
                : p.price >= 1 ? p.price.toFixed(4) : p.price.toFixed(6)}
            </Text>
            <View style={[ex.changeChip, { backgroundColor: p.change >= 0 ? Colors.successBg : Colors.errorBg }]}>
              <Text style={[ex.changeText, { color: p.change >= 0 ? Colors.success : Colors.error }]}>
                {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const ex = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.primary + '22', backgroundColor: Colors.primaryGlow },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  headerCoin: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#D4A01788' },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  headerSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  pairsRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.sm },
  pairCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, alignItems: 'center', gap: 4, minWidth: 96 },
  pairCoin: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#D4A01766' },
  pairLogoWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pairLogo: { fontSize: 14, fontWeight: FontWeight.bold },
  pairSymbol: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  pairPrice: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'center' },
  changeChip: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  changeText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Live Trading Pairs Grid
// ─────────────────────────────────────────────────────────────────────────────
function LivePairsGrid({ getRate, onSelectPair }: { getRate: (code: string) => number; onSelectPair: (pair: typeof EXCHANGE_PAIRS[0]) => void }) {
  const { priceBTNGG } = useGoldOracle();
  const COIN_PRICES: Record<string, number> = {
    BTNGG: priceBTNGG, 'BTNG-G': priceBTNGG * 31.1035, 'BTNG-KG': priceBTNGG * 31103.5,
    BTC: 107200, ETH: 3840, USDT: 1.0, BNB: 685, SOL: 184, XRP: 2.14,
    ADA: 0.89, DOGE: 0.38, AVAX: 38.5, MATIC: 0.89,
  };
  return (
    <View style={lp.card}>
      <View style={lp.header}>
        <MaterialIcons name="swap-horiz" size={16} color={Colors.primary} />
        <Text style={lp.title}>Live Trading Pairs</Text>
        <Text style={lp.sub}>{EXCHANGE_PAIRS.length} active pairs</Text>
      </View>
      <View style={lp.headerRow}>
        <Text style={[lp.colHdr, { flex: 1.8 }]}>PAIR</Text>
        <Text style={[lp.colHdr, { flex: 1, textAlign: 'right' }]}>PRICE</Text>
        <Text style={[lp.colHdr, { flex: 0.8, textAlign: 'right' }]}>ACTION</Text>
      </View>
      {EXCHANGE_PAIRS.map((pair, i) => {
        const basePrice = COIN_PRICES[pair.base] || 0;
        const quoteRate = pair.quote === 'USD' ? 1 : (getRate(pair.quote) || 1);
        const price = basePrice * quoteRate;
        const info = COIN_INFO[pair.base];
        const seed = pair.base.charCodeAt(0) + pair.quote.charCodeAt(0) + i;
        const change = ((seed * 7 + i * 13) % 200 - 100) * 0.04;
        return (
          <View key={i} style={[lp.row, i % 2 === 0 && { backgroundColor: Colors.bgElevated + '44' }]}>
            <View style={[lp.pairLeft, { flex: 1.8 }]}>
              {info?.isGold ? (
                <Image source={BTNG_COIN_IMG} style={lp.coinImg} contentFit="cover" />
              ) : (
                <View style={[lp.coinLogoWrap, { backgroundColor: (info?.color ?? Colors.primary) + '22' }]}>
                  <Text style={{ fontSize: 11, color: info?.color }}>{info?.logo ?? '🪙'}</Text>
                </View>
              )}
              <View>
                <Text style={lp.pairLabel}>{pair.flag} {pair.label}</Text>
                <Text style={lp.pairName}>{info?.name ?? pair.base}</Text>
              </View>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={lp.price}>
                {price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : price >= 1 ? price.toFixed(2)
                  : price.toFixed(4)}
              </Text>
              <Text style={[lp.change, { color: change >= 0 ? Colors.success : Colors.error }]}>
                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
              </Text>
            </View>
            <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
              <TouchableOpacity style={lp.tradeBtn} onPress={() => onSelectPair(pair)} activeOpacity={0.8}>
                <Text style={lp.tradeBtnText}>Trade</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const lp = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.primaryGlow },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  sub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  colHdr: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3 },
  pairLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coinImg: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#D4A01766' },
  coinLogoWrap: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pairLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  pairName: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  price: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  change: { fontSize: 9, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tradeBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 5 },
  tradeBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Quick Swap Panel
// ─────────────────────────────────────────────────────────────────────────────
function QuickSwapPanel({ getRate }: { getRate: (code: string) => number }) {
  const { priceBTNGG } = useGoldOracle();
  const [fromCoin, setFromCoin] = useState('BTNGG');
  const [toCurrency, setToCurrency] = useState('GHS');
  const [fromAmount, setFromAmount] = useState('');
  const [swapped, setSwapped] = useState(false);

  const SWAP_COINS = ['BTNGG', 'BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP'];
  const SWAP_CURRENCIES = ['GHS', 'NGN', 'KES', 'ZAR', 'EGP', 'USD', 'EUR'];

  const COIN_USD: Record<string, number> = {
    BTNGG: priceBTNGG, BTC: 107200, ETH: 3840, USDT: 1.0, BNB: 685, SOL: 184, XRP: 2.14,
  };

  const toRate = toCurrency === 'USD' ? 1 : (getRate(toCurrency) || 1);
  const coinUsd = COIN_USD[fromCoin] || 0;
  const toAmount = fromAmount && parseFloat(fromAmount) > 0
    ? (parseFloat(fromAmount) * coinUsd * toRate).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '';

  const africanCurInfo = AFRICA_54_CURRENCIES.find(c => c.code === toCurrency);

  return (
    <View style={sw.card}>
      <View style={sw.header}>
        <MaterialIcons name="swap-vert" size={16} color={Colors.primary} />
        <Text style={sw.title}>Quick Swap</Text>
        <Text style={sw.sub}>Crypto → 54 Africa Currencies</Text>
        {swapped && (
          <View style={sw.swappedBadge}>
            <MaterialIcons name="check-circle" size={11} color={Colors.success} />
            <Text style={sw.swappedText}>Converted!</Text>
          </View>
        )}
      </View>

      <View style={sw.body}>
        {/* From */}
        <View style={sw.swapBox}>
          <Text style={sw.swapLabel}>From Crypto</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
            {SWAP_COINS.map(c => {
              const info = COIN_INFO[c];
              return (
                <TouchableOpacity key={c} style={[sw.coinChip, fromCoin === c && { backgroundColor: (info?.color ?? Colors.primary) + '22', borderColor: info?.color ?? Colors.primary }]}
                  onPress={() => setFromCoin(c)} activeOpacity={0.8}>
                  {info?.isGold ? <Image source={BTNG_COIN_IMG} style={{ width: 14, height: 14, borderRadius: 7 }} contentFit="cover" />
                    : <Text style={{ fontSize: 10 }}>{info?.logo}</Text>}
                  <Text style={[sw.coinChipText, fromCoin === c && { color: info?.color ?? Colors.primary, fontWeight: FontWeight.bold }]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={sw.inputRow}>
            <TextInput style={sw.input} value={fromAmount} onChangeText={setFromAmount}
              placeholder="Enter amount…" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" />
            <View style={[sw.inputBadge, { backgroundColor: (COIN_INFO[fromCoin]?.color ?? Colors.primary) + '22' }]}>
              {COIN_INFO[fromCoin]?.isGold
                ? <Image source={BTNG_COIN_IMG} style={{ width: 16, height: 16, borderRadius: 8 }} contentFit="cover" />
                : <Text style={{ fontSize: 12 }}>{COIN_INFO[fromCoin]?.logo}</Text>}
              <Text style={[sw.inputBadgeText, { color: COIN_INFO[fromCoin]?.color ?? Colors.primary }]}>{fromCoin}</Text>
            </View>
          </View>
          {fromAmount && parseFloat(fromAmount) > 0 && (
            <Text style={sw.usdHint}>≈ ${(parseFloat(fromAmount) * coinUsd).toFixed(2)} USD</Text>
          )}
        </View>

        {/* Swap Arrow */}
        <View style={sw.arrowWrap}>
          <View style={sw.arrowLine} />
          <View style={sw.arrowCircle}>
            <MaterialIcons name="south" size={16} color={Colors.primary} />
          </View>
          <View style={sw.arrowLine} />
        </View>

        {/* To */}
        <View style={sw.swapBox}>
          <Text style={sw.swapLabel}>To African Currency</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
            {SWAP_CURRENCIES.map(c => {
              const info = AFRICA_54_CURRENCIES.find(x => x.code === c) || { flag: '🇺🇸', code: c };
              return (
                <TouchableOpacity key={c} style={[sw.currChip, toCurrency === c && sw.currChipActive]}
                  onPress={() => setToCurrency(c)} activeOpacity={0.8}>
                  <Text style={{ fontSize: 12 }}>{info.flag}</Text>
                  <Text style={[sw.currChipText, toCurrency === c && { color: Colors.bg }]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={[sw.inputRow, { backgroundColor: Colors.bgElevated }]}>
            <Text style={[sw.toAmount, toAmount ? { color: Colors.success } : {}]}>
              {toAmount || '0.00'}
            </Text>
            <View style={[sw.inputBadge, { backgroundColor: Colors.primaryGlow }]}>
              <Text style={{ fontSize: 14 }}>{africanCurInfo?.flag ?? '🌍'}</Text>
              <Text style={[sw.inputBadgeText, { color: Colors.primary }]}>{toCurrency}</Text>
            </View>
          </View>
          {toAmount && (
            <Text style={sw.rateHint}>Rate: 1 {fromCoin} = {(coinUsd * toRate).toLocaleString('en-US', { maximumFractionDigits: 2 })} {toCurrency}</Text>
          )}
        </View>

        <TouchableOpacity style={sw.swapBtn} activeOpacity={0.85} onPress={() => {
          if (!fromAmount || parseFloat(fromAmount) <= 0) return;
          setSwapped(true);
          setTimeout(() => setSwapped(false), 3000);
        }}>
          <MaterialIcons name="swap-vert" size={18} color="#fff" />
          <Text style={sw.swapBtnText}>Convert {fromCoin} → {toCurrency}</Text>
        </TouchableOpacity>
        <Text style={sw.disclaimer}>Rate is indicative. Actual P2P trade price may vary.</Text>
      </View>
    </View>
  );
}

const sw = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.primary + '22', backgroundColor: Colors.primaryGlow },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  sub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  swappedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  swappedText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  body: { padding: Spacing.md, gap: Spacing.md },
  swapBox: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  swapLabel: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false, marginBottom: 6 },
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, height: 30 },
  coinChipText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  currChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, height: 30 },
  currChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  currChipText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  toAmount: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, includeFontPadding: false },
  inputBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderLeftWidth: 1, borderLeftColor: Colors.border },
  inputBadgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  usdHint: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 4, paddingLeft: 2 },
  rateHint: { fontSize: 9, color: Colors.primary, includeFontPadding: false, marginTop: 4, paddingLeft: 2 },
  arrowWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  arrowLine: { flex: 1, height: 1, backgroundColor: Colors.primary + '44' },
  arrowCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  swapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 14, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  swapBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  disclaimer: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// 54 Africa Currency Matrix
// ─────────────────────────────────────────────────────────────────────────────
function Africa54Matrix({ getRate }: { getRate: (code: string) => number }) {
  const { priceBTNGG } = useGoldOracle();
  const [baseCoin, setBaseCoin] = useState<'BTNGG' | 'BTC' | 'ETH' | 'USDT'>('BTNGG');
  const [expanded, setExpanded] = useState(false);
  const COINS_USD: Record<string, number> = { BTNGG: priceBTNGG, BTC: 107200, ETH: 3840, USDT: 1.0 };
  const coinUsd = COINS_USD[baseCoin];
  const displayList = expanded ? AFRICA_54_CURRENCIES : AFRICA_54_CURRENCIES.slice(0, 16);

  return (
    <View style={af.card}>
      <View style={af.header}>
        <Text style={af.title}>🌍 54 Africa Currency Rates</Text>
        <Text style={af.sub}>Live {baseCoin} price in every African currency</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={af.coinRow}>
        {(['BTNGG', 'BTC', 'ETH', 'USDT'] as const).map(c => (
          <TouchableOpacity key={c} style={[af.coinChip, baseCoin === c && af.coinChipActive]} onPress={() => setBaseCoin(c)} activeOpacity={0.8}>
            {c === 'BTNGG' ? <Image source={BTNG_COIN_IMG} style={{ width: 14, height: 14, borderRadius: 7 }} contentFit="cover" />
              : <Text style={{ fontSize: 11 }}>{COIN_INFO[c]?.logo}</Text>}
            <Text style={[af.coinChipText, baseCoin === c && { color: Colors.bg }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={af.grid}>
        {displayList.map((cur, i) => {
          const rate = getRate(cur.code) || AFRICAN_CURRENCIES.find(a => a.code === cur.code)?.usdRate || 1;
          const price = coinUsd * rate;
          return (
            <View key={`${cur.code}-${i}`} style={af.cell}>
              <View style={af.cellHeader}>
                <Text style={af.flag}>{cur.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={af.code}>{cur.code}</Text>
                  <Text style={af.country} numberOfLines={1}>{cur.country}</Text>
                </View>
              </View>
              <Text style={af.price} numberOfLines={1}>
                {price >= 1_000_000 ? `${(price / 1_000_000).toFixed(2)}M`
                  : price >= 1_000 ? price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : price >= 1 ? price.toFixed(2)
                  : price.toFixed(4)}
              </Text>
            </View>
          );
        })}
      </View>
      <TouchableOpacity style={af.expandBtn} onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={16} color={Colors.primary} />
        <Text style={af.expandText}>{expanded ? 'Show Less' : `Show All ${AFRICA_54_CURRENCIES.length} Currencies`}</Text>
      </TouchableOpacity>
    </View>
  );
}

const af = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#2E7D3255', overflow: 'hidden' },
  header: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: '#2E7D3222', backgroundColor: '#2E7D3210' },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  coinRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, height: 30 },
  coinChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  coinChipText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.sm, gap: 1 },
  cell: { width: '25%', padding: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.sm, gap: 2 },
  cellHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flag: { fontSize: 14 },
  code: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  country: { fontSize: 7, color: Colors.textMuted, includeFontPadding: false },
  price: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  expandText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// All Coins Market Prices
// ─────────────────────────────────────────────────────────────────────────────
function AllCoinsPrices({ getRate, onBuy }: { getRate: (code: string) => number; onBuy: (symbol: string) => void }) {
  const { priceBTNGG } = useGoldOracle();
  const ghsRate = getRate('GHS') || 1;
  const [quoteCurrency, setQuoteCurrency] = useState<'USD' | 'GHS'>('GHS');
  const [search, setSearch] = useState('');

  const PRICES_USD: Record<string, number> = {
    BTNGG: priceBTNGG, 'BTNG-G': priceBTNGG * 31.1035, 'BTNG-KG': priceBTNGG * 31103.5,
    BTC: 107200, ETH: 3840, USDT: 1.0, USDC: 1.0, BNB: 685, SOL: 184,
    XRP: 2.14, ADA: 0.89, DOGE: 0.38, AVAX: 38.5, MATIC: 0.89, DOT: 7.8,
    LINK: 18.4, UNI: 10.2, ATOM: 8.5, LTC: 96.0, TRX: 0.27,
    SHIB: 0.0000248, FIL: 5.8, ICP: 12.4, NEAR: 6.2,
  };

  const CHANGES: Record<string, number> = {
    BTNGG: 0.278, 'BTNG-G': 0.278, 'BTNG-KG': 0.278, BTC: 2.14, ETH: -1.23,
    USDT: 0.01, USDC: 0.0, BNB: 3.45, SOL: -0.87, XRP: -2.11,
    ADA: 1.2, DOGE: 5.3, AVAX: -0.8, MATIC: 2.9, DOT: -1.4,
    LINK: 4.1, UNI: 0.7, ATOM: -2.3, LTC: 1.8, TRX: 0.5,
    SHIB: 8.2, FIL: -3.1, ICP: 1.9, NEAR: 3.4,
  };

  const multiplier = quoteCurrency === 'GHS' ? ghsRate : 1;
  const currency = quoteCurrency;

  const allCoins = Object.keys(COIN_INFO).filter(k => PRICES_USD[k]);
  const filtered = allCoins.filter(k =>
    k.toLowerCase().includes(search.toLowerCase()) ||
    (COIN_INFO[k]?.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={acp.card}>
      <View style={acp.header}>
        <MaterialIcons name="show-chart" size={16} color={Colors.primary} />
        <Text style={acp.title}>All Crypto Prices</Text>
        <View style={acp.toggle}>
          {(['GHS', 'USD'] as const).map(c => (
            <TouchableOpacity key={c} style={[acp.toggleBtn, quoteCurrency === c && acp.toggleBtnActive]} onPress={() => setQuoteCurrency(c)}>
              <Text style={[acp.toggleText, quoteCurrency === c && acp.toggleTextActive]}>{c === 'GHS' ? '🇬🇭 GHS' : '🇺🇸 USD'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={acp.searchRow}>
        <MaterialIcons name="search" size={14} color={Colors.textMuted} />
        <TextInput style={acp.searchInput} value={search} onChangeText={setSearch}
          placeholder="Search coins…" placeholderTextColor={Colors.textMuted} />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <View style={acp.colHeader}>
        <Text style={[acp.colHdr, { flex: 1.8 }]}>COIN</Text>
        <Text style={[acp.colHdr, { flex: 1, textAlign: 'right' }]}>PRICE ({currency})</Text>
        <Text style={[acp.colHdr, { flex: 0.7, textAlign: 'right' }]}>24H</Text>
        <Text style={[acp.colHdr, { flex: 0.6, textAlign: 'right' }]}>P2P</Text>
      </View>
      {filtered.map((symbol, i) => {
        const info = COIN_INFO[symbol];
        const usdPrice = PRICES_USD[symbol] || 0;
        const displayPrice = usdPrice * multiplier;
        const change = CHANGES[symbol] ?? 0;
        return (
          <View key={symbol} style={[acp.row, i % 2 === 0 && { backgroundColor: Colors.bgElevated + '55' }]}>
            <View style={[acp.coinLeft, { flex: 1.8 }]}>
              {info?.isGold ? (
                <Image source={BTNG_COIN_IMG} style={acp.coinImg} contentFit="cover" />
              ) : (
                <View style={[acp.coinLogoWrap, { backgroundColor: (info?.color ?? Colors.primary) + '22', borderColor: (info?.color ?? Colors.primary) + '44' }]}>
                  <Text style={[acp.coinLogo, { color: info?.color }]}>{info?.logo ?? '🪙'}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={acp.coinSymbol}>{symbol}</Text>
                <Text style={acp.coinName} numberOfLines={1}>{info?.name ?? symbol}</Text>
              </View>
            </View>
            <Text style={[acp.price, { flex: 1 }]} numberOfLines={1}>
              {displayPrice >= 1_000_000 ? `${(displayPrice / 1_000_000).toFixed(2)}M`
                : displayPrice >= 1_000 ? displayPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : displayPrice >= 1 ? displayPrice.toFixed(2)
                : displayPrice.toFixed(4)}
            </Text>
            <Text style={[acp.change, { flex: 0.7, color: change >= 0 ? Colors.success : Colors.error }]}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </Text>
            <View style={{ flex: 0.6, alignItems: 'flex-end' }}>
              <TouchableOpacity style={acp.buyBtn} onPress={() => onBuy(symbol)} activeOpacity={0.8}>
                <Text style={acp.buyBtnText}>P2P</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const acp = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.primaryGlow },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  toggle: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: 2, borderWidth: 1, borderColor: Colors.border },
  toggleBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm - 1 },
  toggleBtnActive: { backgroundColor: Colors.primary },
  toggleText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  toggleTextActive: { color: Colors.bg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false },
  colHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  colHdr: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3 },
  coinLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coinImg: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#D4A01766' },
  coinLogoWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  coinLogo: { fontSize: 14, fontWeight: FontWeight.bold },
  coinSymbol: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  coinName: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  price: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'right', includeFontPadding: false },
  change: { fontSize: 10, fontWeight: FontWeight.semibold, textAlign: 'right', includeFontPadding: false },
  buyBtn: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  buyBtnText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Listing Card
// ─────────────────────────────────────────────────────────────────────────────
function ListingCard({ listing, side, onTrade, displayCurrency, convertUSDRaw, getRate, hasAlert, onAlertPress }: {
  listing: P2PListing; side: 'Buy' | 'Sell'; onTrade: () => void;
  displayCurrency: AfricanCurrency; convertUSDRaw: (usd: number) => number;
  getRate: (code: string) => number; hasAlert: boolean; onAlertPress: () => void;
}) {
  const traderName = getTraderName(listing);
  const badgeColor = getBadgeColor(listing.badge);
  const coinInfo = COIN_INFO[listing.coin_symbol];
  const listingCurrencyData = AFRICAN_CURRENCIES.find(c => c.code === listing.currency);
  const liveListingRate = listingCurrencyData ? (getRate(listing.currency) || listingCurrencyData.usdRate) : null;
  const priceInUSD = liveListingRate ? listing.price / liveListingRate : null;
  const showConversion = displayCurrency.code !== listing.currency && priceInUSD !== null;
  const convertedPrice = showConversion && priceInUSD !== null ? formatLocalCurrency(convertUSDtoLocal(priceInUSD, displayCurrency), displayCurrency) : null;

  return (
    <View style={styles.listingCard}>
      <View style={styles.traderRow}>
        <TouchableOpacity style={[alertStyles.bellBtn, hasAlert && alertStyles.bellBtnActive]} onPress={onAlertPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name={hasAlert ? 'notifications-active' : 'notifications-none'} size={16} color={hasAlert ? Colors.primary : Colors.textMuted} />
          {hasAlert && <View style={alertStyles.bellActiveDot} />}
        </TouchableOpacity>
        <View style={styles.traderLeft}>
          <View style={[styles.traderAvatar, { borderColor: badgeColor }]}>
            <Text style={[styles.traderAvatarText, { color: badgeColor }]}>{traderName[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.traderNameRow}>
              <Text style={styles.traderName}>{traderName}</Text>
              {listing.badge && (
                <View style={[styles.badgePill, { backgroundColor: badgeColor + '22', borderColor: badgeColor + '44' }]}>
                  <Text style={[styles.badgePillText, { color: badgeColor }]}>{listing.badge}</Text>
                </View>
              )}
              {listing.user_profiles?.kyc_status === 'verified' && <MaterialIcons name="verified" size={14} color={Colors.success} />}
            </View>
            <Text style={styles.traderStats}>{listing.completed_trades} trades · ⭐ {listing.rating.toFixed(1)} · {listing.country}</Text>
          </View>
        </View>
        <View style={styles.responseRow}>
          <MaterialIcons name="timer" size={12} color={Colors.success} />
          <Text style={styles.responseText}>{listing.response_time}</Text>
        </View>
      </View>
      {hasAlert && (
        <View style={alertStyles.alertStrip}>
          <MaterialIcons name="notifications-active" size={11} color={Colors.primary} />
          <Text style={alertStyles.alertStripText}>Price alert is active — tap bell to remove</Text>
        </View>
      )}
      <View style={styles.priceRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.priceLabel}>Price / {listing.coin_symbol}</Text>
          <View style={styles.priceValRow}>
            {coinInfo?.isGold ? (
              <Image source={BTNG_COIN_IMG} style={styles.coinLogoImg} contentFit="cover" />
            ) : (
              <Text style={[styles.coinLogo, { color: coinInfo?.color ?? Colors.primary }]}>{coinInfo?.logo ?? '🪙'}</Text>
            )}
            <Text style={[styles.listingPrice, { color: coinInfo?.color ?? Colors.primary }]}>{listing.price.toLocaleString()} {listing.currency}</Text>
          </View>
          {convertedPrice !== null && (
            <View style={styles.convertedPriceRow}>
              <Text style={styles.convertedPriceFlag}>{displayCurrency.flag}</Text>
              <Text style={styles.convertedPriceText}>{convertedPrice} {displayCurrency.code}</Text>
            </View>
          )}
        </View>
        <View><Text style={styles.priceLabel}>Limit</Text><Text style={styles.limitsText}>{listing.min_amount.toLocaleString()} – {listing.max_amount.toLocaleString()} {listing.currency}</Text></View>
        <View><Text style={styles.priceLabel}>Available</Text><Text style={styles.availText}>{listing.available_amount.toLocaleString()} {listing.coin_symbol}</Text></View>
      </View>
      <View style={styles.payRow}>
        {listing.payment_methods.slice(0, 3).map(pm => <View key={pm} style={styles.payChip}><Text style={styles.payChipText}>{pm}</Text></View>)}
        {listing.payment_methods.length > 3 && <View style={styles.payChip}><Text style={styles.payChipText}>+{listing.payment_methods.length - 3}</Text></View>}
      </View>
      <BTNGButton title={`${side} ${listing.coin_symbol}`} onPress={onTrade} variant={side === 'Buy' ? 'buy' : 'sell'} size="md" fullWidth />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// My Ad Card
// ─────────────────────────────────────────────────────────────────────────────
function MyAdCard({ listing, acting, onTogglePause, onDelete }: { listing: P2PListing; acting: boolean; onTogglePause: () => void; onDelete: () => void }) {
  const isOpen = listing.status === 'open';
  const statusColor = isOpen ? Colors.success : listing.status === 'paused' ? Colors.warning : Colors.textMuted;
  const coinInfo = COIN_INFO[listing.coin_symbol];
  return (
    <View style={[styles.myAdCard, { borderLeftColor: listing.type === 'buy' ? Colors.success : Colors.error, borderLeftWidth: 3 }]}>
      <View style={styles.myAdHeader}>
        <View style={styles.myAdLeft}>
          <View style={[styles.myAdTypeChip, { backgroundColor: (listing.type === 'buy' ? Colors.success : Colors.error) + '22' }]}>
            <Text style={[styles.myAdTypeText, { color: listing.type === 'buy' ? Colors.success : Colors.error }]}>{listing.type.toUpperCase()}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {coinInfo?.isGold ? <Image source={BTNG_COIN_IMG} style={{ width: 16, height: 16, borderRadius: 8 }} contentFit="cover" /> : null}
            <Text style={styles.myAdCoin}>{!coinInfo?.isGold ? coinInfo?.logo ?? '' : ''} {listing.coin_symbol}</Text>
          </View>
        </View>
        <View style={[styles.statusChip, { backgroundColor: statusColor + '22', borderColor: statusColor + '44' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusChipText, { color: statusColor }]}>{listing.status}</Text>
        </View>
      </View>
      <View style={styles.myAdDetails}>
        <View style={styles.myAdDetailRow}><Text style={styles.myAdDetailLabel}>Price</Text><Text style={styles.myAdDetailVal}>{listing.price.toLocaleString()} {listing.currency}</Text></View>
        <View style={styles.myAdDetailRow}><Text style={styles.myAdDetailLabel}>Limit</Text><Text style={styles.myAdDetailVal}>{listing.min_amount.toLocaleString()} – {listing.max_amount.toLocaleString()} {listing.currency}</Text></View>
        <View style={styles.myAdDetailRow}><Text style={styles.myAdDetailLabel}>Available</Text><Text style={styles.myAdDetailVal}>{listing.available_amount.toLocaleString()} {listing.coin_symbol}</Text></View>
        <View style={styles.myAdDetailRow}><Text style={styles.myAdDetailLabel}>Posted</Text><Text style={styles.myAdDetailVal}>{formatDate(listing.created_at)}</Text></View>
      </View>
      <View style={styles.payRow}>
        {listing.payment_methods.map(pm => <View key={pm} style={styles.payChip}><Text style={styles.payChipText}>{pm}</Text></View>)}
      </View>
      <View style={styles.myAdActions}>
        <TouchableOpacity style={[styles.myAdActionBtn, { backgroundColor: isOpen ? Colors.warningBg : Colors.successBg, borderColor: (isOpen ? Colors.warning : Colors.success) + '44' }, acting && { opacity: 0.5 }]} onPress={onTogglePause} disabled={acting}>
          {acting ? <ActivityIndicator size="small" color={isOpen ? Colors.warning : Colors.success} /> : <>
            <MaterialIcons name={isOpen ? 'pause-circle-outline' : 'play-circle-outline'} size={15} color={isOpen ? Colors.warning : Colors.success} />
            <Text style={[styles.myAdActionText, { color: isOpen ? Colors.warning : Colors.success }]}>{isOpen ? 'Pause' : 'Resume'}</Text>
          </>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.myAdActionBtn, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }]} onPress={onDelete}>
          <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
          <Text style={[styles.myAdActionText, { color: Colors.error }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// P2P Order Card
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Escrow Timer Bar
// ─────────────────────────────────────────────────────────────────────────────
function EscrowTimerBar({ order }: { order: P2POrder }) {
  const [remaining, setRemaining] = useState(0);
  const [total] = useState(30 * 60); // 30 min default escrow
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const expiresAt = order.expires_at ? new Date(order.expires_at).getTime() : Date.now() + 30 * 60 * 1000;
    const updateTimer = () => {
      const secs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemaining(secs);
      const pct = Math.max(0, secs / total);
      Animated.timing(progressAnim, { toValue: pct, duration: 500, useNativeDriver: false }).start();
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order.expires_at, progressAnim, total]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isWarning = remaining > 0 && remaining < 300; // under 5 min
  const isExpired = remaining === 0;
  const color = isExpired ? Colors.textMuted : isWarning ? Colors.error : Colors.success;

  if (['completed', 'cancelled'].includes(order.status)) return null;

  return (
    <View style={escrow.wrapper}>
      <View style={escrow.row}>
        <MaterialIcons name={isExpired ? 'timer-off' : 'timer'} size={14} color={color} />
        <Text style={[escrow.label, { color }]}>
          {isExpired ? 'Escrow Expired' : `Escrow · ${mins}:${String(secs).padStart(2, '0')} remaining`}
        </Text>
        <View style={[escrow.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[escrow.badgeText, { color }]}>{isExpired ? 'EXPIRED' : isWarning ? 'EXPIRING SOON' : 'ACTIVE'}</Text>
        </View>
      </View>
      <View style={escrow.track}>
        <Animated.View style={[escrow.fill, {
          width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: color,
        }]} />
      </View>
    </View>
  );
}

const escrow = StyleSheet.create({
  wrapper: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flex: 1, fontSize: 11, fontWeight: FontWeight.semibold, includeFontPadding: false },
  badge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  track: { height: 4, backgroundColor: Colors.bgCard, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// P2P Order Card (with escrow timer + chat)
// ─────────────────────────────────────────────────────────────────────────────
function P2POrderCard({ order, userId, acting, onAction, onChat }: { order: P2POrder; userId: string; acting: boolean; onAction: (order: P2POrder, status: 'paid' | 'completed' | 'cancelled') => void; onChat?: () => void }) {
  const isBuyer = order.buyer_id === userId;
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? Colors.textMuted;
  const coinInfo = COIN_INFO[order.coin_symbol];
  const canMarkPaid = isBuyer && order.status === 'pending';
  const canRelease = !isBuyer && order.status === 'paid';
  const canCancel = order.status === 'pending';
  return (
    <View style={[styles.orderCard, { borderLeftColor: statusColor, borderLeftWidth: 3 }]}>
      <View style={styles.orderCardHeader}>
        <View style={styles.orderCardLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {coinInfo?.isGold ? <Image source={BTNG_COIN_IMG} style={{ width: 18, height: 18, borderRadius: 9 }} contentFit="cover" /> : null}
            <Text style={styles.orderCardCoin}>{!coinInfo?.isGold ? coinInfo?.logo ?? '' : ''} {order.coin_symbol}</Text>
          </View>
          <Text style={styles.orderCardRole}>{isBuyer ? 'Buyer' : 'Seller'}</Text>
        </View>
        <View style={[styles.orderStatusChip, { backgroundColor: statusColor + '22', borderColor: statusColor + '44' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.orderStatusText, { color: statusColor }]}>{order.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.orderDetails}>
        <View style={styles.orderDetailRow}><Text style={styles.orderDetailLabel}>Amount</Text><Text style={styles.orderDetailVal}>{order.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {order.coin_symbol}</Text></View>
        <View style={styles.orderDetailRow}><Text style={styles.orderDetailLabel}>Price</Text><Text style={styles.orderDetailVal}>{order.price.toLocaleString()} {order.currency}</Text></View>
        <View style={styles.orderDetailRow}><Text style={styles.orderDetailLabel}>Total</Text><Text style={[styles.orderDetailVal, { color: Colors.primary, fontWeight: FontWeight.bold }]}>{order.total_fiat.toLocaleString()} {order.currency}</Text></View>
        <View style={styles.orderDetailRow}><Text style={styles.orderDetailLabel}>Payment</Text><Text style={styles.orderDetailVal}>{order.payment_method}</Text></View>
        <View style={styles.orderDetailRow}><Text style={styles.orderDetailLabel}>Date</Text><Text style={styles.orderDetailVal}>{formatDate(order.created_at)}</Text></View>
      </View>
      {/* Escrow Timer */}
      {!['completed', 'cancelled'].includes(order.status) && (
        <EscrowTimerBar order={order} />
      )}

      {(canMarkPaid || canRelease || canCancel) && (
        <View style={styles.orderActions}>
          {canMarkPaid && (
            <TouchableOpacity style={[styles.orderActionBtn, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }, acting && { opacity: 0.5 }]} onPress={() => onAction(order, 'paid')} disabled={acting}>
              {acting ? <ActivityIndicator size="small" color={Colors.success} /> : <MaterialIcons name="check-circle" size={15} color={Colors.success} />}
              <Text style={[styles.orderActionText, { color: Colors.success }]}>I Paid</Text>
            </TouchableOpacity>
          )}
          {canRelease && (
            <TouchableOpacity style={[styles.orderActionBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }, acting && { opacity: 0.5 }]} onPress={() => onAction(order, 'completed')} disabled={acting}>
              {acting ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="send" size={15} color={Colors.primary} />}
              <Text style={[styles.orderActionText, { color: Colors.primary }]}>Release Crypto</Text>
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity style={[styles.orderActionBtn, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }, acting && { opacity: 0.5 }]} onPress={() => onAction(order, 'cancelled')} disabled={acting}>
              <MaterialIcons name="cancel" size={15} color={Colors.error} />
              <Text style={[styles.orderActionText, { color: Colors.error }]}>Cancel</Text>
            </TouchableOpacity>
          )}
          {onChat && !['completed', 'cancelled'].includes(order.status) && (
            <TouchableOpacity style={[styles.orderActionBtn, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]} onPress={onChat}>
              <MaterialIcons name="chat-bubble-outline" size={15} color={Colors.textSecondary} />
              <Text style={[styles.orderActionText, { color: Colors.textSecondary }]}>Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BTNG Cert Card
// ─────────────────────────────────────────────────────────────────────────────
function CertCard({ cert, isOwn, onOffer, onRenew }: { cert: any; isOwn: boolean; onOffer: () => void; onRenew: () => void }) {
  const gradeColor = cert.equity_grade === 'A' ? '#22C55E' : cert.equity_grade === 'B' ? '#3B82F6' : '#D4A017';
  const certTypeLabel = cert.cert_type === 'BTNG_GOLD_EXPRESS' ? 'Gold Express' : cert.cert_type === 'BTNG_EQUITY_BACKED' ? 'Equity Backed' : cert.cert_type?.replace(/_/g, ' ') ?? 'Certificate';
  const issuerName = cert.user_profiles?.full_name ?? cert.user_profiles?.username ?? cert.user_profiles?.email?.split('@')[0] ?? 'Anonymous';
  return (
    <View style={styles.certMarketCard}>
      <View style={styles.certMarketHeader}>
        <View style={styles.certMarketIconWrap}>
          <Image source={BTNG_COIN_IMG} style={styles.certMarketCoinImg} contentFit="cover" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.certMarketTitleRow}>
            <Text style={styles.certMarketId} numberOfLines={1}>{cert.cert_id}</Text>
            {isOwn && <View style={styles.certOwnBadge}><Text style={styles.certOwnBadgeText}>MINE</Text></View>}
          </View>
          <Text style={styles.certMarketType}>{certTypeLabel}</Text>
        </View>
        <View style={[styles.certGradeBadge, { backgroundColor: gradeColor + '18', borderColor: gradeColor + '55' }]}>
          <Text style={[styles.certGradeText, { color: gradeColor }]}>Grade {cert.equity_grade}</Text>
        </View>
      </View>
      <View style={styles.certMarketStats}>
        <View style={styles.certMarketStat}><Text style={styles.certMarketStatVal}>{(cert.asset_value ?? 0).toLocaleString()}</Text><Text style={styles.certMarketStatLbl}>BTNGG Value</Text></View>
        <View style={styles.certMarketStatDiv} />
        <View style={styles.certMarketStat}><Text style={styles.certMarketStatVal}>{cert.metadata?.discount_bps ? `${cert.metadata.discount_bps / 100}%` : '0%'}</Text><Text style={styles.certMarketStatLbl}>Discount</Text></View>
        <View style={styles.certMarketStatDiv} />
        <View style={styles.certMarketStat}><Text style={styles.certMarketStatVal}>{cert.expires_at ?? 'N/A'}</Text><Text style={styles.certMarketStatLbl}>Expires</Text></View>
      </View>
      <View style={styles.certMarketIssuerRow}>
        <View style={styles.certMarketIssuerAvatar}><Text style={styles.certMarketIssuerAvatarText}>{issuerName[0].toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.certMarketIssuerName}>{issuerName}</Text>
          <Text style={styles.certMarketIssuerSub}>Issuer · {cert.user_profiles?.tier ?? 'Bronze'} Tier</Text>
        </View>
        {cert.user_profiles?.kyc_status === 'verified' && (
          <View style={[styles.kycBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
            <MaterialIcons name="verified" size={11} color="#22C55E" />
            <Text style={[styles.kycBadgeText, { color: '#22C55E' }]}>KYC</Text>
          </View>
        )}
      </View>
      <View style={styles.certMarketActions}>
        <View style={styles.certLiveBadge}>
          <View style={styles.certLiveDot} />
          <Text style={styles.certLiveText}>LIVE · Tradeable</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!isOwn ? (
            <TouchableOpacity style={styles.certBuyBtn} onPress={onOffer} activeOpacity={0.85}>
              <MaterialIcons name="local-offer" size={15} color="#fff" />
              <Text style={styles.certBuyBtnText}>Buy / Offer</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.certBuyBtn, { backgroundColor: Colors.bgElevated }]}>
              <MaterialIcons name="check-circle" size={15} color={Colors.textMuted} />
              <Text style={[styles.certBuyBtnText, { color: Colors.textMuted }]}>Your Certificate</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function CertDetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.certDetailRowStyle}>
      <Text style={styles.certDetailRowLabel}>{label}</Text>
      <Text style={[styles.certDetailRowVal, color ? { color } : {}]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BTNG Gold Banner
// ─────────────────────────────────────────────────────────────────────────────
function BTNGGoldBanner({ onUnitPress }: { onUnitPress: (unit: { symbol: string; label: string; price: number; color: string }) => void }) {
  const { priceBTNGG, btngPerGram, priceUSD, source, loading } = useGoldOracle();
  const btngKg = priceUSD > 0 ? priceUSD * 32.1507 : 0;
  const isLive = source === 'live';
  const units = [
    { symbol: 'BTNGG',    label: '1/1000 oz', price: priceBTNGG,  color: '#D4A017' },
    { symbol: 'BTNG-G',  label: '1 gram',    price: btngPerGram, color: '#C8900A' },
    { symbol: 'BTNG-KG', label: '1 kg',       price: btngKg,     color: '#B87333' },
  ];
  return (
    <View style={gbStyles.wrapper}>
      <View style={gbStyles.titleRow}>
        <View style={gbStyles.titleLeft}>
          <Image source={BTNG_COIN_IMG} style={gbStyles.titleCoinImg} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={gbStyles.title}>BTNG Gold P2P Market</Text>
            <Text style={gbStyles.titleSub}>Tap a unit to buy or sell instantly</Text>
          </View>
        </View>
        <View style={[gbStyles.liveBadge, { backgroundColor: isLive ? Colors.successBg : Colors.warningBg, borderColor: (isLive ? Colors.success : Colors.warning) + '55' }]}>
          <View style={[gbStyles.liveDot, { backgroundColor: isLive ? Colors.success : Colors.warning }]} />
          <Text style={[gbStyles.liveText, { color: isLive ? Colors.success : Colors.warning }]}>{loading ? 'LOADING…' : isLive ? 'LIVE ORACLE' : 'CACHED'}</Text>
        </View>
      </View>
      <View style={gbStyles.unitsRow}>
        {units.map(u => (
          <TouchableOpacity key={u.symbol} style={[gbStyles.unitCard, { borderColor: u.color + '88' }]} onPress={() => onUnitPress(u)} activeOpacity={0.78}>
            <View style={[gbStyles.unitImgWrap, { borderColor: u.color + '99' }]}>
              <Image source={BTNG_COIN_IMG} style={gbStyles.unitCoinImg} contentFit="cover" />
            </View>
            <Text style={[gbStyles.unitSymbol, { color: u.color }]}>{u.symbol}</Text>
            <Text style={gbStyles.unitLabel}>{u.label}</Text>
            <Text style={[gbStyles.unitPrice, { color: u.color }]}>
              {u.price > 0 ? u.price >= 1000 ? `$${u.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${u.price.toFixed(4)}` : '—'}
            </Text>
            <View style={[gbStyles.unitBuyBtn, { backgroundColor: u.color + '22', borderColor: u.color + '66' }]}>
              <MaterialIcons name="shopping-cart" size={10} color={u.color} />
              <Text style={[gbStyles.unitBuyText, { color: u.color }]}>BUY / SELL</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <View style={gbStyles.footerRow}>
        <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
        <Text style={gbStyles.footerText}>Trade BTNG Gold in GHS, NGN, KES and 50+ African currencies via P2P escrow</Text>
      </View>
    </View>
  );
}

const gbStyles = StyleSheet.create({
  wrapper: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#D4A017' + '55', overflow: 'hidden', shadowColor: '#D4A017', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: '#D4A017' + '22', backgroundColor: '#D4A017' + '0A' },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  titleCoinImg: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#D4A01788' },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#D4A017', includeFontPadding: false },
  titleSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5 },
  liveText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
  unitsRow: { flexDirection: 'row', paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, gap: Spacing.sm },
  unitCard: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1.5 },
  unitImgWrap: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', borderWidth: 2, backgroundColor: '#D4A01718' },
  unitCoinImg: { width: 38, height: 38, borderRadius: 19 },
  unitSymbol: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  unitLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  unitPrice: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  unitBuyBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, marginTop: 2 },
  unitBuyText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: '#D4A017' + '22', backgroundColor: '#D4A017' + '08' },
  footerText: { flex: 1, fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Alert Toast
// ─────────────────────────────────────────────────────────────────────────────
import { Animated as RNAnimated } from 'react-native';

function AlertToast({ toast, onDismiss }: { toast: P2PToast; onDismiss: () => void }) {
  const slideAnim = React.useRef(new RNAnimated.Value(-120)).current;
  const opacityAnim = React.useRef(new RNAnimated.Value(0)).current;
  React.useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      RNAnimated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      RNAnimated.parallel([
        RNAnimated.timing(slideAnim, { toValue: -120, duration: 250, useNativeDriver: true }),
        RNAnimated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 5500);
    return () => clearTimeout(timer);
  }, []);
  const pct = ((Math.abs(toast.currentConverted - toast.targetPrice) / toast.targetPrice) * 100).toFixed(1);
  const isBelow = toast.currentConverted <= toast.targetPrice;
  return (
    <RNAnimated.View style={[toastStyles.toastWrap, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}>
      <View style={toastStyles.inner}>
        <View style={toastStyles.iconWrap}><MaterialIcons name="notifications-active" size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={toastStyles.title}>{toast.message}</Text>
          <Text style={toastStyles.detail} numberOfLines={2}>{toast.detail}</Text>
          <View style={toastStyles.pctRow}>
            <MaterialIcons name={isBelow ? 'trending-down' : 'trending-up'} size={11} color={isBelow ? Colors.success : Colors.warning} />
            <Text style={[toastStyles.pctText, { color: isBelow ? Colors.success : Colors.warning }]}>{pct}% {isBelow ? 'below' : 'above'} target</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
    </RNAnimated.View>
  );
}

const toastStyles = StyleSheet.create({
  toastWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  inner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 20 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  detail: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, marginTop: 2, lineHeight: 16 },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  pctText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
});

const alertStyles = StyleSheet.create({
  bellBtn: { position: 'absolute', top: 0, right: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  bellBtnActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  bellActiveDot: { position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success, borderWidth: 1, borderColor: Colors.bgElevated },
  alertStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm + 4, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  alertStripText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false, flex: 1 },
  listingInfoCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  listingInfoLeft: { gap: 4 },
  listingInfoCoin: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  listingInfoTrader: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  listingInfoRight: { alignItems: 'flex-end', gap: 3 },
  listingInfoPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  listingInfoLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  section: { gap: 8 },
  currChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1.5, borderColor: Colors.border, minWidth: 90 },
  currChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  currFlag: { fontSize: 18 },
  currCode: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  currCodeActive: { color: Colors.primary },
  currConverted: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  quickRow: { flexDirection: 'row', gap: Spacing.sm },
  quickChip: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, borderWidth: 1.5, borderColor: Colors.border },
  quickChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  quickChipLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false, letterSpacing: 0.3 },
  quickChipLabelActive: { color: Colors.primary },
  quickChipVal: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  quickChipValActive: { color: Colors.primary },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 15, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  saveBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Live FX Ticker
// ─────────────────────────────────────────────────────────────────────────────
function LiveFXTicker() {
  const { getRate, loading, refresh: refreshRates, lastUpdated } = useExchangeRateContext();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);
  const { countdown: liveCountdown, refresh: manualRefresh } = useAutoRefresh(() => { refreshRates(); }, 60_000);
  const timeStr = lastUpdated ? lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  const rows = FX_TICKER_CURRENCIES.map(c => {
    const rate = getRate(c.code) || 0;
    const fallback = AFRICAN_CURRENCIES.find(x => x.code === c.code)?.usdRate ?? 0;
    const displayRate = rate > 0 ? rate : fallback;
    const seed = displayRate % 10;
    const changePct = ((seed * 13 + c.code.charCodeAt(0) * 7) % 200 - 100) * 0.015;
    return { ...c, rate: displayRate, isUp: changePct >= 0 };
  });
  return (
    <View style={tick.wrapper}>
      <View style={tick.labelWrap}>
        <Animated.View style={[tick.liveDot, { opacity: pulseAnim }]} />
        <Text style={tick.labelText}>FX</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tick.scrollContent} style={tick.scroll}>
        {rows.map(r => (
          <TouchableOpacity key={r.code} style={tick.pill} activeOpacity={0.75} onPress={() => manualRefresh()}>
            <Text style={tick.pillFlag}>{r.flag}</Text>
            <Text style={tick.pillCode}>{r.code}</Text>
            <Text style={tick.pillRate}>{r.rate > 0 ? r.rate >= 1000 ? r.rate.toLocaleString('en-US', { maximumFractionDigits: 0 }) : r.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</Text>
            <Text style={[tick.pillChange, { color: r.isUp ? Colors.success : Colors.error }]}>{r.isUp ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        ))}
        <View style={tick.anchorPill}>
          <Text style={tick.anchorFlag}>🇺🇸</Text>
          <Text style={tick.anchorCode}>USD</Text>
          <Text style={tick.anchorRate}>1.00</Text>
          <Text style={tick.anchorBase}>BASE</Text>
        </View>
      </ScrollView>
      <TouchableOpacity style={tick.refreshWrap} onPress={() => manualRefresh()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        {loading ? <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.65 }] }} /> : <>
          <Text style={tick.cdText}>{liveCountdown}s</Text>
          {timeStr ? <Text style={tick.timeText}>{timeStr}</Text> : null}
        </>}
      </TouchableOpacity>
    </View>
  );
}

const tick = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', height: 42, overflow: 'hidden' },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: Colors.primary + '33', height: '100%', backgroundColor: Colors.primaryGlow },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  labelText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },
  scroll: { flex: 1 },
  scrollContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, gap: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border, height: 28 },
  pillFlag: { fontSize: 11 },
  pillCode: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  pillRate: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  pillChange: { fontSize: 8, includeFontPadding: false },
  anchorPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55', height: 28, marginLeft: 4 },
  anchorFlag: { fontSize: 11 },
  anchorCode: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  anchorRate: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  anchorBase: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, opacity: 0.7 },
  refreshWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm, borderLeftWidth: 1, borderLeftColor: Colors.primary + '22', height: '100%', gap: 1, minWidth: 44 },
  cdText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, textAlign: 'center' },
  timeText: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Depth Chart
// ─────────────────────────────────────────────────────────────────────────────
function DepthChart({ asks, bids, convertPrice, currSymbol }: {
  asks: Array<{ price: number; amount: number }>;
  bids: Array<{ price: number; amount: number }>;
  convertPrice: (p: number) => number;
  currSymbol: string;
}) {
  // Build cumulative volumes
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
  const sortedBids = [...bids].sort((a, b) => b.price - a.price);

  const cumAsks: Array<{ price: number; cum: number }> = [];
  let cumAsk = 0;
  for (const a of sortedAsks) { cumAsk += a.amount; cumAsks.push({ price: a.price, cum: cumAsk }); }

  const cumBids: Array<{ price: number; cum: number }> = [];
  let cumBid = 0;
  for (const b of sortedBids) { cumBid += b.amount; cumBids.push({ price: b.price, cum: cumBid }); }

  const maxCum = Math.max(cumAsk, cumBid, 1);
  const BARS = 8;

  const askBars = cumAsks.slice(0, BARS);
  const bidBars = cumBids.slice(0, BARS);

  if (askBars.length === 0 && bidBars.length === 0) return null;

  return (
    <View style={dc.wrapper}>
      <View style={dc.header}>
        <MaterialIcons name="area-chart" size={12} color={Colors.primary} />
        <Text style={dc.title}>Depth Chart · Cumulative Volume</Text>
      </View>
      <View style={dc.chart}>
        {/* Bids — left side */}
        <View style={dc.side}>
          {bidBars.map((b, i) => (
            <View key={i} style={dc.barRow}>
              <Text style={[dc.barLabel, { color: Colors.success }]} numberOfLines={1}>
                {convertPrice(b.price) >= 1000
                  ? `${currSymbol}${Math.round(convertPrice(b.price) / 1000)}K`
                  : `${currSymbol}${convertPrice(b.price).toFixed(1)}`}
              </Text>
              <View style={dc.barTrack}>
                <View style={[dc.barFill, dc.barFillBid, { width: `${(b.cum / maxCum) * 100}%` as any }]} />
              </View>
            </View>
          ))}
          <Text style={dc.sideLabel}>BIDS</Text>
        </View>
        <View style={dc.divider} />
        {/* Asks — right side */}
        <View style={dc.side}>
          {askBars.map((a, i) => (
            <View key={i} style={dc.barRow}>
              <Text style={[dc.barLabel, { color: Colors.error }]} numberOfLines={1}>
                {convertPrice(a.price) >= 1000
                  ? `${currSymbol}${Math.round(convertPrice(a.price) / 1000)}K`
                  : `${currSymbol}${convertPrice(a.price).toFixed(1)}`}
              </Text>
              <View style={dc.barTrack}>
                <View style={[dc.barFill, dc.barFillAsk, { width: `${(a.cum / maxCum) * 100}%` as any }]} />
              </View>
            </View>
          ))}
          <Text style={dc.sideLabel}>ASKS</Text>
        </View>
      </View>
      <Text style={dc.note}>Cumulative depth · X-axis = price · bars = running total volume</Text>
    </View>
  );
}

const dc = StyleSheet.create({
  wrapper: { backgroundColor: Colors.bgElevated, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  chart: { flexDirection: 'row', gap: Spacing.sm },
  side: { flex: 1, gap: 4 },
  sideLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.5, textAlign: 'center', includeFontPadding: false, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  barLabel: { fontSize: 8, fontWeight: FontWeight.bold, includeFontPadding: false, minWidth: 34 },
  barTrack: { flex: 1, height: 10, backgroundColor: Colors.bgCard, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 2 },
  barFillBid: { backgroundColor: Colors.success + 'CC' },
  barFillAsk: { backgroundColor: Colors.error + 'CC' },
  divider: { width: 1, backgroundColor: Colors.border + '88', marginVertical: 4 },
  note: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center', fontStyle: 'italic' },
});

// ─────────────────────────────────────────────────────────────────────────────
// BTNG Order Book Panel
// ─────────────────────────────────────────────────────────────────────────────
const OB_UNITS = [
  { symbol: 'BTNGG',    label: '1/1000 oz', color: '#D4A017', multiplier: 1 },
  { symbol: 'BTNG-G',  label: '1 gram',    color: '#C8900A', multiplier: 31.1035 },
  { symbol: 'BTNG-KG', label: '1 kg',      color: '#B87333', multiplier: 31103.5 },
] as const;

function BTNGOrderBookPanel({ getRate }: { getRate: (code: string) => number }) {
  const [activeUnit, setActiveUnit] = useState<'BTNGG' | 'BTNG-G' | 'BTNG-KG'>('BTNGG');
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'GHS'>('GHS');
  const [collapsed, setCollapsed] = useState(false);
  const { book, loading, isLive, countdown, refresh } = useLiveOrderBook('BTNGG');
  const ghsRate = getRate('GHS') || 1;
  const unit = OB_UNITS.find(u => u.symbol === activeUnit) ?? OB_UNITS[0];
  const convertPrice = (btnggPrice: number) => {
    const unitPrice = btnggPrice * unit.multiplier;
    return displayCurrency === 'GHS' ? unitPrice * ghsRate : unitPrice;
  };
  const currSymbol = displayCurrency === 'GHS' ? '₵' : '$';
  const formatPrice = (raw: number): string => {
    if (raw <= 0) return '—';
    if (raw >= 100000) return `${currSymbol}${(raw / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`;
    if (raw >= 1000) return `${currSymbol}${raw.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (raw >= 1) return `${currSymbol}${raw.toFixed(2)}`;
    return `${currSymbol}${raw.toFixed(4)}`;
  };
  const formatAmount = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(2);
  const asks = book?.asks?.slice(0, 7) ?? [];
  const bids = book?.bids?.slice(0, 7) ?? [];
  const maxAskAmt = asks.reduce((m, r) => Math.max(m, r.amount), 0) || 1;
  const maxBidAmt = bids.reduce((m, r) => Math.max(m, r.amount), 0) || 1;
  const totalBidAmt = bids.reduce((s, r) => s + r.amount, 0);
  const totalAskAmt = asks.reduce((s, r) => s + r.amount, 0);
  const bidPct = totalBidAmt + totalAskAmt > 0 ? Math.round((totalBidAmt / (totalBidAmt + totalAskAmt)) * 100) : 50;
  const midPrice = book ? convertPrice(book.midPrice) : 0;
  const spread = book ? convertPrice(book.spread) : 0;
  const spreadPct = book?.spreadPct ?? 0;
  const change24h = book?.change24h ?? 0;

  return (
    <View style={ob.wrapper}>
      <TouchableOpacity style={ob.header} onPress={() => setCollapsed(v => !v)} activeOpacity={0.85}>
        <View style={ob.headerLeft}>
          <View style={[ob.headerIcon, { backgroundColor: unit.color + '22', borderColor: unit.color + '55' }]}>
            <Image source={BTNG_COIN_IMG} style={ob.headerCoinImg} contentFit="cover" />
          </View>
          <View style={{ gap: 2 }}>
            <Text style={[ob.headerTitle, { color: unit.color }]}>{activeUnit} / {displayCurrency} · Order Book</Text>
            <View style={ob.headerSubRow}>
              <View style={[ob.liveBadge, { backgroundColor: isLive ? Colors.successBg : Colors.warningBg, borderColor: (isLive ? Colors.success : Colors.warning) + '55' }]}>
                <View style={[ob.liveDot, { backgroundColor: isLive ? Colors.success : Colors.warning }]} />
                <Text style={[ob.liveText, { color: isLive ? Colors.success : Colors.warning }]}>{loading ? 'LOADING' : isLive ? 'LIVE' : 'CACHED'} · {countdown}s</Text>
              </View>
              {midPrice > 0 && <Text style={[ob.midPriceBadge, { color: unit.color }]}>{formatPrice(midPrice)}</Text>}
            </View>
          </View>
        </View>
        <View style={ob.headerRight}>
          <TouchableOpacity style={ob.refreshBtn} onPress={refresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {loading ? <ActivityIndicator size="small" color={unit.color} style={{ transform: [{ scale: 0.65 }] }} /> : <MaterialIcons name="refresh" size={14} color={unit.color} />}
          </TouchableOpacity>
          <MaterialIcons name={collapsed ? 'expand-more' : 'expand-less'} size={18} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <>
          <View style={ob.controlRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ob.unitRow}>
              {OB_UNITS.map(u => (
                <TouchableOpacity key={u.symbol} style={[ob.unitChip, activeUnit === u.symbol && { backgroundColor: u.color + '22', borderColor: u.color }]} onPress={() => setActiveUnit(u.symbol as any)} activeOpacity={0.8}>
                  <Image source={BTNG_COIN_IMG} style={ob.unitChipCoinImg} contentFit="cover" />
                  <View>
                    <Text style={[ob.unitChipSym, activeUnit === u.symbol && { color: u.color }]}>{u.symbol}</Text>
                    <Text style={ob.unitChipLabel}>{u.label}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={ob.currToggle}>
              {(['GHS', 'USD'] as const).map(c => (
                <TouchableOpacity key={c} style={[ob.currBtn, displayCurrency === c && ob.currBtnActive]} onPress={() => setDisplayCurrency(c)} activeOpacity={0.8}>
                  <Text style={[ob.currBtnText, displayCurrency === c && ob.currBtnTextActive]}>{c === 'GHS' ? '🇬🇭 GHS' : '🇺🇸 USD'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {book && (
            <View style={ob.statsRow}>
              <View style={ob.statCell}><Text style={ob.statLabel}>Mid Price</Text><Text style={[ob.statVal, { color: unit.color }]}>{formatPrice(midPrice)}</Text></View>
              <View style={ob.statDiv} />
              <View style={ob.statCell}><Text style={ob.statLabel}>Spread</Text><Text style={ob.statVal}>{formatPrice(spread)} ({spreadPct.toFixed(3)}%)</Text></View>
              <View style={ob.statDiv} />
              <View style={ob.statCell}><Text style={ob.statLabel}>24h Change</Text><Text style={[ob.statVal, { color: change24h >= 0 ? Colors.success : Colors.error }]}>{change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%</Text></View>
            </View>
          )}

          <View style={ob.tableWrap}>
            <View style={ob.tableHeader}>
              <Text style={[ob.tableColHdr, { flex: 1.8 }]}>PRICE ({displayCurrency})</Text>
              <Text style={[ob.tableColHdr, { flex: 1, textAlign: 'right' }]}>AMOUNT</Text>
              <Text style={[ob.tableColHdr, { flex: 1, textAlign: 'right' }]}>TOTAL</Text>
            </View>
            {loading && asks.length === 0 ? (
              <View style={ob.loadingRow}><ActivityIndicator color={Colors.error} size="small" /><Text style={ob.loadingText}>Loading asks…</Text></View>
            ) : (
              [...asks].reverse().map((row, i) => (
                <View key={`ask-${i}`} style={ob.tableRow}>
                  <View style={[ob.rowBar, { right: 0, width: `${(row.amount / maxAskAmt) * 100}%`, backgroundColor: Colors.error + '18' }]} />
                  <Text style={[ob.askPrice, { flex: 1.8 }]}>{formatPrice(convertPrice(row.price))}</Text>
                  <Text style={[ob.rowAmt, { flex: 1, textAlign: 'right' }]}>{formatAmount(row.amount)}</Text>
                  <Text style={[ob.rowTotal, { flex: 1, textAlign: 'right' }]}>{formatPrice(convertPrice(row.price))}</Text>
                </View>
              ))
            )}
            {book && (
              <View style={ob.spreadRow}>
                <View style={ob.spreadLine} />
                <View style={ob.spreadPill}><Text style={ob.spreadPillText}>Spread  {formatPrice(spread)}  ({spreadPct.toFixed(3)}%)</Text></View>
                <View style={ob.spreadLine} />
              </View>
            )}
            {loading && bids.length === 0 ? (
              <View style={ob.loadingRow}><ActivityIndicator color={Colors.success} size="small" /><Text style={ob.loadingText}>Loading bids…</Text></View>
            ) : (
              bids.map((row, i) => (
                <View key={`bid-${i}`} style={ob.tableRow}>
                  <View style={[ob.rowBar, { left: 0, width: `${(row.amount / maxBidAmt) * 100}%`, backgroundColor: Colors.success + '18' }]} />
                  <Text style={[ob.bidPrice, { flex: 1.8 }]}>{formatPrice(convertPrice(row.price))}</Text>
                  <Text style={[ob.rowAmt, { flex: 1, textAlign: 'right' }]}>{formatAmount(row.amount)}</Text>
                  <Text style={[ob.rowTotal, { flex: 1, textAlign: 'right' }]}>{formatPrice(convertPrice(row.price))}</Text>
                </View>
              ))
            )}
          </View>

          <View style={ob.imbalanceWrap}>
            <View style={ob.imbalanceLabelRow}>
              <Text style={[ob.imbalanceLabel, { color: Colors.success }]}>Bids {bidPct}%</Text>
              <Text style={[ob.imbalanceLabel, { color: Colors.error }]}>{100 - bidPct}% Asks</Text>
            </View>
            <View style={ob.imbalanceBar}>
              <View style={[ob.imbalanceBid, { flex: bidPct }]} />
              <View style={[ob.imbalanceAsk, { flex: 100 - bidPct }]} />
            </View>
            <Text style={ob.imbalanceNote}>Updates every 10s · Anchored to live XAU/USD oracle · {displayCurrency === 'GHS' ? `1 USD = ${(getRate('GHS') || 1).toFixed(2)} GHS` : 'Prices in USD'}</Text>
          </View>
          {/* Depth Chart */}
          {book && asks.length > 0 && bids.length > 0 && (
            <DepthChart asks={asks} bids={bids} convertPrice={convertPrice} currSymbol={currSymbol} />
          )}

          <View style={ob.progressWrap}>
            <View style={[ob.progressFill, { width: `${(countdown / 10) * 100}%`, backgroundColor: isLive ? Colors.success : Colors.warning }]} />
          </View>
        </>
      )}
    </View>
  );
}

const ob = StyleSheet.create({
  wrapper: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#D4A017' + '44', overflow: 'hidden', shadowColor: '#D4A017', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: '#D4A017' + '22', backgroundColor: '#D4A017' + '0A' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  headerCoinImg: { width: 24, height: 24, borderRadius: 12 },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5 },
  liveText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.3 },
  midPriceBadge: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  refreshBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  controlRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  unitRow: { flexDirection: 'row', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, gap: Spacing.sm, flex: 1 },
  unitChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm, borderWidth: 1.5, borderColor: Colors.border },
  unitChipCoinImg: { width: 20, height: 20, borderRadius: 10 },
  unitChipSym: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textSecondary, includeFontPadding: false },
  unitChipLabel: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  currToggle: { flexDirection: 'row', margin: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: 2, borderWidth: 1, borderColor: Colors.border },
  currBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.sm - 1, alignItems: 'center' },
  currBtnActive: { backgroundColor: Colors.primary },
  currBtnText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  currBtnTextActive: { color: Colors.bg },
  statsRow: { flexDirection: 'row', paddingVertical: Spacing.sm + 2, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statDiv: { width: 1, backgroundColor: Colors.border },
  statLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  statVal: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  tableWrap: { paddingBottom: Spacing.xs },
  tableHeader: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableColHdr: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.6, includeFontPadding: false },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 5, position: 'relative', overflow: 'hidden' },
  rowBar: { position: 'absolute', top: 0, bottom: 0 },
  askPrice: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  bidPrice: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  rowAmt: { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  rowTotal: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  spreadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 5, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgElevated },
  spreadLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  spreadPill: { backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  spreadPillText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  loadingText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  imbalanceWrap: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.sm + 2, gap: 5, borderTopWidth: 1, borderTopColor: Colors.border },
  imbalanceLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  imbalanceLabel: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  imbalanceBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  imbalanceBid: { backgroundColor: Colors.success + 'BB' },
  imbalanceAsk: { backgroundColor: Colors.error + 'BB' },
  imbalanceNote: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  progressWrap: { height: 3, backgroundColor: Colors.bgElevated },
  progressFill: { height: 3, borderRadius: 1.5 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Quick Buy Styles
// ─────────────────────────────────────────────────────────────────────────────
const qb = StyleSheet.create({
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.border },
  coinImgWrap: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', borderWidth: 3 },
  coinImg: { width: 64, height: 64, borderRadius: 32 },
  coinSymbol: { fontSize: 22, fontWeight: FontWeight.heavy, includeFontPadding: false },
  coinLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  pricePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, alignSelf: 'flex-start', marginTop: 4 },
  priceText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  unitsStrip: { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  unitsStripTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false, marginBottom: 4 },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.border },
  unitImgWrap: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: 2 },
  unitImg: { width: 36, height: 36, borderRadius: 18 },
  unitSymbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  unitLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  unitPriceText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, marginRight: 4 },
  currChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, height: 36 },
  currChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  qtyChip: { flex: 1, alignItems: 'center', paddingVertical: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  qtyChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: Radius.lg },
  primaryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Chat Styles
// ─────────────────────────────────────────────────────────────────────────────
const chatStyles = StyleSheet.create({
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, height: '85%', borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgElevated },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  escrowPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '44', marginTop: 2 },
  escrowDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  escrowPillText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false, letterSpacing: 0.3 },
  systemMsg: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '33', alignSelf: 'center', maxWidth: '95%' },
  systemMsgText: { flex: 1, fontSize: FontSize.xs, color: Colors.primary, lineHeight: 16, includeFontPadding: false },
  msgRow: { maxWidth: '80%', alignSelf: 'flex-start' },
  bubble: { borderRadius: Radius.xl, padding: Spacing.md, gap: 3 },
  bubbleMe: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, lineHeight: 18 },
  bubbleTime: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'right' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bgElevated },
  input: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
});

function AuthPrompt() {
  return (
    <View style={styles.centerPad}>
      <MaterialIcons name="lock-outline" size={40} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>Sign in to continue</Text>
      <Text style={styles.mutedText}>Post ads and manage your P2P orders</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  containerOuter: { flex: 1, backgroundColor: Colors.bg, width: '100%', alignSelf: 'stretch' },
  toastLayer: { position: 'absolute', left: 0, right: 0, zIndex: 99999, elevation: 99999, pointerEvents: 'box-none' },
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  headerTablet: { paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.lg },
  headerLeft: { flex: 1, gap: 2 },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDotSmall: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveLabel: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  postBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 7 },
  postBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  mainTabRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  mainTabRowTablet: { marginHorizontal: Spacing.xxl, borderRadius: Radius.xl },
  listingsGridTablet: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, justifyContent: 'space-between' },
  mainTab: { flex: 1, paddingVertical: Spacing.sm + 2, alignItems: 'center', borderRadius: Radius.md, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  mainTabActive: { backgroundColor: Colors.primary },
  mainTabText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  mainTabTextActive: { color: Colors.bg },
  badge: { backgroundColor: Colors.error, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: FontWeight.bold, includeFontPadding: false },
  toggleRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  toggleBtn: { flex: 1, paddingVertical: Spacing.sm + 2, alignItems: 'center', borderRadius: Radius.md },
  toggleBtnActive: { backgroundColor: Colors.bgElevated },
  toggleText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  coinFilter: { marginBottom: Spacing.xs },
  coinFilterContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  currencyBarWrap: { marginBottom: Spacing.xs },
  currencyBarContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, paddingVertical: 4 },
  currencyBarChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 4, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, height: 34 },
  currencyBarChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  currencyBarFlag: { fontSize: 12 },
  currencyBarCode: { fontSize: 11, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  currencyBarCodeActive: { color: Colors.primary },
  activeCurrencyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '55', alignSelf: 'flex-start' },
  activeCurrencyFlag: { fontSize: 13 },
  activeCurrencyText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium, includeFontPadding: false },
  convertedPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  convertedPriceFlag: { fontSize: 12 },
  convertedPriceText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, height: 36, justifyContent: 'center' },
  coinChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  coinChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  coinChipTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  listingCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  traderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  traderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  traderAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  traderAvatarText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  traderNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 3 },
  traderName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  badgePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  badgePillText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  traderStats: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  responseRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  responseText: { fontSize: FontSize.xs, color: Colors.success, includeFontPadding: false },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  priceLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 3, includeFontPadding: false },
  priceValRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coinLogoImg: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#D4A01766' },
  coinLogo: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  listingPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false, flexShrink: 1 },
  limitsText: { fontSize: 11, fontWeight: FontWeight.medium, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1 },
  availText: { fontSize: 11, fontWeight: FontWeight.medium, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1 },
  payRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  payChip: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 4, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  payChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  myAdCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  myAdHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myAdLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  myAdTypeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  myAdTypeText: { fontSize: 11, fontWeight: FontWeight.bold, includeFontPadding: false },
  myAdCoin: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  myAdDetails: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: 6, borderWidth: 1, borderColor: Colors.border },
  myAdDetailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  myAdDetailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  myAdDetailVal: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  myAdActions: { flexDirection: 'row', gap: Spacing.sm },
  myAdActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1 },
  myAdActionText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  orderCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  orderCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderCardLeft: { gap: 3 },
  orderCardCoin: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  orderCardRole: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  orderStatusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  orderStatusText: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  orderDetails: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: 6, borderWidth: 1, borderColor: Colors.border },
  orderDetailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  orderDetailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  orderDetailVal: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  orderActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  orderActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1, minWidth: 80 },
  orderActionText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.8)', justifyContent: 'flex-end' },
  tradeSheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '92%', borderWidth: 1, borderColor: Colors.border },
  tradeSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tradeSheetTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tradeTraderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  traderNameBig: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  traderStatsSm: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  kycBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  kycBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  tradePriceCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: 8, borderWidth: 1, borderColor: Colors.border },
  tradePriceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tradePriceLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  tradePriceVal: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1, textAlign: 'right' },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  tradeInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, includeFontPadding: false },
  inputCoin: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, backgroundColor: Colors.bgCard, borderLeftWidth: 1, borderLeftColor: Colors.border },
  inputCoinText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  tradeEstimate: { fontSize: FontSize.xs, color: Colors.primary, includeFontPadding: false, paddingLeft: 2 },
  pmRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  pmChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm - 2, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  pmChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pmChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary, includeFontPadding: false },
  tradeSummaryCard: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md, gap: 6, borderWidth: 1, borderColor: Colors.primary + '33' },
  tradeSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tradeSummaryLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  tradeSummaryVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  escrowNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.success + '44' },
  escrowNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 16, includeFontPadding: false },
  postAdSubmitBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 60, alignItems: 'center' },
  postAdSubmitText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  adTypePicker: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  adTypeBtn: { flex: 1, paddingVertical: Spacing.sm + 2, alignItems: 'center', borderRadius: Radius.md },
  adTypeBuy: { backgroundColor: Colors.success },
  adTypeSell: { backgroundColor: Colors.error },
  adTypeBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  adCoinBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  adCoinLogo: { fontSize: 18 },
  adCoinText: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  currencyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  currencyBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  currencyBtnFlag: { fontSize: 13 },
  currencyBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  adInputGroup: { gap: 6 },
  adInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  adRowInputs: { flexDirection: 'row', gap: Spacing.md },
  pmSelectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pmSelectChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm - 2, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  pmSelectChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pmSelectChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  adDisclaimerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44' },
  adDisclaimerText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 16, includeFontPadding: false },
  certTypeRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm, gap: Spacing.sm, alignItems: 'center' },
  certTypeChip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, height: 36, justifyContent: 'center' },
  certTypeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  certTypeChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  certTypeChipTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  certRefreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  certInfoBanner: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.sm },
  certInfoBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  certInfoCoin: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: Colors.primary },
  certInfoTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  certInfoSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2, lineHeight: 16 },
  certMarketCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.border, gap: Spacing.md },
  certMarketHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  certMarketIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary, overflow: 'hidden', flexShrink: 0 },
  certMarketCoinImg: { width: 44, height: 44, borderRadius: 22 },
  certMarketTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  certMarketId: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace', includeFontPadding: false, flex: 1 },
  certOwnBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '55' },
  certOwnBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  certMarketType: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  certGradeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  certGradeText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  certMarketStats: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  certMarketStat: { flex: 1, alignItems: 'center', gap: 3 },
  certMarketStatVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, flexShrink: 1, textAlign: 'center' },
  certMarketStatLbl: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  certMarketStatDiv: { width: 1, backgroundColor: Colors.border },
  certMarketIssuerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  certMarketIssuerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  certMarketIssuerAvatarText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  certMarketIssuerName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  certMarketIssuerSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  certMarketActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  certLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#22C55E18', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: '#22C55E44' },
  certLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  certLiveText: { fontSize: 10, fontWeight: FontWeight.bold, color: '#22C55E', includeFontPadding: false },
  certBuyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2 },
  certBuyBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  certDetailCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  certDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  certDetailIconWrap: { width: 52, height: 52, borderRadius: 15, backgroundColor: '#D4A01718', borderWidth: 1.5, borderColor: '#D4A01755', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  certDetailId: { fontSize: 12, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace', includeFontPadding: false },
  certDetailType: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  certDetailRows: { gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  certDetailRowStyle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  certDetailRowLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  certDetailRowVal: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, flex: 1, textAlign: 'right' },
  certOfferBtn: { flexDirection: 'row', backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', gap: 8 },
  certOfferBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  centerPad: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  mutedText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  emptyBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  paymentSection: { marginTop: Spacing.lg },
  paymentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  paymentCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 4, width: '31%' },
  paymentIcon: { fontSize: 22 },
  paymentName: { fontSize: FontSize.xs, color: Colors.textPrimary, fontWeight: FontWeight.medium, textAlign: 'center', includeFontPadding: false },
  paymentCountry: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});
