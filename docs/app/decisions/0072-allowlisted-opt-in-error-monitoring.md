# 0072. Allowlisted opt-in error monitoring for the pilot

- Status: implemented locally; cloud activation and legal review pending
- Date: 2026-10-03
- Scope: SOM-40 monitoring package, ADR 0064/0067

## Decision

Use Expo SDK 57's compatible `@sentry/react-native` (7.11.0, installed through
`npx expo install`) behind `features/error-monitoring`. Disabled unless enabled,
opted in and all configuration validates. EU region and EU ingest DSN are separate
mandatory gates. No Sentry organization/project is created by this package.

Use a standalone `ReactNativeClient` with no integrations, without `init`, global
scope, `wrap`, automatic exception handlers or native SDK initialization. Its
transport is a one-shot HTTP adapter. Await `getTransport().send` directly:
the installed ReactNativeClient's `sendEnvelope` returns before delivery and
would hide delivery failure from our circuit breaker. Expo plugin and Metro
source-map integration are deliberately deferred to a separately reviewed build
workflow. The auto-added plugin from `expo install` was removed.

Accept unknown input but construct output from fixed code and frame allowlists.
Never forward exception objects, arbitrary messages or context. Reconstruct the
allowlist again at the HTTP boundary; SDK envelope headers and other items are
not forwarded. Generate random event identifiers and UTC send time as protocol
metadata; fixed SDK identity with `infer_ip: never` is included in the header.
Only APP_FONT_LOAD_FAILED is currently verified and integrated in the root layout.

Per JS process: at most five attempts, one in flight, at least 60 seconds between
attempts, no retries/queue/persistence. Any transport/import failure disables
reporting until process restart. HTTP abort after five seconds; redirects rejected.
These are local limits, not Sentry's monthly quota or a fleet-wide budget.

## Alternatives

Global Sentry.init/default integrations would capture unreviewed exceptions,
console/navigation/network breadcrumbs and device information. Broad regex
redaction cannot guarantee privacy of unknown nested inputs. Both are rejected.
A custom protocol-only sender would avoid the SDK, but retaining the supported
Expo SDK client gives an explicit compatible adapter without enabling capture.

## Consequences

Diagnostic detail and crash coverage are intentionally limited. Raw stacks are
never parsed; only pre-reviewed symbolic file/function and integer line metadata
are accepted. Native crashes and other features are not monitored. The root
layout reports a stable font failure code without the font exception.

An EU hostname cannot establish legal admissibility or eliminate IP/network logs.
The specialist must review infrastructure logs and Sentry's actual residency,
retention and account metadata before activation. Free-tier limits and server
scrubbing must be verified in the owner's account. No cloud or device verification
is claimed. See [handoff](../pilot/ERROR-MONITORING.md).

SDK upgrade constraint: the client/version are imported from the published dist/js
modules of pinned 7.11.0. The package root also imports tracing modules and starts
an unused cleanup interval; direct modules avoid that side effect. These subpaths
are implementation-sensitive: re-check isolation, type compatibility, export and
privacy tests before any SDK upgrade. No claim of a stable subpath API is made.
