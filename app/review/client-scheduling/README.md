# SOM-36: selected client scheduling connection

2026-10-02. Synthetic local verification only; screen acceptance is open.

The real connection route uses the prototype client home layout with actual own
bookings, immutable program previews, proposal cards and explicit command recovery.
Confirmation, cancellation and reschedule replies target only the selected client
booking. Cancellation requires a confirmation sheet. Balance/progress remain
open. Default upcoming includes all future own bookings without a date cutoff;
finished history has safe all-time pagination. This is a partial SOM-36 integration.

History reader/hook/controller tests cover finished-only requests, prior years,
nullable/zero results, public notes, replacement provenance and stale scopes.
Full check: 873 tests / 95 suites, TypeScript/lint/format; web/iOS/Android exports
pass. Default home/history capture has 12 reference/app pairs, no missing states
or browser errors: `/tmp/screens/client-scheduling/history-parity/index.html`.
Capture is not owner approval of the connected screens.

Program connection checkpoint: 915 tests / 100 suites and all-platform exports
pass. The first upcoming snapshot with exercises is displayed, with the earlier
on-site note when needed; latest personal-copy fallback is used only without
upcoming bookings. Read-only detail uses snapshot targets and instructions without
demo results or guides. Six default program pairs have no missing states/errors:
`/tmp/screens/client-scheduling/program-parity/index.html`.

Client reader/hook/adapter tests pass (39 focused tests); the isolated schema passed
494 pgTAP assertions across 16 files before Docker was paused. Controls/controller
tests cover actor permissions, exact retries, stale accounts, cancellation locking,
outside-window requests and recovery while reads fail. Full checks and default
capture evidence are shared with `../workspace-scheduling/README.md`.

`verify.cjs` is syntax/format checked but has not run. It creates synthetic trainer
and linked-client accounts, verifies participant isolation and proposal lifecycle,
and cleans its scoped fixtures. Run after a fresh web export configured for an
isolated local stack:

```sh
node app/review/client-scheduling/verify.cjs \
  --workdir /path/to/isolated/workdir \
  --container supabase_db_trainerApp-som18 \
  --origin http://127.0.0.1:8088
```

Docker Desktop was manually paused during this package. Client browser verification,
native/accessibility, two-phone flows and owner comparison remain open. No production
data, remote Linear updates, push or release was performed.

## Resumed runtime and progress checkpoint — 2026-10-02

Docker resumed. Configured all-platform export and 951 tests / 105 suites pass,
along with TypeScript, lint and formatting. Six default progress pairs have zero
missing states or browser errors: `/tmp/screens/client-scheduling/progress-parity/index.html`.
The controlled progress route uses complete finished history for actual records
and 28-day deltas; incomplete history produces a retry, never partial metrics.

`verify.cjs` now passes all 29 checks: participant isolation, confirmation,
proposal lifecycle, cancellation, immutable program details, history predating
account linkage, shared/private note isolation, progress and account switching.
It provisions synthetic client Auth through local GoTrue admin API. No browser
errors; scoped database/Auth/mail cleanup succeeded. Screenshots include
`after-cancel.png`, `history-detail.png` and `progress.png` under
`/tmp/screens/client-scheduling/`.

These fresh checks supersede the earlier unrun runtime checkpoint. Native,
accessibility, two-phone and owner acceptance remain open; balance/attendance
integration and direct API audit-field hardening remain separate work.

## Privacy-grant regression — 2026-10-02

A fresh configured all-platform export and the migrated isolated stack pass all
29 client checks under explicit safe-column grants. History, program, progress,
participant isolation, proposal actions and account switching remain readable;
no browser errors occurred and scoped fixtures were cleaned up. This confirms
the runtime regression only; native and owner acceptance remain open.

## Pending-request resolution runtime — 2026-10-02

The final configured export passes all 34 client checks. Five new assertions
verify explicit UI resolution of a stored stale cancellation and reschedule
request: the server durably abandons each original request, pending storage is
cleared and neither booking status nor proposal data changes. A stored already
applied confirmation resolves through its original successful receipt with
`replayed: true` and an unchanged booking revision. Fresh proposal and
cancellation actions then complete normally. Cleanup removes the scoped private
abandonment rows before deleting fixtures. No browser errors occurred.
