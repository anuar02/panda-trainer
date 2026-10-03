# SOM-41 · Проверка deletion preflight контракта

03.10.2026. Ветка `agent/som-41-deletion-contract`, база `9d1802a`;
целевой draft PR base — `fix/som-50-template-picker`.

Добавлены независимый pure [evaluator](../../src/domain/account-deletion/index.ts),
[синтетические тесты](../../tests/account-deletion/preflight.test.ts),
[контракт и schema handoff](../../../docs/app/privacy/DELETION-PREFLIGHT-CONTRACT.md),
[ADR 0073](../../../docs/app/decisions/0073-pure-account-deletion-preflight.md).
Общие CHANGELOG/ROADMAP и ссылка из deletion handoff изменены минимально.
SOM-41, runtime удаления, ротация ≤7 дней и пилот остаются открытыми.

## Контекст и границы

Прочитаны AGENTS/app AGENTS, Linear guide/workflow, README, PROJECT-MEMORY,
ROADMAP checkpoint, CONVENTIONS, UI-PARITY, ADR 0007/0061/0062/0064/0066,
ARCHITECTURE/DATA-MODEL, DELIVERY-PLAN/OPEN-QUESTIONS, privacy handoff/coverage
и отчёты SOM-41 privacy/export. `graft` отсутствует, использованы rg и точечное
чтение migrations. Live Linear прочитан без записей: trainerApp/SOM-41 In Progress,
blockedBy SOM-51/59, blocks SOM-42, duplicateOf отсутствует; поиск «удаление»
в проекте вернул только SOM-41. Новых задач, комментариев и сообщений нет.

Нет изменений SQL/migrations/database.types.ts, account-export/features/auth/storage/
outbox/runner/UI/routes, Expo/package-lock, policy draft/DATA-LIFECYCLE,
prototype/main/scripts/rules. Parallel PR #34 не дублируется. Endpoint/delete RPC,
purge, local collectors и интеграция отсутствуют. Строки кода — машинные коды;
новых пользовательских строк/i18n нет. Секреты/реальные данные/PNG не добавлены.

## Выполненные команды

Из корня:

```sh
command -v graft
graft map
git log -1 --oneline
rg -n 'references|restrict|trigger|immutable|reverses|replaced_from' supabase/migrations
rg -n '^create table|references' supabase/migrations/20261002105000_creation_receipts_before_reschedule.sql supabase/migrations/20261001150000_booking_status_commands.sql supabase/migrations/20261001170000_create_client_record.sql supabase/migrations/20261001180000_client_invitations.sql supabase/migrations/20261002110000_booking_reschedule_commands.sql supabase/migrations/20261002140000_booking_request_resolution.sql
```

`graft map`: command not found. База подтверждена `9d1802a`.
FK/trigger/self-link/NO ACTION/RESTRICT сверены статически, spans и реальные пути
даны в контракте. Это не SQL execution и не каталог работающего пилота.

Из `app/`:

```sh
npx prettier --write src/domain/account-deletion tests/account-deletion
npm run typecheck
npm test -- --runTestsByPath tests/account-deletion/preflight.test.ts
npm run check
```

Dedicated tests/typecheck — PASS: 58 tests / 1 suite, snapshots 0.
Полный `npm run check` — PASS (exit 0): typecheck, lint без warnings,
format:check; 1527 tests / 146 suites, snapshots 0.
Полный прогон включает финальные 58 preflight tests.

Матрица проверяет zero/unknown, все четыре local категории, pending вопреки proof,
foreign account/workspace/scope, новую сессию прежнего аккаунта, inflight/timeout/
unknown receipt, stale/future/boundary, shared/dual role, отсутствие local export/ack,
foreign scope/snapshot proof, отказ server export как local proof, отдельные внешние
gates, malformed evidence/context, missing fields, неверные числа/enum, лишние
payload/credentials, accessors/prototypes/исключения. Совмещённая матрица сохраняет
review/unknown причины при blocked, максимум 25 уникальных безопасных причин.
Любой результат сохраняет false authorization/identity; тесты не вызывают stores/API.

Из корня — проверка ссылок, coverage и границ:

```sh
python3 - <<'PY'
from pathlib import Path
import re
files = [
    Path('docs/app/privacy/DELETION-PREFLIGHT-CONTRACT.md'),
    Path('docs/app/decisions/0073-pure-account-deletion-preflight.md'),
    Path('app/review/som-41-deletion-contract/README.md'),
    Path('docs/app/privacy/ACCOUNT-DELETION-HANDOFF.md'),
]
count = 0
for p in files:
    for link in re.findall(r'\]\(([^)]+)\)', p.read_text()):
        target = link.split('#', 1)[0].strip('<>')
        if not target or '://' in target or target.startswith('/'):
            continue
        assert (p.parent / target).exists(), (p, target)
        count += 1
schema = '\n'.join(p.read_text() for p in Path('supabase/migrations').glob('*.sql'))
tables = set(re.findall(r'create table\s+(?:if not exists\s+)?(?:public|private)\.(\w+)', schema, re.I))
coverage = Path('docs/app/privacy/DATA-LIFECYCLE.md').read_text()
assert all(table in coverage for table in tables)
print('PASS: relative links', count, '; tables covered', len(tables))
PY
git diff --check
git diff --name-only 9d1802a
git status --short
```

Статическая проверка — PASS: 39 относительных ссылок, все 37 таблиц migrations
представлены в DATA-LIFECYCLE. `git diff --check` — PASS. Diff ограничен восемью
файлами пакета; защищённые runtime/schema файлы не изменены.

## Воспроизводимые будущие проверки — не запускались

На машине с Docker/Supabase CLI в disposable локальном окружении, без cloud apply:

```sh
cd app
npm run db -- start
npm run db -- db reset
npm run db -- db lint --level warning
npm run db -- test db
npm run db:types:check
```

Существующие SQL tests не являются deletion tests. Для будущей runtime реализации
подготовить синтетические A/B fixtures: trainer A, trainer B, client C с карточками
у A/B, trainer A одновременно client B; snapshots/archives, replacement chain,
payment reversal и credit restore, оба вида notes, sync conflict/correction,
все private receipts. Проверить preservation B/C, Auth authors/accepted_by,
immutable DELETE rejection, exact retry после timeout, конкурентную mutation,
crash между DB cleanup и Auth и повтор после Auth delete. Здесь этих SQL fixtures
и удаления нет; pure fixtures из тестов используются только для evaluator.

На iOS/Android отдельно: real SQLite commit/reopen/crash, WAL, pending/rejected/
conflict/correction, logout/new session/late response, storage failure, local export/
ack сохранность и scope, concurrent offline device. Для облака — фактические
backup/log evidence, ротация ≤7 дней, restore без возвращения удалённого.

## Не проверено и требует одобрения

Нет Docker, Supabase runtime, браузера и iOS/Android. SQL/pgTAP/concurrency,
generated type drift, real SQLite/crash/reopen, native/visual/accessibility,
cloud deletion/Auth/recovery/backup/logs, remote CI не проверены этим пакетом.

Shared client/dual role, local export/ack UX, оператор/контакты/основания/права/
юридические сроки, retention исключения, offline copies, mutation interlock и
DB/Auth recovery требуют будущего review владельца/специалиста. Product ответы
не выбраны; исходные вопросы оставлены в handoff, OPEN-QUESTIONS за границами.
Наличие внешнего evidence не является approval, а proof метаданные не удостоверяют
содержимое выгрузки или личность. DB/Auth атомарность не обещается.
Ни экран, ни удаление, ни весь SOM-41, ни пилот не объявлены принятыми.
