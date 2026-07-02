// BTNG Governance Charter — Circle of Perpetual Unity
// Validators · Merchants · Contributors · Codex of Rituals
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Types ────────────────────────────────────────────────────────────────────
type RoleKey = 'validators' | 'merchants' | 'contributors';
type TabKey = 'overview' | 'roles' | 'rituals' | 'calendar';

// ── Data ─────────────────────────────────────────────────────────────────────
const ROLES = {
  validators: {
    emoji: '🔄',
    title: 'Validators',
    subtitle: 'Guardians of Consensus',
    color: '#3B82F6',
    glow: 'rgba(59,130,246,0.15)',
    description: 'Seal blocks, uphold consensus, and guard sovereignty across the BTNG network.',
    responsibilities: [
      'Seal blocks with integrity via consensus/pos-validator',
      'Monitor validator health through the dashboard',
      'Encrypt logs and backups for sovereign security',
      'Participate in governance discussions and protocol votes',
      'Stake renewal ceremonies every quarter',
    ],
    rituals: {
      daily: [
        'Seal blocks with integrity',
        'Monitor validator health via dashboard',
        'Encrypt logs and backups for security',
      ],
      weekly: [
        'Reconcile staking rewards',
        'Audit validator performance and uptime',
        'Participate in governance discussions',
      ],
      ceremonial: [
        'Stake renewal ceremonies every quarter',
        'Oath of sovereignty at validator onboarding',
        'Collective affirmation during protocol upgrades',
      ],
    },
  },
  merchants: {
    emoji: '💳',
    title: 'Merchants',
    subtitle: 'Bridges of Commerce',
    color: Colors.primary,
    glow: Colors.primaryGlow,
    description: 'Accept BTNG payments, protect customer data, and report suspicious activity flagged by AI fraud detection.',
    responsibilities: [
      'Register via the BTNG merchant dashboard',
      'Accept BTNG, GLD, BTC, ETH, USDT, BNB through BTNG-Pay',
      'Protect customer data with AES-256 encryption',
      'Report suspicious activity flagged by AI fraud detection',
      'Submit quarterly reconciliation scrolls to governance',
    ],
    rituals: {
      daily: [
        'Process transactions via BTNG-Pay',
        'Review fraud detection alerts',
        'Secure customer data with AES-256 encryption',
      ],
      weekly: [
        'Generate settlement reports',
        'Audit merchant dashboard for compliance',
        'Update accepted currencies and fee policies',
      ],
      ceremonial: [
        'Merchant onboarding oath: "Each payment is a treaty of dignity."',
        'Quarterly reconciliation scrolls to governance',
        'Participation in sovereign commerce festivals',
      ],
    },
  },
  contributors: {
    emoji: '🪙',
    title: 'Contributors',
    subtitle: 'Scribes of Sovereignty',
    color: '#22C55E',
    glow: 'rgba(34,197,94,0.15)',
    description: 'Contribute code, documentation, and governance modules with respect. Sign commits with verified GPG keys.',
    responsibilities: [
      'Contribute code, documentation, and governance modules',
      'Follow the Contributor Covenant Code of Conduct',
      'Sign commits with verified GPG keys (vigilant mode)',
      'Document changes in guides and changelogs',
      'Harmonize code with ceremonial governance charter',
    ],
    rituals: {
      daily: [
        'Commit code with verified GPG signatures',
        'Document changes in Developer Guide',
        'Review pull requests with respect and inclusion',
      ],
      weekly: [
        'Update user guides and documentation',
        'Participate in contributor covenant reflections',
        'Harmonize code with ceremonial governance charter',
      ],
      ceremonial: [
        'Each major release is a scroll of sovereignty',
        'Contributors pledge unity during covenant updates',
        'Annual ceremony of gratitude for all contributors',
      ],
    },
  },
};

const CALENDAR = [
  {
    period: 'Daily',
    icon: 'today',
    color: Colors.primary,
    items: [
      { role: '🔄', text: 'Validators seal blocks and encrypt logs' },
      { role: '💳', text: 'Merchants process payments and review fraud alerts' },
      { role: '🪙', text: 'Contributors commit code with GPG signatures' },
    ],
  },
  {
    period: 'Weekly',
    icon: 'date-range',
    color: '#3B82F6',
    items: [
      { role: '🔄', text: 'Reconcile staking rewards and audit uptime' },
      { role: '💳', text: 'Generate settlement reports and audit compliance' },
      { role: '🪙', text: 'Update documentation and participate in reviews' },
    ],
  },
  {
    period: 'Quarterly',
    icon: 'event-note',
    color: '#22C55E',
    items: [
      { role: '🔄', text: 'Stake renewal ceremony and governance votes' },
      { role: '💳', text: 'Reconciliation scrolls submitted to governance' },
      { role: '🪙', text: 'Covenant update pledge and contributor review' },
    ],
  },
  {
    period: 'Annual',
    icon: 'auto-awesome',
    color: Colors.warning,
    items: [
      { role: '🔄', text: 'Protocol upgrade affirmation and validator oath' },
      { role: '💳', text: 'Sovereign commerce festival participation' },
      { role: '🪙', text: 'Annual ceremony of gratitude for all contributors' },
    ],
  },
];

// ── Governance Triangle ──────────────────────────────────────────────────────
function GovernanceTriangle({ onSelectRole }: { onSelectRole: (r: RoleKey) => void }) {
  return (
    <View style={triStyles.wrap}>
      {/* Title */}
      <View style={triStyles.titleRow}>
        <View style={triStyles.flameDot} />
        <Text style={triStyles.title}>Circle of Perpetual Unity</Text>
        <View style={triStyles.flameDot} />
      </View>

      {/* Triangle SVG-style layout */}
      <View style={triStyles.triangle}>
        {/* Top: Validators */}
        <TouchableOpacity style={triStyles.topNode} onPress={() => onSelectRole('validators')} activeOpacity={0.8}>
          <View style={[triStyles.nodeCard, { borderColor: ROLES.validators.color + '66', backgroundColor: ROLES.validators.glow }]}>
            <Text style={triStyles.nodeEmoji}>🔄</Text>
            <Text style={[triStyles.nodeName, { color: ROLES.validators.color }]}>Validators</Text>
            <Text style={triStyles.nodeRole}>Guardians of Consensus</Text>
          </View>
        </TouchableOpacity>

        {/* Connector lines */}
        <View style={triStyles.connectorRow}>
          <View style={[triStyles.connectorDiag, triStyles.connectorLeft]} />
          <View style={triStyles.centerFlame}>
            <View style={triStyles.centerDot} />
            <Text style={triStyles.centerLabel}>BTNG{'\n'}Nationhood</Text>
          </View>
          <View style={[triStyles.connectorDiag, triStyles.connectorRight]} />
        </View>

        {/* Bottom row: Merchants + Contributors */}
        <View style={triStyles.bottomRow}>
          <TouchableOpacity style={triStyles.bottomNode} onPress={() => onSelectRole('merchants')} activeOpacity={0.8}>
            <View style={[triStyles.nodeCard, { borderColor: ROLES.merchants.color + '66', backgroundColor: ROLES.merchants.glow }]}>
              <Text style={triStyles.nodeEmoji}>💳</Text>
              <Text style={[triStyles.nodeName, { color: ROLES.merchants.color }]}>Merchants</Text>
              <Text style={triStyles.nodeRole}>Bridges of Commerce</Text>
            </View>
          </TouchableOpacity>

          <View style={triStyles.bottomConnector} />

          <TouchableOpacity style={triStyles.bottomNode} onPress={() => onSelectRole('contributors')} activeOpacity={0.8}>
            <View style={[triStyles.nodeCard, { borderColor: ROLES.contributors.color + '66', backgroundColor: ROLES.contributors.glow }]}>
              <Text style={triStyles.nodeEmoji}>🪙</Text>
              <Text style={[triStyles.nodeName, { color: ROLES.contributors.color }]}>Contributors</Text>
              <Text style={triStyles.nodeRole}>Scribes of Sovereignty</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Invocation */}
      <View style={triStyles.invocation}>
        <MaterialIcons name="auto-awesome" size={12} color={Colors.primary} />
        <Text style={triStyles.invocationText}>
          "In the circle, there is no hierarchy. Validators, Merchants, Contributors — all flow as one flame of sovereignty."
        </Text>
        <MaterialIcons name="auto-awesome" size={12} color={Colors.primary} />
      </View>
    </View>
  );
}

const triStyles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '33',
    gap: Spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  flameDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primary, opacity: 0.7 },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  triangle: { alignItems: 'center', gap: 0 },
  topNode: { zIndex: 2, marginBottom: -8 },
  nodeCard: {
    borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1.5, alignItems: 'center', gap: 3, minWidth: 130,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
  },
  nodeEmoji: { fontSize: 28 },
  nodeName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  nodeRole: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  connectorRow: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 40, height: 56 },
  connectorDiag: { flex: 1, height: 1.5, backgroundColor: Colors.primary, opacity: 0.3 },
  connectorLeft: { transform: [{ rotate: '25deg' }], transformOrigin: 'right' },
  connectorRight: { transform: [{ rotate: '-25deg' }], transformOrigin: 'left' },
  centerFlame: { alignItems: 'center', gap: 3, marginHorizontal: 8 },
  centerDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4,
  },
  centerLabel: { fontSize: 8, color: Colors.primary, fontWeight: FontWeight.bold, textAlign: 'center', letterSpacing: 0.5, includeFontPadding: false },
  bottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: -8, gap: 0 },
  bottomNode: { zIndex: 2 },
  bottomConnector: { flex: 1, height: 1.5, backgroundColor: Colors.primary, opacity: 0.3, marginHorizontal: -8 },
  invocation: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33',
  },
  invocationText: { flex: 1, fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 17, includeFontPadding: false },
});

// ── Role Detail Card ─────────────────────────────────────────────────────────
function RoleCard({ roleKey }: { roleKey: RoleKey }) {
  const role = ROLES[roleKey];
  const [tab, setTab] = useState<'responsibilities' | 'rituals'>('responsibilities');
  const ritualTabs: ('daily' | 'weekly' | 'ceremonial')[] = ['daily', 'weekly', 'ceremonial'];
  const [ritualTab, setRitualTab] = useState<'daily' | 'weekly' | 'ceremonial'>('daily');

  return (
    <View style={[rcStyles.card, { borderColor: role.color + '55' }]}>
      {/* Header */}
      <View style={rcStyles.header}>
        <View style={[rcStyles.iconWrap, { backgroundColor: role.glow, borderColor: role.color + '55' }]}>
          <Text style={rcStyles.emoji}>{role.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={rcStyles.titleRow}>
            <Text style={[rcStyles.title, { color: role.color }]}>{role.title}</Text>
            <View style={[rcStyles.badge, { backgroundColor: role.glow, borderColor: role.color + '44' }]}>
              <Text style={[rcStyles.badgeText, { color: role.color }]}>{role.subtitle.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={rcStyles.desc}>{role.description}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={rcStyles.tabRow}>
        {(['responsibilities', 'rituals'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[rcStyles.tabBtn, tab === t && [rcStyles.tabBtnActive, { backgroundColor: role.color, borderColor: role.color }]]}
            onPress={() => setTab(t)}
          >
            <Text style={[rcStyles.tabText, tab === t && rcStyles.tabTextActive]}>
              {t === 'responsibilities' ? 'Responsibilities' : 'Rituals'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Responsibilities */}
      {tab === 'responsibilities' && (
        <View style={rcStyles.listWrap}>
          {role.responsibilities.map((r, i) => (
            <View key={i} style={rcStyles.listRow}>
              <View style={[rcStyles.listDot, { backgroundColor: role.color }]} />
              <Text style={rcStyles.listText}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Rituals with sub-tabs */}
      {tab === 'rituals' && (
        <View style={rcStyles.ritualsWrap}>
          <View style={rcStyles.ritualTabRow}>
            {ritualTabs.map(rt => (
              <TouchableOpacity
                key={rt}
                style={[rcStyles.ritualTab, ritualTab === rt && [rcStyles.ritualTabActive, { borderColor: role.color }]]}
                onPress={() => setRitualTab(rt)}
              >
                <Text style={[rcStyles.ritualTabText, ritualTab === rt && { color: role.color, fontWeight: FontWeight.bold }]}>
                  {rt.charAt(0).toUpperCase() + rt.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {role.rituals[ritualTab].map((r, i) => (
            <View key={i} style={rcStyles.ritualRow}>
              <MaterialIcons
                name={ritualTab === 'daily' ? 'today' : ritualTab === 'weekly' ? 'date-range' : 'auto-awesome'}
                size={13}
                color={role.color}
              />
              <Text style={rcStyles.ritualText}>{r}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const rcStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, gap: Spacing.md },
  header: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  iconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  emoji: { fontSize: 30 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, includeFontPadding: false },
  badge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  desc: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: 4, includeFontPadding: false },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: 3, gap: 3, borderWidth: 1, borderColor: Colors.border },
  tabBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  tabBtnActive: {},
  tabText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: '#fff' },
  listWrap: { gap: Spacing.sm },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  listDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0 },
  listText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },
  ritualsWrap: { gap: Spacing.md },
  ritualTabRow: { flexDirection: 'row', gap: Spacing.sm },
  ritualTab: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgElevated },
  ritualTabActive: { backgroundColor: 'transparent' },
  ritualTabText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  ritualRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  ritualText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },
});

// ── Ceremonial Calendar ──────────────────────────────────────────────────────
function CeremonialCalendar() {
  return (
    <View style={calStyles.wrap}>
      <View style={calStyles.header}>
        <View style={calStyles.iconWrap}>
          <MaterialIcons name="event" size={20} color={Colors.primary} />
        </View>
        <View>
          <Text style={calStyles.title}>Ceremonial Calendar</Text>
          <Text style={calStyles.subtitle}>The sovereign rhythm of BTNG governance</Text>
        </View>
      </View>

      {CALENDAR.map((period) => (
        <View key={period.period} style={[calStyles.periodCard, { borderColor: period.color + '44' }]}>
          <View style={[calStyles.periodHeader, { backgroundColor: period.color + '18' }]}>
            <View style={[calStyles.periodIcon, { borderColor: period.color + '55', backgroundColor: period.color + '18' }]}>
              <MaterialIcons name={period.icon as any} size={16} color={period.color} />
            </View>
            <Text style={[calStyles.periodLabel, { color: period.color }]}>{period.period.toUpperCase()}</Text>
          </View>
          <View style={calStyles.periodItems}>
            {period.items.map((item, i) => (
              <View key={i} style={[calStyles.periodRow, i < period.items.length - 1 && calStyles.periodRowBorder]}>
                <Text style={calStyles.roleEmoji}>{item.role}</Text>
                <Text style={calStyles.periodText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {/* Closing */}
      <View style={calStyles.closing}>
        <Text style={calStyles.closingTitle}>🏛️ Closing Invocation</Text>
        <Text style={calStyles.closingText}>
          "Validators guard the chain, Merchants bridge commerce, Contributors inscribe the scrolls. Together, their rituals sustain the circle of perpetual unity."
        </Text>
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  periodCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  periodHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4 },
  periodIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  periodLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, letterSpacing: 1.5, includeFontPadding: false },
  periodItems: {},
  periodRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4 },
  periodRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  roleEmoji: { fontSize: 16, width: 24, textAlign: 'center' },
  periodText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  closing: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.sm, alignItems: 'center' },
  closingTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  closingText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', textAlign: 'center', lineHeight: 20, includeFontPadding: false },
});

// ── Security & Compliance ────────────────────────────────────────────────────
function SecurityCard() {
  const items = [
    { icon: 'security', label: 'Fraud Detection', desc: 'All participants must uphold fraud detection and AI monitoring rituals.' },
    { icon: 'lock', label: 'AES-256 Encryption', desc: 'All data encrypted at rest and in transit.' },
    { icon: 'gavel', label: 'Compliance', desc: 'Violations result in license termination under Hybrid Sovereign License v1.0.' },
    { icon: 'balance', label: 'Dispute Resolution', desc: 'Disputes resolved under Swiss jurisdiction + ICC arbitration.' },
  ];
  return (
    <View style={secStyles.card}>
      <View style={secStyles.header}>
        <View style={secStyles.iconWrap}><MaterialIcons name="verified-user" size={20} color={Colors.primary} /></View>
        <View>
          <Text style={secStyles.title}>Security & Compliance</Text>
          <Text style={secStyles.subtitle}>Hybrid Sovereign License v1.0</Text>
        </View>
      </View>
      {items.map((item, i) => (
        <View key={item.label} style={[secStyles.row, i < items.length - 1 && secStyles.rowBorder]}>
          <View style={secStyles.rowIcon}>
            <MaterialIcons name={item.icon as any} size={16} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={secStyles.rowLabel}>{item.label}</Text>
            <Text style={secStyles.rowDesc}>{item.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const secStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingTop: Spacing.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: Spacing.sm },
  rowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  rowDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: 2, includeFontPadding: false },
});

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function BtngGovernanceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null);

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'account-balance' },
    { key: 'roles', label: 'Roles', icon: 'people' },
    { key: 'rituals', label: 'Rituals', icon: 'auto-awesome' },
    { key: 'calendar', label: 'Calendar', icon: 'event' },
  ];

  const handleSelectRole = (r: RoleKey) => {
    setSelectedRole(r);
    setActiveTab('roles');
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Governance</Text>
          <Text style={s.topSub}>Circle of Perpetual Unity</Text>
        </View>
        <View style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
          <Text style={{ fontSize: 20 }}>🔺</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.75}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={14}
              color={activeTab === tab.key ? Colors.bg : Colors.textMuted}
            />
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            {/* Hero */}
            <View style={s.hero}>
              <Text style={s.heroEmoji}>🏛️</Text>
              <Text style={s.heroTitle}>BTNG Sovereign Governance</Text>
              <Text style={s.heroSub}>
                A ceremonial charter binding Validators, Merchants, and Contributors in a triangle of sovereign unity.
              </Text>
              <View style={s.heroBadgeRow}>
                <View style={s.heroBadge}><Text style={s.heroBadgeText}>54 Nations</Text></View>
                <View style={s.heroBadge}><Text style={s.heroBadgeText}>Hybrid License v1.0</Text></View>
                <View style={s.heroBadge}><Text style={s.heroBadgeText}>Swiss Jurisdiction</Text></View>
              </View>
            </View>

            {/* Governance Triangle */}
            <GovernanceTriangle onSelectRole={handleSelectRole} />

            {/* Quick role cards */}
            <View style={s.quickRoles}>
              {(Object.keys(ROLES) as RoleKey[]).map(rk => {
                const role = ROLES[rk];
                return (
                  <TouchableOpacity
                    key={rk}
                    style={[s.quickCard, { borderColor: role.color + '44' }]}
                    onPress={() => handleSelectRole(rk)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.quickEmoji}>{role.emoji}</Text>
                    <Text style={[s.quickName, { color: role.color }]}>{role.title}</Text>
                    <Text style={s.quickSub}>{role.subtitle}</Text>
                    <MaterialIcons name="chevron-right" size={14} color={role.color} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <SecurityCard />
          </>
        )}

        {/* ── ROLES ────────────────────────────────────────────────────────── */}
        {activeTab === 'roles' && (
          <>
            {/* Role selector */}
            <View style={s.rolePicker}>
              {(Object.keys(ROLES) as RoleKey[]).map(rk => {
                const role = ROLES[rk];
                const isActive = selectedRole === rk;
                return (
                  <TouchableOpacity
                    key={rk}
                    style={[s.rolePickerBtn, isActive && { backgroundColor: role.color, borderColor: role.color }]}
                    onPress={() => setSelectedRole(rk)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.rolePickerEmoji}>{role.emoji}</Text>
                    <Text style={[s.rolePickerText, isActive && { color: '#fff' }]}>{role.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedRole ? (
              <RoleCard roleKey={selectedRole} />
            ) : (
              <View style={s.rolePrompt}>
                <Text style={s.rolePromptText}>Select a role above to explore responsibilities and rituals.</Text>
              </View>
            )}
          </>
        )}

        {/* ── RITUALS ──────────────────────────────────────────────────────── */}
        {activeTab === 'rituals' && (
          <>
            <View style={s.ritualHero}>
              <Text style={{ fontSize: 40 }}>📜</Text>
              <Text style={s.ritualHeroTitle}>Codex of Rituals</Text>
              <Text style={s.ritualHeroSub}>"Rituals are the heartbeat of sovereignty. Each practice is a pulse of gratitude, each cycle a bloom of unity."</Text>
            </View>

            {(Object.keys(ROLES) as RoleKey[]).map(rk => (
              <RoleCard key={rk} roleKey={rk} />
            ))}

            <View style={s.codexNote}>
              <MaterialIcons name="library-books" size={14} color={Colors.primary} />
              <Text style={s.codexNoteText}>
                This Codex lives as a living guide for all BTNG participants — ensuring the Circle of Perpetual Unity remains alive and resonant.
              </Text>
            </View>
          </>
        )}

        {/* ── CALENDAR ─────────────────────────────────────────────────────── */}
        {activeTab === 'calendar' && <CeremonialCalendar />}

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, gap: 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  // Hero
  hero: { alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', gap: Spacing.sm },
  heroEmoji: { fontSize: 56 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, textAlign: 'center', includeFontPadding: false },
  heroSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  heroBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Quick roles
  quickRoles: { gap: Spacing.sm },
  quickCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1 },
  quickEmoji: { fontSize: 26, width: 36, textAlign: 'center' },
  quickName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, flex: 1, includeFontPadding: false },
  quickSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Role tab
  rolePicker: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, gap: 3, borderWidth: 1, borderColor: Colors.border },
  rolePickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  rolePickerEmoji: { fontSize: 16 },
  rolePickerText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  rolePrompt: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  rolePromptText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Rituals tab
  ritualHero: { alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', gap: Spacing.sm },
  ritualHeroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  ritualHeroSub: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  codexNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33' },
  codexNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
});
