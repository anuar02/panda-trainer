import type { ComponentProps, PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  WorkoutDemoProvider,
  useWorkoutDemo,
  workoutStorageKey,
} from '../src/features/workout-demo/provider';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';

type Storage = NonNullable<
  ComponentProps<typeof WorkoutDemoProvider>['storage']
>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mount(storage: Storage) {
  return renderHook(useWorkoutDemo, {
    wrapper: ({ children }: PropsWithChildren) => (
      <WorkoutDemoProvider storage={storage}>{children}</WorkoutDemoProvider>
    ),
  });
}

test('delayed hydration blocks actions and preserves the stored journal without writing defaults', async () => {
  const read = deferred<string | null>();
  const stored = workoutReducer(createWorkoutState(), {
    type: 'open',
    sessionId: 's1',
  });
  const storage = {
    getItem: jest.fn(() => read.promise),
    setItem: jest.fn(async () => {}),
  };
  const { result } = await mount(storage);
  expect(result.current.hydrated).toBe(false);
  expect(result.current.storageStatus).toBe('loading');
  await act(() => {
    expect(result.current.dispatch({ type: 'open', sessionId: 's6' })).toBe(
      false,
    );
  });
  expect(result.current.state.activeSessionId).toBeNull();
  expect(storage.setItem).not.toHaveBeenCalled();
  await act(() => read.resolve(JSON.stringify(stored)));
  expect(result.current.state).toEqual(stored);
  expect(result.current.hydrated).toBe(true);
  expect(storage.getItem).toHaveBeenCalledWith(workoutStorageKey);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test.each([
  ['invalid JSON', '{'],
  ['invalid shape', '{}'],
  ['future version', JSON.stringify({ ...createWorkoutState(), version: 2 })],
])('%s storage blocks writes even after retry', async (_name, raw) => {
  const storage = {
    getItem: jest.fn(async () => raw),
    setItem: jest.fn(async () => {}),
  };
  const { result } = await mount(storage);
  await waitFor(() => expect(result.current.readError).toBe(true));
  await act(() => {
    expect(result.current.dispatch({ type: 'open', sessionId: 's1' })).toBe(
      false,
    );
  });
  await act(() => result.current.retrySave());
  await waitFor(() => expect(result.current.storageStatus).toBe('error'));
  expect(storage.getItem).toHaveBeenCalledTimes(2);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(result.current.state).toEqual(createWorkoutState());
});

test('an opened journal and unfinished decimal draft survive provider remount', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: jest.fn(async () => raw),
    setItem: jest.fn(async (_key: string, value: string) => {
      raw = value;
    }),
  };
  const first = await mount(storage);
  await waitFor(() => expect(first.result.current.hydrated).toBe(true));
  await act(() => {
    first.result.current.dispatch({ type: 'open', sessionId: 's1' });
    first.result.current.dispatch({
      type: 'draft',
      clientId: 'c5',
      exerciseId: 'e1',
      setIndex: 0,
      draft: { kg: '8,', reps: '12' },
    });
  });
  await waitFor(() => expect(first.result.current.storageStatus).toBe('saved'));
  const saved = first.result.current.state;
  expect(saved.sessions.s1?.drafts.c5?.e1?.[0]).toEqual({
    kg: '8,',
    reps: '12',
  });
  await first.unmount();
  storage.setItem.mockClear();
  const restored = await mount(storage);
  await waitFor(() => expect(restored.result.current.hydrated).toBe(true));
  expect(restored.result.current.state).toEqual(saved);
  expect(restored.result.current.state.activeSessionId).toBe('s1');
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('failed save retains the in-memory journal and retry persists that same state', async () => {
  const storage = {
    getItem: jest.fn(async () => null),
    setItem: jest
      .fn<Promise<void>, [string, string]>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined),
  };
  const { result } = await mount(storage);
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(() => {
    result.current.dispatch({ type: 'open', sessionId: 's6' });
  });
  await waitFor(() => expect(result.current.storageStatus).toBe('error'));
  const unsaved = result.current.state;
  expect(unsaved.activeSessionId).toBe('s6');
  expect(result.current.readError).toBe(false);
  await act(() => result.current.retrySave());
  await waitFor(() => expect(result.current.storageStatus).toBe('saved'));
  expect(result.current.state).toBe(unsaved);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(storage.setItem).toHaveBeenLastCalledWith(
    workoutStorageKey,
    JSON.stringify(unsaved),
  );
});

test('queued writes run sequentially and an older completion cannot report the latest state saved', async () => {
  const firstWrite = deferred<void>();
  const secondWrite = deferred<void>();
  const storage = {
    getItem: jest.fn(async () => null),
    setItem: jest
      .fn<Promise<void>, [string, string]>()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise),
  };
  const { result } = await mount(storage);
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(() => {
    result.current.dispatch({ type: 'open', sessionId: 's1' });
    result.current.dispatch({ type: 'open', sessionId: 's6' });
  });
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(result.current.state.activeSessionId).toBe('s6');
  expect(JSON.parse(storage.setItem.mock.calls[0]![1]).activeSessionId).toBe(
    's1',
  );
  await act(() => firstWrite.resolve());
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(result.current.storageStatus).toBe('saving');
  expect(JSON.parse(storage.setItem.mock.calls[1]![1]).activeSessionId).toBe(
    's6',
  );
  await act(() => secondWrite.resolve());
  expect(result.current.storageStatus).toBe('saved');
});
