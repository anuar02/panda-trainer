# SOM-31 · Активное упражнение целиком в кадре

05.10.2026. Ветка `agent/18-som-31-workout-active-exercise-fit`.
[Решение и правило крупного текста](../../../docs/app/decisions/0108-workout-active-exercise-fit.md).
Это реализация брифа 18, а не завершение всей SOM-31 или приёмка экрана.

## Контекст и план

Live read Linear: проект trainerApp, SOM-31 In Review, duplicateOf null;
blockedBy SOM-30, blocks SOM-32; прежние PR #38/#42 относятся к production вводу.
Linear не изменён. Бриф владельца задаёт более узкую текущую задачу.
`graft map` → exit 127, command not found; `graft/INDEX.md` отсутствует.
Контекст получен из обязательных документов и прямого чтения заданных файлов.

Выполненная последовательность:

1. Тесты расчёта viewport и событийного выравнивания; RED отсутствующего модуля.
2. Hook с ожидающим событием, drag/momentum fences, reduce motion, cleanup таймера.
3. Компактная активная карточка, отдельные сведения/composer; лента подходов,
   отдых и дополнительные действия ниже; dock фиксирован.
4. Integration tests реального WorkoutScreen: открытие/запись/next/manual,
   отсутствие прокрутки при наборе, два viewport, metadata/composer разделены.
5. Независимое read-only ревью; добавлено раннее уплотнение крупного composer.
   Новый тест RED: getActiveComposerLayout is not a function; затем GREEN.
6. ADR/UI-PARITY/CHANGELOG/ROADMAP, полный app check, commit/push/draft PR.

## Расчётные замеры

Все размеры ниже — **расчётные**, не снимки устройства и не результат Yoga.
RN использует фактическую высоту внешнего ScrollView, уже исключающую соседние
SafeArea, шапку и dock. Модель устройств в runtime не применяется.

Системные inset для fixture: 14 Pro 59/34 px, SE 20/0 px. Шапка при обычном
тексте: 10 + 44 + 2 = 56 px. Dock после записи: 6 + 44 undo + 62 + 18 = 130 px
(без undo: 122 px). Поэтому тест использует более тесный вариант.

| Экран | Safe top/bottom | Шапка | Dock с undo | Viewport | Карточка, верхняя fixture-оценка | Запас |
| --- | --- | --- | --- | --- | --- | --- |
| 393×852, 14 Pro | 59 / 34 | 56 | 130 | 573 | 454 | 119 |
| 375×667, SE | 20 / 0 | 56 | 130 | 461 | 454 | 7 |

Fixture карточки: сведения 152 + composer с внешними отступами 284 + запас 18 =
454 px. Для двухстрочного стандартного названия расчёт точнее:
44 eyebrow + 2 top + 48 name + 3 goal margin + 20.3 goal + 8 bottom = 125.3 px.
Поля: 16 padding + 18.85 label + 8 gaps + 48 input + 44 step = 134.85 px.
Composer: 16 padding + 51.3 edit/head + 12 gaps + 134.85 fields + 56 save + 12
внешние margin = 282.15 px. С запасом 18 карточка ≈425.45 px.
Выполненные подходы не увеличивают её высоту: они в горизонтальном ряду ниже.
Длинное произвольное название измеряется runtime и включает overflow при необходимости.

| Крупный текст / стресс fixture | Viewport | Сведения до ограничения | Composer | Сведения после ограничения | Карточка |
| --- | --- | --- | --- | --- | --- |
| Overflow на 14 Pro | 573 | 480 | 330 | 225 | 573 |
| Overflow на SE | 461 | 480 | 330 | 113 | 461 |
| fontScale 2, обычный крупный composer | 467 | 480 | 259.55 | 189.45 | 467 |
| fontScale 2, тесный viewport, дополнительное уплотнение | 300 | 480 | 199.85 | 82.15 | 300 |

Прогноз крупного текста: minHeight кнопки 56 или `23.925 × scale + 24`;
normal composer `66.85 × scale + 54 + buttonHeight`.
Если он оставляет меньше 44 px сведений с запасом 18, compact composer:
`48 × scale + 32 + buttonHeight`. При scale 2 получаем 259.55 / 199.85 px.
Цифры/типографика исходного размера; номер подхода, источник и ошибка находятся
в сведениях. В тесном режиме туда же переходят подписи полей. Ввод и запись остаются
вне прокрутки сведений; accessibilityLabel сохраняют назначение/номер.

Источники размеров: `prototype-fresh/review/parity/spec-dark.json`:
`wfocus__name` 20/24, `excard__goal` 14/20.3, `wcomposer` padding12/gap10,
`wcomposer__head` ≈51.3, `wcomposer__fields` ≈134.85. Сохранены исходные кегли,
цвета, радиусы; новые отступы/расположение — одобренное отличие по брифу и ADR.
Нативная геометрия кнопки/масштабирования проверяется отдельно.

## Команды и результаты

- `graft map` — недоступен, exit 127; граф обновить невозможно.
- `cd app && npx jest tests/workout-active-exercise-fit.test.tsx --runInBand`
  — исходный RED: отсутствующий модуль; повторный RED новой функции уплотнения.
- `cd app && npx prettier --write src/features/workout/active-exercise-layout.ts src/features/workout/workout-screen.tsx tests/workout-screen.test.tsx tests/workout-active-exercise-fit.test.tsx`
  — форматирование выполнено.
- `cd app && npx jest tests/workout-screen.test.tsx tests/workout-active-exercise-fit.test.tsx --runInBand`
  — GREEN: 2 suites / 19 tests.
- `cd app && npm run check` — PASS (exit 0): TypeScript, ESLint, Prettier; 251 suites / 3208 tests.
- `git diff --check` — PASS.
- Read-only независимое ревью: первоначальный риск исчерпания viewport крупным
  composer исправлен для целевых размеров/fontScale 2; новых важных дефектов
  не найдено. Ревью не заменяет native замеры.

## Критерии и непроверенное

- Сделано: событийное выравнивание, ожидание ручного drag/momentum,
  reduce motion/calm без анимации; компактная активная карточка, фиксированный dock.
- Сделано: расчётные fixture двух экранов, separate metadata scroll и pinned
  composer, крупный текст 1.34/2 в synthetic UI tests; ADR и обязательные документы.
- **Не проверено на iPhone**: 14 Pro/SE, фактические safe insets, Yoga/Inter переносы,
  максимальный системный шрифт, клавиатура, взаимодействие вложенных scroll/шторок,
  VoiceOver и ощущение плавности. Android и web visual comparison не выполнены.
- Открытая модальная шторка принимает ввод поверх фоновой карточки; её размер не
  вычитается повторно из скрытого фонового viewport. Геометрия шторок не изменена.
- Требует одобрения владельца: visual parity и приёмка экрана. Разрешение изменить
  раскладку по брифу не означает одобрение получившегося экрана.
- Произвольно малые viewport и неограниченный fontScale не объявляются проверенными.
  CI и общее production/offline завершение SOM-31 не проверялись этим пакетом.
- Новые изображения/снимки не создавались и не добавлялись в git.

## Передача

- `git push -u origin agent/18-som-31-workout-active-exercise-fit` — ветка опубликована.
- `gh pr create --base fix/som-50-template-picker --draft --fill` — создан
  [draft PR #83](https://github.com/anuar02/panda-trainer/pull/83), заголовок с SOM-31.
- `gh pr edit 83 --body-file /tmp/som31-pr-body.md` — критерии с отметками
  «сделано / не проверено / требует одобрения владельца».
- GitHub CI и последующее слияние выполняет внешний скрипт; здесь не объявлены зелёными.

## Интеграция координатором

Свежая база с PR #82 влита; документальные конфликты разрешены с сохранением обеих записей. ADR журнала перенумерован в 0108, поскольку 0107 уже занят шагами даты/времени. Production-код не изменён. Финальная проверка — GitHub CI на merge-коммите.
