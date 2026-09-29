# Журнал изменений

Все заметные изменения приложения и его документации. Формат —
[Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — SemVer.
Правила ведения: [docs/app/CONVENTIONS.md](docs/app/CONVENTIONS.md#документация-и-учёт-изменений).

Каждый PR добавляет строку в «Не выпущено» в одну из групп:
Добавлено / Изменено / Исправлено / Удалено / Документация.

## Не выпущено

### Добавлено

- Каркас Expo SDK 57 в отдельном `app/`: восемь вкладок двух ролей, NativeWind,
  светлая/тёмная тема «Чернила», Inter/Montserrat, русская локализация и базовые компоненты.
- TypeScript strict, ESLint без `any`/комментариев/прямого JSX-текста, Prettier,
  48 unit-проверок; CI для приложения, бандлов и локального Supabase.
- Конфигурация Supabase, пустая начальная миграция и pgTAP guard таблиц без RLS.
  [Инструкции запуска](app/README.md), [проверка этапа](app/review/foundation/README.md).
  [PR #17](https://github.com/anuar02/panda-trainer/pull/17).

### Исправлено

- Шторка открывается с первого раза и повторно после закрытия жестом: `dismiss()`
  больше не вызывается до первого `present()` или после завершённого закрытия.
  [PR #17](https://github.com/anuar02/panda-trainer/pull/17).

### Документация

- Handoff по итогам ревью каркаса: исправления, закрытие этапа 1 и старт этапа 2
  ([docs/app/CODEX-STAGE-1-FIXES-HANDOFF.md](docs/app/CODEX-STAGE-1-FIXES-HANDOFF.md)).
- [ADR 0006](docs/app/decisions/0006-app-foundation.md): версии каркаса, тема и проверки.

- План разработки приложения на React Native (Expo) и Supabase: этапы 0–11,
  архитектура, модель данных, правила разработки, отложенные решения
  ([docs/app/](docs/app/README.md)).
- Журнал решений: ADR 0001–0005 (стек, бэкенд, офлайн журнала, вход, маскот).
- Правила учёта изменений: этот файл, PR-шаблон, раздел в `AGENTS.md`.

## История до начала разработки

Прототипы и исследования идентичности велись до 29.09.2026 без этого журнала.
Их история — в [WORKPLAN.md](WORKPLAN.md), [prototype-fresh/README.md](prototype-fresh/README.md)
и `git log`.
