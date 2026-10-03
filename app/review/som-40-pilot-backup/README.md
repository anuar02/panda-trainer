# SOM-40 · Pilot backup tooling — 03.10.2026

Base `fix/som-50-template-picker`, commit `08f0251`; work branch
`agent/som-40-pilot-backup`. Это tooling package, SOM-40 не объявлен завершённым.
Никаких cloud services, production workflows, real client data или платных тарифов
не использовано. App code/config/dependencies, SQL/migrations и существующие
workflows не менялись. Linear не изменён; callable Linear tools недоступны,
live project/issue/relations не прочитаны. Scope взят из брифа и DELIVERY-PLAN.
`graft` и индекс `graft/`, `tools/codex-agents/SUBAGENTS.md` отсутствуют; три
субагента работали с чистыми контекстами и отдельным владением файлами.

## Реализовано

- Explicit endpoint source/target allowlists; target только disposable-test;
  source != target, включая live cluster system identifier/database oid перед
  restore. DATABASE_URL/PG overrides запрещены; credentials не передаются argv.
- Single-database consistent custom pg_dump, exit/warnings/TOC checks, age encryption
  до upload, manifest/checksums без SQL/credentials/PII; timestamp до начала dump.
- Verify ciphertext и отдельный deep decrypt/hash/TOC; destructive restore только
  explicit local opt-in, clean/if-exists/exit-on-error/single-transaction. Actions
  restore разрешён только с local synthetic fixture_source.
- Fail-closed S3-compatible adapter: Frankfurt region, owner confirmations, private
  ACL/public access block, unversioned bucket, prefix lifecycle/multipart gate.
  Upload проверяется скачиванием и checksum обоих объектов, manifest последним.
- UTC prefix cleanup всех objects (включая failed/temporary), bounded fresh retry,
  multipart cleanup и local bundle cleanup; закрытые temporary directories/finally.
- Отдельные backup/nightly и manual synthetic restore workflows: contents:read,
  checkout pinned SHA/persist-credentials false, concurrency, 25/20 минут,
  no dump artifacts, Secrets только в gated environment; nightly cron выключен.
- Синтетический harness: две scratch БД, fixture role bootstrap, два цикла
  dump/encrypt/decrypt/restore, schema/functions/rows/representative constraints,
  grants/RLS (owner1/owner2/anonymous). Это не перенос managed Supabase Auth.
- [Runbook](../../../docs/app/pilot/BACKUP-RESTORE.md) и
  [ADR 0070](../../../docs/app/decisions/0070-encrypted-pilot-backup-and-disposable-restore.md)
  описывают coverage, storage/retention evidence и gate включения.

## Команды и результаты

```bash
bash tools/pilot-backup/test.sh
/tmp/som40-validation/shellcheck-v0.11.0/shellcheck tools/pilot-backup/*.sh
PATH="/tmp/som40-validation/shellcheck-v0.11.0:$PATH" /tmp/som40-validation/actionlint .github/workflows/pilot-backup.yml .github/workflows/pilot-restore-verify.yml
python3 tools/pilot-backup/backup.py --help
python3 tools/pilot-backup/restore_harness.py --help
cd app && npm run check
git diff --check
```

Shell syntax и Python AST checks проходят. Offline unittest suite: **49 tests**, все проходят. ShellCheck 0.11.0 и actionlint
1.7.7 (включая inline shell scripts) проходят. Инструменты скачаны во временный
`/tmp/som40-validation`, app dependencies не изменены. PostgreSQL client setup
использует [официальный PGDG apt repository](https://www.postgresql.org/download/linux/ubuntu/),
потому что Ubuntu 24.04 runner содержит другой major PostgreSQL. Установка пакетов
и сами workflows в GitHub здесь не запускались.

Полный app check: **1430 tests / 142 suites**, TypeScript strict, ESLint и Prettier
проходят. UI не менялся; screens/native/browser/parity/owner acceptance не проверялись.

Offline tests проверяют отказ конфигурации и secrets/argv/output, совпадение endpoint
и live identity, opt-in, corrupted manifest/cipher/plaintext/upload readback,
failed dump/upload cleanup и retry, UTC cutoff/pagination, versioning/lifecycle,
multipart cleanup, synthetic scratch gates и порядок mutations, два mock restore
цикла. Mocks не являются доказательством pg_dump/age/PostgreSQL restore/storage.

## Требует проверки и одобрения владельца

1. Pilot source EU Central и права dump role (включая Auth/RLS), target roles/extensions
   и доступ к pg_control_system; ошибки доступа не обходить.
2. Частное бесплатное EU Central storage: тариф, region/replicas/logs, APIs, strict
   deletion <=7 days для всех copies/temporary/multipart и outage procedure.
   Lifecycle асинхронен; GitHub artifact/location response сами не доказывают region
   или physical deletion. Cron delay/outage требует независимого контроля.
3. Gated GitHub environment/branch protection/reviewers, Secrets, age recovery key;
   manual backup/upload и настоящий disposable restore последнего pilot dump.
4. Регулярный owner restore не реже недели и daily retention gap <=24h. Ночной
   schedule включается отдельным review только после gate. В этом PR он выключен.
5. [Docker/Supabase команды владельца](../../../docs/app/pilot/BACKUP-RESTORE.md)
   выполнить на отдельной машине. В контейнере нет Docker, local Supabase,
   PostgreSQL clients, age/AWS CLI; настоящие dump/encryption/restore не проверены.
   Auth identities/service settings, global roles, storage blobs и Edge Functions
   не обещаны как переносимые. Production schema не изменяется.
6. Юридическое подтверждение ADR 0064, облачные аккаунты/DNS/SMTP/telemetry,
   устройства и готовность всего пилота остаются вне этого package.

## Итог интеграции

49 tooling tests, shell syntax/AST, ShellCheck/actionlint и app check зелёные.
Diff scope проверен перед commit; результаты относятся только к локальному
tooling и regression check приложения. Никаких assertions о готовом
облаке, production restore или принятом экране.
