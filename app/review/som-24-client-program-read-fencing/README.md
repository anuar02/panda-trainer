# SOM-24 · Client program read fencing

03.10.2026. Base: `origin/fix/som-50-template-picker`, `4d308bc`.
Scope: client-program service/hook, module-local read helpers/tests, minimal docs.
Synthetic fixtures only. Public API compatible; UI/text/no-program/not-found
semantics and immutable assignment behavior retained. No writes to program copies.

## Context and integration

- `graft map`: not run successfully, command unavailable (exit 127). Used exact
  brief paths and module/helper/schema references; graph build unavailable too.
- `git fetch origin` and `git rev-list --left-right --count HEAD...origin/fix/som-50-template-picker`:
  clean fresh base, `0 0` before edits; no unmerged branch dependencies.
- Read live Linear SOM-24 and trainerApp project/resources/relations. SOM-24 is
  In Progress, no duplicateOf; recorded historical dependencies include SOM-23
  and SOM-55. Current owner brief and repo confirm immutable-copy decision.
  Linear was not modified; no comments/messages sent.
- Required integration order is after invitation read. This fresh base has
  invitation service from `052f249` and no separate invitation-read fencing
  package. Draft review can proceed independently; merge sequencing remains
  with coordinator. No invitation code or unmerged branch was imported.
- Workspace-programs assignment belongs to Third and was not changed.

## Implemented criteria

- [x] Logical read snapshots expected actor/client input, pins JWT session_id and
  initial bearer explicitly on context/program/each line page. Auth subscription
  starts before initial getSession, guards run after responses and before
  result/error, subscription always disposed. Logout, same-user relogin, actor
  switch, silent token replacement and invalid caller ticket fail closed.
- [x] Only verified TOKEN_REFRESHED for same actor/session identity permits
  token rotation; initial bearer remains pinned for whole read. JWT decoding is
  lifecycle identification, not signature verification or RLS replacement.
- [x] Hook auth epoch hides/reset old data, scope layout guard, late success/error
  rejection, synchronous retry ticket, blur/refocus and unmount cleanup. Keys,
  snapshots and typed errors contain no credentials or upstream error payloads.
- [x] Latest `created_at DESC,id DESC,limit(1)` intentional. Pages 25 with maximum
  50 lines and overflow probe; unknown response is not empty success. Foreign
  relations, duplicate row/source exercise/position, invalid IDs/revisions,
  schema unit regex/bounds, text lengths and invalid calendar UTC rejected.
  Unit strings are not coerced; SQL permits zero/leading zeros and unordered
  ranges, so no additional product validation is invented. Null/zero lossless.
- [x] Existing client program and assignment regressions retained.

## Commands and results

- Targeted command:
  `cd app && npx jest --runInBand tests/client-program-service.test.ts tests/client-program-hook.test.tsx tests/client-program-read-session.test.ts tests/workspace-programs.test.ts tests/workspace-program-assignment.test.tsx tests/client-program.test.tsx tests/client-program-connected-screen.test.tsx tests/client-program-adapter.test.ts tests/controlled-client-program.test.tsx`
  Result: **118 tests / 9 suites passed**.
- Final `cd app && npm run check`: **passed: typecheck, lint (zero warnings), format and 1850 tests / 162 suites**.
- `git diff --check`: passed.

New cases cover relogin between context/program/lines and final session guard,
logout/foreign actor, verified refresh/silent replacement, expected session,
invalidated caller, 25/50/51 lines, foreign relations, malformed/duplicate/unit
bounds/UTC, unknown pages, no program, zero/null, old error fencing, retry/focus,
auth data hiding, unmount guard and unsubscribe. Existing screens/adapters and
assignment tests are included in targeted and full suites.

## Not checked / acceptance

- [ ] Docker/Supabase SQL/pgTAP/RLS/live API/live auth and actual refresh expiry.
- [ ] Browser, native devices, UI parity, accessibility on devices, two devices.
- [ ] Real storage crash/recovery, real customer data (none used), paid services.
- [ ] Owner acceptance of screens and whole SOM-24; issue not declared Done.

No SQL/types/dependencies/prototype/routes/screens/auth provider/assignment or
other feature module changes. No new PNG. ADR 0080 documents local read approach.
