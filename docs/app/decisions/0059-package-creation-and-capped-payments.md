# ADR 0059: Package creation and payments capped at debt

Date: 2026-10-03. Status: owner-approved product decisions; implementation pending.

## Decisions

The owner approved limiting each payment to the remaining debt of its exact
package. Partial payments reduce debt without changing attendance or session
credits. Overpayments are rejected; no hidden credit or negative debt is created.
The form displays an error under the amount field, such as
«Больше долга по пакету (X ₸)». The server must enforce the same limit while
serializing concurrent payments. Exact retries return their original receipt.

The owner approved «Добавить пакет» in the client's «Оплаты» tab. Its bottom
sheet follows the existing «Записать оплату» layout and contains package name,
session count, total price in KZT and optional expiry date. The prototype has no
creation form; this is an explicitly approved functional difference. Its visual
comparison still requires owner approval.

## Scope

Payments remain separate from the immutable session credit ledger. Creation uses
the existing owner-only purchase command. Payment and full reversal commands
must preserve exact package ownership, immutable history, scoped recovery and
lossless minor-unit money. Implementation evidence will be recorded separately.
