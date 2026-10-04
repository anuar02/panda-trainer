# 0092. Пользовательский экспорт с явным покрытием источников

- Дата: 04.10.2026
- Статус: техническая реализация; runtime и приёмка владельца открыты
- Задача: SOM-41, только экспорт

Серверный экспорт v1, pure local serializer и scoped SQLite snapshot остаются
отдельными совместимыми контрактами. Пользовательский flow объединяет доступные
источники в `panda-trainer-account` v2: серверный snapshot, scoped локальные
операции с receipts, распознанные записи и manifest sources/gaps.

Выбран read-only collector с bounded чтениями и проверками account/workspace/JWT
identity. Локальные pending читаются существующими API; неизвестные payload и
недоступные источники получают явный gap, а не приводятся к корректной projection.
Новые зависимости и изменения writers не требуются. Альтернатива выдачи
`pending(100)` за backup отвергнута: она теряет confirmed и последующие операции.

`globalAtomicity` остаётся `unknown`, общий статус — `incomplete`. Exclusive
SQLite transaction относится только к конкретному чтению. Повторное сравнение
содержимого до/после асинхронных шагов и файла выявляет наблюдаемые изменения,
но не доказывает отсутствия промежуточной записи, ABA, других connections,
серверных mutations или других устройств. Snapshot ID и timestamps не являются
write barrier. Чужие save/ack протоколы ради экспорта не изменяются.

File outcome относится к конкретному содержимому, scope и snapshot. `shared`
означает ответ системного меню, а не проверенное сохранение у получателя.
Ошибка cleanup и смена identity не дают успешного evidence. Этот export не
создаёт deletion authorization, ack proof или разрешение purge/logout.

Недоступные для исчерпывающего чтения caches/drafts, исключённые operational
receipts, infrastructure logs/backups и другие устройства описываются как gaps.
Публикация политики, юридические основания, общий клиентский аккаунт и удаление
остаются отдельным пакетом после ACCOUNT-DELETION-HANDOFF review.

[Проверки и ограничения](../../../app/review/som-41-complete-export/README.md).
