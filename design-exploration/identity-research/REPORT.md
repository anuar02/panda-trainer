# Trainer–client prototype: UI, UX, identity and motion research

22 September 2026 · Design research and recommendations · Not an approved redesign

**Implementation update, 23 September:** this report records the pre-change audit.
The main prototype now has local journal persistence, explicit set confirmation,
whole-group completion review, corrected transfer responses, selected-session client
actions, and factual attendance labels. Current behavior and remaining limits are
documented in [the prototype guide](../../docs/prototype-guide.md) and
[the implementation checkpoint](../../prototype/IMPLEMENTATION-CHECKPOINT.md).
The diagnostics below are historical findings, not a claim that every issue remains.

**Direction update:** the user rejected the earlier realistic image style. The current proposal uses new stylized GPT Image illustrations, three identity routes and interactive Today, client home and group-recording studies. Start with [the expanded board](direction.html) and [its rationale](DIRECTION.md). Any charcoal-image/video discussion below is retained as historical exploration, not the current recommendation.

## Recommendation

Build the identity around **a clear agreement between a trainer and a client**. Keep the approved gymGO visual foundation: light surfaces, black primary actions, Inter and Montserrat, rounded surfaces and restrained semantic color. Give the product its own personality through precise scheduling, identifiable people, honest records and warm invitations.

The highest-value next iteration is Today → appointment details → recording → saved result, together with client appointment/transfer states. Fix the meaning and continuity of those flows before expanding the illustration library. Rich imagery is most useful in invitation and onboarding; a coach's working schedule should remain highly scannable.

Deliverables: [current visual study](direction.html), [new shared-plan illustration](assets/shared-plan-v2.png), [matching notebook](assets/blank-notebook-v2.png), [generation brief](ASSETS.md), [reproducible diagnostics](checks.cjs).

## 1. Evidence and limits

This is an expert review with desk research and source-level diagnostics. No interviews, participant usability sessions, conversion experiment or eye-tracking study was conducted. Severity reflects potential task impact, not measured frequency.

Reviewed the handoff v2, DESIGN.md, design-system documentation, current prototype HTML/CSS/JS, the separate Today explorations, and saved screenshots of Today, recording, invitations, client home and other flows. The newer DESIGN.md explicitly records adoption of gymGO's design language; the product name and mascot remain unresolved. Existing user changes were preserved.

Chrome displayed the live Today screen and exposed the Inbox content through its accessibility tree. Subsequent native control produced stale element/window errors and inconsistent tree/screenshot state. Consequently, this report does **not** claim a completed live end-to-end usability or animation test. Saved screenshots establish historical visual evidence; current source and isolated in-memory diagnostics establish the code findings. Physical devices, touch accuracy, screen readers, zoom/reflow, frame rate and Safari/Firefox remain untested.

The prototype date is intentionally fixed to 14 September 2026, with a default time of 20:30. It is a fixture, not a clock bug. Reviewer controls and the left/right rails are the testing shell, not product navigation.

Primary external references were inspected on 22 September 2026. Competitor documentation establishes available patterns, not proof that those patterns improve this product's outcomes.

## 2. Identity: what is established and what is missing

| Layer | Current evidence | Recommended direction |
| --- | --- | --- |
| Audience | Independent trainers with 5–40 clients; trainer pays, client joins free; Astana pilot | One shared service with two role-specific experiences |
| Promise | Scheduling, programs, results, attendance and manual package/payment records | “Your next session is clear. Your work together is remembered.” This is positioning, not final advertising copy |
| Visual foundation | gymGO tokens approved in DESIGN.md | Preserve these; accessibility adjustments require documented token changes |
| Product name | “Кабинет тренера” is a working descriptor; gymGO is the visual reference | Keep the working name in research. Decide the public name before final app icon/wordmark production |
| Client identity | “Тренер Данияр” gives a relational anchor | Make the coach recognizable on invitation, home and profile; give the service a quieter secondary identity |
| Distinctive visual motif | Mostly generic rounded financial/productivity UI | Repeated time rails, paired date blocks and clear connections between original/proposed states |
| Personality | Precise, but sometimes overly explanatory or technical | Capable, calm, personal; brief when working, reassuring when something changes |
| Mascot | “Искра” and ember reserved, not included in v1 | Keep out of the operational interface. A mascot needs a product role before investment |

The existing design language is coherent enough to keep. A new palette alone would not solve differentiation. The product's most ownable feature is the coach–client relationship made visible through agreement and continuity.

Name-selection criteria: pronounceable in Russian and Kazakh; short enough for an app label; useful to both roles; not limited to one gym or strength training; searchable and distinctive. Domain, store and trademark clearance are separate work and were not performed. Do not present an invented name as cleared or approved.

An identity hierarchy worth testing is **coach first, service second** on a personal invitation, and **task first, coach context second** in everyday use. A verified real coach photo can provide recognition; initials are the default fallback. Generated people must never stand in for the actual coach or a real client.

## 3. Reference research and what transfers

| Reference | Observed pattern | Application here | Boundary |
| --- | --- | --- | --- |
| [Hevy Coach mobile app](https://hevycoach.com/features/personal-trainer-app/) | Coaches can log individual sets, inspect assigned plans and adjust training variables from a phone | Keep the active client and previous result adjacent to set entry; accommodate changes during a session | Do not import its whole feature set or assume client self-logging is approved here |
| [Hevy client management](https://hevycoach.com/features/client-management/) | Client management and training plans are connected | Let the roster lead naturally into the next session and assigned work | A dense roster needs names and relevant next actions more than large portrait cards |
| [Everfit completed-workout editing](https://help.everfit.io/en/articles/5521349-edit-a-completed-workout) | There are explicit post-completion correction paths, with role/context distinctions | Recording needs a recoverable “view result → edit” route; a checkmark should not make a mistake permanent | Everfit's specific edit window is its business rule, not ours |
| [Airbnb change requests](https://www.airbnb.com/help/article/50) | A change request is separate from the existing reservation; a declined/unanswered request leaves the reservation unchanged | Show current time, proposed time, author and whose answer is needed as separate facts | Do not transfer travel pricing, cancellation or payment rules |
| [Apple's Gentler Streak design case study](https://developer.apple.com/news/?id=3m0ht22s) | Approachable presentation contextualizes progress and accommodates different capabilities | Compare a client with their own recorded history; absence of data is not a failed workout | Its mascot and health interpretation are not automatically appropriate for a trainer workspace |

The useful competitive opportunity is a focused in-person workflow that accommodates overlapping individual appointments and mini-groups. This is a positioning hypothesis grounded in the brief, not a claim that competitors cannot do it.

## 4. Prioritized findings

Severity: 4 = task completion or record integrity failure; 3 = substantial confusion; 2 = recoverable friction; 1 = cosmetic. P0 = resolve before using the scenario to validate the design; P1 = next design iteration; P2 = refinement.

| Priority / severity | Evidence | Why it matters | Recommended change and acceptance check |
| --- | --- | --- | --- |
| P0 / 4 · Saved results disappear | `prototype/js/store.js:273`: finalization resets logging values and announces they are saved. The diagnostic records an empty result object after completion | A successful-looking journey cannot support trust or realistic research if its result cannot be found | Retain a completed record in prototype memory and expose its summary; alternatively label the action as a simulation outside the task. Enter a distinctive value, finish, reopen results and verify that value |
| P0 / 4 · Group completion checks only the active person | `store.js:254`: when active is set, only that participant's gaps are checked. Filling Alia leaves Madi/Dana gaps but returns false | “Finish workout” can skip warning about other participants. Cancelled participation also needs an explicit policy | Define eligible participants and check them all. Test one complete participant, another unfinished, and one cancelled; explain exactly whose records will be saved |
| P0 / 3 · New-session success does not create a record | `store.js:369`: save announces creation but does not append to sessions; diagnostic added-record count = 0 | The calendar cannot demonstrate the outcome of its core action | Add the synthetic record to prototype memory, or visibly label the action as a demonstration. A new appointment must appear on the selected date if the UI says it was created |
| P0 / 3 · Visit charts use bookings | `screens/client.js:224`: visits are derived from all individual session dates, independent of attendance; initial data highlights two days with zero marked attendance entries | Planned training appears to be completed activity | Build history and charts from explicit per-person attendance/results. Booked, attended, missed and cancelled are distinct states |
| P0 / 3 · Past booking automatically labelled attended | `screens/client.js:185`: every matching past individual session receives “Посещение”; group participation is excluded by the clientId-only filter | A cancellation/no-show can become attendance, while a genuine group visit can disappear | Join sessions with per-participant attendance, and show “Не отмечено” when unknown. Diagnostic cancelled fixture reproduced the wrong label |
| P0 / 3 · Cancelled future session remains eligible | `screens/client.js:14`: upcoming does not exclude cancelled sessions/participation. Keeping only s8 and cancelling via Store still displays its time | Client can be shown an appointment that no longer exists as a commitment | Apply cancellation and participation filters to a shared upcoming selector; test an otherwise empty schedule |
| P1 / 3 · Appointment and transfer status are conflated | `screens/client.js:44`: pending transfer replaces the appointment's pill with “Ожидает ответа”; the requested session can take priority over the actual nearest session | Client must infer whether the original booking is valid and whether this is actually next | Keep agreement status beside current appointment. Put “Перенос · ждём тренера” or “Перенос · нужен ваш ответ” in a separate block; label a non-nearest affected booking explicitly |
| P1 / 3 · Inbox crosses out time that still applies | `screens/trainer.js:611–613`, `components.css:605`: the active original time is struck through, and the proposed side omits its date | Visual treatment contradicts “действует”; a move to a different day can look like a same-day time change | Do not strike through an active agreement. Print weekday, date and time on both sides, with explicit current/proposed labels. Test a Friday proposal for a Thursday booking |
| P1 / 3 · Transfer/cancel target is fixed | `app.js:144–152`, `sheets.js:270`: client actions target s8 and fixed original dates | As data changes, the displayed appointment and the action can refer to different records; “Предложить время” without a booking is actually a reschedule | Carry selected session identity through opening, preview and submit. Separate a new-time suggestion from changing an existing appointment |
| P1 / 3 · Claimed local draft is volatile | `store.js:197–207`, `screens/trainer.js:859`: opening starts fresh logging from demo values; the draft exists only in JS memory | “Черновик на устройстве” implies persistence beyond what is implemented | Either persist a session/participant draft and recover it, or say “Не отправлено; не закрывайте страницу” in this prototype. Test leave/reopen and reload separately |
| P1 / 2 · Today starts in the morning at 20:30 | Live Today screenshot: 09:00 at top; source contains the current 20:00 group far below earlier appointments and free windows | “What should I do now?” requires scrolling through already elapsed material | Put current/next work in the first viewport. Offer an explicit “Ранее сегодня · 5 занятий” disclosure or “К текущему” anchor while preserving chronological access |
| P1 / 2 · Small controls and pale text | `.topbar__btn` 40px; `.setrow__repeat` has 12px text/7px vertical padding and no minimum hit height; meaningful placeholders/navigation use tertiary; mint pill fails contrast | Repeated gym-floor entry is harder than the token documentation suggests | Use 44px minimum hit regions, 48px for logging controls; separate painted size from hit size; apply measured contrast fixes |
| P1 / 2 · Research annotations appear as product copy | Client first/program/progress describe unresolved authentication/editing decisions and implementation distinctions | Participants react to the prototype explanation rather than the intended experience | Move implementation notes to the inspector; use short benefit/action copy inside the device |
| P2 / 2 · Recording hierarchy favors ending | Saved recording screenshot: large “Завершить тренировку”; smaller repeated “Записать” actions; cancelled Madi remains in group roster | The most frequent task gets the weaker affordance, and participation state is obscured | Make current entry easy to hit; keep finish available with less visual dominance. Show participant reply/attendance independently of data-entry progress |
| P2 / 2 · Static timer and unqualified progress counts | `screens/trainer.js:868`: timer is literal 38:12; “0/16” and trophies add apparent measurement | The interface can imply live timing and judged performance without data | Mark demo timing in the shell. Say “Записано 0 из 16 подходов”; give historical records units and provenance, never infer achievement from empty values |
| P1 / 2 · Progress chart exaggerates visual change | `screens/trainer.js:1150–1157`: period/count are fixed text, bar height uses a shifted minimum with no visible axis | Small load differences can look much larger; “окт – сен · 4 занятия” need not describe the selected data | Derive date range/count from filtered records. Use a zero baseline for bars or a clearly labelled dot/line scale; include reps and comparable exercise context before suggesting improvement |

These are prototype issues. They do not establish anything about a deployed service. No production implementation was changed in this review.

## 5. Screen-by-screen design direction

### Today and calendar

Preserve the single agenda, shared time alignment and explicit overlap connector. The current refined Today is stronger than the older competing cards because each appointment has a stable place. Keep overlap warnings attached to the affected records. Do not make an overlap look like a combined group.

At 20:30, the 20:00 group should be the first useful object, with elapsed items available above through a compact disclosure. Show the pending-response counter and the next personal appointment. Collapse elapsed free windows; upcoming gaps can remain selectable. A gap is an opportunity to schedule, so it should be quieter than an existing appointment. The initial viewport should answer who, when, what action and what conflict.

On wide screens, use a time grid for time relationships and a details pane for the selected appointment. Keep day selection, form date, collision preview and resulting record synchronized. Test month boundaries and overlapping triples, not just one pair. A new grid is a proposal, not part of this delivered implementation.

### Client home and requests

Reduce repeated coach name and explanatory introduction. Lead with “Следующее занятие”, its actual date/time, coach, program and agreement status. Place a distinct request block beneath the affected appointment, with full date and time on both sides. Use “Действует” and “Предложено”; “Было → станет” incorrectly sounds settled before acceptance.

Amber means this person needs to answer. Waiting for the other party should be neutral. Use a black primary action for accepting a proposal; green communicates confirmation after it succeeds. The no-booking state should explain how the client and coach arrange a first appointment. Do not route it into the fixed existing-session transfer dialog.

Keep “Осталось 7 из 12 занятий” separate from “К оплате 40 000 ₸”. Prefer a neutral remaining-units meter: spending down a prepaid package is not necessarily declining performance. Payment entry remains manual; avoid a “Pay now” affordance until payment collection is in scope.

The Inbox's current crossed-out original time is a particularly important visual contradiction. Strike-through is appropriate after a replacement is confirmed and shown in an audit trail; it should not imply that an unanswered proposal has already cancelled the agreement. The comparison must include the proposed calendar date, not only its hour.

### Workout recording

Keep full active-client identity visible while scrolling the exercise list. Use participant chips with names, independent reply/attendance status and a selected-state border. Avatar circles should support names, never replace them. Permit horizontal overflow with an obvious continuation and a list alternative.

Keep exercise, plan, previous fact and today's fact visually distinct. Set entry gets a 48px hit region and a direct edit path after recording. Avoid opening a new celebratory panel after each set. Selecting a different participant should change the record immediately without crossfading one person's numbers into another person's identity.

Finishing should summarize recorded data per eligible participant and explain omissions. Saving feedback is neutral until a result exists; afterward show a persistent result screen or link. “Saved” should survive navigation within the prototype's stated persistence boundary.

### Roster, program library and profile

Retain search and task-oriented filters. Prefer names, next booking and actionable debt/booking information over portraits on every row. Validate long names and duplicate initials. Test creating a person with only a name before an invitation exists.

Give templates a reachable entry from the trainer's working flow, not only the reviewer rail. Program cards can use small equipment or movement illustrations when they disambiguate choices; decorative body photos add little to “Низ А / Верх Б”. Profile totals should derive from the same records as balances and history, rather than literal demo strings such as 7/31/40 000.

The saved client-card screenshot has two horizontal selector rows (section and exercise) beneath large balance tiles. On the Progress tab, collapse package/debt into a compact summary so the selected exercise and factual history become the focus. Preserve access to payments without making debt the strongest object on every client subview. The chart's visual scale and date labels must be honest before adding animation to it.

### Invitation and first use

Show the recognized coach, what connecting provides, and one action. The client's consent/action must be clear before revealing personal history. Move state-switching chips, technical authentication caveats and prototype security commentary outside the screen under test.

Suggested Russian copy: “Данияр приглашает вас” → “Расписание, программа и результаты ваших тренировок — в одном месте.” → “Подключиться к тренеру”. These are draft strings. A coach photo or initials gives identity; an illustration provides tone, so they have different jobs.

For expired invitations: “Срок ссылки истёк. Попросите Данияра прислать новую.” Only show an automatic request button if that request is actually delivered; a toast is not proof of delivery.

## 6. Visual language and accessibility

Maintain the approved palette and radii. Use Montserrat selectively for page titles and key times, Inter for operational detail, and tabular numerals for times, loads and money. Reduce simultaneous bold elements: screen title, client name, exercise, timer and CTA cannot all lead. Avoid tightly tracked, all-caps small metadata when a sentence-case label is easier to scan.

Measured from CSS values with WCAG relative luminance and alpha compositing over white:

| Pair | Ratio | Small text result |
| --- | ---: | --- |
| Secondary `#5e5f60` / white | 6.399:1 | Pass |
| Tertiary `#9ba1a8` / white | 2.606:1 | Fail |
| Mint ink `#0a8a23` / white | 4.494:1 | Fail; do not round up |
| Mint ink / 10% mint on white | 4.093:1 | Fail |
| Amber ink / 16% amber on white | 4.903:1 | Pass |

These are token-pair calculations, not a full page contrast certification. Nested tinted surfaces can change the actual result. Proposed adjustment: use ink text plus a green icon, or darken the green text token and remeasure every actual background. Do not rely on the token name “ink”. The governing normal-text threshold is 4.5:1. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

Keep the project target of 44×44 CSS px and 48px for recording. WCAG 2.2 AA target size has a 24×24 CSS px baseline with exceptions; 44px is this project's stronger usability target, not a claim about the AA minimum. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Check dialog accessible names, initial focus, focus containment, Escape and return focus. The current sheet has `aria-modal` but no labelled title association, and the key handler lacks a Tab trap. The newer standalone Today study's dialog behavior must not be assumed to exist in the main prototype.

## 7. Motion review

| Before | After | Why |
| --- | --- | --- |
| `app.js:316–329`: rebuild all markup, insert sheet with `is-open`, then add the same class in rAF | Keep the overlay mounted, transition from a genuinely closed state, remove after exit | The CSS transition lacks an established closed-to-open change; repeated renders also destroy continuity |
| `tokens.css:67`: one 340ms sheet duration | Trial 240ms enter / 180ms exit with the existing sheet curve | A proposed faster work rhythm; 340ms is inherited and is not intrinsically an accessibility failure |
| `components.css:482`: meter transitions width for 400ms | Instant update for logging, or transform scaleX from left for occasional progress | Avoid layout animation and repeated delay during set entry |
| `components.css:75`: permanent status-dot pulse, including pending/active invitations | Static status; reserve transient feedback for an actual operation | Waiting for a human response is not a live process requiring perpetual animation |
| `components.css:526`: animated gradient background-position on skeletons | Static skeleton under reduced motion; consider a composited opacity shimmer for loading | Background movement can cause paint work; shape should match the destination |
| `components.css:1395`: near-zero animation duration but infinite iteration remains | Explicitly disable repeating animations with `animation: none`; provide static state | Duration alone is an ambiguous way to stop an infinite effect; avoid unnecessary ongoing work |
| Full-screen rerender during participant/set changes | Preserve focused control and scroll position, update only relevant values | Continuity is part of perceived quality, especially when editing results rapidly |

**Verdict: Block motion sign-off for the main prototype.** The priority is continuity and simplification: stable sheet lifecycle, no perpetual pending pulses, immediate frequent actions, and preserved focus. Performance risks are source-inferred, not measured frame drops. Accessibility coverage remains incomplete. The reduced-motion rules show good intent, but need explicit stable end states.

Proposed choreography (design values to validate, not platform mandates):

| Event | Behavior | Motion-reduced behavior |
| --- | --- | --- |
| Press | 100–160ms subtle scale near .98; text remains crisp | Color/opacity feedback only |
| Switch tab/client or enter numbers | Immediate data/identity change; preserve position | Same |
| Sheet | 240ms enter / 180ms exit, existing `.22,.8,.25,1` curve | Immediate or brief opacity-only change |
| Request resolved | Update count and persistent status; short local opacity transition if helpful | Immediate with announced result |
| Save | Show pending state while actually pending, then durable success | Same semantics, no pulse required |
| Invitation art | Optional user-initiated five-second vignette; static image is complete | Static by default, user can explicitly play |

Longer decorative motion is a different category from a button transition. Automatically starting moving content that lasts more than five seconds alongside other content needs a pause/stop/hide mechanism unless essential; this is not a universal ban on video. The study uses explicit playback and native controls. [W3C pause guidance](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) Interaction-triggered motion should also be disableable where nonessential; that specific success criterion is AAA. [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

The review-animations skill supplied the motion-review structure and simplification order. Its generic timing rules were interpreted against the app's inherited sheet specification, rather than treated as a reason to replace the entire design system.

## 8. Illustrations, photography, icons and generated media

| Surface | Recommended asset | Reason and limits |
| --- | --- | --- |
| Client invitation | Small coach–client editorial vignette; real coach avatar separately | Makes the relationship tangible at a low-frequency moment. Compare against an avatar-only baseline |
| Today / calendar | Existing line icons, initials, semantic markers | Density and temporal comparison are the priority; no video hero |
| Empty roster | Small quiet line illustration or no image | Explain the first useful action; a giant scene competes with it |
| Empty workout history | Neutral factual state | No trophy, punishment, broken streak or falsely cheerful progress |
| Exercise details | Coach-reviewed real demonstration with useful thumbnail and text cues | Generated anatomy/movement is unsuitable as the sole technical authority; no exercise-instruction video was generated here |
| Program library | Optional consistent equipment/movement thumbnails | Add only if they help identify programs faster; text names remain primary |
| Profile | Real opt-in portrait or initials | Recognition and privacy; no invented photographic identity |
| Promotion | Separate photographic/editorial campaign art | A marketing asset should not dictate operational UI density |

Art direction: graphite/charcoal on almost-white, soft grain, natural skin tones, restrained gym context, no status-color decoration. Across a future series vary age, gender, body type, clothing and training modality; one coach/client pair is not an audience model. Avoid consistently casting men as experts and women as novices.

The GPT Image study establishes a coherent palette and human interaction. It is **a concept asset**, not a finished brand system: the figures are more realistically rendered and more athletic than the intended broad everyday audience; the added plant and room shading make it heavier than a small invitation needs. The next art pass should simplify texture and silhouettes, reduce environmental detail and broaden representation. The current visual board deliberately compares it with an avatar-only invitation so artwork must earn its space.

Do not generate logos as raster substitutes for the existing vector icon language. Finish a selected mark as controlled vector geometry after the name and brand architecture are agreed. Keep Russian/Kazakh UI labels as live text, never baked into generated images.

## 9. Validation plan

Use the ux-researcher-designer skill's task-based testing approach. Start with 1–2 internal pilots, then recruit approximately 5 trainers and 5 clients for qualitative rounds, with independent recruitment/consent. This is an issue-discovery sample, not a statistically powered preference or conversion test. Recruitment and messaging were not performed.

| Task | Observable success | Suggested design acceptance target |
| --- | --- | --- |
| At 20:30, identify what is happening and the next appointment | Correct client/group, time and relevant action without scrolling through the morning | Within 5 seconds in an unmoderated first-glance check; validate feasibility in pilot |
| Explain a pending transfer | States that original time still applies and identifies whose response is needed | No wrong-time interpretation; any error triggers redesign |
| Add an overlapping appointment | Sees affected records and knowingly accepts the overlap | Resulting record appears at the chosen date/time |
| Record for Alia, switch to Dana, return | Correct identities and values retained; no data crosses people | Zero identity mistakes in the observed round |
| Correct a recorded set | Finds edit and persists the corrected value | Without facilitator instruction |
| Finish with another participant incomplete | Names whose data is missing and understands partial completion | No silent omission |
| Lose connection during recording | Understands what is saved, where, and how to retry | Retained values match the stated persistence promise |
| Client reads visits and package | Distinguishes scheduled, attended, charged and paid | No conflation during teach-back |
| Join via invitation | Identifies coach, service benefit and next action | Compare avatar-only and illustrated versions with counterbalanced order |

After each task ask “What do you think happened?” before “Was it easy?” Record completion, assistance, wrong assumptions and exact quotes. Test one-handed use on physical phones, 375/390/430 widths, enlarged text, long Cyrillic names, Russian plus draft Kazakh strings, keyboard, VoiceOver/TalkBack, and reduced motion. Use fluent Kazakh review before shipping localized copy.

Do not interpret five-second recognition targets or zero-error criteria as achieved findings. They are proposed acceptance criteria.

## 10. Implementation sequence

1. **Make research scenarios truthful.** Repair record persistence within prototype scope, session creation, per-participant completion checks and attendance selectors. Keep backend work outside this design task.
2. **Resolve core hierarchy.** Current/next agenda, distinct transfer status, correct action targets, repeated set-entry affordance and short product copy.
3. **Complete accessibility and motion.** Measured semantic colors, hit regions, dialog focus/lifecycle, static reduced-motion states.
4. **Validate identity in context.** Coach recognition, working product name/descriptor and avatar-only versus editorial invitation. Select an illustration language from actual in-context comparison.
5. **Produce a small asset family.** Only after the above, commission consistent illustrations and coach-reviewed exercise media; encode chosen UI motion in CSS/native animation, not rendered videos.

The next reviewable milestone should be one believable vertical journey for each role, with the proposed invitation treatment beside it. A broad reskin would leave the most consequential findings unresolved.
