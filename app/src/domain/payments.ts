import type { BillingPurchase } from '../features/trainer-billing/types';
import type {
  PaymentEntry,
  TrainerPayments,
} from '../features/trainer-payments/types';
import { date, minorMoney, uuid } from '../features/trainer-billing/validation';
import type { BillingProjectionScope } from './billing';

export type PurchasePaymentProjection = {
  valid: boolean;
  purchases: {
    purchase: BillingPurchase;
    paidMinor: string;
    dueMinor: string;
    payments: PaymentEntry[];
    history: (PaymentEntry & { reversedAt: string | null })[];
    reversals: PaymentEntry[];
  }[];
};
export function projectPurchasePayments(
  purchases: BillingPurchase[],
  data: TrainerPayments,
  scope: BillingProjectionScope,
): PurchasePaymentProjection {
  const invalid = (): PurchasePaymentProjection => ({
    valid: false,
    purchases: [],
  });
  if (!uuid(scope.workspaceId) || !uuid(scope.clientRecordId)) return invalid();
  const scoped = (row: { workspaceId: string; clientRecordId: string }) =>
    row.workspaceId.toLowerCase() === scope.workspaceId.toLowerCase() &&
    row.clientRecordId.toLowerCase() === scope.clientRecordId.toLowerCase();
  const selected = purchases.filter(scoped);
  const entries = data.entries.filter(scoped);
  const byPurchase = new Map<string, BillingPurchase>();
  for (const purchase of selected) {
    const key = purchase.id.toLowerCase();
    if (
      !uuid(purchase.id) ||
      byPurchase.has(key) ||
      purchase.currency !== 'KZT' ||
      !minorMoney(purchase.priceMinor)
    )
      return invalid();
    byPurchase.set(key, purchase);
  }
  const byId = new Map<string, PaymentEntry>();
  for (const entry of entries) {
    const key = entry.id.toLowerCase();
    const magnitude = entry.amountMinor.replace(/^-/, '');
    if (
      !uuid(entry.id) ||
      !uuid(entry.purchaseId) ||
      byId.has(key) ||
      !byPurchase.has(entry.purchaseId.toLowerCase()) ||
      entry.currency !== 'KZT' ||
      !minorMoney(magnitude) ||
      magnitude === '0' ||
      !date(entry.paidOn) ||
      !Number.isFinite(Date.parse(entry.createdAt)) ||
      !['Kaspi', 'Перевод', 'Наличные'].includes(entry.method) ||
      entry.source !== 'manual' ||
      (entry.reason !== null &&
        (!entry.reason.trim() || entry.reason.trim().length > 1000)) ||
      (entry.kind === 'payment'
        ? entry.amountMinor !== magnitude || entry.reversesEntryId !== null
        : entry.kind !== 'reversal' ||
          entry.amountMinor !== `-${magnitude}` ||
          !uuid(entry.reversesEntryId) ||
          !entry.reason?.trim())
    )
      return invalid();
    byId.set(key, entry);
  }
  const reversed = new Set<string>();
  for (const entry of entries.filter((row) => row.kind === 'reversal')) {
    if (!uuid(entry.reversesEntryId)) return invalid();
    const key = entry.reversesEntryId.toLowerCase();
    const original = byId.get(key);
    if (
      !original ||
      original.kind !== 'payment' ||
      reversed.has(key) ||
      original.purchaseId.toLowerCase() !== entry.purchaseId.toLowerCase() ||
      original.method !== entry.method ||
      original.paidOn !== entry.paidOn ||
      entry.amountMinor !== `-${original.amountMinor}`
    )
      return invalid();
    reversed.add(key);
  }
  const results: PurchasePaymentProjection['purchases'] = [];
  for (const purchase of selected) {
    const history = entries.filter(
      (entry) => entry.purchaseId.toLowerCase() === purchase.id.toLowerCase(),
    );
    const payments = history
      .filter(
        (entry) =>
          entry.kind === 'payment' && !reversed.has(entry.id.toLowerCase()),
      )
      .sort(
        (a, b) =>
          b.paidOn.localeCompare(a.paidOn) ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.id.localeCompare(a.id),
      );
    const paid = payments.reduce(
      (sum, entry) => sum + BigInt(entry.amountMinor),
      BigInt(0),
    );
    const price = BigInt(purchase.priceMinor);
    if (paid > price) return invalid();
    results.push({
      purchase,
      paidMinor: paid.toString(),
      dueMinor: (price - paid).toString(),
      payments,
      history: history
        .filter((entry) => entry.kind === 'payment')
        .map((entry) => ({
          ...entry,
          reversedAt:
            history.find(
              (row) =>
                row.reversesEntryId?.toLowerCase() === entry.id.toLowerCase(),
            )?.createdAt ?? null,
        }))
        .sort(
          (a, b) =>
            b.paidOn.localeCompare(a.paidOn) ||
            b.createdAt.localeCompare(a.createdAt) ||
            b.id.localeCompare(a.id),
        ),
      reversals: history.filter((entry) => entry.kind === 'reversal'),
    });
  }
  return { valid: true, purchases: results };
}
