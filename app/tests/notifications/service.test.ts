import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';
import { notificationService } from '@/features/notifications/service';
import { clientReadToken } from '../client-read-auth-fixture';
import { deferred, page, row, scope, userId } from './fixtures';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
function setup(result: unknown = page()) {
  let session = { user: { id: userId }, access_token: scope.token } as Session;
  const listeners = new Set<
    (event: AuthChangeEvent, session: Session | null) => void
  >();
  const rpc = jest.fn();
  const io = jest.fn(async () => ({ data: result, error: null }));
  const headers: Record<string, string> = {};
  const client = {
    auth: {
      getSession: jest.fn(async () => ({ data: { session }, error: null })),
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
    rpc: (...args: unknown[]) => {
      rpc(...args);
      return {
        setHeader: (key: string, value: string) => {
          headers[key] = value;
          return { abortSignal: () => io() };
        },
      };
    },
  };
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(client as unknown as SupabaseClient<Database>);
  return {
    client,
    rpc,
    io,
    headers,
    listeners,
    change(event: AuthChangeEvent, token: string) {
      session = { ...session, access_token: token };
      listeners.forEach((listener) => listener(event, session));
    },
  };
}
afterEach(() => jest.resetAllMocks());
test('service uses explicit bearer, bounded cursor RPC, real read mutation and safe target', async () => {
  const network = setup();
  expect(
    await notificationService.page(scope, {
      at: row(2).created_at,
      id: row(2).id,
    }),
  ).toEqual(page());
  expect(network.rpc).toHaveBeenCalledWith(
    'notification_feed',
    expect.objectContaining({
      p_limit: 50,
      p_workspace_id: scope.workspaceId,
      p_client_record_id: scope.clientRecordId,
      p_before_id: row(2).id,
    }),
  );
  expect(network.headers.Authorization).toBe(`Bearer ${scope.token}`);
  expect(network.listeners.size).toBe(0);
  setup(row(1, true));
  expect(
    (await notificationService.mark(scope, row().id)).read_at,
  ).not.toBeNull();
  setup({
    available: false,
    target_type: 'booking',
    target_id: row().target_id,
    client_record_id: scope.clientRecordId,
    current: null,
  });
  expect((await notificationService.target(scope, row().id)).available).toBe(
    false,
  );
});
test.each(['page', 'mark', 'target'] as const)(
  'same-user relogin and late error fenced during %s',
  async (kind) => {
    const network = setup();
    const io = deferred<{ data: unknown; error: null }>();
    network.io.mockImplementation(() => io.promise);
    const result =
      kind === 'page'
        ? notificationService.page(scope, null)
        : notificationService[kind](scope, row().id);
    await Promise.resolve();
    await Promise.resolve();
    network.change(
      'SIGNED_IN',
      clientReadToken(userId, '11000000-0000-4000-8000-000000000088'),
    );
    io.resolve({ data: kind === 'page' ? page() : row(1, true), error: null });
    await expect(result).rejects.toThrow();
    expect(network.listeners.size).toBe(0);
  },
);
test('verified token refresh allowed; unexplained token replacement and aborted caller fail closed', async () => {
  const network = setup();
  network.client.auth.getSession.mockImplementationOnce(async () => {
    network.change(
      'TOKEN_REFRESHED',
      clientReadToken(userId, undefined, 'refresh'),
    );
    return {
      data: {
        session: {
          user: { id: userId },
          access_token: clientReadToken(userId, undefined, 'refresh'),
        } as Session,
      },
      error: null,
    };
  });
  expect(await notificationService.page(scope, null)).toEqual(page());
  const drift = setup();
  drift.change(
    'INITIAL_SESSION',
    clientReadToken(userId, undefined, 'unverified'),
  );
  await expect(notificationService.page(scope, null)).rejects.toThrow();
  const abort = new AbortController();
  abort.abort();
  await expect(
    notificationService.page({ ...scope, signal: abort.signal }, null),
  ).rejects.toThrow();
});
