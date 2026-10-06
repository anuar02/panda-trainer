import {
  TrainerBillingError,
  type AttendanceStatus,
  type BillingAttendance,
  type BillingAttendanceResult,
  type BillingAttendanceRevision,
  type BillingCredit,
  type BillingPurchase,
  type BillingPurchaseResult,
  type BillingScope,
} from './types';

export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 2147483647;
export const date = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export const minorMoney = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(0|[1-9]\d*)$/.test(value) &&
  (value.length < 19 ||
    (value.length === 19 && value <= '9223372036854775807'));
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const status = (value: unknown): value is AttendanceStatus =>
  value === 'present' || value === 'noshow' || value === 'undone';
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /T| /.test(value) &&
  Number.isFinite(Date.parse(value));
const nullable = <T>(
  value: unknown,
  valid: (value: unknown) => value is T,
): value is T | null => value === null || valid(value);
const fail = (): never => {
  throw new TrainerBillingError('request');
};
const requireRow = (value: unknown, scope: BillingScope) => {
  if (
    !record(value) ||
    !uuid(value.id) ||
    !uuid(value.workspace_id) ||
    value.workspace_id.toLowerCase() !== scope.workspaceId.toLowerCase() ||
    !uuid(value.client_record_id) ||
    (scope.clientRecordId &&
      value.client_record_id.toLowerCase() !==
        scope.clientRecordId.toLowerCase()) ||
    !timestamp(value.created_at)
  )
    return fail();
  return value;
};
const base = (value: Record<string, unknown>) => ({
  id: value.id as string,
  workspaceId: value.workspace_id as string,
  clientRecordId: value.client_record_id as string,
  createdAt: value.created_at as string,
});
export const parsePurchase = (
  value: unknown,
  scope: BillingScope,
): BillingPurchase => {
  const row = requireRow(value, scope);
  if (
    typeof row.title !== 'string' ||
    !row.title.trim() ||
    !positiveInteger(row.units) ||
    !minorMoney(row.price_minor) ||
    row.currency !== 'KZT' ||
    !nullable(row.expires_on, date)
  )
    return fail();
  return {
    ...base(row),
    title: row.title,
    units: row.units,
    priceMinor: row.price_minor,
    currency: row.currency,
    expiresOn: row.expires_on,
  };
};
export const parseAttendance = (
  value: unknown,
  scope: BillingScope,
): BillingAttendance => {
  const row = requireRow(value, scope);
  if (
    !uuid(row.booking_id) ||
    !status(row.status) ||
    !positiveInteger(row.revision) ||
    !positiveInteger(row.cycle) ||
    !date(row.service_date) ||
    !timestamp(row.updated_at)
  )
    return fail();
  return {
    ...base(row),
    bookingId: row.booking_id,
    status: row.status,
    revision: row.revision,
    cycle: row.cycle,
    serviceDate: row.service_date,
    updatedAt: row.updated_at,
  };
};
export const parseRevision = (
  value: unknown,
  scope: BillingScope,
): BillingAttendanceRevision => {
  const row = requireRow(value, scope);
  if (
    !uuid(row.attendance_id) ||
    !status(row.status) ||
    !positiveInteger(row.revision) ||
    !positiveInteger(row.cycle) ||
    !date(row.service_date) ||
    !(row.reason === null || typeof row.reason === 'string')
  )
    return fail();
  return {
    ...base(row),
    attendanceId: row.attendance_id,
    status: row.status,
    revision: row.revision,
    cycle: row.cycle,
    serviceDate: row.service_date,
    reason: row.reason,
  };
};
export const parseCredit = (
  value: unknown,
  scope: BillingScope,
): BillingCredit => {
  const row = requireRow(value, scope);
  if (
    !uuid(row.purchase_id) ||
    !nullable(row.attendance_id, uuid) ||
    !nullable(row.booking_id, uuid) ||
    !nullable(row.cycle, positiveInteger) ||
    !nullable(row.reverses_entry_id, uuid) ||
    !(row.reason === null || typeof row.reason === 'string') ||
    typeof row.units !== 'number' ||
    !Number.isSafeInteger(row.units)
  )
    return fail();
  const grant =
    row.kind === 'grant' &&
    positiveInteger(row.units) &&
    row.attendance_id === null &&
    row.booking_id === null &&
    row.cycle === null &&
    row.reverses_entry_id === null;
  const consume =
    row.kind === 'consume' &&
    row.units === -1 &&
    uuid(row.attendance_id) &&
    uuid(row.booking_id) &&
    positiveInteger(row.cycle) &&
    row.reverses_entry_id === null;
  const restore =
    row.kind === 'restore' &&
    row.units === 1 &&
    uuid(row.attendance_id) &&
    uuid(row.booking_id) &&
    positiveInteger(row.cycle) &&
    uuid(row.reverses_entry_id);
  const penalty =
    row.kind === 'charge_late_cancel' &&
    row.units === -1 &&
    uuid(row.booking_id) &&
    row.reverses_entry_id === null &&
    typeof row.reason === 'string' &&
    row.reason.trim().length > 0;
  if (!grant && !consume && !restore && !penalty) return fail();
  return {
    ...base(row),
    purchaseId: row.purchase_id,
    attendanceId: row.attendance_id,
    bookingId: row.booking_id,
    cycle: row.cycle,
    kind: row.kind as BillingCredit['kind'],
    units: row.units,
    reason: row.reason,
    reversesEntryId: row.reverses_entry_id,
  };
};
export const parsePurchaseResult = (
  value: unknown,
  clientRecordId: string,
): BillingPurchaseResult => {
  if (
    !record(value) ||
    !uuid(value.purchase_id) ||
    !uuid(value.workspace_id) ||
    !uuid(value.client_record_id) ||
    value.client_record_id.toLowerCase() !== clientRecordId.toLowerCase() ||
    typeof value.replayed !== 'boolean'
  )
    return fail();
  return {
    purchaseId: value.purchase_id,
    workspaceId: value.workspace_id,
    clientRecordId: value.client_record_id,
    replayed: value.replayed,
  };
};
export const parseAttendanceResult = (
  value: unknown,
  target: {
    bookingId?: string;
    attendanceId?: string;
    expectedStatus?: AttendanceStatus;
    expectedRevision?: number;
    increments?: boolean;
    forbidCharge?: boolean;
    selectedPurchaseId?: string;
  },
  penalty: boolean,
): BillingAttendanceResult => {
  if (
    !record(value) ||
    !uuid(value.booking_id) ||
    !nullable(value.attendance_id, uuid) ||
    !nullable(value.revision, positiveInteger) ||
    !nullable(value.cycle, positiveInteger) ||
    !nullable(value.status, status) ||
    !nullable(value.service_date, date) ||
    !nullable(value.purchase_id, uuid) ||
    !nullable(value.credit_entry_id, uuid) ||
    typeof value.charged !== 'boolean' ||
    typeof value.replayed !== 'boolean' ||
    (target.bookingId &&
      value.booking_id.toLowerCase() !== target.bookingId.toLowerCase()) ||
    (target.attendanceId &&
      value.attendance_id?.toLowerCase() !==
        target.attendanceId.toLowerCase()) ||
    (!penalty &&
      (!uuid(value.attendance_id) ||
        !positiveInteger(value.revision) ||
        !positiveInteger(value.cycle) ||
        !status(value.status) ||
        !date(value.service_date))) ||
    (value.charged &&
      (!uuid(value.purchase_id) || !uuid(value.credit_entry_id))) ||
    (target.expectedStatus && value.status !== target.expectedStatus) ||
    (target.forbidCharge && value.charged) ||
    (target.selectedPurchaseId &&
      value.purchase_id !== null &&
      value.purchase_id.toLowerCase() !==
        target.selectedPurchaseId.toLowerCase()) ||
    (target.expectedRevision !== undefined &&
      (value.revision === null ||
        value.revision !==
          target.expectedRevision +
            (target.increments || value.charged ? 1 : 0))) ||
    (penalty &&
      (!value.charged ||
        (value.attendance_id === null
          ? value.revision !== null ||
            value.cycle !== null ||
            value.status !== null ||
            value.service_date !== null
          : !positiveInteger(value.revision) ||
            !positiveInteger(value.cycle) ||
            value.status !== 'noshow' ||
            !date(value.service_date)))) ||
    (value.purchase_id === null) !== (value.credit_entry_id === null)
  )
    return fail();
  return {
    attendanceId: value.attendance_id,
    bookingId: value.booking_id,
    revision: value.revision,
    status: value.status,
    cycle: value.cycle,
    serviceDate: value.service_date,
    purchaseId: value.purchase_id,
    charged: value.charged,
    creditEntryId: value.credit_entry_id,
    replayed: value.replayed,
  };
};
