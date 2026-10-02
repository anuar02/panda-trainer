import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([userId, workspaceId, clientRecordId, attempt]);
  const [state, setState] = useState<{
    key: string;
    data: TrainerBilling | null;
    error: TrainerBillingErrorCode | null;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      setState(null);
      let active = true;
      void loadTrainerBilling({
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
                error instanceof TrainerBillingError ? error.code : 'request',
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
