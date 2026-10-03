# ADR 0059: Package creation and payments capped at debt

Date: 2026-10-03. Status: owner-approved product decisions; implementation delivered; worker check initially blocked by shared UI typecheck, coordinator integration validation recorded in the review; visual/native acceptance pending.

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
lossless minor-unit money.

## Implementation and validation

Package creation, capped payment commands, exact string/BigInt money, scoped
reads and durable command replay are implemented in the WIP base and completed
by this follow-up. History rows follow the prototype amount/date/method/status
structure; read failures offer retry. Command snapshots normalize identifiers
without changing UUID-shaped titles or reasons.

Container evidence: [billing finish review](../../../app/review/som-34-billing-finish/README.md).
Full `npm run check` remains blocked by the existing excess `hovered` property in
`app/src/ui/button.tsx:83`; shared UI is outside this task's authorized scope.
SQL and browser scenarios were not run in the container. The owner reported
723 pgTAP checks and concurrency scenarios passing before this continuation;
that report is prior evidence, not a fresh container result.

Visual/native comparison and owner approval remain open. Display of reversed
payments/reversal receipts is not defined by the prototype; the current UI
shows unreversed payments and preserves the immutable server ledger.

Coordinator merged PR #21 into the billing branch: full `npm run check` now
passes, 1213 tests / 124 suites plus typecheck, lint and formatting. The earlier
worker failure is historical. Native/visual and SQL/browser limitations remain.

## Owner decision 03.10.2026: reversed payments

- A reversed payment stays in the client's payment history as one row: the
  amount is struck through and the row shows the status «Отменена» with the
  reversal date. No separate reversal row. Debt is calculated without it.
- The trainer can reverse a mistaken payment from the app: a «Отменить оплату»
  action on the payment row, with a confirmation step, using the existing
  `reverse_client_payment` command. Debt is recalculated after the reversal.
- This is a known difference from the prototype (it does not define reversals);
  its appearance still requires owner acceptance.

## Reversal implementation follow-up 03.10.2026

Implemented the owner decision above. History retains each original payment
with its validated reversal creation timestamp, one row and a struck amount;
only active payments contribute to paid/debt totals. Original `paidOn` remains
payment metadata; cancellation date uses reversal `createdAt` in UTC.

Confirmation uses existing Row/Sheet/Button/Field layout and asks for the reason
required by `reverseClientPayment`. Cancel sends nothing. Existing shared
workspace coordinator locks submissions and stores the exact command before RPC.
New reversal snapshots also persist client, purchase and original string amount
for receipt validation and client-scoped recovery. Old reversal snapshots without
this metadata remain preserved as invalid pending; they are not inferred or
replayed. Payment/purchase snapshot formats and all server APIs are unchanged.
Account/workspace/client changes reset confirmation; client mismatch disables
replay, account/workspace scopes retain separate storage. Success refreshes both
reads via coordinator generation and does not optimistically mark cancellation.

Full `npm run check` passed: 1232 tests / 126 suites, typecheck/lint/format.
Local check and mock evidence: [reversal review](../../../app/review/som-34-payment-reversals/README.md).
Earlier paragraphs describing unreversed-only UI and worker typecheck failure
are historical billing-finish evidence. This follow-up implements history/actions;
SQL/network/native/browser and owner visual acceptance remain unverified here.
