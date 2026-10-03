# SOM-34 · Изоляция финансовых чтений по сессии

Linear: https://linear.app/something-great/issue/SOM-34

## Контекст

SOM-33/34, capped payments и reversal history влиты. loadTrainerBilling и
loadTrainerPayments фиксируют token после начального getSession; hooks key
содержат user/workspace/client/attempt, но не идентичность новой сессии того же user.
Поэтому late read после logout/login потенциально выдаёт старый финансовый snapshot.

## Критерии

- [ ] Auth lifecycle fencing обоих read services: expected actor/workspace/client,
  единая авторизация всех pages, повторная проверка при публикации snapshot;
  logout/new session/switch fail closed. Refresh token не считать новой сессией
  автоматически; использовать уже влитый контракт идентичности auth.
- [ ] Billing/payments hooks очищают данные при смене сессии, отбрасывают late
  success/error/retry/unmount, включая новую сессию того же user.
- [ ] Bounded paging, duplicate detection, runtime validation и scoped relation
  integrity не допускают truncated success или false zero balance. Сохранить
  точные integer money strings, reversal одной строкой, totals по ADR0059.
- [ ] Meaningful tests session switch между страницами и перед result,
  same-user relogin, refresh, >500/limits/duplicates, foreign/malformed и hook retry.

## Границы

Только read части trainer-billing/service.ts, use-billing.ts и
trainer-payments/service.ts, use-payments.ts; локальные read helpers/tests.
Разрешён минимальный validator read helper в этих features. Нельзя менять
commands/use-commands/command-storage/types mutation API, платежные/покупочные/attendance
UI и rules, workspace/client routes, workspace-scheduling, client-history,
auth provider, account-export/deletion, SQL/database.types.ts/dependencies.

## Источники

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/README.md, CONVENTIONS.md, PROJECT-MEMORY.md, раздел «Где остановились»
ROADMAP.md, DELIVERY-PLAN.md, OPEN-QUESTIONS.md, UI-PARITY.md, ADR 0007/0061/0066.
Сначала graft map/ask; если graft недоступен — записать ограничение и читать
точные файлы. Проверить свежую базу и уже выполненные части. Session-fencing
account-export и auth только читать, не создавать общий auth refactor.


Конкретные исходники: app/src/features/trainer-billing/service.ts
(loadTrainerBilling/authenticate), use-billing.ts, validation.ts;
app/src/features/trainer-payments/service.ts (loadTrainerPayments), use-payments.ts.
ADR0059 о capped payments/reversal/totals и существующие tests billing/payments
обязательны как регрессии; mutation части service.ts только сохранять.

## Проверка и отчёт

- [ ] cd app && npm run check зелёный; CHANGELOG.md «Не выпущено», минимальный
  checkpoint ROADMAP; app/review/som-34-financial-read-session-fencing/README.md с точными проверками и пробелами.
- [ ] Новый подход документирован ADR; app без комментариев/any, секретов, новых PNG.

Нет Docker/Supabase/браузера/устройств: SQL/RLS/live auth/native/визуальный паритет
и приёмку не объявлять проверенными. Только synthetic fixtures; реальные данные
клиентов и платные сервисы запрещены. Не задавать вопросов, не менять Linear,
правила/скрипты/main. Draft PR agent/som-34-financial-read-session-fencing только в fix/som-50-template-picker,
заголовок SOM-34. Экраны и весь issue принимает владелец.
