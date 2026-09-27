# Сегодня — visual concept (design exploration)

**Status:** visual target only. The live prototype was not modified.

## Deliverable

- `concept-today.png` — refined target, 1584 × 2816 (9:16 at 2k).
- `concept-today-v1-initial.png` — first concept, kept for comparison.
- `references/` — inputs and comparison sheet.
  - `refA-gymgo-training.png` — gymGO «Тренировки» (visual authority: type, cards, black CTA, tab bar).
  - `refB-gymgo-membership.png` — gymGO «Абонемент» (component language: rows, KV, big number).
  - `refC-proto-today.png` — current prototype Today (product context only).
  - `concept-vs-authorities.png` — concept next to its two gymGO authorities.
- `prompt.md` — the visual brief sent to the model.

## How it was made

- Model: `xai/grok-imagine-image-2.0` (the highest-quality image model on this key that accepts reference images; GPT Image 2 / Nano Banana were not exposed).
- Submitted over the Higgsfield REST API with the API key from `.env.local` (server-side only; the CLI needs interactive OAuth).
- References passed via `image_urls` (3 inputs), `resolution 2k`, `aspect_ratio 9:16`, `quality medium`.
- Request IDs: initial `35fad12e-e63a-48b4-aff5-42a0c9c79e52`, refinement `6da5d91e-c360-47ea-914a-ed9f7056ecf3`.
- Exactly two generations: one initial concept, one targeted refinement (overlap rows + tab-bar badge). Nothing else was regenerated.

## Hierarchy

1. Compact header — «Сегодня» + «Чт, 17 сентября · 7 занятий», single bell with badge `1`. No repeated date, no welcome copy.
2. Amber request row — «Айгерим просит перенос / Нужен ваш ответ». Secondary to the session, but first thing that needs action.
3. Featured next session — the focal point: «Следующая тренировка / Через 25 мин», `18:00–19:00`, «Айгерим», «Низ А · Индивидуально», green «Подтверждено», one black CTA «Открыть тренировку».
4. «Далее сегодня» agenda — compact aligned rows on the canvas: overlap enclosure «Пересечение · 30 мин» with two separate rows (Айгерим / Арман), the quiet gap «Свободно 19:30–20:00 · 30 мин», then the distinct group row «Мини-группа».
5. Bottom navigation — gymGO tab bar, active «Сегодня», raised black plus «Занятие».

## Corrections needed during implementation

Text and content are accurate, but the image is a target, not pixel-perfect production art:

- Overlap rows: the secondary line («Айгерим · Низ А») is indented rather than flush-left under the time. Set both rows to a shared two-line grid (time, then name · program).
- Overlap vs group: enclosure and group card look similar. Keep the thin border + «Пересечение · 30 мин» label and add the per-participant confirmed/waiting/cancelled indicators the prototype already has.
- Rebuild all type in Montserrat/Inter at the token sizes; do not trace the rendered letterforms.
- Re-apply token colors, radii (14 / 22 / 26 / pill) and the subtle card shadow from `prototype/css/tokens.css`.
- Safe-area padding under the tab bar; keep the group row above it.
- The model rendered no participant dots for the group — the brief allowed this as optional.

## Honest limitations

- Generated image, not a coded interface. Do not treat it as implementation-ready.
- Only four image models on this key accept references; the best UI/typography model available is weaker than GPT Image 2, so fine text fidelity came out well here but is not guaranteed.
- The refinement fixed the tab-bar badge (`2` → none, header keeps `1`) and made the overlap rows consistent; minor spacing is still hand-tunable.
