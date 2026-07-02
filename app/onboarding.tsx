import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  FlatList, Animated, Easing, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const { width } = Dimensions.get('window');
const SCREEN_H = Dimensions.get('window').height;

// ── Slide definitions ─────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: '1',
    type: 'hero' as const,
    image: require('@/assets/images/onboarding1.jpg'),
    tag: 'BTNG GOLD COIN',
    tagColor: Colors.primary,
    title: "Africa's Sovereign\nCrypto Gold",
    subtitle: "Trade Bituncoin Gold (BTNG) — the digital gold standard built for Ghana and 54 African nations.",
    accent: Colors.primary,
    icon: '🏅',
  },
  {
    id: '2',
    type: 'hero' as const,
    image: require('@/assets/images/onboarding2.jpg'),
    tag: 'UNIFIED BANKING',
    tagColor: '#22C55E',
    title: 'Bank, Trade &\nGrow Wealth',
    subtitle: 'Spot trading, P2P marketplace, copy trading, multi-wallet and mobile money — all in one platform.',
    accent: '#22C55E',
    icon: '🏦',
  },
  {
    id: '3',
    type: 'hero' as const,
    image: require('@/assets/images/onboarding3.jpg'),
    tag: 'AI-POWERED',
    tagColor: '#9945FF',
    title: 'Smart Trading\nFor Every African',
    subtitle: 'Copy top Ghanaian traders, practice risk-free, and build your financial future with BTNG.',
    accent: '#9945FF',
    icon: '🤖',
  },
  {
    id: '4',
    type: 'feature' as const,
    image: null,
    featureColor: '#3B82F6',
    featureEmoji: '📈',
    tag: 'LIVE MARKETS',
    tagColor: '#3B82F6',
    title: 'Real-Time\nMarket Data',
    subtitle: 'Track BTNG, BTC, ETH and all major coins with live price feeds, mini charts and portfolio analytics.',
    accent: '#3B82F6',
    icon: '📈',
    features: ['Live price feeds', 'Portfolio tracker', 'Mini candlestick charts', 'Coin watchlist & alerts'],
  },
  {
    id: '5',
    type: 'feature' as const,
    image: null,
    featureColor: Colors.primary,
    featureEmoji: '🔐',
    tag: 'SOVEREIGN WALLET',
    tagColor: Colors.primary,
    title: 'BTNG Genesis\nWallet',
    subtitle: "Your gold-backed sovereign wallet. BIP-39 HD key generation, multi-account, and secure local backup.",
    accent: Colors.primary,
    icon: '🔐',
    features: ['BIP-39 seed phrase', 'HD multi-account', 'Secure enclave storage', 'MTN MoMo cash rail'],
  },
];

// ── Animated Dot ─────────────────────────────────────────────────────────────
function AnimatedDot({ active, color }: { active: boolean; color: string }) {
  const width = useRef(new Animated.Value(active ? 24 : 8)).current;
  const opacity = useRef(new Animated.Value(active ? 1 : 0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(width, {
        toValue: active ? 24 : 8,
        duration: 280,
        useNativeDriver: false,
        easing: Easing.out(Easing.back(1.2)),
      }),
      Animated.timing(opacity, {
        toValue: active ? 1 : 0.4,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [active]);

  return (
    <Animated.View
      style={{
        width,
        height: 8,
        borderRadius: 4,
        backgroundColor: active ? color : Colors.textMuted,
        opacity,
      }}
    />
  );
}

// ── Feature badge row ─────────────────────────────────────────────────────────
function FeaturePill({ text, color }: { text: string; color: string }) {
  return (
    <View style={[fp.pill, { borderColor: color + '55', backgroundColor: color + '14' }]}>
      <View style={[fp.dot, { backgroundColor: color }]} />
      <Text style={[fp.text, { color }]}>{text}</Text>
    </View>
  );
}
const fp = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  text: { fontSize: 11, fontWeight: '600', includeFontPadding: false },
});

// ── Slide renderers ────────────────────────────────────────────────────────────
function HeroSlide({ item, bottomPad }: { item: typeof SLIDES[0]; bottomPad: number }) {
  return (
    <View style={{ width, height: SCREEN_H }}>
      <Image
        source={item.image}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
      />
      {/* Dark gradient overlay */}
      <View style={ss.heroOverlay} />
      {/* Content */}
      <View style={[ss.heroContent, { paddingBottom: bottomPad + 200 }]}>
        <View style={[ss.tag, { borderColor: item.accent + '88', backgroundColor: item.accent + '18' }]}>
          <Text style={[ss.tagText, { color: item.accent }]}>{item.tag}</Text>
        </View>
        <Text style={ss.heroTitle}>{item.title}</Text>
        <Text style={ss.heroSubtitle}>{item.subtitle}</Text>
      </View>
    </View>
  );
}

function FeatureSlide({ item, bottomPad }: { item: typeof SLIDES[3]; bottomPad: number }) {
  return (
    <View style={{ width, height: SCREEN_H }}>
      {/* Screenshot preview */}
      <View style={ss.featureImageWrap}>
        {item.image ? (
          <Image
            source={item.image}
            style={ss.featureImage}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[ss.featureImage, { backgroundColor: (item as any).featureColor + '22', alignItems: 'center', justifyContent: 'center', borderRadius: 22 }]}>
            <Text style={{ fontSize: 72 }}>{(item as any).featureEmoji ?? '📱'}</Text>
          </View>
        )}
        {/* Screen frame glow */}
        <View style={[ss.featureImageGlow, { borderColor: item.accent + '66', shadowColor: item.accent }]} />
      </View>

      {/* Bottom panel */}
      <View style={[ss.featurePanel, { paddingBottom: bottomPad + 200 }]}>
        <View style={[ss.tag, { borderColor: item.accent + '88', backgroundColor: item.accent + '18', alignSelf: 'flex-start' }]}>
          <Text style={[ss.tagText, { color: item.accent }]}>{item.tag}</Text>
        </View>
        <Text style={ss.featureTitle}>{item.title}</Text>
        <Text style={ss.featureSubtitle}>{item.subtitle}</Text>
        {item.features && (
          <View style={ss.featurePillRow}>
            {item.features.map(f => (
              <FeaturePill key={f} text={f} color={item.accent} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const btnScale = useRef(new Animated.Value(1)).current;

  const isLast = activeIndex === SLIDES.length - 1;
  const current = SLIDES[activeIndex];

  const goNext = useCallback(() => {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      flatRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      router.replace('/login');
    }
  }, [activeIndex, router]);

  const pressIn = () => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const renderItem = ({ item }: { item: typeof SLIDES[0] }) => {
    const bottomPad = insets.bottom;
    if (item.type === 'feature') {
      return <FeatureSlide item={item as typeof SLIDES[3]} bottomPad={bottomPad} />;
    }
    return <HeroSlide item={item} bottomPad={bottomPad} />;
  };

  return (
    <View style={ss.container}>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        horizontal
        pagingEnabled
        bounces={false}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveIndex(idx);
        }}
      />

      {/* ── Skip button (top right) ── */}
      {!isLast && (
        <TouchableOpacity
          style={[ss.skipTopBtn, { top: insets.top + Spacing.sm }]}
          onPress={() => router.replace('/login')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Text style={ss.skipTopText}>Skip</Text>
          <MaterialIcons name="arrow-forward" size={13} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* ── Step indicator (top left) ── */}
      <View style={[ss.stepBadge, { top: insets.top + Spacing.sm }]}>
        <Text style={ss.stepText}>{activeIndex + 1}/{SLIDES.length}</Text>
      </View>

      {/* ── Bottom controls ── */}
      <View style={[ss.bottomPanel, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* Progress dots */}
        <View style={ss.dotsRow}>
          {SLIDES.map((slide, i) => (
            <TouchableOpacity
              key={slide.id}
              onPress={() => {
                flatRef.current?.scrollToIndex({ index: i, animated: true });
                setActiveIndex(i);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              activeOpacity={0.7}
            >
              <AnimatedDot active={i === activeIndex} color={current.accent} />
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA Button */}
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity
            style={[ss.ctaBtn, { backgroundColor: current.accent, shadowColor: current.accent }]}
            onPress={goNext}
            onPressIn={pressIn}
            onPressOut={pressOut}
            activeOpacity={1}
          >
            {isLast ? (
              <>
                <MaterialIcons name="rocket-launch" size={20} color={Colors.bg} />
                <Text style={ss.ctaBtnText}>Get Started — Join BTNG</Text>
              </>
            ) : (
              <>
                <Text style={ss.ctaBtnText}>Continue</Text>
                <MaterialIcons name="arrow-forward" size={20} color={Colors.bg} />
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Sign in link */}
        <TouchableOpacity
          style={ss.signInRow}
          onPress={() => router.replace('/login')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 20, right: 20 }}
        >
          <Text style={ss.signInText}>Already have an account?</Text>
          <Text style={[ss.signInLink, { color: current.accent }]}> Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const BOTTOM_PANEL_H = 180;

const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060608', width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  // Skip / step badges
  skipTopBtn: {
    position: 'absolute',
    right: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6,6,8,0.6)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 20,
  },
  skipTopText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, includeFontPadding: false },

  stepBadge: {
    position: 'absolute',
    left: Spacing.xl,
    backgroundColor: 'rgba(6,6,8,0.6)',
    borderRadius: Radius.full,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 20,
  },
  stepText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, includeFontPadding: false },

  // Hero slide
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,6,8,0.52)',
  },
  heroContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
    gap: Spacing.md,
  },
  heroTitle: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 46,
    includeFontPadding: false,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroSubtitle: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 24,
    includeFontPadding: false,
  },

  // Feature slide
  featureImageWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.56,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 60,
    backgroundColor: '#0A0A14',
  },
  featureImage: {
    width: width * 0.62,
    height: SCREEN_H * 0.50,
    borderRadius: 22,
  },
  featureImageGlow: {
    position: 'absolute',
    top: 56,
    width: width * 0.62 + 4,
    height: SCREEN_H * 0.50 + 4,
    borderRadius: 24,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 10,
    backgroundColor: 'transparent',
  },
  featurePanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    gap: Spacing.sm,
    backgroundColor: 'rgba(6,6,8,0.93)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    top: SCREEN_H * 0.52,
  },
  featureTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 36,
    includeFontPadding: false,
    letterSpacing: -0.3,
  },
  featureSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.68)',
    lineHeight: 20,
    includeFontPadding: false,
  },
  featurePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 4,
  },

  // Shared tag
  tag: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    includeFontPadding: false,
  },

  // Bottom panel
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: 'rgba(6,6,8,0.88)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 2,
  },

  // CTA
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: Radius.xl,
    paddingVertical: 17,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#060608',
    includeFontPadding: false,
    letterSpacing: 0.2,
  },

  // Sign in
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  signInText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  signInLink: { fontSize: FontSize.sm, fontWeight: '700', includeFontPadding: false },
});
