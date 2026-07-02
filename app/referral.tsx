import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import {
  REFERRAL_DATA, REFERRAL_TIERS, REFERRED_USERS,
  REFERRAL_COMMISSION_HISTORY,
} from '@/constants/mockData';

const STATUS_COLORS: Record<string, string> = {
  active: Colors.success,
  pending: Colors.warning,
  inactive: Colors.textMuted,
};

const COMMISSION_STATUS_COLORS: Record<string, string> = {
  paid: Colors.success,
  pending: Colors.warning,
};

type TabType = 'overview' | 'referrals' | 'commissions';

export default function ReferralScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [sortBy, setSortBy] = useState<'volume' | 'earned' | 'date'>('earned');
  const [copied, setCopied] = useState(false);

  // Animated earnings counter
  const earningsAnim = useRef(new Animated.Value(0)).current;
  const [displayedEarnings, setDisplayedEarnings] = useState(0);

  useEffect(() => {
    Animated.timing(earningsAnim, {
      toValue: REFERRAL_DATA.totalEarned,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    earningsAnim.addListener(({ value }) => setDisplayedEarnings(parseFloat(value.toFixed(2))));
    return () => earningsAnim.removeAllListeners();
  }, []);

  const currentTierIndex = REFERRAL_TIERS.findIndex(t => t.tier === REFERRAL_DATA.tier);
  const currentTier = REFERRAL_TIERS[currentTierIndex];
  const nextTier = REFERRAL_TIERS[currentTierIndex + 1];
  const progressToNext = nextTier
    ? ((REFERRAL_DATA.totalReferrals - currentTier.minReferrals) /
      (nextTier.minReferrals - currentTier.minReferrals)) * 100
    : 100;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on BTNG Gold Coin — Africa's premier crypto exchange! Use my referral code ${REFERRAL_DATA.code} and we both earn rewards.\n\n${REFERRAL_DATA.link}`,
        title: 'Join BTNG Gold Coin',
      });
    } catch {
      showAlert('Share', `Your referral link:\n${REFERRAL_DATA.link}`);
    }
  };

  const handleCopyCode = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showAlert('Copied!', `Referral code ${REFERRAL_DATA.code} is ready to share.`);
  };

  const sortedUsers = [...REFERRED_USERS].sort((a, b) => {
    if (sortBy === 'volume') return b.totalVolume - a.totalVolume;
    if (sortBy === 'earned') return b.earned - a.earned;
    return new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime();
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Referral Program</Text>
          <Text style={styles.subtitle}>Earn 2% on every trade</Text>
        </View>
        <TouchableOpacity style={styles.shareTopBtn} onPress={handleShare}>
          <MaterialIcons name="ios-share" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab Row */}
      <View style={styles.tabRow}>
        {(['overview', 'referrals', 'commissions'] as TabType[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ─── OVERVIEW TAB ─── */}
        {activeTab === 'overview' && (
          <>
            {/* Earnings Hero */}
            <View style={styles.earningsCard}>
              <View style={styles.earningsBg} />
              <Text style={styles.earningsLabel}>Total Commission Earned</Text>
              <Text style={styles.earningsValue}>${displayedEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              <View style={styles.earningsRow}>
                <View style={styles.earningsStat}>
                  <View style={styles.earningsStatDot} />
                  <Text style={styles.earningsStatLabel}>Pending</Text>
                  <Text style={styles.earningsStatValue}>${REFERRAL_DATA.pendingEarnings.toFixed(2)}</Text>
                </View>
                <View style={styles.earningsDivider} />
                <View style={styles.earningsStat}>
                  <View style={[styles.earningsStatDot, { backgroundColor: Colors.success }]} />
                  <Text style={styles.earningsStatLabel}>Paid Out</Text>
                  <Text style={styles.earningsStatValue}>${REFERRAL_DATA.paidOut.toFixed(2)}</Text>
                </View>
                <View style={styles.earningsDivider} />
                <View style={styles.earningsStat}>
                  <View style={[styles.earningsStatDot, { backgroundColor: Colors.info }]} />
                  <Text style={styles.earningsStatLabel}>This Month</Text>
                  <Text style={styles.earningsStatValue}>${REFERRAL_DATA.thisMonthEarnings.toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* Quick Stats */}
            <View style={styles.quickStats}>
              <View style={styles.quickStat}>
                <MaterialIcons name="people" size={20} color={Colors.primary} />
                <Text style={styles.quickStatValue}>{REFERRAL_DATA.totalReferrals}</Text>
                <Text style={styles.quickStatLabel}>Total Referrals</Text>
              </View>
              <View style={styles.quickStatDivider} />
              <View style={styles.quickStat}>
                <MaterialIcons name="person-pin" size={20} color={Colors.success} />
                <Text style={styles.quickStatValue}>{REFERRAL_DATA.activeReferrals}</Text>
                <Text style={styles.quickStatLabel}>Active Traders</Text>
              </View>
              <View style={styles.quickStatDivider} />
              <View style={styles.quickStat}>
                <MaterialIcons name="percent" size={20} color={Colors.copper} />
                <Text style={styles.quickStatValue}>{REFERRAL_DATA.commissionRate * 100}%</Text>
                <Text style={styles.quickStatLabel}>Commission Rate</Text>
              </View>
            </View>

            {/* Tier Progress */}
            <View style={styles.tierCard}>
              <View style={styles.tierHeader}>
                <View>
                  <Text style={styles.tierCardTitle}>Your Tier</Text>
                  <View style={styles.tierBadgeRow}>
                    <Text style={styles.tierEmoji}>{currentTier.icon}</Text>
                    <Text style={[styles.tierName, { color: currentTier.color }]}>{currentTier.tier}</Text>
                    <View style={[styles.commissionBadge, { backgroundColor: currentTier.color + '22', borderColor: currentTier.color + '44' }]}>
                      <Text style={[styles.commissionBadgeText, { color: currentTier.color }]}>{currentTier.commission}% Commission</Text>
                    </View>
                  </View>
                </View>
                {nextTier && (
                  <View style={styles.nextTierInfo}>
                    <Text style={styles.nextTierLabel}>Next: {nextTier.icon} {nextTier.tier}</Text>
                    <Text style={styles.nextTierSub}>{nextTier.minReferrals - REFERRAL_DATA.totalReferrals} more referrals</Text>
                  </View>
                )}
              </View>
              {nextTier && (
                <View style={styles.progressSection}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${Math.min(progressToNext, 100)}%` }]} />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressLabel}>{REFERRAL_DATA.totalReferrals} referrals</Text>
                    <Text style={styles.progressLabel}>{nextTier.minReferrals} needed</Text>
                  </View>
                </View>
              )}
            </View>

            {/* All Tiers */}
            <View style={styles.tiersSection}>
              <Text style={styles.sectionTitle}>Commission Tiers</Text>
              {REFERRAL_TIERS.map((tier, i) => (
                <View key={tier.tier} style={[styles.tierRow, tier.tier === REFERRAL_DATA.tier && styles.tierRowActive]}>
                  <Text style={styles.tierRowIcon}>{tier.icon}</Text>
                  <View style={styles.tierRowInfo}>
                    <Text style={[styles.tierRowName, { color: tier.color }]}>{tier.tier}</Text>
                    <Text style={styles.tierRowMin}>{tier.minReferrals}+ active referrals</Text>
                  </View>
                  <View style={[styles.tierCommission, { backgroundColor: tier.color + '22' }]}>
                    <Text style={[styles.tierCommissionText, { color: tier.color }]}>{tier.commission}%</Text>
                  </View>
                  {tier.tier === REFERRAL_DATA.tier && (
                    <View style={styles.currentBadge}>
                      <MaterialIcons name="check" size={12} color={Colors.bg} />
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Referral Link Card */}
            <View style={styles.linkCard}>
              <Text style={styles.linkCardTitle}>Share Your Link</Text>
              <Text style={styles.linkCardSub}>Earn 2% commission on every trade your referrals make — forever.</Text>
              <View style={styles.linkBox}>
                <Text style={styles.linkText} numberOfLines={1}>{REFERRAL_DATA.link}</Text>
              </View>
              <View style={styles.linkActions}>
                <TouchableOpacity style={[styles.linkBtn, styles.linkBtnCopy]} onPress={handleCopyCode}>
                  <MaterialIcons name={copied ? 'check' : 'content-copy'} size={16} color={Colors.primary} />
                  <Text style={styles.linkBtnCopyText}>{copied ? 'Copied!' : 'Copy Code'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.linkBtn, styles.linkBtnShare]} onPress={handleShare}>
                  <MaterialIcons name="share" size={16} color={Colors.bg} />
                  <Text style={styles.linkBtnShareText}>Share Now</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* How It Works */}
            <View style={styles.howCard}>
              <Text style={styles.sectionTitle}>How It Works</Text>
              {[
                { step: '1', icon: 'share', title: 'Share your link', desc: 'Send your unique BTNG referral link to friends and family across Africa.' },
                { step: '2', icon: 'person-add', title: 'They sign up & trade', desc: 'When they register and complete KYC, they are linked to your account.' },
                { step: '3', icon: 'attach-money', title: 'You earn 2% forever', desc: 'Every time they trade on BTNG, you automatically earn 2% of the fee.' },
              ].map(h => (
                <View key={h.step} style={styles.howRow}>
                  <View style={styles.howStep}>
                    <Text style={styles.howStepText}>{h.step}</Text>
                  </View>
                  <View style={styles.howIcon}>
                    <MaterialIcons name={h.icon as any} size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.howInfo}>
                    <Text style={styles.howTitle}>{h.title}</Text>
                    <Text style={styles.howDesc}>{h.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ─── REFERRALS TAB ─── */}
        {activeTab === 'referrals' && (
          <>
            {/* Sort Bar */}
            <View style={styles.sortBar}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              {(['earned', 'volume', 'date'] as const).map(s => (
                <TouchableOpacity key={s} style={[styles.sortChip, sortBy === s && styles.sortChipActive]} onPress={() => setSortBy(s)}>
                  <Text style={[styles.sortChipText, sortBy === s && styles.sortChipTextActive]}>
                    {s === 'earned' ? 'Earnings' : s === 'volume' ? 'Volume' : 'Date Joined'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Summary Strip */}
            <View style={styles.summaryStrip}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{REFERRED_USERS.filter(u => u.status === 'active').length}</Text>
                <Text style={styles.summaryLabel}>Active</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{REFERRED_USERS.filter(u => u.status === 'pending').length}</Text>
                <Text style={styles.summaryLabel}>Pending</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{REFERRED_USERS.filter(u => u.status === 'inactive').length}</Text>
                <Text style={styles.summaryLabel}>Inactive</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: Colors.primary }]}>
                  ${REFERRED_USERS.reduce((s, u) => s + u.earned, 0).toFixed(2)}
                </Text>
                <Text style={styles.summaryLabel}>Total Earned</Text>
              </View>
            </View>

            {/* User Table */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>User</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Volume</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Trades</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Earned</Text>
            </View>

            {sortedUsers.map(user => (
              <TouchableOpacity
                key={user.id}
                style={styles.userRow}
                activeOpacity={0.8}
                onPress={() => showAlert(
                  user.name,
                  `Country: ${user.country}\nJoined: ${user.joinDate}\nTrade Volume: $${user.totalVolume.toLocaleString()}\nCommission Earned: $${user.earned.toFixed(2)}\nKYC: ${user.kycVerified ? 'Verified' : 'Pending'}`
                )}
              >
                <View style={styles.userRowLeft}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{user.initials}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{user.name}</Text>
                      {user.kycVerified && (
                        <MaterialIcons name="verified" size={12} color={Colors.success} />
                      )}
                    </View>
                    <View style={styles.userMetaRow}>
                      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[user.status] }]} />
                      <Text style={[styles.userStatus, { color: STATUS_COLORS[user.status] }]}>{user.status}</Text>
                      <Text style={styles.userCountry}>• {user.country}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.userVolume}>${(user.totalVolume / 1000).toFixed(1)}K</Text>
                <Text style={styles.userTrades}>{user.tradeCount}</Text>
                <Text style={[styles.userEarned, user.earned > 0 ? { color: Colors.success } : { color: Colors.textMuted }]}>
                  {user.earned > 0 ? `$${user.earned.toFixed(2)}` : '--'}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.invitePrompt}>
              <MaterialIcons name="person-add-alt-1" size={32} color={Colors.primary} />
              <Text style={styles.inviteTitle}>Invite More Friends</Text>
              <Text style={styles.inviteDesc}>Each active referral earns you 2% commission on every trade they make.</Text>
              <TouchableOpacity style={styles.inviteBtn} onPress={handleShare}>
                <MaterialIcons name="share" size={16} color={Colors.bg} />
                <Text style={styles.inviteBtnText}>Share Referral Link</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ─── COMMISSIONS TAB ─── */}
        {activeTab === 'commissions' && (
          <>
            {/* Commission Summary */}
            <View style={styles.commissionSummary}>
              <View style={styles.commissionStat}>
                <Text style={styles.commissionStatValue}>${REFERRAL_DATA.totalEarned.toFixed(2)}</Text>
                <Text style={styles.commissionStatLabel}>Total Earned</Text>
              </View>
              <View style={styles.commissionStatDivider} />
              <View style={styles.commissionStat}>
                <Text style={[styles.commissionStatValue, { color: Colors.warning }]}>${REFERRAL_DATA.pendingEarnings.toFixed(2)}</Text>
                <Text style={styles.commissionStatLabel}>Pending</Text>
              </View>
              <View style={styles.commissionStatDivider} />
              <View style={styles.commissionStat}>
                <Text style={[styles.commissionStatValue, { color: Colors.success }]}>${REFERRAL_DATA.paidOut.toFixed(2)}</Text>
                <Text style={styles.commissionStatLabel}>Paid Out</Text>
              </View>
            </View>

            {/* Monthly Comparison */}
            <View style={styles.monthCard}>
              <Text style={styles.monthCardTitle}>Monthly Earnings</Text>
              <View style={styles.monthBars}>
                <View style={styles.monthBarItem}>
                  <View style={styles.monthBarWrap}>
                    <View style={[styles.monthBar, {
                      height: Math.round((REFERRAL_DATA.lastMonthEarnings / 250) * 80),
                      backgroundColor: Colors.border,
                    }]} />
                  </View>
                  <Text style={styles.monthBarLabel}>Apr</Text>
                  <Text style={styles.monthBarValue}>${REFERRAL_DATA.lastMonthEarnings.toFixed(0)}</Text>
                </View>
                <View style={styles.monthBarItem}>
                  <View style={styles.monthBarWrap}>
                    <View style={[styles.monthBar, {
                      height: Math.round((REFERRAL_DATA.thisMonthEarnings / 250) * 80),
                      backgroundColor: Colors.primary,
                    }]} />
                  </View>
                  <Text style={[styles.monthBarLabel, { color: Colors.primary }]}>May</Text>
                  <Text style={[styles.monthBarValue, { color: Colors.primary }]}>${REFERRAL_DATA.thisMonthEarnings.toFixed(0)}</Text>
                </View>
              </View>
              <View style={styles.monthGrowth}>
                <MaterialIcons name="trending-up" size={14} color={Colors.success} />
                <Text style={styles.monthGrowthText}>
                  +{(((REFERRAL_DATA.thisMonthEarnings - REFERRAL_DATA.lastMonthEarnings) / REFERRAL_DATA.lastMonthEarnings) * 100).toFixed(1)}% vs last month
                </Text>
              </View>
            </View>

            {/* Commission History */}
            <Text style={styles.sectionTitle}>Commission History</Text>
            {REFERRAL_COMMISSION_HISTORY.map(c => (
              <View key={c.id} style={styles.commissionRow}>
                <View style={styles.commissionLeft}>
                  <View style={[styles.commissionIcon, { backgroundColor: c.status === 'paid' ? Colors.successBg : Colors.warningBg }]}>
                    <MaterialIcons name="attach-money" size={16} color={c.status === 'paid' ? Colors.success : Colors.warning} />
                  </View>
                  <View style={styles.commissionInfo}>
                    <Text style={styles.commissionUser}>{c.user}</Text>
                    <Text style={styles.commissionTrade}>{c.trade} • ${c.volume.toLocaleString()} volume</Text>
                    <Text style={styles.commissionDate}>{c.date}</Text>
                  </View>
                </View>
                <View style={styles.commissionRight}>
                  <Text style={[styles.commissionAmount, { color: Colors.success }]}>+${c.commission.toFixed(2)}</Text>
                  <View style={[styles.commissionStatus, { backgroundColor: COMMISSION_STATUS_COLORS[c.status] + '22' }]}>
                    <Text style={[styles.commissionStatusText, { color: COMMISSION_STATUS_COLORS[c.status] }]}>{c.status}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, textAlign: 'center', includeFontPadding: false },
  shareTopBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary },

  // Tabs
  tabRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  tab: { flex: 1, paddingVertical: Spacing.sm + 2, alignItems: 'center', borderRadius: Radius.md },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },

  scrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.lg },

  // Earnings Hero
  earningsCard: {
    borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 1, borderColor: Colors.primary + '50',
    overflow: 'hidden', alignItems: 'center', gap: Spacing.md,
  },
  earningsBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bgCard,
  },
  earningsLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  earningsValue: { fontSize: 42, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  earningsRow: { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  earningsStat: { flex: 1, alignItems: 'center', gap: 5 },
  earningsStatDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning },
  earningsStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  earningsStatValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  earningsDivider: { width: 1, backgroundColor: Colors.border },

  // Quick Stats
  quickStats: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg },
  quickStat: { flex: 1, alignItems: 'center', gap: 4 },
  quickStatValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  quickStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  quickStatDivider: { width: 1, backgroundColor: Colors.border },

  // Tier Card
  tierCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  tierHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tierCardTitle: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false, marginBottom: 4 },
  tierBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tierEmoji: { fontSize: 22 },
  tierName: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  commissionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  commissionBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  nextTierInfo: { alignItems: 'flex-end', gap: 3 },
  nextTierLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  nextTierSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  progressSection: { gap: Spacing.sm },
  progressBar: { height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Tiers List
  tiersSection: { gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tierRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  tierRowActive: { borderColor: Colors.primary },
  tierRowIcon: { fontSize: 24, width: 36, textAlign: 'center' },
  tierRowInfo: { flex: 1, gap: 2 },
  tierRowName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  tierRowMin: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  tierCommission: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full },
  tierCommissionText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  currentBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

  // Link Card
  linkCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  linkCardTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  linkCardSub: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  linkBox: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, borderWidth: 1, borderColor: Colors.border },
  linkText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  linkActions: { flexDirection: 'row', gap: Spacing.sm },
  linkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.md, borderRadius: Radius.lg },
  linkBtnCopy: { backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary },
  linkBtnCopyText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  linkBtnShare: { backgroundColor: Colors.primary },
  linkBtnShareText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // How It Works
  howCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.lg },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  howStep: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  howStepText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  howIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  howInfo: { flex: 1, gap: 3 },
  howTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  howDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },

  // Referrals Tab
  sortBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  sortLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  sortChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  sortChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  sortChipText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },
  sortChipTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },

  summaryStrip: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  summaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  summaryValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  summaryLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  summaryDivider: { width: 1, backgroundColor: Colors.border },

  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  tableHeaderText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  userRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  userRowLeft: { flex: 2, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  userAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  userInfo: { flex: 1, gap: 3 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  userMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  userStatus: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  userCountry: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  userVolume: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'right', fontWeight: FontWeight.medium, includeFontPadding: false },
  userTrades: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'right', fontWeight: FontWeight.medium, includeFontPadding: false },
  userEarned: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, textAlign: 'right', includeFontPadding: false },

  invitePrompt: { alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  inviteTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  inviteDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  inviteBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Commissions Tab
  commissionSummary: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  commissionStat: { flex: 1, alignItems: 'center', gap: 4 },
  commissionStatValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  commissionStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  commissionStatDivider: { width: 1, backgroundColor: Colors.border },

  monthCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  monthCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  monthBars: { flexDirection: 'row', gap: Spacing.xl, paddingHorizontal: Spacing.lg },
  monthBarItem: { alignItems: 'center', gap: 4 },
  monthBarWrap: { height: 90, justifyContent: 'flex-end' },
  monthBar: { width: 40, borderRadius: 6, minHeight: 8 },
  monthBarLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  monthBarValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  monthGrowth: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthGrowthText: { fontSize: FontSize.sm, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },

  commissionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  commissionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.md },
  commissionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  commissionInfo: { flex: 1, gap: 2 },
  commissionUser: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  commissionTrade: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  commissionDate: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  commissionRight: { alignItems: 'flex-end', gap: 4 },
  commissionAmount: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  commissionStatus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  commissionStatusText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
});
