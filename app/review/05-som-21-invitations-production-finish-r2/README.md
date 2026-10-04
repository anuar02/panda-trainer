# SOM-21 · Invitations production finish r2

Date: 2026-10-04. Branch: `agent/05-som-21-invitations-production-finish-r2`.
Draft [PR #65](https://github.com/anuar02/panda-trainer/pull/65).
PR target: `fix/som-50-template-picker`. Owner acceptance remains open.

## Baseline and scope

Started from freshly fetched `cbd99c9`. Confirmed the issue mutation service still
used mutable `client.rpc` after async random and lacked caller session checks;
this was not already fixed by onboarding or invitation SQL. Fetched again and
fast-forwarded to `43e56b9` (merged SOM-23 editor #63), preserving all its fixes.
Final fetch also incorporated `b4101a4` (merged SOM-34 billing #64), preserving its
implementation and taking the next free ADR number 0096. No unmerged agent branch
was imported as a prerequisite.

`graft map` could not run: executable and `graft/` graph are absent. Source was
located directly after recording that limitation. No callable Linear connector
is available, so live project/issue/relations/duplicate reads were not refreshed.
The supplied SOM-21 brief and repository delivery map define this work. No Linear
writes, comments, messages, scripts/rules/main changes, cloud/DNS/SMTP changes,
paid services or real customer data were used. GitHub existing PR lookup for the
specified head returned an empty list before publication.

## Delivered criteria

| Criterion | Evidence/status |
| --- | --- |
| issue/reissue/revoke → copy/share → cold/warm route → login → explicit accept | Implemented with real RPCs and secure pending storage; route tests use actual invitation screens. No automatic acceptance on login and no demo success. Native links and provider login remain unverified. |
| caller actor/session and trainer workspace/card | Expected caller passed before random; JWT sub/session_id, getSession, Auth getUser, explicit bearer, abort and current guards. Owner/card proof precedes mutations; revoke additionally proves invitation/card binding. Scope follows card FK: invitations has no workspace_id column. |
| unknown-outcome replay/double taps | Live issue retains token/requestId; revoke retains requestId; accept reuses token and server replay. Cached success/error guarded; operation subscriptions disposed. No new persistent issued-link storage. |
| pending/lifecycle safety | Pending generation captured at accept/cancel entry; clear checks generation, token and current session. New same-token commands, new pending during read/remove, relogin, late error, unmount and native API entry covered by regressions. |
| invitation read transport/display | Bounded latest invitation, own workspace/card proof, exact card/invitation binding, strict UTC dates and bounded displayed text. Read errors remain generic and current. Existing onboarding connections/read and client history/program/progress APIs preserved. |
| server policy | Existing 7-day/one-time/immutable card binding and multiple trainer cards retained. No SQL or migration edits. Static inspection of existing pgTAP/concurrency described below; runtime pending CI. |
| checks/docs | Full app check and focused regressions recorded below; CHANGELOG/ROADMAP and ADR 0096 updated. |
| screens/issue ready | Requires owner approval. Visual/native/accessibility acceptance is open. |

The production link default uses `https://trainer.narutouzumaki.kz` (ADR 0064).
An explicitly configured env origin retains the existing validation behavior;
empty/invalid configuration still disables issuance. No hosting or app association
files were configured. A successful Share opening never represents delivery.
Already-started clipboard writes/system Share cannot be revoked; session changes
suppress completion and prevent later native API entry after async guards.

## Independent regressions

- `tests/invitations.test.ts`: original canonical token/link/issue/revoke/accept
  checks retained and adapted to required caller scope and explicit transport.
- `tests/invitations-session.test.ts`: random/Auth/session/owner/RPC await races,
  actor/workspace/card mismatches, wrong JWT, silent credential changes, verified
  refresh, cache, lost-response exact replay, malformed results/UTC, bounded own
  invitation reads and abort/late read failure.
- `tests/invitations-pending.test.ts`: protected storage/queue regressions,
  identity change during read, new intent during remove and storage failure.
- `tests/invitations-pending-hook.test.tsx`: independent pending read lifecycle,
  same-user relogin with late storage success/error, refresh, logout and unmount.
- `tests/invitations-routes.test.tsx`: real invitation screen controls and route
  callbacks, anonymous storage/login/explicit accept, neutral terminal/transient
  failures, issue/retry/copy/share/reissue/revoke, double tap, old finally, native
  entry/late completion, new warm token and new identical-token command.

Fixtures use synthetic UUIDs, tokens and names. These are transport/storage/native
seams, not evidence of real Auth, SecureStore, clipboard, Share or SQL execution.

## Exact commands and results

From repository root:

```sh
graft map
git fetch origin fix/som-50-template-picker
git merge origin/fix/som-50-template-picker
gh pr list --head agent/05-som-21-invitations-production-finish-r2 --json number,url,state,title
git diff --check
```

Graft: command not found; graph absent. Fetch/fast-forward succeeded; existing PR
lookup initially `[]`. Diff check passed.

From `app/`:

```sh
npm test -- --runTestsByPath tests/invitations.test.ts tests/invitations-session.test.ts tests/invitations-routes.test.tsx tests/invitations-pending.test.ts tests/invitations-pending-hook.test.tsx
npm run check
```

Final fresh-base results: **217 suites / 2905 tests passed**, typecheck, lint and
format check passed (`npm run check`, exit 0; Jest 25.515 seconds). Focused run:
**5 suites / 83 tests passed**, exit 0. Existing onboarding, client connection
context, client history/program/progress suites are green in that full run.
Earlier runs found and fixed
TypeScript nullability/test signature errors and React lifecycle lint/dependency
errors; no failed check is presented as final validation.

## SQL review and CI handoff

No database implementation defect requiring an additive fix was found. Reviewed
`supabase/tests/database/client_invitations.test.sql` (33 assertions) and
`supabase/tests/invitation_concurrency.py` (competing holders, reissue wins,
accept wins). They cover ownership, token hash/receipt secrecy, seven days, exact
issue/revoke/accept replay, replacement, revoke/expiry/invalid neutral error,
immutable claimed card, attached workout history and separate trainer cards.
No existing migration or SQL test was edited.

The existing `.github/workflows/app.yml` runs the database checks. On a machine
with Docker and the local Supabase stack, CI-equivalent root commands are:

```sh
supabase start --workdir .
supabase db reset --workdir .
supabase db lint --local --fail-on warning --workdir .
supabase test db --workdir .
python3 supabase/tests/invitation_concurrency.py --container supabase_db_trainerApp
cd app && npm run db:types:check
```

Status here: **needs-local-db**, SQL/pgTAP/concurrency/generated type drift not run.
CI must supply these results before merge; if unavailable or red, hand off to
Claude and do not merge. No manual merge was performed by this agent.

## Unverified acceptance

Live Supabase Auth/RLS/SQL, real secure storage/SQLite/files, crash/reopen,
clipboard/system Share behavior, hosting redaction, actual cold/warm Universal/
App Links and two devices are not proved. Browser/native visual comparisons,
all themes/states/large text, screen reader and accessibility are not run in
this container. No PNG was committed. Screen geometry/text is retained except
necessary async retry/sign-in disabling; this is not parity approval.
Only the owner can accept screens and close SOM-21. Existing connected history,
program and progress tests are included in the full app run; their implementations
and public APIs were not changed.
