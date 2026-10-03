# SOM-30 — production preload / recovery

03.10.2026. Base `fix/som-50-template-picker`, SOM-29-r2 merged PR #26,
`19c62af`. Work branch `agent/som-30-workout-preload-recovery`.
Merge is not owner acceptance. No real customer data or paid services were used.
Linear project and SOM-30 were read; no records/comments/messages were changed.
`graft` and `graft/` were absent; source context was read directly. No graph build
was claimed. `tools/codex-agents/SUBAGENTS.md` was absent; the owner's fallback
ownership rules were followed with three clean-context workers.

## Delivered behavior

Existing server API reads owner/workspace, booking/current group window, active
client cards, immutable booking program snapshots, current journal and each
participant's previous completed sets. Pagination and exact projected fields are
validated; all requests carry the captured account Bearer and abort signal.
Cancelled selection/missing plan/archived client/invalid relation/forbidden response
cannot become fictional data. A live template or demo plan is never a fallback.
Archiving the source template/exercise preserves its assigned immutable snapshot.
Private/session notes are not fetched; unexpected private fields are rejected by
recursive local validators. Client routes do not consume this trainer context.

Typed SQLite `workout-preload.db` stores scoped context and recovery. Online open
commits context + selected recovery in one exclusive transaction. A failure after
either write rolls back both; refresh without replacement recovery cannot orphan an
existing selection. Cached definitions/UUIDs survive refresh, server current
journals remain separate and authoritative, history hints may refresh. Cache
absence and failure are distinct. Only network errors/timeouts permit cached open;
configuration/contract/authorization/entity errors do not masquerade as success.
Hydration failure blocks changes and permits retry without destructive reset.

`/workspace/journal` is a read-only preload preview. Today/Schedule's shared sheet
opens it, with selected client and stable workout/exercise IDs. Provider/dock above
workspace Stack keep return available on Today, Schedule, Clients, Client detail,
Library/editor/detail, New and Invite routes; journal itself hides the dock.
Navigation away and reopen preserve selection.
An account-only SQLite bootstrap also discovers own cached recovery while online
onboarding loads/fails, so offline restart is not blocked by workspace discovery.
An independent fixed-session server probe blocks forbidden/missing/invalid/config
responses; only network failure or successful owner verification admits the cached
workspace. Other sections retain online guards; the journal and dock remain accessible. Dock respects safe area and large
text, introduces no animations, and does not use demo state. Existing demo journal,
SOM-39 preferences/motion and billing behavior are retained.

Account/workspace/session/token fencing hides old state immediately through keyed
generations, aborts preload and stops/closes scoped storage/runtime on logout or
switch. Begun scoped commits may finish, but publish only to their original active
session. Pending outbox data is not deleted. Existing SOM-29 runner runs one batch
on mount/foreground and stops on background; apply_operations/receipt/conflict
semantics are unchanged. A preload/recovery write produces no journal operation,
no production save/finish button, and no empty-queue "synced" success label.

## Boundary / SOM-31 seam

[ADR 0064](../../../docs/app/decisions/0064-workout-preload-and-scoped-recovery.md)
contains UUID, integer grams/reps/seconds/null, zero-based positions, string planned
ranges, immutable assignment vs current projection, and revision meanings.
Stable UUIDs come from server rows or locally persisted expo-crypto randomUUID,
not demo identifiers. Planned ranges are not actual results. Null is distinct from 0.

SOM-31 must connect actual drafts/input/undo/substitutions, reconcile pending local
projection with refreshed server revisions/tombstones/receipts, and provide explicit
conflict selection. All writes use saveJournalEntry + the SOM-29 atomic outbox and
apply_operations. Existing create_workout accepts only booking_id and creates an
empty journal; add_exercise currently copies live catalog metadata and cannot accept
full booking snapshots. A compatible new journal migration and SQL fixtures are
required in SOM-31 to preserve the assignment when creating journal rows. Direct
INSERT or fictitious cache-only save is not a workaround. SOM-32 owns finish,
partial completion and explicit correction of completed journals (ADR0061).

## Acceptance criteria status

| Criterion | Status / evidence |
| --- | --- |
| Typed server participants/snapshot/exercises/past sets, owner/relations/privacy | Implemented; service + recursive validator tests. SQL/RLS runtime unverified. |
| Atomic preload, cached/uncached offline, stable assignment, three clients | Implemented; transactional SQLite mock + adapter/lifecycle tests. Real SQLite/crash/airplane unverified. |
| UUID/selected booking/client/collapse/reopen and trainer dock | Implemented; provider/lifecycle/dock/readonly tests. Native/navigation/visual comparison and owner approval remain open. |
| Account/workspace/session fencing, stop/close, retained pending, stale async | Implemented; lifecycle/provider/runtime tests and unchanged SOM-29 runner regression suites. Real session/device replay unverified. |
| SOM-31 units/projection/revisions seam, no fake save/finish | Documented/implemented read-only guard; full input/conflict/finish deferred to SOM-31/32. |
| Meaningful tests | Executed mock/unit suites below. No SQL/device proof inferred from them. |
| Full check, docs, ADR, draft PR | See exact final validation below; owner screen acceptance is not claimed. |

## Validation performed

The lead ran the final full check; workers ran only their narrow tests. Early check
attempts found strict fixture/index typing errors and React refs/set-state/use-memo
lint errors in new code. These were fixed before final validation; those attempts
are not reported as passing.

```sh
cd app
npx jest tests/workout-preload-service.test.ts --runInBand
npx jest tests/workout-preload-storage.test.ts --runInBand
npx jest tests/workout-preload-bootstrap.test.ts --runInBand
npx jest tests/workout-preload-offline-recovery.test.tsx tests/workout-preload-screen.test.tsx --runInBand
npx jest tests/workout-preload-lifecycle.test.ts tests/workout-preload-dock.test.tsx tests/workout-preload-provider.test.tsx tests/workout-preload-sync-runtime.test.ts --runInBand
npm run check
npm run export
cd ..
git diff --check
```

The first `npm run export` bundled iOS/Android but failed on web resolution of
installed wa-sqlite.wasm. A one-line Metro `wasm` asset registration was required
for the new workspace SQLite import to bundle. This is route integration, not an
outbox rule or dependency change. API/setup reference:
[Expo SQLite SDK57](https://docs.expo.dev/versions/latest/sdk/sqlite/).
Web SQLite requires COOP/COEP headers and does not support this exclusive
transaction API; no browser write/recovery support is claimed, and no hosting
configuration/alternative storage was introduced.

Final lead verification:

- `cd app && npm run check`: passed typecheck, lint, format and **140 suites /
  1382 tests**, 0 snapshots. This includes **75 preload tests /9 suites** and
  the existing SOM-29/demo/SOM-39/billing regressions.
- `cd app && npm run export`: passed iOS/Android/web static export, including
  `/workspace/journal`; bundling only, no browser/native runtime evidence.
- `git diff --check`: passed.

The later documentation/PR-link edits are format-checked separately; no runtime
or owner acceptance is inferred from the green check.

- Server worker: 12 tests passed, including real local validator applied to adapter
  results, three isolated synthetic histories, zero-based sets, range/null metadata,
  current/assigned separation, missing/archived entities, owner denial, grouped
  individually moved booking, 501-row paging and fixed Bearer per request.
- Cache worker: 8 tests passed, including retained scoped reopen, cache miss, late
  template edit/UUID freezing, malicious private fields, empty authoritative journal,
  updated history hints, context+recovery second-write rollback and orphan prevention.
- Lifecycle/test worker: 35 tests /4 suites passed before final preview tests;
  scoped restore/open responses, offline hit/miss, hydrating failure, logout/token
  switch, pending storage close, trainer routes, 200% labels/safe area and runner
  lifecycle. Final lead check includes the completed readonly preview tests.

All SQLite transactions/reopens here use a retained memory mock, not expo-sqlite.
Provider/dock/screen tests use a renderer and mocked router/auth/storage. Server
fixtures use mocked PostgREST responses. Runtime tests mock runner/store; existing
SOM-29 runner tests cover real runner logic against synthetic transports. These
are mock/unit proof, not real SQL/RLS, native navigation or device durability proof.

## Prepared fictional fixtures

`app/tests/workout-preload-service.test.ts` has an explicit three-participant group
with individual booking/client/program/current-history joins and distinct result
values; shared group IDs do not merge plans. `workout-preload-storage.test.ts` uses
UUIDs `00000000-0000-4000-8000-000000000010` /020 /030 for bookings, with separate
client/program/workout IDs and integer1500g, `8–12` planned reps, zero position.
The service fixture includes completed past results, uncompleted/future histories,
seconds/nulls, cancellation, archive and individually rescheduled group members.
These are fictional fixtures; they provision no external account and send no data.

Existing disposable database fixtures cover booking snapshots/journals/RLS and
SOM-29 receipts/conflicts: `supabase/tests/database/booking_program_snapshots.test.sql`,
`workout_journal.test.sql`, `workout_sync.test.sql`. No new SQL API/migration or
manual/generated type change is included in SOM-30.

## Unverified / remaining commands

No Docker, local Supabase, browser, iOS or Android devices were available. Do not
interpret old reports or merged PR #26 as fresh SQL/native evidence.

On a disposable database with only synthetic data:

```sh
cd app
npm run db -- start
npm run db -- db reset
npm run db -- db lint --local
npm run db -- test db
npm run db:types
npm run db:types:check
cd ..
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres python3 supabase/tests/workout_sync_concurrency.py
```

These commands are prepared, not executed. Confirm exact preload column grants,
owner/peer/client/anonymous access, booking/client/program/exercise relation joins,
immutable snapshot after template edit/archive, and finished-only client history.
Generated type drift and SQL/runtime/pgTAP remain unverified.

On both native development builds, with three synthetic clients and different
programs, preload group → collapse → visit every trainer workspace route → restart
→ selected client/UUID restored. In airplane mode, cached booking opens; uncached
booking shows unavailable. Kill during context/recovery transaction and reopen:
previous coherent context/selection survives. Simulate SQLite open/hydration failure
and retry without a purge. Logout during preload/restore/apply, switch accounts,
then log back in: no old publication/send/ack into the new account, own pending
retained. Check safe area at all rotations, 134–200% font size, calm/reduced-motion,
light/dark preferences with always-dark journal, and stack back/deep-link behavior.

Group offline→online→second device exactly-once results/conflict/finish is the shared
SOM-29/30/31/32 gate and cannot pass through this readonly preload alone. Real
SQLite/reopen/crash, native airplane mode, real RPC replay, visual/prototype parity,
and owner screen acceptance remain open. No new PNGs or acceptance-table status
changes were made.
