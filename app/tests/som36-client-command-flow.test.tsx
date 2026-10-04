import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getSupabaseClient } from '../src/features/auth/client';
import { useClientSchedule } from '../src/features/client-scheduling/use-schedule';
import { useClientBookingStatus } from '../src/features/client-scheduling/use-status';
import { useWorkspaceProposalCommands } from '../src/features/workspace-scheduling/use-proposal';
import { loadClientOverview } from '../src/features/client-home/overview-service';
import {
  clientNetwork,
  user,
  workspace,
  card,
  bookingId,
  scope,
} from './som36-client-network';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
      clear: jest.fn(async () => values.clear()),
    },
  };
});
const proposalId = 'f1360000-0000-4000-8000-000000000080';
const requestId = 'f1360000-0000-4000-8000-000000000090';
const nextRequest = 'f1360000-0000-4000-8000-000000000091';
const cancelRequest = 'f1360000-0000-4000-8000-000000000092';
function useFlow() {
  const read = useClientSchedule({
    userId: user,
    workspaceId: workspace,
    clientRecordId: card,
  });
  const proposal = useWorkspaceProposalCommands({
    userId: user,
    workspaceId: workspace,
    clientRecordId: card,
    onChanged: read.retry,
  });
  const status = useClientBookingStatus({
    userId: user,
    workspaceId: workspace,
    clientRecordId: card,
    onChanged: read.retry,
  });
  return { read, proposal, status };
}
let api: ReturnType<typeof clientNetwork>;
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  api = clientNetwork();
  api.tables.schedule_proposals = [];
  jest.mocked(getSupabaseClient).mockReturnValue(api.client);
});
test('request→lost response→reopen→exact retry→trainer proposal→client reply→cancel re-reads canonical server state', async () => {
  const receipts = new Map<string, Record<string, unknown>>();
  let loseResponse = true;
  api.setCommandHandler(async (name, args) => {
    const identity = String(args.p_request_id);
    const prior = receipts.get(identity);
    if (prior) return { data: { ...prior, replayed: true }, error: null };
    const booking = api.tables.bookings![0]!;
    if (name === 'propose_booking_reschedule') {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(identity),
      );
      api.tables.schedule_proposals = [
        {
          id: proposalId,
          workspace_id: workspace,
          booking_id: bookingId,
          proposed_starts_at: args.p_proposed_starts_at,
          proposed_ends_at: '2030-10-07T11:00:00.000Z',
          base_revision: 1,
          status: 'pending',
          revision: 1,
          created_at: '2026-10-04T10:00:00Z',
          updated_at: '2026-10-04T10:00:00Z',
          author_role: 'client',
        },
      ];
      const result = {
        proposal_id: proposalId,
        proposal_revision: 1,
        proposal_status: 'pending',
        booking_id: bookingId,
        booking_revision: 1,
        booking_status: booking.status,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        replayed: false,
      };
      receipts.set(identity, result);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Synthetic lost response after commit');
      }
      return { data: result, error: null };
    }
    if (name === 'accept_booking_reschedule') {
      const proposal = api.tables.schedule_proposals![0]!;
      expect(args.p_expected_proposal_revision).toBe(2);
      proposal.status = 'accepted';
      proposal.revision = 3;
      booking.starts_at = proposal.proposed_starts_at;
      booking.ends_at = proposal.proposed_ends_at;
      booking.revision = 2;
      const result = {
        proposal_id: proposalId,
        proposal_revision: 3,
        proposal_status: 'accepted',
        booking_id: bookingId,
        booking_revision: 2,
        booking_status: booking.status,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        replayed: false,
      };
      receipts.set(identity, result);
      return { data: result, error: null };
    }
    if (name === 'cancel_booking') {
      expect(args.p_expected_revision).toBe(2);
      booking.status = 'cancelled_by_client';
      booking.revision = 3;
      const result = {
        booking_id: bookingId,
        revision: 3,
        status: 'cancelled_by_client',
        replayed: false,
      };
      receipts.set(identity, result);
      return { data: result, error: null };
    }
    throw new Error('Unexpected command');
  });
  const before = await loadClientOverview(scope);
  const first = await renderHook(useFlow);
  await waitFor(() =>
    expect(first.result.current.proposal.loading).toBe(false),
  );
  await act(async () => {
    expect(
      await first.result.current.proposal.submit({
        action: 'propose',
        bookingId,
        expectedBookingRevision: 1,
        requestId,
        proposedStartsAtUtc: '2030-10-07T10:00:00.000Z',
      }),
    ).toBeNull();
  });
  expect(first.result.current.proposal.error).toBe('request');
  expect(first.result.current.proposal.pending?.requestId).toBe(requestId);
  await first.unmount();
  const reopened = await renderHook(useFlow);
  await waitFor(() =>
    expect(reopened.result.current.proposal.pending?.requestId).toBe(requestId),
  );
  await act(async () => {
    expect(await reopened.result.current.proposal.resume()).toMatchObject({
      replayed: true,
    });
  });
  await waitFor(() =>
    expect(
      reopened.result.current.read.schedule?.pendingProposals[0]?.authorRole,
    ).toBe('client'),
  );
  const proposals = api.calls.filter(
    (call) => call.table === 'propose_booking_reschedule',
  );
  expect(proposals.map((call) => call.args.p_request_id)).toEqual([
    requestId,
    requestId,
  ]);
  expect(reopened.result.current.read.schedule?.bookings[0]?.starts_at).toBe(
    '2030-10-06T10:00:00Z',
  );
  const proposal = api.tables.schedule_proposals![0]!;
  proposal.author_role = 'trainer';
  proposal.revision = 2;
  proposal.proposed_starts_at = '2030-10-08T10:00:00.000Z';
  proposal.proposed_ends_at = '2030-10-08T11:00:00.000Z';
  await act(async () => reopened.result.current.read.retry());
  await waitFor(() =>
    expect(
      reopened.result.current.read.schedule?.pendingProposals[0]?.authorRole,
    ).toBe('trainer'),
  );
  await act(async () => {
    expect(
      await reopened.result.current.proposal.submit({
        action: 'accept',
        bookingId,
        expectedBookingRevision: 1,
        requestId: nextRequest,
        proposalId,
        expectedProposalRevision: 2,
      }),
    ).toMatchObject({ bookingRevision: 2 });
  });
  await waitFor(() =>
    expect(reopened.result.current.read.schedule?.bookings[0]?.starts_at).toBe(
      '2030-10-08T10:00:00.000Z',
    ),
  );
  await act(async () => {
    expect(
      await reopened.result.current.status.submit({
        action: 'cancel',
        bookingId,
        expectedRevision: 2,
        requestId: cancelRequest,
      }),
    ).toMatchObject({ status: 'cancelled_by_client' });
  });
  await waitFor(() =>
    expect(reopened.result.current.read.schedule?.bookings).toEqual([]),
  );
  expect(await loadClientOverview(scope)).toEqual(before);
  expect(
    api.calls.some((call) => /payment|attendance|charge/.test(call.table)),
  ).toBe(false);
  await reopened.unmount();
  expect(api.listenerCount()).toBe(0);
});
test('revision conflict keeps exact pending request, refreshes read and creates no optimistic change', async () => {
  api.setCommandHandler(async () => ({ data: null, error: { code: '40001' } }));
  const flow = await renderHook(useFlow);
  await waitFor(() => expect(flow.result.current.proposal.loading).toBe(false));
  await act(async () => {
    await flow.result.current.proposal.submit({
      action: 'propose',
      bookingId,
      expectedBookingRevision: 1,
      requestId,
      proposedStartsAtUtc: '2030-10-07T10:00:00.000Z',
    });
  });
  expect(flow.result.current.proposal.error).toBe('conflict');
  expect(flow.result.current.proposal.pending?.requestId).toBe(requestId);
  await waitFor(() =>
    expect(flow.result.current.read.schedule?.bookings[0]?.revision).toBe(1),
  );
  expect(flow.result.current.read.schedule?.pendingProposals).toEqual([]);
  await flow.unmount();
});
