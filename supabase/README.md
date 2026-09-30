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

Схема пока пустая: исходная миграция не создаёт таблиц, сид пустой.
pgTAP guard проверяет, что будущие таблицы public не остаются без RLS;
предметные политики и их тесты добавляются вместе с таблицами на этапе 2.

Новая миграция: `npm run db -- migration new <имя>`.
На изолированной локальной базе применить её с нуля: `npm run db -- db reset --local`
(удаляет локальные данные этого проекта; не использовать для сохранённых данных).
Готовые миграции в main не изменять.

URL API: `http://127.0.0.1:54321`, Studio: `http://127.0.0.1:54323`.
Для телефона заменить localhost на LAN-адрес компьютера, для Android-эмулятора —
`10.0.2.2`. Из `status` переносить в `app/.env.local` только публичный anon key.
Service role и secret key не копировать в приложение или репозиторий.

CI устанавливает CLI 2.118.0 через `supabase/setup-cli@v1`, без зависимостей приложения.
Из корня выполняются `supabase start --workdir .`,
`supabase db lint --local --fail-on warning --workdir .`,
`supabase test db --workdir .`, затем `supabase stop --workdir .`.
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
