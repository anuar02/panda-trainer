import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  loadClientOverview,
  ClientOverviewError,
  type ClientOverview,
  type ClientOverviewScope,
} from './overview-service';
import { useClientReadInvalidation } from './use-read-invalidation';

export function useClientOverview(
  scope: Omit<ClientOverviewScope, 'isCurrent'>,
) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    data: ClientOverview | null;
    error: ClientOverviewError['code'] | null;
  } | null>(null);
  const caller = useRef<object | null>(null);
  const retry = useCallback(() => {
    caller.current = null;
    setLoaded(null);
    setAttempt((v) => v + 1);
  }, []);
  useClientReadInvalidation(retry);
  const { expectedUserId, workspaceId, clientRecordId, startsOn, endsOn } =
    scope;
  const key = JSON.stringify([
    expectedUserId,
    workspaceId,
    clientRecordId,
    startsOn,
    endsOn,
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
      const identity = {};
      caller.current = identity;
      setLoaded(null);
      const isCurrent = () => caller.current === identity;
      void loadClientOverview({
        expectedUserId,
        workspaceId,
        clientRecordId,
        startsOn,
        endsOn,
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
                error instanceof ClientOverviewError ? error.code : 'request',
            });
        },
      );
      return () => {
        if (isCurrent()) caller.current = null;
      };
    }, [key, expectedUserId, workspaceId, clientRecordId, startsOn, endsOn]),
  );
  const current = loaded?.key === key ? loaded : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    retry,
    generation: key,
  };
}
