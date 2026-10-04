import { useClientReadInvalidation } from '../client-home/use-read-invalidation';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ClientSchedulingError,
  loadClientSchedule,
  type ClientSchedule,
} from './service';
export type ClientScheduleScope = {
  userId: string;
  clientRecordId: string;
  workspaceId?: string;
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
  workspaceId,
  startsAtUtc,
  endsAtUtc,
}: ClientScheduleScope) {
  const caller = useRef<object | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const invalidate = useCallback(() => {
    caller.current = null;
    setLoaded(null);
    setAttempt((value) => value + 1);
  }, []);
  useClientReadInvalidation(invalidate);
  const key = JSON.stringify([
    userId,
    clientRecordId,
    workspaceId,
    startsAtUtc ?? null,
    endsAtUtc ?? null,
    attempt,
  ]);
  useLayoutEffect(() => {
    caller.current = null;
    return () => {
      caller.current = null;
    };
  }, [key]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const identity = {};
      caller.current = identity;
      const isCurrent = () => active && caller.current === identity;
      setLoaded(null);
      void loadClientSchedule({
        clientRecordId,
        workspaceId,
        isCurrent,
        expectedUserId: userId,
        startsAtUtc,
        endsAtUtc,
      }).then(
        (schedule) => {
          if (isCurrent()) setLoaded({ key, schedule, error: null });
        },
        (error: unknown) => {
          if (isCurrent())
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
        if (caller.current === identity) caller.current = null;
      };
    }, [key, userId, clientRecordId, workspaceId, startsAtUtc, endsAtUtc]),
  );
  const current = loaded?.key === key ? loaded : null;
  return {
    generation: key,
    schedule: current?.schedule ?? null,
    loading: current === null,
    failed: current?.error !== null && current !== null,
    error: current?.error ?? null,
    retry: invalidate,
  };
}
