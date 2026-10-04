import { mutationAuth, financialId } from './financial-mutation-fixtures';
import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import {
  WorkspaceMutationBoundary,
  WorkspaceMutationProvider,
  useWorkspaceMutations,
} from '../src/features/workspace-scheduling/mutation-provider';
import {
  loadPendingTrainerBillingCommand,
  PendingTrainerBillingCommandError,
} from '../src/features/trainer-billing/command-storage';
import {
  submitTrainerBillingCommand,
  type TrainerBillingCommand,
} from '../src/features/trainer-billing/commands';
import { loadPendingWorkspaceBookingStatus } from '../src/features/workspace-scheduling/status-pending';
import { submitWorkspaceBookingStatus } from '../src/features/workspace-scheduling/status-submission';
import { loadPendingWorkspaceProposal } from '../src/features/workspace-scheduling/proposal-pending';
import { loadPendingWorkspaceBooking } from '../src/features/workspace-scheduling/pending';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/command-storage', () => ({
  ...jest.requireActual('../src/features/trainer-billing/command-storage'),
  loadPendingTrainerBillingCommand: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/commands', () => ({
  ...jest.requireActual('../src/features/trainer-billing/commands'),
  submitTrainerBillingCommand: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/status-pending', () => ({
  ...jest.requireActual('../src/features/workspace-scheduling/status-pending'),
  loadPendingWorkspaceBookingStatus: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/status-submission', () => ({
  submitWorkspaceBookingStatus: jest.fn(),
  resolvePendingWorkspaceBookingStatus: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/proposal-pending', () => ({
  ...jest.requireActual(
    '../src/features/workspace-scheduling/proposal-pending',
  ),
  loadPendingWorkspaceProposal: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/pending', () => ({
  ...jest.requireActual('../src/features/workspace-scheduling/pending'),
  loadPendingWorkspaceBooking: jest.fn(),
}));
const command: TrainerBillingCommand = {
  action: 'markNoShow',
  bookingId: '11111111-1111-4111-8111-111111111111',
  expectedBookingRevision: 1,
  requestId: '22222222-2222-4222-8222-222222222222',
};
const statusCommand = {
  action: 'cancel' as const,
  bookingId: command.bookingId,
  expectedRevision: 1,
  requestId: command.requestId,
};
let today: ReturnType<typeof useWorkspaceMutations>;
let schedule: ReturnType<typeof useWorkspaceMutations>;
function Today() {
  const store = useWorkspaceMutations();
  useEffect(() => {
    today = store;
  }, [store]);
  return null;
}
function Schedule() {
  const store = useWorkspaceMutations();
  useEffect(() => {
    schedule = store;
  }, [store]);
  return null;
}
function Tree({ userId = financialId(1) }: { userId?: string }) {
  return (
    <WorkspaceMutationProvider userId={userId} workspaceId={financialId(2)}>
      <Today />
      <WorkspaceMutationBoundary userId={userId} workspaceId={financialId(2)}>
        <Schedule />
      </WorkspaceMutationBoundary>
    </WorkspaceMutationProvider>
  );
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
let auth: ReturnType<typeof mutationAuth>;
beforeEach(() => {
  jest.clearAllMocks();
  auth = mutationAuth(financialId(1));
  auth.install();
  jest
    .mocked(loadPendingTrainerBillingCommand)
    .mockReset()
    .mockResolvedValue(null);
  jest
    .mocked(loadPendingWorkspaceBookingStatus)
    .mockReset()
    .mockResolvedValue(null);
  jest.mocked(loadPendingWorkspaceProposal).mockReset().mockResolvedValue(null);
  jest.mocked(loadPendingWorkspaceBooking).mockReset().mockResolvedValue(null);
});
test('retained consumers share hydration, synchronous network lock and recovery', async () => {
  const request =
    deferred<Awaited<ReturnType<typeof submitTrainerBillingCommand>>>();
  jest.mocked(submitTrainerBillingCommand).mockReturnValueOnce(request.promise);
  await render(<Tree />);
  await waitFor(() => expect(today.blocked).toBe(false));
  expect(today).toBe(schedule);
  expect(loadPendingTrainerBillingCommand).toHaveBeenCalledTimes(1);
  await act(async () => {
    void today.billing.submit(command);
    expect(await schedule.status.submit(statusCommand)).toBe(false);
  });
  expect(schedule.busy).toBe(true);
  expect(submitWorkspaceBookingStatus).not.toHaveBeenCalled();
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(command);
  await act(async () =>
    request.resolve({
      bookingId: command.bookingId,
      attendanceId: 'attendance',
      revision: 1,
      cycle: 1,
      status: 'noshow',
      serviceDate: '2026-10-03',
      purchaseId: null,
      creditEntryId: null,
      charged: false,
      replayed: false,
    }),
  );
  expect(schedule.billing.pending).toEqual(command);
  expect(today.blocked).toBe(true);
  await act(async () =>
    expect(await today.status.submit(statusCommand)).toBe(false),
  );
});
test('legacy pending in two domains allows owned replay but refuses new commands', async () => {
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(command);
  jest
    .mocked(loadPendingWorkspaceBookingStatus)
    .mockResolvedValue(statusCommand);
  jest.mocked(submitWorkspaceBookingStatus).mockResolvedValue({
    bookingId: command.bookingId,
    revision: 2,
    status: 'cancelled_by_trainer',
    replayed: true,
  });
  await render(<Tree />);
  await waitFor(() => expect(schedule.status.loading).toBe(false));
  await act(async () =>
    expect(await today.status.submit(statusCommand)).toBe(false),
  );
  jest.mocked(loadPendingWorkspaceBookingStatus).mockResolvedValue(null);
  await act(async () => expect(await schedule.status.resume()).toBe(true));
  expect(submitWorkspaceBookingStatus).toHaveBeenCalledWith(
    financialId(1),
    financialId(2),
    statusCommand,
  );
  expect(today.billing.pending).toEqual(command);
  expect(today.generation).toBe(1);
  expect(today.blocked).toBe(true);
});
test.each(['storage', 'invalid'] as const)(
  'billing %s prevents cancellation and recovers through readable reload',
  async (code) => {
    jest
      .mocked(loadPendingTrainerBillingCommand)
      .mockRejectedValueOnce(new PendingTrainerBillingCommandError(code));
    await render(<Tree />);
    await waitFor(() => expect(today.billing.loading).toBe(false));
    expect(today.blocked).toBe(true);
    await act(async () =>
      expect(await schedule.status.submit(statusCommand)).toBe(false),
    );
    expect(submitWorkspaceBookingStatus).not.toHaveBeenCalled();
    await act(async () => schedule.billing.reload());
    await waitFor(() => expect(today.blocked).toBe(false));
  },
);
test('account change isolates delayed completion and invalidates captured callbacks', async () => {
  const request =
    deferred<Awaited<ReturnType<typeof submitWorkspaceBookingStatus>>>();
  jest
    .mocked(submitWorkspaceBookingStatus)
    .mockReturnValueOnce(request.promise);
  const view = await render(<Tree />);
  await waitFor(() => expect(today.blocked).toBe(false));
  const old = today;
  await act(async () => {
    void old.status.submit(statusCommand);
  });
  await act(async () => auth.emit('SIGNED_IN', auth.session(financialId(9))));
  await view.rerender(<Tree userId={financialId(9)} />);
  await waitFor(() => expect(today.blocked).toBe(false));
  await act(async () =>
    request.resolve({
      bookingId: command.bookingId,
      revision: 2,
      status: 'cancelled_by_trainer',
      replayed: false,
    }),
  );
  expect(today.userId).toBe(financialId(9));
  expect(today.generation).toBe(0);
  expect(today.status.pending).toBeNull();
  await act(async () => expect(await old.billing.submit(command)).toBe(false));
});

test('same-user login invalidates captured results and cannot unlock a new submit', async () => {
  const oldRequest =
    deferred<Awaited<ReturnType<typeof submitWorkspaceBookingStatus>>>();
  const newRequest =
    deferred<Awaited<ReturnType<typeof submitWorkspaceBookingStatus>>>();
  jest
    .mocked(submitWorkspaceBookingStatus)
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);
  await render(<Tree />);
  await waitFor(() => expect(today.blocked).toBe(false));
  const old = today;
  let completion!: Promise<boolean>;
  await act(async () => {
    completion = old.status.submit(statusCommand);
  });
  await act(async () =>
    auth.emit(
      'SIGNED_IN',
      auth.session(financialId(1), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ),
  );
  await waitFor(() => expect(today.blocked).toBe(false));
  await act(async () => {
    void today.status.submit(statusCommand);
  });
  await act(async () =>
    oldRequest.resolve({
      bookingId: command.bookingId,
      revision: 2,
      status: 'cancelled_by_trainer',
      replayed: false,
    }),
  );
  expect(await completion).toBe(false);
  expect(today.busy).toBe(true);
  expect(today.generation).toBe(0);
  await act(async () => expect(await old.billing.submit(command)).toBe(false));
  await act(async () =>
    newRequest.resolve({
      bookingId: command.bookingId,
      revision: 2,
      status: 'cancelled_by_trainer',
      replayed: false,
    }),
  );
  expect(today.busy).toBe(false);
  expect(today.generation).toBe(1);
});

test('provider verification failure offers a fresh session retry', async () => {
  auth.getSession.mockRejectedValueOnce(new Error('temporary auth storage'));
  await render(<Tree />);
  await waitFor(() => expect(today.unavailable).toBe(true));
  expect(today.blocked).toBe(true);
  await act(async () => today.retrySession());
  await waitFor(() => expect(today.blocked).toBe(false));
  expect(today.unavailable).toBe(false);
});
