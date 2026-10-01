# Локальная база

CLI закреплён в `app/package.json`; конфигурация создана `supabase init`.
Облачный проект не требуется. PostgreSQL 17, только вымышленные данные.

Email Auth использует шестизначный код из `templates/email-code.html`;
локальные письма перехватывает Mailpit. После запуска полного локального стека
из корня можно выполнить `python3 supabase/tests/auth_email_smoke.py --workdir .
--container supabase_db_trainerApp`: создаётся и удаляется только синтетический
пользователь `example.test`. Тест проверяет неправильный/повторный код, refresh
и local logout. Provider credentials и production SMTP не настроены.

Из `app/` после `npm ci`, с запущенным Docker:

```sh
npm run db -- start
npm run db -- status
npm run db -- db lint --local --fail-on warning
npm run db -- test db
npm run db -- stop
```

Миграция `20261001090000_identity_and_workspaces.sql` создаёт profiles,
trainer_workspaces, client_records и invitations с RLS и column grants.
Карточку читает владелец пространства или связанный клиент; менять её может
владелец. Привязка user_id и операции с приглашением закрыты для прямой записи.
Token hash не выдаётся через Data API. [ADR 0025](../docs/app/decisions/0025-identity-rls-foundation.md).

Seed: четыре вымышленных auth identities без паролей, два пространства, восемь
карточек (c1–c7 из прототипа и изолированный клиент Б), одно истёкшее приглашение
с фиктивным хэшем. Это данные для SQL-проверок, не готовый процесс входа.
Повторный запуск seed не создаёт дубликаты.

Типы: из `app/` выполнить `npm run db:types`, проверка — `npm run db:types:check`.
`SUPABASE_WORKDIR` позволяет указать изолированный каталог с конфигурацией БД.
CLI генерирует public schema, скрипт удаляет комментарии через TypeScript printer
и применяет Prettier. CI проверяет совпадение типов после миграций и pgTAP.

01.10.2026: в отдельном стеке `trainerApp-som18` (порт БД 55322) прошли reset
с миграциями/seed, повторный seed (0 вставок), db lint без warning, 32 pgTAP
проверки и совпадение типов. `app/npm run check`: 342 теста / 46 suites,
typecheck/lint/format. Существующий стек trainerApp не сбрасывался.
Удалённый CI и сценарий двух авторизованных телефонов ещё не проверены.

01.10.2026, SOM-22: `20261001100000_exercise_library.sql` и
`20261001101000_starter_catalog.sql` добавляют три таблицы библиотеки и приватный
каталог. Создание workspace копирует 81 упражнение (13 timed); существующие
пространства наполняются миграцией. Проверены все 81 записи против исходных
данных прототипа: названия, группы, инвентарь, единицы, bodyweight, aliases, инструкции.
[ADR 0026](../docs/app/decisions/0026-workspace-library.md).

Проверки в том же изолированном стеке: clean reset/seed, db lint без warning,
72 pgTAP-проверки (40 библиотеки), совпадение сгенерированных типов и app check
342 теста / 46 suites. Тесты проверяют права владельца и клиента, запрет чужой
связи, нормализацию кириллицы/пробелов, диапазон секунд, revision при изменении
состава и читаемую ссылку шаблона после архивирования упражнения.
Сценарий проверен на SQL-уровне; экраны всё ещё используют локальное хранилище.
Нет утверждения о remote CI, авторизованном телефоне или owner acceptance.

Новая миграция: `npm run db -- migration new <имя>`.

01.10.2026, SOM-27: `20261001150000_booking_status_commands.sql` добавляет
confirm_booking/cancel_booking и приватные receipts по actor/workspace/request.
Clean reset/seed, db lint без warning и 258 pgTAP (33 status commands) проходят.
Типы совпадают со схемой; app check — 342 теста / 46 suites, typecheck/lint/format.
Две SQL-сессии проверяют ожидание workspace lock, отказ устаревшей отмены и повтор:

```sh
python3 supabase/tests/booking_status_concurrency.py --container supabase_db_trainerApp
```

Runner добавлен в CI. Переносы, действие на всю группу, app transport и два телефона
не проверены. [ADR 0031](../docs/app/decisions/0031-booking-status-commands.md).

01.10.2026, SOM-28: миграция `20261001140000_workout_journal.sql` добавляет шесть
таблиц журнала. Clean reset/seed, db lint без warning и 225 pgTAP (40 журнала)
проходят. Fixtures включают незавершённый журнал с упражнениями, результатами
и открытой заметкой. Type drift и app check (342 теста / 46 suites,
typecheck/lint/format) проходят. В SQL-проверке клиент не видит строки черновика.
Проверены приватные заметки и receipts, другие workspace/участники группы, принадлежность программе
и booking одного клиента, единицы результатов, NULL/0 и упражнение без плана.
Запись пока закрыта; apply_operations, app transport и два устройства не реализованы.
[ADR 0030](../docs/app/decisions/0030-journal-read-isolation.md).

01.10.2026, SOM-24: `20261001130000_client_programs.sql` создаёт личные копии
программ и атомарную команду назначения. Clean reset/seed, db lint без warning
и 185 pgTAP (37 программ) проходят. Типы совпадают со схемой, app check — 342
теста / 46 suites, typecheck/lint/format. Проверены собственные/чужие клиенты, версии,
порядок и диапазоны, архив источника, сохранность прежней копии и закрытые записи.
Реальный конкурентный повтор создаёт одну полную копию:

```sh
python3 supabase/tests/program_concurrency.py --container supabase_db_trainerApp
```

Runner включён в CI. App transport, remote CI и решение владельца SOM-55
остаются открытыми. [ADR 0029](../docs/app/decisions/0029-client-program-snapshots.md).

01.10.2026, SOM-23: `20261001120000_template_commands.sql` закрывает прямые
записи шаблонов/строк и вводит атомарные save/archive с expected_revision и
приватным request receipt. Прошли clean reset/seed, db lint без warning,
148 pgTAP (30 библиотеки, 41 команд шаблона), type drift и app check
342 теста / 46 suites. Тела обеих применённых RPC совпадают с миграцией.
Два template concurrency-сценария проверены реальными соединениями:

```sh
python3 supabase/tests/template_concurrency.py --container supabase_db_trainerApp
```

Старая конкурентная revision отклоняется без перезаписи; одинаковый request_id
возвращает исходные ID/revision. При ошибке состава откатываются также имя и
revision. Архивное упражнение можно сохранить в прежнем шаблоне или копии.
Старые проверки прямого template CRUD заменены проверками RPC, библиотечный
тест сохраняет сценарий архива и неизменной ссылки. Оба concurrent runners
имеют statement timeout; новый runner включён в CI. Удалённый CI и серверный
UI-flow не запускались. [ADR 0028](../docs/app/decisions/0028-atomic-template-commands.md).

01.10.2026, SOM-25: `20261001110000_schedule_foundation.sql` добавляет расписание
и `create_booking_set`. Проверены clean reset, lint без warning, 117 pgTAP
(45 расписания), type drift и app check 342 теста / 46 suites. Два конкурентных
сценария подтверждают реальное ожидание блокировки workspace: разные request IDs
получают предупреждение после первой записи, одинаковый ID возвращает те же bookings.
Тест создаёт и удаляет только собственные случайные вымышленные fixtures:

```sh
python3 supabase/tests/schedule_concurrency.py --container supabase_db_trainerApp
```

Для изолированного стека этой сессии имя контейнера — `supabase_db_trainerApp-som18`.
Проверка добавлена в CI; удалённый запуск пока не выполнен. RLS скрывает чужих
участников группы, column grants не дают читать внутренний receipt. Data API
должен явно выбирать разрешённые столбцы, а не `select('*')` для bookings.
Перенос/отмена, привязка программы, app transport и два телефона ещё не проверены.
[ADR 0027](../docs/app/decisions/0027-server-schedule-foundation.md).

На изолированной локальной базе применить её с нуля: `npm run db -- db reset --local`
(удаляет локальные данные этого проекта; не использовать для сохранённых данных).
Готовые миграции в main не изменять.

URL API: `http://127.0.0.1:54321`, Studio: `http://127.0.0.1:54323`.
Для телефона заменить localhost на LAN-адрес компьютера, для Android-эмулятора —
`10.0.2.2`. Из `status` переносить в `app/.env.local` только публичный anon key.
Service role и secret key не копировать в приложение или репозиторий.

CI устанавливает CLI 2.118.0 через `supabase/setup-cli@v1`, Node 22.18.0 и зависимости
приложения (`npm ci`) для проверки генерируемых типов.
Из корня выполняются `supabase start --workdir .`,
`supabase db lint --local --fail-on warning --workdir .`,
`supabase test db --workdir .`, `npm run db:types:check` из `app/`,
затем `supabase stop --workdir .`.
Стек одноразовый, облачные секреты не нужны; лимит job — 25 минут.

Если посторонний корневой `.env.local` несовместим с dotenv, используйте отдельный
рабочий каталог, не меняя этот файл:

```sh
review_db_dir=$(mktemp -d)
ln -s "$PWD/supabase" "$review_db_dir/supabase"
app/node_modules/.bin/supabase --workdir "$review_db_dir" start
app/node_modules/.bin/supabase --workdir "$review_db_dir" db lint --local --fail-on warning
app/node_modules/.bin/supabase --workdir "$review_db_dir" test db
app/node_modules/.bin/supabase --workdir "$review_db_dir" stop
```
