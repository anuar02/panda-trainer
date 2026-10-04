# 0075. Production ввод журнала из снимка назначения занятия

- Статус: реализовано технически; SQL/native/parity и одобрение владельца открыты
- Дата: 03.10.2026
- Задача: SOM-31

## Решение

Перед сохранением production подходов SOM-30 reader обёрнут подготовкой журнала.
Новый owner-only `prepare_workout_journal(booking_id, workout_id, request_id)`
создаёт workout и упражнения одной транзакцией из immutable booking_programs /
booking_program_exercises. Возвращение к журналу не обновляет его состав; template
и catalog edits не меняют уже назначенный снимок. UUID строк assignment становятся
UUID упражнений журнала; повторное чтение принимает реальные серверные identity.
Workspace advisory lock совместим с SOM-29, request receipt приватный. Приложение
не делает прямые INSERT и не отправляет create_workout с текущим catalog.

Первое открытие требует сети и развёрнутого нового RPC. После подготовки и cache
ввод, переключение участников и восстановление доступны offline. Неподготовленный
снимок не используется для отправки подходов. Это ограничение существующего
create_workout seam; apply_operations и старые migrations не меняются. SQL review
и вливание выполняет Claude после совместимого исправления PR #34.

domain/workout-entry и features/workout-entry отделены от демо. Черновики и focus
хранятся в scoped SQLite, стабильный device UUID сохраняется там же. Проекция
подтверждённой операции и envelope сохраняются существующим saveJournalEntry /
outbox атомарно. Draft содержит индекс localEntityIds; индекс пишется раньше
операции, поэтому его незавершённый commit оставляет только безопасную отсутствующую
ссылку. На восстановлении читается последняя доступная проекция. Несколько баз
не объявляются одной транзакцией. Подходы используют integer grams/reps/seconds,
null не превращается в 0; предыдущий результат копируется только в draft.

Refreshed server revisions и tombstones сопоставляются с локальной проекцией,
pending и owner-only конфликтами/rejected receipts. Локальное удаление не оживает
из устаревшего cache. Смена account/workspace/session/token закрывает соединения и
отсекает публикацию поздних ответов; pending не purged. Каталог и обе версии
конфликта кешируются в scope тренера для offline выбора; сервер повторно проверяет
expected_revision при доставке. Обе версии остаются в серверном conflict record.

Add/replace используют только journal operations. Шаблон и личная программа не
пишутся. Finish/correction не подключены: SOM-32 остаётся отдельной задачей.

## Проверка

[Отчёт и воспроизводимые команды](../../../app/review/som-31-workout-entry/README.md).
Mock SQLite и transport tests не доказывают native crash durability, SQL/RLS runtime
или визуальный паритет. database.types.ts расширен вручную только RPC signature;
generated drift не проверен. Клиентские экраны и auth policy не менялись.

## Reconciliation r2 после закрытого PR #38

Серверный снимок задаёт активную проекцию после снятия pending/issues. Ревизия
локальной строки и сама ссылка replacedFromId не доказывают незавершённую запись.
Состав сохраняется только при действующей операции либо unresolved/rejected/
correction issue. Replacement защищает original лишь пока защищена сама замена;
зависимый pending set сохраняет контейнер упражнения и свои данные, но не скрывает
серверный original. После applied current receipt отсутствующая replacement
исчезает, original получает серверный skipped. Outbox, receipts, drafts и серверные
снимки обеих конфликтных версий не удаляются.

Отсутствующие unprotected sets больше не добавляются обратно. Удалённые серверные
строки фильтруются; локальная deletion watermark блокирует старую серверную
ревизию даже после снятия tombstone marker, новая revision разрешает восстановление.

После доставки hook сохраняет весь свежий server context в существующий scoped
preload cache, использует его при reopen и переключении участника. Это необходимо
и для incoming выбора, и для подтверждённых новых подходов. Ответы и видимое
состояние привязаны к workout вместе с account/workspace/session/token; поздний
refresh другого участника не публикуется и не пишет cache. SQLite outbox и preload
cache остаются разными транзакциями: crash между receipt и server refresh/cache
требует нового refresh; native crash durability здесь не доказана.

[Проверки r2](../../../app/review/som-31-workout-entry-r2/README.md).
