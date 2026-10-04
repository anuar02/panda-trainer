# 0084. Scoped read-only SQLite snapshot через очередь outbox

- Дата: 04.10.2026
- Статус: реализовано технически; native/runtime и owner acceptance открыты
- Задача: SOM-41

`pending(100)`, `confirmedIssues()` и `read(entityId)` не перечисляют все локальные
rows и не обеспечивают согласованного чтения. Collector пока не подключается.

Выбран additive API конкретного SQLiteOutboxStore, отдельные module-local types
и runtime validation helpers. Один queue task выполняет counts и ограниченные
упорядоченные страницы двух scoped таблиц через exclusive transaction executor.
При превышении bounds или invalid scope/session/rows весь результат отклоняется.
Raw JSON сохраняется вместе с validated parsed values; проекции не приводятся к
export schemas. Новые зависимости, migrations и изменения mutation API не нужны.

Альтернатива нескольких старых calls отвергнута из-за неполноты и гонок; чтение
всей таблицы одним неограниченным getAll — из-за непредсказуемого объёма.
Пределы 10 000 rows / 4 MiB raw JSON / страницы до 100 — implementation bounds,
не retention policy. Парсер отдельно ограничивает глубину/число nodes и исключает
lossy JSON.parse до выдачи успешного typed результата.

Guard/cancellation проверяются до enqueue и между awaited шагами; credentials
проверяет caller auth seam. Новый ID выдаётся каждому чтению. JS очередь принадлежит
одному store; другие connections и cross-source barrier не координируются этим API.
Exclusive read transaction не равна доказанному global write lock или atomic export.
Native/WAL/concurrency/crash не проверены synthetic tests.

[API, bounds, coverage и collector handoff](../privacy/SCOPED-OUTBOX-SNAPSHOT.md).
Snapshot не создаёт export/ack evidence, не сохраняет файл и не разрешает удаление.
