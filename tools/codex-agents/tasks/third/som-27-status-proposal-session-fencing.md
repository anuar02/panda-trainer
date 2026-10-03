# SOM-27 · Статусы и переносы: session fence и durable resolution

Linear: https://linear.app/something-great/issue/SOM-27

## Контекст

SOM-25/status/proposal RPC/receipts/resolution влиты; transport/UI существуют.
Status/proposal operation проверяют user только перед RPC, кэшируют success;
submission/resolve после await чистят pending без проверки session. Hooks
user/workspace key не различают новый login того же user. Старый ответ способен
применить callback/потерять retry. Новых решений нет; пакет независим от SOM-31 DB,
выполняется после assignment-session-fencing.

## Критерии

- [ ] Status/propose/counter/accept/withdraw transport и resolution закрепляют
  actor/workspace/session до async работы; явный bearer и guards до/после awaits,
  result/error/cached success. Logout/same-user relogin/switch fail closed,
  verified refresh допускается. Credentials не сохраняются в keys/errors/payload.
- [ ] use-status-commands/use-proposal generation различает session/scope/request;
  late load/save/RPC/clear/resolve/error/retry/unmount не меняют новый state/callback,
  old pending/busy/errors скрыты. Public API совместимый, double tap lock сохранён.
- [ ] Durable user/workspace key, requestId/canonical payload не меняются. Unknown
  outcome/auth cancellation оставляют pending. Resolution clear только после
  validated succeeded/abandoned своей актуальной identity; conditional clear
  не удаляет newer pending. Clear failure после success позволяет retry того же ID.
- [ ] Revisions/conflict/notFound/invalidState/receipt envelope checks сохранены,
  confirm/cancel одной booking группы и явные proposal действия работают.
  Не вводить auto-debit/whole-group/policy; SQL не менять.
- [ ] Независимые meaningful tests обоих transport/hooks/resolution: relogin до/
  после RPC/storage/resolve, refresh/actor/workspace, cached success, late errors,
  unmount/retry/double tap, uncertain success, clear failure/newer command,
  malformed receipt/canonical payload. Existing scheduling tests зелёные.

## Разделение работы

До трёх субагентов по tools/codex-agents/SUBAGENTS.md; если файла нет, свежие узкие
контексты и исключительное владение. Status family одному, proposal второму,
независимые tests третьему; ведущий фиксирует auth API, владеет request-resolution/
shared helper/docs и интеграцией. Полный npm run check только ведущий.

## Границы

Только workspace-scheduling/{status-operation,status-submission,status-pending,
use-status-commands,proposal-operation,proposal-submission,proposal-pending,
use-proposal,request-resolution}.ts, новые status/proposal-specific helpers/tests,
свой review/minimal docs/i18n. Не менять create-operation/creation/use-creation/pending
(work), read-session/service/controllers/mutation-provider, routes/UI/auth provider,
workspace-programs (active third)/client-program (personal), financial/journal/sync/
export, SQL/types/deps/prototype. Existing auth helpers только читать; невлитый
helper work ветки не dependency.

## Источники и проверка

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR 0007/0061/0066 и existing tests/review своего модуля. Сначала graft map/ask;
если недоступен — зафиксировать и читать точные пути. Свежая база обязательна,
невлитые ветки не dependencies; продуктовые решения не выбирать заново.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», минимальный ROADMAP,
  app/review/som-27-status-proposal-session-fencing/README.md с точными проверками и ограничениями. При новом подходе
  ADR с незанятым номером и descriptive filename.
- [ ] App без комментариев/any, строки через i18n, без секретов/новых PNG.

Нет Docker/Supabase/браузера/устройств: SQL/RLS/live auth/native/parity/реальное
storage crash и owner acceptance не проверены. Только synthetic fixtures,
без реальных данных клиентов/платных сервисов. Не задавать вопросов, не менять
Linear/scripts/rules/main. Draft PR agent/som-27-status-proposal-session-fencing только в fix/som-50-template-picker,
заголовок SOM-27. Экраны и весь issue принимает владелец.
