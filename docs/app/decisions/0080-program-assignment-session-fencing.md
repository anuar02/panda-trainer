# 0080. Session fence и durable retry назначения программы

- **Статус:** Реализовано технически; runtime и приёмка открыты
- **Дата:** 03.10.2026
- **Задача:** SOM-24

## Контекст

На свежей базе `4d308bc` уже есть immutable copies, receipts, exact expected revision,
authenticated assignment и условная очистка pending. Проверка только user ID
перед RPC не отличает новый вход того же пользователя и не защищает поздний
ответ или кэш успеха. Продуктовая политика ADR 0029 остаётся действующей.

## Решение

Module-local `assignment-session.ts` использует существующий auth seam
`getSupabaseClient().auth.onAuthStateChange/getSession`, без изменения provider.
Fence фиксирует JWT subject и UUID session_id, соответствующие expected actor.
Начальный getSession запускается при открытии fence; auth events и его результат
должны подтвердить одну identity даже при гонке. Logout, новый SIGNED_IN,
другая identity и malformed/missing claims закрывают fence. TOKEN_REFRESHED
допускается только с теми же sub/session_id; имя события не подтверждает identity.
JWT claims проверяются локально по контракту уже влитого read fence, подпись
токена проверяет Supabase; собственный verifier подписи не добавляется. Credentials существуют только
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

Все queued load/save/clear используют проверку той же identity. Conditional clear
проверяет актуальность после чтения и removeItem. При отмене во время удаления
или ошибке removeItem исходная команда восстанавливается, если слот пуст.
Восстановление выполняется под сериализованным lock; новый requestId не заменяется.
Успех публикуется только после успешной очистки и проверки оставшегося pending;
ошибка storage не вызывает callback. Подтверждённые conflict/notFound сохраняют
действующую terminal policy. SQL и create→assign callers не меняются.

## Ограничения

AsyncStorage не предоставляет транзакцию с auth: компенсирующее восстановление
после removeItem зависит от доступности storage; crash между удалением и
восстановлением здесь не проверен. Позднее продолжение не публикуется. Сериализация
защищает операции этого JS runtime, не доказывает межпроцессную атомарность.
Реальное reopen/crash/storage, live auth/RLS/concurrent receipts, native/parity
и одобрение владельца остаются открытыми. Проверки используют synthetic fixtures.
[Отчёт](../../../app/review/som-24-assignment-session-fencing-r2/README.md).

## Повторный review r2

PR #46 закрыт без слияния. Его полный пакет сохранён в новой r2 ветке;
свежие SOM-20/SOM-22 read packages и обе стороны документации сохранены.
Номер 0080 сверён с базой (последний ADR базы — 0079). Старый отчёт —
история проверки и выявленного дефекта, не доказательство verified refresh.
