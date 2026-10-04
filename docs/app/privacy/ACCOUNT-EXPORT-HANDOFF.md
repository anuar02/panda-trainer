# SOM-41 · Read-only account export v2 handoff

04.10.2026. [Решение](../decisions/0092-account-export-source-coverage.md),
[проверки](../../../app/review/som-41-complete-export/README.md).

Пользовательский файл имеет `format: panda-trainer-account`, `version: 2`,
`scope: {accountId, workspaceId, sessionId}`, идентификатор/время snapshot,
исходный server v1 и `sources: [{id, state, records, gaps}]`.
`status: incomplete`, `globalAtomicity: unknown` обязательны. Другие устройства,
неисчерпываемые локальные stores, operational receipts и infrastructure backup/logs
не покрываются данным контрактом. Нельзя считать unknown source пустым.

`sqlite-outbox` сохраняет exact operationJson/resultJson, sequence, IDs и confirmed
marker, в том числе исторические error receipts. Safe typed orphan operations
хранятся отдельно в `sqlite-unresolved-outbox` с ownership gap; они не являются
валидными projections. Unsafe/unknown/foreign payload не экспортируется; source
получает gap. SQLite/pending SHA-256 fingerprints учитывают raw содержимое даже
исключённых записей, не сохраняя credentials в файле.

Точное local EntryWorkout распознаётся по существующей preload schema и связям
booking/card/historical booking-program/workout/exercise/set. Неизвестный JSON
не становится SQL row через cast. Обе server conflict версии, correction operation,
applied metadata и resolve relation читаются owner-scoped существующими SELECT,
без apply. Empty-page pagination и bounds запрещают успешное молчаливое обрезание.

Read-only runtime открывает отдельное SQLite connection, не создаёт таблицы,
не запускает runner и закрывает connection после чтения, включая late open.
Per-source deadlines и identity guards не изменяют save/ack/writer протоколы.
Сравнение повторных чтений выявляет наблюдаемые изменения, но не доказывает
глобальной атомарности и отсутствия ABA. Любой будущий write barrier требует
отдельной реализации и runtime доказательств.

File receipt включает snapshot/session/account/workspace, SHA-256 и UTF-8 byte
count, `saved|shared`, `verification: adapter-reported`,
`freshness: unknown`, `globalAtomicity: unknown`. Receipt описывает конкретную
историческую доставку bytes; он не подтверждает текущее состояние sources.
Shared не доказывает save получателем; cancelled и failures не создают receipt.
Реальные browser/native byte readback, crash/reopen и cleanup должны проверяться
на доступном runtime. Синтетические tests не заменяют эти проверки.

Никаких preflight export/ack proofs из этого receipt не строить. Этот flow не
разрешает deletion, purge, очистку rejected/pending/conflicts или auto logout.
Дальнейшие deletion/Auth/backup/legal gates и общий client account/двойная роль —
[ACCOUNT-DELETION-HANDOFF](ACCOUNT-DELETION-HANDOFF.md), отдельный пакет.
