# SOM-41 · Серверный экспорт данных тренера

Дата: 03.10.2026. Исходная база схемы: `4758705`; перед PR обновлена до `2ccc2d0`, затем слит `b240675` (оба только документация). Ветка `agent/som-41-trainer-export`.

Реализована только read-only часть SOM-41. UI, удаление аккаунта и документы
приватности — отдельные пакеты; SOM-41 не закрыт. Решение: [ADR 0069](../../../docs/app/decisions/0069-owner-scoped-server-workspace-export.md).

## Контракт

`public.export_trainer_workspace(p_workspace_id uuid) -> jsonb`: SQLSTATE `42501`
для anon/client/foreign/null/unknown workspace. Caller trainer ID отсутствует.
Владелец — `auth.uid()` плюс exact workspace owner check. SECURITY DEFINER нужен
для owner product/audit columns и private notes; существующие RLS не меняются.
Fixed `pg_catalog` path, UTC, ISO; EXECUTE только authenticated.

STABLE чтения и owner check используют snapshot одного statement в одной RPC
транзакции. Нет writes, locking, SQLite access, ack/purge или client projection.
Конкурентное MVCC поведение не проверено runtime в этом контейнере.

Envelope: `format=panda-trainer-workspace`, `version=1`, `workspace_id`,
`owner_user_id`, `exported_at`, `limitations`, `collections`.
Коллекции — UUID ascending (profiles: user_id); JSONB object-key order не API.
Порядок упражнений/подходов восстанавливается по position/requested_position,
не по индексу массива. UUID lowercase, revisions integer; timestamptz — UTC ISO
с микросекундами, date/time отдельно; workspace timezone сохранён. Null не равен 0.
Вес — grams, reps/seconds сохранены; плановые диапазоны остаются строками.
`price_minor` и signed `amount_minor` — canonical decimal strings в диапазоне
PostgreSQL int8. Никогда не приводить их к Number; используйте BigInt/string.

## Coverage фактической схемы

Проверены все `create table` и добавленные columns в действующих migrations
на базе `4758705`: 37 таблиц (27 public, 10 private). 26 public коллекций,
321 явно перечисленное поле. Это частичный server product export, не DB backup.
Полный field contract: `app/src/domain/account-export/schema.ts` и новая migration.

| Таблица                                   | Покрытие / исключения                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `public.profiles`                         | Только профиль auth.uid; глобальные профили клиентов/других тренеров исключены.                                        |
| `public.trainer_workspaces`               | Только checked workspace; timezone и working preferences включены.                                                     |
| `public.client_records`                   | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.invitations`                      | Только по своим client_records; token_hash исключён, safe lifecycle metadata сохранены.                                |
| `private.exercise_catalog`                | Исключён: общий starter catalog; workspace exercises включены.                                                         |
| `public.exercises`                        | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.workout_templates`                | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.template_exercises`               | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.group_sessions`                   | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.bookings`                         | Все свои строки/статусы; request_id и raw request_payload исключены.                                                   |
| `public.schedule_proposals`               | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `private.template_command_receipts`       | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `private.program_assignment_receipts`     | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `public.client_programs`                  | Все сохранённые assignment copies, source template ID/revision; не unstored старые mutable rows.                       |
| `public.client_program_exercises`         | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.workout_instances`                | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.workout_exercises`                | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.set_results`                      | Все свои подходы, включая deleted_at, revisions, position/requested_position, source device, grams/reps/seconds/nulls. |
| `public.session_notes`                    | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.private_notes`                    | Все свои приватные заметки, включая client-only и journal notes.                                                       |
| `public.sync_operations`                  | Исключена: operational receipt/envelope/result; product rows и conflict versions включены.                             |
| `private.booking_status_command_receipts` | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `private.client_creation_receipts`        | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `private.client_invitation_receipts`      | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `public.booking_programs`                 | Все неизменяемые booking snapshots и source template revision.                                                         |
| `public.booking_program_exercises`        | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `private.booking_creation_receipts`       | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `private.booking_reschedule_receipts`     | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `private.booking_command_abandonments`    | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `public.client_purchases`                 | Все покупки, включая expired; price_minor decimal text.                                                                |
| `public.attendance_records`               | Все поля и все строки своего workspace, без фильтра архивов/статусов.                                                  |
| `public.attendance_revisions`             | Вся сохранённая immutable история посещений/исправлений.                                                               |
| `public.credit_entries`                   | Весь ledger: grant/consume/restore/late cancellation, links/reasons/cycles.                                            |
| `private.billing_command_receipts`        | Исключена: служебная идемпотентность/coordination, raw command payload/result.                                         |
| `public.payment_entries`                  | Все immutable payment/reversal строки; signed bigint decimal text.                                                     |
| `public.workout_sync_conflicts`           | Все свои unresolved/resolved строки и обе сохранённые версии.                                                          |
| `public.workout_correction_drafts`        | Все сохранённые на сервере correction operations; не локальный pending.                                                |

Документация DATA-MODEL также описывает future `notifications`, `audit_events`,
`client_balances`: таких таблиц в текущих migrations нет. При их появлении нужен
явный coverage/version update; pgTAP inventory test перестанет проходить.
`auth.*`, storage objects, credentials/identity provider/session tokens не входят.
Raw invite hashes/tokens исключены; UUID авторов/устройств — provenance, не credentials.
Чужой workspace не выбирается через user_id общего клиента: каждый product row
фильтруется по checked workspace (invitations через workspace client_records).

Ограничения payload:

- `server_only_no_local_pending`: только серверный snapshot; локальные pending не включены.
- `operational_receipts_excluded`: sync/command receipts исключены, безопасные invite metadata включены.
- `no_unstored_revision_history`: schema revision не означает наличие прежнего значения; экспортирует только реально сохранённые copies/history/conflicts.
- `auth_credentials_excluded`: auth identities/secrets и invitation tokens/hashes исключены.

## Проверки в контейнере

Используются только синтетические fixtures `example.test`. SQL fixture содержит
два заполненных workspace с одной global client identity и третий пустой workspace.
App fixture — вымышленный JSON, а не результат реального RPC.

```sh
cd app
npm test -- --runTestsByPath tests/account-export/domain.test.ts tests/account-export/service.test.ts
npm run check
npm run db -- test db
```

- Targeted app tests: 47 tests / 2 suites PASS до последней session primitive regression; все 48 export tests включены в окончательный full check.
- Окончательный `npm run check`: exit 0; typecheck, eslint, prettier PASS; 1355 tests / 133 suites PASS (включая 48 export tests).
- `npm run db -- test db`: exit 1, `ECONNREFUSED 127.0.0.1:54322`; SQL/pgTAP не исполнились.
- Docker и psql отсутствуют; Supabase CLI доступен через pinned app dependency, local stack не запущен.
- SQL fixture содержит 177 assertions, все пока **не проверено runtime**.
- Types дополнены вручную только сигнатурой RPC; Supabase client compatibility проверена TypeScript, generation/drift не проверены.
- `graft map`: command not found; каталог `graft/` отсутствует, использован direct migration review.
- Live Linear read недоступен: callable Linear tools отсутствуют. Linear не изменён; объём/зависимости взяты из брифа и repo delivery plan.

App tests проверяют malformed/version/schema/tenant payload, missing fields/collections,
unknown enum states, broken references, unstable order/duplicates, credential keys,
archives/private notes/conflicts/correction drafts, empty workspace, null/zero,
microseconds/timezone, signed bigint boundaries and unsafe numbers, network/RPC
permission errors, logout/account/token changes (включая mutable session object).
App mocks подтверждают transport/validator contract, **не SQL execution или RLS**.

177 pgTAP assertions предназначены для проверки реального authenticated RPC:
inventory/grants/definer/STABLE/config; counts и UUID order всех 26 populated
коллекций; две isolated workspace/common-client identity; отказ anon/client/foreign,
unknown/null workspace и absent auth.uid; temp-table search_path attack;
private notes/archives/tombstones, precision и history/storno/conflict versions;
повторный read-only export и пустой workspace (starter library всё ещё существует).

## Команды для локального Supabase

Запускать на отдельном локальном окружении с Docker и только fixtures.
Reset удаляет данные локальной БД; это процедура тестового стека, не production.

```sh
cd app
npm ci
npm run db -- start
npm run db -- db reset --local
npm run db -- db lint --local --fail-on warning
npm run db -- test db supabase/tests/database/trainer_workspace_export.test.sql
npm run db -- test db
npm run db:types:check
npm run check
npm run db -- stop
```

При CLI path resolution запускать targeted test из корня явно:

```sh
app/node_modules/.bin/supabase --workdir . test db supabase/tests/database/trainer_workspace_export.test.sql
```

Нужно дополнительно проверить SQL runtime/полный pgTAP regression, drift типов,
concurrent export при journal/billing mutation (один MVCC snapshot), real API
grants/ошибки, synthetic pilot-sized payload/timeouts. Эти результаты не заявлены.
Браузер, iOS/Android/native/visual, real server/deployment и приёмка владельца
не проверены; UI не изменён и экраны не объявлены принятыми.

## Handoff: будущий UI и удаление

Интегратор передаёт актуальный typed Supabase client и account/workspace snapshot
в `loadAccountExport(transport, { expectedUserId, workspaceId })`. Провайдер/маршрут
не добавлены. Успех — только валидный `AccountExport`; `AccountExportError.code`
различает invalidInput/unauthenticated/forbidden/network/request/sessionChanged/
unsupportedVersion/malformedPayload/tenantMismatch. UI позже локализует сообщения.
Refresh во время запроса даёт sessionChanged; допустим новый read с новой сессией.
Service не сохраняет файл и не показывает «экспортировано». UI должен отдельно
обработать фактическое сохранение/поделиться и отмену, после owner acceptance.

Перед удалением нужен отдельный список несинхронизированных устройств/операций,
local export/ack contract и явное подтверждение владельца. Этот RPC никогда
не читает и не очищает SQLite, не подтверждает локальные операции, не доказывает
готовность к deletion и не восстанавливает pending потерянного телефона.
Срок хранения до удаления аккаунта и ротация backup до 7 дней — ADR 0064;
экспорт сам не меняет retention и не реализует backup deletion.

## Проверка координатора

03.10.2026: влита база 16eaf8f с SOM-30; CHANGELOG/ROADMAP сохраняют обе стороны.
Коллизия номера export ADR исправлена переименованием в 0069 и обновлением ссылок.
Независимое SQL/security ревью подтвердило явную owner проверку, workspace filters,
STABLE snapshot, minimal grants и bigint text; статических блокеров не найдено.
Координатор проверил typed validation/session fencing, scope, ссылки и отсутствие
any/комментариев в новом app коде, новых PNG/секретов.
`cd app && npm run check` — PASS: typecheck/lint/format, 1430 tests / 142 suites.
`git diff --check` — PASS. SQL/pgTAP runtime, generated drift, concurrent MVCC
и pilot volume остаются непроверенными. UI/deletion/юридический review открыты;
privacy drafts уже влиты PR #27, это не их одобрение или закрытие SOM-41.
