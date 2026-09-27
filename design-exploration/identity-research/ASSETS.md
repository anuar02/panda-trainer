# Asset provenance and review

22 September 2026 · Generated concept assets · Not integrated into the prototype

## Current illustrated direction — v2

The user rejected the earlier realistic/charcoal direction. The assets below supersede it. The older image and video farther down this file are archived provenance only, not recommended production assets. On 23 September, one new Higgsfield video was generated from the v2 illustration; details follow.

- [shared-plan-v2.png](assets/shared-plan-v2.png): built-in GPT Image; 1536×1024 PNG, no alpha. Fictional graphic coach–client illustration, white background. No real-person image or private customer information supplied.
- [blank-notebook-v2.png](assets/blank-notebook-v2.png): built-in GPT Image; 1254×1254 PNG, no alpha. The shared-plan image was supplied as a style reference, not as an edit target.

Both files were copied into this workspace, leaving generated originals intact. Displayed in [direction.html](direction.html). No external image-generation CLI or new API key was needed.

### Exact shared-plan prompt

> Use case: illustration-story. Asset type: invitation illustration for a personal trainer–client app, not a photograph and not a UI mockup. Create an original boldly stylized 2D illustration of two adult people sharing a small open training notebook: a woman coach in a black oversized sports T-shirt and a male beginner client in a light grey tracksuit, standing comfortably as equals. Simplified compact rounded bodies, oversized rounded sneakers, small expressive faces, softly angular ink noses, graphic black hair shapes, natural varied body builds without muscle definition. The notebook is the shared focal point. Art direction: contemporary cut-paper editorial cartoon, confident slightly irregular black contour, flat solid black and cool grey shapes with tiny restrained printed grain inside fills only, white skin rendered as unfilled paper, two or three greys maximum. Warmth comes from gesture and character, not color. Background pure white. Landscape 3:2, one compact centered scene with ample white margins and full figures visible. Visually legible at 280px wide. No gym interior, plants, benches, additional props, floating symbols, confetti, muscular anatomy, realistic shading, photography, 3D, glossy surfaces, gradients, generated lettering, logos or watermark. This is a new illustration direction; do not resemble a charcoal realism sketch.

### Exact notebook prompt

> Use case: illustration-story. Input image 1 is STYLE REFERENCE ONLY, not an edit target. Create a new companion spot illustration in precisely the same hand-drawn black-and-cool-grey graphic cartoon language for the empty training-program screen of a trainer–client app. Subject: a small open ring-bound training notebook with completely blank pages and one chunky black pencil lying diagonally alongside it. Nothing else. Slightly irregular confident ink outlines, rounded simplified forms, flat black and two cool grey fills, subtle printed grain restricted to the black fills, paper white negative space. Deliberately exaggerated friendly proportions, simple enough to read at 160px wide; 2D drawn illustration, absolutely not a realistic still life or a product photograph. Three-quarter top view, square composition, entire notebook and pencil visible, generous clean white margins, pure white background. Do not include people, words, numbers, check marks, charts, logos, gradients, glossy 3D, shadows suggesting a photographic studio, confetti, sparkles or floating symbols. The metaphor is a plan ready to begin, not an accomplishment or a completed task.

### Visual review

Inspected both outputs. The new characters are visibly drawn, without muscle definition or a realistic gym setting. Black contour and grey fills link the notebook to the human scene. Small-scale notebook shading is slightly more dimensional than the ideal flat master; refine it before treating this as a finalized illustration system. White backgrounds are opaque, not transparent cutouts. Images contain no relied-on UI labels. They are not exercise technique references or actual trainer portraits.

The frontend-design skill shaped the explicit three-route plan, retained-token constraint, pre-build critique and distinction between expressive invitation art and quiet operational screens. The imagegen skill supplied both new raster assets using its built-in workflow. Review and research recommendations from the first pass remain in REPORT.md; nothing in the source app was implemented.

## Current animation — 23 September

File: [shared-plan-seedance-v2.mp4](assets/shared-plan-seedance-v2.mp4), 1,230,851 bytes. [Original Higgsfield result](https://d3u0tzju9qaucj.cloudfront.net/2e3af233-4fbc-4917-b34a-fe4d39f6b88f/5d316afe-74c2-4385-bae4-bac0cebf0ae9.mp4).

Provider/model: Higgsfield API, `bytedance/seedance-2.0/image-to-video`. Existing project server-side integration, sole input `shared-plan-v2.png`. One job submitted and completed, not a batch. Requested 5 seconds, 720p, `generate_audio=false`; no price or billed amount asserted. Parameters checked against the [official image-to-video reference](https://open.higgsfield.ai/models/bytedance/seedance-2.0/image-to-video/api-reference). The global Higgsfield CLI still lacked a selected workspace, so the already working project integration was used; credentials were not exposed or moved into the browser.

Exact prompt:

> Animate this as a restrained hand-drawn 2D editorial illustration. Locked camera and unchanged framing. The woman makes one tiny pointing gesture toward the open notebook; the man gives one small nod. Keep feet planted, notebook stable, black outlines and flat grey fills consistent. Preserve the drawn faces, proportions and clothing. White background stays perfectly still. Motion is gentle and limited to this single shared-planning gesture. Settle into a still pose for the last second. No new objects, text, camera moves, realism, 3D shading or texture crawling.

Verified with macOS AVFoundation: 5.042 seconds, 1112×834, 24fps, one video track and no audio track. Exact-time frames extracted at 0, 1, 2.5, 4 and 4.875 seconds; visually inspected start, midpoint and final sample. The codec required an approved local unsandboxed decode after the sandboxed attempt failed. No extra generation was needed.

Review: the graphic drawn style and main silhouettes remain recognizable, with subtle head/gesture movement. Face contours, notebook details and print texture drift slightly in the sampled frames. The service changed the input's 3:2 framing to 4:3; do not present it as an exact locked-framing match. No seamless loop or frame-by-frame temporal certification is claimed. Continuous playback and target-device review remain outstanding.

Delivery: optional player in `direction.html`, no autoplay, no loop, no preload, native controls and static image poster. The player uses `object-fit:contain` without stretching/cropping. Changing to reduced motion or leaving the tab pauses playback; the user can explicitly choose playback again. Not used on functional recording/scheduling screens, and never treated as exercise instruction.

## Prototype integration — 23 September, after the study

The two v2 GPT Image originals were copied unchanged to `prototype/assets/illustrations/`:
`shared-plan.png` for invitation and `blank-notebook.png` for the no-first-session state.
The live prototype now uses them; earlier statements that the source app was untouched
describe the study phase only. No additional generation was submitted for integration.
The invitation composition was checked at mobile widths 320/375/390/430 and desktop.
The images are decorative, with state/action text rendered separately in HTML.

The Seedance video remains in the optional study player, not in the live prototype.
Observed face/texture drift and changed framing are reasons to retain a static image.
This is prototype placement, not final brand or production asset approval.
See [delivery notes](../../prototype/assets/illustrations/README.md).

## Archived first pass


## Image

File: [coach-client-study.png](assets/coach-client-study.png). Generated with the built-in GPT Image tool, using the imagegen skill. No real-person reference image or customer data was uploaded. The result was copied into the workspace; the original generated file was retained.

Exact prompt:

> Use case: illustration-story. Asset type: art-direction study for an invitation screen in a Russian-language trainer-client scheduling and workout app for independent trainers in Astana. Create a refined editorial illustration, landscape 3:2 composition, of two adult people, a male coach and female client, standing beside a simple gym bench and calmly reviewing an open blank training notebook together. Everyday athletic builds, Central Asian appearance, modest ordinary training clothes. Friendly and professional, equal partnership, natural anatomically plausible hands and posture. Style: sophisticated graphite pencil and dry charcoal shapes on an almost-white #f6f6f7 paper background, subtle grain, spare precise lines, soft rounded silhouettes, black and cool grey clothing, natural muted skin tones as the only warmth. Main subjects occupy middle 60 percent with abundant clean margins; feet and heads fully in frame. Small unobtrusive dumbbell resting on floor gives fitness context. Soft diffuse light, extremely restrained shadow. Flat editorial illustration, not glossy 3D, not stock photography, not childish cartoon. No writing, letters, numerals, logos, phone UI, colored status dots, orange flames, gradients, badges, confetti, or decorative floating shapes. This will be a static reference for a gentle 5-second animated welcome vignette; strong stable silhouettes and a simple uncluttered composition.

Visual review: the neutral palette, notebook and relationship are useful. The output is more realistic, muscular and environmentally detailed than intended. Keep it as a comparison study; simplify the visual vocabulary and broaden representation before building a production family. Generated people are fictional, not coach portraits.

## Video

File: [coach-client-seedance-2.mp4](assets/coach-client-seedance-2.mp4).

[Original Higgsfield media URL](https://d3u0tzju9qaucj.cloudfront.net/2e3af233-4fbc-4917-b34a-fe4d39f6b88f/6d1641d3-d417-463f-b5a9-1405aac1763e.mp4).

Provider/model: Higgsfield API, `bytedance/seedance-2.0/image-to-video`. Used the existing project CLI and credentials, with the generated PNG as the sole image input. Requested 5 seconds, 720p, audio disabled. One video job was submitted and completed; no extra variants were generated. Actual billed cost was not returned by this workflow and is not asserted here.

Exact motion prompt:

> Locked camera. Preserve the graphite editorial drawing, faces, clothing, notebook, bench and composition exactly. Over five seconds the coach makes one small pointing gesture at the notebook and the client gives one subtle nod. Gentle natural breathing only. Keep both feet planted and all background objects perfectly still. Soft restrained human movement, stable pencil texture, no camera movement, cuts, new objects, writing or effects. Settle into a still pose for the final second.

Command (running it again may create another paid generation):

```sh
npm run higgsfield -- animate '<motion prompt above>' \
  --image design-exploration/identity-research/assets/coach-client-study.png \
  --duration 5 --resolution 720p --no-audio --wait --timeout 900 \
  --download --out design-exploration/identity-research/assets
```

Verified metadata through macOS AVFoundation: 5.042 seconds, 1112×834, 24 fps, one video track and no audio track. These are actual decoded dimensions, not the requested resolution label. The output is 4:3 while the source illustration is 3:2; the service did not preserve exact framing. The study viewer contains the video without stretching or cropping it.

Extracted exact-time frames at 0, 1, 2.5, 4 and 4.875 seconds using [inspect-video.swift](inspect-video.swift); visually inspected start, midpoint and final samples. The coach's pointing hand and the client's head change position while the bench, dumbbell and overall silhouettes remain recognizable. No large discontinuity or added text is apparent in those sampled frames. Small facial and texture changes are visible; this is not a frame-by-frame temporal artifact certification. No seamless loop is claimed. Production motion review should include continuous playback on target devices.

The built-in macOS decoder required execution outside the sandbox; the first sandboxed decode failed, and the permitted retry succeeded. This was a local media inspection, not a second generation.

Seedance 2.5 is also documented by the provider: [official image-to-video API reference](https://open.higgsfield.ai/models/bytedance/seedance-2.5/image-to-video/api-reference). The selected 2.0 version was within the user's requested choices and already supported by this project's wrapper. No claim is made that 2.5 is unavailable.

## Use and delivery

- Current placement: isolated invitation comparison and optional video study.
- Static image is sufficient; video does not autoplay or loop and has native playback controls.
- No generated words, UI state or exercise technique is relied on for product functionality.
- Do not present the fictional people as actual coaches/clients, or the motion as a technical exercise demonstration.
- Final name, logo, illustration language and production placement remain design decisions.

## Study verification

Opened the HTML study in Chrome, visually inspected its header, invitation comparison and open sheet. Corrected the image's intrinsic-height layout issue. Verified a local invitation state change, reset of both previews, sheet opening, Tab containment and Escape returning focus to the trigger. Checked inline JavaScript syntax and local file references. A complete responsive/device/browser matrix was not run.

The UX skill shaped the proposed participant research tasks; review-animations shaped the motion audit and isolated timing comparison; imagegen supplied the raster illustration workflow; higgsfield-generate supplied the video brief/workflow, adapted to the already working project API integration. Existing prototype files and design decisions were not edited.
