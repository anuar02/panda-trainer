import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import { onboardingIdentity } from '@/features/onboarding/session';
import {
  notificationFailure,
  type NotificationScope,
} from '@/domain/notifications';
import type { Database } from '@/lib/database.types';

export function watchNotifications(
  scope: NotificationScope,
  reconcile: () => void,
  failed: () => void,
) {
  const main = getSupabaseClient();
  const identity = onboardingIdentity({
    user: { id: scope.userId },
    access_token: scope.token,
  });
  let live = true;
  let token = scope.token;
  const verified = new Set([token]);
  let channel: RealtimeChannel | null = null;
  let realtime: ReturnType<typeof createClient<Database>> | null = null;
  let auth: { unsubscribe(): void } | null = null;
  const current = () =>
    live && !scope.signal?.aborted && scope.isCurrent?.() !== false;
  const stop = () => {
    live = false;
    scope.signal?.removeEventListener('abort', stop);
    const subscription = auth;
    auth = null;
    subscription?.unsubscribe();
    const ownedChannel = channel;
    channel = null;
    const ownedClient = realtime;
    realtime = null;
    if (ownedChannel && ownedClient)
      void ownedClient.removeChannel(ownedChannel).catch(() => undefined);
    ownedClient?.realtime.disconnect();
  };
  const fail = () => {
    const publish = current();
    stop();
    if (publish) failed();
  };
  const guard = async () => {
    if (!main || !identity || !current()) throw notificationFailure();
    const result = await main.auth.getSession();
    const session = result.data.session;
    const next = onboardingIdentity(session);
    if (
      result.error ||
      !current() ||
      next?.userId !== identity.userId ||
      next?.sessionId !== identity.sessionId ||
      !session ||
      !verified.has(session.access_token)
    )
      throw notificationFailure();
    return token;
  };
  scope.signal?.addEventListener('abort', stop);
  void (async () => {
    if (
      !main ||
      !identity ||
      !current() ||
      (scope.role === 'client' && !scope.clientRecordId)
    )
      throw notificationFailure();
    auth = main.auth.onAuthStateChange((event, session) => {
      if (!current()) return;
      const next = onboardingIdentity(session);
      if (
        event === 'SIGNED_OUT' ||
        event === 'SIGNED_IN' ||
        next?.userId !== identity.userId ||
        next?.sessionId !== identity.sessionId
      ) {
        fail();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        token = session.access_token;
        verified.add(token);
        void guard()
          .then(() => {
            if (current() && realtime) return realtime.realtime.setAuth(token);
          })
          .then(() => {
            if (current()) reconcile();
          })
          .catch(fail);
      } else if (session && !verified.has(session.access_token)) fail();
    }).data.subscription;
    await guard();
    const user = await main.auth.getUser(token);
    await guard();
    if (user.error || user.data.user?.id !== scope.userId)
      throw notificationFailure();
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw notificationFailure();
    realtime = createClient<Database>(url, key, {
      accessToken: guard,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    await realtime.realtime.setAuth(token);
    if (!current()) {
      stop();
      return;
    }
    const invalidate = (payload: { new?: unknown }) => {
      const value: unknown = payload?.new;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const change = value as Record<string, unknown>;
        if (
          (typeof change.workspace_id === 'string' &&
            change.workspace_id !== scope.workspaceId) ||
          (scope.clientRecordId &&
            typeof change.client_record_id === 'string' &&
            change.client_record_id !== scope.clientRecordId)
        )
          return;
      }
      void guard()
        .then(() => {
          if (current()) reconcile();
        })
        .catch(fail);
    };
    channel = realtime
      .channel(
        `notifications:${scope.userId}:${scope.workspaceId}:${scope.clientRecordId ?? 'trainer'}:${Date.now()}`,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${scope.userId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${scope.userId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (!current()) return;
        if (status === 'SUBSCRIBED')
          void guard()
            .then(() => {
              if (current()) reconcile();
            })
            .catch(fail);
        else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        )
          failed();
      });
  })().catch(fail);
  return stop;
}
