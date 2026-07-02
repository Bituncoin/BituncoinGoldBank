// @ts-nocheck
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser, SendOTPOptions, SignUpResult } from '../types';

const MOCK_STORAGE_KEYS = {
  USERS: '@onspace_mock_users',
  CURRENT_SESSION: '@onspace_mock_session',
} as const;

interface MockUser {
  id: string;
  email: string;
  username: string;
  created_at: string;
  updated_at: string;
}

interface MockSession {
  userId: string;
  token: string;
  expiresAt: number;
}

export class MockAuthService {
  
  async sendOTP(email: string, options: SendOTPOptions = {}) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return {};
  }

  async signUpWithPassword(email: string, password: string, metadata: Record<string, any> = {}) {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    let user = await this.findUserByEmail(email);
    if (user) {
      return { 
        error: 'User already registered',
        errorType: 'business' as const
      };
    }
    
    user = await this.createUser(email, metadata.username);
    await this.createSession(user.id);
    
    return { user };
  }

  async signInWithPassword(email: string, password: string) {
    await new Promise(resolve => setTimeout(resolve, 600));
    
    let user = await this.findUserByEmail(email);
    if (!user) {
      return { 
        error: 'No account found with this email',
        user: null,
        errorType: 'business' as const
      };
    }
    
    await this.createSession(user.id);
    return { user };
  }

  async verifyOTPAndLogin(email: string, otp: string, options?: { password?: string; metadata?: Record<string, any> }) {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    let user = await this.findUserByEmail(email);
    if (!user) {
      const username = options?.metadata?.username || email.split('@')[0];
      user = await this.createUser(email, username);
    }
    
    if (options?.password) {
      console.log(`[SDK:MockAuth] OTP+Password registration for ${email}`);
    }
    
    await this.createSession(user.id);
    return { user };
  }

  async logout() {
    await new Promise(resolve => setTimeout(resolve, 300));
    await AsyncStorage.removeItem(MOCK_STORAGE_KEYS.CURRENT_SESSION);
    return {};
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const sessionData = await AsyncStorage.getItem(MOCK_STORAGE_KEYS.CURRENT_SESSION);
    if (!sessionData) return null;
    
    const session: MockSession = JSON.parse(sessionData);
    
    if (session.expiresAt < Date.now()) {
      await AsyncStorage.removeItem(MOCK_STORAGE_KEYS.CURRENT_SESSION);
      return null;
    }
    
    return await this.findUserById(session.userId);
  }

  async refreshSession() {
    const sessionData = await AsyncStorage.getItem(MOCK_STORAGE_KEYS.CURRENT_SESSION);
    if (!sessionData) return;
    
    const session: MockSession = JSON.parse(sessionData);
    session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await AsyncStorage.setItem(MOCK_STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(session));
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    let intervalId: NodeJS.Timeout;
    let lastUser: AuthUser | null = null;
    
    const checkAuthState = async () => {
      try {
        const currentUser = await this.getCurrentUser();
        const userChanged = JSON.stringify(currentUser) !== JSON.stringify(lastUser);
        
        if (userChanged) {
          lastUser = currentUser;
          callback(currentUser);
        }
      } catch (error) {
        console.warn('[SDK:MockAuthService] Error in auth state check:', error);
      }
    };
    
    checkAuthState();
    intervalId = setInterval(checkAuthState, 2000);
    
    return {
      unsubscribe: () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      }
    };
  }

  private async getUsers(): Promise<MockUser[]> {
    const usersData = await AsyncStorage.getItem(MOCK_STORAGE_KEYS.USERS);
    return usersData ? JSON.parse(usersData) : [];
  }

  private async saveUsers(users: MockUser[]): Promise<void> {
    await AsyncStorage.setItem(MOCK_STORAGE_KEYS.USERS, JSON.stringify(users));
  }

  private async findUserByEmail(email: string): Promise<MockUser | null> {
    const users = await this.getUsers();
    return users.find(user => user.email === email) || null;
  }

  private async findUserById(id: string): Promise<AuthUser | null> {
    const users = await this.getUsers();
    const user = users.find(user => user.id === id);
    return user ? {
      id: user.id,
      email: user.email,
      username: user.username,
      created_at: user.created_at,
      updated_at: user.updated_at,
    } : null;
  }

  private async createUser(email: string, username?: string): Promise<AuthUser> {
    const users = await this.getUsers();
    
    const generateTestUUID = () => {
      const userCount = users.length;
      const incrementalId = userCount.toString().padStart(12, '0');
      return `00000000-0000-0000-0000-${incrementalId}`;
    };
    
    const newUser: MockUser = {
      id: generateTestUUID(),
      email,
      username: username || email.split('@')[0],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    users.push(newUser);
    await this.saveUsers(users);
    
    return {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
    };
  }

  private async createSession(userId: string): Promise<void> {
    const session: MockSession = {
      userId,
      token: `mock_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    
    await AsyncStorage.setItem(MOCK_STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(session));
  }

  async clearAllMockData(): Promise<void> {
    await Promise.all([
      AsyncStorage.removeItem(MOCK_STORAGE_KEYS.USERS),
      AsyncStorage.removeItem(MOCK_STORAGE_KEYS.CURRENT_SESSION),
    ]);
  }

  async getMockDebugInfo(): Promise<{
    users: MockUser[];
    currentSession: MockSession | null;
  }> {
    const users = await this.getUsers();
    const sessionData = await AsyncStorage.getItem(MOCK_STORAGE_KEYS.CURRENT_SESSION);
    const currentSession = sessionData ? JSON.parse(sessionData) : null;
    
    return { users, currentSession };
  }
}

export const mockAuthService = new MockAuthService();
