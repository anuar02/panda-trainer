# ADR 0047: Finished client history and complete date coverage

Date: 2026-10-02. Status: accepted implementation approach; runtime/owner acceptance open.

## Decision

SOM-36 connects finished history at `/connection/[clientRecordId]/history`, guarded
by the exact active connection. Safe projections return own finished journals,
immutable exercise snapshots, actual non-deleted results and shared notes.
Every request pins the account and checks scope and parent links. Private notes,
draft journals, peer results and author/device Auth IDs are not fetched.

Focus refresh and pagination hide obsolete account/card data. Failed later pages
retain successful pages and have a separate retry. Stable finished-time/ID ordering,
bounded parent counts and bounded child pagination prevent unbounded requests.
Duplicate or inconsistent pages are rejected rather than combined silently.

The existing history layout receives controlled read-only rows and a pagination
footer. It shows actual workout start, nullable/zero results and shared notes.
Replacement provenance marks the source exercise, preserving replacement results.
Unknown program/group/attendance/billing facts are omitted. Finished journals are
not treated as payments or attendance. Default demo remains isolated.

The initial date limits in ADR 0046 are superseded. Scheduling defaults to all
active upcoming own bookings without an upper date cutoff. History defaults to
all finished journals through pagination, including earlier years. Both readers
retain explicit paired bounded windows and reject a single missing bound. Limits
apply to page sizes, not product date coverage.

## Verification and limits

873 tests / 95 suites, TypeScript, lint, formatting and web/iOS/Android exports
pass. Tests cover safe projections, scope changes, earlier years, page recovery,
snapshot provenance and actual values. Capture/browser evidence is in the client
scheduling report. Docker Desktop is manually paused: the new synthetic history
browser flow and fresh schema/type-drift rerun have not run. No migration was needed.

Existing direct journal grants still permit audit UUID projections. Safe reader
columns do not claim to fix all API grants. Global privacy hardening, journal
mutations/sync, billing/progress, native/two-phone and owner approval remain open.
This package does not complete SOM-36 or SOM-32.
