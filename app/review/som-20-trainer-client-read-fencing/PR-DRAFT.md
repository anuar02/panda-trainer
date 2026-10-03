# Подготовленный draft PR

Base: `fix/som-50-template-picker`

Head: `agent/som-20-trainer-client-read-fencing`

Title: `SOM-20: Fence and paginate trainer client reads`

Публикация не подтверждена: GitHub API timeout. Перед повтором проверить существующие PR.

Чтение списка и карточки клиентов могло молча обрезать clients/programs/bookings и использовать auth другой сессии для связанных запросов. Этот пакет фиксирует bearer одного logical read, проверяет owner scope, читает коллекции bounded pages с exact count и валидирует unknown rows до публикации. Read controller/hook очищает stale data при retry/scope/session и подавляет late success/error.

Критерии SOM-20:

- Сделано: UUID actor/workspace/client и owner workspace; pinned Authorization, guards между reads/pages и final guard; logout/user/new session cancellation, отдельный TOKEN_REFRESHED контракт.
- Сделано: deterministic pagination clients/programs/bookings/program exercises, 200/page и 10000/collection; duplicate/count/order/cap/limit дают ошибку вместо partial success.
- Сделано: safe select projections; runtime UUID/scope/client/program relations/revisions/enums/UTC/intervals/units/null/zero; archived/not-found сохранены.
- Сделано: list/details read lifecycle retry/unmount/scope/session; существующие add/invite/program/purchase callbacks сохранены. loadWorkspaceClients совместим с scheduling caller; создание занятия не менялось.
- Сделано: synthetic >500 rows, exact bound/limit, duplicate/foreign/malformed, смена сессии между reads/pages, refresh pinned bearer, late success/error/retry/not-found.
- Сделано: `cd app && npm run check` — typecheck/lint/format зелёные, 1628 tests / 154 suites. `git diff --check` зелёный.
- Сделано: CHANGELOG, минимальный ROADMAP checkpoint, ADR 0075 и `app/review/som-20-trainer-client-read-fencing/README.md`.
- Не проверено: SQL/pgTAP/RLS, live auth/server caps/network, native/browser/devices, visual parity. HTTP pagination не является repeatable-read DB snapshot; equal-count concurrent changes остаются ограничением.
- Не проверено: live Linear issue/project/dependencies/duplicates — callable API отсутствует. Linear не изменялся. graft недоступен; использованы точные файлы из брифа.
- Требует одобрения владельца: экраны и весь SOM-20; synthetic checks не означают приёмку.

Область: workspace-clients read service/локальные validation+controller+hook, два client routes только read lifecycle, свои tests/report и обязательная документация. Auth provider, SQL/types/dependencies, commands/billing/payment/library/history/scheduling не менялись; новый PNG не добавлен. Только synthetic fixtures, реальные данные и платные сервисы не использовались.
