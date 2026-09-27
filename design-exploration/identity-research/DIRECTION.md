# Design expansion: a shared training notebook

22 September 2026. Isolated proposal, not a production redesign. Supersedes the realistic charcoal image direction after the user's explicit rejection. The prior image and video remain archived for provenance, not recommended assets.

## Plan, reviewed against the brief

Keep the approved gymGO base: canvas `#f6f6f7`, surface `#ffffff`, sunken `#eeeef0`, ink `#050505`, secondary `#5e5f60`, border `#e9e9ec`. Mint and amber remain semantic, not branding. Use black text on pale semantic fills. Keep Montserrat 700–800 for display and Inter for reading/input. Body 15/1.5, metadata 13/1.45, section titles 24–32, phone titles 26–30; tabular numbers for time, weight and reps. No new brand name or logo is approved.

Three routes within that foundation:

- **Studio schedule:** timetable rhythm, time column, confident type, very little illustration. Strong for the paying trainer, but risks making the client feel like a booking in a database.
- **Shared training notebook — recommended:** a precise working register plus a small authored illustration family for relationship moments. A notebook is something trainer and client both contribute to; it also connects scheduling with recording. Risk: generic productivity positioning unless the actual content stays grounded in sessions, sets and participants.
- **Personal rhythm:** generous spacing, repeated session markers and a quieter client-first voice. Suitable for reflection, weaker for dense overlapping trainer schedules. Do not turn its rhythm into streak pressure or fake progress.

The recommendation combines an operational layout already supported by the brief with a distinct relational illustration layer. These are presentation routes, not three new products or three competing feature sets.

### Layout studies

All functional text is left aligned; only the welcome illustration and invitation copy are centered. Illustrations never sit behind inputs or meaningful text. Use dividers for sets and agenda rows, cards for genuinely separate objects, a bottom sheet for a contained decision. Do not turn every paragraph into a rounded card.

```
Trainer Today             Client home                Group recording
date / inbox              greeting                   session / progress
earlier (collapsed)       nearest confirmed time     participant buttons
current session           explicit next action       exercise / previous values
participants / record     future transfer request    editable set rows
next session              current + proposed dates   save each set
                          program                    review all participants
```

### Critique before implementation

Rejected the earlier realistic gym scene: it behaved like stock fitness artwork and did little for app identity. Also rejected a new accent palette, a mascot, decorative fitness equipment and a motivational hero on Today: none addresses the approved workflow. The distinctive element is instead a small drawn world around shared planning. Operational screens intentionally remain quiet. The HTML research board is a presentation surface, not a proposed app landing page.

## Illustration system

Two new GPT Image assets use black contour, white negative space, cool-grey fills and restrained grain. Human gesture supplies warmth without borrowing green from success states. The new people are fictional illustrated characters, not substitutes for a real trainer avatar.

**Shared plan:** invite and first connection only, around 240–320 CSS px wide. A woman coach and male beginner broaden the earlier narrow casting, but two characters are not a validated inclusive character system. Future briefs should cover ages, body types and access needs without reducing people to visual stereotypes.

**Blank notebook:** unassigned program or first recording, 120–160 CSS px. It must accompany useful copy explaining who acts next. No check marks or medals before an actual achievement. A client with no assigned program does not get a misleading “Create program” action if only their trainer can do that.

No photos, anatomical exercise illustrations, photorealistic renders, mascot, or decorative art on the set-entry screen. Real uploaded trainer photos can eventually serve identification, but are outside this illustration study. UI icons remain the established code-native icon system; generated raster art must not replace accessible controls.

The notebook output has a little more dimensional shading than the ideal flat master. Both assets are direction candidates, not a fully polished production library. Keep originals; finalize line weight and grain at actual app size before expanding the family. The white background is intentional and opaque, not a verified alpha cutout.

## Screens and demonstrated behavior

### Trainer Today

The default viewport begins at the fixture's current session, 20:00–21:00. Earlier appointments are available under an explicit disclosure, not lost. Current time is fixed at 20:30 for a repeatable study; do not ship it as a clock. Names and start/end times lead. Recording is the obvious action, and the inbox stays a compact secondary action. This study concentrates on the current/next boundary; it does not replace the full weekly overlap layout already explored in Today A.

### Client home

The nearest confirmed booking (14 September, 21:15) retains the hero. A request for a different future session appears separately. Pending transfer shows both full dates and times, and explicitly says the original remains valid. Updated on 23 September: the client's button opens a read-only view; trainer inbox exposes accept/decline. The client card reflects the trainer's decision. A board-level reset allows repeat review without giving the client trainer controls. Declining a transfer does not cancel the booking. This is still a local role demonstration, not server-enforced authorization.

### Group recording

Three people each own their values and saved-set states. Switching people keeps their draft. A set is recorded only after an explicit save; editing a saved row makes it unsaved again. Finish reviews missing sets across all three participants, not just the current one. Completion requires every row in this narrow study; skipping an exercise, absence, early finish, exercise editing and billing are outside this interaction. State is in memory and resets on reload, clearly labeled in the board. No production persistence or cross-device sync is claimed.

## Motion direction

| Interaction | Proposed treatment | Purpose / fallback |
|---|---|---|
| Tap | Immediate visual state; optional 100ms color transition | No scale bounce on repetitive logging |
| Save set | Immediate static check + “Записан” text | State must be understandable without movement |
| Participant switch | Immediate content update | Avoid sliding forms while a trainer is entering data |
| Transfer sheet | 240ms entry, 180ms exit, existing sheet curve | Focus enters dialog; Escape closes and restores trigger |
| Earlier sessions | Native disclosure; no animated height | Fast retrieval, predictable reading order |
| Waiting for a person | Static amber label | A human response is not a loading operation |
| Illustration | Static by default | Optional generated study with explicit playback, never a required step |

System reduced motion and the board's manual override both remove the sheet translation and other animation. These timings are proposals to compare with the inherited 340ms, not universal measured optima. Phone haptics, virtual keyboard, real scrolling performance and screen-reader behavior still need target-device testing.

## Seedance follow-up (generated 23 September)

Used the new shared-plan image as the sole reference in Higgsfield Seedance 2.0 for one five-second, no-audio generation. Brief: one small pointing gesture and a nod, locked framing, preserve the drawn style and settle still. The optional result appears below the illustration studies with native controls and a static poster. Actual output: 5.042s, 1112×834, 24fps, no audio. The source's 3:2 framing was changed to 4:3; sampled frames show some facial/texture drift. This is a review candidate, not approval of the art direction or production video. Exact prompt and provenance are in ASSETS.md.

## Evaluation, not claimed user research

The competitor and standards sources supporting the audit remain in [REPORT.md](REPORT.md). The visual routes above are design hypotheses derived from this product brief, not competitor-derived conversion claims or tested preferences.

Test with 4–5 independent trainers and 4–5 clients as an initial qualitative round, not a statistically powered preference poll. Show routes in varied order with identical copy. Ask what the app does and who it is for before explaining it. Then ask users to find the next valid appointment during a pending transfer, resume another participant's values and identify who acts when no program is assigned. Record incorrect interpretations, time to first correct action, requests for explanation and whether illustration helped or distracted. Do not call a route validated from aesthetic preference alone.

Production work remains separate: fix persistence and state semantics, decide the route, then integrate selected UI and optimized artwork with a responsive/accessibility test matrix. This board does not silently approve or implement those changes.

## Verification performed

- Generated both new illustrations with built-in GPT Image, visually inspected the outputs, copied them into the project and verified PNG dimensions/alpha with the local image utility.
- Opened the expanded board in Chrome; visually reviewed the hero and upper portions of all three desktop screen studies.
- Browser accessibility observations confirmed empty-weight validation, recording `8,5 kg × 12`, the saved count changing to `1/6`, focus moving to the next set, switching to Madi's empty form, then returning to Alia with both the saved first set and an unsaved second-set weight still present.
- Chrome control subsequently returned intermittent `noWindowsAvailable` / clipboard errors and stale screenshots. The complete dialog accept/decline flow, all-six-set completion, manual reduced-motion comparison and narrow viewport layouts were **not fully verified in the browser**. They remain implementation proposals in this isolated board, not certified behavior.
- Static validation passes for JavaScript syntax, 28 unique static IDs, 12 local references, image alt attributes, absence of rejected assets from the current board, and presence of reduced-motion rules. This does not establish WCAG conformance, live performance or usability.

Run `node design-exploration/identity-research/validate-study.cjs` from the repository root. Existing source-model diagnostic findings were reproduced again; no original prototype code was changed.

### 23 September continuation

The UI now consumes `study-model.js`; its 15 Node tests pass. Static validation checks 30 unique IDs, 17 local references, load order, illustration-video controls and lack of autoplay/loop. Project TypeScript checking also passes. Sheet motion now captures the current transform when interrupted, avoids background-color animation and resolves instantly for keyboard/reduced-motion input. See MOTION-REVIEW.md for the verdict and unverified real-device behavior.

Chrome opened the updated desktop screen study, but native-control errors (`noWindowsAvailable` and clipboard timeouts) recurred. The new responsive viewer is supplied for manual review; a completed narrow-width matrix or complete end-to-end role-flow test is not claimed. The earlier partial browser observations above refer to the 22 September revision, not proof that every subsequent change was exercised.
