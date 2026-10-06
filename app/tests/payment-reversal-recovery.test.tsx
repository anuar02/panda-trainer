import { mutationAuth, financialId } from './financial-mutation-fixtures';
import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import {
  WorkspaceMutationBoundary,
  WorkspaceMutationProvider,
  useWorkspaceMutations,
} from '../src/features/workspace-scheduling/mutation-provider';
import { loadPendingTrainerBillingCommand } from '../src/features/trainer-billing/command-storage';
import {
  submitTrainerBillingCommand,
  type TrainerBillingCommand,
} from '../src/features/trainer-billing/commands';
import { loadPendingWorkspaceBookingStatus } from '../src/features/workspace-scheduling/status-pending';
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
  action: 'reversePayment',
  paymentEntryId: '11111111-1111-4111-8111-111111111111',
  clientRecordId: '31111111-1111-4111-8111-111111111111',
  purchaseId: '41111111-1111-4111-8111-111111111111',
  amountMinor: '9007199254740993',
  reason: 'Ошибка оплаты',
  requestId: '22222222-2222-4222-8222-222222222222',
};
const statusCommand = {
  action: 'cancel' as const,
  bookingId: '11111111-1111-4111-8111-111111111111',
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

const receipt = {
  paymentEntryId: command.requestId,
  workspaceId: financialId(2),
  clientRecordId: command.clientRecordId,
  purchaseId: command.purchaseId,
  kind: 'reversal' as const,
  amountMinor: `-${command.amountMinor}`,
  currency: 'KZT' as const,
  paidOn: '2026-10-03',
  method: 'Kaspi' as const,
  source: 'manual' as const,
  reason: command.reason,
  reversesEntryId: command.paymentEntryId,
  paidMinor: '0',
  dueMinor: command.amountMinor,
  replayed: true,
};
test('reversal double tap shares workspace lock and restart resumes the exact saved command', async () => {
  const request =
    deferred<Awaited<ReturnType<typeof submitTrainerBillingCommand>>>();
  jest.mocked(submitTrainerBillingCommand).mockReturnValueOnce(request.promise);
  const view = await render(<Tree />);
  await waitFor(() => expect(today.blocked).toBe(false));
  const submit = today.billing.submit;
  await act(async () => {
    void submit(command);
    expect(await submit({ ...command, requestId: command.purchaseId })).toBe(
      false,
    );
    expect(await schedule.status.submit(statusCommand)).toBe(false);
  });
  expect(submitTrainerBillingCommand).toHaveBeenCalledTimes(1);
  expect(today.generation).toBe(0);
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(command);
  await act(async () => request.resolve(receipt));
  expect(today.blocked).toBe(true);
  await view.unmount();
  jest.mocked(submitTrainerBillingCommand).mockResolvedValue(receipt);
  await render(<Tree />);
  await waitFor(() => expect(today.billing.pending).toEqual(command));
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(null);
  await act(async () => expect(await schedule.billing.resume()).toBe(true));
  const calls = jest.mocked(submitTrainerBillingCommand).mock.calls;
  expect(calls[0]?.slice(0, 3)).toEqual(calls[1]?.slice(0, 3));
  expect(today.blocked).toBe(false);
  expect(today.generation).toBe(1);
});

test('old account reversal callback cannot submit after provider switch', async () => {
  const view = await render(<Tree />);
  await waitFor(() => expect(today.blocked).toBe(false));
  const stale = today.billing.submit;
  await act(async () => auth.emit('SIGNED_IN', auth.session(financialId(9))));
  await view.rerender(<Tree userId={financialId(9)} />);
  await waitFor(() => expect(today.blocked).toBe(false));
  await act(async () => expect(await stale(command)).toBe(false));
  expect(submitTrainerBillingCommand).not.toHaveBeenCalled();
  expect(today.billing.pending).toBeNull();
});
