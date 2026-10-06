# ADR 0054: Immutable manual payment history

Date: 2026-10-03. Status: accepted; independent schema verified.

## Scope

SOM-34 follows the verified SOM-33 attendance ledger. Payment history is separate
from session credits: money never changes attendance, units or booking eligibility.
Each payment belongs to one exact purchase, client and workspace. The payment
sheet originates from a purchase card; purchase targeting follows DATA-MODEL.

## Approach

Append positive payments and negative compensating reversals to payment_entries.
A correction cancels one original payment in full; its exact purchase, method,
currency and amount are preserved, with a required public reason. A unique link
prevents reversing the same entry twice. Existing entries cannot change or disappear.
Money uses bigint minor units and KZT. The supported manual methods reproduce
the prototype: Kaspi, Перевод and Наличные. Reads expose safe product columns
through owner or exact linked-client RLS; actor IDs remain private. Authenticated
direct writes are revoked.

The schema can be verified independently of the unanswered overpayment policy.
No payment RPC, debt calculation or production payment action is accepted yet.
The owner question and dependent work remain in OPEN-QUESTIONS.

## Verification

A fresh isolated reset passes 686 pgTAP assertions across 20 files, including
26 payment constraint and isolation assertions. Schema lint, generated type
comparison and strict app typecheck pass. Payment command concurrency and
production actions remain unimplemented until the overpayment policy is answered.
See the SOM-34 manual payment foundation review for reproducible evidence.
