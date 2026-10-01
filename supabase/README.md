# Локальная база

CLI закреплён в `app/package.json`; конфигурация создана `supabase init`.
Облачный проект не требуется. PostgreSQL 17, только вымышленные данные.

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
