# SOM-39 · Бриф 15, повтор 2

04.10.2026. Ветка `agent/15-som-39-motion-workout-r2`, база
`fix/som-50-template-picker`, commit `65e5a5ab7f814fdd77103a14205c801ea2ae78b6`.
Это реализация второго пакета, а не проверка зависимости. Экран и SOM-39 целиком
не приняты. Нативное ощущение — **не проверено**.

## Начальные условия

- `gh pr view 77 --json state,baseRefName,mergeCommit`: MERGED,
  base `fix/som-50-template-picker`, merge commit указан выше.
- `git fetch origin fix/som-50-template-picker` и
  `git merge --ff-only origin/fix/som-50-template-picker`: Already up to date.
- Linear SOM-39 и проект прочитаны live: In Progress, blockedBy пуст,
  duplicateOf null, блокирует SOM-42. Новых задач, изменений, комментариев,
  project updates и сообщений людям не создавалось.
- `graft map`: command not found. `graft/INDEX.md` отсутствует;
  `graft ask`/`graft build` недоступны. Источники прочитаны напрямую.
- Прочитаны AGENTS, startup/workflow, CONVENTIONS, PROJECT-MEMORY, UI-PARITY,
  ROADMAP, ADR0007/0063/0105 и отчёт14; числа и scrim сверены со
  `prototype-fresh/review/parity/spec-dark.json` и `spec-light.json`.

## Реализация и критерии

[Таблица «эталон → реализация»](../15-som-39-motion-workout/README.md).

| Критерий брифа | Результат |
| --- | --- |
| Тосты, шторки, новый подход, упражнение, отдых/док по CSS длительностям | Сделано для существующих экранов; functional recorded/rest-finished и exNew требуют visual approval |
| Голосовое удержание и остальные voice timings | Реализованы и synthetic-проверены motion adapters; runtime-подключение не сделано: в разрешённой базе нет существующего demo/hold, кнопка Голос disabled. SOM-54 не обойдён |
| Частый ввод/+− без лишнего входа/задержки | Сделано; нет animation await и новых таймеров для журнала; редактор подхода immediate; исправлены повтор записи при выборе упражнения и повтор входа соседней заметки |
| Calm/reduce отменяют UI-движение, данные сразу | Сделано; реальные providers/live events проверены synthetic; native не проверено |
| Только UI-поток Reanimated | Timings/shared styles/repeat на UI; единственный RN callback hold удаляет законченный слой, без расчёта кадров в JS. Toast expiration остаётся существующим таймером состояния |
| Тесты состояний/reduce, полный check, текстовые отчёты | См. свежие результаты ниже |
| Native ощущение, крупный системный шрифт, VoiceOver/TalkBack, приёмка | Не проверено / требует одобрения владельца |

## Проверки

- RED: `cd app && npx jest tests/toast.test.tsx --runInBand`:
  новый тест repeated/same-text toast не получал timing600; 1 fail/1 pass.
- RED: `cd app && npx jest tests/sheet.test.tsx --runInBand`:
  immediate editor имел System вместо Always; 1 fail/13 pass.
- RED: `cd app && npx jest tests/workout-screen.test.tsx --runInBand`:
  две review-регрессии — выбор существующего записанного подхода запускал timing200,
  удаление первой заметки запускало timing400 у второй; 2 fail/10 pass.
- GREEN review: `cd app && npx jest tests/workout-screen.test.tsx tests/workout-motion.test.tsx tests/workout-motion-policy.test.tsx --runInBand`:
  3 suites / 27 tests PASS. Проверены hydration/edit/undo, scopes/new highlight,
  steps/reversal, rest fill/done, hold leave/reentry, все voice effect kinds при
  reduce, live calm/system cancellation и сохранение данных.
- Первый полный `npm run check`: 248 suites / 3170 tests PASS, type/lint/format PASS.
  Дополнительные tests после этого результата проверены отдельно; окончательный
  полный прогон записан ниже.
- `cd app && npx expo export --platform all`: iOS/Android/web export PASS.
  Это сборка, не запуск Native Release и не измерение плавности.
- `git diff --check`: PASS.
- Независимое read-only review после исправлений: блокирующих findings нет;
  reviewer также выполнил 3 suites / 27 tests PASS. Notes mount riseIn сохранён
  по fresh.css:868; стабильные ключи предотвращают случайный повтор при удалении.

## Что не проверено и что остаётся открытым

Native Release на iPhone/Android, VoiceOver/TalkBack, реальные нажатия/FPS,
максимальный системный шрифт на телефоне, пары всех тем/состояний и одобрение
владельца — **не проверено**. Browser runtime/RAF motion не проверены в этом
пакете; Expo export и synthetic renderer не заменяют эти проверки.

Base не содержит существующего голосового demo/hold. Поэтому эффекты готовы
как presentation adapters, но пользовательский голосовой сценарий не включён.
Ограничение записано в OPEN-QUESTIONS; разрешённые границы не расширялись.
Production preload dock не имеет rest clock: pulse относится к существующему
workout-demo, добавлять production состояние отдыха этой задачей не разрешено.

Реальные данные, платные сервисы и новые PNG/снимки не использовались.
SQL/pgTAP не запускались: SQL не менялся, Docker отсутствует; CI проверяет базу.
Навигация, общий механизм входа, mascot*, auth, RPC/writers не менялись.

## Окончательная проверка перед коммитом

- `cd app && npm run check`: exit 0; typecheck/lint/format PASS,
  **249 suites / 3185 tests PASS**, 33.381 s.
- В полном Jest-логе есть 139 console warnings о duplicate React child keys
  (`.0`, `.1` и т. п.) в существующих library/template тестах общего MotionGroup.
  Эти экранные модули и общий механизм motion брифа14 не изменены;
  trainer-library тест подменяет Sheet, поэтому custom scrim им не исполняется.
  Это не failed tests и не «чистая console»; предупреждения остаются вне
  разрешённых границ брифа15. Целевые workout/toast/sheet проверки не дают этих warnings.
- `cd app && npx expo export --platform all` повторён после окончательных
  изменений: exit 0, iOS/Android/web PASS, `Exported: dist`.
- `git fetch origin fix/som-50-template-picker`: база остаётся `65e5a5a`.
- `git diff --check`: PASS. Graph refresh недоступен, Graft отсутствует.
- Новых библиотек или изменения общего подхода не было: продолжен Reanimated
  timing/policy из ADR0063/0105; новых ADR/migrations нет.
