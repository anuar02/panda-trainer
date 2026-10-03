# 0075. Изолированный allowlisted local export envelope

- Дата: 03.10.2026
- Статус: технический контракт для review; runtime integration открыта
- Задача: SOM-41

Server snapshot не сохраняет несинхронизированные локальные операции.
SQLite LocalEntry допускает arbitrary JsonValue, а confirmedIssues возвращает
только receipts. Нельзя переиспользовать их как доказательство полного backup.

Выбран versioned pure envelope с exact OperationPayloads и journal row schemas
влитой базы, явными unknown/incomplete sources, обеими typed conflict versions,
correction operations, bounded canonical UTF-8 serializer и canonical-only parser.
Новые зависимости не нужны. Общий результат incomplete, пока other local sources
не имеют отдельного проверенного контракта. Поля arbitrary JSON отвергаются вместо
скрытого удаления. Альтернатива generic JSON export отвергнута из-за credentials
и невозможности проверить потерю unknown данных; collector/storage интеграция
отложена в отдельный пакет по границам задачи.

Контракт и требования будущей атомарности/file result:
[LOCAL-EXPORT-CONTRACT](../privacy/LOCAL-EXPORT-CONTRACT.md).
Serializer не создаёт preflight proofs, не сохраняет файл и не разрешает удаление.
UX/retention/политика удаления этим решением не меняются.
