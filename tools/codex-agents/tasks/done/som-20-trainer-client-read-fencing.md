# SOM-20 · Полное и безопасное чтение клиентских карточек тренера

Linear: https://linear.app/something-great/issue/SOM-20

## Контекст

SOM-19/20/21 и базовые программы/расписание влиты. Сейчас workspace-clients/service.ts
читает client_records/programs/bookings без pagination и runtime validation,
последующие связанные запросы используют mutable auth. Большая карточка/список
может молча потерять строки, а поздний ответ — вернуть snapshot другой сессии.
Этот пакет исправляет read transport и потребление списка/карточки.

## Критерии

- [ ] Явно валидировать actor/workspace/client UUID и доступный trainer scope;
  фиксировать auth одного logical read. Logout, смена user и новая сессия того же
  user отменяют результат; refresh token отличается от новой сессии по текущему контракту.
- [ ] Bounded deterministic pagination всех потенциально многорядных reads:
  clients, программы, bookings и program exercises; лимит — ошибка, не успех с обрезанием.
  Сохранить выбор последней программы, ближайшего занятия и order карточки.
- [ ] Unknown runtime rows строго проверяются: UUID/scope/relations, revisions,
  enums, UTC/интервалы, units/null/zero; foreign/malformed/duplicates fail closed.
  Select только необходимые безопасные поля. Архив и not-found сохраняются.
- [ ] List/details route stale retry/unmount/scope/session не показывает старые данные.
  Сохранить текущие add/invite/program/purchase UI и callbacks.
- [ ] Meaningful tests >500 rows, duplicate/limit, malformed/foreign relation,
  session switch между reads/pages, late success/error/retry и not-found.

## Границы

Только features/workspace-clients read service, новый локальный read controller/hook,
app/workspace/clients.tsx и app/workspace/client/[id].tsx исключительно read lifecycle,
свои tests/отчёт. Сохранить совместимость loadWorkspaceClients с существующим
workspace-create-session-screen (его не менять); если нужна новая scoped entrypoint,
оставить совместимый безопасный wrapper. Не менять createWorkspaceClient,
assignment/invitation/billing/payment commands, trainer-billing/trainer-payments,
workspace-library, client-history, workspace-scheduling, auth provider, SQL/types/dependencies.

## Источники

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/README.md, CONVENTIONS.md, PROJECT-MEMORY.md, раздел «Где остановились»
ROADMAP.md, DELIVERY-PLAN.md, OPEN-QUESTIONS.md, UI-PARITY.md, ADR 0007/0061/0066.
Сначала graft map/ask; если graft недоступен — записать ограничение и читать
точные файлы. Проверить свежую базу и уже выполненные части. Session-fencing
account-export и auth только читать, не создавать общий auth refactor.


Конкретные исходники: app/src/features/workspace-clients/service.ts (list/details),
app/app/workspace/clients.tsx и app/app/workspace/client/[id].tsx; существующий
caller app/src/features/workspace-scheduling/workspace-create-session-screen.tsx
только читать. Регрессии app/tests/workspace-client-details-service.test.ts и
app/tests/workspace-client-purchases-route.test.tsx. Не менять создание занятия.

## Проверка и отчёт

- [ ] cd app && npm run check зелёный; CHANGELOG.md «Не выпущено», минимальный
  checkpoint ROADMAP; app/review/som-20-trainer-client-read-fencing/README.md с точными проверками и пробелами.
- [ ] Новый подход документирован ADR; app без комментариев/any, секретов, новых PNG.

Нет Docker/Supabase/браузера/устройств: SQL/RLS/live auth/native/визуальный паритет
и приёмку не объявлять проверенными. Только synthetic fixtures; реальные данные
клиентов и платные сервисы запрещены. Не задавать вопросов, не менять Linear,
правила/скрипты/main. Draft PR agent/som-20-trainer-client-read-fencing только в fix/som-50-template-picker,
заголовок SOM-20. Экраны и весь issue принимает владелец.
