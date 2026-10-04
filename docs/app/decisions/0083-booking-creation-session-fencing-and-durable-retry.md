# 0083. Session fence создания занятия и durable retry

- **Статус:** Реализовано технически; runtime и приёмка открыты
- **Дата:** 03.10.2026
- **Задача:** SOM-26

## Контекст

Создание проверяло только user перед RPC и возвращало кэшированный Promise без
повторной проверки. После storage/RPC прежняя попытка могла удалить pending или
вызвать onCreated в другом login того же пользователя.

## Решение

Creation-specific fence подписывается на auth до первого await, проверяет actor
и существующий JWT sub/session_id контракт ADR 0075 через read-only helper.
Login закрепляется до storage; scope и lifecycle передаются локальным guard.
SIGNED_IN/SIGNED_OUT и остальные изменения отменяют попытку; TOKEN_REFRESHED
допускается только для того же actor/session_id. getSession проверяется после
awaits, перед RPC, result/error и cached success. Проверенный bearer явно
передаётся RPC; token существует только в fence, не в keys/payload/errors.
Используется актуальный token проверенного login после refresh.

Operation разделяет только in-flight Promise; successful result кэшируется,
но каждое новое execute проверяет fence. Operation, созданная отдельно, имеет
additive dispose для освобождения подписки; submit/resume владеют fence и
освобождают его в finally. Hook владеет отдельным fence гидратации и auth epoch,
скрывает старое состояние по scope/epoch и подавляет поздние completion/error.
Layout effect обновляет актуальный key до passive effects; double tap lock
сохраняется. Public аргументы остаются совместимыми; lifecycle guard необязателен.

Durable key остаётся user/workspace без session/credentials. Payload и requestId,
включая template revision, сохраняются перед RPC и повторяются после reopen.
Отмена auth и неизвестный исход RPC не очищают pending. Валидированный overlap
освобождает pending для явного acknowledgement; созданием он не считается.

Conditional clear проверяет requestId и guard после queued storage read и перед
remove. Если remove завершается ошибкой либо guard отменяется во время remove,
исходный raw восстанавливается внутри той же локальной serialized очереди.
Следующая локальная команда не может попасть между remove и восстановлением.
Если финальная async-проверка auth отменяется после успешного clear, submit
пытается восстановить исходную команду через обычный conditional save; новая
команда не перезаписывается. Storage failure после success требует retry того же requestId; атомарность при
реальном process/storage crash и независимых writers здесь не заявляется.

## Альтернативы

User/workspace key без login fence не различает relogin. Access token в ключе
раскрывает credentials и ломает refresh. Очистка pending в finally теряет
неопределённый исход. Без повторной проверки cache повторяет старый успех.

## Проверки и ограничения

[Точный отчёт](../../../app/review/som-26-booking-creation-session-fencing/README.md).
Только synthetic fixtures. SQL/policy/types, third mutations, auth provider и UI
не изменены. Live auth, native/parity, storage crash и owner acceptance открыты.
