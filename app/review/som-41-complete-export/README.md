# SOM-41 · Пользовательский экспорт server + local

04.10.2026. Ветка `agent/02-som-41-complete-export`, PR в
`fix/som-50-template-picker`. SOM-41 целиком не закрыта; удаление аккаунта и
публикация политики не входят в этот пакет. Приёмка экранов — владельцем.

## База и ограничения окружения

Сначала выполнены `graft map` и проверка executable: `graft` и каталог `graft/`
отсутствуют. Поэтому контекст прочитан из обязательных документов и текущих
модулей. `tools/codex-agents/SUBAGENTS.md` также отсутствует; три исполнителя
получили свежие узкие контексты и исключительное владение collector/adapters,
delivery/UI и tests. Ведущий владеет pending reader, integration/docs/check.

`git fetch origin fix/som-50-template-picker` первоначально подтвердил базу
`2e02b6a`, затем подтянут merged correction PR #56 (`c294b2f`) через
`git merge --ff-only origin/fix/som-50-template-picker`. Новые существующие
correction pending/applied fields учтены read-only. Невлитые finish/correction API
из других веток не использовались. Затем подтянута база `40ece81` со слитыми
finish PR #59 и library PR #58; новые exact finish fields и gap exercise pending
учтены, export ADR перенумерован на свободный 0092. Live Linear SOM-41/SOM-32 и проект прочитаны,
поиск экспорта не выявил отдельного дубликата SOM-41. Linear не изменялся.

Docker, Supabase runtime, браузер и нативные устройства здесь недоступны.
Существующие migrations не изменены; SQL schema/RPC этим пакетом не добавлены.

## Контракт и охват

`panda-trainer-account` v2 сохраняет исходный server v1 и manifest sources/gaps.
Серверное покрытие означает только allowlisted collections реально прочитанной
`export_trainer_workspace`, включая архивы, originals и точные decimal strings.
Изолированные server/local v1 контракты сохраняются.

| Источник | Реализация / предел |
| --- | --- |
| Server workspace | Existing owner RPC, explicit captured bearer, validated v1 |
| SQLite outbox/local entries | Existing PR51 `scopedSnapshot`, все rows/confirmed receipts; default 10 000 rows / 4 MiB / pages 100 |
| Local exact schemas | Typed operation/result, actual EntryWorkout nested schema и journal row schemas; unknown/foreign/malformed записи omitted с gap |
| Server conflicts/correction drafts | Scoped owner RLS SELECT с explicit bearer, pages 100, предел 10 000; обе версии, applied metadata и resolve context без apply |
| Scheduling pending | Existing booking/status/reschedule readers |
| Billing pending | Existing strict read API; exact money strings |
| Program/correction pending | Bounded AsyncStorage key enumeration, exact account/workspace prefix, existing strict per-ID readers |
| Library exercise pending | Нет публичного read API: unknown gap; scoped raw keys участвуют в fingerprint |
| Library drafts/pending-clear | Existing scoped AsyncStorage API и decoder, exact nested allowlist, raw UTF-8 JSON сохраняется |
| Preload/recovery/entry resources/drafts | Нет exhaustive public scoped enumeration API: явные unknown/gaps |
| Provider memory/forms, demo, theme/calm | Нет exhaustive account-scoped export API: unknown/gaps |
| Auth/invitation bearer storage | Intentionally excluded; invitation peek может мутировать malformed данные и не вызывается |
| Operational server receipts/revision history, logs/backups/other devices | Явные gaps; полного backup не заявляем |

Каждый pending source ограничен 5 s, bounded collector reads — 15 s; auth/RPC/file
имеют deadlines. Envelope ограничен 12 MiB UTF-8. Overflow не даёт silently
truncated success. Неизвестные payload не становятся projection через cast.
Credentials, bearer invitation URLs и unsafe free text отвергаются.

## Согласованность и доставка

`globalAtomicity: unknown`, `status: incomplete` всегда. Scoped exclusive SQLite
transaction не является barrier для других connections, server save/ack и
AsyncStorage. Наблюдаемое содержимое сравнивается после подготовки, до/после
asynchronous file шагов и после результата. SHA-256 SQLite/pending fingerprints
учитывают также withheld unsafe raw records, не выдавая их содержимое.
Server сравнивается без меняющегося `exported_at`. Snapshot ID и последовательные
равные чтения не доказывают отсутствия промежуточной записи/ABA.

Session/workspace/JWT sub/session_id фиксируются до RPC dispatch; same-user
SIGNED_IN, refresh, logout, wrong JWT, unmount и поздние результаты обесценивают
caller. Timeout не требует ожидания бесконечного auth guard. Writers не менялись.

Delivery receipt связывает SHA-256 точного JSON/UTF-8 byte count, account/workspace,
session и snapshot с `saved` или `shared`. Это historical adapter-reported outcome;
freshness и globalAtomicity неизвестны. Shared не подтверждает save получателем.
Cancelled/unsupported/storage/share/cleanup различаются; cleanup failure не даёт
успешного receipt. Runtime readback bytes/OS save здесь не проверены.

Никаких deletion authorization, ack proof, purge, очистки pending/rejected/conflicts
или auto logout. Юридическая policy не меняется.

## Проверки

На свежей базе `40ece81` (finish PR #59 + library PR #58):

```sh
cd app && npm run check
```

Exit 0: TypeScript, ESLint с нулём warnings, Prettier и **204 suites / 2537 tests**
прошли. Полный лог локально: `/tmp/som-41-check-fresh.log` (не коммитится).
Первый integration check останавливался на unused helper заморозки envelope;
helper подключён, свежий полный check выше выполнен после исправления и
интеграции новой базы.

```sh
cd app && npx eslint tests/account-export tests/account-local-export/retention-regression.test.ts --max-warnings=0
cd app && npx jest --runInBand tests/account-export tests/account-local-export/retention-regression.test.ts tests/workout-sync-scoped-snapshot.test.ts tests/workout-sync-snapshot-validation.test.ts
git diff --check
```

Фокусный aggregate до двух последних input-mutation regressions: 16 suites /
251 tests, exit 0; две добавленные регрессии проверены service/controller
командой (45 tests, exit 0) и включены в финальные 2537 tests. `git diff --check`
прошёл. SQL/pgTAP/concurrency команды не исполнялись: migration changes отсутствуют.

Independent synthetic regression suites проверяют 151 scoped операций с confirmed
receipts (applied/error/conflict/correction), UTF-8/точные units/null/zero,
SQL-shaped current/incoming/correction context, cap 50 при 151 rows, bounded
query/auth/open/late-close, orphan receipts, withheld raw changes при одинаковых
counts, pending sources/gaps и foreign keys, malformed/precision/size errors,
finish originals/history, late rejected RPC, mutable caller inputs,
writer/ack/server changes до/во время file, wrong JWT/relogin/refresh/unmount,
неверные snapshot/hash evidence и save/share/cancel/cleanup failures.

Фокусные и полные Jest проверки используют синтетические transport/storage/file
seams; они не доказывают реальные Auth, SQLite/WAL/concurrent connections,
browser/native UTF-8 save/share, crash/reopen или SQL/RLS.

## Критерии и последующая проверка

- Реализовано: единый пользовательский flow, manifest/gaps, bounded allowlisted
  reads, lossless known raw data, tenant/identity guard, delivery receipt и
  независимые regression tests.
- Не проверено: реальные SQLite/SQL/Auth/file/share/crash/reopen, два устройства,
  server concurrent writes, visual/native/accessibility/parity. SQL runtime
  existing migration/test suites выполняет CI; новые SQL changes не нужны.
- Требует одобрения владельца: настройки экспорта и отображение coverage во всех
  темах/состояниях, большой шрифт и parity по UI-PARITY §6. Новые PNG не добавлены.
- Открыто: юридическое review, общий client account/двойная роль, backup/Auth
  deletion gates по ACCOUNT-DELETION-HANDOFF; deletion/policy publication отдельно.
