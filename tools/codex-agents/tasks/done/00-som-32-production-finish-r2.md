# SOM-32 · Production-завершение журнала: r2 и восстановление после конфликта

Linear: https://linear.app/something-great/issue/SOM-32

Ветка: agent/00-som-32-production-finish-r2. Заголовок PR с SOM-32.

## Причина r2 — обязательное исправление целого сценария

PR #54 закрыт без слияния. Исходный пакет восстановить из
origin/agent/som-32-production-finish (head bfb7e1e), затем интегрировать свежую
fix/som-50-template-picker; не терять уже влитые изменения других задач.
Существенный дефект: после finish conflict → explicit current → applied resolution
→ fresh remote in_progress revision10 → reopen остаётся finishOperation.
Состояние not_finished честное, но confirm/undo/add отклоняются
entry_workout_not_ready, finish возвращает прежний state и UI навсегда блокирует
ввод/новое завершение. Серверный журнал открыт, pending/issues пустые.

Воспроизведение координатора: исходный test workout-finish-service.test.ts,
it.each current/incoming «retains an honest finish outcome…»; для current после
assert restored.issues=[] добавить
await expect(reopened.confirm(remote, remote.exercises[0]!.id,
{weightGrams:200,reps:9,seconds:null})).resolves.toBeDefined().
Targeted jest --testNamePattern 'coordinator:' дал 1 FAIL:
entry_workout_not_ready. CI не проверяет продолжение после current;
screen test прямо закрепляет отсутствие finish action — это ошибочное ожидание.

- [ ] Current resolution после validated receipt+fresh unfinished snapshot снимает
  исключительно terminal finish lock, сохраняя историю operation/receipt, результаты,
  drafts и exact replay незавершённых/неопределённых команд. Не удалять outbox/audit.
- [ ] После reopen можно продолжить ввод, undo/add где это разрешено исходной policy,
  затем явно завершить новой командой на свежей revision. Пока resolution pending,
  receipt ambiguous, snapshot stale или logout — lock остаётся, auto-finish нет.
- [ ] Независимый полный service/hook/screen сценарий: finish conflict → current →
  server resolution → refresh/reopen → confirm → new explicit finish; новая команда
  имеет новый ID только после доказанного завершения старой и fresh revision.
  Incoming сохраняет finished и не допускает ложный повтор; foreign/late receipt
  не снимает lock. Исправить ошибочные существующие tests, не просто скрыть дефект.
- [ ] Credentials не включать в React keys/state/storage/results; session guards
  сохраняются. Refresh/participant lifecycle проверить без регрессий.

Это полный исходный finish пакет + исправление, не отдельный transport preflight.
Выполнять первым после текущего active correction брифа third (его имя не менять).
Correction API из невлитой ветки не dependency; если correction уже в базе,
сохранить его узкую интеграцию. Не отменять и не дублировать active работу.


## Контекст

SOM-31 r2 PR42 влит `980e149` после локального DB review, evidence `2e55df7`.
SOM-28/29/30 в базе, решения SOM-53/56/58 закрыты (ADR0061). Выполняется после
scoped-outbox-snapshot. Typed finish_workout и SQL уже есть; production
WorkoutEntryService имеет confirm/undo/add/resolve, но не finish; demo не заменяет
production. Пакет только finish: применение correction drafts и selective
program update остаются отдельными контрактами. Booking programId не является
client_programs.id, provenance/immutable program policy не угадывать.
Источники finish semantics: prototype-fresh/js/sheets.js finishConfirm,
prototype-fresh/js/store.js и prototype-fresh/CODEX-PLAN.md только читать.

## Критерии

- [ ] Finish конкретного production workout после flush записей. Summary и явное
  подтверждение partial/empty по prototype default finishConfirm; считать только
  сохранённые sets, не draft/grey suggestions. Группа из трёх участников изолирована.
- [ ] Durable finish через existing OutboxStore.save/runner: operationId/payload/
  revision сохраняются при unknown result/retry/reopen; double tap не создаёт
  новую команду. Очередь sets перед finish, storage failure не success, данные не purged.
- [ ] Local saved finish отличается от server applied: error/conflict/correction_draft
  не показывают подтверждённое завершение. Latest server snapshot/revision/remote finish
  reconcile, reopen и retry сохраняют данные и видимый исход. Existing undo/conflict
  recovery не ломать.
- [ ] Actor/workspace/session/workout guards до/после awaits; switch participant/
  logout/relogin/unmount не завершает другой журнал и не публикует late UI.
  Attendance/debit/booking status/личную программу автоматически не менять.
- [ ] Correction receipt честно остаётся draft, без fictitious applied fix/update.
  В отчёте перечислить отсутствующие server contracts; SOM-32 целиком не завершена.
- [ ] Independent domain/service/hook/screen regressions: full/partial/empty,
  draft exclusion/3 participants/double tap, save failure/lost response/replay,
  revision conflict/remote finish/sets order, session/participant switch/reopen seam.
  Existing entry/preload/sync/demo tests зелёные.

## Разделение работы

До трёх субагентов по tools/codex-agents/SUBAGENTS.md; если файла нет, свежие узкие
контексты/исключительное владение. Domain/service одному, UI/hook второму, независимые
tests третьему. API/docs/integration и полный npm run check — ведущему.

## Границы

domain/workout-entry, features/workout-entry/{service,use-entry,screen,resources}.ts[x],
новые finish-specific helpers/узкое reconcile extension; свои tests/review, minimal
docs/i18n. Existing workout-sync/storage.ts (third active snapshot), runner/transport/
operations schema, preload storage/provider и entry storage только читать. Store
API не менять. Не менять demo/prototype/assignment/client reads/clients (work)/
financial (personal)/library/auth provider/SQL/database.types/deps/routes.
SQL finish уже есть; SQL changes в этот пакет не входят.

## Источники и проверка

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR0007/0061/0066, SQL contracts и tests/review своего модуля.
Graft map/ask если доступен, иначе записать отсутствие. Свежая
fix/som-50-template-picker обязательна; невлитые ветки не dependencies.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/som-32-production-finish-r2/README.md: точные команды/результаты/ограничения;
  ADR при новом подходе, номер проверить по свежей базе.
- [ ] App без комментариев/any, строки через i18n, без секретов и новых PNG.

Нет Docker/Supabase/браузера/native устройств: SQL/pgTAP/RLS/live auth,
real storage/crash/reopen/parity/два устройства/приёмка владельца не проверены.
Только synthetic fixtures, без реальных данных/платных сервисов. Не задавать
вопросов, не менять Linear/scripts/rules/main. Draft agent/00-som-32-production-finish-r2 только
в fix/som-50-template-picker, title SOM-32. Экраны и issue принимает владелец.
