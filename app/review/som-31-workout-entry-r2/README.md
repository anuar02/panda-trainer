# SOM-31 · Production ввод подходов: reconciliation r2

Implementation commit: `41cb21b`. [Draft PR #42](https://github.com/anuar02/panda-trainer/pull/42),
base `fix/som-50-template-picker`; самостоятельного вливания нет.

Ветка: `agent/som-31-workout-entry-r2`. Свежая база:
`fix/som-50-template-picker`, `96db40a`. Полный пакет сохранённой ветки
`origin/agent/som-31-workout-entry` (`ec6b5bb`) перенесён merge без конфликтов,
включая coordinator integration, ADR 0075 и базовые RPC signatures.
[Первичный отчёт](../som-31-workout-entry/README.md) сохранён без изменений;
PR #38 закрыт без вливания. PR #34 уже MERGED по GitHub read-back;
его SQL/Expo исправления не копировались.

`graft` executable, `graft/` и `tools/codex-agents/SUBAGENTS.md` отсутствуют.
Три субагента работали с чистыми контекстами и исключительным владением файлами:
domain reconciliation, независимые service/hook regressions, SQL fixture review.
Общий app check запускал ведущий. Доступного Linear-коннектора нет: live проект,
SOM-31, статусы и relations в этой сессии не обновлены чтением. Критерии взяты из
брифа и DELIVERY-PLAN. Linear не изменялся; сообщения людям не отправлялись.

## Результат и критерии

| Критерий | Результат |
| --- | --- |
| current receipt → серверный original, отвергнутая replacement исчезает | Сделано: retention требует actual pending/issues, не revision > 0 или одной replacedFromId |
| incoming, unresolved/rejected и зависимые pending | Сделано: incoming берётся из server snapshot; нерешённые/rejected остаются; pending set сохраняет отсутствующий parent и свои данные |
| Серверные отсутствующие sets/tombstones | Сделано: unprotected set больше не воскресает; deletion watermark блокирует stale revision, более новая restoration принимается |
| Обе audit conflict версии | Локальные projection/операции/receipts не purged; обе кешированные conflict версии переживают offline reopen. Серверная сохранность требует SQL/runtime проверки существующего ADR 0062 seam |
| refresh → offline reopen и изоляция | Сделано: свежий context сохраняется существующим scoped preload store, читается при reopen; fencing включает workout и account/workspace/session/token |
| Focus/«Как в прошлый раз»/шторка/undo/null/zero/exact grams/reps/seconds | Полный исходный пакет сохранён; app tests. Native/visual/accessibility требуют проверки и одобрения владельца |
| Три участника и изолированные drafts/program/approaches/pending | Исходные fixtures/tests сохранены и входят в check; реальные устройства/reopen/crash не проверены |
| Immutable booking assignment preparation | Новая `20261003150000_prepare_workout_journal.sql` сохранена; additive RPC signature, без прямого INSERT приложения. 32 pgTAP assertions и concurrency harness подготовлены; SQL не запускалось |
| Journal-only add/replace и durable retry | Сохранено через saveJournalEntry/outbox/apply_operations; template/client program не меняются |
| Private notes и client visibility | Клиентские экраны/политики не менялись; подготовлены SQL fixtures owner/client/finished/private notes, runtime не проверен |
| Finish/correction | SOM-32 остаётся отдельной задачей, фиктивного успеха нет |

ADR: [0075](../../../docs/app/decisions/0075-booking-snapshot-journal-entry.md).
0073/0074 сохраняют назначения deletion/export. `apply_operations` и
`export_trainer_workspace` имеют по одной базовой signature; только
`prepare_workout_journal` добавлена вручную. Generated drift не проверен.
Все migrations до `20261003140000` включительно совпадают с базой; новая
migration имеет timestamp строго позже. Новых PNG нет. Package versions/lock,
export/deletion/profile/auth/billing/client/template/mascot/picker не менялись.

## Проверки в контейнере

`npm ci` — PASS, lockfile не менялся.
`cd app && npm run check` — PASS: typecheck, ESLint, Prettier,
159 suites / 1626 tests. Лог: `/tmp/som31-r2-check.log` (временный, вне git).
Первый check остановился на missing dependency `participant.bookingId` в hook;
dependency исправлена, повторный полный check зелёный.
Финальный фокусный root Jest — 3 suites / 38 tests PASS.
`git diff --check` и Python compile — PASS. Compilation проверяет только
синтаксис harness, не PostgreSQL. Статически проверено 32 pgTAP assertions.
Первичный отчёт совпадает с `ec6b5bb`; старые migrations совпадают с `96db40a`.

```sh
cd app
npm ci
npm run check
npx jest tests/workout-entry-domain.test.ts tests/workout-entry-service.test.ts tests/workout-entry-hook.test.tsx --runInBand
cd ..
git diff --check
PYTHONPYCACHEPREFIX=/tmp/som31-r2-pycache python3 -m py_compile supabase/tests/som31_prepare_workout_concurrency.py
```

Регрессии используют actual service, runner и SQLite outbox adapter с
TransactionalFixture, а не реальный SQLite. Цепочка: replacement → conflict →
explicit current/incoming → offline retry → applied receipt → server refresh →
cache save → reopen со старым participant prop и сохранённым новым snapshot.
Проверяются actual pending/issues, stable retry envelope/receipt, retained raw
projection/operation, обе offline conflict версии, draft значения, session/workout
fencing и серверное отсутствие/tombstone подхода при другом pending подходе.
SQL fixtures дополнены отсутствующим JWT, null IDs, revision trigger и immutable
receipt replay после cancellation; concurrency проверяет counts после каждого раунда.

## Не проверено и handoff needs-local-db

SQL/pgTAP/RLS/concurrency runtime, generated drift, реальные SQLite/reopen/crash,
браузер и устройства iOS/Android, native/visual/accessibility, облачные процессы и
приёмка владельца **не запускались / не проверены**. SQL пакет не исполнялся в
контейнере и не применялся в облако. Координатор проверяет новую migration локально
и решает вопрос вливания; агент самостоятельно не вливает PR.

Outbox receipt и preload cache — разные транзакции. Crash/ошибка сети между receipt
и успешным server refresh/cache требует нового refresh; локальные операции и
projection сохранены, но атомарность этих двух баз не заявляется. Ошибка cache
сохранения видна в hook; offline rebuild server-acknowledged данных до первого
успешного snapshot refresh не доказан. Первое preparation по-прежнему требует сети.
Разрешённые конфликты не возвращаются active-only query `resolved_at=is.null`;
серверный audit не удаляется, сохранённый offline cache может показывать старые
версии до следующего online resource refresh. Повторный stale выбор проверяет сервер.

В disposable локальной Supabase координатора, без pilot cloud:

```sh
supabase start
supabase db reset
supabase db lint --level warning
supabase test db
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres python3 supabase/tests/som31_prepare_workout_concurrency.py
cd app
npm run db:types:check
```

На устройствах использовать только вымышленных участников: записать null и 0,
точный вес 52,125 кг, reps и seconds; переключить каждого, offline confirm/undo,
закрыть приложение и повторно открыть. На втором устройстве дописать original,
создать replacement conflict, выбрать current и отдельно incoming, доставить и
повторить refresh/reopen, сверить active состав и сохранённые audit версии.
Повторить при network/cache failure и logout/account/workspace/token switch.
Сверить прототип без параметров 390×844 и spec-dark.json; снимки вне git.
Экран, SOM-31 целиком и пилот не объявляются принятыми.
