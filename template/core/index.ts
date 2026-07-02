// @ts-nocheck
// Simplified Core module exports
export * from './types';
export { configManager, createConfig } from './config';
export { 
  getSharedSupabaseClient, 
  getSharedSupabaseClient as getSupabaseClient,
  safeSupabaseOperation 
} from './client';