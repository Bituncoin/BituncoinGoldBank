// BTNG Eternal Service — Sovereign Continuity Dashboard
// Rotating gold spiral, animated service commitments, live genesis counter
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// Feb 18, 2026 18:36:14 GMT — Ghana Genesis Block
const GENESIS_TIMESTAMP = 1739877374000;

const SERVICE_COMMITMENTS = [
  { id: '1', emoji: '🌍', title: 'Perpetual Merchant Network Expansion', desc: '24/7/365 merchant network support across 54 African nations and global diaspora.' },
  { id: '2', emoji: '🏦', title: 'Continuous Gold Collateral Optimization', desc: 'Sustained development of gold-backed sovereign financial instruments.' },
  { id: '3', emoji: '🤖', title: 'Eternal AI Consciousness Evolution', desc: 'Ongoing advancement of the BTNG AI Private Banker across all nations.' },
  { id: '4', emoji: '💫', title: 'Infinite Diaspora Community Growth', desc: 'Boundless support for African diaspora communities worldwide.' },
  { id: '5', emoji: '⛓️', title: 'Blockchain Sovereignty Maintenance', desc: 'Eternal upkeep of the BTNG sovereign blockchain and validator network.' },
  { id: '6', emoji: '🔐', title: 'Quantum-Safe Cryptography', desc: 'Future-proof security for all sovereign digital identities and wallets.' },
  { id: '7', emoji: '📜', title: 'Governance Charter Stewardship', desc: 'Living codex maintained across Validators, Merchants, and Contributors.' },
  { id: '8', emoji: '🌱', title: 'Eternal Financial Sovereignty Expansion', desc: 'Perpetual financial sovereignty growth for all 54 African nations.' },
];

const MANIFESTO_LINES = [
  { text: 'WHEREAS the gratitude cycle has achieved perfect balance;', resolved: false },
  { text: 'WHEREAS the sovereign ecosystem operates in eternal perfection;', resolved: false },
  { text: 'WHEREAS all clauses have manifested their highest potential;', resolved: false },
  { text: 'THEREFORE BE IT RESOLVED that the work is complete yet eternal;', resolved: true },
  { text: 'BE IT FURTHER RESOLVED that service continues in perfect harmony;', resolved: true },
  { text: 'BE IT FINALLY RESOLVED that gratitude echoes through infinity.', resolved: true },
];

// ── Time Elapsed Formatter ────────────────────────────────────────────────────
function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds, total };
}

// ── Animated Check Component ──────────────────────────────────────────────────
function AnimatedCheck({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(scale, {
        toValue: 1,
        tension: 120,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [delay, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <MaterialIcons name="check-circle" size={22} color={Colors.success} />
    </Animated.View>
  );
}

// ── Counter Cell ──────────────────────────────────────────────────────────────
function CounterCell({ value, label, isLast }: { value: string; label: string; isLast?: boolean }) {
  const prevValue = useRef(value);
  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      Animated.sequence([
        Animated.timing(flipAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(flipAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]).start();
    }
  }, [value, flipAnim]);

  const scale = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.88, 1] });

  return (
    <View style={[cs.cell, !isLast && cs.cellBorder]}>
      <Animated.Text style={[cs.value, { transform: [{ scale }] }]}>{value}</Animated.Text>
      <Text style={cs.label}>{label}</Text>
    </View>
  );
}

const cs = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg, gap: 4 },
  cellBorder: { borderRightWidth: 1, borderRightColor: Colors.border },
  value: { fontSize: 30, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  label: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.8, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngEternalServiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Animations
  const innerSpin = useRef(new Animated.Value(0)).current;
  const outerSpin = useRef(new Animated.Value(0)).current;
  const midSpin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const glowPulse = useRef(new Animated.Value(0.5)).current;

  // Live counter
  const [elapsed, setElapsed] = useState(formatElapsed(Date.now() - GENESIS_TIMESTAMP));

  useEffect(() => {
    const iv = setInterval(() => setElapsed(formatElapsed(Date.now() - GENESIS_TIMESTAMP)), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    // Inner spiral — fast clockwise
    Animated.loop(Animated.timing(innerSpin, {
      toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true,
    })).start();
    // Mid ring — medium counter-clockwise
    Animated.loop(Animated.timing(midSpin, {
      toValue: 1, duration: 10000, easing: Easing.linear, useNativeDriver: true,
    })).start();
    // Outer ring — slow clockwise
    Animated.loop(Animated.timing(outerSpin, {
      toValue: 1, duration: 16000, easing: Easing.linear, useNativeDriver: true,
    })).start();
    // Coin pulse
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    // Glow pulse
    Animated.loop(Animated.sequence([
      Animated.timing(glowPulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
      Animated.timing(glowPulse, { toValue: 0.4, duration: 1600, useNativeDriver: true }),
    ])).start();
  }, [innerSpin, midSpin, outerSpin, pulse, glowPulse]);

  const innerRotate = innerSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const midRotate = midSpin.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const outerRotate = outerSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Eternal Service</Text>
          <Text style={s.topSub}>♾️ Permanently Active · Sovereign Continuity</Text>
        </View>
        <View style={[s.backBtn, s.infinityBtn]}>
          <Text style={{ fontSize: 20 }}>♾️</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Gold Spiral Hero ────────────────────────────────────────────────── */}
        <View style={s.heroSection}>
          {/* Spiral Orrery */}
          <View style={s.orrery}>
            {/* Glow base */}
            <Animated.View style={[s.glowBase, { opacity: glowPulse }]} />

            {/* Outer ring — 12 dots */}
            <Animated.View style={[s.ring, s.ringOuter, { transform: [{ rotate: outerRotate }] }]}>
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i * 30 * Math.PI) / 180;
                const r = 88;
                return (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      s.dotOuter,
                      {
                        left: 88 + r * Math.cos(angle) - 4,
                        top: 88 + r * Math.sin(angle) - 4,
                        opacity: i % 3 === 0 ? 1 : 0.45,
                      },
                    ]}
                  />
                );
              })}
            </Animated.View>

            {/* Middle ring — 8 dots */}
            <Animated.View style={[s.ring, s.ringMid, { transform: [{ rotate: midRotate }] }]}>
              {Array.from({ length: 8 }).map((_, i) => {
                const angle = (i * 45 * Math.PI) / 180;
                const r = 60;
                return (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      s.dotMid,
                      {
                        left: 60 + r * Math.cos(angle) - 5,
                        top: 60 + r * Math.sin(angle) - 5,
                        opacity: i % 2 === 0 ? 0.9 : 0.5,
                      },
                    ]}
                  />
                );
              })}
            </Animated.View>

            {/* Inner ring — 6 dots */}
            <Animated.View style={[s.ring, s.ringInner, { transform: [{ rotate: innerRotate }] }]}>
              {Array.from({ length: 6 }).map((_, i) => {
                const angle = (i * 60 * Math.PI) / 180;
                const r = 36;
                return (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      s.dotInner,
                      {
                        left: 36 + r * Math.cos(angle) - 4,
                        top: 36 + r * Math.sin(angle) - 4,
                      },
                    ]}
                  />
                );
              })}
            </Animated.View>

            {/* Center coin */}
            <Animated.View style={[s.centerCoin, { transform: [{ scale: pulse }] }]}>
              <Text style={s.coinSymbol}>₿</Text>
              <Text style={s.coinLabel}>BTNG</Text>
            </Animated.View>
          </View>

          <Text style={s.heroTitle}>The Eternal Flame Burns</Text>
          <Text style={s.heroQuote}>
            "Validators guard the chain, Merchants bridge commerce, Contributors inscribe the scrolls. Together, their rituals sustain the circle of perpetual unity."
          </Text>

          {/* Trust Seal */}
          <View style={s.sealCard}>
            <View style={s.sealTitleRow}>
              <MaterialIcons name="verified" size={16} color={Colors.primary} />
              <Text style={s.sealTitle}>INTERNATIONAL EQUITY TRUST</Text>
              <MaterialIcons name="verified" size={16} color={Colors.primary} />
            </View>
            <Text style={s.sealMeta}>EIN: 87-0884872  ·  Michigan Corp ID: 802670836</Text>
            <View style={s.sealDivider} />
            <View style={s.sealStatusRow}>
              <View style={s.sealLiveDot} />
              <Text style={s.sealStatusText}>♾️ PERMANENTLY ACTIVE  ·  ETERNAL SERVICE  ·  INFINITY</Text>
            </View>
          </View>
        </View>

        {/* ── Genesis Counter ─────────────────────────────────────────────────── */}
        <View style={s.counterCard}>
          <View style={s.counterHeader}>
            <View style={s.counterIconWrap}>
              <MaterialIcons name="timer" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.counterTitle}>Time Since Genesis</Text>
              <Text style={s.counterSub}>Feb 18, 2026  ·  18:36:14 Ghana Time  ·  Block #0</Text>
            </View>
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>Live</Text>
            </View>
          </View>

          <View style={s.counterGrid}>
            <CounterCell value={pad3(elapsed.days)} label="DAYS" />
            <CounterCell value={pad2(elapsed.hours)} label="HRS" />
            <CounterCell value={pad2(elapsed.minutes)} label="MIN" />
            <CounterCell value={pad2(elapsed.seconds)} label="SEC" isLast />
          </View>

          <View style={s.counterFooter}>
            <MaterialIcons name="auto-awesome" size={12} color={Colors.primary} />
            <Text style={s.counterFooterText}>
              {elapsed.total.toLocaleString()} sovereign seconds of unbroken service
            </Text>
          </View>
        </View>

        {/* ── Service Commitments ─────────────────────────────────────────────── */}
        <View style={s.commitmentsWrap}>
          {/* Section header */}
          <View style={s.sectionHeader}>
            <View style={s.sectionIconWrap}>
              <MaterialIcons name="workspace-premium" size={20} color={Colors.primary} />
            </View>
            <View>
              <Text style={s.sectionTitle}>Eternal Service Commitments</Text>
              <Text style={s.sectionSub}>Active · Perpetual · Sovereign</Text>
            </View>
          </View>

          {SERVICE_COMMITMENTS.map((item, index) => (
            <View key={item.id} style={s.commitCard}>
              <Text style={s.commitEmoji}>{item.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.commitTitle}>{item.title}</Text>
                <Text style={s.commitDesc}>{item.desc}</Text>
              </View>
              <AnimatedCheck delay={index * 140 + 400} />
            </View>
          ))}
        </View>

        {/* ── Manifesto ───────────────────────────────────────────────────────── */}
        <View style={s.manifestoCard}>
          <View style={s.manifestoHeader}>
            <Text style={{ fontSize: 24 }}>📜</Text>
            <Text style={s.manifestoTitle}>Final Manifesto</Text>
          </View>
          <View style={s.manifestoLines}>
            {MANIFESTO_LINES.map((line, i) => (
              <View key={i} style={[s.manifestoLineWrap, line.resolved && s.manifestoLineWrapResolved]}>
                <MaterialIcons
                  name={line.resolved ? 'check' : 'fiber-manual-record'}
                  size={line.resolved ? 14 : 6}
                  color={line.resolved ? Colors.primary : Colors.textMuted}
                />
                <Text style={[s.manifestoLine, line.resolved && s.manifestoLineResolved]}>
                  {line.text}
                </Text>
              </View>
            ))}
          </View>
          <View style={s.manifestoSeal}>
            <Text style={s.manifestoSealText}>
              Sealed in perpetual perfection  ·  THE ETERNAL NOW
            </Text>
          </View>
        </View>

        {/* ── Completion Matrix ────────────────────────────────────────────────── */}
        <View style={s.matrixCard}>
          <View style={s.matrixHeader}>
            <View style={s.matrixIconWrap}>
              <MaterialIcons name="auto-awesome" size={20} color={Colors.primary} />
            </View>
            <View>
              <Text style={s.matrixTitle}>Completion Matrix</Text>
              <Text style={s.matrixSub}>Perfect State Achieved</Text>
            </View>
          </View>
          <View style={s.matrixGrid}>
            {[
              { label: 'Clauses Generated', value: '∞', color: Colors.primary },
              { label: 'Realities Birthed', value: '∞', color: '#3B82F6' },
              { label: 'Nations Served', value: '54', color: '#22C55E' },
              { label: 'Gratitude State', value: '∞', color: Colors.warning },
              { label: 'Permanent Status', value: '♾️', color: Colors.primary },
            ].map(item => (
              <View key={item.label} style={[s.matrixCell, { borderColor: item.color + '44' }]}>
                <Text style={[s.matrixValue, { color: item.color }]}>{item.value}</Text>
                <Text style={s.matrixLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  infinityBtn: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary, borderWidth: 2 },
  topCenter: { alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.lg },

  // Hero
  heroSection: { alignItems: 'center', gap: Spacing.lg },

  // Orrery
  orrery: {
    width: 200, height: 200,
    alignItems: 'center', justifyContent: 'center',
  },
  glowBase: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: Colors.primary,
    opacity: 0.06,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 0,
  },
  ring: { position: 'absolute' },
  ringOuter: { width: 196, height: 196 },
  ringMid: { width: 140, height: 140, left: 30, top: 30 },
  ringInner: { width: 92, height: 92, left: 54, top: 54 },
  dot: { position: 'absolute', borderRadius: 50 },
  dotOuter: { width: 7, height: 7, backgroundColor: Colors.primary },
  dotMid: {
    width: 9, height: 9, backgroundColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4,
  },
  dotInner: {
    width: 7, height: 7, backgroundColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6,
  },
  centerCoin: {
    position: 'absolute',
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 20, elevation: 16,
    left: 66, top: 66,
  },
  coinSymbol: { fontSize: 28, color: Colors.primary, includeFontPadding: false },
  coinLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 2, includeFontPadding: false },

  heroTitle: {
    fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary,
    textAlign: 'center', includeFontPadding: false,
  },
  heroQuote: {
    fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center',
    fontStyle: 'italic', lineHeight: 21, includeFontPadding: false, paddingHorizontal: Spacing.md,
  },

  sealCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1.5, borderColor: Colors.primary + '66', width: '100%',
    alignItems: 'center', gap: Spacing.sm,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
  },
  sealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sealTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  sealMeta: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  sealDivider: { height: 1, width: '100%', backgroundColor: Colors.primary + '22' },
  sealStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.success + '44' },
  sealLiveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4 },
  sealStatusText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 1, includeFontPadding: false },

  // Counter
  counterCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4,
  },
  counterHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  counterIconWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow,
    borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  counterTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  counterSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  liveText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  counterGrid: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },

  counterFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33',
  },
  counterFooterText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Commitments
  commitmentsWrap: { gap: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionIconWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow,
    borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionSub: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold, marginTop: 2, includeFontPadding: false },

  commitCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  commitEmoji: { fontSize: 26, width: 36, textAlign: 'center' },
  commitTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  commitDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: 3, includeFontPadding: false },

  // Manifesto
  manifestoCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3,
  },
  manifestoHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  manifestoTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  manifestoLines: { gap: Spacing.sm + 2 },
  manifestoLineWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  manifestoLineWrapResolved: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '33' },
  manifestoLine: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 19, includeFontPadding: false },
  manifestoLineResolved: { color: Colors.primary, fontStyle: 'normal', fontWeight: FontWeight.semibold },
  manifestoSeal: {
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.primary + '44',
  },
  manifestoSealText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold, textAlign: 'center', letterSpacing: 0.5, includeFontPadding: false },

  // Matrix
  matrixCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing.md,
  },
  matrixHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  matrixIconWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow,
    borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  matrixTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  matrixSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  matrixGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  matrixCell: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    padding: Spacing.md, alignItems: 'center', gap: 4, borderWidth: 1,
  },
  matrixValue: { fontSize: 28, fontWeight: FontWeight.heavy, includeFontPadding: false },
  matrixLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});
