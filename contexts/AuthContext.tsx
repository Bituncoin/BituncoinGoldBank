import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSupabaseClient } from '@/template';
import { signIn, signOut, fetchProfile, BTNGUser } from '@/services/authService';

interface AuthContextType {
  user: BTNGUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<BTNGUser>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_EMAILS = ['admin@btng.gold', 'info@bituncoin.io'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<BTNGUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const client = getSupabaseClient();

    // Single source of truth: onAuthStateChange drives all user state.
    // We use the session passed directly — no secondary getSession() call
    // that could race and wipe the user back to null.
    const { data: { subscription } } = client.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (!session || event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
          return;
        }

        // Build user from session immediately so isAuthenticated flips to true
        // without waiting for the DB round-trip.
        const sessionUser: BTNGUser = {
          id: session.user.id,
          email: session.user.email ?? '',
          full_name: session.user.user_metadata?.full_name,
          username: session.user.user_metadata?.username,
          is_admin: ADMIN_EMAILS.includes((session.user.email ?? '').toLowerCase()),
        };
        if (mounted) {
          setUser(sessionUser);
          setLoading(false);
        }

        // Enrich with DB profile in the background (non-blocking)
        try {
          const profile = await fetchProfile(session.user.id);
          if (mounted && profile) {
            setUser(profile);
          }
        } catch (_) {
          // Profile fetch failed — keep the session user; login still works
        }
      }
    );

    // Safety fallback: stop spinner after 1.5s if the event never fires
    // Shorter timeout ensures login screen appears quickly on Android/iOS devices
    const fallbackTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 1500);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  // login() calls signIn (signInWithPassword) which triggers onAuthStateChange above.
  // We return only the error — navigation is driven by isAuthenticated in login.tsx.
  const login = async (identifier: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await signIn(identifier, password);
    return { error };
  };

  const logout = async () => {
    await signOut();
    setUser(null);
  };

  const updateUser = (updates: Partial<BTNGUser>) => {
    if (user) setUser({ ...user, ...updates });
  };

  const refreshUser = async () => {
    const client = getSupabaseClient();
    const { data } = await client.auth.getSession();
    if (data.session?.user) {
      const profile = await fetchProfile(data.session.user.id);
      if (profile) setUser(profile);
    }
  };

  const isAdmin =
    !!user?.email &&
    ADMIN_EMAILS.includes(user.email.toLowerCase()) &&
    user?.is_admin === true;

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isAdmin,
      loading,
      login,
      logout,
      updateUser,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
