import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { getSupabaseClient } from './client';
import { authService } from './service';

type AuthState = {
  session: Session | null;
  loading: boolean;
  failed: boolean;
  configured: boolean;
  retry(): void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [client] = useState(getSupabaseClient);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(client !== null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const events = useRef(0);

  useEffect(() => {
    let mounted = true;
    if (!client) return;
    const subscription = authService.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      events.current += 1;
      setSession(next);
      setLoading(false);
      setFailed(false);
    });
    const version = events.current;
    void authService.getSession().then(
      (restored) => {
        if (!mounted || version !== events.current) return;
        setSession(restored);
        setLoading(false);
      },
      () => {
        if (!mounted || version !== events.current) return;
        setFailed(true);
        setLoading(false);
      },
    );
    const updateRefresh = (state: string) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    if (Platform.OS !== 'web') updateRefresh(AppState.currentState);
    const listener =
      Platform.OS !== 'web'
        ? AppState.addEventListener('change', updateRefresh)
        : null;
    return () => {
      mounted = false;
      subscription.unsubscribe();
      listener?.remove();
      if (Platform.OS !== 'web') client.auth.stopAutoRefresh();
    };
  }, [attempt, client]);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        failed,
        configured: client !== null,
        retry: () => {
          setLoading(client !== null);
          setFailed(false);
          setAttempt((value) => value + 1);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
