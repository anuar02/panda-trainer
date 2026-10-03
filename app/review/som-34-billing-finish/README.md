# SOM-33/SOM-34 · billing finish

Date: 2026-10-03. Continued from WIP `4704f31`, on
`agent/som-34-billing-finish`. This report does not accept any screen.

## Acceptance criteria

| Criterion                                                       | Result                                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict existence checks for indexed mock calls/buttons          | Done; explicit guards, no `!` or `any`                                                                                                                         |
| Full `cd app && npm run check` green                            | Blocked: existing `src/ui/button.tsx:83` rejects excess `hovered` property (TS2353). Shared UI is explicitly excluded from this task, so it was left unchanged |
| Payment history source review against prototype                 | Done; wallet lead, amount title, weekday/date/method/note, «Записано», «К оплате X ₸» / «Оплачено»; payment read retry repaired                                |
| Lossless money, account/workspace isolation, exact replay audit | Done at source/unit level; SQL reviewed read-only, no new database/runtime validation                                                                          |
| CHANGELOG, ROADMAP, ADR 0059                                    | Updated; implementation status and validation gaps explicit                                                                                                    |
| Form/screen visual acceptance                                   | Requires owner approval; no comparison captures or native checks in container                                                                                  |

## Commands and results

All application commands below run from `/home/node/repo/app`.

- `npm test -- --runTestsByPath tests/trainer-billing-commands.test.ts tests/workspace-client-purchases-route.test.tsx`: 16 tests / 2 suites passed.
- `npx jest --runInBand tests/payment-sheet.test.tsx tests/trainer-payments-service.test.ts tests/trainer-payments-commands.test.ts`: 81 tests / 3 suites passed.
- `npx jest --runInBand tests/trainer-billing-command-snapshot.test.ts tests/payments-domain.test.ts tests/trainer-billing-hooks.test.ts tests/trainer-billing-service.test.ts tests/trainer-billing-purchases-panel.test.tsx`: 73 tests / 5 suites passed.
- `npm run check`: failed at typecheck, TS2353 in `src/ui/button.tsx:83`; same error on final rerun. The task's indexed-test type errors are resolved. No other type errors were reported.
- `npm run lint && npm run format:check && npm test`: passed after final code edits, **1210 tests / 123 suites**. An earlier lint run caught the original literal separator in history; the final history metadata uses i18n.
- `git diff --check`: passed before commit.

## Money and isolation review

`trainer-payments/service.ts` selects explicit safe columns with
`amount_minor::text`; every page uses the captured Bearer token and checks
expected account/workspace/client IDs. Command transport preserves string money
and rejects mismatched/unsafe receipts. Domain totals and decimal form parsers
use `BigInt`; no floating-point conversion of money was introduced. Tests cover
amounts above `Number.MAX_SAFE_INTEGER`, invalid amounts, account changes and
receipt mismatch.

`trainer-billing/commands.ts` saves the exact command before sending and retains
it after an uncertain response. Replay uses the original request ID and amount;
definitive overpayment clears it so a corrected payment can be entered. Scoped
storage/coordinator prevents cross-account/workspace replay and concurrent new
commands. Fixed snapshot normalization so UUID-shaped titles/reasons retain
case; only identifier keys normalize. Regression tests cover this defect.

Read-only review of `20261003110000_payment_commands.sql:3–58` confirms owner
workspace/purchase checks, workspace and purchase row locks, a positive capped
payment, exact receipt replay before debt validation, and text money in receipts.
Payment inserts affect the payment ledger, not attendance/credits. Existing
attendance rules restore charged credits once and use inclusive scheduled-date
expiry in the workspace timezone. Migrations/schema were not edited.

## Prototype comparison and remaining gaps

Reference: `prototype-fresh/index.html`, `js/screens/trainer.js:847–869`,
`js/sheets.js:142–155`, `js/data.js:693–697`, and parity specifications.

History row structure, statuses, canonical methods and date metadata were
reviewed against source and repaired. Empty/error history keeps padded card
layout; valid rows use the prototype row structure. Sheet now includes the
save check icon and bottom ghost «Отмена». Invalid supplied dates show feedback.
The payment amount input remains 64px as plain `.field` in payment CSS; the
50px generic spec hit is from `t-invite`, not a scoped payment measurement.

Current rendered history lists only unreversed payments. Immutable originals
and reversal receipts remain on the server. The prototype has no reversal UI;
OPEN-QUESTIONS and UI-PARITY record this pending owner decision. Full immutable
history in the UI is not claimed.

Package creation and positive capped payments are owner-approved functional
differences (ADR 0059); their visual appearance still requires owner approval.
No new PNGs were created or committed.

**Не проверено в контейнере:** SQL/pgTAP, concurrency execution, local Supabase,
browser scenarios/captures, iOS/Android, large text, keyboard/sheet gestures,
all-platform export and generated database type drift. Docker, local Supabase,
browser fixtures and Playwright are absent; these checks were not attempted.
The owner's task brief reports the existing migration/test suite passed locally
with **723 pgTAP checks and concurrency scenarios**. This is prior owner evidence,
not a fresh result from this container.

Live Linear project and SOM-33/SOM-34 descriptions/relations were read. Both are
Backlog; SOM-33 depends on SOM-25, SOM-34 on SOM-33 and blocks SOM-47/SOM-36.
Neither issue reports a duplicate. No Linear records/comments/messages changed.
`graft` executable and graph were absent, so graph queries/build were unavailable.
