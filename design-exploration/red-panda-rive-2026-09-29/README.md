# Red panda — Rive motion trial

An interactive Rive CLI 1.2.0 trial using the existing simplified v5 SVG geometry. This is a motion study, not approved final mascot artwork. The selected identity remains the red panda with a dark-brown headband in `../mascot-sheets-2026-09-26/red-panda-dark-headband.png`.

## Open

From the repository root:

```sh
~/.rive/bin/rive design-exploration/red-panda-rive-2026-09-29
```

Click **Wave**, **Tap reaction**, or the panda itself. Idle breathing/blinking loops; wave and tap return to idle. Tapping during a wave interrupts it. The native preview rebuilds on save.

## Files

- `scene.rml`: editable preview with controls and embedded Inter font.
- `mascot/scene.rml`: standalone 480 × 500 artboard, with no background paint, text, font, raster artwork, or scripts.
- `exports/red-panda-v5.riv`: reusable compiled mascot; approximately 9.4 KB.
- `build_scene.py`: converts geometry from `../red-panda-rig-2026-09-26/index.html` and authors the timelines/state machine. Requires Python 3 and Node. Regenerating overwrites both RML files.
- `source-v5.svg` and `parts.json`: extracted source geometry and generated part identifiers.
- `review/`: rendered frames, observed state dumps, and test report.

The rig has eight bones with rigidly attached vector shapes and no mesh deformation. The state machine is `Panda`; animations are `Idle`, `Wave`, and `Tap`. Its `Panda` view model exposes `wave` and `tap` triggers, plus a `state` string for inspection. The standalone artboard is `Red Panda` and includes its own tap listener. App-driven wave uses the view-model trigger.

## Rebuild and verify

```sh
python3 design-exploration/red-panda-rive-2026-09-29/build_scene.py
~/.rive/bin/rive design-exploration/red-panda-rive-2026-09-29 --verify
~/.rive/bin/rive inspect design-exploration/red-panda-rive-2026-09-29 --summary
~/.rive/bin/rive design-exploration/red-panda-rive-2026-09-29/mascot --verify
~/.rive/bin/rive inspect design-exploration/red-panda-rive-2026-09-29/mascot --summary
python3 design-exploration/red-panda-rive-2026-09-29/verify.py
~/.rive/bin/rive design-exploration/red-panda-rive-2026-09-29/mascot --once
cp design-exploration/red-panda-rive-2026-09-29/mascot/build/red-panda.riv design-exploration/red-panda-rive-2026-09-29/exports/red-panda-v5.riv
```

The interaction checks require Pillow and local Metal graphics access on macOS. Eight checks cover idle, wave, tap, both returns to idle, repeat wave, interruption, and the standalone tap target. Rendered wave/tap frames are also compared with idle. CLI screenshots include a dark previewer backdrop; background-paint absence is checked in the authored RML, not inferred from PNG alpha. Runtime transparency in the app has not yet been tested.

Before app integration, refine the artwork against the approved master and check appearance at actual display sizes. The existing video integration remains the current app implementation.
