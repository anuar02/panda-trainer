# 0098. Transactional notification feed and scoped Realtime invalidation

- **Status:** Implemented technical approach; SQL/runtime and owner acceptance pending
- **Date:** 04.10.2026
- **Task:** SOM-37, repeated publication r2

## Context

SOM-27 and SOM-36 are now merged prerequisites. Both roles need a real own in-app
feed, exact unread count, explicit read action and current-object navigation.
ADR 0061 excludes unfinished and private journal content. ADR 0065 places push
in v1 as separate SOM-73. An earlier summary without a remote implementation
or PR cannot establish completion.

## Decision

Use one additive migration with after-row event triggers on existing bookings,
proposals, the first finished transition and the immutable correction audit.
Existing command writers, receipts, locking and financial semantics stay intact.
A recipient/workspace/event unique key binds booking/proposal revisions, the
first finish or a correction request identity. Transaction rollback removes the
notification together with the command. No-op writes, accepted proposal status,
private-only correction and replay produce no extra event.

The event payload is exactly version 1, without free text or journal/payment
snapshots. All row columns are safe for recipient-only RLS and Realtime.
Current owner/active client relationships also gate historical rows. Only a
narrow definer read mutation can set a first read timestamp, with no unread reset.
The target definer repeats the exact same fence before returning safe current
booking metadata; this is necessary because clients cannot directly read the
trainer workspace timezone. No arbitrary target UUID is accepted outside an own
notification.

Read an at-most-50-row keyset page and exact whole-scope unread count in one
stable invoker SQL snapshot. Use the full server timestamp plus UUID for ordering
and continuation. `has_more` always exposes remaining data. Reconciliation reads
the first page, so earlier loaded pages must be requested again explicitly.
There is no total-row cap or silent truncation.

Subscribe only to INSERT/UPDATE. This table retains DEFAULT replica identity;
DELETE lacks the same recipient/RLS guarantee, as documented in
[Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes#receiving-old-records). Deletion/revocation is reconciled on foreground/focus/
reconnect; no foreign deleted-row keys enter the channel.

Treat Realtime as an invalidation signal. Each hook owns an isolated Supabase
client/channel using the existing auth client's verified identity and observed
same-session refresh. No global Realtime token is changed. Subscription/reconnect,
focus and foreground re-read the server; websocket payloads never overwrite rows
or read flags. Caller, session and scope generations fence late errors/results;
channel/auth/AppState listeners are disposed on unmount/scope change/logout.
Reuse the existing onboarding session fence for explicit-bearer RPC transport.
No auth-provider, dependency or tooling change is needed.

## Alternatives

- Command-writer changes would duplicate existing policy and replay logic.
- Optimistic unread counters and direct websocket merges cannot establish the
  server's whole-feed count and complicate ordering/read races.
- Push delivery inside these triggers would introduce external side effects
  outside the database transaction. It belongs to SOM-73's separate worker/receipt.

## Consequences and verification

Independent domain/controller/transport/hook/Realtime/feed tests use synthetic
fixtures. SQL pgTAP covers own/foreign/anon access, direct mutation denial,
command replay, rollback, finished/private correction visibility and read rights.
The new `supabase/tests/notification_concurrency.py` is a manual Claude/CI gate;
the current workflow does not invoke it. It observes concurrent command retry
and concurrent first-read row locking rather than treating sequential replay as
concurrency proof. SQL lint, pgTAP, this harness and generated-type drift need a
local database/CI; no database runtime was available in the implementation container.

UI uses the existing Sheet/Card/icons and role entry points. Expanded kinds,
read/count/more controls and the outdated canonical trainer subtitle are recorded
in OPEN-QUESTIONS. Native/parity/accessibility, two-phone Realtime and owner
approval remain open; this ADR does not accept the screens or issue.

Migration numbering: the container's actual UTC stamp is earlier than the latest
base migration (`20261004110100`). To preserve additive deployment order, the
new migration uses the next second `20261004110101`; no existing migration is
edited or renamed by this task. The upstream prerequisite renumbering was fetched
as base commit `32b7c75`, not introduced by this branch.
