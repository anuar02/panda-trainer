# SOM-24 · Assignment session fencing r2: verified refresh identity

Linear: https://linear.app/something-great/issue/SOM-24

## Причина повторного брифа и отправная точка

PR #46 https://github.com/anuar02/panda-trainer/pull/46 закрыт без слияния.
Начни с сохранённой ветки agent/som-24-assignment-session-fencing:
https://github.com/anuar02/panda-trainer/tree/agent/som-24-assignment-session-fencing
Перенеси полный пакет в новую agent/som-24-assignment-session-fencing-r2,
затем влей свежую fix/som-50-template-picker. Исходный пакет не в базе;
все исходные критерии ниже обязательны. Не ждать закрытого PR.

Независимый review и проверка координатора: assignment-session.ts:37–46
принимает любое TOKEN_REFRESHED того же user и заменяет accessToken, без
JWT sub/session_id проверки. Старый RPC после такого события проходит token()
и может clear pending/onAssigned в другой сессии; cached success также проходит.
Tests используют opaque first-token/refreshed-token, identity не проверяют.
Требуется verified refresh по уже влитому контракту, не только имени auth event.

## Дополнительные обязательные критерии r2

- [ ] Закрепить stable JWT sub/session_id identity до любых async шагов, включая
  начальную getSession гонку с auth event. Subject соответствует expected user.
  TOKEN_REFRESHED с той же identity допускается; другая identity, malformed/missing
  JWT claims и subject mismatch fail closed. Event name не подтверждает identity.
  Credentials/claims не сохраняются в payload/key/log/error. Existing auth fence
  базы только читать; не рефакторить общий auth. Subscription/disposal не утекать.
- [ ] Post-RPC/cached-success и hook load/save/clear callbacks используют ту же
  проверенную identity. Не очистить durable pending и не вызвать onAssigned в
  новой сессии; unknown outcome требует retry прежнего requestId. onInvalidated/
  canResume не должны публиковать stale данные или автоматически запускать RPC.
- [ ] Meaningful service/hook/storage regressions с synthetic JWT: другой session_id
  при TOKEN_REFRESHED до/после RPC/clear/storage await; mismatched sub/malformed
  token; cached success и initial getSession event race; normal refresh с тем же
  session_id/sub проходит. Tests должны воспроизвести исходный defect и проверить
  pending сохранён и callback отсутствует, без ослабления existing regressions.
- [ ] ADR координатором перенумерован 0080, интеграция свежих read PR и обе стороны
  doc conflicts сохранены. Номера сверить по новой базе. Новый review README:
  app/review/som-24-assignment-session-fencing-r2/README.md, старые evidence не
  выдавать за текущие. CHANGELOG/ROADMAP обновить честно.

Границы исходного пакета сохраняются. Personal client-program read не меняет
workspace-programs; work creation/export, personal invitations, third будущий
status/proposal пакет не dependencies. Новая ветка ещё не существует.
Draft PR agent/som-24-assignment-session-fencing-r2 только в
fix/som-50-template-picker, заголовок SOM-24. После r3 повторы запрещены.

## Исходный бриф (с уточнениями r2 выше)

# SOM-24 · Назначение программы: session fence и durable retry

Linear: https://linear.app/something-great/issue/SOM-24

## Контекст

В базе fix/som-50-template-picker уже есть assign_client_program, immutable copies,
request receipts и authenticated assignment UI. SOM-23 код влит; SOM-55 Done:
каждое назначение создаёт новую копию и сохраняет прежние. Новых решений не нужно.
Этот пакет независим от выполняемого SOM-22 library read и невлитого SOM-31 r2.
Проверь свежую базу перед работой, не повторяй уже готовую реализацию.

В workspace-programs/service.ts операция проверяет только expectedUserId перед
RPC и кэширует Promise результата; после RPC авторизация не сверяется.
use-assignment.ts scope содержит user/workspace/client, но не новую сессию того же
user. Поздний ответ может очистить pending и вызвать onAssigned в другой сессии.
Нужно защитить transport, hook и durable retry как единый пакет.

## Критерии

- [ ] Операция закрепляет авторизацию текущей сессии и expected actor; token
  применяется к RPC явно, результат/ошибка публикуются только при актуальной
  identity. Logout/login того же user и switch закрываются; verified token refresh
  сохраняется по уже влитому auth контракту. Кэш успеха не обходит проверку scope.
  Credentials не сохраняются в pending/result/errors/keys/logs.
- [ ] Hook отделяет auth session generation от durable user/workspace/client key.
  Late load/save/RPC/clear/error/retry/unmount не публикуют прежнее состояние или
  callback. Отменённая сессия не запускает новый RPC; не показывать прошлые pending/
  busy/error в новой сессии. Использовать существующий auth seam без общего refactor.
- [ ] Pending payload/requestId сохраняется до подтверждённого исхода. Не удалять
  pending при auth cancellation/неизвестном результате. При reopen/retry использовать
  тот же requestId; receipts обеспечивают один assignment. Conditional clear
  не удаляет более новый pending. Storage failures после server success допускают
  безопасный повтор, без фиктивного успеха или потери команды.
- [ ] Сохранить конфликт/notFound policy, exact expected revision, двойной tap lock,
  старые immutable copies и create→assign flow. Не расширять SQL/product policy.
- [ ] Meaningful service/hook/storage regressions: same-user relogin перед/после
  RPC и storage awaits, other actor/workspace/client, refresh, cached success,
  late errors/unmount, retry с тем же requestId после uncertain success, clear
  failure/newer pending, двойной tap. Existing assignment/editor tests зелёные.

## Разделение работы

Third использует до трёх субагентов по tools/codex-agents/SUBAGENTS.md.
Если файла в базе нет: узкие свежие контексты, исключительное владение файлами.
Ведущий фиксирует auth/operation API; transport — одному, hook lifecycle — второму,
независимые поведенческие tests — третьему. Shared contracts/pending/docs и
интеграция — ведущему; общий npm run check только ведущий.

## Границы

Только app/src/features/workspace-programs/{service,use-assignment,pending}.ts,
новые module-local helpers, свои tests/review и минимальные docs/i18n.
Не менять workspace-library (текущий third пакет), workspace-clients (work),
invitations (personal), billing/payments, account-local-export (work следующий),
journal/preload/sync, client-program read/UI, template-editor, routes, auth provider,
SQL/database.types.ts/dependencies/prototype. Existing auth fence и caller sites
только читать; совместимость публичного hook сохранять. Невлитые ветки не dependency.

## Источники и проверка

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR 0007/0029/0061/0066, существующие auth session fence и account-export,
app/tests/workspace-programs.test.ts, workspace-program-assignment.test.tsx.
Graft map/ask если доступен; иначе зафиксировать отсутствие и читать точные пути.

- [ ] cd app && npm run check зелёный, CHANGELOG «Не выпущено», минимальный ROADMAP,
  app/review/som-24-assignment-session-fencing/README.md с точными командами/результатами;
  ADR при новом подходе с незанятым номером и descriptive filename.
- [ ] App без комментариев/any, строки через i18n, без секретов и новых PNG.

Нет Docker/Supabase/браузера/iOS/Android: SQL/RLS/live auth/concurrent receipts,
реальное storage/reopen/crash/native/parity и приёмка владельца не проверены.
Только synthetic fixtures; платные сервисы и реальные данные запрещены.
Не задавать вопросов, не менять Linear/scripts/rules/main. Draft PR
agent/som-24-assignment-session-fencing только в fix/som-50-template-picker,
заголовок SOM-24. Экраны и SOM-24 целиком принятыми не объявлять.
