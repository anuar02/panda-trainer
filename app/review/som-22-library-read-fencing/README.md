# SOM-22 · Полное validated чтение библиотеки и шаблонов

Дата: 03.10.2026. База: `90b7f73`, свежая `origin/fix/som-50-template-picker`.
Ветка: `agent/som-22-library-read-fencing`. Незавершённые agent branches не читались.

## Реализация и критерии

- Сделано: shared logical read actor/workspace/session fence, trainer ownership,
  auth до/после страниц, batches и результата, исходный Authorization header.
  Same-session verified TOKEN_REFRESHED разрешён; silent token replacement,
  logout/new login и чужой actor отклоняются. Секреты отсутствуют в snapshot,
  ошибках и storage keys. Existing standalone API сохраняет optional typed scope.
- Сделано: unknown runtime validation exercise/template/line rows и обязательных
  связей; UUID/scope/revision/date/enum/nullable fields/массивы/SQL unit bounds.
  Foreign, malformed, duplicate, missing и несогласованные units отклоняют
  результат целиком; неизвестная measure не становится reps.
- Сделано: deterministic страницы по 500, максимум 20, ID batches по 200;
  полная последняя разрешённая страница — readLimit, без partial success.
  Порядок RPC name_normalized/id, templates name/id, lines template_id/position/id,
  referenced exercises id. Search normalization остаётся у существующего RPC.
  Archived referenced rows, исходные reps/seconds strings, null/zero и граммы сохранены.
- Сделано: provider initial/refresh/reload применяются только своей
  scope/session/request generation; retry/unmount/late success/error не
  публикуют прежние server данные. Auth invalidation скрывает catalog и visible
  draft; durable draft/pendingSave не удаляются, retry request UUID сохраняется.
  Старое сохранение не очищает draft после смены сессии.
- Сделано: synthetic behavioral tests для 501 exercises/templates, 1200 lines,
  malformed/foreign/duplicates/limits, archived references, exact units,
  page/combined session switch, verified refresh и provider deferred races.
  Existing editing/save/archive/create→assign regressions сохранены.

Service mutation bodies, draft encoding/storage policy, auth provider,
workspace-programs/template-editor/UI, SQL/types/deps и прототип не менялись.
Обоснование: [ADR 0077](../../../docs/app/decisions/0077-validated-session-fenced-library-reads.md).
Это auth fencing, не транзакционный snapshot данных нескольких таблиц.
Существующий mutation lock сохраняется до завершения исходной операции.

## Проверки

Команды из `/home/node/repo/app`:

- `npx jest tests/workspace-library.test.ts tests/workspace-library-read.test.ts --runInBand`
  — 50 tests / 2 suites passed.
- `npx jest tests/workspace-template-context.test.tsx tests/workspace-program-assignment.test.tsx tests/template-editor.test.tsx tests/template-provider.test.tsx --runInBand`
  — 26 tests / 4 suites passed.
- `npx jest tests/workspace-library-provider.test.tsx --runInBand`
  — 16 tests / 1 suite passed.
- `npm run check` — первоначальный запуск обнаружил TS2554 в новом test rerender;
  исправлено. Следующий запуск обнаружил hook lint ошибки; исправлено без suppressions.
  Финальный check: typecheck, ESLint, Prettier и 1698 tests / 156 suites passed.

- `npm run typecheck && npx jest tests/workspace-library.test.ts tests/workspace-library-read.test.ts tests/workspace-library-provider.test.tsx --runInBand`
  — финальное подтверждение после integration: typecheck и 66 tests / 3 suites passed.

Из корня: `git fetch origin fix/som-50-template-picker`,
`git rev-parse HEAD origin/fix/som-50-template-picker` — оба `90b7f73`;
`git ls-remote --heads origin agent/som-22-library-read-fencing` — ветка отсутствовала;
`git diff --check` — без ошибок.
Service mutation section сравнен с HEAD: byte-for-byte без изменений.

`graft` не установлен; `graft/INDEX.md` и
`tools/codex-agents/SUBAGENTS.md` отсутствуют в базе. Применён fallback:
точные пути брифа, свежие узкие контексты, исключительное владение файлов.
Live Linear SOM-22/project прочитаны; issue In Progress, duplicateOf null,
SOM-18 prerequisite и SOM-23 relation сверены с уже влитым кодом.
Linear не изменялся, сообщения людям не отправлялись.

## Не проверено / требует одобрения владельца

SQL/pgTAP/RLS/live API/real auth не запускались: Docker/Supabase отсутствуют.
Browser/iOS/Android/native/parity, два устройства и owner acceptance не
выполнялись. Только synthetic fixtures, без реальных клиентов и платных сервисов.
Новые PNG не добавлялись. Экраны и SOM-22 целиком не объявлены принятыми.
