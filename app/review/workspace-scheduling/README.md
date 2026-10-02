# SOM-26/27: real week calendar and status recovery

Verified 2026-10-02 with synthetic local data only.

- `npm run check`: 660 tests / 75 suites, TypeScript, lint and formatting pass.
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

- Calendar/creation capture: 12 reference states, 9 app captures, 3 missing
  creation empty/loading/offline comparisons, no app browser errors. Report:
  `/tmp/screens/workspace-scheduling/creation-parity/index.html`. These missing
  states and visual differences remain acceptance work; captures do not approve screens.

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

Today, rescheduling/proposal replies,
terminal pending-command resolution, client status UI, group actions and billing
remain open. Creation is enabled with immutable server snapshots. Native/accessibility, two-phone scenarios and owner visual
acceptance remain open. SOM-26, SOM-27 and SOM-45 are not complete.
