# SOM-33: real schedule attendance and recovery

Date: 2026-10-03. Branch: `fix/som-50-template-picker`.
This package is implementation progress; SOM-33 and screen acceptance stay open.

## Delivered

- Real participant mark/no-show, optional charge, alternate eligible package,
  late binding, correction with public reason, and separate cancellation/no-show
  penalty with public reason. Standalone cancelled booking charges render correctly.
- Validated scoped credit projections; inclusive scheduled-date package eligibility.
- Durable exact command storage before RPC, account/workspace scope, stale result
  suppression and schedule-wide write locks. Unknown outcomes survive reload.
- Invalid ledger reads/storage expose safe retry; no fabricated unmarked state.

## Automated checks

`app: npm run check`: **1065 tests / 112 suites**, strict typecheck, lint and format.
New coverage: 8 projection, 11 command/storage/hook, 6 controlled UI and 3 schedule
integration tests. `npm run export`: web/iOS/Android pass.
Schema unchanged in this package; preceding foundation verified 686 pgTAP assertions
in 20 files and attendance concurrency independently.

Final default schedule parity: `SCREENS=t-schedule node scripts/parity.mjs` with
output here under `parity/generated`: **6 reference + 6 app captures**, no missing
comparisons or browser errors, 390×844@2x. `accepted: false`. These cover preserved
default schedule scenarios/themes, not approval of production attendance sheets.
Mint charge notice uses prototype specs (padding 13/15, gap 11, radius 18,
14/21 medium font, check 18, exact dark/light mint colours).

## Synthetic local browser and database evidence

Headless isolated CLI browser against local exported app and isolated Supabase;
new synthetic trainer, two group participants and a two-unit package expiring on
scheduled day. No real client data or external service writes.

1. Presence with charge: intercepted first real successful `mark_attended` response
   and aborted delivery. Recovery blocked new writes and survived page reload.
2. Resume repeated JSON payload/request ID exactly. Database: balance 1, exactly
   one consume entry, present status; group peer had no attendance.
3. Correction: empty reason disabled, explicit reason submitted. Database: balance
   2, exactly one restore, undone status.
4. No-show: database balance remained 2, status `noshow`, cycle 2.
5. Separate penalty: empty reason disabled, explicit reason submitted. Database:
   balance 1, exactly one `charge_late_cancel`, status still `noshow`, cycle 2.

Expected injected `ERR_FAILED` and a local server favicon 404 are diagnostic noise;
no default parity browser errors. Runtime screenshots do not constitute owner or
native approval. Synthetic fixtures and temporary auth state are removed after checks.

## Remaining

Production purchase creation and client package data, payment RPC/debt/overpayment
owner decision, Today integration, Android/iOS behavior and owner screen acceptance.
Live Linear unavailable; no remote state changes or comments sent.
