# SOM-26/27/36: real scheduling controllers and recovery

Verified 2026-10-02 with synthetic local data only.

- Previous creation checkpoint: 660 tests / 75 suites. Combined working-tree check (including the next history foundation): 855 tests / 94 suites, TypeScript, lint and formatting pass. Web/iOS/Android exports pass.
- Fresh configured web export succeeds and includes `/workspace/schedule` and `/workspace/new`.
- `verify.cjs`: 13 headless Chrome checks pass. The trainer opens the calendar
  from their account, sees chronological real bookings and participant names,
  and cancels only one group participant. The existing wizard creates a 75-minute
  proposed group session for two real participants with a selected template.
  SQL verifies one immutable program/exercise snapshot per booking, original
  template revision and planned values; editing the source preserves both snapshots. SQL confirms that participant is
  cancelled by the trainer and the other remains confirmed. Reload preserves
  the result; week navigation removes/restores the correct bookings. No demo
  clients, demo journal navigation or unexpected browser errors were observed.
- Storage/lifecycle tests cover save-before-send, lost-response and cleanup
  failure replay, unresolved/corrupt command protection and account isolation.
  Controller tests cover cancellation payload, recovery and stale completion
  after account change/unmount. Read tests cover focus/retry and stale weeks.
- Calendar adapter tests cover names, group intervals, cancellations, proposal
  authors and timezone boundaries. UTC+14 date labels have a regression test.
- Creation transport also recovers after synchronous configuration/client
  lookup failures; two regression tests pass.
- Six prototype/app demo-calendar pairs were captured across normal, empty,
  loading, offline and dark/light states, with no missing states or browser
  errors. Temporary report:
  `/tmp/screens/workspace-scheduling/parity/index.html`.
  The normal pair still differs in the confirmation check icon; capture is not
  proof of exact visual parity or owner approval.
- Real calendar screenshot:
  `/tmp/screens/workspace-scheduling/schedule-after-cancel.png`.
  No new PNGs were added to Git. Synthetic Auth/Mailpit and database fixtures
  were cleaned up. Only the separate `trainerApp-som18` stack was used; the
  main stack was not reset.

- Clean isolated reset, schema lint and generated type drift check pass.
  All 418 pgTAP assertions across 13 files and three booking-plan concurrency
  races pass. Named-column grants hide snapshot creator Auth IDs.
- Creation component/hook tests cover async locking, saved multi-client recovery,
  storage failures, explicit overlap acknowledgement with a new command and
  UTC conversion with DST ambiguity/gap rejection.

- Current default demo captures: 24 reference images and 24 app captures for
  Today, calendar, creation and client home across dark/light and normal/empty/
  loading/offline states. No missing comparisons or browser errors. Report:
  `/tmp/screens/workspace-scheduling/connected-scheduling-parity/index.html`.
  Creation reference states are byte-identical: its prototype route has no scenario
  branch. Runner coverage now captures those invariant states instead of inventing
  new creation screens. Captures do not establish visual parity or owner approval.
- Trainer proposal browser extension reached the final decline stage, then failed
  synthetic cleanup because proposal rows were omitted. Cleanup is fixed. A later
  run timed out opening/submitting the nested reschedule sheet; readiness checks
  were added, but the rerun could not start because Docker Desktop was manually
  paused. This remains an unresolved runtime check; no successful extended-flow
  browser count is claimed.
- Today/controller tests cover real identity, midnight/focus refresh, UTC gaps and
  overlaps, selected-session navigation and requests outside Today. Proposal tests
  cover actor roles, durable recovery, mutual locks and explicit stores across the
  bottom-sheet portal. Client controls/controller evidence: `../client-scheduling/README.md`.

## Reproduce

Start an isolated Supabase workdir with the current schema. Export web with its
loopback URL and public key; serve `app/dist` on loopback with extensionless
routes mapped to their exported `.html` files. Then run:

```sh
node app/review/workspace-scheduling/verify.cjs \
  --workdir /path/to/isolated/workdir \
  --container supabase_db_trainerApp-som18 \
  --origin http://127.0.0.1:8088
```

The script creates a synthetic trainer and fixtures and cleans them on both
success and failure. It requires Docker, Mailpit and installed headless Chrome.
The parity test server handles optional favicon requests with 204 while other
missing resources still produce failures.

## Open

Today, trainer/client proposal controls and client status UI are implemented but
runtime/owner acceptance remains open. Terminal pending-command resolution, whole-group
actions and billing remain open. Creation is enabled with immutable server snapshots. Native/accessibility, two-phone scenarios and owner visual
acceptance remain open. SOM-26, SOM-27 and SOM-45 are not complete.
