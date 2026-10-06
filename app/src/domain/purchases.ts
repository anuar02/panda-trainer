import {
  projectPurchaseBalances,
  type BillingProjectionScope,
} from './billing';
import type {
  BillingPurchase,
  TrainerBilling,
} from '../features/trainer-billing/types';

export type ClientPurchaseProjection = {
  valid: boolean;
  purchases: {
    purchase: BillingPurchase;
    remainingUnits: number;
    usedUnits: number;
  }[];
};

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const money = (value: string) =>
  /^(0|[1-9]\d*)$/.test(value) &&
  (value.length < 19 ||
    (value.length === 19 && value <= '9223372036854775807'));

export function projectClientPurchases(
  data: TrainerBilling,
  scope: BillingProjectionScope,
): ClientPurchaseProjection {
  if (!uuid(scope.workspaceId) || !uuid(scope.clientRecordId))
    return { valid: false, purchases: [] };
  const balances = projectPurchaseBalances(data, scope);
  const ids = new Set(
    balances.map(({ purchase }) => purchase.id.toLowerCase()),
  );
  const orphan = data.credits.some(
    (entry) =>
      entry.workspaceId.toLowerCase() === scope.workspaceId.toLowerCase() &&
      entry.clientRecordId.toLowerCase() ===
        scope.clientRecordId.toLowerCase() &&
      !ids.has(entry.purchaseId.toLowerCase()),
  );
  if (
    orphan ||
    balances.some(
      ({ purchase, valid }) =>
        !valid || purchase.currency !== 'KZT' || !money(purchase.priceMinor),
    )
  )
    return { valid: false, purchases: [] };
  return {
    valid: true,
    purchases: balances.map(({ purchase, remainingUnits }) => ({
      purchase,
      remainingUnits,
      usedUnits: purchase.units - remainingUnits,
    })),
  };
}

export function formatPurchaseMoney(priceMinor: string, locale = 'ru-RU') {
  if (!money(priceMinor)) throw new RangeError('Invalid minor money');
  const minor = BigInt(priceMinor);
  const whole = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(minor / BigInt(100));
  const fraction = minor % BigInt(100);
  const decimal =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? ',';
  return `${whole}${fraction === BigInt(0) ? '' : `${decimal}${fraction.toString().padStart(2, '0')}`} ₸`;
}

export function formatPurchaseExpiry(expiresOn: string, locale = 'ru-RU') {
  const date = new Date(`${expiresOn}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== expiresOn
  )
    throw new RangeError('Invalid expiry date');
  const formatted = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
  return /^ru(?:-|$)/i.test(locale) ? formatted.replace(/\./g, '') : formatted;
}
