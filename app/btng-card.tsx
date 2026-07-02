// BTNG Gold Card Management
// Full card viewer with flip animation, CVV reveal, Top-Up, Controls, History
import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Types ──────────────────────────────────────────────────────────────────────
interface BTNGCard {
  id: string;
  btng_id: string;
  wallet_address: string;
  card_number_masked: string;
  activated_at: string;
  expires: string;
  tier: string;
  status: string;
  source: string;
  created_at: string;
}

const TIER_COLOR: Record<string, string> = {
  Silver: '#A8B8C8',
  Gold: Colors.primary,
  Platinum: '#9945FF',
  Bronze: '#CD7F32',
};

const TIER_BG: Record<string, string> = {
  Silver: '#A8B8C822',
  Gold: Colors.primaryGlow,
  Platinum: '#9945FF18',
  Bronze: '#CD7F3222',
};

// Sample / fallback cards (shown when DB is empty or offline)
const SAMPLE_CARDS: BTNGCard[] = [
  {
    id: 'local-1',
    btng_id: 'BTNG-MPSK2T5K',
    wallet_address: 'BTNG_0578D58D-F0A',
    card_number_masked: '7126 07•• •••• 0003851',
    activated_at: '29 May 2026',
    expires: '05/31',
    tier: 'Silver',
    status: 'ACTIVE',
    source: 'local',
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-2',
    btng_id: 'BTNG-SLV3150',
    wallet_address: 'BTNG_A1B2C3D4-E5F',
    card_number_masked: '7129 03•• •••• 0003150',
    activated_at: '29 May 2026',
    expires: '05/31',
    tier: 'Silver',
    status: 'ACTIVE',
    source: 'local',
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-3',
    btng_id: 'BTNG-GLD8588',
    wallet_address: 'BTNG_F6E5D4C3-B2A',
    card_number_masked: '7131 09•• •••• 0008588',
    activated_at: '29 May 2026',
    expires: '05/31',
    tier: 'Gold',
    status: 'ACTIVE',
    source: 'local',
    created_at: new Date().toISOString(),
  },
];

// ── Full Card Number Generator (deterministic from masked) ──────────────────
function generateFullPAN(masked: string): string {
  // Derive hidden digits from the masked segments consistently
  const parts = masked.split(' ');
  // Format: e.g. "7126 07•• •••• 0003851" → reveal all
  // We fill in the •• and •••• sections with deterministic digits seeded from known parts
  const seed = masked.replace(/[^0-9]/g, '');
  const seedNum = parseInt(seed.slice(0, 8), 10) || 12345678;
  // Generate two groups of hidden digits
  const grp2Hidden = String((seedNum * 31 + 17) % 100).padStart(2, '0');  // 2 digits
  const grp3Hidden = String((seedNum * 53 + 41) % 10000).padStart(4, '0'); // 4 digits

  if (parts.length >= 4) {
    // Pattern: "XXXX XX•• •••• XXXXXXX"
    const p0 = parts[0]; // e.g. 7126
    const p1 = (parts[1] ?? '').replace(/[•·]/g, '').slice(0, 2) + grp2Hidden; // fill hidden
    const p2 = grp3Hidden; // fully hidden group
    const p3 = parts[3] ?? parts[parts.length - 1]; // last group
    return `${p0} ${p1.slice(0,4)} ${p2} ${p3}`;
  }
  // Fallback: just show as-is but replace dots with 0s for demo
  return masked.replace(/[•·]/g, '0');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getBIN(masked: string): string {
  const parts = masked.split(' ');
  return parts[0] ? `${parts[0]} (BTNG-MAINNET)` : 'BTNG-MAINNET';
}

function getPAN(masked: string): string {
  return masked;
}

function getLast4(masked: string): string {
  const parts = masked.split(' ');
  return parts[parts.length - 1] ?? '';
}

function generateCVV(): string {
  return String(Math.floor(100 + Math.random() * 900));
}

// ── Card Visual Component ──────────────────────────────────────────────────────
function CardFace({
  card, owner, flipped, cvvVisible, cvv,
}: {
  card: BTNGCard; owner: string; flipped: boolean; cvvVisible: boolean; cvv: string;
}) {
  const tierColor = TIER_COLOR[card.tier] ?? Colors.primary;

  if (flipped) {
    // Back of card
    return (
      <View style={[cf.card, { borderColor: tierColor + '55' }]}>
        <View style={cf.magStripe} />
        <View style={cf.cvvSection}>
          <Text style={cf.cvvLabel}>CVV / CVC</Text>
          <View style={cf.cvvBox}>
            <Text style={[cf.cvvValue, !cvvVisible && { letterSpacing: 6, color: Colors.textMuted }]}>
              {cvvVisible ? cvv : '• • •'}
            </Text>
          </View>
          {!cvvVisible && (
            <Text style={cf.cvvHint}>Biometric / PIN required · tap Reveal CVV</Text>
          )}
        </View>
        <View style={cf.backFooter}>
          <Text style={cf.backNetwork}>BTNG SOVEREIGN MAINNET</Text>
          <View style={[cf.tierChip, { backgroundColor: tierColor + '22', borderColor: tierColor + '66' }]}>
            <Text style={[cf.tierText, { color: tierColor }]}>{card.tier.toUpperCase()} TIER</Text>
          </View>
        </View>
      </View>
    );
  }

  // Front of card
  return (
    <View style={[cf.card, { borderColor: tierColor + '55' }]}>
      {/* Header */}
      <View style={cf.header}>
        <View style={cf.headerLeft}>
          <View style={[cf.coinWrap, { backgroundColor: tierColor + '22', borderColor: tierColor + '55' }]}>
            <Text style={cf.coinEmoji}>🥇</Text>
          </View>
          <View>
            <Text style={cf.cardTitle}>BTNG GOLD CARD</Text>
            <View style={[cf.tierChip, { backgroundColor: tierColor + '22', borderColor: tierColor + '66' }]}>
              <Text style={[cf.tierText, { color: tierColor }]}>{card.tier.toUpperCase()} TIER</Text>
            </View>
          </View>
        </View>
        <View style={cf.menuDots}>
          <View style={cf.dot} /><View style={cf.dot} /><View style={cf.dot} />
        </View>
      </View>

      {/* Card Number */}
      <Text style={cf.cardNumber}>{card.card_number_masked}</Text>

      {/* Owner row */}
      <View style={cf.ownerRow}>
        <View style={cf.ownerLeft}>
          <MaterialIcons name="person" size={12} color={Colors.textMuted} />
          <Text style={cf.ownerName}>{owner.toUpperCase()}</Text>
        </View>
        <View style={[cf.sovereignBadge]}>
          <Text style={cf.sovereignText}>✦ SOVEREIGN</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={cf.footer}>
        <View>
          <Text style={cf.footerLabel}>EXPIRES</Text>
          <Text style={cf.footerValue}>{card.expires}</Text>
        </View>
        <View style={cf.chipIcon}>
          <MaterialIcons name="memory" size={18} color={tierColor} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={cf.footerLabel}>BTNG-MAINNET</Text>
          <Text style={cf.footerValueSm}>BIN: {card.card_number_masked.split(' ')[0]}</Text>
        </View>
      </View>
    </View>
  );
}

const cf = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 1.586,
    backgroundColor: '#0E0E18',
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    justifyContent: 'space-between',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinWrap: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  coinEmoji: { fontSize: 20 },
  cardTitle: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.textPrimary, letterSpacing: 1.5, includeFontPadding: false },
  tierChip: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, marginTop: 3 },
  tierText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  menuDots: { gap: 3 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textMuted },
  cardNumber: { fontSize: 14, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: 1.5, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  ownerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ownerLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ownerName: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, letterSpacing: 1, includeFontPadding: false },
  sovereignBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '55' },
  sovereignText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  footerLabel: { fontSize: 8, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  footerValue: { fontSize: 14, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  footerValueSm: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  chipIcon: { width: 36, height: 28, borderRadius: 6, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  // Back
  magStripe: { height: 44, backgroundColor: '#1A1A2E', borderRadius: 6, marginTop: 8 },
  cvvSection: { alignItems: 'center', gap: 8 },
  cvvLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.bold, letterSpacing: 1, includeFontPadding: false },
  cvvBox: { backgroundColor: Colors.bgElevated, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, minWidth: 100, alignItems: 'center' },
  cvvValue: { fontSize: 22, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: 8, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  cvvHint: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  backFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backNetwork: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
});

// ── PIN Modal Component ───────────────────────────────────────────────────────
function PINModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: (pin: string) => void }) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const PIN_LENGTH = 6;

  const currentPin = step === 'enter' ? pin : confirmPin;
  const setCurrentPin = step === 'enter' ? setPin : setConfirmPin;

  const handleKey = (key: string) => {
    if (key === 'del') {
      setCurrentPin(prev => prev.slice(0, -1));
      setError('');
      return;
    }
    if (currentPin.length >= PIN_LENGTH) return;
    const next = currentPin + key;
    setCurrentPin(next);
    setError('');
    if (next.length === PIN_LENGTH && step === 'confirm') {
      // Auto-validate on last digit
      setTimeout(() => {
        if (next !== pin) {
          setError('PINs do not match. Try again.');
          setConfirmPin('');
        }
      }, 200);
    }
  };

  const handleNext = () => {
    if (pin.length < PIN_LENGTH) { setError('Enter all 6 digits.'); return; }
    setStep('confirm');
    setError('');
  };

  const handleSubmit = () => {
    if (confirmPin.length < PIN_LENGTH) { setError('Enter all 6 digits.'); return; }
    if (confirmPin !== pin) { setError('PINs do not match. Try again.'); setConfirmPin(''); return; }
    onSuccess(pin);
    // Reset
    setPin(''); setConfirmPin(''); setStep('enter'); setError('');
  };

  const handleCancel = () => {
    setPin(''); setConfirmPin(''); setStep('enter'); setError('');
    onClose();
  };

  if (!visible) return null;

  const KEYS = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['','0','del'],
  ];

  return (
    <View style={pm.overlay}>
      <View style={pm.modal}>
        {/* Header */}
        <View style={pm.header}>
          <View style={pm.iconWrap}>
            <MaterialIcons name="vpn-key" size={26} color={Colors.primary} />
          </View>
          <Text style={pm.title}>{step === 'enter' ? 'Create Card PIN' : 'Confirm PIN'}</Text>
          <Text style={pm.subtitle}>
            {step === 'enter'
              ? 'Enter a new 6-digit PIN for your BTNG Gold Card'
              : 'Re-enter your PIN to confirm'}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={pm.stepRow}>
          <View style={[pm.stepDot, pm.stepDotActive]} />
          <View style={pm.stepLine} />
          <View style={[pm.stepDot, step === 'confirm' && pm.stepDotActive]} />
        </View>
        <View style={pm.stepLabels}>
          <Text style={[pm.stepLabel, pm.stepLabelActive]}>Enter PIN</Text>
          <Text style={[pm.stepLabel, step === 'confirm' && pm.stepLabelActive]}>Confirm PIN</Text>
        </View>

        {/* PIN Dots */}
        <View style={pm.dotsRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => {
            const filled = i < currentPin.length;
            return (
              <View key={i} style={[pm.dot, filled && pm.dotFilled]} >
                {filled && <View style={pm.dotInner} />}
              </View>
            );
          })}
        </View>

        {/* Error */}
        {error ? (
          <View style={pm.errorRow}>
            <MaterialIcons name="error-outline" size={14} color={Colors.error} />
            <Text style={pm.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Numeric Keypad */}
        <View style={pm.keypad}>
          {KEYS.map((row, ri) => (
            <View key={ri} style={pm.keyRow}>
              {row.map((key, ki) => {
                if (!key) return <View key={ki} style={pm.keyEmpty} />;
                return (
                  <TouchableOpacity
                    key={ki}
                    style={[pm.key, key === 'del' && pm.keyDel]}
                    onPress={() => handleKey(key)}
                    activeOpacity={0.7}
                  >
                    {key === 'del'
                      ? <MaterialIcons name="backspace" size={20} color={Colors.textPrimary} />
                      : <Text style={pm.keyText}>{key}</Text>
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={pm.actions}>
          <TouchableOpacity style={pm.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
            <Text style={pm.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          {step === 'enter' ? (
            <TouchableOpacity
              style={[pm.nextBtn, pin.length < PIN_LENGTH && { opacity: 0.45 }]}
              onPress={handleNext}
              disabled={pin.length < PIN_LENGTH}
              activeOpacity={0.85}
            >
              <Text style={pm.nextBtnText}>Next →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[pm.submitBtn, (confirmPin.length < PIN_LENGTH || confirmPin !== pin) && { opacity: 0.45 }]}
              onPress={handleSubmit}
              disabled={confirmPin.length < PIN_LENGTH || confirmPin !== pin}
              activeOpacity={0.85}
            >
              <MaterialIcons name="check-circle" size={16} color={Colors.bg} />
              <Text style={pm.submitBtnText}>Set PIN</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const pm = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 999,
    paddingHorizontal: 24,
  },
  modal: {
    width: '100%', backgroundColor: Colors.bgCard,
    borderRadius: 24, padding: 24,
    borderWidth: 1.5, borderColor: Colors.primary + '55',
    gap: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 16,
  },
  header: { alignItems: 'center', gap: 8 },
  iconWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, includeFontPadding: false },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border },
  stepDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stepLine: { width: 40, height: 2, backgroundColor: Colors.border, marginHorizontal: 4 },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-around' },
  stepLabel: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  stepLabelActive: { color: Colors.primary },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.bgElevated, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  dotFilled: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.bg },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  errorText: { fontSize: FontSize.sm, color: Colors.error, fontWeight: FontWeight.semibold, includeFontPadding: false },
  keypad: { gap: 10 },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  key: { flex: 1, height: 56, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  keyDel: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' },
  keyEmpty: { flex: 1, height: 56 },
  keyText: { fontSize: 22, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 16, backgroundColor: Colors.primary, alignItems: 'center' },
  nextBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  submitBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  submitBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function BtngCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [cards, setCards] = useState<BTNGCard[]>(SAMPLE_CARDS);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'card' | 'topup' | 'controls' | 'history'>('card');
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [cvvVisible, setCvvVisible] = useState(false);
  const [cvv] = useState(generateCVV());
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ── View Full Card Number feature ──────────────────────────────────────────
  const [fullPanVisible, setFullPanVisible] = useState(false);
  const [fullPanPin, setFullPanPin] = useState('');
  const [fullPanError, setFullPanError] = useState('');
  const [fullPanModalStep, setFullPanModalStep] = useState<'pin' | null>(null);
  const [fullPanCountdown, setFullPanCountdown] = useState(0);
  const fullPanTimerRef = useRef<any>(null);

  const PIN_LENGTH = 4;
  const CORRECT_PIN = '1234'; // demo PIN — in production this would be validated server-side

  const startFullPanCountdown = useCallback(() => {
    setFullPanCountdown(30);
    if (fullPanTimerRef.current) clearInterval(fullPanTimerRef.current);
    fullPanTimerRef.current = setInterval(() => {
      setFullPanCountdown(prev => {
        if (prev <= 1) {
          clearInterval(fullPanTimerRef.current);
          setFullPanVisible(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const hideFullPan = useCallback(() => {
    setFullPanVisible(false);
    setFullPanCountdown(0);
    if (fullPanTimerRef.current) clearInterval(fullPanTimerRef.current);
  }, []);

  // Clean up timer on unmount or card change
  useEffect(() => {
    return () => { if (fullPanTimerRef.current) clearInterval(fullPanTimerRef.current); };
  }, []);

  useEffect(() => {
    hideFullPan();
    setFullPanPin('');
    setFullPanError('');
    setFullPanModalStep(null);
  }, [selectedIdx]);

  const handleFullPanPinKey = (key: string) => {
    if (key === 'del') {
      setFullPanPin(prev => prev.slice(0, -1));
      setFullPanError('');
      return;
    }
    if (fullPanPin.length >= PIN_LENGTH) return;
    const next = fullPanPin + key;
    setFullPanPin(next);
    setFullPanError('');
    if (next.length === PIN_LENGTH) {
      setTimeout(() => {
        // Demo: accept any 4-digit PIN (in production: server-verify)
        if (next.length === PIN_LENGTH) {
          setFullPanModalStep(null);
          setFullPanPin('');
          setFullPanVisible(true);
          startFullPanCountdown();
        } else {
          setFullPanError('Incorrect PIN. Please try again.');
          setFullPanPin('');
        }
      }, 180);
    }
  };

  // Flip animation
  const flipAnim = useRef(new Animated.Value(0)).current;
  const isFlipping = useRef(false);

  const selectedCard = cards[selectedIdx] ?? SAMPLE_CARDS[0];
  const fullPAN = generateFullPAN(selectedCard.card_number_masked);
  const ownerName = user?.full_name?.toUpperCase() ?? user?.username?.toUpperCase() ?? 'ADMIN';

  // Load cards from DB
  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('btng_cards')
        .select('*')
        .order('created_at', { ascending: false });
      if (data && data.length > 0) {
        setCards(data);
      } else {
        setCards(SAMPLE_CARDS);
      }
    } catch {
      setCards(SAMPLE_CARDS);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFlip = useCallback(() => {
    if (isFlipping.current) return;
    isFlipping.current = true;
    const toValue = flipped ? 0 : 1;
    Animated.spring(flipAnim, {
      toValue,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start(() => {
      setFlipped(v => !v);
      isFlipping.current = false;
    });
    setCvvVisible(false);
  }, [flipped, flipAnim]);

  const handleCopy = useCallback((value: string, key: string) => {
    Clipboard.setStringAsync(value).catch(()=>{});
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleRevealCVV = useCallback(() => {
    if (!flipped) {
      handleFlip();
      setTimeout(() => setCvvVisible(true), 500);
    } else {
      setCvvVisible(v => !v);
    }
  }, [flipped, handleFlip]);

  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const TABS = [
    { key: 'card', label: 'Card', icon: 'credit-card' },
    { key: 'topup', label: 'Top-Up', icon: 'attach-money' },
    { key: 'controls', label: 'Controls', icon: 'tune' },
    { key: 'history', label: 'History', icon: 'history' },
  ];

  const tierColor = TIER_COLOR[selectedCard.tier] ?? Colors.primary;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Gold Card</Text>
          <Text style={s.topSub}>{cards.length} cards · <Text style={{ color: Colors.success }}>ACTIVE</Text></Text>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={() => showAlert('New Card', 'To generate a new BTNG Gold Card, please use the BTNG Wallet Generator to create a fresh wallet address, then activate your card from the Genesis section.')}
        >
          <MaterialIcons name="add" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Card Selector Strip */}
      <View style={s.selectorWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.selectorRail}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginHorizontal: 16 }} />
          ) : cards.map((card, idx) => {
            const tc = TIER_COLOR[card.tier] ?? Colors.primary;
            const last4 = getLast4(card.card_number_masked);
            const isActive = idx === selectedIdx;
            return (
              <TouchableOpacity
                key={card.id}
                style={[s.selectorChip, isActive && { backgroundColor: tc + '22', borderColor: tc + '88' }]}
                onPress={() => { setSelectedIdx(idx); setFlipped(false); setCvvVisible(false); flipAnim.setValue(0); }}
                activeOpacity={0.8}
              >
                <View style={[s.selectorDot, { backgroundColor: tc }]} />
                <Text style={[s.selectorText, isActive && { color: tc, fontWeight: FontWeight.bold }]}>{last4}</Text>
                <Text style={s.selectorTier}>{card.tier}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={s.newCardChip} onPress={() => showAlert('New Card', 'Generate a new wallet via BTNG Wallet Generator to activate a new card.')}>
            <MaterialIcons name="add" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]}
            onPress={() => setActiveTab(t.key as any)}
          >
            <MaterialIcons name={t.icon as any} size={13} color={activeTab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── CARD TAB ── */}
        {activeTab === 'card' && (
          <>
            {/* Card Visual with Flip Animation */}
            <View style={s.cardContainer}>
              {/* Front */}
              <Animated.View style={[s.cardSide, { transform: [{ rotateY: frontInterpolate }], backfaceVisibility: 'hidden' }]}>
                <CardFace card={selectedCard} owner={ownerName} flipped={false} cvvVisible={false} cvv={cvv} />
              </Animated.View>
              {/* Back */}
              <Animated.View style={[s.cardSide, s.cardBack, { transform: [{ rotateY: backInterpolate }], backfaceVisibility: 'hidden' }]}>
                <CardFace card={selectedCard} owner={ownerName} flipped={true} cvvVisible={cvvVisible} cvv={cvv} />
              </Animated.View>
            </View>

            {/* Action Buttons */}
            <View style={s.actionRow}>
              <TouchableOpacity style={s.actionBtn} onPress={handleFlip} activeOpacity={0.85}>
                <MaterialIcons name="flip" size={16} color={Colors.primary} />
                <Text style={s.actionBtnText}>{flipped ? 'Show Front' : 'Flip Card'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={() => handleCopy(fullPanVisible ? fullPAN : selectedCard.card_number_masked, 'pan')}
                activeOpacity={0.85}
              >
                <MaterialIcons name={copiedField === 'pan' ? 'check-circle' : 'copy-all'} size={16} color={copiedField === 'pan' ? Colors.success : Colors.primary} />
                <Text style={[s.actionBtnText, copiedField === 'pan' && { color: Colors.success }]}>
                  {copiedField === 'pan' ? 'Copied!' : 'Copy PAN'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── View Full Card Number Banner ── */}
            <TouchableOpacity
              style={[s.fullPanCard, fullPanVisible && s.fullPanCardRevealed]}
              onPress={() => {
                if (fullPanVisible) {
                  hideFullPan();
                } else {
                  setFullPanPin('');
                  setFullPanError('');
                  setFullPanModalStep('pin');
                }
              }}
              activeOpacity={0.85}
            >
              <View style={[s.fullPanIcon, fullPanVisible && s.fullPanIconRevealed]}>
                <MaterialIcons
                  name={fullPanVisible ? 'credit-card' : 'credit-card-off'}
                  size={20}
                  color={fullPanVisible ? Colors.success : Colors.primary}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={s.fullPanTitleRow}>
                  <Text style={[s.fullPanTitle, fullPanVisible && { color: Colors.success }]}>
                    {fullPanVisible ? 'Full Card Number' : 'View Full Card Number'}
                  </Text>
                  {fullPanVisible && (
                    <View style={s.fullPanCountdownPill}>
                      <MaterialIcons name="timer" size={10} color={Colors.success} />
                      <Text style={s.fullPanCountdownText}>Hides in {fullPanCountdown}s</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    s.fullPanNumber,
                    fullPanVisible && s.fullPanNumberRevealed,
                  ]}
                  selectable={fullPanVisible}
                >
                  {fullPanVisible ? fullPAN : selectedCard.card_number_masked}
                </Text>
                {!fullPanVisible && (
                  <Text style={s.fullPanSub}>PIN required · Auto-hides after 30 seconds</Text>
                )}
              </View>
              <View style={s.fullPanChevron}>
                {fullPanVisible ? (
                  <MaterialIcons name="visibility-off" size={16} color={Colors.success} />
                ) : (
                  <MaterialIcons name="lock" size={16} color={Colors.textMuted} />
                )}
              </View>
            </TouchableOpacity>

            {/* Full PAN PIN Modal */}
            {fullPanModalStep === 'pin' && (
              <View style={fp.overlay}>
                <View style={fp.modal}>
                  <View style={fp.header}>
                    <View style={fp.iconWrap}>
                      <MaterialIcons name="credit-card" size={28} color={Colors.primary} />
                    </View>
                    <Text style={fp.title}>Verify Identity</Text>
                    <Text style={fp.subtitle}>Enter your 4-digit PIN to reveal the full card number</Text>
                  </View>

                  {/* Masked card preview */}
                  <View style={fp.previewRow}>
                    <View style={[fp.tierDot, { backgroundColor: tierColor }]} />
                    <Text style={fp.previewLabel}>{selectedCard.tier} Card</Text>
                    <Text style={fp.previewMasked}>{selectedCard.card_number_masked}</Text>
                  </View>

                  {/* PIN dots */}
                  <View style={fp.dotsRow}>
                    {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                      <View key={i} style={[fp.dot, i < fullPanPin.length && fp.dotFilled]}>
                        {i < fullPanPin.length && <View style={fp.dotInner} />}
                      </View>
                    ))}
                  </View>

                  {fullPanError ? (
                    <View style={fp.errorRow}>
                      <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                      <Text style={fp.errorText}>{fullPanError}</Text>
                    </View>
                  ) : (
                    <Text style={fp.pinHint}>Demo PIN: any 4 digits</Text>
                  )}

                  {/* Keypad */}
                  <View style={fp.keypad}>
                    {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','del']].map((row, ri) => (
                      <View key={ri} style={fp.keyRow}>
                        {row.map((key, ki) => {
                          if (!key) return <View key={ki} style={fp.keyEmpty} />;
                          return (
                            <TouchableOpacity
                              key={ki}
                              style={[fp.key, key === 'del' && fp.keyDel]}
                              onPress={() => handleFullPanPinKey(key)}
                              activeOpacity={0.7}
                            >
                              {key === 'del'
                                ? <MaterialIcons name="backspace" size={18} color={Colors.textPrimary} />
                                : <Text style={fp.keyText}>{key}</Text>
                              }
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>

                  {/* Cancel */}
                  <TouchableOpacity
                    style={fp.cancelBtn}
                    onPress={() => { setFullPanModalStep(null); setFullPanPin(''); setFullPanError(''); }}
                    activeOpacity={0.8}
                  >
                    <Text style={fp.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Reveal CVV */}
            <TouchableOpacity
              style={[s.revealCvvCard, cvvVisible && { borderColor: Colors.warning + '66', backgroundColor: Colors.warningBg }]}
              onPress={handleRevealCVV}
              activeOpacity={0.85}
            >
              <View style={[s.revealIcon, { backgroundColor: cvvVisible ? Colors.warningBg : Colors.bgElevated, borderColor: cvvVisible ? Colors.warning + '55' : Colors.border }]}>
                <MaterialIcons name={cvvVisible ? 'visibility' : 'visibility-off'} size={18} color={cvvVisible ? Colors.warning : Colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.revealTitle, cvvVisible && { color: Colors.warning }]}>
                  {cvvVisible ? `CVV: ${cvv}` : 'Reveal CVV'}
                </Text>
                <Text style={s.revealSub}>Biometric / PIN — flip card to see</Text>
              </View>
              <MaterialIcons name="lock" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Card Details */}
            <View style={s.detailsCard}>
              <View style={s.detailsHeader}>
                <MaterialIcons name="info-outline" size={14} color={Colors.primary} />
                <Text style={s.detailsTitle}>Card Details</Text>
                <View style={s.activeBadge}>
                  <View style={s.activeDot} />
                  <Text style={s.activeBadgeText}>{selectedCard.status}</Text>
                </View>
              </View>
              {[
                { label: 'Program', value: 'BTNG-GOLD', copy: false },
                { label: 'PAN', value: fullPanVisible ? fullPAN : getPAN(selectedCard.card_number_masked), copy: true, key: 'detPan' },
                { label: 'Expiry', value: selectedCard.expires, copy: false },
                { label: 'BIN', value: getBIN(selectedCard.card_number_masked), copy: false },
                { label: 'Tier', value: selectedCard.tier, color: tierColor },
                { label: 'Wallet', value: selectedCard.wallet_address, copy: true, key: 'wallet', mono: true },
                { label: 'Activated', value: selectedCard.activated_at, copy: false },
                { label: 'BTNG ID', value: selectedCard.btng_id, copy: true, key: 'btngid', mono: true },
              ].map((row, i, arr) => (
                <TouchableOpacity
                  key={row.label}
                  style={[s.detailRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}
                  onPress={row.copy ? () => handleCopy(row.value, row.key!) : undefined}
                  activeOpacity={row.copy ? 0.7 : 1}
                >
                  <Text style={s.detailLabel}>{row.label}</Text>
                  <View style={s.detailValueRow}>
                    <Text
                      style={[s.detailValue, row.mono && s.detailValueMono, row.color ? { color: row.color } : {}]}
                      numberOfLines={1}
                    >
                      {row.value}
                    </Text>
                    {row.copy && (
                      <MaterialIcons
                        name={copiedField === row.key ? 'check-circle' : 'copy-all'}
                        size={11}
                        color={copiedField === row.key ? Colors.success : Colors.textMuted}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── TOP-UP TAB ── */}
        {activeTab === 'topup' && (
          <>
            <View style={s.topupHero}>
              <Text style={{ fontSize: 44 }}>💳</Text>
              <Text style={s.topupTitle}>Top Up Your BTNG Card</Text>
              <Text style={s.topupSub}>Add BTNGG balance to your gold card instantly using your BTNG Wallet or external payment methods.</Text>
            </View>

            {/* Quick Amounts */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Quick Top-Up Amount (BTNGG)</Text>
              <View style={s.quickGrid}>
                {['10', '25', '50', '100', '250', '500', '1000', '2500'].map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={s.quickCard}
                    onPress={() => showAlert('Top-Up', `Top up ${amt} BTNGG (~$${(parseFloat(amt) * 3.25).toFixed(2)} USD) to card ending ${getLast4(selectedCard.card_number_masked)}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Confirm', onPress: () => showAlert('Success', `${amt} BTNGG added to your card!`) },
                    ])}
                    activeOpacity={0.8}
                  >
                    <Text style={s.quickAmt}>{amt}</Text>
                    <Text style={s.quickAmtSub}>≈ ${(parseFloat(amt) * 3.25).toFixed(0)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Payment Methods */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Payment Methods</Text>
              {[
                { icon: 'account-balance-wallet', label: 'BTNG Genesis Wallet', sub: 'Instant · 0% fee', badge: 'Recommended', badgeColor: Colors.success },
                { icon: 'cell-tower', label: 'MTN MoMo', sub: 'Ghana · 0.5% fee', badge: 'GHS', badgeColor: Colors.warning },
                { icon: 'account-balance', label: 'Bank Transfer', sub: '1–3 business days · 1% fee', badge: null, badgeColor: '' },
                { icon: 'credit-card', label: 'VISA / Mastercard', sub: '2.5% international fee', badge: null, badgeColor: '' },
              ].map(method => (
                <TouchableOpacity
                  key={method.label}
                  style={s.methodCard}
                  onPress={() => showAlert('Top-Up via ' + method.label, `Select amount above and confirm. ${method.sub}.`)}
                  activeOpacity={0.8}
                >
                  <View style={s.methodIcon}>
                    <MaterialIcons name={method.icon as any} size={20} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.methodLabel}>{method.label}</Text>
                    <Text style={s.methodSub}>{method.sub}</Text>
                  </View>
                  {method.badge ? (
                    <View style={[s.methodBadge, { backgroundColor: method.badgeColor + '22', borderColor: method.badgeColor + '55' }]}>
                      <Text style={[s.methodBadgeText, { color: method.badgeColor }]}>{method.badge}</Text>
                    </View>
                  ) : (
                    <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── CONTROLS TAB ── */}
        {activeTab === 'controls' && (
          <>
            <View style={s.controlsHeader}>
              <View style={s.controlsIconWrap}>
                <MaterialIcons name="tune" size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.controlsTitle}>Card Controls</Text>
                <Text style={s.controlsSub}>Manage security and limits for card ending {getLast4(selectedCard.card_number_masked)}</Text>
              </View>
              <View style={[s.statusChip, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
                <View style={s.statusDotGreen} />
                <Text style={[s.statusChipText, { color: Colors.success }]}>{selectedCard.status}</Text>
              </View>
            </View>

            {/* Security Controls */}
            <View style={s.controlSection}>
              <Text style={s.sectionTitle}>Security</Text>
              {[
                { icon: 'lock', label: 'Freeze Card', sub: 'Temporarily disable all transactions', destructive: false, action: 'freeze' },
                { icon: 'block', label: 'Block Card', sub: 'Permanently disable and report lost/stolen', destructive: true, action: 'block' },
                { icon: 'vpn-key', label: 'Change PIN', sub: 'Create or update your 6-digit card PIN', destructive: false, action: 'pin' },
                { icon: 'fingerprint', label: 'Biometric Auth', sub: 'Require biometric for all transactions', destructive: false, action: 'bio' },
              ].map(ctrl => (
                <TouchableOpacity
                  key={ctrl.label}
                  style={s.controlCard}
                  onPress={() => {
                    if (ctrl.action === 'pin') { showAlert('PIN Feature', 'Card PIN setup is coming soon. This feature will be enabled in the next update.'); return; }
                    showAlert(ctrl.label, `Are you sure you want to ${ctrl.label.toLowerCase()}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Confirm', style: ctrl.destructive ? 'destructive' : 'default', onPress: () => showAlert('Done', `${ctrl.label} applied to your card.`) },
                    ]);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[s.controlIcon, ctrl.destructive && { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }]}>
                    <MaterialIcons name={ctrl.icon as any} size={18} color={ctrl.destructive ? Colors.error : Colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.controlLabel, ctrl.destructive && { color: Colors.error }]}>{ctrl.label}</Text>
                    <Text style={s.controlSub}>{ctrl.sub}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={ctrl.destructive ? Colors.error : Colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Spending Limits */}
            <View style={s.controlSection}>
              <Text style={s.sectionTitle}>Spending Limits</Text>
              {[
                { label: 'Daily Limit', value: '1,000 BTNGG', icon: 'today' },
                { label: 'Weekly Limit', value: '5,000 BTNGG', icon: 'date-range' },
                { label: 'Monthly Limit', value: '20,000 BTNGG', icon: 'calendar-month' },
                { label: 'Single Transaction', value: '500 BTNGG', icon: 'payment' },
              ].map(limit => (
                <TouchableOpacity
                  key={limit.label}
                  style={s.limitCard}
                  onPress={() => showAlert('Edit ' + limit.label, `Current limit: ${limit.value}\n\nContact BTNG support to adjust your spending limits.`)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name={limit.icon as any} size={16} color={Colors.primary} />
                  <Text style={s.limitLabel}>{limit.label}</Text>
                  <Text style={s.limitValue}>{limit.value}</Text>
                  <MaterialIcons name="edit" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Notifications */}
            <View style={s.controlSection}>
              <Text style={s.sectionTitle}>Notification Preferences</Text>
              {[
                { label: 'Transaction Alerts', sub: 'Every card transaction' },
                { label: 'Top-Up Confirmation', sub: 'When funds are added' },
                { label: 'Security Alerts', sub: 'Suspicious activity detected' },
                { label: 'Monthly Statement', sub: 'Email PDF every month' },
              ].map((notif, i) => (
                <View key={notif.label} style={[s.notifCard, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.notifLabel}>{notif.label}</Text>
                    <Text style={s.notifSub}>{notif.sub}</Text>
                  </View>
                  <View style={s.notifToggle}>
                    <View style={s.notifToggleDot} />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <>
            <View style={s.historyHeader}>
              <Text style={s.historyTitle}>Transaction History</Text>
              <Text style={s.historySub}>Card ending {getLast4(selectedCard.card_number_masked)}</Text>
            </View>

            {/* Summary */}
            <View style={s.histSummary}>
              {[
                { label: 'This Month', value: '₵0.00', icon: 'calendar-month', color: Colors.primary },
                { label: 'Total Spent', value: '₵0.00', icon: 'account-balance-wallet', color: Colors.warning },
                { label: 'Transactions', value: '0', icon: 'receipt', color: Colors.success },
              ].map(item => (
                <View key={item.label} style={[s.histSumCard, { borderColor: item.color + '33' }]}>
                  <MaterialIcons name={item.icon as any} size={16} color={item.color} />
                  <Text style={[s.histSumValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={s.histSumLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Empty state */}
            <View style={s.histEmpty}>
              <Text style={{ fontSize: 48 }}>📋</Text>
              <Text style={s.histEmptyTitle}>No Transactions Yet</Text>
              <Text style={s.histEmptySub}>Card transactions will appear here once you start using your BTNG Gold Card for purchases.</Text>
              <TouchableOpacity style={s.histEmptyBtn} onPress={() => setActiveTab('topup')} activeOpacity={0.85}>
                <MaterialIcons name="attach-money" size={15} color={Colors.bg} />
                <Text style={s.histEmptyBtnText}>Top Up Card</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
      {/* PIN Modal — disabled, coming soon */}
    </View>
  );
}

// ── Full PAN PIN Modal Styles ─────────────────────────────────────────────────────
const fp = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
    paddingHorizontal: 20,
  },
  modal: {
    width: '100%', backgroundColor: Colors.bgCard,
    borderRadius: 24, padding: 24,
    borderWidth: 1.5, borderColor: Colors.primary + '66',
    gap: 18,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 24, elevation: 20,
  },
  header: { alignItems: 'center', gap: 8 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, includeFontPadding: false },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  tierDot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  previewLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  previewMasked: { flex: 1, fontSize: 13, fontWeight: FontWeight.bold, color: Colors.textSecondary, letterSpacing: 1.5, textAlign: 'right', includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  dotFilled: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  dotInner: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: Colors.bg },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  errorText: { fontSize: FontSize.sm, color: Colors.error, fontWeight: FontWeight.semibold, includeFontPadding: false },
  pinHint: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  keypad: { gap: 10 },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  key: { flex: 1, height: 54, borderRadius: 14, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  keyDel: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' },
  keyEmpty: { flex: 1, height: 54 },
  keyText: { fontSize: 22, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cancelBtn: { paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, position: 'relative', width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  selectorWrap: { paddingVertical: Spacing.sm },
  selectorRail: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, alignItems: 'center' },
  selectorChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  selectorDot: { width: 7, height: 7, borderRadius: 3.5 },
  selectorText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  selectorTier: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  newCardChip: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, gap: 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.lg },
  // Card container
  cardContainer: { width: '100%', position: 'relative' },
  cardSide: { width: '100%' },
  cardBack: { position: 'absolute', top: 0, left: 0, right: 0 },
  // Actions
  actionRow: { flexDirection: 'row', gap: Spacing.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, paddingVertical: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  // CVV
  revealCvvCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  revealIcon: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  revealTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  revealSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  // Details card
  detailsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: 1 },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  detailsTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  activeBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.5, includeFontPadding: false },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm + 3 },
  detailLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  detailValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '65%' },
  detailValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  detailValueMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  // Top-up
  topupHero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  topupTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topupSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  section: { gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.3, includeFontPadding: false },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickCard: { width: '22%', flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 3 },
  quickAmt: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  quickAmtSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  methodCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  methodIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  methodLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  methodSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  methodBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  methodBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  // Controls
  controlsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  controlsIconWrap: { width: 52, height: 52, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  controlsTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  controlsSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, flexShrink: 0 },
  statusDotGreen: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  statusChipText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  controlSection: { gap: Spacing.sm },
  controlCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  controlIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  controlLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  controlSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  limitCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  limitLabel: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  limitValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  notifCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, padding: Spacing.md, paddingHorizontal: Spacing.lg },
  notifLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  notifSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  notifToggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'flex-end', paddingHorizontal: 3, justifyContent: 'center' },
  notifToggleDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  // Full PAN card
  fullPanCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  fullPanCardRevealed: { borderColor: Colors.success + '66', backgroundColor: '#0A1A0E' },
  fullPanIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fullPanIconRevealed: { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' },
  fullPanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fullPanTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  fullPanCountdownPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '44' },
  fullPanCountdownText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  fullPanNumber: { fontSize: 16, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 2, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  fullPanNumberRevealed: { color: Colors.success, fontSize: 17 },
  fullPanSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  fullPanChevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // History
  historyHeader: { gap: 3 },
  historyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historySub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  histSummary: { flexDirection: 'row', gap: Spacing.sm },
  histSumCard: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 4 },
  histSumValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  histSumLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  histEmpty: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md },
  histEmptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  histEmptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  histEmptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl },
  histEmptyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
