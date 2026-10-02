# ADR 0039: Calendar adapters for server scheduling

Date: 2026-10-02. Status: accepted implementation approach; screen acceptance open.

## Decision

SOM-26 keeps the server booking identities and participant statuses in a separate
agenda model instead of converting real clients into demo person identifiers.
Group bookings combine only when their group and UTC interval match. A separately
moved participant remains a separate entry. Names remain server values; this
adapter supplies no invented program or journal data.

Agenda dates and minute positions use the workspace IANA timezone. An interval
ending at the next local midnight ends at minute 1440 on its starting day.
Free windows use the workspace working days (Monday is zero) and working hours,
merge overlapping or adjacent proposed/confirmed bookings, and ignore cancelled
bookings. Every gap is retained; the creation flow must check the chosen duration.

Local creation time conversion returns all matching UTC instants. DST gaps return
`nonexistent`, folds return `ambiguous`, and ordinary times return `unique`.
No occurrence is selected automatically. A future UI must handle these states
explicitly before sending a booking command. Resolution scans a bounded range
with one cached formatter; call it on submission, not on each render.

## Verification and limits

Focused agenda tests cover grouping, replies, midnight, interval union, working
hours and days off. Clock tests cover gaps/folds, fractional offsets, skipped
dates, historical second offsets and invalid input. Native conversion timing,
Today/week/create integration, visual parity and owner acceptance remain open.
No migration or product conflict-policy decision is included.
