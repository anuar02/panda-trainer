# SOM-32 · Явное исправление завершённого журнала

Дата: 04.10.2026. Ветка: `agent/01-som-32-explicit-correction-server`.
Draft PR: [#56](https://github.com/anuar02/panda-trainer/pull/56), base
`fix/som-50-template-picker`. Implementation commit: `c07e427`.
База при начале: `origin/fix/som-50-template-picker`, `290106e`.
Пакет реализует explicit correction; весь SOM-32 и экран не приняты.
Статус SQL: **needs-local-db**.

## Контекст и границы

`git fetch origin fix/som-50-template-picker` выполнен; HEAD совпадал со свежей
базой. В migrations базы эквивалентного apply correction RPC не было.
Live Linear project и SOM-32 прочитаны без изменений: issue `In Progress`,
дубликат не указан, SOM-31 — историческая dependency; finish PR #54 открыт и
не использован как зависимость. Невлитые ветки не включались.

`command -v graft` не нашёл executable, каталога `graft/` нет.
`tools/codex-agents/SUBAGENTS.md` отсутствует. Три агента работали с чистым
контекстом и исключительным владением: новая migration; отдельный клиентский
модуль; независимые SQL/concurrency/app tests. Lead владеет интеграцией,
additive database types, i18n и общими документами.

Существующие migrations/sync transport/save/ack/storage/auth provider,
financial/attendance/booking/program/client-read protocols не изменялись.
Production-finish сохраняет отдельную ответственность; correction controls
подключены только для завершённого журнала выбранного участника.
Selective personal-program update остаётся заблокированным immutable-copy /
provenance решением, см. OPEN-QUESTIONS и ADR 0029.

## Контракт и проверки

[ADR 0085](../../../docs/app/decisions/0085-explicit-finished-journal-correction.md)
фиксирует arguments, explicit confirmation, original finish timestamp,
immutable request receipt и session/storage fences.

| Критерий | Evidence / gate |
| --- | --- |
| Owner-only narrow RPC, tenant links, grants/RLS | новая migration; SQL runtime gate открыт |
| Stored envelope/payload/conflict snapshot validation | новая migration и pgTAP; runtime не проверен |
| Same request replay / reuse / draft once / rollback | pgTAP и настоящий Python concurrency harness; runtime не проверен |
| Journal-only mutations, original finish visibility | helper/audit и SQL assertions; runtime не проверен |
| Typed explicit bearer transport, refresh/session fences | correction-specific synthetic app tests |
| Durable exact replay, conditional clear, lost result | independent store/service/hook synthetic tests |
| Просмотр → подтверждение → readback | controls/hook/screen synthetic tests; native/parity открыты |
| Additive generator-format types | ручное отражение migration; generated drift требует local DB |
| Общий app check | PASS: 182 suites / 2178 tests; typecheck/lint/format PASS |
| Полная приёмка SOM-32/экрана | требует одобрения владельца; program update открыт |

## Команды в контейнере

```sh
git fetch origin fix/som-50-template-picker
cd app
npm run check
```

Финальный `cd app && npm run check`: **PASS**, 182 suites / 2178 tests,
TypeScript / ESLint / Prettier PASS. Независимые correction-specific tests:
`cd app && npx jest --runInBand tests/workout-corrections-*.test.ts*` —
5 suites / 52 tests PASS. Lead проверил также entry integration seam:
`cd app && npx jest --runInBand tests/workout-entry-screen.test.tsx` —
8 tests PASS в финальном полном прогоне.

Первый полный прогон выявил отсутствующий native QuickBase64 в старом
изолированном entry-screen test после нового импорта; добавлен mock нового блока,
а новый блок отдельно проверяется correction screen/hook suites. В entry suite
добавлены проверки finished-only controls и scoped readback/relogin.
`git diff --check` PASS; Python AST / `py_compile` проверили только синтаксис.
В pgTAP authored **120 assertions**, не runtime результаты.
Concurrency harness содержит реальные PostgreSQL session races и удерживает
transaction locks перед commit; пять успешных receipts ожидаются assertions,
это не число выполненных здесь DB операций.
SQL runtime, реальные auth/RLS/receipts, native storage crash/reopen и два
устройства не доказаны transport mocks.

## Обязательный local DB gate

Только disposable synthetic database, все migrations свежей базовой ветки и
`20261004100000_explicit_workout_correction.sql` применены.

```sh
cd app
npm run db -- start
npm run db -- db reset
npm run db -- db lint --local --level warning
npm run db -- test db
npm run db:types:check
cd ..
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres python3 supabase/tests/workout_correction_concurrency.py
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres python3 supabase/tests/workout_sync_concurrency.py
python3 supabase/tests/workout_correction_concurrency.py --container supabase_db_trainerApp
```

Новый harness запускается отдельной командой: существующий CI перечисляет
старые harnesses, workflow/config по границам задачи не менялся. До слияния
coordinator/Claude должен выполнить новый concurrency gate вместе с ordinary
sync regressions, pgTAP/lint/type drift. Пакет нельзя считать SQL runtime proven
по одному app CI. Docker и psql отсутствуют в контейнере; эти команды **не запускались**.

Матрица `resolve_conflict` заметок использует synthetic SQL-shaped saved draft и
matching sync receipt: existing ordinary RPC сохраняет прежнее явное разрешение
последнего privacy conflict после finish (его regression не менялся).
Новый correction helper дополнительно проверяет сохранённые выбранные версии,
включая выбор старой immutable заметки после допустимого rebase другого конфликта.

## UI / приёмка

Изменение следует ADR 0061: тренер видит текущее значение, предложенную правку и
её источник и подтверждает конкретный draft. Controls используют существующие
journal styles и общие UI-компоненты. Default prototype остаётся эталоном
(ADR 0007); новый explicit correction flow требует визуального review владельца.

Не проверены: browser/native, пары эталон/приложение 390×844, геометрия/темы,
крупный шрифт, accessibility на устройстве, SQLite/AsyncStorage crash,
production Supabase. Новые PNG не добавлялись (ADR 0066). Экраны и SOM-32
целиком не объявлены готовыми или принятыми. Linear не изменялся.
