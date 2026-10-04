# SOM-22 · Завершить надёжный production-сценарий библиотеки

Linear: https://linear.app/something-great/issue/SOM-22
Ветка: agent/02-som-22-library-production-finish. Заголовок PR с SOM-22.

## Контекст

Целая оставшаяся техническая работа SOM-22: создание своего упражнения, поиск,
архивирование и сохранение ранее созданных шаблонов/программ/результатов.
Схема, starter catalog, поиск и archive-safe references уже в базе; read fencing
PR44 влит. createWorkspaceExerciseOperation и archiveWorkspaceExerciseOperation
используют mutable client и кешируют результат без actor/session guards; provider
и экраны должны иметь законченный безопасный сценарий, а не отдельный transport.
Выполнять после текущего SOM-23 и 01-SOM-20 этого же аккаунта. SOM-18 уже влит;
невлитые ветки personal/third не нужны. Нового продуктового решения нет.

## Критерии

- [ ] Пройти полный production сценарий: тренер находит упражнение по нормализованному
  имени/ё-е, создаёт своё, использует его в шаблоне, архивирует, старый шаблон и
  immutable client program/история сохраняют исходные сведения. Архив отсутствует
  среди новых selectable упражнений; snapshots не переписываются.
- [ ] Создание/archive и их callers закрепляют expected actor/workspace/JWT sub/session_id
  до async, explicit bearer и guard до/после IO/error/cached result. Logout/same-user
  relogin/switch/unmount не публикуют ссылку/успех, не очищают новую форму/lock.
  TOKEN_REFRESHED без доказанной той же identity недостаточен; нормальный refresh работает.
- [ ] Lost response/retry/double tap не создают дубль: сохранить текущий согласованный
  input и replay identity до известного исхода, duplicate reconciliation проверяет
  полный payload/свой workspace. Archive повтор безопасен; storage/clear failure
  не превращать в success. Не вводить hard delete или новую пользовательскую policy.
- [ ] Runtime validate unknown mutation rows, IDs/scope/dates/units; не доверять SDK
  cast или filter alone. Сохранить read pagination/нормализацию и существующий UI.
- [ ] Независимые service/provider/screen tests: create→attach→archive→existing-read,
  duplicate exact/different payload, lost response/retry, auth смена на каждом await,
  refresh/wrong claims, late errors/finally/new submit/unmount; existing template,
  assignment и read tests остаются зелёными. Existing SQL archive-history contracts
  сверить; недостающее покрытие добавить без изменения исправной схемы.

## Границы

workspace-library/service.ts только exercise mutations и exercise-specific helpers;
provider.tsx только exercise create/archive callers, соответствующие library/exercise
screens/routes, свои tests/review. Template save/archive/read и draft protocol из
предыдущих work задач сохранить. SQL только новые SOM-22 regression tests либо
необходимая additive migration при доказанном defect. Не менять программы/assignment,
clients, invitations (personal), client-scheduling/financial (personal), journal/
corrections/sync/export (third), auth provider, зависимости или prototype.
Общие docs/i18n минимально. Один рабочий агент, без субагентов.

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
