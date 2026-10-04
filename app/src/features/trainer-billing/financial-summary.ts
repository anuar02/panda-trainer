import { projectClientPurchases } from '@/domain/purchases';
import { projectPurchasePayments } from '@/domain/payments';
import type { BillingProjectionScope } from '@/domain/billing';
import type { TrainerBilling } from './types';
import type { TrainerPayments } from '../trainer-payments/types';
import { date } from './validation';

export function projectFinancialSummary(
  billing: TrainerBilling,
  payments: TrainerPayments,
  scope: BillingProjectionScope,
  today: string,
): { remainingUnits: number; dueMinor: string } | null {
  if (!date(today)) return null;
  const credits = projectClientPurchases(billing, scope);
  const money = projectPurchasePayments(billing.purchases, payments, scope);
  if (!credits.valid || !money.valid) return null;
  const remainingUnits = credits.purchases.reduce(
    (sum, row) =>
      sum +
      (row.purchase.expiresOn === null || row.purchase.expiresOn >= today
        ? row.remainingUnits
        : 0),
    0,
  );
  if (!Number.isSafeInteger(remainingUnits)) return null;
  const dueMinor = money.purchases
    .reduce((sum, row) => sum + BigInt(row.dueMinor), 0n)
    .toString();
  return { remainingUnits, dueMinor };
}
export function formatFinancialTotal(minor: string, locale: string) {
  const value = BigInt(minor);
  const whole = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value / 100n);
  const fraction = value % 100n;
  const decimal =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? ',';
  return `${whole}${fraction === 0n ? '' : `${decimal}${fraction.toString().padStart(2, '0')}`} ₸`;
}
