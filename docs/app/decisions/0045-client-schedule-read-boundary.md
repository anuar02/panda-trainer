# ADR 0045: Own-client scheduling reads

Date: 2026-10-02. Status: accepted implementation approach; SOM-36 acceptance open.

## Decision

SOM-36 reads each selected trainer connection independently. Two authenticated RPCs
return the active own-client context and paginated pending proposal projections.
They expose timezone and display names, and compute author role on the server,
without returning owner/author Auth IDs. Trainer workspace RLS remains owner-only.

The client transport uses exact safe booking/program/exercise columns through
existing own-booking RLS. It pins the authenticated token on every request, checks
context and row scope, bounds date windows and batches snapshot IDs. Pending
proposals outside the window load their own bookings and immutable plans too.
The focus hook hides old data immediately on account, card or window changes and
ignores late responses after blur/unmount. No peer participants, unfinished
journals, private notes, balances or history are fetched by this read slice.

Existing direct proposal column grants are unchanged. The safe RPC/transport
projection is not a claim that every older API projection hides audit IDs.

## Verification

A clean isolated reset and all 494 pgTAP assertions across 16 files pass, including
25 new linked-client, foreign-client, archived-card, anonymous, pagination and
redacted-contract assertions. Twenty reader tests and twelve focus-hook tests
cover account pinning, safe projections, outside-window proposals, snapshots and
stale responses. Full SOM-36 billing/history/progress and owner/native acceptance
remain separate work.
