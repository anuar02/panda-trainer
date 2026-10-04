# 0099. Push devices, leased Expo delivery and current due evaluation

- Status: implemented technical approach; runtime/owner acceptance pending
- Date: 04.10.2026
- Task: SOM-73 r3; implements owner-approved ADR 0065

Use Expo SDK 57 notifications/device modules installed via `npx expo install`.
Native lifecycle remains a separate controller/hook; auth provider is unchanged.
Existing logout awaits current-device unregister. Private RLS tables hold device
bindings and delivery state; narrow authenticated RPCs operate on the JWT owner/
session. A SecureStore installation capability permits startup cleanup across
account changes; only its hash is stored server-side. Conditional generations
prevent a late unregister or old invalid receipt from revoking a newer binding.
A persisted installation sequence/tombstone also rejects late server RPCs after
logout and exact replays without refreshing registration time.
Tokens and capabilities are neither feed payloads nor UI keys/log fields.

Consume the existing transactional SOM-37 feed and maintain one notification/
device logical delivery, bounded claims and leases, tickets/receipts, bounded
retry and generation-specific invalid-device cleanup. Sender failure after a
possibly accepted request is explicitly unknown. Expired send leases are not
automatically resent. This chooses visible ambiguity/possible non-delivery over
silently claiming external exactly-once semantics. The feed remains available.

Derive future reminder/summary jobs from current bookings instead of storing
future snapshots requiring changes to existing booking writers. Insert due feed
rows with recipient/workspace/event uniqueness, then revalidate reminder time,
status and relationship before claiming. Morning local time is an explicit
mandatory server parameter, not an invented owner choice. Empty days and missed
previous days are not backfilled. Late reminders are emitted only before start;
summary text includes only the current authorized confirmed-booking count and
opens the current schedule, without client names or private notes.

Alternatives rejected: sending from SQL triggers; a duplicate feed; replacing
booking/financial writers; cloud scheduler provisioning; new permission/settings
screens; retrying ambiguous send responses as if they were known failures.

[Technical contract and deployment handoff](../PUSH-V1.md) define exact lifecycle,
retry/ambiguity/recovery, scheduling limits, local commands and external checks.
Public generated RPC types are included. The new concurrency harness requires DB
and is not invoked by the unchanged standard workflow. Live Expo/EAS/APNs/FCM,
installed phones, SQL runtime, visual/accessibility and owner acceptance are not
established by implementation or synthetic checks.
