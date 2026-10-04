# SOM-36 · Полные клиентские экраны и действия на серверных данных

Linear: https://linear.app/something-great/issue/SOM-36
Ветка: agent/09-som-36-client-production-r2. Заголовок PR с SOM-36.

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

Выполнять после 04-SOM-27 и 05-SOM-34 того же personal, только после их merge.
SOM-35 history, immutable program reads/assignment, scheduling reads/status и
financial reads уже в базе. SOM-32 finish r2 и explicit correction также влиты;
selective program update из SOM-32 не нужен клиентскому read-only сценарию и
остаётся исключён до решения provenance/immutable version policy. Решения
SOM-56/58 закрыты ADR0061: клиент видит только finished journals, результаты
вводит тренер. Это вся SOM-36: server+client+tests, не отдельный read/fence/UI бриф.
Проверить свежую базу и existing connected screens: исправные contracts сохранить.

## Критерии

- [ ] Authenticated клиент видит Home: ближайшее занятие/статус/план, требующие
  ответа предложения, остаток по неистёкшим пакетам и долг по всем пакетам,
  реальный фрагмент прогресса; loading/error/empty/unlinked честные, без demo fallback.
- [ ] History и detail: занятия до регистрации после invitation linkage, actual
  sets/exercises/units, только finished и shared notes. Correction после explicit
  server apply отражается при refresh; draft/privates/чужие tenants не читаются.
- [ ] Progress: посещения за выбранный период, история конкретного упражнения,
  максимальный рабочий вес вместе с повторами по прототипу, без «общей силы».
  Null/zero/exact units, pagination и пустые периоды сохраняются; не invent данные.
- [ ] Реальный клиентский request→proposal→reply, перенос и отмена своей записи
  используют влитые SOM-27 commands/revisions/rights/replay. После validated receipt
  перечитать сервер; lost response/reopen/retry сохраняют canonical request identity.
  Не менять global booking/attendance/payment автоматически из клиентского экрана.
- [ ] Все screen/route/service/hooks закреплены за account/client/workspace/JWT
  session и caller до dispatch и после awaits. Relogin/refresh/unmount/смена
  тренерской карточки скрывают старые data/errors/selections; bounded reads без
  silent truncation, wrong/unknown rows fail closed, credentials вне keys/state/logs.
- [ ] Privacy доказана на API/RLS уровне: client role не получает private notes,
  unfinished journals, чужие карточки/финансы/conflicts. При необходимости новые
  additive read RPC/migration, generated types и pgTAP; existing migrations не менять.
- [ ] Независимые full-flow service/hook/screen tests с real adapters и synthetic
  network/storage seams: invitation→history, home/balance/progress, request/reply/
  reschedule/cancel/revision conflict/exact retry, late success/error/refresh,
  foreign/private/unfinished и precision/pagination. SQL runtime через CI.

## Источники

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE, docs/app/{README,CONVENTIONS,DELIVERY-PLAN,
ROADMAP,PROJECT-MEMORY,OPEN-QUESTIONS,UI-PARITY,DATA-MODEL}.md, ADR0007/0059/0061,
prototype-fresh/index.html и CODEX-PLAN задачи4/5 только читать; relevant SQL contracts,
client-history/progress/scheduling/program и financial reports/tests. Graft map/ask
если доступен, иначе записать отсутствие. Live Linear scope/relations прочитать.

## Границы

client-home/history/progress/scheduling/program read presentation, authenticated
client routes и новые client-specific read services/domain adapters; свои tests,
review, additive client read SQL/types если необходимо. Existing history/program/
scheduling/financial contracts сохранять, менять только найденные полные flow gaps.
Не менять trainer library/editor/onboarding (work), export/collector/correction apply/
workout-entry/sync writers (third), auth provider, template/assignment policy,
financial ledger/command protocols, existing migrations, deps, tooling/workflow,
prototype, deletion/cloud/DNS/SMTP. Shared i18n/docs минимально. Program update,
push/feed и приёмка экранов не входят; не создавать заглушки success.

## Проверка и ограничения контейнера

- [ ] npm run check в app зелёный; при SQL новые pgTAP/privacy/replay/concurrency
  cases по изменённому контракту, generated types и handoff CI.
- [ ] CHANGELOG «Не выпущено», minimal ROADMAP, свой app/review/09-som-36-client-production-r2/README.md
  с точными командами/результатами/ограничениями; ADR нового подхода со свободным номером.
- [ ] App без comments/any/секретов/новых PNG, строки через i18n. Только synthetic data.

Нет Docker/Supabase/browser/native устройств: mocks не доказывают live SQL/RLS/Auth,
SQLite/crash/reopen, два телефона, native/accessibility/parity и одобрение владельца.
Экраны/issue не объявлять принятыми. Не задавать вопросов, не менять Linear,
scripts/rules/main, платные сервисы или реальные данные. PR только agent/* →
fix/som-50-template-picker. Если prerequisites ещё не влиты, не обходить gate.
