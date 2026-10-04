# SOM-32 · Production finish r2 и current recovery

Дата: 04.10.2026. Только synthetic fixtures, без реальных данных/платных сервисов.
Ветка: `agent/00-som-32-production-finish-r2`; база PR: `fix/som-50-template-picker`.
Исходный пакет закрытого без слияния PR #54 восстановлен из
`origin/agent/som-32-production-finish` (`bfb7e1e`) на свежей базе `4c20e22`.
Merge `fb06079` сохранил SOM-20/23/24/26/34/41 и finish пакет целиком.
Implementation: `a4c4ff4`; draft [PR #59](https://github.com/anuar02/panda-trainer/pull/59),
base `fix/som-50-template-picker`. Branch push и draft/base/title проверены через `gh pr view`.
Конфликты merge затронули только ROADMAP и ADR index; сохранены обе стороны.

Correction third уже опубликовал отдельный draft PR #56
(`agent/01-som-32-explicit-correction-server`, head `19cbe44`); его имя,
работа и API не менялись и не использованы как dependency. На старте PR не в базе.

## Исправленный сценарий

Исходный defect воспроизведён независимо: finish conflict → explicit current →
applied resolution → fresh remote in_progress revision10 → reopen → confirm
падал с `entry_workout_not_ready`. Пустые pending/issues ошибочно сочетались с
вечным finish lock; screen test закреплял отсутствие нового finish action.

Теперь service проверяет сохранённые оригинальные finish/resolution envelopes
и receipts через existing scopedSnapshot. Только terminal owned current receipt
с fresh unfinished revision снимает блокировку. Старая operation/receipt остаётся
в outbox/audit, данные и drafts не purged. Можно продолжить confirm/undo/add,
затем явно создать новый finish с новым ID и свежей revision. Retry/double tap/
unknown/reopen незавершённой команды сохраняют её исходный envelope.

Incoming остаётся finished. Pending/ambiguous/stale/foreign/late receipt и logout
не дают разрешения; auto-finish нет. UI показывает честный not_finished outcome
и разрешает продолжение только при доказанном terminal state. Credentials убраны
из React keys и hook state; session/token guards вокруг awaits сохранены.

## Контекст и границы

Прочитаны root/app AGENTS, LINEAR-AGENT-GUIDE и LINEAR-WORKFLOW,
README/CONVENTIONS/PROJECT-MEMORY/ROADMAP checkpoint/DELIVERY-PLAN/
OPEN-QUESTIONS/UI-PARITY/PROJECT-BRIEF, ADR 0007/0061/0066/0087,
prototype default sheets.js finishConfirm, store.js finish/gap/finalize,
CODEX-PLAN §4 и SQL finish/resolution contracts. Prototype только читался.

Graft executable и `graft/` отсутствуют: `command -v graft` — exit 1,
`graft map` — exit 127. Graph build невозможен. `tools/codex-agents/SUBAGENTS.md`
также отсутствует; использованы три свежих узких контекста с исключительным
владением service/domain, UI/hook, независимыми service/domain tests.

Live Linear project и SOM-32 с relations прочитаны: In Progress, blockedBy SOM-31,
duplicateOf отсутствует; поиск journal задач не выявил duplicate finish issue.
Linear не менялся; комментарии/project updates/сообщения людям не отправлялись.

Store API, workout-sync storage/runner/transport/operations schema,
preload/entry storage/provider, SQL/database.types/deps/routes/demo/prototype/
auth provider и чужие модули не менялись. Attendance/debit/booking status и личная
программа автоматически не меняются. Новый подход: ADR 0089.

## Проверки

- `git fetch origin` — выполнен; база повторно проверена, остаётся `4c20e22`.
- `git merge --no-edit origin/agent/som-32-production-finish` — восстановлен пакет;
  два документных конфликта разрешены с сохранением свежих записей базы.
- Baseline после добавления requested confirm assertion:
  `cd app && npm test -- --runTestsByPath tests/workout-finish-service.test.ts -t 'retains an honest finish outcome'`
  — current FAIL (`entry_workout_not_ready`), incoming PASS, 15 skipped.
- `cd app && npm test -- --runTestsByPath tests/workout-finish-service.test.ts tests/workout-finish-domain.test.ts`
  — 2 suites / 43 tests passed; результат субагента повторён ведущим.
- `cd app && npx jest --runInBand tests/workout-finish-hook.test.tsx tests/workout-finish-screen.test.tsx tests/workout-finish-screen-continuation.test.tsx tests/workout-entry-screen.test.tsx`
  — 4 suites / 26 tests passed (UI субагент).
- Targeted ESLint production service/domain, hook/screen/session helper и finish tests — exit 0.
- Финальный общий `cd app && npm run check` — exit 0; typecheck/lint/format:check зелёные, 188 suites / 2332 tests passed.
- После финализации отчёта `cd app && npm run format:check` — exit 0.
- `git diff --check` — passed; diff к базе не содержит SQL/storage/runner/transport/
  preload/provider/database.types/deps/routes или PNG.

Real production service, SQLiteOutboxStore/scopedSnapshot и hook/screen используются
с synthetic driver/network/auth seams. Connection закрывается и заново открывается
на том же fixture при hook/screen reopen. Независимые сценарии покрывают
confirm/undo/add и новый finish revision10 после current, incoming finished,
pending/stale/error/correction/foreign/unavailable proof, повтор старого receipt
при новой команде, participant/token switch во время scoped receipt await,
новую remote set revision при той же workout revision, semantic clone сессии,
refresh/token mutation и сохранение записанного результата после refresh.
Исходные full/partial/empty/draft-exclusion/group/double-tap/lost-response/save-failure/
sets-order/entry/preload/sync/demo проверки остаются в полном check.
Исторические результаты [исходного отчёта](../som-32-production-finish/README.md)
не являются проверками этой сессии.

## Непроверенное и оставшиеся контракты

- Correction receipt остаётся draft. В этой базе отсутствует server contract явного
  применения correction с expected revision, exact replay/idempotency и конфликтами.
  Невлитый PR #56 не используется как dependency и требует своей проверки/интеграции.
- Selective client program update: отсутствуют contract выбранных изменений,
  provenance workout/booking snapshot → client_programs, immutable version policy
  и revision/idempotency. Booking programId не трактуется как client_programs.id.
- Нет Docker/Supabase/браузера/native устройств: SQL/pgTAP/RLS/live auth,
  real SQLite/storage/crash/reopen, два устройства/offline→online group flow,
  keyboard/accessibility/large text/reduced motion и geometry/theme/state parity
  не проверены. Новые PNG не добавлялись.
- Тексты finishConfirm сверены по исходнику default prototype; visual/native
  comparison и одобрение владельца требуются. Экран, этап 5 и SOM-32 целиком
  не объявлены завершёнными или принятыми.

## Coordinator integration — 04.10.2026

Merged current base including correction PR #56 (`c294b2f`) into this branch.
CHANGELOG/ROADMAP conflicts retained both records; correction controls and finish
behavior were preserved. The two finish screen suites initially failed to load
with missing native QuickBase64 after the correction import. They now isolate
CorrectionPanel like the existing entry screen suite; correction behavior remains
covered by its own independent suites. Targeted finish screen/continuation tests
and the fresh combined-head CI provide integration evidence; no full local check
or database checks were repeated by the coordinator.
