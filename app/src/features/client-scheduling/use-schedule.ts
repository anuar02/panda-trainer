import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ClientSchedulingError,
  loadClientSchedule,
  type ClientSchedule,
} from './service';
export type ClientScheduleScope = {
  userId: string;
  clientRecordId: string;
  startsAtUtc?: string;
  endsAtUtc?: string;
};
type Loaded = {
  key: string;
  schedule: ClientSchedule | null;
  error: ClientSchedulingError['code'] | null;
};
export function useClientSchedule({
  userId,
  clientRecordId,
  startsAtUtc,
  endsAtUtc,
}: ClientScheduleScope) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = JSON.stringify([
    userId,
    clientRecordId,
    startsAtUtc ?? null,
    endsAtUtc ?? null,
    attempt,
  ]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoaded(null);
      void loadClientSchedule({
        clientRecordId,
        expectedUserId: userId,
        startsAtUtc,
        endsAtUtc,
      }).then(
        (schedule) => {
          if (active) setLoaded({ key, schedule, error: null });
        },
        (error: unknown) => {
          if (active)
            setLoaded({
              key,
              schedule: null,
              error:
                error instanceof ClientSchedulingError ? error.code : 'request',
            });
        },
      );
      return () => {
        active = false;
      };
    }, [key, userId, clientRecordId, startsAtUtc, endsAtUtc]),
  );
  const current = loaded?.key === key ? loaded : null;
  return {
    schedule: current?.schedule ?? null,
    loading: current === null,
    failed: current?.error !== null && current !== null,
    error: current?.error ?? null,
    retry: useCallback(() => setAttempt((value) => value + 1), []),
  };
}
