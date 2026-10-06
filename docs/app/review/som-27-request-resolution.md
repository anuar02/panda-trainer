# SOM-27/36: saved booking request resolution

2026-10-02. Continuation of the interrupted local changes; three workers handled
database review, application recovery and headless runtime verification.
Live Linear was unavailable, so scope came from the current ROADMAP checkpoint
and DELIVERY-PLAN. No remote status, comment or project update was written.

## Behavior

Both roles can resolve a saved booking status or reschedule operation. The server
returns the original actor-scoped receipt when execution succeeded. Otherwise it
permanently abandons the exact request under the same workspace lock used by
execution. Later execution cannot race past abandonment. A new operation requires
a new ID. Resolution preserves booking state, snapshots and attendance.

Transport binds the signed-in actor and validates workspace, booking, request,
canonical payload, outcome and successful receipt before clearing pending storage.
Storage failures and invalid or lost responses retain retryable recovery. Hooks
lock duplicate actions and ignore stale account/scope completions. Trainer status
recovery uses the same boundary as client status and shared proposal recovery.

## Verification

- Isolated `trainerApp-som18` migration applied; `supabase test db` passes
  610 assertions / 18 files, including 36 resolution assertions.
- `supabase db lint --fail-on warning` reports no schema errors or warnings.
- `booking_request_resolution_concurrency.py` passes nine scenarios, including
  command-first receipts after later revision changes, resolution-first denial,
  actor isolation and rollback.
- Generated database types match the isolated schema.
- Focused application checks pass 157 tests / 10 suites and TypeScript/lint.
- Headless client runner passes 34 checks: stale status/proposal abandonment,
  successful status replay, durable tombstones, pending cleanup, fresh actions,
  program/history/progress reads and participant/private-data isolation.
- Trainer runner passes 23 checks under restricted audit-column grants. It
  explicitly reopens refreshed booking details after proposal submission.
- Configured Expo export passes web, iOS and Android. Synthetic invitation links
  use an HTTPS base; Metro cache was cleared after the environment changed.

Full app check passes 991 tests / 107 suites, TypeScript, lint and formatting.
Invitation-history runtime passes 43 checks, including signup/link to existing
history, unchanged journal IDs, replay and authenticated other-claimant rejection.
Screenshots and JSON
runtime artifacts remain under `/tmp/screens/` and are local evidence.

## Remaining acceptance

Native sheets, accessibility, two-device behavior, production invitation domain
and owner visual acceptance remain open. SOM-36 still depends on production
journal and billing integration; this package does not close the full issue.
No production data, push, deployment or release was performed.
