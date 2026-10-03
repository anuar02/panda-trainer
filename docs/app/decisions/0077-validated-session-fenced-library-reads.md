# 0077. Полное validated чтение библиотеки в одной сессии

- **Статус:** Принято технически; runtime и приёмка открыты
- **Дата:** 03.10.2026
- **Задача:** SOM-22

## Контекст

Production library уже подключена. Offset pages использовали mutable auth,
чужие exercise rows фильтровались, неизвестная measure становилась reps.
Mounted flag не отличал поздние результаты разных запросов и входов.

## Решение

Существующие standalone read API сохраняются с необязательным expected
actor/workspace/session и isCurrent. Combined read использует один fence и
проверку trainer ownership. До и после каждого запроса, а также перед возвратом
проверяется auth; каждый запрос получает исходный Authorization. JWT sub и
session_id идентифицируют вход, Supabase/RLS выполняет авторизацию.
Штатный verified refresh той же сессии допустим; logout и новый login закрывают
чтение. Credentials не входят в результат, ошибки, storage keys или draft.

Module-local runtime validators проверяют unknown строки до адаптации:
UUID/scope, ревизии, даты, enum, nullable поля, массивы строк и единицы плана.
Чужие, повторные, повреждённые или неполные обязательные связи отклоняют
всё чтение. Архивные упражнения читаются для существующих ссылок шаблона.
Граммы, null, zero и строковые диапазоны сохраняются без подмены.

Пагинация ограничена 20 страницами по 500 строк; связанные ID запрашиваются
пакетами по 200. Полная последняя разрешённая страница даёт readLimit,
поскольку полнота не доказана. Порядок опирается на существующий RPC/table
контракт. SQL и mutations не меняются.

Provider применяет результат только к его scope/session/request generation.
Auth invalidation скрывает server catalog; pendingSave и durable draft
сохраняются по существующим ключам. Retry не восстанавливает старый ответ,
reload не заменяет более новый draft, поздний результат после unmount игнорируется.

## Альтернативы и ограничения

Фильтрация чужих строк и успешное truncation скрывают повреждение/неполноту.
Один user_id не отличает повторный вход, mounted flag не отличает запросы.
Общий refactor auth/storage/mutations не требуется для исправления read path.
Это fencing авторизации, не транзакционный snapshot нескольких таблиц.
Конкурентное изменение данных может потребовать нового чтения.

Synthetic проверки и точные команды — в
[отчёте](../../../app/review/som-22-library-read-fencing/README.md).
SQL/RLS/live API/real auth, native/parity и owner acceptance не проверены.
