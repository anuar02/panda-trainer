# SOM-73: Expo Push v1 handoff

Implementation extends SOM-37 notifications; it does not replace the feed or
change booking, financial, journal or feed authorization writers. ADR 0065
includes push in v1; ADR 0067 limits deployment to free services. This document
is a technical handoff, not live delivery evidence or owner acceptance.

## Native lifecycle

SDK 57 modules `expo-notifications` and `expo-device` were installed using
`cd app && npx expo install expo-notifications expo-device`. The config plugin is
in app.json. Existing Constants, Crypto and SecureStore modules provide project
identity, random installation UUID/capability, and installation prompt history.
No custom permission screen is introduced. Only an undetermined system permission
with no previous prompt permits one native request. Persist the attempt before
requesting; denied/disabled states only use the feed. Android creates the default
channel before fetching an Expo token. Web, Expo Go, simulator and unconfigured
project adapters do not claim push readiness. Foreground and native token events
reconcile registration; ordinary JWT refresh preserves the same device generation.

Installation capability is random and stored in SecureStore; the database keeps
only its SHA-256 digest. The bearer determines the user and JWT session, never a
client-supplied recipient. A new controller reconciles the proven installation
before permission/token work, including denied permission and account switch.
A foreign user without the installation capability cannot overwrite or revoke a
device. Metadata RPC returns only own device UUID, platform and update time; raw
tokens and worker state have no authenticated/anon table grants. All three private
tables enable RLS. Tokens, capabilities and bearer credentials are not printed,
used in React keys, interpolated into UI errors, or put into review reports.

The controller serializes reconciliation, registration, rotation and cleanup;
SecureStore command sequence plus a private installation tombstone makes late
server RPCs and exact replay unable to resurrect or revoke a newer binding.
generations fence late registration and conditional unregister. Logout awaits
current-device removal before local Supabase signout. If the server cannot confirm
removal, logout fails using the existing auth error flow; retry with connectivity.
This prevents a successful logout from knowingly retaining a binding. An
unobserved externally revoked session or offline account switch cannot guarantee
instant server cleanup; next foreground reconciliation repairs it. A process crash
is repaired by capability reconciliation on the next authenticated startup. No
push readiness indicator or user setting screen was added.

Cold/warm open carries only version, workspace UUID and notification UUID, never
an arbitrary URL. Signed-out opens wait through the existing sign-in flow; after
auth, `open_push_notification` calls SOM-37's current relationship/target fence.
Native hooks fence relogin/unmount and late responses. Unknown/deleted/foreign
records show unavailable; network/invalid responses show an error. Cancelled
bookings are not replayed. Client opens its connection/booking; trainer opens
its current authorized schedule date. Daily plan opens the recorded workspace
day. Text/layout changes require owner review; no visual/native acceptance is
claimed.

## Scheduling and delivery guarantees

`PUSH_MORNING_LOCAL_TIME` is an obligatory `HH:mm` server parameter. The owner chose
**07:00** (workspace timezone) on 04.10.2026; set `PUSH_MORNING_LOCAL_TIME=07:00` for
the pilot. There is no implicit default and missing configuration fails closed.
No user configuration UI is introduced.

Each run evaluates current confirmed bookings, active relationships and workspace
timezone, then inserts due feed records atomically with unique recipient/workspace/
event keys. Reminders use booking UUID, absolute start epoch and recipient;
reschedule creates a new logical reminder while old due delivery is invalidated.
They become due at start minus two hours. A late run still reminds only before
start, using the honest text “within two hours”; missed already-started reminders
are skipped. A summary uses workspace local date and owner, picks the first
active confirmed booking as a safe feed target, and is emitted once per nonempty
day after the configured local time. A late run can emit that day's summary;
missed previous days and empty days are not backfilled. DST follows PostgreSQL's
IANA timezone rules. No fixed UTC-offset arithmetic is used. Existing feed
relationship policy remains authoritative, including archival of the anchor
client record. Summary body adds only the current authorized count of confirmed, active-card
bookings for the workspace day at claim time; it contains no names or notes.
Opening reads the current schedule; its count can have changed after sending.

There are no future stale job rows: future jobs are derived from current bookings
at each run. Pending reminders are rechecked before claiming for unchanged
start, confirmed status, active client and current recipient. Daily jobs expire
at the next local date. Once the HTTP request is in flight, cancellation, logout
or token rotation cannot retract it; its generic payload remains safe and its
navigation is independently authorized. The scheduler preserves historical feed
rows and never mutates feed/read policy.

Worker materialization is bounded to 500 missing notification/device pairs per
claim; notification time must be at or after that device registration. New or
rotated devices do not receive an old feed backlog. Logical deliveries are unique
per notification/device, with a captured device generation. Claims use row locks,
SKIP LOCKED, a fresh lease UUID and a two-minute lease. The handler processes at
most 20 claims, with at most five transport calls concurrently and a 15-second
transport timeout. Completion checks lease identity/state/expiry. Provider tickets
wait 15 minutes for receipts. Confirmed rate rejection uses exponential backoff
from 60 seconds, capped at one hour; at most eight claim attempts in each of the send and receipt phases.
A stored ticket starts the separate receipt attempt budget. Missing/transient receipts also retry within that bound. Permanent
errors fail; DeviceNotRegistered revokes only the matching generation. A receipt
“ok” means provider acceptance, not presentation on a phone.

**The guarantee is one logical database delivery, not exactly-once external
presentation.** Expo has no application idempotency key. HTTP timeout, malformed
response, lost ticket persistence or expired sending lease becomes `unknown` and
is never automatically resent. HTTP 429 or explicit MessageRateExceeded is an
observed rejection and may retry. A 5xx send response remains unknown. Expired
receipt leases are safe to re-poll using the known ticket. No synthetic success
substitutes for tickets, receipts or actual phone presentation.

Recovery: operators with database administration rights inspect only delivery
UUID/state/error_code/attempts/due_at (never tokens or request bodies). For a known
ticket, polling is safe. For `unknown` without a stored ticket, the provider result
cannot be reconstructed: keep it unknown or mark failed. Only with an explicitly
recorded operator decision accepting possible duplicate presentation may the
same delivery be reset to pending with cleared lease and due_at=now(); do not
insert another delivery or claim certainty. The feed remains available throughout.
Do not put token/credential values in operational logs or support reports.

## Local verification and deployment

No cloud resources, credentials or real recipients are needed for:

```sh
cd app
npm run check
npx expo install --check
cd ..
npx --yes deno check --config supabase/functions/push-v1/deno.json supabase/functions/push-v1/index.ts
python3 -m py_compile supabase/tests/push_concurrency.py
git diff --check
```

Jest executes the actual dependency-free worker source through TypeScript's
compiler with fake transport/store/clock. No test performs HTTP send. Tests cover
native SDK adapter/controller/hook, safe authorized routing, ticket/receipt errors,
rejection retry and ambiguous sends. SQL pgTAP covers device ownership/anon,
capability, rotation/logout, feed/delivery isolation, schedule/replay, timezone/
DST and lease state. The new independent concurrency harness checks competing
claims, one logical delivery and expired sending ambiguity.

With a disposable local Supabase database, the standard workflow runs SQL lint,
all pgTAP files and exact public-type drift. It does **not** automatically run
`notification_concurrency.py` or the new `push_concurrency.py`; run both explicitly:

```sh
supabase start --workdir .
supabase db lint --local --fail-on warning --workdir .
supabase test db --workdir .
python3 supabase/tests/notification_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/push_concurrency.py --container supabase_db_trainerApp
cd app && npm run db:types:check
```

Docker/local DB is unavailable in the implementation container. These commands
are handoff requirements, not local evidence. There is no newly invented local DB
PR gate; draft publication includes the implementation and synthetic checks.
Existing notification, booking and financial runtime limitations are not treated
as accepted by this work.

Deployment is not performed by this task. After synthetic/CI and owner review:
apply the additive migration; configure the existing EAS projectId through
`expo.extra.eas.projectId` (or EAS-injected Constants.easConfig), provision owner
APNs/FCM credentials, and rebuild installed iOS/Android with the config plugin.
No projectId, access token or worker secret is invented in repository config.
For the existing authorized environment, deploy `push-v1` with the Supabase CLI;
its config disables gateway JWT verification because the handler independently
requires POST plus the exact `PUSH_WORKER_SECRET` bearer. An absent secret rejects
all calls. Service-role URL/key are read only inside the server; never ship them
as EXPO_PUBLIC variables. `EXPO_PUSH_ACCESS_TOKEN` is optional for Expo enhanced
push security and is server-only. `PUSH_MORNING_LOCAL_TIME` must be configured.

Owner-operated schedule should call POST once per minute with the worker bearer;
no cron/cloud resource is created here. Serialize routine invocations; atomic
claims also support overlapping workers. Inspect HTTP status and the aggregate
processed count only. Failed configuration/storage returns 503 without provider
bodies. Use synthetic accounts/devices first. Live EAS/APNs/FCM/Expo transport,
installed builds, cold/warm OS behavior, revoked-permission behavior, accessibility,
parity and owner acceptance remain unverified.

Official API references inspected for the installed SDK 57 / Supabase client:
[Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/),
[Expo sending and receipts](https://docs.expo.dev/push-notifications/sending-notifications/),
[Supabase function authentication](https://supabase.com/docs/guides/functions/auth).
