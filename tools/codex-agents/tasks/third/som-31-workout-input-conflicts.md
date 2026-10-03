# SOM-31 · Production-ввод подходов, мини-группа и выбор конфликта

Linear: https://linear.app/something-great/issue/SOM-31/dovesti-vvod-podhodov-i-mini-gruppy-do-production

## Контекст

База fix/som-50-template-picker, текущая 08f0251. SOM-29-r2 (PR #26) и
SOM-30 (PR #28, 16eaf8f) уже влиты. SOM-30 подключила read-only workspace
journal, предзагрузку назначенных снимков, SQLite recovery и dock; это seam,
не production-ввод. Прочитай ADR 0068 и отчёт SOM-30 целиком, особенно
Boundary / SOM-31 seam. SOM-53/56/58 закрыты владельцем, ADR 0061:
обе конфликтующие версии сохраняются, выбирает тренер; ввод только тренером,
клиент видит лишь завершённые журналы. Голос исключён из v1 (SOM-54 открыт).
SOM-32 отдельно владеет finish/partial completion/correction завершённого журнала.
Параллельные SOM-40 пакеты касаются backup tooling, pilot config и monitoring;
не трогай их файлы. Рабочий не должен обращаться к queue или журналам контейнеров.

## Критерии

- [ ] Подключить фактический ввод к /workspace/journal: один подход в фокусе,
  шторка с крупными цифрами, «Как в прошлый раз», undo последней записи,
  rest/focus и dock по каноническому прототипу. Сохранить calm/reduced motion,
  safe area и fontScale до 200%; UI строки через i18n. Визуальную приёмку не заявлять.
- [ ] Различать пустое значение/null и 0, локальный черновик и записанный подход.
  Валидировать integer grams/reps/seconds; planned ranges не превращать в actual.
  Не отмечать сохранённым до успешной durable local transaction; pending,
  syncing, failed, conflict и подтверждение сервера различимы. Ошибка SQLite
  блокирует фиктивный успех и позволяет безопасный retry без purge.
- [ ] Три вымышленных участника с разными программами: переключение сохраняет
  отдельные drafts, фокус, подходы и UUID, в том числе collapse/reopen/restart.
  Никаких demo IDs или demo fallback в real workspace; клиент не получает черновики.
- [ ] Создание журнала и исходных упражнений воспроизводит immutable booking
  snapshot, включая метаданные/план после изменения или архивирования шаблона.
  Текущий create_workout создаёт пустой journal, add_exercise читает live catalog:
  нужен совместимый расширенный typed API отдельной миграцией и fixtures через
  apply_operations. Не отправлять неизвестные старому контракту поля, не обходить
  outbox прямыми INSERT, не подменять snapshot live программой. Стабильные UUID,
  ревизии, tenant checks, replay receipts и существующие клиенты сохраняются.
- [ ] Добавление/замена/пропуск упражнения действует только на текущий journal;
  шаблон, личная программа и назначенный snapshot неизменны. Нужны доступная
  библиотека и корректная недоступность без предзагрузки, без фиктивных данных.
  Undo — durable компенсирующая операция с точными IDs/revisions, не удаление истории.
- [ ] Все записи — TypedJournalOperation + saveJournalEntry атомарно с outbox.
  Reconcile свежую server projection/revisions/tombstones/receipts с local pending;
  refresh не теряет локальные изменения и не resurrect удалённые строки.
  Runner получает trigger после записи/возврата сети безопасно и последовательно,
  без concurrent sends и без новой семантики подтверждения пустой очереди.
- [ ] Conflict UI показывает обе версии одного подхода/структуры и позволяет
  тренеру явный выбор с expected revision; повторный конфликт сохраняет обе версии.
  Не выбирать автоматически по времени и не терять pending на logout/token/workspace
  switch. Сохранить session fencing SOM-30 и privacy guards SOM-29-r2.
- [ ] Завершённый журнал остаётся read-only: не включать finish/correction,
  не делать completed mutation автоматически; seam для SOM-32 документировать.
- [ ] Meaningful tests: три участника/draft switching, null vs zero, previous-set
  units, atomic rollback/reopen, undo/replay, snapshot invariance, duplicate receipts,
  stale refresh/pending/tombstones, conflict selection/reconflict, hydration errors,
  account/token/workspace switch during save/send. SQL fixtures для owner/peer/client/
  anonymous, идемпотентности, immutable plan и revision rejection. Проверить доступные
  unit/renderer проверки; SQL runtime и устройство не имитировать как проверенные.
- [ ] Полный cd app && npm run check зелёный. Минимальные CHANGELOG/ROADMAP,
  новый ADR при изменении API/подхода и app/review/som-31-workout-input-conflicts/README.md:
  команды, точные результаты, ограничения и критерии сделано/не проверено.
  Draft PR только в fix/som-50-template-picker, заголовок с SOM-31.

## Источники

AGENTS.md, app/AGENTS.md, docs/app/{README,CONVENTIONS,DELIVERY-PLAN,ROADMAP,
OPEN-QUESTIONS,PROJECT-MEMORY,ARCHITECTURE,DATA-MODEL,UI-PARITY}.md;
ADR 0003/0007/0015/0061/0062/0068; prototype-fresh/index.html и SYNC-DESIGN.md,
prototype-fresh/review/parity/spec-*.json; app/review/som-29-sqlite-outbox-r2/README.md
и app/review/som-30-workout-preload-recovery/README.md. Изучи существующие
app/src/domain/{workout,workout-sync,workout-preload}, features соответствующих
модулей и workout-demo UI как reference, не как production storage.
Если graft доступен — сначала graft map/ask; реальные пути проверяй в базе.

## Границы

app/src/domain/workout* и app/src/features/workout* для production integration,
соответствующие app/tests; app/app/workspace/journal.tsx и минимальный workspace
layout/provider integration; минимальный entry Today/Schedule лишь если необходим
для той же тренировки. Shared journal UI/i18n — минимально с сохранением demo и
SOM-39 behavior. app/src/lib/database.types.ts лишь под новый совместимый API;
отдельные supabase/migrations и соответствующие tests/database/concurrency fixtures.
Не редактировать исторические миграции. Известный CI blocker run 37136349625:
public.apply_operations results initialization text → jsonb, SQLSTATE 42804.
При расширении той же функции исправить типизированную инициализацию в новой
миграции и добавить regression coverage; SQL lint/runtime без Docker не заявлять.
Expo compatibility versions — отдельный blocker, зависимости здесь не менять.
Review, новый ADR/index, CHANGELOG/ROADMAP.
Не менять auth/session implementation, billing/payments/attendance/credits,
client History/Progress, export/privacy/delete, notifications, pilot tooling/config,
monitoring/bootstrap app/app/_layout.tsx, package dependencies, prototype и
tools/codex-agents правила/скрипты. Finish/correction/program update — SOM-32.
Ветка agent/som-31-workout-input-conflicts; база только fix/som-50-template-picker.

## Разделение работы

Third — ведущий с максимум тремя субагентами по tools/codex-agents/SUBAGENTS.md;
если этот файл отсутствует, чистые контексты и исключительное владение файлами.
Сначала зафиксируй UUID/revision/snapshot/operation contracts и границы:
1. Серверный совместимый journal API + SQL fixtures.
2. Domain/local projection/drafts/reconciliation с фокусными тестами.
3. UI input/conflict компоненты с renderer тестами.
Ведущий владеет shared routes/providers/i18n/types/docs и интеграцией;
тяжёлый полный check запускает только ведущий. Проверяй отчёты каждого сам.

## Чего нельзя проверить в контейнере

Нет Docker, локального Supabase, браузера, iOS/Android устройств. db lint,
pgTAP/concurrency, generated type drift, настоящую SQLite/reopen/crash, airplane
mode → online → second device exactly-once и native/visual сравнения оставь
явно непроверенными с воспроизводимыми командами и тремя synthetic fixtures.
Web bundle не доказывает web SQLite writes. Не использовать реальные данные,
платные сервисы, новые PNG, deploy или сообщения людям. Не менять Linear,
не задавать вопросов, не объявлять экраны, SOM-31 или этап 5 принятыми.
