import type { BillingScope } from '../trainer-billing/types';

export type PaymentScope = BillingScope;
export type TrainerPaymentsErrorCode =
  'configuration' | 'invalidInput' | 'unavailable' | 'request';
export class TrainerPaymentsError extends Error {
  constructor(readonly code: TrainerPaymentsErrorCode) {
    super(code);
    this.name = 'TrainerPaymentsError';
  }
}
export type PaymentEntry = {
  id: string;
  workspaceId: string;
  clientRecordId: string;
  purchaseId: string;
  kind: 'payment' | 'reversal';
  amountMinor: string;
  currency: 'KZT';
  paidOn: string;
  method: 'Kaspi' | 'Перевод' | 'Наличные';
  source: 'manual';
  reason: string | null;
  reversesEntryId: string | null;
  createdAt: string;
};
export type TrainerPayments = { entries: PaymentEntry[] };
