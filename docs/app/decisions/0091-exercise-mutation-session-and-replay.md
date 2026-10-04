# 0091. Exercise mutations: session fence и durable UUID replay

- **Статус:** Реализовано технически; SQL/runtime и приёмка открыты
- **Дата:** 04.10.2026
- **Задача:** SOM-22

Create/archive exercise используют собственный fence с actor, workspace, JWT sub и
session_id. Identity начинает захватываться при создании operation; подписка
устанавливается до первого await. До/после каждого IO, ошибки и cached success
проверяются scope и identity. TOKEN_REFRESHED разрешён только после захвата той же
identity; bearer обновляется из доказанного refresh для следующего dispatch/retry.
Смена bearer без подтверждающего события отменяет operation. Transport хранит client
и bearer внутри operation; durable payload не содержит токенов. Все mutation rows
проходят runtime validation ID/workspace, дат, revision, measure и полного payload.

Доказанный пробел прежнего create: после committed insert с потерянным ответом,
последующего archive и retry активная уникальность имени больше не предотвращает
вторую строку. Create теперь заранее сохраняет UUID вместе с каноническим input.
Новая migration разрешает только INSERT уже существующей колонки `exercises.id`;
RLS, UPDATE/DELETE grants, схема и генераторные типы не меняются. Retry получает
23505 по прежнему PK даже после archive. Reconciliation сначала проверяет свой UUID
и полный payload в своём workspace, затем — exact active name duplicate, только
если UUID отсутствует. Archived UUID возвращает unavailable и не создаётся заново. Проверенный mismatch
payload после 23505 и свой archived UUID — известные terminal outcomes: provider
возвращает ошибку и очищает pending через тот же guarded storage protocol. При
cleanup failure pending удерживается для retry; malformed/чужие rows terminal proof
не дают.
Изменившийся payload не считается replay; новая команда допустима после известного
исхода прежней. Нормальная политика повторного использования архивного имени прежняя.

Provider exercise commands имеют отдельный scoped storage key и общий с template
commands lock с владельцем. Input/UUID остаются до завершения IO, refresh и storage
clear; другая команда не подменяет pending. При reopen создаётся новый session-fenced
transport с прежними input/UUID. Архив повторяется условным UPDATE archived_at IS NULL;
нулевой результат читает исходный archive date, без второго UPDATE/revision bump.
Template draft/save/archive/read protocol не изменяется.

Storage writes/hydration сериализованы по account/workspace между remount. Перед
логической очисткой пишется pending-clear backup; main получает completion marker.
Непустой main (pending или marker) имеет приоритет. При отсутствующем main используется
backup. Backup сохраняется до следующего завершённого command и не удаляется отдельным
await: это убирает окно потери обоих экземпляров при отказе compensation. Clear failure
или cancellation пытается вернуть main pending в той же очереди и не сообщает success.
Completion marker означает уже известный серверный исход; recovery stale backup при
физической потере main может безопасно повторить прежний UUID/archive.
AsyncStorage не даёт transactional compare-and-set; физический crash и потеря уже
подтверждённых writes здесь не доказаны. Это требуется проверить на устройстве.

Route передаёт lifecycle guard, отменяет operation при unmount и держит selection
в своём scope. Старые results/errors/finally не закрывают новую confirmation и не
освобождают новый lock. Изменений дизайна, новых пользовательских правил, hard delete,
assignment/program/journal mutation, auth provider и зависимостей нет.

Проверки и needs-local-db handoff:
[review](../../app/review/som-22-library-production-finish/README.md).
