# SOM-40 error monitoring: local evidence

[Draft PR #33](https://github.com/anuar02/panda-trainer/pull/33), target
`fix/som-50-template-picker`. Implementation commit: `78282f9`.

Date: 2026-10-03. Branch: `agent/som-40-error-monitoring`.
Starting commit: `08f0251` on the requested `fix/som-50-template-picker` base.
Before push, rebased onto `a1d87e7` after config/backup packages merged.
App source/tests/package files are identical to the locally checked implementation;
shared CHANGELOG/ROADMAP entries were combined, preserving upstream packages.
ADR 0070/0071 were taken upstream, so monitoring uses 0072.
This is the monitoring package only; SOM-40 and pilot readiness remain open.
[Handoff](../../../docs/app/pilot/ERROR-MONITORING.md),
[ADR 0072](../../../docs/app/decisions/0072-allowlisted-opt-in-error-monitoring.md).

## Scope

New isolated feature, three test files, five added lines in root app layout,
SDK dependency/lock, documentation and minimal changelog/roadmap entries.
Auth/config modules, trainer providers/routes, preload/outbox/journal/export,
SQL, UI/prototype/privacy documents, backup scripts/workflows and other pilot
configuration are unchanged. No new PNG or screenshots.

`graft` is not installed and no `graft/` graph exists in this checkout, so graph
orientation/build could not run. Linear tools are not installed; no live Linear
read was possible and no Linear records/messages/comments were changed. Scope
and dependencies use the supplied brief and repository ADRs/mapping. No services
were created, deployed or activated; no real client data or remote events used.

## Commands and results

From `app/` unless noted:

- `npx expo install @sentry/react-native`, then
  `npx expo install @sentry/react-native@7.11.0`: compatible SDK installed and pinned.
  Expo auto-added plugin was removed; `app/app.json` is unchanged. npm reported
  70 audit findings (11 moderate, 59 high) for the dependency tree. No unrelated
  dependency upgrades or automatic audit fix were applied.
- `npm test -- --runTestsByPath tests/error-monitoring.test.ts tests/error-monitoring-sentry.test.ts tests/error-monitoring-bootstrap.test.ts --detectOpenHandles`:
  39 tests / 3 suites passed; no open handles after avoiding SDK root imports.
- `npm run check`: exit 0; typecheck, lint, formatting and 1469 tests / 145 suites passed.
- `CI=1 npm run export`: exit 0; iOS/Android/web bundles and static routes exported.
  Expo emitted two expo-asset resolveAssetSource subpath fallback warnings. Static
  bundle compatibility only, not device/runtime or live Sentry verification.
- `npx expo install --check`: exit 1 from pre-existing Expo patch drift:
  expo 57.0.25 → expected ~57.0.26; expo-constants 57.0.19 → ~57.0.20;
  expo-router 57.0.23 → ~57.0.24. Sentry 7.11.0 has no compatibility warning.
  Existing framework packages were not changed within this task.
- Export artifact scan: zero `.map` files in `app/dist`. No source maps uploaded.
- `git diff --check` (repo root): passed.

Tests cover exact wire projection of synthetic names/email/phone/tokens/URLs,
headers/notes/journal/user IDs in top-level and nested/unknown objects; frame
limits and invalid metadata; cycles/throwing/changing getters; unknown errors;
invalid config/region/DSN/release/environment/platform; disabled bootstrap;
bounded reporting, clock regression, recursion/in-flight suppression;
synchronous/async transport rejection; 429/500/network failure and timeout abort.
The installed Sentry client is used in adapter tests. HTTP is fake and Expo UUID
is an explicit synthetic mock, so these tests are not live Sentry verification.

## Open checks and approvals

No Docker/local Supabase, browser or iOS/Android devices. No SQL/API/runtime,
Expo Go/native/release runtime, real Sentry ingestion or symbolication tested.
No account/project creation, EU cloud settings, monthly quota, retention,
server-side scrubbing, IP removal or network/infrastructure logging verified.
Source-map upload and CI-only auth-token handling are a future reviewed workflow;
no maps or tokens uploaded here. DNS/SMTP/backup/restore are outside this package.

Specialist review of infrastructure logs, international storage/transfers and
real data; owner cloud activation and native checks remain open. No screen is
changed or declared accepted. Default no-DSN behavior is covered locally; native
startup cannot be claimed from Jest/static export. The strict EU gate deliberately
blocks unreviewed DSN shapes. Per-process limits are not a monthly fleet quota.

## Coordinator verification

2026-10-03: current target base `a1d87e7` is already included, no conflicts.
Fresh `npm ci` and `npm run check` passed: typecheck/lint/format,
1469 tests / 145 suites. Relative report links and scoped diff checked.
GitHub run 37140881715 fails on pre-existing Expo patch drift and
`public.apply_operations` results initialization (text to jsonb, SQLSTATE 42804).
No SQL or framework upgrades made in this monitoring package.
Cloud/native/owner approvals remain open; local checks do not establish them.
