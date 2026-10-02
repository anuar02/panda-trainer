# SOM-36: connected client progress checkpoint

Date: 2026-10-02. Implementation verified locally; owner/native acceptance open.

The connection progress route displays records and 28-day deltas from complete
own finished history. It refuses partial data and preserves unknown versus zero
results. Default prototype has no chart/selector; no attendance or billing values
are invented. See ADR 0049.

Checks: 951 tests / 105 suites; TypeScript, lint, formatting; configured
web/iOS/Android export; six default capture pairs, zero missing states or errors.
Capture: `/tmp/screens/client-scheduling/progress-parity/index.html`.
Database types match and SQL lint passes after Docker resumed. Trainer runtime
passes all 23 scheduling checks with no browser errors and successful cleanup.
Client runtime passes 29 checks, including program, pre-link finished history,
actual progress and account switching, with successful cleanup. Synthetic client
provisioning uses local GoTrue admin API rather than incomplete Auth SQL rows.

Native/two-phone, owner comparison, direct API privacy hardening and remaining
SOM-36 billing/attendance requirements remain open. No Linear status changes.
