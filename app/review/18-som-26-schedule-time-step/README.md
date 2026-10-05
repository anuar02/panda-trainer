# SOM-26 · Отдельный шаг времени после даты

Дата: 05.10.2026. Ветка: `agent/18-som-26-schedule-time-step`.
База PR: `fix/som-50-template-picker`.

## Изменение и источники

Клиенты → Дата → Время → Программа. На дате используется «Продолжить»,
как раньше; время показывает выбранную дату в существующей ChoiceRow с
ru-подписью «Изменить дату». Строка и предыдущие чипы открывают указанный шаг.
Возврат не меняет поля. При смене даты известное пересечение или недоступный
момент очищает только начало; до явного выбора продолжение блокируется.

Владелец одобрил последовательность 05.10.2026. Эталон оформления сохранён:
`prototype-fresh/index.html`, `js/screens/trainer.js:612–670`,
`review/parity/spec-dark.json`, классы `chip` (44px, Inter 14/20.3,
радиус 9999, padding 8/16) и `row` (padding 14/12, gap 14).
ChoiceRow/EditorChip и их стили не изменены. Reference lock: текущие строки,
чипы, типографика, цвета и кнопки; новый порядок — только из решения владельца.
[ADR](../../../docs/app/decisions/0107-session-date-and-time-steps.md),
[исключение UI-PARITY](../../../docs/app/UI-PARITY.md#5-разрешённые-отклонения).

`rg -n 'CreateSessionScreen|sessionEditor.date' app/src` показал отдельный
`RescheduleSheet`: он не использует компонент/шаги создания, SOM-27 не изменён.
Схема pending, RPC, durable retry, auth/focus fences не меняются. Восстановление
начинается с клиентов и сохраняет дату, начало, длительность, участников,
программу и подтверждение пересечения. Доступность в workspace определяется
через существующий resolveWorkspaceLocalTime и Date.now; окончательные проверки
остаются на сервере. Для демо остаётся существующий getCollisions.

## Команды и результаты

- `graft map`: команда не установлена; `graft/INDEX.md` также отсутствует.
  Live Linear не читался: callable tools Linear в сессии отсутствуют.
  Linear не изменялся.
- `cd app && npm test -- --runTestsByPath tests/session-editor.test.tsx tests/async-create-session-editor.test.tsx tests/workspace-create-session-screen.test.tsx tests/scheduling-flow.test.tsx`:
  первый запуск выявил два старых перехода в тестах auth-релогина; исправлены.
- `cd app && npm test -- --runTestsByPath tests/workspace-create-session-screen.test.tsx tests/session-editor.test.tsx`:
  **2 suites, 24 tests passed**. Порядок, date-only, кнопка продолжения,
  прямой возврат по чипу, возврат по строке даты, сохранение полей и initialDraft,
  очистка при пересечении/прошедшем моменте, время Asia/Almaty.
- Финальный `cd app && npm run check`: **250 suites, 3207 tests passed**;
  typecheck, lint и format:check зелёные.
- Первый `cd app && npm run check`: выявил один трёхшаговый тест создания из
  шаблона (`trainer-template.test.tsx`); добавлен переход даты → времени.
- `cd app && SCREENS=t-new PARITY_OUTPUT=/tmp/som26-parity npm run parity`:
  web-export завершён; capture сначала заблокирован отсутствием root Playwright.
  Инструмент установлен временно в `/tmp/som26-tools`, зависимости проекта не менялись.

- `cd app && LD_LIBRARY_PATH=/tmp/som26-libs/root/usr/lib/aarch64-linux-gnu:/tmp/som26-libs/root/lib/aarch64-linux-gnu NODE_PATH=/tmp/som26-tools/node_modules PLAYWRIGHT_BROWSERS_PATH=/tmp/som26-browsers SCREENS=t-new PARITY_OUTPUT=/tmp/som26-parity node scripts/parity.mjs`:
  **6 prototype captures, 6 app captures; 0 missing route/state comparisons,
  0 app errors**. Стандартный capture показывает начальный шаг;
  empty/loading/offline для t-new — scenarioInvariant, это не проверка
  соответствующих серверных состояний.
- `LD_LIBRARY_PATH=/tmp/som26-libs/root/usr/lib/aarch64-linux-gnu:/tmp/som26-libs/root/lib/aarch64-linux-gnu PLAYWRIGHT_BROWSERS_PATH=/tmp/som26-browsers node /tmp/som26-web.cjs`:
  **passed dark + light, 390×844, deviceScaleFactor 2, reducedMotion reduce**.
  Отдельный browser smoke проверил четыре чипа, отсутствие времени на дате,
  переход кнопкой, подпись даты, прямой возврат на дату, сохранение выбранных
  19:00/75 мин и возврат по строке. 0 page errors.
  `/tmp/som26-web/results.json`, 8 снимков четырёх шагов; пары эталона —
  `/tmp/som26-parity/index.html`. Просмотрены снимки dark date/time и light time:
  существующие стили сохранены, четыре чипа занимают две строки.
  Browser dependencies загружены/распакованы только в `/tmp`;
  системная установка без root недоступна, обойдена локальным LD_LIBRARY_PATH.

## Ограничения и приёмка

- Нативные iOS/Android, максимальный системный шрифт, screen reader и жесты
  не проверены в контейнере.
- Нет live Supabase/Auth, реальных клиентов, SQL/pgTAP или двух устройств.
  Серверные overlap/offline/retry проверяются существующими synthetic suites;
  это не доказательство реального сетевого восстановления.
- Внешний вид и все состояния требуют сравнения и одобрения владельца.
  SOM-26 целиком и экран не объявляются принятыми.
- PNG и другие снимки остаются только в `/tmp`, в git — этот текстовый отчёт.
