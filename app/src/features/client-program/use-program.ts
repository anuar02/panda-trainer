import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useProgramReadSession } from './program-read-lifecycle';
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
  const { version, isCurrent: isSessionCurrent } = useProgramReadSession();
  const scope = JSON.stringify([userId, clientRecordId]);
  const currentScope = useRef(scope);
  useLayoutEffect(() => {
    currentScope.current = scope;
  }, [scope]);
  const request = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    data: ClientProgramData | null;
    error: ClientProgramError['code'] | null;
  } | null>(null);
  const key = JSON.stringify([userId, clientRecordId, version, attempt]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const ticket = ++request.current;
      const isCurrent = () =>
        active &&
        ticket === request.current &&
        currentScope.current === scope &&
        isSessionCurrent(version);
      setLoaded(null);
      void loadLatestClientProgram({
        expectedUserId: userId,
        clientRecordId,
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
                error instanceof ClientProgramError ? error.code : 'request',
            });
        },
      );
      return () => {
        active = false;
      };
    }, [key, userId, clientRecordId, scope, version, isSessionCurrent]),
  );
  const current =
    isSessionCurrent(version) && loaded?.key === key ? loaded : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    retry: useCallback(() => {
      request.current += 1;
      setAttempt((value) => value + 1);
    }, []),
  };
}
