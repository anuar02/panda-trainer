# SOM-29 · SQLite outbox r2

[Draft PR #26](https://github.com/anuar02/panda-trainer/pull/26).
Implementation commit `5fe8af6`.

03.10.2026. Branch `agent/som-29-sqlite-outbox-r2`, base
`fix/som-50-template-picker` at `7f07914` (includes ADR 0061, SOM-39 PR #23 and
SOM-34 PR #25). Original `2380781` cherry-picked as `64f165b`; only CHANGELOG
and ROADMAP conflicted, both histories preserved. PR #24 is closed without merge.
The original report stays unchanged and its 1254 tests / 127 suites are historical.
No module rewrite, screen connection, prototype change or Linear write.

Graft command/index and `tools/codex-agents/SUBAGENTS.md` absent. Followed explicit
brief: leader fixed operation/result contract before three exclusive assignments
(SQL/tests, SQLite/fixture/tests, independent runner/transport tests). Leader owns
integration, package/types, documents, final check and commits. Linear issue/project
read: SOM-29 In Progress; historical SOM-53 Backlog dependency does not override
merged ADR 0061. SOM-30/31 require merge of this corrected implementation.

## Contract and findings

The original report and ADR 0062 describe the unchanged typed envelope, payloads,
response validation, ordering, per-operation subtransactions and integration points.
`resolve_conflict` explicitly selects current/incoming and uses expected_revision
also as base_revision. Receipts, draft and conflict rows remain owner-only.

| Review finding | r2 behavior |
| --- | --- |
| Ordinary shared write bypassed unresolved note privacy | Further writes become additional preserved conflicts; ordinary writes cannot publish unresolved text |
| Choosing current lost original visibility | Restore chosen snapshot text, author/device and shared intent, guarded by other unresolved conflicts |
| Missing note with positive base created unresolvable conflict | Reject entity_unavailable; error receipt stable; corrected operation uses a new ID |
| Replacement snapshot omitted appended sets and source | Include child sets/devices and structural context; exercise aggregate revision advances on set mutation; stale choices reject |
| Divergent duplicate SQLite receipt silently ignored | Reject divergent saved receipts and roll back whole acknowledgement batch; exact duplicates stay idempotent |
| Mutable queued save identity | Snapshot operation/entity IDs together with serialized values before queue execution |
| Status could publish after session change during issue read | Recheck session/generation after await before publishing conflict/error |
| SQL NULL batch escaped explicit validation | Reject non-array including NULL |
| Concurrent global operation IDs across tenants | Serialize valid operation IDs in stable order in addition to workspace lock |

No last-write-wins policy. Preserved conflict versions remain available to the owner.
Explicit resolution of a pre-existing note conflict is permitted after finish; ordinary
late note edits still create a correction draft. Choosing a note version increments
its revision and refreshes remaining conflict tokens without rewriting their snapshots;
a stale device must reload expected_revision before choosing again.
Structural snapshots also carry replacement rows and their child sets, so an edit
on the replacement cannot be silently skipped by an old choice of the original.
Structural stale snapshots cannot be accepted by substituting a newer revision: reload
the aggregate and submit a fresh replacement operation for a fresh snapshot/conflict.
Any rejected receipt stays immutable; corrected commands require a new operation_id.
Completed workout edits still become correction drafts; explicit correction application
belongs to SOM-32. No unconfirmed data purge API. Logout stops runner and closes scoped
store; new login requires fresh sessionId. A receipt commit already started after a
validated active session may complete in its original account/workspace store; it
cannot acknowledge another account and must not publish stale UI state.

## Original acceptance criteria

| Criterion | Status/evidence |
| --- | --- |
| Expo-compatible expo-sqlite; local result + envelope atomic transaction; rollback/reopen | Implemented; 10 transactional memory-fixture tests, real SQLite not checked |
| Account/workspace isolation, logout retention | Implemented and fixture/runner tested; native lifecycle not checked |
| Stable IDs, RPC tenant/role/relations/revisions/payload, receipts/replay, deterministic batch and partial errors | Implemented with pgTAP/concurrency fixtures; SQL runtime not checked |
| Both conflict versions/device sources; finished correction drafts; private notes/receipts/drafts | Implemented and SQL fixtures expanded; SQL RLS/runtime not checked |
| Explicit conflict choice and stale revision/snapshot checks | Implemented with pgTAP fixtures; SQL execution not checked |
| Transport/runner confirm only validated outcomes, retry same IDs, network timeout/single flight/session fences | Implemented; 50 runner/transport tests pass |
| Saved on phone only after local commit; separate i18n component and integration seam | Implemented; existing screens unchanged, owner/native visual approval required when integrated |
| Three synthetic participants, rollback/reopen/order/duplicate/lost response/offline/conflicts/draft/stale/logout | App fixtures tested; actual devices/server scenarios not checked |
| database.types.ts matches added API | Manually maintained, not generated; generation/drift-check not performed |
| Fresh full app check, CHANGELOG/ROADMAP/ADR/report | See commands below; SOM-29/stage 5 not declared accepted |

## Checks in this branch

- `cd app && npm ci`: passed, installed locked dependencies including expo-sqlite ~57.0.3.
- `cd app && npx jest tests/workout-sync-storage.test.ts --runInBand`: 1 suite / 10 tests passed.
- `cd app && npx jest tests/workout-sync-runner.test.ts tests/workout-sync-transport.test.ts --runInBand`: 2 suites / 50 tests passed.
- `python3 -m py_compile supabase/tests/workout_sync_concurrency.py`: passed syntax only; no PostgreSQL sessions executed.
- `git diff --check`: passed; original report matches source branch byte for byte.
- `cd app && npm run check`: passed typecheck, lint, format and 131 suites / 1307 tests (fresh r2 run).

Static grammar check (pglast 8.4 installed only in `/tmp/som29-sql-parser`, no repo dependency):

```sh
PYTHONPATH=/tmp/som29-sql-parser python3 - <<'PY_CHECK'
from pathlib import Path
from pglast import parse_sql, parse_plpgsql
import re, ast
for filename in ('supabase/migrations/20261003120000_workout_sync.sql', 'supabase/tests/database/workout_sync.test.sql'):
    source = Path(filename).read_text()
    parse_sql(source)
    if 'migrations/' in filename:
        for function in re.findall(r'create function .*?\$\$;', source, re.S):
            parse_plpgsql(function)
ast.parse(Path('supabase/tests/workout_sync_concurrency.py').read_text())
PY_CHECK
```

Passed SQL grammar for migration/pgTAP and PL/pgSQL grammar for both RPCs.
This does not validate catalog bindings, SQL types, RLS or runtime semantics.

Mock storage checks transaction failure and reopen through a retained memory fixture;
it does not prove crash durability or execute native SQLite. Runner tests use synthetic
ledger responses, not real RPC execution. No Docker, local Supabase, psql, browser,
iOS or Android runtime in this environment. No real customer data or paid services.

## Reproducible remaining checks

Only on a disposable synthetic local Supabase database:

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

119 pgTAP assertions are prepared (static count, not executed).
Run the journal pgTAP suite including unresolved note → subsequent shared write →
finish/client read, current/incoming × private/shared, missing-note corrected ID,
replacement/append snapshots and two-device stale selections. Inspect generated
public API drift against manually maintained database.types.ts. Concurrency fixture
must execute independent PostgreSQL sessions, verify one receipt/application, and
race current/incoming resolution from two devices: one applied, one stale_conflict,
with stable replay receipts for both.
These commands are prepared, not claimed passed.

On both iOS and Android development builds, exercise real SQLite exclusive commit,
rollback/reopen/crash, pending retention and same-ID replay. With three synthetic
participants, airplane mode halfway through workout → online → second-device read
must yield each set once. Exercise same-set/delete/replacement conflicts, note
privacy before explicit resolution, finished correction drafts and account switch.
All native/flight/second-device scenarios remain unverified here.

SOM-30 adapts demo UUIDs, kilograms to integer grams, units/null values and server
snapshots into this module's projection; AsyncStorage stays a demo mechanism.
SOM-31 connects saveJournalEntry/WorkoutSyncStatus and explicit conflict selection.
Neither task is connected in r2. Merge and owner acceptance remain separate gates.
