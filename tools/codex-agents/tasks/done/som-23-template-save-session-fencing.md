# SOM-23 · Шаблоны: session fence сохранения и archive transport

Linear: https://linear.app/something-great/issue/SOM-23

## Контекст

SOM-22 validated library reads PR44 и SOM-23 atomic save/archive/editor код в базе.
SOM-60 закрыт; новые решения не требуются. Выполняется после creation-session-fencing.
saveWorkspaceTemplateOperation проверяет user только до RPC, общий operation кеширует
успех, archive использует mutable auth. Provider после persist(emptyDraft) может
вернуть ok:true при потере scope, old finally безусловно сбрасывает shared lock.
Archive production caller отсутствует: новый UI не создавать.

## Критерии

- [ ] Template save/archive operation закрепляет actor/session до async dispatch;
  explicit bearer и guards до/после RPC/error/cached success. JWT sub/session_id
  identity verified; событие TOKEN_REFRESHED само по себе не доказательство.
  Same-user relogin/logout/switch/malformed claims fail closed, normal refresh
  той же identity проходит. Credentials не сохранять в results/keys/payload/errors.
- [ ] Provider save/pendingSave lifecycle не публикует старый status/result/ok:true
  после auth/scope/generation change, включая persist(emptyDraft) await/finally.
  Stale finally не отпирает новый lock; новый scope не наследует busy/error.
- [ ] Durable draft/pendingSave/requestId/payload не purged на auth cancellation/
  unknown outcome. Recovery в новой сессии создаёт новую explicit fenced operation
  с прежним requestId; receipt/expected revision/конфликт сохраняются. Clear только
  своей команды, storage failure после server success допускает безопасный retry.
- [ ] Meaningful service/provider tests relogin до/после RPC/storage/cache, JWT
  mismatch/malformed TOKEN_REFRESHED и normal refresh, old finally/new save,
  clear failure/newer pending, unmount/retry, recovery/двойной tap. Archive transport
  проверяется standalone synthetic, runtime UI не заявлять. Editor/create→assign
  и library read regressions зелёные.

## Границы

workspace-library/service.ts только saveWorkspaceTemplateOperation/archiveWorkspaceTemplateOperation,
новый template-specific mutation fence/cache helper; provider.tsx только save/pendingSave
lifecycle и необходимый scoped hydration операции; свои tests/review/minimal docs/i18n.
Не менять общий operation так, чтобы затронуть exercise mutations; create/archive exercises,
read transport/validators/read-session, provider catalog read protocol, adapter/domain/editor
UI/storage-gate/routes/template-screen, auth provider, programs/client-program,
scheduling (active work/third), financial (personal следующая), export/journal/SQL/types/deps
не менять. Existing read helper только читать. Совместимость public API сохранить,
при необходимости optional explicit scope для archive без новой UI интеграции.

## Источники и проверки

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR0007/0061/0066, tests/review своего модуля и актуальные SQL контракты только читать.
Graft map/ask если доступен; иначе записать ограничение и читать точные пути.
Свежая fix/som-50-template-picker обязательна; невлитые ветки не зависимости.

- [ ] cd app && npm run check зелёный, CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/som-23-template-save-session-fencing/README.md: команды/результаты/непроверенное; ADR при новом подходе,
  номер сверить по свежей базе. App без комментариев/any, строки через i18n,
  без секретов и новых PNG. Один агент, субагентов не запускать.

Нет Docker/Supabase/браузера/native устройств: SQL/RLS/live auth/concurrency,
реальное storage/reopen/crash/parity и owner acceptance не проверены.
Только synthetic fixtures, без платных сервисов/реальных данных. Не задавать вопросов,
не менять Linear/scripts/rules/main. Draft PR agent/som-23-template-save-session-fencing только в
fix/som-50-template-picker, заголовок SOM-23. Экраны и весь issue принимает владелец.
