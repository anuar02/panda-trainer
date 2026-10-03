# SOM-34 · payment reversals

2026-10-03. Base: `fix/som-50-template-picker`, owner decision `8c03812`,
ADR 0059. Branch: `agent/som-34-payment-reversals`. One agent; Linear unchanged.
This report does not accept the screen.

## Criteria

| Criterion | Evidence / status |
| --- | --- |
| One history row, struck original amount, «Отменена», cancellation date | Implemented and rendered mock tests. `history` keeps original payments; joins validated `reversesEntryId` and exposes reversal `createdAt`. Date displayed in UTC, consistent with existing payment dates. No negative row. |
| Exact debt, bigint, invalid/foreign links | Implemented and domain tests. Existing live `payments` and `reversals` projections preserved; totals use BigInt. Wrong amount, method, paid date, purchase, duplicate and orphan reversal fail closed. Foreign workspace/client rows cannot cancel scoped payments. |
| Explicit confirmation, cancel sends nothing, no second reversal | Implemented and mock UI tests. Required reason is entered explicitly (existing RPC requires it). Shared Row/Button/Field/Sheet layout; module i18n. Reversed rows have no action. |
| Durable scoped recovery and workspace lock | Existing coordinator reused. Reversal stores client/purchase/original string amount with request ID before transport. Receipt must match workspace/client/purchase/original amount and reversal target. Uncertain response retains exact command; restart manually resumes it. Mock storage, hook and coordinator tests cover this; real network replay remains unverified. |
| Refresh after server receipt | Existing coordinator generation refreshes billing and payments. Confirmation waits for success; history status comes from a fresh validated read. Mock tests cover refresh and pending receipt. |
| Account/workspace/client switches | Confirmation subtree keyed by all three identities. Old account callback rejected by provider. Client mismatch disables reversal recovery; the command stays stored for its original client. Account/workspace storage remains isolated. |
| Existing payments/packages regression | Existing assertions unchanged; new tests extend domain and command suites. Full check result below. |
| Owner acceptance | Required; no browser/native captures or owner approval claimed. |

## Implementation notes

Transport/server API, SQL, database types, attendance and credit business logic,
shared UI, Today/profile/journal, picker and prototype were not changed.
The reversal date is `createdAt`, not reversal `paidOn`: existing SQL copies the
original payment's paid date into the reversal. Read-only reference:
`supabase/migrations/20261003110000_payment_commands.sql:42–47`.

New reversal durable snapshots include `clientRecordId`, `purchaseId` and
`amountMinor` as local verification metadata. The existing transport sends only
its existing RPC fields. Earlier unscoped reversal snapshots are rejected as
invalid pending and preserved, never silently migrated or sent under a new
identity. The base had no UI producer of reversal snapshots. New payments and
purchase snapshot formats remain unchanged.

Reference source review: `prototype-fresh/index.html`,
`prototype-fresh/js/screens/trainer.js:847–869`,
`prototype-fresh/js/sheets.js:142–155`,
`prototype-fresh/review/parity/spec-dark.json` and `spec-light.json`.
Existing history row and sheet components/layout reused; no new theme values.
Strikethrough, cancellation date/action and reason confirmation are the approved
functional extension from ADR 0059. Visual comparison remains open.

## Commands and results

Commands run from `/home/node/repo/app`, except git commands from the repo root.

- Initial focused test runs exposed new test fixture expectations (flattened Text styles and exact existing i18n labels); corrected new tests. Existing assertions were not relaxed.
- Initial `npm run check` runs caught receipt-union narrowing errors; fixed with an explicit payment-result type guard.
- Initial lint caught an accidental render-time ref read and unused new test imports; fixed.
- Final `npm run check` (exit 0): typecheck, lint, format and **1232 tests / 126 suites passed**.
- Final `npm run format:check` after documentation updates: passed.
- `git diff --check`: passed (exit 0).

`graft map` could not run: executable and `graft/` graph absent. No graph rebuild
was possible. Live Linear project/issue reads unavailable through installed
tools; task scope/status came from the owner's brief and repository. No Linear
writes/comments/messages were made.

## Reproducible runtime scenarios (not executed in this container)

Use only synthetic fixtures with an owner account and its workspace/client.

1. Open «Оплаты» for a package with a partial payment. Open «Отменить оплату»,
   enter a reason and choose «Отмена»: verify no RPC and unchanged debt/history.
2. Confirm the same payment. Verify one reversal server row referencing its
   original ID, one original history row with strikethrough/«Отменена»/creation
   date, increased debt and unchanged attendance/credit ledger. Check both
   themes at 390×844, large text, screen reader and native sheet gestures.
3. Double-tap confirmation while delaying the response. Verify one stored
   request ID and one coordinator submission; another workspace mutation is
   blocked. Do not show cancellation until receipt and fresh history read.
4. Drop the response after server commit, restart the app, return to the same
   client and choose «Повторить сохранённую операцию». Compare exact request ID,
   target and reason; server returns original receipt, no second reversal.
5. Switch client with a pending reversal: recovery is disabled. Return to the
   original client to resume. Switch workspace/account before replay: the old
   command is not submitted for the new scope. Delay completion through switch
   and verify no old confirmation/data appears.
6. Exercise request/storage failures, definitive invalid-state/conflict,
   mismatched receipts and invalid history links. Preserve uncertain recovery,
   show error instead of success, never infer zero debt from missing data.
7. Re-run ordinary new/partial payment and package creation, including capped
   amount rejection and exact retry; compare attendance/credit ledger snapshots.

Not verified: fresh pgTAP/SQL concurrency, Supabase/Docker, real network replay,
browser or native runtime/visual parity, all-platform export, keyboard/gestures,
screen reader, owner acceptance. Mock tests establish local invariants only.
