import { detachPushBeforeLogout } from '@/features/push/logout';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from './client';
import type { AuthProvider, AuthService, AuthStateListener } from './types';

if (Platform.OS === 'web') WebBrowser.maybeCompleteAuthSession();

export type AuthServiceErrorCode =
  | 'configuration'
  | 'email'
  | 'code'
  | 'callback'
  | 'provider'
  | 'network'
  | 'storage';

export class AuthServiceError extends Error {
  constructor(
    readonly code: AuthServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AuthServiceError';
  }
}

const requireClient = (): SupabaseClient<Database> => {
  const client = getSupabaseClient();
  if (!client)
    throw new AuthServiceError(
      'configuration',
      'Authentication is not configured',
    );
  return client;
};

const authError = (
  error: AuthError,
  action: 'email' | 'code' | 'provider' | 'callback',
) => {
  const lowerCode = error.code?.toLowerCase() ?? '';
  if (lowerCode.includes('network') || lowerCode.includes('fetch'))
    return new AuthServiceError(
      'network',
      'The authentication service could not be reached',
      {
        cause: error,
      },
    );
  if (action === 'email')
    return new AuthServiceError('email', 'The email code could not be sent', {
      cause: error,
    });
  if (action === 'code')
    return new AuthServiceError(
      'code',
      'The email code is invalid or expired',
      { cause: error },
    );
  if (action === 'provider')
    return new AuthServiceError(
      'provider',
      'Provider sign-in could not be started',
      {
        cause: error,
      },
    );
  return new AuthServiceError(
    'callback',
    'The sign-in callback could not be completed',
    {
      cause: error,
    },
  );
};

const storageError = (error: unknown, code: AuthServiceErrorCode) => {
  if (error instanceof AuthServiceError) return error;
  if (error instanceof Error && /session|secure|storage/i.test(error.message))
    return new AuthServiceError(
      'storage',
      'The saved session could not be accessed',
      {
        cause: error,
      },
    );
  if (
    error instanceof Error &&
    /network|fetch|timeout|connection/i.test(error.message)
  )
    return new AuthServiceError(
      'network',
      'The authentication service could not be reached',
      { cause: error },
    );
  return new AuthServiceError(code, 'Authentication could not be completed', {
    cause: error,
  });
};

export const getAuthRedirectUri = () => {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined')
      throw new AuthServiceError(
        'configuration',
        'Browser sign-in is unavailable',
      );
    return `${window.location.origin}/auth/callback`;
  }
  return 'panda-trainer://auth/callback';
};

const validateCallback = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new AuthServiceError(
      'callback',
      'The sign-in callback URL is invalid',
      { cause: error },
    );
  }
  const valid =
    Platform.OS === 'web'
      ? typeof window !== 'undefined' &&
        url.origin === window.location.origin &&
        url.pathname === '/auth/callback'
      : url.protocol === 'panda-trainer:' &&
        url.hostname === 'auth' &&
        url.pathname === '/callback';
  if (!valid || url.username || url.password || url.hash)
    throw new AuthServiceError(
      'callback',
      'The sign-in callback URL is not trusted',
    );
  const allowed = new Set(['code', 'error']);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key)))
    throw new AuthServiceError(
      'callback',
      'The sign-in callback contains unsupported data',
    );
  if (
    url.searchParams.getAll('code').length > 1 ||
    url.searchParams.getAll('error').length > 1
  )
    throw new AuthServiceError('callback', 'The sign-in callback is ambiguous');
  return {
    code: url.searchParams.get('code'),
    error: url.searchParams.get('error'),
  };
};

const callbackResults = new Map<string, Promise<Session | null>>();
let oauthInProgress = false;

export const authService: AuthService = {
  getSession: async () => {
    const { data, error } = await requireClient().auth.getSession();
    if (error) throw storageError(error, 'storage');
    return data.session;
  },
  onAuthStateChange: (listener: AuthStateListener) => {
    const { data } = requireClient().auth.onAuthStateChange((event, session) =>
      listener(event, session),
    );
    return data.subscription;
  },
  sendEmailCode: async (email) => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail)
      throw new AuthServiceError('email', 'Enter an email address');
    try {
      const { error } = await requireClient().auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw authError(error, 'email');
    } catch (error) {
      throw storageError(error, 'email');
    }
  },
  verifyEmailCode: async (email, token) => {
    const normalizedEmail = email.trim();
    const normalizedToken = token.trim();
    if (!normalizedEmail || !normalizedToken)
      throw new AuthServiceError('code', 'Enter the email address and code');
    try {
      const { data, error } = await requireClient().auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: 'email',
      });
      if (error) throw authError(error, 'code');
      if (!data.session)
        throw new AuthServiceError(
          'code',
          'The email code did not create a session',
        );
      return data.session;
    } catch (error) {
      throw storageError(error, 'code');
    }
  },
  signInWithProvider: async (provider: AuthProvider) => {
    if (oauthInProgress)
      throw new AuthServiceError(
        'provider',
        'Another sign-in flow is already open',
      );
    oauthInProgress = true;
    try {
      const client = requireClient();
      const { data, error } = await client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAuthRedirectUri(),
          skipBrowserRedirect: true,
        },
      });
      if (error) throw authError(error, 'provider');
      if (!data.url)
        throw new AuthServiceError(
          'provider',
          'Provider sign-in returned no URL',
        );
      if (
        new URL(data.url).searchParams.get('code_challenge_method') !== 's256'
      )
        throw new AuthServiceError(
          'configuration',
          'Secure provider sign-in is unavailable',
        );
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        getAuthRedirectUri(),
      );
      if (result.type === 'cancel' || result.type === 'dismiss') return null;
      if (result.type !== 'success')
        throw new AuthServiceError(
          'provider',
          'Provider sign-in did not complete',
        );
      return await authService.completeOAuthCallback(result.url);
    } catch (error) {
      throw storageError(error, 'provider');
    } finally {
      oauthInProgress = false;
    }
  },
  completeOAuthCallback: async (value) => {
    const { code, error: callbackError } = validateCallback(value);
    if (callbackError)
      throw new AuthServiceError('callback', 'The provider rejected sign-in');
    if (!code) return null;
    const existing = callbackResults.get(code);
    if (existing) return existing;
    const operation = (async () => {
      try {
        const { data, error } =
          await requireClient().auth.exchangeCodeForSession(code);
        if (error) throw authError(error, 'callback');
        return data.session;
      } catch (caught) {
        throw storageError(caught, 'callback');
      }
    })();
    callbackResults.set(code, operation);
    if (callbackResults.size > 8) {
      const oldest = callbackResults.keys().next().value;
      if (oldest) callbackResults.delete(oldest);
    }
    try {
      return await operation;
    } catch (error) {
      callbackResults.delete(code);
      throw error;
    }
  },
  signOut: async () => {
    try {
      await detachPushBeforeLogout();
      const { error } = await requireClient().auth.signOut({ scope: 'local' });
      if (error) throw error;
      callbackResults.clear();
    } catch (error) {
      throw storageError(error, 'storage');
    }
  },
};

export async function signOutForAccountDeletion(expected: {
  accountId: string;
  token: string;
}): Promise<void> {
  const client = requireClient();
  const verify = async () => {
    const result = await client.auth.getSession();
    if (
      result.error ||
      (result.data.session &&
        (result.data.session.user.id !== expected.accountId ||
          result.data.session.access_token !== expected.token))
    )
      throw new AuthServiceError('storage', 'Deletion session changed');
    return result.data.session;
  };
  if (!(await verify())) return;
  await detachPushBeforeLogout();
  if (!(await verify())) return;
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw storageError(error, 'storage');
  if (!(await verify())) callbackResults.clear();
}
