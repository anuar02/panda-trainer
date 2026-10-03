import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  WorkspaceLibraryProvider,
  useWorkspaceLibrary,
} from '../src/features/workspace-library/provider';
import {
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
  loadWorkspaceLibrary: jest.fn(),
  saveWorkspaceTemplateOperation: jest.fn(),
}));
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '41000000-0000-4000-8000-000000000001',
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
  expect(save).toHaveBeenCalledWith(template, null, 'user-a', requestId);
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
  );
});
