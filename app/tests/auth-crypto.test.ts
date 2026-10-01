import { webcrypto } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';

const mockWebCrypto = webcrypto;
const mockSecureStorage = new Map<string, string>();

jest.mock('react-native-quick-crypto', () => ({
  install: jest.fn(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: mockWebCrypto,
      writable: true,
    });
  }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(
    async (key: string) => mockSecureStorage.get(key) ?? null,
  ),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStorage.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStorage.delete(key);
  }),
}));

describe('native auth crypto initialization', () => {
  it('uses S256 PKCE after installing crypto and persists the matching verifier', async () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(
      globalThis,
      'crypto',
    );
    const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    mockSecureStorage.clear();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://trainer-test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    const clientBox: [SupabaseClient<Database> | null] = [null];
    let stopAutoRefresh = async () => {};

    try {
      jest.isolateModules(() => {
        const authClient = jest.requireActual(
          '../src/features/auth/client',
        ) as {
          getSupabaseClient: () => SupabaseClient<Database> | null;
        };
        clientBox[0] = authClient.getSupabaseClient();
      });
      const client = clientBox[0];
      expect(client).not.toBeNull();
      if (!client) throw new Error('Supabase client was not configured');
      stopAutoRefresh = () => client.auth.stopAutoRefresh();

      const result = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'panda-trainer://auth/callback',
          skipBrowserRedirect: true,
        },
      });

      expect(result.error).toBeNull();
      const authorizationUrlValue = result.data.url;
      expect(authorizationUrlValue).not.toBeNull();
      if (!authorizationUrlValue)
        throw new Error('OAuth authorization URL was not returned');
      const authorizationUrl = new URL(authorizationUrlValue);
      expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe(
        's256',
      );
      const manifestEntry = [...mockSecureStorage.entries()].find(([key]) =>
        key.endsWith('-code-verifier__manifest'),
      );

      expect(manifestEntry).toBeDefined();
      const [manifestKey, manifestValue] = manifestEntry!;
      const manifest = JSON.parse(manifestValue) as {
        generation: string;
        chunks: number;
      };
      const verifierKey = manifestKey.slice(0, -'__manifest'.length);
      const serializedVerifier = Array.from(
        { length: manifest.chunks },
        (_, index) =>
          mockSecureStorage.get(
            `${verifierKey}__g_${manifest.generation}__c_${index}`,
          ),
      ).join('');
      const verifier = JSON.parse(serializedVerifier) as string;
      const digest = await mockWebCrypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(verifier),
      );
      const expectedChallenge = btoa(
        String.fromCharCode(...new Uint8Array(digest)),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      expect(authorizationUrl.searchParams.get('code_challenge')).toBe(
        expectedChallenge,
      );
    } finally {
      await stopAutoRefresh();
      if (originalUrl === undefined) {
        delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      } else {
        process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
      }
      if (originalAnonKey === undefined) {
        delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
      }
      if (originalCrypto) {
        Object.defineProperty(globalThis, 'crypto', originalCrypto);
      } else {
        Reflect.deleteProperty(globalThis, 'crypto');
      }
    }
  });
});
