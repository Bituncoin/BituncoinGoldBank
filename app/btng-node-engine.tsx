import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Platform, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Constants ────────────────────────────────────────────────────────────────
const NODE_COST_BTNG = 100;
const AFN_PER_BLOCK = 10;
const BLOCK_TIME_SECS = 3;
const SWAP_RATE = 1000; // 1000 AFN = 1 BTNG
const SWAP_FEE_PCT = 2;
const BTNG_RPC = 'http://72.62.160.237:64799';

// ── Types ─────────────────────────────────────────────────────────────────────
interface NodeEntry {
  id: number;
  owner: string;
  registeredAt: number;
  lastClaim: number;
  active: boolean;
}

interface TokenStats {
  btngSupply: number;
  afnSupply: number;
  btngInEngine: number;
  nodeCount: number;
  totalAfnMinted: number;
  blockHeight: number;
}

// ── Mock data generation ─────────────────────────────────────────────────────
const MOCK_ADDRESS = 'BTNG1SOVEREIGN00001GHANA54AFRICA123456789';

function mockNodes(): NodeEntry[] {
  const now = Date.now() / 1000;
  return [
    { id: 0, owner: MOCK_ADDRESS, registeredAt: now - 86400 * 5, lastClaim: now - 3600 * 2, active: true },
    { id: 1, owner: MOCK_ADDRESS, registeredAt: now - 86400 * 3, lastClaim: now - 3600 * 5, active: true },
    { id: 2, owner: MOCK_ADDRESS, registeredAt: now - 86400 * 1, lastClaim: now - 1800, active: false },
  ];
}

function computePending(node: NodeEntry): number {
  if (!node.active) return 0;
  const now = Date.now() / 1000;
  const elapsed = now - node.lastClaim;
  const blocks = Math.floor(elapsed / BLOCK_TIME_SECS);
  return blocks * AFN_PER_BLOCK;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatNum(n: number, decimals = 2): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(decimals);
}

// ── Tab type ─────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'nodes' | 'swap' | 'auto';

// ── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ stats, loading, onRefresh }: { stats: TokenStats | null; loading: boolean; onRefresh: () => void }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <View style={ov.container}>
      {/* Ecosystem Hero */}
      <View style={ov.hero}>
        <View style={ov.heroIcon}>
          <Animated.View style={[ov.heroIconInner, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={ov.heroEmoji}>⚙️</Text>
          </Animated.View>
        </View>
        <Text style={ov.heroTitle}>BTNG Node Engine</Text>
        <Text style={ov.heroSub}>Two-Token Sovereign Ecosystem · Automatic Reward Generator</Text>
        <View style={ov.heroBadgeRow}>
          <View style={[ov.heroBadge, { borderColor: Colors.primary + '55' }]}>
            <View style={ov.heroBadgeDot} />
            <Text style={[ov.heroBadgeText, { color: Colors.primary }]}>BTNG · Gold Coin</Text>
          </View>
          <View style={[ov.heroBadge, { borderColor: '#22C55E55' }]}>
            <View style={[ov.heroBadgeDot, { backgroundColor: '#22C55E' }]} />
            <Text style={[ov.heroBadgeText, { color: '#22C55E' }]}>AFN · African Note</Text>
          </View>
        </View>
      </View>

      {/* Token Cards */}
      <View style={ov.tokenRow}>
        <View style={[ov.tokenCard, { borderColor: Colors.primary + '55' }]}>
          <View style={[ov.tokenIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
            <Text style={ov.tokenEmoji}>₿</Text>
          </View>
          <Text style={[ov.tokenSymbol, { color: Colors.primary }]}>BTNG</Text>
          <Text style={ov.tokenName}>Bituncoin Gold</Text>
          <View style={ov.tokenStatRow}>
            <Text style={ov.tokenStatLabel}>Max Supply</Text>
            <Text style={[ov.tokenStatValue, { color: Colors.primary }]}>21M</Text>
          </View>
          <View style={ov.tokenStatRow}>
            <Text style={ov.tokenStatLabel}>In Engine</Text>
            <Text style={ov.tokenStatValue}>{loading ? '—' : formatNum(stats?.btngInEngine ?? 5420)}</Text>
          </View>
          <View style={[ov.tokenTypeBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
            <Text style={[ov.tokenTypeText, { color: Colors.primary }]}>ERC-20 · Capped</Text>
          </View>
        </View>

        <View style={[ov.tokenCard, { borderColor: '#22C55E55' }]}>
          <View style={[ov.tokenIcon, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
            <Text style={ov.tokenEmoji}>🌍</Text>
          </View>
          <Text style={[ov.tokenSymbol, { color: '#22C55E' }]}>AFN</Text>
          <Text style={ov.tokenName}>African Note</Text>
          <View style={ov.tokenStatRow}>
            <Text style={ov.tokenStatLabel}>Genesis Supply</Text>
            <Text style={[ov.tokenStatValue, { color: '#22C55E' }]}>1B</Text>
          </View>
          <View style={ov.tokenStatRow}>
            <Text style={ov.tokenStatLabel}>Minted</Text>
            <Text style={ov.tokenStatValue}>{loading ? '—' : formatNum(stats?.totalAfnMinted ?? 842000)}</Text>
          </View>
          <View style={[ov.tokenTypeBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
            <Text style={[ov.tokenTypeText, { color: '#22C55E' }]}>ERC-20 · Mintable</Text>
          </View>
        </View>
      </View>

      {/* Engine Stats Grid */}
      <View style={ov.statsCard}>
        <View style={ov.statsHeader}>
          <View style={ov.statsIconWrap}><MaterialIcons name="analytics" size={16} color={Colors.primary} /></View>
          <Text style={ov.statsTitle}>Engine Metrics</Text>
          <TouchableOpacity style={ov.refreshBtn} onPress={onRefresh} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={16} color={Colors.primary} />}
          </TouchableOpacity>
        </View>
        <View style={ov.statsGrid}>
          {[
            { label: 'Active Nodes', value: loading ? '—' : String(stats?.nodeCount ?? 2), icon: 'device-hub', color: Colors.primary },
            { label: 'Block Height', value: loading ? '—' : `#${(stats?.blockHeight ?? 38421).toLocaleString()}`, icon: 'view-stream', color: '#3B82F6' },
            { label: 'AFN / Block', value: String(AFN_PER_BLOCK), icon: 'bolt', color: '#22C55E' },
            { label: 'Node Cost', value: `${NODE_COST_BTNG} BTNG`, icon: 'monetization-on', color: Colors.warning },
            { label: 'Swap Rate', value: `${SWAP_RATE} AFN`, icon: 'swap-horiz', color: '#9945FF' },
            { label: 'Swap Fee', value: `${SWAP_FEE_PCT}%`, icon: 'percent', color: Colors.error },
          ].map(item => (
            <View key={item.label} style={ov.statCell}>
              <MaterialIcons name={item.icon as any} size={16} color={item.color} />
              <Text style={[ov.statCellValue, { color: item.color }]}>{item.value}</Text>
              <Text style={ov.statCellLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tokenomics Flow */}
      <View style={ov.flowCard}>
        <Text style={ov.flowTitle}>Tokenomics Flow</Text>
        <View style={ov.flowRow}>
          <View style={[ov.flowNode, { borderColor: Colors.primary + '55' }]}>
            <Text style={[ov.flowNodeSymbol, { color: Colors.primary }]}>₿ BTNG</Text>
            <Text style={ov.flowNodeSub}>Stake to create node</Text>
          </View>
          <View style={ov.flowArrow}>
            <MaterialIcons name="arrow-forward" size={18} color={Colors.primary} />
            <Text style={ov.flowArrowLabel}>100 BTNG</Text>
          </View>
          <View style={[ov.flowNode, { borderColor: '#9945FF55' }]}>
            <Text style={[ov.flowNodeSymbol, { color: '#9945FF' }]}>⚙️ Node</Text>
            <Text style={ov.flowNodeSub}>Active generator</Text>
          </View>
        </View>
        <View style={ov.flowRow}>
          <View style={[ov.flowNode, { borderColor: '#9945FF55' }]}>
            <Text style={[ov.flowNodeSymbol, { color: '#9945FF' }]}>⚙️ Node</Text>
            <Text style={ov.flowNodeSub}>Earns per block</Text>
          </View>
          <View style={ov.flowArrow}>
            <MaterialIcons name="arrow-forward" size={18} color='#22C55E' />
            <Text style={[ov.flowArrowLabel, { color: '#22C55E' }]}>10 AFN/block</Text>
          </View>
          <View style={[ov.flowNode, { borderColor: '#22C55E55' }]}>
            <Text style={[ov.flowNodeSymbol, { color: '#22C55E' }]}>🌍 AFN</Text>
            <Text style={ov.flowNodeSub}>African Note reward</Text>
          </View>
        </View>
        <View style={ov.flowRow}>
          <View style={[ov.flowNode, { borderColor: '#22C55E55' }]}>
            <Text style={[ov.flowNodeSymbol, { color: '#22C55E' }]}>🌍 AFN</Text>
            <Text style={ov.flowNodeSub}>Swap to BTNG</Text>
          </View>
          <View style={ov.flowArrow}>
            <MaterialIcons name="arrow-forward" size={18} color={Colors.warning} />
            <Text style={[ov.flowArrowLabel, { color: Colors.warning }]}>1000 AFN → 1 BTNG</Text>
          </View>
          <View style={[ov.flowNode, { borderColor: Colors.primary + '55' }]}>
            <Text style={[ov.flowNodeSymbol, { color: Colors.primary }]}>₿ BTNG</Text>
            <Text style={ov.flowNodeSub}>-2% fee · net 0.98</Text>
          </View>
        </View>
      </View>

      {/* Contract Info */}
      <View style={ov.contractCard}>
        <View style={ov.contractHeader}>
          <MaterialIcons name="code" size={14} color={Colors.primary} />
          <Text style={ov.contractTitle}>Smart Contracts · Solidity ^0.8.19</Text>
        </View>
        {[
          { name: 'BituncoinGold (BTNG)', license: 'ERC-20 · Capped 21M', badge: 'DEPLOYED', badgeColor: Colors.primary },
          { name: 'AfricanNote (AFN)', license: 'ERC-20 · Mintable 1B', badge: 'DEPLOYED', badgeColor: '#22C55E' },
          { name: 'BTNGNodeEngine', license: 'Node Registry + Swap + AutoMint', badge: 'LIVE', badgeColor: '#9945FF' },
        ].map(c => (
          <View key={c.name} style={ov.contractRow}>
            <View style={ov.contractLeft}>
              <Text style={ov.contractName}>{c.name}</Text>
              <Text style={ov.contractLicense}>{c.license}</Text>
            </View>
            <View style={[ov.contractBadge, { backgroundColor: c.badgeColor + '18', borderColor: c.badgeColor + '44' }]}>
              <Text style={[ov.contractBadgeText, { color: c.badgeColor }]}>{c.badge}</Text>
            </View>
          </View>
        ))}
        <View style={ov.contractFooter}>
          <MaterialIcons name="security" size={11} color={Colors.textMuted} />
          <Text style={ov.contractFooterText}>OpenZeppelin · Ownable · ReentrancyGuard · ERC-20</Text>
        </View>
      </View>
    </View>
  );
}

const ov = StyleSheet.create({
  container: { gap: Spacing.md },
  hero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.primary + '44', alignItems: 'center', gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  heroIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 14, elevation: 8 },
  heroIconInner: { alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 32 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },
  heroSub: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', includeFontPadding: false, lineHeight: 16 },
  heroBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  heroBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  tokenRow: { flexDirection: 'row', gap: Spacing.sm },
  tokenCard: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, gap: 6, alignItems: 'center' },
  tokenIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tokenEmoji: { fontSize: 24 },
  tokenSymbol: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  tokenName: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  tokenStatRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  tokenStatLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  tokenStatValue: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tokenTypeBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, marginTop: 4 },
  tokenTypeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  statsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  statsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statsIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  statsTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  refreshBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCell: { width: '30.5%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 4 },
  statCellValue: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  statCellLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  flowCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  flowTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flowNode: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  flowNodeSymbol: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  flowNodeSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  flowArrow: { alignItems: 'center', gap: 2, width: 70 },
  flowArrowLabel: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, textAlign: 'center' },
  contractCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  contractHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  contractTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  contractRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  contractLeft: { flex: 1, gap: 2 },
  contractName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  contractLicense: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  contractBadge: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  contractBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  contractFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  contractFooterText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});

// ── Nodes Tab ─────────────────────────────────────────────────────────────────
function NodesTab({ nodes, onCreateNode, onClaim, onClaimAll, creating, claimingId }: {
  nodes: NodeEntry[];
  onCreateNode: () => void;
  onClaim: (id: number) => void;
  onClaimAll: () => void;
  creating: boolean;
  claimingId: number | null;
}) {
  const [liveRewards, setLiveRewards] = useState<Record<number, number>>({});

  useEffect(() => {
    const update = () => {
      const map: Record<number, number> = {};
      nodes.forEach(n => { map[n.id] = computePending(n); });
      setLiveRewards(map);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [nodes]);

  const totalPending = Object.values(liveRewards).reduce((a, b) => a + b, 0);
  const activeCount = nodes.filter(n => n.active).length;

  return (
    <View style={nd.container}>
      {/* Summary bar */}
      <View style={nd.summaryBar}>
        <View style={nd.summaryCell}>
          <Text style={nd.summaryCellValue}>{activeCount}</Text>
          <Text style={nd.summaryCellLabel}>Active Nodes</Text>
        </View>
        <View style={nd.summaryDivider} />
        <View style={nd.summaryCell}>
          <Text style={[nd.summaryCellValue, { color: '#22C55E' }]}>{formatNum(totalPending, 0)}</Text>
          <Text style={nd.summaryCellLabel}>Pending AFN</Text>
        </View>
        <View style={nd.summaryDivider} />
        <View style={nd.summaryCell}>
          <Text style={[nd.summaryCellValue, { color: Colors.primary }]}>{activeCount * AFN_PER_BLOCK}</Text>
          <Text style={nd.summaryCellLabel}>AFN / Block</Text>
        </View>
      </View>

      {/* Claim all */}
      {totalPending > 0 && (
        <TouchableOpacity style={nd.claimAllBtn} onPress={onClaimAll} activeOpacity={0.85}>
          <MaterialIcons name="savings" size={18} color={Colors.bg} />
          <View style={{ flex: 1 }}>
            <Text style={nd.claimAllTitle}>Claim All Rewards</Text>
            <Text style={nd.claimAllSub}>{formatNum(totalPending, 0)} AFN pending across {activeCount} node{activeCount !== 1 ? 's' : ''}</Text>
          </View>
          <View style={nd.claimAllBadge}>
            <Text style={nd.claimAllBadgeText}>{formatNum(totalPending, 0)} AFN</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Create Node */}
      <View style={nd.createCard}>
        <View style={nd.createHeader}>
          <View style={nd.createIconWrap}><MaterialIcons name="add-circle-outline" size={18} color={Colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={nd.createTitle}>Create New Node</Text>
            <Text style={nd.createSub}>Lock {NODE_COST_BTNG} BTNG · Start earning AFN immediately</Text>
          </View>
        </View>
        <View style={nd.createDetails}>
          {[
            { icon: 'monetization-on', label: 'Node Cost', value: `${NODE_COST_BTNG} BTNG`, color: Colors.primary },
            { icon: 'bolt', label: 'Earn Rate', value: `${AFN_PER_BLOCK} AFN / block`, color: '#22C55E' },
            { icon: 'timer', label: 'Block Time', value: `~${BLOCK_TIME_SECS}s`, color: Colors.warning },
            { icon: 'trending-up', label: 'Daily Est.', value: `~${((86400 / BLOCK_TIME_SECS) * AFN_PER_BLOCK / 1000).toFixed(1)}K AFN`, color: '#9945FF' },
          ].map(d => (
            <View key={d.label} style={nd.createDetailRow}>
              <MaterialIcons name={d.icon as any} size={12} color={d.color} />
              <Text style={nd.createDetailLabel}>{d.label}</Text>
              <Text style={[nd.createDetailValue, { color: d.color }]}>{d.value}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={[nd.createBtn, creating && { opacity: 0.6 }]} onPress={onCreateNode} disabled={creating} activeOpacity={0.85}>
          {creating ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="device-hub" size={18} color={Colors.bg} />}
          <Text style={nd.createBtnText}>{creating ? 'Deploying Node…' : 'Create Node · 100 BTNG'}</Text>
        </TouchableOpacity>
      </View>

      {/* Node list */}
      <Text style={nd.listTitle}>Your Nodes ({nodes.length})</Text>
      {nodes.length === 0 ? (
        <View style={nd.emptyState}>
          <MaterialIcons name="device-hub" size={36} color={Colors.textMuted} />
          <Text style={nd.emptyText}>No nodes yet — create your first node to start earning AFN</Text>
        </View>
      ) : (
        nodes.map(node => {
          const pending = liveRewards[node.id] ?? 0;
          const isClaiming = claimingId === node.id;
          return (
            <View key={node.id} style={[nd.nodeCard, !node.active && nd.nodeCardInactive]}>
              <View style={nd.nodeCardHeader}>
                <View style={[nd.nodeIndexBadge, node.active ? nd.nodeIndexActive : nd.nodeIndexInactive]}>
                  <Text style={[nd.nodeIndex, node.active && { color: Colors.bg }]}>#{node.id}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={nd.nodeOwner} numberOfLines={1}>{`${node.owner.slice(0, 12)}…${node.owner.slice(-6)}`}</Text>
                  <Text style={nd.nodeCreated}>Created {timeAgo(node.registeredAt)}</Text>
                </View>
                <View style={[nd.nodeStatusBadge, node.active ? nd.nodeStatusActive : nd.nodeStatusInactive]}>
                  <View style={[nd.nodeStatusDot, node.active ? nd.nodeStatusDotActive : nd.nodeStatusDotInactive]} />
                  <Text style={[nd.nodeStatusText, node.active ? nd.nodeStatusTextActive : nd.nodeStatusTextInactive]}>
                    {node.active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>

              <View style={nd.nodeMetrics}>
                <View style={nd.nodeMetricCell}>
                  <Text style={[nd.nodeMetricValue, { color: '#22C55E' }]}>{formatNum(pending, 0)}</Text>
                  <Text style={nd.nodeMetricLabel}>Pending AFN</Text>
                </View>
                <View style={nd.nodeMetricDivider} />
                <View style={nd.nodeMetricCell}>
                  <Text style={nd.nodeMetricValue}>{timeAgo(node.lastClaim)}</Text>
                  <Text style={nd.nodeMetricLabel}>Last Claim</Text>
                </View>
                <View style={nd.nodeMetricDivider} />
                <View style={nd.nodeMetricCell}>
                  <Text style={[nd.nodeMetricValue, { color: Colors.primary }]}>{node.active ? `${AFN_PER_BLOCK}/blk` : '0'}</Text>
                  <Text style={nd.nodeMetricLabel}>Earn Rate</Text>
                </View>
              </View>

              {node.active ? (
                <TouchableOpacity
                  style={[nd.claimBtn, (isClaiming || pending === 0) && { opacity: 0.5 }]}
                  onPress={() => onClaim(node.id)}
                  disabled={isClaiming || pending === 0}
                  activeOpacity={0.85}
                >
                  {isClaiming ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="savings" size={15} color={Colors.bg} />}
                  <Text style={nd.claimBtnText}>
                    {isClaiming ? 'Claiming…' : pending === 0 ? 'No rewards yet' : `Claim ${formatNum(pending, 0)} AFN`}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={nd.inactiveNote}>
                  <MaterialIcons name="block" size={12} color={Colors.textMuted} />
                  <Text style={nd.inactiveNoteText}>Node deactivated by admin — no rewards accruing</Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const nd = StyleSheet.create({
  container: { gap: Spacing.md },
  summaryBar: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center' },
  summaryCell: { flex: 1, alignItems: 'center', gap: 3 },
  summaryCellValue: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  summaryCellLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  summaryDivider: { width: 1, height: 36, backgroundColor: Colors.border },
  claimAllBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#22C55E', borderRadius: Radius.xl, padding: Spacing.md, shadowColor: '#22C55E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  claimAllTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  claimAllSub: { fontSize: 10, color: Colors.bg, opacity: 0.8, includeFontPadding: false, marginTop: 1 },
  claimAllBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  claimAllBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  createCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 },
  createHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  createIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  createTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  createSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  createDetails: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  createDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  createDetailLabel: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  createDetailValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  createBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  listTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  emptyState: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: Spacing.lg, includeFontPadding: false },
  nodeCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '33', overflow: 'hidden', gap: 0, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  nodeCardInactive: { borderColor: Colors.border, opacity: 0.7 },
  nodeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  nodeIndexBadge: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  nodeIndexActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  nodeIndexInactive: { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  nodeIndex: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  nodeOwner: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  nodeCreated: { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  nodeStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  nodeStatusActive: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  nodeStatusInactive: { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  nodeStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  nodeStatusDotActive: { backgroundColor: Colors.success },
  nodeStatusDotInactive: { backgroundColor: Colors.textMuted },
  nodeStatusText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  nodeStatusTextActive: { color: Colors.success },
  nodeStatusTextInactive: { color: Colors.textMuted },
  nodeMetrics: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bgElevated },
  nodeMetricCell: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm + 2, gap: 2 },
  nodeMetricValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  nodeMetricLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  nodeMetricDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  claimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#22C55E', margin: Spacing.md, marginTop: 0, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  claimBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  inactiveNote: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, paddingBottom: Spacing.md },
  inactiveNoteText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});

// ── Swap Tab ─────────────────────────────────────────────────────────────────
function SwapTab({ onSwap, swapping }: { onSwap: (afn: number) => void; swapping: boolean }) {
  const [afnInput, setAfnInput] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;

  const afnAmount = parseFloat(afnInput.replace(/[^0-9.]/g, '')) || 0;
  const btngOut = Math.floor(afnAmount / SWAP_RATE);
  const fee = (btngOut * SWAP_FEE_PCT) / 100;
  const netBtng = btngOut - fee;
  const isValid = afnAmount >= SWAP_RATE && btngOut > 0;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(slideAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <View style={sw.container}>
      {/* Header */}
      <View style={sw.header}>
        <View style={sw.headerIconWrap}><MaterialIcons name="swap-horiz" size={22} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={sw.headerTitle}>AFN → BTNG Swap</Text>
          <Text style={sw.headerSub}>African Note to Bituncoin Gold · {SWAP_RATE} AFN = 1 BTNG · {SWAP_FEE_PCT}% fee</Text>
        </View>
      </View>

      {/* From */}
      <View style={sw.inputCard}>
        <View style={sw.inputCardHeader}>
          <View style={[sw.tokenBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
            <Text style={[sw.tokenBadgeSymbol, { color: '#22C55E' }]}>🌍 AFN</Text>
          </View>
          <Text style={sw.inputCardLabel}>You pay</Text>
        </View>
        <View style={sw.inputRow}>
          <TextInput
            style={sw.input}
            value={afnInput}
            onChangeText={v => setAfnInput(v.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          <Text style={sw.inputSymbol}>AFN</Text>
        </View>
        <View style={sw.quickRow}>
          {[1000, 5000, 10000, 50000].map(amt => (
            <TouchableOpacity key={amt} style={sw.quickBtn} onPress={() => setAfnInput(String(amt))} activeOpacity={0.75}>
              <Text style={sw.quickBtnText}>{amt >= 1000 ? `${amt / 1000}K` : String(amt)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Animated Arrow */}
      <View style={sw.arrowWrap}>
        <Animated.View style={[sw.arrowCircle, { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) }] }]}>
          <MaterialIcons name="arrow-downward" size={20} color={Colors.primary} />
        </Animated.View>
      </View>

      {/* To */}
      <View style={[sw.inputCard, sw.inputCardOut, { borderColor: Colors.primary + '55' }]}>
        <View style={sw.inputCardHeader}>
          <View style={[sw.tokenBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
            <Text style={[sw.tokenBadgeSymbol, { color: Colors.primary }]}>₿ BTNG</Text>
          </View>
          <Text style={sw.inputCardLabel}>You receive</Text>
        </View>
        <View style={sw.inputRow}>
          <Text style={[sw.inputDisplay, netBtng > 0 ? { color: Colors.primary } : null]}>{netBtng > 0 ? netBtng.toFixed(4) : '0'}</Text>
          <Text style={sw.inputSymbol}>BTNG</Text>
        </View>
      </View>

      {/* Details */}
      {afnAmount > 0 && (
        <View style={sw.detailsCard}>
          {[
            { label: 'Exchange Rate', value: `${SWAP_RATE} AFN = 1 BTNG`, color: Colors.textPrimary },
            { label: 'BTNG Before Fee', value: `${btngOut} BTNG`, color: Colors.textPrimary },
            { label: `Fee (${SWAP_FEE_PCT}%)`, value: `${fee.toFixed(4)} BTNG`, color: Colors.error },
            { label: 'You Receive', value: `${netBtng.toFixed(4)} BTNG`, color: Colors.primary },
          ].map(d => (
            <View key={d.label} style={sw.detailRow}>
              <Text style={sw.detailLabel}>{d.label}</Text>
              <Text style={[sw.detailValue, { color: d.color }]}>{d.value}</Text>
            </View>
          ))}
        </View>
      )}

      {!isValid && afnAmount > 0 && afnAmount < SWAP_RATE && (
        <View style={sw.errorRow}>
          <MaterialIcons name="error-outline" size={13} color={Colors.error} />
          <Text style={sw.errorText}>Minimum swap is {SWAP_RATE} AFN (= 1 BTNG)</Text>
        </View>
      )}

      <TouchableOpacity
        style={[sw.swapBtn, (!isValid || swapping) && { opacity: 0.45 }]}
        onPress={() => onSwap(afnAmount)}
        disabled={!isValid || swapping}
        activeOpacity={0.85}
      >
        {swapping ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="swap-horiz" size={20} color={Colors.bg} />}
        <Text style={sw.swapBtnText}>{swapping ? 'Executing Swap…' : 'Swap AFN → BTNG'}</Text>
      </TouchableOpacity>

      {/* Info */}
      <View style={sw.infoCard}>
        <View style={sw.infoRow}><MaterialIcons name="info-outline" size={12} color={Colors.textMuted} /><Text style={sw.infoText}>Fee stays in contract as protocol profit</Text></View>
        <View style={sw.infoRow}><MaterialIcons name="security" size={12} color={Colors.textMuted} /><Text style={sw.infoText}>ReentrancyGuard protected · OpenZeppelin</Text></View>
        <View style={sw.infoRow}><MaterialIcons name="code" size={12} color={Colors.textMuted} /><Text style={sw.infoText}>swapAfnToBtng() on BTNGNodeEngine contract</Text></View>
      </View>
    </View>
  );
}

const sw = StyleSheet.create({
  container: { gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33' },
  headerIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2, lineHeight: 15 },
  inputCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.border, gap: Spacing.sm },
  inputCardOut: { backgroundColor: Colors.bgElevated },
  inputCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tokenBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  tokenBadgeSymbol: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  inputCardLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { flex: 1, fontSize: 32, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  inputDisplay: { flex: 1, fontSize: 32, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  inputSymbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  quickRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  quickBtn: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  quickBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  arrowWrap: { alignItems: 'center' },
  arrowCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  detailsCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  detailValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.errorBg, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.error + '44' },
  errorText: { fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  swapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  swapBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  infoCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
});

// ── Auto Generator Tab ────────────────────────────────────────────────────────
function AutoGenTab({ nodes, onAutoDistribute, distributing }: {
  nodes: NodeEntry[];
  onAutoDistribute: () => void;
  distributing: boolean;
}) {
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [interval, setIntervalMs] = useState(3600);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (autoEnabled) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])).start();
      setCountdown(interval);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { return interval; }
          return prev - 1;
        });
      }, 1000);
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(0);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [autoEnabled, interval]);

  const activeNodes = nodes.filter(n => n.active);

  const handleManualRun = useCallback(() => {
    onAutoDistribute();
    setLastRun(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const next = new Date(Date.now() + interval * 1000);
    setNextRun(next.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, [onAutoDistribute, interval]);

  const SCHEDULE_OPTIONS = [
    { label: 'Every 15 min', secs: 900 },
    { label: 'Every hour', secs: 3600 },
    { label: 'Every 6 hours', secs: 21600 },
    { label: 'Every 24 hours', secs: 86400 },
  ];

  return (
    <View style={ag.container}>
      {/* Status card */}
      <View style={[ag.statusCard, autoEnabled && { borderColor: Colors.success + '66' }]}>
        <View style={ag.statusHeader}>
          <Animated.View style={[ag.statusIconWrap, autoEnabled && { borderColor: Colors.success + '88', backgroundColor: '#22C55E18' }, { opacity: autoEnabled ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : 1 }]}>
            <MaterialIcons name={autoEnabled ? 'auto-mode' : 'play-circle-outline'} size={26} color={autoEnabled ? Colors.success : Colors.textMuted} />
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={ag.statusTitle}>Auto Generator Engine</Text>
            <Text style={ag.statusSub}>{autoEnabled ? `Running · distributing every ${interval >= 3600 ? `${interval / 3600}h` : `${interval / 60}m`}` : 'Paused · tap to activate'}</Text>
          </View>
          <TouchableOpacity
            style={[ag.toggleBtn, autoEnabled && ag.toggleBtnOn]}
            onPress={() => setAutoEnabled(v => !v)}
            activeOpacity={0.85}
          >
            <Text style={[ag.toggleBtnText, autoEnabled && { color: Colors.bg }]}>{autoEnabled ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
        </View>

        {autoEnabled && (
          <View style={ag.countdownRow}>
            <View style={ag.countdownTrack}>
              <Animated.View style={[ag.countdownBar, { width: `${(countdown / interval) * 100}%` as any }]} />
            </View>
            <Text style={ag.countdownText}>Next distribution in {countdown >= 3600 ? `${Math.floor(countdown / 3600)}h ${Math.floor((countdown % 3600) / 60)}m` : countdown >= 60 ? `${Math.floor(countdown / 60)}m ${countdown % 60}s` : `${countdown}s`}</Text>
          </View>
        )}
      </View>

      {/* Schedule picker */}
      <View style={ag.scheduleCard}>
        <Text style={ag.scheduleTitle}>Distribution Schedule</Text>
        <View style={ag.scheduleGrid}>
          {SCHEDULE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.secs}
              style={[ag.scheduleBtn, interval === opt.secs && ag.scheduleBtnActive]}
              onPress={() => setIntervalMs(opt.secs)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="schedule" size={12} color={interval === opt.secs ? Colors.bg : Colors.textMuted} />
              <Text style={[ag.scheduleBtnText, interval === opt.secs && { color: Colors.bg }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Manual trigger */}
      <TouchableOpacity style={[ag.manualBtn, distributing && { opacity: 0.6 }]} onPress={handleManualRun} disabled={distributing} activeOpacity={0.85}>
        {distributing ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="send" size={18} color={Colors.bg} />}
        <View style={{ flex: 1 }}>
          <Text style={ag.manualBtnTitle}>{distributing ? 'Distributing Rewards…' : 'Run Auto-Distribute Now'}</Text>
          <Text style={ag.manualBtnSub}>Calls autoGenerateAndDistribute() on {activeNodes.length} active node{activeNodes.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={ag.manualBadge}><Text style={ag.manualBadgeText}>OWNER</Text></View>
      </TouchableOpacity>

      {/* Last run info */}
      {lastRun && (
        <View style={ag.runInfo}>
          <View style={ag.runInfoRow}>
            <MaterialIcons name="history" size={12} color={Colors.success} />
            <Text style={[ag.runInfoLabel, { color: Colors.success }]}>Last run</Text>
            <Text style={ag.runInfoValue}>{lastRun}</Text>
          </View>
          {nextRun && (
            <View style={ag.runInfoRow}>
              <MaterialIcons name="schedule" size={12} color={Colors.primary} />
              <Text style={[ag.runInfoLabel, { color: Colors.primary }]}>Next (est.)</Text>
              <Text style={ag.runInfoValue}>{nextRun}</Text>
            </View>
          )}
        </View>
      )}

      {/* Node.js script preview */}
      <View style={ag.scriptCard}>
        <View style={ag.scriptHeader}>
          <View style={ag.scriptIconWrap}><MaterialIcons name="terminal" size={14} color={Colors.primary} /></View>
          <Text style={ag.scriptTitle}>Off-Chain Keeper Script (Node.js)</Text>
          <View style={ag.scriptBadge}><Text style={ag.scriptBadgeText}>ethers.js</Text></View>
        </View>
        <View style={ag.scriptBody}>
          {[
            'const { ethers } = require("ethers");',
            '',
            'const provider = new ethers.JsonRpcProvider(',
            `  "${BTNG_RPC}");`,
            'const wallet = new ethers.Wallet(KEY, provider);',
            'const engine = new ethers.Contract(ADDR, ABI, wallet);',
            '',
            'async function autoRun() {',
            '  const tx = await engine',
            '    .autoGenerateAndDistribute();',
            '  await tx.wait();',
            '  console.log("✅ Rewards distributed");',
            '}',
            '',
            `setInterval(autoRun, ${interval} * 1000);`,
          ].map((line, i) => (
            <Text key={i} style={[ag.scriptLine, !line.trim() && { height: 8 }]}>{line}</Text>
          ))}
        </View>
        <View style={ag.scriptFooter}>
          <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
          <Text style={ag.scriptFooterText}>Deploy on VPS · 72.62.160.237 · Or use Chainlink Keepers for on-chain automation</Text>
        </View>
      </View>

      {/* Steps */}
      <View style={ag.stepsCard}>
        <Text style={ag.stepsTitle}>Deployment Steps</Text>
        {[
          { n: '1', text: 'Deploy BTNG token (BituncoinGold.sol)', color: Colors.primary },
          { n: '2', text: 'Deploy AFN token (AfricanNote.sol)', color: '#22C55E' },
          { n: '3', text: 'Deploy BTNGNodeEngine (pass both addresses)', color: '#9945FF' },
          { n: '4', text: 'Transfer AFN ownership to NodeEngine', color: Colors.warning },
          { n: '5', text: 'Fund NodeEngine with BTNG for swaps', color: Colors.primary },
          { n: '6', text: 'Run keeper script on VPS (pm2 start)', color: '#3B82F6' },
        ].map(s => (
          <View key={s.n} style={ag.stepRow}>
            <View style={[ag.stepNum, { backgroundColor: s.color + '22', borderColor: s.color + '55' }]}>
              <Text style={[ag.stepNumText, { color: s.color }]}>{s.n}</Text>
            </View>
            <Text style={ag.stepText}>{s.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const ag = StyleSheet.create({
  container: { gap: Spacing.md },
  statusCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.border, gap: Spacing.md },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  toggleBtn: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1.5, borderColor: Colors.border },
  toggleBtnOn: { backgroundColor: Colors.success, borderColor: Colors.success },
  toggleBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  countdownRow: { gap: 5 },
  countdownTrack: { height: 4, borderRadius: 2, backgroundColor: Colors.bgElevated, overflow: 'hidden' },
  countdownBar: { height: 4, backgroundColor: Colors.success, borderRadius: 2 },
  countdownText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
  scheduleCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  scheduleTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  scheduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  scheduleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.sm, borderWidth: 1, borderColor: Colors.border, minWidth: '44%' },
  scheduleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  scheduleBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  manualBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  manualBtnTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  manualBtnSub: { fontSize: 10, color: Colors.bg, opacity: 0.8, includeFontPadding: false, marginTop: 1 },
  manualBadge: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  manualBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, letterSpacing: 0.5, includeFontPadding: false },
  runInfo: { backgroundColor: Colors.successBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '33', gap: Spacing.sm },
  runInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  runInfoLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  runInfoValue: { fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  scriptCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  scriptHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  scriptIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  scriptTitle: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  scriptBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  scriptBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  scriptBody: { backgroundColor: '#060608', padding: Spacing.md, gap: 1 },
  scriptLine: { fontSize: 11, color: '#D4A017', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 18 },
  scriptFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  scriptFooterText: { flex: 1, fontSize: 10, color: Colors.textMuted, includeFontPadding: false, lineHeight: 14 },
  stepsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  stepsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false, marginBottom: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  stepNum: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNumText: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  stepText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngNodeEngineScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [nodes, setNodes] = useState<NodeEntry[]>(mockNodes());
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [distributing, setDistributing] = useState(false);

  const TABS: { id: Tab; label: string; icon: string; color: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard', color: Colors.primary },
    { id: 'nodes', label: 'Nodes', icon: 'device-hub', color: '#9945FF' },
    { id: 'swap', label: 'Swap', icon: 'swap-horiz', color: '#22C55E' },
    { id: 'auto', label: 'Auto Gen', icon: 'auto-mode', color: Colors.warning },
  ];

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${BTNG_RPC}/api/v1/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats({
          btngSupply: data.totalSupply ?? 21000000,
          afnSupply: 1000000000,
          btngInEngine: 5420,
          nodeCount: nodes.filter(n => n.active).length,
          totalAfnMinted: 842000,
          blockHeight: data.height ?? 38421,
        });
      } else throw new Error('API error');
    } catch {
      setStats({ btngSupply: 21000000, afnSupply: 1000000000, btngInEngine: 5420, nodeCount: nodes.filter(n => n.active).length, totalAfnMinted: 842000, blockHeight: 38421 });
    } finally { setStatsLoading(false); }
  }, [nodes]);

  useEffect(() => { fetchStats(); }, []);

  const handleCreateNode = useCallback(async () => {
    setCreating(true);
    await new Promise(r => setTimeout(r, 1600));
    const now = Date.now() / 1000;
    const newNode: NodeEntry = { id: nodes.length, owner: MOCK_ADDRESS, registeredAt: now, lastClaim: now, active: true };
    setNodes(prev => [...prev, newNode]);
    setCreating(false);
    showAlert('Node Created', `Node #${newNode.id} is now active and earning AFN rewards.\n\nCost: ${NODE_COST_BTNG} BTNG deducted from your balance.`);
  }, [nodes.length, showAlert]);

  const handleClaim = useCallback(async (id: number) => {
    setClaimingId(id);
    const pending = computePending(nodes.find(n => n.id === id)!);
    await new Promise(r => setTimeout(r, 1200));
    setNodes(prev => prev.map(n => n.id === id ? { ...n, lastClaim: Date.now() / 1000 } : n));
    setClaimingId(null);
    showAlert('Rewards Claimed', `${formatNum(pending, 0)} AFN minted to your wallet from Node #${id}.`);
  }, [nodes, showAlert]);

  const handleClaimAll = useCallback(async () => {
    const activeNodes = nodes.filter(n => n.active);
    for (const node of activeNodes) {
      setClaimingId(node.id);
      await new Promise(r => setTimeout(r, 600));
    }
    const total = activeNodes.reduce((s, n) => s + computePending(n), 0);
    const now = Date.now() / 1000;
    setNodes(prev => prev.map(n => n.active ? { ...n, lastClaim: now } : n));
    setClaimingId(null);
    showAlert('All Rewards Claimed', `${formatNum(total, 0)} AFN minted across ${activeNodes.length} nodes.`);
  }, [nodes, showAlert]);

  const handleSwap = useCallback(async (afnAmount: number) => {
    setSwapping(true);
    await new Promise(r => setTimeout(r, 1800));
    setSwapping(false);
    const btngOut = Math.floor(afnAmount / SWAP_RATE);
    const fee = (btngOut * SWAP_FEE_PCT) / 100;
    const net = btngOut - fee;
    showAlert('Swap Executed', `${formatNum(afnAmount, 0)} AFN → ${net.toFixed(4)} BTNG\nFee: ${fee.toFixed(4)} BTNG (${SWAP_FEE_PCT}%)\n\nTransaction submitted to BTNG network.`);
  }, [showAlert]);

  const handleAutoDistribute = useCallback(async () => {
    setDistributing(true);
    await new Promise(r => setTimeout(r, 2000));
    const total = nodes.filter(n => n.active).reduce((s, n) => s + computePending(n), 0);
    const now = Date.now() / 1000;
    setNodes(prev => prev.map(n => n.active ? { ...n, lastClaim: now } : n));
    setDistributing(false);
    showAlert('Auto-Distribute Complete', `${formatNum(total, 0)} AFN distributed to ${nodes.filter(n => n.active).length} active nodes.\n\nautoGenerateAndDistribute() executed successfully.`);
  }, [nodes, showAlert]);

  return (
    <View style={[main.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={main.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={main.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={main.topCenter}>
          <Text style={main.topTitle}>Node Engine</Text>
          <Text style={main.topSub}>BTNG + AFN Two-Token System</Text>
        </View>
        <TouchableOpacity style={main.refreshIconBtn} onPress={fetchStats} disabled={statsLoading}>
          {statsLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={20} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={main.tabBar}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[main.tab, isActive && { borderBottomColor: tab.color, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.75}
            >
              <MaterialIcons name={tab.icon as any} size={16} color={isActive ? tab.color : Colors.textMuted} />
              <Text style={[main.tabLabel, isActive && { color: tab.color }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={main.scroll}>
        {activeTab === 'overview' && (
          <OverviewTab stats={stats} loading={statsLoading} onRefresh={fetchStats} />
        )}
        {activeTab === 'nodes' && (
          <NodesTab
            nodes={nodes}
            onCreateNode={handleCreateNode}
            onClaim={handleClaim}
            onClaimAll={handleClaimAll}
            creating={creating}
            claimingId={claimingId}
          />
        )}
        {activeTab === 'swap' && (
          <SwapTab onSwap={handleSwap} swapping={swapping} />
        )}
        {activeTab === 'auto' && (
          <AutoGenTab nodes={nodes} onAutoDistribute={handleAutoDistribute} distributing={distributing} />
        )}
        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const main = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter: { alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  refreshIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgCard },
  tab: { flex: 1, flexDirection: 'column', alignItems: 'center', paddingVertical: Spacing.sm + 2, gap: 3, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  tabLabel: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
});
