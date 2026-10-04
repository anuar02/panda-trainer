# SOM-26 · Booking creation session fencing and durable retry

Verified: 2026-10-04 (work started 2026-10-03). Branch: `agent/som-26-booking-creation-session-fencing`.
Fresh base: `origin/fix/som-50-template-picker` at `4d308bc`; `git fetch origin`
and `git merge --ff-only origin/fix/som-50-template-picker` returned up to date.
No unmerged branch was used as a dependency. Synthetic fixtures only.

## Delivered

- Creation-specific fence subscribes before initial async auth verification,
  pins actor/login before storage, rechecks before RPC and after awaits,
  including result/error/cached-success delivery. RPC gets an explicit verified
  bearer. Existing `scheduleSessionId` is read without modifying read/auth code.
- Logout, same-user relogin, actor/scope change and unmount fail closed.
  Verified same-login refresh remains usable. Hook auth epoch and layout key
  guard hide old pending/busy/error, suppress old hydration/error/completion,
  and preserve the double-tap lock and exact pending resume.
- Durable user/workspace keys and requestId/payload/selected plan revision remain
  unchanged. Unknown RPC outcomes and auth cancellation keep pending. Receipt
  cleanup failure permits retry with the same requestId.
- Clear compares requestId within the existing serialized queue and checks
  lifecycle/auth before deletion. Cancellation during remove restores the raw
  command before releasing the queue. Cancellation during final auth checking
  attempts conditional restoration without overwriting a newer command.
- Validated overlap clears the unacknowledged command for explicit acknowledgement;
  it never calls onCreated. Creation with a plan keeps the exact template revision.
- Standalone operations expose additive `dispose()` to release their subscription;
  production submit/resume and the hook dispose owned fences in their lifecycle.

## Validation

- `cd app && npx jest --runInBand tests/workspace-booking-creation-session.test.ts tests/workspace-booking-create.test.ts tests/workspace-booking-recovery.test.ts tests/workspace-booking-creation-hook.test.tsx tests/workspace-booking-pending.test.ts tests/workspace-create-session-screen.test.tsx`
  — PASS: 102 tests / 6 suites.
- `cd app && npm run check` — PASS: TypeScript strict, ESLint (zero warnings),
  Prettier and all 1827 tests / 162 suites.
- `git diff --check` — PASS.

Regression evidence covers relogin before initial auth resolves, after save,
inside RPC, during queued clear read, during remove and final auth checking;
logout/foreign actor/workspace, same-session refresh through storage/RPC/hook,
cache revalidation, late hydration/error/unmount, uncertain success, clear
failure and newer pending, double tap, overlap→ack, immutable plan/revision,
reopen and exact requestId reuse. Existing create-screen tests use verified
synthetic auth fixtures; no UI implementation changed.

## Limits and coordination

Graft executable was unavailable (`command -v graft` exited 1), so exact paths
from the brief were read. Graph rebuild was not run. Linear callable tools were
unavailable: live project/issue/duplicates/dependencies/status were not refreshed.
No Linear changes, comments, project updates or messages were sent.

SQL/RLS/pgTAP, Docker/Supabase runtime, real API/auth, browsers, native devices,
visual parity, two-device behavior and actual storage/process crash were **not
run**. AsyncStorage is synthetic; serialization protects this module's local
writers, not independent runtimes. Restoration cannot guarantee durability if
storage fails again or the process dies during remove/restore. Server idempotency
is exercised through synthetic replay fixtures, not a live DB.

SQL/policy/types/deps/prototype, third mutations, read controllers, routes/UI,
auth provider and account/journal/sync were not changed. No new PNG, real client
data or paid services. Screen and whole issue acceptance require the owner;
this package does not declare SOM-26 or screens accepted.
