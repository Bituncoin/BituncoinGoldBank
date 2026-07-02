// Push Notifications Hook — BTNG Sovereign Platform
// Handles permission, token registration, and incoming notification routing
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getSupabaseClient } from '@/template';

// Configure default notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type NotificationCategory =
  | 'trade_filled'
  | 'deposit_confirmed'
  | 'withdrawal_approved'
  | 'loan_approved'
  | 'loan_due'
  | 'credit_score_updated'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'price_alert'
  | 'p2p_order'
  | 'liquidation_warning'
  | 'sovereign_update';

interface PushPayload {
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, any>;
}

interface UsePushNotificationsResult {
  /** Expo push token — undefined until permission granted */
  expoPushToken: string | undefined;
  /** Whether notification permission has been granted */
  hasPermission: boolean;
  /** Whether the hook is still requesting permission */
  requesting: boolean;
  /** Last notification received while app was foregrounded */
  lastNotification: Notifications.Notification | null;
  /** Last notification response (user tapped a notification) */
  lastResponse: Notifications.NotificationResponse | null;
  /** Request permission explicitly (called automatically on mount) */
  requestPermission: () => Promise<boolean>;
  /** Send a local notification immediately (for testing / system events) */
  sendLocalNotification: (payload: PushPayload) => Promise<void>;
  /** Schedule a notification for a future time */
  scheduleNotification: (payload: PushPayload, triggerSeconds: number) => Promise<void>;
  /** Clear all pending scheduled notifications */
  clearScheduled: () => Promise<void>;
  /** Badge count */
  badgeCount: number;
  /** Clear badge count */
  clearBadge: () => Promise<void>;
}

export function usePushNotifications(userId?: string): UsePushNotificationsResult {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
  const [hasPermission, setHasPermission] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [lastNotification, setLastNotification] = useState<Notifications.Notification | null>(null);
  const [lastResponse, setLastResponse] = useState<Notifications.NotificationResponse | null>(null);
  const [badgeCount, setBadgeCount] = useState(0);

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!Device.isDevice) {
      // Simulator — skip real permission but allow local notifications
      setHasPermission(true);
      return true;
    }

    setRequesting(true);
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        setHasPermission(false);
        setRequesting(false);
        return false;
      }

      setHasPermission(true);

      // Get push token
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('btng-default', {
          name: 'BTNG Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#D4A017',
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('btng-alerts', {
          name: 'BTNG Price Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 150, 150, 150],
          lightColor: '#EF4444',
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('btng-transactions', {
          name: 'BTNG Transactions',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 300, 100, 300],
          lightColor: '#22C55E',
          sound: 'default',
        });
      }

      try {
        const tokenResponse = await Notifications.getExpoPushTokenAsync();
        const token = tokenResponse.data;
        setExpoPushToken(token);

        // Persist token to user profile in Supabase (if user is signed in)
        if (userId && token) {
          const sb = getSupabaseClient();
          await sb
            .from('user_profiles')
            .update({ push_token: token } as any)
            .eq('id', userId);
        }
      } catch {
        // In dev/simulator, token generation may fail — that's OK
      }

      setRequesting(false);
      return true;
    } catch {
      setHasPermission(false);
      setRequesting(false);
      return false;
    }
  }, [userId]);

  // Request permission on mount
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // Listen for incoming notifications
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setLastNotification(notification);
      setBadgeCount(prev => prev + 1);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      setLastResponse(response);
      // Auto-clear badge when user taps
      Notifications.setBadgeCountAsync(0).catch(() => {});
      setBadgeCount(0);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const sendLocalNotification = useCallback(async (payload: PushPayload) => {
    const channelId = (() => {
      if (['trade_filled', 'deposit_confirmed', 'withdrawal_approved'].includes(payload.category)) return 'btng-transactions';
      if (['price_alert', 'liquidation_warning'].includes(payload.category)) return 'btng-alerts';
      return 'btng-default';
    })();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: true,
        badge: badgeCount + 1,
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null, // immediate
    });
    setBadgeCount(prev => prev + 1);
  }, [badgeCount]);

  const scheduleNotification = useCallback(async (payload: PushPayload, triggerSeconds: number) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: true,
      },
      trigger: {
        seconds: triggerSeconds,
        repeats: false,
      } as any,
    });
  }, []);

  const clearScheduled = useCallback(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }, []);

  const clearBadge = useCallback(async () => {
    await Notifications.setBadgeCountAsync(0).catch(() => {});
    setBadgeCount(0);
  }, []);

  return {
    expoPushToken,
    hasPermission,
    requesting,
    lastNotification,
    lastResponse,
    requestPermission,
    sendLocalNotification,
    scheduleNotification,
    clearScheduled,
    badgeCount,
    clearBadge,
  };
}

// ── Notification Helpers ──────────────────────────────────────────────────────
// Ready-to-use notification builders for common BTNG events

export const BTNGNotifications = {
  tradeFilled: (coin: string, amount: number, side: 'buy' | 'sell'): PushPayload => ({
    category: 'trade_filled',
    title: `${side === 'buy' ? '✅ Buy' : '💰 Sell'} Order Filled`,
    body: `${amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${coin} ${side === 'buy' ? 'purchased' : 'sold'} at market price`,
    data: { coin, amount, side },
  }),

  depositConfirmed: (coin: string, amount: number): PushPayload => ({
    category: 'deposit_confirmed',
    title: '⬇️ Deposit Confirmed',
    body: `${amount.toLocaleString()} ${coin} has been credited to your wallet`,
    data: { coin, amount },
  }),

  withdrawalApproved: (coin: string, amount: number): PushPayload => ({
    category: 'withdrawal_approved',
    title: '⬆️ Withdrawal Approved',
    body: `${amount.toLocaleString()} ${coin} withdrawal has been processed`,
    data: { coin, amount },
  }),

  priceAlert: (coin: string, price: number, direction: 'above' | 'below', target: number): PushPayload => ({
    category: 'price_alert',
    title: `🔔 ${coin} Price Alert`,
    body: `${coin} is now ${direction === 'above' ? 'above' : 'below'} $${target.toLocaleString()} — current: $${price.toLocaleString()}`,
    data: { coin, price, direction, target },
  }),

  loanApproved: (amount: number, apr: number): PushPayload => ({
    category: 'loan_approved',
    title: '🏦 Loan Application Approved',
    body: `Your sovereign loan of $${amount.toLocaleString()} at ${apr}% APR has been approved`,
    data: { amount, apr },
  }),

  loanDue: (amount: number, daysLeft: number): PushPayload => ({
    category: 'loan_due',
    title: '⚠️ Loan Due Soon',
    body: `Your loan of $${amount.toLocaleString()} is due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
    data: { amount, daysLeft },
  }),

  creditScoreUpdated: (score: number, tier: string): PushPayload => ({
    category: 'credit_score_updated',
    title: '📊 Credit Score Updated',
    body: `Your sovereign credit score is now ${score} · ${tier} tier`,
    data: { score, tier },
  }),

  kycApproved: (): PushPayload => ({
    category: 'kyc_approved',
    title: '✅ KYC Verified',
    body: 'Your identity has been verified. You now have full platform access.',
    data: {},
  }),

  sovereignUpdate: (message: string): PushPayload => ({
    category: 'sovereign_update',
    title: '🌍 BTNG Sovereign Update',
    body: message,
    data: {},
  }),
};
