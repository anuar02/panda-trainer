# SOM-31 · Журнал следует теме приложения · бриф 19

Дата: 05.10.2026. База: `5901402`, после брифа 18 / PR #83.
Ветка: `agent/19-som-31-workout-follow-theme`.
Draft PR: https://github.com/anuar02/panda-trainer/pull/84.
Решение владельца: [ADR 0109](../../../docs/app/decisions/0109-workout-follows-app-theme.md).

## Реализация

`measurements.ts` строит стили от текущих `useTheme().colors`, в том числе
layout для крупного текста/узкого экрана. Цвета и размеры исходной тёмной темы
полностью сохранены в отдельной фикстуре и сравнены глубоким equality-тестом.
Журнал, production-ввод, заметки, меню упражнений, поля подходов, dock, отдых и
анимированная заливка выбранной строки используют тему. В feature-коде остались
только три белых цвета текста/иконок на акценте. Motion-цвета используют theme-роли;
длительности, easing, события и общий `app/src/ui/motion.tsx` не менялись.

Светлые цвета поверхностей/текста используют существующие `colors.light`.
Дополнительные soft/divider/note/shadow роли соответствуют переменным
`prototype-fresh/review/parity/spec-light.json`; акцентная рамка сохраняет alpha 0.24.
Градиент disabled-голоса, белый бейдж и halo сохранены как отдельные theme-роли.
Светлый placeholder использует secondary для AA; активный номер упражнения — белый
на акценте. В тёмной теме прежние placeholder/номер не изменены.

Для выполнения задачи необходимы два минимальных изменения за feature-границами:
`ui/theme.tsx` убирает forced-dark для workout, оставляя совместимость prop;
`workout-demo/rest-panel.tsx` заменяет цвета используемой журналом панели отдыха.
Навигация, создание занятия и SQL не менялись. Глобальный статус-бар в
`app/app/_layout.tsx:46` уже вычисляется из scheme этого же ThemeProvider;
устранение forced-dark позволяет ему следовать выбору профиля.

## Проверки

- `graft map` — команда отсутствует; `graft/INDEX.md` тоже отсутствует. Граф не
  обновлялся, контекст прочитан напрямую. Live Linear project и SOM-31 прочитаны;
  записи/комментарии Linear не изменялись.
- `cd app && npx jest tests/theme.test.tsx tests/workout-theme.test.ts --runInBand`
  до реализации — ожидаемый RED: 2 failed, 6 passed (forced-dark и fixed styles).
  После реализации — 2 suites, 8 passed.
- `cd app && npx jest tests/workout-theme-components.test.tsx tests/workout-theme.test.ts tests/contrast.test.ts tests/workout-screen.test.tsx tests/theme.test.tsx --runInBand`
  — 5 suites, 122 passed. Проверены все исходные dark styles, light/dark layout,
  контраст реальных сочетаний на обычных и составных полупрозрачных фонах,
  светлый placeholder/номер/voice text, реальная панель отдыха и смена темы
  без потери введённого веса.
- `cd app && npm run check` — PASS: typecheck, lint (0 warnings), format:check;
  253 suites, 3274 tests passed, exit 0.
  Промежуточные прогоны выявили strict-ошибки тестовых tuples/destructuring,
  duplicate import и неверный обход дерева тестового renderer; исправлены.
- `git diff --check` — без ошибок.
- `rg -n '#[a-fA-F0-9]|rgba' app/src/features/workout app/src/features/workout-entry`
  — только белые цвета на акценте и динамические rgba из theme RGB-ролей.

## Критерии и приёмка

- Сделано: цвета журнала, production-ввода, отдыха, dock и шторок берутся из темы.
- Сделано: все значения исходных тёмных стилей равны фикстуре базового коммита.
  Это проверка значений, не доказательство нативного pixel parity.
- Сделано: светлые текстовые роли проходят AA ≥ 4.5:1; selected/done сохраняют
  разные рамку/заливку, check и подпись. Disabled-элементы с opacity исключены из AA.
- Сделано по коду: status bar получает scheme приложения; на устройстве не проверено.
- Сделано: ADR, UI-PARITY, PROJECT-MEMORY, OPEN-QUESTIONS, CHANGELOG, ROADMAP.
- Не проверено: iOS/Android, системное отображение status bar, VoiceOver/TalkBack,
  визуальные пары prototype/application и нативная пиксельная сверка.
- Требует одобрения владельца: оба оформления и все состояния экрана.

Существующая белая цифра на dark accent сохранена по требованию неизменности;
её прежний контраст не объявляется исправленным. Изображения не добавлялись в git.
Экран и SOM-31 целиком не объявляются принятыми.
