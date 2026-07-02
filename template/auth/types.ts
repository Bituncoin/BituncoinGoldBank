// @ts-nocheck
import { User } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  created_at?: string;
  updated_at?: string;
}

// Unified base result format - only use error
interface BaseResult {
  error?: string;
  errorType?: 'timeout' | 'network' | 'business';
}

// Authentication operation result
export interface AuthResult extends BaseResult {
  user?: AuthUser | null;
}

// Logout operation result
export interface LogoutResult extends BaseResult {}

// Send OTP result
export interface SendOTPResult extends BaseResult {}

// Password registration result
export interface SignUpResult extends BaseResult {
  user?: AuthUser | null;
  needsEmailConfirmation?: boolean;
}

// OTP verification with optional password setting
export interface VerifyOTPOptions {
  password?: string;  // Optional password for OTP+Password hybrid registration
}

// Google OAuth result types
export interface GoogleSignInResult {
  error: string | null;
}

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  operationLoading: boolean;
  initialized: boolean;
  setOperationLoading: (loading: boolean) => void;
  sendOTP: (email: string) => Promise<SendOTPResult>;
  verifyOTPAndLogin: (email: string, otp: string, options?: VerifyOTPOptions) => Promise<AuthResult>;
  signUpWithPassword: (email: string, password: string, metadata?: Record<string, any>) => Promise<SignUpResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<GoogleSignInResult>;
  logout: () => Promise<LogoutResult>;
  refreshSession: () => Promise<void>;
}

export interface AuthConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  profileTableName?: string;
}

export interface SendOTPOptions {
  shouldCreateUser?: boolean;
  emailRedirectTo?: string;
}

export interface AuthError {
  message: string;
  code?: string;
}