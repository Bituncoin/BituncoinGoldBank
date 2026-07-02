// Offline Banner — shows when the app has no network connection
// Displays a persistent bar with reconnect action
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface OfflineBannerProps {
  /** Extra top offset (e.g. safe-area inset already applied by parent) */
  topOffset?: number;
  /** Called when user taps "Retry" — useful for re-fetching data */
  onRetry?: () => void;
}

// Lightweight reachability probe — checks the BTNG backend directly
// Uses the OnSpace Cloud backend so it works in preview/iframe environments
async function probeLive(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://mebznlvyycuuddfkmebz.backend.onspace.ai', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(tid);
    // Any HTTP response (including 4xx) means the network is reachable
    return res.status < 600;
  } catch {
    // Second probe — fallback to the backend REST endpoint
    try {
      const controller2 = new AbortController();
      const tid2 = setTimeout(() => controller2.abort(), 3000);
      const res2 = await fetch('https://mebznlvyycuuddfkmebz.backend.onspace.ai/rest/v1/', {
        method: 'HEAD',
        signal: controller2.signal,
        cache: 'no-store',
      });
      clearTimeout(tid2);
      return res2.status < 600;
    } catch {
      return false;
    }
  }
}

export function OfflineBanner({ topOffset = 0, onRetry }: OfflineBannerProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether NetInfo already confirmed online to avoid false-offline from iframes
  const confirmedOnline = useRef(false);

  const markOnline = useCallback(() => {
    confirmedOnline.current = true;
    setIsOffline(prev => {
      if (prev) {
        setWasOffline(true);
        setShowReconnected(true);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => {
          setShowReconnected(false);
          setWasOffline(false);
        }, 3000);
      }
      return false;
    });
  }, []);

  const markOffline = useCallback(() => {
    // Before marking offline, probe the network to confirm
    probeLive().then(live => {
      if (live) {
        markOnline();
      } else {
        confirmedOnline.current = false;
        setIsOffline(true);
      }
    });
  }, [markOnline]);

  // Retry handler — probes then dismisses banner if we're actually live
  const handleRetry = useCallback(() => {
    probeLive().then(live => {
      if (live) markOnline();
    });
    onRetry?.();
  }, [markOnline, onRetry]);

  useEffect(() => {
    // Initial probe on mount — suppresses false-offline in preview iframes
    probeLive().then(live => {
      if (live) {
        confirmedOnline.current = true;
      }
    });

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const netOffline = !(state.isConnected && state.isInternetReachable !== false);
      if (!netOffline) {
        markOnline();
      } else {
        // Only show offline if we haven't confirmed online via probe
        if (!confirmedOnline.current) {
          markOffline();
        } else {
          // Re-probe to verify — NetInfo can be wrong in web/preview
          probeLive().then(live => {
            if (!live) {
              confirmedOnline.current = false;
              setIsOffline(true);
            }
          });
        }
      }
    });

    // Periodic re-probe every 30s to stay accurate
    const probeInterval = setInterval(() => {
      probeLive().then(live => {
        if (live) markOnline();
        else if (!confirmedOnline.current) setIsOffline(true);
      });
    }, 30_000);

    return () => {
      unsubscribe();
      clearInterval(probeInterval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [markOnline, markOffline]);

  const shouldShow = isOffline || showReconnected;
  const isReconnected = showReconnected && !isOffline;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : -80,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: topOffset, transform: [{ translateY: slideAnim }] },
        isReconnected && styles.containerOnline,
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.inner, isReconnected ? styles.innerOnline : styles.innerOffline]}>
        <View style={[styles.iconWrap, { backgroundColor: isReconnected ? Colors.success + '22' : Colors.error + '22' }]}>
          <MaterialIcons
            name={isReconnected ? 'wifi' : 'wifi-off'}
            size={14}
            color={isReconnected ? Colors.success : Colors.error}
          />
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: isReconnected ? Colors.success : Colors.error }]}>
            {isReconnected ? 'Back Online' : 'No Internet Connection'}
          </Text>
          <Text style={styles.sub}>
            {isReconnected
              ? 'Connection restored — data is syncing'
              : 'Using cached data · Some features may be limited'}
          </Text>
        </View>
        {!isReconnected && (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleRetry}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="autorenew" size={13} color={Colors.error} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
        {isReconnected && (
          <MaterialIcons name="check-circle" size={18} color={Colors.success} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  containerOnline: {},
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
  innerOffline: {
    backgroundColor: Colors.errorBg,
    borderColor: Colors.error + '55',
  },
  innerOnline: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.success + '55',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
  },
  sub: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.error + '18',
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.error + '44',
    flexShrink: 0,
  },
  retryText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.error,
    includeFontPadding: false,
  },
});
