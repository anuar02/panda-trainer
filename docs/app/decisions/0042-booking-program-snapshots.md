# ADR 0042: Immutable session plans and recoverable creation

Date: 2026-10-02. Status: accepted implementation approach; screen acceptance open.

## Decision

SOM-26 stores a selected template as an immutable plan for each participant's
booking. `create_booking_set_with_plan` binds the template ID and expected
revision to the creation request. It copies the template name, description,
exercise metadata and planned values in the booking transaction. It does not
assign or replace a client's personal program.

The legacy `create_booking_set` remains a no-plan wrapper. Existing pending
commands remain readable and preserve their legacy payload. Selected-plan
commands retain the template and revision through durable save-before-send and
same-request retries. Receipt replay precedes validation of the current source,
so later template edits or archives cannot prevent recovery of a committed
creation. A changed payload cannot reuse its request ID.

Snapshot tables grant participants read access through visible bookings and
provide no authenticated direct writes. Server locks serialize workspace
creation and template changes; all participants receive coherent snapshots or
creation fails atomically. Calendar labels read snapshot names instead of the
current template or personal program.

The existing prototype editor accepts asynchronous creation and locks its
controls while a command is in flight. Hydration and pending recovery remain
scoped to account and workspace; storage failures block a new command. A
confirmed overlap warning is a non-creation result. Explicit acknowledgement
requires a new command; an uncertain response retries the original command.

## Boundaries

Local dates and times use the workspace IANA timezone. DST gaps and folds require
an explicit valid time rather than silently choosing an instant. Durations are
elapsed minutes. Native verification, Today, proposal workflows and owner
acceptance remain open. This package does not close SOM-26/27.

## Verification

Clean isolated database reset and schema lint pass. The database suite includes
34 new snapshot assertions (418 total across 13 files), covering isolation,
revision failures, atomicity, immutability and replay. Three real-connection races pass. The app check passes 660 tests across 75 suites;
13 synthetic browser checks verify participant creation, duration, selected plans
and immutable snapshots after template edits. Native and owner acceptance remain open.
