# SOM-22 · Library production finish

04.10.2026. Branch `agent/02-som-22-library-production-finish`, target
`fix/som-50-template-picker`. Один агент, без субагентов.
Implementation commit `493b729`; [draft PR #58](https://github.com/anuar02/panda-trainer/pull/58)
создан и push выполнен. Draft/base/head и label `needs-local-db` сверены read-back.
GitHub app/database CI запущен; результат не объявлен зелёным этим отчётом.

Свежая база `4c20e22`: SOM-23 #52, SOM-20 creation #55 и read fencing #44 влиты.
Невлитые personal/third ветки не использованы. Рабочие изменения ограничены exercise
mutations/helpers, provider exercise callers, library route, своими tests/review и
минимальными docs. Template save/archive/read/draft protocol сохранён.

`graft map` завершился exit 127: executable и каталог `graft/` отсутствуют.
Использованы точечные rg/source reads. Live Linear project/issue/dependencies не
прочитаны: callable Linear tools отсутствуют; scope взят из брифа и DELIVERY-PLAN.
Linear не менялся. GitHub merge statuses #52/#55/#44 сверены read-only.

## Реализация и критерии

| Критерий | Доказательство / статус |
| --- | --- |
| Нормализованный поиск/ё; create → attach → archive → existing read | Сделано synthetic: actual service scenario, provider scenario и route normalized search; pgTAP fixture проходит также client program/finished history/result. SQL runtime не проверен |
| Archived exercise не selectable, прежние template/immutable snapshots сохранены | Read pagination/normalization прежние; service/provider tests проверяют ссылку и единицы, SQL сравнивает целые строки program/history/result и template line до/после archive |
| Expected actor/workspace/JWT sub/session_id до async; explicit bearer; guards до/после IO/error/cache | Сделано: exercise-specific fence и owner check, fresh bearer после доказанного refresh. Synthetic await-boundary, wrong claims, relogin/logout/dispose/scope tests |
| TOKEN_REFRESHED не заменяет identity proof | Сделано: unproved refresh и silent bearer replacement отменяют operation; proven same-identity refresh работает при retry |
| Lost response/retry/double tap сохраняют agreed input/replay identity | Сделано: scoped durable canonical payload + stable exercise UUID; duplicate full payload/scope validation, archived UUID не создаётся заново |
| Archive retry безопасен | Conditional UPDATE, original archive date readback, без hard delete или revision update; service/SQL/concurrency regressions |
| Storage/clear failures не success; late finally/new submit/unmount не сбрасывают новую форму/lock | Сделано synthetic: serialized storage/backup/marker, guarded compensation; shared owned provider lock; route guard/cancel и scoped selection |
| Runtime validation unknown rows/ID/scope/dates/units | Сделано: mutation row validation плюс full input equality, reused read validators; wrong scoped rows/dates/units/payload tests |
| Existing template/assignment/read tests | PASS: полный app check, 2347 tests / 186 suites |
| SQL migrations | Только новая additive `20261004100000_exercise_replay_identity.sql`: INSERT privilege существующей колонки id. Existing migrations не изменены. Новых SQL objects/types нет, generated types прежние |
| Native/visual/accessibility и приёмка экрана/issue | Не проверено; требует одобрения владельца |

Доказанный defect, требующий additive migration: раньше server-generated UUID
терялся при lost insert response. После archive активная уникальность имени позволяет
retry создать другую строку. Новый durable UUID удерживает PK conflict и после archive.
RLS и policy повторного использования архивного имени не меняются.

Storage main completion marker имеет приоритет над старым backup; backup сохраняется
для восстановления при отсутствующем main. Storage clear/cancellation failure не
возвращает success; guarded compensation и следующая hydration идут в общей очереди.
Это synthetic proof, не доказательство физического crash или надёжности AsyncStorage.
Если свой UUID оказался archived до reconciliation или validated duplicate имеет
другой payload, исход известен: возвращается ошибка и pending очищается тем же
guarded storage protocol. Новая команда допустима после успешной cleanup; failure
cleanup удерживает прежний pending. Malformed/чужие rows не дают terminal cleanup.

## Выполненные команды

Из корня:

```sh
graft map
git fetch origin
git log -4 --oneline origin/fix/som-50-template-picker
gh pr list --base fix/som-50-template-picker --state all --limit 12 --json number,title,headRefName,state,mergedAt
git diff --check
python3 -c "import ast; ast.parse(open('supabase/tests/som22_exercise_concurrency.py').read()); print('Python syntax: PASS')"
```

`graft map`: executable отсутствует. Fetch/merge-status reads: успешно.
`git diff --check`: PASS. Python syntax: PASS; concurrency runtime не запускался.

```sh
cd app
npm test -- --runTestsByPath tests/workspace-exercise-mutations.test.ts tests/workspace-exercise-commands.test.tsx tests/workspace-library-provider.test.tsx tests/workspace-library-route.test.tsx tests/workspace-library.test.ts
npm run check
```

Итоговый `npm run check`: PASS, TypeScript strict / ESLint zero warnings /
Prettier / Jest — **2347 tests, 186 suites**, 23.903 s для Jest.
Целевой независимый набор: **116 tests, 5 suites**, PASS.
Существующие template/assignment/read tests остаются зелёными.

## needs-local-db · CI/Claude handoff

Docker/Supabase daemon отсутствуют. SQL/pgTAP/concurrency здесь НЕ запускались.
Новая pgTAP suite обнаруживается штатным `supabase test db`; новый concurrency file
нужно выполнить отдельной командой в CI/local DB. Workflow/scripts/rules не изменены.
Не вливать до подтверждения SQL runtime. Draft PR имеет label `needs-local-db`.

Из корня на машине с Docker/Supabase:

```sh
supabase start --workdir .
supabase db reset --workdir .
supabase db lint --workdir . --level warning
supabase test db --workdir .
python3 supabase/tests/som22_exercise_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/template_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/program_concurrency.py --container supabase_db_trainerApp
cd app
npm run db:types:check
```

New pgTAP: `supabase/tests/database/som22_exercise_replay_history.test.sql` — supplied
UUID permissions/RLS, ё/alias search, normalized duplicate, create/attach/assign,
archive, byte-comparison original template/program/history/result rows, archive
retry date/revision, lost-response UUID retry after archive and new name reuse,
linked client visibility. Journal/result fixture создаётся привилегированным setup;
это regression storage contracts, не app journal lifecycle test.

New concurrency: same UUID и normalized name с разными UUID создают одну строку;
второй connection действительно ждёт Lock; concurrent conditional archive обновляет
один раз, replay archived UUID остаётся PK conflict. Существующие SQL contracts:
`library.test.sql`, `client_programs.test.sql`, `workout_journal.test.sql`,
`som31_prepare_workout_journal.test.sql` сверены; не менялись.

## Что не доказано

Real Auth/JWT/RLS/network, SQL runtime, физические SQLite/AsyncStorage writes и
crash/reopen, file/share, браузер, iOS/Android, native picker/accessibility, visual
сравнение 390×844 во всех темах/состояниях. Никакие mocks не выданы за эти проверки.
Default prototype/spec/layout/styles не менялись; новые PNG не добавлялись.
Тексты использованы из существующего i18n; UI-PARITY §6 требует native/visual проверки
и owner approval. Экраны и SOM-22 не объявлены принятыми.
