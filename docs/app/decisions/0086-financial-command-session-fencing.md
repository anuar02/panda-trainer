# 0086. Session fence финансовых команд и durable retry

- Статус: реализовано технически; live/runtime и приёмка владельца открыты
- Дата: 04.10.2026
- Задача: SOM-34
- База: `fix/som-50-template-picker`, `34d4fb3`; номер проверен после fetch

## Контекст

PR43 защищает финансовые reads, но mutation authenticate проверял только user
до RPC. Submit сохранял pending до захвата auth и очищал его после позднего
success или terminal error. Hook различал user/workspace, но не новую сессию
того же user. Durable key должен пережить relogin, сохранив исходный requestId.

## Решение

Module-local mutation fence синхронно копирует actor/workspace и подписывается
на auth до первого await. Session identity — проверенная согласованность
`session.user.id`, JWT `sub` и UUID `session_id`; структура JWT и claims обязаны
быть корректны. INITIAL_SESSION/refresh claims сверяются с getSession, название
TOKEN_REFRESHED не является доказательством. Logout, смена actor/session,
malformed token и неактуальный hook token закрывают fence навсегда.
Это lifecycle validation, не локальная криптографическая проверка подписи:
подлинность bearer и права на целевой workspace проверяет Supabase.

Все восемь financial RPC используют explicit bearer из проверенного getSession
той же identity. Перед dispatch и после response/rejection есть guards; parse
и scoped result validation сохранены. Normal refresh той же identity разрешён,
включая refresh во время первоначального getSession. Access token хранится
только в краткоживущем closure и очищается при dispose. Read helper используется
только для decoding identity; PR43 reads/helpers/hooks не изменены.

Submit передаёт один fence через storage и service. Опциональный второй fence
параметр сохраняет public compatibility и позволяет standalone service вызвать
RPC в явно закреплённом workspace. Legacy standalone вызов без workspace fence
сохраняет неизменный целевой client/purchase/booking/attendance ID и существующую
серверную workspace/RLS проверку; workspace из receipt не выводится заранее.
Payment mutation implementation вынесен в trainer-payments/mutations.ts,
service экспортирует его, прежний commands.ts остаётся совместимым facade.

Hook имеет отдельную lifecycle epoch, включённую в state key. Epoch меняется
синхронно на auth event; layout effect обновляет committed scope до async
completion. Active/key/epoch проверяются до submit/reload и после await.
Двойное нажатие блокируется синхронным lock. Старые pending/busy/error и
callbacks скрываются при смене scope/session; unmount не принимает результат.

Storage сохраняет прежний canonical user/workspace key, payload и requestId;
fence не входит в payload. Serialized load/save/clear проверяют scope и auth
вокруг storage awaits, включая rejection. Clear условен по requestId и не
удаляет newer pending. Unknown outcome и auth cancellation сохраняют команду.
Hook дополнительно закрепляет fence до submit и условно восстанавливает
команду, если его result guard отказал после успешного submit.
Conflict/invalidState/overpayment очищают её только в актуальной сессии.
Если remove завершился, но storage acknowledgement/final guard отказал,
исходная команда восстанавливается только в пустой key. Эта recovery-запись
в исходный durable scope намеренно разрешена после auth cancellation, без RPC,
credentials или перезаписи newer pending. Повтор использует прежний ID и
серверный receipt вместо новой финансовой операции.

## Ограничения

AsyncStorage не предоставляет cross-process compare-and-swap; существующая
serialization действует в одном JS runtime. Guards не отменяют RPC, уже
принятый сервером, или начатый native storage write. Recovery после remove
тоже может отказать при постоянной неисправности storage; crash между remove
и восстановлением не доказан безопасным synthetic tests. Реальные reopen/crash,
SQL/RLS/live auth/конкуренция двух устройств и parity не проверены.
Money strings, capped payments/reversals, attendance/debit и явная late
cancellation с причиной остаются по ADR0059; новых продуктовых решений нет.
