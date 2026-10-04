import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { getSupabaseClient } from '@/features/auth/client';
import { librarySessionId, WorkspaceLibrarySessionError } from './read-session';
import {
  archiveWorkspaceExerciseOperation,
  canonicalWorkspaceExerciseInput,
  createWorkspaceExerciseOperation,
  WorkspaceLibraryError,
  WorkspaceExerciseOutcomeError,
  type WorkspaceExerciseInput,
  type WorkspaceExerciseMutationScope,
  type WorkspaceLibraryOperation,
} from './service';

type Pending =
  | { kind: 'create'; id: string; input: WorkspaceExerciseInput }
  | { kind: 'archive'; id: string };
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const decode = (raw: string | null): Pending | null => {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (
    value === null ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      'completed' in value &&
      value.completed === true)
  )
    return null;
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('id' in value) ||
    !uuid(value.id) ||
    !('kind' in value)
  )
    throw new WorkspaceLibraryError('request');
  if (value.kind === 'archive') return { kind: 'archive', id: value.id };
  if (value.kind === 'create' && 'input' in value) {
    const input = canonicalWorkspaceExerciseInput(
      value.input as WorkspaceExerciseInput,
    );
    return { kind: 'create', id: value.id, input };
  }
  throw new WorkspaceLibraryError('request');
};
const queues = new Map<string, Promise<unknown>>();
const enqueue = <T>(key: string, run: () => Promise<T>): Promise<T> => {
  const result = (queues.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(run);
  queues.set(key, result);
  void result
    .finally(() => {
      if (queues.get(key) === result) queues.delete(key);
    })
    .catch(() => undefined);
  return result;
};

const verify = async (scope: WorkspaceExerciseMutationScope) => {
  if (scope.isCurrent?.() === false) throw new WorkspaceLibrarySessionError();
  const client = getSupabaseClient();
  if (!client) throw new WorkspaceLibrarySessionError();
  const result = await client.auth.getSession();
  if (
    scope.isCurrent?.() === false ||
    result.error ||
    result.data.session?.user.id !== scope.userId ||
    librarySessionId(result.data.session) !== scope.sessionId
  )
    throw new WorkspaceLibrarySessionError();
};

const clearPending = async (
  key: string,
  serialized: string,
  scope: WorkspaceExerciseMutationScope,
) => {
  await enqueue(key, async () => {
    await verify(scope);
    await AsyncStorage.setItem(`${key}:pending-clear`, serialized);
    await verify(scope);
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ completed: true }));
      await verify(scope);
    } catch (caught) {
      await AsyncStorage.setItem(key, serialized);
      throw caught;
    }
  });
  await verify(scope);
};

export function useExerciseCommands({
  userId,
  workspaceId,
  sessionId,
  ready,
  capture,
  refresh,
  acquire,
  release,
}: {
  userId: string;
  workspaceId: string;
  sessionId: string | null;
  ready: boolean;
  capture: () => WorkspaceExerciseMutationScope | null;
  refresh: () => Promise<void>;
  acquire: () => number | null;
  release: (owner: number) => void;
}) {
  const key = `panda-trainer-workspace-exercise-v1:${userId}:${workspaceId}`;
  const backupKey = `${key}:pending-clear`;
  const lifecycle = `${key}:${sessionId}:${ready}`;
  const activeLifecycle = useRef(lifecycle);
  const mounted = useRef(false);
  const version = useRef(0);
  const pending = useRef<Pending | null>(null);
  const operation = useRef<WorkspaceLibraryOperation<unknown> | null>(null);
  const lock = useRef<number | null>(null);
  const [hydrated, setHydrated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commandError, setCommandError] = useState<{
    scope: string;
    code: WorkspaceLibraryError['code'];
  } | null>(null);
  const setError = useCallback(
    (code: WorkspaceLibraryError['code'] | null) => {
      setCommandError(code ? { scope: lifecycle, code } : null);
    },
    [lifecycle],
  );
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    if (activeLifecycle.current === lifecycle) return;
    activeLifecycle.current = lifecycle;
    version.current += 1;
    operation.current?.dispose?.();
    operation.current = null;
  }, [lifecycle]);
  const scopeFor = useCallback(() => {
    const scope = capture();
    const generation = version.current;
    if (!scope || activeLifecycle.current !== lifecycle || !mounted.current)
      return null;
    return {
      ...scope,
      isCurrent: () =>
        mounted.current &&
        activeLifecycle.current === lifecycle &&
        version.current === generation &&
        scope.isCurrent?.() !== false,
    };
  }, [capture, lifecycle]);
  useEffect(() => {
    mounted.current = true;
    const generation = ++version.current;
    pending.current = null;
    operation.current?.dispose?.();
    operation.current = null;
    if (lock.current !== null) release(lock.current);
    lock.current = null;
    void Promise.resolve().then(() => {
      if (generation !== version.current) return;
      setBusy(false);
      setError(null);
      setHydrated(null);
    });
    const scope = scopeFor();
    if (ready && scope) {
      void enqueue(key, async () => {
        await verify(scope);
        const raw = await AsyncStorage.getItem(key);
        const main = decode(raw);
        await verify(scope);
        const backup =
          raw !== null ? null : decode(await AsyncStorage.getItem(backupKey));
        await verify(scope);
        return main ?? backup;
      })
        .then((value) => {
          if (generation !== version.current || scope.isCurrent?.() === false)
            return;
          pending.current = value;
          setHydrated(lifecycle);
        })
        .catch(() => {
          if (generation === version.current && scope.isCurrent?.() !== false)
            setError('request');
        });
    }
    return () => {
      mounted.current = false;
      version.current += 1;
      operation.current?.dispose?.();
      if (lock.current !== null) release(lock.current);
      lock.current = null;
    };
  }, [lifecycle, attempt, backupKey, key, ready, release, scopeFor, setError]);
  const submit = async (
    next: Pending,
    callerCurrent: () => boolean = () => true,
  ): Promise<boolean> => {
    if (!uuid(next.id)) return false;
    const captured = scopeFor();
    const scope = captured
      ? {
          ...captured,
          isCurrent: () => captured.isCurrent() && callerCurrent(),
        }
      : null;
    if (!scope || hydrated !== lifecycle || lock.current !== null) return false;
    if (
      pending.current &&
      (pending.current.kind !== next.kind ||
        (pending.current.kind === 'create' &&
          next.kind === 'create' &&
          JSON.stringify(pending.current.input) !==
            JSON.stringify(next.input)) ||
        (pending.current.kind === 'archive' && pending.current.id !== next.id))
    ) {
      setError('conflict');
      return false;
    }
    const owner = acquire();
    if (owner === null) return false;
    lock.current = owner;
    setBusy(true);
    setError(null);
    try {
      if (!pending.current) pending.current = next;
      const command = pending.current;
      const serialized = JSON.stringify(command);
      await enqueue(key, async () => {
        await verify(scope);
        await AsyncStorage.setItem(key, serialized);
        await verify(scope);
      });
      if (!operation.current) {
        operation.current =
          command.kind === 'create'
            ? createWorkspaceExerciseOperation(
                workspaceId,
                command.input,
                scope,
                command.id,
              )
            : archiveWorkspaceExerciseOperation(workspaceId, command.id, scope);
      }
      await operation.current.execute();
      await verify(scope);
      await refresh();
      await verify(scope);
      await clearPending(key, serialized, scope);
      pending.current = null;
      operation.current?.dispose?.();
      operation.current = null;
      return true;
    } catch (caught) {
      let error = caught;
      if (
        caught instanceof WorkspaceExerciseOutcomeError &&
        pending.current &&
        scope.isCurrent()
      ) {
        try {
          await clearPending(key, JSON.stringify(pending.current), scope);
          pending.current = null;
          operation.current?.dispose?.();
          operation.current = null;
        } catch (clearError) {
          error = clearError;
        }
      }
      if (scope.isCurrent())
        setError(
          error instanceof WorkspaceLibraryError ? error.code : 'request',
        );
      return false;
    } finally {
      release(owner);
      if (lock.current === owner) lock.current = null;
      if (scope.isCurrent?.() !== false) setBusy(false);
    }
  };
  return {
    scopeId: lifecycle,
    ready: hydrated === lifecycle,
    busy: hydrated === lifecycle && busy,
    error: commandError?.scope === lifecycle ? commandError.code : null,
    create: (input: WorkspaceExerciseInput, isCurrent?: () => boolean) =>
      submit(
        {
          kind: 'create',
          id: randomUUID(),
          input: canonicalWorkspaceExerciseInput(input),
        },
        isCurrent,
      ),
    archive: (id: string, isCurrent?: () => boolean) =>
      submit({ kind: 'archive', id }, isCurrent),
    cancel: () => {
      if (!mounted.current || activeLifecycle.current !== lifecycle) return;
      version.current += 1;
      operation.current?.dispose?.();
      operation.current = null;
      if (lock.current !== null) release(lock.current);
      lock.current = null;
      setBusy(false);
    },
    retry: (isCurrent?: () => boolean): Promise<boolean> => {
      if (hydrated !== lifecycle) {
        setAttempt((value) => value + 1);
        return Promise.resolve(false);
      }
      return pending.current
        ? submit(pending.current, isCurrent)
        : Promise.resolve(false);
    },
  };
}
