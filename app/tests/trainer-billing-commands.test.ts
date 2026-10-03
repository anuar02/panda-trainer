import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  submitTrainerBillingCommand,
  type TrainerBillingCommand,
} from '../src/features/trainer-billing/commands';
import {
  loadPendingTrainerBillingCommand,
  savePendingTrainerBillingCommand,
} from '../src/features/trainer-billing/command-storage';
import {
  markNoShow,
  recordClientPayment,
} from '../src/features/trainer-billing/service';
import { TrainerBillingError } from '../src/features/trainer-billing/types';
jest.mock('../src/features/trainer-billing/service', () => ({
  markNoShow: jest.fn(),
  recordClientPayment: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
const user = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const command: TrainerBillingCommand = {
  action: 'markNoShow',
  bookingId: other,
  expectedBookingRevision: 2,
  requestId: '44444444-4444-4444-8444-444444444444',
};
const rpc = jest.mocked(markNoShow);
const rows = new Map<string, string>();
beforeEach(() => {
  jest.resetAllMocks();
  rows.clear();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => rows.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    rows.set(key, value);
  });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
    rows.delete(key);
  });
  rpc.mockResolvedValue({
    attendanceId: other,
    bookingId: other,
    revision: 1,
    status: 'noshow',
    cycle: 1,
    serviceDate: '2026-10-03',
    purchaseId: null,
    charged: false,
    creditEntryId: null,
    replayed: false,
  });
});
const paymentCommand: TrainerBillingCommand = {
  action: 'recordPayment',
  purchaseId: other,
  amountMinor: '9007199254740993',
  paidOn: '2026-10-03',
  method: 'Kaspi',
  requestId: '54444444-4444-4444-8444-444444444444',
};
const paymentResult = {
  paymentEntryId: other,
  workspaceId: workspace,
  clientRecordId: other,
  purchaseId: other,
  kind: 'payment' as const,
  amountMinor: '9007199254740993',
  currency: 'KZT' as const,
  paidOn: '2026-10-03',
  method: 'Kaspi' as const,
  source: 'manual' as const,
  reason: null,
  reversesEntryId: null,
  paidMinor: '9007199254740993',
  dueMinor: '0',
  replayed: false,
};
test('lost payment response retains exact amount and request for replay', async () => {
  const paymentRpc = jest.mocked(recordClientPayment);
  paymentRpc
    .mockRejectedValueOnce(new TrainerBillingError('request'))
    .mockResolvedValue(paymentResult);
  await expect(
    submitTrainerBillingCommand(user, workspace, paymentCommand),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    paymentCommand,
  );
  await submitTrainerBillingCommand(user, workspace, paymentCommand);
  expect(paymentRpc.mock.calls[0][0]).toEqual(paymentRpc.mock.calls[1][0]);
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
});
test('definitive overpayment removes pending command so a corrected amount can be submitted', async () => {
  jest
    .mocked(recordClientPayment)
    .mockRejectedValue(new TrainerBillingError('overpayment'));
  await expect(
    submitTrainerBillingCommand(user, workspace, paymentCommand),
  ).rejects.toMatchObject({ code: 'overpayment' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
});
test('payment receipt from another workspace is not accepted and remains recoverable', async () => {
  jest
    .mocked(recordClientPayment)
    .mockResolvedValue({ ...paymentResult, workspaceId: other });
  await expect(
    submitTrainerBillingCommand(user, workspace, paymentCommand),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    paymentCommand,
  );
});
test('transport loss preserves exact request across reload and refuses replacement', async () => {
  rpc.mockRejectedValueOnce(new TrainerBillingError('request'));
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
  await expect(
    submitTrainerBillingCommand(user, workspace, {
      ...command,
      expectedBookingRevision: 3,
    }),
  ).rejects.toMatchObject({ code: 'unresolved' });
  expect(rpc).toHaveBeenCalledTimes(1);
  await submitTrainerBillingCommand(user, workspace, command);
  expect(rpc.mock.calls[1]?.[0]).toMatchObject({
    ...command,
    expectedUserId: user,
  });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
});
test.each(['conflict', 'invalidState'] as const)(
  'proven %s rejection clears lock',
  async (code) => {
    rpc.mockRejectedValueOnce(new TrainerBillingError(code));
    await expect(
      submitTrainerBillingCommand(user, workspace, command),
    ).rejects.toMatchObject({ code });
    expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
  },
);
test('storage write failure never reaches RPC', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk'));
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(rpc).not.toHaveBeenCalled();
});
test('successful RPC with failed cleanup retains replayable lock', async () => {
  jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('disk'));
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
  await submitTrainerBillingCommand(user, workspace, command);
  expect(rpc).toHaveBeenCalledTimes(2);
});
test('pending scopes isolate accounts and workspaces', async () => {
  await savePendingTrainerBillingCommand(user, workspace, command);
  expect(await loadPendingTrainerBillingCommand(other, workspace)).toBeNull();
  expect(await loadPendingTrainerBillingCommand(user, other)).toBeNull();
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
});
test('corrupt storage is preserved and blocks all commands', async () => {
  rows.set(
    `panda-trainer-pending-billing-v1:${user}:${workspace}`,
    '{"action":"markNoShow"}',
  );
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(rpc).not.toHaveBeenCalled();
  expect(rows.size).toBe(1);
});
