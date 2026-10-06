# SOM-27: per-booking reschedule command design

02 October 2026. Coordinator-reviewed technical contract; implementation is in progress. This does not establish owner screen acceptance.
Live SOM-27 remains In Progress. Status commands exist; proposals, counters and acceptance do not.
No Linear writes were made.

## Established behavior

Sources: `trainer-crm-agent-plan.md:99–109`, ADR 0027 and ADR 0031,
`app/src/domain/scheduling/index.ts:322–402`, `prototype-fresh/js/store.js:165–265`.

Either party can propose. Original booking occupies its original interval until acceptance.
The other party can accept, decline or counter; the latest author can withdraw.
Counter changes the latest author and awaiting role. Duration is preserved; target must be
future, different from original start, and end no later than next local midnight.
Cancelled bookings and finished workouts are unavailable. Acceptance must not overwrite a
changed booking revision. Decline/withdraw do not change booking time or status.

Canonical product rule explicitly supports moving one group participant: detach that booking
from its group on acceptance, leave peers and old group untouched. Current prototype/domain
reject group changes because the scenario is unimplemented, not because the product forbids it.
Whole-group moves need a separate explicitly requested command and are outside this contract.
The booking ID and its immutable program snapshot stay unchanged through every move.
No automatic debit or late-cancellation fee is involved.

## Suggested RPC surface

All names below are proposed. Every mutation includes a caller-generated `p_request_id uuid`;
role and workspace are resolved from authentication and the linked booking, never supplied.

| Command | Additional arguments | Effect |
| --- | --- | --- |
| `propose_booking_reschedule` | `p_booking_id uuid`, `p_expected_booking_revision integer`, `p_proposed_starts_at timestamptz` | Create one pending proposal at revision 1; server derives end from booking duration |
| `counter_booking_reschedule` | `p_proposal_id uuid`, `p_expected_proposal_revision integer`, `p_expected_booking_revision integer`, `p_proposed_starts_at timestamptz` | Awaiting party replaces target and becomes latest author; proposal remains pending and revision increments |
| `accept_booking_reschedule` | `p_proposal_id uuid`, `p_expected_proposal_revision integer`, `p_expected_booking_revision integer` | Awaiting party moves booking atomically; increments booking and proposal revisions, marks accepted, detaches group member |
| `decline_booking_reschedule` | same three identity/revision arguments | Awaiting party marks declined; booking unchanged |
| `withdraw_booking_reschedule` | same three identity/revision arguments | Latest author marks withdrawn; booking unchanged |

Result should consistently contain `proposal_id`, `proposal_revision`, `proposal_status`,
`booking_id`, `booking_revision`, `booking_status`, `starts_at`, `ends_at`, and `replayed`.
The result is an immutable receipt of the successful command, not a fresh current-state read.
Transport must refresh separately after recovery. No peer booking IDs or auth user IDs in results.

The existing unique pending index is retained: counter updates one proposal instead of creating
another pending row. Existing statuses already support pending/accepted/declined/withdrawn/stale;
no separate counter status is needed because latest author and target express awaiting role.
A public read can derive authorRole without exposing author_user_id; existing schedule read
currently consumes author UUID internally to derive role, so a coordinated privacy view/RPC
change would be required before revoking that column.

## Locking, receipts and revisions

Use workspace → booking → proposal locking consistently with ADR 0027/0031. Resolve authorized
workspace first, lock it, then lock booking and proposal and recheck linked-client/owner access.
This serializes creation, status commands and all proposals, including simultaneous moves into
one interval. Template/program tables are never modified by rescheduling.

Private receipts keyed by workspace + actor + request_id bind command and exact argument
payload. Replay is checked after authorization and before current revision/status/future checks.
Same key with changed command, target or expected revisions returns 22023. Foreign known IDs
return P0002 without revealing existence; malformed arguments return 22023; stale versions
return 40001; cancelled/finished/nonpending state returns 55000; wrong responding role 42501.
Existing workspace+actor+request IDs in other command receipt tables do not collide unless the
coordinator deliberately chooses a shared schedule receipt namespace.

Every reply must match proposal revision, booking revision, and proposal.base_revision.
A status confirmation currently increments booking revision without advancing pending proposal
base_revision (unlike demo confirm). Thus a proposal becomes stale after confirmation. Prefer
explicit rejection and refresh over silently rebasing. This is consistent with the live issue's
revision criterion, but the app must explain it; preserving demo rebasing would require a
separate, explicit change to confirm_booking.

Do not mutate proposal to stale and then raise: a raised exception rolls that update back.
Either leave stale pending row and return 40001 (requiring author withdrawal or an explicit
replacement policy), or commit a typed stale result without throwing. This lifecycle choice
must be resolved in the final contract so an outdated pending row cannot block new proposals.
A recommended technical option is to let a fresh propose at current booking revision atomically
mark outdated pending proposal stale before inserting the new one; actor has booking access,
old notification opens current state, and no accepted booking is changed.

## Overlap scope

Coordinator reviewed the sources and selected prototype-compatible moves without introducing
an additional overlap approval flow. Reschedule commands preserve half-open elapsed intervals
and serialize under the workspace lock, but do not reject or require acknowledgment for
overlapping target bookings. Creation's explicit trainer acknowledgment remains unchanged.
This technical scope choice does not establish owner acceptance of screens or two-phone flows.

## Verification

pgTAP: both initiating roles; latest-author withdrawal; awaiting-party replies; repeated counters;
unchanged original occupancy until accept; unchanged status and duration; midnight/IANA bounds;
past/identical/malformed target; cancelled/finished guard; one pending proposal; stale booking
and proposal revisions; cancellation withdrawal; explicit stale replacement lifecycle; retained
program ID/fields; per-member group detachment without peer changes; foreign/unlinked/archive
identity access; direct DML and private receipts inaccessible; no peer/auth UUID leakage;
exact replay after subsequent counter/accept/cancel; changed-payload rejection.

Two-connection tests: simultaneous propose yields one pending request; accept versus counter or
cancel has one winning revision; identical accept retries replay original result once; two
moves competing for an interval follow the finalized overlap rule under workspace lock.
Clean reset, lint, complete pgTAP, generated types and app checks remain required. Two-phone
native scenarios and owner screen acceptance remain separate gates.

## Coordinator contract review, 02 October 2026

Implement prototype-compatible rescheduling without a new overlap gate. This is an explicit
technical scope choice; creation overlap acknowledgments remain unchanged. Do not claim a
new overlap approval workflow. Booking revisions are rejected stale without confirmation
rebasing. Fresh propose retires outdated pending rows atomically; current pending rows block
replacement. Latest author can withdraw a stale-base pending proposal using current booking
revision and exact proposal revision. Per-booking group moves detach only that participant.
