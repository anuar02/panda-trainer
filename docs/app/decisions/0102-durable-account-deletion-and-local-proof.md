# 0102. Подтверждённое удаление аккаунта и durable recovery

- Статус: реализовано технически; SQL/Auth/native runtime и приёмка открыты
- Дата: 04.10.2026
- Задача: SOM-41

## Решение

Продуктовое правило — ADR 0101. Удаление всегда относится к проверенному аккаунту,
а не к выбранной роли. Edge handler проверяет JWT через Auth getUser; privileged
RPC доступны только service_role. Inspect выводит фактический own workspace и
связанные карточки. Client-only отвязывает карточки каждого тренера; dual также
удаляет своё пространство. Чужие программы, журналы и финансовая история остаются.
Auth audit-ссылки становятся NULL, бизнес-поля сохраняются. Приглашения всех
отвязываемых карточек удаляются, включая ещё не принятые: старый invite не возвращает
доступ. Ссылки других пользователей и их Auth/profile не удаляются.

SQL делает prepare → database_deleted → complete. Receipt без FK на Auth/workspace
переживает удаление. В нём только request/account UUID, SHA-256 capability, список
own workspace UUID и времена/стадия. Это минимальная служебная запись восстановления
и запрета повторного появления старого account ID, не обещание удаления каждого
идентификатора из системы. Правовое основание и срок этой записи требуют review.
32 случайных байта capability создаёт клиент; подтверждённый intent проверенно
записывается в authStorage до сети. JWT туда не записывается. Сервер хранит только
хэш. После утраты Auth exact status/retry использует исходную capability, без bearer;
при наличии bearer проверяется и его владелец. Чужой/expired bearer не игнорируется.
Status не выполняет удаление. Request identity после unknown не заменяется.

DB/Auth не общая транзакция. Auth failure/lost response оставляет database_deleted;
повтор проверяет прежний receipt и завершает Auth/complete. SQL complete отдельно
проверяет отсутствие auth.users. Handler связывает каждую полученную стадию с
исходным actor/request; непонятный ответ не означает успеха. Нет deployment в пилот.

## Interlock

На всех текущих public/private application tables INSERT/UPDATE/DELETE получают
один transaction advisory lock (410041,1). Row guard запрещает старому actor
писать, возвращать Auth references и менять удаляемый workspace. Lifecycle имеет
закрытый transaction-context в private schema; SET переменной/переданный UUID
не дают immutable bypass. Исключение снимает immutable DELETE только own workspace
и account-private receipts, UPDATE в чужой истории — только audit identity → NULL.
Обычная immutable защита остаётся. Шесть self/cyclic FK становятся deferred для
транзакционного child-first удаления; program-update schema/API не меняются.

Все write callers должны использовать READ COMMITTED. Statement guard и lifecycle
mutations отклоняют другие уровни изоляции: старый snapshot не обходит receipt.
Существующие RPC могут взять row lock до первого write; возможный deadlock откатывает
транзакцию, требует exact retry и не означает завершение удаления. Database owner
DDL/TRUNCATE/отключение triggers — административная граница, не app API.
Новые таблицы/writers обязаны включить guard и lifecycle inventory; pgTAP проверяет
текущий полный набор. Изменения чужих SOM-32 writer-файлов не требуются.

## Локальная граница

Отдельный account-scoped inventory читает все workspace данного account из трёх
SQLite DB и восемь семейств AsyncStorage pending/draft keys. SQLite exclusive read
не объединяет разные DB/сервер в общую транзакцию. Неизвестные scoped keys,
ошибки/лимиты/unsafe credentials не становятся нулём. Все pending/rejected/
conflicts/correction drafts, entry drafts и preload recovery блокируют удаление.
Только структурно валидный confirmed applied receipt считается settled; пустой
library draft и completed exercise marker — подтверждённый пустой остаток.

Local file содержит точные raw rows без credentials, все прежние workspace scope,
SHA-256, bytes и snapshot UUID. File adapter должен сообщить saved/shared и exact
scope/hash/bytes; cancel/error не создают proof. Пользователь отдельно подтверждает
файл и затем удаление. Перед send проверяется тот же fingerprint; новая запись
обесценивает proof. Trainer server export доступен отдельно на экране. Его известные
gaps/unknown globalAtomicity не превращаются в полную резервную копию.

Deletion-specific AsyncStorage fence устанавливается в root до provider startup,
отслеживает шесть scoped mutation методов, блокирует новые own writes и дожидается
inflight. Secure intent восстанавливает запрет при новом запуске. После scoped
logout существующие runner/session fences сохраняются. SQLite tombstones/triggers
блокируют поздние INSERT/UPDATE/DELETE на семи таблицах, включая другие connections.
Новые guards не меняют workout-entry/finish/correction/program business semantics.

После проверенного complete scoped cleanup удаляет только own settled outbox и
sensitive caches; outstanding не purged. В каждой exclusive cleanup transaction
сверяются exact rows, временно снимается tombstone, затем возвращается с исходным
proof hash. Этот durable marker позволяет безопасный повтор частичной cleanup между
DB. Сохраняются pending/чужие данные; общий clear не вводится. При local change/error
остаётся recovery/export, а не автоматическая потеря данных.

Pure preflight ADR 0073 остаётся evaluator препятствий, не authorization. Его
unknown/review-required не преобразуются в allow. Legal/cloud/backup/другие устройства
не выдаются за проверенные доказательства и не закрываются технической реализацией.

## Проверка

[Отчёт](../../../app/review/01-som-41-account-deletion/README.md) содержит команды и
границы: CI SQL/pgTAP/Auth smoke, installed native SQLite/logout/offline, два телефона,
backup/log rotation, юрист, visual/accessibility и owner acceptance ещё требуются.
Политика не опубликована, пилот не изменён, реальные аккаунты не удалялись.
