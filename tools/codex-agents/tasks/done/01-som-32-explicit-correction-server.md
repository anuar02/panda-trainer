# SOM-32 · Явное исправление завершённого журнала: сервер, клиент и тесты

Linear: https://linear.app/something-great/issue/SOM-32

## Контекст

SOM-28/29/31 и sync revision fixes уже в fix/som-50-template-picker;
SOM-31 r2 PR42 влит980e149, локальная DB evidence2e55df7. ADR0061 и решения
SOM-53/56/58 закрыты: записи завершённого журнала не применяются автоматически,
хранятся correction drafts, тренер явно подтверждает исправление.
Сейчас workout_correction_drafts хранит operation, но нет RPC для применения.
Этот пакет выполняется после production-finish, однако не зависит от его кода:
finished journals и drafts уже поддерживаются влитым серверным контрактом.
Перед работой проверить отсутствие нового эквивалентного RPC в свежей базе.

## Критерии

- [ ] Новая migration после всех существующих timestamps добавляет узкий public
  owner-only RPC явного применения существующего correction draft: expected actor,
  workspace/workout/draft, expected revisions и requestId. Установить точный API
  в ADR. Никакого автоматического применения, прямые DML для authenticated закрыты.
  Security definer/search_path/grants/RLS и tenant-safe связи как в existing RPC.
- [ ] Transaction/locks сериализуют исправление с обычным sync и другим исправлением;
  stale/foreign/not-found/invalid draft fail closed. Kind/payload/entity/workout
  provenance проверяется по existing operation contract; не доверять stored JSON
  без runtime SQL validation. resolve_conflict draft сохраняет выбранную версию
  и проверяет original conflict/snapshot, не обходит доступ или revision policy.
- [ ] RequestId receipt immutable: повтор одинакового запроса возвращает тот же
  исход без повторного изменения; другой payload с прежним ID отклоняется.
  Draft нельзя применить дважды под разными ID. Сохранить original draft/operation,
  audit до/после/actor/время и исходный finished timestamp; частичный failure rollback.
  Применение не создаёт ещё один correction draft вместо исправления.
- [ ] Исправлять только данные журнала в рамках ADR0061: private/shared note policy,
  nullable/zero/exact units, sets/replacements/tombstones и revisions сохраняются.
  Не менять booking status/attendance/debit/пакеты/личную программу. Не открывать
  завершённый журнал клиенту в промежуточном состоянии. touch_updated_at уже
  увеличивает revision: не добавлять лишний increment/пустой update ради версии.
- [ ] Additive types и standalone typed transport нового RPC: expected auth session,
  JWT sub/session_id, explicit bearer, guards до/после result/error, verified refresh;
  immutable canonical input/requestId и validated response. Credentials не входят
  в payload/results/errors/keys. Подключить explicit UI и durable command store согласно критериям ниже;
  реальные receipts/concurrency проверяет DB, не transport mocks.
- [ ] pgTAP cases anon/client/non-owner/foreign workspace, malformed draft, stale
  revisions/conflict snapshot, повтор/same ID different input/two IDs one draft,
  все supported kinds включая notes и resolve_conflict, rollback/finished visibility.
  Добавить реальный concurrency harness по existing Python образцу и точные команды.
  Synthetic transport tests auth races/relogin/refresh/malformed responses/lost result
  replay same ID; existing app tests зелёные.

## Разделение работы

До трёх субагентов по tools/codex-agents/SUBAGENTS.md; если файла нет, свежие узкие
контексты/исключительное владение. Сервер implementation одному, app transport/command/UI
второму, независимые SQL/app tests третьему. Lead фиксирует API,
types/docs, интеграцию и полный npm run check. Не давать двум агентам один файл.

## Клиентские критерии целого пакета

Это вторая крупная часть SOM-32 после текущего production-finish: весь сценарий
явного исправления (server+client+tests), а не отдельный контракт. После finish
той же очереди сохранить его публичное поведение. Общий SOM-32 больше дня;
selective program update остаётся заблокированным immutable-copy/provenance
решением, его не угадывать и весь issue не объявлять завершённым.

- [ ] Тренер видит сохранённый correction draft и обе релевантные версии/изменения,
  явно подтверждает конкретное исправление; нет auto-apply при входе/retry или
  фиктивного applied success. Группа участников/workspace изолирована.
- [ ] Один durable requestId/canonical payload+expected revisions на команду;
  storage failure не success, lost response/reopen/retry не создают другую команду.
  Reconciliation только validated receipt своего actor/workspace/draft. Conditional
  clear не удаляет новую команду; uncertainty сохраняет старый exact replay.
- [ ] Caller JWT sub/session_id/generation закреплены до dispatch; verified refresh
  работает, logout/relogin/смена участника/unmount скрывают old draft/error/result,
  не навигируют/не очищают новую команду. Explicit conflict/not-found/revision state.
- [ ] После подтверждённого server apply перечитать finished journal/видимый статус
  correction draft без изменения исходного finish timestamp; private/shared policy
  и клиентская finished-only видимость сохраняются. Нет auto-debit/attendance/program update.
- [ ] Independent service/store/hook/screen tests явного просмотра→подтверждения→
  результата, lost response/retry/reopen seam, double tap/clear failure/late error,
  relogin/refresh/participant switch и stale revision. SQL runtime/read-after-write
  не объявлять доказанным mocks. SQL lint/pgTAP/concurrency/type drift — CI/local DB gate.

## Границы

Новые correction-specific migrations/SQL tests/concurrency harness, отдельный
features/workout-corrections модуль transport/session/types/command-store/hooks/UI,
additive database.types.ts signatures, узкая интеграция correction controls с
workout-entry после предыдущего finish этого же аккаунта. Свои tests/review/minimal
ADR/docs/i18n. Existing migrations не менять; replacement SQL только новой migration
и с сохранением ordinary sync regressions. Existing sync/preload/entry storage,
runner/transport/save/ack protocols не менять; новый correction store отдельный.
Не менять clients/library (work), financial/client-scheduling/invitations (personal),
assignment/programs/client reads, auth provider, export (следующая независимая задача),
deps/prototype/seed/config. Selective personal-program update исключён до решения
immutable-copy semantics/provenance. Shared docs минимально. SQL PR при local DB
gate остаётся needs-local-db, зависимости от него другим аккаунтам не ставить.

## Источники и проверки

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR0007/0029/0061/0066, DATA-MODEL/ARCHITECTURE, existing migrations03120000/03140000
и workout sync concurrency/pgTAP fixtures, snapshot export SQL-shaped forms.
Graft map/ask если доступен, иначе зафиксировать отсутствие. Свежая база обязательна;
невлитые ветки не dependencies. Продуктовую policy не придумывать.

- [ ] cd app && npm run check зелёный, CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/som-32-explicit-correction-server/README.md: точные команды/результаты,
  SQL/not-run handoff, ADR со свободным номером. App без comments/any/секретов/PNG.

Нет Docker/Supabase/браузера/native: SQL/pgTAP/concurrency/db lint/generated drift
здесь НЕ исполняются. Не выдавать static review за runtime proof. Draft PR
agent/01-som-32-explicit-correction-server только в fix/som-50-template-picker,
заголовок SOM-32; coordinator передаст needs-local-db, Claude проверит/вольёт локально.
UI synthetic tests обязательны; native/приёмка не проверены. Только synthetic fixtures, без платных сервисов
и реальных данных. Не задавать вопросов, не менять Linear/scripts/rules/main.
SOM-32 и экраны целиком не объявлять завершёнными или принятыми.
