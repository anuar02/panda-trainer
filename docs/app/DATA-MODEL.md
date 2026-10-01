# Модель данных (Supabase / Postgres)

Статус 01.10.2026: четыре таблицы раздела «Люди и доступ» реализованы миграцией
`20261001090000_identity_and_workspaces.sql`; три таблицы библиотеки — миграциями
`20261001100000_exercise_library.sql` и `20261001101000_starter_catalog.sql`.
Расписание — миграция `20261001110000_schedule_foundation.sql`.
Остальные таблицы пока проект.
Источник истины — `supabase/migrations/`. [Границы записи, типы и seed](decisions/0025-identity-rls-foundation.md).

Основа: `trainer-crm-agent-plan.md` §3–§4 и `prototype-fresh/SYNC-DESIGN.md`.

## Общие правила

- Первичные ключи — `uuid`. Для сущностей журнала ID генерирует телефон (uuid v7),
  чтобы запись без сети имела стабильный ID.
- Время — `timestamptz`. Отображение в зоне `Asia/Almaty`; смещение не хранится
  в бизнес-логике.
- Деньги — `bigint` в тиынах + `currency text default 'KZT'`.
- Вес — `integer` в граммах, чтобы не было ошибок округления; в интерфейсе с запятой.
- Пустое значение — `null`, не `0`.
- Удаление важных записей — `archived_at` / `deleted_at`, не физический `delete`.
- У изменяемых сущностей есть `revision integer` для проверки устаревших правок.
- `created_at`, `updated_at`, `created_by` у всех таблиц.

## Таблицы

### Люди и доступ

| Таблица | Ключевые поля | Примечание |
| --- | --- | --- |
| `profiles` | `user_id` → `auth.users`, `display_name`, `locale` | Один пользователь может быть и тренером, и клиентом |
| `trainer_workspaces` | `owner_user_id`, `name`, `timezone` | Одно пространство на тренера в v1 |
| `client_records` | `workspace_id`, `user_id null`, `display_name`, `phone null`, `archived_at` | Карточка создаётся до регистрации клиента |
| `invitations` | `client_record_id`, `token_hash`, `expires_at`, `accepted_by null`, `accepted_at null` | Токен — только хэш; принятие через RPC |

У всех четырёх таблиц есть revision и audit-поля. INSERT/UPDATE доступны только
для безопасных полей через column grants; прямое изменение владельца, workspace,
связи user_id и audit-полей закрыто. Клиент читает свою карточку, но не пишет её.
Метаданные invitations читает только владелец без token_hash; создание и принятие
через RPC ещё не реализованы (SOM-21). profiles читает/меняет только сам пользователь.
created_by допускает null для системных операций без JWT; Data API не может его
подменить. Версия повышается триггером, проверка base_revision относится к будущим RPC.

### Библиотека и программы

| Таблица | Ключевые поля | Примечание |
| --- | --- | --- |
| `exercises` | `workspace_id`, `name`, `name_normalized`, `muscle_group`, `equipment`, `source_key null`, `measure` (`reps`/`seconds`), `bodyweight`, `archived_at` | Уникальность по `(workspace_id, name_normalized)` среди неархивных |
| `workout_templates` | `workspace_id`, `name`, `revision`, `archived_at` | Имя не идентификатор |
| `template_exercises` | `workspace_id`, `template_id`, `exercise_id`, `position`, `planned_sets`, `planned_reps`, `planned_seconds`, `planned_weight_g`, `rest_seconds`, `note` | |
| `client_programs` | `client_record_id`, `base_template_id`, `base_template_revision`, `name`, `revision` | Личная копия шаблона |
| `client_program_exercises` | как `template_exercises` + `client_program_id` | |

Реализованы exercises, workout_templates и template_exercises. Каталог из 81
упражнения копируется в новое пространство; источник и границы —
[ADR 0026](decisions/0026-workspace-library.md). Шаблон хранит ссылки на упражнения
того же workspace, включая архивные. Клиент не получает прямого доступа к
библиотеке тренера. planned_reps/planned_seconds хранят строку числа или диапазона;
ровно одно поле заполнено и соответствует единице упражнения. Единица недоступна
для прямого UPDATE, чтобы не нарушать сохранённые планы. У строк состава есть
своя revision; изменение состава также повышает revision шаблона. client_programs и клиентский transport ещё не реализованы.

С SOM-23 запись шаблонов/состава закрыта для прямых запросов, включая column
grants. save_workout_template атомарно заменяет состав с проверкой revision;
archive_workout_template сохраняет строки. Приватные receipts позволяют повторить
успешную команду без дубликатов. [ADR 0028](decisions/0028-atomic-template-commands.md).

### Расписание

| Таблица | Ключевые поля | Примечание |
| --- | --- | --- |
| `group_sessions` | `workspace_id`, `starts_at`, `ends_at` | Общее время мини-группы при создании |
| `bookings` | `workspace_id`, `client_record_id`, `group_session_id null`, `starts_at`, `ends_at`, `status` (`proposed`/`confirmed`/`cancelled_by_client`/`cancelled_by_trainer`), `revision` | Запись одного клиента |
| `schedule_proposals` | `booking_id`, `author_user_id`, `proposed_starts_at`, `proposed_ends_at`, `base_revision`, `status` (`pending`/`accepted`/`declined`/`withdrawn`/`stale`) | Прежнее время действует до принятия |

Три таблицы расписания включают RLS. Прямая запись закрыта; create_booking_set
создаёт предложенные bookings для активных своих клиентов, при нескольких
участниках — общую group_session. Коллизии требуют явного подтверждения тренера.
Внутренние request_id/request_payload закрыты column grants.
[Блокировки, повторы и границы](decisions/0027-server-schedule-foundation.md).
schedule_proposals пока хранит контракт; RPC переноса/отмены относятся к SOM-27.

### Журнал тренировки

| Таблица | Ключевые поля | Примечание |
| --- | --- | --- |
| `workout_instances` | `booking_id`, `source_program_id null`, `finished_at null`, `revision` | Снимок программы на конкретное занятие |
| `workout_exercises` | `workout_instance_id`, `exercise_id`, `exercise_name_snapshot`, `position`, `planned_*`, `replaced_from_id null` | Замена только в этом занятии |
| `set_results` | `workout_exercise_id`, `position`, `reps null`, `seconds null`, `weight_g null`, `author_user_id`, `device_id`, `revision`, `deleted_at` | ID задаёт телефон |
| `session_notes` | `workout_instance_id`, `text`, `revision` | Открыта клиенту |
| `private_notes` | `workout_instance_id` или `client_record_id`, `text` | Только тренер, у клиента нет политики чтения |
| `sync_operations` | `operation_id` (PK), `user_id`, `device_id`, `kind`, `entity_id`, `base_revision`, `applied_at`, `result` | Журнал применённых операций, гарантирует «ровно один раз» |

### Деньги и посещения

| Таблица | Ключевые поля | Примечание |
| --- | --- | --- |
| `purchases` | `client_record_id`, `title`, `units_total`, `price_minor`, `currency`, `expires_on null` | Условия зафиксированы на момент покупки |
| `payment_entries` | `purchase_id`, `amount_minor`, `paid_on`, `source` (`manual`), `author_user_id`, `reverses_id null` | Исправление — новая запись-сторно |
| `attendance` | `booking_id` (unique), `attended_at`, `marked_by`, `undone_at null` | Посещение отдельно от оплаты и списания |
| `credit_entries` | `client_record_id`, `purchase_id null`, `booking_id null`, `kind` (`grant`/`consume`/`restore`/`charge_late_cancel`), `units`, `reason null`, `idempotency_key` (unique) | Остаток = сумма записей; `charge_late_cancel` требует причину |

Представление `client_balances`: остаток единиц по пакетам и сумма долга по покупкам.

### Уведомления и аудит

| Таблица | Ключевые поля |
| --- | --- |
| `notifications` | `recipient_user_id`, `kind`, `payload jsonb`, `read_at null` |
| `audit_events` | `workspace_id`, `actor_user_id`, `entity`, `entity_id`, `action`, `before jsonb`, `after jsonb` |

## Права доступа (RLS)

Вспомогательные функции (`security definer`, `stable`):

- `is_workspace_owner(workspace_id)` — текущий пользователь владеет пространством.
- `my_client_record_ids()` — карточки, привязанные к текущему пользователю.

| Данные | Тренер-владелец | Клиент |
| --- | --- | --- |
| Карточка клиента | чтение/запись | чтение своей |
| Упражнения, шаблоны | чтение/запись | чтение только через снимки своих занятий |
| Занятия, предложения | чтение/запись через RPC | чтение своих, предложения через RPC |
| Журнал, подходы, `session_notes` | чтение/запись через RPC | чтение своих |
| `private_notes` | чтение/запись | **нет доступа** |
| Покупки, оплаты, списания | чтение, запись через RPC | чтение своих |
| Уведомления | свои | свои |
| Аудит | чтение своего пространства | нет |

Участник мини-группы не видит записи других участников: доступ к `bookings` и
результатам проверяется по `client_record_id`, а не по `group_session_id`.

## RPC-функции v1

| Функция | Что гарантирует |
| --- | --- |
| `accept_invitation(token)` | Срок, одноразовость, привязка к существующей карточке |
| `save_workout_template(template_id, expected_revision, name, description, exercises, request_id)` | Реализована: атомарный состав, проверка версии, повтор по приватному receipt |
| `archive_workout_template(template_id, expected_revision, request_id)` | Реализована: архив с проверкой версии, сохранением состава и безопасным повтором |
| `create_booking_set(client_record_ids, starts_at, ends_at, collision_ack, request_id)` | Реализована: только владелец, tenant-safe создание, предупреждение о пересечении, сериализация и повтор без дубликатов |
| `propose_time(booking_id, starts_at, ends_at, base_revision)` | Устаревшая ревизия → отказ с причиной |
| `respond_to_proposal(proposal_id, accept)` | Атомарная смена времени и ревизии |
| `cancel_booking(booking_id, reason)` | Отмена одного участника не трогает группу |
| `apply_operations(ops jsonb)` | Каждая операция журнала применяется один раз; конфликты возвращаются, а не затираются |
| `mark_attended(booking_id, purchase_id null, idempotency_key)` | Одно списание; блокировка пакета; без пакета — непривязанное посещение |
| `undo_attendance(booking_id, reason)` | Возврат единицы ровно один раз, история сохраняется |
| `add_payment(purchase_id, amount_minor, paid_on, idempotency_key)` | Сумма > 0, запись автора |

## Инварианты, покрытые тестами (`supabase/tests`)

- [ ] Тренер A не читает и не меняет данные тренера B, даже зная ID.
- [ ] Клиент не получает `private_notes` и чужие подходы, в том числе в своей группе.
- [ ] Повторное `accept_invitation` другим аккаунтом отклоняется.
- [ ] Двойной `mark_attended` списывает одну единицу; параллельные вызовы не уходят в минус.
- [ ] `undo_attendance` возвращает единицу один раз.
- [ ] Повтор `apply_operations` с тем же `operation_id` не создаёт второй подход.
- [ ] Устаревший перенос не перезаписывает более новое согласованное время.
- [ ] Архивированное упражнение остаётся в прошлых журналах и шаблонах.
- [ ] Пересечение `start < other_end and end > other_start`; касание концов — не пересечение.
