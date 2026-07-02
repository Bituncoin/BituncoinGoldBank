// @ts-nocheck
// Supabase configuration
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

// Auth module configuration
export interface AuthConfig {
  enabled?: boolean;
  profileTableName?: string;
  autoCreateProfile?: boolean;
}

// Future module configuration interfaces
export interface PaymentsConfig {
  enabled?: boolean;
  stripePublishableKey?: string;
}

export interface StorageConfig {
  enabled?: boolean;
  defaultBucket?: string;
}

// Module configuration union type
export interface ModuleConfig {
  auth?: AuthConfig | false;
  payments?: PaymentsConfig | false;
  storage?: StorageConfig | false;
}

// Main configuration interface
export interface OnSpaceConfig extends ModuleConfig {
  supabase: SupabaseConfig;
}

// Runtime state
export interface SDKState {
  initialized: boolean;
  enabledModules: string[];
  config: OnSpaceConfig;
}

// Error type
export interface OnSpaceError {
  code: string;
  message: string;
  module?: string;
  details?: any;
}