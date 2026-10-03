# SOM-34 · Отмена оплаты и история сторно

Linear: https://linear.app/something-great/issue/SOM-34

## Контекст

База `fix/som-50-template-picker`, включая решение владельца `8c03812` / ADR 0059.
SOM-33 и предыдущий пакет SOM-34 влиты (#22); reverse_client_payment и typed
reverseClientPayment уже существуют. Новый follow-up реализует решение владельца:
одна строка отменённой оплаты, зачёркнутая сумма, «Отменена» и дата отмены;
тренер отменяет оплату с подтверждением, долг считается без неё. SOM-34 Done
в Linear, но новое решение и открытая реализация находятся в репозитории.
Linear не менять. Personal выполняет SOM-39 (shared UI, профиль, Today, журнал),
third — SOM-29 (SQLite/outbox/SQL); их файлы исключены. Работай одним агентом.

## Критерии

- [ ] Проекция истории сохраняет отменённую оплату одной строкой, без отдельной
  отрицательной строки: исходная зачёркнутая сумма, «Отменена», дата отмены.
  Сопоставлять reverses_entry_id; сохранять bigint точность без Number.
  Невалидные/чужие связи не превращать в успешное состояние. Долг исключает
  отменённую оплату, посещения и кредитный ledger не изменяются.
- [ ] Неотменённая оплата имеет «Отменить оплату» с явным подтверждением.
  Cancel ничего не отправляет. Использовать существующий reverseClientPayment
  и его обязательные поля; новый серверный API не нужен. Отменённая оплата
  недоступна для повторной отмены. Новые строки через i18n модуля.
- [ ] Подключить отмену к scoped durable command recovery и workspace mutation
  lock: двойное нажатие не создаёт две команды; lost response/restart повторяют
  тот же command ID. Не показывать успех до server receipt. После успеха
  обновить историю/долг покупки. Account/workspace/client switch не отправляет
  прежнюю команду за нового пользователя.
- [ ] Тесты: обычная/отменённая оплата, одна строка истории, дата/долг, большая
  сумма, cancel/confirm, double tap, lost response/exact retry, ошибки,
  account/client switch. Сохранить regression новых оплат/пакетов; существующие
  assertions не ослаблять.
- [ ] `cd app && npm run check` зелёный. CHANGELOG, checkpoint ROADMAP,
  ADR 0059 и отчёт `app/review/som-34-payment-reversals/README.md` обновлены:
  команды, результаты, непроверенные сценарии. Не объявлять экран принятым.

## Источники

`AGENTS.md`, `app/AGENTS.md`, `docs/app/README.md`, CONVENTIONS, UI-PARITY,
PROJECT-MEMORY, OPEN-QUESTIONS и ADR 0059 в `docs/app/`;
`app/src/domain/payments.ts`, `app/src/features/trainer-payments/`,
`app/src/features/trainer-billing/`,
`app/src/features/workspace-scheduling/mutation-provider.tsx`,
`app/review/som-34-billing-finish/README.md`, существующие payment tests,
`prototype-fresh/index.html` и `prototype-fresh/review/parity/spec-*.json`.
Сторно — одобренное отличие; использовать layout существующих row/sheet.

## Границы

`app/src/domain/payments.ts`, `app/src/features/trainer-payments/`,
`app/src/features/trainer-billing/` только payment projection/history/reversal
и command storage/recovery; минимальное подключение в
`app/src/features/workspace-scheduling/mutation-provider.tsx` при необходимости.
Соответствующие billing/payment tests, новые reversal tests, отчёт,
CHANGELOG, ROADMAP, ADR 0059 и необходимые документы.
Не менять `app/src/ui/`, Today/журнал/профиль, маскота, workout-sync/SQLite,
database.types, package files, SQL migrations/права, attendance/scheduling
бизнес-логику, auth, picker и прототип. Серверные API уже в базе;
старые миграции только читать. Платные сервисы и реальные данные запрещены.

## Чего нельзя проверить в контейнере

Нет Docker, Supabase, браузера и нативных устройств. Не заявлять свежий pgTAP,
SQL concurrency, реальный network replay или визуальную/native приёмку.
Подготовить воспроизводимые сценарии; mock tests доказывают только локальные
инварианты. Draft PR только в `fix/som-50-template-picker`, ветка
`agent/som-34-payment-reversals`.
