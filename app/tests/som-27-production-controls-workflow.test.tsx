import { ClientSchedulingCommandBoundary } from '../src/features/client-scheduling/command-coordinator';
import type { TrainerBilling } from '../src/features/trainer-billing/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, type PropsWithChildren } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { getSupabaseClient } from '../src/features/auth/client';
import { schedulingAuthFixture } from './scheduling-command-auth-fixture';
import {
  WorkspaceMutationProvider,
  useWorkspaceMutations,
} from '../src/features/workspace-scheduling/mutation-provider';
import { WorkspaceSessionControls } from '../src/features/workspace-scheduling/workspace-session-controls';
import {
  WorkspaceProposalProvider,
  WorkspaceProposalRecovery,
} from '../src/features/workspace-scheduling/workspace-proposal-controls';
import {
  ClientBookingControls,
  ClientBookingStatusRecovery,
} from '../src/features/client-scheduling/client-booking-controls';
import { useClientBookingStatus } from '../src/features/client-scheduling/use-status';
import type {
  ClientScheduleBooking,
  ClientScheduleProposal,
} from '../src/features/client-scheduling/service';
import type {
  WorkspaceSchedule,
  WorkspaceScheduleBooking,
  WorkspaceScheduleProposal,
} from '../src/features/workspace-scheduling/service';
import { loadPendingWorkspaceProposal } from '../src/features/workspace-scheduling/proposal-pending';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../src/features/trainer-billing/use-billing', () => ({
  useTrainerBilling: () => ({
    data: mockBilling,
    loading: false,
    error: null,
    retry: jest.fn(),
  }),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () =>
    `a1000000-0000-4000-8000-${(++mockRequest).toString().padStart(12, '0')}`,
}));
let mockRequest = 0;
let mockBilling: TrainerBilling = {
  purchases: [],
  attendance: [],
  revisions: [],
  credits: [],
};
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
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
      clear: jest.fn(async () => {
        values.clear();
      }),
    },
  };
});
const trainer = '51000000-0000-4000-8000-000000000001';
const client = '51000000-0000-4000-8000-000000000002';
const workspace = '61000000-0000-4000-8000-000000000001';
const clientRecordId = '71000000-0000-4000-8000-000000000001';
const bookingId = '81000000-0000-4000-8000-000000000001';
const proposalId = '91000000-0000-4000-8000-000000000001';
const original = '2030-10-02T10:00:00.000Z';
let booking: WorkspaceScheduleBooking;
let proposals: WorkspaceScheduleProposal[];
let response: () => Promise<{ data: unknown; error: { code: string } | null }>;
let auth: ReturnType<typeof schedulingAuthFixture>;
const rpc = jest.fn((_name: string, _args: Record<string, unknown>) => ({
  setHeader: jest.fn(() => response()),
}));
const refresh = jest.fn();
const close = jest.fn();
function ClientControls() {
  const status = useClientBookingStatus({
    userId: client,
    workspaceId: workspace,
    clientRecordId,
    onChanged: refresh,
  });
  const clientBooking: ClientScheduleBooking = { ...booking, program: null };
  const clientProposals: ClientScheduleProposal[] = proposals.map((row) => ({
    id: row.id,
    bookingId,
    proposedStartsAtUtc: row.proposed_starts_at,
    proposedEndsAtUtc: row.proposed_ends_at,
    baseRevision: row.base_revision,
    revision: row.revision,
    authorRole: row.authorRole,
    booking: clientBooking,
  }));
  return (
    <WorkspaceProposalProvider
      userId={client}
      workspaceId={workspace}
      clientRecordId={clientRecordId}
      onChanged={refresh}
      externalBusy={status.busy}
    >
      {(proposal) => (
        <ClientSchedulingCommandBoundary status={status} proposal={proposal}>
          {(status, proposal) => (
            <>
              <WorkspaceProposalRecovery store={proposal} />
              <ClientBookingStatusRecovery
                store={status}
                externalBusy={proposal.busy}
              />
              <ClientBookingControls
                userId={client}
                workspaceId={workspace}
                clientRecordId={clientRecordId}
                clientName="Synthetic client"
                timezone="UTC"
                booking={clientBooking}
                proposals={clientProposals}
                proposalStore={proposal}
                statusStore={status}
              />
            </>
          )}
        </ClientSchedulingCommandBoundary>
      )}
    </WorkspaceProposalProvider>
  );
}
function GenerationObserver() {
  const { generation } = useWorkspaceMutations();
  useEffect(() => {
    if (generation > 0) refresh();
  }, [generation]);
  return null;
}
function TrainerControls() {
  const schedule: WorkspaceSchedule = {
    availability: {
      id: workspace,
      timezone: 'UTC',
      working_days: [1, 2, 3, 4, 5],
      day_start: '08:00:00',
      day_end: '20:00:00',
      usual_session_minutes: 60,
    },
    bookings: [booking],
    pendingProposals: proposals,
  };
  return (
    <WorkspaceMutationProvider userId={trainer} workspaceId={workspace}>
      <GenerationObserver />
      <WorkspaceSessionControls
        userId={trainer}
        workspaceId={workspace}
        timezone="UTC"
        schedule={schedule}
        selectedId={bookingId}
        onClose={close}
        onRetry={refresh}
      />
    </WorkspaceMutationProvider>
  );
}
async function mount(role: 'trainer' | 'client') {
  auth = schedulingAuthFixture(
    role === 'trainer' ? trainer : client,
    workspace,
    clientRecordId,
  );
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ ...auth.client, rpc } as unknown as ReturnType<
      typeof getSupabaseClient
    >);
  return render(role === 'trainer' ? <TrainerControls /> : <ClientControls />);
}
const receipt = (
  action: 'propose' | 'counter' | 'accept' | 'decline' | 'withdraw',
  revision: number,
  nextBooking = booking,
) => ({
  proposal_id: proposalId,
  proposal_revision: revision,
  proposal_status:
    action === 'propose' || action === 'counter'
      ? 'pending'
      : action === 'accept'
        ? 'accepted'
        : action === 'decline'
          ? 'declined'
          : 'withdrawn',
  booking_id: bookingId,
  booking_revision: nextBooking.revision,
  booking_status: nextBooking.status,
  starts_at: nextBooking.starts_at,
  ends_at: nextBooking.ends_at,
  replayed: false,
});
const pending = (
  authorRole: 'trainer' | 'client',
  revision: number,
  target: string,
): WorkspaceScheduleProposal => ({
  id: proposalId,
  workspace_id: workspace,
  booking_id: bookingId,
  proposed_starts_at: target,
  proposed_ends_at: new Date(Date.parse(target) + 3600000).toISOString(),
  base_revision: booking.revision,
  status: 'pending',
  revision,
  created_at: original,
  updated_at: original,
  authorRole,
  booking,
});
async function press(label: string) {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: label })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: label }));
}
async function propose(role: 'trainer' | 'client', counter = false) {
  await press(
    counter
      ? 'Другое время'
      : role === 'client'
        ? 'Предложить перенос'
        : 'Перенос занятия',
  );
  await fireEvent.changeText(
    screen.getByLabelText('Новая дата'),
    counter ? '2030-10-04' : '2030-10-03',
  );
  await fireEvent.changeText(screen.getByLabelText('Начало'), '12:00');
  await press('Отправить предложение');
}
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockRequest = 0;
  mockBilling = { purchases: [], attendance: [], revisions: [], credits: [] };
  booking = {
    id: bookingId,
    workspace_id: workspace,
    client_record_id: clientRecordId,
    group_session_id: null,
    client_name: 'Synthetic client',
    starts_at: original,
    ends_at: '2030-10-02T11:00:00.000Z',
    status: 'confirmed',
    revision: 3,
  };
  proposals = [];
  response = async () => ({ data: null, error: null });
});
test.each(['trainer', 'client'] as const)(
  '%s propose → opposite counter → author accept uses real controls, hooks, durable store and transport',
  async (first) => {
    const second = first === 'trainer' ? 'client' : 'trainer';
    let release!: () => void;
    response = () =>
      new Promise((resolve) => {
        release = () => resolve({ data: receipt('propose', 1), error: null });
      });
    let tree = await mount(first);
    await propose(first);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(booking.starts_at).toBe(original);
    expect(
      await loadPendingWorkspaceProposal(
        first === 'trainer' ? trainer : client,
        workspace,
      ),
    ).toMatchObject({
      action: 'propose',
      expectedBookingRevision: 3,
      proposedStartsAtUtc: '2030-10-03T12:00:00.000Z',
    });
    await act(async () => release());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    proposals = [pending(first, 1, '2030-10-03T12:00:00.000Z')];
    await tree.unmount();
    response = async () => ({ data: receipt('counter', 2), error: null });
    tree = await mount(second);
    await propose(second, true);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(booking.starts_at).toBe(original);
    expect(rpc.mock.calls[1]).toEqual([
      'counter_booking_reschedule',
      expect.objectContaining({
        p_expected_booking_revision: 3,
        p_expected_proposal_revision: 1,
      }),
    ]);
    proposals = [pending(second, 2, '2030-10-04T12:00:00.000Z')];
    await tree.unmount();
    const accepted = {
      ...booking,
      revision: 4,
      starts_at: proposals[0]!.proposed_starts_at,
      ends_at: proposals[0]!.proposed_ends_at,
    };
    response = async () => ({
      data: receipt('accept', 3, accepted),
      error: null,
    });
    tree = await mount(first);
    await press('Принять');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
    expect(rpc.mock.calls[2]).toEqual([
      'accept_booking_reschedule',
      expect.objectContaining({
        p_expected_booking_revision: 3,
        p_expected_proposal_revision: 2,
      }),
    ]);
    expect(
      await loadPendingWorkspaceProposal(
        first === 'trainer' ? trainer : client,
        workspace,
      ),
    ).toBeNull();
    await tree.unmount();
  },
);
test.each(['trainer', 'client'] as const)(
  '%s decline and withdraw leave confirmed time unchanged',
  async (role) => {
    for (const action of ['decline', 'withdraw'] as const) {
      proposals = [
        pending(
          action === 'withdraw'
            ? role
            : role === 'trainer'
              ? 'client'
              : 'trainer',
          1,
          '2030-10-03T12:00:00.000Z',
        ),
      ];
      response = async () => ({ data: receipt(action, 2), error: null });
      const tree = await mount(role);
      await press(action === 'decline' ? 'Отклонить' : 'Отозвать запрос');
      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith(
          `${action}_booking_reschedule`,
          expect.objectContaining({
            p_expected_booking_revision: 3,
            p_expected_proposal_revision: 1,
          }),
        ),
      );
      await waitFor(() => expect(refresh).toHaveBeenCalled());
      expect(booking.starts_at).toBe(original);
      await tree.unmount();
    }
  },
);
test.each(['trainer', 'client'] as const)(
  '%s cancel is a single participant command with no automatic billing RPC',
  async (role) => {
    response = async () => ({
      data: {
        booking_id: bookingId,
        revision: 4,
        status: `cancelled_by_${role}`,
        replayed: false,
      },
      error: null,
    });
    const tree = await mount(role);
    if (role === 'client') {
      await press('Отменить запись');
      await fireEvent.press(
        screen.getAllByRole('button', { name: 'Отменить запись' })[1]!,
      );
    } else await press('Отменить участие: Synthetic client');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(rpc.mock.calls).toEqual([
      [
        'cancel_booking',
        expect.objectContaining({
          p_booking_id: bookingId,
          p_expected_revision: 3,
        }),
      ],
    ]);
    await tree.unmount();
  },
);

test.each(['client', 'trainer'] as const)(
  'explicit late %s cancellation debit requires a reason and uses the unchanged billing caller',
  async (cancelledBy) => {
    booking = {
      ...booking,
      status:
        cancelledBy === 'client'
          ? 'cancelled_by_client'
          : 'cancelled_by_trainer',
      revision: 4,
    };
    const purchaseId = 'b1000000-0000-4000-8000-000000000001';
    const grantId = 'b1000000-0000-4000-8000-000000000002';
    const creditId = 'b1000000-0000-4000-8000-000000000003';
    mockBilling = {
      purchases: [
        {
          id: purchaseId,
          workspaceId: workspace,
          clientRecordId,
          title: 'Synthetic package',
          units: 1,
          priceMinor: '1000',
          currency: 'KZT',
          expiresOn: null,
          createdAt: original,
        },
      ],
      credits: [
        {
          id: grantId,
          workspaceId: workspace,
          clientRecordId,
          purchaseId,
          attendanceId: null,
          bookingId: null,
          cycle: null,
          kind: 'grant',
          units: 1,
          reason: null,
          reversesEntryId: null,
          createdAt: original,
        },
      ],
      attendance: [],
      revisions: [],
    };
    const tree = await mount('trainer');
    await press('Списать за отмену или неявку');
    expect(
      screen.getByRole('button', { name: 'Списать 1 занятие' }),
    ).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByLabelText('Причина'),
      '  Synthetic late reason  ',
    );
    response = async () => ({
      data: {
        booking_id: bookingId,
        attendance_id: null,
        revision: null,
        status: null,
        cycle: null,
        service_date: null,
        purchase_id: purchaseId,
        charged: true,
        credit_entry_id: creditId,
        replayed: false,
      },
      error: null,
    });
    await press('Списать 1 занятие');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls).toEqual([
      [
        'charge_late_cancellation',
        expect.objectContaining({
          p_booking_id: bookingId,
          p_expected_booking_revision: 4,
          p_reason: 'Synthetic late reason',
          p_purchase_id: purchaseId,
        }),
      ],
    ]);
    expect(booking.status).toBe(`cancelled_by_${cancelledBy}`);
    expect(booking.revision).toBe(4);
    await tree.unmount();
  },
);
