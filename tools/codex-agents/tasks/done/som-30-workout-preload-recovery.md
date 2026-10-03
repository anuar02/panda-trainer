# SOM-30 · Предзагрузка тренировки и восстановление production журнала

Linear: https://linear.app/something-great/issue/SOM-30/predzagruzhat-trenirovku-i-vosstanavlivat-zhurnal

## Контекст

База — `fix/som-50-template-picker`, SOM-29-r2 влита PR #26, commit `19c62af`.
SOM-28 schema/RLS, SOM-25 scheduling и личные программы SOM-24 уже в базе.
Не переписывай outbox: используй domain/workout-sync, features/workout-sync,
ADR 0062 и app/review/som-29-sqlite-outbox-r2/README.md. SQL/runtime и real SQLite
ещё не проверены; вливание не является приёмкой владельца.
SOM-53/56/58 закрыты владельцем: ADR 0061. Результаты вводит тренер, клиент
видит только завершённое, конфликт хранит обе версии, поздняя правка — черновик.
SOM-30 создаёт production preloaded context и lifecycle/dock; полное подключение
ввода подходов, conflict UI и завершение относятся к SOM-31/32, не выдавай демо
AsyncStorage за production. Сохрани SOM-39 calm/large-text/motion и billing.

## Критерии

- [ ] Перед занятием загрузить участников, неизменяемый снимок назначенной программы,
  упражнения и прошлые подходы из серверных данных в типизированный локальный
  SQLite context. Проверять workspace/account/booking/client relations и роль.
  Приватные заметки не попадут в клиентскую проекцию. Отсутствующий план/ошибка
  сети не заменяются вымышленными данными или ложным успехом.
- [ ] Сохранить preload атомарно; прерванное обновление не разрушает прежний
  пригодный снимок. Без сети ранее загруженное занятие доступно; незагруженное
  честно показывает недоступность. Поздняя правка шаблона не меняет снимок
  занятия. Программы всех трёх вымышленных участников не смешиваются.
- [ ] Production lifecycle открытия/сворачивания журнала сохраняет stable UUID,
  выбранное занятие/участника и минимальное состояние восстановления. Dock возврата
  доступен во всех разделах тренера и восстанавливается после перезапуска;
  учитывать hydration failure, navigation и safe area/крупный текст/calm mode.
  Существующие demo-сценарии сохранить отдельно, без смешивания с real workspace.
- [ ] Account/workspace/session fencing: logout закрывает scoped storage/runner,
  не отправляет старую очередь за нового пользователя и не стирает pending.
  Запоздалый preload/restore не меняет состояние новой сессии. Повторный вход
  восстанавливает только собственный контекст. Никаких destructive purge.
- [ ] Описать адаптацию server UUID, grams/reps/seconds/nulls и projection/revisions
  в seam для SOM-31; использовать контракты SOM-29 без обхода apply_operations.
  Не включать локально фиктивный production save/finish. Явно указать, какие
  действия ждут SOM-31/32; не оставлять доступный ввод с ложным успехом.
- [ ] Meaningful tests: три участника, offline cached/uncached, atomic rollback,
  reload/reopen, late template edit, missing/archived entities, logout/switch,
  stale async response, dock на маршрутах тренера. Mock доказательства отделить
  от real SQLite/SQL/device. При новой SQL API добавить RLS/pgTAP fixtures.
- [ ] `cd app && npm run check` зелёный. CHANGELOG, ROADMAP checkpoint, ADR при
  новом подходе, отчёт app/review/som-30-workout-preload-recovery/README.md с
  точными командами/результатами и непроверенным. Не объявлять экраны принятыми.

## Источники

AGENTS.md, app/AGENTS.md, docs/app/{README,PROJECT-MEMORY,ROADMAP,CONVENTIONS,
ARCHITECTURE,DATA-MODEL,UI-PARITY}.md, ADR 0003/0007/0030/0061/0062/0063;
prototype-fresh/index.html и review/parity/spec-*.json, prototype-fresh/SYNC-DESIGN.md;
app/src/domain/workout*, app/src/features/workout*, workspace-scheduling и
workspace-programs read/service patterns; supabase journal migrations/tests;
app/review/som-29-sqlite-outbox-r2/README.md. Проверяй реальные пути в репозитории.

## Границы

Новые domain/workout-preload и features/workout-preload, их тесты; минимальная
интеграция trainer workspace layout/routes, Today/Schedule entry, journal и dock
только для preload/open/collapse/restore. Существующие domain/workout,
features/workout и workout-demo менять лишь для явно необходимого seam,
сохранив demo и layout. features/workout-sync расширять только недостающим
совместимым storage API без изменения семантики receipts/conflicts.
Новые journal/preload migrations/tests и database.types.ts только при необходимости;
старые миграции не менять. Общие i18n и документы — минимально.
Не трогать billing, auth policy, приглашения, маскота, picker, клиентские экраны,
библиотеку/редактор шаблонов, prototype, scripts/rules очереди. Не реализовывать
полный ввод SOM-31, завершение/correction SOM-32 или уведомления SOM-37.
Не подключать платные сервисы или реальные данные клиентов. Linear не менять.

## Разделение работы

Аккаунт third: до трёх субагентов по tools/codex-agents/SUBAGENTS.md.
До делегирования ведущий фиксирует общий preload/lifecycle contract и владение.
Независимые части: серверный read/snapshot adapter; локальный SQLite preload cache;
регрессионные lifecycle/dock tests. Ведущий интегрирует provider/routes/UI,
владеет shared files/types/docs и запускает финальный полный check.
Если SUBAGENTS.md отсутствует в рабочем клоне, соблюдай эти явные инструкции:
чистые контексты, исключительное владение, узкие тесты субагентов, общий check ведущего.

## Чего нельзя проверить в контейнере

Нет Docker, локального Supabase, браузера, iOS/Android устройств. SQL runtime,
pgTAP, generated type drift, реальный SQLite/reopen/crash, airplane-mode group
и визуальный/native паритет не объявлять проверенными. Подготовь команды и
вымышленные fixtures; group offline→online→second device — общий критерий
SOM-29/30/31/32, не результат только mock preload. Новые PNG не нужны.
Draft PR только в fix/som-50-template-picker, заголовок с SOM-30,
ветка agent/som-30-workout-preload-recovery. Вопросов владельцу не задавать.
