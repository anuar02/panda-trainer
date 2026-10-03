import { getSupabaseClient } from '@/features/auth/client';
import { date, minorMoney, record, uuid } from '../trainer-billing/validation';
import {
  TrainerPaymentsError,
  type PaymentEntry,
  type PaymentScope,
  type TrainerPayments,
} from './types';

export { TrainerPaymentsError } from './types';
const fail = (): never => {
  throw new TrainerPaymentsError('request');
};
export function parsePaymentEntry(
  value: unknown,
  scope: PaymentScope,
): PaymentEntry {
  if (!record(value)) return fail();
  const amount = value.amount_minor;
  const magnitude =
    typeof amount === 'string' ? amount.replace(/^-/, '') : null;
  if (
    !uuid(value.id) ||
    !uuid(value.workspace_id) ||
    value.workspace_id.toLowerCase() !== scope.workspaceId.toLowerCase() ||
    !uuid(value.client_record_id) ||
    (scope.clientRecordId &&
      value.client_record_id.toLowerCase() !==
        scope.clientRecordId.toLowerCase()) ||
    !uuid(value.purchase_id) ||
    !minorMoney(magnitude) ||
    magnitude === '0' ||
    (value.kind !== 'payment' && value.kind !== 'reversal') ||
    (value.kind === 'payment'
      ? amount !== magnitude || value.reverses_entry_id !== null
      : amount !== `-${magnitude}` ||
        !uuid(value.reverses_entry_id) ||
        typeof value.reason !== 'string' ||
        !value.reason.trim()) ||
    value.currency !== 'KZT' ||
    !date(value.paid_on) ||
    typeof value.method !== 'string' ||
    !['Kaspi', 'Перевод', 'Наличные'].includes(value.method) ||
    value.source !== 'manual' ||
    (value.reason !== null &&
      (typeof value.reason !== 'string' ||
        !value.reason.trim() ||
        value.reason.trim().length > 1000)) ||
    typeof value.created_at !== 'string' ||
    !/T| /.test(value.created_at) ||
    !Number.isFinite(Date.parse(value.created_at))
  )
    return fail();
  return {
    id: value.id,
    workspaceId: value.workspace_id,
    clientRecordId: value.client_record_id,
    purchaseId: value.purchase_id,
    kind: value.kind,
    amountMinor: amount as string,
    currency: 'KZT',
    paidOn: value.paid_on,
    method: value.method as PaymentEntry['method'],
    source: 'manual',
    reason: value.reason as string | null,
    reversesEntryId: value.reverses_entry_id as string | null,
    createdAt: value.created_at,
  };
}
export async function loadTrainerPayments(
  input: PaymentScope,
): Promise<TrainerPayments> {
  if (
    !uuid(input.expectedUserId) ||
    !uuid(input.workspaceId) ||
    (input.clientRecordId != null && !uuid(input.clientRecordId))
  )
    throw new TrainerPaymentsError('invalidInput');
  const scope = { ...input };
  try {
    const client = getSupabaseClient();
    if (!client) throw new TrainerPaymentsError('configuration');
    const { data, error } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (
      error ||
      !token ||
      data.session?.user.id.toLowerCase() !== scope.expectedUserId.toLowerCase()
    )
      throw new TrainerPaymentsError('unavailable');
    const entries: PaymentEntry[] = [];
    const ids = new Set<string>();
    for (let offset = 0; ; offset += 500) {
      let request = client
        .from('payment_entries')
        .select(
          'id,workspace_id,client_record_id,purchase_id,kind,amount_minor::text,currency,paid_on,method,source,reason,reverses_entry_id,created_at',
        )
        .eq('workspace_id', scope.workspaceId)
        .order('id')
        .range(offset, offset + 499);
      if (scope.clientRecordId)
        request = request.eq('client_record_id', scope.clientRecordId);
      const { data: rows, error: readError } = await request.setHeader(
        'Authorization',
        `Bearer ${token}`,
      );
      if (readError || !Array.isArray(rows)) return fail();
      for (const raw of rows) {
        const entry = parsePaymentEntry(raw, scope);
        const key = entry.id.toLowerCase();
        if (ids.has(key)) return fail();
        ids.add(key);
        entries.push(entry);
      }
      if (rows.length < 500) return { entries };
    }
  } catch (error: unknown) {
    if (error instanceof TrainerPaymentsError) throw error;
    throw new TrainerPaymentsError('request');
  }
}
