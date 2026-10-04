# SOM-26 · Session-fenced чтение клиентского расписания

Linear: https://linear.app/something-great/issue/SOM-26

## Контекст

SOM-25/26 client RPC/snapshots и SOM-19 auth уже в базе, решений не требуется.
Это защита существующего read, не новый SOM-36 functionality. Выполняется после
financial-command-session-fencing. readClientSchedule не сверяет session после
reads; pages бесконечно набирает rows, shapes/duplicates/relations доверены SDK.
use-schedule не отличает relogin того же user.

## Критерии

- [ ] Immutable logical read expected actor/client/window, JWT sub/session_id и
  explicit bearer для context/bookings/proposals/missing bookings/plans/lines.
  Session/lifetime guards между pages/chunks и перед result/error. Logout/relogin/
  actor switch fail closed, verified refresh той же identity разрешён. Credentials
  вне results/errors/keys.
- [ ] Bounded deterministic pagination с явным overflow без truncated success.
  Все pending proposals, включая занятия вне окна, сохранены. Unknown/foreign/
  duplicate rows/IDs/revisions/relations/invalid calendar UTC fail closed; planned
  units/sets/position/weight/text точно по влитой schema, null/zero lossless.
  Missing chunks принадлежат запрошенным IDs/client/workspace; duplicates source
  exercise/position внутри plan отклоняются согласно schema.
- [ ] Hook scope/window/session/retry/focus/unmount guards скрывают прежние данные
  и late success/error. Upcoming/week/proposal semantics и public compatibility
  сохранить. UI не менять; произвольных продуктовых ограничений не добавлять.
- [ ] Meaningful tests session change между всеми reads/pages/chunks/result,
  normal refresh/silent replacement/wrong claims, foreign/duplicate/malformed/
  calendar/units, limits/overflow, proposals вне окна/missing IDs, late retry/
  focus/error/unmount/auth data hiding. Existing client schedule tests зелёные.

## Границы

Только client-scheduling/{service,use-schedule}.ts, новые schedule-read helpers,
свои tests/review/minimal docs. Не менять workspace-scheduling mutations/reads,
proposals/status/request-resolution (third другой бриф), booking UI/actions,
client-program/history, financial (personal active), clients (work), export/
journal/sync/auth provider/SQL/types/deps/prototype/routes/screens.
Один агент, без субагентов; существующие session helpers только читать.

## Источники и проверка

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR0007/0061/0066, SQL contracts и tests/review своего модуля.
Graft map/ask если доступен, иначе записать отсутствие. Свежая
fix/som-50-template-picker обязательна; невлитые ветки не dependencies.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/som-26-client-schedule-read-fencing/README.md: точные команды/результаты/ограничения;
  ADR при новом подходе, номер проверить по свежей базе.
- [ ] App без комментариев/any, строки через i18n, без секретов и новых PNG.

Нет Docker/Supabase/браузера/native устройств: SQL/pgTAP/RLS/live auth,
real storage/crash/reopen/parity/два устройства/приёмка владельца не проверены.
Только synthetic fixtures, без реальных данных/платных сервисов. Не задавать
вопросов, не менять Linear/scripts/rules/main. Draft agent/som-26-client-schedule-read-fencing только
в fix/som-50-template-picker, title SOM-26. Экраны и issue принимает владелец.
