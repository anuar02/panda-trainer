# SOM-34: independent manual payment foundation

Date: 2026-10-03. Scope: schema/RLS only; [ADR 0054](../decisions/0054-manual-payment-history.md).

## Review

`20261003100000_manual_payments.sql` adds immutable payment_entries. Required
columns prevent NULL from bypassing kind/sign/currency/method checks. Composite
FKs constrain workspace/client/purchase; the reversal trigger additionally checks
that its target is an original positive payment with exact amount, method and
currency. Unique reverses_entry_id prevents duplicate full corrections. Reasons
are required for reversals. Mutation triggers reject updates/deletes.

Safe-column grants hide created_by. Authenticated users have no direct writes;
RLS permits the workspace owner or exact linked client to read product fields.
The security-definer validation helper has a fixed pg_catalog search path, fully
qualified relations and no authenticated/anonymous EXECUTE privilege.

Read-only adversarial review found no blocking FK, NULL, sign, reversal or privacy
issue for this independent schema. Paid_on may differ on a correction; it records
the correction's business date. Actor provenance is checked by the future RPC,
not by equating created_by to workspace owner in privileged database inserts.

## Fresh verification

Disposable trainerApp-som18 stack, synthetic fixtures only:

| Check | Result |
| --- | --- |
| Clean migration/seed reset | Pass |
| Full pgTAP | 686 assertions / 20 files; pass |
| Schema lint | Pass |
| Generated types | Drift verification passes |
| App strict typecheck (Node 22) | Pass |

manual_payments.test.sql covers sign and zero amounts, peer/workspace mismatch,
KZT, mandatory correction reason, exact full reversal, method mismatch, peer
reversal, duplicate reversal, reversal of reversal, immutability, safe grants and
owner/client/peer isolation. The bigint maximum fixture verifies storage; no debt
aggregate or JavaScript monetary transport is implemented here.

## Open scope

Payment RPC, repeat/concurrent command tests, debt calculation and production app
actions depend on the owner's overpayment answer. There is no debt/balance view,
no new accepted screen and no claim that SOM-34 is complete. Remote Linear/CI,
push, merge and release are not established by local checks.
