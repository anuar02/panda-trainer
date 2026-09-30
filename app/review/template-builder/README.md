# Template builder continuation — 30 September 2026

`/template-editor` implements creation, editing and copying from the canonical
prototype. The library offers creation and draft resumption; starting another
plan with an existing draft offers continuation or replacement. Discard requires
confirmation. Exercise selection, removal, order, sets, repetitions/time, weight,
rest and description are editable. Validation uses prototype limits and messages.

TemplateProvider persists one versioned document containing saved templates and
the draft. Writes are ordered, read failure blocks overwriting, and failed save
retains the draft without publishing a fake success. Saved templates feed Library,
detail and the session wizard. New sessions snapshot custom plans; later template
edits do not rewrite the session or workout results. See
[ADR 0019](../../../docs/app/decisions/0019-demo-template-builder.md).

## Verification

- `npm run check`: 338 tests / 45 suites, TypeScript, ESLint and formatting pass.
- Follow-up fixes: localized decimal weights and custom-plan names in calendar
  rows; final full check rerun.
- `npm run export`: Android, iOS and web, including `/template-editor`.
- Tests cover independent copies, normalization and invalid inputs, ordered draft
  writes, restore, failed hydration/save and retry, discard, picker/reordering,
  custom-plan scheduling and workout decoding, including corrupt snapshots.
- Browser: copied Низ А, renamed it, changed weight to 72.5, reloaded the draft,
  saved the copy, reloaded its detail and created a 16 September 19:00 session
  with that plan; the calendar retained it after reload.
  Evidence: `output/playwright/template-builder/copied-template-reloaded.png` and
  [reloaded calendar](browser/custom-session-reloaded.png).
  The temporary HTTP server required restart after export replaced its working
  directory. One missing favicon; no app runtime error.
- Android Pixel 9 emulator: native name keyboard, picker, exercise selection,
  hardware back closes picker, save opens the custom template detail. Captures:
  [saved](native/android-saved.png), [picker](native/android-picker.png).
  Finished checks with `-no-window`; no physical-device acceptance.
- iOS iPhone 16e: [visual smoke](native/ios-editor.png), before final spacing
  corrections, includes the Expo dev overlay. Not final visual acceptance.
- 12 reference/app pairs: blank and populated builder, each four auto scenarios
  plus explicit dark/light. Zero missing combinations, zero runtime errors.
  [Empty comparison](parity/empty/index.html),
  [populated comparison](parity/populated/index.html). Both include measured
  `reference/spec-dark.json` and `spec-light.json`; source CSS supplies input
  descendants not represented by class entries. Empty/loading/offline scenarios
  keep the same editor content, matching the prototype.

## Acceptance still open

- [x] Local creation, editing, copying and durable draft behavior.
- [x] Common saved catalog and custom-plan handoff to scheduling/workout.
- [x] Basic Android interaction and iOS visual smoke.
- [ ] Native picker sheet geometry and fixed picker footer parity. The shared
  Sheet currently scrolls its Done action with the exercise list; Android Back
  and the sheet close controls also preserve selection.
- [ ] Full font/spacing/shadow acceptance. Shared web Button gradient/shadow,
  native sheet styling and rounded intermediate font weights remain visible
  differences; screenshots are evidence, not approval.
- [ ] Full VoiceOver/TalkBack, large text, reduced motion and native keyboard
  coverage across all fields and both platforms.
- [ ] Owner visual approval; production backend, client-program versioning and
  synchronization remain separate work.

Reproduce comparisons after `npm run export` in `app/`:

```sh
SCREENS=t-template-editor PARITY_OUTPUT=app/review/template-builder/parity/empty node app/scripts/parity.mjs
SCREENS=t-template-editor BUILDER_TEMPLATE=t1 PARITY_OUTPUT=app/review/template-builder/parity/populated node app/scripts/parity.mjs
```

The capture script was extended only under `prototype-fresh/review/parity`;
prototype product code and styles were not modified.
