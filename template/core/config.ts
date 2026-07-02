// @ts-nocheck
import { OnSpaceConfig } from './types';

class ConfigManager {
  private static instance: ConfigManager;
  private config: OnSpaceConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public initialize(config: OnSpaceConfig) {
    if (this.config) {
      console.warn('[Template:Config] Configuration already set, updating...');
    }
    
    this.config = { ...config };
  }

  public getConfig(): OnSpaceConfig {
    if (!this.config) {
      this.config = this.createDefaultConfig();
    }
    return { ...this.config };
  }

  private createDefaultConfig(): OnSpaceConfig {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    let authConfig;
    let supabaseConfig;

    if (!supabaseUrl || !supabaseAnonKey) {
          console.warn('[Template:Config] Supabase environment variables missing, automatically disabling auth module');
      authConfig = false;
    } else {
      authConfig = {
        enabled: true,
        profileTableName: 'user_profiles',
      };
      supabaseConfig = {
        url: supabaseUrl,
        anonKey: supabaseAnonKey,
      };
    }

    return {
      ...(supabaseConfig && { supabase: supabaseConfig }),
      auth: authConfig,
      payments: false,
      storage: false,
    };
  }

  public getModuleConfig<T = any>(moduleName: string): T | null {
    const config = this.getConfig();
    return (config as any)[moduleName] || null;
  }

  public isModuleEnabled(moduleName: string): boolean {
    const moduleConfig = this.getModuleConfig(moduleName);
    return moduleConfig !== false && moduleConfig !== null;
  }

  public getSupabaseConfig() {
    return this.getConfig().supabase;
  }

  public updateConfig(updates: Partial<OnSpaceConfig>) {
    const config = this.getConfig();
    this.config = { ...config, ...updates };
  }
}

export const configManager = ConfigManager.getInstance();

interface CreateConfigOptions {
  auth?: {
    enabled?: boolean;
    profileTableName?: string;
  } | false;
  supabase?: {
    url?: string;
    anonKey?: string;
  };
}

export const createConfig = (options: CreateConfigOptions = {}): OnSpaceConfig => {
  let authConfig;
  if (options.auth === false) {
    authConfig = false;
  } else if (options.auth === undefined) {
    authConfig = {
      enabled: true,
      profileTableName: 'user_profiles',
    };
  } else if (typeof options.auth === 'object') {
    authConfig = {
      enabled: true,
      profileTableName: 'user_profiles',
      ...options.auth,
    };
  }

  let supabaseConfig;
  if (authConfig !== false) {
    const supabaseUrl = options.supabase?.url || process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = options.supabase?.anonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('[Template:Config] Auth feature enabled but Supabase configuration missing, automatically disabling auth module');
      console.warn('[Template:Config] Please check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env file');
      authConfig = false;
    } else {
      supabaseConfig = {
        url: supabaseUrl,
        anonKey: supabaseAnonKey,
      };
    }
  }

  return {
    ...(supabaseConfig && { supabase: supabaseConfig }),
    auth: authConfig,
    payments: false,
    storage: false,
  };
};