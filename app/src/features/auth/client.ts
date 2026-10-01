import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Database } from '@/lib/database.types';
import { authStorage } from './storage';
import { initializeAuthCrypto } from './crypto';

let client: SupabaseClient<Database> | null | undefined;

const configuredUrl = () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.host)
      return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

export const getSupabaseClient = (): SupabaseClient<Database> | null => {
  if (client !== undefined) return client;
  const url = configuredUrl();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    client = null;
    return client;
  }
  initializeAuthCrypto();
  client = createClient<Database>(url, anonKey, {
    auth: {
      storage: authStorage,
      storageKey: `panda-trainer-auth-${new URL(url).host.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { headers: { 'X-Client-Info': `panda-trainer-${Platform.OS}` } },
  });
  return client;
};
