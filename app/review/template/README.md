# Template route and session handoff — 30 September 2026

`/template/t1`–`t4` now open outside the tab shell in the trainer theme. Library
cards link to these routes; the fixed footer opens the session wizard with the
selected template. The wizard can keep, change or explicitly defer the program.
Exercise technique uses the same extracted sheet as Library. Unknown IDs render
not found; repeated route parameters are normalized before lookup.

This is a local demo continuation under ADR 0018. No new persistence layer,
backend, library or product rule. **Editing/copying/creation were added in the
[builder continuation](../template-builder/README.md); visual parity is not accepted.**

Validation and evidence:

- `npm run check`: 321 tests / 42 suites; TypeScript, ESLint, formatting pass.
- `npm run export`: Android/iOS/web, 49 static routes.

- Provider-backed integration: template → wizard → persisted scheduling session →
  workout journal with the selected plan. No fixture mutation or fake success.
- Tests cover four scenarios, unknown IDs, repeated parameters, route fallback,
  exercise technique and changing a preselected plan to “later”.
- Final comparison: 12 reference + 12 app captures, zero missing combinations
  and zero runtime errors. Template and Library in six combinations each, under
  `../foundation-parity/parity/generated/index.html`; generated files are local.
- Browser: selected Низ А → Айгерим → 16 September 19:00 → create; calendar
  showed Низ А and pending consent. Reload capture:
  `output/playwright/template-wave/created-session-reloaded.png`.
- iOS iPhone 16e visual smoke: safe area, trainer theme and fixed footer inspected.
  `output/playwright/template-wave/ios-template.png` includes the Expo dev overlay.
- Android device list is empty. No Android runtime, VoiceOver, keyboard,
  reduced-motion or large-text acceptance was performed.

Parity checklist:

- [x] Canonical template titles, exercise order and prescriptions.
- [x] Dedicated top bar and fixed footer; no tab bar on the detail route.
- [x] Specs/source spacing, type sizes and original icons.
- [x] Shared Button and exercise-details sheet retained.
- [x] Editing/copying actions and builder/draft behavior implemented in the continuation.
- [ ] Native exercise-sheet layout and full typography/shadows accepted.
- [ ] Accessibility, large text and Android checked.
- [ ] Owner approval.

The shared Button accepts an optional label style for the prototype's 13px footer
label; existing callers retain their default styling. The template summary uses
the prototype's exact fixed nouns. Known shared web gradient/shadow differences
and native Sheet parity remain open.
