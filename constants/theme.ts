// BTNG Gold Coin - Design System
import { Dimensions } from 'react-native';

// Safe window size — fallback to 390 if Dimensions returns 0 at boot
const _rawDims = Dimensions.get('window');
const SCREEN_W = _rawDims.width  > 100 ? _rawDims.width  : 390;
const SCREEN_H = _rawDims.height > 100 ? _rawDims.height : 844;

// Fixed scale of 1.0 — prevents any spacing amplification regardless of
// what Dimensions reports at boot time. Every screen fills edge-to-edge.
const scaleRatio = 1.0;
const isTablet   = SCREEN_W >= 768;

export function scale(size: number): number {
  return Math.round(size * scaleRatio * 2) / 2;
}

export function mFont(size: number): number {
  return Math.round(size * scaleRatio);
}

// ─── Brand Colors ─────────────────────────────────────────────────────────────
export const Colors = {
  primary: '#D4A017',
  primaryLight: '#F0C040',
  primaryDark: '#A07810',
  primaryGlow: 'rgba(212, 160, 23, 0.2)',
  primaryGlow40: 'rgba(212, 160, 23, 0.4)',
  copper: '#B87333',
  kente: '#8B0000',
  kenteGold: '#FFD700',
  africanGreen: '#2E7D32',
  bg: '#060608',
  bgCard: '#0E0E14',
  bgElevated: '#141420',
  bgModal: '#1A1A2E',
  surface: '#1C1C2E',
  surfaceLight: '#252540',
  bgSecondary: '#12121C',
  textPrimary: '#F5F0E8',
  textSecondary: '#A09880',
  textMuted: '#5A5570',
  textGold: '#D4A017',
  success: '#22C55E',
  successBg: 'rgba(34, 197, 94, 0.12)',
  error: '#EF4444',
  errorBg: 'rgba(239, 68, 68, 0.12)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.12)',
  info: '#3B82F6',
  border: 'rgba(212, 160, 23, 0.15)',
  borderLight: 'rgba(255, 255, 255, 0.06)',
  overlay: 'rgba(6, 6, 8, 0.85)',
  glassBg: 'rgba(20, 20, 32, 0.8)',
};

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const Spacing = {
  xs:  scale(3),
  sm:  scale(6),
  md:  scale(12),
  lg:  scale(18),
  xl:  scale(24),
  xxl: scale(36),
};

// ─── Border Radius ────────────────────────────────────────────────────────────
export const Radius = {
  sm:   scale(6),
  md:   scale(10),
  lg:   scale(14),
  xl:   scale(18),
  full: 999,
};

// ─── Font Sizes ───────────────────────────────────────────────────────────────
export const FontSize = {
  xs:   mFont(10),
  sm:   mFont(12),
  md:   mFont(14),
  lg:   mFont(16),
  xl:   mFont(19),
  xxl:  mFont(24),
  hero: mFont(30),
};

// ─── Font Weights ────────────────────────────────────────────────────────────
export const FontWeight = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  heavy:    '800' as const,
};

// ─── Screen helpers ───────────────────────────────────────────────────────────
export const Screen = {
  width:    SCREEN_W,
  height:   SCREEN_H,
  isTablet,
  isSmall:  false,
  isLarge:  false,
  scale:    1.0,
};

// ─── Full-screen container (use on every root View) ───────────────────────────
export const FullScreenContainer = {
  flex: 1,
  width: '100%' as const,
  maxWidth: '100%' as const,
  alignSelf: 'stretch' as const,
  alignItems: 'stretch' as const,
  backgroundColor: Colors.bg,
} as const;

// ─── Responsive page container style (for StyleSheet.create) ─────────────────
export const PageContainer = {
  flex: 1,
  backgroundColor: Colors.bg,
  width: '100%' as const,
  maxWidth: '100%' as const,
  alignSelf: 'stretch' as const,
} as const;
