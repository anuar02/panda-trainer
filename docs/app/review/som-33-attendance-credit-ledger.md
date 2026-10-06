# SOM-33: attendance credit ledger evidence

Date: 2026-10-03. Scope: server foundation; [ADR 0053](../decisions/0053-attendance-credit-ledger.md).

## Delivered contract

Migration `supabase/migrations/20261003090000_attendance_credit_ledger.sql`
implements immutable purchases, current attendance with revision/cycle, append-only
attendance history and signed session credits. Six owner-only commands use the
workspace lock and actor-scoped private receipts. Exact retries return the original
result before checking mutable state; changed payloads reject reuse.

Owner decisions: correction restores the charged session once; expiry uses the
session's scheduled date in workspace timezone, including the expiry day. Automatic
selection chooses nearest expiry, with stable creation/id ordering and no-expiry
last. Attendance without debit and later binding preserve nonnegative balances.
No-show/cancellation never debit automatically. Explicit penalties require a public
reason, do not create attendance and cannot coexist with an unreversed attendance
debit. Correcting a charged no-show restores its linked cycle debit.

RLS limits reads to the owner or exact linked client. Column grants hide actor IDs;
private receipts and direct writes are inaccessible. Composite FKs enforce tenant,
client, booking and purchase relationships. Ledger/history mutation is rejected.

## Verification

All results below are fresh checks against the final schema in the disposable
`trainerApp-som18` stack; no cloud project or real client data was used.

| Check | Result |
| --- | --- |
| Clean reset with migrations and seed | Pass |
| Full `supabase test db` | 660 assertions, 19 files; pass |
| `attendance_credit_concurrency.py` | Six concurrent scenarios; pass |
| `supabase db lint --local --fail-on warning` | No schema errors; pass |
| `npm run db:types:check` with isolated `SUPABASE_WORKDIR` | Pass |
| `npm run check` under Node 22 | 991 tests, 107 suites; typecheck/lint/format pass |

The concurrency runner uses two transactions and observes lock waiting; it covers
last-credit contention, exact retries, bind contention and correction/re-mark races.
The pgTAP suite covers expiry, safe-column access, tenant isolation, request reuse,
revisions, immutable history and null/composite-FK constraints. CI runs the new
concurrency runner and the existing booking-request-resolution runner.

The first post-reset CLI connection timed out during restart; a readiness retry
passed. A type check against the default stack was rerun with the correct isolated
workdir. These transient failures are not reported as successful initial runs.

## Remaining work

- SOM-34 payment entries, reversals, debt and billing integration.
- Attendance/purchase app transport and prototype screen comparisons.
- Owner/native acceptance and two authorized phones; no new screen acceptance claimed.
- Standalone cancelled-booking penalty reversal is not implemented.
- Live Linear was unavailable; remote records/statuses were not synchronized.

Technical evidence lives in the repository. This document does not imply a push,
merge, release or remote CI run.
