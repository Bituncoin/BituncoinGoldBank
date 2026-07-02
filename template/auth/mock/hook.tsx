// @ts-nocheck
import { AuthContextType, SendOTPResult, AuthResult, LogoutResult, SignUpResult } from '../types';
import { mockAuthService } from './service';
import { useMockAuthContext } from './context';
import { useState, useEffect } from 'react';

export function useMockAuth(): AuthContextType {
  const context = useMockAuthContext();
  
  const sendOTP = async (email: string): Promise<SendOTPResult> => {
    context.setOperationLoading(true);
    try {
      const result = await mockAuthService.sendOTP(email);
      return result;
    } catch (error) {
      console.warn('[SDK:useMockAuth] sendOTP exception:', error);
      return { error: 'Failed to send verification code' };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const verifyOTPAndLogin = async (email: string, otp: string, options?: { password?: string }): Promise<AuthResult> => {
    context.setOperationLoading(true);
    try {
      const result = await mockAuthService.verifyOTPAndLogin(email, otp, options);
      return result;
    } catch (error) {
      console.warn('[SDK:useMockAuth] verifyOTPAndLogin exception:', error);
      return { error: 'Login failed', user: null };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const signUpWithPassword = async (email: string, password: string, metadata?: Record<string, any>): Promise<SignUpResult> => {
    context.setOperationLoading(true);
    try {
      const result = await mockAuthService.signUpWithPassword(email, password, metadata || {});
      return result;
    } catch (error) {
      console.warn('[SDK:useMockAuth] signUpWithPassword exception:', error);
      return { error: 'Registration failed', user: null };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const signInWithPassword = async (email: string, password: string): Promise<AuthResult> => {
    context.setOperationLoading(true);
    try {
      const result = await mockAuthService.signInWithPassword(email, password);
      return result;
    } catch (error) {
      console.warn('[SDK:useMockAuth] signInWithPassword exception:', error);
      return { error: 'Login failed', user: null };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const signInWithGoogle = async (): Promise<AuthResult> => {
    context.setOperationLoading(true);
    try {
      // Mock Google Sign-In - just simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('[SDK:useMockAuth] Mock Google Sign-In - not implemented in mock mode');
      return { error: 'Google Sign-In not available in mock mode', user: null };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const logout = async (): Promise<LogoutResult> => {
    context.setOperationLoading(true);
    try {
      const result = await mockAuthService.logout();
      
      if (!result) {
        console.warn('[SDK:useMockAuth] Invalid logout result format:', result);
        return { error: 'Invalid logout response' };
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown logout error';
      console.warn('[SDK:useMockAuth] Logout hook exception:', errorMessage);
      return { error: errorMessage };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const refreshSession = async () => {
    try {
      await mockAuthService.refreshSession();
    } catch (error) {
      console.warn('[SDK:useMockAuth] Refresh session error:', error);
    }
  };

  return {
    user: context.user,
    loading: context.loading,
    operationLoading: context.operationLoading,
    initialized: context.initialized,
    setOperationLoading: context.setOperationLoading,
    sendOTP,
    verifyOTPAndLogin,
    signUpWithPassword,
    signInWithPassword,
    signInWithGoogle,
    logout,
    refreshSession,
  };
}

export function useMockAuthDebug() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  const refreshDebugInfo = async () => {
    const info = await mockAuthService.getMockDebugInfo();
    setDebugInfo(info);
  };
  
  const clearAllData = async () => {
    await mockAuthService.clearAllMockData();
    await refreshDebugInfo();
  };
  
  useEffect(() => {
    refreshDebugInfo();
  }, []);
  
  return {
    debugInfo,
    refreshDebugInfo,
    clearAllData,
  };
}
