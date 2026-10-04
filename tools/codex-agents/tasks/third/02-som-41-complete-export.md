# SOM-41 · Полный пользовательский экспорт сервера и локальных записей

Linear: https://linear.app/something-great/issue/SOM-41
Ветка: agent/02-som-41-complete-export. Заголовок PR с SOM-41.

## Контекст

SOM-41 больше дня: остаются две крупные части — (1) весь пользовательский экспорт
(server+local+file+UI+tests), (2) удаление аккаунта и публикация политики. Здесь часть 1
целиком; часть 2 не ставится до review общей клиентской учётной записи/двойной роли,
юридических оснований и backup/Auth deletion gates из ACCOUNT-DELETION-HANDOFF.
Pure serializer r2 PR47, backend export+file UI PR36 и scoped SQLite snapshot PR51
уже в базе. Их отдельные контракты не являются готовым полным экспортом.
Выполнять после 01-SOM-32; результат коррекции НЕ dependency: читать existing
conflicts/correction drafts без применения. Даже если correction PR ждёт local DB,
этот пакет независим от него и не должен использовать его невлитый API.
Решения SOM-51/52/59/60 закрыты, нового продуктового решения для read-only export нет.

## Критерии

- [ ] Один законченный пользовательский flow settings→prepare→coverage→file:
  export_trainer_workspace + все локальные scoped операции/receipts/projections,
  обе версии server conflicts и correction context, существующие drafts/pending
  из инвентаризации DATA-LIFECYCLE. Никаких token/Auth secrets/invitation bearer URLs.
  Заявлять полноту только по реально прочитанным allowlisted источникам; gaps/
  inaccessible source/overflow выводят явный incomplete, а не ложный полный backup.
- [ ] Real collector использует scopedSnapshot PR51 (не pending(100)), lossless
  adapter распознаёт exact local schema и ownership relations; foreign/malformed/
  unknown не становится корректной projection через cast. Server conflict/correction
  reads tenant-safe, bounded без silently truncated success. Null/zero/exact units,
  confirmed error/conflict/correction, archived records и originals сохраняются.
- [ ] Согласованность всех источников: documented barrier/version comparison
  относительно save/ack/other connection/session; если доказательства нет,
  globalAtomicity unknown/incomplete. Snapshot ID/два последовательных чтения сами
  по себе не доказательство отсутствия записи. Не менять чужие writers ради barrier.
  Все проверки до/после async и файла; новая запись/смена identity обесценивает evidence.
- [ ] Existing platform file adapters сохраняют точные UTF-8 bytes versioned envelope,
  saved/shared/cancelled/unsupported/error/cleanup различаются. Session/workspace/JWT
  identity фиксируется до dispatch, explicit auth, guards и bounded reads; late
  result/error не публикуются новому caller. Не зависать на auth guard после timeout.
- [ ] UI честно показывает server/local coverage и неполноту, доступный non-destructive
  export допускает только правдивый исход. File evidence связывает конкретные bytes,
  scope и snapshot с фактическим adapter outcome; shared не равен проверенному save.
  Никакого deletion authorization/ack proof/purge/auto logout от этого экспорта.
  Не очищать outbox/pending/rejected/conflicts и не менять юридическую policy.
- [ ] Независимые collector/server/SQLite-adapter/controller/file/UI tests: >100
  операций+confirmed receipts, all known sources и gaps, foreign/unknown payload,
  writer/ack changes между reads/file, same-user relogin/refresh/wrong JWT/unmount,
  bounded timeouts, malformed/precision/size errors, cancelled/save/share/cleanup
  failures. Реальные platform/SQL проверки только CI/доступный runtime, без mocks claims.

## Разделение работы

До трёх субагентов по tools/codex-agents/SUBAGENTS.md (если отсутствует — узкие свежие
контексты/исключительное владение). Collector+adapters одному, file/controller/UI
второму, независимые tests третьему. Lead фиксирует envelope/API, integration/docs,
общий npm run check. Один файл принадлежит одному агенту.

## Границы

account-export features/domain, новые local-export collector/adapters и read-only
export-specific helpers; account settings export controls; additive sync snapshot
read API только если необходим и совместим; свои tests/review/privacy handoff.
Preload/entry/financial/library/invitation pending stores читать через existing API,
не менять их writers/протоколы; при отсутствии API фиксировать coverage gap без
выдуманного complete. SQL только additive export read RPC/migration и tests если
нужны для безопасного conflicts/correction context; существующие migrations не менять.
Не менять correction apply/workout-entry/finish, runner/transport/save/ack/purge,
financial/client-scheduling/invitations (personal), clients/library (work), auth
provider/зависимости/prototype/deletion/policy publication/cloud/DNS/SMTP.
Shared docs/i18n минимально. Не объявлять SOM-41 завершённой.

## Источники и проверка

Прочитать AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md,
docs/app/LINEAR-WORKFLOW.md, docs/app/{README,CONVENTIONS,DELIVERY-PLAN,
ROADMAP,OPEN-QUESTIONS,PROJECT-MEMORY,UI-PARITY}.md, ADR0007/0061/0064/0066.
Сначала graft map/ask; если executable/граф отсутствует, записать ограничение.
Свежая fix/som-50-template-picker обязательна. Невлитые чужие ветки не зависимости.
Сверить уже сделанное по свежей базе, не переписывать исправные реализации.

- [ ] Meaningful независимые regression tests; cd app && npm run check зелёный.
  SQL при изменении: новые pgTAP/concurrency cases, команды и handoff для CI.
- [ ] CHANGELOG «Не выпущено», минимальный ROADMAP, свой app/review/<имя-брифа>/README.md
  с точными командами, результатами, критериями и ограничениями; ADR при новом
  подходе со свободным номером. App без комментариев/any, пользовательские строки
  через i18n, без секретов и новых PNG. Прототип не менять.

В контейнере нет Docker/Supabase/браузера/нативных устройств: SQL/pgTAP/concurrency,
реальное Auth/SQLite/file/share/crash/reopen, visual/native/accessibility/приёмка
не доказаны mocks. SQL runtime выполняет CI; изменения существующих migrations
запрещены. Если CI требует local DB, оставить needs-local-db для Claude и не вливать.
Экраны/issue принимает владелец. Не задавать вопросов, не менять Linear/scripts/rules/main,
не подключать платные сервисы/реальные данные. PR только agent/* → fix/som-50-template-picker.
