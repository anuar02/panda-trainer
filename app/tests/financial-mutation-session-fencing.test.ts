import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import * as billing from '../src/features/trainer-billing/service';
import * as payments from '../src/features/trainer-payments/service';
import * as paymentFacade from '../src/features/trainer-payments/commands';
import { captureFinancialMutationFence } from '../src/features/trainer-billing/mutation-auth';
import { financialToken } from './financial-read-fixtures';
import {
  mutationAuth,
  mutationDeferred,
  financialId as id,
} from './financial-mutation-fixtures';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
const actor = { expectedUserId: id(1), requestId: id(2) };
const booking = { ...actor, bookingId: id(3), expectedBookingRevision: 1 };
const attendance = {
  ...actor,
  attendanceId: id(4),
  expectedBookingRevision: 1,
  expectedAttendanceRevision: 1,
};
const purchase = {
  ...actor,
  clientRecordId: id(5),
  title: 'Пакет',
  units: 2,
  priceMinor: '9007199254740993',
};
const payment = {
  ...actor,
  purchaseId: id(6),
  amountMinor: '9007199254740993',
  paidOn: '2026-10-03',
  method: 'Kaspi' as const,
};
const reversal = { ...actor, paymentEntryId: id(7), reason: 'Ошибка' };
const runs = [
  ['createPurchase', () => billing.createClientPurchase(purchase)],
  [
    'markAttended',
    () => billing.markAttended({ ...booking, charge: true, purchaseId: id(6) }),
  ],
  ['markNoShow', () => billing.markNoShow(booking)],
  [
    'bindPurchase',
    () => billing.bindAttendancePurchase({ ...attendance, purchaseId: id(6) }),
  ],
  [
    'undoAttendance',
    () => billing.undoAttendance({ ...attendance, reason: 'Ошибка' }),
  ],
  [
    'lateCancellation',
    () =>
      billing.chargeLateCancellation({
        ...booking,
        reason: 'Поздняя отмена',
        purchaseId: id(6),
      }),
  ],
  ['payment', () => payments.recordClientPayment(payment)],
  ['reversal', () => payments.reverseClientPayment(reversal)],
  ['public payment facade', () => paymentFacade.recordClientPayment(payment)],
] as const;
let auth: ReturnType<typeof mutationAuth>;
const rpc = jest.fn();
const header = jest.fn();
const unsubscribeCount = () => auth.unsubscribe.mock.calls.length;
beforeEach(() => {
  jest.resetAllMocks();
  auth = mutationAuth(id(1));
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ auth: auth.auth, rpc } as unknown as NonNullable<
      ReturnType<typeof getSupabaseClient>
    >);
  rpc.mockReturnValue({ setHeader: header });
  header.mockResolvedValue({ data: null, error: { code: '40001' } });
});
test.each(runs)(
  '%s rejects relogin while initial auth is unresolved before dispatch',
  async (_name, run) => {
    const initial =
      mutationDeferred<Awaited<ReturnType<typeof auth.getSession>>>();
    auth.getSession.mockReturnValueOnce(initial.promise);
    const result = run();
    auth.emit('SIGNED_IN', auth.session(id(1), id(10)));
    initial.resolve({ data: { session: auth.session() }, error: null });
    await expect(result).rejects.toMatchObject({ code: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
    expect(unsubscribeCount()).toBe(1);
  },
);
test.each(runs)(
  '%s suppresses old-session terminal RPC error after same-user relogin',
  async (_name, run) => {
    header.mockImplementationOnce(async () => {
      auth.emit('SIGNED_IN', auth.session(id(1), id(10)));
      return {
        data: null,
        error: { code: '40001', message: 'private server details' },
      };
    });
    await expect(run()).rejects.toMatchObject({ code: 'unavailable' });
    expect(unsubscribeCount()).toBe(1);
  },
);
test.each(runs)(
  '%s suppresses thrown transport error after logout',
  async (_name, run) => {
    header.mockImplementationOnce(async () => {
      auth.emit('SIGNED_OUT', null);
      throw new Error('private transport token');
    });
    await expect(run()).rejects.toMatchObject({ code: 'unavailable' });
  },
);
test.each(runs)(
  '%s fails closed on changed session without an auth event',
  async (_name, run) => {
    const original = await auth.getSession();
    auth.getSession.mockResolvedValueOnce(original).mockResolvedValue({
      data: { session: auth.session(id(1), id(10)) },
      error: null,
    });
    await expect(run()).rejects.toMatchObject({ code: 'unavailable' });
  },
);
test.each([
  ['changed session', (): Session => auth.session(id(1), id(10))],
  ['changed actor', (): Session => auth.session(id(9))],
  [
    'JWT subject mismatch',
    (): Session => ({ ...auth.session(), access_token: financialToken(id(9)) }),
  ],
  [
    'missing session claim',
    (): Session => ({
      ...auth.session(),
      access_token: `synthetic.${btoa(JSON.stringify({ sub: id(1) })).replace(/=/g, '')}.fixture`,
    }),
  ],
  [
    'malformed JWT',
    (): Session => ({
      ...auth.session(),
      access_token: 'private-malformed-token',
    }),
  ],
  ['null session', (): null => null],
] as const)('TOKEN_REFRESHED %s is not trusted', async (_name, next) => {
  header.mockImplementationOnce(async () => {
    auth.emit('TOKEN_REFRESHED', next() as Session | null);
    return { data: null, error: { code: '40001' } };
  });
  await expect(payments.recordClientPayment(payment)).rejects.toMatchObject({
    code: 'unavailable',
  });
});
const purchaseReceipt = {
  purchase_id: id(6),
  workspace_id: id(8),
  client_record_id: id(5),
  replayed: true,
};
const paymentReceipt = {
  payment_entry_id: id(7),
  workspace_id: id(8),
  client_record_id: id(5),
  purchase_id: id(6),
  kind: 'payment',
  amount_minor: payment.amountMinor,
  currency: 'KZT',
  paid_on: payment.paidOn,
  method: payment.method,
  source: 'manual',
  reason: null,
  reverses_entry_id: null,
  paid_minor: payment.amountMinor,
  due_minor: '0',
  replayed: true,
};
test('normal refresh with identical actor/session permits exact payment receipt', async () => {
  header.mockImplementationOnce(async () => {
    auth.emit('TOKEN_REFRESHED', auth.session(id(1), undefined, 2));
    return { data: paymentReceipt, error: null };
  });
  const result = await payments.recordClientPayment(payment);
  expect(result).toMatchObject({
    amountMinor: payment.amountMinor,
    paidMinor: payment.amountMinor,
    replayed: true,
  });
  expect(header).toHaveBeenCalledWith(
    'Authorization',
    `Bearer ${financialToken(id(1))}`,
  );
  expect(rpc.mock.calls[0]?.[1].p_amount_minor).toBe(payment.amountMinor);
});
test.each([
  ['purchase', () => billing.createClientPurchase(purchase), purchaseReceipt],
  ['payment', () => payments.recordClientPayment(payment), paymentReceipt],
  [
    'reversal',
    () => payments.reverseClientPayment(reversal),
    {
      ...paymentReceipt,
      payment_entry_id: id(11),
      kind: 'reversal',
      amount_minor: `-${payment.amountMinor}`,
      reason: reversal.reason,
      reverses_entry_id: id(7),
      paid_minor: '0',
      due_minor: payment.amountMinor,
    },
  ],
  [
    'attendance',
    () => billing.markAttended({ ...booking, charge: true, purchaseId: id(6) }),
    {
      attendance_id: id(4),
      booking_id: id(3),
      revision: 2,
      status: 'present',
      cycle: 1,
      service_date: '2026-10-03',
      purchase_id: id(6),
      charged: true,
      credit_entry_id: id(12),
      replayed: true,
    },
  ],
] as const)(
  '%s rejects valid old-session success after relogin',
  async (_name, run, data) => {
    header.mockImplementationOnce(async () => {
      auth.emit('SIGNED_IN', auth.session(id(1), id(10)));
      return { data, error: null };
    });
    await expect(run()).rejects.toMatchObject({ code: 'unavailable' });
  },
);
test('supplied fence cannot be borrowed by another actor or workspace receipt', async () => {
  const fence = captureFinancialMutationFence(id(1), id(8));
  await expect(
    billing.createClientPurchase({ ...purchase, expectedUserId: id(9) }, fence),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
  header.mockResolvedValue({
    data: { ...purchaseReceipt, workspace_id: id(9) },
    error: null,
  });
  await expect(
    billing.createClientPurchase(purchase, fence),
  ).rejects.toMatchObject({ code: 'request' });
  fence.dispose();
});
test('malformed initial credentials fail closed and errors never retain tokens', async () => {
  auth.emit('TOKEN_REFRESHED', {
    ...auth.session(),
    access_token: 'private-token',
  });
  let failure: unknown;
  try {
    await payments.recordClientPayment(payment);
  } catch (error: unknown) {
    failure = error;
  }
  expect(failure).toMatchObject({ code: 'unavailable' });
  expect(JSON.stringify(failure)).not.toContain('private-token');
  expect(String(failure)).not.toContain('private-token');
  expect(rpc).not.toHaveBeenCalled();
});
test('caller mutation during auth await cannot change actor or RPC payload', async () => {
  const initial =
    mutationDeferred<Awaited<ReturnType<typeof auth.getSession>>>();
  auth.getSession.mockReturnValueOnce(initial.promise);
  header.mockResolvedValue({ data: purchaseReceipt, error: null });
  const input = { ...purchase };
  const result = billing.createClientPurchase(input);
  input.expectedUserId = id(9);
  input.clientRecordId = id(9);
  input.priceMinor = '1';
  initial.resolve({ data: { session: auth.session() }, error: null });
  await expect(result).resolves.toMatchObject({ purchaseId: id(6) });
  expect(rpc.mock.calls[0]?.[1]).toMatchObject({
    p_client_record_id: id(5),
    p_price_minor: purchase.priceMinor,
  });
});

test.each([
  (token: string) => token.replace(/^[^.]+/, ''),
  (token: string) => token.replace(/[^.]+$/, ''),
  (token: string) => `${token}.extra`,
  (token: string) => token.replace(/^[^.]+/, 'invalid header'),
])(
  'malformed token structure never reaches financial dispatch',
  async (malform) => {
    auth.emit('TOKEN_REFRESHED', {
      ...auth.session(),
      access_token: malform(financialToken(id(1))),
    });
    await expect(payments.recordClientPayment(payment)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(rpc).not.toHaveBeenCalled();
  },
);

test('same-identity refresh during initial auth await is verified against returned claims', async () => {
  const initial =
    mutationDeferred<Awaited<ReturnType<typeof auth.getSession>>>();
  auth.getSession.mockReturnValueOnce(initial.promise);
  header.mockResolvedValue({ data: purchaseReceipt, error: null });
  const result = billing.createClientPurchase(purchase);
  auth.emit('TOKEN_REFRESHED', auth.session(id(1), undefined, 2));
  initial.resolve({ data: { session: auth.session() }, error: null });
  await expect(result).resolves.toMatchObject({ purchaseId: id(6) });
});
test('changed-identity refresh during initial auth await never dispatches with old claims', async () => {
  const initial =
    mutationDeferred<Awaited<ReturnType<typeof auth.getSession>>>();
  auth.getSession.mockReturnValueOnce(initial.promise);
  const result = billing.createClientPurchase(purchase);
  auth.emit('TOKEN_REFRESHED', auth.session(id(1), id(10)));
  initial.resolve({ data: { session: auth.session() }, error: null });
  await expect(result).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
});
