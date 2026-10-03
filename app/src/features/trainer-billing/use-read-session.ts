import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/features/auth/client';
import { readSessionIdentity } from './read-auth';

export function useReadSession() {
  const epoch = useRef(0);
  const identity = useRef<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setVersion(epoch.current);
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;
    let events = 0;
    const update = (next: string | null, logout = false) => {
      if (!active) return;
      if (logout || next !== identity.current) {
        identity.current = next;
        epoch.current += 1;
        setVersion(epoch.current);
      }
    };
    const { data } = client.auth.onAuthStateChange((event, session) => {
      events += 1;
      update(readSessionIdentity(session), event === 'SIGNED_OUT');
    });
    const ticket = events;
    void client.auth.getSession().then(
      (response) => {
        if (events === ticket)
          update(
            response.error ? null : readSessionIdentity(response.data.session),
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
    (ticket: number) => epoch.current === ticket,
    [],
  );
  return { version, isCurrent };
}
