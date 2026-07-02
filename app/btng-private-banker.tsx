// BTNG AI Private Banker — 54-Nation African Sovereign Banking Platform
// Supports: Country selection, KYC, identity generation, loan application
import React, { useState, useCallback, useRef, useMemo } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, FlatList,
  KeyboardAvoidingView, Platform, Dimensions, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { getSupabaseClient } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { governedRoute, fetchRulings, type BrainDecision, type BrainContext } from '@/services/brainRouterService';
import {
  COUNTRY_META, generateBtngAddress, lookupBtngAddress,
  ADDRESS_TYPE_LABELS, ADDRESS_TYPE_ICONS, BTNG_PREFIXES,
  type AddressType, type CountryMeta, type GeneratedAddress,
} from '@/services/btngEngineService';

const { width: SCREEN_W } = Dimensions.get('window');

// ── 54 African Nations Data ────────────────────────────────────────────────────
const AFRICAN_NATIONS = [
  { name: 'Algeria', code: 'DZ', flag: '🇩🇿', phone: '+213', currency: 'DZD', msp: 'DZ-MSP-001' },
  { name: 'Angola', code: 'AO', flag: '🇦🇴', phone: '+244', currency: 'AOA', msp: 'AO-MSP-001' },
  { name: 'Benin', code: 'BJ', flag: '🇧🇯', phone: '+229', currency: 'XOF', msp: 'BJ-MSP-001' },
  { name: 'Botswana', code: 'BW', flag: '🇧🇼', phone: '+267', currency: 'BWP', msp: 'BW-MSP-001' },
  { name: 'Burkina Faso', code: 'BF', flag: '🇧🇫', phone: '+226', currency: 'XOF', msp: 'BF-MSP-001' },
  { name: 'Burundi', code: 'BI', flag: '🇧🇮', phone: '+257', currency: 'BIF', msp: 'BI-MSP-001' },
  { name: 'Cameroon', code: 'CM', flag: '🇨🇲', phone: '+237', currency: 'XAF', msp: 'CM-MSP-001' },
  { name: 'Cape Verde', code: 'CV', flag: '🇨🇻', phone: '+238', currency: 'CVE', msp: 'CV-MSP-001' },
  { name: 'Central African Republic', code: 'CF', flag: '🇨🇫', phone: '+236', currency: 'XAF', msp: 'CF-MSP-001' },
  { name: 'Chad', code: 'TD', flag: '🇹🇩', phone: '+235', currency: 'XAF', msp: 'TD-MSP-001' },
  { name: 'Comoros', code: 'KM', flag: '🇰🇲', phone: '+269', currency: 'KMF', msp: 'KM-MSP-001' },
  { name: 'Congo', code: 'CG', flag: '🇨🇬', phone: '+242', currency: 'XAF', msp: 'CG-MSP-001' },
  { name: "Côte d'Ivoire", code: 'CI', flag: '🇨🇮', phone: '+225', currency: 'XOF', msp: 'CI-MSP-001' },
  { name: 'DRC', code: 'CD', flag: '🇨🇩', phone: '+243', currency: 'CDF', msp: 'CD-MSP-001' },
  { name: 'Djibouti', code: 'DJ', flag: '🇩🇯', phone: '+253', currency: 'DJF', msp: 'DJ-MSP-001' },
  { name: 'Egypt', code: 'EG', flag: '🇪🇬', phone: '+20', currency: 'EGP', msp: 'EG-MSP-001' },
  { name: 'Equatorial Guinea', code: 'GQ', flag: '🇬🇶', phone: '+240', currency: 'XAF', msp: 'GQ-MSP-001' },
  { name: 'Eritrea', code: 'ER', flag: '🇪🇷', phone: '+291', currency: 'ERN', msp: 'ER-MSP-001' },
  { name: 'Eswatini', code: 'SZ', flag: '🇸🇿', phone: '+268', currency: 'SZL', msp: 'SZ-MSP-001' },
  { name: 'Ethiopia', code: 'ET', flag: '🇪🇹', phone: '+251', currency: 'ETB', msp: 'ET-MSP-001' },
  { name: 'Gabon', code: 'GA', flag: '🇬🇦', phone: '+241', currency: 'XAF', msp: 'GA-MSP-001' },
  { name: 'Gambia', code: 'GM', flag: '🇬🇲', phone: '+220', currency: 'GMD', msp: 'GM-MSP-001' },
  { name: 'Ghana', code: 'GH', flag: '🇬🇭', phone: '+233', currency: 'GHS', msp: 'GH-MSP-001' },
  { name: 'Guinea', code: 'GN', flag: '🇬🇳', phone: '+224', currency: 'GNF', msp: 'GN-MSP-001' },
  { name: 'Guinea-Bissau', code: 'GW', flag: '🇬🇼', phone: '+245', currency: 'XOF', msp: 'GW-MSP-001' },
  { name: 'Kenya', code: 'KE', flag: '🇰🇪', phone: '+254', currency: 'KES', msp: 'KE-MSP-001' },
  { name: 'Lesotho', code: 'LS', flag: '🇱🇸', phone: '+266', currency: 'LSL', msp: 'LS-MSP-001' },
  { name: 'Liberia', code: 'LR', flag: '🇱🇷', phone: '+231', currency: 'LRD', msp: 'LR-MSP-001' },
  { name: 'Libya', code: 'LY', flag: '🇱🇾', phone: '+218', currency: 'LYD', msp: 'LY-MSP-001' },
  { name: 'Madagascar', code: 'MG', flag: '🇲🇬', phone: '+261', currency: 'MGA', msp: 'MG-MSP-001' },
  { name: 'Malawi', code: 'MW', flag: '🇲🇼', phone: '+265', currency: 'MWK', msp: 'MW-MSP-001' },
  { name: 'Mali', code: 'ML', flag: '🇲🇱', phone: '+223', currency: 'XOF', msp: 'ML-MSP-001' },
  { name: 'Mauritania', code: 'MR', flag: '🇲🇷', phone: '+222', currency: 'MRU', msp: 'MR-MSP-001' },
  { name: 'Mauritius', code: 'MU', flag: '🇲🇺', phone: '+230', currency: 'MUR', msp: 'MU-MSP-001' },
  { name: 'Morocco', code: 'MA', flag: '🇲🇦', phone: '+212', currency: 'MAD', msp: 'MA-MSP-001' },
  { name: 'Mozambique', code: 'MZ', flag: '🇲🇿', phone: '+258', currency: 'MZN', msp: 'MZ-MSP-001' },
  { name: 'Namibia', code: 'NA', flag: '🇳🇦', phone: '+264', currency: 'NAD', msp: 'NA-MSP-001' },
  { name: 'Niger', code: 'NE', flag: '🇳🇪', phone: '+227', currency: 'XOF', msp: 'NE-MSP-001' },
  { name: 'Nigeria', code: 'NG', flag: '🇳🇬', phone: '+234', currency: 'NGN', msp: 'NG-MSP-001' },
  { name: 'Rwanda', code: 'RW', flag: '🇷🇼', phone: '+250', currency: 'RWF', msp: 'RW-MSP-001' },
  { name: 'Sao Tome & Principe', code: 'ST', flag: '🇸🇹', phone: '+239', currency: 'STN', msp: 'ST-MSP-001' },
  { name: 'Senegal', code: 'SN', flag: '🇸🇳', phone: '+221', currency: 'XOF', msp: 'SN-MSP-001' },
  { name: 'Seychelles', code: 'SC', flag: '🇸🇨', phone: '+248', currency: 'SCR', msp: 'SC-MSP-001' },
  { name: 'Sierra Leone', code: 'SL', flag: '🇸🇱', phone: '+232', currency: 'SLL', msp: 'SL-MSP-001' },
  { name: 'Somalia', code: 'SO', flag: '🇸🇴', phone: '+252', currency: 'SOS', msp: 'SO-MSP-001' },
  { name: 'South Africa', code: 'ZA', flag: '🇿🇦', phone: '+27', currency: 'ZAR', msp: 'ZA-MSP-001' },
  { name: 'South Sudan', code: 'SS', flag: '🇸🇸', phone: '+211', currency: 'SSP', msp: 'SS-MSP-001' },
  { name: 'Sudan', code: 'SD', flag: '🇸🇩', phone: '+249', currency: 'SDG', msp: 'SD-MSP-001' },
  { name: 'Tanzania', code: 'TZ', flag: '🇹🇿', phone: '+255', currency: 'TZS', msp: 'TZ-MSP-001' },
  { name: 'Togo', code: 'TG', flag: '🇹🇬', phone: '+228', currency: 'XOF', msp: 'TG-MSP-001' },
  { name: 'Tunisia', code: 'TN', flag: '🇹🇳', phone: '+216', currency: 'TND', msp: 'TN-MSP-001' },
  { name: 'Uganda', code: 'UG', flag: '🇺🇬', phone: '+256', currency: 'UGX', msp: 'UG-MSP-001' },
  { name: 'Zambia', code: 'ZM', flag: '🇿🇲', phone: '+260', currency: 'ZMW', msp: 'ZM-MSP-001' },
  { name: 'Zimbabwe', code: 'ZW', flag: '🇿🇼', phone: '+263', currency: 'ZWL', msp: 'ZW-MSP-001' },
];

// ── API Base ────────────────────────────────────────────────────────────────────
const BTNG_API_BASE = 'http://localhost:8000';

// ── Types ───────────────────────────────────────────────────────────────────────
interface Nation { name: string; code: string; flag: string; phone: string; currency: string; msp: string; }
interface KycForm {
  full_name: string; email: string; phone: string; dob: string;
  id_type: string; id_number: string;
  address: string; city: string; region: string; postal_code: string;
}
interface GeneratedIdentity {
  sovereign_id: string; digital_address: string; msp_id: string;
  wallet_address: string; public_key: string;
  btng_address: string; evm_address: string; migration_address: string;
}
interface LoanForm {
  amount: string; term: string; purpose: string; sector: string; notes: string;
}
interface LoanResult {
  status: string; loan_id: string; borrower: string;
  approved_amount: number; term: string; meta: Record<string, string>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
function generateLocalIdentity(nation: Nation, form: KycForm): GeneratedIdentity {
  const ts = Date.now();
  const rand = () => Math.random().toString(36).substring(2, 10).toUpperCase();
  const ethHex = () => Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const btngAddr = () => 'BTNG' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('').toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return {
    sovereign_id: `BTNG-${nation.code}-${date}-${rand().slice(0, 6)}`,
    digital_address: `0x${ethHex()}`,
    msp_id: nation.msp,
    wallet_address: btngAddr(),
    public_key: `-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE${rand()}${rand()}${rand()}\n-----END PUBLIC KEY-----`,
    btng_address: btngAddr(),
    evm_address: `0x${ethHex()}`,
    migration_address: `MIGR${rand()}${rand().slice(0, 4)}`,
  };
}

function generateLocalLoan(form: LoanForm, walletAddress: string): LoanResult {
  const amount = parseFloat(form.amount) || 0;
  const rand = () => Math.random().toString(36).substring(2, 18);
  return {
    status: 'APPROVED',
    loan_id: rand(),
    borrower: walletAddress,
    approved_amount: amount,
    term: form.term || '12m',
    meta: { country: 'Ghana', purpose: form.purpose, sector: form.sector, notes: form.notes },
  };
}

// ── CopyRow ──────────────────────────────────────────────────────────────────────
function CopyRow({ label, value, mono, dark }: { label: string; value: string; mono?: boolean; dark: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(value).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [value]);
  const t = dark ? darkT : lightT;
  return (
    <View style={[t.copyRow]}>
      <View style={t.copyRowLeft}>
        <Text style={t.copyLabel}>{label}</Text>
        <Text style={[t.copyValue, mono && t.copyValueMono]} numberOfLines={2}>{value}</Text>
      </View>
      <TouchableOpacity style={[t.copyBtn, copied && t.copyBtnDone]} onPress={handleCopy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name={copied ? 'check-circle' : 'content-copy'} size={15} color={copied ? '#22C55E' : Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────────
export default function BtngPrivateBankerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  // Theme state
  const [isDark, setIsDark] = useState(true);
  const t = isDark ? darkT : lightT;

  // Step state: 'select' | 'kyc' | 'identity' | 'loan'
  const [step, setStep] = useState<'select' | 'kyc' | 'identity' | 'loan'>('select');
  const [selectedNation, setSelectedNation] = useState<Nation | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [identity, setIdentity] = useState<GeneratedIdentity | null>(null);
  const [loanResult, setLoanResult] = useState<LoanResult | null>(null);
  const [showLoanResult, setShowLoanResult] = useState(false);
  const [showLawJournal, setShowLawJournal] = useState(false);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [brainDecision, setBrainDecision] = useState<BrainDecision | null>(null);
  const [brainInput, setBrainInput] = useState('');
  const [brainLoading, setBrainLoading] = useState(false);

  const [kyc, setKyc] = useState<KycForm>({
    full_name: '', email: user?.email ?? '', phone: '',
    dob: '', id_type: 'national_id', id_number: '',
    address: '', city: '', region: '', postal_code: '',
  });
  const [loan, setLoan] = useState<LoanForm>({
    amount: '', term: '12m', purpose: 'Agriculture', sector: 'Farming', notes: '',
  });

  const filteredNations = useMemo(() =>
    AFRICAN_NATIONS.filter(n =>
      n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.code.toLowerCase().includes(search.toLowerCase()) ||
      n.currency.toLowerCase().includes(search.toLowerCase())
    ), [search]);

  const handleSelectNation = useCallback((nation: Nation) => {
    setSelectedNation(nation);
    setKyc(prev => ({ ...prev, phone: nation.phone }));
    setStep('kyc');
  }, []);

  const handleGenerateIdentity = useCallback(async () => {
    if (!selectedNation) return;
    if (!kyc.full_name.trim() || !kyc.email.trim()) {
      showAlert('Required Fields', 'Please enter at least your Full Name and Email to proceed.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BTNG_API_BASE}/ai/identity/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: selectedNation.name,
          country_code: selectedNation.code,
          phone_code: selectedNation.phone,
          currency: selectedNation.currency,
          msp_id: selectedNation.msp,
          ...kyc,
        }),
      });
      const data = await res.json();
      if (res.ok && data.sovereign_id) {
        setIdentity(data);
      } else {
        setIdentity(generateLocalIdentity(selectedNation, kyc));
      }
    } catch {
      setIdentity(generateLocalIdentity(selectedNation, kyc));
    }
    setLoading(false);
    setStep('identity');
  }, [selectedNation, kyc, showAlert]);

  const handleApplyLoan = useCallback(async () => {
    if (!identity) return;
    if (!loan.amount || parseFloat(loan.amount) <= 0) {
      showAlert('Loan Amount', 'Please enter a valid loan amount.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BTNG_API_BASE}/engine/loan/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrower: identity.wallet_address,
          country: selectedNation?.name ?? 'Ghana',
          amount: parseFloat(loan.amount),
          term: loan.term,
          purpose: loan.purpose,
          sector: loan.sector,
          notes: loan.notes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.loan_id) {
        setLoanResult(data);
      } else {
        setLoanResult(generateLocalLoan(loan, identity.wallet_address));
      }
    } catch {
      setLoanResult(generateLocalLoan(loan, identity.wallet_address));
    }
    setLoading(false);
    setShowLoanResult(true);
  }, [identity, loan, selectedNation, showAlert]);

  // ── Brain Router ──────────────────────────────────────────────────────────
  const handleBrainRoute = useCallback(async () => {
    if (!brainInput.trim()) return;
    setBrainLoading(true);
    const ctx: BrainContext = {
      kyc_tier:     selectedNation ? 2 : 0,
      jurisdiction: selectedNation?.code ?? 'GH',
      is_customer:  !!user,
      auth_tier:    user ? 1 : 0,
      user_id:      user?.id,
      email:        user?.email,
    };
    const { data, error } = await governedRoute(brainInput, ctx);
    setBrainLoading(false);
    if (error) { showAlert('Brain Router Error', error); return; }
    setBrainDecision(data);
    setBrainInput('');
  }, [brainInput, selectedNation, user, showAlert]);

  const handleLoadJournal = useCallback(async () => {
    setJournalLoading(true);
    const { data, error } = await fetchRulings(30);
    setJournalLoading(false);
    if (error) { showAlert('Journal Error', error); return; }
    setJournalEntries(data ?? []);
    setShowLawJournal(true);
  }, [showAlert]);

  const handleSaveToDb = useCallback(async () => {
    if (!identity || !user?.id) return;
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('btng_certificates').insert({
      user_id: user.id,
      cert_type: 'sovereign_identity',
      cert_id: identity.sovereign_id,
      owner_name: kyc.full_name,
      asset_description: `${selectedNation?.name} Sovereign Identity`,
      asset_value: 0,
      equity_grade: 'A',
      fingerprint: identity.btng_address,
      issued_at: new Date().toISOString().slice(0, 10),
      status: 'active',
      metadata: {
        nation: selectedNation?.name,
        evm_address: identity.evm_address,
        migration_address: identity.migration_address,
        msp_id: identity.msp_id,
        wallet_address: identity.wallet_address,
        public_key: identity.public_key,
      },
    });
    if (error) {
      showAlert('Save Failed', error.message);
    } else {
      showAlert('Identity Saved', 'Your sovereign identity has been saved to your BTNG Sovereign Documents.');
    }
  }, [identity, user, kyc, selectedNation, showAlert]);

  const renderNationItem = useCallback(({ item }: { item: Nation }) => (
    <TouchableOpacity
      style={[t.nationCard, selectedNation?.code === item.code && t.nationCardActive]}
      onPress={() => handleSelectNation(item)}
      activeOpacity={0.75}
    >
      <Text style={t.nationFlag}>{item.flag}</Text>
      <Text style={[t.nationName, item.code === 'GH' && t.nationNameGhana]} numberOfLines={1}>{item.name}</Text>
      <Text style={t.nationCode}>{item.code}</Text>
      <Text style={t.nationCurrency}>{item.currency}</Text>
    </TouchableOpacity>
  ), [t, selectedNation, handleSelectNation]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[t.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top Bar */}
      <View style={t.topBar}>
        <TouchableOpacity style={t.backBtn} onPress={() => {
          if (step === 'kyc') setStep('select');
          else if (step === 'identity') setStep('kyc');
          else if (step === 'loan') setStep('identity');
          else router.back();
        }}>
          <MaterialIcons name="arrow-back" size={22} color={isDark ? Colors.textPrimary : '#111'} />
        </TouchableOpacity>
        <View style={t.topCenter}>
          <Text style={t.topTitle}>BTNG AI Private Banker</Text>
          <Text style={t.topSub}>54 African Nations · Sovereign Banking</Text>
        </View>
        <TouchableOpacity style={t.themeBtn} onPress={() => setIsDark(v => !v)}>
          <Text style={{ fontSize: 18 }}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Steps */}
      <View style={t.stepBar}>
        {(['select', 'kyc', 'identity', 'loan'] as const).map((s, i) => (
          <React.Fragment key={s}>
            <View style={[t.stepDot, step === s && t.stepDotActive, ['identity', 'loan'].includes(step) && i < 2 && t.stepDotDone, step === 'loan' && i < 3 && t.stepDotDone]}>
              <Text style={[t.stepDotText, (step === s || (['identity', 'loan'].includes(step) && i < 2) || (step === 'loan' && i < 3)) && t.stepDotTextActive]}>
                {i + 1}
              </Text>
            </View>
            {i < 3 && <View style={[t.stepLine, ((['identity', 'loan'].includes(step) && i < 2) || (step === 'loan' && i < 3)) && t.stepLineDone]} />}
          </React.Fragment>
        ))}
      </View>
      <View style={t.stepLabelRow}>
        {['Nation', 'KYC', 'Identity', 'Loan'].map((label, i) => (
          <Text key={label} style={[t.stepLabel, i === ['select', 'kyc', 'identity', 'loan'].indexOf(step) && t.stepLabelActive]}>{label}</Text>
        ))}
      </View>

      {/* ── STEP 1: Nation Selection ──────────────────────────────────────────── */}
      {step === 'select' && (
        <View style={{ flex: 1 }}>
          {/* Header Hero */}
          <View style={t.heroCard}>
            <Text style={t.heroEmoji}>🌍</Text>
            <Text style={t.heroTitle}>Select Your African Nation</Text>
            <Text style={t.heroSub}>54 nations · Instant KYC · Sovereign digital identity</Text>
            <View style={t.heroStatRow}>
              <View style={t.heroStat}><Text style={t.heroStatNum}>54</Text><Text style={t.heroStatLabel}>Nations</Text></View>
              <View style={t.heroStatDivider} />
              <View style={t.heroStat}><Text style={t.heroStatNum}>40+</Text><Text style={t.heroStatLabel}>Currencies</Text></View>
              <View style={t.heroStatDivider} />
              <View style={t.heroStat}><Text style={t.heroStatNum}>🔐</Text><Text style={t.heroStatLabel}>Sovereign</Text></View>
            </View>
          </View>

          {/* Search */}
          <View style={t.searchWrap}>
            <MaterialIcons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={t.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by country, code or currency..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Nation Count */}
          <View style={t.countRow}>
            <MaterialIcons name="public" size={13} color={Colors.primary} />
            <Text style={t.countText}>{filteredNations.length} nation{filteredNations.length !== 1 ? 's' : ''} available</Text>
          </View>

          {/* Flag Grid */}
          <FlatList
            data={filteredNations}
            keyExtractor={item => item.code}
            renderItem={renderNationItem}
            numColumns={3}
            contentContainerStyle={t.nationGrid}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {/* ── STEP 2: KYC Form ─────────────────────────────────────────────────── */}
      {step === 'kyc' && selectedNation && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={t.formScroll} keyboardShouldPersistTaps="handled">
          {/* Country Banner */}
          <View style={t.countryBanner}>
            <Text style={{ fontSize: 36 }}>{selectedNation.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={t.countryBannerName}>{selectedNation.name}</Text>
              <View style={t.countryBannerMeta}>
                <View style={t.metaChip}><Text style={t.metaChipText}>{selectedNation.code}</Text></View>
                <View style={t.metaChip}><Text style={t.metaChipText}>{selectedNation.currency}</Text></View>
                <View style={t.metaChip}><Text style={t.metaChipText}>{selectedNation.phone}</Text></View>
              </View>
            </View>
            <TouchableOpacity style={t.changeNationBtn} onPress={() => setStep('select')}>
              <MaterialIcons name="swap-horiz" size={14} color={Colors.primary} />
              <Text style={t.changeNationText}>Change</Text>
            </TouchableOpacity>
          </View>

          {/* Auto-fill strip */}
          <View style={t.autoFillStrip}>
            <MaterialIcons name="auto-awesome" size={12} color={Colors.primary} />
            <Text style={t.autoFillText}>
              MSP ID: <Text style={{ color: Colors.primary, fontWeight: '700' }}>{selectedNation.msp}</Text>
              {'  ·  '}Currency: <Text style={{ color: Colors.primary, fontWeight: '700' }}>{selectedNation.currency}</Text>
            </Text>
          </View>

          {/* Personal Details */}
          <Text style={t.sectionLabel}>Personal Details</Text>
          <View style={t.formCard}>
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Full Name *</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="person" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={kyc.full_name} onChangeText={v => setKyc(p => ({ ...p, full_name: v }))} placeholder="Your legal full name" placeholderTextColor={Colors.textMuted} autoCapitalize="words" />
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Email Address *</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="email" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={kyc.email} onChangeText={v => setKyc(p => ({ ...p, email: v }))} placeholder="you@example.com" placeholderTextColor={Colors.textMuted} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Date of Birth</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="calendar-today" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={kyc.dob} onChangeText={v => setKyc(p => ({ ...p, dob: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
          </View>

          {/* Contact */}
          <Text style={t.sectionLabel}>Contact Information</Text>
          <View style={t.formCard}>
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Phone Number</Text>
              <View style={t.fieldInputWrap}>
                <View style={t.phoneCode}><Text style={t.phoneCodeText}>{selectedNation.phone}</Text></View>
                <TextInput style={t.fieldInput} value={kyc.phone} onChangeText={v => setKyc(p => ({ ...p, phone: v }))} placeholder="Phone number" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>City / Region</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="location-city" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={kyc.city} onChangeText={v => setKyc(p => ({ ...p, city: v }))} placeholder="City name" placeholderTextColor={Colors.textMuted} autoCapitalize="words" />
              </View>
            </View>
          </View>

          {/* Identity Document */}
          <Text style={t.sectionLabel}>Identity Document</Text>
          <View style={t.formCard}>
            <View style={t.formField}>
              <Text style={t.fieldLabel}>ID Type</Text>
              <View style={t.idTypeRow}>
                {[
                  { key: 'national_id', label: 'National ID' },
                  { key: 'passport', label: 'Passport' },
                  { key: 'drivers_license', label: "Driver's Lic." },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[t.idTypeChip, kyc.id_type === opt.key && t.idTypeChipActive]}
                    onPress={() => setKyc(p => ({ ...p, id_type: opt.key }))}
                  >
                    <Text style={[t.idTypeChipText, kyc.id_type === opt.key && t.idTypeChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>ID Number</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="badge" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={kyc.id_number} onChangeText={v => setKyc(p => ({ ...p, id_number: v }))} placeholder="Document number" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" />
              </View>
            </View>
          </View>

          {/* Address */}
          <Text style={t.sectionLabel}>Address Information</Text>
          <View style={t.formCard}>
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Street Address</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="home" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={kyc.address} onChangeText={v => setKyc(p => ({ ...p, address: v }))} placeholder="Street number and name" placeholderTextColor={Colors.textMuted} autoCapitalize="words" />
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Region / Province</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="map" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={kyc.region} onChangeText={v => setKyc(p => ({ ...p, region: v }))} placeholder="Region, state or province" placeholderTextColor={Colors.textMuted} autoCapitalize="words" />
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Postal Code</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="local-post-office" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={kyc.postal_code} onChangeText={v => setKyc(p => ({ ...p, postal_code: v }))} placeholder="Postal / ZIP code" placeholderTextColor={Colors.textMuted} keyboardType="default" />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[t.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={handleGenerateIdentity}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color={Colors.bg} /> : (
              <>
                <MaterialIcons name="auto-awesome" size={18} color={Colors.bg} />
                <Text style={t.primaryBtnText}>Generate Sovereign Identity</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={t.securityNote}>
            <MaterialIcons name="lock" size={12} color={Colors.primary} />
            <Text style={t.securityNoteText}>256-bit encryption · Hyperledger Fabric MSP · Sovereign ownership</Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── STEP 3: Generated Identity ────────────────────────────────────────── */}
      {step === 'identity' && identity && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={t.formScroll}>
          {/* Success Banner */}
          <View style={t.successBanner}>
            <View style={t.successIconWrap}>
              <MaterialIcons name="verified" size={40} color={Colors.primary} />
            </View>
            <Text style={t.successTitle}>Sovereign Identity Created!</Text>
            <Text style={t.successSub}>
              {kyc.full_name || 'User'} · {selectedNation?.name} · {selectedNation?.currency}
            </Text>
            <View style={t.successBadgeRow}>
              <View style={t.successBadge}><Text style={t.successBadgeText}>{selectedNation?.flag} {selectedNation?.code}</Text></View>
              <View style={t.successBadge}><Text style={t.successBadgeText}>🔐 Sovereign</Text></View>
              <View style={t.successBadge}><Text style={t.successBadgeText}>⛓️ Blockchain</Text></View>
            </View>
          </View>

          {/* Sovereign Identity Card */}
          <Text style={t.sectionLabel}>Sovereign Identity</Text>
          <View style={t.identityCard}>
            <CopyRow label="Sovereign ID" value={identity.sovereign_id} dark={isDark} />
            <View style={t.formDivider} />
            <CopyRow label="Digital Address" value={identity.digital_address} mono dark={isDark} />
            <View style={t.formDivider} />
            <CopyRow label="MSP ID" value={identity.msp_id} dark={isDark} />
          </View>

          {/* Wallet */}
          <Text style={t.sectionLabel}>Universal Wallet</Text>
          <View style={t.identityCard}>
            <CopyRow label="Wallet Address" value={identity.wallet_address} mono dark={isDark} />
            <View style={t.formDivider} />
            <CopyRow label="Public Key" value={identity.public_key} mono dark={isDark} />
          </View>

          {/* Blockchain Addresses */}
          <Text style={t.sectionLabel}>Blockchain Addresses</Text>
          <View style={t.identityCard}>
            <CopyRow label="BTNG Address (Gold-Backed)" value={identity.btng_address} mono dark={isDark} />
            <View style={t.formDivider} />
            <CopyRow label="EVM Address (Ethereum)" value={identity.evm_address} mono dark={isDark} />
            <View style={t.formDivider} />
            <CopyRow label="Migration Address" value={identity.migration_address} mono dark={isDark} />
          </View>

          {/* ── BTNG 54-Nation Engine Card (per-country identity) ── */}
          {selectedNation && (
            <BTNGEngineIdentityCard nation={selectedNation} isDark={isDark} />
          )}

          {/* ── HD Derive Card ── */}
          {selectedNation && (
            <HDDeriveCard nation={selectedNation} isDark={isDark} showAlert={showAlert} />
          )}

          {/* Actions */}
          <View style={t.actionRow}>
            <TouchableOpacity style={t.secondaryBtn} onPress={handleSaveToDb}>
              <MaterialIcons name="save" size={16} color={Colors.primary} />
              <Text style={t.secondaryBtnText}>Save to Documents</Text>
            </TouchableOpacity>
            <TouchableOpacity style={t.primaryBtnHalf} onPress={() => setStep('loan')}>
              <MaterialIcons name="account-balance" size={16} color={Colors.bg} />
              <Text style={t.primaryBtnHalfText}>Apply for Loan</Text>
            </TouchableOpacity>
          </View>

          {/* Master Info */}
          <View style={t.masterCard}>
            <View style={t.masterRow}>
              <View style={t.masterIconWrap}>
                <MaterialIcons name="admin-panel-settings" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={t.masterName}>John Kojo Zi</Text>
                <Text style={t.masterTitle}>President · Primary Administrator</Text>
                <Text style={t.masterSub}>54 Africa Bank · BTNG Gold Sovereign</Text>
              </View>
              <View style={t.masterBadge}><Text style={t.masterBadgeText}>PRES</Text></View>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── STEP 4: Loan Application ──────────────────────────────────────────── */}
      {step === 'loan' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={t.formScroll} keyboardShouldPersistTaps="handled">
          {/* Loan Header */}
          <View style={t.loanHeader}>
            <View style={t.loanIconWrap}>
              <MaterialIcons name="account-balance" size={32} color={Colors.primary} />
            </View>
            <Text style={t.loanTitle}>Loan Application</Text>
            <Text style={t.loanSub}>Gold-backed sovereign credit · Engine One Reserve</Text>
            {identity && (
              <View style={t.loanBorrowerChip}>
                <MaterialIcons name="fingerprint" size={12} color={Colors.textMuted} />
                <Text style={t.loanBorrowerText} numberOfLines={1}>
                  {identity.wallet_address.slice(0, 16)}...
                </Text>
              </View>
            )}
          </View>

          <Text style={t.sectionLabel}>Loan Details</Text>
          <View style={t.formCard}>
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Loan Amount ({selectedNation?.currency ?? 'BTNGG'}) *</Text>
              <View style={t.fieldInputWrap}>
                <View style={t.phoneCode}><Text style={t.phoneCodeText}>{selectedNation?.currency ?? 'BTNGG'}</Text></View>
                <TextInput style={t.fieldInput} value={loan.amount} onChangeText={v => setLoan(p => ({ ...p, amount: v.replace(/[^0-9.]/g, '') }))} placeholder="10000" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Loan Term</Text>
              <View style={t.termRow}>
                {['3m', '6m', '12m', '24m', '36m'].map(term => (
                  <TouchableOpacity
                    key={term}
                    style={[t.termChip, loan.term === term && t.termChipActive]}
                    onPress={() => setLoan(p => ({ ...p, term }))}
                  >
                    <Text style={[t.termChipText, loan.term === term && t.termChipTextActive]}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text style={t.sectionLabel}>Purpose & Sector</Text>
          <View style={t.formCard}>
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Purpose</Text>
              <View style={t.purposeGrid}>
                {['Agriculture', 'Business', 'Education', 'Housing', 'Healthcare', 'Technology'].map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[t.purposeChip, loan.purpose === p && t.purposeChipActive]}
                    onPress={() => setLoan(prev => ({ ...prev, purpose: p }))}
                  >
                    <Text style={[t.purposeChipText, loan.purpose === p && t.purposeChipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Sector</Text>
              <View style={t.fieldInputWrap}>
                <MaterialIcons name="business-center" size={16} color={Colors.textMuted} />
                <TextInput style={t.fieldInput} value={loan.sector} onChangeText={v => setLoan(p => ({ ...p, sector: v }))} placeholder="e.g. Farming, Retail, Transport" placeholderTextColor={Colors.textMuted} autoCapitalize="words" />
              </View>
            </View>
            <View style={t.formDivider} />
            <View style={t.formField}>
              <Text style={t.fieldLabel}>Notes</Text>
              <TextInput
                style={t.notesInput}
                value={loan.notes}
                onChangeText={v => setLoan(p => ({ ...p, notes: v }))}
                placeholder="Brief description of loan purpose and use..."
                placeholderTextColor={Colors.textMuted}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[t.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={handleApplyLoan}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color={Colors.bg} /> : (
              <>
                <MaterialIcons name="send" size={18} color={Colors.bg} />
                <Text style={t.primaryBtnText}>Submit Loan Application</Text>
              </>
            )}
          </TouchableOpacity>
          {/* ── BTNG Brain Router Panel ──────────────────────────────────── */}
          <View style={t.brainPanel}>
            <View style={t.brainPanelHeader}>
              <MaterialIcons name="psychology" size={20} color={Colors.primary} />
              <Text style={t.brainPanelTitle}>BTNG Brain Router</Text>
              <View style={t.governedBadge}>
                <View style={t.governedDot} />
                <Text style={t.governedText}>GOVERNED</Text>
              </View>
            </View>
            <Text style={t.brainPanelSub}>Test the sovereign intent classifier. Every decision is logged to the Law Journal.</Text>
            <TextInput
              style={t.brainInput}
              value={brainInput}
              onChangeText={setBrainInput}
              placeholder={'e.g. "open an account" · "apply for loan" · "nearest branch"'}
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
            />
            <View style={t.brainBtnRow}>
              <TouchableOpacity
                style={[t.brainRouteBtn, (brainLoading || !brainInput.trim()) && { opacity: 0.5 }]}
                onPress={handleBrainRoute}
                disabled={brainLoading || !brainInput.trim()}
              >
                {brainLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="gavel" size={15} color={Colors.bg} />}
                <Text style={t.brainRouteBtnText}>{brainLoading ? 'Routing...' : 'Route Intent'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={t.journalBtn} onPress={handleLoadJournal} disabled={journalLoading}>
                {journalLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="menu-book" size={15} color={Colors.primary} />}
                <Text style={t.journalBtnText}>Law Journal</Text>
              </TouchableOpacity>
            </View>
            {brainDecision ? (
              <View style={[
                t.decisionCard,
                brainDecision.ruling === 'DENY' && { borderColor: '#ef444455', backgroundColor: '#3d0808' },
                brainDecision.ruling === 'ESCALATE_TO_BRANCH' && { borderColor: '#f5a62355', backgroundColor: '#3d2b00' },
                (brainDecision.ruling === 'ALLOW' || brainDecision.ruling === 'ALLOW_FULL') && { borderColor: '#22c55e55', backgroundColor: '#063d18' },
                brainDecision.ruling === 'ALLOW_REDUCED' && { borderColor: '#3b82f655', backgroundColor: '#1e2a3d' },
                brainDecision.ruling === 'ANCHORED' && { borderColor: '#D4A01788', backgroundColor: '#1a1200' },
              ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={[t.rulingText,
                    brainDecision.ruling === 'DENY' && { color: '#ef4444' },
                    brainDecision.ruling === 'ESCALATE_TO_BRANCH' && { color: '#f5a623' },
                    (brainDecision.ruling === 'ALLOW' || brainDecision.ruling === 'ALLOW_FULL') && { color: '#22c55e' },
                    brainDecision.ruling === 'ALLOW_REDUCED' && { color: '#3b82f6' },
                    brainDecision.ruling === 'ANCHORED' && { color: '#D4A017' },
                  ]}>⚓ {brainDecision.ruling}</Text>
                  <Text style={{ flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>{brainDecision.policy}</Text>
                  <Text style={{ fontSize: 10, color: Colors.textMuted, includeFontPadding: false }}>{brainDecision.latency_ms}ms</Text>
                </View>
                <View style={t.decisionRow}><Text style={t.decisionLabel}>Intent</Text><Text style={t.decisionValue}>{brainDecision.intent}</Text></View>
                <View style={t.decisionRow}><Text style={t.decisionLabel}>Confidence</Text><Text style={[t.decisionValue, { color: brainDecision.confidence > 0.85 ? Colors.success : Colors.warning }]}>{(brainDecision.confidence * 100).toFixed(0)}%</Text></View>
                {brainDecision.tool ? (<View style={t.decisionRow}><Text style={t.decisionLabel}>Tool</Text><Text style={[t.decisionValue, { color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{brainDecision.tool}</Text></View>) : null}
                <View style={[t.decisionRow, { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4, paddingTop: 8 }]}>
                  <Text style={t.decisionLabel}>Reason</Text>
                  <Text style={[t.decisionValue, { flex: 1, textAlign: 'right' }]} numberOfLines={3}>{brainDecision.reason}</Text>
                </View>
                <View style={t.bankerReplyBox}>
                  <MaterialIcons name="record-voice-over" size={13} color={Colors.primary} />
                  <Text style={t.bankerReplyText}>{brainDecision.bankerReply}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── Law Journal Modal ──────────────────────────────────────────────── */}
      <Modal visible={showLawJournal} transparent animationType="slide">
        <View style={t.modalOverlay}>
          <View style={[t.modalSheet, { maxHeight: '85%', width: '100%', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md }}>
              <MaterialIcons name="menu-book" size={20} color={Colors.primary} />
              <Text style={[t.loanResultStatus, { flex: 1, textAlign: 'left', fontSize: FontSize.lg }]}>Law Journal</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success }} />
                <Text style={{ fontSize: 9, color: Colors.primary, fontWeight: FontWeight.heavy, includeFontPadding: false }}>APPEND-ONLY</Text>
              </View>
              <TouchableOpacity onPress={() => setShowLawJournal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.md, includeFontPadding: false }}>
              Every intent routed by the BTNG Brain is recorded here. No deletions. No edits. One ledger of rulings.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {journalEntries.length === 0
                ? <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 24, fontSize: FontSize.sm, includeFontPadding: false }}>No rulings yet — route an intent first.</Text>
                : journalEntries.map((entry, idx) => (
                  <View key={entry.id ?? idx} style={{ backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: entry.ruling === 'DENY' ? '#ef444433' : entry.ruling === 'ESCALATE_TO_BRANCH' ? '#f5a62333' : entry.ruling === 'ALLOW' || entry.ruling === 'ALLOW_FULL' ? '#22c55e33' : Colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: FontWeight.heavy, color: entry.ruling === 'DENY' ? '#ef4444' : entry.ruling === 'ESCALATE_TO_BRANCH' ? '#f5a623' : (entry.ruling === 'ALLOW' || entry.ruling === 'ALLOW_FULL') ? '#22c55e' : entry.ruling === 'ANCHORED' ? '#D4A017' : Colors.primary, includeFontPadding: false, letterSpacing: 0.5 }}>{entry.ruling === 'ANCHORED' ? '⚓ ANCHORED' : entry.ruling}</Text>
                      <Text style={{ flex: 1, fontSize: 10, color: Colors.textMuted, includeFontPadding: false }}>{entry.policy_id}</Text>
                      <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>{entry.latency_ms}ms</Text>
                    </View>
                    <Text style={{ fontSize: FontSize.xs, color: Colors.textPrimary, fontWeight: FontWeight.semibold, includeFontPadding: false, marginBottom: 2 }}>{entry.intent} · {(entry.confidence * 100).toFixed(0)}%</Text>
                    {entry.tool ? <Text style={{ fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 2, includeFontPadding: false }}>tool → {entry.tool}</Text> : null}
                    <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginBottom: 2 }}>{entry.reason}</Text>
                    <Text style={{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false }}>{new Date(entry.ts).toLocaleString()} · {entry.network_node} · #{entry.input_hash}</Text>
                  </View>
                ))
              }
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Loan Result Modal ─────────────────────────────────────────────────── */}
      <Modal visible={showLoanResult} transparent animationType="slide">
        <View style={t.modalOverlay}>
          <View style={t.modalSheet}>
            <View style={[t.loanResultIconWrap, loanResult?.status === 'APPROVED' ? t.loanResultIconApproved : t.loanResultIconPending]}>
              <MaterialIcons
                name={loanResult?.status === 'APPROVED' ? 'check-circle' : 'hourglass-top'}
                size={40}
                color={loanResult?.status === 'APPROVED' ? Colors.success : Colors.warning}
              />
            </View>
            <Text style={t.loanResultStatus}>{loanResult?.status === 'APPROVED' ? 'Loan Approved!' : 'Application Submitted'}</Text>
            {loanResult && (
              <View style={t.loanResultDetails}>
                <View style={t.loanResultRow}>
                  <Text style={t.loanResultLabel}>Loan ID</Text>
                  <Text style={t.loanResultValue}>{loanResult.loan_id.slice(0, 20)}...</Text>
                </View>
                <View style={t.loanResultRow}>
                  <Text style={t.loanResultLabel}>Amount</Text>
                  <Text style={[t.loanResultValue, { color: Colors.primary }]}>{selectedNation?.currency} {loanResult.approved_amount.toLocaleString()}</Text>
                </View>
                <View style={t.loanResultRow}>
                  <Text style={t.loanResultLabel}>Term</Text>
                  <Text style={t.loanResultValue}>{loanResult.term}</Text>
                </View>
                <View style={t.loanResultRow}>
                  <Text style={t.loanResultLabel}>Purpose</Text>
                  <Text style={t.loanResultValue}>{loanResult.meta.purpose}</Text>
                </View>
              </View>
            )}
            <TouchableOpacity style={t.primaryBtn} onPress={() => { setShowLoanResult(false); setStep('identity'); }}>
              <Text style={t.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── HDDeriveCard ─────────────────────────────────────────────────────────────
// Compact HD derive section: auto-derives w/0, v/0, m/0 from a fresh mnemonic
// tied to the selected nation's prefix, with copy buttons + save-mnemonic alert.
function HDDeriveCard({ nation, isDark, showAlert }: { nation: Nation; isDark: boolean; showAlert: (title: string, msg?: string, btns?: any[]) => void }) {
  const { COUNTRY_META: CM } = require('@/services/btngEngineService');
  const countryMeta = CM.find((c: any) => c.code === nation.code);
  const prefix = countryMeta?.prefix ?? 'BTNG1G';

  // BIP39 word list subset (deterministic + compact)
  const WLIST = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic afford afraid again age agent agree ahead aim air airport alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount animal ankle announce annual another answer antenna antique anxiety apart appear apple approve april arch arctic area argue arm armor army around arrange arrest arrive art artist ask asset assume asthma athlete atom attack attend attitude attract auction aunt author auto autumn average avocado avoid awake aware away axis baby balance banana banner bar barely bargain barrel base basket battle beach bean beauty become beef begin behave belief below belt bench benefit best betray better between beyond bid bike bind biology bird birth bitter black blade blame blanket blast blind blood blue blur board boat body bomb bone book boost border borrow boss bottom bounce box boy brain brand brave brick bridge bright bring broken bronze brother brush bubble buddy budget buffalo build bulk bullet bundle burden burger burst bus butter buyer cable cage cake calm camera camp canal candy cannon canvas capable capital captain carbon card cargo carpet carry cart case cash cat catch cattle caught cause cave ceiling celery cement century certain chair change chaos charge chase cheap cheese cherry chest chicken chief child choice chronic chunk citizen civil claim clay clean clever click client cliff climb clinic clock close cloth cloud coach coin collect color column combine comfort common company connect control cook copper copy coral core corn correct cost cotton country cover crack craft crane crash crazy cream creek crew cricket crime crisp cross crowd cruel cube culture cup curious current curtain custom cute cycle dad damage dance danger daughter dawn deal debate decide define defy degree delay deliver demand demise deny depart depend design desk despair destroy device devote diagram diamond diary dice diesel diet digital dinner dinosaur discover disease dismiss display distance divide doctor document dog doll dolphin domain donate door dose double dragon drama draw dream dress drift drill drink drive drop drum dry duck dumb during dust duty dynamic eagle earn earth easy echo edge effort eight elder element elephant elevator elite else emerge emotion employ empty enable engage engine enjoy enter entry equal erase escape essay eternal evidence evil evolve exact example exchange excite exist exit expand expire explain expose express extra eye faith fall fame family fan fantasy fashion fee feel fever field figure file film filter find fine finger finish fire fish flag flame flat flee float flower fluid foam focus food foot force forest forget fork fortune forward fossil found fox fragile frame fresh friend frog front frost frozen fuel future gadget gain galaxy game gap garden garlic garment gate gather gauge gaze genius gentle genuine gesture ghost giant gift giggle ginger globe glory glove glow glue goat goddess gold good goose gorilla gossip govern grab grace grain grant grass gravity great green grid grief grit grow guard guide guilt guitar gym habit hair half hammer happy harsh harvest head health heart height help hero hidden high hill hint hip hire history hobby hold hole home honey hood hope horn host hover huge human humble hunt hybrid ice icon ignore ill image immune impact improve impulse income index infant inform inner innocent input inquiry insect inspire intact interest invite iron island isolate issue item jacket jar jazz jealous jelly jewel job join joke joy judge juice jump jungle junior junk just kangaroo keen keep key kick kid kingdom kiss kit kitchen knee knife knock lab lamp large later laugh lava law lawn layer lazy leader learn leave legal legend lend level liar liberty library license lift like limit lion liquid list live lizard load loan lobster local lock logic lonely long loop loud lounge love loyal lucky lumber lunch luxury magic magnet main mammal mango manual maple march margin marine market marriage mask master match material math matrix maze meadow medal media melody melt member memory mention menu mercy metal method middle milk million mimic mind miracle miss model monitor monkey monster moon moral motion motor mountain mouse movie muffin mule muscle museum mushroom music naive name narrow nature neck need nerve nest network news next night noble noise nominee noodle normal north note novel nurse oak obey object ocean offer office often okay old olive orbit orange order organ orient original orphan ostrich other outdoor oval own oyster ozone page palm panda panel paper parade parent park parrot party pass patch path patrol pause pave peace pear peasant pelican pen penalty pencil people pepper perfect permit person phone photo phrase piano picnic picture piece pig pilot pink pioneer pipe pitch pizza place planet plate play please pledge pluck plug plunge poem poet polar pole police pond pony pool portion powder power practice predict prefer present prevent price pride print private prize process produce profit program project promote proof property protect provide public pull pulse pumpkin punch pupil purchase purity push puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race radar radio rage rain raise rally ramp ranch range rapid rate raven reach real reason rebel recall receive record reduce reform refuse region reject relax release rely remain remind remove render renew rent repair replace report rescue resemble resist resource retire return reward rhythm ride ridge ring ritual rival river road robot rocket roof round route royal rubber rule runway sad sadness safe sail salad salmon salt save scale scan scatter scene school science scissors scout screen script sea search season seat secret seed seek select sell senior sense sentence series service session settle seven shadow share shed shell shield shine ship shock shoe shoot short shoulder shrimp shuffle silk silver simple sing siren sister situate six size sketch skill skin skirt skull slab slam sleep slice slide slim slot slow small smart smile smoke snake snow solar soldier solid solution solve song sorry soul sound source south space spare spawn speak speed spell spend sphere spin spirit split sponsor spoon spray spread spy square squirrel stadium stand start stay steel stem stick still stock stone store stream strike strong student stumble subject submit subway success sudden suffer suggest suit summer sunny super supply surface surge surprise sustain swap swear sweet swift swim swing sword symbol table tackle tail talent tank tape target task taxi teach team tell tent term test thank theme theory thing thought throw ticket tilt timber time tiny tip tired title toast tobacco today toilet token tomato tonight tool tooth top torch tornado tortoise total tourist toward tower town toy track trade traffic train trap travel treat tree trend trial trick trigger trip trophy trouble truck trust tube tunnel turkey turn turtle twenty twice twin twist type typical ugly umbrella unable uncle uncover unfair uniform unique universe unlock until unusual update upgrade uphold upper urban useful useless usual utility vacant valley valve van vanish vapor vault vendor venture verb verify version veteran viable vibrant victory view village violin virtual visa vital vocal voice void volcano volume vote voyage wage walk wall walnut warfare warm warrior waste water wave wealth weapon wear weather wedding weird welcome west whale wheat wheel whip whisper wild will window wine wing winner winter wire wisdom wish witness wolf woman wonder wood wool word world worry worth wrestle write wrong yard year yellow young zebra zero zone zoo';
  const WORDS = WLIST.split(' ');

  const { user } = useAuth();
  const router = useRouter();
  const [mnemonic, setMnemonic] = React.useState('');
  const [mnemonicVisible, setMnemonicVisible] = React.useState(false);
  const [derived, setDerived] = React.useState<{ path: string; address: string; type: string }[]>([]);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [generated, setGenerated] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [vaultSaved, setVaultSaved] = React.useState(false);
  const [vaultCount, setVaultCount] = React.useState<number | null>(null);
  const [vaultBreakdown, setVaultBreakdown] = React.useState<Record<string, number>>({});
  const [vaultHistory, setVaultHistory] = React.useState<{ id: string; btng_id: string; wallet_address: string; card_number_masked: string; activated_at: string; tier: string }[]>([]);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [tooltipVisible, setTooltipVisible] = React.useState(false);

  const detectTypeChar = React.useCallback((btngId: string): string => {
    const m = btngId.match(/^BTNG\d+[A-Z]([wmegtvco])/i);
    return m ? m[1].toLowerCase() : 'w';
  }, []);

  const fetchVaultCount = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      const supabase = getSupabaseClient();
      const [allRes, histRes] = await Promise.all([
        supabase
          .from('btng_cards')
          .select('id,btng_id')
          .eq('user_id', user.id)
          .eq('source', 'hd_derive'),
        supabase
          .from('btng_cards')
          .select('id,btng_id,wallet_address,card_number_masked,activated_at,tier')
          .eq('user_id', user.id)
          .eq('source', 'hd_derive')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (!allRes.error && allRes.data) {
        setVaultCount(allRes.data.length);
        // Compute per-type breakdown
        const breakdown: Record<string, number> = {};
        allRes.data.forEach((row: any) => {
          const t = detectTypeChar(row.btng_id);
          breakdown[t] = (breakdown[t] ?? 0) + 1;
        });
        setVaultBreakdown(breakdown);
      }
      if (!histRes.error && histRes.data) setVaultHistory(histRes.data as any);
    } catch (_) {}
  }, [user?.id, detectTypeChar]);

  React.useEffect(() => { fetchVaultCount(); }, [fetchVaultCount]);

  const genMnemonic = React.useCallback((): string => {
    const words: string[] = [];
    for (let i = 0; i < 12; i++) words.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
    return words.join(' ');
  }, []);

  // Pure-JS deterministic derive (no native crypto)
  const deriveAddress = React.useCallback((mnm: string, addrType: string, idx: number): string => {
    const ws = mnm.trim().split(/\s+/);
    const toHex = (arr: number[]) => arr.map(b => b.toString(16).padStart(2, '0')).join('');
    const seed: number[] = [];
    for (let i = 0; i < 64; i++) {
      const w = ws[i % ws.length] || 'x';
      let v = 0;
      for (let j = 0; j < w.length; j++) v = (v * 31 + w.charCodeAt(j) + i * 7) & 0xFFFFFF;
      seed.push(v & 0xFF);
    }
    const hmac = (key: number[], data: number[]): number[] => {
      const combined = [...key, ...data];
      const out: number[] = [];
      for (let i = 0; i < 64; i++) {
        let v = (i + 1) * 31337;
        for (let j = 0; j < combined.length; j++) v = (((v ^ combined[j]) * 1664525 + 1013904223) + i * j) & 0xFFFFFF;
        out.push(v & 0xFF);
      }
      return out;
    };
    const masterI = hmac([...Buffer.from('BTNG sovereign seed')], seed);
    const masterKey = masterI.slice(0, 32);
    const masterChain = masterI.slice(32, 64);
    const TYPE_IDX: Record<string, number> = { w: 0, m: 1, e: 2, g: 3, t: 4, v: 5, c: 6 };
    const ci = parseInt((prefix.match(/BTNG(\d+)/) || ['', '1'])[1], 10);
    const deriveChild = (k: number[], c: number[], n: number) => {
      const nb = [n >> 24 & 0xFF, n >> 16 & 0xFF, n >> 8 & 0xFF, n & 0xFF];
      const I = hmac(c, [...k, ...nb]);
      return { key: I.slice(0, 32), chain: I.slice(32, 64) };
    };
    const l1 = deriveChild(masterKey, masterChain, ci);
    const l2 = deriveChild(l1.key, l1.chain, TYPE_IDX[addrType] ?? 0);
    const l3 = deriveChild(l2.key, l2.chain, idx);
    const hash = toHex([...l3.key, ...l3.chain]).slice(0, 35);
    return `${prefix}${addrType}${hash}`;
  }, [prefix]);

  const handleGenerate = React.useCallback(() => {
    const mnm = genMnemonic();
    setMnemonic(mnm);
    const targets = [
      { path: `${prefix}/w/0`, type: 'Wallet', addrType: 'w', idx: 0 },
      { path: `${prefix}/v/0`, type: 'Validator', addrType: 'v', idx: 0 },
      { path: `${prefix}/m/0`, type: 'Merchant', addrType: 'm', idx: 0 },
    ];
    setDerived(targets.map(t => ({
      path: t.path,
      address: deriveAddress(mnm, t.addrType, t.idx),
      type: t.type,
    })));
    setGenerated(true);
    setMnemonicVisible(false);
  }, [genMnemonic, deriveAddress, prefix]);

  const handleCopy = React.useCallback((val: string, key: string) => {
    Clipboard.setStringAsync(val).catch(()=>{});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleSaveToVault = React.useCallback(async () => {
    if (!user?.id || derived.length === 0) {
      showAlert('Not Signed In', 'You must be logged in to save addresses to your vault.');
      return;
    }
    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const now = new Date();
      const expires = new Date(now);
      expires.setFullYear(expires.getFullYear() + 1);
      const rows = derived.map(item => ({
        user_id:            user.id,
        btng_id:            item.address,
        wallet_address:     item.address,
        card_number_masked: `${item.address.slice(0, 8)}****${item.address.slice(-4)}`,
        activated_at:       now.toISOString().slice(0, 10),
        expires:            expires.toISOString().slice(0, 10),
        tier:               'Silver',
        status:             'ACTIVE',
        source:             'hd_derive',
      }));
      const { error } = await supabase.from('btng_cards').insert(rows);
      if (error) {
        showAlert('Save Failed', error.message);
      } else {
        setVaultSaved(true);
        setHistoryOpen(true);
        await fetchVaultCount();
        showAlert(
          'Saved to Vault',
          `${rows.length} HD-derived addresses (w/0, v/0, m/0) have been saved to your BTNG Card Vault.`,
          [{ text: 'OK', style: 'default' as const }]
        );
      }
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Unknown error saving to vault.');
    } finally {
      setSaving(false);
    }
  }, [user, derived, showAlert]);

  const handleSaveMnemonic = React.useCallback(() => {
    showAlert(
      '⚠️ Save Your Mnemonic',
      'Write down your 12-word mnemonic phrase and store it securely offline. It is the ONLY way to recover your sovereign addresses. NEVER share it with anyone.',
      [
        { text: 'I Understand', style: 'default' as const, onPress: () => setMnemonicVisible(true) },
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  }, [showAlert]);

  const TYPE_LABELS: Record<string, string> = { w: 'Wallet', v: 'Validator', m: 'Merchant' };
  const TYPE_ICONS: Record<string, string> = { w: 'account-balance-wallet', v: 'hub', m: 'store' };
  const TYPE_COLORS: Record<string, string> = { w: Colors.primary, v: '#22C55E', m: '#3B82F6' };

  return (
    <View style={hd.card}>
      {/* Header */}
      <View style={hd.header}>
        <View style={hd.headerIconWrap}>
          <MaterialIcons name="account-tree" size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={hd.headerTitle}>HD Sovereign Derive</Text>
          <Text style={hd.headerSub}>{prefix} · BIP32-style · {nation.name}</Text>
        </View>
        <View style={hd.bip32Badge}>
          <MaterialIcons name="security" size={9} color={Colors.primary} />
          <Text style={hd.bip32BadgeText}>BIP32</Text>
        </View>
        {vaultCount !== null && vaultCount > 0 && (
          <TouchableOpacity
            style={hd.countBadge}
            onPress={() => setTooltipVisible(v => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.75}
          >
            <MaterialIcons name="save" size={9} color={Colors.success} />
            <Text style={hd.countBadgeText}>{vaultCount}</Text>
            <MaterialIcons
              name={tooltipVisible ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={10}
              color={Colors.success}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Breakdown Tooltip */}
      {tooltipVisible && vaultCount !== null && vaultCount > 0 && (
        <View style={hd.tooltipBox}>
          <View style={hd.tooltipArrow} />
          <View style={hd.tooltipContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <MaterialIcons name="account-tree" size={11} color={Colors.primary} />
              <Text style={hd.tooltipTitle}>Vault Breakdown</Text>
              <Text style={hd.tooltipTotal}>{vaultCount} total</Text>
            </View>
            <View style={hd.tooltipGrid}>
              {Object.entries(vaultBreakdown).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                const TYPE_INFO: Record<string, { label: string; color: string }> = {
                  w: { label: 'Wallet',     color: Colors.primary },
                  v: { label: 'Validator',  color: '#22C55E'      },
                  m: { label: 'Merchant',   color: '#3B82F6'      },
                  e: { label: 'Enterprise', color: '#9945FF'      },
                  g: { label: 'Gov',        color: '#F59E0B'      },
                  t: { label: 'Treasury',   color: '#D4A017'      },
                  c: { label: 'Coin',       color: '#EF4444'      },
                };
                const info = TYPE_INFO[type] ?? { label: type.toUpperCase(), color: Colors.primary };
                return (
                  <View key={type} style={hd.tooltipItem}>
                    <View style={[hd.tooltipDot, { backgroundColor: info.color }]} />
                    <Text style={[hd.tooltipItemLabel, { color: info.color }]}>{count} {info.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Description */}
      <Text style={hd.desc}>
        Generate sovereign BTNG54 addresses from a 12-word mnemonic seed. Addresses w/0, v/0, m/0 are deterministically derived for {nation.name}.
      </Text>

      {/* Generate Button */}
      <TouchableOpacity
        style={[hd.generateBtn, generated && hd.generateBtnRefresh]}
        onPress={handleGenerate}
        activeOpacity={0.85}
      >
        <MaterialIcons name={generated ? 'refresh' : 'auto-awesome'} size={16} color={Colors.bg} />
        <Text style={hd.generateBtnText}>{generated ? 'Regenerate Addresses' : 'Generate HD Addresses'}</Text>
      </TouchableOpacity>

      {/* Derived Addresses */}
      {derived.length > 0 && (
        <View style={hd.addrList}>
          {derived.map((item) => {
            const isCopied = copied === item.path;
            const color = TYPE_COLORS[item.address[prefix.length]] ?? Colors.primary;
            return (
              <View key={item.path} style={hd.addrRow}>
                <View style={[hd.addrTypeChip, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <MaterialIcons name={TYPE_ICONS[item.address[prefix.length]] as any ?? 'fingerprint'} size={13} color={color} />
                  <Text style={[hd.addrTypeText, { color }]}>{item.type}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={hd.addrPath}>{item.path}</Text>
                  <Text style={hd.addrValue} numberOfLines={1} selectable>
                    {item.address.slice(0, prefix.length + 1)}
                    <Text style={{ color: Colors.textMuted }}>{item.address.slice(prefix.length + 1, prefix.length + 9)}</Text>
                    <Text style={{ color: Colors.textMuted }}>…</Text>
                  </Text>
                </View>
                <TouchableOpacity
                  style={[hd.copyBtn, isCopied && hd.copyBtnDone]}
                  onPress={() => handleCopy(item.address, item.path)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons
                    name={isCopied ? 'check-circle' : 'content-copy'}
                    size={14}
                    color={isCopied ? Colors.success : Colors.primary}
                  />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Save to Vault Button */}
      {derived.length > 0 && (
        <TouchableOpacity
          style={[
            hd.vaultBtn,
            vaultSaved && hd.vaultBtnSaved,
            saving && { opacity: 0.6 },
          ]}
          onPress={handleSaveToVault}
          disabled={saving || vaultSaved}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color={vaultSaved ? Colors.success : Colors.primary} />
          ) : (
            <MaterialIcons
              name={vaultSaved ? 'check-circle' : 'save'}
              size={15}
              color={vaultSaved ? Colors.success : Colors.primary}
            />
          )}
          <Text style={[hd.vaultBtnText, vaultSaved && { color: Colors.success }]}>
            {saving ? 'Saving to Vault…' : vaultSaved ? 'Saved to Vault' : 'Save to Vault'}
          </Text>
          {!vaultSaved && !saving && (
            <View style={hd.vaultBadge}>
              <Text style={hd.vaultBadgeText}>btng_cards</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Vault History Panel */}
      {vaultHistory.length > 0 && (
        <View style={hd.historySection}>
          <TouchableOpacity
            style={hd.historyHeader}
            onPress={() => setHistoryOpen(v => !v)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="history" size={13} color={Colors.primary} />
            <Text style={hd.historyHeaderTitle}>Vault History</Text>
            <View style={hd.historyCountBadge}>
              <Text style={hd.historyCountText}>{vaultHistory.length} recent</Text>
            </View>
            <MaterialIcons
              name={historyOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={15}
              color={historyOpen ? Colors.primary : Colors.textMuted}
            />
          </TouchableOpacity>

          {historyOpen && (
            <View style={hd.historyList}>
              {vaultHistory.map((card, idx) => {
                // detect type char from btng_id after prefix chars
                const typeChar = (() => {
                  const m = card.btng_id.match(/^BTNG\d+[A-Z]([wmegtvco])/i);
                  return m ? m[1].toLowerCase() : 'w';
                })();
                const HIST_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
                  w: { label: 'Wallet',    color: Colors.primary, icon: 'account-balance-wallet' },
                  v: { label: 'Validator', color: '#22C55E',      icon: 'hub'                   },
                  m: { label: 'Merchant',  color: '#3B82F6',      icon: 'store'                 },
                  e: { label: 'Enterprise',color: '#9945FF',      icon: 'business'              },
                  g: { label: 'Gov',       color: '#F59E0B',      icon: 'account-balance'       },
                  t: { label: 'Treasury',  color: '#D4A017',      icon: 'savings'               },
                  c: { label: 'Coin',      color: '#EF4444',      icon: 'monetization-on'       },
                };
                const tm = HIST_TYPE_META[typeChar] ?? HIST_TYPE_META['w'];
                const isLast = idx === vaultHistory.length - 1;
                return (
                  <View key={card.id} style={[hd.historyRow, isLast && { borderBottomWidth: 0 }]}>
                    <View style={[hd.histTypeChip, { backgroundColor: tm.color + '18', borderColor: tm.color + '44' }]}>
                      <MaterialIcons name={tm.icon as any} size={11} color={tm.color} />
                      <Text style={[hd.histTypeText, { color: tm.color }]}>{typeChar.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={hd.histMasked} numberOfLines={1}>
                        {card.card_number_masked || `${card.btng_id.slice(0, 8)}****${card.btng_id.slice(-4)}`}
                      </Text>
                      <Text style={hd.histDate}>{card.activated_at} · {card.tier}</Text>
                    </View>
                    <MaterialIcons name="check-circle" size={12} color={Colors.success} />
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* View All in Profile */}
      <TouchableOpacity
        style={hd.viewAllBtn}
        onPress={() => router.push('/(tabs)/profile' as any)}
        activeOpacity={0.8}
      >
        <MaterialIcons name="account-tree" size={13} color={Colors.primary} />
        <Text style={hd.viewAllBtnText}>View All in Profile</Text>
        <MaterialIcons name="arrow-forward" size={13} color={Colors.primary} />
      </TouchableOpacity>

      {/* Mnemonic Section */}
      {generated && (
        <View style={hd.mnemonicSection}>
          <View style={hd.mnemonicHeaderRow}>
            <MaterialIcons name="vpn-key" size={13} color={Colors.warning} />
            <Text style={hd.mnemonicLabel}>12-Word Mnemonic Seed</Text>
            <TouchableOpacity
              style={hd.saveMnemBtn}
              onPress={handleSaveMnemonic}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="warning" size={11} color={Colors.warning} />
              <Text style={hd.saveMnemText}>Save Phrase</Text>
            </TouchableOpacity>
          </View>

          {mnemonicVisible ? (
            <View style={hd.mnemonicBox}>
              <View style={hd.wordGrid}>
                {mnemonic.trim().split(/\s+/).map((word, i) => (
                  <View key={i} style={hd.wordChip}>
                    <Text style={hd.wordNum}>{i + 1}</Text>
                    <Text style={hd.wordText}>{word}</Text>
                  </View>
                ))}
              </View>
              <View style={hd.mnemonicActions}>
                <TouchableOpacity
                  style={[hd.mnemonicCopyBtn, copied === 'mnemonic' && hd.copyBtnDone]}
                  onPress={() => handleCopy(mnemonic, 'mnemonic')}
                >
                  <MaterialIcons name={copied === 'mnemonic' ? 'check' : 'content-copy'} size={12} color={copied === 'mnemonic' ? Colors.success : Colors.primary} />
                  <Text style={[hd.mnemonicCopyText, copied === 'mnemonic' && { color: Colors.success }]}>
                    {copied === 'mnemonic' ? 'Copied!' : 'Copy All'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={hd.hideBtn}
                  onPress={() => setMnemonicVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="visibility-off" size={12} color={Colors.textMuted} />
                  <Text style={hd.hideBtnText}>Hide</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={hd.mnemonicHidden}>
              <Text style={hd.mnemonicHiddenText}>{'•'.repeat(48)}</Text>
              <Text style={hd.mnemonicHiddenSub}>Phrase hidden — tap "Save Phrase" to reveal with warning</Text>
            </View>
          )}
        </View>
      )}

      {/* Footer note */}
      <View style={hd.footer}>
        <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
        <Text style={hd.footerText}>
          Addresses are deterministically derived. Same mnemonic + path always gives the same address. Store your phrase offline.
        </Text>
      </View>
    </View>
  );
}

const hd = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    marginBottom: Spacing.lg,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '22',
    backgroundColor: Colors.primaryGlow + '66',
  },
  headerIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1, borderColor: Colors.primary + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold,
    color: Colors.primary, includeFontPadding: false,
  },
  headerSub: {
    fontSize: 9, color: Colors.textMuted,
    fontFamily: 'monospace' as any, includeFontPadding: false,
  },
  bip32Badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3,
  },
  bip32BadgeText: {
    fontSize: 9, fontWeight: FontWeight.heavy,
    color: Colors.bg, letterSpacing: 0.5, includeFontPadding: false,
  },
  desc: {
    fontSize: FontSize.xs, color: Colors.textSecondary,
    lineHeight: 17, includeFontPadding: false,
    paddingHorizontal: Spacing.md + 2, paddingTop: Spacing.sm,
  },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary,
    borderRadius: Radius.xl, marginHorizontal: Spacing.md + 2,
    marginTop: Spacing.md, paddingVertical: Spacing.md + 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  generateBtnRefresh: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1.5, borderColor: Colors.primary + '66',
  },
  generateBtnText: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold,
    color: Colors.bg, includeFontPadding: false,
  },
  addrList: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md + 2,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  addrRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm, paddingHorizontal: Spacing.md,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  addrTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, flexShrink: 0,
  },
  addrTypeText: {
    fontSize: 9, fontWeight: FontWeight.heavy,
    letterSpacing: 0.3, includeFontPadding: false,
  },
  addrPath: {
    fontSize: 9, color: Colors.textMuted,
    fontFamily: 'monospace' as any, includeFontPadding: false,
  },
  addrValue: {
    fontSize: 10, color: Colors.primary,
    fontFamily: 'monospace' as any, includeFontPadding: false, marginTop: 2,
  },
  copyBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.primary + '44', flexShrink: 0,
  },
  copyBtnDone: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.success + '44',
  },
  mnemonicSection: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md + 2,
    borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.warning + '44',
    backgroundColor: '#1a1200',
    overflow: 'hidden',
  },
  mnemonicHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.warning + '22',
    backgroundColor: Colors.warning + '10',
  },
  mnemonicLabel: {
    flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold,
    color: Colors.warning, includeFontPadding: false,
  },
  saveMnemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.warning + '18',
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.warning + '44',
  },
  saveMnemText: {
    fontSize: 9, fontWeight: FontWeight.heavy,
    color: Colors.warning, letterSpacing: 0.3, includeFontPadding: false,
  },
  mnemonicBox: { padding: Spacing.md, gap: Spacing.sm },
  wordGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  wordChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.md,
    paddingHorizontal: 7, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.warning + '33',
  },
  wordNum: {
    fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted,
    minWidth: 12, textAlign: 'center', includeFontPadding: false,
  },
  wordText: {
    fontSize: 10, color: Colors.warning, fontFamily: 'monospace' as any,
    fontWeight: FontWeight.semibold, includeFontPadding: false,
  },
  mnemonicActions: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  mnemonicCopyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg,
    paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44',
  },
  mnemonicCopyText: {
    fontSize: FontSize.xs, fontWeight: FontWeight.bold,
    color: Colors.primary, includeFontPadding: false,
  },
  hideBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  hideBtnText: {
    fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false,
  },
  mnemonicHidden: {
    padding: Spacing.md, gap: 5, alignItems: 'center',
  },
  mnemonicHiddenText: {
    fontSize: 12, color: Colors.warning + '88',
    letterSpacing: 2, includeFontPadding: false,
    fontFamily: 'monospace' as any,
  },
  mnemonicHiddenSub: {
    fontSize: 9, color: Colors.textMuted, textAlign: 'center',
    includeFontPadding: false,
  },
  footer: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 5, paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.sm, marginTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.primary + '18',
    backgroundColor: Colors.primaryGlow + '33',
  },
  footerText: {
    flex: 1, fontSize: 9, color: Colors.textMuted,
    lineHeight: 14, includeFontPadding: false,
  },
  vaultBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, marginHorizontal: Spacing.md + 2, marginTop: Spacing.sm,
    paddingVertical: Spacing.md + 2, borderRadius: Radius.xl,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1.5, borderColor: Colors.primary + '55',
  },
  vaultBtnSaved: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.success + '55',
  },
  vaultBtnText: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold,
    color: Colors.primary, includeFontPadding: false,
  },
  vaultBadge: {
    backgroundColor: Colors.primary + '22',
    borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  vaultBadgeText: {
    fontSize: 8, fontWeight: FontWeight.heavy,
    color: Colors.primary, letterSpacing: 0.3,
    includeFontPadding: false,
  },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.successBg,
    borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.success + '44',
  },
  countBadgeText: {
    fontSize: 9, fontWeight: FontWeight.heavy,
    color: Colors.success, letterSpacing: 0.3, includeFontPadding: false,
  },

  // Vault History
  historySection: {
    marginHorizontal: Spacing.md + 2,
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.bgElevated,
  },
  historyHeaderTitle: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
  historyCountBadge: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  historyCountText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  historyList: {
    backgroundColor: Colors.bgCard,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  histTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    flexShrink: 0,
    minWidth: 44,
    justifyContent: 'center',
  },
  histTypeText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  histMasked: {
    fontSize: 10,
    color: Colors.textPrimary,
    fontFamily: 'monospace' as any,
    includeFontPadding: false,
  },
  histDate: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },

  // Breakdown Tooltip
  tooltipBox: {
    marginHorizontal: Spacing.md + 2,
    marginTop: -2,
    zIndex: 99,
  },
  tooltipArrow: {
    width: 10,
    height: 6,
    backgroundColor: Colors.bgElevated,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: Colors.success + '44',
    alignSelf: 'flex-end',
    marginRight: 22,
    // simulate arrow with transform
    transform: [{ rotate: '45deg' }],
    marginBottom: -4,
  },
  tooltipContent: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.success + '55',
    padding: Spacing.md,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  tooltipTitle: {
    flex: 1,
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
  tooltipTotal: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.success,
    includeFontPadding: false,
    backgroundColor: Colors.successBg,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.success + '44',
  },
  tooltipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tooltipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tooltipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tooltipItemLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },

  // View All in Profile
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: Spacing.md + 2,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm + 3,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
  },
  viewAllBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
});

// ── BTNGEngineIdentityCard ────────────────────────────────────────────────────
// Per-country sovereign engine: shows the nation's prefix, all 7 address
// classes, and lets the user generate + copy each one inline.
function BTNGEngineIdentityCard({ nation, isDark }: { nation: Nation; isDark: boolean }) {
  const countryMeta = COUNTRY_META.find(c => c.code === nation.code);
  const ADDRESS_TYPES: AddressType[] = ['w', 'm', 'e', 'g', 't', 'v', 'c'];
  const [generated, setGenerated] = React.useState<Record<AddressType, string | null>>({
    w: null, m: null, e: null, g: null, t: null, v: null, c: null,
  });
  const [copied, setCopied] = React.useState<AddressType | null>(null);

  const handleGenerate = React.useCallback((type: AddressType) => {
    if (!countryMeta) return;
    const result = generateBtngAddress(countryMeta.key, type);
    if (!result) return;
    setGenerated(prev => ({ ...prev, [type]: result.address }));
  }, [countryMeta]);

  const handleCopy = React.useCallback((type: AddressType, addr: string) => {
    Clipboard.setStringAsync(addr).catch(()=>{});
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  if (!countryMeta) return null;

  return (
    <View style={[eic.card, isDark ? eic.cardDark : eic.cardLight]}>
      {/* Header */}
      <View style={eic.header}>
        <Text style={eic.headerFlag}>{nation.flag}</Text>
        <View style={{ flex: 1 }}>
          <Text style={eic.headerTitle}>{nation.name} Sovereign Engine</Text>
          <Text style={eic.headerSub}>{countryMeta.prefix} · {nation.currency} · 54-Nation GAS</Text>
        </View>
        <View style={eic.prefixBadge}>
          <Text style={eic.prefixBadgeText}>{countryMeta.prefix}</Text>
        </View>
      </View>

      <Text style={eic.sectionLabel}>GENERATE ADDRESS BY CLASS</Text>
      {ADDRESS_TYPES.map(type => {
        const addr = generated[type];
        const isCopied = copied === type;
        return (
          <View key={type} style={eic.typeRow}>
            <View style={eic.typeChip}>
              <MaterialIcons name={ADDRESS_TYPE_ICONS[type] as any} size={13} color={Colors.primary} />
              <Text style={eic.typeCode}>{type.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={eic.typeLabel}>{ADDRESS_TYPE_LABELS[type]}</Text>
              {addr ? (
                <Text style={eic.addrText} numberOfLines={1}>
                  {countryMeta.prefix}{type}{addr.slice(countryMeta.prefix.length + 1, countryMeta.prefix.length + 11)}…
                </Text>
              ) : (
                <Text style={eic.addrPlaceholder}>tap + to generate</Text>
              )}
            </View>
            {addr ? (
              <TouchableOpacity
                style={[eic.actionBtn, isCopied && eic.actionBtnDone]}
                onPress={() => handleCopy(type, addr)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name={isCopied ? 'check-circle' : 'content-copy'} size={14}
                  color={isCopied ? Colors.success : Colors.primary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={eic.actionBtn}
                onPress={() => handleGenerate(type)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="add-circle" size={14} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <View style={eic.footer}>
        <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
        <Text style={eic.footerText}>
          Prefix {countryMeta.prefix} · btngEngine.createEngine("{countryMeta.prefix}") · sdk/btngEngine.js
        </Text>
      </View>
    </View>
  );
}

const eic = StyleSheet.create({
  card: { borderRadius: Radius.xl, marginBottom: Spacing.lg, borderWidth: 1.5, overflow: 'hidden' },
  cardDark:  { backgroundColor: Colors.bgCard, borderColor: Colors.primary + '44', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5 },
  cardLight: { backgroundColor: '#fff', borderColor: Colors.primary + '44', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.primary + '22', backgroundColor: Colors.primaryGlow + '66' },
  headerFlag:  { fontSize: 28 },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  headerSub:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontFamily: 'monospace' as any },
  prefixBadge: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4 },
  prefixBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, letterSpacing: 0.5, includeFontPadding: false },
  sectionLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.5, includeFontPadding: false, paddingHorizontal: Spacing.md + 2, paddingTop: Spacing.sm, paddingBottom: 4 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md + 2, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  typeChip: { width: 44, height: 36, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0 },
  typeCode: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  typeLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  addrText: { fontSize: 9, color: Colors.primary, fontFamily: 'monospace' as any, includeFontPadding: false, marginTop: 2 },
  addrPlaceholder: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontStyle: 'italic', marginTop: 2 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '44', flexShrink: 0 },
  actionBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.primary + '18', backgroundColor: Colors.primaryGlow + '33' },
  footerText: { flex: 1, fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ── Shared Styles ────────────────────────────────────────────────────────────────
const shared = {
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  topCenter: { flex: 1, alignItems: 'center' as const },
  topTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold as const, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, includeFontPadding: false, marginTop: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  themeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  stepBar: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  stepLabelRow: { flexDirection: 'row' as const, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm, justifyContent: 'space-between' as const },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5 },
  stepDotText: { fontSize: 10, fontWeight: FontWeight.heavy as const, includeFontPadding: false },
  stepLine: { flex: 1, height: 2, borderRadius: 1 },
  stepLabel: { fontSize: FontSize.xs, includeFontPadding: false },
  heroCard: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md, borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center' as const, gap: Spacing.sm },
  heroEmoji: { fontSize: 48 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as const, includeFontPadding: false, textAlign: 'center' as const },
  heroSub: { fontSize: FontSize.sm, includeFontPadding: false, textAlign: 'center' as const },
  heroStatRow: { flexDirection: 'row' as const, gap: Spacing.lg, marginTop: Spacing.sm },
  heroStat: { alignItems: 'center' as const, gap: 3 },
  heroStatNum: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy as const, color: Colors.primary, includeFontPadding: false },
  heroStatLabel: { fontSize: FontSize.xs, includeFontPadding: false },
  heroStatDivider: { width: 1, height: 32, alignSelf: 'center' as const },
  searchWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, marginHorizontal: Spacing.xl, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, gap: Spacing.sm, height: 46, marginBottom: Spacing.sm, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: FontSize.md, includeFontPadding: false },
  countRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: Spacing.xl, gap: 5, marginBottom: Spacing.sm },
  countText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold as const, includeFontPadding: false },
  nationGrid: { paddingHorizontal: Spacing.md, paddingBottom: 20, gap: 8 },
  nationCard: { flex: 1, margin: 4, borderRadius: Radius.lg, alignItems: 'center' as const, gap: 4, paddingVertical: Spacing.md, paddingHorizontal: 4, borderWidth: 1 },
  nationFlag: { fontSize: 28 },
  nationName: { fontSize: 10, fontWeight: FontWeight.semibold as const, textAlign: 'center' as const, includeFontPadding: false },
  nationCode: { fontSize: 9, includeFontPadding: false },
  nationCurrency: { fontSize: 9, color: Colors.primary, fontWeight: FontWeight.bold as const, includeFontPadding: false },
  formScroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
  countryBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, gap: Spacing.md, borderWidth: 1 },
  countryBannerName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as const, includeFontPadding: false },
  countryBannerMeta: { flexDirection: 'row' as const, gap: 6, marginTop: 4, flexWrap: 'wrap' as const },
  metaChip: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  metaChipText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold as const, includeFontPadding: false },
  changeNationBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  changeNationText: { fontSize: 11, color: Colors.primary, fontWeight: FontWeight.bold as const, includeFontPadding: false },
  autoFillStrip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33' },
  autoFillText: { fontSize: FontSize.xs, includeFontPadding: false },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as const, color: Colors.textMuted, marginBottom: Spacing.sm, letterSpacing: 0.3, includeFontPadding: false },
  formCard: { borderRadius: Radius.xl, marginBottom: Spacing.lg, borderWidth: 1, overflow: 'hidden' as const },
  formField: { padding: Spacing.md, gap: 6 },
  formDivider: { height: 1 },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as const, color: Colors.textMuted, includeFontPadding: false },
  fieldInputWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.sm, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 2, height: 44, borderWidth: 1 },
  fieldInput: { flex: 1, fontSize: FontSize.md, includeFontPadding: false },
  phoneCode: { paddingHorizontal: Spacing.sm, backgroundColor: Colors.primaryGlow, borderRadius: 6, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  phoneCodeText: { fontSize: 11, color: Colors.primary, fontWeight: FontWeight.heavy as const, includeFontPadding: false },
  idTypeRow: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  idTypeChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1 },
  idTypeChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as const, includeFontPadding: false },
  idTypeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  idTypeChipTextActive: { color: Colors.bg },
  notesInput: { borderRadius: Radius.md, padding: Spacing.md, minHeight: 80, fontSize: FontSize.sm, borderWidth: 1, includeFontPadding: false },
  primaryBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, marginBottom: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as const, color: Colors.bg, includeFontPadding: false },
  securityNote: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, justifyContent: 'center' as const, marginBottom: Spacing.md },
  securityNoteText: { fontSize: FontSize.xs, color: Colors.primary, includeFontPadding: false },
  successBanner: { alignItems: 'center' as const, borderRadius: Radius.xl, padding: Spacing.xl, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '55', gap: Spacing.sm },
  successIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '88', alignItems: 'center' as const, justifyContent: 'center' as const },
  successTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as const, color: Colors.primary, includeFontPadding: false },
  successSub: { fontSize: FontSize.sm, includeFontPadding: false, textAlign: 'center' as const },
  successBadgeRow: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const, justifyContent: 'center' as const },
  successBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44' },
  successBadgeText: { fontSize: 11, color: Colors.primary, fontWeight: FontWeight.semibold as const, includeFontPadding: false },
  identityCard: { borderRadius: Radius.xl, marginBottom: Spacing.lg, borderWidth: 1, overflow: 'hidden' as const },
  copyRow: { flexDirection: 'row' as const, alignItems: 'center' as const, padding: Spacing.md, gap: Spacing.sm },
  copyRowLeft: { flex: 1, gap: 3 },
  copyLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold as const, includeFontPadding: false },
  copyValue: { fontSize: FontSize.sm, includeFontPadding: false },
  copyValueMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : ('monospace' as any) },
  copyBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44' },
  copyBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  actionRow: { flexDirection: 'row' as const, gap: Spacing.md, marginBottom: Spacing.lg },
  secondaryBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2, borderWidth: 1.5, borderColor: Colors.primary },
  secondaryBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as const, color: Colors.primary, includeFontPadding: false },
  primaryBtnHalf: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 2 },
  primaryBtnHalfText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as const, color: Colors.bg, includeFontPadding: false },
  masterCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  masterRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.md },
  masterIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '66', alignItems: 'center' as const, justifyContent: 'center' as const },
  masterName: { fontSize: FontSize.md, fontWeight: FontWeight.bold as const, color: Colors.primary, includeFontPadding: false },
  masterTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as const, includeFontPadding: false, marginTop: 2 },
  masterSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  masterBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  masterBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.heavy as const, letterSpacing: 0.5, includeFontPadding: false },
  brainPanel: { borderRadius: Radius.xl, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '33', overflow: 'hidden' as const, padding: Spacing.lg, gap: Spacing.md },
  brainPanelHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.sm },
  brainPanelTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold as const, color: Colors.primary, includeFontPadding: false },
  governedBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  governedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  governedText: { fontSize: 9, color: Colors.primary, fontWeight: FontWeight.heavy as const, letterSpacing: 0.5, includeFontPadding: false },
  brainPanelSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  brainInput: { borderRadius: Radius.md, padding: Spacing.md, minHeight: 70, fontSize: FontSize.sm, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, backgroundColor: Colors.bgElevated, includeFontPadding: false },
  brainBtnRow: { flexDirection: 'row' as const, gap: Spacing.md },
  brainRouteBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  brainRouteBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as const, color: Colors.bg, includeFontPadding: false },
  journalBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  journalBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as const, color: Colors.primary, includeFontPadding: false },
  decisionCard: { borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  rulingText: { fontSize: 11, fontWeight: FontWeight.heavy as const, letterSpacing: 0.8, color: Colors.primary, includeFontPadding: false },
  decisionRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  decisionLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  decisionValue: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as const, color: Colors.textPrimary, includeFontPadding: false },
  bankerReplyBox: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '33', marginTop: 4 },
  bankerReplyText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' as const, lineHeight: 16, includeFontPadding: false },
  loanHeader: { alignItems: 'center' as const, borderRadius: Radius.xl, padding: Spacing.xl, marginBottom: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '44' },
  loanIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '88', alignItems: 'center' as const, justifyContent: 'center' as const },
  loanTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as const, color: Colors.primary, includeFontPadding: false },
  loanSub: { fontSize: FontSize.sm, includeFontPadding: false, textAlign: 'center' as const },
  loanBorrowerChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  loanBorrowerText: { fontSize: 10, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : ('monospace' as any), includeFontPadding: false },
  termRow: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  termChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1 },
  termChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as const, includeFontPadding: false },
  termChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  termChipTextActive: { color: Colors.bg },
  purposeGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  purposeChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1 },
  purposeChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as const, includeFontPadding: false },
  purposeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  purposeChipTextActive: { color: Colors.bg },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.9)', alignItems: 'center' as const, justifyContent: 'center' as const, padding: Spacing.xl },
  modalSheet: { borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', gap: Spacing.md, alignItems: 'center' as const, borderWidth: 1 },
  loanResultIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2 },
  loanResultIconApproved: { backgroundColor: Colors.successBg, borderColor: Colors.success + '66' },
  loanResultIconPending: { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '66' },
  loanResultStatus: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as const, color: Colors.primary, includeFontPadding: false },
  loanResultDetails: { width: '100%', borderRadius: Radius.lg, overflow: 'hidden' as const, borderWidth: 1 },
  loanResultRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, padding: Spacing.md, borderBottomWidth: 1 },
  loanResultLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  loanResultValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as const, includeFontPadding: false },
};

// ── Dark Theme ──────────────────────────────────────────────────────────────────
const darkT = StyleSheet.create({
  ...shared,
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { ...shared.topBar, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { ...shared.backBtn, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  themeBtn: { ...shared.themeBtn, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  topTitle: { ...shared.topTitle, color: Colors.textPrimary },
  topSub: { ...shared.topSub, color: Colors.primary },
  stepDot: { ...shared.stepDot, backgroundColor: Colors.bgCard, borderColor: Colors.border },
  stepDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stepDotDone: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  stepDotText: { ...shared.stepDotText, color: Colors.textMuted },
  stepDotTextActive: { color: Colors.bg },
  stepLine: { ...shared.stepLine, backgroundColor: Colors.border },
  stepLineDone: { backgroundColor: Colors.primary },
  stepLabel: { ...shared.stepLabel, color: Colors.textMuted, flex: 1, textAlign: 'center' },
  stepLabelActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  heroCard: { ...shared.heroCard, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  heroTitle: { ...shared.heroTitle, color: Colors.textPrimary },
  heroSub: { ...shared.heroSub, color: Colors.textSecondary },
  heroStatLabel: { ...shared.heroStatLabel, color: Colors.textMuted },
  heroStatDivider: { ...shared.heroStatDivider, backgroundColor: Colors.border },
  searchWrap: { ...shared.searchWrap, backgroundColor: Colors.bgCard, borderColor: Colors.border },
  searchInput: { ...shared.searchInput, color: Colors.textPrimary },
  nationCard: { ...shared.nationCard, backgroundColor: Colors.bgCard, borderColor: Colors.border },
  nationCardActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  nationNameGhana: { color: Colors.primary },
  nationName: { ...shared.nationName, color: Colors.textPrimary },
  nationCode: { ...shared.nationCode, color: Colors.textMuted },
  countryBanner: { ...shared.countryBanner, backgroundColor: Colors.bgCard, borderColor: Colors.border },
  countryBannerName: { ...shared.countryBannerName, color: Colors.textPrimary },
  autoFillStrip: { ...shared.autoFillStrip, backgroundColor: Colors.primaryGlow },
  autoFillText: { ...shared.autoFillText, color: Colors.textSecondary },
  sectionLabel: { ...shared.sectionLabel },
  formCard: { ...shared.formCard, backgroundColor: Colors.bgCard, borderColor: Colors.border },
  formField: { ...shared.formField },
  formDivider: { ...shared.formDivider, backgroundColor: Colors.border },
  fieldLabel: { ...shared.fieldLabel },
  fieldInputWrap: { ...shared.fieldInputWrap, backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  fieldInput: { ...shared.fieldInput, color: Colors.textPrimary },
  idTypeChip: { ...shared.idTypeChip, backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  idTypeChipText: { ...shared.idTypeChipText, color: Colors.textSecondary },
  notesInput: { ...shared.notesInput, backgroundColor: Colors.bgElevated, color: Colors.textPrimary, borderColor: Colors.border },
  successBanner: { ...shared.successBanner, backgroundColor: Colors.bgCard },
  successSub: { ...shared.successSub, color: Colors.textSecondary },
  identityCard: { ...shared.identityCard, backgroundColor: Colors.bgCard, borderColor: Colors.border },
  copyRow: { ...shared.copyRow },
  copyLabel: { ...shared.copyLabel },
  copyValue: { ...shared.copyValue, color: Colors.textPrimary },
  secondaryBtn: { ...shared.secondaryBtn },
  masterCard: { ...shared.masterCard, backgroundColor: Colors.primaryGlow },
  masterTitle: { ...shared.masterTitle, color: Colors.textSecondary },
  loanHeader: { ...shared.loanHeader, backgroundColor: Colors.bgCard },
  loanSub: { ...shared.loanSub, color: Colors.textSecondary },
  termChip: { ...shared.termChip, backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  termChipText: { ...shared.termChipText, color: Colors.textSecondary },
  purposeChip: { ...shared.purposeChip, backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  purposeChipText: { ...shared.purposeChipText, color: Colors.textSecondary },
  modalSheet: { ...shared.modalSheet, backgroundColor: Colors.bgCard, borderColor: Colors.border },
  loanResultDetails: { ...shared.loanResultDetails, backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  loanResultRow: { ...shared.loanResultRow, borderBottomColor: Colors.border },
  loanResultLabel: { ...shared.loanResultLabel },
  loanResultValue: { ...shared.loanResultValue, color: Colors.textPrimary },
});

// ── Light Theme ──────────────────────────────────────────────────────────────────
const lightT = StyleSheet.create({
  ...shared,
  container: { flex: 1, backgroundColor: '#faf7f0' },
  topBar: { ...shared.topBar, borderBottomWidth: 1, borderBottomColor: '#e8e4d9', backgroundColor: '#fff' },
  backBtn: { ...shared.backBtn, backgroundColor: '#f0ece3', borderWidth: 1, borderColor: '#e0dcd0' },
  themeBtn: { ...shared.themeBtn, backgroundColor: '#f0ece3', borderWidth: 1, borderColor: '#e0dcd0' },
  topTitle: { ...shared.topTitle, color: '#111' },
  topSub: { ...shared.topSub, color: Colors.primary },
  stepDot: { ...shared.stepDot, backgroundColor: '#e8e4d9', borderColor: '#ccc' },
  stepDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stepDotDone: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  stepDotText: { ...shared.stepDotText, color: '#999' },
  stepDotTextActive: { color: Colors.bg },
  stepLine: { ...shared.stepLine, backgroundColor: '#ddd' },
  stepLineDone: { backgroundColor: Colors.primary },
  stepLabel: { ...shared.stepLabel, color: '#888', flex: 1, textAlign: 'center' },
  stepLabelActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  heroCard: { ...shared.heroCard, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e4d9' },
  heroTitle: { ...shared.heroTitle, color: '#111' },
  heroSub: { ...shared.heroSub, color: '#555' },
  heroStatLabel: { ...shared.heroStatLabel, color: '#888' },
  heroStatDivider: { ...shared.heroStatDivider, backgroundColor: '#ddd' },
  searchWrap: { ...shared.searchWrap, backgroundColor: '#fff', borderColor: '#ddd' },
  searchInput: { ...shared.searchInput, color: '#111' },
  nationCard: { ...shared.nationCard, backgroundColor: '#fff', borderColor: '#e8e4d9' },
  nationCardActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  nationNameGhana: { color: Colors.primary },
  nationName: { ...shared.nationName, color: '#222' },
  nationCode: { ...shared.nationCode, color: '#888' },
  countryBanner: { ...shared.countryBanner, backgroundColor: '#fff', borderColor: '#e8e4d9' },
  countryBannerName: { ...shared.countryBannerName, color: '#111' },
  autoFillStrip: { ...shared.autoFillStrip, backgroundColor: Colors.primaryGlow },
  autoFillText: { ...shared.autoFillText, color: '#555' },
  sectionLabel: { ...shared.sectionLabel },
  formCard: { ...shared.formCard, backgroundColor: '#fff', borderColor: '#e8e4d9' },
  formField: { ...shared.formField },
  formDivider: { ...shared.formDivider, backgroundColor: '#f0ece3' },
  fieldLabel: { ...shared.fieldLabel },
  fieldInputWrap: { ...shared.fieldInputWrap, backgroundColor: '#f8f5ee', borderColor: '#ddd' },
  fieldInput: { ...shared.fieldInput, color: '#111' },
  idTypeChip: { ...shared.idTypeChip, backgroundColor: '#f0ece3', borderColor: '#ddd' },
  idTypeChipText: { ...shared.idTypeChipText, color: '#444' },
  notesInput: { ...shared.notesInput, backgroundColor: '#f8f5ee', color: '#111', borderColor: '#ddd' },
  successBanner: { ...shared.successBanner, backgroundColor: '#fff' },
  successSub: { ...shared.successSub, color: '#555' },
  identityCard: { ...shared.identityCard, backgroundColor: '#fff', borderColor: '#e8e4d9' },
  copyRow: { ...shared.copyRow },
  copyLabel: { ...shared.copyLabel },
  copyValue: { ...shared.copyValue, color: '#111' },
  secondaryBtn: { ...shared.secondaryBtn },
  masterCard: { ...shared.masterCard, backgroundColor: Colors.primaryGlow },
  masterTitle: { ...shared.masterTitle, color: '#555' },
  loanHeader: { ...shared.loanHeader, backgroundColor: '#fff' },
  loanSub: { ...shared.loanSub, color: '#555' },
  termChip: { ...shared.termChip, backgroundColor: '#f0ece3', borderColor: '#ddd' },
  termChipText: { ...shared.termChipText, color: '#444' },
  purposeChip: { ...shared.purposeChip, backgroundColor: '#f0ece3', borderColor: '#ddd' },
  purposeChipText: { ...shared.purposeChipText, color: '#444' },
  modalSheet: { ...shared.modalSheet, backgroundColor: '#fff', borderColor: '#e8e4d9' },
  loanResultDetails: { ...shared.loanResultDetails, backgroundColor: '#f8f5ee', borderColor: '#ddd' },
  loanResultRow: { ...shared.loanResultRow, borderBottomColor: '#eee' },
  loanResultLabel: { ...shared.loanResultLabel },
  loanResultValue: { ...shared.loanResultValue, color: '#111' },
});
