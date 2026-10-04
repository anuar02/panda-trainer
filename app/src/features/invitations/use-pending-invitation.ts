import { useEffect, useState } from 'react';
import { pendingInvitationToken } from './pending';
import { useInvitationLifecycle } from './use-invitation-lifecycle';
import { createInvitationFence } from './session';

export function usePendingInvitation(userId: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const lifecycle = useInvitationLifecycle('pending');
  const key = `${lifecycle.key}:${userId ?? ''}:${attempt}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    token: string | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const scope = lifecycle.scope;
    if (!scope || scope.userId !== userId) return;
    const load = async () => {
      const fence = createInvitationFence(scope);
      try {
        await fence.guard();
        const token = await pendingInvitationToken.peek(
          fence.guard,
          lifecycle.isCurrent,
        );
        await fence.guard();
        return token;
      } finally {
        fence.dispose();
      }
    };
    void load().then(
      (token) => {
        if (active && lifecycle.isCurrent())
          setLoaded({ key, token, failed: false });
      },
      () => {
        if (active && lifecycle.isCurrent())
          setLoaded({ key, token: null, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [key, userId, lifecycle]);
  const current = lifecycle.scope && loaded?.key === key ? loaded : null;
  return {
    token: current?.token ?? null,
    failed: current?.failed ?? false,
    loading: Boolean(userId) && current === null,
    retry: () => setAttempt((value) => value + 1),
  };
}
