# SOM-20 · Session fence создания клиента

Linear: https://linear.app/something-great/issue/SOM-20

## Контекст

SOM-19/onboarding и SOM-20 create RPC/read fencing PR45 уже в базе.
SOM-60 закрыт. Выполняется после template-save-session-fencing.
createWorkspaceClient использует mutable auth и не проверяет session после RPC;
ClientList onAdd после await очищает request и вызывает retry в новом login того же user.

## Критерии

- [ ] Expected actor/workspace/caller lifetime, JWT sub/session_id закреплены
  до dispatch; explicit bearer и guards до/после RPC/error. Logout/relogin/switch/
  malformed claims fail closed; verified same-identity refresh проходит. Одного
  TOKEN_REFRESHED недостаточно. Workspace ownership сверить существующим read/RPC seam.
- [ ] Route onAdd/sheet completion session/workspace/generation fenced: old
  completion не закрывает новый sheet/не вызывает retry/не сбрасывает новый lock.
  Новый scope не наследует busy/error/pending; layout/text/validation сохранить.
  Credentials не входят в новые keys/results/errors/storage. Public API совместим.
- [ ] Name/requestId сохраняются при unknown outcome/auth cancellation в живом
  caller; explicit retry с прежним ID, double tap lock. Новый scope не наследует
  старую команду. Pending сейчас in-memory: disk/reopen recovery не заявлять,
  новый storage protocol не создавать.
- [ ] Meaningful service/route/sheet tests relogin до/после RPC, initial auth race,
  actor/workspace/wrong claims/verified refresh, late error/unmount, retry same ID
  после lost response, old finally/new submit/double tap; existing read tests зелёные.

## Границы

workspace-clients/service.ts только createWorkspaceClient, новые create-specific helpers;
app/app/workspace/clients.tsx только mutation lifecycle; clients-screen.tsx только
async onAdd/lock fencing. Свои tests/review/minimal docs/i18n. PR45 read portions/
controller/use-client-read/validation только читать. Не менять library/template
provider (work active), financial (personal), sync storage (third), client schedule/
program, invitations/onboarding/auth provider/SQL/types/deps/prototype/прочие routes.
Один агент, без субагентов.

## Источники и проверка

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR0007/0061/0066, SQL contracts и tests/review своего модуля.
Graft map/ask если доступен, иначе записать отсутствие. Свежая
fix/som-50-template-picker обязательна; невлитые ветки не dependencies.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/som-20-client-creation-session-fencing/README.md: точные команды/результаты/ограничения;
  ADR при новом подходе, номер проверить по свежей базе.
- [ ] App без комментариев/any, строки через i18n, без секретов и новых PNG.

Нет Docker/Supabase/браузера/native устройств: SQL/pgTAP/RLS/live auth,
real storage/crash/reopen/parity/два устройства/приёмка владельца не проверены.
Только synthetic fixtures, без реальных данных/платных сервисов. Не задавать
вопросов, не менять Linear/scripts/rules/main. Draft agent/som-20-client-creation-session-fencing только
в fix/som-50-template-picker, title SOM-20. Экраны и issue принимает владелец.
