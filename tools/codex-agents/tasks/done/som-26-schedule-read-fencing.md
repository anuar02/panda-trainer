# SOM-26 · Валидация и session fencing чтения расписания

Linear: https://linear.app/something-great/issue/SOM-26

## Контекст

SOM-25 и production Today/week/create уже в базе fix/som-50-template-picker.
Не повторяй реализованные экраны. В workspace-scheduling/service.ts loadWorkspaceSchedule
читает несколько таблиц без фиксированной авторизованной сессии; readPages не ограничен,
booking/client/program/workspace ответы доверяются типам SDK. use-schedule.ts различает
user/workspace, но не новый вход того же аккаунта. Это конкретный оставшийся read gap.
Third сейчас заканчивает SOM-31: новый бриф выполняется только после текущего.

## Критерии

- [ ] Подтвердить expected actor/workspace и зафиксировать авторизацию для всех страниц
  одного чтения; logout/new login/смена пользователя не возвращают старый snapshot.
  Не хранить credentials в результате/логах. Refresh токена и новая сессия различаются
  согласно существующему auth контракту; если достоверность неизвестна, fail closed.
- [ ] Runtime validation всех ответов: scope/UUID/enums/revisions/UTC/интервалы,
  availability/timezone, duplicate IDs, связанные client/program/proposal rows.
  Unknown/malformed не превращаются в пустое расписание или свободные окна.
- [ ] Bounded pagination и явная ошибка при превышении; сохраняются все валидные
  bookings/proposals, в том числе предложение вне выбранной недели. Без обрезания успехом.
- [ ] Hook и Today/week потребляют совместимый typed seam; stale request/retry/unmount
  и same-account новая сессия не показывают старые данные; создание/мутации сохранены.
- [ ] Meaningful tests: malformed/foreign rows, paging >500/duplicate/limit,
  разные workspace, session switch между страницами, late response и retry.
  Сохранить working-day/timezone/free-window и mini-group поведение.

## Источники

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/README, CONVENTIONS,
PROJECT-MEMORY, ROADMAP checkpoint, DELIVERY-PLAN, OPEN-QUESTIONS, UI-PARITY,
ADR0007/0061/0066; app/review/workspace-scheduling/README.md;
workspace-scheduling/service.ts/use-schedule.ts, auth и account-export fencing как источники.
Graft если доступен. Сначала проверить базу и уже выполненные части.

## Границы

Только workspace-scheduling read service/hook/отдельный read controller, их tests,
минимальные read seams Today/week. Не менять mutation/creation/status/proposal commands,
workout/preload/sync, client-history/client screens, auth provider, account-export/deletion,
profiles, SQL/database.types.ts/package dependencies. Общие CHANGELOG/ROADMAP/i18n минимально.
До трёх субагентов по tools/codex-agents/SUBAGENTS.md: service validation,
session/hook и независимые tests; исключительное владение файлами, интеграция ведущего.

## Проверка и отчёт

- [ ] npm run check в app/ зелёный, CHANGELOG («Не выпущено»), checkpoint ROADMAP,
  app/review/som-26-schedule-read-fencing/README.md; ADR при новом подходе.
- [ ] Код app без комментариев/any, без секретов/новых PNG (ADR0066).

Нет Docker/Supabase/браузера/устройств: SQL/RLS/live API, native/parity и acceptance
не объявлять проверенными. Только synthetic fixtures; реальные данные/платные сервисы запрещены.
Не задавать вопросов, не менять Linear/scripts/rules/main. Draft PR agent/som-26-schedule-read-fencing
только в fix/som-50-template-picker, заголовок SOM-26. Экраны принимает владелец.
