# Журнал изменений

Все заметные изменения приложения и его документации. Формат —
[Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — SemVer.
Правила ведения: [docs/app/CONVENTIONS.md](docs/app/CONVENTIONS.md#документация-и-учёт-изменений).

Каждый PR добавляет строку в «Не выпущено» в одну из групп:
Добавлено / Изменено / Исправлено / Удалено / Документация.

## Не выпущено

- [SOM-22 / draft PR #58](https://github.com/anuar02/panda-trainer/pull/58): create/archive упражнений закреплены за actor/workspace/login; durable input/UUID replay, validated mutation rows и provider/route lifecycle guards защищают от дублей и поздних результатов. Additive grant INSERT(id), SQL archive/history regressions и concurrency handoff; [отчёт](app/review/som-22-library-production-finish/README.md), [ADR 0091](docs/app/decisions/0091-exercise-mutation-session-and-replay.md). SQL/runtime/native и приёмка владельца открыты.

- [SOM-26 / draft PR #57](https://github.com/anuar02/panda-trainer/pull/57): Today/week/create и общий mutation provider сбрасывают selections,
  callbacks и locks при relogin/logout; verified refresh сохраняет сценарий.
  Исправлен повтор save после overlap acknowledgement; default week следует
  workspace clock. [Проверки](app/review/som-26-schedule-production-finish/README.md),
  [ADR 0087](docs/app/decisions/0087-schedule-presentation-session-lifecycle.md).
  SQL/live auth/native/parity и одобрение владельца не проверены.
