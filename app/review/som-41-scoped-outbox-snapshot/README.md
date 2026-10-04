# SOM-41 · Scoped SQLite outbox snapshot

04.10.2026. [Draft PR #51](https://github.com/anuar02/panda-trainer/pull/51),
implementation commit `185765d`. Ветка `agent/som-41-scoped-outbox-snapshot`, база
`fix/som-50-template-picker` / `980e149084c1018f05dfe9e00d864b2efd2a9a44`.
`git fetch origin fix/som-50-template-picker` подтвердил эту свежую базу;
local serializer r2 PR #47 / `9b6d8b7` уже в ancestry. Невлитые branches
не использовались как dependencies. Graft executable и `graft/` отсутствуют;
`tools/codex-agents/SUBAGENTS.md` отсутствует: использованы точные пути брифа
и три субагента с чистыми узкими контекстами/исключительным владением файлами.
Live Linear project/SOM-41/SOM-51/SOM-59 прочитаны; SOM-41 In Progress,
duplicateOf null, решения SOM-51/59 Done. Linear не изменялся.

## Реализовано

- Additive `SQLiteOutboxStore.scopedSnapshot`: counts и ВСЕ scoped outbox/entry
  rows в одной serialized exclusive transaction; все SELECT через txn executor.
- Все original operations, raw JSON, receipts и confirmed flags сохранены,
  включая confirmed error/conflict/correction. Raw entry JsonValue не ExportRow.
- Bounded deterministic paging, counts/terminal pages, unique IDs/sequence,
  scopes, order и byte/row limits; invalid/foreign/malformed data fail closed.
- Guard до enqueue, после queue wait, внутри и после transaction/перед return;
  session invalidation, AbortSignal и closing отменяют результат. Identity scope
  копируется по двум явным полям; дополнительные поля не попадают в snapshot.
- Runtime JSON parser отклоняет duplicate decoded keys, unsafe/lossy числа,
  malformed Unicode; safe integers, decimal/unit strings, null/zero/UTF-8 и
  исходный raw JSON сохраняются. Depth/node/individual JSON limits явные.
- Новые UUID/metadata каждого чтения с globalAtomicity unknown. Snapshot только
  SELECT; старые save/ack/pending/read/close methods и schema не изменены.
- [Handoff API/coverage/barrier](../../../docs/app/privacy/SCOPED-OUTBOX-SNAPSHOT.md),
  minimal LOCAL-EXPORT-CONTRACT link, CHANGELOG/ROADMAP, ADR 0081.

## Проверки ведущего

Команды запускаются из `app/`, кроме git:

```sh
npx jest tests/workout-sync-scoped-snapshot.test.ts tests/workout-sync-snapshot-validation.test.ts tests/workout-sync-storage.test.ts tests/workout-sync-runner.test.ts tests/workout-preload-storage.test.ts tests/workout-entry-storage.test.ts --runInBand
npm run check
git diff --check
```

Итоговая проверка ведущего:

- Focused Jest: exit 0, **6 suites / 150 tests** (49 independent driver tests,
  58 validation tests и 43 existing sync/recovery/storage tests).
- `npm run check`: exit 0, typecheck, lint, format:check зелёные;
  **173 suites / 2007 tests**, snapshots 0.
- `git diff --check`: exit 0, whitespace ошибок нет.
  Первый полный check прошёл typecheck/lint и остановился на форматировании нового
  теста, добавленного во время review; Prettier применён, полный check повторён.

Независимый synthetic driver отделяет global driver queries (запрещены) от
transaction executor, клонирует transaction rows и сохраняет их только после
успешного callback/commit. Новые snapshot tests явно проверяют отсутствие writes
и неизменность старых rows; transaction-only SELECT не выводится из реализации
фикстуры existing storage tests.

Coverage: 205 outbox rows (>100 pending плюс receipts), все raw entries,
исходные операции и confirmed error/conflict/correction receipts; paging/terminal
pages и SQLite BINARY Unicode ordering; точные byte/row границы; независимые
operation ID/sequence/entry duplicates, ordering/count/oversized-page corruption,
чужой account/workspace, malformed JSON/kind/revisions/receipts; safe integer
границы, unit strings, null/zero/Unicode/escapes, decimal precision и JSON
parser bounds; queued save → snapshot → ack; driver read/commit errors и queue
recovery, abort/session/close на await boundaries и перед return, mutable request
capture. Existing sync/recovery/storage suites входят в полный check.

## Не проверено / требует одобрения владельца

Real SQLite transactions/connections/WAL/locking/crash/reopen и native runtime
не запускались. Driver fixture моделирует contract, а не доказывает SQLite runtime
или durability. Установленный expo-sqlite source осмотрен: отдельный connection,
BEGIN/COMMIT/ROLLBACK; exclusive API unsupported на web; write-lock обещание SDK
зависит от write transaction, snapshot только SELECT. Другие connections не входят
в JS queue этого store; внешние commits/barrier не протестированы.

Docker/Supabase/SQL/pgTAP/live auth/native устройства/браузер/parity не запускались.
Экранов этот PR не меняет; owner acceptance не получена. Только synthetic fixtures,
без реальных данных и платных сервисов. No UI/file/delete/collector integration,
export proof/user ack proof/delete authorization не реализованы. Server conflicts/
corrections, AsyncStorage/in-memory/other sources остаются unknown; общей transaction
между источниками нет и atomic confirmed полного export не выдаётся.
SOM-41 целиком остаётся открытой; приёмку issue подтверждает владелец.
