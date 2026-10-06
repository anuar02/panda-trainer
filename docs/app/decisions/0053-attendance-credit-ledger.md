# ADR 0053: Attendance and immutable session credit ledger

Date: 2026-10-03. Status: accepted; server implementation verified.

## Owner decisions

The owner confirmed that correcting attendance restores the charged session once.
This resolves the discrepancy between the roadmap and the prototype's former
correction behavior. The owner also confirmed package eligibility uses the
scheduled session date, including the expiry day. Convert booking starts_at
through the workspace timezone; the time when attendance is recorded is irrelevant.

## Approach

Store immutable client purchase terms, attendance state and an append-only unit
ledger separately. Payment entries and debt belong to SOM-34. Purchase creation
grants its fixed number of credits. Client reads expose product columns only;
actor IDs and request receipts remain inaccessible.

Attendance without debit is an explicit option, matching the canonical charge
confirmation. Explicit debit selects a trainer-chosen eligible purchase or the
eligible purchase with the nearest expiry, then creation time and ID. Purchases
without expiry come last. No suitable automatic selection records unbound
attendance rather than a negative balance. Later binding debits exactly once.
No-show and cancellation never automatically debit; an explicit cancellation or
no-show charge requires a public reason and does not count as attendance.

Corrections preserve history and append an exact compensating restore. Explicit
re-marking uses a new attendance revision and cycle; old successful receipts still
return their original results and cannot reactivate a corrected cycle. Conflicting
presence/no-show changes require explicit correction first.

Owner-only commands serialize on the existing workspace lock, check tenant/client
relationships and current revisions, and persist actor-scoped canonical receipts.
Exact retries are checked before mutable revision/state checks. Direct writes are
revoked; balances are derived from ledger entries.

## Verification

The clean isolated database reset passes 660 pgTAP assertions across 19 files.
Six concurrent last-credit, retry, binding and correction scenarios pass. Database
lint reports no schema errors; generated types match. The application check passes
107 suites and 991 tests. App transport, screen parity and owner/native acceptance
remain separate work. See the SOM-33 technical review for evidence and limitations.
