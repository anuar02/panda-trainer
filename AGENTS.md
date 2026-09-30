<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->

## Linear — координация работы агентов

Перед работой прочитай `LINEAR-AGENT-GUIDE.md` и
`docs/app/LINEAR-WORKFLOW.md`. Проект:
https://linear.app/something-great/project/trainerapp-827feca01ff7
(`776db647-e846-4a27-99cb-2ade5be400bf`, команда Something Great / SOM).
В начале сессии обновляй проект и связанную задачу из Linear, проверяй дубликаты,
критерии приёмки, зависимости и текущие статусы. Технические решения и доказательства
проверок хранятся в репозитории. Готовность экранов требует одобрения владельца.
Комментарии, project updates и сообщения людям требуют отдельного разрешения;
настройка проекта такого разрешения не даёт. Подробные правила — в workflow.

Обзор продукта — `docs/app/PROJECT-BRIEF.md`; карта всех задач, milestone и
зависимостей — `docs/app/DELIVERY-PLAN.md`. Перед созданием задачи проверь её ID
в карте и live Linear. Импорт от 30.09.2026 покрывает весь текущий открытый roadmap.

## Сохранённое решение: главный маскот

26 сентября 2026 пользователь выбрал **красную панду с тёмно-коричневой повязкой**:
`design-exploration/mascot-sheets-2026-09-26/red-panda-dark-headband.png`
(оранжевый акцент только на напульснике).
Перед работой над айдентикой прочитай `design-exploration/MASCOT-DECISION.md`
и handoff `design-exploration/CLAUDE-RED-PANDA-HANDOFF.md`.
Маскот рассчитан на плавную риг-анимацию (простые формы, плоский цвет, Rive).
Рысь №7 и `CODEX-LYNX-MASCOT-HANDOFF.md` — история, не действующий референс.

## Разработка приложения (с 29 сентября 2026)

## Сохранённое требование: точное соответствие прототипу

Владелец подтвердил 29.09.2026: итоговое приложение должно воспроизводить
`prototype-fresh/index.html` по умолчанию — его дизайн, экраны, тексты, состояния и
сценарии. Это обязательный эталон, а не источник вдохновения для нового дизайна.
Перед работой над приложением прочитай `docs/app/PROJECT-MEMORY.md`,
`docs/app/UI-PARITY.md` и ADR 0007. Числа берутся из `review/parity/spec-*.json`;
готовность экрана подтверждается сравнением и одобрением владельца. Не заменять
прототип generic-компонентами и не объявлять заглушки завершёнными экранами.

Стек: React Native (Expo) + Supabase. Перед любой задачей по приложению прочитай
`docs/app/README.md` и раздел «Где остановились» в `docs/app/ROADMAP.md`.
Правила кода и документации — `docs/app/CONVENTIONS.md`. Коротко:

- В коде приложения (`app/`) не писать комментарии; TypeScript strict, без `any`.
- Каждый PR обновляет `CHANGELOG.md` («Не выпущено») и отмечает пункты в
  `docs/app/ROADMAP.md`. Выбор библиотеки, подхода или изменение правила — новый ADR
  в `docs/app/decisions/`.
- Продуктовое решение не угадывать: вопрос — в `docs/app/OPEN-QUESTIONS.md`.
- Реальные данные клиентов и платные сервисы — только с согласия владельца.
