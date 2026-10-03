# SOM-35 · История клиента после смены сессии

Linear: https://linear.app/something-great/issue/SOM-35

## Контекст

accept_invitation и client-history уже в базе; app/review/client-scheduling/README.md
содержит synthetic историю до привязки аккаунта. Не повторять RPC/UI.
loadClientHistory фиксирует access token при старте, но finalSession проверяет только
user.id: выход и новый вход того же пользователя допускают ответ старой сессии.
useClientHistory key тоже не включает session identity. Закрыть этот конкретный gap.

## Критерии

- [ ] Единое чтение истории связано с действующей сессией, clientRecord/workspace;
  новый вход того же аккаунта, logout, foreign actor и stale response fail closed.
  Учесть refresh в рамках той же сессии по auth контракту; не выдавать токены наружу.
- [ ] Initial load/loadMore/retry и уже показанная история не переживают смену
  авторизации; страницы разных сессий не объединяются. Unmount/late responses безопасны.
- [ ] Сохранить all-time paging, историю до регистрации, null/zero, replacement,
  finished-only/public notes. Private notes/чужие связи не запрашивать.
- [ ] Tests same-user новая сессия между child pages/final check/loadMore,
  другой user/record, retry/refresh и история до linkage; реальные поведенческие regressions.

## Источники

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE; docs/app/README, CONVENTIONS, PROJECT-MEMORY,
ROADMAP checkpoint, DELIVERY-PLAN, OPEN-QUESTIONS, UI-PARITY, ADR0007/0034/0061/0066;
app/review/client-scheduling/README.md, client-history/service.ts/use-history.ts,
auth контракт и account-export session fencing только для чтения. Graft если доступен.

## Границы

client-history/service.ts/use-history.ts, отдельные tests и минимальный connected-history
read seam. Не менять приглашения/RPC/auth provider, SQL/types, workout/sync/preload,
workspace-scheduling, progress/program/home, profiles/account-export/deletion или dependencies.
Общие CHANGELOG/ROADMAP/i18n минимально; work и third владеют другими областями.

## Проверка и отчёт

- [ ] cd app && npm run check зелёный; CHANGELOG («Не выпущено»), checkpoint ROADMAP,
  app/review/som-35-history-session-fencing/README.md с командами и ограничениями; ADR если нужен.
- [ ] App без комментариев/any/секретов/новых PNG.

Нет Docker/Supabase/браузера/устройств: live API/RLS/native/двухтелефонный flow/acceptance
не проверены. Synthetic fixtures, без реальных данных/платных сервисов. Не задавать вопросов,
не менять Linear/scripts/rules/main. Draft PR agent/som-35-history-session-fencing
только в fix/som-50-template-picker, заголовок SOM-35. Экраны принимает владелец.
