# Template picker — SOM-50 — 30 September–1 October 2026

The editor picker now keeps title, hint, search and Done outside its scrolling
results. Its bounded height, grip, search, thumbnails and selection indicators
follow the canonical prototype. Exercise metadata includes equipment. Selection
still updates the durable draft immediately; closing does not undo it.
Other Sheet consumers retain their previous dynamic layout.
[ADR 0022](../../../docs/app/decisions/0022-fixed-picker-sheet.md).

## Verification

All commands use Node 22.18.0 (the login shell otherwise selects Node 14).

- Latest continuation: `npm run check` passes 340 tests / 46 suites, TypeScript,
  ESLint and Prettier. New Text test covers stable-scale rerenders, remount after
  a Dimensions font-scale change and forwarded props. `npm run export` passes
  Android/iOS/web, 50 routes. Cheap subagent audited and added this test; parent
  reviewed it and ran the complete checks. Below are earlier checkpoint results.

- `cd app && npm run check`: 339 tests / 45 suites; TypeScript, ESLint,
  Prettier pass. Added coverage for fixed header/footer outside the scroller,
  absence of the extra close button, dismissal/reopen selection and Done count.
- `cd app && npm run export`: Android, iOS, web; 50 routes.
- [Editor comparisons](parity/index.html): six reference/app pairs, zero missing
  combinations, zero runtime errors.
- [Open picker comparisons](picker/index.html): six reference/app pairs, including
  explicit dark/light and all four auto scenarios; zero missing combinations,
  zero runtime errors. Includes measured `reference/spec-{dark,light}.json`.
- Headless browser, 390×844: scroll, search `планка`, select/deselect, Done,
  reopen, reload. Search stayed at y=297.024 and Done at y=752.008 before/after
  an 800px wheel scroll after the opening animation settled. Search blur and
  selection emit zero errors after the fix. Native BottomSheetTextInput had
  called the missing web `currentlyFocusedInput`; web now uses TextInput.
  Initial exploratory runs also logged a missing favicon and a transient
  third-party `could not find scrollable ref` warning; these are not clean runs.
- Headless Android Pixel 9 (1080×2424, density 420): selected an exercise,
  scrolled results, Android Back, reopened, verified retained count and typed
  `squat` in search. Done bounds before/after list scroll: `[58,2182][1022,2329]`.
  [Final picker](native/android-picker-final.png), [initial picker](native/android-picker.png), [scrolled](native/android-picker-scrolled.png),
  [search input](native/android-search-keyboard.png). Search capture includes
  the emulator's floating IME and an Expo connection overlay during the local
  server restart; this is not full keyboard acceptance.
- iPhone 16e / iOS 26.2: refreshed [editor smoke](native/ios-editor.png),
  with Expo tools overlay. The simulator initially could not reach Metro:
  localhost bound to IPv6 while the manifest used IPv4. Restarting Metro with
  `NODE_OPTIONS=--dns-result-order=ipv4first` resolved it. No physical devices.
- iOS continuation: the accessibility tree initially exposed the sheet content
  as one slider, hiding its controls. Explicit `accessible={false}` on
  BottomSheetModal now exposes search, exercise buttons and Done separately.
  The tree excludes the underlying editor controls while the picker is open.
  Search `планка` using the accessibility text setter returned two matching
  exercises; selecting Планка updated its selected state and Done count to one.
  Done returned to an editor containing Планка; reopening retained selection
  and count. [Reopened picker](native/ios-picker-reopened.png).
  Hardware typing did not enter text reliably through the simulator automation;
  this run does not establish software-keyboard or spoken VoiceOver acceptance.
  Full `npm run check` passed again after the accessibility regression test.
- Further iOS software-keyboard check: name and multiline note accept keyboard
  taps; sets/rest display number pads, weight displays a decimal pad and accepts
  `2,5`, time/repetitions uses the configured general keyboard. Focused fields
  remain visible and Save stays above the keyboard. Edited draft values were
  retained: sets 4, time 45, weight 2,5, rest 60. Picker search accepts keyboard
  taps and filters matches; [Done stays above the keyboard](native/ios-picker-keyboard.png).
  This resolves the earlier automation limitation using software-keyboard taps.
- Live Dynamic Type `large` → `accessibility-large` exposed stale text heights:
  [before](native/ios-picker-large-before.png). Cold start at that size rendered
  correctly. Shared Text now remounts its native node when fontScale changes;
  [after](native/ios-picker-large-after.png) is a live transition without restart.
  Returning to the original `large` size also renders correctly. Values remain
  in the draft. [ADR 0023](../../../docs/app/decisions/0023-live-font-scale.md).
  The list has a smaller viewport at this size; maximum size and simultaneous
  large-text/software-keyboard coverage remain open.

Reproduce after exporting:

```sh
SCREENS=t-template-editor PARITY_OUTPUT=app/review/template-picker/parity node app/scripts/parity.mjs
SCREENS=t-template-editor BUILDER_PICKER=1 PARITY_OUTPUT=app/review/template-picker/picker node app/scripts/parity.mjs
```

## Acceptance remains open

- [x] Fixed picker layout and immediate selection behavior implemented.
- [x] Automated regression checks and web scrolling/search/reopen checks.
- [x] Android picker/Back smoke and fresh iOS editor capture.
- [x] iOS search/selection/Done/reopen and individual accessibility controls.
- [x] iOS software-keyboard smoke for every editor field and picker search.
- [x] iOS live Dynamic Type large/accessibility-large transition and restoration.
- [ ] Final native comparisons in both themes and combined accessibility states.
- [ ] Every editor field's keyboard, VoiceOver/TalkBack focus traversal,
  large text, reduced motion and compact-screen/landscape layouts.
- [ ] Full shared Button/Sheet font, shadow and spacing acceptance. Static
  font-weight rounding and visible web typography differences remain.
- [ ] Owner approval of the comparisons. SOM-50 remains In Progress;
  SOM-44 and production template work are not complete.

The Linear status is In Progress. After the owner explicitly authorized the
checkpoint on 1 October, its issue description was updated and the returned
record verified. The earlier approval-review rejection is resolved.

Implementation and evidence are saved on `fix/som-50-template-picker` in local
commits; no PR, push, comment or project update was posted. Owner acceptance
remains open independently of the implementation commit.
