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
  resolvePendingWorkspaceProposal,
  submitWorkspaceProposal,
} from './proposal-submission';
import {
  WorkspaceProposalError,
  type WorkspaceProposalCommand,
  type WorkspaceProposalResult,
} from './proposal-operation';
import {
  loadPendingWorkspaceProposal,
  PendingWorkspaceProposalError,
  snapshotWorkspaceProposalCommand,
  validWorkspaceProposalCommand,
} from './proposal-pending';

type ProposalError =
  'storage' | 'invalidPending' | WorkspaceProposalError['code'];
type Control = {
  key: string;
  active: boolean;
  locked: boolean;
  fence?: SchedulingCommandFence;
};
type State = {
  key: string;
  pending: WorkspaceProposalCommand | null;
  busy: boolean;
  error: ProposalError | null;
};
const errorCode = (error: unknown): ProposalError =>
  error instanceof PendingWorkspaceProposalError
    ? error.code === 'storage'
      ? 'storage'
      : 'invalidPending'
    : error instanceof WorkspaceProposalError
      ? error.code
      : 'request';
const pendingErrorCode = (error: unknown): ProposalError =>
  error instanceof PendingWorkspaceProposalError && error.code !== 'storage'
    ? 'invalidPending'
    : 'storage';
export function useWorkspaceProposalCommands({
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
        const pending = await loadPendingWorkspaceProposal(userId, workspaceId);
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
    async (
      command: WorkspaceProposalCommand,
    ): Promise<WorkspaceProposalResult | null> => {
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
        return null;
      if (!validWorkspaceProposalCommand(command)) {
        setState({ ...current, error: 'invalidInput' });
        return null;
      }
      const saved = snapshotWorkspaceProposalCommand(command);
      if (
        current.pending &&
        JSON.stringify(snapshotWorkspaceProposalCommand(current.pending)) !==
          JSON.stringify(saved)
      )
        return null;
      token.locked = true;
      setState({ ...current, busy: true, error: null });
      let result: WorkspaceProposalResult | null = null;
      let failure: ProposalError | null = null;
      try {
        await token.fence?.assertCurrent();
        result = await submitWorkspaceProposal(
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
        const pending = await loadPendingWorkspaceProposal(userId, workspaceId);
        if (!active(token)) return null;
        await token.fence?.assertCurrent();
        if (!active(token)) return null;
        setState({
          key,
          pending: failure === 'storage' ? (pending ?? saved) : pending,
          busy: false,
          error: failure,
        });
      } catch (error: unknown) {
        if (!active(token)) return null;
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
      if (!active(token)) return null;
      if (result || failure === 'conflict' || failure === 'invalidState')
        onChanged();
      return result;
    },
    [current, key, onChanged, userId, workspaceId, clientRecordId],
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
      !active(token) ||
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
      await token.fence?.assertCurrent();
      resolution = await resolvePendingWorkspaceProposal(
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
      const pending = await loadPendingWorkspaceProposal(userId, workspaceId);
      if (!active(token)) return null;
      await token.fence?.assertCurrent();
      if (!active(token)) return null;
      setState({ key, pending, busy: false, error: failure });
    } catch (error: unknown) {
      if (!active(token)) return null;
      setState({ ...current, busy: false, error: pendingErrorCode(error) });
      resolution = null;
    } finally {
      token.locked = false;
    }
    if (!active(token)) return null;
    if (resolution) onChanged();
    return resolution;
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
