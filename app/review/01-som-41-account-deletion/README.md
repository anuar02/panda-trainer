# SOM-41 · Account deletion

[Draft PR #73](https://github.com/anuar02/panda-trainer/pull/73). Implementation commit `f9a9452`.

04.10.2026. Branch `agent/01-som-41-account-deletion`; base
`fix/som-50-template-picker`, refreshed `8ca8fc0` (#71). Full implementation package,
not a preflight/report-only PR. Product rule [ADR 0101](../../../docs/app/decisions/0101-account-deletion-keeps-trainer-history.md);
technical [ADR 0103](../../../docs/app/decisions/0103-durable-account-deletion-and-local-proof.md),
[privacy handoff](../../../docs/app/privacy/ACCOUNT-DELETION-HANDOFF.md).

## Delivered behavior

Account/settings for both roles → server consequences → account-local inventory →
local file → separate acknowledgement → explicit delete → truthful status/recovery.
Trainer server export remains available separately. UI role toggle does not authorize
or select scope. Cancel before command does not delete. Client detaches every foreign
trainer card, preserving programs/bookings/journals/payments; dual also removes own
workspace. Shared client Auth/profile survives deletion of a trainer workspace.

New `20261004134447_account_deletion.sql`: private durable receipt/context, service-only
inspect/prepare/execute/status/complete. Handler validates Auth getUser and binds all
RPC receipts to initial request/actor. DB/Auth are separate. Auth failure/lost response
is recoverable by exact request and 32-byte capability, hashed server-side. Status is
nonmutating; foreign/expired bearer fails. Minimal pseudonymous deletion ledger remains
for deny/recovery, with retention/legal review pending. Capability/JWT not exported or
logged, service role exists only in server environment. Auth SDK user_not_found is the
only accepted already-deleted outcome; unknown error remains retry-required.

SQL cleanup includes archives, personal/booking program snapshots and children,
bookings/groups/proposals, journals/replacements/sets/notes, conflict/correction/audit,
attendance/credit/payment/reversal chains, invitations and private receipts, notification/
push device/delivery state. Foreign Auth audit identity becomes NULL; business fields
remain. Invitations on every detached card are removed, even unaccepted tokens.
Six cyclic/self FK deferrals only; no program-update schema/API or business-writer
files changed. Public types mirror new RPCs/nullable audit columns manually; CI must
compare the real generator output. Export row schemas accept preserved NULL authors.

## Interlock and inventory

All existing public/private ordinary INSERT/UPDATE/DELETE statements share advisory
transaction lock `(410041,1)`, including service writers. Row guards fence deleting
actor/workspace/Auth references. Covered writer families: onboarding/profile/cards/
invitations, library/template/program assignment, booking/status/request/proposal,
prepare/sync/finish/conflict/correction, attendance/purchase/payment/reversal,
notifications/push and all private receipts. Current table guard inventory is tested
by pgTAP. Future tables require guard/lifecycle integration. READ COMMITTED is enforced;
other isolation levels fail closed. Existing pre-write row locks can cause safe
transaction deadlock/rollback and exact retry. Owner DDL/TRUNCATE/trigger disabling
are an administrative boundary, not app API. No UI-only guard claim.

Local inventory spans all workspace rows for account, including old workspace scopes:

| Store | Sources | Deletion rule |
| --- | --- | --- |
| workout-sync.db | workout_outbox; workout_local_entries | Only validated confirmed applied receipts settled; rejected/conflict/correction/pending block |
| workout-entry.db | workout_entry_drafts/resources/devices | Drafts block; resources/device cache scoped cleanup after complete |
| workout-preload.db | workout_preload_context/recovery | Recovery blocks; context cache scoped cleanup |
| AsyncStorage | booking/status/reschedule/billing/program/correction pending; exercise/template draft/pending-clear | Outstanding block; exact empty template/completed exercise markers are settled |

Unknown scoped keys/read error/limits/unsafe nested JSON block, not zero. Raw local
file covers these account scopes, bytes/SHA-256/snapshot/fingerprint and adapter
saved/shared outcome; cancellation/error is not proof. New content invalidates ack.
Server export reports its existing coverage gaps and unknown globalAtomicity. Neither
file proves global server/local atomicity or other devices. In-memory forms follow
route/auth teardown, pending storage writers are fenced/drained; native completeness
of shutdown still needs installed-device validation. Settings entry dismisses prior
routes before deletion. No pure-preflight unknown/review-required becomes permission.

Root AsyncStorage fence tracks six scoped mutation methods and restores confirmed
intent on startup; foreign account writes continue. SQLite account tombstones block
late INSERT/UPDATE/DELETE on all seven tables, across connections. Logout keeps
existing runner/session fences and scoped Auth guard, clears OAuth callback cache only
with no current session. Complete cleans own settled outbox/caches/empty markers,
never outstanding/foreign data. Exact rows are rechecked in each cleanup transaction;
original tombstone proof hash supports partial cleanup retry between databases. Local
change/error preserves data and offers recovery local export. No blanket storage clear,
no destructive purge or auto-drop. AuthStorage is native SecureStore/web sessionStorage:
web recovery covers retained browser session/reload, not lost tab/session credentials.
Lost device, offline device and OS backup cleanup are explicitly unproven.

## Verification

Lead commands from repository root unless noted:

| Command | Result |
| --- | --- |
| `cd app && npm run check` | PASS: typecheck/lint/format; 238 suites / 3079 tests |
| `node --experimental-strip-types --test supabase/functions/account-deletion/handler.test.ts` | PASS: 12 synthetic server tests |
| `app/node_modules/.bin/tsc --ignoreConfig --noEmit --strict --lib es2022,dom --target es2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions supabase/functions/account-deletion/handler.ts` | PASS isolated handler strict check |
| `node app/review/01-som-41-account-deletion/sqlite-check.cjs` | PASS production inventory/fence/cleanup query code on Node SQLite; late own writes denied, foreign cache preserved, durable original cleanup marker |
| `python3 -c "import ast; ast.parse(open('supabase/tests/auth_email_smoke.py').read())"` | PASS syntax |
| `git diff --check` | PASS |
| `cd app && npm run db:types:check` | Unavailable/failed: CLI reports Type generation failed; no local DB/Docker |

Independent runtime tests (controller/service/UI/storage/pending) are normal Jest
files, included in app check. Cases cover file cancel/error/mismatched bytes/scope,
ack invalidation, outstanding/unknown, storage loss/partial save, request identity,
DB/Auth unknown retry, local change after shutdown, relogin/refresh/foreign/dismiss,
partial cleanup markers, late writes/inflight drain and restored corrupt intent.
Server synthetic tests include anon/expired/foreign, prepared/DB/Auth failures and
lost responses, adversarial receipt identity, exact replay, browser CORS and body limit.
Synthetic tests do not prove live Auth revoke or installed native storage behavior.
Node SQLite check tests real SQLite trigger/transaction syntax through transpiled
production local module with synthetic crypto/storage transport; outbox validation is
covered by Jest, not this SQLite fixture. This review harness is **not auto-run in CI**.

CI's existing `.github/workflows/app.yml` explicitly runs pgTAP + known concurrency
scripts + `auth_email_smoke.py` + `db:types:check`. No workflows changed. New deletion
Auth/concurrency cases live in that already-run smoke, no new standalone CI harness
assumed. It covers local synthetic A/B/client, trainer-as-client B, old refresh/bearer,
anon/expired/foreign, B payment marker, inflight mutation/prepare lock, stale isolation,
prepared write refusal, staged DB-only/Auth-present and concurrent exact Auth recovery.
Full new pgTAP fixtures populate all own workspace tables (including archived records,
self reversal/replacement chains and cyclic applied correction), compare foreign
business snapshots, inspect Auth references and stage recovery. These SQL/runtime
checks have **not run here**: Docker/PostgreSQL absent. **needs-local-db for Claude/CI**.
Deno unavailable: adapter runtime/typecheck not claimed; local Supabase Auth smoke
must exercise real function. No deployment/function publication/secrets changed in pilot.

## Acceptance and external gates

- Implemented: complete client/settings/controller/server/SQL/Auth orchestration and
  recovery, independent tests and privacy handoff aligned with ADR 0101.
- Not verified here: CI SQL lint/pgTAP/concurrency/live local Auth/type drift; installed
  iOS/Android SQLite/WAL/crash/reopen/file/share/logout; two phones, offline/lost device
  and backup copies. Cloud real Auth revoke and application of this function/migration
  are not established by mocks. Pilot has not been changed.
- Requires owner approval: UI visual/native/accessibility comparison and screen
  acceptance. Prototype has no implemented production deletion recovery reference;
  this task adds the required flow using existing Screen/Card/Button/Text tokens.
  No screenshot/PNG committed. No screen is declared accepted; no policy publication.
- Requires specialist/operator evidence before real data: operator/contacts/legal
  bases/retention for trainer history and security receipt, region approval, ≤7-day
  backup rotation/restore without resurrection, logs/access/rotation. These are
  external gates; no legal approval fabricated. SOM-41/pilot acceptance stays open.

Linear project/issue read at start (SOM-41 In Progress, #61 export and #71 decision
links); no Linear writes/messages. `graft` and the named SUBAGENTS.md were absent in
checkout, so direct repo docs/context and the supplied ownership rules were used.
Three clean-context agents owned SQL+pgTAP, server, independent tests; lead reviewed,
integrated shared types/client/docs and reran required checks. Agent focus results
were not substituted for lead app check. No existing migration/dependencies/workflows/
prototype/agent rules/SOM-32 business modules modified; no real data/paid services.

## CI repair · 04.10.2026 · attempt 1

`gh run view 37207738250 --json jobs` confirms app checks/export succeeded, while
`supabase start --workdir .` failed at deletion migration statement 13 with
SQLSTATE 55000 (`record "t" is not assigned yet`). SQL alias `pg_class t` collided
with the DO block's unassigned PL/pgSQL `t record`. Rename that alias to
`source_table`; constraint selection and cleanup semantics stay unchanged. Only
the new, unmerged and unapplied migration of PR #73 is corrected: a later
additive migration cannot repair an earlier migration that aborts installation.
No base/pilot migration, test, workflow or generated SQL object signature changed.

`git fetch origin fix/som-50-template-picker` and
`git ls-tree --name-only origin/fix/som-50-template-picker supabase/migrations/`
confirm the latest base migration remains `20261004110241_push_v1.sql`, below
this PR's `20261004134447_account_deletion.sql`.

Docker and psql remain absent (`command -v docker`, `command -v psql`); migration
execution/pgTAP/Auth/concurrency/generated types require CI, needs-local-db. The
first run skipped those checks after installation failed. Its earlier registry
rate-limit message did not stop image downloads; no workflow retry workaround
was introduced. Linear issue/project were read, no remote records changed; live
SOM-41 status is Done, which does not establish the outstanding acceptance gates.

Fresh repair validation: `cd app && npm run check` PASS (exit 0; typecheck,
lint, formatting, 238 suites / 3079 tests). `git diff --check` PASS.

## CI repair · 04.10.2026 · attempt 2

`gh run view 37208307708 --json jobs` reports app success and database failure.
Installation stopped at deletion migration statement 13 (SQLSTATE 42703,
`record "c" has no field "relnamespace"`). The preceding constraint loop assigns
PL/pgSQL `c record`; the subsequent `pg_class c` alias is therefore interpreted
as that record. Rename the catalog alias to `source_table` throughout the trigger
installation query. Audit of every declaration/catalog query also found the same
collision in `account_deletion_execute`: `pg_attribute a` shadows the populated
`a record` from the preceding Auth-reference loop. Rename it to `workspace_column`
so workspace discovery reads catalog attributes rather than record fields.

Only SQL aliases changed: selection, ordering, constraints, writer guards, RPC
signatures and generated types are unchanged. Existing pgTAP/Auth/concurrency
tests remain intact. As in repair 1, this corrects only PR #73's new, unmerged,
unapplied migration; a later migration cannot run past its installation failure.
Base/pilot migrations are untouched. Fresh base fetch confirms its latest migration
is still `20261004110241_push_v1.sql`; this PR's version is later.

Commands: `git fetch origin fix/som-50-template-picker`,
`git ls-tree -r --name-only origin/fix/som-50-template-picker supabase/migrations/`,
`gh run view 37208307708 --json jobs`, manual review of every PL/pgSQL declaration
and catalog alias in the new migration, `cd app && npm run check`,
`git diff --check`. Docker/PostgreSQL are absent; SQL installation/pgTAP/Auth/
concurrency/type generation still require CI (needs-local-db). No runtime SQL
success is inferred from this alias audit. Linear issue/project were read only;
no deployment, secrets, real accounts, workflows or acceptance gates changed.

Fresh repair 2 validation: `cd app && npm run check` PASS (exit 0; TypeScript,
ESLint, Prettier, 238 suites / 3079 tests). `git diff --check` PASS.


## Coordinator CI repair · 2026-10-04

Run 37208908883 passed app and reached Auth smoke after SQL tests. The prepared
deletion mutation assertion incorrectly required HTTP 4xx: the existing guard
raises SQLSTATE 55000, mapped by PostgREST to HTTP 500. Preserve the guard and
require the exact 500 / 55000 / account_deletion_in_progress response, plus a
database assertion that the rejected client card was not persisted. HTTP error
JSON is now retained by the synthetic request helper. No migration or business
behavior changed. Python compilation and git diff --check pass; fresh CI required.


## Integration after SOM-32 merge #72

Merged fresh base 0e5560a. Kept both CHANGELOG/ROADMAP/i18n/ADR entries; deletion
ADR renumbered to 0103. The new, still unmerged deletion migration is now
20261004143210_account_deletion.sql, later than program update 20261004134801.
Its catalog inventory now installs the existing deletion fences on the new
program_update_receipts table and includes it in own-workspace cleanup; the
shared immutable trigger permits only the deletion transaction. Added program
update pending keys to local inventory/export and extended own/foreign pending
regression so unresolved intent blocks cleanup. Global pending storage fence
already covers this namespace. No existing migration or program API changed.
Fresh combined CI is required; standalone green checks do not validate integration.
