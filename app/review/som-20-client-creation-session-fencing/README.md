# SOM-20 client creation session fencing — 2026-10-04

Branch: `agent/som-20-client-creation-session-fencing`.
Base: fresh `origin/fix/som-50-template-picker`, `ac6d62b` (PR #52).
The base advanced during work; merged template-save session fencing was fetched
and fast-forwarded before final verification. Only merged base commits were used.
No library/template-provider code was changed by this task. ADR number was checked
again on this base and moved from 0085 to 0086.

## Delivered

- Create-specific JWT sub/session_id and caller checks; subscription precedes
  initial auth lookup. Explicit bearer for workspace ownership read and RPC,
  guards before/after dispatch and on error. Same-identity refresh must match
  claims and getSession; malformed claims, silent token change, sign-in,
  logout, actor/workspace change and cancellation fail closed.
- Existing two-argument API retained through an optional expected scope.
  Existing SQL selects the authenticated owner's workspace and stores an
  idempotent actor/workspace/request receipt; receipt workspace is checked.
- Route has actor/session/workspace/auth-generation identity without access
  tokens in new keys. Caller abort on auth invalidation/unmount prevents old
  success from clearing request, retrying reads or releasing another lock.
- Sheet open/close/unmount generations suppress stale success/error/finally;
  synchronous locks block duplicate submission. Layout/text/validation unchanged.
- Unknown outcome and auth cancellation preserve the live caller's name and ID
  for explicit retry; replacement caller starts empty. Pending is in-memory;
  disk/reopen/crash recovery is neither implemented nor claimed.
- Generic sanitized errors, no credentials in new results/errors/storage. No
  SQL/types/deps, auth-provider, other routes, scripts, rules or PNG changes.

## Commands and results

```sh
command -v graft
git fetch origin fix/som-50-template-picker
git merge --ff-only origin/fix/som-50-template-picker
cd app
npx jest --runInBand workspace-client-creation workspace-client-read-routes
npx jest --runInBand workspace-client-creation-sheet
npm run check
cd ..
git diff --check
```

Graft: unavailable (no executable), so graph map/ask/build could not run.
Linear tools: unavailable in this session; live project/issue/dependency/duplicate
reads could not be refreshed. Supplied issue brief and local delivery map used.
No Linear writes, comments, project updates or messages were sent.
Initial fetch succeeded and merge reported already up to date at 290106e.
A later fetch found PR #52; fast-forward to ac6d62b succeeded. The shared ROADMAP
insertion conflict was resolved by retaining both SOM-23 and SOM-20 checkpoints.
Initial focused service/route run: 2 suites / 19 tests passed.
Sheet run: 1 suite / 3 tests passed. Additional service/route regressions were
then added and included in the final full check. Early iterations had TypeScript
optional-index and Jest mock-hoisting failures, corrected before final validation.
Final `cd app && npm run check` on ac6d62b: exit 0; typecheck, lint and
Prettier pass; 180 suites / 2179 tests pass (Jest 21.794 seconds).
Pre-base-update full check also passed: 179 suites / 2148 tests.
`git diff --check`: exit 0. No real runtime/parity result is implied.

Tests exercise relogin before/after RPC, initial auth race, actor/workspace/wrong
claims, verified versus silent/wrong refresh, caller cancellation and late
transport errors, lost-response retry with same ID, route scope replacement,
old finally versus new submit, double submission and sheet close/reopen/unmount.
Existing read tests remain included in the full check.
All fixtures are synthetic; JWT strings are test-only claims, not credentials.

## Limits and acceptance

No Docker/Supabase runtime/browser/native devices: SQL/pgTAP/RLS/concurrency,
live API/auth/JWT verification, real storage/crash/reopen, native accessibility,
parity capture, two-device scenarios and owner acceptance were not checked.
No real client data or paid services used. Existing styles, layout, texts,
validation, prototype and parity specs unchanged; no visual acceptance claimed.
Screens and issue remain subject to owner acceptance.

Architecture: [ADR 0088](../../../docs/app/decisions/0088-client-creation-session-fencing.md).

## Coordinator integration · 04.10.2026

Fresh base a8403a6 (merged PR53) integrated. Client creation ADR renumbered 0088;
financial ADR0086 retained. CI validates the combined head; local check not duplicated.
