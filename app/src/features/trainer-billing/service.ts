import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';
import {
  TrainerBillingError,
  type BillingScope,
  type TrainerBilling,
  type CreateClientPurchaseInput,
  type BillingBookingCommand,
  type MarkAttendedInput,
  type BindAttendancePurchaseInput,
  type UndoAttendanceInput,
  type ChargeLateCancellationInput,
} from './types';
import {
  uuid,
  positiveInteger,
  date,
  minorMoney,
  parsePurchase,
  parseAttendance,
  parseRevision,
  parseCredit,
  parsePurchaseResult,
  parseAttendanceResult,
} from './validation';

export { TrainerBillingError } from './types';
const invalid = (): never => {
  throw new TrainerBillingError('invalidInput');
};
const rpcError = (code: string) =>
  new TrainerBillingError(
    code === '22023'
      ? 'invalidInput'
      : code === '40001'
        ? 'conflict'
        : code === '42501' || code === 'P0002' || code === '23503'
          ? 'unavailable'
          : code === '55000' || code === '23514'
            ? 'invalidState'
            : 'request',
  );
const authenticate = async (expectedUserId: string) => {
  const client = getSupabaseClient();
  if (!client) throw new TrainerBillingError('configuration');
  const { data, error } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (
    error ||
    !token ||
    data.session?.user.id.toLowerCase() !== expectedUserId.toLowerCase()
  )
    throw new TrainerBillingError('unavailable');
  return { client, token };
};
const protectedRequest = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof TrainerBillingError) throw error;
    throw new TrainerBillingError('request');
  }
};
const commandIdentity = (input: {
  expectedUserId: string;
  requestId: string;
}) => {
  if (!uuid(input.expectedUserId) || !uuid(input.requestId)) invalid();
  return {
    expectedUserId: input.expectedUserId.toLowerCase(),
    requestId: input.requestId.toLowerCase(),
  };
};
const bookingArgs = (input: BillingBookingCommand) => {
  if (!uuid(input.bookingId) || !positiveInteger(input.expectedBookingRevision))
    invalid();
  return {
    p_booking_id: input.bookingId.toLowerCase(),
    p_expected_booking_revision: input.expectedBookingRevision,
  };
};
const attendanceArgs = (input: BindAttendancePurchaseInput) => {
  if (
    !uuid(input.attendanceId) ||
    !positiveInteger(input.expectedAttendanceRevision) ||
    !positiveInteger(input.expectedBookingRevision)
  )
    invalid();
  return {
    p_attendance_id: input.attendanceId.toLowerCase(),
    p_expected_attendance_revision: input.expectedAttendanceRevision,
    p_expected_booking_revision: input.expectedBookingRevision,
  };
};
const purchaseSelection = (value: string | null | undefined) => {
  if (value != null && !uuid(value)) invalid();
  return value?.toLowerCase();
};
const reason = (value: string) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000)
    invalid();
  return value.trim();
};
type RpcName =
  | 'create_client_purchase'
  | 'mark_attended'
  | 'mark_no_show'
  | 'bind_attendance_purchase'
  | 'undo_attendance'
  | 'charge_late_cancellation';
const rpc = async <K extends RpcName, T>(
  name: K,
  args: Database['public']['Functions'][K]['Args'],
  expectedUserId: string,
  parse: (value: unknown) => T,
): Promise<T> =>
  protectedRequest(async () => {
    const { client, token } = await authenticate(expectedUserId);
    const { data, error } = await client
      .rpc(name, args)
      .setHeader('Authorization', `Bearer ${token}`);
    if (error) throw rpcError(error.code);
    return parse(data);
  });

export function createClientPurchase(input: CreateClientPurchaseInput) {
  const identity = commandIdentity(input);
  if (
    !uuid(input.clientRecordId) ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.trim().length > 200 ||
    !positiveInteger(input.units) ||
    !minorMoney(input.priceMinor) ||
    (input.expiresOn != null && !date(input.expiresOn))
  )
    invalid();
  const clientRecordId = input.clientRecordId.toLowerCase();
  const wireArgs = {
    p_client_record_id: clientRecordId,
    p_title: input.title,
    p_units: input.units,
    p_price_minor: input.priceMinor,
    p_request_id: identity.requestId,
    ...(input.expiresOn == null ? {} : { p_expires_on: input.expiresOn }),
  };
  return rpc(
    'create_client_purchase',
    wireArgs as unknown as Database['public']['Functions']['create_client_purchase']['Args'],
    identity.expectedUserId,
    (value) => parsePurchaseResult(value, clientRecordId),
  );
}
export function markAttended(input: MarkAttendedInput) {
  const identity = commandIdentity(input);
  const args = {
    ...bookingArgs(input),
    p_request_id: identity.requestId,
    p_charge: input.charge,
    p_purchase_id: purchaseSelection(input.purchaseId),
  };
  if (
    typeof input.charge !== 'boolean' ||
    (!input.charge && input.purchaseId != null)
  )
    invalid();
  return rpc('mark_attended', args, identity.expectedUserId, (value) =>
    parseAttendanceResult(
      value,
      {
        bookingId: args.p_booking_id,
        expectedStatus: 'present',
        forbidCharge: !args.p_charge,
        selectedPurchaseId: args.p_purchase_id,
      },
      false,
    ),
  );
}
export function markNoShow(input: BillingBookingCommand) {
  const identity = commandIdentity(input);
  const args = { ...bookingArgs(input), p_request_id: identity.requestId };
  return rpc('mark_no_show', args, identity.expectedUserId, (value) =>
    parseAttendanceResult(
      value,
      {
        bookingId: args.p_booking_id,
        expectedStatus: 'noshow',
        forbidCharge: true,
      },
      false,
    ),
  );
}
export function bindAttendancePurchase(input: BindAttendancePurchaseInput) {
  const identity = commandIdentity(input);
  const args = {
    ...attendanceArgs(input),
    p_request_id: identity.requestId,
    p_purchase_id: purchaseSelection(input.purchaseId),
  };
  return rpc(
    'bind_attendance_purchase',
    args,
    identity.expectedUserId,
    (value) =>
      parseAttendanceResult(
        value,
        {
          attendanceId: args.p_attendance_id,
          expectedStatus: 'present',
          expectedRevision: args.p_expected_attendance_revision,
          selectedPurchaseId: args.p_purchase_id,
        },
        false,
      ),
  );
}
export function undoAttendance(input: UndoAttendanceInput) {
  const identity = commandIdentity(input);
  const args = {
    ...attendanceArgs(input),
    p_reason: reason(input.reason),
    p_request_id: identity.requestId,
  };
  return rpc('undo_attendance', args, identity.expectedUserId, (value) =>
    parseAttendanceResult(
      value,
      {
        attendanceId: args.p_attendance_id,
        expectedStatus: 'undone',
        expectedRevision: args.p_expected_attendance_revision,
        increments: true,
        forbidCharge: true,
      },
      false,
    ),
  );
}
export function chargeLateCancellation(input: ChargeLateCancellationInput) {
  const identity = commandIdentity(input);
  const args = {
    ...bookingArgs(input),
    p_reason: reason(input.reason),
    p_request_id: identity.requestId,
    p_purchase_id: purchaseSelection(input.purchaseId),
  };
  return rpc(
    'charge_late_cancellation',
    args,
    identity.expectedUserId,
    (value) =>
      parseAttendanceResult(
        value,
        {
          bookingId: args.p_booking_id,
          selectedPurchaseId: args.p_purchase_id,
        },
        true,
      ),
  );
}

export function loadTrainerBilling(
  input: BillingScope,
): Promise<TrainerBilling> {
  if (
    !uuid(input.workspaceId) ||
    !uuid(input.expectedUserId) ||
    (input.clientRecordId != null && !uuid(input.clientRecordId))
  )
    invalid();
  const scope = { ...input };
  return protectedRequest(async () => {
    const { client, token } = await authenticate(scope.expectedUserId);
    const read = async <T>(
      table:
        | 'client_purchases'
        | 'attendance_records'
        | 'attendance_revisions'
        | 'credit_entries',
      columns: string,
      parse: (value: unknown, scope: BillingScope) => T,
    ): Promise<T[]> => {
      const rows: T[] = [];
      const ids = new Set<string>();
      for (let offset = 0; ; offset += 500) {
        let request = client
          .from(table)
          .select(columns)
          .eq('workspace_id', scope.workspaceId)
          .order('id')
          .range(offset, offset + 499);
        if (scope.clientRecordId)
          request = request.eq('client_record_id', scope.clientRecordId);
        const { data, error } = await request.setHeader(
          'Authorization',
          `Bearer ${token}`,
        );
        if (error) throw new TrainerBillingError('request');
        if (!Array.isArray(data)) throw new TrainerBillingError('request');
        for (const value of data) {
          const row = parse(value, scope);
          const id = (row as { id: string }).id;
          if (ids.has(id)) throw new TrainerBillingError('request');
          ids.add(id);
          rows.push(row);
        }
        if (data.length < 500) return rows;
      }
    };
    const [purchases, attendance, revisions, credits] = await Promise.all([
      read(
        'client_purchases',
        'id,workspace_id,client_record_id,title,units,price_minor::text,currency,expires_on,created_at',
        parsePurchase,
      ),
      read(
        'attendance_records',
        'id,workspace_id,client_record_id,booking_id,status,revision,cycle,service_date,created_at,updated_at',
        parseAttendance,
      ),
      read(
        'attendance_revisions',
        'id,workspace_id,client_record_id,attendance_id,revision,cycle,status,service_date,reason,created_at',
        parseRevision,
      ),
      read(
        'credit_entries',
        'id,workspace_id,client_record_id,purchase_id,attendance_id,booking_id,cycle,kind,units,reason,reverses_entry_id,created_at',
        parseCredit,
      ),
    ]);
    return { purchases, attendance, revisions, credits };
  });
}
