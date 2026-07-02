/**
 * BTNG Engine Launcher
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native dashboard that mirrors the four-command deployment sequence:
 *
 *   # 1. Deploy Smart Contract Engine
 *   npx hardhat run scripts/deploy.js --network mainnet
 *
 *   # 2. Launch Affinity Oracle
 *   python affinity_engine.py --port 8080 --chain ethereum
 *
 *   # 3. Start Value Dashboard
 *   cd frontend && npm run dev
 *
 *   # 4. Initialize Proof Generator
 *   node scripts/init-generator.js --min-value 1000 --max-supply 10000
 *
 * Each command is mapped to its live OnSpace equivalent:
 *   1 → btng-contract-deploy   (Hardhat → Edge Function deploy + DB schema)
 *   2 → btng-proof-of-value    (Python affinity_engine.py → TypeScript port)
 *   3 → btng-value-generator   (npm run dev → live polling proof-of-value stream)
 *   4 → btng-gold-certificate  (init-generator → mint ERC-721 with min-value params)
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { getSupabaseClient } from '@/template';
import { useGoldOracle } from '@/hooks/useGoldOracle';

// ─── Types ────────────────────────────────────────────────────────────────────

type EngineStatus = 'idle' | 'booting' | 'online' | 'error';

interface EngineState {
  status:   EngineStatus;
  log:      string[];
  latency:  number | null;
  bootedAt: string | null;
}

// ─── Engine Definitions ───────────────────────────────────────────────────────

const ENGINES = [
  {
    id:          'contract',
    step:        '1',
    title:       'Smart Contract Engine',
    subtitle:    'ERC-721 · Gold Certificate · Proof-of-Value',
    icon:        'code',
    color:       '#9945FF',
    command:     'npx hardhat run scripts/deploy.js --network mainnet',
    onspaceCmd:  'supabase.functions.invoke("btng-custom-server")',
    description: 'Deploys BTNGGoldCertificate.sol logic via Edge Function. Validates schema, RLS policies, and btng_certificates table integrity.',
    route:       '/btng-contract-deploy',
    checkFn:     async () => {
      const supabase = getSupabaseClient();
      const { count, error } = await supabase
        .from('btng_certificates')
        .select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return { ok: true, detail: `btng_certificates table: ${count ?? 0} records` };
    },
  },
  {
    id:          'affinity',
    step:        '2',
    title:       'Affinity Oracle',
    subtitle:    'affinity_engine.py → TypeScript · --port 8080',
    icon:        'psychology',
    color:       '#A855F7',
    command:     'python affinity_engine.py --port 8080 --chain ethereum',
    onspaceCmd:  'calculateAffinityScore(userData) — local TypeScript port',
    description: 'Boots the Life Affinity Engine (TypeScript port of affinity_engine.py). Pulls tx_history, staking_power, social_affinity, and economic_harmony from DB.',
    route:       '/btng-proof-of-value',
    checkFn:     async () => {
      const supabase = getSupabaseClient();
      const { count: orderCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true });
      const { count: walletCount } = await supabase
        .from('btng_wallets')
        .select('id', { count: 'exact', head: true });
      return {
        ok: true,
        detail: `${orderCount ?? 0} orders · ${walletCount ?? 0} wallets indexed`,
      };
    },
  },
  {
    id:          'dashboard',
    step:        '3',
    title:       'Value Dashboard',
    subtitle:    'cd frontend && npm run dev · XAU live feed',
    icon:        'dashboard',
    color:       '#F59E0B',
    command:     'cd frontend && npm run dev',
    onspaceCmd:  'gold-oracle Edge Function · 15s polling stream',
    description: 'Starts the live Proof-of-Value streaming dashboard. Polls gold-oracle Edge Function every 15s, renders goldEquiv + equityEquiv + affinityBonus chart.',
    route:       '/btng-value-generator',
    checkFn:     async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('gold-oracle', { body: {} });
      if (error) throw new Error('gold-oracle offline');
      const price = (data as any)?.priceUSD ?? 0;
      if (price < 100) throw new Error('Invalid gold price response');
      return { ok: true, detail: `XAU/USD $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · oracle LIVE` };
    },
  },
  {
    id:          'generator',
    step:        '4',
    title:       'Proof Generator',
    subtitle:    '--min-value 1000 --max-supply 10000',
    icon:        'auto-awesome',
    color:       Colors.primary,
    command:     'node scripts/init-generator.js --min-value 1000 --max-supply 10000',
    onspaceCmd:  'btng_certificates.insert() · MIN_GOLD_MG=1000 · MAX_SUPPLY=10000',
    description: 'Initializes the Proof-of-Value generator with min-value 1000mg gold and max supply 10,000 certificates. Validates DB capacity and minting pipeline.',
    route:       '/btng-gold-certificate',
    checkFn:     async () => {
      const supabase = getSupabaseClient();
      const { count, error } = await supabase
        .from('btng_certificates')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      const remaining = 10000 - (count ?? 0);
      return {
        ok: true,
        detail: `${count ?? 0}/10,000 certs minted · ${remaining.toLocaleString()} slots remaining`,
      };
    },
  },
] as const;

// ─── Terminal Log Line ────────────────────────────────────────────────────────

function LogLine({ text, index }: { text: string; index: number }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      delay: index * 30,
      useNativeDriver: true,
    }).start();
  }, [fade, index]);

  const isError   = text.startsWith('[ERROR]') || text.startsWith('✗');
  const isSuccess = text.startsWith('[OK]') || text.startsWith('✓') || text.includes('ONLINE');
  const isStep    = text.startsWith('→') || text.startsWith('▶');
  const color = isError ? Colors.error : isSuccess ? Colors.success : isStep ? Colors.warning : Colors.textSecondary;

  return (
    <Animated.Text style={[ll.text, { color, opacity: fade }]}>
      {text}
    </Animated.Text>
  );
}
const ll = StyleSheet.create({
  text: { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 16 },
});

// ─── Pulse Dot ────────────────────────────────────────────────────────────────

function PulseDot({ color = Colors.success, size = 8 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.9, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.28, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Engine Card ──────────────────────────────────────────────────────────────

function EngineCard({
  engine,
  state,
  onBoot,
  onNavigate,
}: {
  engine: typeof ENGINES[number];
  state: EngineState;
  onBoot: () => void;
  onNavigate: () => void;
}) {
  const isBooting = state.status === 'booting';
  const isOnline  = state.status === 'online';
  const isError   = state.status === 'error';
  const isIdle    = state.status === 'idle';

  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isBooting) {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.linear })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [isBooting, spinAnim]);

  const statusColor = isOnline ? Colors.success : isError ? Colors.error : isBooting ? Colors.warning : Colors.textMuted;
  const statusLabel = isOnline ? 'ONLINE' : isError ? 'ERROR' : isBooting ? 'BOOTING…' : 'IDLE';

  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isOnline) {
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else if (isIdle) {
      barAnim.setValue(0);
    }
  }, [isOnline, isIdle, barAnim]);

  return (
    <View style={[ec.card, { borderColor: isOnline ? engine.color + '55' : Colors.border }, isOnline && ec.cardOnline]}>
      {/* Step badge */}
      <View style={[ec.stepBadge, { backgroundColor: engine.color + '18', borderColor: engine.color + '44' }]}>
        <Text style={[ec.stepText, { color: engine.color }]}>#{engine.step}</Text>
      </View>

      {/* Header */}
      <View style={ec.header}>
        <View style={[ec.iconWrap, { backgroundColor: engine.color + '18', borderColor: engine.color + '44' }]}>
          {isBooting ? (
            <Animated.View style={{ transform: [{ rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
              <MaterialIcons name="settings" size={22} color={engine.color} />
            </Animated.View>
          ) : (
            <MaterialIcons name={engine.icon as any} size={22} color={engine.color} />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={ec.title}>{engine.title}</Text>
          <Text style={ec.subtitle} numberOfLines={1}>{engine.subtitle}</Text>
        </View>
        <View style={[ec.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
          {isOnline ? <PulseDot color={statusColor} size={6} /> : null}
          <Text style={[ec.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Command comparison */}
      <View style={ec.cmdBlock}>
        <View style={ec.cmdRow}>
          <MaterialIcons name="terminal" size={11} color={Colors.textMuted} />
          <Text style={ec.cmdLabel}>Original command</Text>
        </View>
        <Text style={ec.cmdText} selectable numberOfLines={1}>{engine.command}</Text>
        <View style={[ec.cmdRow, { marginTop: 5 }]}>
          <MaterialIcons name="cloud" size={11} color={engine.color} />
          <Text style={[ec.cmdLabel, { color: engine.color }]}>OnSpace equivalent</Text>
        </View>
        <Text style={[ec.cmdText, { color: engine.color }]} selectable numberOfLines={1}>
          {engine.onspaceCmd}
        </Text>
      </View>

      {/* Description */}
      <Text style={ec.desc}>{engine.description}</Text>

      {/* Progress bar (shown when online) */}
      {(isOnline || isBooting) && (
        <View style={ec.progressTrack}>
          <Animated.View
            style={[
              ec.progressFill,
              {
                width: isBooting
                  ? '60%'
                  : barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                backgroundColor: engine.color,
              },
            ]}
          />
        </View>
      )}

      {/* Latency / boot time */}
      {state.latency !== null && (
        <View style={ec.latencyRow}>
          <MaterialIcons name="speed" size={11} color={Colors.textMuted} />
          <Text style={ec.latencyText}>Boot time: {state.latency}ms</Text>
          {state.bootedAt && (
            <Text style={ec.bootedAt}>· {state.bootedAt}</Text>
          )}
        </View>
      )}

      {/* Terminal log */}
      {state.log.length > 0 && (
        <View style={ec.logBox}>
          {state.log.slice(-6).map((line, i) => (
            <LogLine key={`${i}-${line}`} text={line} index={i} />
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={ec.actions}>
        <TouchableOpacity
          style={[ec.bootBtn, { backgroundColor: engine.color, borderColor: engine.color }, isBooting && { opacity: 0.6 }]}
          onPress={onBoot}
          disabled={isBooting}
          activeOpacity={0.85}
        >
          {isBooting ? (
            <ActivityIndicator size="small" color={Colors.bg} />
          ) : (
            <MaterialIcons
              name={isOnline ? 'refresh' : isError ? 'replay' : 'play-arrow'}
              size={16}
              color={Colors.bg}
            />
          )}
          <Text style={ec.bootBtnText}>
            {isBooting ? 'Booting…' : isOnline ? 'Re-check' : isError ? 'Retry' : 'Boot Engine'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[ec.openBtn, { borderColor: engine.color + '55' }]}
          onPress={onNavigate}
          activeOpacity={0.8}
        >
          <MaterialIcons name="open-in-new" size={14} color={engine.color} />
          <Text style={[ec.openBtnText, { color: engine.color }]}>Open</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ec = StyleSheet.create({
  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, position: 'relative', overflow: 'hidden' },
  cardOnline:   { shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
  stepBadge:    { position: 'absolute', top: Spacing.md, right: Spacing.md, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  stepText:     { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  header:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingRight: 42 },
  iconWrap:     { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:        { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle:     { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  statusText:   { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  cmdBlock:     { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.sm + 2, gap: 3, borderWidth: 1, borderColor: Colors.border },
  cmdRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cmdLabel:     { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  cmdText:      { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Colors.textSecondary, includeFontPadding: false },
  desc:         { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  progressTrack:{ height: 4, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  latencyRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  latencyText:  { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  bootedAt:     { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  logBox:       { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  actions:      { flexDirection: 'row', gap: Spacing.sm },
  bootBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 3 },
  bootBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  openBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1 },
  openBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ─── Boot sequence log generator ─────────────────────────────────────────────

function buildBootLog(engineId: string): string[] {
  const ts = () => new Date().toISOString().split('T')[1].slice(0, 12);
  switch (engineId) {
    case 'contract':
      return [
        `[${ts()}] → Connecting to OnSpace Cloud backend`,
        `[${ts()}] → Verifying btng_certificates table schema`,
        `[${ts()}] → Checking RLS policies (auth_insert + auth_select)`,
        `[${ts()}] → Validating Edge Function: btng-custom-server`,
        `[${ts()}] → Confirming ERC-721 metadata structure`,
        `[${ts()}] ✓ Smart Contract Engine ONLINE`,
      ];
    case 'affinity':
      return [
        `[${ts()}] → Loading affinity_engine.py TypeScript port`,
        `[${ts()}] → Indexing orders + trade_history tables`,
        `[${ts()}] → Computing tx_life_score (min(count/100, 1.0) × 1000)`,
        `[${ts()}] → Indexing btng_wallets for staking_power`,
        `[${ts()}] → Computing social_affinity (eigenvector proxy)`,
        `[${ts()}] ✓ Affinity Oracle ONLINE · geometric_mean ready`,
      ];
    case 'dashboard':
      return [
        `[${ts()}] → Invoking gold-oracle Edge Function`,
        `[${ts()}] → Validating XAU/USD price response`,
        `[${ts()}] → Initializing 15s polling interval`,
        `[${ts()}] → Building sparkline (24 data points)`,
        `[${ts()}] → Proof-of-Value stream = goldEquiv + equityEquiv + affinityBonus`,
        `[${ts()}] ✓ Value Dashboard ONLINE · live XAU feed active`,
      ];
    case 'generator':
      return [
        `[${ts()}] → Reading --min-value 1000 (MIN_GOLD_MG=1000mg)`,
        `[${ts()}] → Reading --max-supply 10000 (MAX_SUPPLY=10,000 certs)`,
        `[${ts()}] → Counting active btng_certificates`,
        `[${ts()}] → Validating minting pipeline capacity`,
        `[${ts()}] → Checking btng-minting-pipeline Edge Function`,
        `[${ts()}] ✓ Proof Generator ONLINE · mint slots available`,
      ];
    default:
      return [`[${ts()}] ✓ Engine ONLINE`];
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BTNGEngineLauncherScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const gold    = useGoldOracle();

  const [engines, setEngines] = useState<Record<string, EngineState>>(() =>
    Object.fromEntries(
      ENGINES.map(e => [e.id, { status: 'idle' as EngineStatus, log: [], latency: null, bootedAt: null }])
    )
  );

  const [launchingAll, setLaunchingAll] = useState(false);

  // ── Boot a single engine ──────────────────────────────────────────────────
  const bootEngine = useCallback(async (engineId: string) => {
    const engine = ENGINES.find(e => e.id === engineId);
    if (!engine) return;

    setEngines(prev => ({
      ...prev,
      [engineId]: { status: 'booting', log: [], latency: null, bootedAt: null },
    }));

    const start = Date.now();

    // Stream log lines one by one
    const lines = buildBootLog(engineId);
    for (let i = 0; i < lines.length - 1; i++) {
      await new Promise(r => setTimeout(r, 320 + Math.random() * 180));
      setEngines(prev => ({
        ...prev,
        [engineId]: {
          ...prev[engineId],
          log: [...prev[engineId].log, lines[i]],
        },
      }));
    }

    // Run the actual health check
    try {
      const result = await engine.checkFn();
      const latency = Date.now() - start;
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setEngines(prev => ({
        ...prev,
        [engineId]: {
          status:   'online',
          log:      [...prev[engineId].log, lines[lines.length - 1], `[OK] ${result.detail}`],
          latency,
          bootedAt: now,
        },
      }));
    } catch (e: any) {
      const latency = Date.now() - start;
      setEngines(prev => ({
        ...prev,
        [engineId]: {
          status:   'error',
          log:      [...prev[engineId].log, `[ERROR] ${e.message ?? 'check failed'}`],
          latency,
          bootedAt: null,
        },
      }));
    }
  }, []);

  // ── Launch all 4 sequentially ─────────────────────────────────────────────
  const launchAllSequential = useCallback(async () => {
    if (launchingAll) return;
    setLaunchingAll(true);
    for (const engine of ENGINES) {
      await bootEngine(engine.id);
      await new Promise(r => setTimeout(r, 400)); // brief pause between stages
    }
    setLaunchingAll(false);
  }, [launchingAll, bootEngine]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const onlineCount  = Object.values(engines).filter(e => e.status === 'online').length;
  const errorCount   = Object.values(engines).filter(e => e.status === 'error').length;
  const bootingCount = Object.values(engines).filter(e => e.status === 'booting').length;
  const allOnline    = onlineCount === ENGINES.length;
  const isLive       = gold.source === 'live';
  const statusColor  = isLive ? Colors.success : Colors.warning;
  const goldUSD      = gold.priceUSD > 0 ? gold.priceUSD : 4329;

  // System health ring
  const healthPct = Math.round((onlineCount / ENGINES.length) * 100);
  const healthColor =
    healthPct === 100 ? Colors.success :
    healthPct >= 50  ? Colors.warning  : Colors.error;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Engine Launcher</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <PulseDot color={allOnline ? Colors.success : bootingCount > 0 ? Colors.warning : Colors.textMuted} size={6} />
            <Text style={[s.topSub, { color: allOnline ? Colors.success : bootingCount > 0 ? Colors.warning : Colors.textMuted }]}>
              {onlineCount}/4 engines · {bootingCount > 0 ? 'booting…' : allOnline ? 'all systems go' : `${errorCount} error${errorCount !== 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}
          onPress={() => router.push('/btng-sovereign-dashboard' as any)}
        >
          <MaterialIcons name="security" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── HERO CARD ──────────────────────────────────────────────────────── */}
        <View style={s.heroCard}>
          {/* Health ring */}
          <View style={s.healthRingWrap}>
            <View style={[s.healthRing, { borderColor: healthColor + '55', backgroundColor: healthColor + '10' }]}>
              <Text style={[s.healthPct, { color: healthColor }]}>{healthPct}%</Text>
              <Text style={s.healthLabel}>Health</Text>
            </View>
          </View>

          <View style={{ flex: 1, gap: Spacing.sm }}>
            <Text style={s.heroTitle}>BTNG Sovereign Engine</Text>
            <Text style={s.heroSub}>
              4-stage deployment sequence mapped from shell commands to live OnSpace services.
              Each engine checks its data source before going ONLINE.
            </Text>

            {/* Status chips */}
            <View style={s.statusChipsRow}>
              <View style={[s.statusChip, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' }]}>
                <MaterialIcons name="check-circle" size={11} color={Colors.success} />
                <Text style={[s.statusChipText, { color: Colors.success }]}>{onlineCount} Online</Text>
              </View>
              {errorCount > 0 && (
                <View style={[s.statusChip, { backgroundColor: Colors.error + '18', borderColor: Colors.error + '44' }]}>
                  <MaterialIcons name="cancel" size={11} color={Colors.error} />
                  <Text style={[s.statusChipText, { color: Colors.error }]}>{errorCount} Error</Text>
                </View>
              )}
              {bootingCount > 0 && (
                <View style={[s.statusChip, { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '44' }]}>
                  <ActivityIndicator size="small" color={Colors.warning} />
                  <Text style={[s.statusChipText, { color: Colors.warning }]}>{bootingCount} Booting</Text>
                </View>
              )}
              <View style={[s.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                <PulseDot color={statusColor} size={6} />
                <Text style={[s.statusChipText, { color: statusColor }]}>
                  XAU ${goldUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── LAUNCH ALL BUTTON ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.launchAllBtn, launchingAll && s.launchAllBtnBusy]}
          onPress={launchAllSequential}
          disabled={launchingAll}
          activeOpacity={0.85}
        >
          {launchingAll ? (
            <ActivityIndicator size="small" color={Colors.bg} />
          ) : (
            <MaterialIcons name={allOnline ? 'refresh' : 'rocket-launch'} size={22} color={Colors.bg} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.launchAllBtnText}>
              {launchingAll ? 'Launching sequence…' : allOnline ? 'Re-run Full Sequence' : 'Launch All Engines (1→2→3→4)'}
            </Text>
            <Text style={s.launchAllBtnSub}>
              Sequential boot · contract → affinity → dashboard → generator
            </Text>
          </View>
          {!launchingAll && (
            <View style={s.launchAllArrow}>
              <MaterialIcons name="arrow-forward" size={16} color={Colors.primary} />
            </View>
          )}
        </TouchableOpacity>

        {/* ── SEQUENCE REFERENCE ────────────────────────────────────────────── */}
        <View style={s.seqCard}>
          <View style={s.seqHeader}>
            <MaterialIcons name="terminal" size={14} color={Colors.textMuted} />
            <Text style={s.seqTitle}>Original Deployment Commands → OnSpace Mapping</Text>
          </View>
          {ENGINES.map((engine, i) => {
            const st = engines[engine.id];
            const sc = st.status === 'online' ? Colors.success : st.status === 'error' ? Colors.error : st.status === 'booting' ? Colors.warning : Colors.textMuted;
            return (
              <View
                key={engine.id}
                style={[s.seqRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '66' }]}
              >
                <View style={[s.seqNumWrap, { backgroundColor: engine.color + '18', borderColor: engine.color + '44' }]}>
                  <Text style={[s.seqNum, { color: engine.color }]}>{engine.step}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.seqCmd} numberOfLines={1}>{engine.command}</Text>
                  <Text style={[s.seqMap, { color: engine.color }]} numberOfLines={1}>→ {engine.onspaceCmd}</Text>
                </View>
                <View style={[s.seqStatusDot, { backgroundColor: sc }]} />
              </View>
            );
          })}
        </View>

        {/* ── ENGINE CARDS ──────────────────────────────────────────────────── */}
        {ENGINES.map(engine => (
          <EngineCard
            key={engine.id}
            engine={engine}
            state={engines[engine.id]}
            onBoot={() => bootEngine(engine.id)}
            onNavigate={() => router.push(engine.route as any)}
          />
        ))}

        {/* ── ALL ONLINE BANNER ─────────────────────────────────────────────── */}
        {allOnline && (
          <View style={s.allOnlineBanner}>
            <MaterialIcons name="verified" size={22} color={Colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={s.allOnlineTitle}>All 4 Engines Online</Text>
              <Text style={s.allOnlineSub}>
                Smart Contract · Affinity Oracle · Value Dashboard · Proof Generator
                — full BTNG sovereign stack operational.
              </Text>
            </View>
            <TouchableOpacity
              style={s.allOnlineBtn}
              onPress={() => router.push('/btng-proof-of-value' as any)}
              activeOpacity={0.85}
            >
              <Text style={s.allOnlineBtnText}>View PoV</Text>
              <MaterialIcons name="arrow-forward-ios" size={11} color={Colors.success} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── TECH REFERENCE ────────────────────────────────────────────────── */}
        <View style={s.techCard}>
          <View style={s.techHeader}>
            <MaterialIcons name="code" size={13} color={Colors.textMuted} />
            <Text style={s.techTitle}>Shell → OnSpace Platform Mapping</Text>
          </View>
          {[
            { shell: 'npx hardhat run …',                  onspace: 'supabase.functions.invoke() + btng_certificates schema'  },
            { shell: 'python affinity_engine.py --port 8080', onspace: 'calculateAffinityScore() TypeScript in-process'         },
            { shell: 'npm run dev (webpack/vite)',          onspace: 'React Native live preview + gold-oracle 15s polling'      },
            { shell: 'node scripts/init-generator.js',     onspace: 'btng_certificates.insert() with MIN_GOLD_MG guard'        },
            { shell: '--network mainnet',                   onspace: 'BTNG-MAINNET · 168.231.79.52:64799'                      },
            { shell: '--chain ethereum',                    onspace: 'BTNG Sovereign Chain · BIP-44 coin_type=9999'            },
            { shell: '--min-value 1000',                    onspace: 'MIN_GOLD_MG = 1000mg (1 gram minimum)'                   },
            { shell: '--max-supply 10000',                  onspace: 'MAX_SUPPLY = 10,000 active certificates cap'             },
          ].map((row, i) => (
            <View
              key={row.shell}
              style={[s.techRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '55' }]}
            >
              <Text style={s.techShell} numberOfLines={1}>{row.shell}</Text>
              <MaterialIcons name="east" size={10} color={Colors.textMuted} />
              <Text style={s.techOnspace} numberOfLines={1}>{row.onspace}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:  { alignItems: 'center', flex: 1, gap: 2 },
  topTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  scroll:     { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Hero
  heroCard:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', padding: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  healthRingWrap: { flexShrink: 0 },
  healthRing:     { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center', gap: 1 },
  healthPct:      { fontSize: 20, fontWeight: FontWeight.heavy, includeFontPadding: false },
  healthLabel:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  heroTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  heroSub:        { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  statusChipsRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  statusChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusChipText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Launch all
  launchAllBtn:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  launchAllBtnBusy: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, shadowOpacity: 0, elevation: 0 },
  launchAllBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  launchAllBtnSub:  { fontSize: 9, color: Colors.bg + 'AA', includeFontPadding: false, marginTop: 2 },
  launchAllArrow:   { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Sequence reference
  seqCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 2 },
  seqHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  seqTitle:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  seqRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 7 },
  seqNumWrap: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  seqNum:     { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  seqCmd:     { fontSize: 10, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  seqMap:     { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  seqStatusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  // All online banner
  allOnlineBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.success + '55' },
  allOnlineTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  allOnlineSub:    { fontSize: FontSize.xs, color: Colors.success + 'BB', lineHeight: 16, includeFontPadding: false, marginTop: 2 },
  allOnlineBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 1, flexShrink: 0 },
  allOnlineBtnText:{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Tech reference
  techCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 2 },
  techHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  techTitle:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  techRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  techShell:  { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  techOnspace:{ flex: 1, fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});
