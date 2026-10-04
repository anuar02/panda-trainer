# SOM-23 · Завершить полный production-сценарий редактора шаблона

Linear: https://linear.app/something-great/issue/SOM-23
Ветка: agent/04-som-23-editor-production-finish. Заголовок PR с SOM-23.

## Контекст

Выполнять после 02-SOM-22 и 03-SOM-20 того же аккаунта. SOM-23 server save/archive,
read validation, provider pending recovery и session fencing уже в базе (PR52,
ac6d62b). Не переписывать исправный transport ради нового пакета. Это весь
оставшийся пользовательский сценарий SOM-23: создание, редактирование, копирование,
порядок и параметры, scoped восстановление, конфликт, сохранение и возврат
к реально сохранённому шаблону. Server+client+tests сверяются вместе.

Конкретный оставшийся пробел: TemplateEditorScreen.save после await store.save
без проверки mounted/caller/смены draft вызывает toast/onSaved либо setError/focus.
WorkspaceTemplateEditorRoute.reloadServerDraft.catch без проверки актуальности
ставит failed. Layout provider может пережить editor route; его generation guard
не доказывает, что старый screen всё ещё вправе навигировать. initialized/edited/
sheet/error также нужно проверить при смене supplied store/draft/account.
Невлитые personal/third API не нужны; продуктовых решений не требуется.

## Критерии

- [ ] Реальный workspace flow: создать «Низ А», выбрать библиотечные и своё
  упражнение, переставить строки, сохранить плановые подходы/повторы или время,
  точные граммы/rest/заметку; перечитать сохранённый шаблон. Редактирование и
  копирование сохраняют порядок и units/null/zero согласно действующим правилам.
  Архивирование упражнения не уничтожает existing template/program snapshots.
- [ ] Долговечный scoped draft и pendingSave из PR52 используются без потери:
  leave/resume/discard/copy, offline/lost response/reopen/exact-ID retry,
  revision conflict и явная загрузка сервера дают честные состояния. Pending
  uncertainty не заменять новым requestId, чужой draft не публиковать, storage
  failure не показывать как success. Не менять существующую immutable program policy.
- [ ] Screen/route/launcher фиксируют актуальный caller/account/workspace/session,
  draft и попытку до async. После unmount/leave/смены route params или draft/
  logout/same-user relogin старый save/reload/discard не вызывает toast/navigation,
  focus/error и не закрывает новую sheet/lock. Verified refresh того же session
  поддерживается. Credentials не входят в React keys/state/results/logs/storage.
- [ ] Продолжение на новой форме не наследует initialized/edited/error/picker
  от предыдущего scope; double tap и быстрые save→leave→reopen не создают дубль.
  Общий demo редактор сохраняет поведение; production не подменяется demo fallback.
- [ ] Независимые интеграционные service/provider/screen/route tests полного
  create→edit→copy→save→read и archived exercise workflow; deferred success/error
  после leave/unmount, смены draft/route/clientId/account/session, reload error,
  normal refresh, lost response/reopen/retry/conflict/discard. Test показывает
  отсутствие поздних callbacks и возможность следующего сохранения. SQL receipts/
  archive-safe snapshots сверить с existing pgTAP/concurrency; недостающее покрытие
  добавить, не объявлять mocks проверкой базы.

## Границы

features/template-editor/screen.tsx, workspace-library launcher/editor-routes,
app/app/workspace/library/editor.tsx и template/[id].tsx только template editing/
copy/archive callbacks. Узкие совместимые provider/editor-store lifecycle additions
и необходимое исправление template service только при доказанном defect;
свои tests/review/minimal docs/i18n. Работа последовательна после library/onboarding
того же work. Program assignment callers/transport не менять. SQL только новые
template-specific tests/additive fix при доказанном defect; existing migrations
не редактировать. Не менять auth provider/login, clients/onboarding, invitations/
scheduling/financial/client controls (personal), journal/corrections/sync/export
(third), программы/assignment/client-history, deps/prototype/cloud/PNG.
Native picker геометрию SOM-50 и приёмку не включать. Один агент без субагентов.

## Источники и проверка

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md;
docs/app/{README,CONVENTIONS,DELIVERY-PLAN,ROADMAP,OPEN-QUESTIONS,PROJECT-MEMORY,
UI-PARITY}.md; ADR0007/0028/0029/0078/0085/0066, prototype-fresh/index.html и
review/parity/spec-*.json только читать; app/review/template-builder/README.md,
app/review/som-23-template-save-session-fencing/README.md. Сначала graft map/ask;
если недоступен, записать это. Свежая fix/som-50-template-picker обязательна.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», minimal ROADMAP,
  app/review/04-som-23-editor-production-finish/README.md с точными командами,
  результатами, критериями и ограничениями; ADR при новом подходе со свободным
  номером. App без комментариев/any, строки через i18n, без секретов/новых PNG.

Нет Docker/Supabase/браузера/native устройств: SQL/pgTAP/concurrency исполняет CI;
реальный auth/storage/crash/reopen, native/parity/accessibility и одобрение владельца
не доказаны synthetic tests. При local DB gate оставить needs-local-db для Claude.
Не задавать вопросов, не менять Linear/scripts/rules/main, не использовать реальные
данные/платные сервисы. PR только agent/* → fix/som-50-template-picker.
Экраны и issue не объявлять принятыми.
