# SOM-24 r2 · Verified refresh identity

Дата: 03.10.2026. Только synthetic fixtures.
Ветка: `agent/som-24-assignment-session-fencing-r2`.

Полный пакет сохранённой ветки `origin/agent/som-24-assignment-session-fencing`
(`c1da12b`) перенесён в r2. PR #46 закрыт без слияния; его evidence исторические,
включая выявленный координатором дефект. Свежая база
`origin/fix/som-50-template-picker` — `4d308bc`; merge сообщил Already up to date:
сохранённая ветка уже включает её. SOM-20/SOM-22 read packages и обе стороны
документации сохранены. Последний ADR базы — 0079, assignment ADR — 0080.

`graft` executable и `graft/INDEX.md` отсутствуют; граф не перестраивался.
`tools/codex-agents/SUBAGENTS.md` отсутствует. Три субагента с чистым контекстом:
transport/session helper, hook/storage и независимые behavioral tests.
Ведущий проверил интеграцию, владеет docs и полным check.
Linear project/SOM-24 прочитаны, duplicateOf отсутствует, SOM-24 In Progress;
записи, статусы и комментарии не менялись. Live issue содержит исторический
широкий scope; этот пакет следует конкретному r2 брифу владельца.

## Критерии

- Сделано: immutable JWT sub/session_id identity expected actor, проверка auth
  events и начального getSession race, malformed/missing/mismatched claims
  fail closed. Same-identity refresh разрешён; event name не доказывает identity.
- Сделано: явный RPC Authorization, post-RPC/error/cached-success fence;
  credentials/claims остаются в приватном замыкании и заголовке, без storage,
  payload/key/log/error. Общий auth/read fence только прочитан.
- Сделано: отдельное auth generation и durable user/workspace/client key,
  guarded load/save/clear; late callbacks и unmount не публикуют прежний scope.
  Resume восстанавливает pending, но не запускает RPC автоматически.
- Сделано: pending сохраняет исходные payload/revision/requestId при неизвестном
  исходе. При отмене во время removeItem и ошибке удаления выполняется
  компенсирующее восстановление пустого слота под сериализованным lock.
  Новая команда не перезаписывается; storage failure не выдаёт фиктивный успех.
- Сохранено: conflict/notFound policy, double tap lock, immutable copies и
  create→assign flow. SQL/product policy/dependencies/caller sites не менялись.
- Сделано: synthetic JWT service/hook/storage regressions для different session
  refresh, invalid claims, cache, initial race и normal refresh; прежние tests
  сохранены. Точные свежие команды и результаты ниже.

## Текущие проверки

- `cd app && npm test -- --runTestsByPath tests/workspace-programs.test.ts tests/workspace-program-assignment.test.tsx tests/workspace-program-assignment-service-fence.test.ts tests/workspace-program-assignment-lifecycle-fence.test.tsx` — exit 0, 68 tests / 4 suites (фокусная проверка субагента).
- `cd app && npm run check > /tmp/som24-r2-check.log 2>&1` — exit 0: TypeScript, ESLint, Prettier; 1846 tests / 163 suites, 0 snapshots. Включены existing assignment/editor regressions.
- Доказательство исходного дефекта: временно подставлен только `assignment-session.ts` из `c1da12b`, затем `cd app && npx jest tests/workspace-program-assignment-service-fence.test.ts --runInBand -t "rejects a different session_id refresh"` — exit 1, все 3 новых сценария падают: исходный fence возвращает успех до dispatch / после RPC / из cache в другой session identity. Файл восстановлен через shell EXIT trap; временная версия не коммитилась.
- Та же команда на исправленном файле — exit 0, 3 tests passed / 20 skipped.
- `git diff --check` — exit 0.

Исходные opaque fixtures заменены synthetic JWT для реального auth seam.
Hook tests с реальной assignment session проверяют load/save/RPC/clear callbacks,
ручной replay и отсутствие автоматической отправки. Storage tests используют
in-memory AsyncStorage fixture с настоящим pending module, включая удаление
записи до завершения removeItem await и её восстановление; это не native storage.

## Не проверено / требует одобрения владельца

Docker/Supabase/browser/iOS/Android не запускались. SQL/pgTAP/RLS/live auth,
concurrent receipts, real storage/reopen/crash/native/parity и два устройства
не проверены. Только synthetic fixtures, без реальных клиентов/платных сервисов
и новых PNG. Общий auth, personal client-program read, workspace-library,
workspace-clients, invitations, export, editor, routes и migrations не менялись.

AsyncStorage не даёт транзакцию с auth: восстановление после removeItem
зависит от успешных read/write; crash между delete/restore остаётся непроверенным.
Сериализация защищает только этот JS runtime, не внешние writers или процессы.
Экран и SOM-24 целиком не приняты; требуется одобрение владельца и runtime checks.
[ADR 0082](../../../docs/app/decisions/0082-program-assignment-session-fencing.md).

## Публикация

Implementation commit: `86c97f6`.
`git push -u origin agent/som-24-assignment-session-fencing-r2` — успешно.
`gh pr create --base fix/som-50-template-picker --head agent/som-24-assignment-session-fencing-r2 --draft --fill --title "SOM-24: Verify assignment refresh identity and durable retry r2" --body-file /tmp/som24-r2-pr.md` — успешно.
[Draft PR #49](https://github.com/anuar02/panda-trainer/pull/49): read-back
подтвердил draft/open, base `fix/som-50-template-picker` и r2 head.
После добавления ссылки на PR `cd app && npm run format:check` — exit 0.

## Coordinator integration · 04.10.2026

Fresh base `e26dc30` merged; CHANGELOG/ROADMAP/ADR index preserve both sides.
Assignment ADR renumbered 0082; independent read-only reviewer found no material defects.
`cd app && npm run check` PASS: typecheck/lint/format, 174 suites /1992 tests.
`git diff --check` PASS. SQL/native/real storage/owner acceptance not tested.
