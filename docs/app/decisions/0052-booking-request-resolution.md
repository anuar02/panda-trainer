# ADR 0052: Resolve saved booking requests safely

Date: 2026-10-02. Status: accepted technical implementation; native/owner acceptance open.

## Decision

A persisted booking status or reschedule request can become stale while another
actor changes the booking. Retrying remains safe, but a local discard cannot prove
that an earlier request did not succeed or is still executing.

Add authenticated resolution commands for the exact saved payload and request ID.
They share the workspace and booking locks with command execution. If an
actor-scoped success receipt exists, return its original result even after later
revision changes. Otherwise, record a private terminal abandonment for that exact
actor, command family and request. Later execution of an abandoned request fails;
resolution replay returns the same abandonment. A different payload cannot reuse
the request ID. Reschedule replies must still reference the same proposal scope.

The app validates the outcome, scope, canonical payload and successful result
before clearing local pending storage. Failed resolution or storage cleanup keeps
recovery available. Account changes cannot clear another account's request.
New edits use a new request ID after resolution and refreshed server reads.

Private receipts and abandonment records are inaccessible to client table reads.
No booking, proposal, program snapshot or attendance changes occur on abandonment.
The existing command APIs retain their signatures and authorization rules.

## Verification

The isolated database passes 610 assertions across 18 files, including 36
resolution assertions. Nine concurrency scenarios cover command-first and
resolution-first ordering, actor isolation, replay, and rollback. Schema lint
reports no warnings or errors. Full app check passes 991 tests / 107 suites,
TypeScript, lint and formatting. Headless client recovery passes 34 checks;
trainer regression passes 23 checks. Configured web/iOS/Android export and
generated type comparison pass.
Native and owner acceptance remain open.
