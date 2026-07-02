/**
 * BTNG App Builder & Developer Admin Center
 * Live UI Editor · Font Sizer · Theme Picker · Feature Toggles · Maintenance Tools
 * Authorized: John Kojo Zi — Lead Developer · Bituncoin Gold Bank
 * EKUYE DIGITAL GATEWAY TRUST LTD · Reg. CS099020624
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';

// ── Storage Keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'btng_app_builder_config_v1';

// ── Default Config ─────────────────────────────────────────────────────────────
interface AppConfig {
  // Font sizes
  fontBody: number;
  fontSm: number;
  fontMd: number;
  fontLg: number;
  fontXl: number;
  // Spacing
  spacingBase: number;
  cardRadius: number;
  // Theme
  themeAccent: string;
  themeBg: string;
  // Feature toggles
  showPracticeWallet: boolean;
  showCopyTrading: boolean;
  showBinaryTrading: boolean;
  showP2PMarket: boolean;
  showBlog: boolean;
  showNFTCreator: boolean;
  showReferral: boolean;
  showFXConverter: boolean;
  showBtngPay: boolean;
  showCashRail: boolean;
  showCertScanner: boolean;
  showAIBanker: boolean;
  showSovereignDash: boolean;
  showFeeCalc: boolean;
  // Bank config
  tradeFeePercent: number;
  withdrawFeeFlat: number;
  p2pFeePercent: number;
  depositMinUSD: number;
  withdrawMinUSD: number;
  kycRequiredForWithdraw: boolean;
  twoFARequiredForWithdraw: boolean;
  // Display
  appName: string;
  tagline: string;
  supportEmail: string;
  merchantId: string;
  chainName: string;
}

const DEFAULT_CONFIG: AppConfig = {
  fontBody: 14,
  fontSm: 12,
  fontMd: 14,
  fontLg: 16,
  fontXl: 19,
  spacingBase: 12,
  cardRadius: 14,
  themeAccent: '#D4A017',
  themeBg: '#060608',
  showPracticeWallet: true,
  showCopyTrading: true,
  showBinaryTrading: true,
  showP2PMarket: true,
  showBlog: true,
  showNFTCreator: true,
  showReferral: true,
  showFXConverter: true,
  showBtngPay: true,
  showCashRail: true,
  showCertScanner: true,
  showAIBanker: true,
  showSovereignDash: true,
  showFeeCalc: true,
  tradeFeePercent: 0.1,
  withdrawFeeFlat: 1.0,
  p2pFeePercent: 0.2,
  depositMinUSD: 10,
  withdrawMinUSD: 5,
  kycRequiredForWithdraw: true,
  twoFARequiredForWithdraw: false,
  appName: 'BTNG Gold Coin',
  tagline: 'Ghana · 54 Africa Nations · BTNG Mainnet',
  supportEmail: 'info@bituncoin.io',
  merchantId: '248059',
  chainName: 'BTNG-MAINNET',
};

// ── Theme presets ──────────────────────────────────────────────────────────────
const THEME_PRESETS = [
  { name: 'BTNG Gold',     accent: '#D4A017', bg: '#060608', desc: 'Default sovereign gold' },
  { name: 'Kente Gold',    accent: '#FFD700', bg: '#06060A', desc: 'Bright Kente yellow' },
  { name: 'Emerald',       accent: '#22C55E', bg: '#060608', desc: 'African green energy' },
  { name: 'Royal Blue',    accent: '#3B82F6', bg: '#06080E', desc: 'Trust & reliability' },
  { name: 'Sovereign Red', accent: '#EF4444', bg: '#080606', desc: 'Power & authority' },
  { name: 'Ghana Purple',  accent: '#9945FF', bg: '#07060E', desc: 'Premium innovation' },
  { name: 'Copper',        accent: '#B87333', bg: '#060606', desc: 'Warm copper tone' },
  { name: 'Platinum',      accent: '#E5E7EB', bg: '#080808', desc: 'Clean platinum' },
];

type BuilderTab = 'overview' | 'fonts' | 'theme' | 'features' | 'bankconfig' | 'identity' | 'tools';

// ── Section card ───────────────────────────────────────────────────────────────
function SectionCard({ title, icon, color, children }: {
  title: string; icon: string; color: string; children: React.ReactNode;
}) {
  return (
    <View style={[bc.sectionCard, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={bc.sectionHeader}>
        <View style={[bc.sectionIconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <MaterialIcons name={icon as any} size={16} color={color} />
        </View>
        <Text style={bc.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ── Slider Row ─────────────────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, step, onDecrease, onIncrease, unit = '' }: {
  label: string; value: number; min: number; max: number; step: number;
  onDecrease: () => void; onIncrease: () => void; unit?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <View style={bc.sliderRow}>
      <View style={bc.sliderLabelRow}>
        <Text style={bc.sliderLabel}>{label}</Text>
        <View style={bc.sliderValBadge}>
          <Text style={bc.sliderVal}>{value}{unit}</Text>
        </View>
      </View>
      <View style={bc.sliderTrackRow}>
        <TouchableOpacity
          style={[bc.sliderBtn, value <= min && { opacity: 0.35 }]}
          onPress={onDecrease}
          disabled={value <= min}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="remove" size={16} color={Colors.primary} />
        </TouchableOpacity>
        <View style={bc.sliderTrack}>
          <View style={[bc.sliderFill, { width: `${pct}%` as any }]} />
        </View>
        <TouchableOpacity
          style={[bc.sliderBtn, value >= max && { opacity: 0.35 }]}
          onPress={onIncrease}
          disabled={value >= max}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="add" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Toggle Row ─────────────────────────────────────────────────────────────────
function ToggleRow({ label, desc, value, onChange, icon, color }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void;
  icon?: string; color?: string;
}) {
  return (
    <View style={bc.toggleRow}>
      <View style={bc.toggleLeft}>
        {icon && (
          <View style={[bc.toggleIcon, { backgroundColor: (color ?? Colors.primary) + '18' }]}>
            <MaterialIcons name={icon as any} size={15} color={color ?? Colors.primary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={bc.toggleLabel}>{label}</Text>
          {desc ? <Text style={bc.toggleDesc}>{desc}</Text> : null}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.bgElevated, true: Colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

// ── Input Row ──────────────────────────────────────────────────────────────────
function InputRow({ label, value, onChange, keyboardType = 'default', suffix }: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address';
  suffix?: string;
}) {
  return (
    <View style={bc.inputRow}>
      <Text style={bc.inputLabel}>{label}</Text>
      <View style={bc.inputWrap}>
        <TextInput
          style={bc.inputField}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {suffix ? <Text style={bc.inputSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function AppBuilderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { showAlert } = useAlert();

  const [tab, setTab] = useState<BuilderTab>('overview');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setConfig(prev => ({ ...prev, ...parsed }));
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const update = useCallback(<K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (_) {
      showAlert('Save Failed', 'Could not save configuration. Please try again.');
    }
  }, [config, showAlert]);

  const handleReset = useCallback(() => {
    showAlert('Reset to Defaults', 'This will reset ALL app builder settings to factory defaults. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          setConfig(DEFAULT_CONFIG);
          await AsyncStorage.removeItem(STORAGE_KEY);
          setDirty(false);
          showAlert('Reset Complete', 'All settings restored to factory defaults.');
        },
      },
    ]);
  }, [showAlert]);

  const handleExportConfig = useCallback(() => {
    const exportStr = JSON.stringify(config, null, 2);
    showAlert(
      'Config Export',
      `App Builder Config v1.0\nKeys: ${Object.keys(config).length}\n\nCopy from Developer Library → Notes tab to preserve.`,
      [{ text: 'OK' }]
    );
  }, [config]);

  // Guard: admin only
  if (!isAdmin) {
    return (
      <View style={[bc.container, { paddingTop: insets.top }]}>
        <View style={bc.topBar}>
          <TouchableOpacity style={bc.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={bc.topTitle}>App Builder</Text>
        </View>
        <View style={bc.accessDenied}>
          <MaterialIcons name="construction" size={48} color={Colors.error} />
          <Text style={bc.accessTitle}>Developer Access Required</Text>
          <Text style={bc.accessSub}>App Builder is restricted to authorized BTNG developers only.</Text>
        </View>
      </View>
    );
  }

  const TABS: { id: BuilderTab; icon: string; label: string }[] = [
    { id: 'overview',   icon: 'dashboard',        label: 'Overview'   },
    { id: 'fonts',      icon: 'text-fields',       label: 'Typography' },
    { id: 'theme',      icon: 'palette',           label: 'Theme'      },
    { id: 'features',   icon: 'toggle-on',         label: 'Features'   },
    { id: 'bankconfig', icon: 'account-balance',   label: 'Bank'       },
    { id: 'identity',   icon: 'business',          label: 'Identity'   },
    { id: 'tools',      icon: 'build',             label: 'Tools'      },
  ];

  return (
    <View style={[bc.container, { paddingTop: insets.top }]}>

      {/* ── Top Bar ── */}
      <View style={bc.topBar}>
        <TouchableOpacity style={bc.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={bc.topTitleRow}>
            <Text style={bc.topTitle}>App Builder</Text>
            {dirty && (
              <View style={bc.dirtyBadge}>
                <View style={bc.dirtyDot} />
                <Text style={bc.dirtyText}>Unsaved</Text>
              </View>
            )}
          </View>
          <Text style={bc.topSub}>BTNG Developer Admin Center · John Kojo Zi</Text>
        </View>
        {/* Save button */}
        <TouchableOpacity
          style={[bc.saveBtn, saved && bc.saveBtnDone, !dirty && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!dirty}
          activeOpacity={0.85}
        >
          <MaterialIcons name={saved ? 'check-circle' : 'save'} size={16} color={saved ? Colors.success : Colors.bg} />
          <Text style={[bc.saveBtnText, saved && { color: Colors.success }]}>
            {saved ? 'Saved!' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab Bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={bc.tabScrollWrap}
        contentContainerStyle={bc.tabScrollContent}
      >
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[bc.tabBtn, tab === t.id && bc.tabBtnActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={t.icon as any} size={13} color={tab === t.id ? Colors.bg : Colors.textMuted} />
            <Text style={[bc.tabText, tab === t.id && { color: Colors.bg }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: Spacing.xl, paddingBottom: insets.bottom + 40, gap: Spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            {/* Hero card */}
            <View style={bc.heroCard}>
              <View style={bc.heroIconWrap}>
                <MaterialIcons name="construction" size={32} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={bc.heroTitle}>BTNG App Builder Admin Center</Text>
                <Text style={bc.heroSub}>Maintain · Customize · Deploy · Control · Publish</Text>
                <View style={bc.heroTagRow}>
                  <View style={bc.heroTag}><Text style={bc.heroTagText}>Developer</Text></View>
                  <View style={bc.heroTag}><Text style={bc.heroTagText}>Admin Only</Text></View>
                  <View style={[bc.heroTag, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                    <Text style={[bc.heroTagText, { color: Colors.success }]}>LIVE</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Quick stats */}
            <View style={bc.statsRow}>
              {[
                { label: 'Font Scale',   val: `${config.fontMd}px`,          icon: 'text-fields',     color: '#3B82F6'      },
                { label: 'Accent Color', val: config.themeAccent,            icon: 'palette',          color: config.themeAccent },
                { label: 'Trade Fee',    val: `${config.tradeFeePercent}%`,  icon: 'percent',          color: '#22C55E'      },
                { label: 'App Name',     val: config.appName,                icon: 'label',            color: Colors.primary },
                { label: 'Chain',        val: config.chainName,              icon: 'link',             color: '#9945FF'      },
                { label: 'Merchant ID',  val: config.merchantId,             icon: 'cell-tower',       color: '#F59E0B'      },
              ].map(stat => (
                <View key={stat.label} style={[bc.statCard, { borderColor: stat.color + '44' }]}>
                  <MaterialIcons name={stat.icon as any} size={16} color={stat.color} />
                  <Text style={[bc.statVal, { color: stat.color }]} numberOfLines={1}>{stat.val}</Text>
                  <Text style={bc.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {/* Section Navigator */}
            <SectionCard title="App Builder Sections" icon="menu" color={Colors.primary}>
              <View style={bc.navGrid}>
                {[
                  { id: 'fonts',      label: 'Typography & Font Sizes',   icon: 'text-fields',     color: '#3B82F6',   desc: 'Adjust all text sizes to fit perfectly on any device' },
                  { id: 'theme',      label: 'Theme & Colors',             icon: 'palette',         color: '#9945FF',   desc: 'Choose accent colors, backgrounds, and visual style' },
                  { id: 'features',   label: 'Feature Toggles',            icon: 'toggle-on',       color: '#22C55E',   desc: 'Enable or disable platform modules and pages' },
                  { id: 'bankconfig', label: 'Bank Configuration',         icon: 'account-balance', color: Colors.primary, desc: 'Set trading fees, withdrawal limits, KYC rules' },
                  { id: 'identity',   label: 'App Identity',               icon: 'business',        color: '#F59E0B',   desc: 'App name, tagline, support email, chain name' },
                  { id: 'tools',      label: 'Maintenance Tools',          icon: 'build',           color: Colors.error, desc: 'Clear cache, reload data, reset, export config' },
                ].map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[bc.navCard, { borderColor: item.color + '44' }]}
                    onPress={() => setTab(item.id as BuilderTab)}
                    activeOpacity={0.8}
                  >
                    <View style={[bc.navIconWrap, { backgroundColor: item.color + '18', borderColor: item.color + '33' }]}>
                      <MaterialIcons name={item.icon as any} size={22} color={item.color} />
                    </View>
                    <Text style={[bc.navLabel, { color: item.color }]}>{item.label}</Text>
                    <Text style={bc.navDesc}>{item.desc}</Text>
                    <MaterialIcons name="arrow-forward" size={14} color={item.color + 'AA'} style={{ marginTop: 'auto' as any }} />
                  </TouchableOpacity>
                ))}
              </View>
            </SectionCard>

            {/* Quick access to dev tools */}
            <SectionCard title="Developer Links" icon="link" color="#3B82F6">
              <View style={bc.devLinksGrid}>
                {[
                  { label: 'Developer Library',   icon: 'code',                  color: Colors.primary, route: '/developer'            },
                  { label: 'Admin Dashboard',      icon: 'admin-panel-settings',  color: Colors.primary, route: '/admin'                },
                  { label: 'Sovereign Dashboard',  icon: 'security',              color: '#D4A017',      route: '/btng-sovereign-dashboard' },
                  { label: 'Block Explorer',       icon: 'explore',               color: '#3B82F6',      route: '/btng-explorer'        },
                  { label: 'Node Dashboard',       icon: 'hub',                   color: '#22C55E',      route: '/btng-node'            },
                  { label: 'API Manager',          icon: 'vpn-key',               color: '#F59E0B',      route: '/btng-api-manager'     },
                  { label: 'Minting Pipeline',     icon: 'whatshot',              color: '#D4A017',      route: '/btng-minting-pipeline' },
                  { label: 'Verification',         icon: 'verified-user',         color: '#22C55E',      route: '/btng-verification-pipeline' },
                  { label: 'Pipeline Hub',         icon: 'hub',                   color: '#9945FF',      route: '/btng-pipeline-hub'    },
                  { label: 'BTNG Pay',             icon: 'payments',              color: '#22C55E',      route: '/btng-pay'             },
                  { label: 'Cash Rail',            icon: 'cell-tower',            color: '#F59E0B',      route: '/cash-rail'            },
                  { label: 'Cert Scanner',         icon: 'qr-code-scanner',       color: '#9945FF',      route: '/cert-scanner'         },
                ].map(link => (
                  <TouchableOpacity
                    key={link.label}
                    style={[bc.devLinkBtn, { borderColor: link.color + '44' }]}
                    onPress={() => router.push(link.route as any)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name={link.icon as any} size={16} color={link.color} />
                    <Text style={[bc.devLinkLabel, { color: link.color }]} numberOfLines={2}>{link.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </SectionCard>
          </>
        )}

        {/* ── TYPOGRAPHY ── */}
        {tab === 'fonts' && (
          <>
            <SectionCard title="Font Sizes — Text Scale Control" icon="text-fields" color="#3B82F6">
              <Text style={bc.sectionDesc}>
                Adjust all text sizes across the entire app. Tap + / − to increase or decrease. Changes saved to device storage and persist across app restarts.
              </Text>

              {/* Live preview */}
              <View style={bc.fontPreviewBox}>
                <Text style={[bc.fontPreviewLabel]}>LIVE PREVIEW</Text>
                <Text style={[bc.fpHero, { fontSize: config.fontXl + 6 }]}>BTNG Gold · $4,329</Text>
                <Text style={[bc.fpTitle, { fontSize: config.fontLg }]}>Total Portfolio Value</Text>
                <Text style={[bc.fpBody, { fontSize: config.fontMd }]}>Your BTNGG balance is growing every day with the gold oracle feed.</Text>
                <Text style={[bc.fpSmall, { fontSize: config.fontSm }]}>Activated 2026-02-18 · Silver Tier · ACTIVE</Text>
                <Text style={[bc.fpXs, { fontSize: config.fontBody }]}>BTNG-MAINNET · 54 Africa Nations · Live</Text>
              </View>

              <SliderRow
                label="Body / XS (smallest labels)"
                value={config.fontBody}
                min={8} max={14} step={1}
                unit="px"
                onDecrease={() => update('fontBody', Math.max(8, config.fontBody - 1))}
                onIncrease={() => update('fontBody', Math.min(14, config.fontBody + 1))}
              />
              <SliderRow
                label="Small (SM — captions, badges)"
                value={config.fontSm}
                min={10} max={16} step={1}
                unit="px"
                onDecrease={() => update('fontSm', Math.max(10, config.fontSm - 1))}
                onIncrease={() => update('fontSm', Math.min(16, config.fontSm + 1))}
              />
              <SliderRow
                label="Medium (MD — body, inputs)"
                value={config.fontMd}
                min={12} max={18} step={1}
                unit="px"
                onDecrease={() => update('fontMd', Math.max(12, config.fontMd - 1))}
                onIncrease={() => update('fontMd', Math.min(18, config.fontMd + 1))}
              />
              <SliderRow
                label="Large (LG — section titles)"
                value={config.fontLg}
                min={14} max={22} step={1}
                unit="px"
                onDecrease={() => update('fontLg', Math.max(14, config.fontLg - 1))}
                onIncrease={() => update('fontLg', Math.min(22, config.fontLg + 1))}
              />
              <SliderRow
                label="Extra Large (XL — page headers)"
                value={config.fontXl}
                min={16} max={28} step={1}
                unit="px"
                onDecrease={() => update('fontXl', Math.max(16, config.fontXl - 1))}
                onIncrease={() => update('fontXl', Math.min(28, config.fontXl + 1))}
              />
            </SectionCard>

            <SectionCard title="Layout & Spacing" icon="space-bar" color="#9945FF">
              <Text style={bc.sectionDesc}>Control card radius and base padding across all components.</Text>
              <SliderRow
                label="Base Spacing (card padding)"
                value={config.spacingBase}
                min={8} max={20} step={2}
                unit="px"
                onDecrease={() => update('spacingBase', Math.max(8, config.spacingBase - 2))}
                onIncrease={() => update('spacingBase', Math.min(20, config.spacingBase + 2))}
              />
              <SliderRow
                label="Card Border Radius"
                value={config.cardRadius}
                min={6} max={24} step={2}
                unit="px"
                onDecrease={() => update('cardRadius', Math.max(6, config.cardRadius - 2))}
                onIncrease={() => update('cardRadius', Math.min(24, config.cardRadius + 2))}
              />

              {/* Preview card */}
              <View style={[bc.previewCard, { borderRadius: config.cardRadius, padding: config.spacingBase }]}>
                <Text style={[bc.previewCardLabel, { fontSize: config.fontSm }]}>PREVIEW CARD</Text>
                <Text style={[bc.previewCardTitle, { fontSize: config.fontMd }]}>Portfolio Value · $1,234.56</Text>
                <Text style={[bc.previewCardSub, { fontSize: config.fontBody }]}>Radius: {config.cardRadius}px · Padding: {config.spacingBase}px</Text>
              </View>
            </SectionCard>
          </>
        )}

        {/* ── THEME ── */}
        {tab === 'theme' && (
          <>
            <SectionCard title="Theme Presets" icon="palette" color="#9945FF">
              <Text style={bc.sectionDesc}>Choose a visual theme for your BTNG bank app. The accent color is used for buttons, badges, charts, and highlights.</Text>
              <View style={bc.themeGrid}>
                {THEME_PRESETS.map(preset => {
                  const isActive = config.themeAccent === preset.accent;
                  return (
                    <TouchableOpacity
                      key={preset.name}
                      style={[bc.themeCard, { borderColor: preset.accent + (isActive ? 'FF' : '44'), backgroundColor: isActive ? preset.accent + '18' : Colors.bgElevated }]}
                      onPress={() => { update('themeAccent', preset.accent); update('themeBg', preset.bg); }}
                      activeOpacity={0.8}
                    >
                      <View style={[bc.themeColorDot, { backgroundColor: preset.accent, shadowColor: preset.accent, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]} />
                      <Text style={[bc.themeName, isActive && { color: preset.accent }]}>{preset.name}</Text>
                      <Text style={bc.themeDesc}>{preset.desc}</Text>
                      {isActive && (
                        <View style={[bc.themeActiveBadge, { backgroundColor: preset.accent + '22', borderColor: preset.accent + '55' }]}>
                          <MaterialIcons name="check-circle" size={11} color={preset.accent} />
                          <Text style={[bc.themeActiveBadgeText, { color: preset.accent }]}>Active</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SectionCard>

            <SectionCard title="Custom Accent Color" icon="colorize" color="#9945FF">
              <Text style={bc.sectionDesc}>Enter a custom HEX color code to set a unique accent.</Text>
              <View style={bc.customColorRow}>
                <View style={[bc.colorPreviewDot, { backgroundColor: config.themeAccent }]} />
                <TextInput
                  style={bc.colorInput}
                  value={config.themeAccent}
                  onChangeText={v => update('themeAccent', v)}
                  placeholder="#D4A017"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={7}
                  autoCapitalize="characters"
                />
              </View>
              {/* Color preview strip */}
              <View style={[bc.colorPreviewStrip, { backgroundColor: config.themeAccent + '18', borderColor: config.themeAccent + '55' }]}>
                <View style={[bc.colorPreviewBtn, { backgroundColor: config.themeAccent }]}>
                  <Text style={bc.colorPreviewBtnText}>Sample Button</Text>
                </View>
                <View style={[bc.colorPreviewBadge, { backgroundColor: config.themeAccent + '22', borderColor: config.themeAccent + '55' }]}>
                  <Text style={[bc.colorPreviewBadgeText, { color: config.themeAccent }]}>Live Badge</Text>
                </View>
                <Text style={[bc.colorPreviewValue, { color: config.themeAccent }]}>{config.themeAccent}</Text>
              </View>
            </SectionCard>
          </>
        )}

        {/* ── FEATURES ── */}
        {tab === 'features' && (
          <>
            <SectionCard title="Trading Modules" icon="swap-horiz" color="#22C55E">
              <Text style={bc.sectionDesc}>Toggle core trading features on/off. Disabled features will be hidden from the navigation menu and profile screen.</Text>
              <ToggleRow label="P2P Marketplace" desc="P2P buy/sell listings across 54 African currencies" value={config.showP2PMarket} onChange={v => update('showP2PMarket', v)} icon="people" color="#9945FF" />
              <ToggleRow label="Copy Trading" desc="Follow and copy master traders automatically" value={config.showCopyTrading} onChange={v => update('showCopyTrading', v)} icon="content-copy" color="#EC4899" />
              <ToggleRow label="Binary Trading" desc="Up/down binary options trading module" value={config.showBinaryTrading} onChange={v => update('showBinaryTrading', v)} icon="call-split" color="#9945FF" />
              <ToggleRow label="Practice Wallet" desc="Demo mode with simulated balance for new users" value={config.showPracticeWallet} onChange={v => update('showPracticeWallet', v)} icon="science" color="#22C55E" />
              <ToggleRow label="Fee Calculator" desc="Trading fee estimator tool" value={config.showFeeCalc} onChange={v => update('showFeeCalc', v)} icon="calculate" color="#3B82F6" />
              <ToggleRow label="FX Converter" desc="African currency converter tool" value={config.showFXConverter} onChange={v => update('showFXConverter', v)} icon="currency-exchange" color="#F59E0B" />
            </SectionCard>

            <SectionCard title="BTNG Sovereign Platform" icon="security" color="#D4A017">
              <ToggleRow label="AI Private Banker" desc="54-nation AI banking assistant" value={config.showAIBanker} onChange={v => update('showAIBanker', v)} icon="psychology" color="#22C55E" />
              <ToggleRow label="Sovereign Dashboard" desc="Chain overview, wallet, mining, explorer" value={config.showSovereignDash} onChange={v => update('showSovereignDash', v)} icon="dashboard" color="#D4A017" />
              <ToggleRow label="BTNG Pay Gateway" desc="Sovereign payment gateway for merchants" value={config.showBtngPay} onChange={v => update('showBtngPay', v)} icon="payments" color="#22C55E" />
              <ToggleRow label="MTN MoMo Cash Rail" desc="Ghana mobile money integration" value={config.showCashRail} onChange={v => update('showCashRail', v)} icon="cell-tower" color="#F59E0B" />
              <ToggleRow label="Certificate Scanner" desc="QR scanner for BTNG gold certificates" value={config.showCertScanner} onChange={v => update('showCertScanner', v)} icon="qr-code-scanner" color="#3B82F6" />
            </SectionCard>

            <SectionCard title="Content & Community" icon="article" color="#3B82F6">
              <ToggleRow label="Blog & News" desc="BTNG news articles and market insights" value={config.showBlog} onChange={v => update('showBlog', v)} icon="article" color="#3B82F6" />
              <ToggleRow label="NFT Creator Studio" desc="Mint digital assets and NFTs" value={config.showNFTCreator} onChange={v => update('showNFTCreator', v)} icon="collections" color="#9945FF" />
              <ToggleRow label="Referral Program" desc="Invite friends and earn commissions" value={config.showReferral} onChange={v => update('showReferral', v)} icon="share" color="#22C55E" />
            </SectionCard>
          </>
        )}

        {/* ── BANK CONFIG ── */}
        {tab === 'bankconfig' && (
          <>
            <SectionCard title="Trading & Fee Configuration" icon="percent" color={Colors.primary}>
              <Text style={bc.sectionDesc}>Set the fee percentages that apply to all platform transactions. Changes take effect after save.</Text>

              <SliderRow
                label="Spot Trade Fee"
                value={config.tradeFeePercent}
                min={0} max={1} step={0.05}
                unit="%"
                onDecrease={() => update('tradeFeePercent', Math.max(0, Math.round((config.tradeFeePercent - 0.05) * 100) / 100))}
                onIncrease={() => update('tradeFeePercent', Math.min(1, Math.round((config.tradeFeePercent + 0.05) * 100) / 100))}
              />
              <SliderRow
                label="P2P Trade Fee"
                value={config.p2pFeePercent}
                min={0} max={2} step={0.1}
                unit="%"
                onDecrease={() => update('p2pFeePercent', Math.max(0, Math.round((config.p2pFeePercent - 0.1) * 100) / 100))}
                onIncrease={() => update('p2pFeePercent', Math.min(2, Math.round((config.p2pFeePercent + 0.1) * 100) / 100))}
              />
              <SliderRow
                label="Withdrawal Fee (flat USD)"
                value={config.withdrawFeeFlat}
                min={0} max={10} step={0.5}
                unit=" USD"
                onDecrease={() => update('withdrawFeeFlat', Math.max(0, Math.round((config.withdrawFeeFlat - 0.5) * 10) / 10))}
                onIncrease={() => update('withdrawFeeFlat', Math.min(10, Math.round((config.withdrawFeeFlat + 0.5) * 10) / 10))}
              />

              {/* Fee summary */}
              <View style={bc.feeSummary}>
                <Text style={bc.feeSummaryTitle}>Current Fee Schedule</Text>
                <View style={bc.feeSummaryRow}>
                  <Text style={bc.feeSummaryLabel}>Spot Trade</Text>
                  <Text style={bc.feeSummaryVal}>{config.tradeFeePercent}% per trade</Text>
                </View>
                <View style={bc.feeSummaryRow}>
                  <Text style={bc.feeSummaryLabel}>P2P Trade</Text>
                  <Text style={bc.feeSummaryVal}>{config.p2pFeePercent}% per P2P</Text>
                </View>
                <View style={bc.feeSummaryRow}>
                  <Text style={bc.feeSummaryLabel}>Withdrawal</Text>
                  <Text style={bc.feeSummaryVal}>${config.withdrawFeeFlat} flat fee</Text>
                </View>
                <View style={bc.feeSummaryRow}>
                  <Text style={bc.feeSummaryLabel}>Example: $1,000 trade</Text>
                  <Text style={[bc.feeSummaryVal, { color: Colors.primary }]}>
                    ${(1000 * config.tradeFeePercent / 100).toFixed(4)} fee
                  </Text>
                </View>
              </View>
            </SectionCard>

            <SectionCard title="Transaction Limits" icon="account-balance-wallet" color="#22C55E">
              <SliderRow
                label="Min Deposit (USD)"
                value={config.depositMinUSD}
                min={1} max={100} step={5}
                unit=" USD"
                onDecrease={() => update('depositMinUSD', Math.max(1, config.depositMinUSD - 5))}
                onIncrease={() => update('depositMinUSD', Math.min(100, config.depositMinUSD + 5))}
              />
              <SliderRow
                label="Min Withdrawal (USD)"
                value={config.withdrawMinUSD}
                min={1} max={100} step={5}
                unit=" USD"
                onDecrease={() => update('withdrawMinUSD', Math.max(1, config.withdrawMinUSD - 5))}
                onIncrease={() => update('withdrawMinUSD', Math.min(100, config.withdrawMinUSD + 5))}
              />
            </SectionCard>

            <SectionCard title="Security Controls" icon="security" color="#EF4444">
              <Text style={bc.sectionDesc}>Require additional verification steps for sensitive operations.</Text>
              <ToggleRow
                label="KYC Required for Withdrawal"
                desc="Users must complete KYC before making withdrawals"
                value={config.kycRequiredForWithdraw}
                onChange={v => update('kycRequiredForWithdraw', v)}
                icon="verified-user"
                color="#22C55E"
              />
              <ToggleRow
                label="2FA Required for Withdrawal"
                desc="Two-factor authentication mandatory for withdrawals"
                value={config.twoFARequiredForWithdraw}
                onChange={v => update('twoFARequiredForWithdraw', v)}
                icon="security"
                color="#EF4444"
              />
            </SectionCard>
          </>
        )}

        {/* ── IDENTITY ── */}
        {tab === 'identity' && (
          <>
            <SectionCard title="App Identity" icon="business" color="#F59E0B">
              <Text style={bc.sectionDesc}>These values appear across the platform — app header, about screens, footer text, and support links.</Text>
              <InputRow
                label="App Name"
                value={config.appName}
                onChange={v => update('appName', v)}
              />
              <InputRow
                label="Tagline"
                value={config.tagline}
                onChange={v => update('tagline', v)}
              />
              <InputRow
                label="Support Email"
                value={config.supportEmail}
                onChange={v => update('supportEmail', v)}
                keyboardType="email-address"
              />
            </SectionCard>

            <SectionCard title="Blockchain Identity" icon="link" color="#9945FF">
              <Text style={bc.sectionDesc}>BTNG chain identifier and payment merchant credentials.</Text>
              <InputRow
                label="Chain Name"
                value={config.chainName}
                onChange={v => update('chainName', v)}
              />
              <InputRow
                label="MTN MoMo Merchant ID"
                value={config.merchantId}
                onChange={v => update('merchantId', v)}
                keyboardType="numeric"
              />
            </SectionCard>

            {/* Preview */}
            <View style={bc.identityPreview}>
              <Text style={bc.identityPreviewLabel}>PREVIEW</Text>
              <Text style={bc.identityPreviewTitle}>{config.appName || 'BTNG Gold Coin'}</Text>
              <Text style={bc.identityPreviewSub}>{config.tagline || 'Ghana · 54 Africa Nations'}</Text>
              <View style={bc.identityPreviewRow}>
                <MaterialIcons name="email" size={11} color={Colors.textMuted} />
                <Text style={bc.identityPreviewEmail}>{config.supportEmail || 'info@bituncoin.io'}</Text>
              </View>
              <View style={bc.identityPreviewRow}>
                <MaterialIcons name="link" size={11} color={Colors.primary} />
                <Text style={[bc.identityPreviewEmail, { color: Colors.primary }]}>{config.chainName}</Text>
              </View>
            </View>
          </>
        )}

        {/* ── TOOLS ── */}
        {tab === 'tools' && (
          <>
            <SectionCard title="Save & Publish" icon="publish" color={Colors.primary}>
              <Text style={bc.sectionDesc}>Save your current configuration to device storage. All settings persist across app restarts and updates.</Text>
              <TouchableOpacity
                style={[bc.toolBtn, { backgroundColor: Colors.primary }]}
                onPress={handleSave}
                activeOpacity={0.85}
              >
                <MaterialIcons name="save" size={18} color={Colors.bg} />
                <Text style={bc.toolBtnText}>Save All Settings</Text>
                {dirty && <View style={bc.toolDirtyDot} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[bc.toolBtn, { backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66' }]}
                onPress={handleExportConfig}
                activeOpacity={0.85}
              >
                <MaterialIcons name="file-download" size={18} color={Colors.primary} />
                <Text style={[bc.toolBtnText, { color: Colors.primary }]}>Export Config Summary</Text>
              </TouchableOpacity>
            </SectionCard>

            <SectionCard title="Maintenance" icon="build" color="#F59E0B">
              <Text style={bc.sectionDesc}>Developer maintenance tools. Use with caution in production.</Text>

              {[
                { label: 'Admin Dashboard',        icon: 'admin-panel-settings', color: Colors.primary,  route: '/admin',          desc: 'Manage users, KYC, deposits, and blog content' },
                { label: 'Developer Library',       icon: 'code',                 color: Colors.primary,  route: '/developer',      desc: 'Code modules, API endpoints, database docs' },
                { label: 'BTNG Node Dashboard',     icon: 'hub',                  color: '#22C55E',       route: '/btng-node',      desc: 'View node status, block height, network stats' },
                { label: 'Block Explorer',          icon: 'explore',              color: '#3B82F6',       route: '/btng-explorer',  desc: 'Browse BTNG chain transactions and blocks' },
                { label: 'Minting Pipeline',        icon: 'whatshot',             color: '#D4A017',       route: '/btng-minting-pipeline', desc: 'Manage BTNGG token minting queue' },
                { label: 'Verification Pipeline',   icon: 'verified-user',        color: '#22C55E',       route: '/btng-verification-pipeline', desc: 'KYC + equity verification workflow' },
                { label: 'Pipeline Hub',            icon: 'hub',                  color: '#9945FF',       route: '/btng-pipeline-hub', desc: 'All pipeline kernels in one place' },
                { label: 'API Key Generator',       icon: 'vpn-key',              color: '#F59E0B',       route: '/btng-api-key-generator', desc: 'Generate developer API keys with scopes' },
                { label: 'Node Engine',             icon: 'device-hub',           color: '#9945FF',       route: '/btng-node-engine', desc: 'BTNG + AFN two-token node engine' },
                { label: 'Contract Deploy',         icon: 'code',                 color: '#22C55E',       route: '/btng-contract-deploy', desc: 'Deploy 3 smart contract types' },
                { label: 'Sovereign Docs',          icon: 'description',          color: '#D4A017',       route: '/btng-sovereign-docs', desc: 'Official legal + sovereign documents' },
                { label: 'Proof of Value',          icon: 'workspace-premium',    color: '#D4A017',       route: '/btng-proof-of-value', desc: 'Official POV document · POV-2026' },
              ].map(item => (
                <TouchableOpacity
                  key={item.label}
                  style={[bc.maintenanceRow, { borderLeftColor: item.color, borderLeftWidth: 2 }]}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.8}
                >
                  <View style={[bc.maintenanceIcon, { backgroundColor: item.color + '18', borderColor: item.color + '33' }]}>
                    <MaterialIcons name={item.icon as any} size={16} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={bc.maintenanceLabel}>{item.label}</Text>
                    <Text style={bc.maintenanceDesc}>{item.desc}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
            </SectionCard>

            <SectionCard title="Reset & Danger Zone" icon="warning" color={Colors.error}>
              <Text style={bc.sectionDesc}>These actions are irreversible. Only use when necessary.</Text>
              <TouchableOpacity
                style={[bc.toolBtn, { backgroundColor: Colors.errorBg, borderWidth: 1.5, borderColor: Colors.error + '55' }]}
                onPress={handleReset}
                activeOpacity={0.85}
              >
                <MaterialIcons name="restore" size={18} color={Colors.error} />
                <Text style={[bc.toolBtnText, { color: Colors.error }]}>Reset All to Factory Defaults</Text>
              </TouchableOpacity>

              <View style={bc.dangerNote}>
                <MaterialIcons name="info-outline" size={13} color={Colors.warning} />
                <Text style={bc.dangerNoteText}>
                  Reset only affects App Builder settings stored on this device. Your BTNG wallet, transactions, and user data are never affected.
                </Text>
              </View>
            </SectionCard>

            {/* Build info */}
            <SectionCard title="Build Information" icon="info" color={Colors.textMuted}>
              {[
                { k: 'App Version',   v: 'v2.0.0 — Production' },
                { k: 'Platform',      v: Platform.OS + ' ' + Platform.Version },
                { k: 'Tech Stack',    v: 'React Native · Expo · TypeScript' },
                { k: 'Backend',       v: 'OnSpace Cloud · Supabase-compatible' },
                { k: 'Chain',         v: 'BTNG-MAINNET · 168.231.79.52:64799' },
                { k: 'Developer',     v: 'John Kojo Zi · info@bituncoin.io' },
                { k: 'Company',       v: 'EKUYE DIGITAL GATEWAY TRUST LTD' },
                { k: 'Reg. No.',      v: 'CS099020624' },
                { k: 'TIN',           v: 'C0064220206' },
                { k: 'Config Keys',   v: String(Object.keys(config).length) + ' settings managed' },
              ].map(row => (
                <View key={row.k} style={bc.buildRow}>
                  <Text style={bc.buildKey}>{row.k}</Text>
                  <Text style={bc.buildVal}>{row.v}</Text>
                </View>
              ))}
            </SectionCard>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const bc = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  // Top bar
  topBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitle:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:          { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  dirtyBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  dirtyDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.warning },
  dirtyText:       { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  saveBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  saveBtnDone:     { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '44' },
  saveBtnText:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Tabs
  tabScrollWrap:   { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabScrollContent: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tabBtn:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:         { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },

  // Access denied
  accessDenied:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xl },
  accessTitle:     { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  accessSub:       { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Hero
  heroCard:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.primary + '66', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  heroIconWrap:    { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub:         { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  heroTagRow:      { flexDirection: 'row', gap: 5, marginTop: Spacing.sm },
  heroTag:         { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroTagText:     { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  // Stats
  statsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard:        { flex: 1, minWidth: '30%', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 5 },
  statVal:         { fontSize: 11, fontWeight: FontWeight.heavy, textAlign: 'center', includeFontPadding: false, maxWidth: '100%' },
  statLabel:       { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Section card
  sectionCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionIconWrap: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionDesc:     { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },

  // Nav grid
  navGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  navCard:         { width: '47%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, gap: 6, minWidth: 120 },
  navIconWrap:     { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navLabel:        { fontSize: 11, fontWeight: FontWeight.bold, includeFontPadding: false },
  navDesc:         { fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },

  // Dev links
  devLinksGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  devLinkBtn:      { flex: 1, minWidth: '30%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 5 },
  devLinkLabel:    { fontSize: 10, fontWeight: FontWeight.bold, textAlign: 'center', includeFontPadding: false },

  // Slider
  sliderRow:       { gap: 8 },
  sliderLabelRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sliderLabel:     { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, flex: 1 },
  sliderValBadge:  { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  sliderVal:       { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  sliderTrackRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sliderBtn:       { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center' },
  sliderTrack:     { flex: 1, height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  sliderFill:      { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },

  // Font preview
  fontPreviewBox:  { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '33', gap: 6 },
  fontPreviewLabel:{ fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.2, includeFontPadding: false },
  fpHero:          { fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  fpTitle:         { fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  fpBody:          { color: Colors.textSecondary, includeFontPadding: false, lineHeight: 18 },
  fpSmall:         { color: Colors.textMuted, includeFontPadding: false },
  fpXs:            { color: Colors.textMuted, includeFontPadding: false },

  // Preview card
  previewCard:     { backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.primary + '44', gap: 5, marginTop: Spacing.sm },
  previewCardLabel:{ fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  previewCardTitle:{ fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  previewCardSub:  { color: Colors.textMuted, includeFontPadding: false },

  // Theme grid
  themeGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  themeCard:       { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, gap: 5, alignItems: 'flex-start' },
  themeColorDot:   { width: 28, height: 28, borderRadius: 14, elevation: 4 },
  themeName:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  themeDesc:       { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  themeActiveBadge:{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  themeActiveBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Custom color
  customColorRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  colorPreviewDot: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: Colors.border, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  colorInput:      { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '66', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  colorPreviewStrip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1 },
  colorPreviewBtn:   { borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  colorPreviewBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  colorPreviewBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  colorPreviewBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  colorPreviewValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1, textAlign: 'right' },

  // Toggle
  toggleRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  toggleLeft:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1, paddingRight: Spacing.sm },
  toggleIcon:      { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  toggleLabel:     { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary, includeFontPadding: false },
  toggleDesc:      { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1, lineHeight: 14 },

  // Input row
  inputRow:        { gap: 5 },
  inputLabel:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  inputWrap:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  inputField:      { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  inputSuffix:     { paddingHorizontal: Spacing.md, fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  // Fee summary
  feeSummary:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  feeSummaryTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 2 },
  feeSummaryRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  feeSummaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  feeSummaryVal:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },

  // Identity preview
  identityPreview: { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', gap: 6, alignItems: 'center' },
  identityPreviewLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  identityPreviewTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  identityPreviewSub:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  identityPreviewRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  identityPreviewEmail: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Tool buttons
  toolBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, position: 'relative' },
  toolBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  toolDirtyDot:    { position: 'absolute', top: 8, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning },

  // Maintenance rows
  maintenanceRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  maintenanceIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  maintenanceLabel:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  maintenanceDesc: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },

  // Danger
  dangerNote:      { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44' },
  dangerNoteText:  { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17, includeFontPadding: false },

  // Build info
  buildRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', gap: Spacing.sm },
  buildKey:        { width: 110, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, flexShrink: 0 },
  buildVal:        { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
});
