import * as service from './service';
import type {
  RecordClientPaymentInput,
  ReverseClientPaymentInput,
  PaymentCommandResult,
} from '../trainer-payments/commands';
import type {
  CreateClientPurchaseInput,
  MarkAttendedInput,
  BillingBookingCommand,
  BindAttendancePurchaseInput,
  UndoAttendanceInput,
  ChargeLateCancellationInput,
  BillingAttendanceResult,
  BillingPurchaseResult,
} from './types';
import { TrainerBillingError } from './types';
import { uuid, positiveInteger, minorMoney, date, record } from './validation';
import {
  savePendingTrainerBillingCommand,
  clearPendingTrainerBillingCommand,
} from './command-storage';

type Command<A extends string, T> = { action: A } & Omit<T, 'expectedUserId'>;
export type TrainerBillingCommand =
  | Command<'createPurchase', CreateClientPurchaseInput>
  | Command<'markAttended', MarkAttendedInput>
  | Command<'markNoShow', BillingBookingCommand>
  | Command<'bindPurchase', BindAttendancePurchaseInput>
  | Command<'undoAttendance', UndoAttendanceInput>
  | Command<'chargeLateCancellation', ChargeLateCancellationInput>
  | Command<'recordPayment', RecordClientPaymentInput>
  | Command<
      'reversePayment',
      ReverseClientPaymentInput & {
        clientRecordId: string;
        purchaseId: string;
        amountMinor: string;
      }
    >;
export type TrainerBillingCommandResult =
  BillingAttendanceResult | BillingPurchaseResult | PaymentCommandResult;
export function validTrainerBillingCommand(
  value: unknown,
): value is TrainerBillingCommand {
  if (!record(value) || !uuid(value.requestId)) return false;
  const keys = ['action', 'requestId'];
  if (value.action === 'createPurchase') {
    keys.push('clientRecordId', 'title', 'units', 'priceMinor');
    if ('expiresOn' in value) keys.push('expiresOn');
    if (
      !uuid(value.clientRecordId) ||
      typeof value.title !== 'string' ||
      !value.title.trim() ||
      value.title.trim().length > 200 ||
      !positiveInteger(value.units) ||
      !minorMoney(value.priceMinor) ||
      (value.expiresOn != null && !date(value.expiresOn))
    )
      return false;
  } else if (
    value.action === 'recordPayment' ||
    value.action === 'reversePayment'
  ) {
    if (value.action === 'recordPayment') {
      keys.push('purchaseId', 'amountMinor', 'paidOn', 'method');
      if (
        !uuid(value.purchaseId) ||
        !minorMoney(value.amountMinor) ||
        value.amountMinor === '0' ||
        !date(value.paidOn) ||
        value.paidOn < '0001-01-01' ||
        typeof value.method !== 'string' ||
        !['Kaspi', 'Перевод', 'Наличные'].includes(value.method)
      )
        return false;
    } else {
      keys.push(
        'paymentEntryId',
        'reason',
        'clientRecordId',
        'purchaseId',
        'amountMinor',
      );
      if (
        !uuid(value.clientRecordId) ||
        !uuid(value.purchaseId) ||
        !minorMoney(value.amountMinor) ||
        value.amountMinor === '0' ||
        !uuid(value.paymentEntryId) ||
        typeof value.reason !== 'string' ||
        !value.reason.trim()
      )
        return false;
    }
    if (value.action === 'recordPayment' && 'reason' in value)
      keys.push('reason');
    if (
      value.reason != null &&
      (typeof value.reason !== 'string' ||
        !value.reason.trim() ||
        value.reason.trim().length > 1000)
    )
      return false;
  } else {
    keys.push('expectedBookingRevision');
    if (
      !positiveInteger(value.expectedBookingRevision) ||
      value.expectedBookingRevision >= 2147483647
    )
      return false;
    if (value.action === 'bindPurchase' || value.action === 'undoAttendance') {
      keys.push('attendanceId', 'expectedAttendanceRevision');
      if (
        !uuid(value.attendanceId) ||
        !positiveInteger(value.expectedAttendanceRevision) ||
        value.expectedAttendanceRevision >= 2147483647
      )
        return false;
    } else if (
      value.action === 'markAttended' ||
      value.action === 'markNoShow' ||
      value.action === 'chargeLateCancellation'
    ) {
      keys.push('bookingId');
      if (!uuid(value.bookingId)) return false;
    } else return false;
    if (value.action === 'markAttended') {
      keys.push('charge');
      if (
        typeof value.charge !== 'boolean' ||
        (!value.charge && value.purchaseId != null)
      )
        return false;
    }
    if (
      value.action === 'undoAttendance' ||
      value.action === 'chargeLateCancellation'
    ) {
      keys.push('reason');
      if (
        typeof value.reason !== 'string' ||
        !value.reason.trim() ||
        value.reason.trim().length > 1000
      )
        return false;
    }
    if (
      value.action === 'markAttended' ||
      value.action === 'bindPurchase' ||
      value.action === 'chargeLateCancellation'
    ) {
      if ('purchaseId' in value) keys.push('purchaseId');
      if (value.purchaseId != null && !uuid(value.purchaseId)) return false;
    }
  }
  return Object.keys(value).sort().join(',') === keys.sort().join(',');
}
export function snapshotTrainerBillingCommand(
  command: TrainerBillingCommand,
): TrainerBillingCommand {
  return Object.fromEntries(
    Object.entries(command)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        key.endsWith('Id') && uuid(value) ? value.toLowerCase() : value,
      ]),
  ) as TrainerBillingCommand;
}
const isPaymentResult = (
  result: TrainerBillingCommandResult,
): result is PaymentCommandResult => 'paymentEntryId' in result;

export async function submitTrainerBillingCommand(
  userId: string,
  workspaceId: string,
  input: TrainerBillingCommand,
): Promise<TrainerBillingCommandResult> {
  if (!validTrainerBillingCommand(input))
    throw new TrainerBillingError('invalidInput');
  const command = snapshotTrainerBillingCommand(input);
  await savePendingTrainerBillingCommand(userId, workspaceId, command);
  const payload = { ...command, expectedUserId: userId };
  let result: TrainerBillingCommandResult;
  try {
    result = await (payload.action === 'recordPayment'
      ? service.recordClientPayment(payload)
      : payload.action === 'reversePayment'
        ? service.reverseClientPayment(payload)
        : payload.action === 'createPurchase'
          ? service.createClientPurchase(payload)
          : payload.action === 'markAttended'
            ? service.markAttended(payload)
            : payload.action === 'markNoShow'
              ? service.markNoShow(payload)
              : payload.action === 'bindPurchase'
                ? service.bindAttendancePurchase(payload)
                : payload.action === 'undoAttendance'
                  ? service.undoAttendance(payload)
                  : service.chargeLateCancellation(payload));
  } catch (error: unknown) {
    if (
      error instanceof TrainerBillingError &&
      (error.code === 'conflict' ||
        error.code === 'invalidState' ||
        error.code === 'overpayment')
    )
      await clearPendingTrainerBillingCommand(
        userId,
        workspaceId,
        command.requestId,
      );
    throw error;
  }
  if (
    'workspaceId' in result &&
    result.workspaceId.toLowerCase() !== workspaceId.toLowerCase()
  )
    throw new TrainerBillingError('request');
  if (
    command.action === 'reversePayment' &&
    (!isPaymentResult(result) ||
      result.workspaceId.toLowerCase() !== workspaceId.toLowerCase() ||
      result.clientRecordId.toLowerCase() !==
        command.clientRecordId.toLowerCase() ||
      result.kind !== 'reversal' ||
      result.reversesEntryId?.toLowerCase() !==
        command.paymentEntryId.toLowerCase() ||
      result.amountMinor !== `-${command.amountMinor}` ||
      result.purchaseId.toLowerCase() !== command.purchaseId.toLowerCase())
  )
    throw new TrainerBillingError('request');
  await clearPendingTrainerBillingCommand(
    userId,
    workspaceId,
    command.requestId,
  );
  return result;
}
