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
