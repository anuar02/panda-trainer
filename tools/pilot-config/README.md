# SOM-40 public preflight

Node 22+, без зависимостей. Из корня:

```sh
cp tools/pilot-config/template.json /tmp/trainer-pilot-public.json
node tools/pilot-config/validate.mjs /tmp/trainer-pilot-public.json
node --test tools/pilot-config/validate.test.mjs
```

В копии заполнить четыре пустых public значения: `devProjectRef`, `devProjectUrl`,
`pilotProjectRef`, `pilotProjectUrl`. Это два разных **облачных** проекта с refs
из dashboard (20 lowercase alphanumeric) и соответствующими HTTPS API origins.
Локальный Supabase остаётся отдельным способом разработки; его localhost URL
не доказывает изоляцию облачного dev от pilot и сюда не подходит.
Template намеренно завершается exit 1, пока идентификаторы неизвестны.

CLI читает только явно переданный public JSON. Не читает `.env`, process.env,
ключи, credential stores, Supabase cache, DNS или API; не запускает subprocesses,
не пишет файлы и не выполняет network mutations. Не передавайте файл с секретами:
нет полей для anon/service-role keys, DB URL/password, SMTP/OAuth credentials,
invite tokens или DSN. Unknown fields отвергаются без обращения к их значениям.
При случайном secret input диагностика не выводит ни значения, ни имена неизвестных
полей, ни путь, ни parser/OS error. Произвольный текст внутри JSON всё равно
попадает в память при чтении; CLI не является сканером или vault для секретов.

Exit 0 означает только `LOCAL CONFIG VALID ONLY`; exit 1 — ошибка чтения,
синтаксиса, отсутствующее поле или несогласованная конфигурация. Нет cloud PASS.
Проверяются exact canonical invite origin/domain, matching HTTPS project origins,
разные refs, exact Auth redirects (HTTPS web и существующий native scheme), Free
choices, Frankfurt **intent**, отсутствие paid options и prototype import.
Завершающий `/` допустим только для Supabase origins. Wildcards, localhost,
другие preview origins и любые дополнительные redirects в pilot manifest отвергаются.

`databaseRegion` — желаемый регион, а не доказательство размещения. Redirect list —
целевой dashboard handoff, а не изменение auth policy или подтверждение deployment.
Срок 7 дней — требование ротации, а не выполненный backup job.
Все remote gates и настройки: [ENVIRONMENT](../../docs/app/pilot/ENVIRONMENT.md).
