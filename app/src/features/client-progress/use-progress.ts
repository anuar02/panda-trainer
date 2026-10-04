import { useClientReadInvalidation } from '../client-home/use-read-invalidation';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ClientProgressError,
  loadClientProgressHistory,
  type ClientProgressHistory,
} from './service';

export function useClientProgress({
  userId,
  clientRecordId,
  workspaceId,
}: {
  userId: string;
  clientRecordId: string;
  workspaceId?: string;
}) {
  const caller = useRef<object | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    data: ClientProgressHistory | null;
    error: ClientProgressError['code'] | null;
  } | null>(null);
  const invalidate = useCallback(() => {
    caller.current = null;
    setLoaded(null);
    setAttempt((value) => value + 1);
  }, []);
  useClientReadInvalidation(invalidate);
  const key = JSON.stringify([userId, clientRecordId, workspaceId, attempt]);
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
      void loadClientProgressHistory({
        expectedUserId: userId,
        clientRecordId,
        workspaceId,
        isCurrent,
      }).then(
        (data) => {
          if (isCurrent()) setLoaded({ key, data, error: null });
        },
        (error: unknown) => {
          if (isCurrent())
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
        if (caller.current === identity) caller.current = null;
      };
    }, [key, userId, clientRecordId, workspaceId]),
  );
  const current = loaded?.key === key ? loaded : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    retry: invalidate,
  };
}
