# SOM-39 · Движение журнала тренировки, тостов и шторок

Linear: https://linear.app/something-great/issue/SOM-39
Ветка: agent/15-som-39-motion-workout. Заголовок PR с SOM-39.

## Контекст

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
