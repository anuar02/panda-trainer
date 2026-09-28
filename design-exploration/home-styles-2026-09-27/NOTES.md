# Client home: three visual directions

27 September 2026. Review concepts, not an approved replacement for the app.

Open `index.html`, or serve the repository and visit
`/design-exploration/home-styles-2026-09-27/`.

## Directions

- **A — Напарник:** the selected panda greets the client beside the appointment
  reminder. Warm paper, peach scene, cocoa actions, quieter white session card.
- **B — В ритме:** a bold time and track illustration make the workout the focal
  point. Cocoa, warm white, sand, rust. The panda accompanies package progress.
- **C — Личный план:** a weekly strip and vertical agenda clarify the day. Pale
  green, forest actions, white appointment, panda holding the clipboard.

Inter carries interface text; Montserrat gives A and B a stronger greeting.
All three use the existing red panda with dark headband, selected on 26 September.
The artwork is displayed through CSS crops of the original master, without
redrawing, generating, or modifying the image. Crop aspect ratios are preserved.

The first plan was reviewed against the brief: generic dashboard statistic tiles
were replaced with a package strip, and each mascot placement was assigned a
specific role. The main design experiment is composition and character placement.

## Interaction and scope

The comparison shows all three at desktop widths, and tabs at 1040 px and below.
Links can select a mobile variant with `#companion`, `#sport`, or `#planner`.
Program, booking, package, notification, and navigation controls open preview
details. Program exercises come from `DB.programFor('Низ А')` in the prototype.
The other content reflects the client c1 demo and 14 September appointments,
shown as a morning snapshot. No real bookings or payments are modified.

The motion control is off by default. It replays a single entrance of the panda
scene and animates the package indicators. It is not a character rig or idle
animation. `prefers-reduced-motion` disables animations.

## Visual review and checks

- Screenshots reviewed in Chromium at desktop and mobile sizes.
- Fixed an initial squeezed crop and white crop background in the welcome scene.
- Enlarged supporting type; small screens switch to one concept at a time.
- No page errors, broken images, or horizontal overflow at 320, 390, 760, 900 px.
- Program dialog displays all five existing exercises; dialog close works.
- Motion toggle works; reduced motion computes `animation-name: none`.
- Evidence: `screens/comparison.png`, individual phone captures, `screens/mobile.png`,
  and `screens/checks.json`.

Reproduce screenshots with a server at `127.0.0.1:4173` and
`node design-exploration/home-styles-2026-09-27/capture.cjs`.

Recommendation for review: A if character is the priority, B if workout hierarchy
is the priority. C tests a calmer daily planner. No direction has been selected.
