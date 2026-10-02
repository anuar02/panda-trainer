# ADR 0044: Real Today agenda and trainer proposal controls

Date: 2026-10-02. Status: accepted implementation approach; owner acceptance open.

## Decision

SOM-26 connects the existing Today layout through controlled data, preserving its
demo route. The workspace timezone formats dates and times; UTC instants classify
past, ongoing and upcoming bookings, gaps and intersections. A focus-aware clock
refreshes once a minute and across midnight. Pending client requests include
bookings outside Today and open the matching real calendar participant detail.

SOM-27 exposes propose, counter, accept, decline and withdraw for one booking.
The screen uses the durable command lifecycle from ADR 0043. Status and proposal
commands share a mutual UI lock; recovery only waits for the other active request,
so two restored pending commands cannot deadlock their recovery buttons.

Bottom-sheet content receives the proposal store explicitly because portal content
may leave a local React provider. A regression test covers this rendering boundary.
No demo journal or billing actions are connected to real bookings.

The creation parity runner captures the prototype's invariant empty/loading/offline
states using its unchanged creation route. The reference images are byte-identical;
this fixes capture coverage without inventing new product states.

## Verification

Focused tests cover timezone/DST classification, clock focus and date rollover,
actual identity, selected participant navigation, command recovery, permissions,
mutual locks and the portal boundary. Browser and capture evidence is recorded in
`app/review/workspace-scheduling/README.md`. Native, two-phone behavior and owner
visual acceptance remain open; this package does not complete SOM-26 or SOM-27.
