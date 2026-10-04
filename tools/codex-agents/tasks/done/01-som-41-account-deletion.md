# SOM-41 · Полный сценарий удаления аккаунта с сохранением чужой истории

Linear: https://linear.app/something-great/issue/SOM-41
Ветка: agent/01-som-41-account-deletion. Base: fix/som-50-template-picker.

## Контекст

SOM-41 была больше дня и разделена на два крупных пользовательских пакета:
полный экспорт уже влит (#61), здесь вся оставшаяся реализация удаления:
server/SQL/Auth orchestration + client/settings + recovery + tests/privacy handoff.
Не ставить отдельный preflight-only или report-only PR. Владелец 04.10 принял
ADR 0101: удаление клиентского аккаунта отвязывает карточки у каждого тренера,
сохраняет их «без приложения» с занятиями/журналами/оплатами. Двойная роль удаляет
свой trainer workspace и отвязывает карточки у других. Продуктовый gate снят;
юридическая проверка/облачная эксплуатация до реальных данных остаются внешними.
Зависимости export, auth, notifications/push влиты, fresh base не старше #71.

## Критерии

- [ ] Settings→объяснение последствий→проверка локальных данных/export→явное
  подтверждение→серверная команда→достоверный результат/recovery. Обе роли и dual
  role определяются сервером, не переключателем UI. Отмена ничего не удаляет.
  Existing preflight pure evaluator не является delete authorization; не превращать
  unknown или review-required в разрешение. Не выдумывать юридическое одобрение.
- [ ] Проверенная сервером личность/JWT; privileged Auth API только на сервере.
  Собственный workspace удаляется по фактическим FK/triggers/immutable ledgers,
  включая архивы, snapshots, bookings/proposals, notes, journals/conflicts/correction,
  финансовые данные, invitations и private receipts из DATA-LIFECYCLE. Общий
  клиентский Auth/profile других людей не удаляется при удалении workspace тренера.
- [ ] Удаление клиентского аккаунта удаляет Auth/profile/push devices/user links;
  карточки у всех других тренеров отвязаны, их программы/занятия/история/оплаты
  сохранены по ADR 0101. Проверить user/author/accepted_by FK и invitations:
  бывший пользователь/старый bearer не получает повторный доступ. Dual role
  совмещает оба действия, данные других workspace не повреждены.
- [ ] DB/Auth не объявляются атомарными: durable state machine/receipt и безопасное
  восстановление partial failure, timeout/lost response и retry после Auth deletion.
  Request identity не подменяется после unknown. Status lookup/recovery не выдаёт
  чужие данные, tokens/service secrets не появляются в app/логе/export.
  Новые/concurrent команды и второе устройство не восстанавливают удалённое;
  доказать interlock через existing transactional locks/FK или минимальную новую
  deletion-specific защиту. Перечислить покрытые writers, не полагаться на UI guard.
- [ ] Инвентаризация всех local scoped pending/rejected/conflicts/correction drafts,
  inflight и покрытие server/local export; неполное чтение не означает ноль.
  Не терять неподтверждённые записи: при outstanding/unknown deletion блокируется,
  доступен export/recovery; acknowledgement связано с конкретными bytes/scope/
  snapshot и фактическим file outcome, новая запись обесценивает proof.
  Не вводить blanket storage clear, destructive outbox purge или auto-drop конфликтов.
  Existing runner/session shutdown и late-response fences сохранить; завершённое
  удаление отзывает сессию и own sensitive account cache по проверенному scoped API.
  Offline/lost device и OS backup cleanup не объявлять доказанными.
- [ ] Независимые server/controller/UI/storage tests, pgTAP и concurrency:
  client у A/B, trainer-as-client B, own/foreign/anon/expired, archived/full FK
  inventory, preservation marker у B, replay/partial DB-Auth failure, mutations
  during deletion, storage/export cancellation/error, relogin/refresh/dismiss.
  Types отражают реальные SQL objects. Новые Auth/deletion concurrency cases
  интегрировать в existing auth_email_smoke.py, уже запускаемый CI, без deployment
  function в пилоте. CI выполняет существующий явный список, новые standalone
  harnesses автоматически не обнаруживает; runtime coverage фиксировать честно.
- [ ] Privacy draft/DATA-LIFECYCLE/handoff согласованы с ADR0101 и реально
  реализованным охватом. Контакты/правовые основания/7-day backup/log rotation,
  облачное применение/юрист/native остаются явно непроверенными. Никакой публикации
  политики, deploy/secrets/реального удаления аккаунтов в пилоте в этом задании.

## Субагенты

Применить tools/codex-agents/SUBAGENTS.md: до трёх чистых контекстов. SQL/ownership,
server Auth/recovery, независимые tests/review — исключительное владение файлами.
Lead владеет client integration, shared types/i18n/docs, интеграцией, npm run check,
коммитами и сверяет каждый результат. Тяжёлые проверки запускает только lead.

## Источники

AGENTS.md, app/AGENTS.md, docs/app/{README,CONVENTIONS,ROADMAP,DELIVERY-PLAN,
PROJECT-MEMORY,OPEN-QUESTIONS,UI-PARITY}.md; ADR0062/0064/0073/0101;
docs/app/privacy/{ACCOUNT-DELETION-HANDOFF,DELETION-PREFLIGHT-CONTRACT,
DATA-LIFECYCLE,PRIVACY-POLICY-DRAFT,LOCAL-EXPORT-CONTRACT}.md;
app/src/domain/account-deletion, features/account-export и app/review/02-som-41-complete-export.
Сначала graft если доступен. Старые handoff gates shared/dual role заменены
ADR0101; технические и внешние доказательства остаются необходимыми, не fake approval.

## Границы

Account-deletion domain/features/settings route, новая серверная deletion function,
additive SQL/migration и свои pgTAP/concurrency tests, database.types.ts;
deletion-specific integration Auth/session shutdown и scoped inventory/export seams;
privacy docs/review. Existing writers править лишь минимально для доказанного
deletion interlock, без смены business semantics. Не менять workout-entry/finish/
correction/program-update, workspace-programs или client-program (work SOM-32).
Не менять зависимости, workflows, existing migrations, prototype, agent scripts/rules.
SQL cleanup существующих таблиц допускается в новой deletion migration; не менять
их program-update schema/API. Shared files минимально, fresh base перед финалом.
Если discovered interlock требует вмешательства в scope work, использовать общую
DB lock/FK границу и записать integration constraint, не редактировать чужие файлы.

## Проверка и завершение

- [ ] cd app && npm run check; полный ready-to-merge PR с SOM-41, CHANGELOG/ROADMAP,
  app/review/01-som-41-account-deletion/README.md с точными командами/ограничениями.
  Технические решения — новый свободный ADR; миграции строго позже последней base.
- [ ] Нет app comments/any/PNG/секретов/реальных данных/paid services. Только
  agent/* → fix/som-50-template-picker; Linear/main не менять, вопросов не задавать.

В контейнере без Docker SQL исполняет CI, Auth server adapter тестируется synthetic
transport; mocks не доказывают live Auth revoke, native SQLite/logout/offline,
два устройства, backup/log rotation, юридический review и UI acceptance. Реальная
эксплуатация только после внешних gates; не делать deployment ради проверки.
Existing migrations не менять; needs-local-db передать Claude. Экраны принимает владелец.
