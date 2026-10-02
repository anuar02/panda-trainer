# ADR 0046: Selected connection scheduling controls

Date: 2026-10-02. Status: accepted implementation approach; runtime/owner acceptance open.

## Decision

SOM-36 opens `/connection/[clientRecordId]` from each Account connection card.
Fresh onboarding context must contain that exact active connection; an invalid
deep link returns to Account, and an unauthenticated link returns to sign-in.
The controller is keyed by account/workspace/card and checks the returned context.

The existing client home layout accepts controlled data while its demo behavior
remains isolated. Actual upcoming bookings, immutable program previews and all
pending own proposals supply the hero and request cards. Unsupported balance,
history and progress sections are omitted in this partial real-data route.
The initial booking window is 41 UTC days, padded around the current date;
all pending proposals are still read even outside that window. This bounded slice
does not claim the complete all-future client home requirement.

Client confirmation, cancellation and proposal replies use the shared durable
commands. Cancellation requires the prototype confirmation sheet. Responses bind
exact booking/proposal revisions; new actions lock while either command is pending.
Global recovery remains available during failed reads and only waits for an active
request of the other command type. Unknown outcomes retain the original command.
Bottom-sheet controls receive explicit stores and are keyed by booking ID.

## Verification

Controller and control tests cover participant scope, current-author permissions,
confirmation/cancellation, double submission, storage recovery, account/card changes,
outside-window requests, failed reads and mutual locks. Web export and default
prototype captures pass. The synthetic client browser script is prepared but has
not run because Docker Desktop is manually paused. Native, two-phone and owner
approval remain open, along with complete SOM-36 billing/history/progress.
