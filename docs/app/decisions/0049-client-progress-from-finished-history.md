# ADR 0049: Client progress from finished history

Date: 2026-10-02. Status: accepted implementation approach; owner/native acceptance open.

## Decision

The selected connection exposes read-only progress from its own finished journals.
Load every history page before calculating records; page failure, duplicate IDs,
changing context, nonadvancing offsets or more than 10,000 journals fail the read.
Partial history never produces global metrics. Account tokens remain pinned by the
history reader, with a final session check and focus/account/card invalidation.

Follow the prototype's exercise-name normalization and measurement grouping. Rank
actual sets by weight then quantity; unknown weight or quantity and nonpositive
quantity cannot establish a record. Recorded zero weight remains valid. Use the
journal's actual start in workspace time for daily series and the 28-day baseline.
Preserve recorded results on skipped/replaced rows. Future dates are excluded.
No attendance, billing, volume or estimated strength is inferred.

The existing default progress layout receives real records and deltas. Its default
variant has no chart or exercise selector; these are not added to the real screen.
The connection guard and controller reject another workspace or client card.

## Verification

Reader, focus hook, aggregation and connected screen tests cover pagination,
identity changes, null/zero results, real records and incomplete history rejection.
951 tests / 105 suites, TypeScript, lint and formatting pass. Configured web,
iOS and Android exports pass. Six default progress capture pairs have no missing
states or browser errors. Resumed trainer browser passes 23 checks; the client browser passes 29 checks, including history, program, progress and
account switching. Both runners report no browser errors and successful cleanup. Native and owner acceptance remain
open.
