import {
  createBookingSessionFence,
  type BookingSessionFence,
} from './creation-session';
import { getSupabaseClient } from '@/features/auth/client';
import { scheduleSessionId } from './read-session';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
type Control = {
  key: string;
  active: boolean;
  locked: boolean;
  fence?: BookingSessionFence;
};
const isCurrent = (token: Control, current: Control | null, key: string) =>
  token.active && token.key === key && current === token;
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
  const [authEpoch, setAuthEpoch] = useState(0);
  const identity = useRef<string | null>(null);
  const renderedKey = useRef('');
  const control = useRef<Control | null>(null);
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
  const key = JSON.stringify([userId, workspaceId, attempt, authEpoch]);
  const [state, setState] = useState<State | null>(null);
  useLayoutEffect(() => {
    renderedKey.current = key;
  }, [key]);
  useEffect(() => {
    const token: Control = { key, active: true, locked: false };
    control.current = token;
    void (async () => {
      try {
        token.fence = createBookingSessionFence(userId, () =>
          isCurrent(token, control.current, renderedKey.current),
        );
        await token.fence.assertCurrent();
        identity.current = token.fence.sessionId;
        const pending = await loadPendingWorkspaceBooking(userId, workspaceId);
        await token.fence.assertCurrent();
        if (isCurrent(token, control.current, renderedKey.current))
          setState({ key, pending, busy: false, error: null });
      } catch (error: unknown) {
        if (isCurrent(token, control.current, renderedKey.current))
          setState({
            key,
            pending: null,
            busy: false,
            error:
              error instanceof WorkspaceSchedulingError
                ? error.code
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
      const active = () =>
        isCurrent(token, control.current, renderedKey.current);
      let result: CreateWorkspaceBookingResult | null = null;
      let failure: CreationError | null = null;
      try {
        await token.fence?.assertCurrent();
        result = await submitWorkspaceBooking(
          userId,
          workspaceId,
          saved,
          active,
        );
      } catch (error: unknown) {
        failure = errorCode(error);
      }
      if (!active()) {
        token.locked = false;
        return null;
      }
      try {
        await token.fence?.assertCurrent();
        const pending = await loadPendingWorkspaceBooking(userId, workspaceId);
        await token.fence?.assertCurrent();
        if (!isCurrent(token, control.current, renderedKey.current))
          return null;
        setState({ key, pending, busy: false, error: failure });
      } catch (error: unknown) {
        if (!isCurrent(token, control.current, renderedKey.current))
          return null;
        setState({
          key,
          pending: current.pending ?? saved,
          busy: false,
          error:
            error instanceof WorkspaceSchedulingError
              ? error.code
              : pendingErrorCode(error),
        });
        result = null;
      } finally {
        token.locked = false;
      }
      if (!isCurrent(token, control.current, renderedKey.current)) return null;
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
    if (
      control.current?.active &&
      control.current.key === renderedKey.current &&
      !control.current.locked
    )
      setAttempt((value) => value + 1);
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
