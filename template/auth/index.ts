// @ts-nocheck
export * from './types';

// Supabase backend authentication system
export { useAuth } from './supabase/hook';
export { authService } from './supabase/service';
export { AuthRouter } from './supabase/router';
export { AuthProvider } from './supabase/context';

// Mock backend authentication system - for prototype development and when backend is unavailable
export { useMockAuth, useMockAuthDebug } from './mock/hook';
export { mockAuthService } from './mock/service';  
export { MockAuthRouter } from './mock/router';
export { MockAuthProvider } from './mock/context';