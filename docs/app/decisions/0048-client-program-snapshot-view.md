# ADR 0048: Client program snapshot view

Date: 2026-10-02. Status: accepted implementation approach; runtime/owner acceptance open.

## Decision

SOM-36 opens a selected connection's read-only program route. Following the exact
prototype, choose the first upcoming own booking with snapshot exercises. If an
earlier booking has no program, show its on-site note and the later planned session.
Upcoming bookings with no plans do not substitute a personal program.

When no bookings are upcoming, read the latest personal copy in the same
created-time/ID order already displayed by the trainer client detail. This is a
display convention, not a new active-program flag or assignment policy. Older
copies remain intact; no personal program mutation or archive is introduced.

Safe own-client context, explicit copy/exercise columns and pinned account tokens
protect reads. Focus and account/card changes hide obsolete results. A personal
read error blocks only a needed fallback; an available booking snapshot still
renders. The controller checks connection scope before displaying either source.

The existing program layout receives immutable plan ranges, nullable/zero weights,
rest, notes and snapshot instructions. It does not substitute demo exercise guides,
previous results, personal records or media. Schedule navigation retains the exact
connection. Default demo remains unchanged.

## Verification

915 tests / 100 suites, TypeScript, lint, formatting and web/iOS/Android exports
pass. Six default prototype/app program captures have no missing states or browser
errors. Reader/hook/adapter/controller tests cover identity, plans, source changes,
fallback/error rules and navigation. Synthetic program browser assertions are
prepared but unrun while Docker Desktop is manually paused. Native/two-phone and
owner comparison remain open. Direct API audit-column hardening is designed in
`docs/app/review/som-36-api-privacy-hardening.md`, not yet implemented.
