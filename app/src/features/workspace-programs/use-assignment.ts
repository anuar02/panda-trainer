import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  clearPendingClientProgramAssignment,
  loadPendingClientProgramAssignment,
  PendingClientProgramAssignmentError,
  savePendingClientProgramAssignment,
  type PendingClientProgramAssignment,
} from './pending';
import {
  createAssignClientProgramOperation,
  WorkspaceProgramAssignmentError,
  type WorkspaceProgramAssignmentErrorCode,
  type WorkspaceProgramAssignmentResult,
} from './service';

export type ClientProgramAssignmentErrorCode =
  | WorkspaceProgramAssignmentErrorCode
  | 'storage'
  | 'invalidPending'
  | 'pendingExists';

type AssignmentError = ClientProgramAssignmentErrorCode | null;

type UseClientProgramAssignmentInput = {
  userId: string | null;
  workspaceId: string | null;
  clientRecordId: string;
  onAssigned?: (result: WorkspaceProgramAssignmentResult) => void;
};

type LoadedPending = {
  scope: string;
  attempt: number;
  pending: PendingClientProgramAssignment | null;
  error: AssignmentError;
};

export function useClientProgramAssignment({
  userId,
  workspaceId,
  clientRecordId,
  onAssigned,
}: UseClientProgramAssignmentInput) {
  const [loaded, setLoaded] = useState<LoadedPending | null>(null);
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<{
    scope: string;
    error: AssignmentError;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef<symbol | null>(null);
  const generation = useRef(0);
  const scope = `${userId ?? ''}:${workspaceId ?? ''}:${clientRecordId}`;
  const scopeRef = useRef(scope);
  const onAssignedRef = useRef(onAssigned);
  const loading = loaded?.scope !== scope || loaded.attempt !== attempt;
  const ready =
    loaded?.scope === scope &&
    loaded.attempt === attempt &&
    loaded.error === null;
  const busy = busyScope === scope;
  const pending =
    loaded?.scope === scope && loaded.attempt === attempt
      ? loaded.pending
      : null;
  const error =
    commandError?.scope === scope
      ? commandError.error
      : loaded?.scope === scope && loaded.attempt === attempt
        ? loaded.error
        : null;

  useEffect(() => {
    onAssignedRef.current = onAssigned;
  }, [onAssigned]);

  useEffect(() => {
    let active = true;
    const currentGeneration = ++generation.current;
    const currentAttempt = attempt;
    scopeRef.current = scope;
    const finish = (value: Omit<LoadedPending, 'attempt'>) => {
      if (active) setLoaded({ ...value, attempt: currentAttempt });
    };
    if (!userId || !workspaceId) {
      void Promise.resolve().then(() =>
        finish({ scope, pending: null, error: 'unavailable' }),
      );
    } else {
      void Promise.resolve()
        .then(() =>
          loadPendingClientProgramAssignment(
            userId,
            workspaceId,
            clientRecordId,
          ),
        )
        .then(
          (value) => finish({ scope, pending: value, error: null }),
          (caught: unknown) =>
            finish({
              scope,
              pending: null,
              error:
                caught instanceof PendingClientProgramAssignmentError &&
                caught.code === 'invalid'
                  ? 'invalidPending'
                  : 'storage',
            }),
        );
    }
    return () => {
      active = false;
      if (generation.current === currentGeneration) generation.current += 1;
    };
  }, [attempt, clientRecordId, scope, userId, workspaceId]);

  const reload = useCallback(() => {
    setCommandError(null);
    setAttempt((value) => value + 1);
  }, []);

  const assign = useCallback(
    async (templateId?: string, expectedTemplateRevision?: number) => {
      if (lock.current || loading || busy || !ready || !userId || !workspaceId)
        return;
      const operationScope = scope;
      const operationGeneration = generation.current;
      const lockToken = Symbol();
      lock.current = lockToken;
      const isCurrent = () =>
        generation.current === operationGeneration &&
        scopeRef.current === operationScope;
      setBusyScope(operationScope);
      setCommandError({ scope: operationScope, error: null });
      try {
        let command = pending;
        if (!command) {
          if (
            !templateId ||
            typeof expectedTemplateRevision !== 'number' ||
            !Number.isSafeInteger(expectedTemplateRevision) ||
            expectedTemplateRevision < 1
          ) {
            setCommandError({ scope: operationScope, error: 'invalidInput' });
            return;
          }
          command = {
            clientRecordId,
            templateId,
            expectedTemplateRevision,
            requestId: Crypto.randomUUID(),
          };
          try {
            await savePendingClientProgramAssignment(
              userId,
              workspaceId,
              command,
            );
            if (!isCurrent()) return;
            setLoaded({
              scope: operationScope,
              attempt,
              pending: command,
              error: null,
            });
          } catch (caught) {
            if (!isCurrent()) return;
            if (
              caught instanceof PendingClientProgramAssignmentError &&
              caught.code === 'unresolved'
            ) {
              const saved = await loadPendingClientProgramAssignment(
                userId,
                workspaceId,
                clientRecordId,
              );
              if (!isCurrent()) return;
              setLoaded({
                scope: operationScope,
                attempt,
                pending: saved,
                error: null,
              });
              setCommandError({
                scope: operationScope,
                error: 'pendingExists',
              });
            } else {
              setCommandError({
                scope: operationScope,
                error:
                  caught instanceof PendingClientProgramAssignmentError &&
                  caught.code === 'invalid'
                    ? 'invalidPending'
                    : 'storage',
              });
            }
            return;
          }
        }

        if (!isCurrent()) return;
        const operation = createAssignClientProgramOperation({
          clientRecordId: command.clientRecordId,
          templateId: command.templateId,
          expectedTemplateRevision: command.expectedTemplateRevision,
          expectedUserId: userId,
          requestId: command.requestId,
        });
        try {
          const result = await operation.execute();
          if (!isCurrent()) return;
          await clearPendingClientProgramAssignment(
            userId,
            workspaceId,
            clientRecordId,
            command.requestId,
          );
          if (!isCurrent()) return;
          const latest = await loadPendingClientProgramAssignment(
            userId,
            workspaceId,
            clientRecordId,
          );
          if (!isCurrent()) return;
          setLoaded({
            scope: operationScope,
            attempt,
            pending: latest,
            error: null,
          });
          if (latest) {
            setCommandError({ scope: operationScope, error: 'pendingExists' });
            return;
          }
          onAssignedRef.current?.(result);
        } catch (caught) {
          if (
            isCurrent() &&
            caught instanceof WorkspaceProgramAssignmentError &&
            (caught.code === 'notFound' || caught.code === 'conflict')
          ) {
            await clearPendingClientProgramAssignment(
              userId,
              workspaceId,
              clientRecordId,
              command.requestId,
            );
            if (!isCurrent()) return;
            const latest = await loadPendingClientProgramAssignment(
              userId,
              workspaceId,
              clientRecordId,
            );
            if (!isCurrent()) return;
            setLoaded({
              scope: operationScope,
              attempt,
              pending: latest,
              error: null,
            });
          }
          if (!isCurrent()) return;
          setCommandError({
            scope: operationScope,
            error:
              caught instanceof WorkspaceProgramAssignmentError
                ? caught.code
                : caught instanceof PendingClientProgramAssignmentError
                  ? caught.code === 'invalid'
                    ? 'invalidPending'
                    : 'storage'
                  : 'request',
          });
        }
      } catch (caught) {
        if (isCurrent())
          setCommandError({
            scope: operationScope,
            error:
              caught instanceof PendingClientProgramAssignmentError &&
              caught.code === 'invalid'
                ? 'invalidPending'
                : caught instanceof WorkspaceProgramAssignmentError
                  ? caught.code
                  : 'storage',
          });
      } finally {
        if (lock.current === lockToken) {
          lock.current = null;
          setBusyScope(null);
        }
      }
    },
    [
      attempt,
      busy,
      clientRecordId,
      loading,
      pending,
      ready,
      scope,
      userId,
      workspaceId,
    ],
  );

  return { pending, loading, busy, error, reload, assign };
}
