# SOM-31 · Production-ввод подходов: исправление reconciliation (r2)

Linear: https://linear.app/something-great/issue/SOM-31/dovesti-vvod-podhodov-i-mini-gruppy-do-production

## Причина повторного брифа

PR #38 https://github.com/anuar02/panda-trainer/pull/38 закрыт координатором из-за
существенной ошибки reconciliation. Отправная точка: сохранённая ветка
`agent/som-31-workout-entry`; новая ветка `agent/som-31-workout-entry-r2`.
Перенеси полный пакет исходной реализации и интеграционные правки координатора
на свежую fix/som-50-template-picker, не теряя исходные критерии ниже.

В app/src/domain/workout-entry/index.ts reconcileWorkout:
локальное упражнение сохраняется только потому, что revision > 0; исходное
упражнение остаётся скрытым при любой отсутствующей на сервере локальной замене.
После replace_exercise conflict и explicit selection current, receipt снимает
pending/issues, сервер не вставляет incoming replacement, но UI сохраняет
отвергнутую замену и original.skipped=true. Координатор воспроизвёл чистой функцией:
server original revision2 skipped=false, local original skipped=true + replacement
revision1 replacedFromId=original; pending=[] issues=[] → оба локальных состояния
остаются. Это нарушает серверный выбор и корректность refresh/reopen.

- [ ] Исправить provenance/lifecycle reconciliation: после подтверждённого current
  показывать серверный original, удалять отвергнутую replacement из активной проекции,
  не теряя обе audit conflict версии, настоящие pending и rejected данные.
- [ ] Проверить аналогичное безусловное сохранение отсутствующих local sets:
  серверные tombstones/deletions должны учитываться после снятия pending/issues.
- [ ] Meaningful regression domain + service/hook: create replacement → conflict →
  select current → successful receipt → refresh → reopen. Проверить incoming, retry,
  unresolved/rejected, revision/tombstones и offline без потери pending/drafts.
- [ ] ADR 0073 занят deletion preflight, 0074 занят export UI. Использовать
  0075-booking-snapshot-journal-entry (интеграционная правка координатора),
  сохранить base signatures apply_operations/export_trainer_workspace по одному.
- [ ] SQL пакет остаётся без исполнения в контейнере. Только новые migrations;
  существующие не менять. Следующий PR координатор передаст needs-local-db для
  локальных db lint/test db, самостоятельно вливаться он не будет.
- [ ] Отчёт app/review/som-31-workout-entry-r2/README.md с результатами и ограничениями.
  Первичный отчёт сохранить; CHANGELOG/ROADMAP обновить минимально.

## Контекст

SOM-30 влита 16eaf8f (#28), SOM-29-r2 19c62af (#26), schema/program/schedule
уже в базе. Все зависимости этого пакета влиты. ADR0061: вводит только тренер,
клиент видит завершённое; обе конфликтующие версии сохраняются.
SOM-30 read-only экран и seam описаны в app/review/som-30-workout-preload-recovery/README.md
и ADR0068. Используй существующие durable saveJournalEntry/outbox/apply_operations.
Work делает export UI, personal — изолированный deletion preflight; их файлы не трогать.

## Критерии

- [ ] Production journal ввод по прототипу: один подход в фокусе, «Как в прошлый раз»,
  крупная шторка, отмена последней записи через durable operation. Draft отличается
  от confirmed, null отличается от 0; grams/reps/seconds сохраняются точно.
- [ ] Три вымышленных участника: переключение без потери черновика; UUID, программа,
  подходы и pending каждого изолированы, offline/reopen сохраняют данные.
- [ ] Создание journal/exercises использует immutable booking assignment snapshot,
  а не актуальный шаблон/catalog. Совместимое расширение RPC новой миграцией,
  fixtures прав/повторов/конкурентности; timestamp строго позже 20261003140000; не делать прямой INSERT из приложения.
- [ ] Добавление/замена упражнения только в занятии: не менять шаблон/личную
  программу. Offline операции атомарны с projection, повтор не дублирует подходы.
- [ ] Reconcile refreshed revisions/tombstones/receipts с pending. Explicit conflict
  selection сохраняет обе версии; private notes не раскрываются клиенту.
  Logout/switch/stale responses не записывают в чужой scope; pending не стирается.
- [ ] Meaningful tests трёх участников, draft/null/zero/undo, offline/retry,
  assignment after template edit, replacement, conflict/rejected и session fencing.
  SOM-32 finish/correction оставить отдельным, без фиктивной кнопки успеха.

## Границы

Domain/features workout, workout-preload, workout-sync и их tests;
минимальные trainer journal route/provider seams. Новые journal migrations/pgTAP,
database.types.ts только additive journal signatures. Не менять account-export,
account-deletion, profiles/navigation profile, auth policy, billing, invitations,
client screens, notification, library/template editor, mascot/picker.
Учти: touch_updated_at увеличивает revision на любом UPDATE; не используй
set revision=rev как пустую запись.
Не менять функцию apply_operations, исправляемую PR #34: при необходимом
расширении опирайся на его совместимый seam и опиши ограничение, не копируй CI fix.

## Разделение работы

Third использует до трёх субагентов по tools/codex-agents/SUBAGENTS.md.
Если файл отсутствует: чистые контексты, исключительное владение файлами,
узкие тесты; общий check запускает только ведущий. Ведущий сначала фиксирует
контракт и разделяет server snapshot RPC, local projection/operations,
независимые регрессионные tests. Shared types/routes/i18n/docs и интеграция — ведущего.

## Общие требования и источники

Прочитай AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md,
docs/app/{README,PROJECT-MEMORY,ROADMAP,CONVENTIONS,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY,ARCHITECTURE,DATA-MODEL}.md,
ADR 0007/0061/0062/0064/0066 и относящиеся к задаче отчёты.
Используй graft, если доступен; проверяй реальные пути в репозитории.
База fix/som-50-template-picker, текущий commit 9d1802a. PR #34 claude/ci-green
параллельно исправляет SQL apply_operations и Expo patch drift: не дублируй его,
не меняй старые migrations (24 уже применены в пилоте), версии Expo и package-lock
ради CI. Новые SQL изменения — только новой миграцией с уникальным timestamp.
Не применяй миграции в облако.

- [ ] cd app && npm run check зелёный; meaningful tests по изменённым контрактам.
- [ ] CHANGELOG («Не выпущено»), минимальный checkpoint ROADMAP и отчёт
  app/review/som-31-workout-entry/README.md с точными командами, результатами и ограничениями.
  При новом подходе ADR с незанятым номером и descriptive filename.

Общие CHANGELOG/ROADMAP/i18n меняй минимально. App код без комментариев/any;
строки через i18n. Linear не менять, вопросов не задавать. Draft PR только
в fix/som-50-template-picker, ветка agent/som-31-workout-entry-r2, заголовок с SOM-номером.
main, prototype, scripts/rules очереди, платные сервисы, реальные данные исключены.

## Чего нельзя проверить в контейнере

Нет Docker, Supabase, браузера и устройств iOS/Android. SQL/pgTAP runtime,
generated drift, реальный SQLite/reopen/crash, native/visual/accessibility,
облачные процессы и приёмку владельца не объявлять проверенными. Подготовь
воспроизводимые команды и вымышленные fixtures. Новых PNG не коммитить.
Экраны, SOM-задачу целиком и пилот принятыми не объявлять.
