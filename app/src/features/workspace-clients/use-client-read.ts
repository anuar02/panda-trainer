import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/features/auth/client';
import {
  createClientReadController,
  type ClientReadState,
} from './read-controller';

export function useClientRead<T>(
  key: string,
  userId: string,
  token: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const identity = useMemo(
    () => ({ key, load, userId, token }),
    [key, load, userId, token],
  );
  const [loaded, setLoaded] = useState<{
    identity: typeof identity;
    state: ClientReadState<T>;
  } | null>(null);
  const currentKey = useRef(identity);
  useLayoutEffect(() => {
    currentKey.current = identity;
  }, [identity]);
  const controller = useRef<ReturnType<
    typeof createClientReadController<T>
  > | null>(null);
  useEffect(() => {
    const instance = createClientReadController(
      load,
      (state) => setLoaded({ identity, state }),
      () => currentKey.current === identity,
    );
    controller.current = instance;
    let liveToken = token;
    const listener = getSupabaseClient()?.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED' && session?.user.id === userId)
          liveToken = session.access_token;
        else if (
          event === 'SIGNED_OUT' ||
          !session ||
          session.user.id !== userId ||
          session.access_token !== liveToken
        ) {
          instance.invalidate();
          instance.stop();
        }
      },
    );
    void instance.run();
    return () => {
      instance.stop();
      listener?.data.subscription.unsubscribe();
      if (controller.current === instance) controller.current = null;
    };
  }, [identity, userId, token, load]);
  const state = loaded?.identity === identity ? loaded.state : null;
  return {
    data: state?.status === 'ready' ? state.data : null,
    loading: !state || state.status === 'loading',
    failed: state?.status === 'failed',
    retry: () => {
      void controller.current?.run();
    },
  };
}
