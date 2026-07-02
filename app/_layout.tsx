// ── PERMANENT TEXT SCALE PATCH ── must be first import ──────────────────────
// Locks ALL Text + TextInput components to our theme's responsive font sizes.
// Prevents OS Accessibility font-size from breaking the banking UI on any device.
import '@/utils/textScalePatch';
// ─────────────────────────────────────────────────────────────────────────────
import { AlertProvider } from '@/template';
import { useEffect, Component, type ReactNode } from 'react';
import { bootLiveData } from '@/services/liveDataBootstrap';
import { Stack } from 'expo-router';
import { Linking, View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { MaterialIcons } from '@expo/vector-icons';

// ─── Global Error Boundary ────────────────────────────────────────────────────
// Catches ALL JS-layer errors before they can propagate to the native layer
// and trigger non-std C++ exceptions / native crashes.

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

class BTNGErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.setState({ errorInfo: info.componentStack ?? '' });
    console.error('[BTNG ErrorBoundary] Caught error:', error);
    console.error('[BTNG ErrorBoundary] Component stack:', info.componentStack);
  }

  handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // expo-updates may not be available in dev — reset state as fallback
      this.setState({ hasError: false, error: null, errorInfo: '' });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaProvider>
          <ErrorFallbackScreen
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            onRestart={this.handleRestart}
          />
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

function ErrorFallbackScreen({
  error,
  errorInfo,
  onRestart,
}: {
  error: Error | null;
  errorInfo: string;
  onRestart: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[eb.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={eb.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={eb.iconWrap}>
          <MaterialIcons name="error-outline" size={52} color="#EF4444" />
        </View>

        {/* Title */}
        <Text style={eb.title}>Something went wrong</Text>
        <Text style={eb.subtitle}>
          BTNG Sovereign Engine caught a JavaScript error before it could crash the app.
        </Text>

        {/* Error message box */}
        <View style={eb.errorBox}>
          <View style={eb.errorBoxHeader}>
            <MaterialIcons name="bug-report" size={13} color="#EF4444" />
            <Text style={eb.errorBoxTitle}>Error Details</Text>
          </View>
          <Text style={eb.errorMessage} selectable>
            {error?.name ? `${error.name}: ` : ''}{error?.message ?? 'Unknown error'}
          </Text>
        </View>

        {/* Stack trace (collapsed) */}
        {errorInfo ? (
          <View style={eb.stackBox}>
            <View style={eb.errorBoxHeader}>
              <MaterialIcons name="list-alt" size={13} color="#F59E0B" />
              <Text style={[eb.errorBoxTitle, { color: '#F59E0B' }]}>Component Stack</Text>
            </View>
            <Text style={eb.stackText} selectable numberOfLines={10}>
              {errorInfo.trim()}
            </Text>
          </View>
        ) : null}

        {/* Restart button */}
        <TouchableOpacity
          style={eb.restartBtn}
          onPress={onRestart}
          activeOpacity={0.85}
        >
          <MaterialIcons name="refresh" size={20} color="#060608" />
          <Text style={eb.restartBtnText}>Restart App</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={eb.footer}>
          <MaterialIcons name="verified-user" size={12} color="#6B7280" />
          <Text style={eb.footerText}>
            BTNG Sovereign Platform · EKUYE DIGITAL GATEWAY TRUST LTD
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const eb = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#060608' },
  scroll:         { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 16 },
  iconWrap:       { width: 96, height: 96, borderRadius: 28, backgroundColor: '#EF444418', borderWidth: 1.5, borderColor: '#EF444455', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title:          { fontSize: 22, fontWeight: '700', color: '#F9FAFB', textAlign: 'center', includeFontPadding: false },
  subtitle:       { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  errorBox:       { width: '100%', backgroundColor: '#EF444410', borderRadius: 14, borderWidth: 1, borderColor: '#EF444433', overflow: 'hidden' },
  errorBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: '#EF444433', backgroundColor: '#EF444418' },
  errorBoxTitle:  { fontSize: 11, fontWeight: '700', color: '#EF4444', letterSpacing: 0.4, includeFontPadding: false },
  errorMessage:   { fontSize: 13, color: '#FCA5A5', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', padding: 12, lineHeight: 18, includeFontPadding: false },
  stackBox:       { width: '100%', backgroundColor: '#F59E0B08', borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B33', overflow: 'hidden' },
  stackText:      { fontSize: 10, color: '#9CA3AF', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', padding: 12, lineHeight: 15, includeFontPadding: false },
  restartBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#D4A017', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40, shadowColor: '#D4A017', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6, marginTop: 8 },
  restartBtnText: { fontSize: 17, fontWeight: '700', color: '#060608', includeFontPadding: false },
  footer:         { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  footerText:     { fontSize: 10, color: '#4B5563', includeFontPadding: false },
});
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { AuthProvider } from '@/contexts/AuthContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { WatchlistProvider } from '@/contexts/WatchlistContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { ExchangeRateProvider } from '@/contexts/ExchangeRateContext';
import { StatusBar } from 'expo-status-bar';

function AppShell() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, width: '100%', alignSelf: 'stretch' }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#060608', flex: 1, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="copy-trading" options={{ headerShown: false }} />
        <Stack.Screen name="practice" options={{ headerShown: false }} />
        <Stack.Screen name="kyc" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="referral" options={{ headerShown: false }} />
        <Stack.Screen name="deposit" options={{ headerShown: false }} />
        <Stack.Screen name="withdraw" options={{ headerShown: false }} />
        <Stack.Screen name="watchlist" options={{ headerShown: false }} />
        <Stack.Screen name="blog" options={{ headerShown: false }} />
        <Stack.Screen name="blog-article" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="two-factor" options={{ headerShown: false }} />
        <Stack.Screen name="fee-calculator" options={{ headerShown: false }} />
        <Stack.Screen name="transfer" options={{ headerShown: false }} />
        <Stack.Screen name="binary-trading" options={{ headerShown: false }} />
        <Stack.Screen name="currency-selector" options={{ headerShown: false }} />
        <Stack.Screen name="fx-converter" options={{ headerShown: false }} />
        <Stack.Screen name="btng-genesis" options={{ headerShown: false }} />
        <Stack.Screen name="cash-rail" options={{ headerShown: false }} />
        <Stack.Screen name="btng-bank" options={{ headerShown: false }} />
        <Stack.Screen name="btng-sdk" options={{ headerShown: false }} />
        <Stack.Screen name="btng-sovereign-docs" options={{ headerShown: false }} />
        <Stack.Screen name="cert-scanner" options={{ headerShown: false }} />
        <Stack.Screen name="contact" options={{ headerShown: false }} />
        <Stack.Screen name="btng-private-banker" options={{ headerShown: false }} />
        <Stack.Screen name="btng-governance" options={{ headerShown: false }} />
        <Stack.Screen name="btng-node" options={{ headerShown: false }} />
        <Stack.Screen name="btng-eternal-service" options={{ headerShown: false }} />
        <Stack.Screen name="nft-creator" options={{ headerShown: false }} />
        <Stack.Screen name="btng-global-panel" options={{ headerShown: false }} />
        <Stack.Screen name="africa-value-engine" options={{ headerShown: false }} />
        <Stack.Screen name="btng-terminal" options={{ headerShown: false }} />
        <Stack.Screen name="ai-creator" options={{ headerShown: false }} />
        <Stack.Screen name="btng-pay" options={{ headerShown: false }} />
        <Stack.Screen name="btng-card" options={{ headerShown: false }} />
        <Stack.Screen name="btng-proof-of-value" options={{ headerShown: false }} />
        <Stack.Screen name="btng-explorer" options={{ headerShown: false }} />
        <Stack.Screen name="africa-free-trade" options={{ headerShown: false }} />
        <Stack.Screen name="btng-deploy" options={{ headerShown: false }} />
        <Stack.Screen name="btng-api-manager" options={{ headerShown: false }} />
        <Stack.Screen name="btng-node-engine" options={{ headerShown: false }} />
        <Stack.Screen name="btng-contract-deploy" options={{ headerShown: false }} />
        <Stack.Screen name="btng-miner" options={{ headerShown: false }} />
        <Stack.Screen name="btng-node-generator" options={{ headerShown: false }} />
        <Stack.Screen name="btng-api-key-generator" options={{ headerShown: false }} />
        <Stack.Screen name="btng-api-extension" options={{ headerShown: false }} />
        <Stack.Screen name="btng-product-engine" options={{ headerShown: false }} />
        <Stack.Screen name="btng-minting-pipeline" options={{ headerShown: false }} />
        <Stack.Screen name="btng-verification-pipeline" options={{ headerShown: false }} />
        <Stack.Screen name="btng-pipeline-hub" options={{ headerShown: false }} />
        <Stack.Screen name="cert-qr-generator" options={{ headerShown: false }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="btng-sovereign-dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="btng3-wallet" options={{ headerShown: false }} />
        <Stack.Screen name="developer" options={{ headerShown: false }} />
        <Stack.Screen name="support-chat" options={{ headerShown: false }} />
        <Stack.Screen name="app-builder" options={{ headerShown: false }} />
        <Stack.Screen name="btng-sovereign-engine" options={{ headerShown: false }} />
        <Stack.Screen name="dev-master-admin" options={{ headerShown: false }} />
        <Stack.Screen name="btng-security-status" options={{ headerShown: false }} />
        <Stack.Screen name="btng-staking" options={{ headerShown: false }} />
        <Stack.Screen name="btng-swap" options={{ headerShown: false }} />
        <Stack.Screen name="ai-credit" options={{ headerShown: false }} />
        <Stack.Screen name="btng-vault-status" options={{ headerShown: false }} />
        <Stack.Screen name="btng-gold-certificate" options={{ headerShown: false }} />
        <Stack.Screen name="btng-value-generator" options={{ headerShown: false }} />
        <Stack.Screen name="btng-cert-verifier" options={{ headerShown: false }} />
        <Stack.Screen name="btng-engine-launcher" options={{ headerShown: false }} />
        <Stack.Screen name="btng-africa-multicurrency" options={{ headerShown: false }} />
        <Stack.Screen name="btng-africa-p2p" options={{ headerShown: false }} />
        <Stack.Screen name="btng-live-trade-api" options={{ headerShown: false }} />
        <Stack.Screen name="btng-afcfta-gateway" options={{ headerShown: false }} />
        <Stack.Screen name="btng-bank-wallet" options={{ headerShown: false }} />
        <Stack.Screen name="btng-control-panel" options={{ headerShown: false }} />
        <Stack.Screen name="btng-domain" options={{ headerShown: false }} />
        <Stack.Screen name="btng-zone-search" options={{ headerShown: false }} />
        <Stack.Screen name="cloudflare-dns" options={{ headerShown: false }} />
        <Stack.Screen name="cloudflare-dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="cloudflare-workers" options={{ headerShown: false }} />
        <Stack.Screen name="cloudflare-pages" options={{ headerShown: false }} />
        <Stack.Screen name="cloudflare-ssl" options={{ headerShown: false }} />
        <Stack.Screen name="cloudflare-waf" options={{ headerShown: false }} />
        <Stack.Screen name="cloudflare-firewall" options={{ headerShown: false }} />
        <Stack.Screen name="btng-genesis-domain" options={{ headerShown: false }} />
        <Stack.Screen name="btng-wallet-generate" options={{ headerShown: false }} />
        <Stack.Screen name="btng-mobile-banking" options={{ headerShown: false }} />
        <Stack.Screen name="btng-zone-engine" options={{ headerShown: false }} />
        <Stack.Screen name="btng-ports-status" options={{ headerShown: false }} />
        <Stack.Screen name="mtn-momo" options={{ headerShown: false }} />
        <Stack.Screen name="mtn-momo-webhooks" options={{ headerShown: false }} />
        <Stack.Screen name="btng-gold-factory" options={{ headerShown: false }} />
        <Stack.Screen name="btng-gold-factory-leaderboard" options={{ headerShown: false }} />
        <Stack.Screen name="btng-mining-rewards" options={{ headerShown: false }} />
        <Stack.Screen name="btng-server-terminal" options={{ headerShown: false }} />
        <Stack.Screen name="btng-server-stats" options={{ headerShown: false }} />
      </Stack>
      <OfflineBanner topOffset={insets.top} />
    </View>
  );
}

export default function RootLayout() {
  // Boot live data AFTER login screen has loaded — delay prevents JS thread
  // saturation on iOS/Android before the login screen can render.
  useEffect(() => {
    // Boot live data after 3s so login screen renders first
    const t = setTimeout(() => { bootLiveData().catch(console.warn); }, 3000);

    // Handle deep links from Stripe Checkout (btng://deposit/success or cancel)
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      if (url.includes('deposit/success')) {
        console.log('[stripe] deposit success deep link:', url);
      } else if (url.includes('deposit/cancel')) {
        console.log('[stripe] deposit cancelled deep link:', url);
      }
    };
    const sub = Linking.addEventListener('url', handleDeepLink);
    // Handle cold-start deep link
    Linking.getInitialURL().then(url => { if (url) handleDeepLink({ url }); }).catch(() => {});

    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, []);

  return (
    <BTNGErrorBoundary>
    <AlertProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <WalletProvider>
            <WatchlistProvider>
            <ExchangeRateProvider>
            <CurrencyProvider>
            <AppShell />
            </CurrencyProvider>
            </ExchangeRateProvider>
            </WatchlistProvider>
          </WalletProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </AlertProvider>
    </BTNGErrorBoundary>
  );
}
