# SOM-41 · Контракт preflight будущего удаления

04.10.2026: это исторический pure evaluator ADR 0073, не delete authorization.
Реализованный runtime описан в [ADR 0103](../decisions/0103-durable-account-deletion-and-local-proof.md)
и [handoff](ACCOUNT-DELETION-HANDOFF.md). Продуктовый shared/dual gate заменён ADR
0101; unknown/review-required этого evaluator не превращены в allow. Внешние
legal/cloud/native/backup/log/other-device доказательства не объявлены имеющимися.


03.10.2026; база `9d1802a`, отдельный технический пакет.
[Evaluator](../../../app/src/domain/account-deletion/index.ts),
[синтетические тесты](../../../app/tests/account-deletion/preflight.test.ts),
[отчёт](../../../app/review/som-41-deletion-contract/README.md),
[ADR 0073](../decisions/0073-pure-account-deletion-preflight.md).
Это выявление препятствий. Runtime удаления, endpoint/RPC, purge, local collectors,
UI и integration отсутствуют; SOM-41 остаётся открытым.

## Вход и результат

`evaluateDeletionPreflight(input: unknown, expected: unknown)` — pure evaluator,
без React, сети, часов, Auth или подключения хранилищ. `DeletionEvidence` и
`PreflightContext` дают типизированный контракт для будущего вызывающего кода.
`version: 1`; контекст задаёт scopeKind, account/workspace/session, `now` и
положительный `maxAgeMs`, без значений по умолчанию. Время — целые миллисекунды;
это локальная проверка свежести, не доверенное серверное время. Возраст ровно
maxAgeMs допускается; будущий или старый снимок даёт unknown.

`scopeKind` различает trainer-workspace и client-account. Scope содержит три
обязательных непрозрачных идентификатора (1–128 ASCII букв/цифр/`_`/`-`), не токены.
Смена любого ID — blocked; возврат в тот же аккаунт с новой сессией не подтверждает
предыдущие данные. Client-account сам по себе требует отдельного review.

Вход содержит агрегированную inventory: pending, rejected, conflict и
correctionDraft. Каждый счётчик — `{ state: 'known', count: N }` либо
`{ state: 'unknown' }`. N — неотрицательное safe integer. Ноль означает только
явно прочитанный нулевой остаток; ошибка чтения, пропущенный источник или unknown
не становятся нулём. Положительные остатки blocked, даже при наличии export/ack.
`receipt` различает settled, inflight, unknown и timeout. Inflight блокирует;
timeout/unknown оставляют результат неизвестным. Это aggregate assertion будущего
collector, а не receipt payload и не разрешение повторить mutation с новым ID.

`localExport` и `localAcknowledgement` отдельно имеют missing, unknown или
present с полным scope и snapshotId. Оба обязаны совпасть с текущим контекстом и
inventory snapshotId. Новая локальная запись должна породить новый snapshotId и
обесценить старый export/ack. Даже при известных нулях отсутствие proof блокирует.
Proof здесь — проверяемое соответствие метаданных, не криптографическая подпись,
не проверка содержимого файла и не реализованное подтверждение пользователя.
Будущий collector обязан доказать полноту снимка/выгрузки/ack и их устойчивость.
Серверный export не входит в input и не заменяет local proof.

Shared client account и trainer-as-client при yes всегда добавляют review-required;
unknown требует данных, no — явное утверждение collector, не скрытое одобрение.
Флаги нельзя выводить из выбранной UI-роли. Даже для удаления одного workspace
нужно проверить связи общего аккаунта у других тренеров.

Восемь external gates обязательны и различаются: backup, logs, otherDevices,
nativeStorage, legal, serverIdentity, databaseAuthRecovery, mutationInterlock.
Для каждого допустимы unknown, evidence-present, review-required. Наличие метаданных
внешнего доказательства всё равно требует review; evaluator его не верифицирует
и не превращает в approval. Сроки/ротация, найденный offline телефон, native purge,
личность на сервере и recovery не подтверждаются этим input.

| Результат       | Значение                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| unknown         | Есть неизвестность или malformed input; нужно получить достоверные данные       |
| blocked         | Есть конкретное препятствие, включая scope/proof mismatch или локальные остатки |
| review-required | Локальные проверки не нашли blocking/unknown, внешние gates требуют review      |

При сочетании состояний общий приоритет blocked → unknown → review-required;
все структурированные причины сохранены, в том числе shared/dual-role review при
blocked/unknown. Ready состояния нет. `deleteAuthorized: false` и
`serverIdentityVerified: false` возвращаются всегда. Результат не является
серверной авторизацией, доказательством личности или разрешением удалить данные.

## Fail-closed и безопасная диагностика

На каждом уровне проверяются точные поля и discriminants. Null, массивы,
нестандартные прототипы, accessors, symbol keys, лишние поля, payload/credentials,
неполные proofs, некорректные числа и исключения чтения дают unknown. Context
проверяется отдельно. Нет coercion, исключений с входным текстом или default approvals.
В production boundary следует передавать plain data snapshot; живой mutable
Proxy не является доверенным transport или collector.

Результат содержит только фиксированные code/state/subject, без входных IDs,
счётчиков, произвольного текста, credentials, приватных заметок и export payload.
Максимум 25 причин, без расширяемого массива операций. Строки — машинные коды;
пользовательских текстов нет. Будущая UI интеграция должна отображать их через i18n.

Группы кодов:

- Валидация/свежесть: malformedEvidence, malformedContext, staleEvidence, futureEvidence.
- Scope: scopeMismatch, accountMismatch, workspaceMismatch, sessionMismatch.
- Локальное состояние: inventoryUnknown, localOutstanding, receiptInflight,
  receiptUnknown, receiptTimeout; subject различает четыре inventory категории.
- Роли: clientAccountReview, relationshipUnknown, sharedClientReview, dualRoleReview.
- Proof: localProofMissing, localProofUnknown, proofScopeMismatch, proofSnapshotMismatch;
  subject различает localExport и localAcknowledgement.
- Внешнее: externalEvidenceUnknown, externalReviewRequired; subject — конкретный gate.

## Coverage для будущего collector

[DATA-LIFECYCLE](DATA-LIFECYCLE.md) остаётся coverage checklist, не меняется этим
пакетом. Inventory должна агрегировать **все** scoped источники раздела
«Устройство, память и копии»: SQLite projection/outbox, AsyncStorage drafts и
pending library/program/scheduling/billing, in-memory формы и незавершённые команды.
Конфликты, rejected и correction drafts не удаляются молча и не исчезают после ack.
Серверные conflicts/correction drafts/receipts карты также требуют инвентаризации.
Непрочитанный источник означает unknown соответствующего счётчика.

SecureStore chunks, web sessionStorage, invitation bearer token, cache, demo keys,
настройки, WAL/sidecars относятся к nativeStorage review; downloaded export,
OS/browser backup и offline/lost устройства — к otherDevices и backup. Агрегированные
счётчики не доказывают очистку этих копий. Не добавлен collector и не заявлена
проверка нынешних local stores. Backend export coverage E проверяется отдельно;
preflight не объявляет E или D реализованными.

## Фактические препятствия схемы на базе 9d1802a

Таблица ниже — статическая сверка исходников. RESTRICT отличается от default
NO ACTION; ни одно не является автоматическим scoped cascade. Перед runtime
пакетом переснять catalog и все migrations, включая parallel PR #34.

| Coverage DATA-LIFECYCLE                  | Источник и spans                                                                                                                                                            | Реальное препятствие                                                                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth/profile/workspace/cards/invitations | [identity](../../../supabase/migrations/20261001090000_identity_and_workspaces.sql), строки 3–50                                                                            | profiles.user_id CASCADE; workspace.owner_user_id RESTRICT; card.workspace_id RESTRICT; card.user_id SET NULL сохраняет карточку; invitations.card CASCADE, accepted_by RESTRICT; created_by без ON DELETE — NO ACTION         |
| Library/templates                        | [library](../../../supabase/migrations/20261001100000_exercise_library.sql), 49–122; [template commands](../../../supabase/migrations/20261001120000_template_commands.sql) | Template состав ссылается на template/exercise через RESTRICT; receipt coverage отдельно; архивирование не убирает FK                                                                                                          |
| Personal programs                        | [programs](../../../supabase/migrations/20261001130000_client_programs.sql), 3–66                                                                                           | Program → card/template, child → program/exercise: composite scope FK RESTRICT, Auth created_by NO ACTION                                                                                                                      |
| Groups/bookings/proposals                | [schedule](../../../supabase/migrations/20261001110000_schedule_foundation.sql), 6–65                                                                                       | Booking → card/group, proposal → booking RESTRICT; proposal.author_user_id и created_by ссылаются на Auth                                                                                                                      |
| Booking snapshots                        | [snapshots](../../../supabase/migrations/20261002100000_booking_program_snapshots.sql), 3–49                                                                                | Program → booking/template, child → snapshot/exercise RESTRICT; удалять snapshots до bookings/library                                                                                                                          |
| Journals/results/both note kinds         | [journal](../../../supabase/migrations/20261001140000_workout_journal.sql), 11–204                                                                                          | Instance → booking/program; exercises → instance/library; replaced_from_id self-link RESTRICT; sets → exercise; public/private notes → instance, private notes также → card; author/created_by Auth; touch_updated_at triggers |
| Sync/conflicts/correction drafts         | [journal](../../../supabase/migrations/20261001140000_workout_journal.sql), 179–190; [sync](../../../supabase/migrations/20261003120000_workout_sync.sql), 2–23             | sync_operations workspace/user RESTRICT; conflict/correction → workspace/instance default NO ACTION; envelope/result могут содержать приватные данные                                                                          |
| Purchases/attendance/revisions/credits   | [ledger](../../../supabase/migrations/20261003090000_attendance_credit_ledger.sql), 5–65                                                                                    | Composite FK RESTRICT к card/booking/purchase/attendance; credit.reverses_entry_id self-link RESTRICT; Auth created_by RESTRICT; immutable BEFORE UPDATE OR DELETE и attendance BEFORE DELETE без исключения для deletion      |
| Payments/reversals                       | [payments](../../../supabase/migrations/20261003100000_manual_payments.sql), 3–45                                                                                           | Purchase FK и reversal self-link RESTRICT; created_by Auth RESTRICT; payment_history_immutable отклоняет DELETE; reversal validator на INSERT не разрешает cleanup                                                             |
| Private receipts/abandonments            | [receipts sources](DATA-LIFECYCLE.md)                                                                                                                                       | workspace FK RESTRICT; большинство actor_user_id Auth RESTRICT; booking_command_abandonments.booking_id RESTRICT; billing receipts также immutable; JSON request/result нельзя переносить в диагностику                        |

Private receipts покрыть отдельно: template_command_receipts,
program_assignment_receipts, booking_creation_receipts, booking_status_command_receipts,
booking_reschedule_receipts, client_creation_receipts, client_invitation_receipts,
billing_command_receipts, booking_command_abandonments. Точные определения:
[templates](../../../supabase/migrations/20261001120000_template_commands.sql),
[programs](../../../supabase/migrations/20261001130000_client_programs.sql),
[creation](../../../supabase/migrations/20261002105000_creation_receipts_before_reschedule.sql),
[status](../../../supabase/migrations/20261001150000_booking_status_commands.sql),
[reschedule](../../../supabase/migrations/20261002110000_booking_reschedule_commands.sql),
[client creation](../../../supabase/migrations/20261001170000_create_client_record.sql),
[invites](../../../supabase/migrations/20261001180000_client_invitations.sql),
[ledger](../../../supabase/migrations/20261003090000_attendance_credit_ledger.sql),
[abandonments](../../../supabase/migrations/20261002140000_booking_request_resolution.sql).

`touch_updated_at` повышает revision при любом UPDATE
(identity, строки 55–65). Попытка «без изменения revision» не нейтральна.
Не предлагать отключение triggers, blanket cascade/clear или обычный DELETE как
готовый обход immutable истории. Scoped privileged lifecycle exception и её
правила/тесты — отдельное будущее решение новой migration, старые не менять.

## Предлагаемая последовательность будущих стадий

Это технические зависимости для review, не исполняемый алгоритм и не обещание атомарности.

1. Решения владельца/специалиста: shared client/dual role, оператор/контакты,
   правовые основания/сроки/права, retention исключения, local export/ack UX.
2. Серверная проверка личности и ownership; независимое перечитывание связей.
   Доказать preservation workspace B/shared client при удалении A. Спроектировать
   deletion-vs-mutations interlock на сервере и устройствах до финального снимка.
3. Остановить/fence runner с новой sessionId; собрать все источники карты,
   exact retry с прежним ID/envelope после timeout. Получить local export/ack
   конкретного snapshot, явный разбор rejected/conflicts/corrections. Повторить
   preflight после любой смены snapshot/session; collector и recovery проверить.
4. Подготовить server recovery ledger/idempotency и новый ограниченный механизм
   удаления immutable данных. Проверить FK/trigger порядок в disposable DB:
   private receipts/abandonments, conflicts/corrections, sets/notes; затем
   replacement descendants раньше originals и journal instances; reversals/restores
   раньше originals credits/payments, затем attendance revisions/records и purchases;
   snapshot children/parents, proposals, bookings, groups; program children/parents,
   template children/parents, library; invitations/cards; workspace. Сверить все
   composite FK и ссылки Auth, включая другие workspace. Это частичный порядок
   зависимостей; без lifecycle exception он остановится на immutable triggers.
5. Раздельные стадии DB cleanup и privileged Auth deletion с durable recovery
   checkpoint: crash/timeout между стадиями, exact retry после успешного Auth delete,
   запрет повторного появления данных от старых устройств/команд. DB/Auth не общая
   транзакция; ни их атомарность, ни допустимость удаления чужих audit authors
   этим документом не гарантируются.
6. Scoped local cleanup после согласованного export/ack/recovery, native reopen/crash
   и offline устройства; отдельно downloaded exports/OS copies. Проверка backup
   rotation ≤7 дней, восстановление без возвращения удалённого, инфраструктурные
   логи/временные артефакты; specialist review и одобрение владельца.

## Оставшиеся gates

Все нерешённые вопросы из [ACCOUNT-DELETION-HANDOFF](ACCOUNT-DELETION-HANDOFF.md)
сохранены: общий client account/dual role, pending export/ack, Auth/DB recovery,
concurrency, потерянные устройства, юридические права/сроки и оператор, logs/backup.
Здесь не выбирается продуктовый ответ и не меняются policy draft/DATA-LIFECYCLE.
Нужно проверить SQL/pgTAP/concurrency, generated drift, реальный SQLite crash/reopen,
native iOS/Android, облачные процессы/7-дневную ротацию. В контейнере это не выполнено.
Принятие экрана, публикация policy, runtime удаления и весь SOM-41 не завершены.
