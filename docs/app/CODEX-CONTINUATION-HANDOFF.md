# Handoff: prototype-faithful trainer app

Updated 30 September 2026 after the scheduling/client-details continuation.
This is verified progress, not a claim that the application or parity is complete.

## Latest continuation: template builder

`/template-editor` now creates, edits and copies templates, retains a local draft,
resolves an existing-draft conflict and confirms discard. TemplateProvider feeds
Library, detail and the session wizard. Custom plans are snapshotted into new
scheduling sessions and restored into workout journals without mutating fixtures.
338 tests / 45 suites pass; all-platform export succeeds. See
[ADR 0019](decisions/0019-demo-template-builder.md) and the
[review report](../../app/review/template-builder/README.md) for visual/native limits.
Keep browser and emulator checks headless to avoid obstructing the user's desktop.

## Previous continuation: template route and session handoff

`/template/[id]` renders t1–t4 outside the tab shell. Library opens this route;
its footer opens `/new?templateId=...`. NewSessionRoute validates that ID against
the seeded catalog and CreateSessionScreen initializes the selected program.
ExerciseDetailsSheet is shared with Library. Unknown template routes show a
not-found state, never silently selecting a different plan. Existing scheduling
and workout persistence remain authoritative; no new storage or dependencies.

The template editor/copy/create-template controls remain disabled and unfinished.
Next coherent batch: canonical template builder, recoverable draft persistence,
custom catalog integration without rewriting historical workout snapshots.
Verified: 321 tests / 42 suites, typecheck/lint/format, Android/iOS/web export
(49 routes). iOS visual smoke; Android not attached.
See `app/review/template/README.md` for validation and open parity items.

## Previous continuation: trainer inbox

`/inbox` now renders canonical request cards from SchedulingDemoProvider, routes
from Today, accepts/declines/counters/withdraws, and retains resolved history.
The route uses the trainer theme and native safe area. Read failure hides fallback
requests; write failure offers retry. Existing revision checks remain authoritative.
Prototype empty/loading/offline scenario switches do not clear inbox requests;
its empty state comes from resolving all active requests, as in the reference.
Relative time copy follows the fixed demo (seed 08:41; subsequent edits “только что”).

Verified: 310 tests / 41 suites, typecheck/lint/format; Android/iOS/web export
(44 static routes); browser accept + decline +
reload preserved empty state and history. iOS iPhone 16e visual smoke, Android
not attached. Report: `app/review/inbox/README.md`. Owner acceptance still open.
Next: template route and remaining invite/billing/welcome/first routes within
existing owner decisions; do not invent auth or payment behavior.

## Starting point and completed batch

Branch `feat/foundation-parity`; previous implementation checkpoint `9f4cacb`.
This continuation implements the next batch proposed by that checkpoint:

- Shared pure scheduling domain, canonical s1–s9 seed and c1–c7 clients.
- Three-step `/new` wizard: clients/group, date/time/duration, template or program
  later, explicit overlap acknowledgement, future-time validation.
- Personal rescheduling: propose/counter/accept/decline/withdraw; old time remains
  until the other role accepts. Session/request revisions reject stale actions.
- Client confirmation and cancellation; group cancellation affects only that
  client's participation. Trainer cancellation affects the whole session.
- Five-tab `/client/[id]` details: sessions, program, historical/new completed
  results, purchases, private/public notes. Invite/payment actions stay disabled.
- Today/Schedule/Home share scheduling changes and local storage, including
  proposal status, group participants and client-specific program previews.
- New sessions open real demo journals. Catalog changes update unfinished journals;
  finished history preserves snapshots. Cancelling a participant blocks new sets
  without discarding prior values. Existing v1 saves remain readable.
- Read errors block writes; storage failures expose retry. Sequential writes and
  validated decoders protect saved demo state. No global fixture mutation.
- Safe route parameters, native editor safe area, canonical disabled button colors,
  c7 fixture, vertical booking rows and month abbreviations fixed during review.

No production backend/auth/sync, real client data or paid services were used.
See ADR 0018 (shared scheduling), plus existing ADRs 0015–0017 (journal/runtime/plurals).

## Binding instructions

Read AGENTS.md and docs/app PROJECT-MEMORY, README, ROADMAP current section,
CONVENTIONS, UI-PARITY, ADR 0007 and TEAM-HANDOFF first. Use graft before source
searches and callers before multi-file changes; refresh graph after substantial work.

The default `prototype-fresh/index.html` at 390×844 is mandatory, not inspiration.
Trainer dark, client light, journal dark. Use original icons/assets and computed
spec values. Do not declare visual acceptance without the owner's approval.
No comments or `any` in app code; UI copy through i18n. Product/backend choices
remain subject to OPEN-QUESTIONS, especially auth/hosting. Do not silently enable
real data or paid services.

## Verification

- `npm run check`: 306 tests / 40 suites, TypeScript, ESLint and Prettier passed.
- `npm run export`: Android/iOS/web, 43 static routes.
- Browser: create c1 session on 15 September at 19:00 with Низ А; calendar showed
  pending consent; opened its dynamic journal; saved 80 кг × 8; reload retained it.
- Integration tests: provider-to-calendar/details/Home consent, reschedule,
  cancellation/isolation, immutable charges; new journal storage/remount,
  finished snapshots, read/write failure/retry and hydration gate.
- iOS iPhone 16e: visual smoke for new wizard and client details; caught/fixed
  status-bar overlap. New screenshot confirms safe area. Not full interaction,
  keyboard, VoiceOver, large-text or physical-device acceptance.
- Android emulator was not running in this session; Android runtime not rechecked.
- Full comparison outcome and remaining visual mismatches are recorded in
  `app/review/foundation-parity/README.md`. Generated files live under its
  `parity/generated/`; captures are evidence, not acceptance.

Local evidence: `output/playwright/scheduling-wave/` (restored new journal and iOS
screens). Dev browser had only upstream pointerEvents warning after reload;
initial favicon 404 is dev-only. Local generated artifacts may not exist in a clone.

## Code map and contracts

- `domain/scheduling/`: actions, revisions, overlap, validated storage.
- `features/scheduling-demo/`: provider, session/proposal sheet, adapters and route
  parameter normalization. `registerFinished` completes the journal hydration gate.
- Root provider order: SchedulingDemoProvider → ConnectedNavigation →
  WorkoutDemoProvider(catalog, catalogReady, onFinishedSessionIds) → Navigation.
- `features/session-editor/`: props-driven CreateSessionScreen / RescheduleSheet.
- `features/client-details/`: props-driven screen, fixtures, progress and copy.
- `domain/workout/catalog.ts`: catalog validation/sync; optional catalog persisted
  in existing v1 workout state, preserving finished historical metadata.
- Relevant tests: scheduling-*, session-editor, client-details,
  workout-scheduling*, plus prior journal regressions.

## Remaining gaps and next batch

- Four reference deep routes: invite, billing, welcome, first; template editor/copy unfinished.
- Native date/time picker currently editable ISO date and HH:mm fields; shared
  Sheet layout/footer and dynamic expanded group parity still need work.
- Workout voice/note creation, technique action, top menu, full motion/haptics.
- Full native accessibility, keyboard, large-text, reduced-motion, Android and
  real-device checks. Owner visual approval remains open for all screens.
- Production Supabase/auth/RLS/RPC, SQLite/outbox and synchronization.
- Static web hosting needs a dynamic-route fallback for generated session IDs;
  Expo development navigation/reload is verified, deployment is not configured.

Next useful batch: remaining template/invite/billing flows within existing owner decisions. Do not
invent auth/invitation behavior or treat payment placeholders as completed flows.

Use fresh narrow contexts for coordinator + up to three workers; explicit file
ownership, API contract before writers, root owns global providers/routes/i18n/docs.
This batch's workers are finished; do not reuse their long histories unnecessarily.
Integrate, review, test and capture before committing the next meaningful checkpoint.

## Commands

Use Node 22 (shell default is older and breaks Expo/Jest):

```sh
export PATH=/Users/dilnazzaksylykova/.nvm/versions/node/v22.18.0/bin:$PATH
cd /Users/dilnazzaksylykova/WebstormProjects/trainerApp/app
npm run check
npm run export
node scripts/parity.mjs
```

Check local processes/device availability again. Servers and screenshot refs from
this session are not reliable in a new one. Playwright skill is CLI-first.
