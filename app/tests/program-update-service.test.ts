import { createProgramUpdateTransport } from '@/features/program-update/service';
import type { SyncSession } from '@/domain/workout-sync/types';
import {
  updateCommand as command,
  updateContext as context,
  updateReceipt as receipt,
  updateSession as session,
  updateId as id,
} from './program-update-fixtures';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: () => null }));
const response = (v: unknown, code = 200) =>
  ({ ok: code === 200, json: async () => v }) as Response;
function fixture() {
  let current: SyncSession | null = session;
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const token = jest.fn(async () => 'verified-refreshed');
  const transport = createProgramUpdateTransport({
    session,
    getSession: () => current,
    clientRecordId: id(4),
    workoutId: id(5),
    url: 'https://synthetic.example.test',
    anonKey: 'synthetic',
    fetch: fetcher,
    fence: { token, valid: () => true, dispose: jest.fn() },
  });
  return {
    transport,
    fetcher,
    token,
    setSession: (s: SyncSession | null) => {
      current = s;
    },
  };
}
test('dispatch binds JWT caller, client, exact intent and revisions', async () => {
  const f = fixture();
  f.fetcher.mockResolvedValue(response(receipt));
  expect(await f.transport.apply(command)).toEqual(receipt);
  const request = f.fetcher.mock.calls[0]?.[1];
  expect(request?.headers).toMatchObject({
    Authorization: 'Bearer verified-refreshed',
  });
  expect(JSON.parse(String(request?.body))).toEqual({
    p_actor_id: id(1),
    p_workspace_id: id(2),
    p_client_record_id: id(4),
    p_workout_id: id(5),
    p_program_id: id(6),
    p_expected_program_revision: 1,
    p_expected_workout_revision: 3,
    p_request_id: id(8),
    p_selected_keys: command.selectedKeys,
  });
});
test.each(['success', 'error', 'dispose'])(
  'late %s cannot cross relogin or dismiss',
  async (mode) => {
    const f = fixture();
    let resolve: (v: Response) => void = () => {};
    f.fetcher.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const result = f.transport.apply(command);
    await Promise.resolve();
    await Promise.resolve();
    if (mode === 'dispose') f.transport.dispose();
    else f.setSession({ ...session, sessionId: id(20) });
    resolve(
      response(
        mode === 'error' ? { code: '40001' } : receipt,
        mode === 'error' ? 409 : 200,
      ),
    );
    await expect(result).rejects.toThrow('update_session');
  },
);
test('wrong-client, wrong-request or same-source success is never confirmed', async () => {
  for (const v of [
    { ...receipt, client_record_id: id(20) },
    { ...receipt, request_id: id(20) },
    { ...receipt, program_id: command.programId },
  ]) {
    const f = fixture();
    f.fetcher.mockResolvedValue(response(v));
    await expect(f.transport.apply(command)).rejects.toThrow('update_response');
  }
});
test('review reads server facts and confirmed conflicts differ from unknown timeout', async () => {
  const f = fixture();
  f.fetcher
    .mockResolvedValueOnce(response(context))
    .mockResolvedValueOnce(response({ code: '40001' }, 409))
    .mockRejectedValueOnce(new Error('network'));
  expect(await f.transport.load()).toEqual(context);
  await expect(f.transport.apply(command)).rejects.toThrow('update_conflict');
  await expect(f.transport.apply(command)).rejects.toThrow('network');
});
