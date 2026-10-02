import { useCallback, useEffect, useRef, useState } from 'react';
import { submitWorkspaceBooking } from './creation';
import type { CreateWorkspaceBookingResult } from './create-operation';
import {
  loadPendingWorkspaceBooking,
  PendingWorkspaceBookingError,
  type PendingWorkspaceBooking,
} from './pending';
import {
  WorkspaceSchedulingError,
  type WorkspaceSchedulingErrorCode,
} from './service';

type CreationError =
  'storage' | 'invalidPending' | WorkspaceSchedulingErrorCode;
type Control = { key: string; active: boolean; locked: boolean };
type State = {
  key: string;
  pending: PendingWorkspaceBooking | null;
  busy: boolean;
  error: CreationError | null;
};
const errorCode = (error: unknown): CreationError =>
  error instanceof PendingWorkspaceBookingError
    ? error.code === 'storage'
      ? 'storage'
      : 'invalidPending'
    : error instanceof WorkspaceSchedulingError
      ? error.code
      : 'request';
const pendingErrorCode = (error: unknown): CreationError =>
  error instanceof PendingWorkspaceBookingError && error.code !== 'storage'
    ? 'invalidPending'
    : 'storage';
const snapshot = (
  command: PendingWorkspaceBooking,
): PendingWorkspaceBooking => ({
  clientRecordIds: [...command.clientRecordIds]
    .map((id) => id.toLowerCase())
    .sort(),
  startsAtUtc: command.startsAtUtc,
  endsAtUtc: command.endsAtUtc,
  collisionAcknowledged: command.collisionAcknowledged,
  requestId: command.requestId.toLowerCase(),
  ...(command.plan
    ? {
        plan: {
          templateId: command.plan.templateId.toLowerCase(),
          expectedTemplateRevision: command.plan.expectedTemplateRevision,
        },
      }
    : {}),
});

export function useWorkspaceBookingCreation({
  userId,
  workspaceId,
  onCreated,
}: {
  userId: string;
  workspaceId: string;
  onCreated: (result: CreateWorkspaceBookingResult) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([userId, workspaceId, attempt]);
  const [state, setState] = useState<State | null>(null);
  const control = useRef<Control | null>(null);
  useEffect(() => {
    const token: Control = { key, active: true, locked: false };
    control.current = token;
    void loadPendingWorkspaceBooking(userId, workspaceId).then(
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
      command: PendingWorkspaceBooking,
    ): Promise<CreateWorkspaceBookingResult | null> => {
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
      const saved = snapshot(command);
      if (
        current.pending &&
        JSON.stringify(snapshot(current.pending)) !== JSON.stringify(saved)
      )
        return null;
      token.locked = true;
      setState({ ...current, busy: true, error: null });
      let result: CreateWorkspaceBookingResult | null = null;
      let failure: CreationError | null = null;
      try {
        result = await submitWorkspaceBooking(userId, workspaceId, saved);
      } catch (error: unknown) {
        failure = errorCode(error);
      }
      try {
        const pending = await loadPendingWorkspaceBooking(userId, workspaceId);
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
      if (result?.created) onCreated(result);
      return result;
    },
    [current, key, onCreated, userId, workspaceId],
  );
  const resume = useCallback(
    () => (current?.pending ? submit(current.pending) : Promise.resolve(null)),
    [current, submit],
  );
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
  };
}
