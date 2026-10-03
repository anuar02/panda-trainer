# 0078. Изолированный allowlisted local export envelope

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

## Исправление r2 и актуальная база

Исходный PR #39 закрыт без слияния; пакет перенесён из сохранённой ветки на
`9031157` / fix/som-50-template-picker. 0075 занят schedule reads, 0076 — history,
0077 — financial reads; local export занимает 0078.
Вместо универсального row.id == entityId выбраны relations по incoming kind:
старое упражнение replacement, существующий set aggregate, skipped exercise fallback,
note shared snapshot и workout row. Доступные child/parent/replacement/version
противоречия fail closed; недоступный контекст остаётся incomplete.
Resolve correction использует typed conflict из того же scoped snapshot; отсутствие
контекста не мешает сохранить exact operation, но запрещает complete journal.
Это serializer seam будущему collector; storage/SQL/runtime не меняются.
[Свежий отчёт r2](../../../app/review/som-41-local-export-contract-r2/README.md).
