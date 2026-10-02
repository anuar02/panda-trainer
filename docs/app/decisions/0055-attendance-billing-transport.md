# ADR 0055: Typed attendance and purchase transport

Date: 2026-10-03. Status: accepted; transport verified.

## Approach

Keep attendance/purchase transport in trainer-billing, separate from payment RPCs
and screen integration. Read explicit safe columns with workspace and optional
client filters. Bind the authenticated account's token to every paginated request
and command. Validate identities, revisions, dates, ledger kinds and command
results before exposing domain values; reject malformed or duplicate rows.

Represent money as canonical decimal strings of minor units. PostgreSQL bigint
exceeds JavaScript's safe numeric range. PostgREST selects price_minor::text;
purchase creation transmits the exact validated string at the SDK wire boundary
because generated Supabase bigint argument types use number. The rest of the
domain retains string precision. No floating-point conversion is permitted.

Expose the six SOM-33 commands with explicit request IDs and required revisions.
Transport does not create UI command state, durable recovery or acceptance of
screens. Those consumers must retain a request ID on retry and refresh scope.
Payment actions/debt remain SOM-34 and await the overpayment decision.

## Verification

Root verified a real local PostgREST read of a synthetic purchase priced at
9223372036854775807 minor units. The cast returned that exact string; fixture
cleanup completed. All 46 focused transport tests pass. The full application
check passes strict typecheck, lint and formatting, plus 1037 tests in 108 suites.
