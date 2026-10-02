# SOM-36: first client scheduling connection

Scoping and implementation checkpoint, 2026-10-02. The safe read boundary is now
implemented; UI integration and complete SOM-36 acceptance remain separate work.

The two context/proposal RPCs, token-pinned reader, focus hook and UTC adapter pass
494 pgTAP assertions across 16 files and 39 focused app tests. Existing table RLS
and grants are unchanged. See [ADR 0045](../decisions/0045-client-schedule-read-boundary.md).

## Live scope

SOM-36 is Backlog with no duplicate relation. A live project search for client work
found SOM-36 as the existing integration issue; SOM-35 covers invitation/history,
SOM-24 personal programs and SOM-27 schedule mutations. Do not create another issue.
SOM-36 is blocked by SOM-34, SOM-35, SOM-27, SOM-58, SOM-32 and SOM-56, and blocks
SOM-48 acceptance and SOM-37 notifications. Its full scope includes home, billing
balance, completed results/history/progress, scheduling responses and API privacy.
A scheduling slice does not complete that issue or its owner acceptance.

Temporary existing rules remain: clients view completed journals, trainers enter
results. Draft journal visibility and client result entry still require decisions.

## Smallest independent slice

Add a client connection route `/connection/[clientRecordId]`, reachable from each
existing Account connection card. Validate the route against fresh
`list_my_client_connections` for the authenticated account and key the controller
by user plus workspace plus client card. Multiple trainer connections are an
accepted product rule; never choose an arbitrary first connection for a deep link.

The initial controlled ClientHome data should contain the client's own next and
upcoming bookings, actual booking status, pending proposals and immutable booking
program previews. Expose confirm only for proposed own bookings; cancellation and
proposal actions affect only that participant booking. Counter/accept/decline are
available only to the recipient; withdraw only to the current author. Reuse the
existing token-pinned status/proposal command lifecycle, per-account/workspace
pending storage and recovery panel. No create-booking, trainer calendar, program
assignment or result-entry controls belong in this client route.

Preserve prototype `c-home` hero, upcoming list, proposal wording, confirmation,
cancellation sheet and empty/loading/offline states. Add controlled props while
keeping demo behavior isolated. Do not show fictional package totals, progress or
history in a real-data route. Those sections need their actual read contracts and
separate verification before the complete home screen is claimed ready.

## Existing read boundary

- `app/src/features/onboarding/service.ts:8-13,28-57` already supplies connection
  cards through `list_my_client_connections`; the RPC exposes only own active card
  and workspace IDs plus trainer/client display names.
- `supabase/migrations/20261001190000_client_connections.sql:3-32` authorizes the
  connection list using `auth.uid()` and excludes archived cards.
- `supabase/migrations/20261001090000_identity_and_workspaces.sql:123-137` restricts
  workspace rows to owners; clients can read only their own client records.
  Therefore trainer `loadWorkspaceSchedule` is unsuitable: its availability read
  requires the workspace row and assumes trainer context.
- `supabase/migrations/20261001110000_schedule_foundation.sql:99-123` scopes booking
  reads to owner or own client card. Proposal reads follow that booking, but
  `author_user_id` is currently selectable. A client reader must not fetch that
  peer identifier merely to calculate responding role.
- `supabase/migrations/20261002100000_booking_program_snapshots.sql:63-83` already
  provides booking-program snapshots and exercise plans through own-booking RLS,
  with restricted column grants. These are the correct upcoming preview source;
  the owner-only template/catalog is not. Snapshot plans remain readable without
  opening unfinished journals or inventing client journal state.
- `supabase/migrations/20261001130000_client_programs.sql:84-101` allows clients to
  read their personal copies. Explicit safe columns are required; full rows carry
  audit fields. A client program screen should use copy snapshots, never fetch
  trainer template/catalog rows.
- `supabase/migrations/20261001140000_workout_journal.sql:214-266` permits clients
  only their finished instances/exercises/results/public session notes. Private
  notes and operation receipts remain owner-only. Existing pgTAP assertions at
  `supabase/tests/database/workout_journal.test.sql:124-131` cover own completed
  rows, no draft journal, no group peer results and no private notes. These were
  inspected here, not rerun in this scoping package.

## Minimal server addition

Prefer an authorized client schedule RPC accepting the client card and a bounded
UTC window. It must verify that the active card belongs to `auth.uid()` and return
only trainer/client display names, workspace timezone, own booking rows and
pending proposal rows with `authorRole` or `authoredByMe`. Omit owner, author,
creator, invitation, phone and other peer-account fields at the SQL projection.
This can combine context/proposals in one response or use two explicit RPCs.
Return all own pending proposals, including those outside the requested week,
with enough own-booking information to respond safely.

Booking-program plans can use existing RLS tables with exact safe projections and
bounded batches of own booking IDs. Do not broaden trainer-workspace or exercise
catalog RLS. Do not weaken finished-journal/private-note policies to obtain a
program preview. Avoid supplying group peer names/replies: the client only needs
its own booking's group flag and personal plan.

## Verification before connecting UI

Test the safe reader as linked client, foreign client, group peer, trainer and
anonymous caller. Verify no audit/peer identifiers in actual RPC JSON; a JavaScript
field deletion is insufficient. Cover multi-trainer/account switch, invalid deep
links, archived cards, bookings before invitation acceptance, outside-window
proposals and unchanged booking program after template edits. Browser flows should
exercise confirm, own-participant cancellation, proposal/counter/withdraw/recovery
and stale revision while proving peer participant records remain unchanged.
Owner comparison, native accessibility and the broader SOM-36 billing/history/
progress requirements remain open after this slice.
