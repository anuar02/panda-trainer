# SOM-32 · Production-завершение журнала через outbox

Linear: https://linear.app/something-great/issue/SOM-32

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
  app/review/som-32-production-finish/README.md: точные команды/результаты/ограничения;
  ADR при новом подходе, номер проверить по свежей базе.
- [ ] App без комментариев/any, строки через i18n, без секретов и новых PNG.

Нет Docker/Supabase/браузера/native устройств: SQL/pgTAP/RLS/live auth,
real storage/crash/reopen/parity/два устройства/приёмка владельца не проверены.
Только synthetic fixtures, без реальных данных/платных сервисов. Не задавать
вопросов, не менять Linear/scripts/rules/main. Draft agent/som-32-production-finish только
в fix/som-50-template-picker, title SOM-32. Экраны и issue принимает владелец.
