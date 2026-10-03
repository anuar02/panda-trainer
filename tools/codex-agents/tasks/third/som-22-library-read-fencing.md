# SOM-22 · Полное validated чтение библиотеки и шаблонов

Linear: https://linear.app/something-great/issue/SOM-22

## Контекст

SOM-18/19/22/23/24 и production library/editor влиты. Этот бриф выполняется
после текущего som-31-workout-entry-r2 и не зависит от его ещё не влитой ветки.
Не повторять редактор/SQL. В workspace-library/service.ts loadWorkspaceExercises
и loadWorkspaceTemplates читают неограниченные offset pages через mutable auth;
exercise rows фильтруются по workspace вместо fail closed, адаптер подменяет
неизвестную measure на reps. Provider refresh/initial/reload используют mounted
flag без session identity. Исправить read path с сохранением editing/pending saves.

## Критерии

- [ ] Один logical read закрепляет expected actor/workspace и session identity,
  проверяет trainer ownership, auth до/после всех pages/batches/final result.
  Logout/new login/switch fail closed, verified refresh согласно auth контракту.
  Не раскрывать credentials в snapshot/errors/keys. Standalone reads и combined
  loadWorkspaceLibrary сохраняют совместимый безопасный seam.
- [ ] Runtime validation unknown exercise/template/line rows: UUID/workspace,
  IDs/relations/revisions/enums/nullable fields/unit values, instructions/aliases,
  exact planned grams/reps/seconds/null/zero. Foreign/malformed/duplicate/неполные
  обязательные связи отклонять целиком, не молча фильтровать или подменять.
- [ ] Bounded deterministic pagination exercise RPC, templates, lines и batches
  child exercises. Explicit limit error без успешного truncation; stable ordering
  по уже доступному контракту RPC/таблиц. Search normalisation и archive-safe
  existing template exercise refs сохранить, включая archived exercise rows.
- [ ] Provider initial/refresh/reloadServerDraft применяет только результат своей
  scope/session/request generation. Retry/unmount/late success/error не публикуют
  старый catalog или стирают новый draft. Изменение auth hides старые server данные;
  durable pendingSave/draft не purged, mutation retries/request IDs сохраняются.
  Не делать общий refactor auth/storage/mutations. UI и existing create→assign
  flow сохраняются через текущий typed seam.
- [ ] Meaningful tests >500 exercises/templates/lines, duplicate/limits, malformed
  measure/units/foreign child links, archived referenced exercises, exact null/zero,
  session switch между pages и combined reads, verified refresh, provider late
  refresh/reload/retry/unmount и сохранение pending draft. Existing editor/save/
  archive/create→assign regression tests остаются зелёными.

## Границы

workspace-library/service.ts только read funcs + локальные read helpers,
новый module-local read-validation/session/controller при необходимости,
workspace-library/provider.tsx только read lifecycle, adapter.ts только безопасный
read adapter без изменения формы mutation input, свои tests/review/docs.
Mutation funcs service.ts, draft encoding/storage policy, workspace-programs,
template-editor domain/UI/storage-gate, auth provider, invitations (personal),
workspace-clients (work), financial/schedule/journal/client modules, SQL/types/deps
не менять. Не читать незавершённые agent branches как dependency.
Общие CHANGELOG/ROADMAP/i18n минимально.

## Разделение работы

Third ведёт до трёх субагентов по tools/codex-agents/SUBAGENTS.md. Если файла
нет в базовой ветке, применить: свежие узкие контексты и исключительное владение.
Сначала зафиксировать API contract: service validation/paging — одному;
provider lifecycle — второму; independent behavioral tests — третьему.
Shared adapter/types/docs и интеграция — ведущему; полный check только ведущий.

SOM-18/19 prerequisites и library/server RPC уже влиты. Решения SOM-55/60 закрыты;
продуктовые правила не выбирать заново. Ветка agent/som-22-library-read-fencing
проверена ls-remote, отсутствует. Источники кода: workspace-library/service.ts,
provider.tsx, adapter.ts; tests/workspace-library.test.ts, workspace-library-provider.test.tsx,
workspace-program-assignment.test.tsx; SQL search_exercises только читать.

## Источники и общие требования

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR 0007/0034/0061/0066, существующие app/review и tests соответствующего модуля.
Сначала graft map/ask, если недоступен — записать и читать точные пути.
Свежую базу и уже выполненное проверить перед реализацией. Все зависимости ниже
уже влиты; открытые статусы не означают отсутствие кода. Прототип не менять.

- [ ] cd app && npm run check зелёный; meaningful tests, CHANGELOG («Не выпущено»),
  минимальный checkpoint ROADMAP, свой app/review/<имя-брифа>/README.md с командами,
  результатами и непроверенным; ADR при новом подходе с незанятым номером.
- [ ] App без комментариев/any, строки через i18n, без секретов и новых PNG.

Нет Docker/Supabase/браузера/iOS/Android: SQL/RLS/live API/real auth/native/parity
и owner acceptance не объявлять проверенными. Только synthetic fixtures,
без реальных данных клиентов и платных сервисов. Не задавать вопросов,
не менять Linear, scripts/rules/main. Draft PR в agent/<имя-брифа> только
в fix/som-50-template-picker, заголовок с SOM-номером. Экраны принимает владелец.
