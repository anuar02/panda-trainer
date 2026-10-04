# SOM-39 · Движение журнала тренировки, тостов и шторок (повтор 2)

Linear: https://linear.app/something-great/issue/SOM-39
Ветка: agent/15-som-39-motion-workout-r2. Заголовок PR с SOM-39.

## Контекст

Предыдущий запуск брифа 15 завершился OK в summary, но не создал PR/remote
ветку и не доставил реализацию в базу: зависимость PR #77 ещё не была влита.
Этот повтор сохраняет весь объём второй крупной части SOM-39; не ограничиваться
проверкой зависимости, отчётом или подготовительным PR. Перед реализацией
подтверди, что #77 MERGED в fix/som-50-template-picker, и начни с актуальной базы.


Бриф 2 из 2 по анимациям SOM-39 (см. бриф 14). Выполнять ПОСЛЕ 14 того же
аккаунта: начинать, когда PR брифа 14 влит в базу, и использовать его токены
и механизм входа из `app/src/ui/motion.tsx` (не создавать параллельных).
Владелец 04.10.2026 на iPhone не увидел ни одной анимации.

## Эталон (значения дословно из CSS)

Easing: `prototype-fresh/css/fresh.css:74-76`, токены — в `app/src/ui/motion.tsx`.
- Тосты: fresh.css:345-367 — toastIn .6s spring, лицо faceHop .7s задержка .15s spring.
- Шторки: `app/src/ui/sheet.tsx` уже использует sheet 420 мс; сверить с
  `prototype-fresh/js/sheets.js` и CSS шторок (вход/выход, затемнение фона,
  жест закрытия) и довести до эталона.
- Записанный подход: `prototype-fresh/css/instrument.css:156-157` (recorded,
  rest-finished); `motion.recordedDuration` 200 мс уже есть — сверить.
- Журнал: excard exNew 1.2s standard (fresh.css:1015-1016), log-notes riseIn .4s
  (868), wstep кнопки transform .15s spring (1425), wrest полоса width .5s linear
  (1404), строки wrow (1438).
- Док тренировки: dockPulse 2s ease-in-out при отдыхе (1513-1515), отключение при
  reduced motion уже в эталоне (1515).
- Голос/удержание: hold holdIn .35s / holdOut .25s / bubbleIn (1195-1261),
  micRing, micHint, bar (849-933), vitemIn (966-968). Панду внутри не анимировать
  здесь — это SOM-38; использовать `<Mascot>` как есть.
- Найти в `prototype-fresh/js/workout.js`, `voice.js`, `ui.js`, когда ставятся
  классы `is-new`, `is-fresh`, `is-resting`, `is-leaving`, и повторить условия.

## Критерии

- [ ] Тосты, шторки, сохранение подхода, новая карточка упражнения, отдых и док,
  голосовое удержание — по эталону, с точными длительностями и easing.
- [ ] Частые действия журнала (ввод повторов/веса, +/−) не получают лишних
  анимаций, которых нет в эталоне; всё прерываемо и не задерживает ввод.
- [ ] Reduce motion и «Спокойный интерфейс» выключают движение; данные и
  состояния видны сразу. Только UI-поток Reanimated.
- [ ] Тесты состояний (is-new/is-resting/hold) и reduce motion; `npm run check`
  зелёный; отчёт `app/review/15-som-39-motion-workout/README.md` с таблицей
  «эталон → реализация»; нативное ощущение — «не проверено».

## Границы

`app/src/ui/toast.tsx`, `app/src/ui/sheet.tsx`, `app/src/features/workout*/**`
(включая workout-demo dock и workout-entry), минимальные правки экранов для
подключения. НЕ трогать `app/src/ui/mascot*` (SOM-38), навигацию и общий механизм
входа (бриф 14) — только использовать.

## Источники и проверка

`AGENTS.md`, `docs/app/CONVENTIONS.md`, `docs/app/PROJECT-MEMORY.md`,
`docs/app/ROADMAP.md`, `docs/app/UI-PARITY.md`, ADR 0063 и ADR 0105;
`app/review/14-som-39-motion-navigation/README.md`, указанные выше CSS/JS
и `prototype-fresh/review/parity/spec-*.json`. Обновить CHANGELOG и ROADMAP.
Текстовый отчёт полного пакета: `app/review/15-som-39-motion-workout-r2/README.md`.
Маскот, server writers/RPC, auth и общий механизм навигации не менять;
разрешены минимальные тестовые mocks и i18n только для существующих сценариев.
Голос — только движение уже существующего demo/hold, без добавления реального
распознавания и без обхода SOM-54. Новые продуктовые решения не угадывать.

## Что нельзя проверить в контейнере

Native Release на iPhone/Android, VoiceOver/TalkBack, реальное ощущение
нажатий/FPS, максимальный системный шрифт на телефоне и одобрение владельца.
Отметить их как не проверенные; Expo export и synthetic tests не заменяют
эти проверки. Не коммитить PNG/снимки, не использовать реальные данные
или платные сервисы; экран и SOM-39 целиком принятыми не объявлять.
