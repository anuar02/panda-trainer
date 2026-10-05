# SOM-39 · Плавающая навигация в стиле Liquid Glass

Linear: https://linear.app/something-great/issue/SOM-39
Ветка: agent/18-som-39-liquid-glass-tabbar-r2. Заголовок PR с SOM-39.

## Решение владельца 05.10.2026

Нижняя навигация обеих ролей (тренер, клиент) становится **плавающей панелью
Liquid Glass**. Это сознательное отступление от `prototype-fresh` — запиши его в ADR
и в `docs/app/UI-PARITY.md` как исключение владельца. Остальное в панели
(иконки, подписи, порядок вкладок, бейджи, анимации tabPop/индикатора из #77)
остаётся как в эталоне.

## Контекст

- Сейчас: `app/src/features/navigation/role-tabs.tsx` — `FloatingTabBar` (L28–L201)
  через `tabBar` у `Tabs` (L208); фон и `paddingBottom: max(10, insets.bottom)` (L91).
- Устройство владельца — iPhone 14 Pro на iOS 26.6: настоящее стекло доступно.
- `expo-glass-effect` уже в `node_modules` (зависимость expo-router 57). Сделай его
  прямой зависимостью через `npx expo install expo-glass-effect` и сверь API
  с документацией установленной версии (`GlassView`, `isLiquidGlassAvailable`).
- Анимированные стили и `className` — только через `AnimatedView` /
  `AnimatedPressableView` из `app/src/ui/motion.tsx` (ADR 0110). Не регистрируй
  `cssInterop` на сырых Animated-компонентах — это ломает все стили на устройстве.

## Критерии

- [ ] Панель плавает: отступ от краёв экрана и над home indicator (safe area), скруглённая
  капсула; контент экранов прокручивается **под** панелью и виден сквозь стекло.
- [ ] iOS 26+: `GlassView` (Liquid Glass) с реакцией на касание, если API это даёт;
  тёмная и светлая темы выглядят корректно.
- [ ] Фоллбэк, когда `isLiquidGlassAvailable()` = false (iOS < 26, Android, web):
  полупрозрачная поверхность из токенов темы + тонкая граница, без чёрных/белых
  прямоугольников; reduce transparency — непрозрачная поверхность.
- [ ] Последний элемент каждого экрана с вкладками не прячется под панелью:
  нижний отступ контента = высота панели + safe area (общий хук/константа, не
  числа по экранам).
- [ ] Иконки, подписи, бейджи, порядок, tabPop/индикатор, calm/reduce motion —
  без регрессий; доступность (role tab, selected, подписи) сохранена.
- [ ] Клавиатура и шторки (`sheet.tsx`) не конфликтуют с панелью.
- [ ] Тесты: фоллбэк выбирается по `isLiquidGlassAvailable`; нижний отступ
  применяется на экранах вкладок. `npm run check` зелёный.
- [ ] ADR (отступление от эталона + выбор `expo-glass-effect`), запись в UI-PARITY,
  CHANGELOG, ROADMAP. Отчёт `app/review/18-som-39-liquid-glass-tabbar/README.md`:
  что проверено в Jest/web, что требует iPhone («не проверено»).

## Субагенты

Подходит разделение: (1) панель и фоллбэк в `role-tabs.tsx`; (2) общий нижний отступ
и прокрутка под панелью на экранах вкладок; (3) независимое ревью на iOS-подводные
камни (safe area, тема, reduce transparency) и тесты. Общие файлы — у ведущего.

## Границы

`app/src/features/navigation/**`, экраны вкладок обеих ролей — только нижний отступ,
`app/src/ui/screen.tsx` / общий хук отступа, `app/package.json` (одна зависимость),
тесты, docs/ADR/UI-PARITY/CHANGELOG/ROADMAP. Не трогать `motion.tsx` (только
использовать), журнал тренировки (`app/src/features/workout/**`), создание занятия
(`app/src/features/session-editor/**`) — их параллельно меняют другие агенты.

## Нельзя проверить в контейнере

Настоящее стекло на iOS 26 и ощущение на устройстве — только на iPhone владельца.


## Повтор r2 — восстановление после незавершённого запуска

Этот бриф заблокирован и НЕ стоит в исполняемой очереди third. Координатор
переносит его в tasks/third/ только после слияния PR #80 (ADR 0110,
AnimatedView / AnimatedPressableView) в fix/som-50-template-picker.
Не обходить зависимость копированием motion.tsx и не вливать fix/* PR.

PR #81 закрыт без слияния: это автосохранённый WIP 4e47dda96728263c79f609ac06e1cc86bfbcf6f9.
В нём есть черновики TabBarSurface, TabBarLayoutProvider и отступы экранов,
но нет новых тестов, CHANGELOG, ROADMAP, ADR, UI-PARITY и review-отчёта.
CI app: typecheck и lint прошли; format:check упал на role-tabs.tsx,
Jest не запускался. Лог исходного worker FAIL в контейнере координатора
недоступен; причина завершения рабочего не установлена.

После разблокировки создай новую ветку от свежей базы. Можно извлечь черновик
из старой agent/18-som-39-liquid-glass-tabbar, но проверь каждое изменение;
не ограничивай работу Prettier. Выполни все критерии исходного брифа целиком.

- [ ] Тесты native glass/fallback для iOS/Android/web, reduce transparency,
  смены темы и корректного cleanup подписки.
- [ ] Тесты общего отступа обеих ролей: safe area, крупный текст, измерение
  панели, dock, последний элемент контента; клавиатура и шторки без регрессий.
- [ ] Новый ADR бери по максимуму свежей базы; не перезаписывай ADR 0110.
- [ ] Полный отчёт app/review/18-som-39-liquid-glass-tabbar-r2/README.md,
  CHANGELOG/ROADMAP/UI-PARITY и npm run check. Не объявлять iPhone-проверку
  или приёмку выполненными по Jest/web.

Границы и ограничения исходного брифа сохранены: только navigation, нижние
отступы экранов вкладок, Screen, одна зависимость/lockfile, тесты и документы;
не править motion.tsx, workout или session-editor. Другие аккаунты работают
параллельно. Если r2/r3 снова не удаётся завершить, сообщи конкретный блокер
в отчёте, не создавай мелкие отдельные задачи.
