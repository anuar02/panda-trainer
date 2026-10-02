import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import {
  createWorkspaceBookingStatusOperation,
  type WorkspaceBookingStatusInput,
} from '@/features/workspace-scheduling/status-operation';
import type { Database } from '@/lib/database.types';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
const userId = '51000000-0000-4000-8000-000000000001';
const bookingId = '81000000-0000-4000-8000-000000000001';
const requestId = 'a1000000-0000-4000-8000-000000000001';
const input = (): WorkspaceBookingStatusInput => ({
  action: 'confirm',
  bookingId,
  expectedRevision: 3,
  requestId,
  expectedUserId: userId,
});
const result = () => ({
  booking_id: bookingId,
  revision: 4,
  status: 'confirmed',
  replayed: false,
});
const getClient = jest.mocked(getSupabaseClient);
const setup = (data: unknown = result()) => {
  const header = jest.fn().mockResolvedValue({ data, error: null });
  const rpc = jest.fn().mockReturnValue({ setHeader: header });
  const getSession = jest.fn().mockResolvedValue({
    data: { session: { user: { id: userId }, access_token: 'test-token' } },
    error: null,
  });
  getClient.mockReturnValue({
    auth: { getSession },
    rpc,
  } as unknown as SupabaseClient<Database>);
  return { header, rpc, getSession };
};
beforeEach(() => jest.clearAllMocks());

test('pins auth and shares in-flight and completed confirmation', async () => {
  const { header, rpc } = setup();
  const operation = createWorkspaceBookingStatusOperation(input());
  const first = operation.execute();
  expect(operation.execute()).toBe(first);
  expect(await first).toEqual({
    bookingId,
    revision: 4,
    status: 'confirmed',
    replayed: false,
  });
  expect(operation.execute()).toBe(first);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(header).toHaveBeenCalledWith('Authorization', 'Bearer test-token');
});
test.each(['cancelled_by_client', 'cancelled_by_trainer'])(
  'routes cancellation and accepts %s',
  async (status) => {
    const { rpc } = setup({ ...result(), status });
    const command = { ...input(), action: 'cancel' as const };
    const operation = createWorkspaceBookingStatusOperation(command);
    command.expectedRevision = 99;
    command.requestId = bookingId;
    expect(await operation.execute()).toMatchObject({ status });
    expect(rpc).toHaveBeenCalledWith('cancel_booking', {
      p_booking_id: bookingId,
      p_expected_revision: 3,
      p_request_id: requestId,
    });
  },
);
test('retries lost response with original request and accepts replay', async () => {
  const { header, rpc } = setup();
  header.mockRejectedValueOnce(new Error('lost'));
  header.mockResolvedValueOnce({
    data: { ...result(), replayed: true },
    error: null,
  });
  const operation = createWorkspaceBookingStatusOperation(input());
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  expect(await operation.execute()).toMatchObject({ replayed: true });
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
});
test('blocks retry after account changes', async () => {
  const { header, getSession, rpc } = setup();
  header.mockRejectedValueOnce(new Error('lost'));
  const operation = createWorkspaceBookingStatusOperation(input());
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  getSession.mockResolvedValueOnce({
    data: { session: { user: { id: bookingId }, access_token: 'other' } },
    error: null,
  });
  await expect(operation.execute()).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(rpc).toHaveBeenCalledTimes(1);
});
test.each([
  ['22023', 'invalidInput'],
  ['42501', 'unavailable'],
  ['P0002', 'unavailable'],
  ['40001', 'conflict'],
  ['55000', 'invalidState'],
  ['XX000', 'request'],
])('maps RPC %s to %s', async (code, mapped) => {
  const { header } = setup();
  header.mockResolvedValueOnce({ data: null, error: { code } });
  await expect(
    createWorkspaceBookingStatusOperation(input()).execute(),
  ).rejects.toMatchObject({ code: mapped });
});
test.each([
  null,
  [],
  {},
  { ...result(), booking_id: requestId },
  { ...result(), revision: 3 },
  { ...result(), revision: 5 },
  { ...result(), status: 'cancelled_by_client' },
  { ...result(), replayed: 'yes' },
])('rejects invalid result %#', async (data) => {
  setup(data);
  await expect(
    createWorkspaceBookingStatusOperation(input()).execute(),
  ).rejects.toMatchObject({ code: 'request' });
});
test('rejects confirmation response to cancellation', async () => {
  setup();
  await expect(
    createWorkspaceBookingStatusOperation({
      ...input(),
      action: 'cancel',
    }).execute(),
  ).rejects.toMatchObject({ code: 'request' });
});
test.each([0, -1, 1.5, NaN, Infinity, 2147483647])(
  'rejects invalid revision %s before network',
  (expectedRevision) => {
    const { rpc } = setup();
    expect(() =>
      createWorkspaceBookingStatusOperation({ ...input(), expectedRevision }),
    ).toThrow('invalidInput');
    expect(rpc).not.toHaveBeenCalled();
  },
);
test.each(['bookingId', 'requestId', 'expectedUserId'] as const)(
  'rejects invalid %s',
  (field) => {
    expect(() =>
      createWorkspaceBookingStatusOperation({ ...input(), [field]: 'invalid' }),
    ).toThrow('invalidInput');
  },
);
test('reports absent configuration', async () => {
  getClient.mockReturnValue(null);
  await expect(
    createWorkspaceBookingStatusOperation(input()).execute(),
  ).rejects.toMatchObject({ code: 'configuration' });
});
test.each([
  { data: { session: null }, error: null },
  {
    data: { session: { user: { id: userId }, access_token: '' } },
    error: null,
  },
  {
    data: { session: { user: { id: userId }, access_token: 'token' } },
    error: new Error('auth'),
  },
])('rejects unavailable authentication %#', async (session) => {
  const { getSession, rpc } = setup();
  getSession.mockResolvedValue(session);
  await expect(
    createWorkspaceBookingStatusOperation(input()).execute(),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
});

test('retries on the same operation after configuration becomes available', async () => {
  getClient.mockReturnValue(null);
  const operation = createWorkspaceBookingStatusOperation(input());
  await expect(operation.execute()).rejects.toMatchObject({
    code: 'configuration',
  });
  const { rpc } = setup();
  expect(await operation.execute()).toMatchObject({ status: 'confirmed' });
  expect(rpc).toHaveBeenCalledTimes(1);
});

test('retries on the same operation after synchronous client lookup failure', async () => {
  getClient.mockImplementationOnce(() => {
    throw new Error('lookup failed');
  });
  const operation = createWorkspaceBookingStatusOperation(input());
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  const { rpc } = setup();
  expect(await operation.execute()).toMatchObject({ status: 'confirmed' });
  expect(rpc).toHaveBeenCalledTimes(1);
});
