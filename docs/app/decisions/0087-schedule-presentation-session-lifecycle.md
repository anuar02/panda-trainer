# 0087. Schedule presentation follows the login lifecycle

Date: 2026-10-04. Status: implemented; runtime and owner acceptance pending.

## Problem

PR41 and PR50 fence read/create services and hooks, but trainer screens and their
shared mutation provider previously survived same-user login changes. Captured
callbacks, selected sheets and provider locks could belong to the old login.
A fast operation also left a manually mutated `blocked` ref set when React
batched the running state updates, preventing overlap acknowledgement/save.

## Decision

Keep the existing transport, durable pending API and server policy. Reuse the
booking session fence from ADR 0083 inside the existing mutation provider.
Auth events synchronously invalidate the old lifecycle and remount its consumers
with an opaque local epoch; credentials and login claims never enter React keys.
Only a verified refresh of the same actor and login preserves presentation.
The provider owns its lock, verifies before invoking an operation and before
returning its result, and ignores old results/errors/finally across lifecycles.
A failed initial verification exposes the existing translated error/retry UI.

Today/week callbacks additionally capture read/mutation scope and focus lifetime,
so a screen disappearing while the shared provider survives cannot navigate.
Creation uses a focus epoch and local completion date rather than a mutable
shared date. Catalogue reads pin actor/login before asynchronous work, pass the
existing scoped read arguments and verify before rendering success or failure.
A default week date follows the workspace clock; an explicit selected day stays
selected. Reads after creation remain server reads, without optimistic/demo data.

## Alternatives and consequences

A user/workspace key alone cannot distinguish two logins by the same actor.
Putting bearer credentials in keys would disclose credentials and remount on
normal refresh. A new transport/fence package would duplicate PR41/50 and is
unnecessary. Provider protection covers the billing facade without changing its
implementation, status/proposal transports, storage or server policy.

Synthetic screen/provider and real-hook/creation-service seam tests are recorded
in [the review](../../../app/review/som-26-schedule-production-finish/README.md).
They do not prove native storage, Auth/RLS/SQL runtime or visual acceptance.
