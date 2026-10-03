# SOM-39 — спокойный интерфейс, крупный текст и движение

03.10.2026. Реализация подготовлена для ревью; экраны не приняты владельцем.
Эталон: `prototype-fresh/index.html` без параметров, 390 × 844, палитра «Чернила».
[ADR 0060](../../../docs/app/decisions/0060-calm-mode-and-accessible-motion.md).

## Критерии

| Критерий                      | Результат                                                                                                                            | Осталось                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Calm mode в обоих профилях    | Сделано: switch, раздельное сохранение по роли, восстановление после reload, видимая ошибка хранения                                 | Одобрение владельца на устройствах                                                         |
| API для SOM-38                | Сделано: `useCalmMode`, `useCalmModePreference`, `useCelebrationsEnabled`                                                            | SOM-38 должен подключить флаги к своему компоненту; маскот/ассеты не изменены              |
| Системное уменьшение движения | Сделано: AccessibilityInfo read/event, защита от позднего чтения, ReduceMotion.System в withTiming и System/Always в Sheet           | iOS/Android и переключение во время нативного движения не проверены                        |
| Крупный текст до 200%         | Сделано: adaptive layout Today/журнала, растущие поля, доступные через прокрутку действия, переносы в dock; render-тесты 134% и 200% | Нативная проверка clipping/перекрытий, клавиатура и одобрение владельца                    |
| Функциональное движение       | Сделано: feedback записи 200 ms, смена упражнения/появление 600 ms, sheet 420 ms; curves из default spec                             | Нативная длительность/кривые не измерены; эффект записи требует одобрения (OPEN-QUESTIONS) |

Calm mode скрывает существующие изображения Today и кнопки голоса журнала.
Будущие празднования запрещены при calm и до гидратации настройки. Функциональные
кнопки работают независимо от движения. Другие места будущего маскота — SOM-38.
Новые празднования/компонент маскота, picker/конструктор, расписание и схема БД
не реализовывались и не изменялись.

## Команды и результаты

Из корня репозитория, Node 22.23.3:

```sh
cd app
npm run check
npm run export
```

- `npm run check`: **1220 tests / 124 suites**, TypeScript, ESLint и Prettier зелёные.
- `npm run export`: Android, iOS и web экспортированы в `dist`.
- `git diff --check`: зелёный.
- `graft map`: command not found; каталога графа нет, refresh не выполнялся.
- Live Linear: прочитаны проект и SOM-39 с relations; Todo, blocking dependencies
  отсутствуют, duplicateOf отсутствует. Linear не изменялся, сообщения не отправлялись.
- `command -v adb` / `command -v xcrun`: отсутствуют; native screenshots не получены.
- DB checks не запускались: схемы/RPC/данные не менялись.

Минимальные исправления исходного checkpoint, необходимые для зелёного check:
неподдерживаемый `hovered` в типе Pressable callback убран из общей кнопки;
в двух существующих тестах billing/purchase добавлены non-null assertions;
пунктуация строки истории оплаты перенесена внутрь expression без изменения
текста/логики. Новая бизнес-логика billing не добавлялась.

## Снимки и воспроизведение

[24 пары стандартного размера](parity/index.html): Today, journal и оба профиля;
auto normal/empty/loading/offline, dark/light normal. Состояния как в существующем
прототипе, metadata в [index.json](parity/index.json). Результат runner: 24 reference + 24 app captures, 0 missing route/state comparisons,
0 runtime errors. Это не подтверждает pixel parity или одобрение владельца.

[Web-симуляция крупного текста](large-text/report.json): 390 × 844, 134%/200%,
обычный/calm, верх экрана, действия и редактирование подхода. Это **не системный
fontScale устройства**: только для проверки в браузере response перезаписывает
четыре значения RN Web Dimensions (RN Web всегда возвращает fontScale 1), затем
увеличивает рассчитанные font-size/line-height текстовых узлов. Production bundle
и прототип на диске не изменяются. Скрипт проверяет runtime errors и выход текста
по горизонтали; вертикальное обрезание и нативный layout автоматически не доказаны.
Визуальный просмотр выявил узкую колонку подсказки; она исправлена перед финальными
снимками. Финальный capture runner: 8 симуляций, 0 runtime errors/горизонтальных выходов текста;
в каждой calm-сцене 0 изображений, в обычной 1. Запись и редактирование через sheet
сохраняют значение; кнопка сохранения достигается прокруткой при 200%.
Проверка профиля после reload — [profile-report.json](large-text/profile-report.json).

Подготовка браузера:

```sh
npm ci --ignore-scripts
npx playwright install chromium
```

В этом Debian ARM64 контейнере отсутствовали системные зависимости Chrome и sudo.
Они распакованы только в `/tmp`; системные пакеты не устанавливались:

```sh
mkdir -p /tmp/som-39-apt-lists/partial /tmp/som-39-apt-cache/archives/partial /tmp/som-39-browser-deps /tmp/som-39-browser-runtime
apt-get -o Dir::State::lists=/tmp/som-39-apt-lists -o Dir::Cache=/tmp/som-39-apt-cache update
cd /tmp/som-39-browser-deps
apt-get -o Dir::State::lists=/tmp/som-39-apt-lists -o Dir::Cache=/tmp/som-39-apt-cache download libnss3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxcomposite1 libxdamage1 libxrandr2 libxfixes3 libcups2 libdrm2 libpango-1.0-0 libcairo2 libnspr4 libatspi2.0-0 libxkbcommon0 libdbus-1-3 libavahi-common3 libavahi-client3 libwayland-server0 libxi6
for package in ./*.deb; do dpkg-deb -x "$package" /tmp/som-39-browser-runtime; done
```

Из корня репозитория:

```sh
LD_LIBRARY_PATH=/tmp/som-39-browser-runtime/usr/lib/aarch64-linux-gnu:/tmp/som-39-browser-runtime/lib/aarch64-linux-gnu NODE_OPTIONS=--require=/home/node/repo/app/review/som-39/use-full-chromium.cjs SCREENS=t-today,t-session,t-profile,c-profile PARITY_OUTPUT=app/review/som-39/parity node app/scripts/parity.mjs
LD_LIBRARY_PATH=/tmp/som-39-browser-runtime/usr/lib/aarch64-linux-gnu:/tmp/som-39-browser-runtime/lib/aarch64-linux-gnu node app/review/som-39/capture-large-text.mjs
```

`use-full-chromium.cjs` выбирает уже установленный полный Chrome в headless mode;
окна браузера не открываются. В обычном окружении с установленными библиотеками
LD_LIBRARY_PATH не нужен; абсолютный NODE_OPTIONS заменяется на путь checkout.

## Чек-лист UI-PARITY §6

- [x] Web пары по 4 экранам, темам и состояниям сняты.
- [x] Длительность шторки проверяется против spec-dark/light.json тестами.
- [x] Тексты экранов не переосмыслены; новая ошибка persistence через i18n.
- [x] Есть рендер и web simulation при крупном тексте, calm/reload проверки.
- [ ] Полная сверка каждой пары по типографике, цветам, радиусам, теням и отступам.
- [ ] Нативные изображения iOS/Android и полный сценарий с клавиатурой/жестами.
- [ ] VoiceOver/TalkBack, системный fontScale до 200% и реальная смена Reduce Motion.
- [ ] Одобрение владельца. UI-PARITY статусы экранов не повышались.

Тесты используют небольшой JS mock Reanimated; реальный native timing и UI-thread
они не проверяют. Размещение и движение Sheet в браузере не равны нативной приёмке.

## Публикация и внешнее ограничение

Реализация закоммичена: `28d1f6e187697ab744b52ebe24d024b666e4c390`.
Ветка `agent/som-39-calm-ui-large-text-motion` опубликована в origin. Первый push
оборвался с GnuTLS/RPC rewind; после проверки отсутствия удалённой ветки успешно
выполнено:

```sh
git -c http.postBuffer=52428800 -c http.version=HTTP/1.1 push -u origin agent/som-39-calm-ui-large-text-motion
```

Draft PR **не подтверждён**: первый `gh pr create --base fix/som-50-template-picker
--draft --fill` не завершился и был остановлен; повтор с HTTP/1.1 ограничен
45 секундами и завершился timeout. GET pulls через gh/urllib и POST создания через
`gh api --method POST .../pulls --input /tmp/som-39-pr.json` тоже завершились
timeout. Ответа с номером/URL PR не получено. Последняя проверка
`git ls-remote origin 'refs/pull/*/head'` не нашла pull-ref этого коммита;
отдельный ls-remote подтвердил опубликованный head ветки. Не считать PR созданным
на основании отправленного запроса. Все зависшие gh-процессы остановлены.

[Готовое описание PR с критериями и ограничениями](PR.md) сохранено для повторения
после восстановления API. Перед повтором проверить существующий PR по head,
поскольку результат запросов с timeout нельзя трактовать как гарантированный
отказ сервера. Команда публикации:

```sh
gh pr create --base fix/som-50-template-picker --draft --title 'SOM-39: Add calm mode, scalable workout layouts and accessible motion' --body-file app/review/som-39/PR.md
```

CHANGELOG пока ссылается на отчёт вместо отсутствующего подтверждённого PR URL.
Это внешнее ограничение не закрывает приёмку SOM-39.
