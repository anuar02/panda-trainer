import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolvePendingWorkspaceBookingStatus,
  submitWorkspaceBookingStatus,
} from '../workspace-scheduling/status-submission';
import {
  WorkspaceBookingStatusError,
  type WorkspaceBookingStatusResult,
} from '../workspace-scheduling/status-operation';
import {
  loadPendingWorkspaceBookingStatus,
  PendingWorkspaceBookingStatusError,
  type PendingWorkspaceBookingStatus,
} from '../workspace-scheduling/status-pending';

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
type Control = { key: string; active: boolean; locked: boolean };
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
export function useClientBookingStatus({
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
    void loadPendingWorkspaceBookingStatus(userId, workspaceId).then(
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
    async (
      command: PendingWorkspaceBookingStatus,
    ): Promise<WorkspaceBookingStatusResult | null> => {
      const token = control.current;
      if (
        !token?.active ||
        token.key !== key ||
        token.locked ||
        !current ||
        current.error === 'storage' ||
        current.error === 'invalidPending'
      )
        return null;
      if (!validStatusCommand(command)) {
        setState({ ...current, error: 'invalidInput' });
        return null;
      }
      const saved = snapshotStatusCommand(command);
      if (
        current.pending &&
        JSON.stringify(snapshotStatusCommand(current.pending)) !==
          JSON.stringify(saved)
      )
        return null;
      token.locked = true;
      setState({ ...current, busy: true, error: null });
      let result: WorkspaceBookingStatusResult | null = null;
      let failure: StatusError | null = null;
      try {
        result = await submitWorkspaceBookingStatus(userId, workspaceId, saved);
      } catch (error: unknown) {
        failure = errorCode(error);
      }
      try {
        const pending = await loadPendingWorkspaceBookingStatus(
          userId,
          workspaceId,
        );
        if (!token.active) return null;
        setState({ key, pending, busy: false, error: failure });
      } catch (error: unknown) {
        if (!token.active) return null;
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
      if (!token.active) return null;
      if (result) onChanged();
      return result;
    },
    [current, key, onChanged, userId, workspaceId],
  );
  const resume = useCallback(
    () => (current?.pending ? submit(current.pending) : Promise.resolve(null)),
    [current, submit],
  );
  const resolve = useCallback(async () => {
    const token = control.current;
    if (
      !token?.active ||
      token.key !== key ||
      token.locked ||
      !current?.pending ||
      current.error === 'storage' ||
      current.error === 'invalidPending'
    )
      return null;
    token.locked = true;
    setState({ ...current, busy: true, error: null });
    let resolution = null;
    let failure = null;
    try {
      resolution = await resolvePendingWorkspaceBookingStatus(
        userId,
        workspaceId,
      );
    } catch (error: unknown) {
      failure = errorCode(error);
    }
    try {
      const pending = await loadPendingWorkspaceBookingStatus(
        userId,
        workspaceId,
      );
      if (!token.active) return null;
      setState({ key, pending, busy: false, error: failure });
    } catch (error: unknown) {
      if (!token.active) return null;
      setState({ ...current, busy: false, error: pendingErrorCode(error) });
      resolution = null;
    } finally {
      token.locked = false;
    }
    if (!token.active) return null;
    if (resolution) onChanged();
    return resolution;
  }, [current, key, onChanged, userId, workspaceId]);
  const reload = useCallback(() => {
    if (!control.current?.locked) setAttempt((value) => value + 1);
  }, []);
  return {
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
  typeof useClientBookingStatus
>;
