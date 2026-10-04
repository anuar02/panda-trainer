# SOM-27 · Завершить переносы и отмены обеих ролей в production

Linear: https://linear.app/something-great/issue/SOM-27
Ветка: agent/04-som-27-reschedule-production-finish. Заголовок PR с SOM-27.

## Контекст

Целая оставшаяся техническая работа SOM-27: предложенное время отдельно от
confirmed booking, propose/counter/accept/decline/withdraw, отмена обеими ролями,
явное late-cancellation списание с причиной, revision conflict и durable recovery.
SOM-25 и SOM-33/34 SQL/RPC/UI уже в базе; payment reversal/capped payment policy
ADR0059 сохранена. После 03-SOM-26 этого же аккаунта: общие provider/screens уже
можно последовательно интегрировать. Нет зависимости от third correction/export.

Старый third/som-27-status-proposal-session-fencing имеет OK, но нет PR или remote
branch. Это НЕ влитая зависимость; новый бриф включает весь ещё недоказанный
production workflow по fresh base, а не повтор старого microtask. Его незапущенной
работой не считать; ветку/результат не выдумывать. client-scheduling/use-status
и status/proposal hooks сейчас ключуются user/workspace без session; поздний
RPC/clear/callback может пересечь relogin. ClientBookingControls mounted alone
не ограничивает позднее закрытие новой шторки. Всё проверить вместе с UI/server.

## Критерии

- [ ] Production обеих ролей: предложенное время не меняет confirmed booking до
  согласования; counter/accept/decline/withdraw обновляют только свои booking/
  proposal. Expected revisions обязательны; stale response объясним и допускает
  refresh/явный новый выбор, нет автоматического overwrite или silent success.
- [ ] Отмена клиентом/тренером и отдельное late-cancellation списание с причиной
  работают с действующими permissions/receipts. Не вводить automatic debit,
  whole-group cancellation или новую продуктовую policy. Уже влитый billing API
  использовать через совместимый caller, его implementation не менять.
- [ ] Actor/workspace/client/session закреплены до async; JWT sub/session_id,
  explicit bearer и guards вокруг IO/errors/cached result. Verified refresh
  допустим, logout/same-user relogin/смена scope/unmount fail closed. UI selection,
  callback/navigation/sheet/lock не пересекают поколения. Credentials вне keys/
  payload/errors/storage/export. Existing read hooks и provider APIs совместимы.
- [ ] Status/proposal durable requestId/canonical payload неизменны до известного
  исхода, lost response/reopen/retry не дублирует мутацию. Conditional clear только
  своей актуальной команды, не удаляет newer pending. Storage failure после server
  success сохраняет exact replay. Resolution только validated succeeded/abandoned,
  foreign/stale/notFound/conflict states честные; double tap исключён.
- [ ] Независимые полные transport/store/hooks/screens сценарии обеих ролей:
  propose→counter→accept, decline/withdraw, client/trainer cancel, stale concurrent
  revision/overlap, lost response/retry/reopen, clear failure/newer command,
  relogin на каждом await/late error/unmount. Unit переходов/пересечений, pgTAP
  ownership/revision/receipt/late reason и существующий concurrency harness;
  расширить недостающее покрытие без изменения исправной серверной policy.

## Границы

workspace-scheduling status/proposal operation/submission/pending/hooks,
request-resolution, workspace-session-controls/workspace-proposal-controls,
client-scheduling/use-status/client-booking-controls/client-schedule-screen,
узкая совместимая provider интеграция после предыдущего SOM-26; свои helpers/
tests/review/minimal docs/i18n. Client schedule read service/use-schedule только
читать, unpublished отдельный read бриф не дублировать. SQL SOM-27 tests/concurrency
и новая additive fix migration только при доказанном gap; existing migrations
не менять. Не менять billing/payments implementation, library/clients/onboarding
(work), journal/corrections/export/sync (third), client-history/program/progress,
auth provider/deps/prototype/cloud. Не реализовывать SOM-36/37/73 в этом PR.

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
