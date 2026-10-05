# SOM-39 · Исправить обнаружение списков системной панелью после PR #89

Linear: https://linear.app/something-great/issue/SOM-39
Ветка: agent/01-som-39-native-liquid-glass-tabs-fix. Заголовок PR с SOM-39.

## Контекст

PR #89 влит в fix/som-50-template-picker как 9cb1f5c. Его app/database CI зелёный,
но критерий брифа 21 «сворачивание при прокрутке на экранах со списками» не обеспечен.
Отчёт и ADR 0113 честно фиксируют причину: MotionHeader перед ScrollView, а
RNSScrollViewFinder идёт по первой дочерней цепочке. Такая структура есть также
у других вкладок. Одного minimizeBehavior="onScrollDown" недостаточно.

Это исправление уже влитой задачи SOM-39 целиком по этому дефекту, не новая
микрочасть или приёмка экранов. Выполнить после активного 00-som-26-calm-today-fix
и до 22-som-26-today-finished-sessions в том же аккаунте. Зависимость #89 уже в базе.
Координатор разрешает техническую интеграцию регистрации целевого списка в
перечисленных ниже границах: нового продуктового решения для восстановления
уже требуемого сворачивания не нужно. Содержимое и внешний вид экранов сохранить.

## Критерии

- [ ] Проверены все десять вкладок NativeTabs, включая loading/empty/error и
  смену сценария. Реальные основные списки корректно доступны системному
  механизму сворачивания и автоматических insets; вложенный горизонтальный
  список, sheet или header не становится ошибочным scroll target.
- [ ] API сверено с фактически установленными expo-router/react-native-screens,
  включая native реализацию поиска и регистрации ScrollView. Использовать
  публичный ScrollViewMarker, если он подходит, или другую поддерживаемую
  структуру списка. Не ограничиваться mock-тестом существования marker: показать
  в отчёте путь native регистрации и target при header-first структуре.
- [ ] На «Сегодня» работают demo и server presentation; фиксированная шапка,
  кнопка «+», действия, журнал и данные не меняются. Если server экран вне
  NativeTabs, интеграция там безопасна и не добавляет лишних отступов.
- [ ] Устранён временный measured bottom-padding workaround из #89 там, где
  automatic inset теперь применяется. Нет двойного нижнего отступа; последний
  элемент и активный dock доступны. Insets для stack-маршрутов, Android/web,
  старого iOS и экранов без списка сохраняют корректное поведение.
- [ ] Тесты покрывают настоящий выбор основного scroll target/структуру при
  шапке перед списком, переключение состояния/unmount, отсутствие двойного
  отступа и безопасное поведение вне NativeTabs. Сохранены классы NativeWind и
  animatedStyle из ADR 0110, calm/reduce, темы и существующие motion timings.
- [ ] Неизвестные ограничения native прямо перечислены; наличие props и
  synthetic tests не выдаётся за доказанное сворачивание на iPhone.
- [ ] CHANGELOG, ROADMAP, ADR 0113/UI-PARITY и соответствующий технический пункт
  OPEN-QUESTIONS обновлены; исторический отчёт #89 не переписан как новая проверка.
  Отчёт app/review/01-som-39-native-liquid-glass-tabs-fix/README.md содержит
  точные команды/результаты и таблицу всех десяти вкладок.
- [ ] Рабочий выполняет npm run check и необходимые export/smoke проверки по
  RULES; новые PNG/бинарные снимки в git не добавляются. PR только в разрешённую base.

## Источники

- app/review/21-som-39-native-liquid-glass-tabs/README.md, известная проблема списка.
- docs/app/decisions/0113-native-system-tabs.md; ADR 0110; UI-PARITY и ROADMAP.
- app/src/features/navigation/role-tabs.tsx и tab-bar-layout.tsx.
- app/src/features/trainer-today/trainer-today-screen.tsx, header перед ScrollView.
- Установленные node_modules: expo-router native-tabs; react-native-screens
  ScrollViewMarker и ios/helpers/scroll-view/RNSScrollViewFinder.mm.
- prototype-fresh/index.html и canonical spec обеих тем — содержимое не менять.

## Границы

app/src/features/navigation/**; presentation-файлы десяти вкладок trainer/client,
app/src/features/trainer-today/** и общий app/src/ui/screen.tsx — только обёртка,
регистрация основного списка и insets; связанные тесты; docs и текстовый отчёт.
При необходимости новый navigation adapter; motion.tsx разрешён только для
минимальной передачи scroll props/ref/обёртки, если без этого публичная интеграция
невозможна, без изменения политики/анимаций/AnimatedView из ADR 0110.
Не менять domain, provider, auth, server/RPC/migrations, содержимое экранов,
prototype, маршруты создания, workout/session-editor, dependencies/lockfile.
Пункты другой очереди third/22 (группировка завершённых занятий) не реализовывать.
Общие docs изменять минимально; соседние проверки и историю сохранить.

## Что нельзя проверить в контейнере

Настоящий UITabBar на iPhone iOS 26: сворачивание/возврат, линза/drag/FPS,
крупный текст, VoiceOver, клавиатура/шторки/dock; старый iOS и Android устройства.
Визуальную приёмку подтверждает только владелец. SQL не меняется; db CI не
подменять локальной проверкой без Docker. Платные сервисы и реальные данные запрещены.
