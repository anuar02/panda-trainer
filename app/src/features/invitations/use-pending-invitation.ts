import { useEffect, useState } from 'react';
import { pendingInvitationToken } from './pending';

export function usePendingInvitation(userId: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const key = `${userId ?? ''}:${attempt}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    token: string | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void pendingInvitationToken.peek().then(
      (token) => {
        if (active) setLoaded({ key, token, failed: false });
      },
      () => {
        if (active) setLoaded({ key, token: null, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [key, userId]);
  const current = loaded?.key === key ? loaded : null;
  return {
    token: current?.token ?? null,
    failed: current?.failed ?? false,
    loading: Boolean(userId) && current === null,
    retry: () => setAttempt((value) => value + 1),
  };
}
