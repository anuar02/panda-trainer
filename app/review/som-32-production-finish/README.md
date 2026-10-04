# SOM-32 · Production finish через outbox

Дата: 04.10.2026. Только synthetic fixtures, без реальных данных и платных сервисов.
База: `origin/fix/som-50-template-picker`, `34d4fb38aab586387531d7d9b2923fb8ea64cb5b`.
Ветка: `agent/som-32-production-finish`; implementation commit `3415a62`.
Draft [PR #54](https://github.com/anuar02/panda-trainer/pull/54), base
`fix/som-50-template-picker`. SQL, store API, runner/transport/schema,
preload/entry storage, demo/prototype и маршруты не менялись.

## Реализованный пакет

- Finish конкретного production workout после последовательной очереди entry writes.
  Сводка считает сохранённые sets; draft/previous suggestions не становятся результатами.
  Full завершение напрямую; partial/empty/draft требуют явного подтверждения.
- `OutboxStore.save` атомарно сохраняет projection и исходный finish envelope.
  Повторные нажатия, unknown response, retry и synthetic reopen сохраняют ID,
  payload и base revision; данные и черновики не purged. Ошибка записи не успех.
- Local saved отличается от fresh server finished. Receipt error/conflict/correction
  остаётся отдельным исходом. Ack без доступного нового snapshot не выдаёт applied;
  локальные записанные результаты остаются видимы до свежего server reconcile.
- Latest projection после conflict resolution не перекрывается старым finish marker.
  Latest server revision/remote finish учитываются. Выбор текущей незавершённой
  версии отображается как незавершённый исход, без фиктивной отправки новой команды.
- Actor/workspace/login/token/workout/booking/client guards вокруг async seams;
  переключение участника, logout/relogin и unmount не публикуют поздний результат.
  Три журнала изолированы; ошибка сохранения одного не блокирует другой.
  Поздний старый snapshot не перекрывает уже полученный finished snapshot/cache.
- Attendance/debit/booking status/личная программа не меняются.

## Источники и контекст

Прочитаны root/app AGENTS, Linear guide/workflow, README, CONVENTIONS,
PROJECT-MEMORY, ROADMAP checkpoint, DELIVERY-PLAN, OPEN-QUESTIONS, UI-PARITY,
ADR 0007/0061/0066. Прочитаны `prototype-fresh/js/sheets.js:114` finishConfirm,
`js/store.js:443` progress, `:721` finish, `:779` gap/finalize и CODEX-PLAN §4.
SQL finish/revision/correction contracts прочитаны, не редактировались.

`command -v graft` не нашёл executable; `graft/` и
`tools/codex-agents/SUBAGENTS.md` отсутствуют. Поэтому source context получен
через узкие поиски/чтения; граф build невозможен. Три свежих субагента владели
исключительно domain/service, hook/screen и новыми независимыми тестами;
ведущий выполнил integration review, i18n/docs и полный check.

Live Linear project и SOM-32 с relations прочитаны. SOM-32 — In Progress,
blockedBy SOM-31, duplicateOf отсутствует; поиск существующих journal задач
не выявил duplicate finish issue. Live scope также требует correction/program
update и owner acceptance. Linear не изменялся, сообщения людям не отправлялись.

## Проверки

Команды выполнены из свежей базы в этой сессии:

- `git fetch origin fix/som-50-template-picker` и
  `git merge --ff-only origin/fix/som-50-template-picker` — Already up to date.
- `cd app && npx jest tests/workout-entry-domain.test.ts tests/workout-entry-service.test.ts --runInBand`
  — 2 suites / 29 tests passed (исполнитель domain/service).
- `cd app && npx jest tests/workout-entry-screen.test.tsx tests/workout-entry-hook.test.tsx tests/workout-finish-screen.test.tsx tests/workout-finish-hook.test.tsx --runInBand`
  — 4 suites / 28 tests passed (исполнитель UI).
- `cd app && npx jest tests/workout-finish-domain.test.ts tests/workout-finish-service.test.ts --runInBand`
  — 2 suites / 22 tests passed до дополнительной проверки current resolution.
- `cd app && npm run check` — первый проход: typecheck, lint, format зелёные;
  179 suites / 2052 tests passed; проход после current-resolution fix —
  179 suites / 2055 tests passed. Финальный проход после snapshot guard ниже.
- Финальный `cd app && npm run check` после snapshot guard — exit 0;
  typecheck / lint / format:check passed; 179 suites / 2056 tests passed.
  Новые finish suites: 39 tests (domain/service/hook/screen).
- `git diff --check` — passed.

Новые независимые domain/service/hook/screen tests проверяют full/partial/empty,
draft exclusion, deleted/skipped results, extra sets не закрывают чужой gap,
три участника, double tap, insert/commit failure, порядок sets перед finish,
real runner synthetic lost response/exact replay, latest revision/remote finish,
ack без snapshot, logout/relogin/unmount/participant switch и correction draft.
Существующие entry/preload/sync/demo suites входят в полный check.

## Непроверенное и открытые server contracts

1. Явное применение `workout_correction_drafts`: контракт выбора/применения,
   expected revision, replay/idempotency и конфликт исправлений отсутствуют.
   Receipt остаётся draft, фиктивный applied fix не показан.
2. Selective client program update: контракт выбранных изменений, provenance
   workout/booking snapshot → личная программа, immutable version policy,
   revisions/idempotency отсутствует. `booking_programs.id` не трактуется как
   `client_programs.id`; program mutation или fake success отсутствуют.
3. Не проверены SQL/pgTAP/RLS/live auth, реальный SQLite/storage/crash/reopen,
   браузер/native устройства, два устройства/offline group session, клавиатура,
   доступность, крупный текст, screenshot geometry/theme/state parity и owner approval.
   Docker/Supabase/браузер/native устройства недоступны; snapshots/PNG не добавлялись.
4. Не объявлен завершённым весь SOM-32, этап 5 или экран. Их принимает владелец.

## UI-PARITY checklist

- Тексты finishConfirm перенесены из prototype default; сравнение исходников,
  не визуальная приёмка. Сводка относится к выбранному workout, группы изолированы.
- Используются существующие Button/Sheet/Text и workout measurements; новых токенов нет.
- [ ] Пары prototype/app, порядок/геометрия, цвета/шрифты/иконки, темы/состояния.
- [ ] iOS/Android, accessibility, keyboard, large text/reduced motion.
- [ ] Одобрение владельца.

ADR: [0087](../../../docs/app/decisions/0087-production-workout-finish-outbox.md).
