# SOM-40 · Ночной бэкап пилота и проверяемое восстановление

Linear: https://linear.app/something-great/issue/SOM-40/podgotovit-soglasovannoe-okruzhenie-pilota-i-vosstanovlenie

## Контекст

Решения SOM-51/52/53/59 уже в базе, последнее 2ccc2d0, ADR 0067:
только Free, собственный ночной pg_dump и регулярная проверка восстановления,
регион EU Central, ротация не позднее 7 дней. SOM-30 уже влита PR #28;
пакет не зависит от новых изменений журнала. Work параллельно
готовит мониторинг, personal — конфигурацию пилота. Это tooling, не доказательство
готового облака. GitHub artifact сам по себе не доказывает регион EU Central.

## Критерии

- [ ] Реализовать tools/pilot-backup/ для dump/verify/restore с явным allowlist
  пилотного source и отдельного disposable restore target. Не доверять случайному
  DATABASE_URL. Проверять source != target; destructive restore требует явного
  локального opt-in и допускает только test target. Production restore не запускать.
- [ ] Dump с согласованным snapshot, проверкой завершения, checksum/manifest без
  секретов; шифрование до передачи, private configurable EU-compatible storage.
  Учитывать Supabase Auth/RLS/functions/roles/schema coverage и ограничения pg_dump:
  не обещать перенос identities/storage blobs/settings, если они не покрыты.
- [ ] Отдельный manual и nightly GitHub Actions workflow, concurrency, least
  privilege, bounded timeout. По умолчанию fail closed до конфигурации environment,
  secrets и подтверждённого EU storage. Не публиковать dump как обычный artifact,
  не писать credentials/PII в вывод; ключи только Secrets. Не включать работающий
  schedule для неконфигурированного проекта, явно описать gate включения.
- [ ] Ротация ограничивает срок любых копий до 7 дней, включая неудачные/temporary
  файлы; тестировать границы UTC, повтор/сбой загрузки, checksum mismatch и cleanup.
  Возможности storage проверяются отдельно; не выдумывать бесплатный EU bucket.
- [ ] Restore verification harness: синтетический dump, независимая целевая БД,
  schema/RLS/row counts/representative constraints и повтор; команды для владельца
  Docker/Supabase, честно отделить shell mocks от настоящего восстановления.
  Не изменять production schema и не импортировать прототип.
- [ ] Meaningful automated tooling tests для отказов и безопасности, shell syntax,
  workflow validation доступными средствами; cd app && npm run check. Отчёт
  app/review/som-40-pilot-backup/README.md с командами, результатами, coverage,
  настройками включения и тем, что остаётся неподтверждённым.

## Границы

Только новые tools/pilot-backup/, .github/workflows/pilot-backup.yml,
.github/workflows/pilot-restore-verify.yml, docs/app/pilot/BACKUP-RESTORE.md,
app/review/som-40-pilot-backup/README.md, минимальные CHANGELOG/ROADMAP и новый ADR.
Не менять app код/config/dependencies, SQL/migrations, auth/outbox/preload,
существующие workflows, privacy документы, конфигурацию personal и monitoring work.
Не менять tools/codex-agents/ правила/скрипты. Ветка agent/som-40-pilot-backup.

## Разделение работы

Third: до трёх субагентов по tools/codex-agents/SUBAGENTS.md; если файла нет,
чистые контексты и исключительное владение. Ведущий сначала фиксирует интерфейсы.
Независимые части: dump/encryption/storage; restore verification; failure/retention
тесты. Shared workflow/docs интегрирует ведущий и запускает полный check.

## Источники

AGENTS.md, app/AGENTS.md, docs/app/{README,CONVENTIONS,DELIVERY-PLAN,ROADMAP,
OPEN-QUESTIONS,PROJECT-MEMORY,ARCHITECTURE,UI-PARITY}.md; ADR 0007/0064/0067,
supabase/README.md, действующие конфигурации и .github/workflows/app.yml.
Проверяй актуальные пути и существующие решения перед реализацией.

## Общие требования

База fix/som-50-template-picker, текущий commit 08f0251. Draft PR только в эту базу, заголовок с SOM-40.
Не менять Linear, не задавать вопросов, не отправлять сообщения людям.
CHANGELOG и ROADMAP — минимальные записи без объявления SOM-40 завершённой.
Новый архитектурный выбор — отдельный ADR с незанятым номером и descriptive filename.
app код без комментариев/any, строки интерфейса через i18n; новые PNG запрещены.

## Чего нельзя проверить в контейнере

Нет Docker, локального Supabase, браузера, iOS/Android устройств. Облачные
учётные записи, DNS, SMTP, реальные бэкапы/восстановление и remote telemetry
не считать проверенными. Не создавать сервисы, не деплоить, не подключать платные
тарифы, не использовать реальные данные клиентов и не запускать production workflow.
Только синтетические fixtures и локальные проверки. Не объявлять экраны принятыми.
