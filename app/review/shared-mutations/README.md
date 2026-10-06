# Shared workspace commands and real Today attendance

Date: 2026-10-03. Branch: `fix/som-50-template-picker`.
Implemented package; SOM-33/26/27 and owner screen approval remain open.

## Behavior

One user/workspace-keyed coordinator sits above workspace Stack and owns billing,
status, proposal and creation hooks. Cross-domain command guards and synchronous
lock protect retained routes; every pending/storage/hydration error blocks new writes.
Exact recovery remains serialized and separate from new commands.
Today opens its selected participant sheet locally; Schedule shares those controls.
Recovery is outside the sheet and survives missing bookings/midnight. Generation
refreshes retained schedule/billing reads. Creator suppresses late navigation after
leaving while shared provider remains mounted.

## Checks

- `npm run check`: **1093 tests / 117 suites**, strict typecheck/lint/format.
  New tests: 5 coordinator, 8 status-hook and 2 route cases. Existing cancellation,
  creation, proposal and attendance cases retained; fake test IDs updated to valid
  command UUIDs and domain fixtures reflect the shared coordinator.
- `npm run export`: web/iOS/Android succeeds. Schema unchanged.
- `SCREENS=t-today,t-schedule node scripts/parity.mjs`: **12 reference + 12 app
  captures**, no missing comparisons/browser errors, 390×844@2x, accepted false.
  Default reference behavior is preserved; captures do not establish native approval.
- Synthetic headless browser with isolated local Auth/Supabase: Today group selection
  keeps `/workspace/today` and exposes real participant attendance controls.
  First `mark_attended` completed on server but its response was deliberately aborted.
  Schedule navigation restored pending recovery and disabled creation. Resume sent
  precisely the original JSON payload and request ID; pending card cleared.
  DB assertion: balance1, exactly one consume, present participant A and zero
  attendance rows for participant B. Full navigation/reload demonstrates persistence;
  unit tests separately prove retained consumers share the same controller/lock.

Expected fault `ERR_FAILED` and temporary static-server favicon404 are diagnostic
noise. Only synthetic data used; temporary auth/account/workspace are cleaned up.

## Open

Native phones/screenshots, owner/SOM-47 approval, purchase creation extension,
overpayment decision/payment actions and production journal decision/SOM-53.
Live Linear unavailable; no remote status changes/comments. Goal remains active.
