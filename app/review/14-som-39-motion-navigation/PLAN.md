# SOM-39 implementation plan and execution record

Goal: reproduce the brief 14 CSS motion using the existing Reanimated stack.
Spec: owner brief SOM-39; prototype-fresh CSS/JS and UI-PARITY.
Architecture: shared motion policy, focus/scenario entrance, explicit row/invite
stagger, interruptible press animations, idle tab preload. No new dependency.

- [x] Read repository policy, live Linear issue/project and exact CSS/JS triggers.
- [x] Write mechanism tests; observe RED for absent APIs before implementation.
- [x] Implement named tokens and shared motion/policy/navigation components.
- [x] Connect headers, vertical screen bodies, existing rows/pills/skeletons/fills
  with minimal screen edits, excluding workout/mascot/toast/sheet files.
- [x] Measure real screen mount vs preloaded focus with React Profiler; record
  methodology and limitations in README/PROFILE.
- [x] Independent review: fix Card gap/layout, reduced stack transitions,
  return tabPop and both invitation cards.
- [x] Headless web: verify navigation, actual intermediate transforms, calm and
  NativeWind styling; register cssInterop where Animated classes were lost.
- [x] Run full check and platform export; update CHANGELOG/ROADMAP/ADR/report.
- [x] Commit, push specified branch and create draft PR with acceptance statuses.

Owner acceptance, full theme/state comparisons and native device testing remain
open; neither the plan nor passing tests accepts a screen or closes SOM-39.
