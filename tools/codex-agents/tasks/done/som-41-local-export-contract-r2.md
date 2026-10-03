# SOM-41 · Local export contract r2: реальные conflict/correction формы

Linear: https://linear.app/something-great/issue/SOM-41

## Причина повторного брифа и отправная точка

PR #39 https://github.com/anuar02/panda-trainer/pull/39 закрыт без слияния.
Начни с сохранённой ветки `agent/som-41-local-export-contract`:
https://github.com/anuar02/panda-trainer/tree/agent/som-41-local-export-contract
Перенеси её пакет в новую `agent/som-41-local-export-contract-r2`, затем влей
свежую `fix/som-50-template-picker`. Не жди принятия/слияния закрытого PR.
Исходный пакет в базу не попал; все исходные критерии ниже обязательны.
Этот бриф выполняется после текущего som-20-trainer-client-read-fencing.

Полный check координатора зелёный: 152 suites / 1581 tests. Это не покрывает
следующие существенные дефекты. Read-only review и сверка влитой SQL подтвердили:

1. `account-local-export/index.ts:385` универсально требует
   current.projection.row.id === conflict.entityId. Для replace_exercise SQL
   сохраняет старое упражнение replaced_from_id с sets, а entityId — ID нового.
   Для upsert_set на skipped exercise без существующего set SQL fallback —
   строка упражнения, а entityId — новый set. Обе допустимые формы отклоняются.
   Источник: `supabase/migrations/20261003140000_workout_sync_revision_fixes.sql`,
   current_value в replace/upsert ветках (строки 130, 146, 189–190).
2. `index.ts:444` требует payload.workout_instance_id ?? entity_id == workoutId.
   resolve_conflict payload содержит conflict_id/selected_version/expected_revision,
   entity_id — set/exercise/note. SQL сохраняет именно эту исходную операцию как
   correction draft при уже finished workout (та же migration, строки 41–44, 60–62).
   Synthetic coordinator invocation на существующем fixture подтвердил malformed
   для такого допустимого draft; временный repro не закоммичен.
3. `index.ts:400–418` допускает в current aggregate exercise/sets/replacements
   от других упражнений той же тренировки. Нет проверки exercise ID относительно
   projection/incoming, workout_exercise_id подходов, replaced_from_id replacement
   и согласованности exercise_revision с exercise row revision.
   Такой противоречивый aggregate может стать journalStatus complete.

## Дополнительные обязательные критерии r2

- [ ] Typed representation и validation принимают ВСЕ формы current_version
  уже влитой базы: replacement old exercise + sets; existing set aggregate;
  missing set + skipped exercise fallback; note с shared; finished workout.
  Сохранить без потерь исходные IDs, revisions, sets, tombstones и replacements.
  Не менять entityId ради обхода проверки, не отбрасывать строки, не маскировать
  известную валидную форму current:null/incomplete. Unknown действительно остаётся unknown.
- [ ] Resolve_conflict correction сохраняется lossless; workout связь проверяется
  по доступному scoped typed conflict/context. Если контекст отсутствует — явно
  incomplete, без выдуманных UUID/proof/успеха. Опиши typed seam будущему collector.
- [ ] Kind-specific relations проверяются, а malformed same-workout чужие
  exercise/child/replacement/version fail closed. Не ослаблять scope/schema checks
  для поддержки валидных форм; UUID ownership по-прежнему требует collector.
- [ ] Meaningful round-trip tests для каждой формы SQL выше, заполненных aggregates,
  null/zero/точных units и rejected receipts. Negative cases: другой exercise той
  же тренировки, неверный child parent/replaced_from_id/revision, cross-workout/scope,
  отсутствующий resolve context. Tests обязаны воспроизводить дефекты исходной ветки.
- [ ] Обновить LOCAL-EXPORT-CONTRACT/ADR/handoff/review честными контрактами и результатами.
  Отчёт `app/review/som-41-local-export-contract-r2/README.md`; старый отчёт не выдавать
  за свежую проверку. ADR номер проверять по свежей базе (0075 занят расписанием, 0076 занят историей).

Границы остаются исходными: только новый account-local-export module/tests/docs.
SQL, account-export/deletion, runtime collector, SQLite, auth, UI не менять.
База содержит все зависимости; SOM-51/59 закрыты владельцем, решения не менять.
Активные personal client-history, third schedule reads; следующие financial reads
и journal r2 не пересекаются. Новая база third не является зависимостью: только
контракты, уже влитые в fix/som-50-template-picker.
Новый draft PR только agent/som-41-local-export-contract-r2 → fix/som-50-template-picker,
заголовок SOM-41. После r3 дальнейший повтор запрещён — блокер координатору.

## Исходный бриф (с поправками r2 выше)

### Чистый контракт экспорта локальных несинхронизированных данных

Linear: https://linear.app/something-great/issue/SOM-41

## Контекст

Server export и pure deletion preflight влиты. Серверный snapshot не сохраняет
local pending/rejected/conflict/correction. Этот пакет — изолированный typed serializer
для будущего экспорта пользователем, без collector/storage/UI/delete integration.
Work начинает после текущего export UI; его новые native adapters не менять.

## Критерии

- [ ] Версионный pure local export envelope: account/workspace/session snapshot metadata,
  точные операции/projections и обе конфликтующие версии/correction drafts, явная
  полнота источников. Input unknown строго валидируется, unknown не означает zero.
- [ ] UUID/scope/revisions/sequence/units/null/0/UTF-8 сохраняются без потерь;
  deterministic ordering и bounded size/count, duplicate/foreign/malformed fail closed.
  Payload только разрешённых journal operation/projection форм из текущих контрактов,
  не произвольный JSON и не credentials. Local notes — только явно scoped пользовательские
  данные; отсутствие источника/версии отмечается incomplete, а не успешным backup.
- [ ] Serializer не создаёт export/ack proof для preflight, не подтверждает сохранение
  файла/личность, не authorize delete. Server export не объединяется с local успехом.
- [ ] Tests round-trip exact grams/reps/seconds/null/zero, unicode notes, rejected/conflict/
  correction, обе версии, duplicate/foreign scope/unknown/incomplete/limits/credentials.
- [ ] Technical handoff: какой snapshot collector ещё нужен, атомарность чтения при
  конкурентном save/ack, безопасное сохранение/очистка и proof после реального file result.
  Не выбирать UX/политику удаления или retention за владельца.

## Источники

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE; docs/app/README, CONVENTIONS, PROJECT-MEMORY,
ROADMAP checkpoint, DELIVERY-PLAN, OPEN-QUESTIONS, UI-PARITY, ADR0007/0061/0062/0064/0066;
privacy/ACCOUNT-DELETION-HANDOFF.md, DELETION-PREFLIGHT-CONTRACT.md;
domain/workout-sync и SQLite outbox только читать, account-deletion/account-export
контракты только читать. Graft если доступен.

## Границы

Только новый app/src/domain/account-local-export/, отдельные tests,
docs/app/privacy/LOCAL-EXPORT-CONTRACT.md, минимальная ссылка из deletion handoff.
Не менять существующие domain/account-deletion/account-export/workout-sync,
features/UI/auth/storage/SQLite/runner, SQL/types/dependencies, policy/DATA-LIFECYCLE.
Runtime collector и purge не создавать. Third меняет journal: опираться только на
уже влитые типы базы, не на его незавершённую ветку.

## Проверка и отчёт

- [ ] cd app && npm run check зелёный, CHANGELOG («Не выпущено»), минимальный ROADMAP,
  app/review/som-41-local-export-contract-r2/README.md; ADR при новом подходе.
- [ ] App без комментариев/any/секретов/новых PNG.

Нет Docker/Supabase/браузера/устройств: реальный SQLite snapshot/reopen/crash/file API,
SQL/native/cloud/legal/owner acceptance не объявлять проверенными. Только synthetic fixtures,
без платных сервисов/реальных данных. Не задавать вопросов, не менять Linear/scripts/rules/main.
Draft PR agent/som-41-local-export-contract-r2 только в fix/som-50-template-picker,
заголовок SOM-41. Весь SOM-41 и экраны принятыми не объявлять.
