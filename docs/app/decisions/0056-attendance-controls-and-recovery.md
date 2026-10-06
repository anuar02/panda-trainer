# ADR 0056: controlled attendance and durable command recovery

Date: 2026-10-03. Status: accepted technical implementation; screen approval open.

## Context

SOM-33 has an immutable server credit ledger and typed transport (ADR 0053/0055).
The owner confirmed correction restores one charged session and eligibility uses
scheduled session date in workspace timezone, including expiry day. A lost RPC
response must never become a new charge request.

## Decision

Integrate controlled participant attendance sheets into the real workspace
schedule. Project balances from grants/debits/restores with scoped validation;
invalid/incomplete history exposes retry and blocks attendance commands. Choose
nearest expiry, then creation time/ID; retain explicit alternate package choice.
Use workspace scheduled date for new attendance/cancel penalties and the stored
attendance service date for binding/no-show penalties.

Persist a canonical immutable command under user/workspace scope before network.
Retain its exact request ID, revisions and payload on unknown outcomes; reload
resumes that command. Prevent replacing it, and block all other schedule writes.
Clear only confirmed success or server-proven conflict/invalid state. Storage
corruption/failure blocks writes rather than silently discarding a command.
Read hooks suppress stale account/focus results. Synchronous locks cover double
presses and races between attendance, cancellation and proposal actions.

Presence without a package remains unbound; binding is explicit. No-show never
implicitly charges; cancellation/no-show penalties require a separate reason.
Correction requires a public reason and follows the confirmed restore rule.
Production package creation and payment/debt are separate remaining work.

## Verification and limits

1065 tests / 112 suites, type/lint/format and web/iOS/Android export pass.
Six default schedule reference/app pairs capture with no errors/missing states;
accepted remains false. Synthetic local browser/DB checks demonstrate one debit
following response loss, reload and identical replay, one restoration following
correction, and separate no-show penalty without changing a group peer.
See [evidence](../../../app/review/attendance/README.md).
No native screen approval, owner acceptance or remote Linear transition claimed.
