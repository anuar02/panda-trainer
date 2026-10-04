# SOM-73 · Push v1: устройства, серверная доставка и плановые уведомления

Linear: https://linear.app/something-great/issue/SOM-73
Ветка: agent/11-som-73-push-v1-r2. Заголовок PR с SOM-73.

## Контекст

Повторная публикация r2, 04.10.2026. Исходный запуск имеет OK в summary, но
его PR/remote ветка отсутствуют, а implementation не влита. Это не доказательство
завершения. Исходный бриф сохранён для аудита; выполнить всю задачу и опубликовать
проверяемый PR этой новой ветки. Не завершать запуск одним сообщением о gate: при
невлитом предыдущем PR дождаться его merge, проверить свежую базу и продолжить.
Если публикация невозможна, оставить конкретную причину и состояние в отчёте.
SOM-34 PR64 уже MERGED в base (b4101a4), SOM-27 PR62 и SOM-35 также в базе.
Не повторять завершённый финансовый код; его live/payment concurrency проверка
остаётся внешним ограничением, не поводом объявлять результаты принятыми.

Выполнять после 09-SOM-36-r2 и 10-SOM-37-r2 того же personal. Начинать только когда
их PR влиты в fix/som-50-template-picker. Это вся техническая SOM-73:
server + native client + tests; не отдельные token/contract/scheduler/UI брифы.
ADR0065 принят владельцем: Expo Push бесплатно, push входит в v1 поверх ленты.
Зависимость SOM-37 разрешена порядком очереди того же аккаунта; её event schema
читать из свежей базы, не проектировать параллельно и не делать duplicate feed.

Отсутствие EAS credentials и физических телефонов блокирует live проверку и
развёртывание, а не реализацию и synthetic/CI проверки полного пакета. Не получать
секреты, не создавать облачные ресурсы и не делать реальную рассылку. Итог не
объявлять принятым. Проверить отсутствие equivalent реализации перед началом.

## Критерии

- [ ] Expo push tokens по устройствам: additive schema, RLS/grants, own-user
  register/rotate/unregister, logout отвязывает текущее устройство; account switch,
  same-user relogin, denied permission и invalid token не сохраняют чужую привязку.
  Секреты и токены не попадают в logs/React keys/reports. Новый SDK dependency
  только через npx expo install с совместимостью установленного Expo и ADR.
- [ ] Разрешение через системный native prompt, без нового самодельного экрана:
  denial/disabled не вызывает повторный запрос и не мешает in-app feed. Cold/warm
  notification open ведёт к своему доступному объекту после auth; неизвестный/
  удалённый/чужой объект даёт честное состояние. Web/demo не притворяются push-ready.
- [ ] Серверный sender потребляет реальные события SOM-37: клиенту подтверждение/
  перенос/отмена; тренеру клиентские запросы/перенос/отмена. Каждый push связан с
  записью ленты, payload не раскрывает private notes/результаты черновика/чужие данные.
  Надёжные bounded claims, leases/retry/backoff, tickets/receipts и invalid-device
  cleanup; event replay/concurrent workers не создают повторные логические delivery.
  Unknown response Expo нельзя объявлять exactly-once внешней доставкой: явно
  задокументировать гарантию и recovery, не скрывать двусмысленный исход.
- [ ] Плановые виды: клиенту за 2 часа до занятия и тренеру утренняя сводка по
  timezone workspace. Перенос/отмена/изменение адресата переоценивают due jobs;
  повторный scheduler не дублирует ленту/delivery. Asia/Almaty, граница суток,
  timezone/DST где применимо, поздний запуск и пустой день проверены. Если точное
  время сводки отсутствует в источниках, не выдавать его за решение владельца:
  сделать явно конфигурируемый параметр серверного запуска, записать этот предел
  в OPEN-QUESTIONS/отчёт; не включать новый пользовательский экран настройки.
- [ ] Независимые service/controller/native hook tests с fake Expo/network/clock:
  registration/rotation/logout/relogin/late responses, denied permission, receipt
  errors, retry/concurrency/scheduling/idempotency/authorized routing. pgTAP:
  own/foreign/anon token rights, event/delivery isolation, atomic claims and replay;
  concurrency test при изменении конкурентного контракта. Generated types точны.
- [ ] Код sender/scheduler, локальные команды и deployment handoff проверяемы без
  cloud credentials; live EAS/APNs/FCM/Expo и установленный iOS/Android отмечены
  непроверенными. Не размещать заглушки success или необоснованный local DB gate.
- [ ] ROADMAP этапов8/11 и технические docs обновлены по ADR0065 (push v1);
  не менять Linear descriptions/milestones. CHANGELOG, новый ADR подхода,
  app/review/11-som-73-push-v1-r2/README.md с точными evidence/limitations.

## Источники

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/{README,CONVENTIONS,DELIVERY-PLAN,
ROADMAP,PROJECT-MEMORY,OPEN-QUESTIONS,UI-PARITY,DATA-MODEL}.md; ADR0007/0061/0064/
0065/0067; свежие влитые SOM-36/37 код, SQL и отчёты; prototype-fresh default
notifications/settings только читать. Сначала graft map/ask; при отсутствии
записать fallback. Live Linear SOM-73 criteria/relations и официальные Expo/
Supabase API установленной версии проверить. Исправные feed/booking policy сохранить.

## Границы

Push device lifecycle/native adapters, server delivery/scheduler, свои additive
migrations/RPC/tests/types, узкая интеграция существующей notifications feed и
logout/authorized navigation (не переписывать auth provider). Нужные Expo config/
package-lock изменения только для push SDK; secrets только placeholder env names.
Existing booking/workout/financial writers, feed policy и private visibility не
менять. Не менять work library/editor/onboarding, third journal/export/correction,
existing migrations, agent scripts/rules/workflows, prototype, deletion, DNS/SMTP,
cloud resources, реальные данные/платные сервисы. Shared docs/i18n минимально.
Один агент; не делить на микробрифы. Экраны/этап/issue не объявлять принятыми.

## Проверка и ограничения контейнера

- [ ] cd app && npm run check; SQL lint/pgTAP/concurrency/type drift через CI,
  новый harness явно указать если штатный CI не запускает. Полный app check
  один ведущий; внешнюю отправку заменить deterministic test transport.
- [ ] git diff --check; app без comments/any, строки через i18n, без секретов/PNG.

Docker/Supabase/browser/native/EAS credentials могут отсутствовать: не заявлять
live RLS/Auth/Expo/установленные сборки/parity/accessibility/owner acceptance.
Продуктовые неизвестные фиксировать в документации без вопросов и без рассылки.
Не менять Linear/main, PR только agent/* → fix/som-50-template-picker. При
невлитых prerequisites не обходить gate; needs-local-db PR оставить Claude.
