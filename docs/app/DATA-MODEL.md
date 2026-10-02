# Модель данных (Supabase / Postgres)

Статус 01.10.2026: четыре таблицы раздела «Люди и доступ» реализованы миграцией
`20261001090000_identity_and_workspaces.sql`; три таблицы библиотеки — миграциями
`20261001100000_exercise_library.sql` и `20261001101000_starter_catalog.sql`.
Расписание — миграция `20261001110000_schedule_foundation.sql`.
Личные копии программ — `20261001130000_client_programs.sql`.
Журнал и заметки — `20261001140000_workout_journal.sql`.
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
| `trainer_workspaces` | `owner_user_id`, `name`, `timezone`, `training_focus`, `working_days`, `day_start`, `day_end`, `usual_session_minutes` | Одно пространство на тренера в v1; рабочие предпочтения из welcome |
| `client_records` | `workspace_id`, `user_id null`, `display_name`, `phone null`, `archived_at` | Карточка создаётся до регистрации клиента |
| `invitations` | `client_record_id`, `token_hash`, `expires_at`, `accepted_by null`, `accepted_at null`, `revoked_at null` | Токен — только хэш; принятие через RPC |

У всех четырёх таблиц есть revision и audit-поля. INSERT/UPDATE доступны только
для безопасных полей через column grants; прямое изменение владельца, workspace,
связи user_id и audit-полей закрыто. Клиент читает свою карточку, но не пишет её.
Метаданные invitations читает только владелец без token_hash; создание и принятие
реализованы через RPC SOM-21; прямые записи приглашений закрыты. profiles читает/меняет только сам пользователь.
created_by допускает null для системных операций без JWT; Data API не может его
подменить. Версия повышается триггером, проверка base_revision относится к будущим RPC.

`complete_trainer_onboarding` создаёт профиль/пространство/каталог/первого клиента
одной транзакцией; повтор сохраняет прежние данные. Настройки рабочего времени
не запрещают запись вне них. [ADR 0033](decisions/0033-atomic-trainer-onboarding.md).

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
своя revision; изменение состава также повышает revision шаблона.

client_programs и client_program_exercises реализованы как неизменяемые копии
шаблона: имя/описание, версия источника, планы и метаданные упражнений, включая
инструкции. Клиент читает только свои копии. assign_client_program создаёт новый
ID, сохраняет прежние копии и безопасно повторяет команду по request_id;
прямая запись закрыта. [ADR 0029](decisions/0029-client-program-snapshots.md).
Клиентский transport и решение владельца №5 остаются открытыми.

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
schedule_proposals пока хранит контракт; RPC переноса относятся к SOM-27.
В SOM-27 реализованы confirm_booking и cancel_booking для отдельной записи:
подтверждает клиент, отменяет клиент или владелец. Проверяются revision и
завершённый журнал; отмена не меняет остальных участников, pending proposals
становятся withdrawn. Приватный receipt привязан к actor/workspace/request_id.
[ADR 0031](decisions/0031-booking-status-commands.md). RPC переноса ещё открыты.

### Журнал тренировки

| Таблица | Ключевые поля | Примечание |
| --- | --- | --- |
| `workout_instances` | `booking_id`, `source_program_id null`, `finished_at null`, `revision` | Снимок программы на конкретное занятие |
| `workout_exercises` | `workout_instance_id`, `exercise_id`, `exercise_name_snapshot`, `position`, `planned_*`, `replaced_from_id null` | Замена только в этом занятии |
| `set_results` | `workout_exercise_id`, `position`, `reps null`, `seconds null`, `weight_g null`, `author_user_id`, `device_id`, `revision`, `deleted_at` | ID задаёт телефон |
| `session_notes` | `workout_instance_id`, `text`, `revision` | Открыта клиенту |
| `private_notes` | `workout_instance_id` или `client_record_id`, `text` | Только тренер, у клиента нет политики чтения |
| `sync_operations` | `operation_id` (PK), `user_id`, `device_id`, `kind`, `entity_id`, `base_revision`, `applied_at`, `result` | Журнал применённых операций, гарантирует «ровно один раз» |

Шесть таблиц журнала реализованы. IDs задаёт устройство; связи booking/program
проверяют workspace и клиента. workout_instances хранит started_at и ревизию
программы-источника; workout_exercises — снимки техники/плана, skipped и ссылку
на заменённую строку того же журнала. Добавление без плана допускает planned_sets=0.
Результаты допускают незаполненные значения; NULL не равен нулю. Подтверждение
введённого подхода остаётся правилом будущей команды, не признаком наличия строки.
Все прямые записи закрыты. Клиент читает только свой завершённый журнал, включая
подходы и открытые заметки. private_notes и sync_operations читает только владелец.
Таблица receipts ещё не означает реализованную синхронизацию.
[ADR 0030](decisions/0030-journal-read-isolation.md).

### Деньги и посещения

SOM-33 реализован миграцией `20261003090000_attendance_credit_ledger.sql`.

| Таблица | Ключевые поля | Примечание |
| --- | --- | --- |
| `client_purchases` | `workspace_id`, `client_record_id`, `title`, `units`, `price_minor bigint`, `currency`, `expires_on null` | Неизменяемые условия, KZT; создание добавляет grant |
| `attendance_records` | `booking_id`, `service_date`, `status` (`present`/`noshow`/`undone`), `revision`, `cycle` | Одна текущая запись на booking; дата снимка в timezone пространства |
| `attendance_revisions` | `attendance_id`, `revision`, `cycle`, `status`, `service_date`, `reason null` | Неизменяемая история отметок и исправлений |
| `credit_entries` | `purchase_id`, `attendance_id null`, `booking_id null`, `cycle null`, `kind`, `units`, `reason null`, `reverses_entry_id null` | Signed ledger: grant, consume −1, restore +1, charge_late_cancel −1 |
| `private.billing_command_receipts` | `workspace_id`, `actor_user_id`, `request_id`, `command`, `payload`, `result` | Actor-scoped неизменяемые receipts; клиентского API нет |

Остаток пакета — сумма credit_entries, без изменяемого счётчика. Автовыбор:
ближайший expires_on, затем created_at/id; бессрочные пакеты последними.
Eligibility использует scheduled service_date включительно, независимо от времени
отметки; последующая привязка и штраф за неявку используют сохранённую дату.
Отметка без списания разрешена явно; отсутствие подходящего пакета при автовыборе
оставляет посещение непривязанным, без минуса. Поздняя привязка списывает один раз.
Исправление добавляет restore исходного consume или связанного штрафа за неявку.
Новый цикл отметки не изменяется повтором receipt старого цикла.

Неявка и отмена не списывают автоматически. Явный штраф требует публичную причину;
сам по себе он не создаёт посещение. Для отменённого booking без attendance штраф
однократный; отдельная отмена такого штрафа пока не реализована. Composite FK
проверяют workspace/client/booking/purchase. RLS разрешает чтение владельцу и
связанному клиенту только своей карточки; actor IDs закрыты column grants.
Прямые записи запрещены, owner RPC сериализуются на workspace lock.

`payment_entries`, ручная оплата/сторно, долг и представление `client_balances`
остаются планом SOM-34; сейчас их нет в схеме. [ADR 0053](decisions/0053-attendance-credit-ledger.md).

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
| `create_client_record(client_name, client_phone, request_id)` | Реализована: непривязанная карточка владельца workspace, приватный receipt, повтор без дубликата и отказ при смене payload |
| `complete_trainer_onboarding(display_name, workspace_name, selected_focus, selected_days, starts_at, ends_at, session_minutes, first_client_name, first_client_phone)` | Реализована: атомарная первая настройка, actor из auth.uid, повтор без дубликатов и сохранение прежних значений |
| `issue_client_invitation(p_client_record_id, p_token, p_request_id)` | Реализована: только владелец, SHA-256, 7 дней, замена старых ссылок, безопасный повтор без продления срока |
| `revoke_client_invitation(p_invitation_id, p_request_id)` | Реализована: отзыв неиспользованной ссылки владельцем и повтор по request_id |
| `accept_invitation(p_token)` | Реализована: срок, отзыв, одноразовая привязка прежней карточки; тот же аккаунт может повторить, другой — нет |
| `list_my_client_connections()` | Реализована: только собственные активные карточки и отображаемые имена связанных тренеров; без расширения прямого RLS |
| `assign_client_program(client_record_id, template_id, expected_template_revision, request_id)` | Реализована: новая полная копия, проверка версии/связей, неизменные прежние копии и повтор без дубликатов |
| `save_workout_template(template_id, expected_revision, name, description, exercises, request_id)` | Реализована: атомарный состав, проверка версии, повтор по приватному receipt |
| `archive_workout_template(template_id, expected_revision, request_id)` | Реализована: архив с проверкой версии, сохранением состава и безопасным повтором |
| `create_booking_set(client_record_ids, starts_at, ends_at, collision_ack, request_id)` | Реализована: только владелец, tenant-safe создание, предупреждение о пересечении, сериализация и повтор без дубликатов |
| `propose_time(booking_id, starts_at, ends_at, base_revision)` | Устаревшая ревизия → отказ с причиной |
| `respond_to_proposal(proposal_id, accept)` | Атомарная смена времени и ревизии |
| `confirm_booking(booking_id, expected_revision, request_id)` | Реализована: клиент подтверждает свою proposed-запись, проверка версии и безопасный повтор |
| `cancel_booking(booking_id, expected_revision, request_id)` | Реализована: отмена клиентом/тренером сохраняет остальных участников, проверяет версию; без автоматического списания |
| `apply_operations(ops jsonb)` | Каждая операция журнала применяется один раз; конфликты возвращаются, а не затираются |
| `create_client_purchase(client_record_id, title, units, price_minor, request_id, expires_on null)` | Реализована: фиксированные условия и grant атомарно, безопасный повтор |
| `mark_attended(booking_id, expected_booking_revision, request_id, charge false, purchase_id null)` | Реализована: explicit debit, без двойного списания и отрицательного остатка |
| `mark_no_show(booking_id, expected_booking_revision, request_id)` | Реализована: неявка без автоматического списания |
| `bind_attendance_purchase(attendance_id, expected_attendance_revision, expected_booking_revision, request_id, purchase_id null)` | Реализована: позднее однократное списание по сохранённой дате |
| `undo_attendance(attendance_id, expected_attendance_revision, expected_booking_revision, reason, request_id)` | Реализована: однократный restore и append-only история |
| `charge_late_cancellation(booking_id, expected_booking_revision, reason, request_id, purchase_id null)` | Реализована: явный штраф за отмену/неявку, без посещения |
| `add_payment(purchase_id, amount_minor, paid_on, idempotency_key)` | Сумма > 0, запись автора |

## Инварианты, покрытые тестами (`supabase/tests`)

- [ ] Тренер A не читает и не меняет данные тренера B, даже зная ID.
- [ ] Клиент не получает `private_notes` и чужие подходы, в том числе в своей группе.
- [ ] Повторное `accept_invitation` другим аккаунтом отклоняется.
- [x] Двойной `mark_attended` списывает одну единицу; параллельные вызовы не уходят в минус.
- [x] `undo_attendance` возвращает единицу один раз.
- [ ] Повтор `apply_operations` с тем же `operation_id` не создаёт второй подход.
- [ ] Устаревший перенос не перезаписывает более новое согласованное время.
- [ ] Архивированное упражнение остаётся в прошлых журналах и шаблонах.
- [ ] Пересечение `start < other_end and end > other_start`; касание концов — не пересечение.
