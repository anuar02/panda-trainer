# SOM-41 · Проверяемый preflight-контракт будущего удаления

Linear: https://linear.app/something-great/issue/SOM-41/realizovat-eksport-udalenie-akkaunta-i-dokumenty-privatnosti

## Контекст

Privacy drafts b240675 (#27), export 08f0251 (#29), ADR0064 уже в базе;
SOM-51/59 закрыты. Этот самостоятельный пакет выполняет безопасную техническую
часть handoff: типизированное выявление препятствий, без удаления данных.
docs/app/privacy/ACCOUNT-DELETION-HANDOFF.md фиксирует нерешённые shared client/
dual role, pending export/ack и Auth/DB recovery. Не выбирать ответы за владельца.
Third работает journal, work export UI; не менять их реализацию.

## Критерии

- [ ] Чистый typed domain/account-deletion preflight: явные состояния unknown/blocked/
  review-required, scope/account/workspace/session mismatch, inflight/unknown receipt,
  pending/rejected/conflict/correction draft, отсутствие local export/ack proof.
  Unknown не трактовать как zero/ready; server export не подтверждает local pending.
- [ ] Shared client account и trainer-as-client всегда review-required; backup/log/
  other-device/native/legal evidence различаются и остаются внешними gates.
  Результат не авторизует delete и не подтверждает личность пользователя сервером.
- [ ] Fail-closed validation входного evidence, bounded structured blocker codes,
  без credentials/private notes/полных export payload. Никаких скрытых default approvals.
- [ ] Meaningful tests pure evaluator: matrix blockers, malformed evidence, foreign
  scope, stale session, timeout/unknown receipt, zero versus unknown, pending/conflict,
  shared/dual role и отсутствие proof; не зеркальные implementation tests.
- [ ] Отдельный технический handoff: реальные FK/trigger/self-link/RESTRICT препятствия
  по текущим migrations, порядок будущих стадий и незавершённые product/legal вопросы.
  Привязать к файлам схемы и coverage DATA-LIFECYCLE, не обещать DB/Auth atomicity.
  Не ставить выполненными пункты runtime удаления/семидневной ротации.

## Границы

Только новый app/src/domain/account-deletion/ и его отдельные tests;
новый docs/app/privacy/DELETION-PREFLIGHT-CONTRACT.md и минимальные ссылки из
ACCOUNT-DELETION-HANDOFF.md. Общие CHANGELOG/ROADMAP и новый ADR минимально.
Не менять SQL/migrations/database.types.ts, domain/account-export, features/*,
auth/storage/outbox/runner, UI/routes, policy draft и DATA-LIFECYCLE.
Не создавать endpoint/delete RPC, не выполнять удаление/purge, не интегрировать
preflight в приложение, не подключать локальные хранилища напрямую.
Это не реализованное удаление и не completion SOM-41; runtime integration — будущий пакет.

## Общие требования и источники

Прочитай AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md,
docs/app/{README,PROJECT-MEMORY,ROADMAP,CONVENTIONS,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY,ARCHITECTURE,DATA-MODEL}.md,
ADR 0007/0061/0062/0064/0066 и относящиеся к задаче отчёты.
Используй graft, если доступен; проверяй реальные пути в репозитории.
База fix/som-50-template-picker, текущий commit 9d1802a. PR #34 claude/ci-green
параллельно исправляет SQL apply_operations и Expo patch drift: не дублируй его,
не меняй старые migrations (24 уже применены в пилоте), версии Expo и package-lock
ради CI. Новые SQL изменения — только новой миграцией с уникальным timestamp.
Не применяй миграции в облако.

- [ ] cd app && npm run check зелёный; meaningful tests по изменённым контрактам.
- [ ] CHANGELOG («Не выпущено»), минимальный checkpoint ROADMAP и отчёт
  app/review/som-41-deletion-contract/README.md с точными командами, результатами и ограничениями.
  При новом подходе ADR с незанятым номером и descriptive filename.

Общие CHANGELOG/ROADMAP/i18n меняй минимально. App код без комментариев/any;
строки через i18n. Linear не менять, вопросов не задавать. Draft PR только
в fix/som-50-template-picker, ветка agent/som-41-deletion-contract, заголовок с SOM-номером.
main, prototype, scripts/rules очереди, платные сервисы, реальные данные исключены.

## Чего нельзя проверить в контейнере

Нет Docker, Supabase, браузера и устройств iOS/Android. SQL/pgTAP runtime,
generated drift, реальный SQLite/reopen/crash, native/visual/accessibility,
облачные процессы и приёмку владельца не объявлять проверенными. Подготовь
воспроизводимые команды и вымышленные fixtures. Новых PNG не коммитить.
Экраны, SOM-задачу целиком и пилот принятыми не объявлять.
