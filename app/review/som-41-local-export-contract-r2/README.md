# SOM-41 · Local export contract r2

03.10.2026. Branch `agent/som-41-local-export-contract-r2`, target
`fix/som-50-template-picker`, final base `9031157`. Closed PR #39 was not merged.
Transferred its package by cherry-picking `c8b6cad` as `32c11ee`, preserving fresh
base CHANGELOG/ROADMAP checkpoints and adding current task entries separately.
`git merge origin/fix/som-50-template-picker`: initially up to date at 90b7f73;
final fetch found 9031157 (financial reads), merged without conflicts. Its ADR 0077
is retained; local export ADR moved to 0078. Fresh final check is recorded below.
SOM-20 prior package is committed/published separately (PR #45 open); its code is
not a dependency or part of this change. No unfinished third journal branch used.

## Acceptance evidence

- Сделано: complete original isolated versioned pure local export package,
  exact operation/projection schemas, scoped account/workspace/session snapshot,
  explicit unknown/incomplete sources, deterministic bounded canonical UTF-8.
- Сделано: lossless current versions for replacement old exercise + sets,
  existing set/exercise/sets/replacements aggregate, missing set + skipped exercise
  fallback, shared/private note snapshots, workout row including finished_at.
  IDs/entityId, revisions, tombstones, null/zero/units and original ordering remain.
- Сделано: resolve_conflict correction retains its original envelope. Its typed
  scoped context comes from sources.conflicts in the same snapshot; absent context
  or versions remains incomplete. Contradictory entity/workout/resolution token fails.
- Сделано: kind-specific projection, exercise, child, replacement and version
  validation; same-workout foreign exercises/children do not become complete.
  Schema/scope checks still apply to every row. UUID ownership remains collector work.
- Сделано: synthetic round trips for every SQL form, populated aggregates, exact
  grams/seconds/reps/null/zero, Unicode and rejected receipts; negative scope/session,
  UUID, duplicate, foreign child/parent/replaced_from_id/revision, missing resolve
  context, credentials, limits and missing-version tests.
- Сделано: current contract/collector handoff and ADR 0078 (0075 schedule / 0076
  history / 0077 financial reads remain unchanged), minimal deletion-handoff link, CHANGELOG/ROADMAP.
  Historical report is labelled superseded and is not fresh verification evidence.
- Сделано: no SQL, existing account-export/deletion/workout-sync, SQLite, auth,
  runtime collector, features/UI, dependencies, policy/DATA-LIFECYCLE or scripts changes.
  No code comments, any, real data, paid service, secrets or new PNG.
- Не проверено: real SQLite snapshot/reopen/crash/concurrent save-ack, file APIs,
  SQL/pgTAP/runtime/generated drift, native devices/browser/cloud/legal.
- Требует одобрения владельца: full SOM-41/export/delete integration and any screen
  acceptance. This pure package does not close SOM-41 or authorize deletion.

## Reproducible checks

- `command -v graft` failed; no executable or graft directory available. Source
  spans were read directly. Live Linear connector unavailable; no Linear mutation,
  comment, message or issue creation attempted. Scope follows the owner brief.
- `cd app && npx prettier --write src/domain/account-local-export tests/account-local-export`
  formats only the task code/tests.
- `cd app && npm run check`: PASS, strict tsc, ESLint zero warnings, formatting,
  First run: **157 suites / 1689 tests**, zero snapshots, Jest 44.956 s on 90b7f73.
  After merging final base 9031157: **159 suites / 1731 tests PASS**, zero snapshots,
  Jest 21.763 s; strict typecheck/lint/format also passed.
  Initial typecheck caught attempted mutation of readonly fixture row properties;
  fixtures now replace rows with exact typed copies. Final check passed.
- Regression experiment: temporarily substituted only index.ts from
  `origin/agent/som-41-local-export-contract` and ran
  `cd app && npx jest tests/account-local-export/sql-forms.test.ts --runInBand`.
  **16 failed / 12 passed** on the original serializer. Failures include valid
  replacement/fallback, resolve set/exercise correction, missing resolve context,
  foreign same-workout exercise/child/replacement, revision/visibility contradictions.
  Source was restored in a finally block; experiment is not committed.
- After restore: `cd app && npx jest tests/account-local-export --runInBand`:
  **2 suites / 40 tests PASS**, zero snapshots (0.385 s).
- `git diff --check`: PASS. No Docker/Supabase/browser/devices were used.

## Technical limits

This is structural validation, not verification of completeness/ownership claimed
by a collector. Overall status remains incomplete because otherLocalData has no
implemented export contract. Neither canonical JSON nor journalStatus is export/ack
proof, file save, identity confirmation or delete authorization. Server success
cannot be combined with local partial output to claim a backup.

The collector must supply all scoped rows in a consistent snapshot, preserve all
SQL aggregate fields, and include referenced conflict snapshots for resolve drafts,
including their resolution token at draft creation. Missing context stays explicit;
no fabricated UUID, replacement entityId or implicit current:null shortcut is used.
The [contract](../../../docs/app/privacy/LOCAL-EXPORT-CONTRACT.md) specifies read
transaction/writer coordination, session fencing, cross-source barrier, actual file
result and later cleanup/proof obligations. Runtime implementations are future work.
