# SOM-38 · Живая панда: движение поз как в prototype-fresh

Linear: https://linear.app/something-great/issue/SOM-38
Ветка: agent/13-som-38-mascot-motion. Заголовок PR с SOM-38.

## Контекст

04.10.2026 владелец поставил Release-сборку на iPhone 14 Pro и не увидел ни одной
анимации маскота. Сейчас `app/src/ui/mascot.tsx` показывает статичный PNG; Rive
(ADR 0060) за выключенным флагом `EXPO_PUBLIC_MASCOT_RIVE` и покрывает только
front/wave. В эталоне панда двигается без Rive: CSS-анимации поверх тех же PNG.
Задача — перенести это движение в приложение через Reanimated (уже в зависимостях,
см. `app/src/ui/motion.tsx`). Rive-путь и флаг не удалять и не менять.

## Эталон (значения брать дословно, не подбирать на глаз)

- Поза → режим движения: `prototype-fresh/js/mascot.js:3-14` (front idle, wave wave,
  thumbs nod, jump hop, sit breathe, clipboard idle, stretch sway, sleep sleep,
  side idle, three-quarter idle). Лица (`face-*`) режима не имеют.
- Разметка: `.panda` = glow + shadow + body(img) + для sleep три «z»
  (`js/mascot.js:28-41`). Стили `.panda*`: `prototype-fresh/css/fresh.css:560-630`.
- Режимы и тайминги: fresh.css:604-612 (pandaIdle 3.4s, shadowIdle 3.4s,
  pandaBreathe 3s, pandaWave 2.4s, pandaNod 2.6s standard, pandaHop 1.3s
  cubic-bezier(.3,0,.5,1) + shadowHop, pandaSway 3.2s, pandaSleep 4s), zFloat
  fresh.css:623, glowPulse fresh.css:562, вход `.is-entering .panda` pandaIn
  .8s задержка .12s spring (fresh.css:630), тап `.is-poked` poke .7s spring
  (fresh.css:628). Кейфреймы: fresh.css:632-690.
- Easing-токены: fresh.css:74-76. `--ease-spring` = cubic-bezier(.34,1.56,.64,1)
  (перелёт — не заменять на withSpring, нужен тот же bezier). `ease-in-out` =
  cubic-bezier(.42,0,.58,1), `ease-in` = (.42,0,1,1), `ease-out` = (0,0,.58,1).
- Празднование: `.fx-panda` fxPanda, fxFade, confetti, spark (fresh.css:750-806);
  сейчас `app/src/ui/mascot/celebration.tsx` показывает PNG jump без движения.

## Критерии

- [ ] `Mascot` получает движение позы по таблице эталона: каждый режим — точный
  перенос кейфреймов (те же проценты, transform-origin, длительности, easing,
  бесконечный цикл). Тень и glow — отдельные слои, как в эталоне. Sleep — с «z».
- [ ] Вход панды (pandaIn) при появлении экрана и poke по тапу там, где эталон
  делает панду интерактивной; без влияния на доступность (accessible={false} остаётся).
- [ ] Празднование после тренировки: fxPanda + confetti + spark по эталону,
  длительность 2200 мс сохраняется (ADR 0060).
- [ ] «Уменьшение движения» и «Спокойный интерфейс»: движение полностью выключено
  (статичный PNG), как `data-motion="none"` в эталоне. Сверить правило эталона
  `js/mascot.js:22-23`: в спокойном режиме панда скрыта везде, КРОМЕ контекстов
  `empty` и `onboarding`. Если приложение расходится — привести к эталону; если
  контекст в приложении не выражен, записать вопрос в OPEN-QUESTIONS и не ломать
  текущее поведение.
- [ ] Анимации на UI-потоке (Reanimated shared values/useAnimatedStyle), без
  setState на кадр; бесконечные циклы останавливаются при размонтировании.
  Много панд на одном экране не роняет кадры — проверить списки/пустые состояния.
- [ ] Web продолжает работать (Reanimated web) или безопасно показывает статичный PNG.
- [ ] Тесты: режимы поз по таблице, отключение при reduce motion и calm mode,
  отсутствие движения у лиц. ADR о переносе CSS-движения на Reanimated
  (связать с 0005 и 0060). Отчёт в `app/review/13-som-38-mascot-motion/README.md`:
  какие кейфреймы перенесены с какими значениями; нативная проверка «не проверено».

## Границы

Только `app/src/ui/mascot.tsx`, `app/src/ui/mascot/**`, новые файлы рядом с ними,
тесты к ним, docs/CHANGELOG/ADR. В `app/src/ui/motion.tsx` разрешено только
ДОБАВИТЬ в объект `motion` поле `springEasing: Easing.bezier(0.34, 1.56, 0.64, 1)`,
если его ещё нет (параллельно SOM-39 может добавить то же самое — при конфликте
оставить одно поле). Экраны, вызывающие `<Mascot>`, не переписывать; добавлять
только проп, если без него не выразить контекст. Навигацию, тосты, шторки,
журнал тренировки не трогать — это бриф 14/15 SOM-39.
