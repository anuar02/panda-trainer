# Motion review — 23 September 2026

Scope: current isolated direction study, not the original prototype. Review-animations skill applied to the source, followed by scoped fixes. No claim of target-device frame-time measurement.

## Findings

| Before | After | Why |
| --- | --- | --- |
| Sheet CSS keyframes restart from a predetermined position on close; a timer owns closure | `direction.js:33` and `direction.js:44`: capture current computed transform, cancel the prior Web Animation and animate from the captured position; complete on `finished` | Closing during entry should not jump back to the fully open pose. A cancelled exit cannot later close a reopened dialog. |
| Backdrop animates its background color | `direction.css:11`: static translucent backdrop | Removes a repainting animation that does not add useful information. Only the sheet transform is animated. |
| Keyboard activation gets the same translation as pointer activation | `direction.js:17`–20 and `direction.js:56`: keyboard-origin interaction/Escape resolves immediately | Repetitive keyboard actions should not wait for decorative movement. |
| Changing motion preference affects CSS but would not cancel a running Web Animation | `direction.js:61`: cancel motion immediately, finish an in-progress dismissal safely and pause the optional video | Reduced-motion preference must take effect during the interaction as well as before it. |
| Optional video absent in this revision | `direction.html`: native controls, `preload="none"`, no autoplay/loop, static poster; `direction.js` visibility handler pauses on leaving the tab | The welcome scene remains complete without playback, and optional motion does not keep running out of view. |

## Verdict

**Performance:** no `transition: all`, animated layout dimensions, animated background or perpetual status pulses in this study. The progress bar changes width immediately; it is not animated, so it is not a layout-animation finding.

**Interruptibility & timing:** entry 240ms and exit 180ms retain the approved project sheet curve `cubic-bezier(.22,.8,.25,1)`. It is an existing token, not an invented universal timing optimum. The Web Animation captures current position before cancellation and guards stale completion callbacks.

**Accessibility:** keyboard activation/Escape and reduced-motion both remove translation. The native dialog provides modal semantics; the code restores the trigger where it remains enabled. Real assistive-technology behavior, focus cycling and rapid input still need a reliable browser/device pass. Complete removal of motion is deliberate here: the explicit text and modal state remain sufficient.

**Origin, physicality & cohesion:** bottom-origin sheet matches the contained scheduling decision. No bounce, character motion or decorative entrances occur on repeated set entry. Generated welcome motion is separate, user-initiated and not an instructional exercise demonstration.

**Decision: Approve for the isolated source-level study; block production sign-off until interactive keyboard, focus, interruption and target-device checks are complete.** Chrome opened the revised screens, but intermittent native-control `noWindowsAvailable` errors prevented a dependable end-to-end motion pass. This qualification is not a claimed performance defect in the app.
