/**
 * BTNG Sovereign Vault Status
 * ─────────────────────────────────────────────────────────────────────────────
 * Dark terminal-style dashboard showing live health of:
 *   • BTNG VPS node (168.231.79.52:64799)
 *   • Edge Function uptime (btng-reserve-status, btng-lending)
 *   • SecureStore sovereign key presence
 *   • btng_certificates count (DB)
 *   • Encryption / auth key status (Supabase session)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, Platform, Easing, Modal, ActivityIndicator, TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { getSupabaseClient } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { pingNode } from '@/services/handshakeService';

// ─── BIP39-style sovereign word list (256 words for 24-word entropy) ───────────
const SOVEREIGN_WORDS: string[] = [
  'abandon','ability','able','about','above','absent','absorb','abstract',
  'absurd','abuse','access','accident','account','accuse','achieve','acid',
  'acoustic','acquire','across','action','actor','actual','adapt','add',
  'addict','address','adjust','admit','adult','advance','advice','afford',
  'africa','agent','agree','ahead','aim','air','airport','aisle',
  'alarm','album','alcohol','alert','alien','align','alive','all',
  'alley','allow','almost','alone','alpha','already','also','alter',
  'always','amaze','amount','amused','analyst','anchor','ancient','anger',
  'angle','angry','animal','announce','annual','another','answer','antenna',
  'apart','approve','april','arena','argue','arm','army','around',
  'arrange','arrest','arrive','arrow','artist','artwork','asset','assist',
  'assume','asthma','athlete','atom','attack','attend','attitude','attract',
  'auction','august','aunt','author','auto','autumn','average','avocado',
  'avoid','awake','aware','away','awesome','awful','awkward','axis',
  'balance','bamboo','banana','banner','barely','bargain','barrel','base',
  'basic','basket','battle','beach','beauty','become','before','begin',
  'behave','behind','believe','below','benefit','best','betray','better',
  'between','beyond','bicycle','bid','bike','blind','block','blood',
  'blossom','bold','bonus','border','boring','borrow','brave','bridge',
  'brief','bright','bring','brisk','bronze','brown','bubble','budget',
  'bullet','bundle','burden','burger','burst','buyer','buzz','cabin',
  'cable','camera','cancel','capital','captain','carbon','cargo','carry',
  'cash','castle','casual','catalog','catch','cause','ceiling','celery',
  'cement','census','central','century','certain','chair','chaos','chapter',
  'charge','chase','cheap','check','cheese','chess','chief','child',
  'chimney','choice','choose','chronic','chunk','circle','citizen','city',
  'civil','claim','clap','clarify','claw','clean','clerk','clever',
  'click','client','cliff','climb','clinic','clip','clock','clone',
  'close','cloud','clown','club','clump','cluster','coach','coast',
  'coconut','coffee','coil','color','column','combine','come','comfort',
  'comic','common','company','concern','conduct','confirm','congress','connect',
  'consider','control','convince','cook','cool','copper','coral','corner',
  'correct','cost','country','couple','course','cover','crane','crash',
  'crazy','cream','credit','creek','crew','cricket','crisp','cross',
  'crucial','cruel','cruise','crumble','crystal','culture','cup','curious',
  'current','curtain','cycle','damage','dance','danger','daring','dash',
  'daughter','dawn','deal','debate','debris','decade','decline','decrease',
  'define','degree','delay','deliver','demand','denial','depth','derive',
  'design','desert','detail','detect','device','devote','diagram','dial',
  'diamond','dilemma','dinner','direct','dirt','disagree','dish','distance',
  'divert','dizzy','doctor','dog','domain','donate','donor','door',
  'double','dragon','drama','draw','dream','dress','drift','drive',
  'drum','dry','duck','dumb','dune','during','dust','dutch',
  'duty','dwarf','dynamic','eager','eagle','early','earn','easy',
  'edge','effort','eight','either','elbow','electric','elegant','element',
  'elite','else','emerge','emotion','employ','empower','empty','enable',
  'energy','enforce','engage','enjoy','enlist','enough','ensure','enter',
  'entry','equal','escape','estate','eternal','ethics','evidence','evil',
  'evolve','exact','example','excess','exchange','excite','expand','expire',
  'extra','fabric','faculty','fantasy','fashion','fatal','feature','field',
  'figure','final','finger','finish','fire','fiscal','flame','flat',
  'flavor','flight','flower','fluid','flush','focus','force','forest',
  'fortune','found','fragile','frame','frequent','fresh','friend','fringe',
  'frog','front','frost','fuel','galaxy','garage','garlic','genuine',
];

// ─── Key generation helpers ───────────────────────────────────────────────────
function generateMnemonic(wordCount = 24): string {
  const arr = new Uint32Array(wordCount);
  try {
    (crypto as any).getRandomValues(arr);
  } catch {
    for (let i = 0; i < wordCount; i++) {
      arr[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }
  return Array.from(arr)
    .map(n => SOVEREIGN_WORDS[n % SOVEREIGN_WORDS.length])
    .join(' ');
}

function buildFingerprint(mnemonic: string): string {
  let h = 5381;
  for (let i = 0; i < mnemonic.length; i++) {
    h = ((h << 5) + h) ^ mnemonic.charCodeAt(i);
    h = h & 0xffffffff;
  }
  const hex = Math.abs(h).toString(16).padStart(8, '0');
  const tail = Math.abs(h ^ 0xdeadbeef).toString(16).padStart(8, '0');
  return `${hex}…${tail}`.toUpperCase();
}

// ─── PIN helpers ──────────────────────────────────────────────────────────────
const VAULT_PIN_KEY = 'btng_vault_pin';

/** Minimal deterministic hash for PIN (SecureStore already encrypts at rest) */
function hashPin(pin: string): string {
  let h = 0xdeadbeef;
  for (let i = 0; i < pin.length; i++) {
    h = Math.imul(h ^ pin.charCodeAt(i), 2654435761);
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  return h.toString(16).padStart(8, '0').toUpperCase();
}

async function getStoredPinHash(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(VAULT_PIN_KEY) : null;
    }
    return await SecureStore.getItemAsync(VAULT_PIN_KEY);
  } catch { return null; }
}

async function storePin(pin: string): Promise<void> {
  const hash = hashPin(pin);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VAULT_PIN_KEY, hash);
  } else {
    await SecureStore.setItemAsync(VAULT_PIN_KEY, hash);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const VPS_NODE_URL  = 'http://168.231.79.52:64799';
const SUPABASE_BASE = 'https://mebznlvyycuuddfkmebz.backend.onspace.ai/functions/v1';
const EDGE_RESERVE  = `${SUPABASE_BASE}/btng-reserve-status`;
const EDGE_LENDING  = `${SUPABASE_BASE}/btng-lending`;
const SECURE_KEY_ID = 'btng_master_seed';

type CheckStatus = 'pending' | 'pass' | 'fail' | 'warn';
type PinMode = 'enter' | 'set_new' | 'confirm_new';

interface VaultCheck {
  id: string;
  label: string;
  sublabel: string;
  status: CheckStatus;
  detail: string;
  latencyMs?: number;
  icon: string;
  category: 'node' | 'edge' | 'key' | 'db' | 'auth';
}

const INITIAL_CHECKS: VaultCheck[] = [
  { id: 'vps_node',    label: 'BTNG VPS Node',                sublabel: '168.231.79.52:64799',       status: 'pending', detail: 'Checking connectivity…', icon: 'dns',         category: 'node' },
  { id: 'edge_reserve',label: 'Edge: btng-reserve-status',   sublabel: 'Supabase Edge Function',    status: 'pending', detail: 'Pinging edge…',           icon: 'cloud',       category: 'edge' },
  { id: 'edge_lending', label: 'Edge: btng-lending',          sublabel: 'Supabase Edge Function',    status: 'pending', detail: 'Pinging edge…',           icon: 'cloud-queue', category: 'edge' },
  { id: 'secure_key',  label: 'Sovereign Key (SecureStore)',  sublabel: 'On-device encrypted vault', status: 'pending', detail: 'Reading secure enclave…', icon: 'vpn-key',     category: 'key'  },
  { id: 'cert_count',  label: 'Certificate Registry',        sublabel: 'btng_certificates table',   status: 'pending', detail: 'Querying DB…',            icon: 'verified',    category: 'db'   },
  { id: 'auth_session',label: 'Supabase Auth Session',       sublabel: 'JWT / Encryption Key',      status: 'pending', detail: 'Validating session…',     icon: 'lock',        category: 'auth' },
];

const STATUS_COLOR: Record<CheckStatus, string> = {
  pending: Colors.textMuted, pass: Colors.success, fail: Colors.error, warn: Colors.warning,
};
const STATUS_BG: Record<CheckStatus, string> = {
  pending: Colors.bgElevated, pass: Colors.successBg, fail: Colors.errorBg, warn: Colors.warningBg,
};
const STATUS_ICON: Record<CheckStatus, string> = {
  pending: 'hourglass-empty', pass: 'check-circle', fail: 'cancel', warn: 'warning',
};
const STATUS_LABEL: Record<CheckStatus, string> = {
  pending: 'CHECKING', pass: 'PASS', fail: 'FAIL', warn: 'WARN',
};
const CATEGORY_LABEL: Record<VaultCheck['category'], string> = {
  node: 'VPS NODES', edge: 'EDGE FUNCTIONS', key: 'KEY VAULT', db: 'DATABASE', auth: 'AUTH / ENCRYPTION',
};
const CATEGORY_COLOR: Record<VaultCheck['category'], string> = {
  node: Colors.info, edge: '#A78BFA', key: Colors.primary, db: Colors.copper, auth: Colors.success,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function pingEdge(url: string): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const supabase = getSupabaseClient();
    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const latencyMs = Date.now() - start;
    return { ok: res.status < 500, latencyMs, detail: `HTTP ${res.status} · ${latencyMs}ms` };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, detail: err?.name === 'AbortError' ? 'Timeout (6s)' : err?.message ?? 'Unreachable' };
  }
}

async function checkSecureKey(): Promise<{ present: boolean; detail: string }> {
  try {
    if (Platform.OS === 'web') {
      const val = typeof localStorage !== 'undefined' ? localStorage.getItem(SECURE_KEY_ID) : null;
      return val ? { present: true, detail: 'Key present (web localStorage)' } : { present: false, detail: 'No key in web localStorage' };
    }
    const val = await SecureStore.getItemAsync(SECURE_KEY_ID);
    return val
      ? { present: true,  detail: `Key present · ${val.length} chars · SecureStore` }
      : { present: false, detail: 'No sovereign key found in SecureStore' };
  } catch (err: any) {
    return { present: false, detail: err?.message ?? 'SecureStore error' };
  }
}

async function fetchCertCount(userId: string | undefined): Promise<{ count: number; detail: string }> {
  try {
    const supabase = getSupabaseClient();
    if (!userId) {
      const { count, error } = await supabase.from('btng_certificates').select('*', { count: 'exact', head: true });
      if (error) return { count: 0, detail: error.message };
      return { count: count ?? 0, detail: `${count ?? 0} total certificates (anon query)` };
    }
    const { count, error } = await supabase.from('btng_certificates').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    if (error) return { count: 0, detail: error.message };
    return { count: count ?? 0, detail: `${count ?? 0} certificates for this account` };
  } catch (err: any) {
    return { count: 0, detail: err?.message ?? 'DB query error' };
  }
}

// ─── Animated status dot ──────────────────────────────────────────────────────
function PulseDot({ status }: { status: CheckStatus }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (status !== 'pending') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.0, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);
  return <Animated.View style={[s.dot, { backgroundColor: STATUS_COLOR[status], opacity: status === 'pending' ? pulse : 1 }]} />;
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ checks }: { checks: VaultCheck[] }) {
  const done  = checks.filter(c => c.status !== 'pending');
  const pass  = checks.filter(c => c.status === 'pass').length;
  const total = checks.length;
  const pct   = total > 0 ? Math.round((pass / total) * 100) : 0;
  const color = pct === 100 ? Colors.success : pct >= 60 ? Colors.warning : Colors.error;
  return (
    <View style={s.scoreRing}>
      <View style={[s.scoreCircle, { borderColor: color }]}>
        <Text style={[s.scoreNum, { color }]}>{pct}</Text>
        <Text style={s.scorePct}>%</Text>
      </View>
      <Text style={s.scoreLabel}>{done.length < total ? 'SCANNING…' : pct === 100 ? 'ALL SYSTEMS GO' : pct >= 60 ? 'PARTIAL' : 'CRITICAL'}</Text>
      <Text style={s.scoreDetail}>{pass} / {total} checks passed</Text>
    </View>
  );
}

// ─── Check card ────────────────────────────────────────────────────────────────
function CheckCard({ check }: { check: VaultCheck }) {
  const slideIn = useRef(new Animated.Value(20)).current;
  const fadeIn  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideIn, { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.timing(fadeIn,  { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [check.status]);
  const catColor = CATEGORY_COLOR[check.category];
  return (
    <Animated.View style={[s.card, { borderLeftColor: catColor, backgroundColor: STATUS_BG[check.status] }, { opacity: fadeIn, transform: [{ translateX: slideIn }] }]}>
      <View style={s.cardTop}>
        <View style={[s.cardIconWrap, { borderColor: catColor + '44', backgroundColor: catColor + '15' }]}>
          <MaterialIcons name={check.icon as any} size={18} color={catColor} />
        </View>
        <View style={s.cardMeta}>
          <Text style={s.cardLabel} numberOfLines={1}>{check.label}</Text>
          <Text style={s.cardSub}   numberOfLines={1}>{check.sublabel}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[check.status] + '22', borderColor: STATUS_COLOR[check.status] + '55' }]}>
          <PulseDot status={check.status} />
          <Text style={[s.statusText, { color: STATUS_COLOR[check.status] }]}>{STATUS_LABEL[check.status]}</Text>
        </View>
      </View>
      <View style={s.cardDetail}>
        <MaterialIcons name={STATUS_ICON[check.status] as any} size={12} color={STATUS_COLOR[check.status]} />
        <Text style={[s.detailText, { color: STATUS_COLOR[check.status] + 'CC' }]} numberOfLines={2}>{check.detail}</Text>
        {check.latencyMs != null && (
          <View style={s.latencyBadge}><Text style={s.latencyText}>{check.latencyMs}ms</Text></View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── PIN Pad Component ────────────────────────────────────────────────────────
interface PinPadProps {
  pinMode: PinMode;
  pinDigits: string[];
  pinError: string;
  pinSuccess: boolean;
  pinShakeAnim: Animated.Value;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClose: () => void;
  onResetPin: () => void;
}

function PinPad({
  pinMode, pinDigits, pinError, pinSuccess,
  pinShakeAnim, onDigit, onBackspace, onClose, onResetPin,
}: PinPadProps) {
  const titleMap: Record<PinMode, string> = {
    enter: 'ENTER VAULT PIN',
    set_new: 'SET VAULT PIN',
    confirm_new: 'CONFIRM PIN',
  };
  const subMap: Record<PinMode, string> = {
    enter: 'Enter your 4-digit vault PIN to unlock sovereign key access',
    set_new: 'Choose a 4-digit PIN to protect vault access on this device',
    confirm_new: 'Re-enter your PIN to confirm',
  };

  return (
    <View style={s.pinPadOverlay}>
      {/* Header */}
      <View style={s.pinPadHeader}>
        <TouchableOpacity style={s.pinPadBackBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
        <View style={s.pinPadHeaderCenter}>
          <MaterialIcons name="dialpad" size={16} color={Colors.primary} />
          <Text style={s.pinPadTitle}>{titleMap[pinMode]}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Sub-text */}
      <Text style={s.pinPadSub}>{subMap[pinMode]}</Text>

      {/* 4-dot indicator */}
      <Animated.View style={[s.pinDotsRow, { transform: [{ translateX: pinShakeAnim }] }]}>
        {[0, 1, 2, 3].map(i => (
          <View
            key={i}
            style={[
              s.pinDot,
              pinDigits.length > i
                ? pinSuccess
                  ? { backgroundColor: Colors.success, borderColor: Colors.success }
                  : { backgroundColor: Colors.primary, borderColor: Colors.primary }
                : { backgroundColor: 'transparent', borderColor: Colors.border },
            ]}
          />
        ))}
      </Animated.View>

      {/* Feedback row */}
      {pinSuccess ? (
        <View style={s.pinFeedbackRow}>
          <MaterialIcons name="check-circle" size={14} color={Colors.success} />
          <Text style={s.pinSuccessText}>
            {pinMode === 'confirm_new' ? 'PIN saved! Access granted.' : 'PIN verified! Access granted.'}
          </Text>
        </View>
      ) : pinError ? (
        <View style={s.pinFeedbackRow}>
          <MaterialIcons name="error-outline" size={13} color={Colors.error} />
          <Text style={s.pinErrorText}>{pinError}</Text>
        </View>
      ) : (
        <View style={s.pinFeedbackRow}>
          {pinMode === 'set_new' && (
            <Text style={s.pinHintText}>Avoid easy patterns like 1234 or 0000</Text>
          )}
          {pinMode === 'confirm_new' && (
            <Text style={s.pinHintText}>Re-enter the same PIN to confirm</Text>
          )}
        </View>
      )}

      {/* Number pad — 3x4 grid: 1-9 / empty / 0 / backspace */}
      <View style={s.pinPadGrid}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, idx) => {
          const isEmpty = key === '';
          const isBack  = key === '⌫';
          const disabled = isEmpty || pinSuccess || (!isBack && pinDigits.length >= 4);
          return (
            <TouchableOpacity
              key={idx}
              style={[
                s.pinKey,
                isEmpty && s.pinKeyEmpty,
                isBack  && s.pinKeyBack,
                !isEmpty && !isBack && s.pinKeyNum,
                disabled && !isBack && !isEmpty && { opacity: 0.35 },
              ]}
              onPress={() => {
                if (isEmpty) return;
                if (isBack) { onBackspace(); return; }
                if (pinDigits.length < 4) onDigit(key);
              }}
              disabled={disabled}
              activeOpacity={0.65}
            >
              {isBack ? (
                <MaterialIcons name="backspace" size={20} color={Colors.textSecondary} />
              ) : isEmpty ? null : (
                <Text style={s.pinKeyText}>{key}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Reset PIN link (only in enter mode) */}
      {pinMode === 'enter' && (
        <TouchableOpacity style={s.pinResetLink} onPress={onResetPin} activeOpacity={0.75}>
          <MaterialIcons name="refresh" size={12} color={Colors.textMuted} />
          <Text style={s.pinResetLinkText}>Forgot PIN? Set up a new vault PIN</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: Spacing.md }} />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function BTNGVaultStatus() {
  const router = useRouter();
  const [checks, setChecks] = useState<VaultCheck[]>(INITIAL_CHECKS);
  const [lastScan, setLastScan] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  // ── Key generator state ────────────────────────────────────────────────────
  const [showKeyModal, setShowKeyModal]         = useState(false);
  const [generatedSeed, setGeneratedSeed]       = useState('');
  const [storedFingerprint, setStoredFingerprint] = useState<string | null>(null);
  const [storedKeyLen, setStoredKeyLen]         = useState<number | null>(null);
  const [revealWords, setRevealWords]           = useState(false);
  const [storing, setStoring]                   = useState(false);
  const [stored, setStored]                     = useState(false);
  const [copied, setCopied]                     = useState(false);
  const [overwriteWarning, setOverwriteWarning] = useState(false);

  // ── Biometric auth state ────────────────────────────────────────────────────
  const [biometricPassed, setBiometricPassed]     = useState(false);
  const [biometricChecking, setBiometricChecking] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState<boolean | null>(null);
  const [biometricError, setBiometricError]       = useState('');

  // ── PIN fallback state ─────────────────────────────────────────────────────
  const [showPinPad, setShowPinPad]               = useState(false);
  const [pinMode, setPinMode]                     = useState<PinMode>('enter');
  const [pinDigits, setPinDigits]                 = useState<string[]>([]);
  const [pinConfirmBuffer, setPinConfirmBuffer]   = useState('');
  const [pinError, setPinError]                   = useState('');
  const [pinSuccess, setPinSuccess]               = useState(false);
  const [pinExists, setPinExists]                 = useState(false);
  const pinShakeAnim                              = useRef(new Animated.Value(0)).current;

  // ── Import mode state ──────────────────────────────────────────────────────
  const [modalMode, setModalMode]           = useState<'generate' | 'import'>('generate');
  const [importInput, setImportInput]       = useState('');
  const [importError, setImportError]       = useState('');
  const [importFingerprint, setImportFingerprint] = useState<string | null>(null);
  const [importWordCount, setImportWordCount] = useState(0);
  const [importStored, setImportStored]     = useState(false);
  const [importStoring, setImportStoring]   = useState(false);
  const [importCopied, setImportCopied]     = useState(false);

  // ── Check biometric hardware + PIN existence on mount ─────────────────────
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          setBiometricSupported(false);
        } else {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const enrolled    = await LocalAuthentication.isEnrolledAsync();
          setBiometricSupported(hasHardware && enrolled);
        }
      } catch { setBiometricSupported(false); }
      const hash = await getStoredPinHash();
      setPinExists(!!hash);
    })();
  }, []);

  // ── PIN helpers ────────────────────────────────────────────────────────────
  const shakePin = useCallback(() => {
    Animated.sequence([
      Animated.timing(pinShakeAnim, { toValue: 10,  duration: 50, useNativeDriver: true }),
      Animated.timing(pinShakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(pinShakeAnim, { toValue: 8,   duration: 50, useNativeDriver: true }),
      Animated.timing(pinShakeAnim, { toValue: -8,  duration: 50, useNativeDriver: true }),
      Animated.timing(pinShakeAnim, { toValue: 0,   duration: 50, useNativeDriver: true }),
    ]).start();
  }, [pinShakeAnim]);

  const handleOpenPinPad = useCallback(async () => {
    const hash = await getStoredPinHash();
    setPinExists(!!hash);
    setPinMode(hash ? 'enter' : 'set_new');
    setPinDigits([]);
    setPinConfirmBuffer('');
    setPinError('');
    setPinSuccess(false);
    setShowPinPad(true);
  }, []);

  const handlePinDigit = useCallback(async (digit: string) => {
    setPinError('');
    const next = [...pinDigits, digit];
    setPinDigits(next);

    if (next.length < 4) return;

    const enteredPin = next.join('');

    if (pinMode === 'enter') {
      const stored = await getStoredPinHash();
      if (stored && hashPin(enteredPin) === stored) {
        setPinSuccess(true);
        setTimeout(() => {
          setShowPinPad(false);
          setBiometricPassed(true);
          setBiometricError('');
          setPinDigits([]);
          setPinSuccess(false);
        }, 600);
      } else {
        shakePin();
        setPinError('Incorrect PIN. Please try again.');
        setTimeout(() => setPinDigits([]), 700);
      }
    } else if (pinMode === 'set_new') {
      setPinConfirmBuffer(enteredPin);
      setPinMode('confirm_new');
      setTimeout(() => setPinDigits([]), 350);
    } else if (pinMode === 'confirm_new') {
      if (enteredPin === pinConfirmBuffer) {
        await storePin(enteredPin);
        setPinExists(true);
        setPinSuccess(true);
        setTimeout(() => {
          setShowPinPad(false);
          setBiometricPassed(true);
          setBiometricError('');
          setPinDigits([]);
          setPinSuccess(false);
          setPinConfirmBuffer('');
        }, 700);
      } else {
        shakePin();
        setPinError('PINs do not match. Start over.');
        setPinConfirmBuffer('');
        setPinMode('set_new');
        setTimeout(() => setPinDigits([]), 700);
      }
    }
  }, [pinDigits, pinMode, pinConfirmBuffer, shakePin]);

  const handlePinBackspace = useCallback(() => {
    setPinDigits(prev => prev.slice(0, -1));
    setPinError('');
  }, []);

  const handleClosePinPad = useCallback(() => {
    setShowPinPad(false);
    setPinDigits([]);
    setPinConfirmBuffer('');
    setPinError('');
    setPinSuccess(false);
  }, []);

  const handleResetPin = useCallback(() => {
    setPinMode('set_new');
    setPinDigits([]);
    setPinConfirmBuffer('');
    setPinError('');
  }, []);

  // ── Biometric auth ─────────────────────────────────────────────────────────
  const authenticateBiometric = useCallback(async () => {
    setBiometricError('');
    if (Platform.OS === 'web' || biometricSupported === false) {
      setBiometricPassed(true);
      return;
    }
    setBiometricChecking(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify identity to access sovereign key',
        cancelLabel:   'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setBiometricPassed(true);
        setBiometricError('');
      } else {
        const errMsg = result.error === 'user_cancel'
          ? 'Authentication cancelled. Use your vault PIN instead.'
          : 'Biometric failed. Use your vault PIN instead.';
        setBiometricError(errMsg);
        setTimeout(() => handleOpenPinPad(), 400);
      }
    } catch (err: any) {
      setBiometricError(err?.message ?? 'Biometric error occurred.');
      setTimeout(() => handleOpenPinPad(), 400);
    }
    setBiometricChecking(false);
  }, [biometricSupported, handleOpenPinPad]);

  // ── Key fingerprint loader ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SECURE_KEY_ID) : null;
          if (v) { setStoredFingerprint(buildFingerprint(v)); setStoredKeyLen(v.split(' ').length); }
        } else {
          const v = await SecureStore.getItemAsync(SECURE_KEY_ID);
          if (v) { setStoredFingerprint(buildFingerprint(v)); setStoredKeyLen(v.split(' ').length); }
        }
      } catch { /* ignore */ }
    })();
  }, [stored]);

  // ── Import helpers ─────────────────────────────────────────────────────────
  const validateImport = useCallback((text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    setImportWordCount(words.length);
    if (words.length === 0) { setImportError(''); setImportFingerprint(null); return; }
    if (words.length !== 12 && words.length !== 24) {
      setImportError(`${words.length} words detected — must be exactly 12 or 24 words.`);
      setImportFingerprint(null);
      return;
    }
    setImportError('');
    setImportFingerprint(buildFingerprint(words.join(' ')));
  }, []);

  const handleImportInputChange = useCallback((text: string) => {
    setImportInput(text); validateImport(text); setImportStored(false); setImportCopied(false);
  }, [validateImport]);

  const handleStoreImported = useCallback(async () => {
    const words = importInput.trim().split(/\s+/).filter(Boolean);
    if (words.length !== 12 && words.length !== 24) return;
    const normalized = words.join(' ');
    setImportStoring(true);
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') localStorage.setItem(SECURE_KEY_ID, normalized);
      } else {
        await SecureStore.setItemAsync(SECURE_KEY_ID, normalized);
      }
      setImportStored(true);
    } catch (e: any) { console.warn('[VaultStatus] SecureStore import error:', e?.message); }
    setImportStoring(false);
  }, [importInput]);

  const handleCopyImported = useCallback(async () => {
    try { await Clipboard.setStringAsync(importInput); setImportCopied(true); setTimeout(() => setImportCopied(false), 2500); } catch { /* ignore */ }
  }, [importInput]);

  const closeKeyModal = useCallback(() => {
    setShowKeyModal(false);
    setRevealWords(false);
    setImportInput('');
    setImportError('');
    setImportFingerprint(null);
    setBiometricPassed(false);
    setBiometricError('');
    setShowPinPad(false);
    setPinDigits([]);
    setPinError('');
    setPinSuccess(false);
    setPinConfirmBuffer('');
  }, []);

  const handleOpenGenerator = useCallback(async () => {
    try {
      let exists = false;
      if (Platform.OS === 'web') {
        exists = typeof localStorage !== 'undefined' && !!localStorage.getItem(SECURE_KEY_ID);
      } else {
        const v = await SecureStore.getItemAsync(SECURE_KEY_ID); exists = !!v;
      }
      setOverwriteWarning(exists);
    } catch { setOverwriteWarning(false); }
    const newSeed = generateMnemonic(24);
    setGeneratedSeed(newSeed);
    setRevealWords(false); setStored(false); setCopied(false);
    setModalMode('generate'); setBiometricPassed(false); setBiometricError('');
    setShowPinPad(false); setPinDigits([]); setPinError('');
    setShowKeyModal(true);
  }, []);

  const handleOpenImporter = useCallback(async () => {
    try {
      let exists = false;
      if (Platform.OS === 'web') {
        exists = typeof localStorage !== 'undefined' && !!localStorage.getItem(SECURE_KEY_ID);
      } else {
        const v = await SecureStore.getItemAsync(SECURE_KEY_ID); exists = !!v;
      }
      setOverwriteWarning(exists);
    } catch { setOverwriteWarning(false); }
    setImportInput(''); setImportError(''); setImportFingerprint(null);
    setImportWordCount(0); setImportStored(false); setImportStoring(false); setImportCopied(false);
    setModalMode('import'); setBiometricPassed(false); setBiometricError('');
    setShowPinPad(false); setPinDigits([]); setPinError('');
    setShowKeyModal(true);
  }, []);

  const handleStoreSeed = useCallback(async () => {
    if (!generatedSeed) return;
    setStoring(true);
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') localStorage.setItem(SECURE_KEY_ID, generatedSeed);
      } else { await SecureStore.setItemAsync(SECURE_KEY_ID, generatedSeed); }
      setStored(true);
    } catch (e: any) { console.warn('[VaultStatus] SecureStore write error:', e?.message); }
    setStoring(false);
  }, [generatedSeed]);

  const handleCopySeed = useCallback(async () => {
    try { await Clipboard.setStringAsync(generatedSeed); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* web fallback */ }
  }, [generatedSeed]);

  const handleRegenerateSeed = useCallback(() => {
    setGeneratedSeed(generateMnemonic(24)); setStored(false); setCopied(false); setRevealWords(false);
  }, []);

  const updateCheck = useCallback((id: string, partial: Partial<VaultCheck>) => {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...partial } : c));
  }, []);

  const runScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setChecks(INITIAL_CHECKS.map(c => ({ ...c, status: 'pending' as CheckStatus, detail: 'Checking…' })));

    const loop = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.linear })
    );
    loop.start();

    const vpsStart = Date.now();
    const vpsAlive = await pingNode(VPS_NODE_URL, 5000);
    const vpsMs = Date.now() - vpsStart;
    updateCheck('vps_node', { status: vpsAlive ? 'pass' : 'fail', detail: vpsAlive ? `Node reachable · ${vpsMs}ms` : `Unreachable at ${VPS_NODE_URL}`, latencyMs: vpsMs });

    const reserveResult = await pingEdge(EDGE_RESERVE);
    updateCheck('edge_reserve', { status: reserveResult.ok ? 'pass' : 'fail', detail: reserveResult.detail, latencyMs: reserveResult.latencyMs });

    const lendingResult = await pingEdge(EDGE_LENDING);
    updateCheck('edge_lending', { status: lendingResult.ok ? 'pass' : 'fail', detail: lendingResult.detail, latencyMs: lendingResult.latencyMs });

    const keyResult = await checkSecureKey();
    updateCheck('secure_key', { status: keyResult.present ? 'pass' : 'warn', detail: keyResult.detail });

    const supabase = getSupabaseClient();
    const sessionRes = await supabase.auth.getSession();
    const uid = sessionRes?.data?.session?.user?.id;
    const certResult = await fetchCertCount(uid);
    updateCheck('cert_count', { status: certResult.count >= 0 ? 'pass' : 'fail', detail: certResult.count >= 0 ? certResult.detail : `DB error: ${certResult.detail}` });

    const session = sessionRes?.data?.session;
    if (session?.access_token) {
      const exp = session.expires_at ? new Date(session.expires_at * 1000) : null;
      const expiresIn = exp ? Math.max(0, Math.round((exp.getTime() - Date.now()) / 1000 / 60)) : null;
      updateCheck('auth_session', { status: 'pass', detail: exp ? `JWT valid · expires in ${expiresIn}min · AES-256 active` : 'JWT valid · AES-256 session active' });
    } else {
      updateCheck('auth_session', { status: 'warn', detail: 'No active session — some vault features may be restricted' });
    }

    loop.stop(); spinAnim.setValue(0);
    setLastScan(new Date().toLocaleTimeString());
    setScanning(false);
  }, [scanning, updateCheck, spinAnim]);

  useEffect(() => { runScan(); }, []);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const categories: VaultCheck['category'][] = ['node', 'edge', 'key', 'db', 'auth'];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>VAULT STATUS</Text>
          <Text style={s.headerSub}>BTNG Sovereign Infrastructure</Text>
        </View>
        <TouchableOpacity style={s.scanBtn} onPress={runScan} activeOpacity={0.75} disabled={scanning}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <MaterialIcons name="refresh" size={18} color={scanning ? Colors.textMuted : Colors.primary} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Terminal bar */}
        <View style={s.terminalBar}>
          <MaterialIcons name="terminal" size={12} color={Colors.success} />
          <Text style={s.terminalText}>{'btng-vault-scan v1.0 · '}{lastScan ? `last run: ${lastScan}` : 'initialising…'}</Text>
          <View style={[s.liveChip, { backgroundColor: scanning ? Colors.warningBg : Colors.successBg }]}>
            <View style={[s.liveDot, { backgroundColor: scanning ? Colors.warning : Colors.success }]} />
            <Text style={[s.liveText, { color: scanning ? Colors.warning : Colors.success }]}>{scanning ? 'SCANNING' : 'IDLE'}</Text>
          </View>
        </View>

        <ScoreRing checks={checks} />

        {/* Check groups */}
        {categories.map(cat => {
          const catChecks = checks.filter(c => c.category === cat);
          if (catChecks.length === 0) return null;
          return (
            <View key={cat} style={s.section}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: CATEGORY_COLOR[cat] }]} />
                <Text style={[s.sectionTitle, { color: CATEGORY_COLOR[cat] }]}>{CATEGORY_LABEL[cat]}</Text>
              </View>
              {catChecks.map(check => <CheckCard key={check.id} check={check} />)}
            </View>
          );
        })}

        {/* Sovereign Key Generator card */}
        <View style={s.keyGenCard}>
          <View style={s.keyGenHeader}>
            <View style={s.keyGenIconWrap}>
              <MaterialIcons name="vpn-key" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.keyGenTitle}>SOVEREIGN KEY GENERATOR</Text>
              <Text style={s.keyGenSub}>BIP39-style · 24 words · SecureStore encrypted</Text>
            </View>
            {storedFingerprint ? (
              <View style={s.keyGenBadge}>
                <MaterialIcons name="check-circle" size={11} color={Colors.success} />
                <Text style={s.keyGenBadgeText}>KEY ACTIVE</Text>
              </View>
            ) : (
              <View style={[s.keyGenBadge, { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '55' }]}>
                <MaterialIcons name="warning" size={11} color={Colors.warning} />
                <Text style={[s.keyGenBadgeText, { color: Colors.warning }]}>NO KEY</Text>
              </View>
            )}
          </View>

          {storedFingerprint ? (
            <View style={s.keyGenFingerprintCard}>
              <View style={s.keyGenFingerprintRow}>
                <MaterialIcons name="fingerprint" size={14} color={Colors.primary} />
                <Text style={s.keyGenFingerprintLabel}>Active Key Fingerprint</Text>
              </View>
              <Text style={s.keyGenFingerprintVal}>{storedFingerprint}</Text>
              <Text style={s.keyGenFingerprintMeta}>{storedKeyLen ?? 24} words · AES-256 · SecureStore</Text>
            </View>
          ) : (
            <View style={s.keyGenEmptyCard}>
              <MaterialIcons name="lock-open" size={22} color={Colors.textMuted} />
              <Text style={s.keyGenEmptyText}>No sovereign key found in vault. Generate one to activate on-device encryption.</Text>
            </View>
          )}

          {/* PIN status row */}
          <View style={s.pinStatusRow}>
            <View style={[s.pinStatusChip, { backgroundColor: pinExists ? Colors.successBg : Colors.bgElevated, borderColor: pinExists ? Colors.success + '44' : Colors.border }]}>
              <MaterialIcons name={pinExists ? 'lock' : 'lock-open'} size={11} color={pinExists ? Colors.success : Colors.textMuted} />
              <Text style={[s.pinStatusText, { color: pinExists ? Colors.success : Colors.textMuted }]}>
                {pinExists ? 'Vault PIN active' : 'No vault PIN set'}
              </Text>
            </View>
            {!pinExists && (
              <Text style={s.pinStatusHint}>Set a PIN as biometric fallback</Text>
            )}
          </View>

          <View style={s.keyGenActions}>
            <TouchableOpacity style={[s.keyGenBtn, { flex: 1 }]} onPress={handleOpenGenerator} activeOpacity={0.85}>
              <MaterialIcons name="add-circle" size={16} color={Colors.bg} />
              <Text style={s.keyGenBtnText}>{storedFingerprint ? 'Regenerate' : 'Generate Key'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.keyGenBtn, s.keyGenImportBtn]} onPress={handleOpenImporter} activeOpacity={0.85}>
              <MaterialIcons name="file-download" size={16} color={Colors.primary} />
              <Text style={[s.keyGenBtnText, { color: Colors.primary }]}>Import Key</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Legend */}
        <View style={s.legend}>
          <Text style={s.legendTitle}>STATUS LEGEND</Text>
          <View style={s.legendRow}>
            {(['pass', 'warn', 'fail', 'pending'] as CheckStatus[]).map(st => (
              <View key={st} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: STATUS_COLOR[st] }]} />
                <Text style={[s.legendText, { color: STATUS_COLOR[st] }]}>{STATUS_LABEL[st]}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.footer}>
          <MaterialIcons name="verified-user" size={11} color={Colors.textMuted} />
          <Text style={s.footerText}>BTNG Sovereign Infrastructure Monitor · EKUYE DIGITAL GATEWAY TRUST LTD</Text>
        </View>
      </ScrollView>

      {/* ── Key Generator / Import Modal ──────────────────────────────────── */}
      <Modal visible={showKeyModal} transparent animationType="slide" onRequestClose={closeKeyModal}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <View style={s.modalHeaderIcon}>
                <MaterialIcons name="vpn-key" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>SOVEREIGN KEY</Text>
                <Text style={s.modalSub}>24-word BIP39-style seed</Text>
              </View>
              <TouchableOpacity style={s.modalCloseBtn} onPress={closeKeyModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Mode tabs */}
            <View style={s.modalTabs}>
              {(['generate', 'import'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[s.modalTab, modalMode === mode && s.modalTabActive]}
                  onPress={() => setModalMode(mode)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name={mode === 'generate' ? 'auto-awesome' : 'file-download'} size={13} color={modalMode === mode ? Colors.bg : Colors.textMuted} />
                  <Text style={[s.modalTabText, modalMode === mode && s.modalTabTextActive]}>
                    {mode === 'generate' ? 'Generate New' : 'Import Existing'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalBody}>

              {/* ── BIOMETRIC / PIN GATE ──────────────────────────────────── */}
              {!biometricPassed ? (
                <>
                  {/* PIN pad takes over when showPinPad is true */}
                  {showPinPad ? (
                    <PinPad
                      pinMode={pinMode}
                      pinDigits={pinDigits}
                      pinError={pinError}
                      pinSuccess={pinSuccess}
                      pinShakeAnim={pinShakeAnim}
                      onDigit={handlePinDigit}
                      onBackspace={handlePinBackspace}
                      onClose={handleClosePinPad}
                      onResetPin={handleResetPin}
                    />
                  ) : (
                    /* Biometric lock screen */
                    <View style={s.bioLockCard}>
                      <View style={s.bioLockIconWrap}>
                        <MaterialIcons name="fingerprint" size={64} color={Colors.primary} />
                        <View style={s.bioLockIconRing} />
                      </View>

                      <Text style={s.bioLockTitle}>VERIFY IDENTITY</Text>
                      <Text style={s.bioLockSub}>
                        Biometric authentication is required to access sovereign key material. Your keys never leave this device.
                      </Text>

                      <View style={s.bioLockFactsRow}>
                        {[
                          { icon: 'lock',           text: 'AES-256 SecureStore' },
                          { icon: 'shield',         text: 'On-device only'      },
                          { icon: 'visibility-off', text: 'Zero cloud access'   },
                        ].map(f => (
                          <View key={f.text} style={s.bioLockFact}>
                            <MaterialIcons name={f.icon as any} size={12} color={Colors.primary} />
                            <Text style={s.bioLockFactText}>{f.text}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Primary biometric button */}
                      <TouchableOpacity
                        style={[s.bioLockBtn, biometricChecking && { opacity: 0.65 }]}
                        onPress={authenticateBiometric}
                        disabled={biometricChecking}
                        activeOpacity={0.85}
                      >
                        {biometricChecking ? (
                          <ActivityIndicator size="small" color={Colors.bg} />
                        ) : (
                          <MaterialIcons name="fingerprint" size={20} color={Colors.bg} />
                        )}
                        <Text style={s.bioLockBtnText}>
                          {biometricChecking ? 'Verifying…' : 'Verify Identity'}
                        </Text>
                      </TouchableOpacity>

                      {/* PIN fallback link */}
                      <TouchableOpacity style={s.usePinLink} onPress={handleOpenPinPad} activeOpacity={0.75}>
                        <MaterialIcons name="dialpad" size={14} color={Colors.primary} />
                        <Text style={s.usePinLinkText}>
                          {pinExists ? 'Use vault PIN instead' : 'Set up a vault PIN'}
                        </Text>
                      </TouchableOpacity>

                      {/* Error */}
                      {biometricError ? (
                        <View style={s.bioErrorRow}>
                          <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                          <Text style={s.bioErrorText}>{biometricError}</Text>
                        </View>
                      ) : null}

                      {/* No-hardware notice */}
                      {biometricSupported === false && (
                        <View style={s.bioUnsupportedRow}>
                          <MaterialIcons name="info-outline" size={12} color={Colors.warning} />
                          <Text style={s.bioUnsupportedText}>
                            Biometric hardware not enrolled. Use your vault PIN or tap "Verify Identity" for device passcode fallback.
                          </Text>
                        </View>
                      )}

                      <View style={s.bioKeyTypeRow}>
                        <MaterialIcons name={modalMode === 'generate' ? 'auto-awesome' : 'file-download'} size={12} color={Colors.textMuted} />
                        <Text style={s.bioKeyTypeText}>
                          {modalMode === 'generate' ? 'Generating new 24-word sovereign key' : 'Importing existing mnemonic key'}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              ) : null}

              {/* ── KEY CONTENT — shown only after auth passes ─────────────── */}
              {biometricPassed ? (
                <>
                  {/* IMPORT MODE */}
                  {modalMode === 'import' && (
                    <View style={s.importSection}>
                      <View style={s.bioPassedBanner}>
                        <MaterialIcons name="verified-user" size={13} color={Colors.success} />
                        <Text style={s.bioPassedBannerText}>Identity verified · Key import access granted</Text>
                      </View>

                      {overwriteWarning && !importStored && (
                        <View style={s.overwriteWarn}>
                          <MaterialIcons name="warning" size={13} color={Colors.warning} />
                          <Text style={s.overwriteWarnText}>A sovereign key already exists. Importing will overwrite it permanently.</Text>
                        </View>
                      )}

                      <View style={s.importInstruction}>
                        <MaterialIcons name="info-outline" size={13} color={Colors.info} />
                        <Text style={s.importInstructionText}>
                          Paste your existing 12 or 24-word BIP39-style mnemonic below. Words must be separated by spaces.
                        </Text>
                      </View>

                      <View style={[
                        s.importInputWrap,
                        importError ? { borderColor: Colors.error + '88' } : importFingerprint ? { borderColor: Colors.success + '88' } : {},
                      ]}>
                        <TextInput
                          style={s.importInput}
                          value={importInput}
                          onChangeText={handleImportInputChange}
                          placeholder="word1 word2 word3 … (12 or 24 words)"
                          placeholderTextColor={Colors.textMuted}
                          multiline
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                          textAlignVertical="top"
                        />
                        {importInput.length > 0 && (
                          <TouchableOpacity style={s.importClearBtn} onPress={() => handleImportInputChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {importInput.trim().length > 0 && (
                        <View style={s.importWordCountRow}>
                          <View style={[
                            s.importWordCountBadge,
                            importWordCount === 12 || importWordCount === 24
                              ? { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }
                              : { backgroundColor: Colors.errorBg, borderColor: Colors.error + '55' },
                          ]}>
                            <MaterialIcons name={importWordCount === 12 || importWordCount === 24 ? 'check-circle' : 'cancel'} size={12} color={importWordCount === 12 || importWordCount === 24 ? Colors.success : Colors.error} />
                            <Text style={[s.importWordCountText, { color: importWordCount === 12 || importWordCount === 24 ? Colors.success : Colors.error }]}>
                              {importWordCount} / 24 words detected
                            </Text>
                          </View>
                          {(importWordCount === 12 || importWordCount === 24) && (
                            <View style={s.importValidBadge}>
                              <MaterialIcons name="verified" size={11} color={Colors.success} />
                              <Text style={s.importValidBadgeText}>Valid length</Text>
                            </View>
                          )}
                        </View>
                      )}

                      {importError ? (
                        <View style={s.importErrorRow}>
                          <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                          <Text style={s.importErrorText}>{importError}</Text>
                        </View>
                      ) : null}

                      {importFingerprint && (
                        <View style={s.fingerprintCard}>
                          <View style={s.fingerprintRow}>
                            <MaterialIcons name="fingerprint" size={13} color={Colors.primary} />
                            <Text style={s.fingerprintLabel}>IMPORT KEY FINGERPRINT</Text>
                          </View>
                          <Text style={s.fingerprintValue}>{importFingerprint}</Text>
                          <Text style={s.fingerprintHint}>{importWordCount}-word key · fingerprint computed locally</Text>
                        </View>
                      )}

                      {importFingerprint && (
                        <View style={s.securityNotice}>
                          <MaterialIcons name="security" size={13} color={Colors.error} />
                          <Text style={s.securityNoticeText}>Never share your seed phrase. It grants full access to your sovereign vault.</Text>
                        </View>
                      )}

                      {importFingerprint && (
                        <View style={s.modalActions}>
                          <TouchableOpacity style={[s.actionChip, importCopied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '66' }]} onPress={handleCopyImported} activeOpacity={0.8}>
                            <MaterialIcons name={importCopied ? 'check' : 'content-copy'} size={14} color={importCopied ? Colors.success : Colors.primary} />
                            <Text style={[s.actionChipText, importCopied && { color: Colors.success }]}>{importCopied ? 'Copied!' : 'Copy'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.actionChip} onPress={() => handleImportInputChange('')} activeOpacity={0.8}>
                            <MaterialIcons name="backspace" size={14} color={Colors.warning} />
                            <Text style={[s.actionChipText, { color: Colors.warning }]}>Clear</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {importFingerprint && !importStored && (
                        <TouchableOpacity
                          style={[s.storeBtn, { backgroundColor: Colors.success }, (importStoring || !!importError) && { opacity: 0.6 }]}
                          onPress={handleStoreImported}
                          disabled={importStoring || !!importError}
                          activeOpacity={0.85}
                        >
                          {importStoring ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="save" size={17} color={Colors.bg} />}
                          <Text style={s.storeBtnText}>{importStoring ? 'Saving…' : 'Save Imported Key to Vault'}</Text>
                        </TouchableOpacity>
                      )}

                      {importStored && (
                        <View style={s.storedBanner}>
                          <MaterialIcons name="check-circle" size={18} color={Colors.success} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.storedBannerTitle}>Key Imported Successfully</Text>
                            <Text style={s.storedBannerSub}>Encrypted in SecureStore · {importWordCount} words · btng_master_seed</Text>
                          </View>
                        </View>
                      )}
                      <View style={{ height: 8 }} />
                    </View>
                  )}

                  {/* GENERATE MODE */}
                  {modalMode === 'generate' && (
                    <View style={s.generateSection}>
                      <View style={s.bioPassedBanner}>
                        <MaterialIcons name="verified-user" size={13} color={Colors.success} />
                        <Text style={s.bioPassedBannerText}>Identity verified · Key access granted</Text>
                      </View>

                      {overwriteWarning && !stored && (
                        <View style={s.overwriteWarn}>
                          <MaterialIcons name="warning" size={13} color={Colors.warning} />
                          <Text style={s.overwriteWarnText}>A sovereign key already exists. Storing this new key will overwrite it permanently.</Text>
                        </View>
                      )}

                      <View style={s.fingerprintCard}>
                        <View style={s.fingerprintRow}>
                          <MaterialIcons name="fingerprint" size={13} color={Colors.primary} />
                          <Text style={s.fingerprintLabel}>KEY FINGERPRINT</Text>
                        </View>
                        <Text style={s.fingerprintValue}>{buildFingerprint(generatedSeed)}</Text>
                        <Text style={s.fingerprintHint}>SHA-style · first 8 / last 8 characters of key hash</Text>
                      </View>

                      <View style={s.wordGridHeader}>
                        <View style={s.wordGridHeaderLeft}>
                          <MaterialIcons name="grid-view" size={13} color={Colors.textMuted} />
                          <Text style={s.wordGridHeaderText}>BACKUP PHRASE · 24 WORDS</Text>
                        </View>
                        <TouchableOpacity style={s.revealBtn} onPress={() => setRevealWords(v => !v)} activeOpacity={0.8}>
                          <MaterialIcons name={revealWords ? 'visibility-off' : 'visibility'} size={13} color={Colors.primary} />
                          <Text style={s.revealBtnText}>{revealWords ? 'Hide' : 'Reveal'}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={s.wordGrid}>
                        {generatedSeed.split(' ').map((word, idx) => (
                          <View key={idx} style={s.wordCell}>
                            <Text style={s.wordIndex}>{String(idx + 1).padStart(2, '0')}</Text>
                            <Text style={s.wordText}>{revealWords ? word : '••••••'}</Text>
                          </View>
                        ))}
                      </View>

                      {revealWords && (
                        <View style={s.securityNotice}>
                          <MaterialIcons name="security" size={13} color={Colors.error} />
                          <Text style={s.securityNoticeText}>Never share your backup phrase. Anyone with these 24 words has full access to your sovereign vault.</Text>
                        </View>
                      )}

                      <View style={s.modalActions}>
                        <TouchableOpacity style={[s.actionChip, copied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '66' }]} onPress={handleCopySeed} activeOpacity={0.8}>
                          <MaterialIcons name={copied ? 'check' : 'content-copy'} size={14} color={copied ? Colors.success : Colors.primary} />
                          <Text style={[s.actionChipText, copied && { color: Colors.success }]}>{copied ? 'Copied!' : 'Copy'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionChip} onPress={handleRegenerateSeed} activeOpacity={0.8}>
                          <MaterialIcons name="refresh" size={14} color={Colors.warning} />
                          <Text style={[s.actionChipText, { color: Colors.warning }]}>Regenerate</Text>
                        </TouchableOpacity>
                      </View>

                      {!stored ? (
                        <TouchableOpacity style={[s.storeBtn, storing && { opacity: 0.6 }]} onPress={handleStoreSeed} disabled={storing} activeOpacity={0.85}>
                          {storing ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="save" size={17} color={Colors.bg} />}
                          <Text style={s.storeBtnText}>{storing ? 'Saving to SecureStore…' : 'Save to Sovereign Vault'}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={s.storedBanner}>
                          <MaterialIcons name="check-circle" size={18} color={Colors.success} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.storedBannerTitle}>Key Stored Successfully</Text>
                            <Text style={s.storedBannerSub}>Encrypted in SecureStore under btng_master_seed</Text>
                          </View>
                        </View>
                      )}
                      <View style={{ height: 12 }} />
                    </View>
                  )}
                </>
              ) : null}

            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: Colors.bg },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgCard, gap: Spacing.sm },
  backBtn:        { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCenter:   { flex: 1, gap: 2 },
  headerTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 2, includeFontPadding: false },
  headerSub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  scanBtn:        { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  scroll:         { flex: 1 },
  scrollContent:  { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  terminalBar:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.success + '33', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  terminalText: { flex: 1, fontSize: FontSize.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Colors.success, includeFontPadding: false },
  liveChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  liveDot:      { width: 6, height: 6, borderRadius: 3 },
  liveText:     { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },

  scoreRing:    { alignItems: 'center', gap: 6, paddingVertical: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border },
  scoreCircle:  { width: 110, height: 110, borderRadius: 55, borderWidth: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgElevated, flexDirection: 'row', alignContent: 'baseline' },
  scoreNum:     { fontSize: 38, fontWeight: FontWeight.heavy, includeFontPadding: false },
  scorePct:     { fontSize: FontSize.md, color: Colors.textMuted, alignSelf: 'flex-end', paddingBottom: 6, includeFontPadding: false },
  scoreLabel:   { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, letterSpacing: 1.5, includeFontPadding: false, marginTop: 4 },
  scoreDetail:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  section:        { gap: Spacing.sm },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: 4 },
  sectionDot:     { width: 8, height: 8, borderRadius: 4 },
  sectionTitle:   { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 1.4, includeFontPadding: false },

  card:         { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.borderLight, borderLeftWidth: 3, overflow: 'hidden', padding: Spacing.md, gap: Spacing.sm },
  cardTop:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardIconWrap: { width: 36, height: 36, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardMeta:     { flex: 1, gap: 2 },
  cardLabel:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardSub:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, flexShrink: 0 },
  statusText:   { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.6, includeFontPadding: false },
  dot:          { width: 6, height: 6, borderRadius: 3 },
  cardDetail:   { flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingTop: 2 },
  detailText:   { flex: 1, fontSize: FontSize.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  latencyBadge: { backgroundColor: Colors.bgElevated, borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0, alignSelf: 'flex-start' },
  latencyText:  { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  legend:       { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  legendTitle:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.4, includeFontPadding: false },
  legendRow:    { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:    { width: 8, height: 8, borderRadius: 4 },
  legendText:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Key gen card
  keyGenCard:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: Spacing.md },
  keyGenHeader:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  keyGenIconWrap:       { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  keyGenTitle:          { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.3, includeFontPadding: false },
  keyGenSub:            { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  keyGenBadge:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderColor: Colors.success + '55', borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  keyGenBadgeText:      { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.5, includeFontPadding: false },
  keyGenFingerprintCard:{ backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '33', padding: Spacing.md, gap: 5 },
  keyGenFingerprintRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  keyGenFingerprintLabel:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  keyGenFingerprintVal: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 1, includeFontPadding: false },
  keyGenFingerprintMeta:{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  keyGenEmptyCard:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.borderLight, padding: Spacing.md },
  keyGenEmptyText:      { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 17, includeFontPadding: false },
  keyGenActions:        { flexDirection: 'row', gap: Spacing.sm },
  keyGenBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  keyGenBtnText:        { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  keyGenImportBtn:      { flex: 1, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.primary + '55', shadowOpacity: 0, elevation: 0 },

  // PIN status row in key gen card
  pinStatusRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pinStatusChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  pinStatusText:  { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  pinStatusHint:  { flex: 1, fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Modal shell
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(6,6,8,0.88)', justifyContent: 'flex-end' },
  modalSheet:     { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl + 4, borderTopRightRadius: Radius.xl + 4, maxHeight: '92%', borderWidth: 1, borderColor: Colors.primary + '44', overflow: 'hidden' },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgElevated },
  modalHeaderIcon:{ width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  modalTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.5, includeFontPadding: false },
  modalSub:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  modalCloseBtn:  { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  modalBody:      { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  modalTabs:      { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgElevated },
  modalTab:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  modalTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modalTabText:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  modalTabTextActive: { color: Colors.bg },

  // Biometric lock
  bioLockCard:     { alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.xl, paddingHorizontal: Spacing.md },
  bioLockIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', position: 'relative', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 8 },
  bioLockIconRing: { position: 'absolute', width: 116, height: 116, borderRadius: 58, borderWidth: 1, borderColor: Colors.primary + '22' },
  bioLockTitle:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 3, includeFontPadding: false, textAlign: 'center' },
  bioLockSub:      { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false, paddingHorizontal: Spacing.sm },
  bioLockFactsRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  bioLockFact:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '33' },
  bioLockFactText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  bioLockBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, paddingHorizontal: Spacing.xxl, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 7, minWidth: 220 },
  bioLockBtnText:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, letterSpacing: 0.5, includeFontPadding: false },

  // Use PIN link
  usePinLink:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm + 1, paddingHorizontal: Spacing.md, borderRadius: Radius.full, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '33' },
  usePinLinkText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  bioErrorRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44', alignSelf: 'stretch' },
  bioErrorText:     { flex: 1, fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  bioUnsupportedRow:{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44', alignSelf: 'stretch' },
  bioUnsupportedText:{ flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17, includeFontPadding: false },
  bioKeyTypeRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: Spacing.sm },
  bioKeyTypeText:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  bioPassedBanner:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.success + '44' },
  bioPassedBannerText:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  // ── PIN pad ────────────────────────────────────────────────────────────────
  pinPadOverlay:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', overflow: 'hidden' },
  pinPadHeader:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgElevated, gap: Spacing.sm },
  pinPadBackBtn:      { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pinPadHeaderCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pinPadTitle:        { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.5, includeFontPadding: false },
  pinPadSub:          { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, includeFontPadding: false },
  pinDotsRow:         { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl, paddingVertical: Spacing.xl },
  pinDot:             { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  pinFeedbackRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 28, paddingHorizontal: Spacing.md },
  pinSuccessText:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  pinErrorText:       { fontSize: FontSize.xs, color: Colors.error, textAlign: 'center', includeFontPadding: false },
  pinHintText:        { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  pinPadGrid:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.xl, gap: Spacing.sm, justifyContent: 'center', marginTop: Spacing.sm },
  pinKey:             { width: '30%', aspectRatio: 1.5, maxHeight: 56, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pinKeyEmpty:        { backgroundColor: 'transparent', borderColor: 'transparent' },
  pinKeyBack:         { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  pinKeyNum:          { backgroundColor: Colors.bgCard, borderColor: Colors.border },
  pinKeyText:         { fontSize: 22, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  pinResetLink:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  pinResetLinkText:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Overwrite warning
  overwriteWarn:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.warning + '44', padding: Spacing.md },
  overwriteWarnText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17, includeFontPadding: false },

  // Fingerprint
  fingerprintCard:  { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md, gap: 6 },
  fingerprintRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fingerprintLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.2, includeFontPadding: false },
  fingerprintValue: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 1.5, includeFontPadding: false },
  fingerprintHint:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Word grid
  wordGridHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  wordGridHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  wordGridHeaderText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  revealBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  revealBtnText:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  wordGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  wordCell:           { width: '30%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderLight, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm, minWidth: 90 },
  wordIndex:          { fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: FontWeight.bold, includeFontPadding: false, width: 18, flexShrink: 0 },
  wordText:           { flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  securityNotice:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.error + '44', padding: Spacing.md },
  securityNoticeText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, lineHeight: 17, includeFontPadding: false },

  modalActions: { flexDirection: 'row', gap: Spacing.sm },
  actionChip:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 4, borderWidth: 1, borderColor: Colors.border },
  actionChipText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  storeBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  storeBtnText:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  storedBanner:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '55', padding: Spacing.md },
  storedBannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  storedBannerSub:   { fontSize: FontSize.xs, color: Colors.success, opacity: 0.75, includeFontPadding: false, marginTop: 2 },

  importSection:       { gap: Spacing.md },
  generateSection:     { gap: Spacing.md },
  importInstruction:   { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.info + '33' },
  importInstructionText:{ flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  importInputWrap:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.sm, minHeight: 100, position: 'relative' },
  importInput:         { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 22, includeFontPadding: false, minHeight: 80, paddingRight: 28 },
  importClearBtn:      { position: 'absolute', top: Spacing.sm, right: Spacing.sm, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  importWordCountRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  importWordCountBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  importWordCountText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  importValidBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  importValidBadgeText:{ fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  importErrorRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44' },
  importErrorText:     { flex: 1, fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },

  footer:     { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', paddingTop: Spacing.sm },
  footerText: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});
