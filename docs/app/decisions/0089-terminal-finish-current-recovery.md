# 0089. Продолжение журнала после current finish resolution

- **Статус:** Реализовано; runtime и приёмка владельца открыты
- **Дата:** 04.10.2026
- **Задача:** SOM-32 production finish r2

## Контекст

ADR 0087 сохраняет finish envelope для exact replay. После выбора current
сервер может оставить журнал открытым. Сохранённый envelope сам по себе не
должен навсегда запрещать ввод, undo/add и новое явное завершение. Отсутствие
pending/issues не доказывает, что старая команда завершила свой lifecycle.

## Решение

Entry service читает сохранённые operation/receipt через существующий read-only
`scopedSnapshot` из SOM-41. Store API, storage, runner, transport и SQL не меняются.
Для снятия terminal finish lock нужны принадлежащие этому журналу исходная
finish conflict receipt и точная current resolution с applied receipt, а также
свежий unfinished snapshot с revision не ниже подтверждённого resolution.
История envelopes/receipts, результаты, drafts и outbox остаются сохранёнными.

Domain/helper отличает исторический finish от активной блокировки. Новая finish
команда создаётся только явным действием после доказательства terminal outcome;
она получает новый ID и свежую revision. Pending, ambiguous/foreign/late receipt,
stale snapshot и смена сессии не дают разрешения. Incoming остаётся finished.
При недоступном доказательстве применяется безопасная блокировка, auto-finish нет.

Credentials используются только в session refs/guards и transport headers;
React keys, state, storage и результаты их не содержат. Guard сравнения bearer
вокруг awaits сохраняется, ключ lifecycle использует непрозрачную generation.

## Проверка и границы

Независимые service/hook/screen сценарии включают conflict → current → receipt →
refresh/reopen → confirm → новое явное finish; отрицательные сценарии проверяют
границы доказательства. Команды и результаты — в
[отчёте r2](../../../app/review/som-32-production-finish-r2/README.md).

Correction application и selective program update не входят в finish пакет.
Невлитый correction PR #56 не является dependency. SQL/pgTAP/RLS/live auth,
реальный SQLite/crash/reopen, native/parity и приёмка владельца не проверены.
SOM-32 целиком не завершена.
