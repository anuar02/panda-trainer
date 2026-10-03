# SOM-31 · Production ввод подходов и мини-группа

База: fix/som-50-template-picker, 9d1802a. Ветка: agent/som-31-workout-entry.
Implementation commit: ae052a6. [Draft PR #38](https://github.com/anuar02/panda-trainer/pull/38).
Linear прочитан без изменений: проект trainerApp, SOM-31 In Progress, SOM-30 In Review
(технический PR влит), зависимость SOM-32; поиск не нашёл отдельного дубликата
production ввода. Критерии совпадают с заданием и DELIVERY-PLAN. graft executable и graft/ отсутствуют.
tools/codex-agents/SUBAGENTS.md отсутствует; три исполнителя работали с чистыми
контекстами и отдельными файлами. Полный check запускает только ведущий.

## Критерии

| Критерий | Результат |
| --- | --- |
| Focus, прошлый раз, большая шторка, durable undo; draft/null/zero/exact units | Реализовано; app tests; visual/native требует проверки и одобрения владельца |
| Три вымышленных участника, UUID и изолированные drafts/program/results/pending | Реализовано; scoped mocked SQLite/service/hook fixtures; real offline/reopen не проверено |
| Immutable assignment preparation, additive RPC/migration | Реализовано 20261003150000; 27 pgTAP fixtures и concurrency harness подготовлены, SQL не запускалось |
| Add/replace только в занятии, atomic projection/outbox и retry | Реализовано через существующий seam; шаблоны/программы не пишутся; SQL runtime не проверено |
| Revisions/tombstones/receipts, обе версии, session fencing | Реализовано; unit/hook regression checks; real second device/SQL не проверено |
| Private notes клиенту не раскрываются | Клиентские экраны/права не менялись; owner-only conflict reads; pgTAP fixtures подготовлены, runtime не проверен |
| SOM-32 finish/correction отдельно | Кнопки фиктивного завершения нет; finished journal ввод отключён |

Контракты и компромиссы: ADR 0075. Первое открытие требует сети и нового RPC;
после подготовки сохраняется in_progress cache. Partial preparation безопасна:
повтор возвращает уже созданный journal identity. Проекция+операция атомарны
в существующем outbox; SQLite drafts/index/resources — отдельная база, общая
транзакция между базами не заявляется. Logout не удаляет pending. Сохранённый
конфликт offline может устареть; явный выбор доставляется с expected_revision,
серверный отказ сохраняется и требует нового refresh/выбора.

## Проверки

`cd app && npm run check` — зелёный: TypeScript, ESLint, Prettier,
153 suites / 1505 tests passed. Итоговый лог: `/tmp/som31-check-final.log`
(локальный временный artifact, не в git).
`git diff --check` — зелёный.
`PYTHONPYCACHEPREFIX=/tmp/som31-pycache python3 -m py_compile supabase/tests/som31_prepare_workout_concurrency.py`
— зелёный; это синтаксис harness, а не исполнение PostgreSQL.
Финальный фокусный root run восьми новых suites: 35 tests passed.
Полный check также включает существующие preload/provider/outbox регрессии.


```sh
cd app
npm run check
npx jest tests/workout-entry-coordination.test.ts tests/workout-entry-domain.test.ts tests/workout-entry-service.test.ts tests/workout-entry-storage.test.ts tests/workout-entry-screen.test.tsx tests/workout-entry-hook.test.tsx tests/workout-entry-prepare.test.ts tests/som31-regression.test.ts --runInBand
```

SQL/pgTAP/concurrency, generated drift, реальные SQLite/reopen/crash, браузер,
iOS/Android, accessibility, cloud и приёмка владельца: **не запускалось / не проверено**.
Новых PNG нет. apply_operations, применённые migrations, Expo/package-lock,
account-export/deletion, client screens и остальные запрещённые области не менялись.
GitHub read-back: PR #34 уже MERGED в fix/som-50-template-picker; он исправляет исходный apply_operations SQL lint и Expo drift; его fix здесь
не копируется. Ветка остаётся на заданной базе 9d1802a; новые merge-base изменения
не cherry-picked и не переписывают старые migrations. Новую migration применяет и проверяет Claude; облако не затрагивалось.

## Воспроизведение вне контейнера

Только disposable локальная Supabase, никакого pilot cloud:

```sh
supabase start
supabase db reset
supabase db lint --level warning
supabase test db
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres python3 supabase/tests/som31_prepare_workout_concurrency.py
cd app
npm run db:types:check
```

Concurrency harness использует DATABASE_URL и psql; см. header самого файла. Все IDs,
имена и payload fixtures вымышленные. На устройствах: загрузить группу из трёх,
записать 52,125 кг и 0 reps отдельно от пустого значения, переключить participant,
отключить сеть, скопировать прошлый результат (только draft), подтвердить/undo,
закрыть и открыть приложение, вернуть сеть и повторить доставку. На втором
устройстве изменить тот же подход, обновить и выбрать одну из двух версий; проверить
сохранность обеих conflict snapshots, rejected state и logout/account switch.
Сверить prototype-fresh без параметров 390×844 и spec-dark.json: wfocus radius28,
composer radius20, поля/stepper44, styles из features/workout/measurements.ts.
Текстовый structural review и tests не заменяют пары native/visual сравнений.
Экран, SOM-31 целиком и пилот не объявляются принятыми.


## Coordinator review · 2026-10-03

Merged fresh base 96db40a into the agent branch, retaining both documentation
packages and base RPC signatures. Renumbered this journal ADR to 0075 because
0073 and 0074 are used by merged deletion/export work. npm ci completed.
Fresh npm run check PASS: typecheck, lint, format, 159 suites / 1605 tests.
Git diff --check PASS. SQL/pgTAP/native were not executed.

**Rejected for r2:** reconcileWorkout preserves a rejected local replacement after
replace_exercise conflict selection current. With server original revision2 and
skipped=false, local original skipped=true plus replacement revision1 with
replacedFromId=original, pending=[] and issues=[], a direct synthetic invocation
still returns skipped original and visible replacement. The revision>0 append and
unconditional replacedFromId protection retain state with no pending provenance.
Absent local sets also need lifecycle review. Add domain/service/hook regressions
covering conflict selection, receipt, refresh and reopen, preserving pending,
rejected data and both audit versions. Existing passing tests miss this case.

PR #38 is closed without merging; followup agent/som-31-workout-entry-r2 must
retain the full initial scope. Its SQL package will require needs-local-db and
local db lint/test db before any merge. No owner acceptance is claimed.
