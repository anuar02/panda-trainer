import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { getSupabaseClient } from '@/features/auth/client';
import { invitationIdentity, type InvitationScope } from './session';

type Lifetime = {
  key: string;
  abort: AbortController;
  token: string | undefined;
  userId: string | undefined;
  sessionId: string | undefined;
};

export function useInvitationLifecycle(resource: string) {
  const auth = useAuth();
  const identity = invitationIdentity(auth.session);
  const [epoch, setEpoch] = useState(0);
  const key = `${identity?.userId ?? ''}:${identity?.sessionId ?? ''}:${resource}:${epoch}:${auth.loading}:${auth.failed}`;
  const session = useRef(auth.session);
  const lifetime = useRef<Lifetime | null>(null);
  const [published, setPublished] = useState<Lifetime | null>(null);
  useLayoutEffect(() => {
    session.current = auth.session;
  }, [auth.session]);
  useLayoutEffect(() => {
    const captured = session.current;
    const expected = invitationIdentity(captured);
    const instance: Lifetime = {
      key,
      abort: new AbortController(),
      token: captured?.access_token,
      userId: expected?.userId,
      sessionId: expected?.sessionId,
    };
    lifetime.current = instance;
    setPublished({ ...instance });
    const subscription = getSupabaseClient()?.auth.onAuthStateChange(
      (event, next) => {
        const nextIdentity = invitationIdentity(next);
        const same = expected
          ? nextIdentity?.userId === expected.userId &&
            nextIdentity.sessionId === expected.sessionId
          : next === null;
        if (event === 'TOKEN_REFRESHED' && same) {
          instance.token = next?.access_token;
          if (lifetime.current === instance) setPublished({ ...instance });
        } else if (
          event === 'INITIAL_SESSION' &&
          same &&
          next?.access_token === instance.token
        )
          return;
        else if (
          event === 'SIGNED_IN' ||
          event === 'SIGNED_OUT' ||
          !same ||
          next?.access_token !== instance.token
        ) {
          instance.abort.abort();
          if (lifetime.current === instance) setEpoch((value) => value + 1);
        }
      },
    ).data.subscription;
    return () => {
      instance.abort.abort();
      subscription?.unsubscribe();
      if (lifetime.current === instance) lifetime.current = null;
    };
  }, [key]);
  const isCurrent = useCallback(() => {
    const instance = lifetime.current;
    return Boolean(
      instance &&
      instance.key === key &&
      !instance.abort.signal.aborted &&
      instance.token === session.current?.access_token,
    );
  }, [key]);
  const current =
    published?.key === key && published.token === auth.session?.access_token
      ? published
      : null;
  const userId = identity?.userId;
  const token = auth.session?.access_token;
  const signal = current?.abort.signal;
  const scope = useMemo<InvitationScope | null>(
    () =>
      userId && token && signal ? { userId, token, signal, isCurrent } : null,
    [userId, token, signal, isCurrent],
  );
  return useMemo(() => ({ key, scope, isCurrent }), [key, scope, isCurrent]);
}
