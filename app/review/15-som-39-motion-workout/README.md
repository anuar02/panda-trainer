# SOM-39 · Движение журнала, тостов и шторок

04.10.2026. Эталон — `prototype-fresh/index.html` без параметров.
Полный пакет повторного запуска: [r2](../15-som-39-motion-workout-r2/README.md).
Нативное ощущение — **не проверено**. SOM-39 и экраны не приняты владельцем.

## Эталон → реализация

| Эталон | Реализация | Состояние |
| --- | --- | --- |
| fresh.css:74–76, standard (.2,.8,.2,1), spring (.34,1.56,.64,1), sheet (.22,1,.36,1) | Общие `motion.standardEasing`, `springEasing`, `sheetEasing`, `ease`, `easeOut`, `useMotionDisabled`; общий вход и навигация не изменены | Подключено |
| fresh.css:345–367, toastIn 600 ms spring, opacity0→1/y30→0/scale.85→1 | `ui/toast.tsx`, новый revision на каждый show, включая повтор того же текста; отмена предыдущего входа, замена текста/announce сразу | Подключено |
| faceHop 700 ms, delay150 ms spring; 0% y12/−12°/.6, 60% y−6/6°/1.08, 100% 0/0/1 | Внешний слот лица: UI sequence420+280 ms после150 ms, `<Mascot pose="front">` без изменений mascot*. Calm скрывает лицо | Подключено, visual approval открыто |
| components.css:317–337; scrim280 ms ease, sheet420 ms sheet; app.js:440–448 исключает setlog; sheets.js рендерит содержимое | `Sheet` использует общий calm/reduce, scrim с UI timing280 и цветом spec-dark/light; Gorhom420, pan-down/back/backdrop/blur; `immediate` у двух редакторов подхода | Подключено; нативный жест не проверен |
| instrument.css:153,156 recorded200 ms opacity.4→1 | `WorkoutEffect recorded`, только увеличение записанного count/переход пустого слота в записанный; identity session/participant/exercise, без повторов на edit/draft/hydration/undo. Общая default standard-кривая по ADR0063 | Подключено; временное правило ADR0063 требует одобрения |
| instrument.css:154,157 rest-finished400 ms, opacity1→.4→1 | UI sequence200+200 ms на иконке отдыха только false→true done; уже завершённый отдых сразу opacity1 | Подключено в demo; перенос functional-эффекта требует одобрения |
| fresh.css:1015–1016, exNew1200 ms standard, spread0→14/alpha.5→0 | Новое ID в уже загруженном scope → один shadow pulse на focused карточке; хранится исходная тень карточки, revisits не повторяют. flex.js:41–55 add/replace; modern Workout.setFocus возвращается до старой DOM fallback ветки | Подключено для add/replace в обоих журналах; не объявлено точным совпадением DOM fallback |
| fresh.css:868, log-notes li riseIn400 ms standard | Общий `MotionView duration=400`; стабильный ключ по участнику/времени/тексту/duplicate ordinal сохраняет соседние заметки при удалении; вход при mount как в CSS | Подключено |
| fresh.css:1425–1426, step150 ms spring scale.88 | `WorkoutStep` в demo и workout-entry: отмена с текущего значения, press/release150 ms; callback ввода не ждёт движение | Подключено |
| fresh.css:1404, wrest width500 ms linear | `WorkoutRestFill`: UI timing текущей ширины; данные времени и done переключаются сразу | Подключено в существующем demo rest |
| fresh.css:1438, wrow background200 ms CSS ease, без transform | `WorkoutRow`: отдельный слой accent-soft с UI opacity200; выбор focus сразу; generic scale/rise не добавлен | Подключено |
| fresh.css:1513–1515, dockPulse2000 ms ease-in-out, 50% spread5/pop22% | UI shadow sequence1000+1000 ms/withRepeat только rest && !done; done/отмена/calm/reduce/unmount прекращают loop | Подключено в workout-demo dock; production dock не имеет состояния отдыха |
| fresh.css:1195–1197,1255–1261: holdIn350 standard, holdOut250 ease, y12; bubble450 delay80 spring, .6/y10→1/0 | `WorkoutHoldMotion`, `WorkoutEffect bubble`; обратимый вход/выход, удаление по finished callback; calm/reduce скрывают закрытый слой сразу. Нет animation timers | Адаптеры, в экран не подключены: в базе нет разрешённого demo/hold |
| fresh.css:849–933,1181: micRing1800 ease-out, второй delay900; hold-mic1400; micHint2800 ease-out, 0–60% hold; bar900 ease-in-out с delay0/150/300/450/600 | `WorkoutEffect mic/hold-mic/mic-hint/bar`, delay принимает слот потребителя; loop отменяемый, scale/opacity/shadow на UI | Адаптеры, runtime не проверено; голосовая кнопка сохранена disabled |
| fresh.css:966–968, vitemIn450 spring, y10/.96→0/1 | `WorkoutEffect voice-item` | Адаптер, runtime не проверено |
| Reduce Motion / «Спокойный интерфейс» | Все компоненты используют общую policy брифа14; cancelAnimation, конечные opacity/width/scale сразу; sheet override Always; модель данных и callbacks не ждут эффектов | Synthetic-проверки; устройства/owner approval открыты |

## Границы паритета

Default CSS не определяет recorded/rest-finished; функциональная запись уже
разрешена как временный перенос ADR0063. Не менялся instrument/default эталон.
Новая библиотека, навигация, общий механизм входа, mascot*, writers/RPC/auth и
реальное распознавание не менялись. Голосовые adapters не являются работающим
голосовым сценарием и не закрывают SOM-54. Нативная проверка spread-shadow,
плавности жеста, FPS, крупного текста и одобрение владельца открыты.

## Проверка

Окончательный `cd app && npm run check`: 249 suites / 3185 tests PASS,
typecheck/lint/format PASS. `npx expo export --platform all`: iOS/Android/web PASS.
Полный список команд, RED/GREEN, оставшиеся общие console warnings и пределы
проверки — [в r2](../15-som-39-motion-workout-r2/README.md).
