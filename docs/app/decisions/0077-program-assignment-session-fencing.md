# 0077. Session fence и durable retry назначения программы

- **Статус:** Реализовано технически; runtime и приёмка открыты
- **Дата:** 03.10.2026
- **Задача:** SOM-24

## Контекст

На базе `90b7f73` уже есть immutable copies, receipts, exact expected revision,
authenticated assignment и условная очистка pending. Проверка только user ID
перед RPC не отличает новый вход того же пользователя и не защищает поздний
ответ или кэш успеха. Продуктовая политика ADR 0029 остаётся действующей.

## Решение

Module-local `assignment-session.ts` использует существующий auth seam
`getSupabaseClient().auth.onAuthStateChange/getSession`, без изменения provider.
Fence фиксирует actor; logout, новый SIGNED_IN и неподтверждённая смена токена
закрывают его. TOKEN_REFRESHED принимается только для того же actor, а очередной
getSession должен подтвердить актуальный токен. Credentials существуют только
в приватном замыкании fence и заголовке RPC; storage, результат и ошибки их не
содержат.

Операция принимает optional caller-owned fence, проверяет его перед отправкой,
после RPC, при ошибке и перед повторной публикацией кэшированного успеха.
Отменённая операция не получает новый fence. Самостоятельный caller может
освободить принадлежащий операции fence через optional dispose.

Hook хранит отдельное поколение auth и жизненного цикла, сохраняя durable key
user/workspace/client. Все продолжения и сохранённые callbacks привязаны к
контролю поколения. Смена сессии скрывает старые busy/error/pending и закрывает
старый lock. Pending сначала подтверждается storage, затем отправляется RPC;
при неопределённом исходе повтор использует прежний payload/requestId.

Conditional clear дополнительно проверяет актуальность поколения после чтения
в сериализованной очереди, перед removeItem. Более новый requestId не удаляется.
Успех публикуется только после успешной очистки и проверки оставшегося pending;
ошибка storage не вызывает callback. Подтверждённые conflict/notFound сохраняют
действующую terminal policy. SQL и create→assign callers не меняются.

## Ограничения

AsyncStorage не предоставляет транзакцию с auth: уже начатый removeItem нельзя
откатить при последующем logout. Очистка начинается только после подтверждённого
исхода и актуальной сессии; позднее продолжение не публикуется. Сериализация
защищает операции этого JS runtime, не доказывает межпроцессную атомарность.
Реальное reopen/crash/storage, live auth/RLS/concurrent receipts, native/parity
и одобрение владельца остаются открытыми. Проверки используют synthetic fixtures.
[Отчёт](../../../app/review/som-24-assignment-session-fencing/README.md).
