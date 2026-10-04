# 0093. Booking status/reschedule session fencing and exact recovery

Date: 2026-10-04. Status: implemented; synthetic verification recorded in the
[SOM-27 review](../../../app/review/som-27-reschedule-production-finish/README.md).
Live SQL/Auth/storage and owner screen acceptance remain open.

## Decision

Reuse SOM-26's booking session fence for status and proposal commands. Capture
actor and caller generation before the first await, validate JWT `sub` and
`session_id`, and use explicit bearer headers. Verified refresh of that identity
is permitted; logout, same-user login, scope changes and unmount invalidate it.
Check identity before/after RPC, storage, returned errors and cached results.
Operation factories retain their original identity across retries; direct callers
can dispose their owned fence. Submissions dispose their fence in `finally`.

Keep existing user/workspace v1 pending keys and canonical payloads. Session
credentials and IDs are not added to storage, command payloads or keys. Optional
caller/client guards extend existing APIs. Before RPC, a bounded, authenticated
booking/proposal lookup verifies the exact workspace, client (when supplied), and
proposal-to-booking relationship. This is mutation validation, separate from
client schedule reads; those services/hooks are unchanged.

Status/proposal hooks invalidate retained callbacks immediately on auth events,
then hydrate a new generation. The shared mutation provider remounts its lock
and descendants for a new login, while verified refresh preserves them. Selected
client bookings and nested sheets are scoped to generation and booking/proposal
revisions, so late completion cannot dismiss another selection. A shared client
command boundary locks status and proposal submissions synchronously; its old
completion cannot release a new generation’s lock.

Persist the canonical command before mutation; never rebase an unknown outcome.
Clear only the matching request and canonical payload after a validated success
or validated succeeded/abandoned resolution. Unknown/malformed/foreign responses
retain pending. On failed cleanup or a session change during deletion, restore
only into an empty slot; never replace a newer command. A failed restore keeps an
in-process exact snapshot until storage recovers. It is not crash-proof storage:
if disk restoration also fails and the process dies, that volatile fallback cannot
survive. Device/crash tests remain required.

## Existing policy

Keep ADR 0031/0043/0052 and ADR 0059. Proposed time is separate from confirmed
booking until acceptance. Moving one participant preserves peers. Rescheduling
has no additional overlap rejection gate (ADR 0043); unit overlap and existing
SQL concurrency tests remain applicable. Cancellation has no automatic debit.
Late cancellation uses the unchanged trainer billing caller, with an explicit
reason and the current booking revision. Payments/reversal policy is unchanged.
No schema, migration, auth provider, dependency or read API changes are required.
