# SOM-20 · Чтение списка и карточки клиентов тренера

Дата: 03.10.2026. Только synthetic fixtures, без реальных данных и платных сервисов.
База после `git fetch origin`: `fix/som-50-template-picker` =
`96db40a393f74b659c973853a6112adbd393a02c`; рабочая ветка
`agent/som-20-trainer-client-read-fencing` начиналась с этой базы, дерево было чистое.
На базе уже присутствовали onboarding/clients, приглашения, immutable programs,
базовое расписание, billing и account-export fencing; переписывались только reads.

## Ограничения среды и источники

`graft map` → `/bin/bash: graft: command not found` (exit 127). Graph context и
`graft build` недоступны; использованы точные файлы из брифа и узкие fallback reads.
Callable Linear API в этой сессии отсутствует. Live issue/project/status/duplicates
не обновлены чтением; roadmap mapping изучен локально. Linear не изменялся,
комментарии/project updates/сообщения людям не отправлялись.
Прочитаны root/app AGENTS, Linear guide/workflow, README, CONVENTIONS, PROJECT-MEMORY,
checkpoint ROADMAP, DELIVERY-PLAN, OPEN-QUESTIONS, UI-PARITY, ADR 0007/0061/0066.
Account-export и auth изучались только для read-fencing контракта.

## Критерии

| Критерий | Результат |
| --- | --- |
| UUID actor/workspace/client и доступный trainer scope | Сделано: ожидаемый actor/token для routes, owner query перед клиентскими reads; legacy wrapper безопасно фиксирует текущий actor |
| Один auth logical read | Сделано: фиксированный bearer всех запросов, guards между pages/reads и перед возвратом; sticky logout/user/new-token cancellation, refresh event отличается от новой сессии |
| Полная bounded deterministic pagination | Сделано: exact count, page 200, max 10000 каждой коллекции; cap/count/duplicate/order error вместо partial success |
| Unknown runtime rows | Сделано: safe projections, UUID/workspace/relations/revisions/enums/UTC/intervals/planned units/null/zero; malformed/foreign/duplicate fail closed |
| Последняя программа, ближайшее занятие, order карточки | Сделано: timestamp + ID tie-breakers, карточка sessions DESC, упражнения position ASC |
| Архив и missing | Сделано: архив скрыт; archived/not-found details остаются `null`; архивные родительские ID допускают собственные связи списка |
| Retry/unmount/scope/session lifecycle | Сделано: локальный controller/hook, late success/error подавляются, старое ready сразу очищается; auth subscription также очищает уже показанный результат |
| Add/invite/program/purchase и создание занятия | Сохранены существующие callbacks/commands; scheduling caller не менялся, wrapper совместим; purchase regression проверена |
| Документация подхода | [ADR 0075](../../../docs/app/decisions/0075-trainer-client-read-fencing.md), CHANGELOG и минимальный checkpoint ROADMAP |
| SQL/RLS/live auth/native/visual parity | Не проверено |
| Приёмка экранов и всего SOM-20 | Требует одобрения владельца |

## Проверки

Первый targeted запуск обнаружил отсутствующий Jest mock native auth crypto в
purchase-route regression; исправлен mock auth client в своём test-файле.
Первый полный check остановился на неиспользуемом test import; import удалён.
Ошибки TypeScript тестовых fixtures/props исправлены до итоговой проверки.

- `cd app && npx jest --runInBand workspace-client-details-service workspace-client-purchases-route workspace-client-read-controller workspace-client-read-hook` — 52 tests / 4 suites, зелёный промежуточный запуск.
- `cd app && npx jest --runInBand workspace-client-read-routes` — 6 tests / 1 suite, зелёный промежуточный запуск.
- `cd app && npm run check` — итог: TypeScript strict, ESLint (0 warnings), Prettier и все 1628 tests / 154 suites зелёные.
- `git diff --check` — зелёный.
- `git fetch origin` — успешно; указанная база проверена.

После промежуточных targeted runs дополнены boundary/count/projection tests;
они входят в итоговый полный check.

Synthetic coverage: 601 clients/programs/bookings в list; 501 programs/bookings
в details; hostile 501 exercises проходят 3 pages и fail closed на повторе position (модель имеет только positions 0…49);
полный успех ровно на 10000 clients, лимит >10000 для каждой коллекции; duplicates
на границе pages, короткие страницы, изменяющийся count, malformed после 500 rows;
invalid/foreign rows/relations, calendar UTC, intervals, null/zero/ranges;
logout/user/same-user session switch и silent token switch между reads;
logout+возврат старой сессии между pages; refresh сохраняет первоначальный bearer.
Controller/hook/routes проверяют late success/error/retry, scope revisit, unmount,
очистку показанных данных, not-found и сохранение purchase UI callbacks.

## Не запускалось и практические пределы

Docker/Supabase, SQL/pgTAP/RLS, реальные auth/session/network и server row-cap
конфигурация не проверялись. Browser/devices/native runtime, visual screenshots,
темы/крупный текст/parity и приёмка владельца не выполнялись. Новые PNG не добавлены.
HTTP pages не дают repeatable-read DB snapshot; одинаковый count не доказывает
отсутствие конкурентных equal-count изменений. Base-template/exercise ID проверяются
как UUID snapshot links; live library/FK/RLS не перечитываются и не проверены.
Archived client IDs учитываются для связи, затем архив исключается из списка.
`created_by` не загружается и возвращается `null` только для совместимого client DTO.
Refresh может оставить исходный bearer истёкшим — тогда весь read даст error/retry.
Завершение synthetic checks не закрывает SOM-20 и не означает принятие экранов.
