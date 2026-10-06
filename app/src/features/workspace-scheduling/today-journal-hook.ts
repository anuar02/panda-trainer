import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useOptionalWorkoutPreload } from '@/features/workout-preload/provider';
import { loadTodayFinishedBookingIds } from './today-journal-service';

const emptyIds: ReadonlySet<string> = new Set();

export function useTodayFinishedBookingIds(bookingIds: readonly string[]) {
  const preload = useOptionalWorkoutPreload();
  const session = preload?.session;
  const idsKey = JSON.stringify([...new Set(bookingIds)].sort());
  const scopeKey = JSON.stringify([
    session?.accountId,
    session?.workspaceId,
    session?.sessionId,
    idsKey,
  ]);
  const current = useRef({ scopeKey, preload });
  useLayoutEffect(() => {
    current.current = { scopeKey, preload };
  });
  const [loaded, setLoaded] = useState<{
    key: string;
    ids: ReadonlySet<string>;
    failed: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!session || bookingIds.length === 0) return;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAttempt((value) => value + 1);
    });
    const interval = setInterval(
      () => setAttempt((value) => value + 1),
      60_000,
    );
    return () => {
      listener.remove();
      clearInterval(interval);
    };
  }, [scopeKey, session, bookingIds.length]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const isCurrent = () => {
      const next = current.current.preload?.getSession();
      return (
        active &&
        current.current.scopeKey === scopeKey &&
        next?.accountId === session.accountId &&
        next.workspaceId === session.workspaceId &&
        next.sessionId === session.sessionId &&
        next.accessToken === session.accessToken
      );
    };
    const ids: string[] = JSON.parse(idsKey);
    void loadTodayFinishedBookingIds(session, ids, isCurrent)
      .then((ids) => {
        if (isCurrent()) setLoaded({ key: scopeKey, ids, failed: false });
      })
      .catch(() => {
        if (isCurrent())
          setLoaded((previous) => ({
            key: scopeKey,
            ids: previous?.key === scopeKey ? previous.ids : emptyIds,
            failed: true,
          }));
      });
    return () => {
      active = false;
    };
  }, [
    scopeKey,
    idsKey,
    session,
    preload?.state.context,
    preload?.syncState,
    attempt,
  ]);
  return {
    finishedIds: loaded?.key === scopeKey ? loaded.ids : emptyIds,
    scoped: Boolean(session),
    failed: loaded?.key === scopeKey && loaded.failed,
    loading: Boolean(session) && loaded?.key !== scopeKey,
    retry: () => setAttempt((value) => value + 1),
  };
}
