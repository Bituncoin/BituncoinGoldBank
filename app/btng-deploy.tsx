// BTNG Node Deployment Guide — Step-by-step VPS setup
// SSH → Docker → BTNG Node → PM2 → UFW → Verify
import React, { useState, useRef, useCallback } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── VPS Servers ──────────────────────────────────────────────────────────────
const VPS_SERVERS = [
  {
    ip: '168.231.79.52',
    ipv6: '2a02:4780:f:bc::1',
    hostname: 'srv1282934.hstgr.cloud',
    plan: 'KVM 1',
    ram: '4 GB',
    disk: '50 GB',
    os: 'Ubuntu 24.04 LTS',
    role: 'Primary Sovereign Node',
    color: '#D4A017',
    emoji: '🏦',
    badge: 'PRIMARY',
    ptrRecord: 'srv1282934.hstgr.cloud',
    expiry: '2026-07+',
  },
  {
    ip: '72.62.160.237',
    ipv6: '',
    hostname: 'srv1219227.hstgr.cloud',
    plan: 'KVM 2',
    ram: '8 GB',
    disk: '100 GB',
    os: 'Ubuntu 24.04 + Docker',
    role: 'Secondary / Backup Node',
    color: '#3B82F6',
    emoji: '🔄',
    badge: 'SECONDARY',
    ptrRecord: 'srv1219227.hstgr.cloud',
    expiry: '2026-06-26',
  },
];

const NODE_IP   = '168.231.79.52';   // PRIMARY — srv1282934.hstgr.cloud
const NODE_IP2  = '72.62.160.237';   // SECONDARY — srv1219227.hstgr.cloud
const NODE_IPV6 = '2a02:4780:f:bc::1'; // PRIMARY IPv6
const NODE_PORT = 64799;
const NODE_URL  = `http://${NODE_IP}:${NODE_PORT}`;
const NODE_URL2 = `http://${NODE_IP2}:${NODE_PORT}`;

// ── Types ─────────────────────────────────────────────────────────────────────
interface CmdStep {
  label: string;
  cmd: string;
  note?: string;
  warn?: boolean;
}

interface PhaseData {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  emoji: string;
  steps: CmdStep[];
}

// ── Deployment Phases ─────────────────────────────────────────────────────────
const PHASES: PhaseData[] = [
  {
    id: 'ssh',
    icon: 'terminal',
    emoji: '🔐',
    title: 'SSH into VPS',
    subtitle: 'Connect to Hostinger VPS as root',
    color: '#3B82F6',
    steps: [
      {
        label: 'Connect via SSH',
        cmd: `ssh root@${NODE_IP}`,
        note: 'Enter your root password from the Hostinger panel when prompted.',
      },
      {
        label: 'Verify OS version',
        cmd: 'cat /etc/os-release',
        note: 'Should show Ubuntu 24.04.',
      },
      {
        label: 'Update system packages',
        cmd: 'apt update && apt upgrade -y',
        note: 'This may take 1–3 minutes on first run.',
      },
      {
        label: 'Install essential tools',
        cmd: 'apt install -y curl wget git nano unzip build-essential',
      },
    ],
  },
  {
    id: 'node',
    icon: 'code',
    emoji: '📦',
    title: 'Install Node.js',
    subtitle: 'Install Node.js 20 LTS via nvm',
    color: '#22C55E',
    steps: [
      {
        label: 'Install nvm (Node Version Manager)',
        cmd: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash',
      },
      {
        label: 'Load nvm into current session',
        cmd: 'export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"',
        note: 'Run this every time you open a new SSH session, or add it to ~/.bashrc.',
      },
      {
        label: 'Install Node.js 20 LTS',
        cmd: 'nvm install 20 && nvm use 20 && nvm alias default 20',
      },
      {
        label: 'Verify installation',
        cmd: 'node --version && npm --version',
        note: 'Should show v20.x.x and 10.x.x.',
      },
    ],
  },
  {
    id: 'btng',
    icon: 'hub',
    emoji: '⛓️',
    title: 'Deploy BTNG Node',
    subtitle: 'Create and launch the sovereign node',
    color: Colors.primary,
    steps: [
      {
        label: 'Create the node directory',
        cmd: 'mkdir -p /opt/btng-node && cd /opt/btng-node',
      },
      {
        label: 'Initialize npm project',
        cmd: 'cd /opt/btng-node && npm init -y',
      },
      {
        label: 'Install dependencies',
        cmd: 'cd /opt/btng-node && npm install express cors axios crypto socket.io',
        note: 'Installs all required packages for the BTNG sovereign node.',
      },
      {
        label: 'Create server.js (paste your node code)',
        cmd: 'nano /opt/btng-node/server.js',
        note: 'Paste the full BTNG server.js code, then press Ctrl+O to save and Ctrl+X to exit.',
        warn: true,
      },
      {
        label: 'Test: start the node manually',
        cmd: 'cd /opt/btng-node && node server.js',
        note: 'You should see the BTNG Sovereign Node banner. Press Ctrl+C to stop after confirming.',
      },
    ],
  },
  {
    id: 'pm2',
    icon: 'autorenew',
    emoji: '♻️',
    title: 'Configure PM2',
    subtitle: 'Auto-restart on crash & reboot',
    color: '#9945FF',
    steps: [
      {
        label: 'Install PM2 globally',
        cmd: 'npm install -g pm2',
      },
      {
        label: 'Start BTNG node with PM2',
        cmd: 'pm2 start /opt/btng-node/server.js --name btng-node',
      },
      {
        label: 'Save PM2 process list',
        cmd: 'pm2 save',
        note: 'This saves the running processes so they restart after reboot.',
      },
      {
        label: 'Enable PM2 on system boot',
        cmd: 'pm2 startup systemd -u root --hp /root',
        note: 'Copy and run the generated command exactly as shown.',
        warn: true,
      },
      {
        label: 'Verify PM2 status',
        cmd: 'pm2 status',
        note: 'btng-node should show status: online with a green indicator.',
      },
      {
        label: 'View live logs',
        cmd: 'pm2 logs btng-node --lines 50',
        note: 'Press Ctrl+C to stop following logs.',
      },
    ],
  },
  {
    id: 'ufw',
    icon: 'security',
    emoji: '🛡️',
    title: 'Configure Firewall (UFW)',
    subtitle: 'Open port 64799 for BTNG traffic',
    color: '#EF4444',
    steps: [
      {
        label: 'Check current UFW status',
        cmd: 'ufw status verbose',
      },
      {
        label: 'Allow SSH (port 22) — IMPORTANT first',
        cmd: 'ufw allow 22/tcp',
        note: 'Always allow SSH before enabling UFW or you will be locked out.',
        warn: true,
      },
      {
        label: 'Allow BTNG node port',
        cmd: `ufw allow ${NODE_PORT}/tcp`,
        note: `Opens TCP port ${NODE_PORT} for all BTNG API traffic.`,
      },
      {
        label: 'Allow HTTP and HTTPS',
        cmd: 'ufw allow 80/tcp && ufw allow 443/tcp',
      },
      {
        label: 'Allow additional BTNG service ports',
        cmd: 'ufw allow 3000/tcp && ufw allow 8081/tcp && ufw allow 8082/tcp && ufw allow 8088/tcp && ufw allow 8090/tcp',
        note: 'Opens Mobile Money Portal, AI Banker, Vault, Secondary Coin Wallet, and Explorer ports.',
      },
      {
        label: 'Enable UFW',
        cmd: 'ufw --force enable',
        note: 'This activates the firewall. Ensure SSH is allowed before running.',
        warn: true,
      },
      {
        label: 'Confirm final UFW rules',
        cmd: 'ufw status numbered',
      },
    ],
  },
  {
    id: 'verify',
    icon: 'verified',
    emoji: '✅',
    title: 'Verify All Endpoints',
    subtitle: 'Confirm every API route is live',
    color: '#22C55E',
    steps: [
      {
        label: 'Blockchain info',
        cmd: `curl ${NODE_URL}/api/v1/blockchain/info`,
        note: 'Should return JSON with network height, gold reserve, and genesis hash.',
      },
      {
        label: 'Genesis transaction',
        cmd: `curl ${NODE_URL}/api/v1/genesis`,
        note: 'Returns the founding BTNG transaction from February 18, 2026.',
      },
      {
        label: 'Gold reserve certificate',
        cmd: `curl ${NODE_URL}/api/v1/gold/reserve`,
        note: 'Returns BG-2026-001-GH certificate from Bank of Ghana Vault 001.',
      },
      {
        label: 'Network stats',
        cmd: `curl ${NODE_URL}/api/v1/stats`,
        note: 'Returns validators, TX count, block height, and market cap.',
      },
      {
        label: 'Address balance',
        cmd: `curl ${NODE_URL}/api/v1/balance/BTNG1DEMO123456789012345678901234567890`,
        note: 'Should return 125.5 BTNG for the demo wallet.',
      },
      {
        label: 'Price oracle',
        cmd: `curl ${NODE_URL}/api/v1/price`,
        note: 'Returns current BTNG/USD and XAU/USD rates.',
      },
      {
        label: 'Latest blocks',
        cmd: `curl "${NODE_URL}/api/v1/blocks/latest?count=5"`,
      },
      {
        label: 'Latest transactions',
        cmd: `curl "${NODE_URL}/api/v1/transactions/latest?count=10"`,
      },
    ],
  },
];

// ── Quick reference commands ──────────────────────────────────────────────────
// ── Secondary VPS SSH command ────────────────────────────────────────────────
const QUICK_CMDS2 = [
  { label: 'SSH to Secondary',  cmd: `ssh root@${NODE_IP2}`,                    color: '#3B82F6' },
  { label: 'Verify secondary',  cmd: `curl ${NODE_URL2}/api/v1/blockchain/info`, color: '#3B82F6' },
  { label: 'Clone from primary', cmd: `scp -r /opt/btng-node root@${NODE_IP2}:/opt/`, color: '#9945FF' },
  { label: 'Start on secondary', cmd: 'pm2 start /opt/btng-node/server.js --name btng-node', color: '#22C55E' },
];

const QUICK_CMDS = [
  { label: 'Restart node',    cmd: 'pm2 restart btng-node',   color: Colors.primary },
  { label: 'Stop node',       cmd: 'pm2 stop btng-node',      color: Colors.error  },
  { label: 'Live logs',       cmd: 'pm2 logs btng-node',      color: '#3B82F6'     },
  { label: 'PM2 monitor',     cmd: 'pm2 monit',               color: '#9945FF'     },
  { label: 'Node version',    cmd: 'node --version',          color: '#22C55E'     },
  { label: 'Port check',      cmd: `netstat -tuln | grep ${NODE_PORT}`, color: Colors.primary },
  { label: 'UFW status',      cmd: 'ufw status',              color: '#EF4444'     },
  { label: 'System uptime',   cmd: 'uptime -p',               color: Colors.textSecondary },
];

// ── Copy Button ───────────────────────────────────────────────────────────────
function CopyBtn({ value, size = 14 }: { value: string; size?: number }) {
  const [ok, setOk] = useState(false);
  return (
    <TouchableOpacity
      style={[cpb.btn, ok && cpb.done]}
      onPress={() => { ExpoClipboard.setStringAsync(value).catch(()=>{}); setOk(true); setTimeout(() => setOk(false), 2000); }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <MaterialIcons name={ok ? 'check' : 'content-copy'} size={size} color={ok ? Colors.success : Colors.primary} />
      <Text style={[cpb.txt, ok && { color: Colors.success }]}>{ok ? 'Copied!' : 'Copy'}</Text>
    </TouchableOpacity>
  );
}
const cpb = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  done: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  txt: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});

// ── Terminal Command Block ─────────────────────────────────────────────────────
function CmdBlock({ step, index }: { step: CmdStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={cb.wrap}>
      <View style={cb.header}>
        <View style={cb.numBadge}><Text style={cb.numText}>{index + 1}</Text></View>
        <Text style={cb.label}>{step.label}</Text>
        {step.warn && (
          <View style={cb.warnBadge}>
            <MaterialIcons name="warning" size={10} color={Colors.warning} />
            <Text style={cb.warnText}>Required</Text>
          </View>
        )}
      </View>
      <View style={cb.terminal}>
        <View style={cb.terminalDots}>
          {['#EF4444', '#F59E0B', '#22C55E'].map((c, i) => (
            <View key={i} style={[cb.dot, { backgroundColor: c }]} />
          ))}
          <Text style={cb.terminalHost}>root@btng-node</Text>
        </View>
        <Text style={cb.cmd}>$ {step.cmd}</Text>
        <View style={cb.cmdFooter}>
          <CopyBtn value={step.cmd} />
        </View>
      </View>
      {step.note && (
        <View style={cb.noteRow}>
          <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
          <Text style={cb.noteText}>{step.note}</Text>
        </View>
      )}
    </View>
  );
}
const cb = StyleSheet.create({
  wrap:     { gap: 8, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  header:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  numBadge: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  numText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  label:    { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  warnBadge:{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  warnText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  terminal: { backgroundColor: '#0A0A0F', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  terminalDots: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingTop: 9, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  dot:      { width: 10, height: 10, borderRadius: 5 },
  terminalHost: { flex: 1, fontSize: 9, color: '#5A5570', fontFamily: 'monospace', includeFontPadding: false, textAlign: 'right' },
  cmd:      { fontSize: 11, color: '#22C55E', fontFamily: 'monospace', padding: Spacing.md, lineHeight: 18, includeFontPadding: false },
  cmdFooter:{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  noteRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  noteText: { flex: 1, fontSize: 10, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
});

// ── Phase Card ────────────────────────────────────────────────────────────────
function PhaseCard({ phase, phaseIndex, completedSteps, onToggleStep }: {
  phase: PhaseData;
  phaseIndex: number;
  completedSteps: Set<string>;
  onToggleStep: (key: string) => void;
}) {
  const [open, setOpen] = useState(phaseIndex === 0);
  const rot = useRef(new Animated.Value(open ? 1 : 0)).current;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(rot, { toValue: next ? 1 : 0, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.ease) }).start();
  };

  const doneCount = phase.steps.filter((_, i) => completedSteps.has(`${phase.id}-${i}`)).length;
  const allDone   = doneCount === phase.steps.length;
  const rotate    = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={[pc.card, { borderColor: (allDone ? Colors.success : phase.color) + '44' }]}>
      <TouchableOpacity style={pc.header} onPress={toggle} activeOpacity={0.82}>
        <View style={[pc.phaseNum, { backgroundColor: phase.color + '18', borderColor: phase.color + '44' }]}>
          <Text style={{ fontSize: 20 }}>{phase.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[pc.title, { color: allDone ? Colors.success : phase.color }]}>{phase.title}</Text>
            {allDone && <MaterialIcons name="check-circle" size={14} color={Colors.success} />}
          </View>
          <Text style={pc.sub}>{phase.subtitle}</Text>
        </View>
        <View style={[pc.progressPill, { backgroundColor: phase.color + '18', borderColor: phase.color + '44' }]}>
          <Text style={[pc.progressText, { color: phase.color }]}>{doneCount}/{phase.steps.length}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }], marginLeft: 4 }}>
          <MaterialIcons name="expand-more" size={20} color={Colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <>
          {/* Progress bar */}
          <View style={pc.progressBar}>
            <View style={[pc.progressFill, {
              width: `${(doneCount / phase.steps.length) * 100}%` as any,
              backgroundColor: phase.color,
            }]} />
          </View>

          <View style={pc.body}>
            {phase.steps.map((step, i) => {
              const key = `${phase.id}-${i}`;
              const done = completedSteps.has(key);
              return (
                <View key={key}>
                  <CmdBlock step={step} index={i} />
                  <TouchableOpacity
                    style={[pc.markBtn, done && { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}
                    onPress={() => onToggleStep(key)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name={done ? 'check-box' : 'check-box-outline-blank'} size={16} color={done ? Colors.success : Colors.textMuted} />
                    <Text style={[pc.markBtnText, done && { color: Colors.success }]}>
                      {done ? 'Done' : 'Mark as done'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
const pc = StyleSheet.create({
  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  phaseNum:     { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:        { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  sub:          { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  progressPill: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  progressText: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  progressBar:  { height: 2, backgroundColor: Colors.bgElevated, marginHorizontal: Spacing.lg },
  progressFill: { height: 2, borderRadius: 1, minWidth: 4 },
  body:         { padding: Spacing.lg, paddingTop: Spacing.md },
  markBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, marginTop: 4, marginBottom: Spacing.xs, alignSelf: 'flex-start' },
  markBtnText:  { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ── Live Test Panel ────────────────────────────────────────────────────────────
const LIVE_TESTS = [
  { id: 'info',    label: 'Blockchain Info', path: '/api/v1/blockchain/info' },
  { id: 'genesis', label: 'Genesis TX',      path: '/api/v1/genesis'         },
  { id: 'gold',    label: 'Gold Reserve',    path: '/api/v1/gold/reserve'    },
  { id: 'stats',   label: 'Network Stats',   path: '/api/v1/stats'           },
  { id: 'price',   label: 'Price Oracle',    path: '/api/v1/price'           },
  { id: 'balance', label: 'Demo Wallet',     path: '/api/v1/balance/BTNG1DEMO123456789012345678901234567890' },
];

type TestState = 'idle' | 'running' | 'pass' | 'fail';

const NODE_CONFIGS = [
  { label: 'Primary',   ip: NODE_IP,  url: NODE_URL,  color: Colors.primary, badge: 'KVM 1' },
  { label: 'Secondary', ip: NODE_IP2, url: NODE_URL2, color: '#3B82F6',      badge: 'KVM 2' },
];

function NodeStatusIcon({ state, color }: { state: TestState; color: string }) {
  const c = state === 'pass' ? Colors.success : state === 'fail' ? Colors.error : state === 'running' ? Colors.warning : Colors.textMuted;
  return (
    <View style={[ltp.nodeIcon, { backgroundColor: c + '18', borderColor: c + '44', borderColor: color === Colors.primary ? c + '44' : c + '44' }]}>
      {state === 'running'
        ? <ActivityIndicator size="small" color={c} />
        : <MaterialIcons
            name={state === 'pass' ? 'check-circle' : state === 'fail' ? 'cancel' : 'radio-button-unchecked'}
            size={13} color={c}
          />}
    </View>
  );
}

function LiveTestPanel() {
  const [results1, setResults1] = useState<Record<string, TestState>>({});
  const [results2, setResults2] = useState<Record<string, TestState>>({});
  const [running, setRunning] = useState(false);
  const [passed1, setPassed1] = useState<number | null>(null);
  const [passed2, setPassed2] = useState<number | null>(null);

  const runNodeTests = useCallback(async (
    nodeUrl: string,
    setResults: React.Dispatch<React.SetStateAction<Record<string, TestState>>>,
    setPassed: React.Dispatch<React.SetStateAction<number | null>>,
  ) => {
    let count = 0;
    for (const test of LIVE_TESTS) {
      setResults(prev => ({ ...prev, [test.id]: 'running' }));
      await new Promise(res => setTimeout(res, 380));
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const resp = await fetch(`${nodeUrl}${test.path}`, { signal: ctrl.signal });
        clearTimeout(timer);
        const st: TestState = resp.ok ? 'pass' : 'fail';
        setResults(prev => ({ ...prev, [test.id]: st }));
        if (resp.ok) count++;
      } catch {
        setResults(prev => ({ ...prev, [test.id]: 'fail' }));
      }
    }
    setPassed(count);
  }, []);

  const runTests = useCallback(async () => {
    setRunning(true);
    setPassed1(null);
    setPassed2(null);
    const init: Record<string, TestState> = {};
    LIVE_TESTS.forEach(t => { init[t.id] = 'pending'; });
    setResults1({ ...init });
    setResults2({ ...init });

    await Promise.all([
      runNodeTests(NODE_URL,  setResults1, setPassed1),
      runNodeTests(NODE_URL2, setResults2, setPassed2),
    ]);
    setRunning(false);
  }, [runNodeTests]);

  const done = passed1 !== null && passed2 !== null;
  const totalPass  = (passed1 ?? 0) + (passed2 ?? 0);
  const totalTests = LIVE_TESTS.length * 2;
  const allHealthy = done && passed1 === LIVE_TESTS.length && passed2 === LIVE_TESTS.length;
  const partHealth = done && !allHealthy && totalPass > 0;

  const healthColor = allHealthy ? Colors.success : partHealth ? Colors.warning : Colors.error;
  const healthLabel = allHealthy
    ? 'ALL NODES HEALTHY'
    : partHealth
      ? `${totalPass}/${totalTests} ENDPOINTS LIVE`
      : 'NODES UNREACHABLE';
  const healthIcon  = allHealthy ? 'verified' : partHealth ? 'warning' : 'wifi-off';

  return (
    <View style={ltp.card}>
      {/* Header */}
      <View style={ltp.header}>
        <View style={ltp.iconWrap}>
          <MaterialIcons name="wifi-tethering" size={22} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ltp.title}>Live Endpoint Verification</Text>
          <Text style={ltp.sub}>Both nodes tested in parallel · Real-time results</Text>
        </View>
      </View>

      {/* Node headers */}
      <View style={ltp.nodeHeaderRow}>
        <View style={ltp.testLabelSpacer} />
        {NODE_CONFIGS.map(n => (
          <View key={n.ip} style={[ltp.nodeHeaderCell, { borderColor: n.color + '44', backgroundColor: n.color + '10' }]}>
            <View style={[ltp.nodeHeaderDot, { backgroundColor: n.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[ltp.nodeHeaderLabel, { color: n.color }]}>{n.label}</Text>
              <Text style={ltp.nodeHeaderIp}>{n.ip}</Text>
            </View>
            <View style={[ltp.nodeHeaderBadge, { backgroundColor: n.color + '18', borderColor: n.color + '44' }]}>
              <Text style={[ltp.nodeHeaderBadgeText, { color: n.color }]}>{n.badge}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Test rows */}
      <View style={ltp.testTableCard}>
        {LIVE_TESTS.map((test, i) => {
          const s1: TestState = results1[test.id] ?? 'idle';
          const s2: TestState = results2[test.id] ?? 'idle';
          const labelColor1 = s1 === 'pass' ? Colors.success : s1 === 'fail' ? Colors.error : s1 === 'running' ? Colors.warning : Colors.textMuted;
          const labelColor2 = s2 === 'pass' ? Colors.success : s2 === 'fail' ? Colors.error : s2 === 'running' ? Colors.warning : Colors.textMuted;
          return (
            <View key={test.id} style={[ltp.testRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '55' }]}>
              <View style={ltp.testLabelCol}>
                <Text style={ltp.testLabel} numberOfLines={1}>{test.label}</Text>
                <Text style={ltp.testPath} numberOfLines={1}>{test.path}</Text>
              </View>
              <View style={ltp.testStatusCol}>
                <NodeStatusIcon state={s1} color={Colors.primary} />
                <View style={[ltp.statusPill, { backgroundColor: labelColor1 + '18', borderColor: labelColor1 + '44' }]}>
                  <Text style={[ltp.statusPillText, { color: labelColor1 }]}>
                    {s1 === 'idle' ? '—' : s1 === 'pending' ? '·' : s1 === 'running' ? '...' : s1 === 'pass' ? 'LIVE' : 'FAIL'}
                  </Text>
                </View>
              </View>
              <View style={ltp.testDivider} />
              <View style={ltp.testStatusCol}>
                <NodeStatusIcon state={s2} color="#3B82F6" />
                <View style={[ltp.statusPill, { backgroundColor: labelColor2 + '18', borderColor: labelColor2 + '44' }]}>
                  <Text style={[ltp.statusPillText, { color: labelColor2 }]}>
                    {s2 === 'idle' ? '—' : s2 === 'pending' ? '·' : s2 === 'running' ? '...' : s2 === 'pass' ? 'LIVE' : 'FAIL'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Score row */}
      {done && (
        <View style={ltp.scoreRow}>
          {NODE_CONFIGS.map((n, idx) => {
            const p = idx === 0 ? passed1 : passed2;
            const all = p === LIVE_TESTS.length;
            const sc = all ? Colors.success : (p ?? 0) > 0 ? Colors.warning : Colors.error;
            return (
              <View key={n.ip} style={[ltp.scoreCell, { backgroundColor: sc + '10', borderColor: sc + '33' }]}>
                <MaterialIcons name={all ? 'check-circle' : 'warning'} size={14} color={sc} />
                <View style={{ flex: 1 }}>
                  <Text style={[ltp.scoreName, { color: n.color }]}>{n.label}</Text>
                  <Text style={[ltp.scoreVal, { color: sc }]}>{p}/{LIVE_TESTS.length} endpoints</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Combined health badge */}
      {done && (
        <View style={[ltp.healthBadge, { backgroundColor: healthColor + '14', borderColor: healthColor + '55' }]}>
          <MaterialIcons name={healthIcon as any} size={18} color={healthColor} />
          <View style={{ flex: 1 }}>
            <Text style={[ltp.healthLabel, { color: healthColor }]}>{healthLabel}</Text>
            <Text style={ltp.healthSub}>
              {allHealthy
                ? `Both nodes fully operational · ${totalPass} of ${totalTests} checks passed`
                : `Combined score: ${totalPass}/${totalTests} · ${done && passed1 !== null ? `Primary ${passed1}/${LIVE_TESTS.length}` : ''} · Secondary ${passed2 ?? 0}/${LIVE_TESTS.length}`}
            </Text>
          </View>
          <View style={[ltp.healthScore, { backgroundColor: healthColor + '22', borderColor: healthColor + '55' }]}>
            <Text style={[ltp.healthScoreText, { color: healthColor }]}>{totalPass}/{totalTests}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[ltp.runBtn, running && { opacity: 0.6 }]}
        onPress={runTests}
        disabled={running}
        activeOpacity={0.85}
      >
        {running
          ? <ActivityIndicator color={Colors.bg} size="small" />
          : <MaterialIcons name="play-arrow" size={18} color={Colors.bg} />}
        <Text style={ltp.runBtnText}>{running ? 'Testing both nodes in parallel…' : 'Run Parallel Tests'}</Text>
      </TouchableOpacity>
    </View>
  );
}
const ltp = StyleSheet.create({
  card:              { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  header:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap:          { width: 48, height: 48, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  title:             { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sub:               { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },

  nodeHeaderRow:     { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm },
  testLabelSpacer:   { width: 90 },
  nodeHeaderCell:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1 },
  nodeHeaderDot:     { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  nodeHeaderLabel:   { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  nodeHeaderIp:      { fontSize: 8, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  nodeHeaderBadge:   { borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  nodeHeaderBadgeText:{ fontSize: 7, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },

  testTableCard:     { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  testRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md },
  testLabelCol:      { width: 90, gap: 2 },
  testLabel:         { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  testPath:          { fontSize: 8, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  testStatusCol:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  testDivider:       { width: 1, height: 28, backgroundColor: Colors.border },
  nodeIcon:          { width: 26, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusPill:        { borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  statusPillText:    { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },

  scoreRow:          { flexDirection: 'row', gap: Spacing.sm },
  scoreCell:         { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1 },
  scoreName:         { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  scoreVal:          { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false, marginTop: 1 },

  healthBadge:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5 },
  healthLabel:       { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  healthSub:         { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false, lineHeight: 15 },
  healthScore:       { borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  healthScoreText:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },

  runBtn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  runBtnText:        { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ── Quick Reference ───────────────────────────────────────────────────────────
function QuickRef() {
  return (
    <View style={qr.card}>
      <View style={qr.header}>
        <MaterialIcons name="bolt" size={18} color={Colors.warning} />
        <Text style={qr.title}>Quick Reference Commands</Text>
      </View>
      {QUICK_CMDS.map((q, i) => (
        <View key={q.label} style={[qr.row, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '55' }]}>
          <View style={[qr.dot, { backgroundColor: q.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={qr.label}>{q.label}</Text>
            <Text style={qr.cmd}>$ {q.cmd}</Text>
          </View>
          <CopyBtn value={q.cmd} />
        </View>
      ))}
    </View>
  );
}
const qr = StyleSheet.create({
  card:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  title:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  row:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
  dot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 2 },
  label:  { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  cmd:    { fontSize: 11, color: Colors.primary, fontFamily: 'monospace', marginTop: 2, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngDeployScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [selectedVps, setSelectedVps] = useState(0);

  const toggleStep = useCallback((key: string) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const totalSteps  = PHASES.reduce((a, p) => a + p.steps.length, 0);
  const doneTotal   = completedSteps.size;
  const progressPct = Math.round((doneTotal / totalSteps) * 100);
  const allDone     = doneTotal === totalSteps;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Deploy BTNG Node</Text>
          <Text style={s.topSub}>Primary: {NODE_IP} · srv1282934.hstgr.cloud · Port {NODE_PORT}</Text>
        </View>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: allDone ? Colors.successBg : Colors.primaryGlow, borderColor: (allDone ? Colors.success : Colors.primary) + '66' }]}
          onPress={() => showAlert(allDone ? 'Deployment Complete!' : 'Progress', allDone ? 'All steps marked done. Your BTNG Sovereign Node is live.' : `${doneTotal} of ${totalSteps} steps complete (${progressPct}%)`)}
        >
          <MaterialIcons name={allDone ? 'check-circle' : 'info-outline'} size={18} color={allDone ? Colors.success : Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Progress Banner */}
      <View style={s.progressBanner}>
        <View style={s.progressBannerTop}>
          <Text style={s.progressLabel}>Deployment Progress</Text>
          <Text style={[s.progressPct, { color: allDone ? Colors.success : Colors.primary }]}>{progressPct}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, {
            width: `${progressPct}%` as any,
            backgroundColor: allDone ? Colors.success : Colors.primary,
          }]} />
        </View>
        <View style={s.progressBannerBottom}>
          <Text style={s.progressSub}>{doneTotal} / {totalSteps} steps complete</Text>
          {allDone && (
            <View style={s.allDoneBadge}>
              <MaterialIcons name="rocket-launch" size={11} color={Colors.success} />
              <Text style={s.allDoneText}>NODE LIVE</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* VPS Selector */}
        <View style={s.vpsSelectorRow}>
          {VPS_SERVERS.map((vps, idx) => (
            <TouchableOpacity
              key={vps.ip}
              style={[s.vpsSelectorBtn, selectedVps === idx && { borderColor: vps.color, backgroundColor: vps.color + '14' }]}
              onPress={() => setSelectedVps(idx)}
              activeOpacity={0.82}
            >
              <Text style={{ fontSize: 20 }}>{vps.emoji}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.vpsSelectorTitle, selectedVps === idx && { color: vps.color }]}>{vps.role}</Text>
                  <View style={[s.vpsSelectorBadge, { backgroundColor: vps.color + '18', borderColor: vps.color + '44' }]}>
                    <Text style={[s.vpsSelectorBadgeText, { color: vps.color }]}>{vps.badge}</Text>
                  </View>
                </View>
                <Text style={s.vpsSelectorSub}>{vps.ip} · {vps.plan}</Text>
              </View>
              {selectedVps === idx && <MaterialIcons name="radio-button-checked" size={16} color={vps.color} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Hero info card */}
        <View style={[s.infoCard, { borderColor: VPS_SERVERS[selectedVps].color + '66' }]}>
          <View style={s.infoRow}>
            <View style={s.infoItem}>
              <Text style={s.infoEmoji}>🖥️</Text>
              <Text style={[s.infoValue, { color: VPS_SERVERS[selectedVps].color }]}>{VPS_SERVERS[selectedVps].ip}</Text>
              <Text style={s.infoLabel}>VPS IP</Text>
            </View>
            <View style={s.infoDivider} />
            <View style={s.infoItem}>
              <Text style={s.infoEmoji}>🔌</Text>
              <Text style={s.infoValue}>{NODE_PORT}</Text>
              <Text style={s.infoLabel}>Port</Text>
            </View>
            <View style={s.infoDivider} />
            <View style={s.infoItem}>
              <Text style={s.infoEmoji}>💻</Text>
              <Text style={s.infoValue} numberOfLines={1}>{VPS_SERVERS[selectedVps].plan}</Text>
              <Text style={s.infoLabel}>Plan</Text>
            </View>
            <View style={s.infoDivider} />
            <View style={s.infoItem}>
              <Text style={s.infoEmoji}>🔋</Text>
              <Text style={s.infoValue}>{VPS_SERVERS[selectedVps].ram}</Text>
              <Text style={s.infoLabel}>RAM</Text>
            </View>
          </View>
          <View style={[s.vpsHostnameRow, { backgroundColor: VPS_SERVERS[selectedVps].color + '10', borderColor: VPS_SERVERS[selectedVps].color + '33' }]}>
            <MaterialIcons name="dns" size={12} color={VPS_SERVERS[selectedVps].color} />
            <Text style={[s.vpsHostnameText, { color: VPS_SERVERS[selectedVps].color }]}>{VPS_SERVERS[selectedVps].hostname}</Text>
            <Text style={s.vpsOsText}>{VPS_SERVERS[selectedVps].os}</Text>
          </View>
          <TouchableOpacity style={[s.sshQuickBtn, { backgroundColor: VPS_SERVERS[selectedVps].color }]}
            onPress={() => {
              const cmd = `ssh root@${VPS_SERVERS[selectedVps].ip}`;
              ExpoClipboard.setStringAsync(cmd).catch(()=>{});
              showAlert('Copied!', `SSH command copied:\n${cmd}`);
            }}>
            <MaterialIcons name="terminal" size={14} color={Colors.bg} />
            <Text style={s.sshQuickBtnText}>Copy SSH: ssh root@{VPS_SERVERS[selectedVps].ip}</Text>
          </TouchableOpacity>
        </View>

        {/* Phase Cards */}
        {PHASES.map((phase, i) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            phaseIndex={i}
            completedSteps={completedSteps}
            onToggleStep={toggleStep}
          />
        ))}

        {/* Live Test Panel */}
        <LiveTestPanel />

        {/* Quick Reference */}
        <QuickRef />

        {/* Secondary VPS Quick Commands */}
        <View style={s.secondaryCard}>
          <View style={s.secondaryHeader}>
            <Text style={{ fontSize: 20 }}>🔄</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.secondaryTitle}>Secondary VPS Quick Setup</Text>
              <Text style={s.secondarySub}>{NODE_IP2} · srv1219227.hstgr.cloud · KVM 2</Text>
            </View>
            <View style={[s.vpsSelectorBadge, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
              <Text style={[s.vpsSelectorBadgeText, { color: '#3B82F6' }]}>SECONDARY</Text>
            </View>
          </View>
          {QUICK_CMDS2.map((q, i) => (
            <View key={q.label} style={[qr.row, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '55' }]}>
              <View style={[qr.dot, { backgroundColor: q.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={qr.label}>{q.label}</Text>
                <Text style={qr.cmd}>$ {q.cmd}</Text>
              </View>
              <CopyBtn value={q.cmd} />
            </View>
          ))}
          <View style={s.secondaryNote}>
            <MaterialIcons name="info-outline" size={12} color="#3B82F6" />
            <Text style={s.secondaryNoteText}>Deploy the same BTNG node code on the secondary VPS for high-availability. Both nodes can run simultaneously on port {NODE_PORT}.</Text>
          </View>
        </View>

        {/* PTR / Reverse DNS Section */}
        <View style={s.ptrCard}>
          <View style={s.ptrHeader}>
            <View style={s.ptrIconWrap}>
              <MaterialIcons name="dns" size={20} color="#22C55E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.ptrTitle}>PTR / Reverse DNS Records</Text>
              <Text style={s.ptrSub}>Primary VPS — srv1282934.hstgr.cloud</Text>
            </View>
            <View style={[s.vpsSelectorBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
              <Text style={[s.vpsSelectorBadgeText, { color: '#22C55E' }]}>CONFIGURED</Text>
            </View>
          </View>
          {[
            { type: 'IPv4', address: '168.231.79.52',      ptr: 'srv1282934.hstgr.cloud', color: Colors.primary },
            { type: 'IPv6', address: '2a02:4780:f:bc::1',  ptr: 'srv1282934.hstgr.cloud', color: '#9945FF'      },
          ].map((rec, i) => (
            <View key={rec.type} style={[s.ptrRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
              <View style={[s.ptrTypeBadge, { backgroundColor: rec.color + '18', borderColor: rec.color + '44' }]}>
                <Text style={[s.ptrTypeText, { color: rec.color }]}>{rec.type}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={s.ptrAddrRow}>
                  <MaterialIcons name="computer" size={11} color={Colors.textMuted} />
                  <Text style={s.ptrAddr} selectable>{rec.address}</Text>
                  <CopyBtn value={rec.address} size={12} />
                </View>
                <View style={s.ptrAddrRow}>
                  <MaterialIcons name="arrow-forward" size={10} color={Colors.textMuted} />
                  <Text style={[s.ptrHostname, { color: rec.color }]} selectable>{rec.ptr}</Text>
                  <CopyBtn value={rec.ptr} size={12} />
                </View>
                <Text style={s.ptrActionText}>Set PTR record · Delete PTR record</Text>
              </View>
              <View style={s.ptrStatusBadge}>
                <View style={s.ptrStatusDot} />
                <Text style={s.ptrStatusText}>Active</Text>
              </View>
            </View>
          ))}
          <View style={s.ptrNote}>
            <MaterialIcons name="info-outline" size={12} color="#22C55E" />
            <Text style={s.ptrNoteText}>
              Both IPv4 (168.231.79.52) and IPv6 (2a02:4780:f:bc::1) PTR records resolve to srv1282934.hstgr.cloud.{' '}
              Manage in Hostinger panel → VPS → IP Management → Reverse DNS.
            </Text>
          </View>
        </View>

        {/* Docker note */}
        <View style={s.dockerNote}>
          <MaterialIcons name="info-outline" size={16} color={Colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={s.dockerNoteTitle}>Docker Alternative</Text>
            <Text style={s.dockerNoteText}>
              Your VPS has Docker pre-installed. If you prefer containers, you can run the BTNG node
              in Docker instead of Node.js directly. Use{' '}
              <Text style={s.dockerNoteCode}>docker run -d -p {NODE_PORT}:{NODE_PORT} --name btng-node btng/sovereign-node</Text>
              {' '}once a Docker image is published.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <MaterialIcons name="verified" size={16} color={Colors.primary} />
          <Text style={s.footerText}>
            {'BTNG Sovereign Node v1.0.0 · Ghana Mainnet · Bank of Ghana Vault 001 · Post-Quantum ML-DSA Security\nPrimary: 168.231.79.52 (IPv4) · 2a02:4780:f:bc::1 (IPv6) · srv1282934.hstgr.cloud'}
          </Text>
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.sm },
  backBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { flex: 1, alignItems: 'center' },
  topTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:    { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },

  // Progress banner
  progressBanner: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  progressBannerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  progressPct:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  progressTrack: { height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3, minWidth: 6 },
  progressBannerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressSub:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  allDoneBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  allDoneText:   { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xs, gap: Spacing.md },

  // Info card
  infoCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md },
  infoRow:     { flexDirection: 'row', alignItems: 'center' },
  infoItem:    { flex: 1, alignItems: 'center', gap: 4 },
  infoEmoji:   { fontSize: 22 },
  infoValue:   { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, textAlign: 'center' },
  infoLabel:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  infoDivider: { width: 1, height: 48, backgroundColor: Colors.border },
  sshQuickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  sshQuickBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // VPS Selector
  vpsSelectorRow:       { gap: Spacing.sm },
  vpsSelectorBtn:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.border },
  vpsSelectorTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  vpsSelectorSub:       { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false, marginTop: 2 },
  vpsSelectorBadge:     { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  vpsSelectorBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  vpsHostnameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1 },
  vpsHostnameText:      { flex: 1, fontSize: 10, fontFamily: 'monospace', includeFontPadding: false },
  vpsOsText:            { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  // Secondary card
  secondaryCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#3B82F644', gap: Spacing.sm },
  secondaryHeader:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: 2 },
  secondaryTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#3B82F6', includeFontPadding: false },
  secondarySub:         { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false, marginTop: 2 },
  secondaryNote:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#3B82F610', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#3B82F633', marginTop: Spacing.xs },
  secondaryNoteText:    { flex: 1, fontSize: FontSize.xs, color: '#3B82F6', lineHeight: 16, includeFontPadding: false },

  // PTR / Reverse DNS
  ptrCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#22C55E44', gap: Spacing.md },
  ptrHeader:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  ptrIconWrap:    { width: 44, height: 44, borderRadius: 13, backgroundColor: '#22C55E18', borderWidth: 1.5, borderColor: '#22C55E55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ptrTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  ptrSub:         { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  ptrRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.md },
  ptrTypeBadge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, alignSelf: 'flex-start' as const, marginTop: 2, flexShrink: 0 },
  ptrTypeText:    { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  ptrAddrRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ptrAddr:        { flex: 1, fontSize: 11, color: Colors.textPrimary, fontFamily: 'monospace' as any, includeFontPadding: false },
  ptrHostname:    { flex: 1, fontSize: 11, fontFamily: 'monospace' as any, fontWeight: FontWeight.bold, includeFontPadding: false },
  ptrActionText:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  ptrStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44', backgroundColor: Colors.successBg, alignSelf: 'flex-start' as const, flexShrink: 0 },
  ptrStatusDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  ptrStatusText:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  ptrNote:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#22C55E10', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#22C55E33' },
  ptrNoteText:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },

  dockerNote:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.info + '10', borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.info + '33' },
  dockerNoteTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.info, marginBottom: 4, includeFontPadding: false },
  dockerNoteText:  { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  dockerNoteCode:  { fontFamily: 'monospace', color: Colors.primary, fontSize: 10 },

  footer:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '55' },
  footerText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, fontStyle: 'italic', includeFontPadding: false },
});
