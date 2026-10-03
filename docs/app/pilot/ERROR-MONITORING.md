# SOM-40: safe pilot error monitoring handoff

Implemented locally, disabled by default. This package does not complete SOM-40.
No project has been created, no remote event sent, no real client data used.
Configuration and backup tooling remain separate work packages:
[environment handoff](ENVIRONMENT.md), [backup runbook](BACKUP-RESTORE.md).
[ADR 0072](../decisions/0072-allowlisted-opt-in-error-monitoring.md),
[local evidence](../../../app/review/som-40-error-monitoring/README.md).

## Contract and integration

`app/src/features/error-monitoring/index.ts` exports a typed reporter, safe event
contract and `createErrorMonitoring(config, transport, clock?)` for injection.
`report(unknown)` resolves false for disabled/invalid/unknown/throttled/failing
inputs; it never forwards or logs raw errors. No retries, recursion, persistent
queue, auth hooks or user identity. Bootstrap is a process singleton, read once.
Its only consumer is `app/app/_layout.tsx`: a font error maps to the reviewed
`APP_FONT_LOAD_FAILED` code. No routes/provider/auth flow changes.

Existing configuration is `features/auth/client.ts` (literal Expo public env reads,
URL validation, null client when missing), `app/.env.example`, `app/app.json` and
`app/metro.config.js`; these files were studied and remain unchanged. Monitoring
owns its optional literal env reads and validates independently of Supabase.

## Privacy allowlist

| Field | Allowed values |
| --- | --- |
| message | exactly `APP_FONT_LOAD_FAILED` |
| level | fixed `error` |
| release | `panda-trainer@<semver>+<7–40 lowercase hex commit>`; each semver component 1–3 digits |
| environment | `pilot-synthetic` or `pilot` |
| tags.platform | `ios`, `android`, `web` |
| exception | optional fixed AppError/code, at most eight reviewed frames |
| frame | exact `app/app/_layout.tsx`, `RootLayout`, integer line 1–100000 |
| protocol header | generated random event ID, UTC send time, installed SDK identity, `infer_ip: never` |

All other fields are dropped, including nested/unknown payload, raw stack/message,
notes, phone/email/name, journal, request, URL/header/token, user ID, breadcrumbs,
contexts, tracing and attachments. Unknown codes are dropped, never used as a
fallback message. Config release/environment/platform are validated as well.
Frames are symbolic metadata supplied by reviewed code; arbitrary raw stack
strings are not parsed. Root bootstrap currently sends no stack frames.

The SDK is a dedicated client, never globally initialized. Integrations are empty;
PII/native crashes/native scope sync/automatic sessions/failed requests/native
frames/app hangs/log capture/metrics/screenshots/view hierarchy/stack parsing are off.
Breadcrumb limit, trace/replay rates are zero. SDK enrichments do not cross our
HTTP boundary: one event item is reconstructed, all other envelope types rejected.
No Sentry console capture, replay, profiling, transaction or source-map plugin.

## Configuration: keep disabled until cleared

Do not set activation values now. Later, after owner/specialist clearance, supply
these through an ignored local file or the approved build environment, outside git:

| Expo public variable | Required value |
| --- | --- |
| EXPO_PUBLIC_ERROR_MONITORING_ENABLED | exact `true` |
| EXPO_PUBLIC_ERROR_MONITORING_OPT_IN | exact `true`, deliberate operational opt-in after approval |
| EXPO_PUBLIC_SENTRY_REGION | exact `eu` |
| EXPO_PUBLIC_SENTRY_DSN | HTTPS public DSN: 32 lowercase hex key, `o<digits>.ingest.de.sentry.io`, positive integer project; no password/port/query/fragment/custom endpoint |
| EXPO_PUBLIC_ERROR_MONITORING_RELEASE | validated release above, from the immutable build commit |
| EXPO_PUBLIC_ERROR_MONITORING_ENVIRONMENT | start with `pilot-synthetic`; `pilot` requires legal clearance |

Platform comes from React Native, not a user identifier. Missing/invalid fields
mean no SDK import, client creation or HTTP call. Unknown future DSN shapes remain
blocked until explicitly reviewed. A valid EU hostname plus region flag is a
routing gate, not evidence of account residency. DSN is necessarily public in a
configured bundle; it is not a secret auth token. Do not commit actual DSNs or
credentials. Never put SENTRY_AUTH_TOKEN/service-role/access tokens in
EXPO_PUBLIC variables, source files or app bundles.

Local kill switch: unset enabled or opt-in and rebuild/restart. Values are embedded
by Expo, not a live remote switch. Cloud incident response must also disable/revoke
the dedicated project's public client key; an already installed build can still
attempt delivery. Never add auth tokens to this runtime adapter.

## Limits and delivery

At most five attempts per JS process, at least 60 seconds apart, one in flight.
Unknown inputs do not consume attempts; failures do. First delivery or lazy-import
failure opens the circuit until restart. HTTP 429/5xx/network/abort fail closed,
without automatic retry; timeout abort is five seconds. No offline storage and no
telemetry report of telemetry failure. No response body is inspected or logged.
Requests omit credentials and reject redirects. These bounds do not establish a
fleet-wide or monthly quota: restarts/devices multiply attempts.

ADR 0067 permits Sentry Developer free only. It has a monthly event allowance;
actual allowance, retention, feature access and EU availability must be checked
in the owner's current plan/account before activation. No numeric quota is assumed.
Record the verified limits in deployment evidence, configure available project/org
rate limits within that allowance and disable ingestion if exhausted; do not enable
paid overages, trials/upgrades or assume our per-process cap prevents exhaustion.
See [Sentry pricing](https://sentry.io/pricing/) and
[SDK options](https://docs.sentry.io/platforms/react-native/configuration/options/).

## Open cloud and legal actions

- Specialist approval for real data, infrastructure logs, IP/network metadata,
  international transfers, retention/deletion and the actual Sentry EU scope.
  `infer_ip: never` disables event IP inference; the network/provider can still
  observe IP, TLS/HTTP metadata or access logs. The adapter cannot erase those.
- Owner account: a separate EU organization/project and public DSN for this pilot;
  verify Free Developer plan, ingestion region, retention and limits. Do not assume
  Supabase EU Central config controls Sentry residency. EU organization details:
  [Sentry EU FAQ](https://www.sentry.help/en/articles/13964378-sentry-s-eu-region-faq).
- Enable server-side sensitive-data scrubbing and IP removal; review storage/log
  policies and use least-privilege access. Keep replay/tracing/logs/attachments and
  automatic paid features disabled. Capture no events before clearance.
- Future approved synthetic-only end-to-end test in the EU project: verify envelope
  ingestion, no user/request/context/breadcrumb/attachment/device enrichment,
  IP scrubbing, limits/429, and iOS/Android/web development and release builds.
  Current fake HTTP tests prove local projection only, not live Sentry behavior.
- Source maps: none uploaded here. Keep private maps as separate restricted build
  artifacts, never runtime bundle assets/public web deployment files. Auth token is
  a CI-only secret with minimum permissions, never bundled. A reviewed CI upload
  stage must bind exact release/commit, EU endpoint and verify map privacy before
  enabling upload. Existing production workflow is not run/modified.

[Expo Sentry guide](https://docs.expo.dev/guides/using-sentry/) describes the broader
integration; this package intentionally prepares only the isolated JS transport.
Native crash coverage and automatic symbolication remain unverified and disabled.

## Local verification

```sh
cd app
npm test -- --runTestsByPath tests/error-monitoring.test.ts tests/error-monitoring-sentry.test.ts tests/error-monitoring-bootstrap.test.ts
npm run check
npx expo install --check
```

All fixtures are synthetic. The SDK client is exercised with fake HTTP responses;
there are no real DSNs or outbound telemetry in the tests. Container limitations
and exact results are in the review report. Cloud, native, legal and owner approval
remain open; no screens are accepted by this package.

SDK upgrade constraint: the client/version are imported from the published dist/js
modules of pinned 7.11.0. The package root also imports tracing modules and starts
an unused cleanup interval; direct modules avoid that side effect. These subpaths
are implementation-sensitive: re-check isolation, type compatibility, export and
privacy tests before any SDK upgrade. No claim of a stable subpath API is made.
