# SOM-41 · Документы приватности и карта жизненного цикла данных

Linear: https://linear.app/something-great/issue/SOM-41/realizovat-eksport-udalenie-akkaunta-i-dokumenty-privatnosti

## Контекст

База fix/som-50-template-picker, решения SOM-51/59 влиты commit 4758705,
ADR 0064. SOM-52 открыт, реальные данные ждут подтверждения специалиста.
Work независимо реализует backend export, third выполняет SOM-30. Подготовь
документы на основе текущей схемы и решений; не придумывай юридическое лицо,
контакты, правовое основание или гарантии. Документы — review drafts, до проверки
специалиста и владельца. Эта часть не завершает весь SOM-41.

## Критерии

- [ ] docs/app/privacy/PRIVACY-POLICY-DRAFT.md: понятный русский проект политики,
  категории данных/цели по фактической схеме, роли тренера/клиента, приватные
  заметки и завершённые журналы ADR 0061, Supabase EU Central/Франкфурт.
  Не заявлять юридическое соответствие без специалиста. Неизвестные оператор,
  контакты/правовое основание явно обозначить как блокеры публикации.
- [ ] docs/app/privacy/DATA-LIFECYCLE.md: таблица данных/владельцев, серверных
  и локальных хранилищ/кэшей, доступов, export/delete coverage и отношений;
  source paths к схеме/RLS. Учесть отдельные trainer cards общего client account.
  Хранение до удаления аккаунта тренера; уход из бэкапов до 7 дней — требование
  ADR 0064, не доказанная настройка бесплатного тарифа.
- [ ] docs/app/privacy/ACCOUNT-DELETION-HANDOFF.md: review checklist будущего
  удаления: server auth, scoped cascade, shared client accounts/другие trainers,
  локальные pending/logout/retry/idempotency/бэкапы, отсутствие секретов в export.
  Не выбирать destructive purge вопреки ADR 0062 и не задавать новые продуктовые
  правила; спорные аспекты обозначить как незавершённые для будущего пакета.
- [ ] Различать реализованное, требования и непроверенное; не обещать готовые
  export/delete, мониторинг/push, фактическое удаление или юридическую приёмку.
  Политику не публиковать, продуктовые кнопки/экраны не добавлять.
- [ ] Проверить markdown ссылки/пути и согласованность с ADR 0064/схемой.
  cd app && npm run check зелёный по общим правилам. CHANGELOG и минимальный
  ROADMAP checkpoint без закрытия SOM-41; текстовый отчёт
  app/review/som-41-privacy-documents/README.md: команды, результаты, ограничения.

## Источники

AGENTS.md, docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,
OPEN-QUESTIONS,ARCHITECTURE,DATA-MODEL,UI-PARITY}.md, ADR 0007/0061/0062/0064/0066,
supabase/README.md, действующие migrations/tests. Проверяй реальные пути.

## Границы

Только новые docs/app/privacy/ документы; минимальные ссылки docs/app/README.md,
CHANGELOG.md/ROADMAP.md; app/review/som-41-privacy-documents/README.md.
Не менять app код/типы/tests/routes, SQL/migrations/config, auth/storage/outbox/
preload/billing/invitations/prototype, существующие ADR/OPEN-QUESTIONS,
export документы work и scripts/rules очереди. Новые PNG запрещены.
Ветка agent/som-41-privacy-documents; draft PR только в fix/som-50-template-picker,
заголовок с SOM-41. Linear не менять. Вопросов не задавать.

## Чего нельзя проверить в контейнере

Нет Docker, Supabase, браузера, iOS/Android устройств. SQL runtime, native/visual,
юридическое подтверждение не объявлять проверенными. Только вымышленные данные,
никаких платных сервисов, реальных данных, публикации и сообщений людям.
Не объявлять экраны принятыми.
