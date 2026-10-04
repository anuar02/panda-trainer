# SOM-23 · template save session fencing

База: свежая `origin/fix/som-50-template-picker`, `2e55df7`;
`git fetch origin fix/som-50-template-picker`, divergence `0 0` перед изменениями.
Один агент. Graft отсутствует (`command -v graft`, exit 1), поэтому прочитаны точные
пути модуля и документации. Linear connector недоступен: live project/issue,
relations/status/duplicates не перечитаны; scope взят из брифа и DELIVERY-PLAN.
Linear не изменён. Невлитые ветки не использованы как зависимости.

## Сделано

- Template-specific fence/cache, захват actor/session при создании, explicit bearer,
  проверки JWT sub/session_id до dispatch, после RPC/error и cached success.
  Same-user relogin/logout/silent switch/malformed refresh отменяют operation;
  normal refresh с прежней identity разрешён. Credentials только в transport.
- Scoped pending hydration/recovery с прежними requestId/payload/expectedRevision,
  прежний SQL receipt/conflict контракт. Common exercise operation не изменён.
- Save lifecycle guards, owned lock, скрытие старого commandError/status,
  cancellation during clear восстанавливает pending перед hydration; durable scoped
  pending-clear backup переживает compensation/cleanup failure, newer main имеет приоритет.
- Standalone archive synthetic transport, без нового production UI caller.

## Команды и результаты

- `cd app && npm test -- --runTestsByPath tests/workspace-library.test.ts tests/workspace-library-provider.test.tsx`:
  исходный прогон 31/31 после обновления synthetic JWT/transport fixtures.
- `cd app && npm test -- --runTestsByPath tests/template-mutation-session.test.ts tests/workspace-library-provider.test.tsx`:
  46/46 (24 transport + 22 provider, до дополнительного workspace variant).
  Save/archive: double tap, cached success/relogin, before/after RPC/error,
  malformed/mismatching refresh, normal refresh до/во время RPC, silent session
  switch и transport error redaction.
- `cd app && npm test -- --runTestsByPath tests/workspace-library-provider.test.tsx`:
  финальный targeted прогон 23/23. Clear failure retry, unmount, pending recovery,
  clear-await relogin/silent switch, compensation/cleanup failure, newer pending,
  normal refresh, old finally/new save/double tap для session и workspace change.
- `cd app && npm run check`: exit 0, typecheck/lint/format зелёные;
  **1931 tests / 172 suites**, включая library read, editor/create→assign regressions.
- `git diff --check`: exit 0.

## Не проверено / требует владельца

Docker/Supabase/браузер/native устройства недоступны. SQL/RLS/pgTAP/live auth,
серверная concurrency, настоящее storage/reopen/crash, визуальный parity и owner
acceptance не проверены. Только synthetic fixtures, без реальных данных и платных
сервисов. Compensation/cleanup failure проверены synthetic, физическая durability и crash
не проверены: AsyncStorage не имеет атомарного CAS. Экраны и весь SOM-23 принимает владелец.
Creation-session-fencing из брифа не использовано из невлитой ветки; существующие
editor/create→assign regression suites проверяются полным check.
