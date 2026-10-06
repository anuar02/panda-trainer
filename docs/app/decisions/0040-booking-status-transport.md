# ADR 0040: Booking status command transport

Date: 2026-10-02. Status: accepted transport approach; UI acceptance open.

## Decision

SOM-27 uses the existing `confirm_booking` and `cancel_booking` RPCs for individual
bookings. An operation snapshots action, booking ID, expected revision, request
ID and expected user. Each attempt checks the current account and pins its token
to that RPC. Shared in-flight execution and cached success prevent duplicate
submissions; failed attempts release the promise so the same command can retry.
This includes configuration failures before the first asynchronous boundary.

Responses must identify the requested booking, increment the expected revision
exactly once, supply a replay flag and match the requested action. Conflict,
invalid state, invalid input and access failures have typed error codes. A lost
response repeats the original request ID and payload, allowing server receipts
to recover the result.

## Verification and limits

35 focused transport tests cover authentication, snapshots, shared execution,
receipt replay, malformed results, SQL failures and recovery after synchronous
configuration failures. This package adds no schema changes. Durable storage
across restart, rescheduling/proposals, whole-group actions, billing and UI
integration remain open, as do two-phone and owner acceptance.

## Continuation 2026-10-02

Durable storage/submission and trainer participant cancellation are implemented
in [ADR 0041](0041-server-week-calendar.md). Pending commands survive restart and
are resumed explicitly; terminal error resolution, client confirmation UI and
the remaining group/rescheduling/billing scope are still open.
