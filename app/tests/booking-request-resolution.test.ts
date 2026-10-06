import { schedulingAuthFixture } from './scheduling-command-auth-fixture';
import { bookingAuthFixture } from './booking-creation-auth-fixture';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';
import {
  resolveWorkspaceBookingStatusRequest,
  resolveWorkspaceProposalRequest,
} from '@/features/workspace-scheduling/request-resolution';
import { resolvePendingWorkspaceBookingStatus } from '@/features/workspace-scheduling/status-submission';
import { resolvePendingWorkspaceProposal } from '@/features/workspace-scheduling/proposal-submission';
import {
  loadPendingWorkspaceBookingStatus,
  clearPendingWorkspaceBookingStatus,
} from '@/features/workspace-scheduling/status-pending';
import {
  loadPendingWorkspaceProposal,
  clearPendingWorkspaceProposal,
} from '@/features/workspace-scheduling/proposal-pending';
import type { WorkspaceProposalCommand } from '@/features/workspace-scheduling/proposal-operation';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/features/workspace-scheduling/status-pending', () => ({
  ...jest.requireActual('@/features/workspace-scheduling/status-pending'),
  loadPendingWorkspaceBookingStatus: jest.fn(),
  clearPendingWorkspaceBookingStatus: jest.fn(),
}));
jest.mock('@/features/workspace-scheduling/proposal-pending', () => ({
  ...jest.requireActual('@/features/workspace-scheduling/proposal-pending'),
  loadPendingWorkspaceProposal: jest.fn(),
  clearPendingWorkspaceProposal: jest.fn(),
}));
const user = '51000000-0000-4000-8000-000000000001';
const workspace = '61000000-0000-4000-8000-000000000001';
const booking = '81000000-0000-4000-8000-000000000001';
const proposal = '91000000-0000-4000-8000-000000000001';
const request = 'a1000000-0000-4000-8000-000000000001';
const status = {
  action: 'confirm' as const,
  bookingId: booking,
  expectedRevision: 3,
  requestId: request,
  expectedUserId: user,
};
const command = (
  action: WorkspaceProposalCommand['action'],
): WorkspaceProposalCommand =>
  ({
    action,
    bookingId: booking,
    expectedBookingRevision: 3,
    requestId: request,
    ...(action === 'propose'
      ? {}
      : { proposalId: proposal, expectedProposalRevision: 2 }),
    ...(action === 'propose' || action === 'counter'
      ? { proposedStartsAtUtc: '2030-10-06T10:00:00.000Z' }
      : {}),
  }) as WorkspaceProposalCommand;
const statusEnvelope = (succeeded = false) => ({
  outcome: succeeded ? 'succeeded' : 'abandoned',
  command_family: 'status',
  workspace_id: workspace,
  booking_id: booking,
  request_id: request,
  canonical_payload: {
    command: 'confirm',
    booking_id: booking,
    expected_revision: 3,
  },
  result: succeeded
    ? { booking_id: booking, revision: 4, status: 'confirmed', replayed: true }
    : null,
});
const proposalEnvelope = (
  action: WorkspaceProposalCommand['action'],
  succeeded = false,
) => ({
  outcome: succeeded ? 'succeeded' : 'abandoned',
  command_family: 'reschedule',
  workspace_id: workspace,
  booking_id: booking,
  request_id: request,
  canonical_payload: {
    command: action,
    booking_id: action === 'propose' ? booking : null,
    proposal_id: action === 'propose' ? null : proposal,
    expected_booking_revision: 3,
    expected_proposal_revision: action === 'propose' ? null : 2,
    proposed_starts_epoch:
      action === 'propose' || action === 'counter'
        ? Date.parse('2030-10-06T10:00:00.000Z') / 1000
        : null,
  },
  result: succeeded
    ? {
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
        starts_at: '2030-10-06T10:00:00Z',
        ends_at: '2030-10-06T11:00:00Z',
        replayed: true,
      }
    : null,
});
function setup(data: unknown) {
  const header = jest.fn().mockResolvedValue({ data, error: null });
  const rpc = jest.fn().mockReturnValue({ setHeader: header });
  const getSession = jest.fn().mockResolvedValue({
    data: {
      session: {
        user: { id: user },
        access_token: bookingAuthFixture(user).session().access_token,
      },
    },
    error: null,
  });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: { ...bookingAuthFixture(user).auth, getSession },
    from: schedulingAuthFixture(user, workspace).from,
    rpc,
  } as unknown as SupabaseClient<Database>);
  return { header, rpc, getSession };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(clearPendingWorkspaceBookingStatus).mockResolvedValue(true);
  jest.mocked(clearPendingWorkspaceProposal).mockResolvedValue(true);
});
test.each([false, true])(
  'status validates %s resolution before clearing durable command',
  async (succeeded) => {
    const { rpc, header } = setup(statusEnvelope(succeeded));
    jest.mocked(loadPendingWorkspaceBookingStatus).mockResolvedValue(status);
    const result = await resolvePendingWorkspaceBookingStatus(user, workspace);
    expect(result?.outcome).toBe(succeeded ? 'succeeded' : 'abandoned');
    expect(rpc).toHaveBeenCalledWith('resolve_booking_status_request', {
      p_command: 'confirm',
      p_booking_id: booking,
      p_expected_revision: 3,
      p_request_id: request,
    });
    expect(header).toHaveBeenCalledWith(
      'Authorization',
      `Bearer ${bookingAuthFixture(user).session().access_token}`,
    );
    expect(clearPendingWorkspaceBookingStatus).toHaveBeenCalledWith(
      user,
      workspace,
      request,
      expect.any(Function),
      {
        action: status.action,
        bookingId: status.bookingId,
        expectedRevision: status.expectedRevision,
        requestId: status.requestId,
      },
    );
  },
);
test.each(['propose', 'counter', 'accept', 'decline', 'withdraw'] as const)(
  'reschedule %s validates nullable args and original receipt',
  async (action) => {
    for (const succeeded of [false, true]) {
      const { rpc } = setup(proposalEnvelope(action, succeeded));
      jest
        .mocked(loadPendingWorkspaceProposal)
        .mockResolvedValue(command(action));
      expect(
        (await resolvePendingWorkspaceProposal(user, workspace))?.outcome,
      ).toBe(succeeded ? 'succeeded' : 'abandoned');
      expect(rpc).toHaveBeenCalledWith(
        'resolve_booking_reschedule_request',
        expect.objectContaining({
          p_booking_id: action === 'propose' ? booking : null,
          p_proposal_id: action === 'propose' ? null : proposal,
          p_expected_proposal_revision: action === 'propose' ? null : 2,
          p_proposed_starts_at:
            action === 'propose' || action === 'counter'
              ? '2030-10-06T10:00:00.000Z'
              : null,
        }),
      );
    }
  },
);
test.each([
  'workspace_id',
  'booking_id',
  'request_id',
  'command_family',
  'outcome',
] as const)(
  'rejects mismatched envelope %s and retains command',
  async (field) => {
    setup({ ...statusEnvelope(), [field]: 'wrong' });
    jest.mocked(loadPendingWorkspaceBookingStatus).mockResolvedValue(status);
    await expect(
      resolvePendingWorkspaceBookingStatus(user, workspace),
    ).rejects.toMatchObject({ code: 'request' });
    expect(clearPendingWorkspaceBookingStatus).not.toHaveBeenCalled();
  },
);
test.each([
  null,
  [],
  {},
  { ...statusEnvelope(), result: {} },
  {
    ...statusEnvelope(),
    canonical_payload: {
      command: 'confirm',
      booking_id: booking,
      expected_revision: 4,
    },
  },
  {
    ...statusEnvelope(true),
    result: { ...statusEnvelope(true).result, replayed: false },
  },
  {
    ...statusEnvelope(true),
    result: { ...statusEnvelope(true).result, revision: 5 },
  },
])('retains status command on invalid resolution %#', async (data) => {
  setup(data);
  jest.mocked(loadPendingWorkspaceBookingStatus).mockResolvedValue(status);
  await expect(
    resolvePendingWorkspaceBookingStatus(user, workspace),
  ).rejects.toMatchObject({ code: 'request' });
  expect(clearPendingWorkspaceBookingStatus).not.toHaveBeenCalled();
});
test('reschedule mismatched canonical epoch and malformed receipt retain command', async () => {
  jest
    .mocked(loadPendingWorkspaceProposal)
    .mockResolvedValue(command('counter'));
  for (const data of [
    {
      ...proposalEnvelope('counter'),
      canonical_payload: {
        ...proposalEnvelope('counter').canonical_payload,
        proposed_starts_epoch: 0,
      },
    },
    {
      ...proposalEnvelope('counter', true),
      result: {
        ...proposalEnvelope('counter', true).result,
        proposal_revision: 4,
      },
    },
  ]) {
    setup(data);
    await expect(
      resolvePendingWorkspaceProposal(user, workspace),
    ).rejects.toMatchObject({ code: 'request' });
  }
  expect(clearPendingWorkspaceProposal).not.toHaveBeenCalled();
});
test('lost resolution response keeps pending and safely retries same request', async () => {
  const { header, rpc } = setup(statusEnvelope());
  jest.mocked(loadPendingWorkspaceBookingStatus).mockResolvedValue(status);
  header.mockRejectedValueOnce(new Error('lost'));
  await expect(
    resolvePendingWorkspaceBookingStatus(user, workspace),
  ).rejects.toMatchObject({ code: 'request' });
  expect(clearPendingWorkspaceBookingStatus).not.toHaveBeenCalled();
  expect(
    (await resolvePendingWorkspaceBookingStatus(user, workspace))?.outcome,
  ).toBe('abandoned');
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
});
test('account mismatch prevents both resolution RPCs', async () => {
  const { rpc, getSession } = setup(statusEnvelope());
  getSession.mockResolvedValue({
    data: { session: { user: { id: booking }, access_token: 'other' } },
    error: null,
  });
  await expect(
    resolveWorkspaceBookingStatusRequest(status, workspace),
  ).rejects.toMatchObject({ code: 'unavailable' });
  await expect(
    resolveWorkspaceProposalRequest(command('propose'), user, workspace),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
});
test('storage clear failure is surfaced after verified response and permits safe replay', async () => {
  setup(statusEnvelope());
  jest.mocked(loadPendingWorkspaceBookingStatus).mockResolvedValue(status);
  jest
    .mocked(clearPendingWorkspaceBookingStatus)
    .mockRejectedValueOnce(new Error('storage'));
  await expect(
    resolvePendingWorkspaceBookingStatus(user, workspace),
  ).rejects.toMatchObject({ code: 'request' });
  expect(
    (await resolvePendingWorkspaceBookingStatus(user, workspace))?.outcome,
  ).toBe('abandoned');
  expect(clearPendingWorkspaceBookingStatus).toHaveBeenCalledTimes(2);
});
