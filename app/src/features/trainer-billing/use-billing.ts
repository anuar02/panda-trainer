import { useReadSession } from './use-read-session';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useRef, useLayoutEffect } from 'react';
import { loadTrainerBilling } from './service';
import {
  TrainerBillingError,
  type TrainerBilling,
  type TrainerBillingErrorCode,
} from './types';
export function useTrainerBilling(
  userId: string,
  workspaceId: string,
  clientRecordId?: string,
) {
  const { version, isCurrent } = useReadSession();
  const latest = useRef<string>('');
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([
    userId,
    workspaceId,
    clientRecordId,
    attempt,
    version,
  ]);
  useLayoutEffect(() => {
    latest.current = key;
    return () => {
      latest.current = '';
    };
  }, [key]);
  const [state, setState] = useState<{
    key: string;
    data: TrainerBilling | null;
    error: TrainerBillingErrorCode | null;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      setState(null);
      let active = true;
      const ticket = version;
      const current = () =>
        active && isCurrent(ticket) && latest.current === key;
      void loadTrainerBilling({
        expectedUserId: userId,
        workspaceId,
        clientRecordId,
      }).then(
        (data) => {
          if (current()) setState({ key, data, error: null });
        },
        (error: unknown) => {
          if (current())
            setState({
              key,
              data: null,
              error:
                error instanceof TrainerBillingError ? error.code : 'request',
            });
        },
      );
      return () => {
        active = false;
      };
    }, [key, userId, workspaceId, clientRecordId, isCurrent, version]),
  );
  const current = state?.key === key ? state : null;
  const retry = useCallback(() => {
    if (latest.current === key && isCurrent(version))
      setAttempt((value) => value + 1);
  }, [key, isCurrent, version]);
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    retry,
  };
}
