import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { loadTrainerPayments } from './service';
import { TrainerPaymentsError, type TrainerPayments } from './types';

export function useTrainerPayments(
  userId: string,
  workspaceId: string,
  clientRecordId: string,
) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([userId, workspaceId, clientRecordId, attempt]);
  const [state, setState] = useState<{
    key: string;
    data: TrainerPayments | null;
    error: TrainerPaymentsError['code'] | null;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      setState(null);
      let active = true;
      void loadTrainerPayments({
        expectedUserId: userId,
        workspaceId,
        clientRecordId,
      }).then(
        (data) => {
          if (active) setState({ key, data, error: null });
        },
        (error: unknown) => {
          if (active)
            setState({
              key,
              data: null,
              error:
                error instanceof TrainerPaymentsError ? error.code : 'request',
            });
        },
      );
      return () => {
        active = false;
      };
    }, [key, userId, workspaceId, clientRecordId]),
  );
  const current = state?.key === key ? state : null;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    retry,
  };
}
