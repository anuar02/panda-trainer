# SOM-34 · Production purchase, payment, debt and reversal flow

04.10.2026. One agent, synthetic fixtures only. Branch
`agent/05-som-34-billing-production-finish`; PR base only
`fix/som-50-template-picker`. Screen/issue acceptance belongs to the owner;
SOM-47 is outside this package.

## Context and base

Read root/app AGENTS, Linear guide/workflow, README, CONVENTIONS, ROADMAP current
checkpoint, PROJECT-MEMORY, UI-PARITY/ADR0007, DELIVERY-PLAN, OPEN-QUESTIONS,
DATA-MODEL, prototype guide/index and financial ADR0053/0054/0055/0057/0059/0077/
0086/0066 plus PR53 review. Live Linear project and SOM-34 read with relations:
In Progress, no duplicateOf; SOM-33 dependency, SOM-47/SOM-36 blocked by SOM-34.
No issue creation, status update, comment, project update or message to people.

`command -v graft` returned no CLI; `graft/` and `graft/INDEX.md` do not exist.
Map/ask/build unavailable, so used scoped feature/test/contract paths.

Started at `8feff49`. SOM-26 production PR57 was merged; SOM-27 production PR62
was initially open and not consumed. After PR62 merged with green app/database
CI, task changes were stashed, fresh base fast-forwarded to `cbd99c9`, then restored
without conflicts. No unmerged foreign branches used. PR43/PR53 contracts retained.

## Delivered / criteria

- **Done in code + synthetic tests:** actual financial reads feed client header,
  purchases, remaining units, debt and immutable payment history. Header sessions
  exclude expired packages (expiry inclusive), debt includes them. Same title
  purchases are keyed and targeted by ID. Neighbour client/workspace rows do not
  enter the scoped projection. Integer minor strings/BigInt throughout money;
  multi-purchase totals can exceed a single bigint without precision loss.
- **Done in code + synthetic tests:** create allowed package → partial manual pay
  → remaining debt → full pay → explicit reason/confirmation reversal → restored
  debt → reload. Reversal displays one struck original row, status and date.
  Payment date/method/manual source survive app reads; server author/date assertions
  added in SQL. Money operations leave session grants/attendance untouched.
- **Done in code + synthetic tests:** current-debt overpayment appears under the
  amount field after refresh. Refresh/read errors display unknown metrics and
  error/retry, never fabricated paid/zero balance or optimistic receipt totals.
- **Done in code + synthetic tests:** actor/workspace/client/session/generation/
  form selection are fixed before async. Dismiss invalidates its form epoch before
  parent close. Layout cleanup and IDs prevent late results/errors/finally from
  closing or changing a fresh form after relogin, switch, unmount or close/reopen.
  Normal verified refresh keeps current fields and completion. Generation clears
  selection/drafts, except a terminal overpayment keeps its purchase IDs for a
  fresh error-bearing form. Old fields/busy/failure do not survive.
- **Done in code + synthetic tests:** lost response/offline/reopen/retry use the
  existing durable canonical command/requestId. Read/clear failures retain safe
  recovery; double tap sends one attempt. Foreign-client purchase/payment/reversal
  pending cannot resume from this card. PR53 fences, terminal policy, conditional
  clear/recovery are unchanged; dismissal/relogin never delete uncertain commands.
- **Added, not locally executed:** independent pgTAP create/pay/reverse/reload,
  expired debt, same-title isolation, author/date, receipt replay and forced
  receipt-failure rollback. Existing rights/overpayment/reversal/concurrency
  contracts reviewed. No migration/schema/API change was necessary.
- **Requires owner:** visual/native acceptance of client header, billing and all
  sheets; full issue readiness. No screen or issue declared accepted.

## Scope / integration

Changes live in trainer-billing/trainer-payments UI and additive financial helpers,
financial tests/review/minimal docs. Existing financial service/storage/hooks,
workspace mutation provider, scheduling callers and all migrations are unchanged.

The merged base provided billingContent but still rendered hardcoded unknown
header metrics. The only workspace-clients screen change is an optional
financialContent ReactNode slot around that existing block; the client route
supplies ClientFinancialMetrics. No client/onboarding business logic is changed.
This minimal seam extension makes real header totals possible without inserting
financial rules into clients. It reuses existing prototype metric styles and
existing i18n labels; no redesign, new PNG, dependency, token storage or secret.
[ADR 0094](../../../docs/app/decisions/0094-financial-presentation-and-client-totals.md).

## Commands and results

Commands from repository root unless `cd app` is shown.

| Command | Result |
| --- | --- |
| `command -v graft`; graph directory lookup | unavailable; documented above |
| `git fetch origin fix/som-50-template-picker`; `git merge --ff-only origin/fix/som-50-template-picker` | merged fresh `cbd99c9` base after PR62 |
| `cd app && npm test -- --runTestsByPath tests/payment-sheet.test.tsx tests/purchase-create-sheet.test.tsx tests/payment-reversal-controls.test.tsx tests/financial-billing-workflow.test.tsx tests/financial-summary.test.ts tests/workspace-client-purchases-route.test.tsx --silent` | 6 suites / 55 tests passed before last dismissal regressions |
| `cd app && npm test -- --runTestsByPath tests/payment-reversal-controls.test.tsx --silent` | 14 tests passed, including busy-dismiss and foreign-client pending regressions |
| `cd app && npm run check` | type/lint/format green; initial 212 suites / 2787 tests, final 212 suites / 2790 tests passed |

Initial targeted failures were fixture setup: native QuickBase64 import required
mock auth boundary, and integration selectors needed actual i18n labels. Header
addition required route assertion to count header + purchase price. First lint
found render-time ref/effect state reset and invalid test hook name; replaced with
conditional generation reset and committed lifecycle refs. These failures were
corrected; they are not claimed as SQL or native execution evidence.

`financial-billing-workflow.test.tsx` uses real reads, read hooks, command hook,
services, durable storage helpers, controlled panel and sheets. Only auth, network,
storage, clock, sheet host and mutation context are synthetic. Its receipt adapter
models SQL-shaped responses and exact request replay; it is **not a PostgreSQL
runtime or server idempotency proof**. Existing PR43/PR53/provider tests remain in
full check. Controller tests separately cover old true/false completion after
fresh same-user forms, verified refresh, all form generation resets and busy
reversal dismissal. Summary tests cover inclusive expiry, invalid projection/date
and an aggregate above PostgreSQL bigint.

## SQL handoff · needs-local-db

No Docker/Supabase database available locally. New file:
`supabase/tests/database/billing_production_workflow.test.sql`.
The test reads whole protected rows only after reset role. Forced receipt trigger
and its pg_temp function exist only within the rolled-back test transaction.
No persistent SQL objects; database.types.ts requires no schema update.

Existing contracts inspected:
`supabase/tests/database/payment_commands.test.sql`, `manual_payments.test.sql`,
`attendance_credit_ledger.test.sql`, payment migration and
`supabase/tests/payment_command_concurrency.py`. Existing concurrency runner
asserts workspace-lock blocking, competing capped payments, concurrent identical
receipt replay, competing reversals and payment/reversal order, with unchanged
session units. The current app.yml database job runs pgTAP and attendance
concurrency but does not invoke payment_command_concurrency.py; do not count
that payment runner as executed by this PR's standard CI. Claude must run the
explicit command below; CI workflow/scripts are outside this package's scope.
Existing payment pgTAP covers rights, bigint boundaries,
canonical receipts, changed payloads, double reversal and immutable history.

Claude/CI should execute the repository's existing isolated database workflow:

```sh
supabase db lint --local --fail-on warning --workdir .
supabase test db --workdir .
cd app && npm run db:types:check
```

Then the existing payment concurrency runner against that isolated container:
`python3 supabase/tests/payment_command_concurrency.py --container <isolated-db-container>`.
No local pass claimed for any of these commands. Keep gate **needs-local-db**.

## Not verified / owner approval

- Live Supabase Auth/session refresh, JWT authorization/RLS and real RPC/network.
- SQL/pgTAP/concurrency/new rollback test locally; CI must execute them.
- Real AsyncStorage, offline process death/crash/reopen and clear recovery on a
  native device. Existing single-JS-runtime serialization is not cross-process CAS.
- Two physical devices or real client data; no paid service used.
- Browser/native parity, light/dark screenshots, keyboard, large fonts, screen
  reader and motion. Source layout inspection is not a visual comparison.
  Reference: prototype-fresh default trainer client header at trainer.js:793–813,
  billing history at 861–869, payment sheet and spec-dark/spec-light tokens.
- Owner approval of screens/SOM-34; SOM-47 remains outside this work.

## Final local verification

- `cd app && npm run check`: 212 suites / 2790 tests, typecheck, lint with zero
  warnings and formatting passed on merged base `cbd99c9`.
- `git diff --check`: passed.
- Source-only comparison: existing metric padding/gaps/font sizes preserved;
  warning text matches spec-dark `#f5c451` and spec-light `#85560a`.
- SQL runtime gate remains needs-local-db; no database result substituted with
  synthetic receipt output. No new migration or generated schema object.
