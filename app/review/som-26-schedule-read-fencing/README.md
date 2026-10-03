# SOM-26 · Schedule read validation and session fencing

Verified 2026-10-03 on `agent/som-26-schedule-read-fencing`, based on
`fix/som-50-template-picker` at `96db40a`. Synthetic fixtures only.

## Delivered

- Runtime validation for workspace availability/owner, bookings, client records,
  immutable program names and proposal RPC payloads. Scope, canonical UUIDs,
  int4 revisions, enums, valid UTC/calendar values, intervals, timezone, working
  days and minute-based working hours fail closed. Malformed/foreign/duplicate
  or unrelated rows never become an empty schedule/free window.
- One authorization token pinned in the header of every table/RPC request.
  Mandatory current-session checks before/after each request and before return.
  Expected actor and workspace owner must agree. A valid JWT session_id matching
  the authenticated subject distinguishes refresh from a new login. Missing or
  unknown identity fails closed. Auth events invalidate new login/logout even
  for the same account/token. Credentials are absent from the returned snapshot,
  hook keys, error messages and logs.
- Bookings and all-time proposals use stable paging: 500 rows/page, at most
  20 pages/collection. A full last allowed page raises readLimit, including an
  exact 10000-row result whose completeness cannot be proven within the budget.
  Related rows use bounded 200-ID batches. All valid pages and proposals outside
  the selected week are preserved; partial success is forbidden.
- Existing typed read seam used by Today/week/create is preserved. Auth trust,
  session identity, scope, retries, focus and unmount fence visible state and late
  completions. Creation/status/proposal commands and screen layouts unchanged.
- Existing synthetic working-day/timezone/free-window and mini-group tests pass.

Decision and limits: [ADR 0075](../../../docs/app/decisions/0075-session-fenced-schedule-read.md).
This is an authorization fence, not a transactional snapshot of all tables;
concurrent row changes may require retry.

## Commands and results

```sh
cd app
npx jest --runInBand tests/workspace-scheduling.test.ts tests/workspace-schedule-read.test.ts tests/workspace-schedule-hook.test.tsx tests/workspace-schedule-read-session.test.ts tests/workspace-schedule-read-controller.test.ts
npm run check
```

- Integration checkpoint: five scoped suites, 82/82 tests passed. The final
  independent read suite grew from 48 to 55 cases after header/refresh, logout,
  user switch, proposal limit and canonical UUID review.
- Final `npm run check`: exit 0; TypeScript, ESLint (zero warnings), Prettier and
  **1636 tests / 154 suites** passed, zero snapshots.
- `git diff --check`: exit 0. Changed application code has no comments or any.
  No PNGs, dependencies, schema/database types, scripts or auth-provider changes.
- Legacy paging fixture now uses distinct bookings for 501 pending proposals,
  matching the existing SQL one-pending-proposal-per-booking constraint.

Tests inject malformed and foreign rows after selection, so query filters alone
cannot hide invalid payloads. The authorization test checks every request header
against the original token while getSession changes to a refreshed token. Paging
covers 501 bookings and 502 proposals with an outside-week supplemental booking,
malformed/duplicate subsequent pages, collection limits, missing/unrelated rows,
logout, different actor and same-account session change between pages. Hook and
controller tests cover late success/failure, retry, blur/unmount, workspace/week
switches, new login, verified refresh and unavailable auth trust.

## Not verified / acceptance

Docker/Supabase/browser/devices are unavailable. SQL, pgTAP, RLS, live API,
generated-type drift, real auth refresh/logout, native runtime, two devices,
visual parity and owner acceptance were not run or confirmed. Old runtime claims
in `../workspace-scheduling/README.md` are historical, not new evidence here.
Screens are accepted only by the owner; SOM-26/SOM-45 remain open.

Linear project/issue, relations and discussion were read without writes. The
live issue remains In Progress, SOM-25 is In Review, and SOM-45 depends on SOM-26.
No issue, comment, project update or human message was written. Graft binary/graph
and `tools/codex-agents/SUBAGENTS.md` are absent in this checkout; the user-provided
ownership and delegation rules were applied directly.
