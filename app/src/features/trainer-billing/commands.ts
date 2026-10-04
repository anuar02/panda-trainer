import {
  captureFinancialMutationFence,
  type FinancialMutationFence,
} from './mutation-auth';
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
  retainPendingTrainerBillingCommand,
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
  suppliedFence?: FinancialMutationFence,
): Promise<TrainerBillingCommandResult> {
  if (!validTrainerBillingCommand(input))
    throw new TrainerBillingError('invalidInput');
  const command = snapshotTrainerBillingCommand(input);
  const fence =
    suppliedFence ?? captureFinancialMutationFence(userId, workspaceId);
  let cleared = false;
  try {
    fence.assertActor(userId);
    fence.assertWorkspace(workspaceId);
    await fence.guard();
    fence.assertCurrent();
    await savePendingTrainerBillingCommand(userId, workspaceId, command, fence);
    await fence.guard();
    fence.assertCurrent();
    const payload = { ...command, expectedUserId: userId };
    let result: TrainerBillingCommandResult;
    try {
      result = await (payload.action === 'recordPayment'
        ? service.recordClientPayment(payload, fence)
        : payload.action === 'reversePayment'
          ? service.reverseClientPayment(payload, fence)
          : payload.action === 'createPurchase'
            ? service.createClientPurchase(payload, fence)
            : payload.action === 'markAttended'
              ? service.markAttended(payload, fence)
              : payload.action === 'markNoShow'
                ? service.markNoShow(payload, fence)
                : payload.action === 'bindPurchase'
                  ? service.bindAttendancePurchase(payload, fence)
                  : payload.action === 'undoAttendance'
                    ? service.undoAttendance(payload, fence)
                    : service.chargeLateCancellation(payload, fence));
    } catch (error: unknown) {
      await fence.guard();
      fence.assertCurrent();
      if (
        error instanceof TrainerBillingError &&
        (error.code === 'conflict' ||
          error.code === 'invalidState' ||
          error.code === 'overpayment')
      )
        cleared = await clearPendingTrainerBillingCommand(
          userId,
          workspaceId,
          command.requestId,
          fence,
        );
      await fence.guard();
      fence.assertCurrent();
      cleared = false;
      throw error;
    }
    await fence.guard();
    fence.assertCurrent();
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
    cleared = await clearPendingTrainerBillingCommand(
      userId,
      workspaceId,
      command.requestId,
      fence,
    );
    await fence.guard();
    fence.assertCurrent();
    return result;
  } catch (error: unknown) {
    if (cleared)
      await retainPendingTrainerBillingCommand(userId, workspaceId, command);
    throw error;
  } finally {
    if (!suppliedFence) fence.dispose();
  }
}
