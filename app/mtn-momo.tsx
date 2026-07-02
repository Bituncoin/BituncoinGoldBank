/**
 * app/mtn-momo.tsx
 * BTNG + MTN MoMo Africa — All-in-One Mobile Money Platform
 *
 * Covers all 54 African countries with full MTN MoMo service:
 * - Deposit (MoMo → BTNG Gold Coin / Fat Money)
 * - Withdraw (Fat Money → MoMo)
 * - P2P Transfer (user → user across Africa)
 * - Pan-Africa Remittance (cross-border)
 * - Balance & Ledger
 * - Country selector for all 54 African nations
 *
 * Engine: sdk/btng-momo-engine.js (Port 3000 + Port 8090)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Easing, ActivityIndicator, Platform,
  KeyboardAvoidingView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ─── Engine URLs ──────────────────────────────────────────────────────────────
const BANK_URL = 'http://localhost:8090';
const MOMO_URL = 'http://localhost:3000';

// ─── Africa Coverage ──────────────────────────────────────────────────────────

interface CountryInfo {
  name:        string;
  currency:    string;
  mtn:         boolean;
  phonePrefix: string;
  flag:        string;
  region:      string;
}

const AFRICA: Record<string, CountryInfo> = {
  GH: { name: 'Ghana',           currency: 'GHS', mtn: true,  phonePrefix: '+233', flag: '🇬🇭', region: 'West Africa'    },
  NG: { name: 'Nigeria',         currency: 'NGN', mtn: true,  phonePrefix: '+234', flag: '🇳🇬', region: 'West Africa'    },
  UG: { name: 'Uganda',          currency: 'UGX', mtn: true,  phonePrefix: '+256', flag: '🇺🇬', region: 'East Africa'    },
  CI: { name: 'Ivory Coast',     currency: 'XOF', mtn: true,  phonePrefix: '+225', flag: '🇨🇮', region: 'West Africa'    },
  CM: { name: 'Cameroon',        currency: 'XAF', mtn: true,  phonePrefix: '+237', flag: '🇨🇲', region: 'Central Africa' },
  RW: { name: 'Rwanda',          currency: 'RWF', mtn: true,  phonePrefix: '+250', flag: '🇷🇼', region: 'East Africa'    },
  ZM: { name: 'Zambia',          currency: 'ZMW', mtn: true,  phonePrefix: '+260', flag: '🇿🇲', region: 'Southern Africa'},
  BJ: { name: 'Benin',           currency: 'XOF', mtn: true,  phonePrefix: '+229', flag: '🇧🇯', region: 'West Africa'    },
  GN: { name: 'Guinea',          currency: 'GNF', mtn: true,  phonePrefix: '+224', flag: '🇬🇳', region: 'West Africa'    },
  CG: { name: 'Congo',           currency: 'XAF', mtn: true,  phonePrefix: '+242', flag: '🇨🇬', region: 'Central Africa' },
  ZA: { name: 'South Africa',    currency: 'ZAR', mtn: true,  phonePrefix: '+27',  flag: '🇿🇦', region: 'Southern Africa'},
  LR: { name: 'Liberia',         currency: 'LRD', mtn: true,  phonePrefix: '+231', flag: '🇱🇷', region: 'West Africa'    },
  GW: { name: 'Guinea-Bissau',   currency: 'XOF', mtn: true,  phonePrefix: '+245', flag: '🇬🇼', region: 'West Africa'    },
  MZ: { name: 'Mozambique',      currency: 'MZN', mtn: true,  phonePrefix: '+258', flag: '🇲🇿', region: 'Southern Africa'},
  MG: { name: 'Madagascar',      currency: 'MGA', mtn: true,  phonePrefix: '+261', flag: '🇲🇬', region: 'East Africa'    },
  BF: { name: 'Burkina Faso',    currency: 'XOF', mtn: true,  phonePrefix: '+226', flag: '🇧🇫', region: 'West Africa'    },
  ML: { name: 'Mali',            currency: 'XOF', mtn: true,  phonePrefix: '+223', flag: '🇲🇱', region: 'West Africa'    },
  SS: { name: 'South Sudan',     currency: 'SSP', mtn: true,  phonePrefix: '+211', flag: '🇸🇸', region: 'East Africa'    },
  KE: { name: 'Kenya',           currency: 'KES', mtn: false, phonePrefix: '+254', flag: '🇰🇪', region: 'East Africa'    },
  TZ: { name: 'Tanzania',        currency: 'TZS', mtn: false, phonePrefix: '+255', flag: '🇹🇿', region: 'East Africa'    },
  ET: { name: 'Ethiopia',        currency: 'ETB', mtn: false, phonePrefix: '+251', flag: '🇪🇹', region: 'East Africa'    },
  SN: { name: 'Senegal',         currency: 'XOF', mtn: false, phonePrefix: '+221', flag: '🇸🇳', region: 'West Africa'    },
  EG: { name: 'Egypt',           currency: 'EGP', mtn: false, phonePrefix: '+20',  flag: '🇪🇬', region: 'North Africa'  },
  TN: { name: 'Tunisia',         currency: 'TND', mtn: false, phonePrefix: '+216', flag: '🇹🇳', region: 'North Africa'  },
  MA: { name: 'Morocco',         currency: 'MAD', mtn: false, phonePrefix: '+212', flag: '🇲🇦', region: 'North Africa'  },
  AO: { name: 'Angola',          currency: 'AOA', mtn: false, phonePrefix: '+244', flag: '🇦🇴', region: 'Southern Africa'},
  ZW: { name: 'Zimbabwe',        currency: 'ZWL', mtn: false, phonePrefix: '+263', flag: '🇿🇼', region: 'Southern Africa'},
  NA: { name: 'Namibia',         currency: 'NAD', mtn: false, phonePrefix: '+264', flag: '🇳🇦', region: 'Southern Africa'},
  BW: { name: 'Botswana',        currency: 'BWP', mtn: false, phonePrefix: '+267', flag: '🇧🇼', region: 'Southern Africa'},
  LS: { name: 'Lesotho',         currency: 'LSL', mtn: false, phonePrefix: '+266', flag: '🇱🇸', region: 'Southern Africa'},
  SZ: { name: 'Eswatini',        currency: 'SZL', mtn: false, phonePrefix: '+268', flag: '🇸🇿', region: 'Southern Africa'},
  MW: { name: 'Malawi',          currency: 'MWK', mtn: false, phonePrefix: '+265', flag: '🇲🇼', region: 'Southern Africa'},
  TG: { name: 'Togo',            currency: 'XOF', mtn: false, phonePrefix: '+228', flag: '🇹🇬', region: 'West Africa'    },
  NE: { name: 'Niger',           currency: 'XOF', mtn: false, phonePrefix: '+227', flag: '🇳🇪', region: 'West Africa'    },
  TD: { name: 'Chad',            currency: 'XAF', mtn: false, phonePrefix: '+235', flag: '🇹🇩', region: 'Central Africa' },
  CF: { name: 'Cent. African',   currency: 'XAF', mtn: false, phonePrefix: '+236', flag: '🇨🇫', region: 'Central Africa' },
  GA: { name: 'Gabon',           currency: 'XAF', mtn: false, phonePrefix: '+241', flag: '🇬🇦', region: 'Central Africa' },
  GQ: { name: 'Equatorial G.',   currency: 'XAF', mtn: false, phonePrefix: '+240', flag: '🇬🇶', region: 'Central Africa' },
  CV: { name: 'Cape Verde',      currency: 'CVE', mtn: false, phonePrefix: '+238', flag: '🇨🇻', region: 'West Africa'    },
  GM: { name: 'Gambia',          currency: 'GMD', mtn: false, phonePrefix: '+220', flag: '🇬🇲', region: 'West Africa'    },
  SL: { name: 'Sierra Leone',    currency: 'SLL', mtn: false, phonePrefix: '+232', flag: '🇸🇱', region: 'West Africa'    },
  MR: { name: 'Mauritania',      currency: 'MRU', mtn: false, phonePrefix: '+222', flag: '🇲🇷', region: 'West Africa'    },
  DZ: { name: 'Algeria',         currency: 'DZD', mtn: false, phonePrefix: '+213', flag: '🇩🇿', region: 'North Africa'  },
  LY: { name: 'Libya',           currency: 'LYD', mtn: false, phonePrefix: '+218', flag: '🇱🇾', region: 'North Africa'  },
  SD: { name: 'Sudan',           currency: 'SDG', mtn: false, phonePrefix: '+249', flag: '🇸🇩', region: 'North Africa'  },
  SO: { name: 'Somalia',         currency: 'SOS', mtn: false, phonePrefix: '+252', flag: '🇸🇴', region: 'East Africa'    },
  DJ: { name: 'Djibouti',        currency: 'DJF', mtn: false, phonePrefix: '+253', flag: '🇩🇯', region: 'East Africa'    },
  ER: { name: 'Eritrea',         currency: 'ERN', mtn: false, phonePrefix: '+291', flag: '🇪🇷', region: 'East Africa'    },
  KM: { name: 'Comoros',         currency: 'KMF', mtn: false, phonePrefix: '+269', flag: '🇰🇲', region: 'East Africa'    },
  MU: { name: 'Mauritius',       currency: 'MUR', mtn: false, phonePrefix: '+230', flag: '🇲🇺', region: 'East Africa'    },
  SC: { name: 'Seychelles',      currency: 'SCR', mtn: false, phonePrefix: '+248', flag: '🇸🇨', region: 'East Africa'    },
};

const MTN_COUNTRIES = Object.entries(AFRICA).filter(([, v]) => v.mtn);
const ALL_COUNTRIES  = Object.entries(AFRICA);

type TabType = 'deposit' | 'withdraw' | 'transfer' | 'remittance' | 'balance' | 'coverage';

// ─── Live Dot ─────────────────────────────────────────────────────────────────
function LiveDot({ color = '#22C55E', size = 6 }: { color?: string; size?: number }) {
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
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.3, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Country Picker Modal ─────────────────────────────────────────────────────
function CountryPicker({
  visible,
  onSelect,
  onClose,
  mtnOnly = false,
  title = 'Select Country',
}: {
  visible:  boolean;
  onSelect: (code: string, info: CountryInfo) => void;
  onClose:  () => void;
  mtnOnly?: boolean;
  title?:   string;
}) {
  const [search, setSearch] = useState('');
  const entries = (mtnOnly ? MTN_COUNTRIES : ALL_COUNTRIES)
    .filter(([code, info]) =>
      info.name.toLowerCase().includes(search.toLowerCase()) ||
      code.toLowerCase().includes(search.toLowerCase()) ||
      info.currency.toLowerCase().includes(search.toLowerCase())
    );

  if (!visible) return null;

  return (
    <View style={cp.overlay}>
      <View style={cp.modal}>
        <View style={cp.header}>
          <Text style={cp.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={cp.searchRow}>
          <MaterialIcons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={cp.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search country or currency…"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
        </View>
        {mtnOnly && (
          <View style={cp.mtnBadge}>
            <Text style={cp.mtnBadgeText}>Showing {MTN_COUNTRIES.length} active MTN MoMo markets</Text>
          </View>
        )}
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
          {entries.map(([code, info]) => (
            <TouchableOpacity
              key={code}
              style={[cp.row, info.mtn && cp.rowMtn]}
              onPress={() => { onSelect(code, info); onClose(); setSearch(''); }}
              activeOpacity={0.8}
            >
              <Text style={cp.flag}>{info.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={cp.countryName}>{info.name}</Text>
                <Text style={cp.countryDetail}>{code} · {info.currency} · {info.phonePrefix}</Text>
              </View>
              {info.mtn ? (
                <View style={cp.mtnChip}>
                  <LiveDot color="#FFD700" size={4} />
                  <Text style={cp.mtnChipText}>MTN</Text>
                </View>
              ) : (
                <View style={cp.partnerChip}>
                  <Text style={cp.partnerChipText}>Partner</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const cp = StyleSheet.create({
  overlay:       { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, justifyContent: 'flex-end' },
  modal:         { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, paddingBottom: Spacing.xxl, maxHeight: '85%' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  title:         { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  searchRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  searchInput:   { flex: 1, height: 44, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  mtnBadge:      { backgroundColor: '#FFD70018', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#FFD70033' },
  mtnBadgeText:  { fontSize: FontSize.xs, color: '#FFD700', fontWeight: FontWeight.semibold, includeFontPadding: false },
  row:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 12, paddingHorizontal: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '33', borderRadius: Radius.md },
  rowMtn:        { backgroundColor: '#FFD70006' },
  flag:          { fontSize: 26, width: 36, textAlign: 'center' },
  countryName:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  countryDetail: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  mtnChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFD70018', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FFD70044' },
  mtnChipText:   { fontSize: 9, fontWeight: FontWeight.heavy, color: '#FFD700', includeFontPadding: false },
  partnerChip:   { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  partnerChipText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ─── Result Banner ────────────────────────────────────────────────────────────
function ResultBanner({ result, onClear }: { result: { ok: boolean; msg: string; detail?: string } | null; onClear: () => void }) {
  if (!result) return null;
  return (
    <View style={[rb.strip, { backgroundColor: result.ok ? '#22C55E10' : '#EF444410', borderColor: result.ok ? '#22C55E44' : '#EF444444' }]}>
      <MaterialIcons name={result.ok ? 'check-circle' : 'error-outline'} size={16} color={result.ok ? '#22C55E' : '#EF4444'} />
      <View style={{ flex: 1 }}>
        <Text style={[rb.msg, { color: result.ok ? '#22C55E' : '#EF4444' }]}>{result.msg}</Text>
        {result.detail ? <Text style={rb.detail}>{result.detail}</Text> : null}
      </View>
      <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name="close" size={14} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const rb = StyleSheet.create({
  strip:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1 },
  msg:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  detail: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false, marginTop: 2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MTNMoMoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab,    setActiveTab]    = useState<TabType>('deposit');
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState<{ ok: boolean; msg: string; detail?: string } | null>(null);
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);
  const [momoOnline,   setMomoOnline]   = useState<boolean | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [userId,     setUserId]     = useState('');
  const [phone,      setPhone]      = useState('');
  const [amount,     setAmount]     = useState('');
  const [toUserId,   setToUserId]   = useState('');
  const [recipPhone, setRecipPhone] = useState('');
  const [fromCountry, setFromCountry] = useState('GH');
  const [toCountry,   setToCountry]   = useState('NG');
  const [balanceData,  setBalanceData] = useState<any>(null);

  // ── Country picker state ────────────────────────────────────────────────────
  const [pickerVisible, setPickerVisible]    = useState(false);
  const [pickerTarget,  setPickerTarget]     = useState<'from' | 'to'>('from');
  const [pickerMtnOnly, setPickerMtnOnly]    = useState(false);

  // ── Deposit status polling ──────────────────────────────────────────────────
  const [pendingRef,    setPendingRef]    = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // ── Simulate Callback ────────────────────────────────────────────────────────
  const [simLoading,    setSimLoading]    = useState(false);
  const [simKey,        setSimKey]        = useState('sandbox-collection-key');
  const [simKeyVisible, setSimKeyVisible] = useState(false);

  const fromInfo = AFRICA[fromCountry] ?? AFRICA.GH;
  const toInfo   = AFRICA[toCountry]   ?? AFRICA.NG;

  // ── Check engine health on mount ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [bankRes, momoRes] = await Promise.all([
          fetch(`${BANK_URL}/api/health`, { signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined }).catch(() => null),
          fetch(`${MOMO_URL}/api/health`, { signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined }).catch(() => null),
        ]);
        setEngineOnline(bankRes?.ok ?? false);
        setMomoOnline(momoRes?.ok ?? false);
      } catch {
        setEngineOnline(false);
        setMomoOnline(false);
      }
    })();
  }, []);

  const openPicker = (target: 'from' | 'to', mtnOnly = false) => {
    setPickerTarget(target);
    setPickerMtnOnly(mtnOnly);
    setPickerVisible(true);
  };

  const handlePickerSelect = (code: string, info: CountryInfo) => {
    if (pickerTarget === 'from') {
      setFromCountry(code);
    } else {
      setToCountry(code);
    }
  };

  // ── API Calls ────────────────────────────────────────────────────────────────
  const callEngine = async (path: string, method: 'GET' | 'POST', body?: any) => {
    const url = `${BANK_URL}${path}`;
    const opts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  // ── Deposit ──────────────────────────────────────────────────────────────────
  const handleDeposit = async () => {
    if (!userId.trim() || !phone.trim() || !amount.trim()) {
      setResult({ ok: false, msg: 'All fields required', detail: 'Enter User ID, phone, and amount.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { ok, data } = await callEngine('/wallet/deposit', 'POST', {
        userId:   userId.trim(),
        phone:    phone.trim(),
        amount:   parseFloat(amount),
        currency: fromInfo.currency,
        country:  fromCountry,
      });

      if (ok) {
        setPendingRef(data.providerRef);
        setResult({
          ok:     true,
          msg:    `Deposit initiated — ${data.amount} ${data.currency}`,
          detail: `Ref: ${data.providerRef} · ${data.countryName} · Status: PENDING\nTap "Check Status" to confirm.`,
        });
      } else {
        setResult({ ok: false, msg: data.error ?? 'Deposit failed', detail: `HTTP ${data.status ?? ''}` });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: 'Engine offline', detail: 'Start the engine: node sdk/btng-momo-engine.js' });
    } finally {
      setLoading(false);
    }
  };

  // ── Simulate MTN Webhook Callback ──────────────────────────────────────────────
  const handleSimulateCallback = async () => {
    if (!pendingRef) return;
    setSimLoading(true);
    setResult(null);
    try {
      const payload = {
        financialTransactionId: `SIM-${Date.now().toString(36).toUpperCase()}`,
        externalId:             userId.trim() || pendingRef,
        amount:                 amount.trim() || '1',
        currency:               fromInfo.currency,
        payer: { partyIdType: 'MSISDN', partyId: phone.trim() || '0000000000' },
        payerMessage: 'BTNG Simulated Deposit',
        payeeNote:    'Simulate Callback Test',
        status:       'SUCCESSFUL',
        reason:       '',
      };

      const bodyStr = JSON.stringify(payload);

      // Compute HMAC-SHA256 via Web Crypto API (available in Hermes / modern RN)
      let signature = '';
      try {
        const keyMaterial = await (globalThis as any).crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(simKey || 'sandbox-collection-key'),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
        const sigBuf = await (globalThis as any).crypto.subtle.sign(
          'HMAC',
          keyMaterial,
          new TextEncoder().encode(bodyStr),
        );
        // base64-encode the raw HMAC bytes
        signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
      } catch {
        // Web Crypto unavailable — sandbox mode accepts requests without a signature
        signature = '';
      }

      const headers: Record<string, string> = {
        'Content-Type':         'application/json',
        'Accept':               'application/json',
        'X-Reference-Id':       pendingRef,
        'X-Target-Environment': 'sandbox',
      };
      if (signature) headers['X-Callback-Signature'] = signature;

      const res  = await fetch(`${MOMO_URL}/webhook/momo`, {
        method:  'POST',
        headers,
        body:    bodyStr,
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setResult({
          ok:     true,
          msg:    data.credited
            ? 'Callback simulated — fat money credited!'
            : 'Callback accepted — not credited (userId mismatch?)',
          detail: `Webhook ID: ${data.webhookId ?? '—'} · Status: ${data.status ?? 'SUCCESSFUL'}` +
                  (data.credited ? `\nCredited userId: ${userId.trim()}` : '') +
                  (signature ? `\nSig: ${signature.slice(0, 22)}…` : '\nSig: sandbox-bypass'),
        });
        if (data.credited) setPendingRef(null);
      } else {
        setResult({ ok: false, msg: `Callback rejected — ${data?.error ?? `HTTP ${res.status}`}`, detail: JSON.stringify(data).slice(0, 120) });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: 'Failed to send callback', detail: e?.message ?? 'MoMo host offline? Start: node sdk/btng-momo-engine.js' });
    } finally {
      setSimLoading(false);
    }
  };

  // ── Deposit Status ────────────────────────────────────────────────────────────
  const handleDepositStatus = async () => {
    if (!pendingRef) return;
    setStatusLoading(true);
    try {
      const { ok, data } = await callEngine(`/wallet/deposit/status?providerRef=${pendingRef}`, 'GET');
      if (ok) {
        setResult({
          ok:     data.momoStatus === 'SUCCESSFUL',
          msg:    `Status: ${data.momoStatus}`,
          detail: `Fat Money: ${data.fatMoneyFmt ?? data.fatMoney + ' BTNGG'}\nRef: ${pendingRef}`,
        });
        if (data.momoStatus === 'SUCCESSFUL') setPendingRef(null);
      } else {
        setResult({ ok: false, msg: data.error ?? 'Status check failed' });
      }
    } catch {
      setResult({ ok: false, msg: 'Engine offline' });
    } finally {
      setStatusLoading(false);
    }
  };

  // ── Withdraw ──────────────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    if (!userId.trim() || !phone.trim() || !amount.trim()) {
      setResult({ ok: false, msg: 'All fields required' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { ok, data } = await callEngine('/wallet/withdraw', 'POST', {
        userId:   userId.trim(),
        phone:    phone.trim(),
        amount:   parseFloat(amount),
        currency: fromInfo.currency,
        country:  fromCountry,
      });
      if (ok) {
        setResult({
          ok:     true,
          msg:    `Withdrawal initiated — ${data.amount} ${data.currency}`,
          detail: `Ref: ${data.providerRef} · Fat Money: ${data.fatMoneyFmt ?? data.fatMoney + ' BTNGG'}`,
        });
      } else {
        setResult({
          ok:     false,
          msg:    data.error ?? 'Withdrawal failed',
          detail: data.available ? `Available: ${Number(data.available).toFixed(4)} BTNGG` : undefined,
        });
      }
    } catch {
      setResult({ ok: false, msg: 'Engine offline', detail: 'Start: node sdk/btng-momo-engine.js' });
    } finally {
      setLoading(false);
    }
  };

  // ── Transfer ──────────────────────────────────────────────────────────────────
  const handleTransfer = async () => {
    if (!userId.trim() || !toUserId.trim() || !amount.trim()) {
      setResult({ ok: false, msg: 'All fields required' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { ok, data } = await callEngine('/wallet/transfer', 'POST', {
        fromUserId: userId.trim(),
        toUserId:   toUserId.trim(),
        amount:     parseFloat(amount),
        currency:   fromInfo.currency,
        country:    fromCountry,
      });
      if (ok) {
        setResult({
          ok:     true,
          msg:    `Transfer complete — ${data.amount} ${data.currency}`,
          detail: `Ref: ${data.txRef}\nYour balance: ${Number(data.fromBalance).toFixed(4)} BTNGG`,
        });
      } else {
        setResult({ ok: false, msg: data.error ?? 'Transfer failed', detail: data.available ? `You have: ${Number(data.available).toFixed(4)} BTNGG` : undefined });
      }
    } catch {
      setResult({ ok: false, msg: 'Engine offline' });
    } finally {
      setLoading(false);
    }
  };

  // ── Remittance ────────────────────────────────────────────────────────────────
  const handleRemittance = async () => {
    if (!userId.trim() || !recipPhone.trim() || !amount.trim()) {
      setResult({ ok: false, msg: 'All fields required' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { ok, data } = await callEngine('/wallet/remittance', 'POST', {
        userId:         userId.trim(),
        recipientPhone: recipPhone.trim(),
        amount:         parseFloat(amount),
        fromCountry,
        toCountry,
        currency:       fromInfo.currency,
      });
      if (ok) {
        setResult({
          ok:     true,
          msg:    `Remittance sent — ${data.amount} ${data.currency}`,
          detail: `${data.fromCountryName} → ${data.toCountryName}\nRef: ${data.providerRef}\nFat Money: ${Number(data.fatMoney).toFixed(4)} BTNGG`,
        });
      } else {
        setResult({ ok: false, msg: data.error ?? 'Remittance failed' });
      }
    } catch {
      setResult({ ok: false, msg: 'Engine offline' });
    } finally {
      setLoading(false);
    }
  };

  // ── Balance ───────────────────────────────────────────────────────────────────
  const handleBalance = async () => {
    if (!userId.trim()) {
      setResult({ ok: false, msg: 'User ID required' });
      return;
    }
    setLoading(true);
    setResult(null);
    setBalanceData(null);
    try {
      const { ok, data } = await callEngine(`/wallet/balance?userId=${encodeURIComponent(userId.trim())}`, 'GET');
      if (ok) {
        setBalanceData(data);
        setResult({ ok: true, msg: `Balance: ${data.fatMoneyFmt}`, detail: `${data.ledgerItems} transaction(s) on record` });
      } else {
        setResult({ ok: false, msg: data.error ?? 'Balance check failed' });
      }
    } catch {
      setResult({ ok: false, msg: 'Engine offline' });
    } finally {
      setLoading(false);
    }
  };

  // ── Tabs config ───────────────────────────────────────────────────────────────
  const TABS: { id: TabType; label: string; icon: string; color: string }[] = [
    { id: 'deposit',    label: 'Deposit',    icon: 'arrow-downward', color: '#22C55E' },
    { id: 'withdraw',   label: 'Withdraw',   icon: 'arrow-upward',   color: '#EF4444' },
    { id: 'transfer',   label: 'Transfer',   icon: 'swap-horiz',     color: '#3B82F6' },
    { id: 'remittance', label: 'Remit',      icon: 'send',           color: '#8B5CF6' },
    { id: 'balance',    label: 'Balance',    icon: 'account-balance', color: '#F59E0B' },
    { id: 'coverage',   label: 'Coverage',   icon: 'public',         color: '#D4A017' },
  ];

  const activeTabConfig = TABS.find(t => t.id === activeTab)!;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Country Picker */}
      <CountryPicker
        visible={pickerVisible}
        onSelect={handlePickerSelect}
        onClose={() => setPickerVisible(false)}
        mtnOnly={pickerMtnOnly}
        title={pickerTarget === 'from' ? 'From Country' : 'To Country'}
      />

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={s.topCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.topTitle}>MTN MoMo · Africa</Text>
            <Text style={{ fontSize: 18 }}>🌍</Text>
          </View>
          <Text style={s.topSub}>54 Countries · BTNG Fat Money Engine</Text>
        </View>

        {/* Engine status pill */}
        <View style={[s.statusPill, { borderColor: engineOnline ? '#22C55E44' : '#EF444444', backgroundColor: engineOnline ? '#22C55E10' : '#EF444410' }]}>
          {engineOnline === null
            ? <ActivityIndicator size="small" color={Colors.textMuted} />
            : engineOnline
            ? <LiveDot color="#22C55E" size={5} />
            : <MaterialIcons name="cancel" size={12} color="#EF4444" />}
          <Text style={[s.statusPillText, { color: engineOnline ? '#22C55E' : engineOnline === null ? Colors.textMuted : '#EF4444' }]}>
            {engineOnline === null ? '…' : engineOnline ? 'LIVE' : 'OFF'}
          </Text>
        </View>
      </View>

      {/* ── Hero Banner ────────────────────────────────────────────────────── */}
      <View style={s.heroBanner}>
        <View style={s.heroLeft}>
          <Text style={s.heroTitle}>BTNG Fat Money</Text>
          <Text style={s.heroSub}>MTN MoMo ↔ BTNG Gold Coin · Pan-Africa</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <View style={[s.heroBadge, { backgroundColor: '#FFD70018', borderColor: '#FFD70044' }]}>
              <LiveDot color="#FFD700" size={4} />
              <Text style={[s.heroBadgeText, { color: '#FFD700' }]}>{MTN_COUNTRIES.length} MTN Markets</Text>
            </View>
            <View style={[s.heroBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.border }]}>
              <Text style={[s.heroBadgeText, { color: Colors.primary }]}>54 Countries</Text>
            </View>
            <View style={[s.heroBadge, { backgroundColor: momoOnline ? '#22C55E10' : '#EF444410', borderColor: momoOnline ? '#22C55E44' : '#EF444444' }]}>
              <Text style={[s.heroBadgeText, { color: momoOnline ? '#22C55E' : '#EF4444' }]}>
                MoMo Host {momoOnline ? 'UP' : momoOnline === null ? '…' : 'DOWN'}
              </Text>
            </View>
          </View>
        </View>
        <View style={s.heroRight}>
          <Text style={{ fontSize: 48 }}>💛</Text>
          <Text style={s.heroCoinText}>BTNGG</Text>
        </View>
      </View>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabScrollContent}>
        {TABS.map(tab => {
          const active = tab.id === activeTab;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                s.tab,
                active && { backgroundColor: tab.color + '18', borderColor: tab.color + '55' },
              ]}
              onPress={() => { setActiveTab(tab.id); setResult(null); }}
              activeOpacity={0.8}
            >
              <MaterialIcons name={tab.icon as any} size={14} color={active ? tab.color : Colors.textMuted} />
              <Text style={[s.tabText, active && { color: tab.color, fontWeight: FontWeight.heavy }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        >

          {/* ── Result Banner ──────────────────────────────────────────────── */}
          <ResultBanner result={result} onClear={() => setResult(null)} />

          {/* ── DEPOSIT TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'deposit' && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                  <MaterialIcons name="arrow-downward" size={20} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>MoMo → Fat Money Deposit</Text>
                  <Text style={s.cardSub}>Collect from MTN MoMo → credit BTNG Gold Coin</Text>
                </View>
              </View>

              {/* Country selector */}
              <TouchableOpacity style={s.countrySelector} onPress={() => openPicker('from', true)} activeOpacity={0.8}>
                <Text style={s.countrySelectorFlag}>{fromInfo.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.countrySelectorName}>{fromInfo.name}</Text>
                  <Text style={s.countrySelectorDetail}>{fromCountry} · {fromInfo.currency} · {fromInfo.phonePrefix}</Text>
                </View>
                {fromInfo.mtn ? (
                  <View style={s.mtnBadge}>
                    <LiveDot color="#FFD700" size={4} />
                    <Text style={s.mtnBadgeText}>MTN MoMo</Text>
                  </View>
                ) : null}
                <MaterialIcons name="expand-more" size={20} color={Colors.textMuted} />
              </TouchableOpacity>

              <TextInput style={s.input} value={userId} onChangeText={setUserId} placeholder="User ID (e.g. john_doe_001)" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
              <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder={`Phone (${fromInfo.phonePrefix} …)`} placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
              <TextInput style={s.input} value={amount} onChangeText={setAmount} placeholder={`Amount in ${fromInfo.currency}`} placeholderTextColor={Colors.textMuted} keyboardType="numeric" />

              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#22C55E18', borderColor: '#22C55E55' }, (loading || !userId.trim() || !phone.trim() || !amount.trim()) && { opacity: 0.5 }]}
                onPress={handleDeposit}
                disabled={loading || !userId.trim() || !phone.trim() || !amount.trim()}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator size="small" color="#22C55E" /> : <MaterialIcons name="arrow-downward" size={18} color="#22C55E" />}
                <Text style={[s.btnText, { color: '#22C55E' }]}>{loading ? 'Initiating…' : 'Initiate Deposit'}</Text>
              </TouchableOpacity>

              {pendingRef ? (
                <>
                  {/* Status poll button */}
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: '#3B82F618', borderColor: '#3B82F655' }, statusLoading && { opacity: 0.5 }]}
                    onPress={handleDepositStatus}
                    disabled={statusLoading}
                    activeOpacity={0.85}
                  >
                    {statusLoading ? <ActivityIndicator size="small" color="#3B82F6" /> : <MaterialIcons name="sync" size={18} color="#3B82F6" />}
                    <Text style={[s.btnText, { color: '#3B82F6' }]}>{statusLoading ? 'Checking…' : 'Check Deposit Status'}</Text>
                  </TouchableOpacity>

                  {/* ── Simulate Callback card ── */}
                  <View style={s.simCard}>
                    {/* Header */}
                    <View style={s.simHeader}>
                      <View style={s.simIconWrap}>
                        <MaterialIcons name="science" size={16} color="#8B5CF6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.simTitle}>Simulate MTN Callback</Text>
                        <Text style={s.simSub}>POSTs SUCCESSFUL webhook → port 3000 — triggers auto-credit end-to-end</Text>
                      </View>
                      <View style={s.simBadge}>
                        <Text style={s.simBadgeText}>SANDBOX</Text>
                      </View>
                    </View>

                    {/* X-Reference-Id strip */}
                    <View style={s.simRefRow}>
                      <MaterialIcons name="receipt" size={10} color="#8B5CF6" />
                      <Text style={s.simRefText} numberOfLines={1} selectable>X-Reference-Id: {pendingRef}</Text>
                    </View>

                    {/* Signing key */}
                    <Text style={s.simKeyLabel}>Signing Key (MTN subscription key)</Text>
                    <View style={s.simKeyRow}>
                      <TextInput
                        style={s.simKeyInput}
                        value={simKey}
                        onChangeText={setSimKey}
                        placeholder="sandbox-collection-key"
                        placeholderTextColor={Colors.textMuted}
                        secureTextEntry={!simKeyVisible}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        onPress={() => setSimKeyVisible(v => !v)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ padding: 6 }}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name={simKeyVisible ? 'visibility-off' : 'visibility'} size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSimKey('sandbox-collection-key')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ padding: 6 }}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="refresh" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    {/* Payload preview */}
                    <View style={s.simPayloadBox}>
                      <Text style={s.simPayloadLabel}>PAYLOAD PREVIEW</Text>
                      <Text style={s.simPayloadText} selectable>
                        {`{\n  "status": "SUCCESSFUL",\n  "externalId": "${userId.trim() || pendingRef}",\n  "amount": "${amount.trim() || '1'}",\n  "currency": "${fromInfo.currency}",\n  "X-Reference-Id": "${pendingRef}"\n}`}
                      </Text>
                    </View>

                    {/* Simulate button */}
                    <TouchableOpacity
                      style={[s.simBtn, simLoading && { opacity: 0.5 }]}
                      onPress={handleSimulateCallback}
                      disabled={simLoading}
                      activeOpacity={0.85}
                    >
                      {simLoading
                        ? <ActivityIndicator size="small" color="#8B5CF6" />
                        : <MaterialIcons name="send" size={16} color="#8B5CF6" />}
                      <Text style={s.simBtnText}>
                        {simLoading ? 'Sending callback…' : 'Send Simulated SUCCESSFUL Callback'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              <View style={s.infoBox}>
                <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
                <Text style={s.infoText}>
                  On SUCCESSFUL payment, your Fat Money (BTNGG) balance is credited instantly. Engine must be running on port 8090.
                </Text>
              </View>
            </View>
          )}

          {/* ── WITHDRAW TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'withdraw' && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: '#EF444418', borderColor: '#EF444444' }]}>
                  <MaterialIcons name="arrow-upward" size={20} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Fat Money → MoMo Withdraw</Text>
                  <Text style={s.cardSub}>Cash out BTNG Gold Coin to MTN MoMo wallet</Text>
                </View>
              </View>

              <TouchableOpacity style={s.countrySelector} onPress={() => openPicker('from', true)} activeOpacity={0.8}>
                <Text style={s.countrySelectorFlag}>{fromInfo.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.countrySelectorName}>{fromInfo.name}</Text>
                  <Text style={s.countrySelectorDetail}>{fromCountry} · {fromInfo.currency} · {fromInfo.phonePrefix}</Text>
                </View>
                {fromInfo.mtn ? <View style={s.mtnBadge}><LiveDot color="#FFD700" size={4} /><Text style={s.mtnBadgeText}>MTN MoMo</Text></View> : null}
                <MaterialIcons name="expand-more" size={20} color={Colors.textMuted} />
              </TouchableOpacity>

              <TextInput style={s.input} value={userId} onChangeText={setUserId} placeholder="User ID" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
              <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder={`Phone (${fromInfo.phonePrefix} …)`} placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
              <TextInput style={s.input} value={amount} onChangeText={setAmount} placeholder={`Amount in ${fromInfo.currency}`} placeholderTextColor={Colors.textMuted} keyboardType="numeric" />

              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#EF444418', borderColor: '#EF444455' }, (loading || !userId.trim() || !phone.trim() || !amount.trim()) && { opacity: 0.5 }]}
                onPress={handleWithdraw}
                disabled={loading || !userId.trim() || !phone.trim() || !amount.trim()}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator size="small" color="#EF4444" /> : <MaterialIcons name="arrow-upward" size={18} color="#EF4444" />}
                <Text style={[s.btnText, { color: '#EF4444' }]}>{loading ? 'Processing…' : 'Withdraw to MoMo'}</Text>
              </TouchableOpacity>

              <View style={s.infoBox}>
                <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
                <Text style={s.infoText}>Fat Money is debited first. Disbursement is sent to the MoMo number via MTN API.</Text>
              </View>
            </View>
          )}

          {/* ── TRANSFER TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'transfer' && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                  <MaterialIcons name="swap-horiz" size={20} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>P2P Fat Money Transfer</Text>
                  <Text style={s.cardSub}>Send BTNGG directly to another user across Africa</Text>
                </View>
              </View>

              <TouchableOpacity style={s.countrySelector} onPress={() => openPicker('from', false)} activeOpacity={0.8}>
                <Text style={s.countrySelectorFlag}>{fromInfo.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.countrySelectorName}>{fromInfo.name} (sender's market)</Text>
                  <Text style={s.countrySelectorDetail}>{fromCountry} · {fromInfo.currency}</Text>
                </View>
                <MaterialIcons name="expand-more" size={20} color={Colors.textMuted} />
              </TouchableOpacity>

              <TextInput style={s.input} value={userId} onChangeText={setUserId} placeholder="Your User ID (sender)" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
              <TextInput style={s.input} value={toUserId} onChangeText={setToUserId} placeholder="Recipient User ID" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
              <TextInput style={s.input} value={amount} onChangeText={setAmount} placeholder={`Amount in ${fromInfo.currency}`} placeholderTextColor={Colors.textMuted} keyboardType="numeric" />

              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#3B82F618', borderColor: '#3B82F655' }, (loading || !userId.trim() || !toUserId.trim() || !amount.trim()) && { opacity: 0.5 }]}
                onPress={handleTransfer}
                disabled={loading || !userId.trim() || !toUserId.trim() || !amount.trim()}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator size="small" color="#3B82F6" /> : <MaterialIcons name="swap-horiz" size={18} color="#3B82F6" />}
                <Text style={[s.btnText, { color: '#3B82F6' }]}>{loading ? 'Transferring…' : 'Transfer Fat Money'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── REMITTANCE TAB ───────────────────────────────────────────────── */}
          {activeTab === 'remittance' && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF644' }]}>
                  <MaterialIcons name="send" size={20} color="#8B5CF6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Pan-Africa Remittance</Text>
                  <Text style={s.cardSub}>Cross-border MoMo transfer across 54 African nations</Text>
                </View>
              </View>

              {/* From / To country selector */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity style={[s.countrySelector, { flex: 1 }]} onPress={() => openPicker('from', false)} activeOpacity={0.8}>
                  <Text style={s.countrySelectorFlag}>{fromInfo.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.countrySelectorName}>From</Text>
                    <Text style={s.countrySelectorDetail}>{fromInfo.name}</Text>
                  </View>
                  <MaterialIcons name="expand-more" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <MaterialIcons name="arrow-forward" size={18} color="#8B5CF6" />
                </View>

                <TouchableOpacity style={[s.countrySelector, { flex: 1 }]} onPress={() => openPicker('to', false)} activeOpacity={0.8}>
                  <Text style={s.countrySelectorFlag}>{toInfo.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.countrySelectorName}>To</Text>
                    <Text style={s.countrySelectorDetail}>{toInfo.name}</Text>
                  </View>
                  <MaterialIcons name="expand-more" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              <TextInput style={s.input} value={userId} onChangeText={setUserId} placeholder="Your User ID (sender)" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
              <TextInput style={s.input} value={recipPhone} onChangeText={setRecipPhone} placeholder={`Recipient phone (${toInfo.phonePrefix} …)`} placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
              <TextInput style={s.input} value={amount} onChangeText={setAmount} placeholder={`Amount in ${fromInfo.currency}`} placeholderTextColor={Colors.textMuted} keyboardType="numeric" />

              {/* Route preview */}
              <View style={s.routePreview}>
                <Text style={s.routeFlag}>{fromInfo.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.routeText}>{fromInfo.name} → {toInfo.name}</Text>
                  <Text style={s.routeSub}>{fromInfo.currency} deducted · delivered via {toInfo.mtn ? 'MTN MoMo' : 'Partner Network'}</Text>
                </View>
                <Text style={s.routeFlag}>{toInfo.flag}</Text>
              </View>

              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF655' }, (loading || !userId.trim() || !recipPhone.trim() || !amount.trim()) && { opacity: 0.5 }]}
                onPress={handleRemittance}
                disabled={loading || !userId.trim() || !recipPhone.trim() || !amount.trim()}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator size="small" color="#8B5CF6" /> : <MaterialIcons name="send" size={18} color="#8B5CF6" />}
                <Text style={[s.btnText, { color: '#8B5CF6' }]}>{loading ? 'Sending…' : 'Send Remittance'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── BALANCE TAB ──────────────────────────────────────────────────── */}
          {activeTab === 'balance' && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' }]}>
                  <MaterialIcons name="account-balance" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Fat Money Balance</Text>
                  <Text style={s.cardSub}>Check your BTNG Gold Coin (BTNGG) balance</Text>
                </View>
              </View>

              <TextInput style={s.input} value={userId} onChangeText={setUserId} placeholder="User ID" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />

              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B55' }, (loading || !userId.trim()) && { opacity: 0.5 }]}
                onPress={handleBalance}
                disabled={loading || !userId.trim()}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator size="small" color="#F59E0B" /> : <MaterialIcons name="account-balance" size={18} color="#F59E0B" />}
                <Text style={[s.btnText, { color: '#F59E0B' }]}>{loading ? 'Checking…' : 'Check Balance'}</Text>
              </TouchableOpacity>

              {balanceData ? (
                <View style={s.balanceCard}>
                  <Text style={s.balanceLabel}>Fat Money Balance</Text>
                  <Text style={s.balanceValue}>{Number(balanceData.fatMoney).toFixed(4)}</Text>
                  <Text style={s.balanceCurrency}>BTNGG · BTNG Gold Coin</Text>
                  <View style={s.balanceDivider} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={s.balanceSub}>User ID: {balanceData.userId}</Text>
                    <Text style={s.balanceSub}>{balanceData.ledgerItems} tx</Text>
                  </View>
                </View>
              ) : null}
            </View>
          )}

          {/* ── COVERAGE TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'coverage' && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.border }]}>
                  <MaterialIcons name="public" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Africa Coverage Map</Text>
                  <Text style={s.cardSub}>All 54 AfCFTA nations · {MTN_COUNTRIES.length} active MTN MoMo markets</Text>
                </View>
              </View>

              {/* Stats strip */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
                {[
                  { label: 'Total Nations',   value: Object.keys(AFRICA).length, color: Colors.primary },
                  { label: 'MTN Active',       value: MTN_COUNTRIES.length,       color: '#FFD700'      },
                  { label: 'Partner Networks', value: Object.keys(AFRICA).length - MTN_COUNTRIES.length, color: '#3B82F6' },
                ].map(stat => (
                  <View key={stat.label} style={[s.statCell, { borderColor: stat.color + '44' }]}>
                    <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                    <Text style={s.statLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>

              {/* Country list by region */}
              {['West Africa', 'East Africa', 'Central Africa', 'Southern Africa', 'North Africa'].map(region => {
                const countries = ALL_COUNTRIES.filter(([, v]) => v.region === region);
                return (
                  <View key={region} style={{ marginBottom: Spacing.md }}>
                    <View style={s.regionHeader}>
                      <View style={s.regionLine} />
                      <Text style={s.regionLabel}>{region.toUpperCase()}</Text>
                      <View style={s.regionLine} />
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {countries.map(([code, info]) => (
                        <View
                          key={code}
                          style={[
                            s.countryChip,
                            info.mtn
                              ? { backgroundColor: '#FFD70012', borderColor: '#FFD70044' }
                              : { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
                          ]}
                        >
                          <Text style={{ fontSize: 14 }}>{info.flag}</Text>
                          <View>
                            <Text style={[s.chipCode, info.mtn && { color: '#FFD700' }]}>{code}</Text>
                            <Text style={s.chipCur}>{info.currency}</Text>
                          </View>
                          {info.mtn ? (
                            <View style={s.mtnDot}>
                              <LiveDot color="#FFD700" size={3} />
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}

              <View style={s.coverageLegend}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <LiveDot color="#FFD700" size={5} />
                  <Text style={[s.legendText, { color: '#FFD700' }]}>MTN MoMo active market</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.textMuted }} />
                  <Text style={s.legendText}>Partner / BTNG gateway</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Engine Info Card ────────────────────────────────────────────── */}
          <View style={s.engineCard}>
            <MaterialIcons name="developer-mode" size={14} color={Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={s.engineTitle}>Engine Endpoints</Text>
              <Text style={s.engineLine}>Port 3000 → MTN MoMo Sandbox Host</Text>
              <Text style={s.engineLine}>Port 8090 → BTNG Banking + Gold Coin Engine</Text>
              <Text style={s.engineLine}>Run: node sdk/btng-momo-engine.js</Text>
            </View>
            <View style={[s.engineDot, { backgroundColor: engineOnline ? '#22C55E' : '#EF4444' }]} />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },
  topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.sm },
  iconBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter:    { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  topSub:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  statusPillText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  heroBanner:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.md },
  heroLeft:     { flex: 1 },
  heroTitle:    { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  heroBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  heroBadgeText:{ fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  heroRight:    { alignItems: 'center', gap: 2 },
  heroCoinText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  tabScroll:        { flexGrow: 0, flexShrink: 0 },
  tabScrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, paddingBottom: Spacing.sm },
  tab:              { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, height: 36 },
  tabText:          { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },

  scroll:       { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md },

  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardIcon:     { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  cardSub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },

  countrySelector: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  countrySelectorFlag: { fontSize: 24, width: 30, textAlign: 'center' },
  countrySelectorName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  countrySelectorDetail: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  mtnBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFD70018', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FFD70044', flexShrink: 0 },
  mtnBadgeText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: '#FFD700', includeFontPadding: false },

  input:        { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 48, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },

  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 14, borderRadius: Radius.lg, borderWidth: 1 },
  btnText:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },

  infoBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  infoText:     { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },

  // ── Simulate Callback card ────────────────────────────────────────────────────
  simCard:         { backgroundColor: '#8B5CF608', borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#8B5CF644', padding: Spacing.md, gap: Spacing.sm },
  simHeader:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  simIconWrap:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#8B5CF618', borderWidth: 1, borderColor: '#8B5CF644', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  simTitle:        { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#8B5CF6', includeFontPadding: false },
  simSub:          { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1, lineHeight: 13 },
  simBadge:        { backgroundColor: '#8B5CF618', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#8B5CF644', flexShrink: 0 },
  simBadgeText:    { fontSize: 8, fontWeight: FontWeight.heavy, color: '#8B5CF6', letterSpacing: 0.8, includeFontPadding: false },
  simRefRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#8B5CF610', borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#8B5CF633' },
  simRefText:      { flex: 1, fontSize: 9, color: '#C4B5FD', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  simKeyLabel:     { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  simKeyRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: '#8B5CF655', paddingHorizontal: Spacing.md, gap: 4 },
  simKeyInput:     { flex: 1, height: 42, fontSize: FontSize.xs, color: Colors.textPrimary, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  simPayloadBox:   { backgroundColor: '#060608', borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: '#8B5CF633' },
  simPayloadLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: '#8B5CF6', letterSpacing: 1, marginBottom: 4, includeFontPadding: false },
  simPayloadText:  { fontSize: 9, color: '#C4B5FD', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 13, includeFontPadding: false },
  simBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1.5, backgroundColor: '#8B5CF618', borderColor: '#8B5CF666' },
  simBtnText:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#8B5CF6', includeFontPadding: false },

  balanceCard:  { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', padding: Spacing.lg, alignItems: 'center', gap: 4 },
  balanceLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  balanceValue: { fontSize: FontSize.hero, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  balanceCurrency: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  balanceDivider:  { width: '100%', height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  balanceSub:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  routePreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#8B5CF612', borderRadius: Radius.lg, padding: Spacing.sm + 4, borderWidth: 1, borderColor: '#8B5CF644' },
  routeFlag:    { fontSize: 22 },
  routeText:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#8B5CF6', includeFontPadding: false },
  routeSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },

  statCell:     { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, alignItems: 'center', gap: 2 },
  statValue:    { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  regionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 8 },
  regionLine:   { flex: 1, height: 1, backgroundColor: Colors.border },
  regionLabel:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },

  countryChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, position: 'relative' },
  chipCode:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  chipCur:      { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  mtnDot:       { position: 'absolute', top: 3, right: 3 },

  coverageLegend: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  legendText:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  engineCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  engineTitle:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false, marginBottom: 2 },
  engineLine:   { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 15 },
  engineDot:    { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
});
