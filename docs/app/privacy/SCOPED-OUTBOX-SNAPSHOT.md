# SOM-41 · Scoped SQLite outbox snapshot

04.10.2026. Additive внутренний API `SQLiteOutboxStore.scopedSnapshot(request)`
в [storage.ts](../../../app/src/features/workout-sync/storage.ts),
[types](../../../app/src/features/workout-sync/snapshot-types.ts),
[validation](../../../app/src/features/workout-sync/snapshot-validation.ts).
[ADR 0081](../decisions/0081-scoped-sqlite-outbox-snapshot.md).

## API и coverage

Request содержит `expectedScope: { accountId, workspaceId }`, обязательный
синхронный `isCurrentSession: () => boolean`, необязательные `signal: AbortSignal`
и `limits: { pageSize?, maxRows?, maxBytes? }`. Caller захватывает текущую identity
сессии/epoch и проверяет её в guard, включая повторный вход того же аккаунта,
смену credentials и unmount. API не принимает и не сохраняет токены; доверенный
вызывающий auth seam обязан проверить credential identity и право читать scope.
Совпадение локальных account/workspace columns само по себе не доказывает ownership.
Для unmount caller отменяет signal или делает guard false.

Результат содержит `metadata` и массивы `operations`, `entries`:

- `operations`: все scoped workout_outbox rows, включая pending, applied,
  error, conflict, correction_draft и уже resolved receipts. Сохраняются sequence,
  operationId/entityId, confirmed 0/1, исходные operationJson/resultJson и runtime
  validated operation/result. Исходные операции никогда не заменяются receipts.
- `entries`: все scoped workout_local_entries, entityId, исходный valueJson и
  разобранный JsonValue. Это внутренний raw JSON snapshot; он не ExportRow,
  не typed Projection, не allowlist и не доказательство ownership references.
- `metadata`: новый UUID `id` при каждом чтении, `capturedAt` (время создания
  результата, не SQL commit timestamp), frozen scope и counts обеих таблиц;
  `consistency: 'sqlite-exclusive-transaction'`, `globalAtomicity: 'unknown'`.
  ID обозначает конкретное чтение, не DB revision, hash или доказательство
  неизменности. Последующие save/ack могут сразу сделать snapshot устаревшим.

Snapshot не читает server conflicts/corrections, AsyncStorage, in-memory формы,
другие SQLite таблицы/cache или модули. Их coverage остаётся **unknown**, а не zero.
Outbox receipt не является полной conflict version или correction draft.

## Локальная consistency и cancellation

Весь snapshot проходит через существующую store.serialize очередь между save и
acknowledge. Counts и страницы обеих таблиц читаются в одном
`withExclusiveTransactionAsync`, только через переданный transaction executor.
Snapshot выполняет исключительно SELECT; не обновляет confirmed/results,
не очищает rows, не меняет schema и не выполняет purge. Existing save/ack/pending/
read/runner contracts не изменены.

Expected scope, guard, abort и closing проверяются перед enqueue, после queue wait,
в начале transaction, после каждого awaited read, перед выходом из callback,
после завершения transaction и перед return. Смена сессии или close отвергает весь
результат; очередь продолжает работать после ошибки. Отмена логическая: API не
обещает interrupt уже выполняющегося native SELECT. Guard должен отражать
необратимую invalidation/epoch, а не временное boolean, которое вновь становится
true после logout/login. Ответственность за его корректность лежит на caller.

Это порядок writers конкретного экземпляра store. Другие store instances или
SQLite connections не входят в эту JS очередь. В установленном expo-sqlite
SQLiteDatabase.withExclusiveTransactionAsync создаёт отдельное connection,
использует BEGIN/COMMIT/ROLLBACK и требует запросы через txn; web API unsupported.
Название exclusive не обещает блокировку всех writers: комментарий SDK связывает
write lock с превращением transaction в write transaction, а snapshot read-only.
При нормальной SQLite snapshot isolation concurrent commits других connections
не должны смешиваться внутри read transaction, но они могут происходить вне неё
или привести к driver/locking ошибке. Это ожидаемая семантика, а не проверка
native runtime. Здесь не проверены реальные connections/WAL/locking/crash/reopen.
Для общего barrier будущему collector потребуется coordinator/version comparison
всех writers, включая другие connections.

Между SQLite, server и AsyncStorage общей transaction нет. Этот API никогда
не утверждает atomic confirmed всего export; без отдельного cross-source barrier
collector обязан оставить atomic unknown/incomplete.

## Bounds и fail closed

По умолчанию pageSize 100, maxRows 10 000 суммарно по двум таблицам,
maxBytes 4 MiB суммарного UTF-8 operationJson/resultJson/valueJson. Overrides могут
только уменьшать эти positive safe-integer пределы. Byte limit ограничивает raw
JSON, а не размер будущего export envelope или полного JS heap.
Сначала scoped COUNT обеих таблиц, затем deterministic pages:
outbox sequence ASC, entries entity_id COLLATE BINARY ASC. Проверяются размер
страницы, порядок, unique operation IDs/sequence и unique entry IDs, фактические
counts и terminal empty pages. Limit violation отвергает всё чтение без truncation.

Unknown driver rows, scope columns, подтверждение 0/1, kind/revisions/ID relations
и receipts проверяются runtime по storage contract. JSON проверяется до успешного
возврата: duplicate object keys, unsafe/теряющие precision числа, malformed UTF-16,
невалидная структура и parser bounds отклоняются. Для каждого JSON действуют
пределы глубины 64 и 200 000 value nodes; object keys отдельно проверяются. Exact safe integers, unit strings,
null, zero, Unicode, NUL и переносы сохраняются; raw JSON сохраняет исходное
представление. Неизвестная форма JsonValue entry допустима внутри этого API,
но не становится разрешённым export record. Неизвестные JSON поля сохраняются внутри raw snapshot согласно generic storage
contract; exporter должен отдельно применить allowlist. confirmed отражает
сохранённый флаг, а не пересчитывается по status: даже confirmed error receipt
остаётся вместе с оригинальной operation. Нет silent filtering receipts.
Ошибки валидации дают только `ScopedOutboxSnapshotError.code`:
malformed/scopeMismatch/limit/cancelled/closed; без содержимого строк.
Ошибки IO/transaction driver пробрасываются без успешного partial result.

## Handoff будущему collector

1. Проверить авторизованный account/workspace и credential/session identity в
   auth seam, захватить epoch и подключить cancellation lifecycle.
2. Использовать один scopedSnapshot вместо отдельных pending/read/confirmedIssues.
   Не передавать raw values в serializer через cast: распознать известные exact
   schemas, подтвердить ownership/relations и сохранить неизвестное как coverage gap.
3. Отдельно получить обе server conflict versions/correction context, включая
   already-resolved context для draft, и все другие sources. Связать их с barrier;
   при невозможности доказать согласованность оставить atomic unknown/incomplete.
4. Любая новая запись/ack/session switch делает прежнее evidence непригодным;
   snapshot ID сам по себе не обнаруживает изменения после чтения.
5. File delivery и export proof, user ack proof, deletion authorization и purge
   остаются отдельными будущими пакетами. Этот snapshot их не создаёт.

[Pure local serializer contract](LOCAL-EXPORT-CONTRACT.md),
[точные проверки и ограничения](../../../app/review/som-41-scoped-outbox-snapshot/README.md).
SOM-41 целиком и owner acceptance остаются открытыми.
