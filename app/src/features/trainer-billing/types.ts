export type TrainerBillingErrorCode =
  | 'configuration'
  | 'invalidInput'
  | 'unavailable'
  | 'conflict'
  | 'invalidState'
  | 'overpayment'
  | 'request';

export class TrainerBillingError extends Error {
  constructor(readonly code: TrainerBillingErrorCode) {
    super('Billing ' + code);
    this.name = 'TrainerBillingError';
  }
}

export type BillingScope = {
  workspaceId: string;
  expectedUserId: string;
  clientRecordId?: string;
};
export type BillingPurchase = {
  id: string;
  workspaceId: string;
  clientRecordId: string;
  title: string;
  units: number;
  priceMinor: string;
  currency: 'KZT';
  expiresOn: string | null;
  createdAt: string;
};
export type AttendanceStatus = 'present' | 'noshow' | 'undone';
export type BillingAttendance = {
  id: string;
  workspaceId: string;
  clientRecordId: string;
  bookingId: string;
  status: AttendanceStatus;
  revision: number;
  cycle: number;
  serviceDate: string;
  createdAt: string;
  updatedAt: string;
};
export type BillingAttendanceRevision = Omit<
  BillingAttendance,
  'bookingId' | 'updatedAt'
> & {
  attendanceId: string;
  reason: string | null;
};
export type BillingCredit = {
  id: string;
  workspaceId: string;
  clientRecordId: string;
  purchaseId: string;
  attendanceId: string | null;
  bookingId: string | null;
  cycle: number | null;
  kind: 'grant' | 'consume' | 'restore' | 'charge_late_cancel';
  units: number;
  reason: string | null;
  reversesEntryId: string | null;
  createdAt: string;
};
export type TrainerBilling = {
  purchases: BillingPurchase[];
  attendance: BillingAttendance[];
  revisions: BillingAttendanceRevision[];
  credits: BillingCredit[];
};
export type BillingCommandIdentity = {
  expectedUserId: string;
  requestId: string;
};
export type CreateClientPurchaseInput = BillingCommandIdentity & {
  clientRecordId: string;
  title: string;
  units: number;
  priceMinor: string;
  expiresOn?: string | null;
};
export type BillingBookingCommand = BillingCommandIdentity & {
  bookingId: string;
  expectedBookingRevision: number;
};
export type MarkAttendedInput = BillingBookingCommand & {
  charge: boolean;
  purchaseId?: string | null;
};
export type BillingAttendanceCommand = BillingCommandIdentity & {
  attendanceId: string;
  expectedAttendanceRevision: number;
  expectedBookingRevision: number;
};
export type BindAttendancePurchaseInput = BillingAttendanceCommand & {
  purchaseId?: string | null;
};
export type UndoAttendanceInput = BillingAttendanceCommand & { reason: string };
export type ChargeLateCancellationInput = BillingBookingCommand & {
  reason: string;
  purchaseId?: string | null;
};
export type BillingPurchaseResult = {
  purchaseId: string;
  workspaceId: string;
  clientRecordId: string;
  replayed: boolean;
};
export type BillingAttendanceResult = {
  attendanceId: string | null;
  bookingId: string;
  revision: number | null;
  status: AttendanceStatus | null;
  cycle: number | null;
  serviceDate: string | null;
  purchaseId: string | null;
  charged: boolean;
  creditEntryId: string | null;
  replayed: boolean;
};
