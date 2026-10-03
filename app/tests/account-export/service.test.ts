import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  loadAccountExport,
  type AccountExportTransport,
  type ExportSession,
} from '@/features/account-export/service';
import snapshot from './snapshot.json';

const input = {
  expectedUserId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
};
const session: ExportSession = {
  user: { id: input.expectedUserId },
  access_token: 'synthetic-session',
};
function transport() {
  return {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: session as ExportSession | null },
        error: null as unknown,
      })),
    },
    rpc: jest.fn(async () => ({
      data: snapshot as unknown,
      error: null as { code?: string } | null,
      status: 200,
    })),
  } satisfies AccountExportTransport;
}
function acceptsSupabase(
  client: SupabaseClient<Database>,
): AccountExportTransport {
  return client;
}
test('accepts the existing typed Supabase client without provider integration', () =>
  expect(typeof acceptsSupabase).toBe('function'));
test('calls one read RPC with workspace only and validates before returning', async () => {
  const client = transport();
  const result = await loadAccountExport(client, input);
  expect(result.collections.private_notes[0]?.text).toBe(
    'Synthetic private trainer note',
  );
  expect(client.rpc).toHaveBeenCalledTimes(1);
  expect(client.rpc).toHaveBeenCalledWith('export_trainer_workspace', {
    p_workspace_id: input.workspaceId,
  });
  expect(client.auth.getSession).toHaveBeenCalledTimes(2);
});
test('rejects invalid input without a request', async () => {
  const client = transport();
  await expect(
    loadAccountExport(client, { ...input, workspaceId: 'bad' }),
  ).rejects.toMatchObject({ code: 'invalidInput' });
  expect(client.rpc).not.toHaveBeenCalled();
});
test('rejects missing session and a foreign session before requesting', async () => {
  const client = transport();
  client.auth.getSession.mockResolvedValueOnce({
    data: { session: null },
    error: null,
  });
  await expect(loadAccountExport(client, input)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  expect(client.rpc).not.toHaveBeenCalled();
  await expect(
    loadAccountExport(client, {
      ...input,
      expectedUserId: '41000000-0000-4000-8000-000000000099',
    }),
  ).rejects.toMatchObject({ code: 'sessionChanged' });
  expect(client.rpc).not.toHaveBeenCalled();
});
test.each([
  [403, '42501', 'forbidden'],
  [400, '42501', 'forbidden'],
  [401, 'PGRST301', 'unauthenticated'],
  [0, '', 'network'],
  [503, '', 'network'],
  [400, '22023', 'request'],
])('reports failed RPC status %s honestly', async (status, code, expected) => {
  const client = transport();
  client.rpc.mockResolvedValueOnce({ data: snapshot, error: { code }, status });
  await expect(loadAccountExport(client, input)).rejects.toMatchObject({
    code: expected,
  });
});
test('reports a rejected network promise and session-read error', async () => {
  const client = transport();
  client.rpc.mockRejectedValueOnce(new TypeError('Synthetic offline'));
  await expect(loadAccountExport(client, input)).rejects.toMatchObject({
    code: 'network',
  });
  client.auth.getSession.mockResolvedValueOnce({
    data: { session },
    error: new Error('Synthetic read failure'),
  });
  await expect(loadAccountExport(client, input)).rejects.toMatchObject({
    code: 'network',
  });
});
test.each([
  [null, 'malformedPayload'],
  [{ ...snapshot, version: 2 }, 'unsupportedVersion'],
  [
    { ...snapshot, workspace_id: '41000000-0000-4000-8000-000000000099' },
    'tenantMismatch',
  ],
])('does not turn malformed server data into success', async (data, code) => {
  const client = transport();
  client.rpc.mockResolvedValueOnce({ data, error: null, status: 200 });
  await expect(loadAccountExport(client, input)).rejects.toMatchObject({
    code,
  });
});
test.each([
  null,
  { ...session, access_token: 'synthetic-refreshed' },
  { ...session, user: { id: '41000000-0000-4000-8000-000000000099' } },
])(
  'discards export on logout, token refresh or account switch during request',
  async (after) => {
    const client = transport();
    client.auth.getSession
      .mockResolvedValueOnce({ data: { session }, error: null })
      .mockResolvedValueOnce({ data: { session: after }, error: null });
    await expect(loadAccountExport(client, input)).rejects.toMatchObject({
      code: 'sessionChanged',
    });
  },
);

test('captures session primitives before a transport mutates its session object', async () => {
  const client = transport();
  const mutableSession = {
    user: { id: session.user.id },
    access_token: session.access_token,
  };
  client.auth.getSession.mockResolvedValue({
    data: { session: mutableSession },
    error: null,
  });
  client.rpc.mockImplementationOnce(async () => {
    mutableSession.access_token = 'synthetic-new-session';
    return { data: snapshot, error: null, status: 200 };
  });
  await expect(loadAccountExport(client, input)).rejects.toMatchObject({
    code: 'sessionChanged',
  });
});

test('optional signal reaches compatible PostgREST request', async () => {
  const client = transport();
  const abort = new AbortController();
  const abortSignal = jest.fn(() =>
    Promise.resolve({ data: snapshot, error: null, status: 200 }),
  );
  const request = Object.assign(
    Promise.resolve({ data: snapshot, error: null, status: 200 }),
    { abortSignal },
  );
  const scoped = { ...client, rpc: () => request };
  await loadAccountExport(scoped, { ...input, signal: abort.signal });
  expect(abortSignal).toHaveBeenCalledWith(abort.signal);
});
test('cancel before request prevents RPC', async () => {
  const client = transport();
  const abort = new AbortController();
  abort.abort();
  await expect(
    loadAccountExport(client, { ...input, signal: abort.signal }),
  ).rejects.toMatchObject({ code: 'sessionChanged' });
  expect(client.rpc).not.toHaveBeenCalled();
});
