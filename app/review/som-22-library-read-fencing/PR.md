## SOM-22 · Полное validated чтение библиотеки и шаблонов

Production read path теперь отклоняет смену входа, повреждённые строки и неполные связи целиком. Одно logical read закрепляет actor/workspace/session и исходный Authorization, проверяет trainer ownership и auth вокруг всех pages/batches/final result. Provider не применяет поздний catalog/reload к новой сессии или запросу; durable draft/pendingSave и retry UUID сохраняются.

## Критерии

- **Сделано:** compatible standalone/combined typed seam, shared session fence, trainer ownership, verified same-session refresh, fail-closed logout/new login/switch; credentials отсутствуют в snapshot/errors/keys.
- **Сделано:** runtime validation unknown exercise/template/line rows, UUID/scope/relations/revisions/enums/nullable fields/arrays/unit bounds; foreign/malformed/duplicate/missing обязательные связи отклоняются целиком. Exact grams/reps/seconds/null/zero сохранены.
- **Сделано:** deterministic bounded pages (500 × 20) и child ID batches (200), explicit readLimit без truncation; search normalization и archived referenced rows сохранены.
- **Сделано:** initial/refresh/reload scope/session/request fencing; retry/unmount/late success/error не публикуют старые server данные и не очищают новый draft. Durable pendingSave/draft и mutation retry UUID сохранены.
- **Сделано:** meaningful synthetic tests >500 exercises/templates, 1200 lines, limits/duplicates/malformed/foreign/units/archived refs/null/zero/session switch/combined/verified refresh и deferred provider races. Existing editing/save/archive/create→assign regressions сохранены.
- **Сделано:** CHANGELOG, минимальный ROADMAP checkpoint, ADR 0078 и текстовый review report; no comments/any, no new deps/PNG.
- **Не проверено:** SQL/pgTAP/RLS/live API/real auth; browser/iOS/Android/native/parity и два устройства. Нет Docker/Supabase/browser/native; только synthetic fixtures, без реальных клиентов и платных сервисов.
- **Требует одобрения владельца:** экраны/owner acceptance; SOM-22 целиком не закрывается этим PR.

## Границы и проверка

Service mutation bodies, draft encoding/storage policy, auth provider, template-editor/domain/UI, workspace-programs и SQL/types/deps не менялись. Прототип не менялся. Linear только прочитан. Незавершённые branches не использовались. Это auth fencing, не транзакционный snapshot нескольких таблиц; concurrent data changes могут потребовать retry.

`cd app && npm run check`: typecheck/lint/format и **1698 tests / 156 suites passed**.

Точные результаты: `app/review/som-22-library-read-fencing/README.md`.
