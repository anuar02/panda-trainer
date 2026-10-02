import type {
  BillingAttendance,
  BillingCredit,
  BillingPurchase,
  TrainerBilling,
} from '../features/trainer-billing/types';

export type BillingProjectionScope = {
  workspaceId: string;
  clientRecordId: string;
};
export type PurchaseBalance = {
  purchase: BillingPurchase;
  remainingUnits: number;
  valid: boolean;
};
const sameId = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();
const inScope = (row: BillingProjectionScope, scope: BillingProjectionScope) =>
  sameId(row.workspaceId, scope.workspaceId) &&
  sameId(row.clientRecordId, scope.clientRecordId);
const positive = (value: number | null) =>
  value !== null && Number.isSafeInteger(value) && value > 0;
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const debit = (entry: BillingCredit) =>
  entry.kind === 'consume' || entry.kind === 'charge_late_cancel';

function validLedger(data: TrainerBilling, purchase: BillingPurchase) {
  const entries = data.credits.filter((entry) =>
    sameId(entry.purchaseId, purchase.id),
  );
  const grants = entries.filter((entry) => entry.kind === 'grant');
  if (
    !positive(purchase.units) ||
    (purchase.expiresOn !== null && !validDate(purchase.expiresOn)) ||
    !Number.isFinite(Date.parse(purchase.createdAt)) ||
    data.purchases.filter((row) => sameId(row.id, purchase.id)).length !== 1 ||
    grants.length !== 1 ||
    grants[0]?.units !== purchase.units
  )
    return false;
  const ids = new Set<string>();
  const cycles = new Set<string>();
  const reversals = new Set<string>();
  for (const entry of entries) {
    const id = entry.id.toLowerCase();
    if (
      !inScope(entry, purchase) ||
      ids.has(id) ||
      data.credits.filter((row) => sameId(row.id, entry.id)).length !== 1
    )
      return false;
    ids.add(id);
    if (entry.kind === 'grant') {
      if (
        entry.attendanceId !== null ||
        entry.bookingId !== null ||
        entry.cycle !== null ||
        entry.reversesEntryId !== null
      )
        return false;
      continue;
    }
    if (!entry.bookingId) return false;
    if (entry.attendanceId !== null) {
      const matches = data.attendance.filter((row) =>
        sameId(row.id, entry.attendanceId!),
      );
      const attendance = matches[0];
      if (
        matches.length !== 1 ||
        !attendance ||
        !inScope(attendance, purchase) ||
        !sameId(attendance.bookingId, entry.bookingId) ||
        !positive(entry.cycle) ||
        entry.cycle! > attendance.cycle
      )
        return false;
    } else if (entry.kind !== 'charge_late_cancel' || entry.cycle !== null)
      return false;
    if (debit(entry)) {
      if (
        entry.units !== -1 ||
        entry.reversesEntryId !== null ||
        (entry.kind === 'charge_late_cancel' && !entry.reason?.trim())
      )
        return false;
      if (
        data.credits.filter(
          (row) =>
            debit(row) &&
            inScope(row, purchase) &&
            row.attendanceId === entry.attendanceId &&
            row.bookingId === entry.bookingId &&
            row.cycle === entry.cycle,
        ).length !== 1
      )
        return false;
      const cycle = `${entry.attendanceId ?? entry.bookingId}:${entry.cycle}`;
      if (cycles.has(cycle)) return false;
      cycles.add(cycle);
    } else if (entry.kind === 'restore') {
      const target = entries.find((row) =>
        entry.reversesEntryId ? sameId(row.id, entry.reversesEntryId) : false,
      );
      if (
        entry.units !== 1 ||
        !target ||
        !debit(target) ||
        target.attendanceId === null ||
        target.attendanceId !== entry.attendanceId ||
        target.bookingId !== entry.bookingId ||
        target.cycle !== entry.cycle ||
        reversals.has(target.id.toLowerCase())
      )
        return false;
      reversals.add(target.id.toLowerCase());
    } else return false;
  }
  const total = entries.reduce((sum, entry) => sum + entry.units, 0);
  return Number.isSafeInteger(total) && total >= 0 && total <= purchase.units;
}

export function projectPurchaseBalances(
  data: TrainerBilling,
  scope: BillingProjectionScope,
): PurchaseBalance[] {
  return data.purchases
    .filter((row) => inScope(row, scope))
    .map((purchase) => {
      const valid = validLedger(data, purchase);
      return {
        purchase,
        valid,
        remainingUnits: valid
          ? data.credits
              .filter((entry) => sameId(entry.purchaseId, purchase.id))
              .reduce((sum, entry) => sum + entry.units, 0)
          : 0,
      };
    });
}

export function eligiblePurchases(
  data: TrainerBilling,
  scope: BillingProjectionScope,
  serviceDate: string,
): PurchaseBalance[] {
  if (!validDate(serviceDate)) throw new RangeError('Invalid service date');
  return projectPurchaseBalances(data, scope)
    .filter(
      ({ purchase, valid, remainingUnits }) =>
        valid &&
        remainingUnits > 0 &&
        (purchase.expiresOn === null || purchase.expiresOn >= serviceDate),
    )
    .sort((left, right) => {
      const a = left.purchase;
      const b = right.purchase;
      if (a.expiresOn !== b.expiresOn) {
        if (a.expiresOn === null) return 1;
        if (b.expiresOn === null) return -1;
        return a.expiresOn < b.expiresOn ? -1 : 1;
      }
      return (
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.toLowerCase().localeCompare(b.id.toLowerCase())
      );
    });
}

export function bookingAttendance(
  data: TrainerBilling,
  scope: BillingProjectionScope,
  bookingId: string,
): BillingAttendance | null {
  const rows = data.attendance.filter(
    (row) => inScope(row, scope) && sameId(row.bookingId, bookingId),
  );
  return rows.length === 1 ? rows[0]! : null;
}

export function projectBookingAttendance(
  data: TrainerBilling,
  scope: BillingProjectionScope,
  bookingId: string,
) {
  const attendance = bookingAttendance(data, scope, bookingId);
  const entries = data.credits.filter(
    (entry) =>
      inScope(entry, scope) &&
      entry.bookingId !== null &&
      sameId(entry.bookingId, bookingId) &&
      (entry.attendanceId === null ||
        (attendance !== null &&
          sameId(entry.attendanceId, attendance.id) &&
          entry.cycle === attendance.cycle)),
  );
  const balances = projectPurchaseBalances(data, scope);
  const bookingEntries = data.credits.filter(
    (entry) => entry.bookingId !== null && sameId(entry.bookingId, bookingId),
  );
  const historyValid = bookingEntries.every(
    (entry) =>
      inScope(entry, scope) &&
      (entry.attendanceId === null ||
        (attendance !== null && sameId(entry.attendanceId, attendance.id))) &&
      (!debit(entry) ||
        entry.cycle === null ||
        entry.cycle === attendance?.cycle ||
        bookingEntries.some(
          (row) =>
            row.kind === 'restore' &&
            row.reversesEntryId !== null &&
            sameId(row.reversesEntryId, entry.id),
        )),
  );
  const valid =
    historyValid &&
    data.attendance.filter(
      (row) => inScope(row, scope) && sameId(row.bookingId, bookingId),
    ).length <= 1 &&
    entries.every((entry) =>
      balances.some(
        (row) => row.valid && sameId(row.purchase.id, entry.purchaseId),
      ),
    );
  const charges = entries.filter(debit);
  const active = charges.filter(
    (entry) =>
      !entries.some(
        (restore) =>
          restore.kind === 'restore' &&
          restore.reversesEntryId !== null &&
          sameId(restore.reversesEntryId, entry.id),
      ),
  );
  const chargeEntry = valid && active.length === 1 ? active[0]! : null;
  return {
    attendance,
    valid: valid && active.length <= 1,
    chargeEntry,
    charged: chargeEntry !== null,
    penalty: chargeEntry?.kind === 'charge_late_cancel',
    restored: valid && charges.length > 0 && active.length === 0,
    presentUnbound:
      valid && attendance?.status === 'present' && charges.length === 0,
  };
}
