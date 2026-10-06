import { bookingAuthFixture } from './booking-creation-auth-fixture';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';
import {
  createWorkspaceProposalOperation,
  type WorkspaceProposalCommand,
} from '@/features/workspace-scheduling/proposal-operation';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
const user = '51000000-0000-4000-8000-000000000001';
const booking = '81000000-0000-4000-8000-000000000001';
const proposal = '91000000-0000-4000-8000-000000000001';
const request = 'a1000000-0000-4000-8000-000000000001';
const command = (
  action: WorkspaceProposalCommand['action'] = 'propose',
): WorkspaceProposalCommand =>
  action === 'propose'
    ? {
        action,
        bookingId: booking,
        expectedBookingRevision: 3,
        requestId: request,
        proposedStartsAtUtc: '2026-10-06T10:00:00.000Z',
      }
    : action === 'counter'
      ? {
          action,
          bookingId: booking,
          expectedBookingRevision: 3,
          requestId: request,
          proposalId: proposal,
          expectedProposalRevision: 2,
          proposedStartsAtUtc: '2026-10-06T10:00:00.000Z',
        }
      : {
          action,
          bookingId: booking,
          expectedBookingRevision: 3,
          requestId: request,
          proposalId: proposal,
          expectedProposalRevision: 2,
        };
const result = (action: WorkspaceProposalCommand['action'] = 'propose') => ({
  proposal_id: proposal,
  proposal_revision: action === 'propose' ? 1 : 3,
  proposal_status:
    action === 'propose' || action === 'counter'
      ? 'pending'
      : action === 'accept'
        ? 'accepted'
        : action === 'decline'
          ? 'declined'
          : 'withdrawn',
  booking_id: booking,
  booking_revision: action === 'accept' ? 4 : 3,
  booking_status: 'confirmed',
  starts_at: '2026-10-05T15:00:00+05:00',
  ends_at: '2026-10-05T16:00:00+05:00',
  replayed: false,
});
function setup(data: unknown = result(), sessionUser = user) {
  const header = jest.fn().mockResolvedValue({ data, error: null });
  const rpc = jest.fn().mockImplementation(() => ({ setHeader: header }));
  const getSession = jest.fn().mockResolvedValue({
    data: {
      session: {
        user: { id: sessionUser },
        access_token: bookingAuthFixture(user).session().access_token,
      },
    },
    error: null,
  });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: { ...bookingAuthFixture(user).auth, getSession },
    rpc,
  } as unknown as SupabaseClient<Database>);
  return { rpc, header, getSession };
}
beforeEach(() => jest.clearAllMocks());
test.each(['propose', 'counter', 'accept', 'decline', 'withdraw'] as const)(
  'dispatches %s exact typed RPC and parses safe result',
  async (action) => {
    const { rpc, header } = setup(result(action));
    const operation = createWorkspaceProposalOperation(command(action), user);
    const first = operation.execute();
    await expect(operation.execute()).resolves.toEqual(await first);
    expect(await first).toMatchObject({
      bookingId: booking,
      proposalId: proposal,
      startsAtUtc: '2026-10-05T10:00:00.000Z',
    });
    await expect(operation.execute()).resolves.toEqual(await first);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      `${action}_booking_reschedule`,
      expect.objectContaining({
        p_request_id: request,
        p_expected_booking_revision: 3,
      }),
    );
    expect(header).toHaveBeenCalledWith(
      'Authorization',
      `Bearer ${bookingAuthFixture(user).session().access_token}`,
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('author_user_id');
  },
);
test('snapshots immutable payload and replays exact ID after lost response', async () => {
  const { rpc, header } = setup({ ...result(), replayed: true });
  header.mockRejectedValueOnce(new Error('lost'));
  const input = command();
  const operation = createWorkspaceProposalOperation(input, user);
  input.bookingId = proposal;
  input.requestId = booking;
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  await expect(operation.execute()).resolves.toMatchObject({ replayed: true });
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(rpc).toHaveBeenCalledWith(
    'propose_booking_reschedule',
    expect.objectContaining({ p_booking_id: booking, p_request_id: request }),
  );
});
test('blocks an invalidated operation after account restoration and permits an explicit new operation', async () => {
  const { rpc, getSession } = setup(result(), booking);
  const operation = createWorkspaceProposalOperation(command(), user);
  await expect(operation.execute()).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(rpc).not.toHaveBeenCalled();
  getSession.mockResolvedValue({
    data: {
      session: {
        user: { id: user },
        access_token: bookingAuthFixture(user).session().access_token,
      },
    },
    error: null,
  });
  await expect(operation.execute()).rejects.toMatchObject({
    code: 'unavailable',
  });
  await expect(
    createWorkspaceProposalOperation(command(), user).execute(),
  ).resolves.toMatchObject({ bookingId: booking });
});
test.each([
  ['22023', 'invalidInput'],
  ['40001', 'conflict'],
  ['55000', 'invalidState'],
  ['42501', 'unavailable'],
  ['P0002', 'unavailable'],
  ['XX000', 'request'],
])('maps %s as %s without caching failure', async (code, expected) => {
  const { header } = setup();
  header.mockResolvedValueOnce({ data: null, error: { code } });
  const operation = createWorkspaceProposalOperation(command(), user);
  await expect(operation.execute()).rejects.toMatchObject({ code: expected });
  await expect(operation.execute()).resolves.toMatchObject({
    bookingId: booking,
  });
});
test.each([
  { ...command(), bookingId: 'invalid' },
  { ...command(), expectedBookingRevision: 0 },
  { ...command(), proposedStartsAtUtc: '2026-10-06T10:00:00+00:00' },
  { ...command('accept'), proposalId: 'invalid' },
  { ...command('counter'), expectedProposalRevision: 1.5 },
  { ...command(), expectedBookingRevision: 2147483647 },
  { ...command(), unexpected: true },
])('rejects invalid command before client access %j', (input) => {
  expect(() => createWorkspaceProposalOperation(input, user)).toThrow();
  expect(getSupabaseClient).not.toHaveBeenCalled();
});
test.each([
  null,
  { ...result(), booking_id: proposal },
  { ...result(), proposal_revision: 2 },
  { ...result(), booking_revision: 4 },
  { ...result(), proposal_status: 'accepted' },
  { ...result(), ends_at: 'invalid' },
  { ...result(), replayed: 'false' },
])('rejects malformed receipt %j', async (data) => {
  setup(data);
  await expect(
    createWorkspaceProposalOperation(command(), user).execute(),
  ).rejects.toMatchObject({ code: 'request' });
});
test('rejects response for a different proposal', async () => {
  setup({ ...result('accept'), proposal_id: booking });
  await expect(
    createWorkspaceProposalOperation(command('accept'), user).execute(),
  ).rejects.toMatchObject({ code: 'request' });
});

test('recovers missing configuration and synchronous startup errors with same operation', async () => {
  jest.mocked(getSupabaseClient).mockReturnValueOnce(null);
  const operation = createWorkspaceProposalOperation(command(), user);
  await expect(operation.execute()).rejects.toMatchObject({
    code: 'configuration',
  });
  jest.mocked(getSupabaseClient).mockImplementationOnce(() => {
    throw new Error('startup');
  });
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  const { rpc } = setup();
  await expect(operation.execute()).resolves.toMatchObject({
    bookingId: booking,
  });
  expect(rpc).toHaveBeenCalledWith(
    'propose_booking_reschedule',
    expect.objectContaining({ p_request_id: request }),
  );
});

test('result strips peer account identifiers from server payload', async () => {
  setup({ ...result(), author_user_id: user, client_user_id: booking });
  const response = await createWorkspaceProposalOperation(
    command(),
    user,
  ).execute();
  expect(response).not.toHaveProperty('author_user_id');
  expect(response).not.toHaveProperty('client_user_id');
});
