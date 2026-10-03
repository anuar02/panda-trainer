# SOM-33/SOM-34 · Довести пакеты и ручные оплаты

Linear: https://linear.app/something-great/issue/SOM-33,
https://linear.app/something-great/issue/SOM-34

## Контекст

Работа почти готова и лежит в базовой ветке последним коммитом
`wip(SOM-33,SOM-34): package creation and capped payments in progress`.
Не начинать заново: продолжить с этого коммита.

Решения владельца (зафиксированы в `docs/app/decisions/0059-package-creation-and-capped-payments.md`):

1. Оплата положительная и не больше остатка долга своего пакета. Частичная оплата
   уменьшает долг, не меняя посещения и кредиты. Переплата — инлайн-ошибка
   «Больше долга по пакету (X ₸)». Без скрытого кредита и отрицательного долга.
2. «Добавить пакет» на вкладке «Оплаты» клиента. Шторка как у «Записать оплату»:
   название, число занятий, цена в KZT, необязательный срок.
3. Форма нового пакета — одобренное отличие от прототипа; её внешний вид всё равно
   требует одобрения владельца.
4. Исправление посещения возвращает списанное занятие один раз; пригодность пакета —
   по дате занятия в часовом поясе workspace, день окончания включительно.

Уже сделано и проверено локально у владельца: миграция
`supabase/migrations/20261003110000_payment_commands.sql`, pgTAP
`supabase/tests/database/payment_commands.test.sql` (723 проверки) и сценарии
конкурентности, домен и чтение оплат (`app/src/domain/payments.ts`,
`app/src/features/trainer-payments/`), транспорт команд, шторка оплаты, форма
пакета, интеграция в `app/app/workspace/client/[id].tsx`, `database.types.ts`.

## Критерии

- [ ] Починить ошибки typecheck в тестах:
  `app/tests/trainer-billing-commands.test.ts:96` (`mock.calls[0][0]` и `[1][0]`
  могут быть undefined) и `app/tests/workspace-client-purchases-route.test.tsx:209,230,236`
  (`getAllByRole(...)[1]` может быть undefined). Явные проверки существования,
  без `!` и без `any`.
- [ ] `cd app && npm run check` зелёный целиком; исправить настоящие падения.
- [ ] Ревью отображения истории оплат против `prototype-fresh/index.html`: статусы,
  способ, дата, сумма, восстановление после ошибки. Расхождения исправить или
  записать в `docs/app/UI-PARITY.md`.
- [ ] Ревью точности денег (bigint как строки, без float), изоляции аккаунтов и
  workspace, идемпотентного повтора команды после потерянного ответа.
- [ ] Обновить `CHANGELOG.md`, `docs/app/ROADMAP.md`; в ADR 0059 заменить
  «implementation pending» на фактический статус.

## Чего в контейнере нет

Docker, локального Supabase, браузерных фикстур и Playwright нет. SQL-тесты и
браузерный сценарий не запускать; в отчёте пометить их «не проверено в
контейнере» и сослаться на результаты владельца выше. Новые PNG не коммитить.

## Границы

`app/src/features/trainer-billing/`, `app/src/features/trainer-payments/`,
`app/src/domain/payments.ts`, `app/app/workspace/client/[id].tsx`, тесты billing и
оплат, ADR 0059, документы из критериев.
Не трогать: миграции и схему Supabase (только если тест доказывает ошибку — тогда
новая миграция, не правка существующей), `app/src/ui/` кроме уже сделанного
`closeLabel` в `sheet.tsx` (SOM-39 меняет шторки параллельно), маскота (SOM-38),
picker (SOM-50).
