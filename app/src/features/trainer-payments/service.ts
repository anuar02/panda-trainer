import { financialPage } from '../trainer-billing/read-page';
import { withReadAuth, financialRowLimit } from '../trainer-billing/read-auth';
import { projectPurchasePayments } from '@/domain/payments';
import {
  date,
  minorMoney,
  record,
  uuid,
  parsePurchase,
} from '../trainer-billing/validation';
import {
  TrainerPaymentsError,
  type PaymentEntry,
  type PaymentScope,
  type TrainerPayments,
} from './types';

export { recordClientPayment, reverseClientPayment } from './mutations';
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
    return await withReadAuth(
      scope.expectedUserId,
      (code) => {
        throw new TrainerPaymentsError(code);
      },
      async (client, token, guard) => {
        const entries: PaymentEntry[] = [];
        const ids = new Set<string>();
        let total: number | null = null;
        for (let offset = 0; offset <= financialRowLimit; offset += 500) {
          await guard();
          let request = client
            .from('payment_entries')
            .select(
              'id,workspace_id,client_record_id,purchase_id,kind,amount_minor::text,currency,paid_on,method,source,reason,reverses_entry_id,created_at',
              { count: 'exact' },
            )
            .eq('workspace_id', scope.workspaceId)
            .order('id')
            .range(offset, offset + 499);
          if (scope.clientRecordId)
            request = request.eq('client_record_id', scope.clientRecordId);
          const {
            data: rows,
            error: readError,
            count,
          } = await request.setHeader('Authorization', `Bearer ${token}`);
          await guard();
          if (readError) return fail();
          const page = financialPage(rows, count, offset, total, fail);
          total = page.count;
          for (const raw of page.rows) {
            const entry = parsePaymentEntry(raw, scope);
            const key = entry.id.toLowerCase();
            if (ids.has(key)) return fail();
            ids.add(key);
            entries.push(entry);
          }
          if (page.done) break;
        }
        const purchases = [];
        const purchaseIds = new Set<string>();
        let purchaseTotal: number | null = null;
        for (let offset = 0; offset <= financialRowLimit; offset += 500) {
          await guard();
          let request = client
            .from('client_purchases')
            .select(
              'id,workspace_id,client_record_id,title,units,price_minor::text,currency,expires_on,created_at',
              { count: 'exact' },
            )
            .eq('workspace_id', scope.workspaceId)
            .order('id')
            .range(offset, offset + 499);
          if (scope.clientRecordId)
            request = request.eq('client_record_id', scope.clientRecordId);
          const { data, error, count } = await request.setHeader(
            'Authorization',
            `Bearer ${token}`,
          );
          await guard();
          if (error) return fail();
          const page = financialPage(data, count, offset, purchaseTotal, fail);
          purchaseTotal = page.count;
          for (const raw of page.rows) {
            const purchase = parsePurchase(raw, scope);
            const key = purchase.id.toLowerCase();
            if (purchaseIds.has(key)) return fail();
            purchaseIds.add(key);
            purchases.push(purchase);
          }
          if (page.done) break;
        }
        const clients = new Set(
          [...purchases, ...entries].map((row) =>
            row.clientRecordId.toLowerCase(),
          ),
        );
        for (const clientRecordId of clients) {
          const clientPurchases = purchases.filter(
            (row) => row.clientRecordId.toLowerCase() === clientRecordId,
          );
          const clientEntries = entries.filter(
            (row) => row.clientRecordId.toLowerCase() === clientRecordId,
          );
          if (
            !projectPurchasePayments(
              clientPurchases,
              { entries: clientEntries },
              {
                workspaceId: scope.workspaceId,
                clientRecordId,
              },
            ).valid
          )
            return fail();
        }
        return { entries };
      },
    );
  } catch (error: unknown) {
    if (error instanceof TrainerPaymentsError) throw error;
    throw new TrainerPaymentsError('request');
  }
}
