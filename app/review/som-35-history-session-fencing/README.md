# SOM-35 — client history after an authorization change

2026-10-03. Synthetic fixtures only. Base: fix/som-50-template-picker.

History service now checks an opaque session fence after context/parent/child
responses, before each child page and before final return. A same-user new login,
logout, foreign actor or unannounced token replacement rejects the whole read.
Only a same-user TOKEN_REFRESHED event advances a live fence. Every subsequent
child request uses the refreshed bearer. Tokens remain private in WeakMap state;
results/errors/React keys contain no credentials. Subscriptions are released on
standalone completion, blur, scope change, retry and unmount.

The hook holds one fence across first page/loadMore/retryMore. Authorization
changes clear visible pages and invalidate pending work; fresh login starts at
zero. A numeric generation resets the connected history detail even when the new
session returns the same journal IDs. Workspace is passed into the read seam and
validated before table reads. Existing all-time ordering/lookahead pagination,
pre-link history, null/zero, replacement provenance, finished-only requests,
public-note projection and foreign parent/workspace/card validation are retained.
Private notes and client linkage tables are never requested.

## Commands and evidence

```sh
cd app
npm test -- --runTestsByPath tests/client-history-service.test.ts tests/client-history-hook.test.tsx tests/client-history-connected-screen.test.tsx tests/client-history-session.test.tsx
npm run check
```

Final `npm run check`: exit 0; TypeScript, lint and format pass; 1582 tests /
152 suites pass. Focused command: exit 0; 68 tests / 4 suites pass.
`git diff --check` also passes. Behavioral regressions use
real service + real hook with deferred synthetic transport, alongside existing
service/hook/screen tests. Cases include same-user login between child pages,
exact final check, initial load and loadMore; missed auth event; logout/login;
same-session refresh; retry; workspace mismatch; foreign actor refresh; pre-link
2020 journals and public notes; unmount and late completion. Existing suites
cover other user/card scope, paging errors, replacement and null/zero results.

Linear SOM-35 and trainerApp project were read at session start. SOM-35 was
In Progress; existing invitation/history scope and SOM-21 dependency were reused.
No Linear mutations, comments or messages were made. Graft executable/index were
absent. Account-export was read only as an existing fencing reference; no change.

## Limits and acceptance

Docker/Supabase/browser/devices are unavailable in this environment. Live API,
SQL/pgTAP/RLS, native gestures/accessibility, real refresh provider timing,
invitation acceptance and two-phone flow were not run. Historical runtime
fixtures in ../client-scheduling/README.md are prior evidence, not fresh checks.
No real customer data, paid service, new dependency, image or migration was added.
Visual layout/text were unchanged; native/parity and screen acceptance require
owner approval. SOM-35 as a whole is not declared accepted or closed.

Decision: ../../../../docs/app/decisions/0076-client-history-session-fencing.md.


## Coordinator integration — 2026-10-03

Merged current base e6fbc63 (SOM-26 schedule read fencing); ROADMAP conflict
resolved by retaining both checkpoints. History ADR renumbered 0076 to preserve
schedule ADR 0075; references and decision index updated.

Fresh `cd app && npm run check`: exit 0, typecheck/lint/format passed,
155 suites / 1649 tests passed, zero snapshots (21.042 s).
`git diff --check` passed. Independent read-only review found no substantive
history defect; existing scope and runtime/native/owner limitations remain.
