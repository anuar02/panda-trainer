import {
  snapshotTrainerBillingCommand,
  type TrainerBillingCommand,
} from '../src/features/trainer-billing/commands';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));

const uppercaseId = 'ABCDEFAB-1234-4234-8234-ABCDEFABCDEF';

jest.mock('../src/features/trainer-billing/service', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {},
}));

test('canonicalizes identifiers while preserving a UUID-shaped package title', () => {
  const command: TrainerBillingCommand = {
    action: 'createPurchase',
    requestId: uppercaseId,
    clientRecordId: uppercaseId,
    title: uppercaseId,
    units: 3,
    priceMinor: '9223372036854775807',
  };
  expect(snapshotTrainerBillingCommand(command)).toEqual({
    ...command,
    requestId: uppercaseId.toLowerCase(),
    clientRecordId: uppercaseId.toLowerCase(),
  });
  expect(command.requestId).toBe(uppercaseId);
});

test('keeps the exact payment reason and lossless amount for retries', () => {
  const command: TrainerBillingCommand = {
    action: 'recordPayment',
    requestId: uppercaseId,
    purchaseId: uppercaseId,
    amountMinor: '9007199254740993',
    paidOn: '2026-10-03',
    method: 'Kaspi',
    reason: uppercaseId,
  };
  const saved = snapshotTrainerBillingCommand(command);
  expect(saved).toEqual({
    ...command,
    requestId: uppercaseId.toLowerCase(),
    purchaseId: uppercaseId.toLowerCase(),
  });
  expect(snapshotTrainerBillingCommand(saved)).toEqual(saved);
});
