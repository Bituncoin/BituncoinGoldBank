/**
 * BTNG2 STAKING ENGINE — Sovereign Yield Platform
 * Gold-Backed Staking · 4 Pools · Real-Time Reward Calculation
 * John Kojo Zi · EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert } from '@/template';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import {
  stakingEngine, btngSovereignEngine,
  STAKING_POOLS, type StakingPool, type StakingPosition,
} from '@/services/btngSovereignEngineService';

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtAmt(n: number, dp = 4) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtTVL(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function daysLeft(unlocksAt: number) {
  const ms = unlocksAt - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

// ── APY Ring ──────────────────────────────────────────────────────────────────
function APYRing({ apy, color }: { apy: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(apy / 50, 1), duration: 1200, useNativeDriver: false }).start();
  }, [apy]);
  return (
    <View style={ring.wrap}>
      <View style={[ring.bg, { borderColor: Colors.bgElevated }]} />
      <View style={ring.center}>
        <Text style={[ring.val, { color }]}>{apy}%</Text>
        <Text style={ring.label}>APY</Text>
      </View>
      <Animated.View style={[ring.arc, { borderColor: color, opacity: anim }]} />
    </View>
  );
}
const ring = StyleSheet.create({
  wrap:   { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  bg:     { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 6 },
  arc:    { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 3 },
  center: { alignItems: 'center', gap: 1 },
  val:    { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label:  { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ── Pool Card ─────────────────────────────────────────────────────────────────
function PoolCard({ pool, onStake }: { pool: StakingPool; onStake: (pool: StakingPool) => void }) {
  const daily = (pool.apy / 365).toFixed(3);
  return (
    <TouchableOpacity style={[pc.card, { borderColor: pool.color + '44' }]} onPress={() => onStake(pool)} activeOpacity={0.85}>
      <View style={pc.header}>
        <View style={[pc.iconWrap, { backgroundColor: pool.color + '18', borderColor: pool.color + '44' }]}>
          <MaterialIcons name={pool.icon as any} size={18} color={pool.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={pc.name}>{pool.name}</Text>
          <Text style={pc.sub}>{pool.asset} → Earn {pool.rewardAsset}</Text>
        </View>
        <APYRing apy={pool.apy} color={pool.color} />
      </View>
      <View style={pc.stats}>
        <View style={pc.statCell}>
          <Text style={pc.statVal}>{fmtTVL(pool.tvl)}</Text>
          <Text style={pc.statLabel}>TVL</Text>
        </View>
        <View style={pc.statDiv} />
        <View style={pc.statCell}>
          <Text style={pc.statVal}>{pool.minStake}</Text>
          <Text style={pc.statLabel}>Min {pool.asset}</Text>
        </View>
        <View style={pc.statDiv} />
        <View style={pc.statCell}>
          <Text style={pc.statVal}>{pool.lockDays > 0 ? `${pool.lockDays}d` : 'Flex'}</Text>
          <Text style={pc.statLabel}>Lock</Text>
        </View>
        <View style={pc.statDiv} />
        <View style={pc.statCell}>
          <Text style={[pc.statVal, { color: pool.color }]}>{daily}%</Text>
          <Text style={pc.statLabel}>Daily</Text>
        </View>
      </View>
      <TouchableOpacity style={[pc.stakeBtn, { backgroundColor: pool.color }]} onPress={() => onStake(pool)} activeOpacity={0.85}>
        <MaterialIcons name="add" size={14} color="#fff" />
        <Text style={pc.stakeBtnText}>Stake {pool.asset}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
const pc = StyleSheet.create({
  card:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, gap: Spacing.md },
  header:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap:  { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sub:       { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  stats:     { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  statCell:  { flex: 1, alignItems: 'center', gap: 2 },
  statDiv:   { width: 1, backgroundColor: Colors.border },
  statVal:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  stakeBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  stakeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
});

// ── Position Card ──────────────────────────────────────────────────────────────
function PositionCard({
  pos, onClaim, onUnstake, claiming,
}: { pos: StakingPosition; onClaim: () => void; onUnstake: () => void; claiming: boolean }) {
  const pool     = STAKING_POOLS.find(p => p.poolId === pos.poolId);
  const color    = pool?.color ?? Colors.primary;
  const pending  = stakingEngine.calcPendingRewards(pos);
  const locked   = pos.unlocksAt > Date.now() && pos.status === 'ACTIVE';
  const days     = daysLeft(pos.unlocksAt);
  return (
    <View style={[posS.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={posS.header}>
        <View style={[posS.dot, { backgroundColor: color }]} />
        <Text style={posS.poolName}>{pos.poolName}</Text>
        <View style={[posS.statusBadge, {
          backgroundColor: pos.status === 'ACTIVE' ? Colors.successBg : Colors.bgElevated,
          borderColor: (pos.status === 'ACTIVE' ? Colors.success : Colors.textMuted) + '44',
        }]}>
          <Text style={[posS.statusText, { color: pos.status === 'ACTIVE' ? Colors.success : Colors.textMuted }]}>
            {pos.status === 'ACTIVE' && locked ? `🔒 ${days}d` : pos.status}
          </Text>
        </View>
      </View>
      <View style={posS.grid}>
        {[
          { label: 'Staked',    val: `${fmtAmt(pos.stakedAmount, 2)} ${pos.asset}`, color: color },
          { label: 'APY',       val: `${pos.apy}%`,                                 color: Colors.warning },
          { label: 'Pending',   val: `${fmtAmt(pending, 6)} ${pos.rewardAsset}`,    color: Colors.success },
          { label: 'Claimed',   val: `${fmtAmt(pos.rewardsClaimed, 4)} ${pos.rewardAsset}`, color: Colors.textMuted },
        ].map(r => (
          <View key={r.label} style={posS.gridCell}>
            <Text style={[posS.gridVal, { color: r.color }]}>{r.val}</Text>
            <Text style={posS.gridLabel}>{r.label}</Text>
          </View>
        ))}
      </View>
      {pos.status === 'ACTIVE' && (
        <View style={posS.actions}>
          <TouchableOpacity
            style={[posS.claimBtn, claiming && { opacity: 0.5 }]}
            onPress={onClaim}
            disabled={claiming || pending < 0.0001}
            activeOpacity={0.85}
          >
            {claiming ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="redeem" size={14} color={Colors.bg} />}
            <Text style={posS.claimBtnText}>Claim {fmtAmt(pending, 4)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[posS.unstakeBtn, locked && { opacity: 0.45 }]}
            onPress={onUnstake}
            disabled={locked}
            activeOpacity={0.85}
          >
            <MaterialIcons name="arrow-upward" size={14} color={locked ? Colors.textMuted : Colors.error} />
            <Text style={[posS.unstakeBtnText, locked && { color: Colors.textMuted }]}>
              {locked ? `Locked ${days}d` : 'Unstake'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
const posS = StyleSheet.create({
  card:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  header:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot:         { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  poolName:    { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  statusText:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  gridCell:    { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 2 },
  gridVal:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false, textAlign: 'center' },
  gridLabel:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  actions:     { flexDirection: 'row', gap: Spacing.sm },
  claimBtn:    { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  claimBtnText:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  unstakeBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.error + '44' },
  unstakeBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function BTNGStakingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user }      = useAuth();
  const { priceUSD }  = useGoldOracle();

  const [tab, setTab]             = useState<'pools' | 'myStakes'>('pools');
  const [positions, setPositions] = useState<StakingPosition[]>([]);
  const [loading, setLoading]     = useState(true);
  const [claiming, setClaiming]   = useState<string | null>(null);

  // Stake form
  const [selectedPool, setSelectedPool] = useState<StakingPool | null>(null);
  const [stakeAmount, setStakeAmount]   = useState('');
  const [staking, setStaking]           = useState(false);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const loadData = useCallback(async () => {
    await stakingEngine.load();
    if (user?.id) setPositions(stakingEngine.getUserPositions(user.id));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh rewards every 30s
  useEffect(() => {
    const t = setInterval(() => { if (user?.id) setPositions([...stakingEngine.getUserPositions(user.id)]); }, 30_000);
    return () => clearInterval(t);
  }, [user?.id]);

  const handleStake = useCallback(async () => {
    if (!user?.id || !selectedPool) return;
    const amt = parseFloat(stakeAmount);
    if (!amt || amt < selectedPool.minStake) {
      showAlert('Invalid Amount', `Minimum stake is ${selectedPool.minStake} ${selectedPool.asset}`);
      return;
    }
    setStaking(true);
    const { position, error } = await stakingEngine.stake(user.id, selectedPool.poolId, amt);
    setStaking(false);
    if (error) { showAlert('Stake Failed', error); return; }
    setPositions([...stakingEngine.getUserPositions(user.id)]);
    setSelectedPool(null);
    setStakeAmount('');
    setTab('myStakes');
    showAlert(
      'Staked Successfully!',
      `${amt} ${selectedPool.asset} staked in ${selectedPool.name}\nAPY: ${selectedPool.apy}%${selectedPool.lockDays > 0 ? `\nLock period: ${selectedPool.lockDays} days` : '\nFlexible — withdraw anytime'}`
    );
  }, [user, selectedPool, stakeAmount, showAlert]);

  const handleClaim = useCallback(async (posId: string) => {
    setClaiming(posId);
    const { rewards, error } = await stakingEngine.claimRewards(posId);
    setClaiming(null);
    if (error) { showAlert('Error', error); return; }
    setPositions([...stakingEngine.getUserPositions(user?.id ?? '')]);
    showAlert('Rewards Claimed!', `${rewards.toFixed(6)} tokens claimed to your wallet.`);
  }, [user, showAlert]);

  const handleUnstake = useCallback(async (posId: string) => {
    showAlert('Unstake', 'Unstake this position and claim all rewards?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unstake', style: 'destructive', onPress: async () => {
        const { success, rewards, error } = await stakingEngine.unstake(posId);
        if (!success) { showAlert('Error', error ?? 'Unstake failed'); return; }
        setPositions([...stakingEngine.getUserPositions(user?.id ?? '')]);
        showAlert('Unstaked!', `Position closed. Total rewards earned: ${rewards.toFixed(6)} tokens`);
      }},
    ]);
  }, [user, showAlert]);

  const totalStaked   = user ? stakingEngine.getTotalStaked(user.id) : 0;
  const totalRewards  = user ? stakingEngine.getTotalPendingRewards(user.id) : 0;
  const poolStats     = stakingEngine.getPoolStats();
  const activePos     = positions.filter(p => p.status === 'ACTIVE');

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={s.titleRow}>
            <Text style={s.title}>BTNG2 Staking</Text>
            <View style={s.livePill}>
              <Animated.View style={[s.liveDot, { opacity: pulseAnim }]} />
              <Text style={s.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={s.sub}>Sovereign Yield Engine · 4 Pools</Text>
        </View>
        <MaterialIcons name="account-balance" size={22} color={Colors.primary} />
      </View>

      {/* Stats Header */}
      <View style={s.statsBar}>
        <View style={s.statCell}>
          <Text style={[s.statVal, { color: Colors.primary }]}>{fmtTVL(poolStats.totalTVL)}</Text>
          <Text style={s.statLabel}>Total TVL</Text>
        </View>
        <View style={s.statDiv} />
        <View style={s.statCell}>
          <Text style={[s.statVal, { color: Colors.success }]}>{poolStats.avgAPY.toFixed(1)}%</Text>
          <Text style={s.statLabel}>Avg APY</Text>
        </View>
        <View style={s.statDiv} />
        <View style={s.statCell}>
          <Text style={[s.statVal, { color: Colors.warning }]}>{fmtAmt(totalStaked, 2)}</Text>
          <Text style={s.statLabel}>My Staked</Text>
        </View>
        <View style={s.statDiv} />
        <View style={s.statCell}>
          <Text style={[s.statVal, { color: '#22C55E' }]}>{fmtAmt(totalRewards, 4)}</Text>
          <Text style={s.statLabel}>Pending Yield</Text>
        </View>
      </View>

      {/* Tab Row */}
      <View style={s.tabRow}>
        {[
          { id: 'pools',    icon: 'pool',           label: 'Staking Pools' },
          { id: 'myStakes', icon: 'account-balance-wallet', label: `My Stakes${activePos.length > 0 ? ` (${activePos.length})` : ''}` },
        ].map(t => (
          <TouchableOpacity
            key={t.id}
            style={[s.tabBtn, tab === t.id && s.tabBtnActive]}
            onPress={() => setTab(t.id as any)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={13} color={tab === t.id ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, tab === t.id && { color: Colors.bg }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: insets.bottom + 40 }}>

        {/* POOLS TAB */}
        {tab === 'pools' && (
          <>
            {/* Stake Form */}
            {selectedPool && (
              <View style={[s.formCard, { borderColor: selectedPool.color + '55' }]}>
                <View style={s.formHeader}>
                  <View style={[s.formIconWrap, { backgroundColor: selectedPool.color + '18', borderColor: selectedPool.color + '44' }]}>
                    <MaterialIcons name={selectedPool.icon as any} size={18} color={selectedPool.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.formTitle, { color: selectedPool.color }]}>{selectedPool.name}</Text>
                    <Text style={s.formSub}>{selectedPool.apy}% APY · Min {selectedPool.minStake} {selectedPool.asset} · {selectedPool.lockDays > 0 ? `${selectedPool.lockDays}d lock` : 'Flexible'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedPool(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    value={stakeAmount}
                    onChangeText={setStakeAmount}
                    placeholder={`Amount (min ${selectedPool.minStake})`}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[s.inputUnit, { color: selectedPool.color }]}>{selectedPool.asset}</Text>
                </View>
                {stakeAmount && !isNaN(parseFloat(stakeAmount)) && parseFloat(stakeAmount) >= selectedPool.minStake && (
                  <View style={s.previewRow}>
                    <Text style={s.previewLabel}>Est. daily yield</Text>
                    <Text style={[s.previewVal, { color: selectedPool.color }]}>
                      +{(parseFloat(stakeAmount) * selectedPool.apy / 100 / 365).toFixed(6)} {selectedPool.rewardAsset}/day
                    </Text>
                  </View>
                )}
                {!user ? (
                  <TouchableOpacity style={s.signInBtn} onPress={() => router.push('/login')} activeOpacity={0.85}>
                    <MaterialIcons name="login" size={16} color={Colors.bg} />
                    <Text style={s.signInBtnText}>Sign In to Stake</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[s.stakeConfirmBtn, { backgroundColor: selectedPool.color }, staking && { opacity: 0.55 }]}
                    onPress={handleStake}
                    disabled={staking}
                    activeOpacity={0.85}
                  >
                    {staking ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="lock" size={16} color="#fff" />}
                    <Text style={s.stakeConfirmBtnText}>{staking ? 'Staking…' : `Stake ${selectedPool.asset}`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Pool Cards */}
            {STAKING_POOLS.map(pool => (
              <PoolCard key={pool.poolId} pool={pool} onStake={p => { setSelectedPool(p); setStakeAmount(''); }} />
            ))}

            {/* Info Note */}
            <View style={s.infoCard}>
              <MaterialIcons name="info-outline" size={14} color={Colors.primary} />
              <Text style={s.infoText}>
                BTNG2 staking is backed by the Bank of Ghana gold reserve (500 kg · BOG Vault 001, Accra). Rewards are calculated in real-time based on your staked amount and APY.
              </Text>
            </View>
          </>
        )}

        {/* MY STAKES TAB */}
        {tab === 'myStakes' && (
          <>
            {!user ? (
              <View style={s.authCard}>
                <MaterialIcons name="lock-outline" size={48} color={Colors.textMuted} />
                <Text style={s.authTitle}>Sign In to View Stakes</Text>
                <TouchableOpacity style={s.signInBtn} onPress={() => router.push('/login')} activeOpacity={0.85}>
                  <MaterialIcons name="login" size={16} color={Colors.bg} />
                  <Text style={s.signInBtnText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : loading ? (
              <View style={s.loadingWrap}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={s.loadingText}>Loading positions…</Text>
              </View>
            ) : positions.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialIcons name="savings" size={52} color={Colors.textMuted} />
                <Text style={s.emptyTitle}>No Active Positions</Text>
                <Text style={s.emptySub}>Start earning yield by staking your BTNG assets.</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => setTab('pools')} activeOpacity={0.85}>
                  <MaterialIcons name="add" size={16} color={Colors.bg} />
                  <Text style={s.emptyBtnText}>Browse Staking Pools</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Portfolio summary */}
                <View style={s.portfolioCard}>
                  <View style={s.portfolioHeader}>
                    <MaterialIcons name="pie-chart" size={16} color={Colors.primary} />
                    <Text style={s.portfolioTitle}>Staking Portfolio</Text>
                    <View style={s.livePill}>
                      <Animated.View style={[s.liveDot, { opacity: pulseAnim }]} />
                      <Text style={s.liveText}>LIVE</Text>
                    </View>
                  </View>
                  <View style={s.portfolioStats}>
                    <View style={s.portfolioStatItem}>
                      <Text style={[s.portfolioStatVal, { color: Colors.primary }]}>{fmtAmt(totalStaked, 2)}</Text>
                      <Text style={s.portfolioStatLabel}>Total Staked</Text>
                    </View>
                    <View style={s.statDiv} />
                    <View style={s.portfolioStatItem}>
                      <Text style={[s.portfolioStatVal, { color: Colors.success }]}>{fmtAmt(totalRewards, 6)}</Text>
                      <Text style={s.portfolioStatLabel}>Pending Rewards</Text>
                    </View>
                    <View style={s.statDiv} />
                    <View style={s.portfolioStatItem}>
                      <Text style={[s.portfolioStatVal, { color: Colors.warning }]}>{activePos.length}</Text>
                      <Text style={s.portfolioStatLabel}>Active Positions</Text>
                    </View>
                  </View>
                </View>

                {/* Position Cards */}
                {positions.map(pos => (
                  <PositionCard
                    key={pos.positionId}
                    pos={pos}
                    onClaim={() => handleClaim(pos.positionId)}
                    onUnstake={() => handleUnstake(pos.positionId)}
                    claiming={claiming === pos.positionId}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  titleRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:          { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sub:            { fontSize: 10, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  livePill:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveText:       { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  statsBar:       { flexDirection: 'row', backgroundColor: Colors.bgCard, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  statCell:       { flex: 1, alignItems: 'center', gap: 2 },
  statDiv:        { width: 1, backgroundColor: Colors.border },
  statVal:        { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  statLabel:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  tabRow:         { flexDirection: 'row', margin: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: 0 },
  tabBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md },
  tabBtnActive:   { backgroundColor: Colors.primary },
  tabText:        { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  // Stake Form
  formCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, gap: Spacing.md },
  formHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  formIconWrap:   { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  formTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  formSub:        { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  inputRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', paddingHorizontal: Spacing.md, height: 52 },
  input:          { flex: 1, fontSize: 20, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  inputUnit:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  previewRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  previewLabel:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  previewVal:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  stakeConfirmBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  stakeConfirmBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  signInBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2 },
  signInBtnText:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  infoCard:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33' },
  infoText:       { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  // Auth/Empty
  authCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  authTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  emptyCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  emptyTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:       { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  emptyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl },
  emptyBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  loadingWrap:    { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText:    { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  // Portfolio
  portfolioCard:  { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', gap: Spacing.md },
  portfolioHeader:{ flexDirection: 'row', alignItems: 'center', gap: 7 },
  portfolioTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  portfolioStats: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  portfolioStatItem: { flex: 1, alignItems: 'center', gap: 3 },
  portfolioStatVal:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  portfolioStatLabel:{ fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});
