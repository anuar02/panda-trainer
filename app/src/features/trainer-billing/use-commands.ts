import { captureFinancialMutationFence } from './mutation-auth';
import { useMutationSession } from './use-mutation-session';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
  retainPendingTrainerBillingCommand,
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
  const {
    version: sessionVersion,
    ready: sessionReady,
    isCurrent: isSessionCurrent,
  } = useMutationSession();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([
    userId.toLowerCase(),
    workspaceId.toLowerCase(),
    sessionVersion,
    attempt,
  ]);
  const renderedKey = useRef(key);
  useLayoutEffect(() => {
    renderedKey.current = key;
  }, [key]);
  const [state, setState] = useState<State | null>(null);
  const control = useRef<Control | null>(null);
  useEffect(() => {
    if (!sessionReady) return;
    const token: Control = { key, active: true, locked: false };
    control.current = token;
    const active = () =>
      token.active &&
      renderedKey.current === key &&
      isSessionCurrent(sessionVersion);
    const load = async () => {
      let fence;
      try {
        fence = captureFinancialMutationFence(userId, workspaceId, active);
        const pending = await loadPendingTrainerBillingCommand(
          userId,
          workspaceId,
          fence,
        );
        await fence.guard();
        if (active()) setState({ key, pending, busy: false, error: null });
      } catch (error: unknown) {
        if (active())
          setState({
            key,
            pending: null,
            busy: false,
            error:
              error instanceof TrainerBillingError
                ? error.code
                : pendingErrorCode(error),
          });
      } finally {
        fence?.dispose();
      }
    };
    void load();
    return () => {
      token.active = false;
    };
  }, [
    key,
    userId,
    workspaceId,
    sessionReady,
    sessionVersion,
    isSessionCurrent,
  ]);
  const current =
    state?.key === key && isSessionCurrent(sessionVersion) ? state : null;
  const submit = useCallback(
    async (command: TrainerBillingCommand): Promise<boolean> => {
      const token = control.current;
      if (
        !isSessionCurrent(sessionVersion) ||
        renderedKey.current !== key ||
        !token?.active ||
        token.key !== key ||
        token.locked ||
        !current ||
        current.error === 'storage' ||
        current.error === 'invalidPending' ||
        current.error === 'configuration' ||
        current.error === 'unavailable'
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
      const active = () =>
        token.active &&
        renderedKey.current === key &&
        isSessionCurrent(sessionVersion);
      let fence;
      let result: TrainerBillingCommandResult | null = null;
      let failure: BillingCommandError | null = null;
      try {
        fence = captureFinancialMutationFence(userId, workspaceId, active);
        await fence.guard();
        fence.assertCurrent();
        result = await submitTrainerBillingCommand(
          userId,
          workspaceId,
          saved,
          fence,
        );
        await fence.guard();
        fence.assertCurrent();
      } catch (error: unknown) {
        failure = errorCode(error);
        if (result !== null) {
          try {
            await retainPendingTrainerBillingCommand(
              userId,
              workspaceId,
              saved,
            );
          } catch (storageError: unknown) {
            failure = errorCode(storageError);
          }
        }
        result = null;
      }
      try {
        if (!active()) return false;
        const pending = await loadPendingTrainerBillingCommand(
          userId,
          workspaceId,
          fence,
        );
        await fence?.guard();
        if (!active()) return false;
        setState({ key, pending, busy: false, error: failure });
      } catch (error: unknown) {
        if (!active()) return false;
        if (error instanceof TrainerBillingError) failure = error.code;
        setState({
          key,
          pending: current.pending ?? saved,
          busy: false,
          error:
            error instanceof TrainerBillingError
              ? error.code
              : pendingErrorCode(error),
        });
        result = null;
      } finally {
        fence?.dispose();
        token.locked = false;
      }
      if (!active()) return false;
      if (
        result ||
        failure === 'conflict' ||
        failure === 'invalidState' ||
        failure === 'overpayment'
      )
        onChanged();
      return result !== null;
    },
    [
      current,
      key,
      onChanged,
      userId,
      workspaceId,
      sessionVersion,
      isSessionCurrent,
    ],
  );
  const resume = useCallback(
    () => (current?.pending ? submit(current.pending) : Promise.resolve(false)),
    [current, submit],
  );
  const reload = useCallback(() => {
    if (
      renderedKey.current === key &&
      isSessionCurrent(sessionVersion) &&
      !control.current?.locked
    )
      setAttempt((value) => value + 1);
  }, [key, sessionVersion, isSessionCurrent]);
  return {
    blocked:
      current === null ||
      current.busy ||
      current.pending !== null ||
      current.error === 'storage' ||
      current.error === 'invalidPending' ||
      current.error === 'configuration' ||
      current.error === 'unavailable',
    pending: current?.pending ?? null,
    loading: current === null,
    busy: current?.busy ?? false,
    error: current?.error ?? null,
    reload,
    submit,
    resume,
  };
}
