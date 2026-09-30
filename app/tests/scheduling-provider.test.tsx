import type { ComponentProps, PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  SchedulingDemoProvider,
  useSchedulingDemo,
} from '../src/features/scheduling-demo/provider';
import {
  createSchedulingState,
  createSessionDraft,
  decodeSchedulingState,
  encodeSchedulingState,
  schedulingStorageKey,
} from '../src/domain/scheduling';
import type { SchedulingAction } from '../src/domain/scheduling';

type Storage = NonNullable<
  ComponentProps<typeof SchedulingDemoProvider>['storage']
>;
const create: SchedulingAction = {
  type: 'create',
  id: 'new',
  draft: createSessionDraft({
    clientIds: ['c1'],
    date: '2026-09-16',
    start: '18:00',
    programLater: true,
  }),
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount(storage: Storage) {
  return renderHook(useSchedulingDemo, {
    wrapper: ({ children }: PropsWithChildren) => (
      <SchedulingDemoProvider storage={storage}>
        {children}
      </SchedulingDemoProvider>
    ),
  });
}

test('workout hydration gate blocks writes until registration and protects completed sessions', async () => {
  const storage = {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
  };
  const { result } = await renderHook(useSchedulingDemo, {
    wrapper: ({ children }: PropsWithChildren) => (
      <SchedulingDemoProvider storage={storage} waitForWorkout>
        {children}
      </SchedulingDemoProvider>
    ),
  });
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(() => {
    expect(result.current.dispatch(create)).toMatchObject({
      ok: false,
      error: 'unavailable',
    });
  });
  expect(storage.setItem).not.toHaveBeenCalled();
  await act(() => {
    result.current.registerFinished(['s8']);
    expect(
      result.current.dispatch({
        type: 'accept',
        requestId: 'r1',
        expectedRevision: 0,
      }),
    ).toMatchObject({ ok: false, error: 'unavailable' });
    expect(result.current.dispatch(create).ok).toBe(true);
  });
  await waitFor(() => expect(result.current.storageStatus).toBe('saved'));
  expect(
    result.current.state.sessions.find((session) => session.id === 's8')?.date,
  ).toBe('2026-09-17');
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

test('hydration blocks creation and never overwrites stored proposals with defaults', async () => {
  const read = deferred<string | null>();
  const storage = {
    getItem: jest.fn(() => read.promise),
    setItem: jest.fn(async () => {}),
  };
  const { result } = await mount(storage);
  await act(() => {
    expect(result.current.dispatch(create)).toMatchObject({
      ok: false,
      error: 'unavailable',
    });
  });
  expect(storage.setItem).not.toHaveBeenCalled();
  const state = createSchedulingState();
  await act(() => read.resolve(encodeSchedulingState(state)));
  expect(result.current.state).toEqual(state);
  expect(result.current.hydrated).toBe(true);
  expect(storage.getItem).toHaveBeenCalledWith(schedulingStorageKey);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test.each(['{', '{}', '{"version":2,"state":{}}'])(
  'invalid storage %s blocks writes through retry',
  async (raw) => {
    const storage = {
      getItem: jest.fn(async () => raw),
      setItem: jest.fn(async () => {}),
    };
    const { result } = await mount(storage);
    await waitFor(() => expect(result.current.readError).toBe(true));
    await act(() => {
      expect(result.current.dispatch(create).ok).toBe(false);
      result.current.retrySave();
    });
    await waitFor(() => expect(result.current.storageStatus).toBe('error'));
    expect(storage.getItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem).not.toHaveBeenCalled();
  },
);

test('a failed read can recover without writing defaults', async () => {
  const storage = {
    getItem: jest
      .fn<Promise<string | null>, [string]>()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue(null),
    setItem: jest.fn(async () => {}),
  };
  const { result } = await mount(storage);
  await waitFor(() => expect(result.current.readError).toBe(true));
  await act(() => result.current.retrySave());
  await waitFor(() => expect(result.current.storageStatus).toBe('saved'));
  expect(result.current.readError).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('client actor cannot create or respond to a different client request', async () => {
  const storage = {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
  };
  const { result } = await mount(storage);
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(() => {
    expect(
      result.current.dispatch(create, { role: 'client', clientId: 'c1' }),
    ).toMatchObject({ error: 'forbidden' });
    expect(
      result.current.dispatch(
        { type: 'withdraw', requestId: 'r2', expectedRevision: 0 },
        { role: 'client', clientId: 'c1' },
      ),
    ).toMatchObject({ error: 'forbidden' });
  });
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('created proposals survive remount and failed writes retry the same state', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: jest.fn(async () => raw),
    setItem: jest
      .fn<Promise<void>, [string, string]>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockImplementation(async (_key, value) => {
        raw = value;
      }),
  };
  const first = await mount(storage);
  await waitFor(() => expect(first.result.current.hydrated).toBe(true));
  await act(() => {
    expect(first.result.current.dispatch(create).ok).toBe(true);
  });
  await waitFor(() => expect(first.result.current.storageStatus).toBe('error'));
  const unsaved = first.result.current.state;
  expect(unsaved.sessions.at(-1)?.status).toBe('proposed');
  await act(() => first.result.current.retrySave());
  await waitFor(() => expect(first.result.current.storageStatus).toBe('saved'));
  expect(storage.setItem).toHaveBeenLastCalledWith(
    schedulingStorageKey,
    encodeSchedulingState(unsaved),
  );
  await first.unmount();
  storage.setItem.mockClear();
  const restored = await mount(storage);
  await waitFor(() => expect(restored.result.current.hydrated).toBe(true));
  expect(restored.result.current.state).toEqual(unsaved);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('queued writes preserve newest counter and earlier completions cannot mark it saved', async () => {
  const one = deferred<void>();
  const two = deferred<void>();
  const storage = {
    getItem: jest.fn(async () => null),
    setItem: jest
      .fn<Promise<void>, [string, string]>()
      .mockImplementationOnce(() => one.promise)
      .mockImplementationOnce(() => two.promise),
  };
  const { result } = await mount(storage);
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(() => {
    result.current.dispatch(create);
    result.current.dispatch({
      type: 'counter',
      requestId: 'r1',
      expectedRevision: 0,
      to: { date: '2026-09-19', start: '12:00' },
    });
  });
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  await act(() => one.resolve());
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(result.current.storageStatus).toBe('saving');
  expect(
    decodeSchedulingState(storage.setItem.mock.calls[1]![1])?.requests.r1
      ?.counter?.start,
  ).toBe('12:00');
  await act(() => two.resolve());
  expect(result.current.storageStatus).toBe('saved');
});
