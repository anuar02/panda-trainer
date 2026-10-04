# SOM-26 · Завершить production-сценарии Today, недели и создания занятия

Linear: https://linear.app/something-great/issue/SOM-26
Ветка: agent/03-som-26-schedule-production-finish. Заголовок PR с SOM-26.

## Контекст

Целая оставшаяся техническая работа SOM-26: Today → занятие/запросы, неделя →
свободное окно/«+» → создание → актуальные Today/week, включая честные retry states.
SOM-25 schema/RPC/snapshots, trainer schedule read PR41 и booking creation PR50
влиты. Сохранить их контракты и не делать новый отдельный transport/fence пакет.
Работать после завершённого 02-SOM-21 этого аккаунта; его невлитый код не нужен.
Client schedule read имеет OK без опубликованного PR: не считать его dependency,
не повторять отдельный read бриф. Эта задача владеет trainer presentation и
полным create/refresh lifecycle. Нового продуктового решения нет.

Конкретный gap свежей базы: WorkspaceToday/WorkspaceSchedule и MutationProvider
ключуются только user/workspace; UI selections/sheets/router callbacks и provider
run result могут пережить relogin того же user. Уже защищённые read/create hooks
не гарантируют безопасность вызывающих экранов. Проверить целый сценарий,
исправить доказанные пропуски, сохранить точные тексты и геометрию прототипа.

## Критерии

- [ ] Production Today показывает хронологию/current/upcoming/past и запросы;
  week показывает свободные окна, из окна и «+» открывает создание с корректными
  date/start. Мини-группа имеет отдельные bookings и согласованный план;
  созданное занятие появляется после реального server read, без demo fallback.
- [ ] Полный create→overlap acknowledgement→save→refresh→open workflow:
  atomic server result, snapshot выбранного шаблона, timezone/UTC/revision и
  один durable requestId при lost response/retry. Нет дублей или hidden truncation.
  Existing server policy не менять; payment/attendance/booking status не смешивать.
- [ ] Все caller selections/sheets/pending-create/router callbacks/locks ограничены
  actor/workspace/login/generation до async. Logout/same-user relogin/switch/unmount
  не сохраняют old selection/error и не навигируют поздним результатом; verified
  same-session refresh работает. Credentials не входят в React keys/results/logs.
- [ ] Read refresh и mutation generation согласованы: old response/finally не
  закрывает новую шторку и не снимает новый lock. Empty/offline/failure/retry честные;
  out-of-window requests сохранены. Не ослаблять существующие guarded services.
- [ ] Независимые screen/provider + service/SQL integration regressions: оба entry
  points, chronology/free windows, групповые snapshots, exact retry и overlap,
  day/week rollover timezone, relogin на navigation/load/create/refresh seams,
  switch/unmount/late errors/new submit. Existing status/proposal/billing behaviour
  сохранить. SQL regressions только при реальном пробеле, без переписывания схемы.

## Границы

workspace-scheduling/{workspace-today-screen,workspace-schedule-screen,
workspace-create-session-screen,mutation-provider,today-adapter,screen-adapter,
agenda}.ts[x], узкие trainer schedule route callbacks при необходимости; свои
tests/review/minimal docs/i18n. Create/read transport и pending APIs PR41/50 только
необходимая совместимая правка при доказанном gap полного сценария.
Status/proposal-specific transport/hooks/storage и client cancellation UI —
следующий SOM-27 того же аккаунта, здесь их не переписывать. Financial facade в
provider сохранить, billing implementation не менять. Не менять client-history/
program/home progress, library/clients/onboarding (work), journal/corrections/
export/sync (third), auth provider/deps/prototype/cloud. SQL только SOM-26 regression
или строго необходимая новая additive migration; database types только additive.

## Источники

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,DELIVERY-PLAN,ROADMAP,OPEN-QUESTIONS,PROJECT-MEMORY,
UI-PARITY,DATA-MODEL}.md, ADR0007/0059/0061/0064/0066; prototype-fresh/index.html,
js/sheets.js/js/store.js и docs/prototype-guide.md только читать.
Graft map/ask прежде source; отсутствие executable/графа честно записать.
Свежая fix/som-50-template-picker обязательна. Работа только по влитой базе,
невлитые ветки других аккаунтов не зависимости; исправные APIs/tests сохранить.

## Проверка и завершение

- [ ] Независимые tests полного сценария, meaningful regression сначала воспроизводит
  дефект; cd app && npm run check зелёный. SQL при изменении — pgTAP/concurrency,
  type drift и точный handoff для CI; existing migrations не редактировать.
- [ ] CHANGELOG «Не выпущено», minimal ROADMAP и свой app/review/<имя-брифа>/README.md
  с командами/результатами/непроверенным; ADR при новом подходе со свободным номером.
  App без comments/any/секретов/новых PNG, пользовательские строки через i18n.

В контейнере нет Docker/Supabase/нативных устройств: реальный SQL/RLS/Auth,
SQLite/AsyncStorage/crash/reopen, два телефона, native/visual/accessibility/parity
и одобрение владельца не доказаны mocks. Использовать synthetic fixtures;
SQL runtime выполняет CI, needs-local-db оставлять Claude. Экраны и issue не
объявлять принятыми. Не менять Linear/scripts/rules/main, prototype, платные
сервисы или реальные клиентские данные. Один агент, без субагентов.
