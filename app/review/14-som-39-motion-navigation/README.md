# SOM-39 · Движение навигации и отклик интерфейса

04.10.2026. Бриф 14; эталон — `prototype-fresh/index.html` без параметров.
Реализация требует визуального одобрения владельца; SOM-39 целиком не закрыт.
Linear прочитан: In Review, blockedBy пуст, блокирует SOM-42. Записей и сообщений
в Linear не создавалось. Graft отсутствует: `graft map` → command not found,
каталога `graft/` нет. Работа велась на заданной ветке.

## Эталон CSS → реализация

| Пункт | Эталон | Реализация |
| --- | --- | --- |
| Easing | fresh.css:74–76: (.2,.8,.2,1), (.34,1.56,.64,1), (.22,1,.36,1); CSS ease (.25,.1,.25,1) | `motion.standardEasing`, `springEasing`, `sheetEasing`, `ease`; новых зависимостей нет |
| Индикатор tabbar | fresh.css:315–340: scale .6→1, .45s spring; opacity .2s ease | `TabMotion indicator`, постоянно смонтирован в каждой ячейке, прерывание с текущего значения |
| Иконки | color .2s; transform .4s spring | Два слоя исходной SVG-иконки с UI crossfade .2s; возврат scale/lift .4s spring |
| tabPop | fresh.css:733,741: .6s spring; 0% scale .6, 60% scale 1.18/y −2, 100% 1/0 | `TabMotion`: UI withSequence 360+240 ms для scale/lift; выбор вкладки и parent focus revision при stack-return |
| riseIn | fresh.css:696–710,736: .6s standard, y14→0/opacity0→1, .04/.1/.16/.22/.28/.34/.4 | `MotionScrollView`, `MotionHeader`, `Screen`; fragment blocks получают общий stagger; горизонтальная прокрутка сохраняет детей |
| Условия входа | app.js:409–430: key role/screen/scenario/wide; обычные rerender не входят; возврат экрана входит | Navigation focus/blur/revision, motionKey демо-сценария; role меняет route/theme; приложение не содержит wide-режима прототипа. Обновления данных не меняют revision |
| Строки карточки | fresh.css:726–731: .5s, 0/.06/.12/.18/.24 | `Card rows` / `MotionGroup`; подключено к спискам строк, не к hero/metric/package/empty Cards |
| Agenda | fresh.css:720–725: .55s, .22/.27/.32/.37/.42/.47 | `AgendaMotion` в «Сегодня»; общий механизм разворачивает fragments |
| Приглашение | fresh.css:700–717: .6s; дети invite-card 0/.18/.24/.30/.36/.42 | `Card entrance="invite"` для trainer/client invite; тип invite в `MotionGroup` |
| Полосы прогресса | fresh.css:732,740: growX 1.1s, delay .35s, origin left | `GrowX`: Today, client home, client profile; ширины и числа не изменены |
| Button | fresh.css:238–262: scale .96, active .08s, release .35s spring | Общий `MotionPressable motionKind="button"` в Button; disabled/loading не сжимаются |
| Chip | fresh.css:277–278: scale .94, .3s spring | Общий Chip и существующие chip/filter Pressable подключены к chip policy |
| Card-строки / tap | fresh.css:282–284: scale .985, .3s spring | Общий MotionPressable в экранах; Card сам не становится кнопкой |
| Дополнительный active | fresh.css:380–386 today-inbox .92/.35s; 450–459 buddy request .94/.35s | motionKind inbox/request в Today; журнальные voice/excard/menu правила — бриф 15 |
| StatusPill ping | fresh.css:271–275: 1.8s ease-out, spread0→9, alpha .55→0 к80% | PulseDot/UI withRepeat; CSS ease-out (0,0,.58,1), статичный центральный dot. Trainer inbox awaitingMe, trainer active invite, client active invitation |
| pillPulse | components.css:91; используется savestate.is-saving (1268) | Самостоятельный keyframe не применяется StatusPill; ожидания в fresh используют ping. Savestate относится к исключённому журналу/брифу 15 |
| Skeleton | fresh.css:297–302: gradient sunken/hair/sunken, size300%, background-position100→−200%, 1.4s linear | Shimmer/UI withRepeat, повторяемый SVG gradient, перемещение −2W→4W; подключены существующие skeleton surfaces. hair из spec: light #efefeb, dark #212227 |
| sk из components | components.css:536–543: opacity .55↔1, 1.2s | Переопределён fresh.css animation:shimmer; отдельный opacity pulse не добавляется |
| faceHop | fresh.css:734: .8s/.2s + headBob | Исключён из этого брифа: mascot*, SOM-38 |
| Reduce / calm | motion off, opacity1, y0, контент сразу | Shared MotionPolicyProvider: sync Reanimated snapshot + live AccessibilityInfo + role calm. Все shared values/loops отменяются; native Stack animation none; нет ожидания данных |

## Задержка вкладок и измерение

В исходном RoleTabs отсутствовали preload/lazy override: первый tabPress запускал
первое монтирование экрана. Изначального эффекта входа у большинства экранов не
было. В RoleTabs нет сетевого await перед navigation.navigate; загрузка workspace
показывает существующий loading-shell. Измеренный источник затрат — монтирование,
а не доказанное ожидание сети или нативный frame stall.

Метод: React Profiler `actualDuration`, RN synthetic renderer/Jest, реальный
TrainerClientsScreen, один прогрев + 10 независимых samples. Baseline source
временно извлечён из `75a32534e7cd1db7e46374d9a0a98881167df3ee`, те же
theme/i18n/shared dependencies. Затем текущий экран монтировался unfocused
(имитация preload), обнулялся CPU accumulator и отправлялся navigation focus.
Измеряются React commit CPU costs, не время tabPress→native paint.

| Путь | Samples, ms | Среднее | Медиана |
| --- | --- | --- | --- |
| До: первый mount baseline экрана | 14,13,14,16,14,13,14,14,13,16 | 14.1 | 14 |
| После: mount вне нажатия (prewarm) | 13,15,13,19,16,14,9,11,9,8 | 12.7 | 13 |
| После: focus уже смонтированного | 1,0,0,1,1,1,0,0,0,1 | .5 | .5 |

Монтирование не исчезает: navigation.preload переносит его в отдельные idle-slots,
по одному экрану. Активный экран остаётся lazy; prewarm не блокирует начальный
render. Без requestIdleCallback fallback — RAF, затем timeout. Warmed keys
исключают повторную предзагрузку; cleanup отменяет очередь. Если нажать до
prewarm, первый mount всё ещё возможен. Не утверждаем, что устранены все native
задержки или гарантированы 60/120 fps.

Воспроизведение измерения: [PROFILE.md](PROFILE.md). Числа записаны до последних
исправлений layout-slot; их не выдаём за benchmark окончательной Release-сборки.
Нативное ощущение на iPhone 14 Pro и Android: **не проверено**.

## Проверки

- RED: `cd app && npx jest tests/navigation-motion.test.tsx --runInBand` — 2 ошибки
  отсутствующих entranceDelay/MotionPressable до реализации.
- GREEN: mechanism + existing navigation tests — 10 tests PASS.
- `cd app && npx jest tests/onboarding-route.test.tsx tests/notifications/feed.test.tsx tests/motion.test.tsx tests/navigation-motion.test.tsx --runInBand` — 4 suites / 41 tests PASS.
- Проверки включают CSS delays/scales, repeated press reversal, focus/return,
  data rerender, subscription cleanup, calm cancellation, system snapshot,
  tabPop stack-return, поэкранную idle-очередь и сохранение navigation events.
- Первый полный check выявил неполные AccessibilityInfo mocks у ранее статичных
  экранов. Общий beforeEach настраивает обе функции RN API; regressions исправлены.
- Финальный `npm run check`: 246 suites / 3131 tests PASS; typecheck/lint/format PASS.
- `npx expo export --platform all`: Android/iOS/web export PASS; это не native запуск.
- Headless web, Chromium ARM64 / agent-browser, 390×844: Today → Clients →
  Profile → calm → Today PASS; runtime errors и console errors пусты. Движение
  индикатора/иконки подтверждено RAF samples (например, indicator scale .6 →
  .966753 → 1.03763 → 1; tabPop .6 → 1.18774 → 1.23024 → 1 — overshoot CSS spring).
  Calm: scale1/y0 и конечная opacity1. NativeWind фон карточки проверен через
  computed style #151619; добавлен cssInterop для Animated.View/Pressable.
  Снимки `/tmp/som39-clients-final.png` просмотрены и не включены в git.
- `git diff --check`: PASS.

## Самопроверка и границы

Независимое ревью выявило утрату gap у Card и пропущенные stack-return/reduce
переходы. Card rows теперь использует MotionGroup как свой корень; обычные Card
не оборачиваются. MotionBlock сохраняет layout-native View либо переносит margin,
размеры/flex/self/позицию в слот; базовые child dimensions сохраняются внутри.
Stack использует animation:none, а вход выполняется общим riseIn; tabPop связан с focus.

Не изменялись mascot*, toast.tsx, sheet.tsx, workout*/**, Supabase и реальные данные.
Не добавлялись платные сервисы. PNG не коммитятся. Native screen-reader,
крупный текст на устройстве, сравнение всех тем/состояний, Release first-frame,
быстрый tab switching на устройстве и одобрение владельца остаются открытыми.
