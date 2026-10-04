import {
  projectFinancialSummary,
  formatFinancialTotal,
} from '../src/features/trainer-billing/financial-summary';
import type { TrainerBilling } from '../src/features/trainer-billing/types';
const id = (n: number) =>
  `51000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { workspaceId: id(1), clientRecordId: id(2) };
function billing(): TrainerBilling {
  const purchases = [null, '2026-10-04', '2026-10-03'].map((expiresOn, i) => ({
    id: id(i + 10),
    ...scope,
    title: 'Пакет',
    units: 8,
    priceMinor: '9223372036854775807',
    currency: 'KZT' as const,
    expiresOn,
    createdAt: '2026-10-01T12:00:00Z',
  }));
  return {
    purchases,
    attendance: [],
    revisions: [],
    credits: purchases.map((purchase, i) => ({
      id: id(i + 20),
      ...scope,
      purchaseId: purchase.id,
      attendanceId: null,
      bookingId: null,
      cycle: null,
      kind: 'grant',
      units: 8,
      reason: null,
      reversesEntryId: null,
      createdAt: purchase.createdAt,
    })),
  };
}
test('inclusive expiry sessions and debt from every purchase preserve sums beyond bigint', () => {
  const result = projectFinancialSummary(
    billing(),
    { entries: [] },
    scope,
    '2026-10-04',
  );
  expect(result).toEqual({
    remainingUnits: 16,
    dueMinor: '27670116110564327421',
  });
  expect(formatFinancialTotal(result!.dueMinor, 'ru-RU')).toBe(
    '276 701 161 105 643 274,21 ₸',
  );
});
test('invalid credit projection and invalid calendar date fail closed', () => {
  const snapshot = billing();
  snapshot.credits.pop();
  expect(
    projectFinancialSummary(snapshot, { entries: [] }, scope, '2026-10-04'),
  ).toBeNull();
  expect(
    projectFinancialSummary(billing(), { entries: [] }, scope, '2026-02-30'),
  ).toBeNull();
});
