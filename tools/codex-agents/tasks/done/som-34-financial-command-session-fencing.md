# SOM-34 · Финансовые команды: session fence и durable retry

Linear: https://linear.app/something-great/issue/SOM-34

## Контекст

SOM-33/34 package/payment/attendance RPC, команды, durable storage и UI уже в базе;
PR43 financial read fencing влит. ADR0059/0061 решения закрыты. Пакет выполняется
после client-program-read, без зависимости от SOM-31 DB. authenticate mutation
проверяет user перед RPC, post-result session guard отсутствует. Commands после
await очищают pending, use-commands ключует user/workspace без новой сессии того
же user; поздний результат может clear/callback в другой сессии.

## Критерии

- [ ] submit + standalone mutation service закрепляют actor/workspace/session до
  первого async шага; все financial RPC explicit bearer и guards перед dispatch/
  после result/error/storage awaits. JWT sub/session_id verified; same-user relogin/
  logout/switch/malformed refresh fail closed, normal refresh той же identity проходит.
  Не доверять одному TOKEN_REFRESHED; credentials не сохранять в keys/payload/errors.
- [ ] use-commands hides прежние pending/busy/errors при scope/session change,
  late load/save/RPC/clear/error/retry/unmount не меняют новый state/onChanged.
  Double tap lock и scoped result validation сохранить.
- [ ] Durable user/workspace key, canonical payload и requestId сохранены. Unknown
  outcome/auth cancellation не теряют команду; conditional clear не удаляет newer
  pending. Existing terminal conflict/invalidState/overpayment policy сохранить,
  но не разрешать чужой session late error очищать pending. Storage failure после
  success допускает повтор прежнего ID; reopen retry без дублей по receipts.
- [ ] Money точными integer strings, capped payment/reversal, attendance/debit и
  явное late-cancellation списание с причиной без изменений продуктовой политики.
- [ ] Meaningful service/command/hook/storage regressions: relogin между awaits/
  RPC/result/error/clear, refresh/sub/session mismatch, actor/workspace, late errors,
  retry/unmount/double tap, uncertain success, clear failure/newer command,
  terminal ошибки. Представители purchases/attendance/payment/reversal и existing
  финансовые read/mutation tests зелёные.

## Границы

trainer-billing/{commands,use-commands,command-storage}.ts и mutation portions
trainer-billing/service.ts, trainer-payments/service.ts; новые module-local mutation
helpers/tests, свой review/minimal docs/i18n. Existing read portions/helpers/hooks
PR43 не менять; types API only additive optional fence если необходимо, no policy.
Не менять financial UI/domain money rules/SQL/types database/deps/auth provider,
workspace-library (work следующая), workspace-programs (third r2), client-program
(текущая personal), scheduling/journal/export/prototype. Сохранить public compatibility.

## Источники и проверки

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR0007/0061/0066, tests/review своего модуля и актуальные SQL контракты только читать.
Graft map/ask если доступен; иначе записать ограничение и читать точные пути.
Свежая fix/som-50-template-picker обязательна; невлитые ветки не зависимости.

- [ ] cd app && npm run check зелёный, CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/som-34-financial-command-session-fencing/README.md: команды/результаты/непроверенное; ADR при новом подходе,
  номер сверить по свежей базе. App без комментариев/any, строки через i18n,
  без секретов и новых PNG. Один агент, субагентов не запускать.

Нет Docker/Supabase/браузера/native устройств: SQL/RLS/live auth/concurrency,
реальное storage/reopen/crash/parity и owner acceptance не проверены.
Только synthetic fixtures, без платных сервисов/реальных данных. Не задавать вопросов,
не менять Linear/scripts/rules/main. Draft PR agent/som-34-financial-command-session-fencing только в
fix/som-50-template-picker, заголовок SOM-34. Экраны и весь issue принимает владелец.
