# SOM-34 · financial command session fence / durable retry

Дата: 04.10.2026. Один агент; только synthetic fixtures.
[Draft PR #53](https://github.com/anuar02/panda-trainer/pull/53); implementation commit `19f3087`.
Ветка:
`agent/som-34-financial-command-session-fencing`; draft PR предназначен только
для `fix/som-50-template-picker`. Исходная база `9b6d8b7`, перед финальной
проверкой обновлена fast-forward до `34d4fb3`, включая client-program read PR48.
Невлитые ветки не использовались. Финансовый пакет не зависит от SOM-31 DB.
[Решение](../../../docs/app/decisions/0084-financial-command-session-fencing.md).

## Контекст и границы

Прочитаны root/app AGENTS, Linear guide/workflow, README, CONVENTIONS,
PROJECT-MEMORY, ROADMAP, DELIVERY-PLAN, OPEN-QUESTIONS, UI-PARITY, ADR0007/0061/0066
и financial read ADR0077. Live Linear project/SOM-34/SOM-33 прочитаны, выполнен
поиск существующих payment issues: SOM-34 In Progress, SOM-33 In Review,
SOM-47 Backlog; duplicateOf отсутствует. Более узкий scope — текущий бриф.
Linear не изменялся, комментарии/сообщения людям не отправлялись.

`command -v graft` не нашёл CLI; `graft/INDEX.md` отсутствует. Map/ask/build
недоступны; использованы точные feature/test/contract пути, ограничение graph
зафиксировано здесь. SQL контракты прочитаны, не изменены:
`20261003090000_attendance_credit_ledger.sql`,
`20261003110000_payment_commands.sql` и действующие capped-payment contracts.

Изменены финансовые commands/storage/use-commands, mutation portion billing
service и module-local helpers. Payment mutation implementation перенесён
из commands.ts в mutations.ts и экспортируется service; commands.ts —
совместимый facade для старых imports. В financial integration tests обновлены
synthetic auth fixtures, включая workspace-mutation-provider test; scheduling
production code не изменён. PR43 read portions/helpers/hooks, UI/domain money,
SQL/database types/deps/auth provider и остальные features не изменены.
Нет новых PNG, комментариев/any в добавленном app code, секретов или клиентских
данных. Новых UI строк нет; используется существующий i18n error contract.

## Реализовано

- [x] Синхронный захват actor/workspace и auth lifecycle до первого await;
  JWT structure/sub/session_id согласованы с getSession. Logout, relogin того же
  user, account switch, mismatch и malformed refresh fail closed. Штатный refresh
  с той же identity разрешён; название auth event не заменяет проверку claims.
- [x] Все восемь RPC: explicit bearer, guards до dispatch и после result/error.
  Standalone services поддерживают optional workspace fence; legacy target IDs
  и public imports сохранены. JWT signature/RLS проверяет сервер, не decoder.
- [x] Hook epoch скрывает старые pending/busy/errors, блокирует late callbacks,
  reload/resume/unmount; double tap lock и scoped result validation сохранены.
- [x] Durable key/payload/requestId прежние. Storage awaits и ошибки fenced,
  unknown outcome сохраняется; clear не удаляет newer pending. Terminal policy
  conflict/invalidState/overpayment действует только в актуальной сессии.
- [x] Failed/cancelled remove и отмена финального command/hook result guard восстанавливают
  прежний request в пустой key. Success + clear failure повторяется с прежним ID.
- [x] Money — exact integer strings. Capped payment/reversal, attendance/debit
  и explicit late-cancellation reason/policy сохранены.

## Проверки

Команды выполнялись из корня, кроме явно указанного `cd app`.

| Команда | Результат |
| --- | --- |
| `git fetch origin fix/som-50-template-picker` + `git merge --ff-only origin/fix/som-50-template-picker` | свежая база `34d4fb3`; локальный пакет возвращён из task stash без конфликтов |
| `cd app && npm test -- --runTestsByPath tests/trainer-billing-commands.test.ts --silent` до исправления | 6 новых ожидаемых failures: поздние terminal/success/save/clear; подтверждён исходный дефект |
| `cd app && npm test -- --runTestsByPath tests/trainer-billing-command-session-hooks.test.ts --silent` до hook fix | 5 ожидаемых failures same-user relogin/late load; unmount тест уже проходил |
| Storage/final-clear/JWT-structure/initial-refresh red phases теми же targeted командами | подтверждены потеря pending после remove/final guard, принятие malformed JWT segments и отказ штатного bootstrap refresh; после исправлений зелёные |
| `cd app && npm test -- --runTestsByPath tests/financial-command-receipt-retry.test.ts --silent` | 4 passed: реальные app submit/service/storage, synthetic purchase/debit/payment/reversal receipts |
| `cd app && npm run check` | зелёный: typecheck + lint (0 warnings) + format + 178 suites / 2107 tests |
| `git diff --check` | зелёный |

Новые regressions охватывают initial auth wait, RPC success/error/throw,
TOKEN_REFRESHED actor/sub/session mismatch, отсутствие claims/malformed segments,
silent getSession mismatch (включая terminal post-RPC reload без auth event),
normal initial/runtime refresh, scope actor/workspace,
late storage errors, save/clear/final guard, newer pending, retry/unmount/double tap
и terminal policy. Synthetic receipt harness моделирует потерянный ответ,
relogin/reopen, clear failure и повтор прежнего wire request три раза с одним
receipt. Это доказательство app request-ID/replay contract, не запуск серверной
идемпотентности. Полный check включает existing financial reads/mutations/domain
и остальные тесты приложения. Первичный полный test на старой базе выявил четыре
fixture suites: hooks, provider, reversal recovery, snapshot native import;
исправлены только их synthetic fixtures/mocks для нового auth boundary.
Первый check на свежей базе остановился на TypeScript-ошибке моей перестановки
import в snapshot test fixture; fixture восстановлен и проверка повторена.
После зелёного check добавлены два hook regression для silent session mismatch
и сохранения команды при result-guard cancellation; финальный check повторён.
Проверено сравнением с базой: service read portions и payment types/input/result
validation/policy после relocation byte-identical; read helpers/hooks не менялись.

## Не проверено / требует владельца

- [ ] Docker/Supabase SQL/pgTAP/RLS, live JWT/auth/refresh, реальные bearer запросы
  и конкуренция двух устройств: не запускалось.
- [ ] Real AsyncStorage/reopen/crash, постоянная ошибка storage и process death
  между remove и условным восстановлением: не проверено. Serialization — один
  JS runtime; cross-process CAS не предоставляется AsyncStorage.
- [ ] Browser/native devices, prototype parity, темы/состояния, accessibility,
  owner acceptance экранов и всего SOM-34: не проверено / требует владельца.

UI и продуктовая политика не меняются. Экраны и issue не объявлены принятыми;
synthetic tests и draft PR не являются owner acceptance.
