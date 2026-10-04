# SOM-36 · Client production r2

Date: 2026-10-04. Branch: `agent/09-som-36-client-production-r2`.
Target: `fix/som-50-template-picker`. Screens and issue are not accepted.
Only synthetic accounts, names, requests, JWTs and storage/network seams are used.

## Base and coordination

Started with a clean branch at `b4101a4`, including SOM-27 PR #62 and SOM-34
PR #64. SOM-35 history/linkage, immutable program reads/assignment, SOM-32 finish
r2 and explicit corrections were already merged. There was no earlier SOM-36
implementation in this base; the old summary is not completion evidence.

`git fetch origin fix/som-50-template-picker` subsequently found SOM-21 r2
PR #65 merged at `9e0328c`. `git merge --ff-only origin/fix/som-50-template-picker`
updated this branch before the full check. The independent invitation-to-history
flow uses that fresh invitation adapter. Prior financial concurrency acceptance
is still external; this task neither repeats financial commands nor accepts them.

Read live Linear project `776db647-e846-4a27-99cb-2ade5be400bf` and SOM-36 with
relations: In Progress, no duplicate, blockedBy SOM-27/34/35/32/56/58; it blocks
SOM-37/48. Refreshed dependencies: SOM-27/34/35/32 In Review, no duplicate;
SOM-56/58 Done. GitHub merges satisfy the implementation prerequisite gate;
Linear review states do not establish screen acceptance. No Linear writes,
comments, project updates or messages to people were made.

`command -v graft` exited 1; `rg --files graft` reported no such directory.
Neither binary nor graph is available. Used targeted source reads/searches after
this absence was established. Read repository/app rules, workflow, memory,
README, roadmap, conventions, UI parity, data model, delivery map, open questions,
ADR 0007/0059/0061 and prototype task 4/5. Prototype and applied migrations remain
unchanged.

## Criteria and delivery

| Criterion            | Implementation and synthetic evidence                                                                                                                                                                                       | Still required                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Home                 | Real upcoming booking/status/snapshot plan and requests; exact aggregate remaining nonexpired credits, debt across all packages, finished-results excerpt; loading/error/empty/unlinked without demo fallback               | SQL/live read and visual/native/owner review                                                            |
| History/detail       | Existing linked pre-registration finished journals, actual sets/units and shared notes; JWT sub/session validation, unknown columns fail closed, caller before/after awaits; fresh read reflects applied correction data    | Live invitation/RLS and explicit correction apply runtime                                               |
| Progress             | Existing weight with its own reps, four-week delta; actual per-exercise history including null/zero and seconds; week selection reads only confirmed attendance; default prototype simple lists preserved                   | Native picker/navigation/accessibility and owner comparison; no instrument-theme/general-strength chart |
| Client commands      | Existing SOM-27 propose/counter/reply/status commands and durable canonical request identity; success refreshes actual reads; independent lost-response/reopen/exact-retry/counter/accept/cancel and revision-conflict flow | Real storage/crash/reopen/two devices and server concurrency                                            |
| Lifetimes and bounds | Actor/workspace/card/JWT/caller checks; explicit bearer; auth/retry/focus/unmount reset; late success/error cannot publish or continue reads; bounded pagination, duplicate/unknown/batch relation failure                  | Live Auth transport/storage lifecycle                                                                   |
| API/privacy          | Additive authenticated own-card aggregate RPC; no private ledger details in response; existing finished-only RLS preserved; new pgTAP invitation/financial/attendance/privacy/reversal checks                               | SQL/RLS runtime and generated drift in CI                                                               |

Authenticated client Home/History/Progress/Program tab entries now resolve to
server connection routes. A single card resolves directly; multiple or unlinked
cards use the existing account screen. No trainer card is silently selected.
History and immutable program contracts remain intact. Scheduling reads gain
JWT/caller fencing and bounded validation without changing SOM-27 commands,
rights, revisions or durable replay. Cancel does not invoke attendance, payment,
penalty or global group booking changes. Program updates, notifications and
trainer result writers remain outside this task.

Home package facts use existing package styles and theme; capacity is server
aggregate text, not the demo's package title. Progress visits use existing heat
styles and parity success tokens. New period/drilldown states and existing screens
still need prototype comparisons at 390×844, both themes, empty/loading/error,
native/accessibility and explicit owner approval. No screenshots or new PNGs
were committed. UI-PARITY acceptance status is unchanged.

## Independent tests

New suites use real domain adapters, read services, command hooks/coordinators,
connected screens and routes. Native modal/navigation and synthetic network/auth/
AsyncStorage seams are replaced; business readers and command protocols are not.

- `som36-client-full-flow.test.tsx`: invitation adapter → pre-link history;
  Home with actual schedule/coordinator/facts; exact money and weight/reps;
  selected week and actual exercise detail; null/zero-only exercise history;
  refresh after changed correction snapshot; 101-journal real pagination;
  unknown/private response rejection; wrong scope/precision; malformed JWT;
  late success/error after relogin; retry/card/unmount cleanup.
- `som36-client-command-flow.test.tsx`: canonical command persisted before RPC,
  synthetic commit then lost response, unmount/reopen, same-ID receipt replay,
  trainer counter proposal, accept/cancel with actual server readback and unchanged
  aggregate balance/attendance; conflict keeps exact pending identity.
- `som36-client-entry-routes.test.tsx`: four authenticated entries, logout,
  loading/error, unlinked and multiple-card account selection.
- Existing client/program/history/progress/SOM-27/financial tests remain in the
  full check, including recovery and revision rules. Existing session tests now
  use valid synthetic JWT identities; unknown private/audit columns reject the
  response instead of silently stripping them.

## Commands and results

- `git fetch origin fix/som-50-template-picker` and
  `git merge --ff-only origin/fix/som-50-template-picker`: passed; base `9e0328c`.
- `cd app && npm test -- --runTestsByPath tests/som36-client-full-flow.test.tsx tests/som36-client-entry-routes.test.tsx tests/som36-client-command-flow.test.tsx`:
  passed, 3 suites / 27 tests before the final two edge cases were added.
- `cd app && npm run check`: passed before the final two edge cases,
  220 suites / 2932 tests; typecheck, lint and formatting passed.
- Final `cd app && npm run check`: passed, 220 suites / 2934 tests; typecheck, lint and formatting passed.
- `git diff --check`: passed.
- `cd app && npm run db:types:check`: exited 1, `Type generation failed`.
  No Docker or running local Supabase exists. Generator-shaped public RPC type
  is included; this is not a successful generation or drift proof.

## SQL/CI handoff

Only new migration `20261005033548_client_overview_reads.sql` and new pgTAP
`som36_client_overview.test.sql`; no applied migration edits. The creation clock
was 2026-10-04 03:35:48 UTC, earlier than the base's applied
`20261004110000_exercise_replay_identity.sql`. A next-day timestamp with seconds
keeps the new migration after all applied files; see ADR 0097.

RPC is stable, security definer with `search_path=pg_catalog`, explicit own active
linkage through existing context and authenticated-only EXECUTE. One statement
aggregates all packages/credits/payments and bounded attendance day groups.
Numeric aggregates are decimal strings, including debt above JS safe integer.
There is no row cap on aggregate inputs and no mutation/replay protocol change.

New pgTAP checks invitation linkage and pre-registration finished history,
unlinked/foreign/archived denial, second-trainer separation, private/unfinished
notes, confirmed-only visits and empty periods, active versus expired packages,
exact bigint totals, payment/reversal readback and unchanged repeat reads.
It uses approved column reads under authenticated; no protected `to_jsonb(t)`
snapshots under that role.

Run in existing PR CI:

```sh
supabase start --workdir .
supabase db lint --local --fail-on warning --workdir .
supabase test db --workdir .
python3 supabase/tests/booking_status_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_reschedule_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/booking_request_resolution_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/attendance_credit_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/invitation_concurrency.py --container supabase_db_trainerApp
cd app && npm run db:types:check
```

Those runtime commands were not executed here. Existing workflow already runs
these gates; scripts/workflow/dependencies/tooling were not changed. New read-only
RPC introduces no payment or credit writer concurrency path.

Live SQL/RLS/Auth, pilot data, real SQLite/AsyncStorage crash/reopen, native devices,
two phones, browser/native parity/accessibility and owner acceptance remain
unverified. Client synthetic tests do not establish those properties. No release,
cloud/deletion/DNS/SMTP or paid-service work was performed.

## Publication

Implementation committed as `5314317`; `git push -u origin
agent/09-som-36-client-production-r2` succeeded. Draft
[PR #66](https://github.com/anuar02/panda-trainer/pull/66) was created with
`gh pr create --base fix/som-50-template-picker --draft --fill --title ... --body-file /tmp/som36-pr-body.md`.
Final pre-publication `npm run check` after synchronous caller cleanup passed
220 suites / 2934 tests. CI runtime results are pending at publication; screens
and issue remain unaccepted.

## Coordinator CI repair — 4 October 2026

CI run `37175058383` failed in the new pgTAP fixture at line 28: the
`private_notes.id` column requires an explicit UUID. Added a synthetic note ID;
the privacy assertions and production migration are unchanged. `git diff --check`
passed. No local application or SQL checks were repeated; fresh PR CI must verify
this repair and all database gates before merge.

Fresh run `37175262038` passed the first 18 overview subtests, then the privilege
introspection itself failed because authenticated has no private-schema access.
Replaced that introspection with an assertion that direct private receipt SELECT
is denied (`42501`). No grants or application behavior changed; `git diff --check`
passed and another fresh CI run is required.
