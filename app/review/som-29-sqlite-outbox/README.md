# SOM-29 · SQLite outbox

03.10.2026. Base: fix/som-50-template-picker, includes f98423f / ADR 0061.
Standalone module; existing screens/domain workout/demo/scheduling untouched.
Live SOM-29/project read; SOM-53 historical Backlog relation does not supersede
owner decision. No Linear writes. graft binary/index and requested
`tools/codex-agents/SUBAGENTS.md` absent; followed task's explicit agent rules.

## Contract

`domain/workout-sync/types.ts`, `operations.ts`: stable UUID operation/entity/device,
base_revision, payload, canonical UTC created_at. `createJournalOperation` supplies
an exhaustive typed payload union. Runtime server rejects unknown keys and checks
relations/measure/revision/role/tenant. Store accepts JSON projections independently
of demo types; producers must use production UUIDs and typed builders.

RPC `apply_operations(p_workspace_id uuid, p_operations jsonb)` accepts 1–100
operations. Results envelope: account_id (auth.uid), workspace_id, ordered results.
Result includes operation_id/entity_id, status applied/conflict/correction_draft/error,
revision and respective conflict_id/draft_id/error_code. Entire envelope comparison
rejects operation_id reuse, including changed device/base/time. Replay returns the
original receipt; workspace transaction lock serializes concurrent replay.
One operation's subtransaction rolls back independently; following operations run.
Error receipts are stable too: rejected operations remain pending locally; correcting
one requires a new ID and explicit recovery review, never silently deleting it.

Payloads:

| Kind | Payload |
| --- | --- |
| create_workout | booking_id |
| add_exercise | workout_instance_id, exercise_id, position, planned_sets |
| replace_exercise | same + replaced_from_id |
| upsert_set | workout_instance_id, workout_exercise_id, position, reps, seconds, weight_g (nullable integers) |
| delete_set | workout_instance_id, workout_exercise_id |
| set_note | workout_instance_id, text, shared |
| finish_workout | {} |
| resolve_conflict | conflict_id, selected_version=current/incoming, expected_revision (equals base_revision) |

New IDs merge in requested_position/device_id/id order; same ID preserves both
versions with their devices. Deleted sets remain tombstones. Replacement preserves
old exercise/sets; structural conflicts require explicit choice. A visibility conflict
moves current shared text to private storage atomically. Finished edits create private
correction drafts and cannot overwrite completed rows. Draft application needs the
explicit SOM-32 correction flow; this module exposes no automatic approval.

Local schema: `workout_local_entries`, `workout_outbox`, account/workspace composite
keys, persisted sequence/envelope/receipt. Atomic exclusive transaction, WAL,
synchronous FULL and busy timeout. New connection per adapter; close waits for writes.
No purge API; logout closes old runner/store and retains unconfirmed data.
Native SQLite storage is not encrypted by this task; device/sandbox access is outside
client RLS. Never expose a former account's store to the new account's screen.

## SOM-30/31 integration

SOM-30 opens `openOutboxStore` for authenticated account/workspace, restores local
projections and pending operations; it supplies server program snapshots/preload
separately. `create_workout` binds booking/client only; snapshot hydration is SOM-30.
Demo kg/setIndex/client IDs must be adapted to stable production set/exercise/workout
UUIDs; convert kg to integer grams, preserve null versus zero and seconds versus reps.
Do not rewrite demo reducers or import their AsyncStorage as production outbox.

SOM-31 uses `saveJournalEntry` with the full desired projection and operation; only
its fulfilled local transaction permits Saved on phone. Render `WorkoutSyncStatus`
with exported SyncState. Conflict choices use both server versions, explicit
selected_version and current revision; never generate last-write-wins retries.

Connectivity coordinator calls runner.run with backoff/manual retry; each call sends
one bounded batch. There is no background tight loop. A shared scope lock rejects
parallel runners. Token/account/workspace/session snapshot fences responses. Call
runner.stop **before** logout/switch, supply a fresh sessionId for every authentication
lifecycle, then close the old store. A stop cannot undo an already committed server
request; retained operation ID recovers its receipt next login. Timeout leaves data
pending even if transport ignores AbortSignal. Only complete, matching, validated
receipts acknowledge operations. Confirmed conflict/draft issues survive reopen.

Small component uses isolated i18next resource, theme text classes and live-region
accessibility. No screen connection or visual acceptance claimed.

## Checks performed here

- `cd app && npx expo install expo-sqlite`: installed SDK-compatible ~57.0.3;
  install's optional app.json plugin addition removed (no custom SQLite configuration).
  API checked against installed declarations and [Expo docs](https://docs.expo.dev/versions/latest/sdk/sqlite/).
- `cd app && npx jest tests/workout-sync-storage.test.ts --runInBand`: 6 passed.
- `cd app && npm test -- --runTestsByPath tests/workout-sync-runner.test.ts tests/workout-sync-transport.test.ts`: 35 passed.
- `python3 -m py_compile supabase/tests/workout_sync_concurrency.py`: passed syntax only.
- `cd app && npm run check`: passed typecheck/lint/format and 127 suites / 1254 tests.

Storage tests use transactional memory fixture (snapshot rollback/reopen); runner
uses synthetic receipt ledger with three invented participants. These verify business
contracts and cannot prove real SQLite crash durability, server ACL or concurrency.
`database.types.ts` is **manually updated**, not generator output. Supabase type
regeneration/drift check were **not performed**.

## Reproducible remaining checks

On an isolated machine with Docker, Supabase CLI, psql:

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

Concurrency runner creates only synthetic UUID fixtures in a disposable database,
races two independent PostgreSQL sessions, asserts identical results and one journal
and receipt, then cleans its fixtures. Never run against production/customer data.
pgTAP file covers permissions, receipts/replay/payload mismatch, revisions/conflicts,
late finished edits and private state. SQL reset/lint/pgTAP/concurrent execution are
**not checked here**: Docker/local Supabase/psql unavailable.

On iOS and Android development builds: save before commit failure injection; close
and force-stop/reopen with pending data; crash during commit; duplicate retries;
three synthetic group participants; airplane mode halfway through workout → online
→ read all once from second device; same-set conflict on two devices; replacement/
tombstone conflict; finish on first device then late edit/draft on second; stale
resolution; logout/switch/back with old pending receipts. Verify actual text/a11y/theme
component integration after SOM-31. None performed in this container (no browser/native).

SOM-29 and stage 5 are not fully accepted; native/SQL checks and owner review remain.
