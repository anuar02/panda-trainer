import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  archiveWorkspaceTemplateOperation,
  saveWorkspaceTemplateOperation,
} from '../src/features/workspace-library/service';
import type { LibraryReadSession } from '../src/features/workspace-library/read-session';
import type { Database } from '../src/lib/database.types';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'a1000000-0000-4000-8000-000000000001',
}));
const userId = '51000000-0000-4000-8000-000000000001';
const sessionId = 'a1000000-0000-4000-8000-000000000001';
const templateId = '91000000-0000-4000-8000-000000000001';
const sessionFor = (
  sub = userId,
  sid = sessionId,
  nonce = 0,
): LibraryReadSession => ({
  user: { id: userId },
  access_token: `header.${btoa(JSON.stringify({ sub, session_id: sid, nonce })).replace(/=/g, '')}.signature`,
});
let session: LibraryReadSession | null;
let listeners: Set<
  (event: AuthChangeEvent, session: LibraryReadSession | null) => void
>;
let rpc: jest.Mock;
let header: jest.Mock;
const receipt = { id: templateId, revision: 4, replayed: false };
const emit = (event: AuthChangeEvent, next: LibraryReadSession | null) => {
  session = next;
  for (const listener of listeners) listener(event, next);
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(() => {
  listeners = new Set();
  session = sessionFor();
  header = jest.fn().mockResolvedValue({ data: receipt, error: null });
  rpc = jest.fn(() => ({ setHeader: header }));
  jest.mocked(getSupabaseClient).mockReturnValue({
    rpc,
    auth: {
      getSession: jest.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: (
        listener: (
          event: AuthChangeEvent,
          next: LibraryReadSession | null,
        ) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
    },
  } as unknown as SupabaseClient<Database>);
});
const factories = [
  [
    'save',
    () =>
      saveWorkspaceTemplateOperation(
        {
          id: templateId,
          name: 'План',
          description: '',
          exercises: [
            {
              id: '81000000-0000-4000-8000-000000000001',
              name: 'Присед',
              sets: 3,
              reps: '10',
              rest: 90,
              target: 0,
              unit: 'повт',
            },
          ],
        },
        3,
        userId,
      ),
  ],
  ['archive', () => archiveWorkspaceTemplateOperation(templateId, 3)],
] as const;

describe.each(factories)('%s synthetic transport', (_name, create) => {
  test('pins bearer and shares double tap while guarding cached success', async () => {
    const operation = create();
    expect(
      await Promise.all([operation.execute(), operation.execute()]),
    ).toEqual([receipt, receipt]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(header).toHaveBeenCalledWith(
      'Authorization',
      `Bearer ${session!.access_token}`,
    );
    emit('SIGNED_IN', sessionFor());
    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  test.each(['SIGNED_IN', 'SIGNED_OUT'] as const)(
    'rejects %s before dispatch',
    async (event) => {
      const operation = create();
      emit(event, event === 'SIGNED_OUT' ? null : sessionFor());
      await expect(operation.execute()).rejects.toMatchObject({
        code: 'unavailable',
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  test.each([
    sessionFor('wrong-sub'),
    sessionFor(userId, 'bad'),
    { user: { id: userId }, access_token: 'malformed' },
    sessionFor(userId, 'b1000000-0000-4000-8000-000000000001'),
  ])('malformed or mismatching refresh fails closed', async (next) => {
    const operation = create();
    await operation.execute();
    emit('TOKEN_REFRESHED', next);
    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
  test('normal refresh keeps identity across dispatch and cache', async () => {
    const operation = create();
    await operation.execute();
    emit('TOKEN_REFRESHED', sessionFor(userId, sessionId, 1));
    await expect(operation.execute()).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  test('refresh during RPC keeps the dispatched bearer explicit', async () => {
    const response = deferred<{ data: typeof receipt; error: null }>();
    header.mockReturnValue(response.promise);
    const operation = create();
    const token = session!.access_token;
    const execution = operation.execute();
    while (rpc.mock.calls.length === 0) await Promise.resolve();
    emit('TOKEN_REFRESHED', sessionFor(userId, sessionId, 2));
    response.resolve({ data: receipt, error: null });
    await expect(execution).resolves.toEqual(receipt);
    expect(header).toHaveBeenCalledWith('Authorization', `Bearer ${token}`);
  });
  test.each([null, { code: '40001', message: 'private' }])(
    'rejects relogin after RPC on success or error',
    async (error) => {
      const response = deferred<{
        data: typeof receipt;
        error: typeof error;
      }>();
      header.mockReturnValue(response.promise);
      const operation = create();
      const execution = operation.execute();
      const rejected = expect(execution).rejects.toMatchObject({
        code: 'unavailable',
      });
      while (rpc.mock.calls.length === 0) await Promise.resolve();
      emit('SIGNED_IN', sessionFor());
      response.resolve({ data: receipt, error });
      await rejected;
    },
  );
  test('detects silent session replacement and strips transport secrets', async () => {
    const operation = create();
    await operation.execute();
    session = sessionFor(userId, 'b1000000-0000-4000-8000-000000000001');
    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
    const retry = create();
    header.mockRejectedValue(new Error('credential-secret'));
    await expect(retry.execute()).rejects.toMatchObject({
      code: 'request',
      message: 'Workspace library request could not be completed',
    });
  });
});
