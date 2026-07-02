import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/theme';

export default function Index() {
  const { isAuthenticated, loading } = useAuth();
  // Show minimal spinner only briefly — on iOS/Android redirect immediately
  // once auth resolves so the login screen is not blocked.
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }
  if (isAuthenticated) return <Redirect href="/(tabs)" />;
  // Go straight to login — skip onboarding so returning users land on login instantly
  return <Redirect href="/login" />;
}
