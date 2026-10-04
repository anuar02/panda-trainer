# SOM-27 — reschedule/cancellation production finish

2026-10-04. Branch: `agent/04-som-27-reschedule-production-finish`.
Fresh base fetched and fast-forwarded from `origin/fix/som-50-template-picker`
(`4c20e22`), then merged the newer integrated base `40ece81` before final
verification. SOM-26 provider implementation was retained and regression suites
combined. Historical `third/som-27-status-proposal-session-fencing` was not used
as a dependency or claimed as merged. One agent; no delegated work.

Live Linear project and SOM-27 were read, including relations and duplicate search.
SOM-27 is In Progress, depends on SOM-25, and blocks SOM-36/37/45. No Linear writes
or messages. Repo evidence supersedes its dated implementation checkpoint.
`graft` executable and `graft/INDEX.md` are absent; graph commands/build could not
run. Used bounded source reads and literal searches as fallback.

## Delivered

- Status and all five proposal actions pin JWT actor/login and caller generation;
  explicit bearer and guards cover auth/storage/target queries/RPC/error/cache.
- Workspace/client/booking/proposal validation precedes mutation. Existing read
  services and provider APIs remain compatible; optional guard/client parameters
  and session-aware provider remounting are additive.
- Canonical payload/request ID persist until known success or validated
  succeeded/abandoned resolution. Exact conditional clear, failed-cleanup recovery,
  newer-command protection, synchronous locks and safe errors are covered.
- Proposed time does not replace confirmed time before acceptance. Both-role
  cancellation uses selected participant revision. Separate late debit uses the
  existing billing caller, with mandatory reason. Billing/payment implementation
  and server policy were not modified.
- Hooks, client selection, nested proposal/cancel sheets, provider locks and
  retained callbacks are scoped to login/caller generations. Updated proposal
  revisions retire stale editor selections rather than silently rebasing them.
- New pgTAP cancellation/debit integration fixture and two-role penalty races
  extend existing concurrency harness. No migration or generated type changes.

## Verification

Base regression was run by temporarily substituting the seven original
status/proposal operation/submission/store/resolution modules from `4c20e22`, then
restoring every changed file in `finally`:

```sh
cd app
npm test -- --runTestsByPath tests/som-27-command-session.test.ts \
  --testNamePattern 'same-user relogin at rpc|cached success is guarded'
```

Base: **4 failed**, both families returned success after relogin or cached success
under a silently replaced session. Fixed modules pass these regressions.
Synthetic fixtures contain generated non-production JWTs and fictitious records.

```sh
cd app
npm test -- --runTestsByPath tests/som-27-command-session.test.ts \
  tests/som-27-production-controls-workflow.test.tsx \
  tests/workspace-status-commands-hook.test.tsx \
  tests/client-booking-status-hook.test.tsx tests/workspace-proposal-hook.test.tsx \
  tests/client-booking-controls.test.tsx tests/workspace-mutation-provider.test.tsx \
  tests/client-command-coordinator.test.tsx
npm run check
```

Final results are recorded below after the final run. Earlier failures during
fixture migration were repaired; they are not acceptance evidence.

Coverage includes both-role propose→counter→accept, decline/withdraw and cancel
through real controls/hooks/storage/transport with scripted independent receipts;
trainer late debit for cancellation by either role through the unchanged billing
implementation; lost response/retry/reopen, corrupt pending, stale revisions,
foreign scope, newer command, conditional payload clear, failed removal/restore,
JWT mismatch, verified refresh, relogin at auth awaits/storage/RPC/queries,
late errors/unmount, retained callbacks, provider lock and new-sheet isolation.
Read/network/SQL boundaries are synthetic; no actual server was contacted.

```sh
python3 -m py_compile supabase/tests/attendance_credit_concurrency.py
```

Python syntax passes. SQL runtime was not run: no Docker/local Supabase/native
runtime in this container.

## CI / needs-local-db handoff for Claude

Existing workflow `.github/workflows/app.yml` already discovers the new pgTAP
file and runs the extended harness. Run against fresh synthetic local DB:

```sh
supabase start --workdir .
supabase db lint --local --fail-on warning --workdir .
supabase test db --workdir .
python3 supabase/tests/schedule_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_status_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_reschedule_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_request_resolution_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/attendance_credit_concurrency.py --container supabase_db_trainerApp
cd app && npm run db:types:check
```

Review `som_27_production_cancellation.test.sql`: both-role cancellation,
no automatic debit/attendance, current revision and explicit reason, permissions,
receipt/payload replay and one credit debit. Extended attendance harness verifies
same-request and competing-request penalties after cancellation by either role.
Existing reschedule/status/resolution races and pgTAP ownership/revision/group
isolation remain unchanged. No existing migration was edited.

## Unverified / owner acceptance

- Real SQL/RLS/Auth, generated drift and concurrency runtime: CI/needs-local-db.
- Real AsyncStorage/SQLite, network loss, process crash, persistent restore failure
  and reopen across process restart. Volatile fallback preserves exact replay in
  the current process if disk restoration fails; it cannot survive process death.
- Two phones, native gestures/keyboard/accessibility, large text, visual/parity
  across themes/states, and owner approval. No new screenshots committed.
- No cloud changes, real client data, paid services, whole-group cancellation,
  new debit/overlap policy or SOM-36/37/73 functionality.

Issue, screens and product stage are not accepted. See
[ADR 0092](../../../docs/app/decisions/0092-booking-command-session-and-recovery.md).
