import { useCallback, useEffect, useRef, useState } from 'react';
import {
  submitTrainerBillingCommand,
  type TrainerBillingCommand,
  type TrainerBillingCommandResult,
  validTrainerBillingCommand,
  snapshotTrainerBillingCommand,
} from './commands';
import { TrainerBillingError } from './types';
import {
  loadPendingTrainerBillingCommand,
  PendingTrainerBillingCommandError,
} from './command-storage';

type BillingCommandError =
  'storage' | 'invalidPending' | TrainerBillingError['code'];
type Control = { key: string; active: boolean; locked: boolean };
type State = {
  key: string;
  pending: TrainerBillingCommand | null;
  busy: boolean;
  error: BillingCommandError | null;
};
const errorCode = (error: unknown): BillingCommandError =>
  error instanceof PendingTrainerBillingCommandError
    ? error.code === 'storage'
      ? 'storage'
      : 'invalidPending'
    : error instanceof TrainerBillingError
      ? error.code
      : 'request';
const pendingErrorCode = (error: unknown): BillingCommandError =>
  error instanceof PendingTrainerBillingCommandError && error.code !== 'storage'
    ? 'invalidPending'
    : 'storage';
export function useTrainerBillingCommands({
  userId,
  workspaceId,
  onChanged,
}: {
  userId: string;
  workspaceId: string;
  onChanged: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([userId, workspaceId, attempt]);
  const [state, setState] = useState<State | null>(null);
  const control = useRef<Control | null>(null);
  useEffect(() => {
    const token: Control = { key, active: true, locked: false };
    control.current = token;
    void loadPendingTrainerBillingCommand(userId, workspaceId).then(
      (pending) => {
        if (token.active) setState({ key, pending, busy: false, error: null });
      },
      (error: unknown) => {
        if (token.active)
          setState({
            key,
            pending: null,
            busy: false,
            error: pendingErrorCode(error),
          });
      },
    );
    return () => {
      token.active = false;
    };
  }, [key, userId, workspaceId]);
  const current = state?.key === key ? state : null;
  const submit = useCallback(
    async (command: TrainerBillingCommand): Promise<boolean> => {
      const token = control.current;
      if (
        !token?.active ||
        token.key !== key ||
        token.locked ||
        !current ||
        current.error === 'storage' ||
        current.error === 'invalidPending'
      )
        return false;
      if (!validTrainerBillingCommand(command)) {
        setState({ ...current, error: 'invalidInput' });
        return false;
      }
      const saved = snapshotTrainerBillingCommand(command);
      if (
        current.pending &&
        JSON.stringify(snapshotTrainerBillingCommand(current.pending)) !==
          JSON.stringify(saved)
      )
        return false;
      token.locked = true;
      setState({ ...current, busy: true, error: null });
      let result: TrainerBillingCommandResult | null = null;
      let failure: BillingCommandError | null = null;
      try {
        result = await submitTrainerBillingCommand(userId, workspaceId, saved);
      } catch (error: unknown) {
        failure = errorCode(error);
      }
      try {
        const pending = await loadPendingTrainerBillingCommand(
          userId,
          workspaceId,
        );
        if (!token.active) return false;
        setState({ key, pending, busy: false, error: failure });
      } catch (error: unknown) {
        if (!token.active) return false;
        setState({
          key,
          pending: current.pending ?? saved,
          busy: false,
          error: pendingErrorCode(error),
        });
        result = null;
      } finally {
        token.locked = false;
      }
      if (!token.active) return false;
      if (
        result ||
        failure === 'conflict' ||
        failure === 'invalidState' ||
        failure === 'overpayment'
      )
        onChanged();
      return result !== null;
    },
    [current, key, onChanged, userId, workspaceId],
  );
  const resume = useCallback(
    () => (current?.pending ? submit(current.pending) : Promise.resolve(false)),
    [current, submit],
  );
  const reload = useCallback(() => {
    if (!control.current?.locked) setAttempt((value) => value + 1);
  }, []);
  return {
    blocked:
      current === null ||
      current.busy ||
      current.pending !== null ||
      current.error === 'storage' ||
      current.error === 'invalidPending',
    pending: current?.pending ?? null,
    loading: current === null,
    busy: current?.busy ?? false,
    error: current?.error ?? null,
    reload,
    submit,
    resume,
  };
}
