# Передача будущего пакета удаления аккаунта

SOM-41, review checklist от 03.10.2026, база 4758705.
Это незавершённые проверки, не реализованный deletion flow и не новое продуктовое
решение. Весь SOM-41 остаётся открытым. См. [карту](DATA-LIFECYCLE.md),
[проект политики](PRIVACY-POLICY-DRAFT.md),
[ADR 0064](../decisions/0064-pilot-data-region-retention-and-invites.md) и
[ADR 0062](../decisions/0062-sqlite-journal-outbox.md).

## Серверная авторизация и область удаления

- [ ] Проверить сервером действующую сессию и личность инициатора; не доверять
      переданному account/workspace ID или выбранной роли интерфейса. Проверить anon,
      expired token, чужой workspace, смену пользователя и повтор.
- [ ] Privileged Auth API и service credentials оставить на сервере, не включать
      в app/export/ошибки/логи. Дополнительное подтверждение личности и UX должны
      пройти review; этот документ их не выбирает.
- [ ] Перечитать ownership на сервере. Scoped cascade — требуемый охват данных
      целевого тренера, а не готовый SQL ON DELETE CASCADE. Построить порядок по
      фактическим FK, triggers, immutable ledger и self-links.
- [ ] Проверить всё из карты: архивы/soft delete, программы/снимки, bookings/groups/
      proposals, draft/finished journals, обе категории заметок, conflicts/correction
      drafts/sync receipts, purchases/attendance/revisions/credits/payments/reversals,
      invitations и все private command receipts.
- [ ] Учесть Auth ссылки owner/user/accepted_by/author/created_by/receipts.
      profiles CASCADE и client_records.user_id SET NULL не доказывают удаления
      данных: workspace и зависимые FK используют RESTRICT/NO ACTION. Отдельность
      Auth и БД требует проверки частичного отказа и восстановления.
- [ ] Доказать, что удаление workspace A не удаляет общий client account,
      его профиль/сессию, карточки/историю у B. Fixture: клиент связан с A и B.
      Отдельно: тренер одновременно клиент B.
- [ ] Удаление самого общего аккаунта клиента, сохранение/отвязка trainer cards
      и доступ к прежней истории требуют отдельного review специалиста и владельца.
      Не выводить продуктовый ответ из SET NULL или слова «аккаунт» в ADR.

## Pending, logout и повтор

- [ ] Инвентаризировать локальные хранилища карты: SecureStore chunks, invitation
      bearer token, AsyncStorage drafts/pending, SQLite projection/outbox, память,
      web sessionStorage и копии на других устройствах.
- [ ] Соблюсти ADR 0062: неподтверждённые операции остаются при logout, purge API
      отсутствует; нужен отдельный проверяемый export/ack. Не вводить destructive purge,
      auto-drop rejected/conflict или blanket AsyncStorage.clear как shortcut.
- [ ] До logout/switch остановить runner; каждый вход получает новый sessionId.
      Поздний ответ старой сессии не подтверждает операции новой. Проверить inflight,
      logout, возврат в тот же account, смену workspace и storage failure.
- [ ] Различать локальное сохранение, receipt, конфликт, rejected и correction
      draft. Backend export не покрывает несинхронизированное. Как экспортировать
      и явно подтвердить локальную очередь — открытая работа.
- [ ] Проверить exact retry/idempotency после timeout/потерянного ответа и reopen;
      не создавать новый request ID только из-за неизвестного результата.
      Отказ между БД и Auth, concurrent commands и повтор после успешного Auth delete
      требуют отдельного серверного контракта, без обещания атомарности этих систем.
- [ ] Определить и проверить interlock удаления и новых/повторных mutations, чтобы
      pending или другое устройство не восстановило удалённое. Механизм блокировки,
      export/ack и UX должны быть reviewable в будущем пакете.
- [ ] Не объявлять очистку потерянного/оффлайн телефона доказанной серверным ответом.
      ADR 0064: несинхронизированное на потерянном/сломанном телефоне не восстановить.
      Локальные копии, downloaded export и OS backup ещё требуют review.

## Экспорт, бэкапы и принятие

- [ ] Сверить отдельный backend export с таблицей E: pagination, полнота истории,
      scoped snapshot и роли. Этот handoff не тест экспорта. Синтетическими маркерами
      проверить отсутствие чужого trainer/card и приватных данных в client API.
      Trainer export может содержать его приватные заметки; юридический запрос
      клиента о его данных — отдельное нерешённое основание выдачи.
- [ ] Проверить отсутствие паролей/хэшей Auth, access/refresh tokens, OTP/PKCE,
      invitation tokens/URLs/token_hash, service keys и секретов в export/логах.
      Не выдавать receipts/envelopes через необработанный SELECT *: request/result
      JSON может содержать токен или приватный текст.
- [ ] Подтвердить отдельный пилотный EU Central (Франкфурт) для базы/бэкапов/логов;
      реальные данные заблокированы до проверки профильного специалиста.
- [ ] Доказать вывод удалённых данных из бэкапов при ротации ≤7 дней по ADR 0064:
      настройки, сроки, восстановление и предотвращение повторного появления.
      Free tier не имеет подтверждённых ежедневных бэкапов; SOM-52 закрыт: бесплатные тарифы и собственный ночной дамп
      ([ADR 0067](../decisions/0067-free-tier-pilot-budget.md)); эксплуатационные настройки открыты. Не обещать SLA или удаление бэкапов на основании документа.
- [ ] Проверить состав, доступы и очистку infrastructure logs, временных export
      артефактов и будущих хранилищ. Monitoring/push не объявлять готовыми.
- [ ] Выполнить SQL reset/lint/pgTAP и concurrency на синтетических аккаунтах,
      native SQLite/logout/reopen/offline на iOS/Android, фактическое облачное удаление/
      бэкапы и юридический review. В этом контейнере они не выполнены.
- [ ] Получить одобрение владельца на конкретный пакет, текст политики и связанные
      экраны, если они появятся. Публикация отдельна; кнопки/экраны здесь не добавлены
      и не приняты.

## Незавершённые аспекты для будущего пакета

Оператор, контакты, основания, юридические сроки/права; общий клиентский аккаунт
и двойная роль; локальный export/ack и pending, offline устройства; повтор после
Auth delete, FK/trigger cleanup и concurrent mutations; состав/сроки логов,
доказательство 7-дневной ротации. Здесь они зафиксированы без изменения ADR или
OPEN-QUESTIONS (эти файлы исключены границами задачи). До разрешения спорных
аспектов нельзя объявлять deletion или policy publication готовыми.
