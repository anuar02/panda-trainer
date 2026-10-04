import {
  createSchedulingCommandFence,
  schedulingCommandError,
  type SchedulingCommandFence,
} from './command-session';
import { getSupabaseClient } from '@/features/auth/client';
import { scheduleSessionId } from './read-session';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  resolvePendingWorkspaceBookingStatus,
  submitWorkspaceBookingStatus,
} from './status-submission';
import {
  WorkspaceBookingStatusError,
  type WorkspaceBookingStatusResult,
} from './status-operation';
import {
  loadPendingWorkspaceBookingStatus,
  PendingWorkspaceBookingStatusError,
  type PendingWorkspaceBookingStatus,
} from './status-pending';

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const validStatusCommand = (command: PendingWorkspaceBookingStatus) =>
  (command.action === 'confirm' || command.action === 'cancel') &&
  uuid(command.bookingId) &&
  uuid(command.requestId) &&
  Number.isInteger(command.expectedRevision) &&
  command.expectedRevision >= 1 &&
  command.expectedRevision < 2147483647;
const snapshotStatusCommand = (
  command: PendingWorkspaceBookingStatus,
): PendingWorkspaceBookingStatus => ({
  action: command.action,
  bookingId: command.bookingId.toLowerCase(),
  expectedRevision: command.expectedRevision,
  requestId: command.requestId.toLowerCase(),
});
type StatusError =
  'storage' | 'invalidPending' | WorkspaceBookingStatusError['code'];
type Control = {
  key: string;
  active: boolean;
  locked: boolean;
  fence?: SchedulingCommandFence;
};
type State = {
  key: string;
  pending: PendingWorkspaceBookingStatus | null;
  busy: boolean;
  error: StatusError | null;
};
const errorCode = (error: unknown): StatusError =>
  error instanceof PendingWorkspaceBookingStatusError
    ? error.code === 'storage'
      ? 'storage'
      : 'invalidPending'
    : error instanceof WorkspaceBookingStatusError
      ? error.code
      : 'request';
const pendingErrorCode = (error: unknown): StatusError =>
  error instanceof PendingWorkspaceBookingStatusError &&
  error.code !== 'storage'
    ? 'invalidPending'
    : 'storage';
export function useWorkspaceStatusCommands({
  userId,
  workspaceId,
  onChanged,
  clientRecordId,
}: {
  userId: string;
  workspaceId: string;
  onChanged: () => void;
  clientRecordId?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [authEpoch, setAuthEpoch] = useState(0);
  const identity = useRef<string | null>(null);
  const control = useRef<Control | null>(null);
  const renderedKey = useRef('');
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const subscription = client.auth.onAuthStateChange((event, session) => {
      const next = scheduleSessionId(session);
      if (event === 'INITIAL_SESSION') {
        identity.current = next;
        return;
      }
      if (
        event === 'TOKEN_REFRESHED' &&
        next &&
        next === identity.current &&
        session?.user.id.toLowerCase() === userId.toLowerCase()
      )
        return;
      identity.current = next;
      if (control.current) control.current.active = false;
      setAuthEpoch((value) => value + 1);
    }).data.subscription;
    return () => subscription.unsubscribe();
  }, [userId]);
  const key = JSON.stringify([
    userId,
    workspaceId,
    clientRecordId,
    attempt,
    authEpoch,
  ]);
  const [state, setState] = useState<State | null>(null);
  useLayoutEffect(() => {
    renderedKey.current = key;
  }, [key]);
  const active = (token: Control) =>
    token.active &&
    token.key === renderedKey.current &&
    control.current === token;
  useEffect(() => {
    const token: Control = { key, active: true, locked: false };
    control.current = token;
    void (async () => {
      try {
        token.fence = createSchedulingCommandFence(userId, () => active(token));
        await token.fence.assertCurrent();
        identity.current = token.fence.sessionId;
        const pending = await loadPendingWorkspaceBookingStatus(
          userId,
          workspaceId,
        );
        await token.fence.assertCurrent();
        if (active(token)) setState({ key, pending, busy: false, error: null });
      } catch (error: unknown) {
        if (active(token))
          setState({
            key,
            pending: null,
            busy: false,
            error:
              schedulingCommandError(error) === 'unavailable' ||
              schedulingCommandError(error) === 'configuration'
                ? schedulingCommandError(error)
                : pendingErrorCode(error),
          });
      }
    })();
    return () => {
      token.active = false;
      token.fence?.dispose();
    };
  }, [key, userId, workspaceId]);
  const current = state?.key === key ? state : null;
  const submit = useCallback(
    async (command: PendingWorkspaceBookingStatus): Promise<boolean> => {
      const token = control.current;
      if (
        !token?.active ||
        token.key !== key ||
        !active(token) ||
        token.locked ||
        !current ||
        current.error === 'storage' ||
        current.error === 'invalidPending'
      )
        return false;
      if (!validStatusCommand(command)) {
        setState({ ...current, error: 'invalidInput' });
        return false;
      }
      const saved = snapshotStatusCommand(command);
      if (
        current.pending &&
        JSON.stringify(snapshotStatusCommand(current.pending)) !==
          JSON.stringify(saved)
      )
        return false;
      token.locked = true;
      setState({ ...current, busy: true, error: null });
      let result: WorkspaceBookingStatusResult | null = null;
      let failure: StatusError | null = null;
      try {
        await token.fence?.assertCurrent();
        result = await submitWorkspaceBookingStatus(
          userId,
          workspaceId,
          saved,
          () => active(token),
          clientRecordId,
        );
      } catch (error: unknown) {
        failure =
          schedulingCommandError(error) === 'unavailable'
            ? 'unavailable'
            : errorCode(error);
      }
      try {
        await token.fence?.assertCurrent();
        const pending = await loadPendingWorkspaceBookingStatus(
          userId,
          workspaceId,
        );
        if (!active(token)) return false;
        await token.fence?.assertCurrent();
        if (!active(token)) return false;
        setState({
          key,
          pending: failure === 'storage' ? (pending ?? saved) : pending,
          busy: false,
          error: failure,
        });
      } catch (error: unknown) {
        if (!active(token)) return false;
        setState({
          key,
          pending: current.pending ?? saved,
          busy: false,
          error:
            schedulingCommandError(error) === 'unavailable'
              ? 'unavailable'
              : pendingErrorCode(error),
        });
        result = null;
      } finally {
        token.locked = false;
      }
      if (!active(token)) return false;
      if (result || failure === 'conflict' || failure === 'invalidState')
        onChanged();
      return result !== null;
    },
    [current, key, onChanged, userId, workspaceId, clientRecordId],
  );
  const resume = useCallback(
    () => (current?.pending ? submit(current.pending) : Promise.resolve(false)),
    [current, submit],
  );
  const resolve = useCallback(async () => {
    const token = control.current;
    if (
      !token?.active ||
      token.key !== key ||
      !active(token) ||
      token.locked ||
      !current?.pending ||
      current.error === 'storage' ||
      current.error === 'invalidPending'
    )
      return false;
    token.locked = true;
    setState({ ...current, busy: true, error: null });
    let resolution = null;
    let failure = null;
    try {
      await token.fence?.assertCurrent();
      resolution = await resolvePendingWorkspaceBookingStatus(
        userId,
        workspaceId,
        () => active(token),
        clientRecordId,
      );
    } catch (error: unknown) {
      failure =
        schedulingCommandError(error) === 'unavailable'
          ? 'unavailable'
          : errorCode(error);
    }
    try {
      await token.fence?.assertCurrent();
      const pending = await loadPendingWorkspaceBookingStatus(
        userId,
        workspaceId,
      );
      if (!active(token)) return false;
      await token.fence?.assertCurrent();
      if (!active(token)) return false;
      setState({ key, pending, busy: false, error: failure });
    } catch (error: unknown) {
      if (!active(token)) return false;
      setState({ ...current, busy: false, error: pendingErrorCode(error) });
      resolution = null;
    } finally {
      token.locked = false;
    }
    if (!active(token)) return false;
    if (resolution) onChanged();
    return resolution !== null;
  }, [current, key, onChanged, userId, workspaceId, clientRecordId]);
  const reload = useCallback(() => {
    if (
      control.current?.active &&
      control.current.key === renderedKey.current &&
      !control.current.locked
    )
      setAttempt((value) => value + 1);
  }, []);
  return {
    blocked:
      current === null ||
      current.busy ||
      current.pending !== null ||
      current.error === 'storage' ||
      current.error === 'invalidPending',
    scopeKey: key,
    pending: current?.pending ?? null,
    loading: current === null,
    busy: current?.busy ?? false,
    error: current?.error ?? null,
    reload,
    submit,
    resume,
    resolve,
  };
}

export type ClientBookingStatusStore = ReturnType<
  typeof useWorkspaceStatusCommands
>;
