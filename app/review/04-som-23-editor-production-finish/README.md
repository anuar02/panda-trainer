# SOM-23 · production editor finish

Один агент, без субагентов. Ветка `agent/04-som-23-editor-production-finish`,
PR только в `fix/som-50-template-picker`. Начальная база `40ece81` включает
SOM-22 #58 и SOM-20 #55. После fetch дополнительно fast-forward интегрирован
SOM-20 onboarding #60: `8feff49`; перед финальным коммитом также интегрирован
свежий SOM-41 #61: `f354c4a`. Его модули не менялись; после интеграции SOM-27 #62 ADR редактора перенумерован в 0094. Невлитые personal/third API не использованы.

`graft map`: exit 127, `graft: command not found`. Поэтому использованы прямые
точечные поиски и чтение модуля; `graft build` также недоступен. Linear connector
отсутствует среди инструментов: live issue/project/status/relations/duplicates не
перечитаны. Scope взят из брифа и DELIVERY-PLAN; Linear не изменён.

## Сделано и критерии

| Критерий | Результат |
| --- | --- |
| Create «Низ А», library/custom exercises, порядок, sets/reps/time/grams/rest/description, save/read/edit/copy | Synthetic service test использует реальные begin/prepare/transport/adapter; provider test проверяет последовательность и независимый copy ID. Screen builder regression проверяет ввод/picker/порядок. Реальный авторизованный пользовательский flow не проверен. |
| Archived exercises не уничтожают template/program snapshots | Existing adapter/provider/SQL coverage сверено; новый SQL flow копирует reordered template с archived custom exercise, точным граммом, null/zero/rest/cue и сравнением исходных строк после reset role. Immutable program policy не изменена. |
| Scoped draft/pendingSave, lost response/reopen/exact-ID retry/conflict/discard | Сохранены PR52 storage/transport и recovery tests. Новая regression запрещает edit/copy заменять pending input/requestId; explicit reload ждёт durable write и при storage failure сохраняет pending. |
| Screen/route/launcher caller/account/workspace/session/draft/attempt | Provider capture guard + opaque scope; form remount и local attempt/lock. Deferred success/error/discard/reload, leave/unmount, client context/draft/store/session change и следующий save проверены synthetic. Credentials не используются в React scope/keys/results/logs/storage. |
| Новая форма без initialized/edited/error/picker предыдущей | Новая форма по scope/client context; тесты error/picker/discard/new save. Обычный render и refresh сохраняют текущий сценарий. |
| Double tap/save→leave→reopen | Screen local lock предотвращает вторую команду до provider rerender. Back доступен во время save; leave запрещает callbacks, provider pending продолжает existing recovery. Reopened form после фонового success может начать следующий draft без зависания в loading. Реальный crash/reopen не проверен. |
| Общий demo editor, production без demo fallback | Existing template-editor/provider suites проходят; production передаёт свой store/catalog/media. Transport и program assignment callers не изменены. |
| SQL receipts/archive-safe snapshots/concurrency | Новый `supabase/tests/database/template_editor_flow.test.sql`, 10 assertions; existing `template_commands.test.sql`, `client_programs.test.sql`, `template_concurrency.py` сверены по исходникам. SQL не исполнялся здесь; **needs-local-db** для Claude/CI. |
| Документация/ADR | CHANGELOG, minimal ROADMAP, ADR 0094 и этот отчёт. Issue и экраны не приняты. |

## Проверки

Точные команды из корня репозитория:

- `git fetch origin fix/som-50-template-picker` и
  `git merge --ff-only origin/fix/som-50-template-picker`: exit 0, финальная база `f354c4a`.
  При stash pop разрешены только additive конфликты CHANGELOG/ROADMAP с сохранением обеих записей.
- `cd app && npx jest --runInBand tests/workspace-library.test.ts tests/workspace-library-provider.test.tsx tests/workspace-template-context.test.tsx`:
  52 tests / 3 suites, exit 0 на промежуточном прогоне.
- `cd app && npx jest --runInBand tests/workspace-template-editor-route.test.tsx tests/template-editor-lifetime.test.tsx tests/workspace-library-provider.test.tsx`:
  43 tests / 3 suites, exit 0 на промежуточном прогоне.
- `cd app && npm run check`: exit 0; TypeScript, ESLint и Prettier зелёные; **2717 tests / 209 suites**. Финальный прогон после интеграции базы и всех изменений.
- `git diff --check`: exit 0.

Новые service/provider тесты используют synthetic PostgREST/AsyncStorage fixtures,
а screen/route/launcher тесты — deferred promises. Это независимые проверки
контрактов клиента, не доказательство работы реальной базы. Дополнительный финальный targeted прогон `cd app && npx jest --runInBand tests/template-editor-lifetime.test.tsx tests/template-editor.test.tsx tests/workspace-template-context.test.tsx`: 45 tests / 3 suites, exit 0.

Existing tests покрывают
PR52 lost-response recovery, conditional backup clear, same-user relogin/logout,
verified refresh, старый finally/new lock и unknown outcome retry.

Команды DB gate для Claude/CI (здесь не выполнялись):

```sh
cd app
npm run db -- test db
npm run db:types:check
cd ..
python3 supabase/tests/template_concurrency.py --container supabase_db_trainerApp
python3 supabase/tests/program_concurrency.py --container supabase_db_trainerApp
```

Existing migrations не менялись; SQL objects/types не добавлены. Новые PNG,
dependencies, scripts/rules/prototype/cloud и real client data не добавлялись.

## Ограничения и приёмка

Docker/Supabase/browser/native devices отсутствуют. Live Auth, физический storage,
crash/reopen, offline на реальном устройстве, SQL/RLS/pgTAP/concurrency не проверены
локально. AsyncStorage по-прежнему не предоставляет atomic CAS. Весь DB gate —
**needs-local-db**; результат GitHub CI не объявляется локальной проверкой.

`prototype-fresh/index.html`, existing template-builder report и parity specs
прочитаны как эталон. Геометрия/цвета/типографика/native picker SOM-50 не менялись.
Темы/keyboard/large text/VoiceOver/TalkBack/reduced motion и пары native/parity не
проверены. Требуется одобрение владельца; screen и SOM-23 не объявлены принятыми.


## Публикация

- Implementation commit: `0623d4c`.
- `git push -u origin agent/04-som-23-editor-production-finish`: exit 0.
- `gh pr create --base fix/som-50-template-picker --draft --fill`: exit 0,
  [draft PR #63](https://github.com/anuar02/panda-trainer/pull/63).
- `gh pr edit 63 --body-file /tmp/som23-production-pr-body.md`: критерии
  размечены «сделано / не проверено / требует одобрения владельца».
- GitHub CI ожидается после push; его прохождение не заявляется здесь.
