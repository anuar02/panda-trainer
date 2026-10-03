import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  openAssignmentSession,
  type AssignmentSession,
} from './assignment-session';
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

type AssignmentControl = {
  active: boolean;
  disposed: boolean;
  scope: string;
  attempt: number;
  session: AssignmentSession | null;
  lock: symbol | null;
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
  const [authGeneration, setAuthGeneration] = useState(0);
  const control = useRef<AssignmentControl | null>(null);
  const scopeKey = JSON.stringify([
    userId,
    workspaceId,
    clientRecordId,
    authGeneration,
  ]);
  const [scopeGeneration, setScopeGeneration] = useState({
    key: scopeKey,
    value: 0,
  });
  if (scopeGeneration.key !== scopeKey) {
    setScopeGeneration({ key: scopeKey, value: scopeGeneration.value + 1 });
  }
  const scope = JSON.stringify([scopeKey, scopeGeneration.value]);
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

  useLayoutEffect(() => {
    onAssignedRef.current = onAssigned;
  }, [onAssigned]);

  useLayoutEffect(() => {
    scopeRef.current = scope;
    const token: AssignmentControl = {
      active: true,
      disposed: false,
      scope,
      attempt,
      session: null,
      lock: null,
    };
    control.current = token;
    const isCurrent = () =>
      token.active &&
      control.current === token &&
      scopeRef.current === scope &&
      (token.session === null || token.session.valid());
    const finish = (value: Omit<LoadedPending, 'attempt'>) => {
      if (isCurrent()) setLoaded({ ...value, attempt });
    };
    if (!userId || !workspaceId) {
      void Promise.resolve().then(() =>
        finish({ scope, pending: null, error: 'unavailable' }),
      );
    } else {
      try {
        token.session = openAssignmentSession(userId, (canResume = true) => {
          if (
            token.disposed ||
            control.current !== token ||
            scopeRef.current !== scope
          )
            return;
          token.active = false;
          token.lock = null;
          setLoaded(
            canResume
              ? null
              : { scope, attempt, pending: null, error: 'unavailable' },
          );
          setBusyScope(null);
          setCommandError(null);
          if (canResume) setAuthGeneration((value) => value + 1);
        });
        void Promise.resolve()
          .then(async () => {
            if (!isCurrent()) return null;
            try {
              await token.session?.token(userId);
            } catch {
              throw new WorkspaceProgramAssignmentError('unavailable');
            }
            if (!isCurrent()) return null;
            return loadPendingClientProgramAssignment(
              userId,
              workspaceId,
              clientRecordId,
            );
          })
          .then(
            (value) => finish({ scope, pending: value, error: null }),
            (caught: unknown) =>
              finish({
                scope,
                pending: null,
                error:
                  caught instanceof WorkspaceProgramAssignmentError
                    ? caught.code
                    : caught instanceof PendingClientProgramAssignmentError &&
                        caught.code === 'invalid'
                      ? 'invalidPending'
                      : 'storage',
              }),
          );
      } catch (caught) {
        finish({
          scope,
          pending: null,
          error:
            caught instanceof WorkspaceProgramAssignmentError
              ? caught.code
              : 'unavailable',
        });
      }
    }
    return () => {
      token.active = false;
      token.disposed = true;
      token.lock = null;
      token.session?.dispose();
    };
  }, [attempt, clientRecordId, scope, userId, workspaceId]);

  const reload = useCallback(() => {
    const token = control.current;
    if (
      !token?.active ||
      token.scope !== scope ||
      token.attempt !== attempt ||
      scopeRef.current !== scope ||
      (token.session !== null && !token.session.valid())
    )
      return;
    setCommandError(null);
    setBusyScope(null);
    token.active = false;
    token.disposed = true;
    token.lock = null;
    token.session?.dispose();
    setAttempt((value) => value + 1);
  }, [attempt, scope]);

  const assign = useCallback(
    async (templateId?: string, expectedTemplateRevision?: number) => {
      const token = control.current;
      if (
        !token?.active ||
        token.scope !== scope ||
        token.attempt !== attempt ||
        scopeRef.current !== scope ||
        !token.session?.valid() ||
        token.lock ||
        loading ||
        busy ||
        !ready ||
        !userId ||
        !workspaceId
      )
        return;
      const operationScope = scope;
      const lockToken = Symbol();
      token.lock = lockToken;
      const isCurrent = () =>
        token.active &&
        control.current === token &&
        scopeRef.current === operationScope &&
        token.session?.valid() === true;
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
          session: token.session,
        });
        try {
          const result = await operation.execute();
          if (!isCurrent()) return;
          await clearPendingClientProgramAssignment(
            userId,
            workspaceId,
            clientRecordId,
            command.requestId,
            isCurrent,
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
              isCurrent,
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
        if (token.lock === lockToken) {
          token.lock = null;
          if (isCurrent()) setBusyScope(null);
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
