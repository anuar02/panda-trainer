import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';
import { createWorkspaceClient } from '@/features/workspace-clients/service';
import {
  setupRead,
  userId,
  workspaceId,
  id,
} from './workspace-client-read-fixtures';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
const token = (sessionId = id(1), sub = userId, version = 1) =>
  `header.${Buffer.from(JSON.stringify({ sub, session_id: sessionId, version })).toString('base64url')}.signature`;
function setup(intercept?: Parameters<typeof setupRead>[1]) {
  const fixture = setupRead({}, intercept);
  fixture.setSession(fixture.session(token()));
  const header = jest.fn();
  let response: () => Promise<unknown> = async () => ({
    data: { workspace_id: workspaceId },
    error: null,
  });
  const rpc = jest.fn(() => ({
    setHeader: header.mockImplementation(() => response()),
  }));
  const client = jest.mocked(getSupabaseClient)();
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ ...client, rpc } as unknown as SupabaseClient<Database>);
  const scope = { userId, workspaceId, token: token() };
  return {
    ...fixture,
    scope,
    rpc,
    header,
    respond: (next: typeof response) => {
      response = next;
    },
  };
}
test('explicit bearer, owner check and compatible two argument API', async () => {
  const f = setup();
  await createWorkspaceClient(' Name ', id(2), f.scope);
  expect(f.rpc).toHaveBeenCalledWith('create_client_record', {
    client_name: 'Name',
    client_phone: '',
    request_id: id(2),
  });
  expect(f.header).toHaveBeenCalledWith('Authorization', `Bearer ${token()}`);
  expect(f.queries[0]?.filters).toEqual({ owner_user_id: userId });
  await createWorkspaceClient('Name', id(3));
  expect(f.unsubscribe).toHaveBeenCalledTimes(2);
});
test.each(['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'] as const)(
  'relogin during RPC fails closed: %s',
  async (event) => {
    const f = setup();
    f.respond(async () => {
      f.emit(event, f.session(token(id(4))));
      return { data: { workspace_id: workspaceId }, error: null };
    });
    await expect(createWorkspaceClient('Name', id(2), f.scope)).rejects.toThrow(
      'Client creation unavailable',
    );
  },
);
test('verified same identity refresh succeeds; refresh event with wrong sub fails', async () => {
  const f = setup();
  f.respond(async () => {
    f.emit('TOKEN_REFRESHED', f.session(token(id(1), userId, 2)));
    return { data: { workspace_id: workspaceId }, error: null };
  });
  await createWorkspaceClient('Name', id(2), f.scope);
  const bad = setup();
  bad.respond(async () => {
    bad.emit('TOKEN_REFRESHED', bad.session(token(id(1), id(9))));
    throw new Error('private token');
  });
  await expect(createWorkspaceClient('Name', id(2), bad.scope)).rejects.toThrow(
    'Client creation unavailable',
  );
});
test.each([
  'actor',
  'workspace',
  'malformed',
  'silent refresh',
  'cancel',
] as const)('pre-dispatch %s fails closed', async (kind) => {
  const f = setup();
  const controller = new AbortController();
  const scope = { ...f.scope, signal: controller.signal };
  if (kind === 'actor') f.setSession(f.session(token(id(1), id(8)), id(8)));
  if (kind === 'workspace') scope.workspaceId = id(8);
  if (kind === 'malformed') f.setSession(f.session('invalid'));
  if (kind === 'silent refresh')
    f.setSession(f.session(token(id(1), userId, 2)));
  if (kind === 'cancel') controller.abort();
  await expect(createWorkspaceClient('Name', id(2), scope)).rejects.toThrow();
  expect(f.rpc).not.toHaveBeenCalled();
});
test('initial auth race and ownership read relogin never dispatch', async () => {
  const f = setup(async (_state, response) => {
    f.emit('SIGNED_IN', f.session(token(id(4))));
    return response;
  });
  await expect(createWorkspaceClient('Name', id(2), f.scope)).rejects.toThrow();
  expect(f.rpc).not.toHaveBeenCalled();
  const race = setup();
  race.auth.getSession.mockImplementationOnce(async () => {
    race.emit('SIGNED_IN', race.session(token(id(4))));
    return { data: { session: race.session(token()) }, error: null };
  });
  await expect(
    createWorkspaceClient('Name', id(2), race.scope),
  ).rejects.toThrow();
  expect(race.rpc).not.toHaveBeenCalled();
});
test('lost response explicit retry uses same request ID and sanitizes error', async () => {
  const f = setup();
  f.respond(async () => {
    throw new Error('private transport');
  });
  await expect(createWorkspaceClient('Name', id(2), f.scope)).rejects.toThrow(
    'Client creation unavailable',
  );
  f.respond(async () => ({ data: { workspace_id: workspaceId }, error: null }));
  await createWorkspaceClient('Name', id(2), f.scope);
  expect(f.rpc.mock.calls[0]).toEqual(f.rpc.mock.calls[1]);
});

test('caller cancellation during RPC suppresses late success and late error', async () => {
  for (const kind of ['success', 'error']) {
    const f = setup();
    const controller = new AbortController();
    f.respond(async () => {
      controller.abort();
      if (kind === 'error') throw new Error('private transport detail');
      return { data: { workspace_id: workspaceId }, error: null };
    });
    await expect(
      createWorkspaceClient('Name', id(2), {
        ...f.scope,
        signal: controller.signal,
      }),
    ).rejects.toThrow('Client creation unavailable');
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  }
});
test.each([
  {},
  { sub: userId },
  { sub: id(8), session_id: id(1) },
  { sub: userId, session_id: 'invalid' },
])('wrong claims fail before RPC: %j', async (claims) => {
  const f = setup();
  const invalid = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  f.setSession(f.session(invalid));
  await expect(
    createWorkspaceClient('Name', id(2), { ...f.scope, token: invalid }),
  ).rejects.toThrow();
  expect(f.rpc).not.toHaveBeenCalled();
});
