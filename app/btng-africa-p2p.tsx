/**
 * BTNG Africa P2P Trade Listings
 * ─────────────────────────────────────────────────────────────────────────────
 * Pan-African P2P marketplace supporting all 11 African currencies.
 * Backed by the existing `p2p_listings` table.
 *
 * Features:
 *  • Browse open listings filtered by currency + side (buy/sell)
 *  • Post new buy/sell listing in any of 11 currencies
 *  • Corridor fee preview before confirming trade
 *  • AfCFTA badge for eligible cross-border corridors (-30% fee)
 *  • My listings management
 *  • Trade initiation → p2p_orders insert
 *  • In-app order chat modal backed by p2p_messages table
 *    - Text messaging between buyer and seller
 *    - Buyer "Confirm Payment Sent" action
 *    - Seller "Release Escrow" action
 *    - System messages for status changes
 *    - 10s polling for new messages
 */

import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Platform,
  KeyboardAvoidingView, Animated, Easing, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';
import { useGoldOracle } from '@/hooks/useGoldOracle';

// ─── 11 African Currencies ────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'GHS',  name: 'Ghanaian Cedi',       flag: '🇬🇭', symbol: 'GH₵', usdRate: 15.3,    region: 'West Africa',     color: '#D4A017', corridorFee: 0.005, country: 'Ghana'         },
  { code: 'NGN',  name: 'Nigerian Naira',       flag: '🇳🇬', symbol: '₦',   usdRate: 1600,    region: 'West Africa',     color: '#22C55E', corridorFee: 0.005, country: 'Nigeria'       },
  { code: 'KES',  name: 'Kenyan Shilling',      flag: '🇰🇪', symbol: 'KSh', usdRate: 129,     region: 'East Africa',     color: '#F59E0B', corridorFee: 0.008, country: 'Kenya'         },
  { code: 'ZAR',  name: 'South African Rand',   flag: '🇿🇦', symbol: 'R',   usdRate: 18.6,    region: 'Southern Africa', color: '#3B82F6', corridorFee: 0.008, country: 'South Africa'  },
  { code: 'XAF',  name: 'CFA Franc (CEMAC)',    flag: '🇨🇲', symbol: 'FCFA',usdRate: 610,     region: 'Central Africa',  color: '#A855F7', corridorFee: 0.001, country: 'Cameroon'      },
  { code: 'XOF',  name: 'CFA Franc (UEMOA)',    flag: '🇸🇳', symbol: 'FCFA',usdRate: 610,     region: 'West CFA',        color: '#8B5CF6', corridorFee: 0.001, country: 'Senegal'       },
  { code: 'EGP',  name: 'Egyptian Pound',       flag: '🇪🇬', symbol: 'E£',  usdRate: 48.7,    region: 'North Africa',    color: '#EF4444', corridorFee: 0.012, country: 'Egypt'         },
  { code: 'USDC', name: 'USD Coin',             flag: '💵',  symbol: '$',   usdRate: 1,       region: 'Global Stable',   color: '#2775CA', corridorFee: 0.002, country: 'Global'        },
  { code: 'cNGN', name: 'Digital Naira (CBDC)', flag: '⚡',  symbol: '₦d',  usdRate: 1600,    region: 'Nigeria CBDC',    color: '#16A34A', corridorFee: 0.003, country: 'Nigeria'       },
  { code: 'BTC',  name: 'Bitcoin',              flag: '₿',   symbol: '₿',   usdRate: 0.000015,region: 'Global Crypto',   color: '#F7931A', corridorFee: 0.010, country: 'Global'        },
  { code: 'ETH',  name: 'Ethereum',             flag: '⬡',   symbol: 'Ξ',   usdRate: 0.00035, region: 'Global Crypto',   color: '#627EEA', corridorFee: 0.010, country: 'Global'        },
] as const;

const AFCFTA_COUNTRIES = [
  'Ghana', 'Nigeria', 'Kenya', 'South Africa', 'Egypt', 'Cameroon',
  'Tanzania', 'Uganda', 'Rwanda', 'Zimbabwe', 'Ivory Coast', 'Senegal',
  'Ethiopia', 'Morocco', 'Algeria', 'DRC',
];

const ASSETS = [
  { symbol: 'BTNGG', name: 'BTNG Gold',   emoji: '🥇', color: '#D4A017' },
  { symbol: 'BTC',   name: 'Bitcoin',     emoji: '₿',  color: '#F7931A' },
  { symbol: 'ETH',   name: 'Ethereum',    emoji: '⬡',  color: '#627EEA' },
  { symbol: 'USDC',  name: 'USD Coin',    emoji: '💵', color: '#2775CA' },
  { symbol: 'XAU',   name: 'Gold (Spot)', emoji: '🥇', color: '#D4A017' },
];

const PAYMENT_METHODS = [
  'MTN MoMo', 'M-Pesa', 'Orange Money', 'Airtel Money', 'Ecocash', 'Wave',
  'Bank Transfer', 'Cash', 'USDC Transfer', 'BTNG Pay',
];

function getCurrency(code: string) {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];
}

// ─── Order status config ──────────────────────────────────────────────────────

const ORDER_STATUS_CFG: Record<string, { color: string; label: string; icon: string }> = {
  pending:       { color: Colors.warning,  label: 'Awaiting Payment',   icon: 'hourglass-top'     },
  payment_sent:  { color: '#3B82F6',       label: 'Payment Sent',       icon: 'send'              },
  completed:     { color: Colors.success,  label: 'Completed',          icon: 'check-circle'      },
  cancelled:     { color: Colors.error,    label: 'Cancelled',          icon: 'cancel'            },
  disputed:      { color: '#F59E0B',       label: 'Disputed',           icon: 'gavel'             },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Listing {
  id: string;
  user_id: string;
  coin_symbol: string;
  coin_name: string;
  type: 'buy' | 'sell';
  price: number;
  currency: string;
  min_amount: number;
  max_amount: number;
  available_amount: number;
  payment_methods: string[];
  status: string;
  completed_trades: number;
  rating: number;
  response_time: string;
  country: string;
  badge: string | null;
  terms: string | null;
  created_at: string;
}

interface P2POrder {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  coin_symbol: string;
  amount: number;
  price: number;
  total_fiat: number;
  currency: string;
  payment_method: string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

interface P2PMessage {
  id: string;
  order_id: string;
  sender_id: string;
  content: string;
  msg_type: 'text' | 'payment_proof' | 'system';
  attachment_url: string | null;
  created_at: string;
}

// ─── Corridor fee calculator ──────────────────────────────────────────────────

function calcFee(fromCode: string, toCode: string, amount: number) {
  const from = getCurrency(fromCode);
  const to   = getCurrency(toCode);
  const rawFee = Math.max(from.corridorFee, to.corridorFee);
  const bothAfCFTA = AFCFTA_COUNTRIES.includes(from.country) && AFCFTA_COUNTRIES.includes(to.country);
  const discount   = (fromCode !== toCode && bothAfCFTA) ? 0.30 : 0;
  const fee        = amount * rawFee * (1 - discount);
  const net        = amount - fee;
  const usdValue   = amount / from.usdRate;
  return { fee, net, discount, bothAfCFTA, rawFeePct: rawFee * 100, effectiveFeePct: rawFee * (1 - discount) * 100, usdValue };
}

// ─── Live Dot ────────────────────────────────────────────────────────────────

function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.9, duration: 750, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1,   duration: 750, useNativeDriver: true }),
    ])).start();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.28, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Corridor Fee Preview Card ────────────────────────────────────────────────

function CorridorFeeCard({
  myCurrency, theirCurrency, amount, onConfirm, onCancel, confirmLabel,
}: {
  myCurrency: string; theirCurrency: string; amount: number;
  onConfirm: () => void; onCancel: () => void; confirmLabel: string;
}) {
  const fee     = calcFee(myCurrency, theirCurrency, amount);
  const myCurr  = getCurrency(myCurrency);
  const themCurr= getCurrency(theirCurrency);
  const isCross = myCurrency !== theirCurrency;
  return (
    <View style={cf.card}>
      <View style={cf.header}>
        <MaterialIcons name="swap-calls" size={18} color={Colors.primary} />
        <Text style={cf.title}>Corridor Fee Preview</Text>
        {fee.bothAfCFTA && isCross && (
          <View style={cf.afcftaBadge}>
            <MaterialIcons name="verified" size={10} color={Colors.success} />
            <Text style={cf.afcftaText}>AfCFTA -30%</Text>
          </View>
        )}
      </View>
      <View style={cf.flowRow}>
        <View style={[cf.flowBox, { borderColor: myCurr.color + '55', backgroundColor: myCurr.color + '10' }]}>
          <Text style={{ fontSize: 20 }}>{myCurr.flag}</Text>
          <Text style={[cf.flowCode, { color: myCurr.color }]}>{myCurrency}</Text>
          <Text style={[cf.flowAmt, { color: myCurr.color }]}>{myCurr.symbol}{amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
        </View>
        <View style={cf.flowArrow}>
          <MaterialIcons name="arrow-forward" size={20} color={Colors.primary} />
          {isCross && <Text style={cf.flowBridge}>BTNGG bridge</Text>}
        </View>
        <View style={[cf.flowBox, { borderColor: themCurr.color + '55', backgroundColor: themCurr.color + '10' }]}>
          <Text style={{ fontSize: 20 }}>{themCurr.flag}</Text>
          <Text style={[cf.flowCode, { color: themCurr.color }]}>{theirCurrency}</Text>
          <Text style={[cf.flowAmt, { color: themCurr.color }]}>{themCurr.symbol}{fee.net.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
        </View>
      </View>
      <View style={cf.breakdown}>
        {[
          { label: 'Trade Amount',     value: `${myCurr.symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,  color: Colors.textPrimary },
          { label: 'USD Equivalent',   value: `$${fee.usdValue.toFixed(4)}`,                                                      color: Colors.textMuted   },
          { label: 'Raw Corridor Fee', value: `${fee.rawFeePct.toFixed(2)}%`,                                                     color: Colors.warning     },
          fee.discount > 0 ? { label: 'AfCFTA Discount', value: `-${(fee.discount * 100).toFixed(0)}%`, color: Colors.success } : null,
          { label: 'Effective Fee',    value: `${fee.effectiveFeePct.toFixed(3)}% (${myCurr.symbol}${fee.fee.toLocaleString('en-US', { maximumFractionDigits: 4 })})`, color: Colors.error },
          { label: 'You Receive',      value: `${themCurr.symbol}${fee.net.toLocaleString('en-US', { maximumFractionDigits: 4 })}`, color: Colors.success },
        ].filter(Boolean).map(row => (
          <View key={row!.label} style={cf.breakdownRow}>
            <Text style={cf.breakdownLabel}>{row!.label}</Text>
            <Text style={[cf.breakdownValue, { color: row!.color }]}>{row!.value}</Text>
          </View>
        ))}
      </View>
      {fee.bothAfCFTA && isCross && (
        <View style={cf.afcftaInfo}>
          <MaterialIcons name="info-outline" size={12} color={Colors.success} />
          <Text style={cf.afcftaInfoText}>AfCFTA 30% discount applied.</Text>
        </View>
      )}
      <View style={cf.actions}>
        <TouchableOpacity style={cf.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
          <Text style={cf.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cf.confirmBtn} onPress={onConfirm} activeOpacity={0.85}>
          <MaterialIcons name="check-circle" size={16} color={Colors.bg} />
          <Text style={cf.confirmText}>{confirmLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cf = StyleSheet.create({
  card:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.md, gap: Spacing.md },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title:         { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  afcftaBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '55' },
  afcftaText:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  flowRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flowBox:       { flex: 1, alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1.5, paddingVertical: Spacing.md, gap: 3 },
  flowCode:      { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  flowAmt:       { fontSize: 13, fontWeight: FontWeight.heavy, includeFontPadding: false },
  flowArrow:     { alignItems: 'center', gap: 2 },
  flowBridge:    { fontSize: 8, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  breakdown:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 },
  breakdownRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel:{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  breakdownValue:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  afcftaInfo:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.success + '44' },
  afcftaInfoText:{ flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 16, includeFontPadding: false },
  actions:       { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn:     { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  confirmBtn:    { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  confirmText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ─── Order Chat Modal ─────────────────────────────────────────────────────────

function OrderChatModal({
  visible,
  order,
  myUserId,
  onClose,
}: {
  visible: boolean;
  order: P2POrder | null;
  myUserId: string | null;
  onClose: () => void;
}) {
  const { showAlert } = useAlert();
  const [messages,     setMessages]     = useState<P2PMessage[]>([]);
  const [orderStatus,  setOrderStatus]  = useState<string>('pending');
  const [msgText,      setMsgText]      = useState('');
  const [sending,      setSending]      = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [acting,       setActing]       = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [lightboxUri,    setLightboxUri]    = useState<string | null>(null);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const flatRef = useRef<FlatList<any>>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBuyer  = order ? order.buyer_id  === myUserId : false;
  const isSeller = order ? order.seller_id === myUserId : false;
  const statusCfg = ORDER_STATUS_CFG[orderStatus] ?? ORDER_STATUS_CFG['pending'];
  const curr = order ? getCurrency(order.currency) : null;

  // ── Load messages + order status ─────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!order) return;
    const supabase = getSupabaseClient();
    const [{ data: msgs }, { data: ord }] = await Promise.all([
      supabase
        .from('p2p_messages')
        .select('*')
        .eq('order_id', order.id)
        .order('created_at', { ascending: true })
        .limit(100),
      supabase
        .from('p2p_orders')
        .select('status')
        .eq('id', order.id)
        .maybeSingle(),
    ]);
    if (msgs) setMessages(msgs as P2PMessage[]);
    if (ord)  setOrderStatus(ord.status);
  }, [order]);

  useEffect(() => {
    if (!visible || !order) return;
    setLoading(true);
    loadMessages().finally(() => setLoading(false));
    pollRef.current = setInterval(loadMessages, 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [visible, order, loadMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Insert a system message helper
  const insertSystem = useCallback(async (orderId: string, content: string) => {
    const supabase = getSupabaseClient();
    await supabase.from('p2p_messages').insert({
      order_id:  orderId,
      sender_id: myUserId,
      content,
      msg_type: 'system',
    });
  }, [myUserId]);

  // ── Send text message ─────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!msgText.trim() || !order || !myUserId) return;
    setSending(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('p2p_messages').insert({
        order_id:  order.id,
        sender_id: myUserId,
        content:   msgText.trim(),
        msg_type: 'text',
      });
      if (error) throw new Error(error.message);
      setMsgText('');
      await loadMessages();
    } catch (e: any) {
      showAlert('Send Failed', e.message ?? 'Unknown error');
    } finally {
      setSending(false);
    }
  }, [msgText, order, myUserId, loadMessages, showAlert]);

  // ── Buyer: confirm payment sent ───────────────────────────────────────────
  const confirmPaymentSent = useCallback(async () => {
    if (!order || !isBuyer) return;
    setActing(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('p2p_orders')
        .update({ status: 'payment_sent', buyer_confirmed_at: new Date().toISOString() })
        .eq('id', order.id);
      if (error) throw new Error(error.message);
      await insertSystem(order.id, `✅ Buyer confirmed payment sent via ${order.payment_method}. Awaiting seller release.`);
      await loadMessages();
      showAlert('Payment Confirmed', 'The seller has been notified. Awaiting escrow release.');
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Unknown error');
    } finally {
      setActing(false);
    }
  }, [order, isBuyer, insertSystem, loadMessages, showAlert]);

  // ── Seller: release escrow ────────────────────────────────────────────────
  const releaseEscrow = useCallback(async () => {
    if (!order || !isSeller) return;
    showAlert(
      'Release Escrow',
      `Confirm you have received payment. This will complete the trade and release ${order.amount.toFixed(6)} ${order.coin_symbol} to the buyer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Release', onPress: async () => {
          setActing(true);
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase
              .from('p2p_orders')
              .update({ status: 'completed', seller_confirmed_at: new Date().toISOString() })
              .eq('id', order.id);
            if (error) throw new Error(error.message);
            await insertSystem(order.id, `🎉 Escrow released! Trade completed. ${order.amount.toFixed(6)} ${order.coin_symbol} transferred to buyer.`);
            await loadMessages();
            showAlert('Trade Completed!', 'Escrow released. The trade is now complete.');
          } catch (e: any) {
            showAlert('Error', (e as any).message ?? 'Unknown error');
          } finally {
            setActing(false);
          }
        }},
      ]
    );
  }, [order, isSeller, insertSystem, loadMessages, showAlert]);

  // ── Buyer: upload payment proof ─────────────────────────────────────────
  const uploadPaymentProof = useCallback(async (source: 'camera' | 'library') => {
    if (!order || !myUserId || !isBuyer) return;
    setShowAttachSheet(false);

    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Please allow camera access to take a photo of your payment receipt.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: false,
      });
    } else {
      // Request media library permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Please allow access to your photo library to upload payment proof.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: false,
      });
    }

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      // Read as base64
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = decode(base64);

      // Build storage path: p2p-proofs/{orderId}/{timestamp}.jpg
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const storagePath = `p2p-proofs/${order.id}/${Date.now()}.${ext}`;

      const supabase = getSupabaseClient();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(storagePath, arrayBuffer, {
          contentType: asset.mimeType ?? `image/${ext}`,
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(uploadData.path);

      const publicUrl = urlData.publicUrl;

      // Insert payment_proof message with attachment_url
      const { error: msgError } = await supabase.from('p2p_messages').insert({
        order_id:       order.id,
        sender_id:      myUserId,
        content:        `📎 Payment proof uploaded — ${order.payment_method}. Please verify and release escrow.`,
        msg_type:       'payment_proof',
        attachment_url: publicUrl,
      });

      if (msgError) throw new Error(msgError.message);

      await loadMessages();
      showAlert('Proof Uploaded', 'Your payment screenshot has been sent to the seller.');
    } catch (e: any) {
      showAlert('Upload Failed', e.message ?? 'Unknown error');
    } finally {
      setUploading(false);
    }
  }, [order, myUserId, isBuyer, loadMessages, showAlert]);

  // ── Buyer: dispute ────────────────────────────────────────────────────────
  const openDispute = useCallback(async () => {
    if (!order) return;
    showAlert('Open Dispute', 'This will flag the order for admin review. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dispute', style: 'destructive', onPress: async () => {
        setActing(true);
        try {
          const supabase = getSupabaseClient();
          await supabase.from('p2p_orders').update({ status: 'disputed' }).eq('id', order.id);
          await insertSystem(order.id, '⚠️ Trade disputed. Admin review requested. Both parties should cooperate.');
          await loadMessages();
        } catch { /* silent */ } finally {
          setActing(false);
        }
      }},
    ]);
  }, [order, insertSystem, loadMessages, showAlert]);

  if (!order) return null;

  const renderMessage = ({ item }: { item: P2PMessage }) => {
    const isMe   = item.sender_id === myUserId;
    const isSys  = item.msg_type === 'system';
    const isProof= item.msg_type === 'payment_proof';
    const time   = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isSys) {
      return (
        <View style={chat.sysMsgWrap}>
          <View style={chat.sysMsg}>
            <Text style={chat.sysMsgText}>{item.content}</Text>
            <Text style={chat.sysMsgTime}>{time}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[chat.msgWrap, isMe && chat.msgWrapMe]}>
        {!isMe && (
          <View style={chat.avatar}>
            <MaterialIcons name="person" size={13} color={Colors.primary} />
          </View>
        )}
        <View style={[chat.bubble, isMe ? chat.bubbleMe : chat.bubbleThem, isProof && chat.bubbleProof]}>
          {isProof && (
            <View style={chat.proofBadge}>
              <MaterialIcons name="receipt" size={11} color={Colors.success} />
              <Text style={chat.proofBadgeText}>Payment Proof</Text>
            </View>
          )}
          {/* Inline image thumbnail for proof messages */}
          {item.attachment_url ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setLightboxUri(item.attachment_url!)}
              style={chat.proofImageWrap}
            >
              <Image
                source={{ uri: item.attachment_url }}
                style={chat.proofImage}
                contentFit="cover"
                transition={200}
              />
              <View style={chat.proofImageOverlay}>
                <MaterialIcons name="zoom-in" size={18} color="#fff" />
                <Text style={chat.proofImageOverlayText}>Tap to expand</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          <Text style={[chat.bubbleText, isMe && { color: Colors.bg }]}>{item.content}</Text>
          <Text style={[chat.bubbleTime, isMe && { color: Colors.bg + '99' }]}>{time}</Text>
        </View>
      </View>
    );
  };

  const canBuyerAct  = isBuyer  && orderStatus === 'pending';
  const canSellerAct = isSeller && orderStatus === 'payment_sent';
  const canDispute   = (isBuyer || isSeller) && (orderStatus === 'pending' || orderStatus === 'payment_sent');
  const isCompleted  = orderStatus === 'completed' || orderStatus === 'cancelled';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={chat.overlay}>
          <View style={chat.sheet}>

            {/* Header */}
            <View style={chat.header}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={chat.headerTitle}>
                  {order.coin_symbol} · {curr ? `${curr.symbol}${order.total_fiat.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''} {order.currency}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[chat.statusPill, { backgroundColor: statusCfg.color + '18', borderColor: statusCfg.color + '44' }]}>
                    <MaterialIcons name={statusCfg.icon as any} size={10} color={statusCfg.color} />
                    <Text style={[chat.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                  </View>
                  {!isCompleted && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <LiveDot color={Colors.success} size={5} />
                      <Text style={{ fontSize: 9, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false }}>Live</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={chat.orderInfoBtn}
                onPress={() => showAlert(
                  'Order Details',
                  `ID: ${order.id.slice(0, 16)}…\nAsset: ${order.amount.toFixed(6)} ${order.coin_symbol}\nPrice: ${curr?.symbol}${order.price.toLocaleString()}\nPayment: ${order.payment_method}\nRole: ${isBuyer ? 'Buyer' : isSeller ? 'Seller' : 'Observer'}`
                )}
              >
                <MaterialIcons name="info-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Order summary strip */}
            <View style={chat.orderStrip}>
              <View style={chat.orderStripItem}>
                <Text style={chat.orderStripLabel}>Amount</Text>
                <Text style={chat.orderStripValue}>{order.amount.toFixed(6)} {order.coin_symbol}</Text>
              </View>
              <View style={chat.orderStripDivider} />
              <View style={chat.orderStripItem}>
                <Text style={chat.orderStripLabel}>Total</Text>
                <Text style={[chat.orderStripValue, { color: Colors.primary }]}>
                  {curr?.symbol}{order.total_fiat.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={chat.orderStripDivider} />
              <View style={chat.orderStripItem}>
                <Text style={chat.orderStripLabel}>Via</Text>
                <Text style={chat.orderStripValue}>{order.payment_method}</Text>
              </View>
              <View style={chat.orderStripDivider} />
              <View style={chat.orderStripItem}>
                <Text style={chat.orderStripLabel}>Role</Text>
                <Text style={[chat.orderStripValue, { color: isBuyer ? Colors.success : isSeller ? Colors.error : Colors.textMuted }]}>
                  {isBuyer ? 'Buyer' : isSeller ? 'Seller' : '—'}
                </Text>
              </View>
            </View>

            {/* Escrow action cards */}
            {canBuyerAct && (
              <View style={chat.actionCard}>
                <View style={[chat.actionCardIcon, { backgroundColor: Colors.success + '18' }]}>
                  <MaterialIcons name="send" size={18} color={Colors.success} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={chat.actionCardTitle}>Confirm Payment Sent</Text>
                  <Text style={chat.actionCardSub}>
                    Send {curr?.symbol}{order.total_fiat.toLocaleString('en-US', { maximumFractionDigits: 2 })} via {order.payment_method}, then tap confirm.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[chat.actionBtn, { backgroundColor: Colors.success }, acting && { opacity: 0.6 }]}
                  onPress={confirmPaymentSent}
                  disabled={acting}
                  activeOpacity={0.85}
                >
                  {acting ? <ActivityIndicator size="small" color={Colors.bg} /> : <Text style={chat.actionBtnText}>Confirm</Text>}
                </TouchableOpacity>
              </View>
            )}

            {canSellerAct && (
              <View style={[chat.actionCard, { borderColor: Colors.primary + '44' }]}>
                <View style={[chat.actionCardIcon, { backgroundColor: Colors.primaryGlow }]}>
                  <MaterialIcons name="lock-open" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={chat.actionCardTitle}>Release Escrow</Text>
                  <Text style={chat.actionCardSub}>
                    Buyer says payment was sent. Verify receipt, then release {order.amount.toFixed(6)} {order.coin_symbol}.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[chat.actionBtn, { backgroundColor: Colors.primary }, acting && { opacity: 0.6 }]}
                  onPress={releaseEscrow}
                  disabled={acting}
                  activeOpacity={0.85}
                >
                  {acting ? <ActivityIndicator size="small" color={Colors.bg} /> : <Text style={chat.actionBtnText}>Release</Text>}
                </TouchableOpacity>
              </View>
            )}

            {isCompleted && (
              <View style={[chat.actionCard, { borderColor: (orderStatus === 'completed' ? Colors.success : Colors.error) + '44', backgroundColor: (orderStatus === 'completed' ? Colors.successBg : Colors.errorBg) }]}>
                <MaterialIcons name={orderStatus === 'completed' ? 'check-circle' : 'cancel'} size={22} color={orderStatus === 'completed' ? Colors.success : Colors.error} />
                <Text style={[chat.actionCardTitle, { color: orderStatus === 'completed' ? Colors.success : Colors.error }]}>
                  {orderStatus === 'completed' ? 'Trade Completed Successfully' : 'Trade Cancelled'}
                </Text>
              </View>
            )}

            {/* Messages list */}
            {loading && messages.length === 0 ? (
              <View style={chat.loadingWrap}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={chat.loadingText}>Loading messages…</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={chat.emptyWrap}>
                <Text style={{ fontSize: 36 }}>💬</Text>
                <Text style={chat.emptyTitle}>Start the conversation</Text>
                <Text style={chat.emptySub}>Coordinate payment details with your trade partner here.</Text>
              </View>
            ) : (
              <FlatList
                ref={flatRef}
                data={messages}
                keyExtractor={m => m.id}
                renderItem={renderMessage}
                contentContainerStyle={chat.messageList}
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
              />
            )}

            {/* Input row */}
            {!isCompleted && (
              <View style={chat.inputRow}>
                {canDispute && (
                  <TouchableOpacity
                    style={chat.disputeBtn}
                    onPress={openDispute}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="gavel" size={18} color={Colors.warning} />
                  </TouchableOpacity>
                )}
                {/* Payment proof upload — buyer only */}
                {isBuyer && (
                  <TouchableOpacity
                    style={[chat.uploadBtn, uploading && { opacity: 0.5 }]}
                    onPress={() => !uploading && setShowAttachSheet(true)}
                    disabled={uploading}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.8}
                  >
                    {uploading
                      ? <ActivityIndicator size="small" color={Colors.success} />
                      : <MaterialIcons name="attach-file" size={18} color={Colors.success} />
                    }
                  </TouchableOpacity>
                )}
                <TextInput
                  style={chat.textInput}
                  value={msgText}
                  onChangeText={setMsgText}
                  placeholder="Type a message…"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  maxLength={500}
                  returnKeyType="default"
                />
                <TouchableOpacity
                  style={[chat.sendBtn, (!msgText.trim() || sending) && { opacity: 0.5 }]}
                  onPress={sendMessage}
                  disabled={!msgText.trim() || sending}
                  activeOpacity={0.85}
                >
                  {sending
                    ? <ActivityIndicator size="small" color={Colors.bg} />
                    : <MaterialIcons name="send" size={18} color={Colors.bg} />
                  }
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>

        {/* ── ATTACH CHOICE SHEET ────────────────────────────────────────────── */}
        {showAttachSheet && (
          <View style={chat.attachOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              onPress={() => setShowAttachSheet(false)}
              activeOpacity={1}
            />
            <View style={chat.attachSheet}>
              <View style={chat.attachSheetHandle} />
              <Text style={chat.attachSheetTitle}>Upload Payment Proof</Text>
              <Text style={chat.attachSheetSub}>Choose how to provide evidence of your payment</Text>
              <View style={chat.attachOptionsRow}>
                <TouchableOpacity
                  style={[chat.attachOption, { borderColor: Colors.primary + '55' }]}
                  onPress={() => uploadPaymentProof('camera')}
                  activeOpacity={0.85}
                >
                  <View style={[chat.attachOptionIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
                    <MaterialIcons name="camera-alt" size={26} color={Colors.primary} />
                  </View>
                  <Text style={[chat.attachOptionLabel, { color: Colors.primary }]}>Camera</Text>
                  <Text style={chat.attachOptionSub}>Take a live photo{`\n`}of your receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[chat.attachOption, { borderColor: Colors.success + '55' }]}
                  onPress={() => uploadPaymentProof('library')}
                  activeOpacity={0.85}
                >
                  <View style={[chat.attachOptionIcon, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
                    <MaterialIcons name="photo-library" size={26} color={Colors.success} />
                  </View>
                  <Text style={[chat.attachOptionLabel, { color: Colors.success }]}>Gallery</Text>
                  <Text style={chat.attachOptionSub}>Pick an existing{`\n`}screenshot</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={chat.attachCancelBtn}
                onPress={() => setShowAttachSheet(false)}
                activeOpacity={0.8}
              >
                <Text style={chat.attachCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── LIGHTBOX MODAL ─────────────────────────────────────────────────── */}
      <Modal
        visible={!!lightboxUri}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
      >
        <View style={chat.lightboxOverlay}>
          <TouchableOpacity
            style={chat.lightboxClose}
            onPress={() => setLightboxUri(null)}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {lightboxUri ? (
            <Image
              source={{ uri: lightboxUri }}
              style={chat.lightboxImage}
              contentFit="contain"
              transition={200}
            />
          ) : null}
          <View style={chat.lightboxFooter}>
            <MaterialIcons name="receipt" size={13} color={Colors.success} />
            <Text style={chat.lightboxFooterText}>Payment Proof · p2p-proofs bucket</Text>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const chat = StyleSheet.create({
  overlay:           { flex: 1, backgroundColor: 'rgba(6,6,8,0.88)', justifyContent: 'flex-end' },
  sheet:             { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '92%', minHeight: '60%', borderWidth: 1, borderColor: Colors.border, flex: 1 },

  // Header
  header:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusPill:        { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  statusPillText:    { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  orderInfoBtn:      { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },

  // Order strip
  orderStrip:        { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border, overflow: 'hidden' },
  orderStripItem:    { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  orderStripDivider: { width: 1, backgroundColor: Colors.border, alignSelf: 'stretch' },
  orderStripLabel:   { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  orderStripValue:   { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },

  // Action cards
  actionCard:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginTop: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '44', padding: Spacing.sm + 4 },
  actionCardIcon:    { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionCardTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  actionCardSub:     { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
  actionBtn:         { borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, minWidth: 72, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionBtnText:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Messages
  messageList:       { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.sm },
  loadingWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  loadingText:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  emptyWrap:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl },
  emptyTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:          { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 17, includeFontPadding: false },

  // Message bubbles
  msgWrap:           { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  msgWrapMe:         { justifyContent: 'flex-end' },
  avatar:            { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bubble:            { maxWidth: '75%', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: 3 },
  bubbleMe:          { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem:        { backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  bubbleProof:       { borderColor: Colors.success + '66', borderWidth: 1.5 },
  proofBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  proofBadgeText:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  bubbleText:        { fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, lineHeight: 18 },
  bubbleTime:        { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, alignSelf: 'flex-end' },

  // System message
  sysMsgWrap:        { alignItems: 'center', paddingVertical: 3 },
  sysMsg:            { backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm - 1, borderWidth: 1, borderColor: Colors.border, gap: 2, alignItems: 'center' },
  sysMsgText:        { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'center' },
  sysMsgTime:        { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  // Input row
  inputRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bgCard },
  disputeBtn:        { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  uploadBtn:         { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textInput:         { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false, maxHeight: 96, minHeight: 44 },
  sendBtn:           { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 7, elevation: 4 },

  // Proof image in bubble
  proofImageWrap:    { borderRadius: Radius.md, overflow: 'hidden', marginBottom: 4, position: 'relative' },
  proofImage:        { width: 200, height: 150, borderRadius: Radius.md },
  proofImageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 5 },
  proofImageOverlayText: { fontSize: 10, color: '#fff', fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Attach choice sheet
  attachOverlay:      { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 99 },
  attachSheet:        { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing.xl + 8, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  attachSheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.sm },
  attachSheetTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'center' },
  attachSheetSub:     { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, marginTop: -6 },
  attachOptionsRow:   { flexDirection: 'row', gap: Spacing.md },
  attachOption:       { flex: 1, alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1.5, paddingVertical: Spacing.lg },
  attachOptionIcon:   { width: 60, height: 60, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  attachOptionLabel:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  attachOptionSub:    { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, includeFontPadding: false },
  attachCancelBtn:    { alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.sm - 4 },
  attachCancelText:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },

  // Lightbox
  lightboxOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', alignItems: 'center', justifyContent: 'center' },
  lightboxClose:     { position: 'absolute', top: 52, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  lightboxImage:     { width: '92%', height: '70%', borderRadius: Radius.lg },
  lightboxFooter:    { position: 'absolute', bottom: 48, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.success + '55' },
  lightboxFooterText:{ fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ─── Listing Card ─────────────────────────────────────────────────────────────

function ListingCard({
  listing, myUserId, goldUSD, onTrade, onClose,
}: {
  listing: Listing; myUserId: string | null; goldUSD: number;
  onTrade: (listing: Listing) => void; onClose: (listing: Listing) => void;
}) {
  const isMine    = listing.user_id === myUserId;
  const isBuy     = listing.type === 'buy';
  const curr      = getCurrency(listing.currency);
  const typeColor = isBuy ? Colors.success : Colors.error;
  const asset     = ASSETS.find(a => a.symbol === listing.coin_symbol);
  const assetUsd  = listing.coin_symbol === 'BTNGG' ? goldUSD / 1000 : listing.coin_symbol === 'XAU' ? goldUSD : listing.coin_symbol === 'BTC' ? 65000 : listing.coin_symbol === 'ETH' ? 3200 : 1;
  const spread    = ((listing.price / curr.usdRate - assetUsd) / assetUsd) * 100;
  const isAfCFTA  = AFCFTA_COUNTRIES.includes(listing.country);
  const stars     = Math.round(listing.rating);

  return (
    <View style={[lc.card, { borderLeftColor: typeColor, borderLeftWidth: 3 }]}>
      <View style={lc.top}>
        <View style={[lc.assetBadge, { backgroundColor: (asset?.color ?? Colors.primary) + '18', borderColor: (asset?.color ?? Colors.primary) + '44' }]}>
          <Text style={{ fontSize: 16 }}>{asset?.emoji ?? '💰'}</Text>
          <Text style={[lc.assetCode, { color: asset?.color ?? Colors.primary }]}>{listing.coin_symbol}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={lc.titleRow}>
            <View style={[lc.typePill, { backgroundColor: typeColor + '18', borderColor: typeColor + '44' }]}>
              <Text style={[lc.typeText, { color: typeColor }]}>{isBuy ? 'BUY' : 'SELL'}</Text>
            </View>
            <Text style={lc.coinName}>{listing.coin_name}</Text>
            {isAfCFTA && (
              <View style={lc.afcftaSmall}>
                <MaterialIcons name="verified" size={9} color={Colors.success} />
                <Text style={lc.afcftaSmallText}>AfCFTA</Text>
              </View>
            )}
            {isMine && <View style={lc.mineBadge}><Text style={lc.mineText}>Mine</Text></View>}
          </View>
          <View style={lc.metaRow}>
            <Text style={{ fontSize: 12 }}>{curr.flag}</Text>
            <Text style={[lc.price, { color: curr.color }]}>{curr.symbol}{listing.price.toLocaleString('en-US', { maximumFractionDigits: 4 })} {listing.currency}</Text>
            <View style={[lc.spreadPill, { backgroundColor: spread >= 0 ? Colors.successBg : Colors.errorBg, borderColor: (spread >= 0 ? Colors.success : Colors.error) + '44' }]}>
              <Text style={[lc.spreadText, { color: spread >= 0 ? Colors.success : Colors.error }]}>{spread >= 0 ? '+' : ''}{spread.toFixed(2)}%</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={lc.detailGrid}>
        <View style={lc.detailCell}><Text style={lc.detailLabel}>Min</Text><Text style={lc.detailVal}>{curr.symbol}{listing.min_amount.toLocaleString()}</Text></View>
        <View style={lc.detailCell}><Text style={lc.detailLabel}>Max</Text><Text style={lc.detailVal}>{curr.symbol}{listing.max_amount.toLocaleString()}</Text></View>
        <View style={lc.detailCell}><Text style={lc.detailLabel}>Available</Text><Text style={[lc.detailVal, { color: Colors.success }]}>{listing.available_amount.toLocaleString()} {listing.coin_symbol}</Text></View>
        <View style={lc.detailCell}><Text style={lc.detailLabel}>Trades</Text><Text style={lc.detailVal}>{listing.completed_trades}</Text></View>
      </View>
      <View style={lc.ratingRow}>
        <View style={lc.starsRow}>
          {Array.from({ length: 5 }).map((_, i) => <MaterialIcons key={i} name={i < stars ? 'star' : 'star-outline'} size={12} color={i < stars ? Colors.primary : Colors.textMuted} />)}
          <Text style={lc.ratingNum}>{listing.rating.toFixed(1)}</Text>
        </View>
        <View style={lc.responseRow}><MaterialIcons name="schedule" size={10} color={Colors.textMuted} /><Text style={lc.responseText}>{listing.response_time}</Text></View>
        <View style={lc.countryRow}><MaterialIcons name="location-on" size={10} color={Colors.textMuted} /><Text style={lc.countryText}>{listing.country}</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.xs }}>
        <View style={{ flexDirection: 'row', gap: 5, paddingHorizontal: Spacing.xs }}>
          {listing.payment_methods.slice(0, 5).map(pm => (
            <View key={pm} style={lc.pmChip}><Text style={lc.pmText}>{pm}</Text></View>
          ))}
        </View>
      </ScrollView>
      {listing.terms ? <Text style={lc.terms} numberOfLines={2}>{listing.terms}</Text> : null}
      <View style={lc.actions}>
        {isMine ? (
          <TouchableOpacity style={lc.closeMineBtn} onPress={() => onClose(listing)} activeOpacity={0.8}>
            <MaterialIcons name="cancel" size={14} color={Colors.error} />
            <Text style={lc.closeMineText}>Close Listing</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[lc.tradeBtn, { backgroundColor: typeColor }]} onPress={() => onTrade(listing)} activeOpacity={0.85}>
            <MaterialIcons name={isBuy ? 'sell' : 'shopping-cart'} size={16} color={Colors.bg} />
            <Text style={lc.tradeBtnText}>{isBuy ? 'Sell to Buyer' : 'Buy from Seller'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const lc = StyleSheet.create({
  card:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, overflow: 'hidden' },
  top:           { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  assetBadge:    { width: 52, height: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0 },
  assetCode:     { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  titleRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  typePill:      { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  typeText:      { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  coinName:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  afcftaSmall:   { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '55' },
  afcftaSmallText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  mineBadge:     { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: Colors.primary + '44' },
  mineText:      { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  price:         { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  spreadPill:    { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  spreadText:    { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  detailGrid:    { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  detailCell:    { flex: 1, alignItems: 'center', paddingVertical: 7, gap: 2, borderRightWidth: 1, borderRightColor: Colors.border },
  detailLabel:   { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  detailVal:     { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  ratingRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  starsRow:      { flexDirection: 'row', alignItems: 'center', gap: 1 },
  ratingNum:     { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, marginLeft: 3, includeFontPadding: false },
  responseRow:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  responseText:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  countryRow:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  countryText:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  pmChip:        { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  pmText:        { fontSize: 9, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  terms:         { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false, fontStyle: 'italic' },
  actions:       { flexDirection: 'row', gap: Spacing.sm },
  tradeBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: Spacing.sm + 3, borderRadius: Radius.lg, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 3 },
  tradeBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  closeMineBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm + 3, borderRadius: Radius.lg, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.error + '55' },
  closeMineText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

type TabKey = 'browse' | 'post' | 'mine';

export default function BTNGAfricaP2PScreen() {
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const { user }  = useAuth();
  const { showAlert } = useAlert();
  const gold      = useGoldOracle();
  const goldUSD   = gold.priceUSD > 0 ? gold.priceUSD : 3325;
  const isLive    = gold.source === 'live';
  const statusColor = isLive ? Colors.success : Colors.warning;

  const [tab, setTab] = useState<TabKey>('browse');

  // ── Browse filters ────────────────────────────────────────────────────────
  const [filterCurr,  setFilterCurr]  = useState<string>('ALL');
  const [filterSide,  setFilterSide]  = useState<'all' | 'buy' | 'sell'>('all');
  const [filterAsset, setFilterAsset] = useState<string>('ALL');

  // ── Listings data ─────────────────────────────────────────────────────────
  const [listings,   setListings]   = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Trade flow ────────────────────────────────────────────────────────────
  const [tradeListing, setTradeListing] = useState<Listing | null>(null);
  const [tradeAmount,  setTradeAmount]  = useState('');
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);

  // ── Chat modal ────────────────────────────────────────────────────────────
  const [chatOrder,    setChatOrder]   = useState<P2POrder | null>(null);
  const [showChat,     setShowChat]    = useState(false);

  // ── Post listing form ─────────────────────────────────────────────────────
  const [postAsset,     setPostAsset]     = useState('BTNGG');
  const [postSide,      setPostSide]      = useState<'buy' | 'sell'>('sell');
  const [postCurr,      setPostCurr]      = useState('GHS');
  const [postPrice,     setPostPrice]     = useState('');
  const [postMin,       setPostMin]       = useState('');
  const [postMax,       setPostMax]       = useState('');
  const [postAvailable, setPostAvailable] = useState('');
  const [postMethods,   setPostMethods]   = useState<string[]>(['MTN MoMo', 'Bank Transfer']);
  const [postCountry,   setPostCountry]   = useState('Ghana');
  const [postTerms,     setPostTerms]     = useState('');
  const [postLoading,   setPostLoading]   = useState(false);
  const [showPostFee,   setShowPostFee]   = useState(false);

  // ── Load listings ─────────────────────────────────────────────────────────
  const loadListings = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const supabase = getSupabaseClient();
    let query = supabase
      .from('p2p_listings')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    if (filterCurr  !== 'ALL') query = query.eq('currency', filterCurr);
    if (filterSide  !== 'all') query = query.eq('type', filterSide);
    if (filterAsset !== 'ALL') query = query.eq('coin_symbol', filterAsset);
    const { data } = await query;
    if (isRefresh) setRefreshing(false); else setLoading(false);
    if (data) setListings(data as Listing[]);
  }, [filterCurr, filterSide, filterAsset]);

  const loadMyListings = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('p2p_listings').select('*').eq('user_id', (user as any).id)
      .order('created_at', { ascending: false }).limit(20);
    if (data) setMyListings(data as Listing[]);
  }, [user]);

  useEffect(() => { loadListings(); }, [filterCurr, filterSide, filterAsset]);
  useEffect(() => { if (tab === 'mine') loadMyListings(); }, [tab]);

  // ── Initiate trade ────────────────────────────────────────────────────────
  const handleTrade = useCallback((listing: Listing) => {
    if (!user) { showAlert('Login Required', 'Please sign in to trade.'); return; }
    setTradeListing(listing);
    setTradeAmount(String(listing.min_amount));
    setShowFeeModal(true);
  }, [user, showAlert]);

  // ── Open chat for an existing order ──────────────────────────────────────
  const openChatForOrder = useCallback(async (orderId: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('p2p_orders').select('*').eq('id', orderId).maybeSingle();
    if (data) {
      setChatOrder(data as P2POrder);
      setShowChat(true);
    }
  }, []);

  const confirmTrade = useCallback(async () => {
    if (!tradeListing || !user) return;
    setTradeLoading(true);
    try {
      const supabase = getSupabaseClient();
      const amount   = parseFloat(tradeAmount) || 0;
      const curr     = getCurrency(tradeListing.currency);
      const isBuying = tradeListing.type === 'sell';

      const { data: newOrder, error } = await supabase
        .from('p2p_orders')
        .insert({
          listing_id:     tradeListing.id,
          buyer_id:       isBuying ? (user as any).id : tradeListing.user_id,
          seller_id:      isBuying ? tradeListing.user_id : (user as any).id,
          coin_symbol:    tradeListing.coin_symbol,
          amount:         amount / tradeListing.price,
          price:          tradeListing.price,
          total_fiat:     amount,
          currency:       tradeListing.currency,
          payment_method: tradeListing.payment_methods[0] ?? 'Bank Transfer',
          status:         'pending',
          expires_at:     new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Insert opening system message
      if (newOrder) {
        await supabase.from('p2p_messages').insert({
          order_id:  newOrder.id,
          sender_id: (user as any).id,
          content:   `🌍 Trade initiated for ${tradeListing.coin_symbol}. ${curr.symbol}${amount.toLocaleString()} ${tradeListing.currency} via ${tradeListing.payment_methods[0] ?? 'Bank Transfer'}. Order expires in 30 min.`,
          msg_type: 'system',
        });
      }

      setShowFeeModal(false);
      setTradeListing(null);
      loadListings();

      // Open chat immediately for the new order
      if (newOrder) {
        setChatOrder(newOrder as P2POrder);
        setShowChat(true);
      }
    } catch (e: any) {
      showAlert('Trade Failed', e.message ?? 'Unknown error');
    } finally {
      setTradeLoading(false);
    }
  }, [tradeListing, user, tradeAmount, loadListings, showAlert]);

  // ── Close listing ─────────────────────────────────────────────────────────
  const handleCloseListing = useCallback((listing: Listing) => {
    showAlert('Close Listing', `Remove your ${listing.type.toUpperCase()} listing for ${listing.coin_symbol}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', style: 'destructive', onPress: async () => {
        const supabase = getSupabaseClient();
        await supabase.from('p2p_listings').update({ status: 'closed' }).eq('id', listing.id);
        loadMyListings(); loadListings();
      }},
    ]);
  }, [showAlert, loadMyListings, loadListings]);

  // ── Post listing ──────────────────────────────────────────────────────────
  const handlePostListing = useCallback(async () => {
    if (!user) { showAlert('Login Required', 'Please sign in to post a listing.'); return; }
    if (!postPrice || !postMin || !postMax || !postAvailable) { showAlert('Missing Fields', 'Please fill in all required fields.'); return; }
    setShowPostFee(true);
  }, [user, postPrice, postMin, postMax, postAvailable, showAlert]);

  const confirmPostListing = useCallback(async () => {
    setShowPostFee(false);
    setPostLoading(true);
    try {
      const supabase = getSupabaseClient();
      const asset = ASSETS.find(a => a.symbol === postAsset);
      const { error } = await supabase.from('p2p_listings').insert({
        user_id: (user as any).id, coin_symbol: postAsset, coin_name: asset?.name ?? postAsset,
        type: postSide, price: parseFloat(postPrice), currency: postCurr,
        min_amount: parseFloat(postMin), max_amount: parseFloat(postMax),
        available_amount: parseFloat(postAvailable), payment_methods: postMethods,
        status: 'open', completed_trades: 0, rating: 5.0, response_time: '< 15 min',
        country: postCountry, badge: AFCFTA_COUNTRIES.includes(postCountry) ? 'Verified' : null,
        terms: postTerms || null,
      });
      if (error) throw new Error(error.message);
      showAlert('Listing Posted!', `Your ${postSide.toUpperCase()} listing for ${postAsset} in ${postCurr} is now live.`);
      setPostPrice(''); setPostMin(''); setPostMax(''); setPostAvailable(''); setPostTerms('');
      setTab('browse'); loadListings();
    } catch (e: any) {
      showAlert('Post Failed', e.message ?? 'Unknown error');
    } finally {
      setPostLoading(false);
    }
  }, [user, postAsset, postSide, postCurr, postPrice, postMin, postMax, postAvailable, postMethods, postCountry, postTerms, loadListings, showAlert]);

  const buyCount    = listings.filter(l => l.type === 'buy').length;
  const sellCount   = listings.filter(l => l.type === 'sell').length;
  const afcftaCount = listings.filter(l => AFCFTA_COUNTRIES.includes(l.country)).length;
  const postCurrObj = getCurrency(postCurr);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>🌍 Africa P2P Market</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={statusColor} />
            <Text style={[s.topSub, { color: statusColor }]}>{listings.length} open · 11 currencies · AfCFTA</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={() => { setRefreshing(true); loadListings(true); }}
        >
          {refreshing ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={18} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      <View style={s.statsBar}>
        {[
          { label: 'Open',   value: String(listings.length), color: Colors.primary },
          { label: 'Buy',    value: String(buyCount),        color: Colors.success },
          { label: 'Sell',   value: String(sellCount),       color: Colors.error   },
          { label: 'AfCFTA', value: String(afcftaCount),     color: '#22C55E'      },
          { label: 'XAU',    value: `$${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: Colors.warning },
        ].map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <View style={s.statsDivider} />}
            <View style={s.statsItem}>
              <Text style={[s.statsVal, { color: item.color }]}>{item.value}</Text>
              <Text style={s.statsLabel}>{item.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {([
          { key: 'browse', label: 'Browse', icon: 'storefront'      },
          { key: 'post',   label: 'Post',   icon: 'add-circle'      },
          { key: 'mine',   label: 'My Ads', icon: 'manage-accounts' },
        ] as const).map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnActive]} onPress={() => setTab(t.key)} activeOpacity={0.8}>
            <MaterialIcons name={t.icon} size={14} color={tab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── BROWSE TAB ───────────────────────────────────────────────────── */}
        {tab === 'browse' && (
          <>
            <Text style={s.sectionLabel}>FILTER BY CURRENCY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.xl }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: 2 }}>
                <TouchableOpacity style={[s.currChip, filterCurr === 'ALL' && s.currChipActive]} onPress={() => setFilterCurr('ALL')} activeOpacity={0.8}>
                  <Text style={[s.currChipText, filterCurr === 'ALL' && { color: Colors.bg }]}>All</Text>
                </TouchableOpacity>
                {CURRENCIES.map(c => (
                  <TouchableOpacity key={c.code} style={[s.currChip, filterCurr === c.code && { backgroundColor: c.color, borderColor: c.color }]} onPress={() => setFilterCurr(c.code)} activeOpacity={0.8}>
                    <Text style={{ fontSize: 12 }}>{c.flag}</Text>
                    <Text style={[s.currChipText, filterCurr === c.code && { color: Colors.bg }]}>{c.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={s.filterRow}>
              <View style={s.sideToggle}>
                {(['all', 'buy', 'sell'] as const).map(side => (
                  <TouchableOpacity key={side}
                    style={[s.sideBtn, filterSide === side && s.sideBtnActive,
                      filterSide === side && side === 'buy' && { backgroundColor: Colors.success },
                      filterSide === side && side === 'sell' && { backgroundColor: Colors.error },
                    ]}
                    onPress={() => setFilterSide(side)} activeOpacity={0.8}
                  >
                    <Text style={[s.sideBtnText, filterSide === side && { color: Colors.bg }]}>{side.charAt(0).toUpperCase() + side.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  <TouchableOpacity style={[s.assetChip, filterAsset === 'ALL' && s.assetChipActive]} onPress={() => setFilterAsset('ALL')} activeOpacity={0.8}>
                    <Text style={[s.assetChipText, filterAsset === 'ALL' && { color: Colors.bg }]}>All</Text>
                  </TouchableOpacity>
                  {ASSETS.map(a => (
                    <TouchableOpacity key={a.symbol} style={[s.assetChip, filterAsset === a.symbol && { backgroundColor: a.color, borderColor: a.color }]} onPress={() => setFilterAsset(a.symbol)} activeOpacity={0.8}>
                      <Text style={{ fontSize: 11 }}>{a.emoji}</Text>
                      <Text style={[s.assetChipText, filterAsset === a.symbol && { color: Colors.bg }]}>{a.symbol}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {loading ? (
              <View style={s.loadingWrap}><ActivityIndicator color={Colors.primary} /><Text style={s.loadingText}>Loading listings…</Text></View>
            ) : listings.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={{ fontSize: 48 }}>🏪</Text>
                <Text style={s.emptyTitle}>No listings found</Text>
                <Text style={s.emptySub}>Be the first to post in this market.</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => setTab('post')} activeOpacity={0.85}>
                  <MaterialIcons name="add" size={16} color={Colors.bg} />
                  <Text style={s.emptyBtnText}>Post a Listing</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={s.resultsHeader}>
                  <Text style={s.resultsCount}>{listings.length} listing{listings.length !== 1 ? 's' : ''}</Text>
                  {filterCurr !== 'ALL' && (
                    <View style={[s.activeCurrBadge, { backgroundColor: getCurrency(filterCurr).color + '18', borderColor: getCurrency(filterCurr).color + '55' }]}>
                      <Text style={{ fontSize: 12 }}>{getCurrency(filterCurr).flag}</Text>
                      <Text style={[s.activeCurrText, { color: getCurrency(filterCurr).color }]}>{filterCurr}</Text>
                    </View>
                  )}
                </View>
                {listings.map(listing => (
                  <ListingCard key={listing.id} listing={listing} myUserId={(user as any)?.id ?? null} goldUSD={goldUSD} onTrade={handleTrade} onClose={handleCloseListing} />
                ))}
              </>
            )}
          </>
        )}

        {/* ── POST TAB ─────────────────────────────────────────────────────── */}
        {tab === 'post' && (
          <>
            <View style={s.postHero}>
              <Text style={{ fontSize: 40 }}>📝</Text>
              <Text style={s.postHeroTitle}>Post P2P Listing</Text>
              <Text style={s.postHeroSub}>Create a buy or sell listing in any of 11 African currencies. AfCFTA corridor discounts apply automatically.</Text>
            </View>

            <View style={s.formCard}>
              <Text style={s.formLabel}>ASSET TO TRADE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.xs }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xs }}>
                  {ASSETS.map(a => (
                    <TouchableOpacity key={a.symbol} style={[s.assetPickChip, postAsset === a.symbol && { backgroundColor: a.color, borderColor: a.color }]} onPress={() => setPostAsset(a.symbol)} activeOpacity={0.8}>
                      <Text style={{ fontSize: 16 }}>{a.emoji}</Text>
                      <Text style={[s.assetPickCode, postAsset === a.symbol && { color: Colors.bg }]}>{a.symbol}</Text>
                      <Text style={[s.assetPickName, postAsset === a.symbol && { color: Colors.bg + 'BB' }]}>{a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[s.formLabel, { marginTop: Spacing.sm }]}>LISTING TYPE</Text>
              <View style={s.sideToggle}>
                {(['buy', 'sell'] as const).map(side => (
                  <TouchableOpacity key={side}
                    style={[s.sideBtn, postSide === side && (side === 'buy' ? { backgroundColor: Colors.success, borderColor: Colors.success } : { backgroundColor: Colors.error, borderColor: Colors.error })]}
                    onPress={() => setPostSide(side)} activeOpacity={0.8}
                  >
                    <MaterialIcons name={side === 'buy' ? 'shopping-cart' : 'sell'} size={13} color={postSide === side ? Colors.bg : Colors.textMuted} />
                    <Text style={[s.sideBtnText, postSide === side && { color: Colors.bg }]}>{side === 'buy' ? 'I Want to Buy' : 'I Want to Sell'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.formLabel, { marginTop: Spacing.sm }]}>PAYMENT CURRENCY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.xs }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xs }}>
                  {CURRENCIES.map(c => (
                    <TouchableOpacity key={c.code} style={[s.currPickChip, postCurr === c.code && { backgroundColor: c.color, borderColor: c.color }]} onPress={() => setPostCurr(c.code)} activeOpacity={0.8}>
                      <Text style={{ fontSize: 14 }}>{c.flag}</Text>
                      <Text style={[s.currPickCode, postCurr === c.code && { color: Colors.bg }]}>{c.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={[s.currInfoRow, { borderColor: postCurrObj.color + '44', backgroundColor: postCurrObj.color + '08' }]}>
                <Text style={{ fontSize: 20 }}>{postCurrObj.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.currInfoName, { color: postCurrObj.color }]}>{postCurrObj.name}</Text>
                  <Text style={s.currInfoMeta}>{postCurrObj.region} · {(postCurrObj.corridorFee * 100).toFixed(1)}% fee{AFCFTA_COUNTRIES.includes(postCurrObj.country) ? ' · ✅ AfCFTA' : ''}</Text>
                </View>
                <Text style={[s.currInfoRate, { color: postCurrObj.color }]}>{postCurrObj.usdRate < 1 ? `$${(1 / postCurrObj.usdRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `${postCurrObj.usdRate}/USD`}</Text>
              </View>

              <Text style={[s.formLabel, { marginTop: Spacing.sm }]}>PRICE PER UNIT ({postCurrObj.symbol})</Text>
              <View style={s.inputRow}>
                <Text style={[s.inputPrefix, { color: postCurrObj.color }]}>{postCurrObj.symbol}</Text>
                <TextInput style={s.input} value={postPrice} onChangeText={setPostPrice} keyboardType="numeric" placeholder="e.g. 15.30" placeholderTextColor={Colors.textMuted} />
                <Text style={s.inputSuffix}>{postCurr} / {postAsset}</Text>
              </View>

              <View style={s.limitsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.formLabel}>MIN ({postCurrObj.symbol})</Text>
                  <View style={s.inputRow}><TextInput style={[s.input, { flex: 1 }]} value={postMin} onChangeText={setPostMin} keyboardType="numeric" placeholder="100" placeholderTextColor={Colors.textMuted} /></View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.formLabel}>MAX ({postCurrObj.symbol})</Text>
                  <View style={s.inputRow}><TextInput style={[s.input, { flex: 1 }]} value={postMax} onChangeText={setPostMax} keyboardType="numeric" placeholder="10000" placeholderTextColor={Colors.textMuted} /></View>
                </View>
              </View>

              <Text style={s.formLabel}>AVAILABLE AMOUNT ({postAsset})</Text>
              <View style={s.inputRow}>
                <TextInput style={[s.input, { flex: 1 }]} value={postAvailable} onChangeText={setPostAvailable} keyboardType="numeric" placeholder="e.g. 10.5" placeholderTextColor={Colors.textMuted} />
                <Text style={s.inputSuffix}>{postAsset}</Text>
              </View>

              <Text style={[s.formLabel, { marginTop: Spacing.sm }]}>PAYMENT METHODS</Text>
              <View style={s.methodsGrid}>
                {PAYMENT_METHODS.map(pm => {
                  const selected = postMethods.includes(pm);
                  return (
                    <TouchableOpacity key={pm} style={[s.methodChip, selected && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} onPress={() => setPostMethods(prev => selected ? prev.filter(m => m !== pm) : [...prev, pm])} activeOpacity={0.8}>
                      <Text style={[s.methodChipText, selected && { color: Colors.bg }]}>{pm}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.formLabel, { marginTop: Spacing.sm }]}>YOUR COUNTRY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.xs }}>
                <View style={{ flexDirection: 'row', gap: 5, paddingHorizontal: Spacing.xs }}>
                  {AFCFTA_COUNTRIES.slice(0, 12).map(c => (
                    <TouchableOpacity key={c} style={[s.countryChip, postCountry === c && s.countryChipActive]} onPress={() => setPostCountry(c)} activeOpacity={0.8}>
                      <Text style={[s.countryChipText, postCountry === c && { color: Colors.bg }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[s.formLabel, { marginTop: Spacing.sm }]}>TRADE TERMS (optional)</Text>
              <TextInput style={[s.input, { minHeight: 72, paddingTop: Spacing.sm, textAlignVertical: 'top' }]} value={postTerms} onChangeText={setPostTerms} multiline placeholder="e.g. Payment within 15 minutes." placeholderTextColor={Colors.textMuted} />

              {postPrice && postMin && (
                <View style={s.feePreviewMini}>
                  <MaterialIcons name="swap-calls" size={13} color={Colors.primary} />
                  <Text style={s.feePreviewMiniText}>
                    Corridor fee: {(getCurrency(postCurr).corridorFee * 100).toFixed(1)}%{AFCFTA_COUNTRIES.includes(postCountry) ? ' · AfCFTA -30%' : ''} · Effective: {(getCurrency(postCurr).corridorFee * (AFCFTA_COUNTRIES.includes(postCountry) ? 0.7 : 1) * 100).toFixed(3)}%
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={[s.postBtn, postLoading && { opacity: 0.6 }]} onPress={handlePostListing} disabled={postLoading} activeOpacity={0.85}>
              {postLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="add-circle" size={20} color={Colors.bg} />}
              <Text style={s.postBtnText}>{postLoading ? 'Posting…' : `Post ${postSide.toUpperCase()} Listing`}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── MY LISTINGS TAB ──────────────────────────────────────────────── */}
        {tab === 'mine' && (
          <>
            {!user ? (
              <View style={s.emptyWrap}><Text style={{ fontSize: 48 }}>🔒</Text><Text style={s.emptyTitle}>Login Required</Text><Text style={s.emptySub}>Please sign in to manage your listings.</Text></View>
            ) : myListings.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={{ fontSize: 48 }}>📋</Text>
                <Text style={s.emptyTitle}>No Listings Yet</Text>
                <Text style={s.emptySub}>Create one from the Post tab.</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => setTab('post')} activeOpacity={0.85}>
                  <MaterialIcons name="add" size={16} color={Colors.bg} /><Text style={s.emptyBtnText}>Post a Listing</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={s.myListingsHeader}>
                  <Text style={s.myListingsTitle}>{myListings.length} listing{myListings.length !== 1 ? 's' : ''}</Text>
                  <TouchableOpacity onPress={loadMyListings} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="refresh" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                {myListings.map(listing => (
                  <ListingCard key={listing.id} listing={listing} myUserId={(user as any)?.id ?? null} goldUSD={goldUSD} onTrade={handleTrade} onClose={handleCloseListing} />
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* ── TRADE / FEE MODAL ────────────────────────────────────────────────── */}
      <Modal visible={showFeeModal && !!tradeListing} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={() => { setShowFeeModal(false); setTradeListing(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <Text style={s.modalTitle}>Confirm Trade</Text>
                <View style={{ width: 22 }} />
              </View>
              {tradeListing && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalContent}>
                  <View style={[s.tradeListingSummary, { borderColor: (tradeListing.type === 'buy' ? Colors.success : Colors.error) + '44' }]}>
                    <View style={[s.tradeTypeLabel, { backgroundColor: (tradeListing.type === 'buy' ? Colors.success : Colors.error) + '18' }]}>
                      <Text style={[s.tradeTypeLabelText, { color: tradeListing.type === 'buy' ? Colors.success : Colors.error }]}>{tradeListing.type === 'buy' ? 'Sell to Buyer' : 'Buy from Seller'}</Text>
                    </View>
                    <Text style={s.tradeAsset}>{tradeListing.coin_symbol} at {getCurrency(tradeListing.currency).symbol}{tradeListing.price.toLocaleString()} {tradeListing.currency}</Text>
                    <Text style={s.tradeRange}>Range: {getCurrency(tradeListing.currency).symbol}{tradeListing.min_amount.toLocaleString()} – {getCurrency(tradeListing.currency).symbol}{tradeListing.max_amount.toLocaleString()}</Text>
                  </View>

                  <Text style={s.formLabel}>AMOUNT ({tradeListing.currency})</Text>
                  <View style={s.inputRow}>
                    <Text style={[s.inputPrefix, { color: getCurrency(tradeListing.currency).color }]}>{getCurrency(tradeListing.currency).symbol}</Text>
                    <TextInput style={[s.input, { flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.heavy }]} value={tradeAmount} onChangeText={setTradeAmount} keyboardType="numeric" placeholder={String(tradeListing.min_amount)} placeholderTextColor={Colors.textMuted} />
                    <Text style={s.inputSuffix}>{tradeListing.currency}</Text>
                  </View>

                  <View style={s.quickAmtRow}>
                    {[tradeListing.min_amount, tradeListing.max_amount / 4, tradeListing.max_amount / 2, tradeListing.max_amount].map(a => (
                      <TouchableOpacity key={a} style={[s.quickAmtBtn, tradeAmount === String(Math.round(a)) && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} onPress={() => setTradeAmount(String(Math.round(a)))} activeOpacity={0.8}>
                        <Text style={[s.quickAmtText, tradeAmount === String(Math.round(a)) && { color: Colors.bg }]}>{a >= 1000 ? `${(a / 1000).toFixed(0)}K` : Math.round(a)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <CorridorFeeCard
                    myCurrency={tradeListing.currency}
                    theirCurrency={tradeListing.currency}
                    amount={parseFloat(tradeAmount) || 0}
                    onConfirm={confirmTrade}
                    onCancel={() => { setShowFeeModal(false); setTradeListing(null); }}
                    confirmLabel={tradeLoading ? 'Placing Order…' : 'Confirm & Open Chat'}
                  />

                  <View style={s.payMethodInfo}>
                    <MaterialIcons name="payment" size={14} color={Colors.primary} />
                    <Text style={s.payMethodText}>Payment via: {tradeListing.payment_methods.join(', ')}</Text>
                  </View>

                  {/* Chat hint */}
                  <View style={s.chatHint}>
                    <MaterialIcons name="chat" size={14} color={Colors.primary} />
                    <Text style={s.chatHintText}>After confirming, an order chat opens so you and the {tradeListing.type === 'buy' ? 'buyer' : 'seller'} can coordinate payment and release escrow.</Text>
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── POST FEE CONFIRMATION MODAL ──────────────────────────────────────── */}
      <Modal visible={showPostFee} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowPostFee(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={s.modalTitle}>Review & Post</Text>
              <View style={{ width: 22 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalContent}>
              <View style={s.postSummaryCard}>
                <Text style={s.postSummaryTitle}>Listing Summary</Text>
                {[
                  { label: 'Asset',    value: `${ASSETS.find(a => a.symbol === postAsset)?.emoji} ${postAsset} · ${ASSETS.find(a => a.symbol === postAsset)?.name}` },
                  { label: 'Type',     value: postSide.toUpperCase(), color: postSide === 'buy' ? Colors.success : Colors.error },
                  { label: 'Currency', value: `${getCurrency(postCurr).flag} ${postCurr}` },
                  { label: 'Price',    value: `${postCurrObj.symbol}${parseFloat(postPrice || '0').toLocaleString()} / ${postAsset}`, color: Colors.primary },
                  { label: 'Min/Max',  value: `${postCurrObj.symbol}${parseFloat(postMin || '0').toLocaleString()} – ${postCurrObj.symbol}${parseFloat(postMax || '0').toLocaleString()}` },
                  { label: 'Available',value: `${parseFloat(postAvailable || '0').toLocaleString()} ${postAsset}` },
                  { label: 'Country',  value: postCountry + (AFCFTA_COUNTRIES.includes(postCountry) ? ' ✅ AfCFTA' : '') },
                  { label: 'Methods',  value: postMethods.join(', ') || 'None selected' },
                ].map(row => (
                  <View key={row.label} style={s.summaryRow}>
                    <Text style={s.summaryLabel}>{row.label}</Text>
                    <Text style={[s.summaryValue, row.color ? { color: row.color } : {}]} numberOfLines={2}>{row.value}</Text>
                  </View>
                ))}
              </View>
              <CorridorFeeCard myCurrency={postCurr} theirCurrency={postCurr} amount={parseFloat(postMin || '0')} onConfirm={confirmPostListing} onCancel={() => setShowPostFee(false)} confirmLabel="Post Listing" />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── ORDER CHAT MODAL ─────────────────────────────────────────────────── */}
      <OrderChatModal
        visible={showChat}
        order={chatOrder}
        myUserId={(user as any)?.id ?? null}
        onClose={() => { setShowChat(false); setChatOrder(null); }}
      />

    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:  { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:   { fontSize: 14, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  topSub:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },

  statsBar:    { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '44', overflow: 'hidden' },
  statsItem:   { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 1 },
  statsDivider:{ width: 1, backgroundColor: Colors.border },
  statsVal:    { fontSize: 12, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statsLabel:  { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },

  tabRow:      { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  tabBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabBtnActive:{ backgroundColor: Colors.primary },
  tabText:     { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:{ color: Colors.bg },

  scroll:       { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  sectionLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },

  currChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  currChipActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  currChipText:    { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  filterRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sideToggle:  { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 2, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  sideBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md },
  sideBtnActive: { backgroundColor: Colors.primary },
  sideBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  assetChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  assetChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  assetChipText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  resultsHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  resultsCount:    { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  activeCurrBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  activeCurrText:  { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },

  loadingWrap: { alignItems: 'center', paddingVertical: 48, gap: Spacing.md },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  emptyWrap:   { alignItems: 'center', paddingVertical: 48, gap: Spacing.md },
  emptyTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:    { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  emptyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  emptyBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  postHero:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  postHeroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  postHeroSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  formCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  formLabel:     { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  inputRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, minHeight: 50 },
  inputPrefix:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },
  input:         { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  inputSuffix:   { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, flexShrink: 0 },
  limitsRow:     { flexDirection: 'row', gap: Spacing.sm },
  currInfoRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  currInfoName:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  currInfoMeta:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  currInfoRate:  { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, flexShrink: 0 },
  methodsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  methodChip:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border },
  methodChipText:{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  feePreviewMini:{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '44' },
  feePreviewMiniText: { flex: 1, fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  postBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  postBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  assetPickChip: { alignItems: 'center', gap: 3, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border, minWidth: 70 },
  assetPickCode: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textSecondary, includeFontPadding: false },
  assetPickName: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  currPickChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border },
  currPickCode:  { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  countryChip:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  countryChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  countryChipText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },

  myListingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myListingsTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(6,6,8,0.85)', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '92%', borderWidth: 1, borderColor: Colors.border },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:    { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalContent:  { padding: Spacing.xl, gap: Spacing.md },

  tradeListingSummary: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 4 },
  tradeTypeLabel:      { borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  tradeTypeLabelText:  { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  tradeAsset:          { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tradeRange:          { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  quickAmtRow:         { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  quickAmtBtn:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  quickAmtText:        { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  payMethodInfo:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  payMethodText:       { flex: 1, fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  chatHint:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  chatHintText:  { flex: 1, fontSize: FontSize.xs, color: Colors.primary, lineHeight: 17, includeFontPadding: false },

  postSummaryCard:  { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 6 },
  postSummaryTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 4 },
  summaryRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  summaryLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, width: 70 },
  summaryValue:     { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'right' },
});
