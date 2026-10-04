# SOM-26 · Trainer scheduling production lifecycle

Date: 2026-10-04. Branch: `agent/03-som-26-schedule-production-finish`.
Base at start: fetched `origin/fix/som-50-template-picker`, `a8403a6`, including PR41/PR50.
Final integration: merged refreshed base `4c20e22` (SOM-20/PR55) without conflicts.
Draft PR: [#57](https://github.com/anuar02/panda-trainer/pull/57).
One agent; no unmerged work from other accounts, new transport package, schema,
status/proposal storage, billing implementation, prototype or cloud changes.

## Context and reproduced defects

`command -v graft` returned exit 1; neither the executable nor `graft/` graph is
present. Graph queries/build could not run; scoped source inspection was used.
Read repository/app instructions, workflow, memory/parity, roadmap, data model,
ADR 0007/0059/0061/0064/0066 and existing read/create contracts.
Read-only Linear refresh: project `776db647-e846-4a27-99cb-2ade5be400bf`, SOM-26
In Progress (no duplicate), SOM-25 In Review. The live Today search returned
SOM-26 plus acceptance issues SOM-45/SOM-17; no separate duplicate implementation
was found. The supplied brief controls this remaining scope. No Linear writes.

1. Before the provider fix, the new same-user-login test failed waiting for a new
   unlocked provider: old `running` survived login and kept `blocked=true`.
   It now proves late old completion cannot release a new operation's lock,
   advance its generation or invoke a captured command callback.
2. The overlap/acknowledgement screen test exposed a fast-result batching seam:
   manually setting `latest.blocked=true` could survive completed running state
   updates. Provider locking now relies on its synchronous owned token and
   React-derived domain busy/blocked state, so acknowledgement can save again.
3. Before the narrow session-controls fix, the recovery callback test recorded
   an unexpected `/workspace/new` push after Today unmounted while its shared
   provider survived. This is the reason `workspace-session-controls.tsx` has a
   minimal compatible route-callback guard; status/proposal behavior is unchanged.
4. Week's default date was computed from a one-time `new Date`/state initializer.
   It now follows the existing workspace clock at day/week rollover. Explicit
   date selection is retained. A fresh Today route selection on the same date
   and changed create entry parameters remount the corresponding presentation.

## Delivered behavior and evidence

| Brief criterion | Technical result | Acceptance |
| --- | --- | --- |
| Today chronology/current/upcoming/past and requests; week windows and both create entries | Existing adapters/presentation retained; fresh day/week and route selections; screen entry regressions and existing chronology/window/out-of-week request tests pass | Native/visual approval pending |
| Atomic create, overlap acknowledgement, selected group plan, UTC/revision, exact durable retry | Existing PR50 service/pending/RPC used unchanged; actual editor checks participant/template revision; real create/pending hooks plus synthetic RPC prove the identical group request is retried after a lost response | SQL runtime and real crash/reopen pending |
| Actor/workspace/login/generation, selections/sheets/callbacks/locks | Provider consumes existing login fence, synchronously invalidates auth events and remounts by opaque epoch; caller read/mutation/focus guards and create focus epoch; no bearer/session claims in React keys or results | Live Auth pending |
| Refresh generation and late result/error/finally isolation | Real read hooks wait for a server response after create; late completions cannot navigate/unlock a different lifecycle; failed verification and failed refresh offer translated retry | Real network/native pending |
| Independent screen/provider/service regressions; existing billing/status/proposal policy | Five targeted suites plus the full check; existing guarded read/create services and SQL regressions retained; no payment/attendance/booking-status conflation | Two phones and owner approval pending |

The integration suite mounts real Today/week orchestration, mutation provider,
read hook, creation hook, creation operation and durable pending API. RPC, read
transport, Auth and AsyncStorage are synthetic seams. It verifies:

- lost-response group/plan recovery sends the same normalized participant list,
  UTC interval, template revision and requestId through the real creation service;
- no optimistic booking is shown before the refresh response; both screens then
  show one grouped session, two participant bookings and a shared immutable name;
- refresh failure exposes actual retry controls, with no demo or partial-success
  fallback; retry rereads server data;
- unmount drops pending read completion and navigation and releases subscriptions.

Separate screen/provider tests cover window/plus routes, real selected sessions,
verified same-session refresh, relogin on selection/load/create/navigation,
late success/error, old catalogue rejection, switch/unmount, blur/refocus,
new submit versus old finally, initial-verification retry, overlap acknowledgement
and mini-group template selection. Existing service suites cover pagination,
explicit bounds errors instead of hidden truncation and supplemental proposals
outside the requested week. Synthetic server snapshots are not SQL snapshot proof.

## Commands and results

From repo root:

```sh
git fetch origin
git diff --check
cd app
npx jest tests/workspace-{mutation-provider,today-screen,schedule-screen,create-session-screen,schedule-production-lifecycle}.test.tsx --runInBand
npm run check
```

- Targeted final screen/provider/lifecycle run: **5 suites / 43 tests passed**.
- Full final `npm run check` on refreshed `4c20e22`: **184 suites / 2286 tests passed**; typecheck, lint and format check passed.
- Full pre-integration `npm run check`: **182 suites / 2262 tests passed**; typecheck, lint and format check passed.
- TypeScript strict, lint, Prettier and unit checks are the `check` pipeline.
- `git diff --check`: passed. No new image files, comments, `any` or dependencies.

## CI / needs-local-db handoff for Claude

No SQL gap requiring a new regression or migration was found. Existing files
were not edited. Existing SQL regressions already check group snapshots,
immutable source changes, normalized exact receipts, overlap acknowledgement,
permissions and concurrent request serialization. Run the unchanged CI workflow:

```sh
supabase db lint --local --fail-on warning --workdir .
supabase test db --workdir .
python3 supabase/tests/schedule_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_plan_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_status_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_reschedule_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_request_resolution_concurrency.py --container supabase_db_trainerApp
cd app && npm run db:types:check
```

The full CI also runs its existing financial/template/program/invitation runners;
this task does not skip or modify them. Relevant pgTAP files:
`schedule.test.sql`, `booking_program_snapshots.test.sql`,
`booking_creation_receipts.test.sql`, `booking_request_resolution.test.sql`.
Database generated types are unchanged. Docker/local Supabase are unavailable,
so these commands were **not executed here**. `needs-local-db` remains with Claude.

## Parity and remaining validation

Reference reviewed: `prototype-fresh/index.html`, `js/store.js:892–944`,
`js/sheets.js:331–389`, `docs/prototype-guide.md:256–258`; numeric source remains
`prototype-fresh/review/parity/spec-*.json`. Normal layout, geometry, icons and
texts are retained; error/retry uses existing translated UI. No new visual asset.
This is source/scenario review, not measured parity or screen acceptance.

Not checked: real SQL/RLS/Auth, native SQLite/AsyncStorage persistence and
crash/reopen, independent writers, actual network/lost response, two phones,
iOS/Android, themes/states screenshot comparison at 390×844, geometry, native
keyboard/gestures, accessibility/large text and owner approval. No screenshot
was committed under ADR 0066. SOM-26 and its screens are **not accepted**.

Decision: [ADR 0087](../../../docs/app/decisions/0087-schedule-presentation-session-lifecycle.md).
