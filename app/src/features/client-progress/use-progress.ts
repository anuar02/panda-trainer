import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ClientProgressError,
  loadClientProgressHistory,
  type ClientProgressHistory,
} from './service';

export function useClientProgress({
  userId,
  clientRecordId,
}: {
  userId: string;
  clientRecordId: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    data: ClientProgressHistory | null;
    error: ClientProgressError['code'] | null;
  } | null>(null);
  const key = JSON.stringify([userId, clientRecordId, attempt]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoaded(null);
      void loadClientProgressHistory({
        expectedUserId: userId,
        clientRecordId,
      }).then(
        (data) => {
          if (active) setLoaded({ key, data, error: null });
        },
        (error: unknown) => {
          if (active)
            setLoaded({
              key,
              data: null,
              error:
                error instanceof ClientProgressError ? error.code : 'request',
            });
        },
      );
      return () => {
        active = false;
      };
    }, [key, userId, clientRecordId]),
  );
  const current = loaded?.key === key ? loaded : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    retry: useCallback(() => setAttempt((value) => value + 1), []),
  };
}
