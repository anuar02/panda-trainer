# SOM-26 · Исправление артефактов #88

05.10.2026. База `9cb1f5c` уже содержит бриф 21 / #89. Отдельное исправление
ошибочно влитых в #88 (`d79cef9`) снимков по ADR 0066 и RULES; история git
сохранена. Экран и SOM-26 целиком не приняты.

## Изменения

Удалены ровно 12 PNG: 6 app и 6 reference под
`app/review/20-som-26-calm-today/parity/generated/`. Также удалены пять
служебных файлов: `index.html`, `index.json`, `reference/index.json`,
`reference/spec-dark.json`, `reference/spec-light.json`. Индексы относятся
к этим шести парам; spec — локальные выборочные результаты t-today
(по 59 классов), а не канонические полные замеры (324 dark / 263 light).
Полные `prototype-fresh/review/parity/spec-{dark,light}.json` сохранены без изменений.

Исправлен исторический отчёт: ошибочное «PNG не коммитятся» явно опровергнуто,
команды/результаты #88, шесть текстовых пар и native-ограничения сохранены.
Пути generated обозначены историческими, не доступными артефактами PR.
Копия сохранена в `/tmp/som-26-calm-today-fix/generated` вне репозитория:
это временная локальная копия данного контейнера, не опубликованный материал.
Код, тесты, поведение, навигация, шапка, зависимости, migrations, скрипты,
правила и .gitignore не менялись; остальные исторические изображения сохранены.

## Команды и результаты

Из корня репозитория:

```sh
git fetch origin fix/som-50-template-picker
git rev-parse HEAD origin/fix/som-50-template-picker
git show --stat d79cef9
gh pr view 88 --json files,title,url
git show a409e10f:tools/codex-agents/RULES.md
git show a409e10f:tools/codex-agents/tasks/done/20-som-26-calm-today.md
mkdir -p /tmp/som-26-calm-today-fix
cp -a app/review/20-som-26-calm-today/parity/generated /tmp/som-26-calm-today-fix/
git rm -r app/review/20-som-26-calm-today/parity/generated
cd app && npm run check > /tmp/som-26-calm-today-fix-check.log 2>&1
```

Fetch успешен; HEAD и origin/base совпали: `9cb1f5cd6c7fc6fcfa78193dc31b6278e2282641`.
Список PR #88 и git show подтвердили 12 добавленных PNG и пять generated-файлов.
RULES и исходный бриф 20 прочитаны из истории очереди `a409e10f`.
Копирование и удаление 17 файлов успешны.

`npm run check`: exit 0; TypeScript, ESLint (0 warnings), Prettier и Jest
зелёные: **255/255 suites, 3318/3318 tests, 0 snapshots**. В Jest остаются
предупреждения существующих тестов; ошибок проверки нет.

После staging выполнены:

```sh
git diff --check
git diff --cached --check
git ls-files app/review/20-som-26-calm-today/parity/generated/
git diff --cached --name-status
npx --prefix app prettier --check app/review/20-som-26-calm-today/README.md app/review/00-som-26-calm-today-fix/README.md
```

Оба diff check: exit 0. Tracked generated: пустой вывод (0 файлов).
Список изменений: 17 удалений (12 PNG + 5 HTML/JSON) и четыре текстовых файла
(два отчёта, CHANGELOG, ROADMAP); новых PNG/бинарных снимков нет.
Дополнительная Python-проверка staged name-status подтвердила эти количества
и разрешённые пути, побайтовое совпадение обоих канонических spec с `9cb1f5c`
и сохранение всех прежних строк CHANGELOG/ROADMAP, включая бриф 21: PASS.
Формат обоих отчётов: exit 0, All matched files use Prettier code style!.

## Ограничения

Повторный capture не выполнялся и не требуется: это исправление артефактов,
а не повторное подтверждение UI. Не проверены iPhone/iOS 26, Android,
VoiceOver/TalkBack, native-паритет и визуальная приёмка владельца.
SQL/pgTAP/concurrency и database type checks в контейнере не запускались:
Docker отсутствует, migrations и база не менялись; эти проверки выполняет CI PR.
Зелёный CI #88 проверен координатором согласно брифу, здесь повторно не заявляется.

`graft` и `graft/` отсутствуют; использованы указанные в брифе пути.
Live Linear прочитан без записей: trainerApp, SOM-26 In Progress, зависимость
SOM-25 и связанная приёмка SOM-45. Задача не закрывалась, комментарии и сообщения
людям не отправлялись. Native и одобрение владельца остаются открытыми.
