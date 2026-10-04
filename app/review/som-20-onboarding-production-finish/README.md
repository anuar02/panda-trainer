# SOM-20 · Production onboarding finish

Дата: 04.10.2026. Ветка: `agent/03-som-20-onboarding-production-finish`.
Draft PR: [#60](https://github.com/anuar02/panda-trainer/pull/60),
`agent/03-som-20-onboarding-production-finish` → `fix/som-50-template-picker`.
База при старте: `origin/fix/som-50-template-picker` / `4c20e22`.
Один агент, без делегирования. Экраны и issue не приняты владельцем.

## Проверенный scope

Service → hook → onboarding route → welcome; существующие client read/create,
library, auth provider/storage/login и invitation writer/routes не менялись.
Реальный маршрут клиентов — `/workspace/clients`, возвращающий аккаунт —
`/auth/account`. Клиентские connections сохраняются отдельными карточками;
client-only и mixed trainer/client accounts не переводятся автоматически в setup.
Нет demo fallback при ошибке/некорректном контексте.

Сервис требует explicit expected scope и копирует actor/JWT sub/session_id,
bearer и caller signal до I/O, передаёт explicit bearer
в getUser, table reads и RPC. Subscription + getSession guards охватывают
parallel reads, completion, post-read, result/error и caller cancellation.
Refresh принимается только как TOKEN_REFRESHED той же identity; logout,
SIGNED_IN (включая same-user/same-session event), другой session_id/sub и
тихая замена credentials закрывают старую операцию. Credentials остаются
только в приватной transport/lifecycle памяти, отсутствуют в keys, RPC args,
контекстах, пользовательских ошибках и диагностике.

Profile/workspace/connection projections проходят unknown-validation UUID,
owner/actor links, nullable audit/phone fields, календарных UTC timestamps,
revision, безопасных текстов и preference/timezone fields. Connection RPC
сверяется с exact-count paginated активными client_records текущего actor:
ID, workspace и имя должны совпадать. Null/duplicate/archived/foreign rows,
несогласованные counts и лимит >10000 дают ошибку, а не пустой успех.
Pagination: 200 rows/page, deterministic ID order. Несогласованный concurrent
read честно требует retry; snapshot isolation нескольких HTTP reads не заявляется.

Hook сохраняет прежние context/loading/failed/retry поля API. Read/session,
attempt и focus generations отбрасывают поздние результаты; credentials не
входят в ключ. Completion дополнительно связан с этой generation. Route
remount и submit/leave locks не позволяют старому finally/error менять новую
форму. Welcome фиксирует первый валидный отправленный payload для ambiguous
retry, показывает локализованное пояснение о повторе исходных настроек и игнорирует completion после unmount. Итоговые имя/часы берутся из
validated server profile/workspace, включая preserved existing profile.

## SQL contract review

Новых migrations и database types нет. Реализация следует ADR 0033 и session
контракту ADR 0088; новые продуктовые/архитектурные решения не вводились.

- `20261001160000_trainer_onboarding.sql`: SECURITY INVOKER, auth.uid,
  user advisory transaction lock, profile/workspace ON CONFLICT DO NOTHING,
  optional client только после фактической вставки workspace; replay возвращает
  исходный workspace. Starter catalog — insert trigger из library migration.
- Existing `trainer_onboarding.test.sql`: 49 assertions, RLS/anonymous denial,
  normalization, preserved profile/preferences, first client repeat и rollback.
- Existing `onboarding_concurrency.py`: две реальные SQL-сессии, ожидание lock,
  один workspace/profile/client и 81 catalog rows. Изменение RPC не требуется.
- Новый `onboarding_returning_connections.test.sql`: 14 assertions на existing
  client identity, два trainer scopes, direct-read/RPC links, archived history,
  unchanged revisions, own starter catalog и повтор optional first client.
- `client_connections.test.sql`: существующие 18 assertions на privacy,
  multi-connection, archived/unlinked exclusion и auth grants.

## Команды и результаты

```sh
command -v graft
ls graft
git fetch origin fix/som-50-template-picker
git merge origin/fix/som-50-template-picker
cd app
npm test -- --runTestsByPath tests/onboarding-service.test.ts tests/onboarding-hook.test.tsx tests/onboarding-route.test.tsx
npm run check
```

`graft` executable и граф `graft/` отсутствуют: map/ask/build недоступны,
контекст получен из обязательных документов и узких source ranges.
База fetch выполнена, merge: Already up to date.
Доступного Linear connector нет: live issue/project/dependencies не прочитаны;
использованы бриф владельца и DELIVERY-PLAN. Linear не изменялся.

Focused regression run: 3 suites / 134 tests passed. Реальные service/hook/route
под synthetic auth/transport. Same-user relogin проверен на каждом I/O await
read/completion в service, на всех 18 completion I/O в hook и route.
Verified refresh проверен на всех 18 completion I/O в service и hook,
включая старый getSession snapshot после подтверждённого refresh. Есть silent credentials/sub mismatch, unknown RPC result,
exact payload retry, double tap, late success/error, unmount, focus/retry,
empty-name/days, returning trainer/client-only/multi-connection, >1 page и
malformed/foreign projections. Workflow использует настоящий WelcomeScreen,
route, hook и service, затем существующий loadWorkspaceClients; никакой mock
не доказывает реальные SQL writes, starter catalog или Auth.

Полный `cd app && npm run check`: **186 suites / 2403 tests passed**;
typecheck, lint и format:check зелёные. Existing clients/library/invitations
regressions входят в этот fresh run. `git diff --check` прошёл.

## Критерии и ограничения

| Критерий брифа | Статус |
| --- | --- |
| Atomic profile/workspace/optional client/catalog + безопасный replay | Сделано в существующем SQL; source/test contracts сверены; runtime CI pending |
| Unknown validated scoped context, fail closed | Сделано; synthetic regressions passed |
| Expected actor/sub/session_id + explicit bearer + guards/refresh | Сделано; synthetic regressions passed |
| Hook focus/scope/attempt и route submit/navigation fencing | Сделано; synthetic regressions passed |
| First trainer/setup/optional client/real clients/return/retry | Synthetic workflow passed; live/native не проверено |
| Returning trainer/client-only/multi-connection/history | Synthetic passed; новый SQL contract требует CI |
| Existing clients/library/invitations regressions | Сделано: fresh полный app check зелёный |
| Визуальный/native/accessibility parity и приёмка экранов | Не проверено; требует одобрения владельца |

SQL runtime status: **needs-local-db / CI pending**. Docker/Supabase runtime
в контейнере отсутствует. Для CI/Claude на свежей базе:

```sh
supabase start --workdir .
supabase db lint --local --fail-on warning --workdir .
supabase test db --workdir .
python3 supabase/tests/onboarding_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/invitation_concurrency.py --container supabase_db_trainerApp
cd app && npm run db:types:check
```

Existing GitHub database workflow уже запускает эти проверки и остальные
concurrency contracts; scripts/rules не менялись. Не вливать при красном CI
или неподтверждённом database job. PR остаётся draft до проверки/координации.

Не проверены real Auth/session expiry/refresh, RLS/PostgREST/SQL concurrency,
SQLite/storage crash/reopen, native keyboard/gestures, браузер, темы, крупный
шрифт, screen reader, geometry/screenshot comparison и owner acceptance.
Нет новых PNG, платных сервисов, cloud changes или реальных клиентских данных.
Retry payload здесь in-memory, disk/crash recovery не заявляется. Пять шагов,
исходные normal-state тексты/токены и `prototype-fresh/index.html` сохранены; автоматические
render tests не заменяют паритет по ADR 0007/0066.
