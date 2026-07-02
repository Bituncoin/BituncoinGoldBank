// @ts-nocheck
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from './hook';

const DefaultLoadingScreen = () => (
  <View style={styles.defaultContainer}>
    <Text style={styles.defaultText}>Loading...</Text>
  </View>
);

interface AuthRouterProps {
  children: React.ReactNode;
  loginRoute?: string;
  loadingComponent?: React.ComponentType;
  excludeRoutes?: string[];
}

export function AuthRouter({
  children,
  loginRoute = '/login',
  loadingComponent: LoadingComponent = DefaultLoadingScreen,
  excludeRoutes = []
}: AuthRouterProps) {
  const { user, loading, initialized } = useAuth();
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
  }, [user?.id, loading, initialized, pathname, loginRoute, excludeRoutes, router]);

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
  },
  defaultText: {
    fontSize: 18,
    color: '#6B7280',
  },
});