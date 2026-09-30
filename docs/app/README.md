# Приложение: документация разработки

Этап разработки начат 29 сентября 2026. Прототипы (`prototype/`, `prototype-fresh/`)
остаются источником сценариев, состояний и визуальных решений. Код из них в
приложение не копируется.

**Стек:** React Native (Expo) + Supabase. Решения: [decisions/](decisions/README.md).

## С чего начать

Сначала [PROJECT-MEMORY.md](PROJECT-MEMORY.md): сохранённые указания владельца
и проверенный handoff Claude. Они действуют между сессиями.

Текущая передача следующему агенту: [CODEX-CONTINUATION-HANDOFF.md](CODEX-CONTINUATION-HANDOFF.md)
— актуальные создание/переносы, карточка клиента, проверки и следующая волна.

1. [ROADMAP.md](ROADMAP.md): этапы, текущий шаг, чек-листы. Раздел «Где остановились»
   сверху — точка входа после перерыва или новой сессии.
2. [ARCHITECTURE.md](ARCHITECTURE.md): устройство приложения, папки, потоки данных.
3. [DATA-MODEL.md](DATA-MODEL.md): таблицы Supabase, права доступа (RLS), инварианты.
4. [CONVENTIONS.md](CONVENTIONS.md): правила кода, веток, коммитов и документации.
5. [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md): отложенные решения и срок, к которому их
   нужно принять.
6. [UI-PARITY.md](UI-PARITY.md): как приложение должно совпасть с прототипом, эталонные
   снимки и замеры, чек-лист для каждого экрана.

## Как отслеживаются изменения

| Что | Где | Когда обновлять |
| --- | --- | --- |
| Что изменилось | [`/CHANGELOG.md`](../../CHANGELOG.md), раздел «Не выпущено» | В каждом PR, меняющем код, схему или документацию |
| Что дальше и что сделано | [ROADMAP.md](ROADMAP.md): чек-листы и «Где остановились» | В каждом PR, закрывающем пункт плана |
| Почему так решили | [decisions/](decisions/README.md): одна запись на решение | Когда выбирается библиотека, подход или меняется правило |
| Что ещё не решено | [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | Когда вопрос появляется или закрывается |
| Как устроено | ARCHITECTURE.md, DATA-MODEL.md, `app/README.md`, `supabase/README.md` | Вместе с изменением устройства |

PR-шаблон `.github/pull_request_template.md` напоминает об этих файлах.

## Источники из прототипа

| Тема | Документ |
| --- | --- |
| Продуктовые правила и границы первой версии | [`trainer-crm-agent-plan.md`](../../trainer-crm-agent-plan.md) §2–§8 |
| Синхронизация, конфликты, офлайн | [`prototype-fresh/SYNC-DESIGN.md`](../../prototype-fresh/SYNC-DESIGN.md) |
| Сценарии и экраны | [`docs/prototype-guide.md`](../prototype-guide.md), [`prototype-fresh/README.md`](../../prototype-fresh/README.md) |
| Цвета, типографика, компоненты | [`docs/design-system.md`](../design-system.md), `prototype-fresh/css/` |
| Маскот | [`design-exploration/MASCOT-DECISION.md`](../../design-exploration/MASCOT-DECISION.md), Rive: `design-exploration/red-panda-rive-2026-09-29/` |
| Исследование с тренерами | `prototype-fresh/research/` |
