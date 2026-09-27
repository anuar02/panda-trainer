# Identity research

Open [direction.html](direction.html) in Chrome for the **current expanded study**: three identity routes, three interactive app screens and two new stylized GPT Image illustrations. [DIRECTION.md](DIRECTION.md) explains the design reasoning, motion system, scope and test plan.

The user rejected the earlier realistic illustration direction. Its image and Seedance video are archived, not recommended or displayed in the current board. On 23 September, one new Seedance 2.0 animation was generated from the stylized shared-plan illustration and added with manual playback only. The old index now leads to the current board; [archive-v1.html](archive-v1.html) preserves the earlier study for provenance only.

- [NIGHT-UPDATE.md](NIGHT-UPDATE.md): latest changes, verification and remaining decisions, in Russian.
- [responsive.html](responsive.html): manual viewport-width viewer, 320–1280 px; not a device emulator.
- [IMPLEMENTATION-BRIEF.md](IMPLEMENTATION-BRIEF.md): acceptance criteria for the next original-prototype iteration, not changes already applied there.
- [MOTION-REVIEW.md](MOTION-REVIEW.md): source-level animation review and explicit sign-off limits.
- [study-model.test.cjs](study-model.test.cjs): 15 unit tests for the same model consumed by the current board.

- [REPORT.md](REPORT.md): detailed review, 16 prioritized findings, brand direction, references and usability test plan.
- [ASSETS.md](ASSETS.md): exact prompts, provider/model, decoded media details, visual critique and verification limits.
- [checks.cjs](checks.cjs): read-only source diagnostics; mutations affect only disposable VM memory.
- [validate-study.cjs](validate-study.cjs): current board's static integrity checks, not an end-to-end browser test.
- [assets/](assets/): generated illustration and Seedance 2.0 video.

The original prototype was not edited. This directory is an isolated research artifact, not an approved design system or release candidate.

Run the diagnostic reproduction from the repository root:

```sh
node design-exploration/identity-research/checks.cjs
```

The output reports observed issues rather than treating them as passing application tests. It requires only Node.js; no new project dependencies were installed.

Current isolated-study checks:

```sh
node --test design-exploration/identity-research/study-model.test.cjs
node design-exploration/identity-research/validate-study.cjs
```

Unit tests and static checks do not replace the still-incomplete browser/device/assistive-technology pass.

Media inspection helper (macOS, local decoding only):

```sh
swift -module-cache-path /private/tmp/trainer-identity-swift-cache \
  design-exploration/identity-research/inspect-video.swift \
  design-exploration/identity-research/assets/coach-client-seedance-2.mp4 \
  /private/tmp/trainer-identity-video-frames
```

The helper uses macOS AVFoundation and prints decoded metadata plus sample frame timestamps. Some synchronous APIs are deprecated but worked on the inspected machine. Media decoding may require sandbox approval. Generated frame images are diagnostic and do not modify the original media.
