# ADR 0043: Revision-checked per-booking rescheduling

Date: 2026-10-02. Status: accepted implementation approach; screen acceptance open.

## Decision

SOM-27 provides propose, counter, accept, decline and withdraw commands for one
booking. Original time remains occupied until acceptance. The latest author may
withdraw; the awaiting party may counter, accept or decline. Every mutation binds
expected booking and proposal revisions to an actor-scoped request ID. Private
receipts return the original successful result after later changes. Authentication
and booking access are rechecked before replay; a changed payload cannot reuse
its request ID.

Workspace → booking → proposal locks serialize competing commands with creation,
confirmation and cancellation. Stale proposals cannot overwrite a changed booking.
A fresh proposal at the current booking revision may retire an outdated pending
proposal atomically; confirmation does not silently rebase it. The latest author
may withdraw a pending stale proposal with current booking and proposal revisions.

Acceptance preserves duration, status, booking ID and immutable program. Moving
one group participant detaches only that booking and leaves peers unchanged,
following the canonical product rule. Whole-group actions remain separate work.
Targets follow prototype rules: future, changed start and no later than next local
midnight in the workspace timezone. No additional overlap gate or automatic debit
is introduced into the prototype reschedule flow.

Before detachment is enabled, immutable creation receipts preserve original group
and participant IDs. Existing anchors are backfilled while membership is intact.
Creation replay retains the legacy empty-overlap warning contract and does not
reconstruct participant IDs from mutable membership. The original implementation
moves to a private function with authenticated execute revoked; both public
creation entry points use the receipt wrapper.

Transport pins the authenticated account token, validates command/result identity
and revisions, and persists an exact command before sending. Unknown outcomes,
malformed results and cleanup failures retain it. Recovery repeats that command;
it never substitutes current revisions into an unresolved request.

## Verification

Clean isolated reset, schema lint and generated types pass. All 469 pgTAP
assertions across 15 files pass, including creation replay after both detached
participants, private grants, stale revisions, group isolation and source archive.
Three new rescheduling races and existing creation/status races pass. Forty-four
focused transport/recovery/integration tests pass. App screen integration and
native/two-phone/owner acceptance are separate gates recorded in the review report.
