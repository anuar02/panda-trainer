# SOM-34 · Завершить полный production-сценарий оплат и долга

Linear: https://linear.app/something-great/issue/SOM-34
Ветка: agent/05-som-34-billing-production-finish. Заголовок PR с SOM-34.

## Контекст

Выполнять после 03-SOM-26 и 04-SOM-27 этого аккаунта. SOM-33 ledger, SOM-34
manual payments/reversals/capped policy, read fencing PR43 и command fencing
PR53 уже в базе. Использовать их совместимые API; не переписывать исправные
contracts ради нового пакета. ADR0059: частичная оплата уменьшает долг, не
посещения; переплата отклоняется, сумма занятий по неистёкшим пакетам, долг по
всем, включая истёкшие. Решения закрыты; новых продуктовых правил не требуется.

Это весь оставшийся пользовательский сценарий SOM-34: реальные покупки клиента,
ручная оплата, долг, история и явная отмена оплаты, согласованное обновление
карточки и billing. Previous command package не менял UI. В текущем
ClientPurchaseControlsContent paymentSelection/reversalId/open/submittedPurchaseId
не сбрасываются при mutations.generation change (effect только retry reads).
PaymentForm/PurchaseCreateForm/PaymentReversalSheet проверяют mounted, но нужно
проверить полный сценарий same-user relogin/смены выбранной формы и позднего
результата. Existing key по purchase ID сохранить: одинаковое название пакетов
не идентифицирует покупку. Одна техническая задача целиком, не отдельный UI fence.

## Критерии

- [ ] Production клиентская карточка тренера и billing показывают реальные
  покупки/остаток/долг/историю. Пройти создание разрешённого пакета→частичная
  ручная оплата→остаток долга→полная оплата→явное сторно с причиной→восстановленный
  долг. KZT integer minor strings без float; дата/автор/manual source сохранены.
  Сторно одной строкой с зачёркнутой суммой, статусом и датой по ADR0059.
- [ ] Сумма сверх актуального долга даёт ошибку под полем суммы; конфликт/ошибка
  refresh не показывает фиктивный баланс/success. Занятия/доступ к расписанию
  не меняются от долга. Истёкшие покупки учитываются по согласованной policy.
  Соседние клиенты/workspaces и пакеты с одинаковым названием не смешиваются.
- [ ] Form selection/session/caller/attempt фиксируются до async. Logout/relogin
  того же user/switch/unmount/close→reopen не переносят старые поля/errors/busy,
  не закрывают новую форму и не публикуют поздний callback/result. Normal verified
  refresh допускается. При смене auth identity скрыть old selection/draft согласно
  scoped contracts без удаления durable uncertain команды. Не включать токены
  в keys/state/results/storage/logs. Данные read и projection не пересекают session.
- [ ] Double tap/lost response/offline/reopen/retry используют один durable requestId
  и canonical payload; после known receipt обновляют только свой scope. Clear/read
  failure честный и допускает безопасное продолжение; pending неопределённость не
  заменять новым запросом. Сохранить PR53 guards/terminal policy/conditional clear.
  Явная отмена оплаты не debit/attendance и не удаление истории.
- [ ] Независимые интеграционные read+command+screen/controller tests полного
  purchase→pay→debt→reverse→reload workflow, два пакета одинакового названия,
  expired balances, lost result/exact replay/double tap, clear/read failures,
  auth смена на deferred awaits, relogin→fresh form→old completion,
  close/reopen/unmount/normal refresh. Сверить server pgTAP/concurrency receipts,
  rights/overpayment/reversal/rollback contracts; реальные пробелы добавить
  новыми SQL tests/additive fix, не выдавать synthetic receipts за SQL runtime.

## Границы

trainer-billing/client-purchase-controls,purchases-panel,purchase-create-sheet,
trainer-payments/payment-sheet,reversal-sheet и соответствующие финансовые
screen/controllers/read+command helpers при доказанном defect; собственные tests/
review/minimal docs/i18n. В карточке workspace-clients использовать существующий
financial component seam, implementation clients/onboarding не менять (work).
Существующие financial service/storage/hook contracts сохраняются; не менять
workspace-mutations provider и scheduling callers, законченные предыдущим брифом.
SQL только payment/purchase-specific новые tests/additive migration; существующие
migrations не менять. Не менять library/editor/onboarding/clients (work), auth
provider/invitation/client history/programs, journal/correction/sync/export (third),
deps/prototype/cloud/DNS/SMTP. Не добавлять automatic debit/overdraft/new policy.
Один агент без субагентов, приёмку SOM-47 не включать.

## Источники и проверка

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md;
docs/app/{README,CONVENTIONS,DELIVERY-PLAN,ROADMAP,OPEN-QUESTIONS,PROJECT-MEMORY,
UI-PARITY,DATA-MODEL}.md; ADR0053/0054/0055/0057/0059/0077/0086/0066,
docs/prototype-guide.md, prototype-fresh/index.html и review/parity/spec-*.json
только читать; app/review/som-34-financial-command-session-fencing/README.md,
existing financial SQL/app tests. Graft map/ask либо записать недоступность.
Свежая fix/som-50-template-picker; невлитые чужие ветки не dependencies.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/05-som-34-billing-production-finish/README.md: точные команды,
  результаты/критерии/ограничения; ADR при новом подходе со свободным номером.
  App без комментариев/any, строки через i18n, без секретов и новых PNG.

Нет Docker/Supabase/browser/native: SQL/pgTAP/concurrency исполняет CI; реальные
Auth/storage/crash/reopen, native/parity/два устройства и приёмка не доказаны mocks.
Local DB gate оставить needs-local-db для Claude. Не задавать вопросов, не менять
Linear/scripts/rules/main, не использовать платные сервисы/реальных клиентов.
PR только agent/* → fix/som-50-template-picker; экраны и issue принимает владелец.
