# SOM-41 — проверка документов приватности

03.10.2026. Ветка agent/som-41-privacy-documents; база 4758705,
целевой base draft PR — fix/som-50-template-picker.

Подготовлены только review drafts:
[политика](../../../docs/app/privacy/PRIVACY-POLICY-DRAFT.md),
[карта](../../../docs/app/privacy/DATA-LIFECYCLE.md),
[handoff удаления](../../../docs/app/privacy/ACCOUNT-DELETION-HANDOFF.md).
README документации, CHANGELOG и ROADMAP обновлены минимально.
Продуктовые кнопки/экраны, app код/типы/тесты, SQL и существующие ADR не менялись.
Весь SOM-41 остаётся открытым; независимый backend export не проверяется этим пакетом.

## Контекст и статическая сверка

Прочитаны AGENTS, Linear guides/workflow, README, CONVENTIONS, PROJECT-MEMORY,
UI-PARITY, ROADMAP checkpoint, ADR 0007/0061/0062/0064/0066, ARCHITECTURE,
DATA-MODEL, DELIVERY-PLAN, OPEN-QUESTIONS, supabase README и действующие schema/RLS.
graft отсутствует: command -v graft не вернул путь, graft/INDEX.md отсутствует.
Поэтому использованы rg и точечное чтение исходников.

Live Linear прочитан без записей: проект trainerApp, SOM-41 — In Progress,
блокеры SOM-51/59, блокирует SOM-42; duplicateOf отсутствует. Поиск «приват»
в проекте вернул SOM-41 и SOM-21, новую задачу не создавали.
Бюджет и юридические ограничения сверены с ADR 0064 и OPEN-QUESTIONS.
Состояния Linear не менялись, комментарии и сообщения людям не отправлялись.

Команды из корня:

```sh
command -v graft
git log -3 --oneline
rg -n 'create table' supabase/migrations/*.sql
rg -n 'references|create policy|grant select' supabase/migrations/*.sql
rg -n 'AsyncStorage|StorageKey|storageKey|sessionStorage' app/src
git diff --check
```

Сопоставлены все создаваемые public/private таблицы migrations с картой;
Auth, инфраструктурные логи/бэкапы и локальные копии отмечены отдельно.
RLS finished-only/owner-only, safe columns, shared client cards и RESTRICT/Auth
ссылки проверены чтением исходников. Это статическая сверка, не SQL runtime.

Проверка относительных Markdown ссылок и перечня таблиц (из корня):

```sh
python3 - <<'PY'
from pathlib import Path
import re
files = list(Path('docs/app/privacy').glob('*.md')) + [
    Path('app/review/som-41-privacy-documents/README.md'),
    Path('docs/app/README.md'), Path('docs/app/ROADMAP.md'), Path('CHANGELOG.md')
]
count = 0
for p in files:
    s = p.read_text()
    links = re.findall(r'\]\(([^)]+)\)', s)
    links += re.findall(r'^\[[^\]]+\]:\s+(\S+)', s, re.M)
    for link in links:
        link = link.split('#', 1)[0].strip('<>')
        if not link or '://' in link or link.startswith('/'):
            continue
        assert (p.parent / link).exists(), (str(p), link)
        count += 1
schema = '\n'.join(p.read_text() for p in Path('supabase/migrations').glob('*.sql'))
tables = set(re.findall(r'create table\s+(?:if not exists\s+)?(?:public|private)\.(\w+)', schema, re.I))
mapping = Path('docs/app/privacy/DATA-LIFECYCLE.md').read_text()
assert all(name in mapping for name in tables), sorted(name for name in tables if name not in mapping)
print('PASS: relative links', count, '; migration tables covered', len(tables))
PY
```

Результат: PASS, 265 относительных ссылок существуют, все 37 таблиц migrations
представлены в карте. Markdown anchors не валидировались автоматом; новые ссылки
на источники используют реальные пути без line/anchor shortcuts.
git diff --check — PASS.

Команды форматирования и обязательной проверки:

```sh
./app/node_modules/.bin/prettier --write docs/app/privacy/*.md app/review/som-41-privacy-documents/README.md
cd app && npm run check
```

npm run check — PASS: typecheck, lint без warnings, format:check,
1307 tests / 131 suites; snapshots 0. Первый запуск до добавления отчёта завершился
с кодом 0; после форматирования отчёта выполнен повторный полный check.
Зелёные unit fixtures не доказывают SQL runtime или native/юридическую приёмку.

## Ограничения и приёмка

Нет Docker/Supabase/browser/iOS/Android. Не запускались SQL reset/lint/pgTAP,
concurrency, native SQLite durability/offline/logout, visual/parity, live cloud
export/delete, проверка региона, бэкапов/восстановления или удалённый CI.
Существующие SQL tests приведены как источники проверок, а не результаты этой сессии.

Не подтверждены оператор/контакты/основания, юридические права/сроки и допустимость
реальных данных вне Казахстана. Документы требуют review специалиста и владельца,
не опубликованы. 7 дней для бэкапов — требование ADR 0064, не доказанная free-tier
настройка. Destructive local purge не выбирался, ADR 0062 сохранён.
Только схема и синтетические unit fixtures; реальные данные и платные сервисы
не использовались. Новые PNG/скриншоты не создавались и не коммитятся.
Экраны не принимались. Эти документы не закрывают export/delete или весь SOM-41.
