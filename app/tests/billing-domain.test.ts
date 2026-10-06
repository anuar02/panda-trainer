import {
  bookingAttendance,
  eligiblePurchases,
  projectBookingAttendance,
  projectPurchaseBalances,
} from '../src/domain/billing';
import type {
  BillingAttendance,
  BillingCredit,
  BillingPurchase,
  TrainerBilling,
} from '../src/features/trainer-billing/types';

const scope = { workspaceId: 'workspace', clientRecordId: 'client' };
const purchase = (
  id = 'purchase',
  expiresOn: string | null = null,
): BillingPurchase => ({
  ...scope,
  id,
  title: 'Package',
  units: 2,
  priceMinor: '10000',
  currency: 'KZT',
  expiresOn,
  createdAt: '2026-10-01T00:00:00Z',
});
const attendance = (
  cycle = 1,
  status: BillingAttendance['status'] = 'present',
): BillingAttendance => ({
  ...scope,
  id: 'attendance',
  bookingId: 'booking',
  revision: cycle,
  cycle,
  status,
  serviceDate: '2026-10-03',
  createdAt: '2026-10-03T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z',
});
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
const charge = (cycle = 1): BillingCredit => ({
  ...grant(),
  id: `consume-${cycle}`,
  attendanceId: 'attendance',
  bookingId: 'booking',
  cycle,
  kind: 'consume',
  units: -1,
});
const restore = (cycle = 1): BillingCredit => ({
  ...charge(cycle),
  id: `restore-${cycle}`,
  kind: 'restore',
  units: 1,
  reversesEntryId: `consume-${cycle}`,
});
const data = (): TrainerBilling => ({
  purchases: [purchase()],
  attendance: [],
  revisions: [],
  credits: [grant()],
});

it('requires a single matching immutable grant instead of trusting purchase units', () => {
  for (const credits of [
    [],
    [grant(), grant()],
    [{ ...grant(), units: 1 }],
    [{ ...grant(), clientRecordId: 'other' }],
  ]) {
    const value = { ...data(), credits };
    expect(projectPurchaseBalances(value, scope)[0]).toMatchObject({
      valid: false,
      remainingUnits: 0,
    });
    expect(eligiblePurchases(value, scope, '2026-10-03')).toEqual([]);
  }
});

it('uses inclusive service date expiry, earliest expiry, creation time and id with unlimited last', () => {
  const purchases = [
    purchase('z'),
    purchase('b', '2026-10-03'),
    purchase('a', '2026-10-03'),
    purchase('old', '2026-10-02'),
  ];
  const value = {
    ...data(),
    purchases,
    credits: purchases.map((row) => grant(row.id)),
  };
  expect(
    eligiblePurchases(value, scope, '2026-10-03').map((row) => row.purchase.id),
  ).toEqual(['a', 'b', 'z']);
  value.purchases[1]!.createdAt = '2026-09-30T00:00:00Z';
  expect(eligiblePurchases(value, scope, '2026-10-03')[0]?.purchase.id).toBe(
    'b',
  );
  expect(() => eligiblePurchases(value, scope, '2026-02-30')).toThrow(
    RangeError,
  );
  expect(
    eligiblePurchases(
      value,
      { ...scope, clientRecordId: 'other' },
      '2026-10-03',
    ),
  ).toEqual([]);
});

it('restores one unit once and isolates a later attendance cycle', () => {
  const value = {
    ...data(),
    attendance: [attendance()],
    credits: [grant(), charge()],
  };
  expect(projectPurchaseBalances(value, scope)[0]?.remainingUnits).toBe(1);
  expect(projectBookingAttendance(value, scope, 'booking')).toMatchObject({
    charged: true,
    restored: false,
    presentUnbound: false,
  });
  value.attendance = [attendance(1, 'undone')];
  value.credits.push(restore());
  expect(projectPurchaseBalances(value, scope)[0]?.remainingUnits).toBe(2);
  expect(projectBookingAttendance(value, scope, 'booking')).toMatchObject({
    charged: false,
    restored: true,
  });
  value.attendance = [attendance(2)];
  expect(projectBookingAttendance(value, scope, 'booking')).toMatchObject({
    restored: false,
    presentUnbound: true,
  });
  value.credits.push(charge(2));
  expect(projectPurchaseBalances(value, scope)[0]?.remainingUnits).toBe(1);
  expect(
    projectBookingAttendance(value, scope, 'booking').chargeEntry?.cycle,
  ).toBe(2);
  value.credits.push({ ...restore(), id: 'duplicate-restore' });
  expect(projectPurchaseBalances(value, scope)[0]).toMatchObject({
    valid: false,
    remainingUnits: 0,
  });
});

it('rejects orphan, mismatched and excessive ledger entries', () => {
  for (const entry of [
    charge(),
    restore(),
    { ...charge(), bookingId: 'other' },
    { ...charge(), units: -3 },
  ]) {
    const value = {
      ...data(),
      attendance: [attendance()],
      credits: [grant(), entry],
    };
    if (
      entry.kind === 'consume' &&
      entry.bookingId === 'booking' &&
      entry.units === -1
    )
      value.attendance = [];
    expect(projectPurchaseBalances(value, scope)[0]?.valid).toBe(false);
  }
});

it('projects cancellation penalties without inventing an attendance row', () => {
  const penalty: BillingCredit = {
    ...charge(),
    attendanceId: null,
    cycle: null,
    kind: 'charge_late_cancel',
    reason: 'Late cancellation',
  };
  const value = { ...data(), credits: [grant(), penalty] };
  expect(projectBookingAttendance(value, scope, 'booking')).toMatchObject({
    attendance: null,
    charged: true,
    penalty: true,
    valid: true,
  });
  expect(bookingAttendance(value, scope, 'booking')).toBeNull();
});

it('does not trust duplicate current attendance or foreign purchase links', () => {
  const value = {
    ...data(),
    attendance: [attendance(), attendance()],
    credits: [grant(), charge()],
  };
  expect(bookingAttendance(value, scope, 'booking')).toBeNull();
  expect(projectBookingAttendance(value, scope, 'booking').valid).toBe(false);
  value.attendance = [attendance()];
  value.credits[1]!.purchaseId = 'missing';
  expect(projectBookingAttendance(value, scope, 'booking')).toMatchObject({
    valid: false,
    charged: false,
    presentUnbound: false,
  });
});

it('rejects a foreign booking link and an unrestored earlier cycle', () => {
  const value = {
    ...data(),
    attendance: [attendance(2)],
    credits: [grant(), charge()],
  };
  expect(projectBookingAttendance(value, scope, 'booking').valid).toBe(false);
  value.credits = [grant(), { ...charge(2), clientRecordId: 'other' }];
  expect(projectBookingAttendance(value, scope, 'booking').valid).toBe(false);
});

it('excludes exhausted packages without exposing negative balances', () => {
  const second: BillingAttendance = {
    ...attendance(),
    id: 'attendance-2',
    bookingId: 'booking-2',
  };
  const value = {
    ...data(),
    attendance: [attendance(), second],
    credits: [
      grant(),
      charge(),
      {
        ...charge(),
        id: 'consume-second',
        attendanceId: second.id,
        bookingId: second.bookingId,
      },
    ],
  };
  expect(projectPurchaseBalances(value, scope)[0]).toMatchObject({
    valid: true,
    remainingUnits: 0,
  });
  expect(eligiblePurchases(value, scope, '2026-10-03')).toEqual([]);
});
