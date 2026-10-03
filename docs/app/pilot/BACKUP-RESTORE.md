# SOM-40: dump, шифрование, ротация и проверяемое восстановление

Tooling по ADR 0064/0067/0070. Облако не настроено; cron выключен. Бесплатный
EU bucket не выбран и не обещан. Production restore отсутствует в workflow.

## Контракт и локальные команды

Нужны Python 3, PostgreSQL client 17 (совместимый с сервером), age и AWS CLI.
Скопировать `tools/pilot-backup/config.example.json` вне репозитория, установить
mode 0600, заполнить source/target и отдельные allowlists. Target — только отдельная
одноразовая test БД, `kind: disposable-test`; не production/dev с нужными данными.
`enabled: true` разрешает операции. Нельзя брать endpoint из DATABASE_URL;
удалить DATABASE_URL и PG* environment overrides. Прямое соединение PostgreSQL
или session pooler, не transaction pooler. Пароли вводятся без terminal echo:

```bash
umask 077
read -rs PILOT_SOURCE_PASSWORD; export PILOT_SOURCE_PASSWORD
read -rs PILOT_TARGET_PASSWORD; export PILOT_TARGET_PASSWORD
age-keygen -o /secure/path/pilot-age-identity 2>/dev/null
age-keygen -y /secure/path/pilot-age-identity
export PILOT_AGE_IDENTITY_FILE=/secure/path/pilot-age-identity
python3 tools/pilot-backup/backup.py --config /secure/path/config.json dump --output-dir /secure/path/bundles
python3 tools/pilot-backup/backup.py --config /secure/path/config.json verify /secure/path/bundles/backup-ID
python3 tools/pilot-backup/backup.py --config /secure/path/config.json verify /secure/path/bundles/backup-ID --decrypt
python3 tools/pilot-backup/backup.py --config /secure/path/config.json cleanup-local --output-dir /secure/path/bundles
python3 tools/pilot-backup/backup.py --config /secure/path/config.json retention
python3 tools/pilot-backup/backup.py --config /secure/path/config.json upload /secure/path/bundles/backup-ID
python3 tools/pilot-backup/backup.py --config /secure/path/config.json restore /secure/path/bundles/backup-ID --opt-in disposable-test
```

Последняя команда разрушительно заменяет объекты **только disposable target**.
Проверить allowlist и идентичность БД перед opt-in. Восстановление требует private
identity; обычный checksum verify не требует его. Dump использует одну согласованную
транзакцию pg_dump; проверяет exit status, readable TOC, затем encrypt и checksum.
Raw dump живёт только в закрытой temporary directory и удаляется в finally.
Manifest публикуется последним; upload скачивает оба объекта и сверяет checksum; raw dump/credentials/TOC/SQL не выводятся в лог.
Checksum определяет повреждение, но не заменяет доверие к источнику и age key.

## Покрытие и Supabase

Полный dump включает доступные роли dump объекты одной БД: application schema/data,
функции, policies/RLS, constraints, grants и ownership. Нужны права чтения всех
таблиц, включая RLS; недостаточные права должны завершать dump ошибкой. Успех CLI
не доказывает полноту application-specific restore. Перед включением сравнить
schema inventory и expected row counts с отдельным disposable restore.

[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) не сохраняет
cluster roles/tablespaces. Требуемые роли, extension versions и privileges нужно
подготовить в test target отдельно; ownership/ACL намеренно не удаляются. Managed
Supabase может запрещать восстановление системных объектов: такой отказ не скрывать. `pg_control_system` на обеих БД требует соответствующих
прав: невозможность подтвердить идентичность закрывает restore.
Auth tables/identities могут присутствовать, если доступны dump role, но перенос
рабочего входа, OAuth/provider secrets, JWT settings, session validity и связанного
managed Auth не доказан. Не обещать перенос identities как готового Auth сервиса.
[Supabase backups](https://supabase.com/docs/guides/platform/backups) не включают
Storage object bytes: metadata не восстанавливает blobs. Edge Functions, SMTP,
DNS, API keys, project settings, logs и несинхронизированные записи телефона также
не покрыты. Никакого импорта прототипа и production schema изменений.

## Storage gate и срок всех копий

Заполнить storage bucket/prefix/HTTPS endpoint/region `eu-central-1`, затем только
после evidence поставить `enabled`, `eu_confirmed`, `private_confirmed`,
`retention_confirmed: true`. Runtime проверяет bucket location, отсутствие
versioning (также отклоняет Suspended), private ACL/public-access block и отдельный
prefix lifecycle с expiration <=7 суток и abort incomplete multipart через сутки.
Storage должен поддерживать эти AWS APIs; неподдерживаемые проверки — отказ.
IAM: GetBucketLocation, GetBucketVersioning, GetBucketAcl, GetBucketPublicAccessBlock,
GetLifecycleConfiguration, ListBucket только выделенного prefix; GetObject,
PutObject/DeleteObject/AbortMultipartUpload только этого prefix; ListBucketMultipartUploads
с проверкой prefix (не прерывать другие загрузки). Без админских прав/создания bucket.
AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY — только private env или GitHub Secrets.

Владелец отдельно проверяет бесплатный тариф, EU Central для объектов/реплик/logs,
запрет публичного доступа, отсутствие versioning/object lock, deletion и multipart
семантику, server-side copies, temporary files, recovery key escrow. Существующие
копии/реплики/версии вне prefix должны быть удалены или включены в проверяемую
ротацию; хранилище с скрытыми copies дольше 7 дней непригодно.

Default retention 6 суток: объекты `LastModified <= nowUTC - 6d + 1h` удаляются;
каждый объект prefix, в том числе orphan manifest, temporary и failed upload.
Upload допускает bundle не старше часа, чтобы retry не продлевал исходный срок.
Повтор после часа — новый dump. Не настраивать 7 суток при nightly интервале.
[Lifecycle асинхронен](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html):
сам по себе он не доказывает удаление за 7 дней. Нужны проверка provider SLA,
ежедневный успешный retention и независимый контроль пропуска job/cleanup failure.
При пропуске срока — остановить пилотные записи, удалить просроченные копии и
проверить фактическое удаление до возобновления. Tooling не гарантирует работу
внешнего сервиса или cron при outage.

Dump автоматически вызывает cleanup-local для заданного output-dir. Ежедневно
запускать cleanup-local также для dedicated TMPDIR (0700): удаляются только
backup-* directories, включая прерванные backup-private-* по mtime. Symlinks
закрывают cleanup; проверить и безопасно удалить их отдельно. Локальные bundle
и скачанные копии тоже удалить до 7 суток; использовать disposable encrypted disk
или tmpfs. SIGKILL/сбой ОС может обходить finally: проверять temporary каталоги
`backup-private-*`, локальные bundles и downloaded copies после сбоя; не использовать
долгоживущий runner. GitHub hosted runner удаляется после job; always cleanup —
дополнительная защита, не доказательство физического удаления провайдером.

## GitHub Actions: включение только после gate

`pilot-backup.yml`: manual dispatch и закомментированный nightly cron 01:17 UTC,
`pilot-backup` environment, permissions contents:read, общий concurrency без
отмены текущего backup, 25 минут. Никаких artifacts/caches dump. Private key в backup
workflow не нужен. `pilot-restore-verify.yml`: отдельный manual synthetic-only job,
две независимые PostgreSQL 17 service БД, ephemeral age key, 20 минут, без pilot secrets.

Перед включением владелец:

1. Подтверждает pilot source EU Central, отдельный disposable target и allowlist.
2. Проверяет storage gate выше, тариф Free, quotas и client/API compatibility.
3. Создаёт environment `pilot-backup` с protected deployment branch и reviewers;
   workflow запускается только с review доверенного commit, доступ к secrets ограничен.
4. Добавляет Secrets `PILOT_BACKUP_CONFIG`, `PILOT_SOURCE_PASSWORD`,
   `PILOT_STORAGE_ACCESS_KEY_ID`, `PILOT_STORAGE_SECRET_ACCESS_KEY`; config без паролей.
   Variable `PILOT_BACKUP_ENABLED=true` ставит последней. Target password/private age
   key не добавляет в этот workflow. Private key хранит отдельно и проверяет recovery.
5. Запускает ручной синтетический workflow и локальное восстановление разрешённого
   pilot dump в disposable target. Проверяет schema/RLS/functions/roles/row counts,
   coverage gaps и срок удаления; evidence без PII хранит в review report.
6. Только после успеха и одобрения включает commented schedule отдельным review PR
   в default branch. Проверяет пропущенные ночи, expiry и регулярный owner restore
   не реже недели; synthetic workflow не заменяет проверку последнего pilot backup.

GitHub artifact/runner или строка `region` не доказывают EU residence. До gate никакие
реальные клиентские данные не используются. Юридическое подтверждение ADR 0064
остаётся отдельным prerequisite.

## Синтетическое реальное восстановление владельцем

Harness отказывается работать с обычным Supabase project DB, populated public/auth
schemas или non-local fixture source. Нужны две пустые superuser scratch БД. Например,
на машине владельца с Docker (команды здесь **не выполнены**):

```bash
docker run -d --rm --name som40-source -e POSTGRES_PASSWORD=synthetic-only -e POSTGRES_DB=som40_source -p 127.0.0.1:55431:5432 postgres:17
docker run -d --rm --name som40-target -e POSTGRES_PASSWORD=synthetic-only -e POSTGRES_DB=som40_target -p 127.0.0.1:55432:5432 postgres:17
```

Подождать pg_isready. В копии config поставить enabled true, fixture_source true,
host `127.0.0.1`, user `postgres`, source port55431/database som40_source,
target port55432/database som40_target/kind disposable-test, те же endpoint в
allowlists; age recipient свой. Storage оставить disabled.

```bash
export PILOT_SOURCE_PASSWORD=synthetic-only
export PILOT_TARGET_PASSWORD=synthetic-only
export PILOT_AGE_IDENTITY_FILE=/secure/path/pilot-age-identity
python3 tools/pilot-backup/restore_harness.py --config /secure/path/synthetic.json --opt-in disposable-test
docker stop som40-source som40-target
```

Для локального Supabase сначала `app/node_modules/.bin/supabase start --workdir .`.
Не направлять harness на его `postgres` БД: там auth/storage и migrations. Только
новые scratch databases с явным allowlist/fixture_source на localhost и разными
database/cluster identity, superuser, не существующая dev/pilot DB. Harness
проверяет pg_control_system и database oid, создаёт отдельную NOLOGIN fixture role
в обеих БД (pg_dump не переносит roles), fixture schema, RLS и synthetic rows;
дважды выполняет dump/encrypt/decrypt/restore и SQL assertions. Restore также требует чтения pg_control_system на source/target;
если managed permissions не позволяют подтвердить идентичность, операция закрывается. Для проверки
managed Supabase нужен отдельный план восстановления доступных системных schemas,
не обход запретов harness. Локальные shell mocks проверяют orchestration/failures;
они не доказывают реального восстановления PostgreSQL/Supabase.
