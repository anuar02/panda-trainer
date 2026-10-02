# SOM-27: pending command resolution safety

02 October 2026. Investigation only; no discard capability is implemented.

Status and proposal commands check authenticated access, take the workspace lock, and look up
actor-scoped receipts before examining current state/revisions. A trusted 40001/55000 response
therefore proves there was no successful receipt at that transaction's linearization point.
Timeouts, malformed responses, revoked access and generic request failures prove nothing.

That is insufficient to safely discard an unknown command whose earlier HTTP request might
still arrive later. Proposal 55000 can mean another proposal currently occupies the pending
slot. Withdrawal does not increment booking revision. After that withdrawal, the delayed
original propose can succeed with the same expected booking revision and request ID even
though a retry previously received 55000. Generic 40001 also rejects expected revisions above
current; those can become current later. Current command validation accepts positive revisions
without establishing whether the expected revision was previously observed.

A helper must not infer terminality from the UI error string or from constructing an exported
error class. Existing operation errors do not carry response provenance/current revision.
A persisted error string would retain ambiguity across restarts rather than remove it.

## Recommended server contract before implementation

Provide an explicit resolution command carrying the complete original command payload and
request ID. Under the same workspace lock and current booking authorization:

1. If a success receipt exists for the exact payload, return the original successful result;
   do not abandon it. Mismatch rejects. Client performs ordinary successful cleanup.
2. Otherwise record an immutable actor/request-scoped abandonment tombstone with that payload.
   Every normal command checks that tombstone before mutations and refuses the abandoned request.
3. Return a typed abandonment receipt that binds original command, actor scope and payload.
   A late original request now cannot commit after the resolution transaction.

This needs a new migration and tests, not a local storage helper alone. The explicit UI action
must distinguish an abandoned command from a successful replay. It should be enabled only after
an actual authenticated terminal response, as requested by the coordinator, while the server
resolution makes later delivery safe. No automatic clearing or new request ID during ambiguity.

For storage cleanup, add a compare-and-delete operation within the existing pending module's
serialization queue comparing the entire canonical command, not just request ID. Loading then
calling current request-ID-only cleanup is not one atomic operation: an old resolution could
clear a replaced command reusing that ID between the two calls. New helpers must not create
another AsyncStorage queue that races the pending module.

Required tests: unknown/lost response retained; delayed original request waits behind resolution
and cannot commit after tombstone; original success before resolution returns exact success;
resolution repeat idempotent; changed payload rejected; cross-actor/request isolation; no
abandonment through access-revoked or malformed failure; storage identity replacement protected;
failed deletion retains recoverable exact command; restart loads proof bound to the same scope.

An alternative narrower design could return typed monotonic stale evidence (expected lower than
current revision) from the server. That does not cover transient invalidState/propose responses,
so it cannot implement the requested general conflict/invalidState discard contract.
