import { TrainerBillingError, type TrainerBilling } from './types';

export function validateBillingRelations(snapshot: TrainerBilling) {
  const fail = (): never => {
    throw new TrainerBillingError('request');
  };
  const purchases = new Map(
    snapshot.purchases.map((row) => [row.id.toLowerCase(), row]),
  );
  const attendance = new Map(
    snapshot.attendance.map((row) => [row.id.toLowerCase(), row]),
  );
  const credits = new Map(
    snapshot.credits.map((row) => [row.id.toLowerCase(), row]),
  );
  const restored = new Set<string>();
  const bookings = new Set<string>();
  for (const row of snapshot.attendance) {
    const key = row.bookingId.toLowerCase();
    if (bookings.has(key)) fail();
    bookings.add(key);
  }
  const revisions = new Set<string>();
  for (const row of snapshot.revisions) {
    const parent = attendance.get(row.attendanceId.toLowerCase());
    const key = `${row.attendanceId.toLowerCase()}:${row.revision}`;
    if (revisions.has(key)) fail();
    revisions.add(key);
    if (
      !parent ||
      parent.clientRecordId.toLowerCase() !==
        row.clientRecordId.toLowerCase() ||
      row.revision > parent.revision ||
      row.cycle > parent.cycle ||
      (row.revision === parent.revision &&
        (row.cycle !== parent.cycle ||
          row.status !== parent.status ||
          row.serviceDate !== parent.serviceDate))
    )
      fail();
  }
  for (const row of snapshot.credits) {
    const purchase = purchases.get(row.purchaseId.toLowerCase());
    if (
      !purchase ||
      purchase.clientRecordId.toLowerCase() !== row.clientRecordId.toLowerCase()
    )
      fail();
    if (row.attendanceId) {
      const parent = attendance.get(row.attendanceId.toLowerCase());
      if (
        !parent ||
        parent.clientRecordId.toLowerCase() !==
          row.clientRecordId.toLowerCase() ||
        parent.bookingId.toLowerCase() !== row.bookingId?.toLowerCase() ||
        row.cycle === null ||
        row.cycle > parent.cycle
      )
        fail();
    } else if (
      row.kind !== 'grant' &&
      (row.kind !== 'charge_late_cancel' || row.cycle !== null)
    )
      fail();
    if (row.reversesEntryId) {
      const key = row.reversesEntryId.toLowerCase();
      const original = credits.get(key);
      if (
        !original ||
        (original.kind !== 'consume' &&
          original.kind !== 'charge_late_cancel') ||
        restored.has(key) ||
        original.purchaseId.toLowerCase() !== row.purchaseId.toLowerCase() ||
        original.clientRecordId.toLowerCase() !==
          row.clientRecordId.toLowerCase() ||
        original.attendanceId?.toLowerCase() !==
          row.attendanceId?.toLowerCase() ||
        original.bookingId?.toLowerCase() !== row.bookingId?.toLowerCase() ||
        original.cycle !== row.cycle
      )
        fail();
      restored.add(key);
    }
  }
  const grants = new Map<string, number>();
  const totals = new Map<string, number>();
  const debits = new Set<string>();
  for (const credit of snapshot.credits) {
    const key = credit.purchaseId.toLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + credit.units);
    if (credit.kind === 'grant') {
      if (grants.has(key) || purchases.get(key)?.units !== credit.units) fail();
      grants.set(key, credit.units);
    }
    if (credit.kind === 'consume' || credit.kind === 'charge_late_cancel') {
      const key = `${credit.clientRecordId.toLowerCase()}:${credit.bookingId?.toLowerCase()}:${credit.attendanceId?.toLowerCase()}:${credit.cycle}`;
      if (debits.has(key)) fail();
      debits.add(key);
    }
  }
  for (const purchase of snapshot.purchases) {
    const key = purchase.id.toLowerCase();
    const total = totals.get(key);
    if (
      !grants.has(key) ||
      total === undefined ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      total > purchase.units
    )
      fail();
  }
}
