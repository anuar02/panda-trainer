import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import { randomUUID } from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  WorkspaceLibraryProvider,
  useWorkspaceLibrary,
} from '../src/features/workspace-library/provider';
import {
  createWorkspaceExerciseOperation,
  archiveWorkspaceExerciseOperation,
  loadWorkspaceLibrary,
  saveWorkspaceTemplateOperation,
  type WorkspaceLibrary,
} from '../src/features/workspace-library/service';
import { WorkspaceLibrarySessionError } from '../src/features/workspace-library/read-session';
import { decodeWorkspaceDraft } from '../src/features/workspace-library/draft';
import type {
  WorkspaceLibraryExercise,
  WorkspaceWorkoutTemplate,
} from '../src/features/workspace-library/adapter';

jest.mock('../src/features/workspace-library/service', () => ({
  ...jest.requireActual('../src/features/workspace-library/service'),
  createWorkspaceExerciseOperation: jest.fn(),
  archiveWorkspaceExerciseOperation: jest.fn(),
  loadWorkspaceLibrary: jest.fn(),
  saveWorkspaceTemplateOperation: jest.fn(),
}));
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '41000000-0000-4000-8000-000000000001'),
}));

const exercise: WorkspaceLibraryExercise = {
  id: '81000000-0000-4000-8000-000000000001',
  name: 'Приседания',
  group: 'Ноги',
  equipment: 'штанга',
  aliases: [],
  instructions: [],
  sourceKey: 'e0',
  archivedAt: null,
  revision: 1,
  measure: 'reps',
  bodyweight: false,
};
const template: WorkspaceWorkoutTemplate = {
  id: '91000000-0000-4000-8000-000000000001',
  name: 'Низ А',
  description: '',
  custom: true,
  revision: 3,
  archivedAt: null,
  exercises: [
    {
      id: exercise.id,
      name: exercise.name,
      sets: 3,
      reps: '10',
      target: 5,
      rest: 90,
      unit: 'повт',
      lineId: 'line',
      lineRevision: 1,
      position: 0,
      note: 'Темп',
      plannedWeightG: 5000,
      exercise,
    },
  ],
};
const load = jest.mocked(loadWorkspaceLibrary);
const save = jest.mocked(saveWorkspaceTemplateOperation);
const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);
let data: WorkspaceLibrary;
let storage: Map<string, string>;
const sessionFor = (
  userId: string,
  sessionId = 'a1000000-0000-4000-8000-000000000001',
) =>
  ({
    user: { id: userId },
    access_token: `header.${btoa(
      JSON.stringify({ sub: userId, session_id: sessionId }),
    )
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')}.signature`,
  }) as Session;
let session: Session;
const listeners = new Set<
  (event: AuthChangeEvent, next: Session | null) => void
>();
const emit = (event: AuthChangeEvent, next: Session | null) => {
  for (const listener of listeners) listener(event, next);
};
const mount = (userId = 'user-a') => {
  session = sessionFor(userId);
  return renderHook(() => useWorkspaceLibrary(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <WorkspaceLibraryProvider
        userId={userId}
        workspaceId="61000000-0000-4000-8000-000000000001"
      >
        {children}
      </WorkspaceLibraryProvider>
    ),
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  jest
    .mocked(randomUUID)
    .mockImplementation(() => '41000000-0000-4000-8000-000000000001');
  save.mockReset();
  save.mockReturnValue({
    execute: jest.fn(async () => ({
      id: template.id,
      revision: 4,
      replayed: false,
    })),
  });
  session = sessionFor('user-a');
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: jest.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: jest.fn(
        (listener: (event: AuthChangeEvent, next: Session | null) => void) => {
          listeners.add(listener);
          return {
            data: {
              subscription: { unsubscribe: () => listeners.delete(listener) },
            },
          };
        },
      ),
    },
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
  storage = new Map();
  data = { exercises: [exercise], templates: [template] };
  load.mockImplementation(async () => data);
  getItem.mockImplementation(async (key) => storage.get(key) ?? null);
  setItem.mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
});

test('draft and edit revision restore only for the same account and workspace', async () => {
  const first = await mount();
  await waitFor(() => expect(first.result.current.editor.ready).toBe(true));
  await act(() => {
    first.result.current.editor.begin(template.id);
  });
  await waitFor(() => expect(first.result.current.editor.status).toBe('saved'));
  expect(decodeWorkspaceDraft([...storage.values()][0]!).baseRevision).toBe(3);
  await first.unmount();
  const other = await mount('user-b');
  await waitFor(() => expect(other.result.current.editor.ready).toBe(true));
  expect(other.result.current.editor.draft).toBeNull();
  await other.unmount();
  const restored = await mount();
  await waitFor(() =>
    expect(restored.result.current.editor.draft?.id).toBe(template.id),
  );
  expect(restored.result.current.editor.draft?.exercises[0]?.target).toBe('5');
});

test('server success followed by draft-clear failure retries the same operation without duplicate-name rejection', async () => {
  data = { exercises: [exercise], templates: [] };
  const execute = jest.fn(async () => {
    data = { exercises: [exercise], templates: [template] };
    return { id: template.id, revision: 1, replayed: false };
  });
  save.mockReturnValue({ execute });
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => {
    hook.result.current.editor.begin();
    hook.result.current.editor.update({
      id: null,
      name: template.name,
      description: '',
      exercises: [
        {
          id: exercise.id,
          name: exercise.name,
          sets: '3',
          reps: '10',
          target: '5',
          rest: '90',
          unit: 'повт',
        },
      ],
    });
  });
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  let failClear = true;
  setItem.mockImplementation(async (key, raw) => {
    if (failClear && decodeWorkspaceDraft(raw).draft === null) {
      failClear = false;
      throw new Error('full');
    }
    storage.set(key, raw);
  });
  await act(async () => {
    expect(await hook.result.current.editor.save()).toEqual({
      ok: false,
      error: 'storage',
    });
  });
  expect(hook.result.current.editor.draft).not.toBeNull();
  await act(async () => {
    const result = await hook.result.current.editor.save();
    expect(result.ok && result.template.id).toBe(template.id);
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(hook.result.current.editor.draft).toBeNull();
});

test('corrupt draft hydration blocks writes and preserves stored data', async () => {
  getItem.mockResolvedValue('{broken');
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.readError).toBe(true));
  await act(() => {
    expect(hook.result.current.editor.begin()).toBe(false);
  });
  expect(setItem).not.toHaveBeenCalled();
});

test('pending save restores its request ID after restart even when the template already exists', async () => {
  const requestId = 'a1000000-0000-4000-8000-000000000001';
  getItem.mockResolvedValue(
    JSON.stringify({
      draft: {
        id: null,
        name: template.name,
        description: '',
        exercises: [
          {
            id: exercise.id,
            name: exercise.name,
            sets: '3',
            reps: '10',
            target: '5',
            rest: '90',
            unit: 'повт',
          },
        ],
      },
      baseRevision: null,
      pendingSave: { template, requestId, expectedRevision: null },
    }),
  );
  const execute = jest.fn(async () => ({
    id: template.id,
    revision: 3,
    replayed: true,
  }));
  save.mockReturnValue({ execute });
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  expect(save).toHaveBeenCalledWith(
    template,
    null,
    'user-a',
    requestId,
    expect.objectContaining({
      userId: 'user-a',
      sessionId: expect.any(String),
      isCurrent: expect.any(Function),
    }),
  );
  await act(async () => {
    expect((await hook.result.current.editor.save()).ok).toBe(true);
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(1);
});

test('draft decoder rejects an edit missing its expected revision', () => {
  expect(() =>
    decodeWorkspaceDraft(
      JSON.stringify({
        draft: {
          id: template.id,
          name: 'Низ А',
          description: '',
          exercises: [],
        },
        baseRevision: null,
      }),
    ),
  ).toThrow();
  expect(decodeWorkspaceDraft(null)).toEqual({
    draft: null,
    baseRevision: null,
  });
});

test('unmount while the pending command is being persisted prevents its network submission', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => {
    hook.result.current.editor.begin(template.id);
  });
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  let release: (() => void) | null = null;
  setItem.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  let saving: ReturnType<typeof hook.result.current.editor.save> | null = null;
  await act(() => {
    saving = hook.result.current.editor.save();
  });
  await waitFor(() => expect(release).not.toBeNull());
  await hook.unmount();
  const complete = release as (() => void) | null;
  complete?.();
  expect(await saving).toEqual({ ok: false, error: 'storage' });
  expect(save).not.toHaveBeenCalled();
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

test('a late refresh cannot overwrite a newer catalog', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  const old = deferred<WorkspaceLibrary>();
  load.mockImplementationOnce(() => old.promise);
  let first!: Promise<void>;
  await act(() => {
    first = hook.result.current.refresh();
  });
  const rejected = expect(first).rejects.toThrow();
  data = { exercises: [], templates: [] };
  await act(async () => {
    await hook.result.current.refresh();
    old.resolve({ exercises: [exercise], templates: [template] });
    await rejected;
  });
  expect(hook.result.current.library).toEqual(data);
});

test('auth invalidation hides data and rejects a late reload without replacing the durable draft', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => {
    hook.result.current.editor.begin(template.id);
  });
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  const stored = [...storage.values()][0];
  const late = deferred<WorkspaceLibrary>();
  load.mockImplementationOnce(() => late.promise);
  let reload!: Promise<void>;
  await act(() => {
    reload = hook.result.current.reloadServerDraft();
  });
  const rejected = expect(reload).rejects.toThrow();
  await act(() => emit('SIGNED_OUT', null));
  expect(hook.result.current.library).toEqual({ exercises: [], templates: [] });
  expect(hook.result.current.editor.draft).toBeNull();
  expect(hook.result.current.editor.ready).toBe(false);
  await act(async () => {
    late.resolve({ exercises: [], templates: [{ ...template, revision: 9 }] });
    await rejected;
  });
  expect([...storage.values()][0]).toBe(stored);
  expect(hook.result.current.editor.draft).toBeNull();
});

test('retry supersedes an old initial read and ignores its late rejection', async () => {
  const late = deferred<WorkspaceLibrary>();
  load.mockImplementationOnce(() => late.promise);
  const hook = await mount();
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(() => hook.result.current.editor.retry());
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(async () => late.reject(new Error('old failure')));
  expect(hook.result.current.editor.readError).toBe(false);
  expect(hook.result.current.library.templates).toEqual([template]);
});

test('unmount rejects a pending refresh and removes its auth subscription', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  const late = deferred<WorkspaceLibrary>();
  load.mockImplementationOnce(() => late.promise);
  const refreshing = hook.result.current.refresh();
  const rejected = expect(refreshing).rejects.toThrow();
  await hook.unmount();
  late.resolve(data);
  await rejected;
  expect(listeners.size).toBe(0);
});

test('same-session token refresh retains data while a different session fails closed', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => emit('TOKEN_REFRESHED', sessionFor('user-a')));
  expect(hook.result.current.editor.ready).toBe(true);
  await act(() =>
    emit(
      'TOKEN_REFRESHED',
      sessionFor('user-a', 'b1000000-0000-4000-8000-000000000001'),
    ),
  );
  expect(hook.result.current.editor.ready).toBe(false);
  expect(hook.result.current.library.templates).toEqual([]);
});

test('auth change during save refresh retains pending save and its request ID for retry', async () => {
  const execute = jest.fn(async () => ({
    id: template.id,
    revision: 3,
    replayed: false,
  }));
  save.mockReturnValue({ execute });
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => {
    hook.result.current.editor.begin(template.id);
  });
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  const late = deferred<WorkspaceLibrary>();
  load.mockImplementationOnce(() => late.promise);
  let saving!: ReturnType<typeof hook.result.current.editor.save>;
  await act(() => {
    saving = hook.result.current.editor.save();
  });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  const pending = decodeWorkspaceDraft([...storage.values()][0]!).pendingSave;
  expect(pending).toBeDefined();
  await act(() => emit('SIGNED_OUT', null));
  await act(async () => {
    late.resolve(data);
    await saving;
  });
  expect(decodeWorkspaceDraft([...storage.values()][0]!).pendingSave).toEqual(
    pending,
  );
  await hook.unmount();
  const restored = await mount();
  await waitFor(() => expect(restored.result.current.editor.ready).toBe(true));
  expect(save).toHaveBeenLastCalledWith(
    pending?.template,
    3,
    'user-a',
    pending?.requestId,
    expect.objectContaining({
      userId: 'user-a',
      sessionId: expect.any(String),
      isCurrent: expect.any(Function),
    }),
  );
});

test('an old initial success cannot publish into a changed workspace', async () => {
  let workspaceId = '61000000-0000-4000-8000-000000000001';
  const old = deferred<WorkspaceLibrary>();
  load.mockImplementationOnce(() => old.promise);
  const hook = await renderHook(() => useWorkspaceLibrary(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <WorkspaceLibraryProvider userId="user-a" workspaceId={workspaceId}>
        {children}
      </WorkspaceLibraryProvider>
    ),
  });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  data = { exercises: [], templates: [] };
  workspaceId = '61000000-0000-4000-8000-000000000002';
  await hook.rerender({});
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(async () =>
    old.resolve({ exercises: [exercise], templates: [template] }),
  );
  expect(hook.result.current.library).toEqual(data);
});

test('a save from an invalidated session cannot clear a restored pending command', async () => {
  const late = deferred<{ id: string; revision: number; replayed: boolean }>();
  save.mockReturnValue({ execute: jest.fn(() => late.promise) });
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => {
    hook.result.current.editor.begin(template.id);
  });
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  let saving!: ReturnType<typeof hook.result.current.editor.save>;
  await act(() => {
    saving = hook.result.current.editor.save();
  });
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const stored = [...storage.values()][0];
  await act(() => emit('SIGNED_OUT', null));
  session = sessionFor('user-a', 'b1000000-0000-4000-8000-000000000001');
  await act(() => hook.result.current.editor.retry());
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(async () => {
    late.resolve({ id: template.id, revision: 4, replayed: false });
    expect(await saving).toEqual({ ok: false, error: 'storage' });
  });
  expect([...storage.values()][0]).toBe(stored);
  expect(hook.result.current.editor.draft?.id).toBe(template.id);
  expect(load).toHaveBeenCalledTimes(2);
  expect(hook.result.current.editor.busy).toBe(false);
});

test('a verified read session failure hides a previously loaded catalog', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  load.mockRejectedValueOnce(new WorkspaceLibrarySessionError());
  await act(async () => {
    await expect(hook.result.current.refresh()).rejects.toBeInstanceOf(
      WorkspaceLibrarySessionError,
    );
  });
  expect(hook.result.current.editor.ready).toBe(false);
  expect(hook.result.current.editor.readError).toBe(true);
  expect(hook.result.current.library.templates).toEqual([]);
});

test('retry hydration waits for pending command persistence before restoring its request ID', async () => {
  save.mockReturnValue({
    execute: jest.fn(async () => ({
      id: template.id,
      revision: 3,
      replayed: true,
    })),
  });
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => {
    hook.result.current.editor.begin(template.id);
  });
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  const pendingWrite = deferred<void>();
  setItem.mockImplementationOnce(async (key, raw) => {
    await pendingWrite.promise;
    storage.set(key, raw);
  });
  let saving!: ReturnType<typeof hook.result.current.editor.save>;
  await act(() => {
    saving = hook.result.current.editor.save();
  });
  await waitFor(() => expect(setItem).toHaveBeenCalledTimes(2));
  await act(() => emit('SIGNED_OUT', null));
  session = sessionFor('user-a', 'b1000000-0000-4000-8000-000000000001');
  await act(() => hook.result.current.editor.retry());
  expect(hook.result.current.editor.ready).toBe(false);
  await act(async () => {
    pendingWrite.resolve();
    expect(await saving).toEqual({ ok: false, error: 'storage' });
  });
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  const pending = decodeWorkspaceDraft([...storage.values()][0]!).pendingSave;
  expect(pending).toBeDefined();
  expect(save).toHaveBeenCalledWith(
    pending?.template,
    3,
    'user-a',
    pending?.requestId,
    expect.objectContaining({
      userId: 'user-a',
      sessionId: expect.any(String),
      isCurrent: expect.any(Function),
    }),
  );
});

test.each(['event', 'silent', 'compensation-failure'])(
  'relogin during successful clear restores pending and suppresses ok true: %s',
  async (mode) => {
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
    await act(() => hook.result.current.editor.begin(template.id));
    await waitFor(() =>
      expect(hook.result.current.editor.status).toBe('saved'),
    );
    const clear = deferred<void>();
    let clearing = false;
    setItem.mockImplementation(async (key, raw) => {
      if (
        !key.endsWith(':pending-clear') &&
        decodeWorkspaceDraft(raw).draft === null
      ) {
        clearing = true;
        await clear.promise;
      } else if (
        mode === 'compensation-failure' &&
        clearing &&
        !key.endsWith(':pending-clear')
      ) {
        throw new Error('full');
      }
      storage.set(key, raw);
    });
    let saving!: ReturnType<typeof hook.result.current.editor.save>;
    await act(() => {
      saving = hook.result.current.editor.save();
    });
    await waitFor(() => expect(clearing).toBe(true));
    await act(() => {
      if (mode === 'silent')
        session = sessionFor('user-a', 'b1000000-0000-4000-8000-000000000001');
      else emit('SIGNED_IN', session);
    });
    if (mode !== 'silent') expect(hook.result.current.editor.busy).toBe(false);
    await act(async () => {
      clear.resolve();
      expect(await saving).toEqual({ ok: false, error: 'storage' });
    });
    const retained = decodeWorkspaceDraft(
      [...storage.entries()].find(([key]) =>
        key.endsWith(':pending-clear'),
      )![1],
    );
    expect(retained.pendingSave?.expectedRevision).toBe(3);
    expect(retained.draft).not.toBeNull();
    await act(() => hook.result.current.editor.retry());
    await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[3]).toBe(retained.pendingSave?.requestId);
  },
);

test.each(['session', 'scope'])(
  'old finally does not unlock a new save after recovery and double tap: %s',
  async (mode) => {
    const old = deferred<{ id: string; revision: number; replayed: boolean }>();
    const newer = deferred<{
      id: string;
      revision: number;
      replayed: boolean;
    }>();
    const oldExecute = jest.fn(() => old.promise);
    const newExecute = jest.fn(() => newer.promise);
    save
      .mockReturnValueOnce({ execute: oldExecute })
      .mockReturnValueOnce({ execute: newExecute });
    let workspaceId = '61000000-0000-4000-8000-000000000001';
    const hook = await renderHook(() => useWorkspaceLibrary(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <WorkspaceLibraryProvider userId="user-a" workspaceId={workspaceId}>
          {children}
        </WorkspaceLibraryProvider>
      ),
    });
    await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
    await act(() => hook.result.current.editor.begin(template.id));
    await waitFor(() =>
      expect(hook.result.current.editor.status).toBe('saved'),
    );
    let first!: ReturnType<typeof hook.result.current.editor.save>;
    await act(() => {
      first = hook.result.current.editor.save();
    });
    await waitFor(() => expect(oldExecute).toHaveBeenCalledTimes(1));
    if (mode === 'session') {
      await act(() => {
        session = sessionFor('user-a', 'b1000000-0000-4000-8000-000000000001');
        emit('SIGNED_IN', session);
        hook.result.current.editor.retry();
      });
    } else {
      workspaceId = '61000000-0000-4000-8000-000000000002';
      await hook.rerender({});
    }
    await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
    expect(hook.result.current.commandError).toBeNull();
    expect(hook.result.current.editor.busy).toBe(false);
    if (mode === 'scope') {
      await act(() => hook.result.current.editor.begin(template.id));
      await waitFor(() =>
        expect(hook.result.current.editor.status).toBe('saved'),
      );
    }
    let second!: ReturnType<typeof hook.result.current.editor.save>;
    await act(() => {
      second = hook.result.current.editor.save();
    });
    await waitFor(() => expect(newExecute).toHaveBeenCalledTimes(1));
    await act(async () => {
      old.resolve({ id: template.id, revision: 4, replayed: false });
      expect(await first).toEqual({ ok: false, error: 'storage' });
    });
    expect(hook.result.current.editor.busy).toBe(true);
    await act(async () =>
      expect(await hook.result.current.editor.save()).toEqual({
        ok: false,
        error: 'storage',
      }),
    );
    expect(newExecute).toHaveBeenCalledTimes(1);
    await act(async () => {
      newer.resolve({ id: template.id, revision: 4, replayed: true });
      expect((await second).ok).toBe(true);
    });
    expect(hook.result.current.editor.busy).toBe(false);
  },
);

test('backup cleanup failure allows receipt retry after unmount and a newer pending command wins hydration', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => hook.result.current.editor.begin(template.id));
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  setItem.mockImplementation(async (key, raw) => {
    if (
      key.endsWith(':pending-clear') &&
      decodeWorkspaceDraft(raw).draft === null
    )
      throw new Error('full');
    storage.set(key, raw);
  });
  await act(async () =>
    expect((await hook.result.current.editor.save()).ok).toBe(true),
  );
  const backup = [...storage.entries()].find(([key]) =>
    key.endsWith(':pending-clear'),
  )!;
  const old = decodeWorkspaceDraft(backup[1]);
  await hook.unmount();
  const restored = await mount();
  await waitFor(() => expect(restored.result.current.editor.ready).toBe(true));
  expect(save.mock.calls.at(-1)?.[3]).toBe(old.pendingSave?.requestId);
  await restored.unmount();
  const mainKey = backup[0].replace(/:pending-clear$/, '');
  const newer = {
    ...old,
    pendingSave: {
      ...old.pendingSave!,
      requestId: 'c1000000-0000-4000-8000-000000000001',
    },
  };
  storage.set(mainKey, JSON.stringify(newer));
  const newest = await mount();
  await waitFor(() => expect(newest.result.current.editor.ready).toBe(true));
  expect(save.mock.calls.at(-1)?.[3]).toBe(newer.pendingSave.requestId);
});

test('normal token refresh while clear awaits permits success and leaves no recoverable pending backup', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => hook.result.current.editor.begin(template.id));
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  const clear = deferred<void>();
  let clearing = false;
  setItem.mockImplementation(async (key, raw) => {
    if (
      !key.endsWith(':pending-clear') &&
      decodeWorkspaceDraft(raw).draft === null
    ) {
      clearing = true;
      await clear.promise;
    }
    storage.set(key, raw);
  });
  let saving!: ReturnType<typeof hook.result.current.editor.save>;
  await act(() => {
    saving = hook.result.current.editor.save();
  });
  await waitFor(() => expect(clearing).toBe(true));
  await act(async () => {
    session = { ...session, access_token: `${session.access_token}-refreshed` };
    emit('TOKEN_REFRESHED', session);
    clear.resolve();
    expect((await saving).ok).toBe(true);
  });
  await hook.unmount();
  const reopened = await mount();
  await waitFor(() => expect(reopened.result.current.editor.ready).toBe(true));
  expect(reopened.result.current.editor.draft).toBeNull();
});

test('exercise create attaches to a template draft and archive preserves existing template details', async () => {
  const created = {
    ...exercise,
    id: '81000000-0000-4000-8000-000000000002',
    sourceKey: null,
    name: 'Моя Ёлка',
  };
  const attached = {
    ...template,
    exercises: [
      {
        ...template.exercises[0]!,
        id: created.id,
        name: created.name,
        exercise: created,
      },
    ],
  };
  save.mockReturnValue({
    execute: jest.fn(async () => {
      data = { ...data, templates: [attached] };
      return { id: template.id, revision: 4, replayed: false };
    }),
  });
  jest.mocked(createWorkspaceExerciseOperation).mockReturnValue({
    execute: jest.fn(async () => {
      data = { ...data, exercises: [created] };
      return { exercise: created, existing: false };
    }),
  });
  jest.mocked(archiveWorkspaceExerciseOperation).mockReturnValue({
    execute: jest.fn(async () => {
      data = {
        exercises: [],
        templates: [
          {
            ...template,
            exercises: [
              {
                ...attached.exercises[0]!,
                exercise: { ...created, archivedAt: '2026-10-04T12:00:00Z' },
                name: created.name,
              },
            ],
          },
        ],
      };
      return { exerciseId: created.id, archivedAt: '2026-10-04T12:00:00Z' };
    }),
  });
  const hook = await mount();
  await waitFor(() =>
    expect(hook.result.current.exerciseCommands.ready).toBe(true),
  );
  await act(async () => {
    expect(
      await hook.result.current.exerciseCommands.create({
        name: created.name,
        muscleGroup: created.group,
        equipment: created.equipment,
        measure: created.measure,
        bodyweight: created.bodyweight,
      }),
    ).toBe(true);
  });
  expect(hook.result.current.library.exercises[0]?.name).toBe(created.name);
  await act(() => {
    hook.result.current.editor.begin(template.id);
  });
  await act(() => {
    const draft = hook.result.current.editor.draft!;
    hook.result.current.editor.update({
      ...draft,
      exercises: draft.exercises.map((line) => ({
        ...line,
        id: created.id,
        name: created.name,
      })),
    });
  });
  await waitFor(() => expect(hook.result.current.editor.status).toBe('saved'));
  await act(async () => {
    expect((await hook.result.current.editor.save()).ok).toBe(true);
  });
  expect(save.mock.calls[0]?.[0].exercises[0]).toMatchObject({
    id: created.id,
    name: created.name,
  });
  await act(() => {
    hook.result.current.editor.begin(template.id);
  });
  const before = hook.result.current.editor.draft;
  await act(async () => {
    expect(await hook.result.current.exerciseCommands.archive(created.id)).toBe(
      true,
    );
  });
  expect(hook.result.current.library.exercises).toEqual([]);
  expect(hook.result.current.library.templates[0]?.exercises[0]).toMatchObject({
    name: created.name,
    plannedWeightG: 5000,
    note: 'Темп',
    exercise: { archivedAt: '2026-10-04T12:00:00Z' },
  });
  expect(hook.result.current.editor.draft).toEqual(before);
});

test('exercise command owns shared provider lock and late completion cannot publish after logout', async () => {
  let resolve: (value: {
    exercise: WorkspaceLibraryExercise;
    existing: boolean;
  }) => void = () => undefined;
  const execute = jest.fn(
    () =>
      new Promise<{ exercise: WorkspaceLibraryExercise; existing: boolean }>(
        (done) => {
          resolve = done;
        },
      ),
  );
  jest
    .mocked(createWorkspaceExerciseOperation)
    .mockReturnValue({ execute, dispose: jest.fn() });
  const hook = await mount();
  await waitFor(() =>
    expect(hook.result.current.exerciseCommands.ready).toBe(true),
  );
  let promise: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    promise = hook.result.current.exerciseCommands.create({
      name: 'Свое',
      muscleGroup: 'Ноги',
      equipment: 'штанга',
      measure: 'reps',
      bodyweight: false,
    });
  });
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await act(() => {
    expect(hook.result.current.editor.begin(template.id)).toBe(false);
  });
  await act(() => {
    emit('SIGNED_OUT', null);
  });
  await act(async () => {
    resolve({ exercise, existing: false });
    expect(await promise).toBe(false);
  });
  expect(hook.result.current.library.exercises).toEqual([]);
  expect(hook.result.current.editor.ready).toBe(false);
});

test('unresolved save keeps immutable pending input through edit and copy attempts', async () => {
  save.mockReturnValue({
    execute: jest.fn(async () => {
      throw new Error('lost response');
    }),
  });
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => hook.result.current.editor.begin(template.id));
  await act(async () => {
    expect((await hook.result.current.editor.save()).ok).toBe(false);
  });
  const pending = decodeWorkspaceDraft(
    storage.get(
      'panda-trainer-workspace-template-v1:user-a:61000000-0000-4000-8000-000000000001',
    ) ?? null,
  ).pendingSave;
  const before = hook.result.current.editor.draft;
  await act(() => {
    hook.result.current.editor.update({ ...before!, name: 'Changed' });
    expect(hook.result.current.editor.begin(template.id, true)).toBe(false);
  });
  expect(hook.result.current.editor.draft).toBe(before);
  expect(hook.result.current.editor.pendingSave).toBe(true);
  expect(
    decodeWorkspaceDraft(
      storage.get(
        'panda-trainer-workspace-template-v1:user-a:61000000-0000-4000-8000-000000000001',
      ) ?? null,
    ).pendingSave,
  ).toEqual(pending);
  await act(async () => {
    expect(await hook.result.current.editor.discard()).toBe(true);
  });
  await act(() => {
    expect(hook.result.current.editor.begin()).toBe(true);
  });
});

test('create edit copy save read keeps order, archived references, exact grams, null, zero and cues', async () => {
  let uuid = 0;
  jest
    .mocked(randomUUID)
    .mockImplementation(
      () => `41000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    );
  const timed = {
    ...exercise,
    id: '81000000-0000-4000-8000-000000000002',
    name: 'Своя планка',
    sourceKey: null,
    measure: 'seconds' as const,
  };
  const timedLine = {
    ...template.exercises[0]!,
    id: timed.id,
    name: timed.name,
    exercise: timed,
    unit: 'сек' as const,
    reps: '45–60 сек',
    target: 0,
    plannedWeightG: null,
    rest: 0,
    position: 1,
    note: null,
  };
  data = { exercises: [exercise, timed], templates: [] };
  let count = 0;
  save.mockImplementation((input) => ({
    execute: jest.fn(async () => {
      count += 1;
      const id = input.id;
      const stored = {
        ...template,
        ...input,
        revision: 3 + count,
        archivedAt: null,
        exercises: input.exercises.map((line, position) => ({
          ...line,
          position,
          lineId: `line-${position}`,
          lineRevision: 1,
          exercise:
            line.id === timed.id
              ? timed
              : { ...exercise, archivedAt: '2026-10-04T12:00:00Z' },
          note: 'note' in line ? (line.note as string | null) : null,
          plannedWeightG:
            'plannedWeightG' in line
              ? (line.plannedWeightG as number | null)
              : 0,
        })),
      };
      data = {
        exercises: [timed],
        templates: [...data.templates.filter((t) => t.id !== id), stored],
      };
      return { id, revision: stored.revision, replayed: false };
    }),
  }));
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => hook.result.current.editor.begin());
  await act(() =>
    hook.result.current.editor.update({
      id: null,
      name: 'Низ А',
      description: 'Заметка',
      exercises: [template.exercises[0]!, timedLine].map((line) => ({
        ...line,
        sets: String(line.sets),
        reps: line.reps.replace(' сек', ''),
        target: String(line.target),
        rest: String(line.rest),
      })),
    }),
  );
  await act(async () => {
    expect((await hook.result.current.editor.save()).ok).toBe(true);
  });
  const id = hook.result.current.library.templates[0]!.id;
  await act(() => hook.result.current.editor.begin(id));
  await act(() =>
    hook.result.current.editor.update({
      ...hook.result.current.editor.draft!,
      exercises: [...hook.result.current.editor.draft!.exercises].reverse(),
    }),
  );
  await act(async () => {
    expect((await hook.result.current.editor.save()).ok).toBe(true);
  });
  expect(
    hook.result.current.library.templates[0]!.exercises.map((line) => line.id),
  ).toEqual([timed.id, exercise.id]);
  expect(save.mock.calls[1]![1]).toBe(4);
  await act(() => hook.result.current.editor.begin(id, true));
  expect(hook.result.current.editor.draft!.id).toBeNull();
  expect(hook.result.current.editor.draft!.name).toBe('Низ А — копия');
  await act(async () => {
    expect((await hook.result.current.editor.save()).ok).toBe(true);
  });
  expect(save.mock.calls[2]![1]).toBeNull();
  expect(save.mock.calls[2]![0].exercises).toMatchObject([
    {
      id: timed.id,
      unit: 'сек',
      reps: '45–60 сек',
      target: 0,
      rest: 0,
      plannedWeightG: null,
    },
    { id: exercise.id, target: 5, plannedWeightG: 5000, note: 'Темп' },
  ]);
  expect(hook.result.current.editor.draft).toBeNull();
  expect(load).toHaveBeenCalledTimes(4);
  expect(hook.result.current.library.templates).toHaveLength(2);
  expect(hook.result.current.library.templates[1]!.id).not.toBe(id);
});

test('explicit reload retains the old pending draft if storage fails, then permits next save after durable replacement', async () => {
  save.mockReturnValueOnce({
    execute: jest.fn(async () => {
      throw new Error('conflict');
    }),
  });
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => hook.result.current.editor.begin(template.id));
  await act(async () => {
    expect((await hook.result.current.editor.save()).ok).toBe(false);
  });
  const before = hook.result.current.editor.draft;
  const key =
    'panda-trainer-workspace-template-v1:user-a:61000000-0000-4000-8000-000000000001';
  const raw = storage.get(key);
  setItem.mockRejectedValueOnce(new Error('disk full'));
  await act(async () => {
    await expect(hook.result.current.reloadServerDraft()).rejects.toMatchObject(
      { code: 'request' },
    );
  });
  expect(hook.result.current.editor.draft).toBe(before);
  expect(storage.get(key)).toBe(raw);
  data = {
    ...data,
    templates: [{ ...template, revision: 9, description: 'С сервера' }],
  };
  await act(async () => {
    await hook.result.current.reloadServerDraft();
  });
  expect(hook.result.current.editor.draft?.description).toBe('С сервера');
  expect(
    decodeWorkspaceDraft(storage.get(key) ?? null).pendingSave,
  ).toBeUndefined();
  save.mockReturnValue({
    execute: jest.fn(async () => ({
      id: template.id,
      revision: 10,
      replayed: false,
    })),
  });
  await act(async () => {
    expect((await hook.result.current.editor.save()).ok).toBe(true);
  });
  expect(save.mock.calls[1]![1]).toBe(9);
});

test('editor caller scope survives catalog and verified refresh but expires on a new draft and relogin', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.editor.ready).toBe(true));
  await act(() => hook.result.current.editor.begin(template.id));
  const scope = hook.result.current.editor.scope;
  const caller = hook.result.current.editor.capture!();
  await act(async () => {
    await hook.result.current.refresh();
  });
  await act(() => emit('TOKEN_REFRESHED', sessionFor('user-a')));
  expect(caller()).toBe(true);
  expect(hook.result.current.editor.scope).toBe(scope);
  await act(() => hook.result.current.editor.begin(template.id, true));
  expect(caller()).toBe(false);
  const next = hook.result.current.editor.capture!();
  await act(() =>
    emit(
      'SIGNED_IN',
      sessionFor('user-a', 'a1000000-0000-4000-8000-000000000002'),
    ),
  );
  expect(next()).toBe(false);
});
