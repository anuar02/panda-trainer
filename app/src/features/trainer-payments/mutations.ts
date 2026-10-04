import {
  withFinancialMutationAuth,
  type FinancialMutationFence,
} from '../trainer-billing/mutation-auth';
import { TrainerBillingError } from '../trainer-billing/types';
import type { Database } from '../../lib/database.types';
import { date, minorMoney, record, uuid } from '../trainer-billing/validation';
export type PaymentCommandErrorCode =
  | 'configuration'
  | 'invalidInput'
  | 'unavailable'
  | 'request'
  | 'conflict'
  | 'invalidState'
  | 'overpayment';
export class TrainerPaymentCommandError extends Error {
  constructor(readonly code: PaymentCommandErrorCode) {
    super(code);
    this.name = 'TrainerPaymentCommandError';
  }
}
type Identity = { expectedUserId: string; requestId: string };
type Method = 'Kaspi' | 'Перевод' | 'Наличные';
export type RecordClientPaymentInput = Identity & {
  purchaseId: string;
  amountMinor: string;
  paidOn: string;
  method: Method;
  reason?: string | null;
};
export type ReverseClientPaymentInput = Identity & {
  paymentEntryId: string;
  reason: string;
};
export type PaymentCommandResult = {
  paymentEntryId: string;
  workspaceId: string;
  clientRecordId: string;
  purchaseId: string;
  kind: 'payment' | 'reversal';
  amountMinor: string;
  currency: 'KZT';
  paidOn: string;
  method: Method;
  source: 'manual';
  reason: string | null;
  reversesEntryId: string | null;
  paidMinor: string;
  dueMinor: string;
  replayed: boolean;
};
const fail = (code: PaymentCommandErrorCode): never => {
  throw new TrainerPaymentCommandError(code);
};
const method = (value: unknown): value is Method =>
  value === 'Kaspi' || value === 'Перевод' || value === 'Наличные';
const validDate = (value: unknown) => date(value) && value >= '0001-01-01';
const validReason = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= 1000;
const identity = (input: Identity) => {
  if (!uuid(input.expectedUserId) || !uuid(input.requestId))
    fail('invalidInput');
  return {
    expectedUserId: input.expectedUserId.toLowerCase(),
    requestId: input.requestId.toLowerCase(),
  };
};
const rpcError = (code: string): PaymentCommandErrorCode =>
  code === 'P0003'
    ? 'overpayment'
    : code === '22023'
      ? 'invalidInput'
      : code === '40001'
        ? 'conflict'
        : code === '42501' || code === 'P0002' || code === '23503'
          ? 'unavailable'
          : code === '55000' || code === '23514'
            ? 'invalidState'
            : 'request';
const parseResult = (
  value: unknown,
  target: {
    purchaseId?: string;
    paymentEntryId?: string;
    amountMinor?: string;
    paidOn?: string;
    method?: Method;
    reason: string | null;
  },
): PaymentCommandResult => {
  if (
    !record(value) ||
    !uuid(value.payment_entry_id) ||
    !uuid(value.workspace_id) ||
    !uuid(value.client_record_id) ||
    !uuid(value.purchase_id) ||
    value.currency !== 'KZT' ||
    value.source !== 'manual' ||
    !validDate(value.paid_on) ||
    !method(value.method) ||
    typeof value.replayed !== 'boolean' ||
    !minorMoney(value.paid_minor) ||
    !minorMoney(value.due_minor) ||
    (value.reason !== null && !validReason(value.reason)) ||
    value.reason !== target.reason
  )
    return fail('request');
  if (target.purchaseId) {
    if (
      value.purchase_id.toLowerCase() !== target.purchaseId ||
      value.kind !== 'payment' ||
      value.amount_minor !== target.amountMinor ||
      value.paid_on !== target.paidOn ||
      value.method !== target.method ||
      value.reverses_entry_id !== null
    )
      return fail('request');
  } else if (
    value.kind !== 'reversal' ||
    !uuid(value.reverses_entry_id) ||
    value.reverses_entry_id.toLowerCase() !== target.paymentEntryId ||
    value.payment_entry_id.toLowerCase() === target.paymentEntryId ||
    typeof value.amount_minor !== 'string' ||
    !/^-[1-9]\d*$/.test(value.amount_minor) ||
    !minorMoney(value.amount_minor.slice(1)) ||
    !validReason(value.reason)
  )
    return fail('request');
  if (typeof value.amount_minor !== 'string') return fail('request');
  if (
    value.kind === 'payment' &&
    (!minorMoney(value.amount_minor) ||
      value.amount_minor === '0' ||
      BigInt(value.paid_minor) < BigInt(value.amount_minor))
  )
    return fail('request');
  if (
    value.kind === 'reversal' &&
    BigInt(value.due_minor) < -BigInt(value.amount_minor)
  )
    return fail('request');
  if (
    BigInt(value.paid_minor) + BigInt(value.due_minor) >
    BigInt('9223372036854775807')
  )
    return fail('request');
  return {
    paymentEntryId: value.payment_entry_id.toLowerCase(),
    workspaceId: value.workspace_id.toLowerCase(),
    clientRecordId: value.client_record_id.toLowerCase(),
    purchaseId: value.purchase_id.toLowerCase(),
    kind: value.kind as PaymentCommandResult['kind'],
    amountMinor: value.amount_minor,
    currency: value.currency,
    paidOn: value.paid_on as string,
    method: value.method,
    source: value.source,
    reason: value.reason as string | null,
    reversesEntryId:
      typeof value.reverses_entry_id === 'string'
        ? value.reverses_entry_id.toLowerCase()
        : null,
    paidMinor: value.paid_minor,
    dueMinor: value.due_minor,
    replayed: value.replayed,
  };
};
type RpcName = 'record_client_payment' | 'reverse_client_payment';
const rpc = async <K extends RpcName>(
  name: K,
  args: Database['public']['Functions'][K]['Args'],
  expectedUserId: string,
  target: Parameters<typeof parseResult>[1],
  fence?: FinancialMutationFence,
): Promise<PaymentCommandResult> => {
  try {
    return await withFinancialMutationAuth(
      expectedUserId,
      fence,
      async (client, token) => {
        const { data, error } = await client
          .rpc(name, args)
          .setHeader('Authorization', `Bearer ${token}`);
        if (error) return fail(rpcError(error.code));
        const result = parseResult(data, target);
        fence?.assertWorkspace(result.workspaceId);
        return result;
      },
    );
  } catch (error: unknown) {
    if (error instanceof TrainerPaymentCommandError) throw error;
    if (error instanceof TrainerBillingError) return fail(error.code);
    return fail('request');
  }
};
export function recordClientPayment(
  input: RecordClientPaymentInput,
  fence?: FinancialMutationFence,
) {
  const actor = identity(input);
  if (
    !uuid(input.purchaseId) ||
    !minorMoney(input.amountMinor) ||
    input.amountMinor === '0' ||
    !validDate(input.paidOn) ||
    !method(input.method) ||
    (input.reason != null && !validReason(input.reason))
  )
    return fail('invalidInput');
  const purchaseId = input.purchaseId.toLowerCase();
  const reason = input.reason?.trim() ?? null;
  const args = {
    p_purchase_id: purchaseId,
    p_amount_minor: input.amountMinor,
    p_paid_on: input.paidOn,
    p_method: input.method,
    p_request_id: actor.requestId,
    p_reason: reason,
  };
  return rpc(
    'record_client_payment',
    args as unknown as Database['public']['Functions']['record_client_payment']['Args'],
    actor.expectedUserId,
    {
      purchaseId,
      amountMinor: input.amountMinor,
      paidOn: input.paidOn,
      method: input.method,
      reason,
    },
    fence,
  );
}
export function reverseClientPayment(
  input: ReverseClientPaymentInput,
  fence?: FinancialMutationFence,
) {
  const actor = identity(input);
  if (!uuid(input.paymentEntryId) || !validReason(input.reason))
    return fail('invalidInput');
  const paymentEntryId = input.paymentEntryId.toLowerCase();
  const reason = input.reason.trim();
  return rpc(
    'reverse_client_payment',
    {
      p_payment_entry_id: paymentEntryId,
      p_reason: reason,
      p_request_id: actor.requestId,
    },
    actor.expectedUserId,
    { paymentEntryId, reason },
    fence,
  );
}
