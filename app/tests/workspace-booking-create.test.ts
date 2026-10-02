import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import {
  createWorkspaceBookingOperation,
  type CreateWorkspaceBookingInput,
} from '@/features/workspace-scheduling/create-operation';
import type { Database } from '@/lib/database.types';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));

const userId = '51000000-0000-4000-8000-000000000001';
const clientId = '71000000-0000-4000-8000-000000000001';
const secondClientId = '71000000-0000-4000-8000-000000000002';
const bookingId = '81000000-0000-4000-8000-000000000001';
const secondBookingId = '81000000-0000-4000-8000-000000000002';
const groupId = '91000000-0000-4000-8000-000000000001';
const requestId = 'a1000000-0000-4000-8000-000000000001';
const input = (): CreateWorkspaceBookingInput => ({
  clientRecordIds: [clientId],
  startsAtUtc: '2026-10-05T10:00:00.000Z',
  endsAtUtc: '2026-10-05T11:00:00.000Z',
  collisionAcknowledged: false,
  expectedUserId: userId,
  requestId,
});
const created = () => ({
  created: true,
  booking_ids: [bookingId],
  group_session_id: null,
  overlaps: [],
  replayed: false,
});
const overlap = () => ({
  booking_ids: [secondBookingId],
  starts_at: '2026-10-05T15:30:00+05:00',
  ends_at: '2026-10-05T16:30:00+05:00',
});
const warning = () => ({
  created: false,
  booking_ids: [],
  group_session_id: null,
  overlaps: [overlap()],
  replayed: false,
  requires_overlap_ack: true,
});
const getClient = jest.mocked(getSupabaseClient);
const setup = (response: unknown = created(), sessionUser = userId) => {
  const header = jest.fn();
  const rpc = jest.fn().mockImplementation(() => {
    const result = Promise.resolve({ data: response, error: null });
    header.mockReturnValue(result);
    return { setHeader: header };
  });
  const getSession = jest.fn().mockResolvedValue({
    data: {
      session: { user: { id: sessionUser }, access_token: 'test-token' },
    },
    error: null,
  });
  getClient.mockReturnValue({
    auth: { getSession },
    rpc,
  } as unknown as SupabaseClient<Database>);
  return { rpc, header, getSession };
};

beforeEach(() => jest.clearAllMocks());

test('pins the session token and shares in-flight and successful requests', async () => {
  const { rpc, header } = setup();
  const operation = createWorkspaceBookingOperation(input());
  const first = operation.execute();
  expect(operation.execute()).toBe(first);
  expect(await first).toMatchObject({
    created: true,
    bookingIds: [bookingId],
    replayed: false,
  });
  expect(operation.execute()).toBe(first);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(header).toHaveBeenCalledWith('Authorization', 'Bearer test-token');
});

test('snapshots and sorts participants before the caller can mutate input', async () => {
  const { rpc } = setup({
    ...created(),
    booking_ids: [bookingId, secondBookingId],
    group_session_id: groupId,
  });
  const value = { ...input(), clientRecordIds: [secondClientId, clientId] };
  const operation = createWorkspaceBookingOperation(value);
  value.clientRecordIds.splice(0, 2);
  value.requestId = groupId;
  await operation.execute();
  expect(rpc).toHaveBeenCalledWith(
    'create_booking_set',
    expect.objectContaining({
      p_client_record_ids: [clientId, secondClientId],
      p_request_id: requestId,
    }),
  );
});

test('returns an overlap warning and rechecks on retry', async () => {
  const { rpc } = setup(warning());
  const operation = createWorkspaceBookingOperation(input());
  expect(await operation.execute()).toMatchObject({
    created: false,
    requiresOverlapAcknowledgement: true,
    overlaps: [
      {
        startsAtUtc: '2026-10-05T10:30:00.000Z',
        endsAtUtc: '2026-10-05T11:30:00.000Z',
      },
    ],
  });
  await operation.execute();
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('sends acknowledgement only when explicitly supplied', async () => {
  const { rpc } = setup({ ...created(), overlaps: [overlap()] });
  await createWorkspaceBookingOperation({
    ...input(),
    collisionAcknowledged: true,
  }).execute();
  expect(rpc).toHaveBeenCalledWith(
    'create_booking_set',
    expect.objectContaining({ p_collision_ack: true }),
  );
});

test('replays the same request ID after a lost response', async () => {
  const { rpc } = setup({ ...created(), replayed: true });
  rpc.mockImplementationOnce(() => ({
    setHeader: () => Promise.reject(new Error('connection lost')),
  }));
  const operation = createWorkspaceBookingOperation(input());
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  expect(await operation.execute()).toMatchObject({
    replayed: true,
    bookingIds: [bookingId],
  });
  expect(rpc).toHaveBeenNthCalledWith(
    1,
    'create_booking_set',
    expect.objectContaining({ p_request_id: requestId }),
  );
  expect(rpc).toHaveBeenNthCalledWith(
    2,
    'create_booking_set',
    expect.objectContaining({ p_request_id: requestId }),
  );
});

test('blocks an operation after account switch before sending RPC', async () => {
  const { rpc } = setup(created(), groupId);
  await expect(
    createWorkspaceBookingOperation(input()).execute(),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
});

test('reports missing configuration', async () => {
  getClient.mockReturnValue(null);
  await expect(
    createWorkspaceBookingOperation(input()).execute(),
  ).rejects.toMatchObject({ code: 'configuration' });
});

test.each(['22023', '42501', 'XX000'])(
  'maps RPC error %s and allows retry',
  async (code) => {
    const { rpc } = setup();
    rpc.mockImplementationOnce(() => ({
      setHeader: () => Promise.resolve({ data: null, error: { code } }),
    }));
    const operation = createWorkspaceBookingOperation(input());
    await expect(operation.execute()).rejects.toMatchObject({
      code:
        code === '22023'
          ? 'invalidInput'
          : code === '42501'
            ? 'unavailable'
            : 'request',
    });
    expect(await operation.execute()).toMatchObject({ created: true });
  },
);

test.each([
  { clientRecordIds: [] },
  { clientRecordIds: [clientId, clientId] },
  { requestId: 'invalid' },
  { expectedUserId: 'invalid' },
  { startsAtUtc: '2026-10-05T10:00:00+00:00' },
  { endsAtUtc: '2026-10-05T09:00:00.000Z' },
])('rejects invalid input before network access: %j', (override) => {
  expect(() =>
    createWorkspaceBookingOperation({ ...input(), ...override }),
  ).toThrow();
  expect(getClient).not.toHaveBeenCalled();
});

test.each([
  null,
  { ...created(), booking_ids: [] },
  { ...created(), group_session_id: groupId },
  { ...created(), requires_overlap_ack: true },
  { ...warning(), overlaps: [] },
  { ...warning(), replayed: true },
  { ...created(), overlaps: [{ ...overlap(), ends_at: 'invalid' }] },
])('rejects inconsistent server results: %j', async (response) => {
  setup(response);
  await expect(
    createWorkspaceBookingOperation(input()).execute(),
  ).rejects.toMatchObject({ code: 'request' });
});

test('same operation retries after missing configuration becomes available', async () => {
  getClient.mockReturnValueOnce(null);
  const operation = createWorkspaceBookingOperation(input());
  await expect(operation.execute()).rejects.toMatchObject({
    code: 'configuration',
  });
  const { rpc } = setup();
  await expect(operation.execute()).resolves.toMatchObject({ created: true });
  expect(rpc).toHaveBeenCalledWith(
    'create_booking_set',
    expect.objectContaining({ p_request_id: requestId }),
  );
});

test('same operation retries after a synchronous client failure', async () => {
  getClient.mockImplementationOnce(() => {
    throw new Error('client startup');
  });
  const operation = createWorkspaceBookingOperation(input());
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  const { rpc } = setup();
  await expect(operation.execute()).resolves.toMatchObject({ created: true });
  expect(rpc).toHaveBeenCalledTimes(1);
});
