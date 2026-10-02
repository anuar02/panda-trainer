# SOM-33: attendance and purchase transport

Date: 2026-10-03. [ADR 0055](../decisions/0055-attendance-billing-transport.md).

## Delivered

Typed trainer-billing service reads purchases, attendance, immutable revisions and
credit entries through explicit safe columns and paginated workspace/client filters.
A captured matching-account token is attached to every read and RPC. Results are
validated for target identity, states, revisions, dates, signs and nullable fields.
Duplicate rows and malformed responses fail rather than create partial domain data.

Six commands wrap the verified SOM-33 RPCs with caller-supplied request IDs and
expected revisions. Money remains canonical decimal strings, selected through
price_minor::text and passed unchanged on purchase creation. Scoped review verified
auth isolation, bigint precision and old receipt compatibility; fixes aligned
reason/title limits with SQL and checked command-specific result states.

## Verification

Node22:46 focused service tests and the full application check pass (1037 tests,
108 suites, strict typecheck/lint/format). Tests cover account mismatch, pinned
Bearer headers, exact RPC payloads/retries, pagination, scope/response validation,
bigint boundaries, correction receipts and command-specific statuses.

Root's real disposable PostgREST
check returned the exact bigint maximum price string 9223372036854775807 for a
synthetic purchase; its scoped fixture cleanup succeeded. No real data was used.

## Open work

No production screen or durable command hook is connected by this package.
Consumer retry/recovery, controlled attendance sheets, refresh after mutation,
prototype comparisons and native/owner acceptance remain open. Payment commands,
debt and production payment actions still await the overpayment decision. Live
Linear synchronization and remote CI/push/release are not claimed.
