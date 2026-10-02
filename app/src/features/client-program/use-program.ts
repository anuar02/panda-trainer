import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ClientProgramError,
  loadLatestClientProgram,
  type ClientProgramData,
} from './service';

export function useClientProgram({
  userId,
  clientRecordId,
}: {
  userId: string;
  clientRecordId: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    data: ClientProgramData | null;
    error: ClientProgramError['code'] | null;
  } | null>(null);
  const key = JSON.stringify([userId, clientRecordId, attempt]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoaded(null);
      void loadLatestClientProgram({
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
                error instanceof ClientProgramError ? error.code : 'request',
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
