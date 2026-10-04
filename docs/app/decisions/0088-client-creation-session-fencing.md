# 0086. Client creation session and caller fencing

- Status: Implemented, owner acceptance pending
- Date: 2026-10-04
- Scope: SOM-20 create only; existing read fencing and SQL unchanged

Client creation takes an optional expected actor/workspace/token/caller signal;
the existing two-argument public call remains supported. A create-specific fence
subscribes before initial auth lookup, validates JWT sub against the actor and
pins session_id. Logout, sign-in, actor/session changes, malformed claims and
unannounced token replacement invalidate the operation. TOKEN_REFRESHED permits
only matching claims and a subsequent matching getSession result. Decoding is
an identity check on SDK sessions, not independent JWT signature verification.

Before dispatch, the existing trainer_workspaces read seam proves ownership and
matches the expected workspace. Ownership read and RPC use explicit bearer;
guards surround dispatch, completion and errors. SQL selects the workspace by
owner and already provides workspace/actor/request-id receipts. The returned
workspace must match the checked workspace. Errors expose no transport details.

Route caller lifetime is cancelled synchronously by auth changes and on unmount;
component identity uses actor/session_id/workspace plus an auth generation, never
an access token. A successful live completion clears its command and retries
reads; stale completion cannot release another caller's lock. The sheet has its
own open/close/unmount generation and synchronous double-submit lock.

Unknown outcomes retain name and request ID in the live caller for explicit
retry. A replacement scope starts empty. This remains in-memory only; there is
no disk protocol or crash/reopen recovery. Layout, texts and validation remain
unchanged. No new dependencies, SQL, storage or auth-provider changes.

Alternatives rejected: mutable SDK auth without explicit bearer; accepting a
refresh event without claims comparison; adding durable storage outside scope.
Synthetic tests validate races. Live auth, native/parity and owner acceptance
remain open; see the SOM-20 creation review report.
