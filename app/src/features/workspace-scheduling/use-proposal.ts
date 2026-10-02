import { useCallback, useEffect, useRef, useState } from 'react';
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
type Control = { key: string; active: boolean; locked: boolean };
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
    void loadPendingWorkspaceProposal(userId, workspaceId).then(
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
      command: WorkspaceProposalCommand,
    ): Promise<WorkspaceProposalResult | null> => {
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
        result = await submitWorkspaceProposal(userId, workspaceId, saved);
      } catch (error: unknown) {
        failure = errorCode(error);
      }
      try {
        const pending = await loadPendingWorkspaceProposal(userId, workspaceId);
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
      resolution = await resolvePendingWorkspaceProposal(userId, workspaceId);
    } catch (error: unknown) {
      failure = errorCode(error);
    }
    try {
      const pending = await loadPendingWorkspaceProposal(userId, workspaceId);
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
