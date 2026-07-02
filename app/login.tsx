// BTNG Gold Coin — Login Screen
// Clean bank login with biometric admin shortcut
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert, getSupabaseClient } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy-load biometric modules — prevents native spec file crash at module load time
const getLocalAuth = () => require('expo-local-authentication');
const getSecureStore = () => require('expo-secure-store');
import { createBTNG3WalletAccount } from '@/services/btng3WalletService';

const ADMIN_EMAIL = 'admin@btng.gold';
const BIOMETRIC_KEY_EMAIL = 'BTNG_ADMIN_BIOMETRIC_EMAIL';
const BIOMETRIC_KEY_PASSWORD = 'BTNG_ADMIN_BIOMETRIC_PASSWORD';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();
  const { showAlert } = useAlert();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('123456');
  const [fullName, setFullName] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [btng3Banner, setBtng3Banner] = useState(false);
  const [btng3Address, setBtng3Address] = useState('');
  const btng3BannerAnim = useRef(new Animated.Value(0)).current;

  // Guard: prevent double-navigation (race condition between auth state + manual nav)
  const navigatingRef = useRef(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricSaved, setBiometricSaved] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | 'iris' | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Live BTNG price (static/cached fallback)
  const [btngPrice] = useState('$3.250');
  const [priceChange] = useState('+0.20%');

  const isAdmin = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // ── Single source of truth: auth state drives ALL navigation ───────────────
  // This is the ONLY place router.replace is called. Never call it in handlers.
  useEffect(() => {
    if (isAuthenticated && !navigatingRef.current) {
      navigatingRef.current = true;
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  // Reset guard when component unmounts (e.g. user logs back out)
  useEffect(() => {
    navigatingRef.current = false;
    return () => { navigatingRef.current = false; };
  }, []);

  // ── Biometric init ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const LocalAuth = getLocalAuth();
        const SecureStore = getSecureStore();
        const hasHardware = await LocalAuth.hasHardwareAsync();
        const isEnrolled = await LocalAuth.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) return;

        const types = await LocalAuth.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('face');
        } else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
          setBiometricType('fingerprint');
        } else if (types.includes(LocalAuth.AuthenticationType.IRIS)) {
          setBiometricType('iris');
        }
        setBiometricAvailable(true);

        // Check if admin credentials are saved
        const savedEmail = await SecureStore.getItemAsync(BIOMETRIC_KEY_EMAIL);
        setBiometricSaved(savedEmail === ADMIN_EMAIL);
      } catch (_) {
        // Biometrics not supported — silently skip
      }
    })();
  }, []);

  // Pulse animation for biometric button
  useEffect(() => {
    if (biometricAvailable && biometricSaved) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [biometricAvailable, biometricSaved]);

  // ── Provision BTNG3 wallet for new user (non-blocking background task) ──────
  const provisionBTNG3Wallet = async (userId: string) => {
    try {
      const account = await createBTNG3WalletAccount(0x01, 0x0001);
      const sb = getSupabaseClient();
      await sb.from('btng_wallets').upsert(
        {
          user_id: userId,
          btng_id: account.address,
          wallet_address: account.address,
          asset: 'BTNGG',
          balance: 0,
          gold_backed_ghs: 0,
          tier: 'Bronze',
          source: 'btng3',
        },
        { onConflict: 'user_id' }
      );
      await AsyncStorage.setItem(`btng3_provisioned_${userId}`, '1');
      return account.address;
    } catch {
      return null;
    }
  };

  // ── Save admin creds after login ────────────────────────────────────────────
  const saveAdminBiometric = async (adminEmail: string, adminPassword: string) => {
    try {
      const SecureStore = getSecureStore();
      await SecureStore.setItemAsync(BIOMETRIC_KEY_EMAIL, adminEmail, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await SecureStore.setItemAsync(BIOMETRIC_KEY_PASSWORD, adminPassword, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      setBiometricSaved(true);
    } catch (_) {}
  };

  // ── Biometric login handler ─────────────────────────────────────────────────
  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    try {
      const LocalAuth = getLocalAuth();
      const SecureStore = getSecureStore();
      const result = await LocalAuth.authenticateAsync({
        promptMessage: 'Authenticate as Bank Manager',
        fallbackLabel: 'Use Password',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        requireConfirmation: false,
      });

      if (!result.success) {
        setBiometricLoading(false);
        if ((result as any).error !== 'user_cancel' && (result as any).error !== 'system_cancel') {
          showAlert('Biometric Failed', 'Authentication was not successful. Please use your password.');
        }
        return;
      }

      const savedEmail = await SecureStore.getItemAsync(BIOMETRIC_KEY_EMAIL);
      const savedPassword = await SecureStore.getItemAsync(BIOMETRIC_KEY_PASSWORD);

      if (!savedEmail || !savedPassword) {
        setBiometricLoading(false);
        showAlert('Setup Required', 'Please sign in with your password once to enable biometric login.');
        return;
      }

      const { error } = await login(savedEmail, savedPassword);
      setBiometricLoading(false);

      if (error) {
        showAlert('Login Failed', 'Saved credentials are invalid. Please sign in with your password.');
        const SecureStore2 = getSecureStore();
        await SecureStore2.deleteItemAsync(BIOMETRIC_KEY_EMAIL);
        await SecureStore2.deleteItemAsync(BIOMETRIC_KEY_PASSWORD);
        setBiometricSaved(false);
        return;
      }
      // Navigation handled by isAuthenticated useEffect — do NOT call router here
    } catch (_) {
      setBiometricLoading(false);
      showAlert('Error', 'Biometric authentication failed. Please try again.');
    }
  };

  // ── Quick Admin Login ───────────────────────────────────────────────────────
  const handleQuickAdminLogin = async () => {
    if (loading) return;
    setLoading(true);
    const { error } = await login(ADMIN_EMAIL, '123456');
    setLoading(false);
    if (error) {
      showAlert('Admin Login Failed', error);
      return;
    }
    // Save biometric in background — navigation driven by isAuthenticated useEffect
    if (biometricAvailable && !biometricSaved) {
      saveAdminBiometric(ADMIN_EMAIL, '123456').catch(() => {});
    }
  };

  // ── Sign In ─────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      showAlert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!password.trim()) {
      showAlert('Password Required', 'Please enter your password.');
      return;
    }
    setLoading(true);
    const { error } = await login(trimmedEmail, password);
    setLoading(false);

    if (error) {
      if (error.toLowerCase().includes('invalid') || error.toLowerCase().includes('credentials') || error.toLowerCase().includes('password')) {
        showAlert('Incorrect Credentials', 'Email or password is incorrect. Please try again.');
      } else if (error.toLowerCase().includes('confirm')) {
        showAlert('Email Not Confirmed', 'Please check your inbox and confirm your email address first.');
      } else {
        showAlert('Sign In Failed', error);
      }
      return;
    }

    // Non-blocking: save biometric + provision wallet in background
    // Navigation is handled by isAuthenticated useEffect — do NOT call router here
    if (trimmedEmail === ADMIN_EMAIL && biometricAvailable && !biometricSaved) {
      saveAdminBiometric(trimmedEmail, password).catch(() => {});
    }
    try {
      const sb = getSupabaseClient();
      const { data: { user: authUser } } = await sb.auth.getUser();
      if (authUser) {
        AsyncStorage.getItem(`btng3_provisioned_${authUser.id}`).then(provisioned => {
          if (!provisioned) {
            provisionBTNG3Wallet(authUser.id).then(addr => {
              if (addr) setBtng3Address(addr);
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    } catch { /* silent */ }
  };

  // ── Sign Up ─────────────────────────────────────────────────────────────────
  const handleSignUp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.includes('@')) {
      showAlert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      showAlert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPw) {
      showAlert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim() || undefined,
          username: fullName.trim().split(' ')[0] || undefined,
        },
      },
    });
    setLoading(false);

    if (error) {
      showAlert('Registration Failed', error.message);
      return;
    }

    if (data.session) {
      // Provision wallet in background — navigation driven by isAuthenticated useEffect
      const userId = data.session.user?.id;
      if (userId) {
        provisionBTNG3Wallet(userId).then(addr => {
          if (addr) setBtng3Address(addr);
        }).catch(() => {});
      }
    } else {
      showAlert(
        'Account Created',
        'Your account has been created. Please check your email to confirm, then sign in.',
        [{ text: 'OK', onPress: () => setMode('signin') }]
      );
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.includes('@')) {
      showAlert('Email Required', 'Enter your email address above first, then tap Forgot Password.');
      return;
    }
    setLoading(true);
    const client = getSupabaseClient();
    const { error } = await client.auth.resetPasswordForEmail(trimmedEmail);
    setLoading(false);
    if (error) {
      showAlert('Reset Failed', error.message);
      return;
    }
    showAlert('Reset Email Sent', `A password reset link has been sent to ${trimmedEmail}. Check your inbox.`);
  };

  return (
    <KeyboardAvoidingView
      style={[s.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── BTNG3 Wallet Ready Banner ── */}
      {btng3Banner && (
        <Animated.View style={[
          s.btng3Banner,
          { opacity: btng3BannerAnim, transform: [{ translateY: btng3BannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }] },
        ]}>
          <View style={s.btng3BannerIconWrap}>
            <MaterialIcons name="account-balance-wallet" size={22} color={Colors.bg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.btng3BannerTitle}>Your BTNG3 address is ready</Text>
            <Text style={s.btng3BannerAddr} numberOfLines={1}>{btng3Address}</Text>
          </View>
          <View style={s.btng3BannerBadge}>
            <Text style={s.btng3BannerBadgeText}>NEW</Text>
          </View>
        </Animated.View>
      )}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── BIOMETRIC SHORTCUT (Admin only, appears when enrolled) ─ */}
        {biometricAvailable && biometricSaved && mode === 'signin' && (
          <View style={s.biometricWrap}>
            <View style={s.biometricCard}>
              <View style={s.biometricLeft}>
                <View style={[s.biometricIconWrap, biometricLoading && s.biometricIconActive]}>
                  <MaterialIcons
                    name={biometricType === 'face' ? 'face' : biometricType === 'fingerprint' ? 'fingerprint' : 'security'}
                    size={28}
                    color={Colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.biometricTitle}>
                    {biometricType === 'face' ? 'Face ID Login' : biometricType === 'fingerprint' ? 'Fingerprint Login' : 'Biometric Login'}
                  </Text>
                  <Text style={s.biometricSub}>Bank Manager · admin@btng.gold</Text>
                </View>
              </View>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={[s.biometricBtn, biometricLoading && { opacity: 0.7 }]}
                  onPress={handleBiometricLogin}
                  disabled={biometricLoading}
                  activeOpacity={0.8}
                >
                  {biometricLoading ? (
                    <ActivityIndicator size="small" color={Colors.bg} />
                  ) : (
                    <MaterialIcons
                      name={biometricType === 'face' ? 'face' : 'fingerprint'}
                      size={20}
                      color={Colors.bg}
                    />
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
            <View style={s.biometricDivider}>
              <View style={s.biometricLine} />
              <Text style={s.biometricDividerText}>or sign in with password</Text>
              <View style={s.biometricLine} />
            </View>
          </View>
        )}

        {/* ── COIN HERO ────────────────────────────────────────────── */}
        <View style={s.hero}>
          <View style={s.coinWrap}>
            <Image
              source={require('@/assets/images/btng_gold_logo.jpg')}
              style={s.coinImage}
              contentFit="cover"
              transition={200}
            />
            <View style={s.coinGlow} />
          </View>

          <Text style={s.brandTitle}>BTNG Gold Coin</Text>
          <Text style={s.brandSub}>Bituncoin · Ghana & 54 Africa Nations</Text>

          <View style={s.ekuyeBadge}>
            <MaterialIcons name="verified" size={12} color={Colors.primary} />
            <Text style={s.ekuyeText}>EKUYE DIGITAL GATEWAY TRUST LTD</Text>
          </View>

          {/* Country chips */}
          <View style={s.chipsRow}>
            <View style={s.chip}>
              <Text style={s.chipText}>🇬🇭 Ghana</Text>
            </View>
            <View style={s.chip}>
              <Text style={s.chipText}>🌍 54 Africa</Text>
            </View>
            <View style={[s.chip, s.chipGold]}>
              <Text style={[s.chipText, { color: Colors.bg }]}>Gold-Backed</Text>
            </View>
          </View>

          {/* Live price strip */}
          <View style={s.priceStrip}>
            <View style={s.priceDot} />
            <Text style={s.priceSymbol}>BTNGG</Text>
            <Text style={s.priceValue}>{btngPrice}</Text>
            <View style={s.priceChangePill}>
              <MaterialIcons name="trending-up" size={11} color={Colors.success} />
              <Text style={s.priceChangeText}>{priceChange}</Text>
            </View>
            <View style={s.priceCached}>
              <Text style={s.priceCachedText}>CACHED</Text>
            </View>
          </View>
        </View>

        {/* ── FORM CARD ─────────────────────────────────────────────── */}
        <View style={[s.card, isAdmin && s.cardAdmin]}>

          {/* Mode Toggle */}
          <View style={s.modeToggle}>
            <TouchableOpacity
              style={[s.modeBtn, mode === 'signin' && s.modeBtnActive]}
              onPress={() => setMode('signin')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="login" size={14} color={mode === 'signin' ? Colors.bg : Colors.textMuted} />
              <Text style={[s.modeBtnText, mode === 'signin' && s.modeBtnTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modeBtn, mode === 'signup' && s.modeBtnActive]}
              onPress={() => setMode('signup')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="person-add" size={14} color={mode === 'signup' ? Colors.bg : Colors.textMuted} />
              <Text style={[s.modeBtnText, mode === 'signup' && s.modeBtnTextActive]}>Create Account</Text>
            </TouchableOpacity>
          </View>

          {/* Full Name (signup only) */}
          {mode === 'signup' && (
            <View style={s.field}>
              <Text style={s.label}>Full Name</Text>
              <View style={s.inputRow}>
                <MaterialIcons name="person-outline" size={18} color={Colors.textMuted} />
                <TextInput
                  style={s.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your full name"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          {/* Email */}
          <View style={s.field}>
            <Text style={s.label}>Email</Text>
            <View style={[s.inputRow, isAdmin && s.inputRowAdmin]}>
              <MaterialIcons name="email" size={18} color={isAdmin ? Colors.primary : Colors.textMuted} />
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {isAdmin ? <MaterialIcons name="admin-panel-settings" size={14} color={Colors.primary} /> : null}
            </View>
          </View>

          {/* Password */}
          <View style={s.field}>
            <Text style={s.label}>Password</Text>
            <View style={[s.inputRow, isAdmin && s.inputRowAdmin]}>
              <MaterialIcons name="lock-outline" size={18} color={isAdmin ? Colors.primary : Colors.textMuted} />
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Your password'}
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password (signup only) */}
          {mode === 'signup' && (
            <View style={s.field}>
              <Text style={s.label}>Confirm Password</Text>
              <View style={[s.inputRow, confirmPw.length > 0 && password !== confirmPw ? { borderColor: Colors.error + '88' } : null]}>
                <MaterialIcons name="lock" size={18} color={Colors.textMuted} />
                <TextInput
                  style={s.input}
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                  placeholder="Repeat your password"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name={showConfirm ? 'visibility' : 'visibility-off'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Quick Admin Login button */}
          {isAdmin && mode === 'signin' ? (
            <TouchableOpacity
              style={[s.quickAdminBtn, loading && { opacity: 0.6 }]}
              onPress={handleQuickAdminLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <>
                  <MaterialIcons name="bolt" size={20} color={Colors.bg} />
                  <Text style={s.quickAdminBtnText}>Quick Admin Login</Text>
                  <View style={s.quickAdminBadge}>
                    <Text style={s.quickAdminBadgeText}>ONE TAP</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {/* Admin hint + biometric enroll prompt */}
          {isAdmin && mode === 'signin' ? (
            <View style={s.adminHint}>
              <MaterialIcons name="admin-panel-settings" size={12} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.adminHintText}>✓ Admin ready — tap Sign In below</Text>
                {biometricAvailable && !biometricSaved ? (
                  <Text style={[s.adminHintText, { marginTop: 3, color: Colors.textSecondary }]}>
                    {biometricType === 'face' ? '🔐 Face ID' : '🔐 Fingerprint'} will be enabled after sign-in
                  </Text>
                ) : null}
                {biometricSaved ? (
                  <Text style={[s.adminHintText, { marginTop: 3, color: Colors.success }]}>
                    {biometricType === 'face' ? '✓ Face ID' : '✓ Fingerprint'} shortcut is active
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Forgot password (sign in only) */}
          {mode === 'signin' ? (
            <TouchableOpacity onPress={handleForgotPassword} style={s.forgotRow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          ) : null}

          {/* Submit button */}
          <TouchableOpacity
            style={[s.submitBtn, (loading || !email.trim() || !password.trim()) && { opacity: 0.55 }]}
            onPress={mode === 'signin' ? handleSignIn : handleSignUp}
            disabled={loading || !email.trim() || !password.trim()}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <>
                <MaterialIcons name={mode === 'signin' ? 'login' : 'person-add'} size={18} color={Colors.bg} />
                <Text style={s.submitBtnText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Switch mode link */}
          {mode === 'signin' ? (
            <TouchableOpacity onPress={() => setMode('signup')} style={s.switchRow}>
              <Text style={s.switchText}>New to BTNG? </Text>
              <Text style={s.switchLink}>Create a free account</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setMode('signin')} style={s.switchRow}>
              <Text style={s.switchText}>Already have an account? </Text>
              <Text style={s.switchLink}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerText}>Merchant ID 248059 · www.bituncoin.io</Text>
          <View style={s.footerLinksRow}>
            <TouchableOpacity onPress={() => router.push('/privacy-policy' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
              <Text style={s.footerLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <View style={s.footerLinkDot} />
            <TouchableOpacity onPress={() => router.push('/terms' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
              <Text style={s.footerLink}>Terms of Service</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.footerCopy}>© 2024–2026 EKUYE DIGITAL GATEWAY TRUST LTD · Reg. CS099020624</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  coinWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
    position: 'relative',
  },
  coinImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  coinGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: Colors.primary + '88',
  },
  brandTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  brandSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  ekuyeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    marginTop: 2,
  },
  ekuyeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipGold: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },
  priceStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  priceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  priceSymbol: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },
  priceValue: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
  },
  priceChangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.successBg,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  priceChangeText: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
  },
  priceCached: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priceCachedText: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
  },

  // Card
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cardAdmin: {
    borderColor: Colors.primary + '66',
    borderWidth: 1.5,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
  },
  modeBtnActive: {
    backgroundColor: Colors.primary,
  },
  modeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  modeBtnTextActive: {
    color: Colors.bg,
  },

  // Fields
  field: {
    gap: 6,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    height: 54,
  },
  inputRowAdmin: {
    borderColor: Colors.primary + '88',
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    includeFontPadding: false,
  },

  adminHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    marginTop: -4,
  },
  adminHintText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },

  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: -4,
  },
  forgotText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.md + 4,
    marginTop: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
    includeFontPadding: false,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: -4,
  },
  switchText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  switchLink: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
  },

  // Biometric shortcut
  biometricWrap: {
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  biometricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  biometricLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  biometricIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricIconActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  biometricTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
  biometricSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    includeFontPadding: false,
  },
  biometricBtn: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  biometricDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  biometricLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  biometricDividerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    includeFontPadding: false,
  },

  quickAdminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.md + 2,
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 8,
  },
  quickAdminBtnText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    color: Colors.bg,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  quickAdminBadge: {
    backgroundColor: Colors.bg + '33',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.bg + '55',
  },
  quickAdminBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.bg,
    letterSpacing: 1,
    includeFontPadding: false,
  },

  // BTNG3 banner
  btng3Banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 12,
  },
  btng3BannerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  btng3BannerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.heavy,
    color: Colors.bg,
    includeFontPadding: false,
  },
  btng3BannerAddr: {
    fontSize: 10,
    color: Colors.bg,
    opacity: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    includeFontPadding: false,
    marginTop: 2,
  },
  btng3BannerBadge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  btng3BannerBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.bg,
    letterSpacing: 1,
    includeFontPadding: false,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 6,
  },
  footerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  footerLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  footerLink: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
    textDecorationLine: 'underline',
  },
  footerLinkDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textMuted,
  },
  footerCopy: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
