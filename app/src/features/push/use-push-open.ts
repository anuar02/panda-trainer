import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { pushOpenPayload } from './routing';
import { openPush, type PushDestination } from './open-service';
export function usePushOpen(notificationId: unknown, workspaceId: unknown) {
  const { session, loading } = useAuth();
  const [state, setState] = useState<{
    owner: object;
    destination: PushDestination | null;
    failed: boolean;
    done: boolean;
  } | null>(null);
  const owner = useMemo(
    () => ({ session, notificationId, workspaceId }),
    [session, notificationId, workspaceId],
  );
  useEffect(() => {
    if (!session || loading) return;
    let live = true;
    const abort = new AbortController();
    const payload = pushOpenPayload({
      version: 1,
      notificationId,
      workspaceId,
    });
    if (!payload) {
      return;
    }
    void openPush(
      {
        userId: session.user.id,
        token: session.access_token,
        signal: abort.signal,
        isCurrent: () => live,
      },
      payload,
    ).then(
      (destination) => {
        if (live) setState({ owner, destination, failed: false, done: true });
      },
      () => {
        if (live)
          setState({ owner, destination: null, failed: true, done: true });
      },
    );
    return () => {
      live = false;
      abort.abort();
    };
  }, [session, loading, owner, notificationId, workspaceId]);
  const current = state?.owner === owner ? state : null;
  return {
    signIn: !loading && !session,
    loading:
      loading ||
      (!!session &&
        !!pushOpenPayload({ version: 1, notificationId, workspaceId }) &&
        !current?.done),
    failed: !!current?.failed,
    destination: current?.destination ?? null,
  };
}
