# 0073. Pure preflight будущего удаления аккаунта

- Статус: технический контракт; runtime и продуктовая/юридическая приёмка открыты
- Дата: 03.10.2026
- Задача: SOM-41

## Контекст

ADR 0062 сохраняет неподтверждённую очередь при logout, ADR 0064 задаёт сроки
удаления и backup rotation. Handoff оставляет shared client, dual role,
local export/ack и DB/Auth recovery открытыми. Серверный export не содержит
локальные pending; неизвестность нельзя превращать в готовность удаления.

## Решение

Выделить независимый pure `domain/account-deletion` с versioned exact evidence,
агрегированной inventory, явным context/scope/session, snapshot-bound local proofs
и внешними gates. Не вводить ready: результат unknown/blocked/review-required
всегда содержит deleteAuthorized=false и serverIdentityVerified=false.
Вход проверять fail-closed, диагностику ограничить фиксированными кодами и subjects.
Новых зависимостей, collectors, сетевых или storage вызовов нет.

Рассмотрены альтернативы: boolean ready скрывает unknown и внешние gates;
переиспользование server export как local proof теряет несинхронизированное;
подключение storage/runner сейчас смешивает контракт с независимой runtime работой.
Выбран изолированный evaluator с отдельной матрицей синтетических тестов.

## Последствия

Это техническое выявление препятствий, не продуктовая политика и не авторизация.
Наличие proof метаданных не доказывает содержимое export/ack, отсутствие других
копий или личность. Runtime должен отдельно доказать полноту collector,
mutation interlock, local confirmation, server ownership, recovery и lifecycle
исключение для immutable таблиц. DB/Auth атомарность не обещается.

[Контракт и schema handoff](../privacy/DELETION-PREFLIGHT-CONTRACT.md),
[проверки](../../../app/review/som-41-deletion-contract/README.md).
Ни runtime удаления, ни backup rotation, ни весь SOM-41 не завершены.
