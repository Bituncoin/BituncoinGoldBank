// @ts-nocheck
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useMockAuth } from './hook';

const DefaultMockLoadingScreen = () => (
  <View style={styles.defaultContainer}>
    <Text style={styles.defaultText}>Mock environment loading...</Text>
    <Text style={styles.hintText}>Development mode - using mock authentication</Text>
  </View>
);

interface MockAuthRouterProps {
  children: React.ReactNode;
  loginRoute?: string;
  loadingComponent?: React.ComponentType;
  excludeRoutes?: string[];
}

export function MockAuthRouter({
  children,
  loginRoute = '/login',
  loadingComponent: LoadingComponent = DefaultMockLoadingScreen,
  excludeRoutes = []
}: MockAuthRouterProps) {
  const { user, loading, initialized } = useMockAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!initialized || loading) {
      return;
    }

    const isLoginRoute = pathname === loginRoute;
    const isExcludedRoute = excludeRoutes.some(route =>
      pathname.startsWith(route)
    );

    const action = !user && !isLoginRoute && !isExcludedRoute ? 'redirect_to_login' :
                   user && isLoginRoute ? 'redirect_to_home' : 'no_action';

    if (action === 'redirect_to_login') {
      router.push(loginRoute);
    } else if (action === 'redirect_to_home') {
      router.replace('/');
    }
  }, [user, loading, initialized, pathname, loginRoute, excludeRoutes, router]);

  if (loading || !initialized) {
    return <LoadingComponent />;
  }

  const isLoginRoute = pathname === loginRoute;
  const isExcludedRoute = excludeRoutes.some(route =>
    pathname.startsWith(route)
  );

  if (isLoginRoute || isExcludedRoute || user) {
    return <>{children}</>;
  }

  return <LoadingComponent />;
}

const styles = StyleSheet.create({
  defaultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 24,
  },
  defaultText: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 8,
  },
  hintText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
