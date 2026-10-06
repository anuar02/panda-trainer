# ADR 0058: one workspace mutation coordinator across routes

Date: 2026-10-03. Status: accepted technical implementation; screen acceptance open.

## Context

Billing, cancellation, reschedule and creation each have durable command transport.
Independently mounted route hooks can retain different pending/busy states. Storage
prevents replacement within one domain but cannot block a different domain's action.
Today previously navigated to Schedule rather than opening its own participant sheet.

## Decision

Mount one user/workspace-keyed WorkspaceMutationProvider above the workspace Stack.
It owns the four hook instances and a synchronous lock. Every new command checks
all hydration/storage/invalid-pending/busy/pending states before its first await.
Exact owning resume or server resolution is serialized but may proceed when legacy
pending commands exist in another domain; clearing one never clears another.
Boundary wrappers reuse matching context and support standalone controlled screens.
Layout effects publish current guards and revoke old-scope callbacks on cleanup.
Underlying hooks suppress old async results; generations refresh retained reads.
Definitive reschedule conflicts now refresh reads while retaining recovery.

Extract status commands from Schedule and share participant sheets/recovery between
Today and Schedule. Today session/participant/overlap selection opens locally.
Recovery renders outside the selected sheet, so midnight or missing selection cannot
hide an unresolved command. Creation consumes the same coordinator; its successful
receipt triggers route navigation only while that creator is still focused.
No journal, purchase-creation or payment behavior is invented.

## Verification

1093 tests / 117 suites and type/lint/format pass. Fifteen additional tests cover
shared retained consumers/locking/legacy recovery/corruption/scope replacement,
status replay/resolution, midnight recovery and late creator navigation.
Web/iOS/Android export and 12 default Today/Schedule capture pairs pass without
missing states/browser errors; owner/native acceptance remains open.
Synthetic browser: local Today sheet → real charge with intentionally lost response
→ Schedule full navigation → identical payload/request replay. Local DB proves one
consume, one remaining credit and untouched group peer.
[Evidence](../../../app/review/shared-mutations/README.md).
