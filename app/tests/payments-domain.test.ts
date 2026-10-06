import { projectPurchasePayments } from '../src/domain/payments';
import type { BillingPurchase } from '../src/features/trainer-billing/types';
import type { PaymentEntry } from '../src/features/trainer-payments/types';
const id = (n: number) =>
  `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { workspaceId: id(1), clientRecordId: id(2) };
const purchase: BillingPurchase = {
  id: id(3),
  ...scope,
  title: 'Пакет',
  units: 10,
  priceMinor: '10000',
  currency: 'KZT',
  expiresOn: null,
  createdAt: '2026-10-03T00:00:00Z',
};
const payment: PaymentEntry = {
  id: id(4),
  ...scope,
  purchaseId: purchase.id,
  kind: 'payment',
  amountMinor: '3000',
  currency: 'KZT',
  paidOn: '2026-10-03',
  method: 'Kaspi',
  source: 'manual',
  reason: null,
  reversesEntryId: null,
  createdAt: '2026-10-03T00:00:00Z',
};
const reversal: PaymentEntry = {
  ...payment,
  id: id(5),
  kind: 'reversal',
  amountMinor: '-3000',
  reason: 'Исправление',
  reversesEntryId: payment.id,
};
const project = (entries: PaymentEntry[], purchases = [purchase]) =>
  projectPurchasePayments(purchases, { entries }, scope);
test('projects debt from live payments and includes unpaid purchases', () => {
  expect(project([payment]).purchases[0]).toMatchObject({
    paidMinor: '3000',
    dueMinor: '7000',
    payments: [payment],
  });
  expect(project([]).purchases[0]!.dueMinor).toBe('10000');
});
test('full reversal removes original from paid and history', () => {
  expect(project([reversal, payment]).purchases[0]).toMatchObject({
    paidMinor: '0',
    dueMinor: '10000',
    payments: [],
    reversals: [reversal],
  });
});
test('keeps bigint precision', () => {
  expect(
    project(
      [{ ...payment, amountMinor: '9223372036854775807' }],
      [{ ...purchase, priceMinor: '9223372036854775807' }],
    ).purchases[0],
  ).toMatchObject({ paidMinor: '9223372036854775807', dueMinor: '0' });
});
test.each(
  (
    [
      [reversal],
      [payment, { ...reversal, amountMinor: '-2999' }],
      [payment, { ...reversal, method: 'Наличные' }],
      [payment, { ...reversal, paidOn: '2026-10-04' }],
      [payment, reversal, { ...reversal, id: id(6) }],
      [payment, { ...payment, id: id(7), amountMinor: '8000' }],
      [payment, payment],
      [{ ...payment, purchaseId: id(8) }],
      [{ ...payment, amountMinor: '03000' }],
      [{ ...payment, paidOn: '2026-02-30' }],
      [{ ...reversal, reason: null }],
    ] as PaymentEntry[][]
  ).map((entries) => [entries]),
)('fails closed for inconsistent ledger %j', (entries) => {
  expect(project(entries)).toEqual({ valid: false, purchases: [] });
});
test('filters peer clients and workspaces', () => {
  expect(
    project([
      { ...payment, workspaceId: id(9) },
      { ...payment, clientRecordId: id(10) },
    ]).purchases[0]!.paidMinor,
  ).toBe('0');
});
test('rejects duplicate purchases and malformed scope', () => {
  expect(project([], [purchase, purchase]).valid).toBe(false);
  expect(
    projectPurchasePayments(
      [purchase],
      { entries: [] },
      { ...scope, workspaceId: 'bad' },
    ).valid,
  ).toBe(false);
});

test('history retains one original row with reversal creation date and exact debt', () => {
  const amountMinor = '9007199254740993';
  const original = { ...payment, amountMinor };
  const reversed = {
    ...reversal,
    amountMinor: `-${amountMinor}`,
    createdAt: '2026-10-05T09:30:00Z',
  };
  const result = project(
    [original, reversed],
    [{ ...purchase, priceMinor: amountMinor }],
  );
  expect(result.valid).toBe(true);
  expect(result.purchases[0]).toMatchObject({
    paidMinor: '0',
    dueMinor: amountMinor,
    payments: [],
    history: [{ ...original, reversedAt: reversed.createdAt }],
  });
  expect(result.purchases[0]?.history).toHaveLength(1);
  expect(project([payment]).purchases[0]?.history).toEqual([
    { ...payment, reversedAt: null },
  ]);
});
test.each(['workspaceId', 'clientRecordId', 'purchaseId'] as const)(
  'foreign reversal %s never cancels the original',
  (field) => {
    const result = project([payment, { ...reversal, [field]: id(99) }]);
    if (field === 'purchaseId') expect(result.valid).toBe(false);
    else
      expect(result.purchases[0]).toMatchObject({
        paidMinor: payment.amountMinor,
        history: [{ ...payment, reversedAt: null }],
      });
  },
);
