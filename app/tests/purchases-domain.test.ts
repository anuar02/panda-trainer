import {
  formatPurchaseExpiry,
  formatPurchaseMoney,
  projectClientPurchases,
} from '../src/domain/purchases';
import type {
  BillingCredit,
  TrainerBilling,
} from '../src/features/trainer-billing/types';

const scope = {
  workspaceId: 'aaaaaaaa-0000-0000-0000-000000000001',
  clientRecordId: 'bbbbbbbb-0000-0000-0000-000000000001',
};
const grant = (purchaseId = 'purchase'): BillingCredit => ({
  ...scope,
  id: `grant-${purchaseId}`,
  purchaseId,
  attendanceId: null,
  bookingId: null,
  cycle: null,
  kind: 'grant',
  units: 2,
  reason: null,
  reversesEntryId: null,
  createdAt: '2026-10-01T00:00:00Z',
});
const fixture = (): TrainerBilling => ({
  purchases: [
    {
      ...scope,
      id: 'purchase',
      title: 'Пакет',
      units: 2,
      priceMinor: '10000',
      currency: 'KZT',
      expiresOn: '2026-09-30',
      createdAt: '2026-10-01T00:00:00Z',
    },
  ],
  credits: [grant()],
  attendance: [],
  revisions: [],
});

it('keeps multiple expired and exhausted packages without eligibility filtering', () => {
  const data = fixture();
  data.purchases.push({ ...data.purchases[0]!, id: 'second', expiresOn: null });
  data.credits.push(grant('second'));
  for (const bookingId of ['first', 'second'])
    data.credits.push({
      ...grant(),
      id: `penalty-${bookingId}`,
      kind: 'charge_late_cancel',
      units: -1,
      bookingId,
      reason: 'Поздняя отмена',
    });
  expect(projectClientPurchases(data, scope)).toMatchObject({
    valid: true,
    purchases: [
      { remainingUnits: 0, usedUnits: 2 },
      { remainingUnits: 2, usedUnits: 0 },
    ],
  });
});

it('projects an actual consumed credit and correction restore as net usage', () => {
  const data = fixture();
  data.attendance.push({
    ...scope,
    id: 'attendance',
    bookingId: 'booking',
    status: 'undone',
    revision: 2,
    cycle: 1,
    serviceDate: '2026-09-30',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
  });
  const consume: BillingCredit = {
    ...grant(),
    id: 'consume',
    kind: 'consume',
    units: -1,
    attendanceId: 'attendance',
    bookingId: 'booking',
    cycle: 1,
  };
  data.credits.push(consume);
  expect(projectClientPurchases(data, scope).purchases[0]).toMatchObject({
    remainingUnits: 1,
    usedUnits: 1,
  });
  data.credits.push({
    ...consume,
    id: 'restore',
    kind: 'restore',
    units: 1,
    reversesEntryId: 'consume',
  });
  expect(projectClientPurchases(data, scope).purchases[0]).toMatchObject({
    remainingUnits: 2,
    usedUnits: 0,
  });
});

it('selects exact case-insensitive scope and excludes unrelated purchases', () => {
  const data = fixture();
  data.purchases.push({
    ...data.purchases[0]!,
    id: 'other',
    clientRecordId: 'cccccccc-0000-0000-0000-000000000001',
  });
  const result = projectClientPurchases(data, {
    workspaceId: scope.workspaceId.toUpperCase(),
    clientRecordId: scope.clientRecordId.toUpperCase(),
  });
  expect(result.valid).toBe(true);
  expect(result.purchases.map((entry) => entry.purchase.id)).toEqual([
    'purchase',
  ]);
  expect(
    projectClientPurchases(data, { ...scope, workspaceId: 'workspace' }).valid,
  ).toBe(false);
});

it('invalidates the whole projection for missing, foreign or orphan credit history', () => {
  const cases: BillingCredit[][] = [
    [],
    [grant(), grant()],
    [{ ...grant(), workspaceId: 'cccccccc-0000-0000-0000-000000000001' }],
    [grant(), grant('missing')],
  ];
  for (const credits of cases)
    expect(projectClientPurchases({ ...fixture(), credits }, scope)).toEqual({
      valid: false,
      purchases: [],
    });
});

it('formats maximum bigint and fractional money without losing digits', () => {
  expect(formatPurchaseMoney('9223372036854775807').replace(/\s/g, ' ')).toBe(
    '92 233 720 368 547 758,07 ₸',
  );
  expect(formatPurchaseMoney('0')).toBe('0 ₸');
  expect(formatPurchaseMoney('101')).toBe('1,01 ₸');
  expect(formatPurchaseMoney('110')).toBe('1,10 ₸');
  expect(formatPurchaseMoney('100')).toBe('1 ₸');
  expect(formatPurchaseMoney('101', 'en-US')).toBe('1.01 ₸');
  for (const value of ['-1', '01', '1.5', '9223372036854775808'])
    expect(() => formatPurchaseMoney(value)).toThrow(RangeError);
});

it('formats the ISO expiry day in UTC with prototype Russian short month', () => {
  expect(formatPurchaseExpiry('2026-10-03')).toBe('3 окт');
  expect(formatPurchaseExpiry('2026-01-01', 'en-US')).toBe('Jan 1');
  expect(() => formatPurchaseExpiry('2026-02-30')).toThrow(RangeError);
  const data = fixture();
  data.purchases[0]!.expiresOn = '2026-02-30';
  expect(projectClientPurchases(data, scope)).toEqual({
    valid: false,
    purchases: [],
  });
});
