import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export type AuthProvider = 'apple' | 'google';

export type AuthStateListener = (
  event: AuthChangeEvent,
  session: Session | null,
) => void;

export type AuthSubscription = {
  unsubscribe: () => void;
};

export type AuthService = {
  getSession: () => Promise<Session | null>;
  onAuthStateChange: (listener: AuthStateListener) => AuthSubscription;
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, token: string) => Promise<Session>;
  signInWithProvider: (provider: AuthProvider) => Promise<Session | null>;
  completeOAuthCallback: (url: string) => Promise<Session | null>;
  signOut: () => Promise<void>;
};
