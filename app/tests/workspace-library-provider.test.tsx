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
const mount = (userId = 'user-a') =>
  renderHook(() => useWorkspaceLibrary(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <WorkspaceLibraryProvider
        userId={userId}
        workspaceId="61000000-0000-4000-8000-000000000001"
      >
        {children}
      </WorkspaceLibraryProvider>
    ),
  });

beforeEach(() => {
  jest.clearAllMocks();
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
