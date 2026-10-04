import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';
import { watchNotifications } from '@/features/notifications/realtime';
import { scope, deferred, userId } from './fixtures';
import { clientReadToken } from '../client-read-auth-fixture';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function setup() {
  let session = { user: { id: userId }, access_token: scope.token } as Session;
  const listeners = new Set<
    (event: AuthChangeEvent, session: Session | null) => void
  >();
  const main = {
    auth: {
      getSession: jest.fn(async () => ({ data: { session }, error: null })),
      getUser: jest.fn(async () => ({
        data: { user: { id: userId } },
        error: null,
      })),
      onAuthStateChange: (
        listener: (event: AuthChangeEvent, session: Session | null) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
    },
  };
  let notify = () => {};
  let status = (_status: string) => {};
  const channel = {
    on: jest.fn(
      (_type: string, _filter: unknown, callback: () => void): unknown => {
        notify = callback;
        return channel;
      },
    ),
    subscribe: jest.fn((callback: (status: string) => void): unknown => {
      status = callback;
      return channel;
    }),
  };
  const client = {
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(async () => {}),
    realtime: { setAuth: jest.fn(async () => {}), disconnect: jest.fn() },
  };
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(main as unknown as SupabaseClient<Database>);
  jest
    .mocked(createClient)
    .mockReturnValue(client as unknown as ReturnType<typeof createClient>);
  return {
    main,
    client,
    channel,
    listeners,
    notify: () => notify(),
    status: (value: string) => status(value),
    change: (event: AuthChangeEvent, token: string) => {
      session = { ...session, access_token: token };
      listeners.forEach((listener) => listener(event, session));
    },
  };
}
beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://synthetic.example.test';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-key';
});
afterEach(() => {
  jest.resetAllMocks();
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});
test('own filtered channel reconciles replay, out-of-order signals and reconnect, never applies payload', async () => {
  const n = setup();
  const read = jest.fn();
  const fail = jest.fn();
  const stop = watchNotifications(scope, read, fail);
  await flush();
  expect(n.channel.on).toHaveBeenCalledWith(
    'postgres_changes',
    expect.objectContaining({
      table: 'notifications',
      filter: `recipient_user_id=eq.${userId}`,
    }),
    expect.any(Function),
  );
  expect(n.channel.on.mock.calls.map((call) => call[1])).toEqual([
    expect.objectContaining({ event: 'INSERT' }),
    expect.objectContaining({ event: 'UPDATE' }),
  ]);
  n.status('SUBSCRIBED');
  n.notify();
  n.notify();
  await flush();
  expect(read).toHaveBeenCalledTimes(3);
  expect(fail).not.toHaveBeenCalled();
  n.status('CHANNEL_ERROR');
  expect(fail).toHaveBeenCalledTimes(1);
  n.status('SUBSCRIBED');
  await flush();
  expect(read).toHaveBeenCalledTimes(4);
  stop();
  expect(n.listeners.size).toBe(0);
  expect(n.client.removeChannel).toHaveBeenCalledWith(n.channel);
  expect(n.client.realtime.disconnect).toHaveBeenCalled();
  n.notify();
  n.status('CHANNEL_ERROR');
  await flush();
  expect(read).toHaveBeenCalledTimes(4);
  expect(fail).toHaveBeenCalledTimes(1);
});
test('verified same-session refresh updates only isolated realtime client; relogin stops old channel and late errors', async () => {
  const n = setup();
  const read = jest.fn();
  const fail = jest.fn();
  watchNotifications(scope, read, fail);
  await flush();
  const token = clientReadToken(userId, undefined, 'verified');
  n.change('TOKEN_REFRESHED', token);
  await flush();
  expect(n.client.realtime.setAuth).toHaveBeenCalledWith(token);
  n.change(
    'SIGNED_IN',
    clientReadToken(userId, '11000000-0000-4000-8000-000000000088'),
  );
  expect(n.client.removeChannel).toHaveBeenCalledTimes(1);
  const calls = read.mock.calls.length;
  const errors = fail.mock.calls.length;
  n.status('CHANNEL_ERROR');
  n.notify();
  await flush();
  expect(read).toHaveBeenCalledTimes(calls);
  expect(fail).toHaveBeenCalledTimes(errors);
});
test.each(['logout', 'caller', 'abort'] as const)(
  'startup %s fences deferred verified user success/error and creates no channel',
  async (mode) => {
    const n = setup();
    const gate = deferred<{ data: { user: { id: string } }; error: null }>();
    n.main.auth.getUser.mockImplementation(() => gate.promise);
    const read = jest.fn();
    const fail = jest.fn();
    let current = true;
    const abort = new AbortController();
    const stop = watchNotifications(
      { ...scope, isCurrent: () => current, signal: abort.signal },
      read,
      fail,
    );
    await flush();
    if (mode === 'logout') n.change('SIGNED_OUT', scope.token);
    else if (mode === 'caller') {
      current = false;
      stop();
    } else abort.abort();
    gate.reject(new Error('late auth error'));
    await flush();
    expect(n.client.channel).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(n.listeners.size).toBe(0);
    expect(fail).toHaveBeenCalledTimes(mode === 'logout' ? 1 : 0);
  },
);
test('unverified token drift fails; old channel callbacks cannot operate in a new workspace/caller', async () => {
  const n = setup();
  const read = jest.fn();
  const fail = jest.fn();
  let current = true;
  const stop = watchNotifications(
    { ...scope, isCurrent: () => current },
    read,
    fail,
  );
  await flush();
  current = false;
  n.notify();
  n.status('CHANNEL_ERROR');
  await flush();
  expect(read).not.toHaveBeenCalled();
  expect(fail).not.toHaveBeenCalled();
  stop();
  const next = setup();
  watchNotifications(scope, read, fail);
  await flush();
  next.change(
    'INITIAL_SESSION',
    clientReadToken(userId, undefined, 'unverified'),
  );
  await flush();
  expect(fail).toHaveBeenCalledTimes(1);
  expect(next.client.removeChannel).toHaveBeenCalledTimes(1);
});
