# SOM-37 · Серверные события, лента обеих ролей и Realtime

Linear: https://linear.app/something-great/issue/SOM-37
Ветка: agent/07-som-37-notification-feed. Заголовок PR с SOM-37.

## Контекст

После 06-SOM-36 того же personal и влитого 04-SOM-27: оба prerequisites должны
быть в fix/som-50-template-picker до реализации. Это вся SOM-37 server+client+tests.
В свежей базе проверить отсутствие equivalent notifications implementation.
Старый Linear criterion «push после пилота» заменён решением владельца ADR0065:
push входит в v1 отдельной SOM-73 поверх этой ленты. Здесь полноценная in-app
лента/счётчики/events/Realtime, без push transport/tokens/scheduler.

## Критерии

- [ ] Новая additive migration создаёт notifications с tenant/user ownership,
  стабильной event identity, allowed kinds/read state и безопасными payloads;
  RLS/grants/search_path, client/trainer права, никаких private notes/чужих данных.
- [ ] Перенос/отмена/подтверждение/новые finished результаты порождают нужным
  адресатам ровно одно notification на реальное событие. RPC replay и concurrent
  retry не дублируют событие; transaction rollback не оставляет ложное уведомление.
  Correction отражается только по допустимому finished-visible contract, draft
  и результаты in_progress клиенту не раскрывать. Не менять booking/financial policy.
- [ ] Обе роли: реальная лента и точный unread count, empty/loading/error/retry,
  явное read/mark action и переход к своему объекту по каноническому прототипу.
  Счётчик соответствует server read state; bounded pagination без silent truncation,
  порядок стабилен, deleted/unavailable target честно обработан. Demo отдельно.
- [ ] Supabase Realtime обновляет ленту/счётчик в own scope; reconnect/focus делает
  server reconciliation. Duplicate/out-of-order events не дублируют rows и не
  откатывают read state. Logout/relogin/workspace/caller/unmount отписывают старый
  channel и запрещают late publication; JWT identity/verified refresh и errors fenced.
- [ ] pgTAP owner/client/foreign/anon/private/unfinished, event atomicity/idempotency
  и read mutation rights; настоящий concurrency case при изменении конкурентного
  contract. App independent service/controller/hook/screens/Realtime regressions,
  including replay/reconnect/order/read races/scope switch/late errors.
- [ ] Generated database types соответствуют migration; documented event schema
  пригодна SOM-73 без secret payloads. Push не выдумывать и не подключать здесь.

## Источники

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/{README,CONVENTIONS,DELIVERY-PLAN,
ROADMAP,PROJECT-MEMORY,OPEN-QUESTIONS,UI-PARITY,DATA-MODEL}.md, ADR0007/0061/0065,
prototype-fresh default notification screens/text/actions, existing scheduling/
finished-workout contracts и app realtime/auth examples. Graft map/ask если есть,
иначе recorded fallback. Live Linear37/73 criteria и relations прочитать.

## Границы

notifications domain/features, notification routes/счётчики/точки входа обеих ролей,
новая additive migration с narrow event triggers/read RPC, свои SQL/app tests,
generated types/review/ADR. Existing scheduling/workout/financial commands и
writers только читать; новые triggers сохраняют их semantics/replay/locks.
Не менять library/editor/onboarding (work), export/correction/finish/sync writers
(third), auth provider, existing migrations, dependencies/tooling/workflow,
prototype, financial ledger, push/EAS/cloud/deletion/real data. Минимальные
shared docs/i18n; не объявлять экран/этап/issue принятым.

## Проверка и ограничения контейнера

- [ ] cd app && npm run check зелёный; SQL lint/pgTAP/concurrency/types через CI,
  новый harness явно указать в handoff, если штатный CI его не запускает.
- [ ] CHANGELOG, minimal ROADMAP, app/review/07-som-37-notification-feed/README.md
  с точными evidence/limitations; новый ADR со свободным номером при подходе.
- [ ] Без comments/any/secret/новых PNG; i18n, только synthetic fixtures.

Docker/Supabase/browser/native здесь отсутствуют: real Realtime/RLS/Auth,
reconnect на двух телефонах, native/accessibility/parity требуют runtime/owner.
Mocks не runtime proof. Не задавать вопросов, не менять Linear/scripts/rules/main,
не использовать платные сервисы/реальные данные. PR agent/* только в
fix/som-50-template-picker; при needs-local-db оставить gate Claude.
