import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/features/auth/client';
import { financialMutationSessionIdentity } from './mutation-auth';

export function useMutationSession() {
  const epoch = useRef(0);
  const [state, setState] = useState({ version: 0, ready: false });
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setState({ version: epoch.current, ready: true });
      return;
    }
    let active = true;
    let events = 0;
    let identity: string | null = null;
    const update = (next: string | null, force = false) => {
      if (!active) return;
      if (force || next !== identity) epoch.current += 1;
      identity = next;
      setState({ version: epoch.current, ready: true });
    };
    const { data } = client.auth.onAuthStateChange((event, session) => {
      events += 1;
      const next = financialMutationSessionIdentity(session);
      update(next, event === 'SIGNED_OUT' || next === null);
    });
    const ticket = events;
    void client.auth.getSession().then(
      (response) => {
        if (events === ticket)
          update(
            response.error
              ? null
              : financialMutationSessionIdentity(response.data.session),
          );
      },
      () => {
        if (events === ticket) update(null, true);
      },
    );
    return () => {
      active = false;
      epoch.current += 1;
      data.subscription.unsubscribe();
    };
  }, []);
  const isCurrent = useCallback(
    (version: number) => epoch.current === version,
    [],
  );
  return { ...state, isCurrent };
}
