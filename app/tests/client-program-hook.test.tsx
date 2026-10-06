import { getSupabaseClient } from '../src/features/auth/client';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useClientProgram } from '../src/features/client-program/use-program';
import {
  ClientProgramError,
  loadLatestClientProgram,
  type ClientProgramData,
} from '../src/features/client-program/service';
let mockFocused = true;
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
jest.mock('../src/features/client-program/service', () => ({
  ...jest.requireActual<
    typeof import('../src/features/client-program/service')
  >('../src/features/client-program/service'),
  loadLatestClientProgram: jest.fn(),
}));
const load = jest.mocked(loadLatestClientProgram);
const scope = { userId: 'user-a', clientRecordId: 'card-a' };
const data: ClientProgramData = {
  context: {
    clientRecordId: 'card-a',
    workspaceId: 'workspace',
    timezone: 'UTC',
    clientName: 'Client',
    trainerName: 'Trainer',
  },
  program: null,
};
function deferred() {
  let resolve!: (value: ClientProgramData) => void;
  const promise = new Promise<ClientProgramData>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  mockFocused = true;
  load.mockReset();
});
test.each([{ userId: 'user-b' }, { clientRecordId: 'card-b' }])(
  'scope change hides old copy and ignores late response %p',
  async (change) => {
    const pending = deferred();
    load.mockResolvedValueOnce(data).mockReturnValueOnce(pending.promise);
    const hook = await renderHook(useClientProgram, { initialProps: scope });
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    await hook.rerender({ ...scope, ...change });
    expect(hook.result.current.data).toBeNull();
    load.mockResolvedValue(data);
    await hook.rerender(scope);
    await act(async () =>
      pending.resolve({
        ...data,
        context: { ...data.context, trainerName: 'Old' },
      }),
    );
    expect(hook.result.current.data?.context.trainerName).not.toBe('Old');
  },
);
test('blur discards pending response and refocus refreshes', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(data);
  const hook = await renderHook(useClientProgram, { initialProps: scope });
  mockFocused = false;
  await hook.rerender(scope);
  await act(async () => pending.resolve(data));
  expect(hook.result.current.data).toBeNull();
  mockFocused = true;
  await hook.rerender(scope);
  await waitFor(() => expect(hook.result.current.data).toEqual(data));
  expect(load).toHaveBeenCalledTimes(2);
});
test('typed error supports explicit retry', async () => {
  load
    .mockRejectedValueOnce(new ClientProgramError('unavailable'))
    .mockResolvedValueOnce(data);
  const hook = await renderHook(useClientProgram, { initialProps: scope });
  await waitFor(() => expect(hook.result.current.error).toBe('unavailable'));
  await act(async () => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.data).toEqual(data));
  expect(hook.result.current.error).toBeNull();
});

test('same-user logout/relogin hides old copy and discards late success', async () => {
  type Listener = (
    event: string,
    session: { user: { id: string }; access_token: string } | null,
  ) => void;
  let listener: Listener | undefined;
  const authSession = {
    user: { id: '11000000-0000-4000-8000-000000000001' },
    access_token: `header.${Buffer.from(JSON.stringify({ sub: '11000000-0000-4000-8000-000000000001', session_id: '51000000-0000-4000-8000-000000000001' })).toString('base64url')}.signature`,
  };
  const unsubscribe = jest.fn();
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      onAuthStateChange: (callback: Listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      },
      getSession: async () => ({ data: { session: authSession }, error: null }),
    },
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
  load.mockResolvedValue(data);
  const hook = await renderHook(useClientProgram, { initialProps: scope });
  await waitFor(() => expect(hook.result.current.data).toEqual(data));
  const readsBeforeRefresh = load.mock.calls.length;
  await act(async () => listener?.('TOKEN_REFRESHED', authSession));
  expect(load).toHaveBeenCalledTimes(readsBeforeRefresh);
  expect(hook.result.current.data).toEqual(data);
  const pending = deferred();
  load.mockReturnValue(pending.promise);
  await act(async () => {
    listener?.('SIGNED_OUT', null);
    listener?.('SIGNED_IN', authSession);
  });
  expect(hook.result.current.data).toBeNull();
  const next = deferred();
  load.mockReturnValue(next.promise);
  await act(async () => hook.result.current.retry());
  await act(async () =>
    pending.resolve({
      ...data,
      context: { ...data.context, trainerName: 'Old' },
    }),
  );
  expect(hook.result.current.data).toBeNull();
  await act(async () => next.resolve(data));
  expect(hook.result.current.data).toEqual(data);
  await hook.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  jest.mocked(getSupabaseClient).mockReset();
});
test('late error after retry cannot replace success and unmount invalidates read guard', async () => {
  let reject!: (error: unknown) => void;
  load
    .mockReturnValueOnce(
      new Promise<ClientProgramData>((_, fail) => {
        reject = fail;
      }),
    )
    .mockResolvedValueOnce(data);
  const hook = await renderHook(useClientProgram, { initialProps: scope });
  const initial = load.mock.calls[0]?.[0].isCurrent;
  await act(async () => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.data).toEqual(data));
  await act(async () => reject(new ClientProgramError('request')));
  expect(hook.result.current.error).toBeNull();
  expect(initial?.()).toBe(false);
  const latest = load.mock.calls.at(-1)?.[0].isCurrent;
  await hook.unmount();
  expect(latest?.()).toBe(false);
});
