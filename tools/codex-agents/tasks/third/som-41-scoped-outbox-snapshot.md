# SOM-41 · Полный согласованный scoped snapshot SQLite outbox

Linear: https://linear.app/something-great/issue/SOM-41

## Контекст

Local export serializer r2 PR47 влит в fix/som-50-template-picker (`9b6d8b7`).
SOM-29 SQLite store давно в базе. Это следующий отдельный storage API для будущего
collector, без UI/file/delete integration. Решения SOM-51/59 закрыты. Выполняется
после assignment r2; независим от SOM-31 DB review и active scheduling/program.

Существующий pending(100) неполон, confirmedIssues() возвращает receipts без original
operation, read(entityId) не перечисляет projections. Раздельные вызовы не атомарны.
Нужен внутренний typed read-only snapshot всех локальных строк этой account/workspace.
API не является полным export envelope: conflicts/corrections на сервере, AsyncStorage,
in-memory формы и ownership/allowlist collector остаются отдельными источниками.

## Критерии

- [ ] Additive SQLiteOutboxStore API читает ВСЕ scoped workout_outbox строки
  (sequence, operation/entity IDs, original operation_json, result_json, confirmed)
  и ВСЕ workout_local_entries (entity/value) в одной exclusive transaction через
  существующую store.serialize очередь. Никаких раздельных pending/read/receipt calls.
  Bounded deterministic paging/count с явным limit error без truncated success.
- [ ] Expected account/workspace + injectable current-session guard проверяются до
  постановки в очередь, после queue wait, внутри/после transaction и перед return.
  Session изменился/store closing/unmount cancellation — fail closed. Credential
  identity проверяет вызывающий auth seam; токены API не принимает/не сохраняет.
  Snapshot metadata получает новый ID при каждом чтении, не выдумывает global atomicity.
- [ ] Unknown driver rows/JSON runtime validated: scoped columns, unique IDs/sequence,
  confirmed 0/1, operation/entity связи, kinds/revisions/receipts по существующему
  store контракту, JSON exact integer/unit strings/null/zero/UTF-8 без потерь.
  Foreign/malformed/duplicate fail closed. Raw entry value остаётся внутренним
  JSON snapshot; не cast к ExportRow/Projection и не считать ownership подтверждённым.
  Нельзя потерять confirmed error/conflict/correction receipt или исходную operation.
- [ ] Save/ack/close сериализация и existing semantics сохраняются. Snapshot только
  SELECT, никаких update/cleanup/purge/schema migrations, writes/acks/runner не менять.
  Описать consistency других SQLite connections и ограничения exclusive transaction
  без утверждений о проверенном native runtime. Между SQLite/server/AsyncStorage
  общей транзакции нет, atomic confirmed всего export не выдавать.
- [ ] Meaningful driver/seam regressions: >100 pending + confirmed, all projections,
  ordering/limits/duplicates/malformed/foreign scope, exact values/unicode, queued
  save→snapshot→ack, errors/rollback/close/session cancellation между awaits.
  Независимые tests убеждаются что используется transaction executor, а не global
  driver queries, и что snapshot не пишет/не меняет старые записи. Existing sync/
  recovery/storage tests зелёные.
- [ ] Technical handoff snapshot API/coverage/barrier и будущего collector в отдельном
  privacy/SCOPED-OUTBOX-SNAPSHOT.md, minimal LOCAL-EXPORT-CONTRACT link. Никакого file
  delivery/export proof/ack proof/delete authorization; остальные sources unknown.

## Разделение работы

До трёх субагентов по tools/codex-agents/SUBAGENTS.md; если файла нет, свежие узкие
контексты/исключительное владение. Ведущий фиксирует additive API и types; storage
query/queue — одному, module-local row validation — второму, independent tests —
третьему. Shared API/docs/интеграция/полный npm run check только ведущий.

## Границы

Только app/src/features/workout-sync/storage.ts additive read snapshot API и новые
module-local snapshot types/validation helpers; отдельные tests/review, privacy handoff,
minimal CHANGELOG/ROADMAP/ADR. Не менять existing save/ack/pending/read contracts,
domain/workout-sync mutation API, runner/transport/save/sync runtime, preload/journal,
account-local-export serializer (только читать), account-export/deletion, auth provider,
UI/file adapters, AsyncStorage stores, scheduling/library/financial/programs,
SQL/database.types/dependencies/prototype. Не подключать collector к UI/удалению.

## Источники и проверка

AGENTS/app AGENTS, Linear guide/workflow, docs/app/{README,CONVENTIONS,PROJECT-MEMORY,
ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md, ADR0007/0061/0066/0080,
privacy/LOCAL-EXPORT-CONTRACT.md, workout-sync/storage.ts и существующие storage tests.
Graft map/ask если доступен, иначе зафиксировать и читать точные пути. Свежая база
обязательна, невлитые branches не dependencies.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/som-41-scoped-outbox-snapshot/README.md с точными проверками/ограничениями;
  ADR при новом подходе с незанятым номером. App без comments/any/секретов/новых PNG.

Нет Docker/Supabase/браузера/native устройств: real SQLite transaction/connections/
crash/reopen, SQL/live auth/native/parity и owner acceptance не проверены. Только
synthetic fixtures, без платных сервисов/реальных данных. Не задавать вопросов,
не менять Linear/scripts/rules/main. Draft agent/som-41-scoped-outbox-snapshot только
в fix/som-50-template-picker, заголовок SOM-41. Экраны и issue принимает владелец.
