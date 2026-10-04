# SOM-20 · Завершить production onboarding тренера и клиентского пространства

Linear: https://linear.app/something-great/issue/SOM-20
Ветка: agent/03-som-20-onboarding-production-finish. Заголовок PR с SOM-20.

## Контекст

Целая оставшаяся техническая работа SOM-20 после текущего client-creation этого
же аккаунта: первый вход/выбор trainer role, atomic workspace+profile+optional
first client, возврат в настоящее пространство и работа с его клиентами.
Onboarding schema/RPC ADR0033, auth SOM-19 и starter library уже в базе.
Выполнять после 02-SOM-22. Новые решения не нужны; не менять login providers.
loadOnboardingContext использует mutable client и доверяет rows; complete возвращает
контекст после второго чтения без фиксированной identity; hook ключует по userId
и не различает relogin. Исправить полный сервис→hook→route сценарий, не один fence.
Ранее исправленный client creation/read использовать, не дублировать.

## Критерии

- [ ] Atomic onboarding существующим RPC создаёт согласованные profile/workspace/
  optional first client и starter catalog; успешный route открывает только свой
  фактически созданный workspace. Empty/invalid/offline/retry states честные;
  existing returning trainer/client connections не теряют историю и роль.
- [ ] Context profile/workspace/connections runtime validated как unknown: expected
  actor, owner links, UUID/dates/nullable fields, safe display fields и tenant scope.
  Closed/foreign/malformed rows fail closed без ложного нуля или demo fallback.
- [ ] Read и completion фиксируют expected actor/JWT sub/session_id до IO и передают
  explicit bearer; guards до/после parallel reads/RPC/post-read/result/error. Verified
  refresh той же identity допустим; logout/same-user relogin/switch fail closed.
  Credentials не входят в keys/payload/errors/results/logs.
- [ ] Hook session/scope/attempt/focus lifecycle и onboarding route submit/navigation
  generation fenced. Old response/error/finally не сбрасывает новую форму/lock,
  не навигирует в чужую роль/workspace. Double tap/unknown RPC result дают безопасный
  повтор существующего atomic onboarding, без дублирования workspace/first client.
  Если existing server replay недостаточен, исправить additive migration в этом PR.
- [ ] Полный synthetic workflow first trainer→setup→optional client→real clients→
  return/retry, returning trainer/client-only/multi-connection; service/hook/route
  tests same-user relogin на всех awaits, actor/owner/malformed rows, verified refresh,
  lost response/double tap/unmount/late errors. Existing clients/library/invitations
  regressions зелёные, SQL права/atomic repeat contracts сверены, новые cases при пробеле.

## Границы

features/onboarding/{service,use-onboarding-context,welcome-screen,welcome-model}.ts[x],
app/app/auth/onboarding.tsx, новые onboarding-specific helpers; свои tests/review,
минимальные docs/i18n. Existing shared hook API совместим: другие routes только
читают его, не требуют изменений. Existing clients/read/create из прежних work
задач сохранить. SQL только onboarding-specific новые tests/additive fix при доказанном
defect. Не менять auth provider/storage/providers/login routes, account export controls
(third), invitation service/pending/routes (personal), client schedule/financial
(personal), library/template/program/scheduling/journal/correction/export writers,
зависимости/prototype/cloud. Один рабочий агент, без субагентов.

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
