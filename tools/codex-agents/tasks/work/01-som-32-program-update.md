# SOM-32 · Завершение журнала и выборочное обновление личной программы

Linear: https://linear.app/something-great/issue/SOM-32
Ветка: agent/01-som-32-program-update. Base: fix/som-50-template-picker.

## Контекст

Оставшаяся целая SOM-32: server + transport + экран + тесты. Finish и explicit
correction уже в базе (#56/#59); исправную реализацию не переписывать, проверить
полный сценарий и закрыть оставшееся обновление программы. Владелец 04.10 утвердил
ADR 0100: только явный выбор тренера создаёт новую immutable копию, предыдущая
сохраняется. Старое временное правило «никогда не обновлять» отменено этим ADR.
Зависимости SOM-24/31 и correction/finish влиты; брать свежую базу не старше #71.

## Критерии

- [ ] После подтверждённого завершения есть действие «Обновить программу клиента»
  и лист выбора изменений по prototype-fresh/CODEX-PLAN.md, задача 4, js/sheets.js
  programUpdate и js/screens/trainer.js. Реальные данные журнала вместо fixtures.
  Выбор упражнений, план/факт, вес, повторы/время, число подходов; отмена и отсутствие
  выбора не создают копию. Не переносить черновые/несохранённые подходы.
- [ ] Additive SQL command создаёт новую личную копию только для своего клиента
  из завершённого журнала; неизменяемые прошлые программы/журнал/шаблон сохранены.
  Provenance: исходная программа и ревизия, журнал и его актуальная версия,
  выбранные упражнения. Неизменённые упражнения и порядок сохраняются.
  Использовать правила вычисления изменений прототипа; неоднозначность записать
  в отчёт/OPEN-QUESTIONS, не угадывать новые продуктовые правила.
- [ ] request_id/receipt обеспечивают exact idempotent replay после timeout/reopen;
  другой payload с тем же ID отклоняется. Stale source revision, concurrent new
  assignment или correction, чужие/дублированные упражнения, malformed values,
  archived/unavailable scope отклоняются без частичных строк. Lock order согласован
  с existing assignment/correction, конфликт не затирает новую актуальную копию.
- [ ] Caller/session/JWT/workspace/client identity фиксируется до dispatch;
  pending содержит точный intent, guard late result/error при refresh/relogin,
  переключении клиента и dismiss/unmount. Confirmed success обновляет чтение
  актуальной программы; клиент видит новую копию и прежнюю историю existing API.
  Offline/unknown/conflict/error честны, новый ID не создаётся для неизвестного retry.
- [ ] Полный flow finish (включая частичный) → выбор → подтверждение → readback,
  отказ, correction → повторное предложение. Correction сама программу не меняет;
  attendance/payment и finish retry semantics не меняются.
- [ ] Независимые domain/controller/transport/UI regressions и pgTAP: own/foreign,
  immutable history/provenance, exact replay, rollback, stale revisions, две сессии.
  Assignment/correction/update race добавить в existing program_concurrency.py,
  который уже запускает CI; новый отдельный harness без CI не заменяет runtime
  evidence. Приложение и DB/types CI должны быть зелёными.

## Источники

AGENTS.md, app/AGENTS.md, docs/app/{README,CONVENTIONS,ROADMAP,DELIVERY-PLAN,
PROJECT-MEMORY,OPEN-QUESTIONS,UI-PARITY}.md; ADR 0007/0029/0061/0090/0100;
prototype-fresh/CODEX-PLAN.md задача 4, js/sheets.js programUpdate, SYNC-DESIGN.md;
app/review/som-32-production-finish-r2/README.md и correction report;
existing workspace-programs, workout-entry/preload/corrections и client-program.
Сначала graft map/ask если доступны; отсутствие записать. Прототип только читать.

## Границы

Новые program-update domain/features и их tests; минимальная интеграция действия
в workout-entry/finished presentation; program read refresh seam; новая migration,
свои SQL tests/harness, database.types.ts. Existing assignment/correction/finish
изменять лишь минимально при доказанном integration defect, не переписывать transport.
Не менять account-deletion/export/settings/privacy/Auth/push (third SOM-41),
financial/scheduling/invitation writers, dependencies, workflows, old migrations,
prototype или agent scripts/rules. Shared CHANGELOG/ROADMAP/i18n/types минимально,
после fresh base устранить конфликты. Новый migration timestamp больше максимума
base; новый ADR при техническом решении со свободным номером по RULES.

## Проверка и завершение

- [ ] cd app && npm run check; отчёт app/review/01-som-32-program-update/README.md
  с критериями, точными результатами и ограничениями; CHANGELOG/ROADMAP обновлены.
- [ ] App без комментариев/any, строки через i18n, без PNG/секретов/реальных данных.
  PR с SOM-32 только agent/* → fix/som-50-template-picker, готов к зелёному CI.

В контейнере Docker/SQL и нативные устройства могут отсутствовать: DB runtime
доказывает CI (с #70 все concurrency harnesses); mocks не доказывают SQL/native.
Два телефона, авиарежим/SQLite/crash/reopen, parity/accessibility и приёмка владельца
остаются внешними проверками, не объявлять экраны/этап принятыми. Старые migrations
не трогать; needs-local-db оставлять Claude. Не менять Linear/main, не задавать вопросов.
