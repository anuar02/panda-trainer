# SOM-39 · Floating Liquid Glass tabbar · r2

Дата: 05.10.2026. Ветка: `agent/18-som-39-liquid-glass-tabbar-r2`.
Свежая база: `438836e` (`fix/som-50-template-picker`, #80 / ADR 0110).
WIP #81 не переносился: реализация заново проверена против свежей базы.
Исключение владельца: [ADR 0111](../../../docs/app/decisions/0111-floating-liquid-glass-tabbar.md)
и [UI-PARITY §5](../../../docs/app/UI-PARITY.md#5-разрешённые-отклонения).

## Результат

Навигация обеих ролей — абсолютная плавающая капсула. Боковой отступ 12,
радиус 32; зазор снизу `max(10, safeArea.bottom)`.
`GlassView` содержит кнопки, использует `isInteractive`, `glassEffectStyle="regular"`
и явную тему приложения. Стекло выбирается только при iOS + обеих проверках
`isLiquidGlassAvailable()` / `isGlassEffectAPIAvailable()` + выключенном reduce
transparency. Начальная проверка accessibility консервативно использует непрозрачную
поверхность; поздний ответ не переопределяет уже пришедшее событие.

Fallback — поверхность активной темы с alpha 0.95 в тёмной / 0.90 в светлой теме
и границей 1. При iOS reduce transparency поверхность непрозрачна.
Запрос и подписка accessibility имеют cleanup. У стекла нет родителя с opacity=0.
Прямая SDK-зависимость `expo-glass-effect ~57.0.4` добавлена одной строкой
в package.json и lockfile; новая native-сборка должна включать модуль.

Общий `TabBarLayoutProvider` измеряет всю панель, включая demo dock. Нижний отступ
контента = высота панели + её отступ снизу + 16. До измерения расчёт учитывает роль,
кегль и две строки вкладок при fontScale > 1.3. Измерение обновляется после смены
ширины/масштаба текста; до нового onLayout сохраняется измеренная высота dock,
чтобы не потерять clearance при смене fontScale без изменения геометрии. Все десять вкладок обеих ролей и общий Screen используют
hook; отдельные экраны вне provider сохраняют прежнее поведение.
При клавиатуре панель и dock скрыты, отступ освобождается; подписки удаляются.

Внутренние размеры сверены с `prototype-fresh/review/parity/spec-dark.json` и
`spec-light.json`: иконка 22, row minHeight 54, padding 6, gap 3, trainer label 10,
client label 12; порядок и тексты сохранены. TabMotion/индикатор используют прежнюю
политику calm/reduce. Бейдж в базовом `role-tabs.tsx` отсутствовал; в эталоне `TabBar` получает
по умолчанию badge=0, текущие вызовы экранов не передают счётчик. Это поведение
сохранено; прежние уведомления экранов не менялись.

`motion.tsx`, `workout/**`, `session-editor/**`, SQL и migrations не изменены.
Существующий `BottomSheetModalProvider` оборачивает navigation в root layout,
поэтому sheets продолжают использовать modal portal. Native-композиция не проверена.

## Команды и доказательства

Из `/home/node/repo/app`:

```sh
npx expo install expo-glass-effect
npx jest --runInBand tests/liquid-glass-navigation.test.tsx tests/navigation.test.tsx tests/navigation-motion.test.tsx tests/tab-bar-layout.test.tsx tests/tab-bar-surface.test.tsx
npm run check
npx expo export --platform web --clear
```

- Expo install: успешно; установленная версия 57.0.4; API проверено по package types,
  iOS implementation и [документации Expo](https://docs.expo.dev/versions/latest/sdk/glass-effect/).
- Фокусный Jest: 5 suites / 31 tests, успешно. Проверяются native glass/fallback
  для iOS/Android/web, обе capability gates, смена темы на mounted-компоненте,
  reduce transparency, ошибка запроса, событие раньше initial read и read после
  unmount, cleanup; геометрия safe area / 200% текста / измеренного dock;
  настоящий Screen и оба ProfileScreen используют измеренный отступ;
  обе роли сохраняют accessibility, selected state, press/longpress и навигацию;
  клавиатура скрывает/восстанавливает dock и reservation, cleanup выполнен;
  существующие TabMotion/calm/reduce regressions проходят.
- Первые полные проверки обнаружили типы неполных RN mock-подписок и порядок
  импортов в новом тесте; исправлено. Итог `npm run check`: успешно; TypeScript, ESLint (0 warnings), Prettier,
  256 suites / 3295 tests passed.
- Web export: успешно, статические маршруты собраны. Первый запуск пересёкся с
  незавершённым import hook; после исправления выполнен успешный `--clear` rebuild.
- `git diff --check`: успешно.
- Browser smoke: успешно, 12 route/theme cases (пять вкладок тренера и профиль
  клиента × dark/light) при viewport 390×844 / reducedMotion. Каждая панель:
  x=12, width=366, height=68, bottom=834, radius=32, border=1, paddingBottom
  контента=94, scroll viewport bottom=844. Фон rgba(21,22,25,0.95) /
  rgba(255,255,255,0.9), 5 доступных вкладок, page errors=0.
  DOM подтверждает overlay и измеряемый отступ; ощущение/нативное стекло не проверены.
  Script: `app/tests/liquid-glass-web-smoke.cjs`, JSON — `/tmp/som39-web-smoke.json`.
  Вначале Chromium не запускался из-за отсутствующего libnspr4; библиотеки
  Debian извлечены только в `/tmp` без изменения системы. Playwright установлен
  отдельно в `/tmp`, package.json приложения этим не изменялся.

Команда воспроизведения успешного browser smoke из `app/`:

```sh
PLAYWRIGHT_MODULE=/tmp/som39-browser/node_modules/playwright \
LD_LIBRARY_PATH=/tmp/som39-browser-libs/extracted/usr/lib/aarch64-linux-gnu:/tmp/som39-browser-libs/extracted/lib/aarch64-linux-gnu \
node tests/liquid-glass-web-smoke.cjs
```

Четыре client entry-вкладки (`home`, `program`, `history`, `progress`) в текущей
базе требуют авторизации и перенаправляют в `/auth/sign-in`, затем в production
connection routes. Эти браузерные экраны не проверены; их компоненты и нижние
отступы проверены Jest/кодом, реальные данные не использовались. Маршрутизация
этого предыдущего пакета не менялась в границах SOM-39.

## Критерии брифа

| Критерий | Статус |
| --- | --- |
| Плавающая капсула и прокрутка под ней | Сделано; Jest/экспорт, native требует проверки |
| iOS 26+ interactive GlassView и темы | Сделано в коде/Jest; на iPhone не проверено |
| Fallback + border, reduce transparency | Сделано; synthetic platform/theme/lifecycle tests |
| Общий нижний отступ всех вкладок, safe area/large text/dock | Сделано; hook, Screen, обе роли и keyboard tests |
| Иконки, подписи, порядок, tabPop/индикатор, calm/reduce, accessibility | Сохранено; Jest. Default badge=0 сохранён; полная визуальная приёмка открыта |
| Клавиатура и sheets | Keyboard lifecycle проверен Jest; sheet regressions входят в полный check. Native-перекрытие/жесты не проверены |
| Полный npm run check | Сделано: 256 suites / 3295 tests, typecheck/lint/format зелёные |
| ADR / UI-PARITY / CHANGELOG / ROADMAP / отчёт | Сделано |
| Одобрение владельца | Требуется; экраны и SOM-39 целиком не приняты |

## Не проверено на iPhone / ручной чек-лист

- Настоящее стекло iPhone 14 Pro / iOS 26.6: размытие контента под панелью,
  интерактивный отклик, контраст обеих тем, ручная тема приложения при другой
  системной теме; нет чёрных/белых прямоугольников и отсечения тени.
- Home indicator, landscape/safe area, максимальный Dynamic Type: вкладки,
  появление/исчезновение dock, последний элемент всех десяти экранов прокручивается
  выше панели; нет скачков после native onLayout.
- Show/hide/interactive keyboard dismissal и переключение вкладок с полем ввода.
- Открыть/dismiss/stack sheet с панелью и dock: modal scrim выше панели,
  касание не проходит через scrim, keyboard avoidance и жесты не конфликтуют.
- VoiceOver: роль tab, selected, подписи, порядок чтения, отсутствие лишнего focus
  на декоративной поверхности; reduce motion/calm и reduce transparency live.
- Реальный fallback старого iOS/Android. Web mock и DOM не заменяют устройство.
- Пары визуального сравнения с прототипом и одобрение владельца не выполнены.
  Новые PNG в git не добавлялись (ADR 0066).

## Ограничения среды

Graft executable и каталог `graft/` отсутствуют, build графа недоступен.
Подключённого Linear-инструмента нет: live project/issue/dependencies не обновлены
и не проверены. Linear не менялся. Scope и снятие зависимости #80 проверены по
брифу и свежей git-базе. SQL не затронут, Docker/pgTAP не требуются этому пакету.
