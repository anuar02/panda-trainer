# 0102. Выборочное обновление программы: проверенный источник и immutable receipt

- Статус: реализовано технически; DB runtime и приёмка владельца открыты.
- Дата: 04.10.2026.
- Задача: SOM-32; продуктовое решение — ADR 0100.

## Источник и команда

`get_program_update(actor, workspace, workout, client)` возвращает серверные
план/факт, текущую копию, ревизии и допустимые ключи изменений. Команда
`update_client_program` принимает этот scope, исходный program ID/revision,
workout revision, точные selected keys и request ID. Клиент не передаёт новые
значения веса или подходов: сервер снова вычисляет их из сохранённого журнала.

SOM-31 `prepare_workout_journal` копирует `booking_program_exercises`, не заполняя
`workout_instances.source_program_id`. Поэтому поддерживаются два доказуемых
источника: личная программа по явному journal source либо immutable снимок
`booking_programs`. При наличии личной программы снимок занятия должен полностью
совпадать с её упорядоченным составом и template ID/revision. Исключение — текущая
копия, уже созданная из этого же журнала: после correction её можно обновить ещё
раз. При отсутствии личной программы создаётся первая копия из снимка занятия.
Неподтверждённое соответствие другому назначению отклоняется как конфликт.
Происхождение сохраняет source kind, IDs и ревизии обоих источников, актуальную
версию журнала, выбранные ключи и снимки упражнений с фактом.

Изменения применяются только к новой копии. У неизбранных упражнений сохраняются
план, метаданные и относительный порядок. Замена занимает место исходного
упражнения, добавление идёт в конец, пропуск требует явного выбора. Число подходов
сверх плана — последний индекс валидного сохранённого подхода + 1, как в прототипе.
Добавление сохраняет planned_sets журнала; замена — planned_sets исходной программы.
Последний валидный подход задаёт вес и повторы/секунды. Черновики, deleted rows,
нулевые повторы/время и неизвестный вес не становятся фактом для переноса.

Перенос значений обычного упражнения — отдельный, по умолчанию снятый пункт.
Частичное завершение не уменьшает число плановых подходов. Неоднозначность между
`prev` прототипа и planned fields базы записана в OPEN-QUESTIONS, без утверждения
нового постоянного продуктового правила. Пустая программа и добавление/замена без
валидных сохранённых значений отклоняются либо не предлагаются: существующая
схема требует 1–50 упражнений и валидные planned values.

## Сериализация и история

Порядок locks: workspace advisory seed 29 (correction/sync), workspace row
(assignment), scoped request advisory, затем client row перед проверкой активного клиента.
Client lock не позволяет архивированию пересечь проверку и создание копии.
Assignment не ждёт advisory lock, а
correction не берёт workspace row. Цикл ожидания не добавляется. Любой новый
assignment либо correction между просмотром и подтверждением меняет ожидаемый
источник/ревизию; транзакция откатывается целиком.

Private RLS receipt закрыт от authenticated/anon и неизменяем. Request JSON
фиксирует scope, ревизии и порядок ключей. Идентичный replay возвращает идентичный
result даже после следующего назначения или архивирования; другой payload
с тем же UUID отклоняется до записи. Provenance остаётся только в private receipt.

Для существующего чтения `created_at DESC, id DESC` добавлен BEFORE INSERT trigger
программ: время новой копии строго больше предыдущей копии клиента и не раньше
clock_timestamp. Это минимальное исправление общего read seam: assignment,
начавшийся до commit обновления, но дождавшийся его lock, становится актуальным.
Существующие assignment/correction/finish functions не переписываются.

## Клиентский lifecycle

Отдельный модуль содержит domain validation, JWT/session fence, transport,
сериализованный AsyncStorage pending store и controller. Ключ pending фиксирует
actor/workspace/workout/client; body содержит program ID, обе ревизии, UUID и
точный selection. Credentials не сохраняются. Session fence проверяет JWT sub и
session_id, разрешает только проверенный TOKEN_REFRESHED, закрепляет bearer до
dispatch и проверяет caller после success/error.

Dismiss немедленно disposes transport; scope/revision/relogin/unmount закрывают
старые callbacks. После подтверждённого receipt перечитывается текущая программа
через update context. Existing client program reader перечитывает данные при
focus/retry и видит новые строки через прежние API/RLS. Доступ к истории сохраняется.
Unknown timeout, storage/readback failure удерживает прежний intent/UUID. Ошибка
read context не доказывает отказ команды. Явный сброс разрешён только после
terminal rejection самой apply RPC; при подтверждённом receipt и неудачном
readback pending остаётся retryable.

## Доказательства

Независимые domain, session, store, transport, controller, hook и UI regressions;
pgTAP включает production prepare → saved partial result → finish → выбор → copy,
correction → повторное предложение, историю, provenance, rollback и виды выбора.
Existing CI harness `program_concurrency.py` расширен обеими очередностями
assignment/update, correction/update и exact replay. Реальный SQL/native runtime
проверяется отдельно; synthetic tests не заменяют эти проверки.
