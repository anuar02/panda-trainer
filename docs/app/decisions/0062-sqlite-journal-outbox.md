# 0062. SQLite outbox и пакетный журнал RPC

- Статус: реализовано технически; SQL runtime и native приёмка открыты
- Дата: 03.10.2026
- Задача: SOM-29

## Решение

Самостоятельные domain/workout-sync и features/workout-sync используют expo-sqlite
версии SDK 57, установленной `npx expo install expo-sqlite`. API сверена с
https://docs.expo.dev/versions/latest/sdk/sqlite/ и установленными декларациями.
Транзакция withExclusiveTransactionAsync сохраняет локальную проекцию и envelope
операции вместе. Все ключи включают account/workspace; новый connection на adapter.
Неподтверждённые данные не удаляются при logout. Purge API намеренно отсутствует:
удаление требует отдельного проверяемого export/ack процесса.

RPC apply_operations поверх SOM-28 сериализует workspace, проверяет полный envelope
при replay, сохраняет owner-only receipt и использует subtransaction на операцию.
Порядок — входной массив; локально — sequence SQLite. Серверный ошибочный receipt
тоже стабилен: точный retry вернёт ту же ошибку. Исправление rejected payload требует
нового operation_id; исходная локальная операция остаётся для явного разбора.
Разные set IDs упорядочиваются по requested_position/device_id/id; локальное время
не выбирает победителя. Конфликты сохраняют снимок текущего значения и входной
операции; выбор current/incoming проверяет актуальную ревизию. Finished mutations
создают приватный correction draft без изменения завершённых данных (ADR 0061).
Явное применение correction draft — последующая SOM-32, автоматического API нет.

Runner делает одну пачку до 100 операций за запуск с scope-wide single flight,
abort/timeout и snapshot account/workspace/sessionId/token. После смены сессии ответ
не подтверждается. Интегратор обязан вызвать stop перед logout/switch и создавать
новый sessionId при каждом входе, включая возврат в прежний аккаунт.
Retry запускается вызывающим connectivity/lifecycle coordinator с backoff;
внутреннего бесконечного цикла и автоматического планировщика нет.

Состояние «Сохранено на телефоне» публикуется после commit. Подтверждённый конфликт
перестаёт отправляться, но остаётся отдельным состоянием после reopen. Компонент
WorkoutSyncStatus имеет собственный i18n resource и не подключён к экранам.

## Проверка и ограничения

Контракт, команды, fixtures и точки подключения:
[отчёт SOM-29](../../../app/review/som-29-sqlite-outbox/README.md).
Mock SQLite проверяет транзакционный контракт, но не crash durability телефона.
SQL reset/lint/pgTAP/concurrency и генерация типов не выполнены без Supabase/Docker.
database.types.ts дополнен вручную; это не generated/drift-verified результат.
Экранов и маршрутов нет; принятие этапа 5 и native/parity остаются открытыми.
