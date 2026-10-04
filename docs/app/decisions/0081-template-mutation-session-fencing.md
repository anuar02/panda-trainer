# 0081. Session fence template save/archive

- **Статус:** Принято технически; runtime и приёмка открыты
- **Дата:** 04.10.2026
- **Задача:** SOM-23

Template mutations используют отдельный helper, не меняющий exercise operation.
При создании helper подписывается на auth и начинает проверку actor/JWT sub/session_id;
execute ждёт захвата identity, проверяет её перед dispatch, после RPC/error и перед
возвратом cached success. TOKEN_REFRESHED разрешён только с той же проверенной
identity. SIGNED_IN, SIGNED_OUT и остальные auth transitions отменяют operation.
Bearer остаётся внутри transport; результаты, requestId и durable payload его не содержат.
Provider освобождает подписку при смене операции, auth cancellation и unmount.
Standalone archive caller должен вызвать optional dispose после завершения работы.

Provider передаёт explicit session/generation scope. Recovery создаёт новую operation
с прежними payload/requestId/expectedRevision, позволяя серверному receipt вернуть replay.
Lock имеет владельца: старый finally не освобождает новую команду. Очистка durable draft
выполняется в общей очереди с guard до/после записи; при cancellation во время записи
очередь восстанавливает прежний pending snapshot до новой hydration/записи.
Перед clear snapshot дополнительно записывается в scoped `:pending-clear` backup.
Hydration при пустом main восстанавливает этот backup; непустой main, включая новую
pending команду, имеет приоритет. Backup очищается только своей принятой командой
через ту же очередь с generation guard. Ошибка cleanup допускает replay при reopen.
При clear failure operation и pending остаются пригодны для безопасного retry.

AsyncStorage не даёт атомарной compare-and-set транзакции. Synthetic tests доказывают
recovery из backup при отказе compensation/cleanup и приоритет newer pending.
Физический crash, потеря уже подтверждённых storage writes и реальное reopen не проверены.
Реальная storage/crash проверка остаётся открыта, SQL receipt контракт не меняется.
Архив проверяется standalone synthetic; production UI caller не добавлен.
