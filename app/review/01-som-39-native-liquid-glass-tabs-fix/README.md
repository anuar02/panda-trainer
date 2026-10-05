# SOM-39 · Регистрация списков NativeTabs после #89

Draft PR: [#91](https://github.com/anuar02/panda-trainer/pull/91).

Дата: 05.10.2026. Ветка: `agent/01-som-39-native-liquid-glass-tabs-fix`.
Разрешённая база: `fix/som-50-template-picker`, исходный HEAD `64e89dd` (#90),
включает #89 `9cb1f5c` и SOM-26 #88. Очередь 00 завершена в базе; third/22 не реализован.
SOM-39 и экраны не приняты; native-проверка и одобрение принадлежат владельцу.

## Реализация

Основные вертикальные списки используют navigation adapter NativeTabScrollView.
Только iOS внутри NativeTabsInsetsProvider: публичный ScrollViewMarker из
`react-native-screens/experimental`, непосредственный RN ScrollView и явно
`contentInsetAdjustmentBehavior="automatic"`. На Android/web и stack-маршрутах
adapter возвращает прежний MotionScrollView без дополнительной обёртки/insets.
Horizontal guard запрещает регистрацию горизонтального target даже при ошибочном
использовании adapter. В Library вложенная горизонтальная фильтрация оставлена
MotionScrollView. Шторки и fixed headers не являются targets.

Удалён временный measured Today bottom-padding: useTabBarLayout возвращает ноль,
системное пространство даёт automatic inset. Внутренние padding списков сохранены.
Dock/BottomAccessory/portable safe area не изменены. Demo и server presentation
Today используют тот же существующий список; server workspace вне NativeTabs
не получает marker или принудительную коррекцию. «+», действия, журнал и данные
сохранены. motion.tsx, NativeWind/animatedStyle ADR 0110, темы, calm/reduce и
motion timings не изменены. Prototype/spec не менялись, новых PNG/бинарников нет.

Решения: [ADR 0114](../../../docs/app/decisions/0114-native-tab-scroll-target-registration.md)
и обновление [ADR 0113](../../../docs/app/decisions/0113-native-system-tabs.md).
[Исторический отчёт #89](../21-som-39-native-liquid-glass-tabs/README.md)
не переписан как новая проверка.

## Все десять вкладок

Пути относительно `app/src/features/`. Таблица — ревью исходников и Jest actual
presentation tree; она не является native/визуальной приёмкой.
Во всех перечисленных списках исходные props/styles сохранены.

| Вкладка | Основной target | loading / empty / offline / error и смена сценария |
| --- | --- | --- |
| Тренер · Сегодня | trainer-today/trainer-today-screen.tsx:531 | Loading — прежние skeleton без списка/marker; normal/empty/offline — основной список; переход обратно loading размонтирует marker. Server data проверен внутри/вне provider |
| Тренер · Расписание | trainer-schedule/trainer-schedule-screen.tsx:294 | Один основной список во всех demo-сценариях |
| Тренер · Клиенты | trainer-clients/trainer-clients-screen.tsx:154 | Один основной список во всех demo-сценариях |
| Тренер · Библиотека | trainer-library/trainer-library-screen.tsx:164 | Один основной список; вложенный horizontal filter не зарегистрирован, sheets не обёрнуты |
| Тренер · Профиль | profiles/profile-screens.tsx:185 | Основной список остаётся; scenario-specific содержимое прежнее |
| Клиент · Главная | client-home/client-home-screen.tsx:278,726 | Demo и server presentation списки; общий client-entry loading/error использует Screen, auth loading не имеет списка |
| Клиент · Программа | client-program/client-program-screen.tsx:129,416 | Demo/server списки, empty/loading/offline прежние; connected read-error использует Screen |
| Клиент · История | client-history/client-history-screen.tsx:148,413 | Demo/server списки; connected read-error использует Screen |
| Клиент · Прогресс | client-progress/client-progress-screen.tsx:111 | Общая presentation с controlled data, connected read-error использует Screen |
| Клиент · Профиль | profiles/profile-screens.tsx:301 | Один основной список через loading/normal/empty/offline |

`src/ui/screen.tsx:15` отмечает свой основной список в iOS NativeTabs, включая
общие loading/error. Экраны без списка не создают marker. Авторизация/редиректы
сохранены. Demo offline и actual generic error tree проверены отдельно; сетевые
ошибки connected hooks покрываются существующими тестами, без реальных данных.

## Путь native-регистрации при header-first

Установлены expo-router **57.0.24**, react-native-screens **4.26.2**.
Публичный export: `react-native-screens/src/experimental/index.ts:11`.

1. `src/ui/motion.tsx:332–363`: Context.Provider → RN ScrollView; Provider не создаёт UIView. В marker нет промежуточного native View.
2. `react-native-screens/ios/gamma/scroll-view-marker/RNSScrollViewMarkerComponentView.mm:62–72,131–145`: marker разрешает единственный direct UIScrollView или RCTScrollViewComponentView.scrollView.
3. Там же `75–115,150–163`: willMoveToWindow → поиск ближайшего ancestor с registerDescendantScrollView:fromMarker: → регистрация именно основного списка. Соседний header и вложенная horizontal ветвь не участвуют.
4. `ios/tabs/screen/RNSTabsScreenComponentView.mm:124–136`: setContentScrollView:forEdge:All и weak cache `_contentScrollView`.
5. `ios/tabs/screen/RNSTabsScreenViewController.mm:134–138` → `ios/helpers/container/RNSContainerItemSupport.mm:29–44`: cache выбирается раньше nested container и heuristic. `ios/tabs/host/RNSTabBarController.mm:157–165` разрешает target выбранной сцены.
6. Старый heuristic `ios/helpers/scroll-view/RNSScrollViewFinder.mm:5–19` проходит subviews[0], поэтому header-first без регистрации не работает. `RNSScrollViewHelper.mm:6–12` также использует первую цепочку: automatic prop задаётся явно.
7. `ios/tabs/host/RNSTabsHostComponentView.mm:275–284`: UIKit minimizeBehavior применяется на iOS 26; marker не добавляет эту возможность старому iOS.

Пути `ios/...` выше находятся в установленном `app/node_modules/react-native-screens`.
Installed-source contract tests закрепляют эти звенья, actual-tree tests — direct
ScrollView и выбор основного target. Objective-C/UIViewController в Jest не исполняется.
[Официальное руководство Expo](https://docs.expo.dev/router/advanced/native-tabs/)
сверено дополнительно; установленный SDK остаётся точным источником API.

Gamma/Fabric: `RNScreens.podspec:5,24,58–62` включает native marker только при
RNS_GAMMA_ENABLED=1; `expo-router/plugin/build/withRouter.js:26–27` устанавливает
это ENV в Podfile. `app.json` уже содержит expo-router plugin. Native config и
зависимости не менялись. Старый binary без Gamma требует пересборки; export не
доказывает наличие Gamma в установленном клиенте.

Lifecycle-ограничение SDK: попытка регистрации привязана к window, flag сбрасывается
при выходе. Замена direct child внутри того же marker не отслеживается
(`RNSScrollViewMarkerComponentView.mm:223–248`); явного unregister API нет, cache weak.
При normal → loading native cache явно не очищается; loading → normal должен
заменить его новой регистрацией. Этот порядок включён в device checklist.
Adapter держит ScrollView постоянного типа при смене motionKey; Today loading
размонтирует всю ветвь. Смена presentation заменяет target вместе с marker.
Jest проверяет ref identity/rerender/unmount, но реальный Fabric mount order,
временное UIKit удержание старого target и повторная регистрация требуют устройства.

## Команды и результаты

- `command -v graft`, `ls graft`, `graft map` — CLI и граф отсутствуют (command not found); контекст прочитан напрямую. RULES прочитан через `git show a409e10f:tools/codex-agents/RULES.md` (в текущем tree файла нет).
- `git log -5 --oneline`, `gh pr list --state open --json number,title,headRefName,baseRefName` — #89/#90 в базе; открытого PR очереди нет.
- Live Linear get_issue SOM-39/get_project trainerApp и list_issues Liquid Glass — In Progress, blockedBy пуст, отдельных дублей нет. Только чтение, Linear не менялся.
- `cd app && npx jest --runInBand tests/native-tab-scroll-view.test.tsx tests/native-scroll-registration-contract.test.ts tests/tab-bar-layout.test.tsx` — PASS: 3 suites, 14 tests.
- `cd app && npm test -- --runTestsByPath tests/native-tab-screen-targets.test.tsx` — PASS: 1 suite, 13 tests, реальные presentations всех десяти вкладок и generic Screen/server Today. Marker host и Sheet заменены; Sheet требует mock из-за существующего Jest Reanimated addWhitelistedUIProps. Actual MotionScrollView/adapter не замоканы.
- `cd app && npm run check` — PASS: typecheck, lint, format:check; 258 suites / 3339 tests, 59.595 s. Лог: `/tmp/som-39-check.log`.
- `cd app && npx expo export --platform all --output-dir /tmp/som-39-scroll-target-all` — PASS: iOS 2987 modules, Android 3074, web 2432, server 2449; 72 статических маршрута. Лог: `/tmp/som-39-export.log`. JS export, не native binary. NO_COLOR/FORCE_COLOR и expo-asset resolveAssetSource exports fallback warnings не препятствовали сборке.
- `cd app && npx expo install --check` — PASS: Dependencies are up to date.
- `LD_LIBRARY_PATH=/tmp/som39-browser-libs/extracted/usr/lib/aarch64-linux-gnu:/tmp/som39-browser-libs/extracted/lib/aarch64-linux-gnu node /tmp/som39-scroll-smoke.cjs` — PASS: 56 route/state/theme cases и выбор всех trainer tabs, Chromium headless 390×844, dark/light, reducedMotion=reduce; 0 pageerrors. Шесть доступных presentation routes × четыре состояния × две темы = 48; home/program/history/progress × две темы = 8 анонимных redirects на sign-in. Авторизованные client data не подменялись: их trees проверены Jest, browser authenticated flow не проверен. Проверены пять tab элементов, наличие содержимого и scroll-to-end, но не геометрия native последней строки. Лог: `/tmp/som39-scroll-smoke.log`; временный static-server/script обслуживает URL → .html из финального export.
  `npm ci --ignore-scripts` (root) и `npx playwright install chromium --only-shell` — PASS, существующие зависимости/lockfile не менялись. Системные browser libs отсутствуют: пакеты Debian скачаны `apt-get -o Dir::State::lists=/tmp/som39-apt-lists download libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libdrm2 libgbm1 libxkbcommon0 libasound2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libx11-6 libxcb1 libxext6 libatspi2.0-0 libdbus-1-3 libcups2 libpango-1.0-0 libcairo2` и распакованы `dpkg-deb -x` только в `/tmp/som39-browser-libs/extracted`. Первый запуск выявил отсутствующие libwayland-server/libXi; они добавлены командой `apt-get -o Dir::State::lists=/tmp/som39-apt-lists download libwayland-server0 libxi6`. Первый smoke после запуска Chromium прошёл route/state cases до tab switches, затем timeout селектора exact Сегодня из-за Badge в accessible name; селектор исправлен на tab.filter(hasText), приложение не менялось.
  Старый `tests/liquid-glass-web-smoke.cjs` проверяет удалённую custom capsule и не применим к NativeTabs; новый временный script находится вне git.
- `git diff --check` — PASS.

Scenario rerender в actual-tree tests выдаёт duplicate-key `.0/.1` warnings из
неизменённого motion renderer; тесты проходят. Это наблюдение synthetic render,
не подтверждение ошибки или корректности native сценария.

## Критерии и оставшаяся проверка

| Критерий | Статус |
| --- | --- |
| Десять вкладок, основной target, состояния, horizontal/sheet/header исключены | Сделано в коде, ревью и actual-tree tests; native поведение не проверено |
| API и native цепочка регистрации при header-first | Сделано: установленный source и contract tests; native execution не проверено |
| Today demo/server, fixed header, «+», действия/журнал/данные | Сделано: узкая замена scroll adapter; server вне NativeTabs безопасен |
| Удаление measured workaround, отсутствие двойного системного padding | Сделано: hook=0, automatic only iOS tabs; реальная геометрия требует устройства |
| Stack/Android/web/старый iOS/без списка | Fallback/структура проверены; старый iOS/Android устройства не проверены |
| NativeWind/animatedStyle/calm/reduce/темы/motion timings | Исходная реализация сохранена; устройства и визуальный паритет не проверены |
| Docs/ADR/ROADMAP/CHANGELOG/UI-PARITY/OPEN-QUESTIONS и текстовый отчёт | Сделано; исторический отчёт #89 сохранён |
| iPhone iOS 26 сворачивание/возврат и доступность | Не проверено |
| Экраны, active dock/fallback и визуальная приёмка | Требует одобрения владельца |

Не проверены: настоящий UITabBar iOS 26, lens/drag/FPS, сворачивание/возврат,
последняя строка и automatic insets при fixed header/active dock, tab reselection,
большой текст, VoiceOver, keyboard/sheets, Reduce Motion/calm, старый iOS и Android.
Web smoke и JS exports этого не доказывают. Native пары с prototype/spec обеих тем
не получены в Linux; экран не объявлен принятым. SQL не менялся; Docker отсутствует,
локальные db lint/pgTAP/concurrency не запускались, db CI выполнит PR pipeline.
Платные сервисы и реальные данные не использовались.
