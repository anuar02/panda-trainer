# 0075. Ограниченное и session-fenced чтение клиентов тренера

- **Статус:** Реализовано; synthetic проверки, live/native и приёмка открыты
- **Дата:** 03.10.2026
- **Задача:** SOM-20

## Контекст

Список и карточка читали потенциально многорядные таблицы одним запросом,
доверяли generated types и использовали mutable auth между связанными reads.
Скрытый server row cap мог выдавать неполные данные как успешное чтение.
Повтор, смена scope и новая сессия того же user требовали отдельного fencing.

## Решение

Подход локален в `features/workspace-clients`; auth provider, команды, SQL,
generated types и библиотеки не меняются. `loadWorkspaceClients(workspaceId)`
остаётся совместимым безопасным wrapper для создания занятия. Он получает actor
из текущей сессии, фиксирует bearer и проверяет owner workspace. Два клиентских
маршрута дополнительно передают ожидаемые actor/token и AbortSignal.

Перед каждым запросом и после ответа проверяется auth. Все запросы logical read,
включая проверку `trainer_workspaces.id/owner_user_id`, используют первоначальный
`Authorization` header. Подписка auth отменяет logout, смену actor и смену token
без `TOKEN_REFRESHED`; cancellation липкая, возврат старой сессии её не снимает.
Повторный `SIGNED_IN` с текущим token не создаёт новую сессию. `TOKEN_REFRESHED`
того же actor обновляет только ожидаемый live token для guard: транспорт остаётся
на первоначальном bearer. Если он уже недоступен, весь read завершится ошибкой.
Маршруты при смене token дополнительно запускают новое чтение и очищают результат.
Это консервативное поведение поверх текущего event/token контракта Supabase;
декодирование JWT и общий auth refactor не вводятся.

Каждая коллекция читается страницами по 200 строк, с exact count и пределом
10000 строк на коллекцию. Count выше предела — `limit`, без частичного результата.
Изменение count, короткая страница, неверный порядок и повтор ID — ошибка.
Порядок: clients `id ASC`; programs `created_at DESC,id DESC`; ближайшие bookings
`starts_at ASC,id ASC`; карточка bookings `starts_at DESC,id DESC`; exercises
`position ASC,id ASC`. Результат публикуется только после всех reads и final guard.
Для выбранной последней программы читается вся коллекция упражнений; текущая
модель ограничивает position 0…49, повторы position/exercise запрещены.

На границе unknown rows проверяются canonical UUID, workspace и client/program
relations, положительные integer revisions, UTC календарные timestamp и интервалы,
booking/measure enums, плановые units/ranges, null и zero. DTO собирается только
из безопасной проекции. `created_by` не читается; в совместимом client Row это
поле всегда `null`, UI его не использует. Audit/request payload не возвращаются.
Base-template/exercise UUID проверяются как ссылки immutable snapshot; актуальные
library rows не перечитываются. Связь с workspace обеспечивается существующими
compound FK/RLS, их live runtime в этом пакете не проверен.

Список валидирует и архивные client IDs, чтобы связанные программы/занятия архива
не выглядели foreign; на экран архив не попадает. Missing/archived details — `null`.
Локальный controller отменяет прежний generation при retry, unmount и auth switch;
hook маркирует результат identity scope, скрывая его уже при изменении props.
Auth подписка hook сохраняется после успеха и очищает уже показанный snapshot.
Add/invite/assignment/purchase callbacks продолжают использовать существующие команды.

## Ограничения

Клиентские HTTP pages не являются repeatable-read транзакцией. Count/order/duplicate
checks обнаруживают многие конкурентные изменения, но не доказывают неизменность
содержимого при equal-count UPDATE/delete+insert. Новый server snapshot RPC потребует
отдельного SQL scope. Предел защищает от неограниченного чтения; workspace больше
10000 строк в любой коллекции получает retry/error, а не обрезанный список.
Никаких новых библиотек, платных сервисов или данных клиентов.

## Проверка

[Точные команды, synthetic критерии и пробелы](../../../app/review/som-20-trainer-client-read-fencing/README.md).
SQL/RLS, live auth, native, визуальный паритет и принятие экранов остаются открытыми.
