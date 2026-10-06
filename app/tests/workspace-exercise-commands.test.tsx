import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../src/features/auth/client';
import { useExerciseCommands } from '../src/features/workspace-library/exercise-commands';
import {
  createWorkspaceExerciseOperation,
  archiveWorkspaceExerciseOperation,
  WorkspaceLibraryError,
  WorkspaceExerciseOutcomeError,
  type WorkspaceExerciseMutationScope,
} from '../src/features/workspace-library/service';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '81000000-0000-4000-8000-000000000001'),
}));
jest.mock('../src/features/workspace-library/service', () => ({
  ...jest.requireActual('../src/features/workspace-library/service'),
  createWorkspaceExerciseOperation: jest.fn(),
  archiveWorkspaceExerciseOperation: jest.fn(),
}));
const user = '51000000-0000-4000-8000-000000000001';
const workspace = '61000000-0000-4000-8000-000000000001';
const login = 'a1000000-0000-4000-8000-000000000001';
const other = 'a1000000-0000-4000-8000-000000000002';
const id = '81000000-0000-4000-8000-000000000001';
const key = `panda-trainer-workspace-exercise-v1:${user}:${workspace}`;
const input = {
  name: 'Моя Ёлка',
  muscleGroup: 'Грудь',
  equipment: 'штанга',
  measure: 'reps' as const,
  bodyweight: false,
};
const token = (sessionId: string, sub = user) =>
  `h.${btoa(JSON.stringify({ sub, session_id: sessionId })).replace(/=/g, '')}.s`;
const create = jest.mocked(createWorkspaceExerciseOperation);
const archive = jest.mocked(archiveWorkspaceExerciseOperation);
let storage: Map<string, string>;
let active: string;
let bearer: string;
let sequence: number;
let owner: number | null;
let refresh: jest.Mock<Promise<void>, []>;
let execute: jest.Mock<Promise<unknown>, []>;
let dispose: jest.Mock;
let authBoundary: () => Promise<void>;
const capture = (): WorkspaceExerciseMutationScope => {
  const sessionId = active;
  return {
    userId: user,
    workspaceId: workspace,
    sessionId,
    isCurrent: () => active === sessionId,
  };
};
const acquire = () => {
  if (owner !== null) return null;
  owner = ++sequence;
  return owner;
};
const release = (value: number) => {
  if (owner === value) owner = null;
};
const mount = () =>
  renderHook<
    ReturnType<typeof useExerciseCommands>,
    { sessionId: string; userId: string; workspaceId: string }
  >(
    ({ sessionId, userId, workspaceId }) =>
      useExerciseCommands({
        userId,
        workspaceId,
        sessionId,
        ready: true,
        capture,
        acquire,
        release,
        refresh,
      }),
    {
      initialProps: { sessionId: login, userId: user, workspaceId: workspace },
    },
  );
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(randomUUID).mockReset().mockReturnValue(id);
  active = login;
  bearer = token(login);
  sequence = 0;
  owner = null;
  storage = new Map();
  authBoundary = async () => undefined;
  refresh = jest.fn(async () => undefined);
  execute = jest.fn(async () => ({}));
  dispose = jest.fn();
  create.mockImplementation(() => ({
    execute: execute as ReturnType<
      typeof createWorkspaceExerciseOperation
    >['execute'],
    dispose,
  }));
  archive.mockImplementation(() => ({
    execute: execute as ReturnType<
      typeof archiveWorkspaceExerciseOperation
    >['execute'],
    dispose,
  }));
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => storage.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: async () => {
        await authBoundary();
        return {
          data: { session: { user: { id: user }, access_token: bearer } },
          error: null,
        };
      },
    },
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
});
test('persists canonical command before IO and blocks double tap and changed payload', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const gate = deferred<unknown>();
  execute.mockImplementationOnce(() => gate.promise);
  let first: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    first = hook.result.current.create(input);
  });
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect(JSON.parse(storage.get(key)!)).toMatchObject({
    kind: 'create',
    id,
    input,
  });
  await act(async () => {
    expect(await hook.result.current.create(input)).toBe(false);
  });
  await act(async () => {
    gate.reject(new WorkspaceLibraryError('request'));
    expect(await first).toBe(false);
  });
  await act(async () => {
    expect(await hook.result.current.create({ ...input, name: 'Другой' })).toBe(
      false,
    );
  });
  expect(execute).toHaveBeenCalledTimes(1);
  await act(async () => {
    expect(await hook.result.current.create(input)).toBe(true);
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(JSON.parse(storage.get(key)!)).toEqual({ completed: true });
});
test('reopen restores replay UUID and full payload; another workspace has separate storage', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  execute.mockRejectedValueOnce(new Error('lost response'));
  await act(async () => {
    expect(await hook.result.current.create(input)).toBe(false);
  });
  await hook.unmount();
  const next = await mount();
  await waitFor(() => expect(next.result.current.ready).toBe(true));
  await act(async () => {
    expect(await next.result.current.create(input)).toBe(true);
  });
  expect(create.mock.calls[1]).toEqual([
    workspace,
    { ...input, aliases: [], instructions: [] },
    expect.objectContaining({
      userId: user,
      sessionId: login,
      workspaceId: workspace,
    }),
    id,
  ]);
});
test.each(['persist', 'backup', 'clear'] as const)(
  '%s storage failure cannot publish success and retains exact pending input',
  async (boundary) => {
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    let fail = true;
    jest
      .mocked(AsyncStorage.setItem)
      .mockImplementation(async (storageKey, value) => {
        const at =
          boundary === 'persist'
            ? storageKey === key && value.includes('create')
            : boundary === 'backup'
              ? storageKey.endsWith('pending-clear')
              : value.includes('completed');
        if (fail && at) {
          fail = false;
          throw new Error('storage');
        }
        storage.set(storageKey, value);
      });
    await act(async () => {
      expect(await hook.result.current.create(input)).toBe(false);
    });
    if (boundary === 'persist') expect(execute).not.toHaveBeenCalled();
    await act(async () => {
      expect(await hook.result.current.create({ ...input, name: 'new' })).toBe(
        false,
      );
    });
    await act(async () => {
      expect(await hook.result.current.create(input)).toBe(true);
    });
  },
);
test.each(['persist', 'network', 'refresh', 'backup', 'clear'] as const)(
  'same-user relogin during %s cannot publish/clear new state',
  async (boundary) => {
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    const gate = deferred<void>();
    let reached = false;
    if (boundary === 'network')
      execute.mockImplementationOnce(() => gate.promise);
    if (boundary === 'refresh')
      refresh.mockImplementationOnce(() => gate.promise);
    jest
      .mocked(AsyncStorage.setItem)
      .mockImplementation(async (storageKey, value) => {
        storage.set(storageKey, value);
        const at =
          boundary === 'persist'
            ? storageKey === key && value.includes('create')
            : boundary === 'backup'
              ? storageKey.endsWith('pending-clear')
              : boundary === 'clear'
                ? value.includes('completed')
                : false;
        if (at) {
          reached = true;
          await gate.promise;
        }
      });
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = hook.result.current.create(input);
    });
    await waitFor(() =>
      expect(
        boundary === 'network'
          ? execute.mock.calls.length
          : boundary === 'refresh'
            ? refresh.mock.calls.length
            : Number(reached),
      ).toBeGreaterThan(0),
    );
    await act(async () => {
      active = other;
      bearer = token(other);
    });
    await hook.rerender({
      sessionId: other,
      userId: user,
      workspaceId: workspace,
    });
    await act(async () => {
      gate.resolve();
      expect(await first).toBe(false);
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(JSON.parse(storage.get(key)!)).toMatchObject({
      kind: 'create',
      input: { name: input.name },
    });
    expect(hook.result.current.busy).toBe(false);
  },
);
test('late error/finally from cancelled submit cannot clear a newer lock', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const old = deferred<unknown>();
  const next = deferred<unknown>();
  execute
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => next.promise);
  let first: Promise<boolean> = Promise.resolve(false);
  let second: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    first = hook.result.current.create(input);
  });
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await act(async () => {
    hook.result.current.cancel();
    second = hook.result.current.create(input);
  });
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  const nextOwner = owner;
  await act(async () => {
    old.reject(new Error('late private error'));
    expect(await first).toBe(false);
  });
  expect(owner).toBe(nextOwner);
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.error).toBeNull();
  await act(async () => {
    next.resolve({});
    expect(await second).toBe(true);
  });
});
test('caller unmount during IO returns false, preserves pending and skips refresh', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const gate = deferred<unknown>();
  execute.mockImplementationOnce(() => gate.promise);
  let mounted = true;
  let first: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    first = hook.result.current.create(input, () => mounted);
  });
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await act(async () => {
    mounted = false;
    hook.result.current.cancel();
    gate.resolve({});
    expect(await first).toBe(false);
  });
  expect(refresh).not.toHaveBeenCalled();
  expect(JSON.parse(storage.get(key)!)).toMatchObject({ kind: 'create', id });
});
test('provider unmount disposes and prevents all late publication', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const gate = deferred<unknown>();
  execute.mockImplementationOnce(() => gate.promise);
  let first: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    first = hook.result.current.archive(id);
  });
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await hook.unmount();
  gate.resolve({});
  expect(await first).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalled();
  expect(owner).toBeNull();
});
test('wrong JWT claims fail before network; normal refresh preserves identity', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  bearer = token(login, other);
  await act(async () => {
    expect(await hook.result.current.create(input)).toBe(false);
  });
  expect(execute).not.toHaveBeenCalled();
  bearer = token(login) + 'refreshed';
  await act(async () => {
    expect(await hook.result.current.create(input)).toBe(true);
  });
});
test('every command auth await fences cancellation before storage/network/cache publication', async () => {
  for (let boundary = 1; boundary <= 12; boundary += 1) {
    active = login;
    bearer = token(login);
    storage.clear();
    owner = null;
    execute.mockClear();
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    let awaits = 0;
    authBoundary = async () => {
      awaits += 1;
      if (awaits === boundary) {
        active = other;
        bearer = token(other);
      }
    };
    let accepted = false;
    await act(async () => {
      accepted = await hook.result.current.create(input);
    });
    if (awaits >= boundary) expect(accepted).toBe(false);
    await hook.unmount();
    authBoundary = async () => undefined;
  }
});
test.each([
  'invalid',
  JSON.stringify({ kind: 'create', id: 'bad', input }),
  JSON.stringify({
    kind: 'create',
    id,
    input: { ...input, measure: 'meters' },
  }),
])('corrupt pending storage fails closed: %s', async (raw) => {
  storage.set(key, raw);
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.error).toBe('request'));
  expect(hook.result.current.ready).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});
test('main completion marker wins over old backup; missing main restores backup', async () => {
  storage.set(`${key}:pending-clear`, JSON.stringify({ kind: 'archive', id }));
  storage.set(key, JSON.stringify({ completed: true }));
  const first = await mount();
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  await act(async () => {
    expect(await first.result.current.create(input)).toBe(true);
  });
  await first.unmount();
  storage.delete(key);
  storage.set(`${key}:pending-clear`, JSON.stringify({ kind: 'archive', id }));
  const next = await mount();
  await waitFor(() => expect(next.result.current.ready).toBe(true));
  await act(async () => {
    expect(await next.result.current.create(input)).toBe(false);
  });
  await act(async () => {
    expect(await next.result.current.archive(id)).toBe(true);
  });
  expect(archive).toHaveBeenCalledWith(
    workspace,
    id,
    expect.objectContaining({ sessionId: login }),
  );
});

test.each(['main', 'backup'] as const)(
  'hydration is fenced during %s storage await',
  async (boundary) => {
    const gate = deferred<string | null>();
    let reached = false;
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (storageKey) => {
      if (
        (boundary === 'main' && storageKey === key) ||
        (boundary === 'backup' && storageKey.endsWith('pending-clear'))
      ) {
        reached = true;
        return gate.promise;
      }
      return null;
    });
    const hook = await mount();
    await waitFor(() => expect(reached).toBe(true));
    active = other;
    bearer = token(other);
    await act(() => {
      gate.resolve(JSON.stringify({ kind: 'create', id, input }));
    });
    expect(hook.result.current.ready).toBe(false);
    await act(async () => {
      expect(await hook.result.current.create(input)).toBe(false);
    });
    expect(execute).not.toHaveBeenCalled();
  },
);

test('clear and compensation failure retain recoverable backup, never success', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  let clearing = false;
  jest
    .mocked(AsyncStorage.setItem)
    .mockImplementation(async (storageKey, value) => {
      if (storageKey === key && value.includes('completed')) {
        clearing = true;
        storage.delete(key);
        throw new Error('clear');
      }
      if (storageKey === key && clearing) throw new Error('compensation');
      storage.set(storageKey, value);
    });
  await act(async () => {
    expect(await hook.result.current.create(input)).toBe(false);
  });
  expect(JSON.parse(storage.get(`${key}:pending-clear`)!)).toMatchObject({
    kind: 'create',
    id,
  });
  await hook.unmount();
  jest
    .mocked(AsyncStorage.setItem)
    .mockImplementation(async (storageKey, value) => {
      storage.set(storageKey, value);
    });
  const next = await mount();
  await waitFor(() => expect(next.result.current.ready).toBe(true));
  await act(async () => {
    expect(await next.result.current.create(input)).toBe(true);
  });
  expect(create.mock.calls[1]?.[3]).toBe(id);
});

test.each(['duplicate', 'unavailable'] as const)(
  'known %s outcome clears pending safely and permits a new command',
  async (code) => {
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    execute.mockRejectedValueOnce(new WorkspaceExerciseOutcomeError(code));
    await act(async () => {
      expect(await hook.result.current.create(input)).toBe(false);
    });
    expect(hook.result.current.error).toBe(code);
    expect(JSON.parse(storage.get(key)!)).toEqual({ completed: true });
    jest.mocked(randomUUID).mockReturnValueOnce(other);
    await act(async () => {
      expect(
        await hook.result.current.create({ ...input, name: 'Новое' }),
      ).toBe(true);
    });
    expect(create.mock.calls[1]?.[3]).toBe(other);
  },
);

test('known duplicate with cleanup failure remains pending for safe retry', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  execute.mockRejectedValue(new WorkspaceExerciseOutcomeError('duplicate'));
  let fail = true;
  jest
    .mocked(AsyncStorage.setItem)
    .mockImplementation(async (storageKey, value) => {
      if (fail && value.includes('completed')) {
        fail = false;
        throw new Error('clear');
      }
      storage.set(storageKey, value);
    });
  await act(async () => {
    expect(await hook.result.current.create(input)).toBe(false);
  });
  expect(hook.result.current.error).toBe('request');
  expect(JSON.parse(storage.get(key)!)).toMatchObject({ kind: 'create', id });
  await act(async () => {
    expect(await hook.result.current.create({ ...input, name: 'Новое' })).toBe(
      false,
    );
  });
  expect(execute).toHaveBeenCalledTimes(1);
  await act(async () => {
    expect(await hook.result.current.create(input)).toBe(false);
  });
  expect(hook.result.current.error).toBe('duplicate');
  expect(JSON.parse(storage.get(key)!)).toEqual({ completed: true });
});
