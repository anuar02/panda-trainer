# SOM-24 · Назначение программы: session fence и durable retry

Дата: 03.10.2026. База: `origin/fix/som-50-template-picker`, `90b7f73`.
Ветка: `agent/som-24-assignment-session-fencing`. Только synthetic fixtures.

## Проверка базы и scope

`git fetch origin fix/som-50-template-picker` — успешно;
`git rev-list --left-right --count HEAD...origin/fix/som-50-template-picker`
до правок — `0 0`. Immutable copies, receipts, authenticated assignment и
conditional requestId clear уже присутствовали; повторно не реализованы.
SOM-22 и невлитый SOM-31 r2 не использованы как dependencies.

`graft map` — exit 127, executable отсутствует; граф не перестраивался.
`tools/codex-agents/SUBAGENTS.md` отсутствует. Три субагента получили свежие
узкие контексты и исключительное владение transport, hook и lifecycle tests.
Shared helper, pending, docs, storage regressions, интеграция и общий check — ведущий.

Linear project и SOM-24/SOM-23/SOM-55 прочитаны. SOM-24 и SOM-23 In Progress,
SOM-55 Done; live SOM-24 description старее текущего assignment кода.
Новых задач, комментариев, статусов или project updates не создано.

## Поведение и критерии

- Сделано: фиксированные session/actor, явный Authorization, проверки после
  RPC и перед cached success; late server/transport error не получает terminal
  policy отменённой сессии. Verified TOKEN_REFRESHED сохраняет fence.
- Сделано: auth generation отделена от durable user/workspace/client key;
  token preflight предшествует storage load. Logout скрывает pending/busy/error,
  новый вход восстанавливает команду. Все awaits, retained callbacks, retry,
  scope reuse и unmount ограничены поколением.
- Сделано: pending payload/requestId сохраняется при cancellation/uncertain
  result; retry использует exact revision и исходный requestId. Storage failure
  после server success не вызывает callback; conditional clear защищает новый
  requestId и проверяет актуальность перед удалением в очереди.
- Сохранено: conflict/notFound policy, двойной tap lock, immutable copies и
  create→assign caller flow. SQL/product policy, auth provider, routes,
  workspace-library/clients, editor, dependencies и prototype не изменены.
- Сделано: service/hook/storage synthetic regressions: same-user relogin
  до dispatch, во время session verification/load/save/RPC/clear, late errors,
  other actor/workspace/client, A→B→A, verified refresh, cached success,
  unmount, same-request uncertain retry, remove failure/newer pending, double tap.

## Команды и результаты

- `cd app && npx jest tests/workspace-programs.test.ts tests/workspace-program-assignment-service-fence.test.ts --runInBand`
  — exit 0, 22 tests / 2 suites на промежуточном checkpoint.
- `cd app && npx jest tests/workspace-programs.test.ts tests/workspace-program-assignment-service-fence.test.ts tests/workspace-program-assignment.test.tsx tests/workspace-program-assignment-lifecycle-fence.test.tsx tests/template-editor.test.ts --runInBand`
  — exit 0, 50 tests / 5 suites на промежуточном checkpoint до дополнительных
  session verification/scope/unmount regressions.
- `cd app && npm test -- --runTestsByPath tests/workspace-program-assignment.test.tsx tests/workspace-program-assignment-lifecycle-fence.test.tsx`
  — exit 0, 25 tests / 2 suites (проверка субагента).
- `cd app && npx jest tests/workspace-program-assignment-service-fence.test.ts --runInBand`
  — exit 0, 8 tests / 1 suite.
- `cd app && npm run check` — exit 0: TypeScript, ESLint, Prettier, 1673 tests / 157 suites, 0 snapshots.
  Первый запуск остановился на одном unused-import lint warning в новом тесте;
  импорт удалён, полный check повторён успешно.
- `git diff --check` — exit 0.

## Не проверено / требует одобрения владельца

Нет Docker/Supabase/браузера/iOS/Android: SQL/pgTAP/RLS/live auth, concurrent
receipts, real storage/reopen/crash, native/parity и два устройства не проверены.
Пилотные migrations не тронуты. Реальные данные и платные сервисы не использованы;
новых PNG нет. Сериализация storage относится к текущему JS runtime; уже начатый
removeItem нельзя отменить, но он запускается только после подтверждённого
исхода и актуальной проверки. Late completion не публикуется.

Экран и SOM-24 целиком не приняты: требуется проверка владельца и перечисленные
runtime проверки. Решение: [ADR 0077](../../../docs/app/decisions/0077-program-assignment-session-fencing.md).
