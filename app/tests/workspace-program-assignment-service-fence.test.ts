import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import { openAssignmentSession } from '@/features/workspace-programs/assignment-session';
import { createAssignClientProgramOperation } from '@/features/workspace-programs/service';
import type { Database } from '@/lib/database.types';

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'a1000000-0000-4000-8000-000000000001',
}));
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));

const userId = '51000000-0000-4000-8000-000000000001';
const programId = '91000000-0000-4000-8000-000000000001';
const input = {
  expectedUserId: userId,
  clientRecordId: '71000000-0000-4000-8000-000000000001',
  templateId: '81000000-0000-4000-8000-000000000001',
  expectedTemplateRevision: 1,
};
const success = {
  data: { id: programId, revision: 1, replayed: false },
  error: null,
};
type Response = { data: unknown; error: { code: string } | null };

function setup(response: Promise<Response> = Promise.resolve(success)) {
  let session = {
    user: { id: userId },
    access_token: 'first-token',
  } as Session;
  let listener: (
    event: AuthChangeEvent,
    session: Session | null,
  ) => void = () => {};
  const header = jest.fn();
  const rpc = jest.fn(() => Object.assign(response, { setHeader: header }));
  header.mockImplementation(() => response);
  const unsubscribe = jest.fn();
  const client = {
    auth: {
      getSession: jest.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: jest.fn((callback: typeof listener) => {
        listener = callback;
        callback('INITIAL_SESSION', session);
        return { data: { subscription: { unsubscribe } } };
      }),
    },
    rpc,
  };
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(client as unknown as SupabaseClient<Database>);
  return {
    rpc,
    getSession: client.auth.getSession,
    header,
    unsubscribe,
    event(event: AuthChangeEvent, token: string | null) {
      session = { user: { id: userId }, access_token: token ?? '' } as Session;
      listener(event, token === null ? null : session);
    },
  };
}

function deferred() {
  let resolve: (value: Response) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function started(rpc: jest.Mock) {
  for (let i = 0; i < 10 && rpc.mock.calls.length === 0; i++)
    await Promise.resolve();
  expect(rpc).toHaveBeenCalledTimes(1);
}

describe('assignment transport session fence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects same-user relogin before dispatch and never reacquires the session', async () => {
    const auth = setup();
    const operation = createAssignClientProgramOperation(input);
    auth.event('SIGNED_OUT', null);
    auth.event('SIGNED_IN', 'second-token');
    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(auth.rpc).not.toHaveBeenCalled();
    operation.dispose?.();
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'database error', 'thrown error'])(
    'rejects late %s after same-user relogin',
    async (kind) => {
      const pending = deferred();
      const auth = setup(pending.promise);
      const operation = createAssignClientProgramOperation(input);
      const execution = operation.execute();
      await started(auth.rpc);
      auth.event('SIGNED_OUT', null);
      auth.event('SIGNED_IN', 'second-token');
      if (kind === 'thrown error')
        pending.reject(new Error('transport failure'));
      else
        pending.resolve(
          kind === 'success'
            ? success
            : { data: null, error: { code: '40001' } },
        );
      await expect(execution).rejects.toMatchObject({ code: 'unavailable' });
      await expect(operation.execute()).rejects.toMatchObject({
        code: 'unavailable',
      });
      expect(auth.rpc).toHaveBeenCalledTimes(1);
      operation.dispose?.();
    },
  );

  it('allows token refresh during a request and explicitly authorizes its dispatch', async () => {
    const pending = deferred();
    const auth = setup(pending.promise);
    const operation = createAssignClientProgramOperation(input);
    const execution = operation.execute();
    await started(auth.rpc);
    expect(auth.header).toHaveBeenCalledWith(
      'Authorization',
      'Bearer first-token',
    );
    auth.event('TOKEN_REFRESHED', 'refreshed-token');
    pending.resolve(success);
    await expect(execution).resolves.toEqual(success.data);
    await expect(operation.execute()).resolves.toEqual(success.data);
    expect(auth.rpc).toHaveBeenCalledTimes(1);
    operation.dispose?.();
  });

  it('rejects a supplied fence bound to another actor', async () => {
    const auth = setup();
    const session = openAssignmentSession(userId);
    const operation = createAssignClientProgramOperation({
      ...input,
      expectedUserId: '51000000-0000-4000-8000-000000000002',
      session,
    });
    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(auth.rpc).not.toHaveBeenCalled();
    operation.dispose?.();
    expect(auth.unsubscribe).not.toHaveBeenCalled();
    session.dispose();
  });

  it('rejects cached success after same-user relogin', async () => {
    const auth = setup();
    const operation = createAssignClientProgramOperation(input);
    await expect(operation.execute()).resolves.toEqual(success.data);
    auth.event('SIGNED_IN', 'second-token');
    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(auth.rpc).toHaveBeenCalledTimes(1);
    operation.dispose?.();
  });
  it('does not dispatch after same-user relogin during session verification', async () => {
    const auth = setup();
    let release!: (value: { data: { session: Session }; error: null }) => void;
    const verifying = new Promise<{ data: { session: Session }; error: null }>(
      (resolve) => {
        release = resolve;
      },
    );
    auth.getSession.mockImplementationOnce(() => verifying);
    const operation = createAssignClientProgramOperation(input);
    const execution = operation.execute();
    auth.event('SIGNED_OUT', null);
    auth.event('SIGNED_IN', 'new-token');
    release({
      data: {
        session: {
          user: { id: userId },
          access_token: 'first-token',
        } as Session,
      },
      error: null,
    });
    await expect(execution).rejects.toMatchObject({ code: 'unavailable' });
    expect(auth.rpc).not.toHaveBeenCalled();
    operation.dispose?.();
  });
});
