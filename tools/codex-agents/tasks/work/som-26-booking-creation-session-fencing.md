# SOM-26 · Создание занятия: session fence и durable retry

Linear: https://linear.app/something-great/issue/SOM-26

## Контекст

SOM-25/server creation и SOM-26 UI/read уже влиты, решений не требуется.
create-operation.ts проверяет user только перед RPC и кэширует Promise успеха;
creation.ts после save не проверяет прежнюю сессию и очищает pending после ответа.
use-creation.ts user/workspace key не различает новый login того же user.
Поздний ответ может вызвать onCreated/clear в другой сессии. Пакет выполняется
после local-export-r2, независим от невлитого SOM-31 DB PR.

## Критерии

- [ ] Закрепить actor/workspace/session до первого async шага submit/resume,
  guards до RPC и после awaits/перед result/error/cached success. Bearer явно к RPC.
  Logout/same-user relogin/switch fail closed, verified refresh допускается по
  уже влитому auth контракту; credentials не сохранять в keys/payload/errors.
- [ ] Hook hides старые pending/busy/error при session/scope change; late load,
  save/RPC/clear/error/retry/unmount не меняют новый state и не вызывают onCreated.
  Double tap lock, plan revision и overlap acknowledgement сохранить.
- [ ] Durable key user/workspace и requestId/payload сохраняются при reopen/retry.
  Auth cancellation/unknown outcome не теряют pending; conditional clear не удаляет
  новую команду. Storage failure после success допускает повтор того же requestId.
  Overlap→ack flow сохранить; overlap не считать созданием, SQL/policy не менять.
- [ ] Meaningful regressions: relogin до/после RPC/storage, разные actor/workspace,
  refresh, cached success, late error/unmount, uncertain success, clear failure/
  newer pending, double tap, overlap→ack и создание с планом. Existing tests зелёные.

## Границы

Только workspace-scheduling/{create-operation,creation,use-creation,pending}.ts,
новые creation-specific module-local helpers/tests, свои review/minimal docs/i18n.
Не менять status/proposal/request-resolution (third), read-session/service/controllers,
mutation-provider/routes/UI/auth provider, workspace-programs/client-program,
account export/journal/sync, SQL/types/deps/prototype. Existing auth helpers только
читать; новый helper не навязывать third. Public API совместимый.

## Источники и проверка

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR 0007/0061/0066 и existing tests/review своего модуля. Сначала graft map/ask;
если недоступен — зафиксировать и читать точные пути. Свежая база обязательна,
невлитые ветки не dependencies; продуктовые решения не выбирать заново.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», минимальный ROADMAP,
  app/review/som-26-booking-creation-session-fencing/README.md с точными проверками и ограничениями. При новом подходе
  ADR с незанятым номером и descriptive filename.
- [ ] App без комментариев/any, строки через i18n, без секретов/новых PNG.

Нет Docker/Supabase/браузера/устройств: SQL/RLS/live auth/native/parity/реальное
storage crash и owner acceptance не проверены. Только synthetic fixtures,
без реальных данных клиентов/платных сервисов. Не задавать вопросов, не менять
Linear/scripts/rules/main. Draft PR agent/som-26-booking-creation-session-fencing только в fix/som-50-template-picker,
заголовок SOM-26. Экраны и весь issue принимает владелец.
