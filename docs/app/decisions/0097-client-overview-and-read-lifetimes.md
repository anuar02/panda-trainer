# 0097. Client overview aggregates and read lifetimes

Date: 2026-10-04. Status: implemented; SQL runtime and screen acceptance pending.
Scope: SOM-36, read presentation and existing SOM-27 commands only.

The authenticated connection Home already presents bookings and immutable plans,
but its controlled branch has neither financial totals nor progress. Progress
loads history page by page without retaining an outer JWT session. Client tab
entry routes still render the demo. Those gaps survive the prerequisite merges.

Use an additive `get_my_client_overview(uuid,date,date)` RPC rather than exposing
financial reasons/receipts to a new client adapter or duplicating money commands.
It reuses the existing active linkage context, checks `auth.uid()`, and reads one
stable snapshot. Remaining credit units and purchased capacity include expiry day;
debt includes expired purchases and compensating payment reversals. Aggregates
are canonical decimal strings, including sums above JavaScript's safe integer
range. Attendance groups only current `present` records by service date, within
an exclusive end date and a maximum 366-day period. At most 366 date groups are
returned; aggregate inputs are not silently capped. No booking/attendance/payment
writer or existing RLS policy changes.

Schedule and full-history Progress reuse the established program read fence:
JWT `sub` and `session_id`, explicit bearer, caller validation before dispatch and
after awaits, including rejected requests. History's existing session seam now
also validates JWT identity and rejects unknown response columns. Fixed bounds,
expected ID batches, duplicate IDs/positions and unknown relations fail closed.
A capacity failure is an error, never a successful truncated result. Hooks clear
shown data/errors synchronously on retry/auth events and own late completions.
Focus/unmount and account/workspace/card changes dispose the caller. Credentials
stay in transport closures, outside keys, state and logs.

Authenticated tab entries resolve a single linked card to its connection route;
unlinked or multiple-card accounts use the existing account selection screen.
No default card is inferred across trainers. Connected Home adds real aggregate
package facts and a real finished-history excerpt. Week controls fetch attendance
for the selected period. Exercise history preserves actual null/zero/grams and
seconds, including exercises without a ranked result; its list loads another 50
records on explicit request. The default prototype's best weight with its own
repetitions, four-week comparison and simple list remain; no general strength or
instrument-theme chart is introduced. Existing component styles and theme tokens
are reused; new navigation/drilldown states still require owner visual review.

SOM-27 owns canonical command identity, durable storage, validated receipts,
revision conflicts and recovery. SOM-36 composes those hooks/controls with the
real reads, refreshes after receipts and fences selections/navigation. It does
not infer success or attach a billing effect to cancellation. Finished corrections
appear only after explicit server apply and read refresh; clients never apply them.
Immutable program reads/assignment and the trainer-only result rule are preserved.

Migration `20261005033548_client_overview_reads.sql` is intentionally after the
base's already-applied `20261004110000` migration. At creation the actual UTC
clock was 2026-10-04 03:35:48, earlier than that base identifier. The new slot uses
the next UTC day's timestamp with seconds to preserve additive migration order
without changing or renaming any existing applied migration.

Evidence and runtime handoff:
[review](../../../app/review/09-som-36-client-production-r2/README.md).
Synthetic service/hook/screen tests do not establish live SQL/RLS/Auth, real
storage/crash/reopen, native parity/accessibility or owner acceptance.
