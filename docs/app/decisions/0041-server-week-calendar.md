# ADR 0041: Server-backed week calendar

Date: 2026-10-02. Status: accepted implementation approach; screen acceptance open.

## Decision

SOM-26 exposes `/workspace/schedule` from the authenticated account. The existing
prototype calendar accepts a controlled data source, date navigation, names,
selection callbacks and working-hour free windows. The demo defaults remain.
Real bookings never enter demo mutation, journal or detail-sheet flows.

The read hook refreshes on focus and retry. Its scope includes account, workspace
and padded UTC week; moves within a week reuse the result. Cleanup and scope
checks reject old results after navigation, blur or unmount. Calendar labels use
UTC to format an already resolved workspace date key, avoiding another timezone
conversion for UTC+14 workspaces.

The controller remounts per account/workspace/timezone. It shows individual
participant statuses and cancels only the selected participant's booking.
Pending client proposals can be displayed but proposal replies and rescheduling
are still open. No workout status or program snapshot is invented.

SOM-27 commands persist before transmission in a strict user/workspace storage
slot. The same saved action, booking, revision and request ID can be resumed
explicitly after restart, lost response or cleanup failure. Unresolved or corrupt
storage blocks new commands. Pending controls remain visible if the calendar
read fails. Typed terminal errors are retained conservatively; an explicit
resolution flow is still open. A command never confirms or cancels a whole group.

## Boundaries

Creation is disabled in the real calendar. The current `create_booking_set`
accepts participants and time but no selected program/template or snapshot.
Enabling the prototype wizard now would silently lose its program selection.
The next server package must atomically preserve the selected session plan and
its revision with booking creation. Assigning a new personal program is a
different operation and must not be used as a substitute.

Today, complete creation, proposal commands, billing, native/accessibility and
owner acceptance remain open. This decision does not close SOM-26/27 or SOM-45.

## Verification

Async tests cover stale reads, focus, account switches, participant-only
cancellation, durable retries and storage failures. Adapter tests cover groups,
names, reply counts, proposal authors, timezone boundaries and free windows.
The existing demo calendar tests continue to pass.
