# SOM-32 · Выборочное обновление личной программы

Дата: 04.10.2026. Ветка: `agent/01-som-32-program-update`.
Base: `fix/som-50-template-picker`, `8ca8fc0` (#71), перепроверена через fetch.
Только synthetic данные. Статус: реализация для review; **needs-local-db**;
SOM-32, экран и этап не объявлены принятыми.

## Результат и критерии

| Критерий брифа | Сделано / доказательство / внешний gate |
| --- | --- |
| Finish → явный выбор | Action только у server-finished participant, после сохранённых результатов; отдельный Sheet, реальные server plan/fact, checkboxes, вес, reps/seconds, sets; program-update-screen и existing finish screen suites |
| Нет выбора / отмена | Controller не dispatches при пустом selection; dismiss disposes transport, сохраняет неизвестный intent; UI/controller/hook/store regressions |
| Только сохранённое | Server читает set_results; deleted, unknown weight, zero reps/seconds исключены; last saved position + 1 и last valid result; pgTAP assertions, SQL runtime не проверен локально |
| Новая immutable копия | Additive command копирует source; unselected order/metadata, replacement position, append/skip; прежний journal/template/program не меняются; pgTAP, runtime CI gate |
| Происхождение | Private immutable receipt: source kind/ID/revision, booking snapshot/template revision, journal/current revision, chosen keys и exercise snapshots/facts |
| Реальный источник SOM-31 | prepare_workout_journal использует booking snapshot без source_program_id; command поддерживает первую личную копию из него и строго доказанное соответствие существующей личной программе; pgTAP вызывает existing prepare/save/finish RPC |
| Exact replay / rollback / stale | Request UUID + exact canonical JSON; identical result; changed payload/foreign/duplicate/malformed/archived/stale отклоняются; constraint rollback проверяется pgTAP, runtime CI gate |
| Assignment/correction concurrency | Advisory workspace → workspace row → request lock; extended existing CI program_concurrency.py: identical concurrent retry, correction-before-update, assignment-before-update, update-before-waiting-assignment |
| Caller/session lifetime | JWT sub/session_id fence с verified refresh и explicit bearer; actor/workspace/workout/client закреплены; late success/error, relogin, correction revision, dismiss/unmount regressions |
| Pending и неизвестный результат | Scoped AsyncStorage key + exact program/revisions/selected keys/UUID; conditional clear; read failure после receipt не считается отказом; повтор использует прежний ID |
| Readback / клиент | После validated receipt заново читается current context; existing client programme focus/retry API/RLS видит новую copy и сохраняет доступ к old history; actual two-phone read требует внешней проверки |
| Correction → повторное предложение | Correction сама не создаёт копию; новая review revision и same-journal provenance допускают новый explicit update; pgTAP flow и hook revision tests |
| Attendance/payment/finish retry | Эти writers и finish/correction transport/functions не изменены; full app suite перепроверяет их regressions |
| SQL/types CI | Новая migration и generator-format Functions добавлены; Docker/psql отсутствуют, lint/pgTAP/concurrency/type generation runtime оставлен CI/Claude |
| Parity/accessibility/owner | Labels/action/Sheet и checkbox roles подключены; screenshot comparison, real native gesture/screen reader и принятие владельцем **не проверены** |

## Контекст и границы

Прочитаны root/app AGENTS, app CLAUDE, Linear guide/workflow,
README/CONVENTIONS/ROADMAP/PROJECT-MEMORY/UI-PARITY/OPEN-QUESTIONS/DELIVERY-PLAN,
ADR 0007/0029/0061/0090/0100, existing finish-r2/correction reports,
CODEX-PLAN §4, sheets programUpdate, trainer finished action, store programs и
SYNC-DESIGN. Новое техническое решение:
[ADR 0102](../../../docs/app/decisions/0102-program-update-receipts-and-sources.md).

`command -v graft` — exit 1, executable и graph отсутствуют; graph ask/build
невозможны. Доступного Linear connector среди tools нет; live project/issue,
relations и duplicate search не прочитаны. Бриф и repository delivery map
использованы как scope; Linear/status/comments/project updates не менялись.

Existing assignment/correction/finish transports не переписывались. Минимальные
изменения existing: finished action в entry screen, три screen-test mocks нового
модуля, public Functions types, i18n registration и INSERT timestamp trigger
программы. Последний сохраняет existing latest-read ordering при assignment,
который начал транзакцию раньше update, но получил workspace lock позже.
Old migrations, prototype, deps/workflows, account deletion/export/settings/Auth/
push/financial/scheduling/invitation writers и agent rules не изменены.

## Проверки в контейнере

- `cd app && npm run check` — PASS: TypeScript strict, ESLint max-warnings=0,
  Prettier и **240 suites / 3048 tests**. Финальная проверка после integration fixes.
- Targeted `npm test -- --runTestsByPath tests/program-update-{domain,service,controller,store,session}.test.ts tests/program-update-{hook,screen}.test.tsx`
  — PASS: **7 suites / 43 tests**, отдельные domain/controller/transport/UI/store/session lifetimes.
- `python3 -m py_compile supabase/tests/program_concurrency.py` — PASS,
  только Python syntax, **не PostgreSQL runtime evidence**.
- `git diff --check` — PASS.
- `CI=1 npm run export` — PASS: iOS, Android и web bundles, 71 web routes; dist не коммитится.
- `command -v docker`, `command -v psql` — executable отсутствуют;
  `supabase test db`, DB lint, generated type drift и race harness **не запускались**.
- pgTAP содержит 47 assertions; existing workflow уже запускает programme harness;
  CI workflows не менялись. Настоящие SQL проверки обязательны перед merge.
- Новые application files проверены на comments/`any`: отсутствуют.
  PNG, secrets, real client data и новые dependencies не добавлялись.

## Product/parity ограничения и внешние проверки

В прототипе обычный вес/reps не является отдельной option; last valid values
добавления/замены записываются в prev. Бриф и ADR 0100 требуют перенос факта.
Снятый по умолчанию values checkbox использует last saved approach в planned
fields; partial finish не сокращает план. Неоднозначность и консервативные limits
записаны в OPEN-QUESTIONS. Это не новое одобренное правило.

Если исходный personal programme не указан, существующая личная копия должна
полностью совпадать со снимком занятия либо иметь receipt того же журнала.
Другие назначения/несопоставимые планы отклоняются, будущие booking plans
автоматически не перестраиваются. Без snapshot/валидного source обновление
недоступно. Нет создания пустой программы, нет add/replace без валидного saved fact.

UI использует existing Sheet/Button/Text/theme/prototype icons. Эталон read-only:
`prototype-fresh/js/sheets.js:435`, `js/screens/trainer.js:1144`,
`css/fresh.css:1292–1294`. Full spec содержит существующие общие tokens, но не
отдельный capture programUpdate. Новые plan/fact строки и значения/checkbox layout
требуют визуальной сверки; совпадение с прототипом не заявлено.

Открыты: два телефона, авиарежим, реальные AsyncStorage/SQLite/crash/reopen и Auth,
установленные iOS/Android, gesture/safe-area/font-scale/screen-reader проверки,
dark/light/default 390×844 parity и одобрение владельца. Только owner принимает
экран; synthetic tests/export не закрывают эти gates.
