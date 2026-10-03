# SOM-34 · Financial read session fencing

Дата: 03.10.2026. Только synthetic fixtures; реальные клиентские данные,
платные сервисы и новые PNG не использовались.

## База и контекст

- `graft map`: exit 127, graft отсутствует. Использованы точные пути брифа,
  локальные инструкции, ADR 0007/0059/0061/0066/0074 и актуальные исходники.
  `graft build` не запускался по той же причине.
- `git fetch origin`: успешно. Начальная база `96db40a`;
  `git rev-list --left-right --count HEAD...origin/fix/som-50-template-picker`:
  `0 0`. Ветка `agent/som-34-financial-read-session-fencing`.
- Live Linear project trainerApp и SOM-34 прочитаны без изменений: In Progress,
  зависит от SOM-33, блокирует SOM-47/SOM-36, duplicateOf отсутствует. Новые задачи,
  комментарии, project updates и сообщения не создавались.
- Capped payments, reversal history и totals ADR0059 присутствуют в базе.
  Mutation части сохранены. Отдельный auth identity contract из брифа в этой
  базе отсутствует; локальное решение и ограничение описаны в ADR 0077.

## Сделано

- Оба read services: lifecycle подписка до auth, expected actor и скопированный
  workspace/client, одна авторизация всех страниц, guard до/после страницы и
  непосредственно перед публикацией. Logout/new session/switch fail closed;
  refresh с тем же JWT session_id не считается новым входом.
- Hooks: смена сессии очищает snapshot, включая same-user relogin. Epoch/key/active
  отбрасывают late success/error, устаревший retry, scope switch и unmount.
- Exact count, 500 строк/page, предел 10 000/table, duplicate ID detection,
  runtime и scoped relation integrity. Missing grant/parent, неполное чтение и
  ошибочная reversal relation не превращаются в нулевой баланс.
- Точные money strings и domain totals/reversal projection сохранены; UI,
  commands/storage/mutation types, auth/export/deletion, SQL и зависимости
  не менялись.

## Проверки

- На исходной базе `96db40a`: `cd app && npm run check` — exit 0,
  typecheck/lint/format и 153 suites / 1611 tests прошли.
- Перед публикацией `git fetch origin` нашёл SOM-26/SOM-35; rebase выполнен на
  `90b7f73`. Конфликты только CHANGELOG/ROADMAP разрешены сохранением обеих
  записей; ADR перенумерован в 0077. Стабильный JWT session_id соответствует
  свежему локальному контракту SOM-26, без импорта/изменения scheduling/auth.
- На финальной базе `90b7f73`: `cd app && npm run check` — exit 0.
  TypeScript strict, ESLint (0 warnings), Prettier и Jest:
  **157 suites / 1691 tests passed**, 0 snapshots (31.378 s — Jest).
- `git diff --check` — exit 0.
- Новые fixtures проверяют оба сервиса: смену сессии между pages и на финальном
  getSession, same-user relogin, logout, refresh без смены идентичности, единый
  bearer, 501 строк, count drift/truncation/missing/oversize/limit, case-insensitive
  duplicates, malformed identity, отсутствующий grant и foreign relation parents.
  Hook fixtures проверяют обе features: очищение данных, late success/error,
  устаревший retry, retry без смены session, scope switch, unmount и StrictMode.
- В полном check прошли существующие billing/payments domain, commands, storage,
  панели/attendance, capped payment и reversal/totals регрессии ADR 0059.
- `gh api repos/anuar02/panda-trainer --jq .full_name` (timeout 20) — exit 124;
  `curl -I --max-time 12 https://api.github.com` и вариант `--noproxy '*'` —
  exit 28, 0 bytes. Публикация PR ещё не подтверждена; git transport работает.

## Не проверено / требует владельца

SQL/pgTAP/RLS, пилотный Supabase, live auth/JWT refresh, сеть с реальным сервером,
Docker, browser, native устройства и визуальный паритет не запускались.
Не подтверждены экраны, весь SOM-34 и production acceptance.
Владелец принимает экраны и issue; draft PR предоставляет код и synthetic evidence.
