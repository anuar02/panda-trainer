# SOM-39 · NativeTabs iOS 26 · бриф 21

Draft PR: [#89](https://github.com/anuar02/panda-trainer/pull/89).

Дата: 05.10.2026. База содержит бриф 20, SOM-26 / #88 (`d79cef9`).
Экраны и SOM-39 целиком не приняты: одобрение подтверждает только владелец.

## Что реализовано

- Обе роли: по пять существующих маршрутов, русские подписи, системные иконки
  SF Symbols/Material, акцент и схема текущей темы.
- NativeTabs SDK 57: UITabBar Liquid Glass iOS 26, onScrollDown, системный
  touch/drag/индикатор; старый iOS, Android и web используют штатные реализации.
- «Сегодня»: Badge только при положительном доверенном счётчике запросов,
  тот же источник SchedulingDemoProvider, что у существующих /inbox и Сегодня.
- Удалены FloatingTabBar/TabBarSurface/TabBarLayoutProvider, ручные размеры и
  предзагрузка navigation.preload. Совместимый hook возвращает ноль при
  автоматических insets, а на native iOS Сегодня — измеренный системный bottom
  inset; расчёта высоты панели нет. MotionScrollView не изменён.
- Dock журнала не изменён: iOS 26 BottomAccessory; остальные платформы — обычный
  layout под панелью с safe area, без перекрытия контента. Этот fallback требует
  визуального одобрения. Клиент не получает dock или дополнительную кнопку.
- Начальные маршруты today/home заданы через unstable_settings в layout.

## Ограничение круглой «+»

Поддерживается plus icon на role search, но элемент требует маршрут и представляет
системную вкладку. tabPress.canPreventDefault=false; disabled допускает сообщения
о предотвращённом native нажатии, но JS-навигация может открыть этот экран.
Без фиктивного экрана независимого action API нет. По прямому fallback брифа
оставлены пять вкладок и существующая «+» в шапке Сегодня. Отдельная круглая «+»
не реализована, снятие кнопки из шапки не выполнялось. Подробности —
[ADR 0113](../../../docs/app/decisions/0113-native-system-tabs.md).

## Команды и результаты

- `graft map`, `graft build`, `graft ask "SOM-39 native tabs navigation tab bar trainer today header ADR 0111" --source`
  — command not found; каталог graft тоже отсутствует. Контекст прочитан напрямую.
- Live Linear SOM-39 и trainerApp прочитаны: issue In Progress, blockedBy пуст;
  описание шире брифа 21, существующие #77/#78/#80/#86 связаны с той же задачей.
  Поиск Liquid Glass в live проекте не нашёл отдельных дублей.
  Никаких записей, комментариев и новых задач в Linear не сделано.
- API сверен с установленными types.d.ts, common/elements.d.ts и native/web
  реализациями expo-router 57.0.24 / react-native-screens 4.26.0.
- `cd app && npx jest --runInBand tests/navigation.test.tsx tests/tab-bar-layout.test.tsx tests/liquid-glass-navigation.test.tsx`
  — PASS: 3 suites, 36 tests; включая iOS 26.0.1/26.6.1, пустой accessory,
  measured iOS Today inset и отсутствие двойного отступа на других маршрутах. Регрессии: ноль/unknown/error hydration не дают badge;
  изменение состояния удаляет бейдж; разные роли/темы/insets/dock API.
- `cd app && npm run check` — PASS: typecheck, lint, format:check; 255 suites / 3318 tests (49.703 s).
- `cd app && npx expo export --platform web --output-dir /tmp/som-39-native-tabs-web`
  — PASS: 72 статических маршрута. Предупреждение SDK resolveAssetSource exports
  fallback не препятствует сборке; NO_COLOR/FORCE_COLOR warning также не ошибка.
- `cd app && npx expo export --platform all --output-dir /tmp/som-39-native-tabs-all`
  — PASS: iOS 2986 modules, Android 3073, web 2415, 72 статических маршрута;
  это JS-export, не установка native-бинарника на устройство.
- Первые попытки browser smoke: root Playwright не был установлен, затем отсутствовал
  Chromium executable. `npm ci --ignore-scripts`, `npx playwright install chromium --only-shell`
  — PASS установка существующих инструментов проверки, зависимости/lockfile не менялись.
  Повторный `node /tmp/som-39-browser-smoke.cjs` не смог запустить Chromium:
  отсутствовала системная `libnspr4.so`; sudo в контейнере нет. Затем пакеты Debian
  скачаны через apt с индексом в `/tmp/som-39-apt-lists`, распакованы `dpkg-deb -x`
  в `/tmp/som-39-browser-libs`; системная установка не выполнялась.
- `node /tmp/som-39-static-server.cjs` (порт 4392, static export с mapping URL → .html),
  `LD_LIBRARY_PATH=/tmp/som-39-browser-libs/usr/lib/aarch64-linux-gnu:/tmp/som-39-browser-libs/lib/aarch64-linux-gnu node /tmp/som-39-browser-smoke.cjs`
  — PASS на финальном export: Chromium 390×844, dark/light; тренер — пять
  русских подписей и выбор всех пяти вкладок; клиент — пять подписей, выбор
  профиля, штатный анонимный home redirect на auth/sign-in. Uncaught page errors: 0.
  Ранее был timeout из-за URL .html и замены export во время smoke; финальный
  запуск проведён последовательно после завершения export. Client production
  данные и authenticated переходы не проверялись.
- `git diff --check` — PASS.

## Известная проблема обнаружения ScrollView на Сегодня

Независимое ревью: MotionHeader расположен перед ScrollView
(`trainer-today-screen.tsx:455,531`); native RNSScrollViewFinder проходит только
первую дочернюю цепочку, а не соседние элементы. Root props NativeTabs не могут
указать этот ScrollView. Поэтому обнаружение ScrollView и сворачивание на Сегодня
**не обеспечены**, несмотря на заданный onScrollDown. Для защиты последнего
элемента в разрешённом общем hook используется фактический bottom safe-area
inset внутри native iOS-сцены today; остальные экраны не получают двойного
отступа. Это покрыто тестом маршрута/платформы, native ещё не проверено. Для исправления нужен
публичный ScrollViewMarker вокруг целевого списка с automatic content inset.
Это требует изменения trainer-today сверх разрешённого удаления «+» либо общей
MotionScrollView, которую бриф запрещает менять. В текущей задаче такие правки
не сделаны. Требуется разрешение на эту узкую интеграцию в следующем брифе;
вопрос владельцу во время работы не задавался. Последний элемент Сегодня
на iPhone нельзя объявлять проверенным: synthetic inset-тест не заменяет устройство.

Пустой native BottomAccessory исправлен в разрешённой области navigation:
не монтируется без доверенного незавершённого журнала; тест проверяет
empty/hydration/active/finished. В portable fallback нижняя safe area отсутствует,
когда измеренное содержимое dock равно нулю.

## Приёмка и ограничения проверки

| Критерий | Статус |
| --- | --- |
| Тренер 5 вкладок + круглая «+» либо ограничение; клиент без лишней кнопки | Сделано: допустимый fallback, ограничение документировано |
| Сворачивание вниз / разворачивание вверх | Настроено onScrollDown; Сегодня — известное ограничение обнаружения списка; iPhone iOS 26 — не проверено |
| Бейджи только при N > 0 | Сделано, регрессионные тесты |
| Удаление «+» из шапки при рабочем круглом action | Не применяется: action API ограничен, «+» сохранена |
| Предзагрузка / первый кадр | Native eager scenes заменяют ADR 0105 preload; native FPS/память/задержка — не проверено |
| Reduce Motion / спокойный интерфейс | Системная политика панели, прежняя политика содержимого; device — не проверено |
| Последний элемент списков / safe area | Ручной размер удалён; Сегодня защищён измеренным native inset; device — не проверено |
| iOS <26 / Android | Штатные реализации; устройство — не проверено |
| ADR отменяет 0111, UI-PARITY, CHANGELOG, ROADMAP | Сделано |
| Визуальная приёмка, dock fallback | Требует одобрения владельца |

Пары native/прототип 390×844, обе темы/состояния, большой текст, VoiceOver,
клавиатура, sheet поверх панели, Lens/drag/сворачивание и активный dock на iPhone
(iOS 26) — **не проверено**, проверит владелец. PNG не добавлены в git (ADR 0066).
Web не доказывает системное стекло или плавность. SQL/pgTAP не запускались:
схема и база в этой задаче не менялись, Docker в контейнере отсутствует.
