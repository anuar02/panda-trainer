# Instrument implementation — 28 September 2026

Open `/?visual=instrument` on the `prototype-fresh` server. The appearance picker also offers **Инструмент**. `&present` hides the demonstration controls and shows the device on a graphite background.

Trainer screens default to dark; client screens default to light. Profile offers automatic, dark and light choices, persisted locally. The workout journal stays dark. Existing appearances remain available.

## What changed

- Shared usability corrections: 44 px icon buttons and tabs, readable section labels, unbroken client-history times and Program tab text, wrapped client-card tabs, visible horizontal scrolling in library filters, calm-mode switches, clock instead of a misleading checkmark, invitation scenarios moved to the demo toolbar. Client-directory wrapping and functional library filters were already corrected in the current source and were retained. The original wide feed already used the journal-state label helper.
- Client-directory packages show a compact `07 / 12` balance and a remaining-sessions meter with an accessible text label. Booking uses a numbered `01–02–03` indicator with completed/current stages and `aria-current="step"`.
- Scoped Instrument tokens and component styling: graphite surfaces, one orange action accent, neutral statuses with small semantic markers, flat buttons, limited corner radii and shadows. Inter's existing variable font has an optical-size axis; `Inter Display` uses that file at optical size 32. JetBrains Mono is bundled with its OFL license.
- Today and Schedule: collapsible past sessions with unfinished-journal count, a current-time marker, timestamp columns, hatched bookable gaps, conflict labels, program summaries and saved-set segments. Calendar density bars retain exact counts in accessible labels. The chronological layout prioritizes readable cards rather than proportional minute-by-minute heights.
- Workout: segmented, editable set controls, a live SVG rest ring with 15-second ticks, 40 px primary values, explicit “Править” control, flat voice button and a segmented mini-player. The ring uses the existing deadline and adjustment controls. Saved sets, drafts, attendance and charging retain their separate semantics.
- Transfers share one expandable component with complete dates and labeled actions. Payments use aligned numeric columns and the existing payment sheet.
- Progress sparklines use daily maximum recorded values from the last eight weeks; missing dates and empty histories are not filled with synthetic data. Text alternatives contain the underlying values. Attendance uses filled/outlined bars.
- Wide mode reuses the actual Today and client-card components. A client selector drives the right pane; dialogs make both panes inert.
- Motion responds to events: saved-set feedback, rest completion, next exercise, workout open/minimize transitions where the browser supports View Transitions, skeleton reveal and result count-up. Reduced-motion and calm preferences suppress these effects. Existing voice capture drives its listening UI. Decorative mascot motion, glow and resting dock pulses are disabled in Instrument.
- The existing approved panda assets are reused at 32–40 px, with large poses reserved for onboarding and completion. No replacement character was generated.

## Verification

Run from the repository root:

```sh
python3 -m http.server 4187 --bind 127.0.0.1 --directory prototype-fresh
node --test prototype-fresh/tests/*.test.cjs
node prototype-fresh/review/instrument/verify.cjs
node prototype-fresh/review/instrument/contrast.cjs
```

If that port is occupied, start the server on another port and pass its origin with `BASE_URL`, for example `BASE_URL=http://127.0.0.1:4188 node prototype-fresh/review/instrument/verify.cjs`. The contrast script accepts the same variable.

- 133 unit tests, including eight-week series boundaries, saved/omitted set counts and booking validation.
- 216 Instrument combinations: 18 routes × 3 viewport widths (320, 390, 1440) × 4 scenarios. Assertions cover horizontal overflow, audited touch targets and render errors.
- 36 route checks for the original/firm appearances at 320 px.
- Pointer-driven checks cover save, ticking rest, minimize/resume, reload persistence, unfinished past sessions, theme choices, calm mode, desktop selection, presentation mode, booking validation, payment and transfer dialogs, 20 px text and reduced motion, and completed-session totals.
- Rendered text contrast scan across 16 dark/light routes. The script evaluates opaque/transparent color stacking and skips gradient-backed text; it is a targeted check, not a full accessibility certification.

`report.json`, `contrast.json` and the adjacent screenshots are generated evidence. Screenshots use fixture data, not actual client records.

## Follow-ups requiring work outside this code pass

- A layered Rive character and exported `.riv` animation remain an illustration/rigging task. The approved handoff explicitly records static assets and says not to redraw the character with code. The prototype uses the existing assets and contextual UI motion.
- Real-device gym testing is still needed to judge dark defaults, compact telemetry and legibility under actual lighting. This pass was verified in Chromium, not on a physical iPhone.
- Section 7's optional generated concept screens, icon alternatives and new illustration sheets remain prompts; no generated image was substituted for a working screen.
