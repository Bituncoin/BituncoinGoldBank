// BTNG Gold — Auth Service v3 (Custom Login Engine)
// Supports: email OR phone · device context capture · geo detection
import { getSupabaseClient } from '@/template';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export interface BTNGUser {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  country?: string;
  tier?: string;
  kyc_status?: string;
  is_admin?: boolean;
  referral_code?: string;
  referral_count?: number;
  referral_earned?: number;
  total_portfolio_value?: number;
  total_pnl?: number;
  total_pnl_pct?: number;
  avatar_url?: string;
  phone?: string;
  // aliases used across the UI
  name?: string;
}

export interface BTNGAuthPayload {
  email?: string;
  phone?: string;
  password: string;
  context: {
    device_id: string;
    ip_address: string;
    user_agent: string;
    geo_country: string;
  };
}

// ── Device Context Builder ────────────────────────────────────────────────────
export function buildDeviceContext(): BTNGAuthPayload['context'] {
  const deviceId =
    Constants.deviceName?.replace(/\s+/g, '-').toLowerCase() ||
    `device-${Platform.OS}-${Date.now()}`;

  const userAgent = `BTNGGoldCoin/${Constants.expoConfig?.version ?? '1.0'} ${Platform.OS}/${Platform.Version}`;

  return {
    device_id: deviceId,
    ip_address: '0.0.0.0',      // resolved server-side; placeholder for client
    user_agent: userAgent,
    geo_country: 'GH',           // default Ghana; can be updated from IP lookup
  };
}

// ── Sign In (email or phone) ───────────────────────────────────────────────────
export async function signIn(
  identifier: string,
  password: string
): Promise<{ user: BTNGUser | null; error: string | null }> {
  const client = getSupabaseClient();

  const isPhone = /^\+?[\d\s\-()]{7,}$/.test(identifier.trim()) && !identifier.includes('@');

  let authResult;
  if (isPhone) {
    // Phone + password login
    const normalized = identifier.replace(/\s+/g, '').startsWith('+')
      ? identifier.replace(/\s+/g, '')
      : '+' + identifier.replace(/\s+/g, '');
    authResult = await client.auth.signInWithPassword({ phone: normalized, password });
  } else {
    // Email + password login
    authResult = await client.auth.signInWithPassword({
      email: identifier.trim().toLowerCase(),
      password,
    });
  }

  const { data, error } = authResult;
  if (error) return { user: null, error: error.message };

  const profile = await fetchProfile(data.user.id);
  return { user: profile, error: null };
}

// ── Sign Up (email + password + OTP flow) ─────────────────────────────────────
export async function signUp(
  email: string,
  password: string,
  fullName: string
): Promise<{ user: BTNGUser | null; error: string | null; needsConfirmation?: boolean }> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, username: fullName.split(' ')[0] } },
  });
  if (error) return { user: null, error: error.message };
  if (!data.session) return { user: null, error: null, needsConfirmation: true };

  const profile = await fetchProfile(data.user!.id);
  return { user: profile, error: null };
}

// ── Sign Out ──────────────────────────────────────────────────────────────────
export async function signOut(): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signOut();
  return { error: error?.message ?? null };
}

// ── Get Session ───────────────────────────────────────────────────────────────
export async function getSession(): Promise<{ user: BTNGUser | null; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) return { user: null, error: error?.message ?? null };

  const profile = await fetchProfile(data.session.user.id);
  return { user: profile, error: null };
}

// ── Fetch Profile ─────────────────────────────────────────────────────────────
export async function fetchProfile(userId: string): Promise<BTNGUser | null> {
  const client = getSupabaseClient();
  const { data } = await client
    .from('user_profiles')
    .select(
      'id, email, username, full_name, country, tier, kyc_status, is_admin, referral_code, referral_count, referral_earned, total_portfolio_value, total_pnl, total_pnl_pct, avatar_url'
    )
    .eq('id', userId)
    .single();
  return data as BTNGUser | null;
}

// ── Update Profile ────────────────────────────────────────────────────────────
export async function updateProfile(
  userId: string,
  updates: Partial<BTNGUser>
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client.from('user_profiles').update(updates).eq('id', userId);
  return { error: error?.message ?? null };
}

// ── Admin: fetch all users ────────────────────────────────────────────────────
export async function fetchAllUsers(): Promise<{ data: BTNGUser[]; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('user_profiles')
    .select('id, email, username, full_name, country, tier, kyc_status, is_admin, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  return { data: (data as BTNGUser[]) ?? [], error: error?.message ?? null };
}
