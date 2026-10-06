import { financialToken } from './financial-read-fixtures';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  recordClientPayment,
  reverseClientPayment,
} from '../src/features/trainer-payments/commands';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
const id = (value: number) =>
  `51000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const input = {
  expectedUserId: id(1),
  requestId: id(2),
  purchaseId: id(3),
  amountMinor: '9007199254740993',
  paidOn: '2026-10-03',
  method: 'Kaspi' as const,
};
const receipt = {
  payment_entry_id: id(4),
  workspace_id: id(5),
  client_record_id: id(6),
  purchase_id: id(3),
  kind: 'payment',
  amount_minor: input.amountMinor,
  currency: 'KZT',
  paid_on: input.paidOn,
  method: input.method,
  source: 'manual',
  reason: null,
  reverses_entry_id: null,
  paid_minor: input.amountMinor,
  due_minor: '0',
  replayed: false,
};
const session = jest.fn();
const rpc = jest.fn();
const header = jest.fn();
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: session,
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    rpc,
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
  session.mockResolvedValue({
    data: {
      session: {
        user: { id: input.expectedUserId },
        access_token: financialToken(input.expectedUserId),
      },
    },
    error: null,
  });
  rpc.mockReturnValue({ setHeader: header });
  header.mockResolvedValue({ data: receipt, error: null });
});
test('record binds bearer and preserves exact minor money through request and receipt', async () => {
  const result = await recordClientPayment(input);
  expect(result.amountMinor).toBe(input.amountMinor);
  expect(result.paidMinor).toBe(input.amountMinor);
  expect(rpc).toHaveBeenCalledWith('record_client_payment', {
    p_purchase_id: input.purchaseId,
    p_amount_minor: input.amountMinor,
    p_paid_on: input.paidOn,
    p_method: 'Kaspi',
    p_request_id: input.requestId,
    p_reason: null,
  });
  expect(header).toHaveBeenCalledWith(
    'Authorization',
    `Bearer ${financialToken(input.expectedUserId)}`,
  );
});
test('reversal verifies original target, negative sign and restored debt', async () => {
  header.mockResolvedValue({
    data: {
      ...receipt,
      payment_entry_id: id(7),
      kind: 'reversal',
      amount_minor: `-${input.amountMinor}`,
      reason: 'Исправление',
      reverses_entry_id: id(4),
      paid_minor: '0',
      due_minor: input.amountMinor,
      replayed: true,
    },
    error: null,
  });
  const result = await reverseClientPayment({
    expectedUserId: id(1),
    requestId: id(2),
    paymentEntryId: id(4),
    reason: '  Исправление  ',
  });
  expect(result.replayed).toBe(true);
  expect(result.kind).toBe('reversal');
  expect(rpc).toHaveBeenCalledWith('reverse_client_payment', {
    p_payment_entry_id: id(4),
    p_request_id: id(2),
    p_reason: 'Исправление',
  });
});
test.each([
  { amountMinor: '0' },
  { amountMinor: '-1' },
  { amountMinor: '1.0' },
  { amountMinor: '9223372036854775808' },
  { paidOn: '2026-02-30' },
  { paidOn: '0000-01-01' },
  { purchaseId: 'wrong' },
  { requestId: 'wrong' },
  { reason: '' },
  { reason: 'x'.repeat(1001) },
])('rejects invalid input %s before network', (bad) => {
  expect(() => recordClientPayment({ ...input, ...bad })).toThrow(
    expect.objectContaining({ code: 'invalidInput' }),
  );
  expect(session).not.toHaveBeenCalled();
});
test.each([
  { purchase_id: id(9) },
  { amount_minor: 9007199254740993 },
  { amount_minor: '1' },
  { paid_minor: 1 },
  { paid_minor: '0' },
  { due_minor: '-1' },
  { kind: 'reversal' },
  { source: 'automatic' },
  { currency: 'USD' },
  { paid_on: '2026-10-04' },
  { reason: 'altered' },
  { method: 'Наличные' },
  { reverses_entry_id: id(9) },
])('rejects malformed or mismatched receipt %s', async (bad) => {
  header.mockResolvedValue({ data: { ...receipt, ...bad }, error: null });
  await expect(recordClientPayment(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test.each([
  { kind: 'payment' },
  { amount_minor: input.amountMinor },
  { reverses_entry_id: id(8) },
  { payment_entry_id: id(4) },
  { due_minor: '0' },
])('rejects invalid reversal receipt %s', async (bad) => {
  header.mockResolvedValue({
    data: {
      ...receipt,
      payment_entry_id: id(7),
      kind: 'reversal',
      amount_minor: `-${input.amountMinor}`,
      reason: 'Исправление',
      reverses_entry_id: id(4),
      paid_minor: '0',
      due_minor: input.amountMinor,
      ...bad,
    },
    error: null,
  });
  await expect(
    reverseClientPayment({
      expectedUserId: id(1),
      requestId: id(2),
      paymentEntryId: id(4),
      reason: 'Исправление',
    }),
  ).rejects.toMatchObject({ code: 'request' });
});
test.each([
  ['P0003', 'overpayment'],
  ['40001', 'conflict'],
  ['55000', 'invalidState'],
  ['22023', 'invalidInput'],
  ['42501', 'unavailable'],
  ['P0002', 'unavailable'],
  ['XX000', 'request'],
])('maps SQL %s to %s', async (code, expected) => {
  header.mockResolvedValue({ data: null, error: { code } });
  await expect(recordClientPayment(input)).rejects.toMatchObject({
    code: expected,
  });
});
test('wrong account prevents RPC and network failures retain safe error', async () => {
  session.mockResolvedValue({
    data: { session: { user: { id: id(9) }, access_token: 'wrong' } },
    error: null,
  });
  await expect(recordClientPayment(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(rpc).not.toHaveBeenCalled();
  session.mockRejectedValue(new Error('private network details'));
  await expect(recordClientPayment(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('missing configuration fails safely', async () => {
  jest.mocked(getSupabaseClient).mockReturnValue(null);
  await expect(recordClientPayment(input)).rejects.toMatchObject({
    code: 'configuration',
  });
});
