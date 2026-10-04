# 0093. Lifetime вызывающего редактора шаблона

- **Статус:** Реализовано технически; runtime и приёмка открыты
- **Дата:** 04.10.2026
- **Задача:** SOM-23

Session fence ADR 0085 защищает transport/provider, но layout provider переживает
editor route. Поэтому успешный результат provider не разрешает старому screen
показывать toast, фокусировать поле или навигировать.

Совместимый optional контракт editor store добавляет числовой opaque scope,
capture текущего provider generation/draft epoch и pendingSave. Scope уникален
между экземплярами provider и меняется при begin/copy, явном reload, hydration и
инвалидации сессии. Обычные изменения полей, busy/catalog и verified token refresh
его сохраняют. Scope не содержит user/workspace/JWT и не записывается на диск.

Screen и route создают отдельную форму по scope/client context. Это сбрасывает
initialized/edited/error/picker/reload feedback без переноса состояния между
черновиками. Screen захватывает guard и номер попытки до await; leave и unmount
отменяют callbacks. Локальный lock закрывает double tap до перерисовки provider.
Provider сохраняет существующие owned lock и durable pending recovery; уход
screen не прерывает подтверждение серверной операции. Back допускает уход во
время save, reopen использует тот же pending запрос. Launcher проверяет свой
lifetime и хранит confirmation только для текущего scope/client context.

Неопределённый pendingSave нельзя заменить обычной правкой или begin/copy:
разрешены retry прежнего payload/requestId, явный discard и загрузка сервера.
Reload публикует серверный draft только после guarded успешной записи в storage;
при отказе сохраняются старые draft/pending и ошибка текущего route.

Transport, receipts, auth provider, immutable program policy, dependencies и
геометрия picker не меняются. Synthetic service/provider/screen/route тесты
проверяют контракты независимо; pgTAP проверяет полный template-specific SQL flow
в CI. Реальные Auth/storage/crash/reopen/native/parity и одобрение владельца
остаются отдельными воротами, не доказанными synthetic fixtures.
