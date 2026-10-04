# 0095. Financial form lifecycle and real client totals

Date: 2026-10-04. SOM-34. Technical implementation; runtime and owner acceptance open.

The merged PR43/PR53 read, command, durable storage and terminal contracts remain
unchanged. This package composes them into the remaining production purchase,
payment, debt, immutable history and explicit reversal flow under ADR0059.

Financial presentation uses the existing mutation session epoch, actor/workspace/
client keys and a synchronous caller/generation guard. Successful or terminal
mutation generation invalidates open forms, selections, draft fields and submitted
purchase identity before rendering fresh reads. Overpayment preserves only the
selected purchase and submitted purchase ID so that a fresh form can show the
server error under the amount after verified debt refresh; no old draft/busy/result
survives. Dismiss/reopen has a separate in-memory form epoch invalidated before
calling the parent close callback. Layout cleanup and purchase/payment ID keys
reject old form completions. Verified same-session token refresh preserves the
current draft. No credentials enter these keys or form state.

Form dismissal, logout and relogin never clear durable uncertain commands. The
existing hook/service/storage owns requestId, canonical payload, conditional
clear, terminal policy and receipt recovery. UI recovery additionally verifies
that purchase creation/payment/reversal belongs to the selected client. These
checks do not infer or migrate pending data into another client.

Header metrics use the existing validated financial read hooks and pure scoped
credit/payment projections. Units include nonexpired purchases (expiry day
included); debt includes every purchase. Aggregation and formatting use BigInt
and integer minor strings, including totals above a single PostgreSQL bigint.
Both metrics remain unknown during loading/read failure or invalid projections.
Mutation generation refreshes header and billing reads before paint; no receipt
is treated as an optimistic balance.

The base after SOM-26/SOM-27 had a billingContent slot but hardcoded unknown header
metrics. A single optional financialContent ReactNode slot extends that existing
composition seam; the route supplies trainer-billing's component. Client loading,
programs, onboarding, scheduling and navigation implementations are unchanged.
Existing metric layout, theme and i18n copy are reused. No library or SQL API changes.

Evidence: [review](../../../app/review/05-som-34-billing-production-finish/README.md).
Synthetic app integration is not SQL runtime, live Auth/storage/crash, native
parity, two-device concurrency or owner approval. The new SQL workflow remains
needs-local-db for Claude/CI.
