# SOM-24 · Личная программа клиента: session-fenced чтение

Linear: https://linear.app/something-great/issue/SOM-24

## Контекст

SOM-23/editor и SOM-24 immutable copies уже в базе, SOM-55 Done. Новых решений нет.
loadLatestClientProgram после чтения проверяет только userId; новая сессия того
же user проходит. use-program key user/client/attempt сохраняет старое значение
после relogin. Пакет защищает чтение личной копии в рамках SOM-24, не создаёт новый
SOM-36 functionality и не зависит от journal. Выполняется после invitation read.
Third сейчас владеет workspace-programs assignment — не менять этот модуль.

## Критерии

- [ ] Один logical read закрепляет expected actor/clientRecord/session identity,
  bearer явно к context/program/lines, guards между pages/перед result/error.
  Logout/same-user relogin/switch fail closed, verified refresh допускается по
  уже влитому auth контракту. Credentials не входят в snapshots/errors/keys.
- [ ] Hook hides/reset при session/client change, отбрасывает late success/error,
  retry/focus/unmount. Layout/text/no-program/not-found semantics и доступ только
  к своей immutable copy сохранены. Public API совместим, auth provider не менять.
- [ ] Сохранить deterministic latest created_at,id и bounded 50 lines контракт;
  runtime validation units/UTC/IDs/revisions/relations/duplicates точная по влитой
  схеме; null/zero lossless, unknown не empty success. Latest limit(1) intentional,
  old program не мутировать; malformed не coercing в допустимую строку.
- [ ] Meaningful tests relogin между context/program/lines/result, refresh, разные
  actor/client, foreign/malformed/duplicate/unit bounds, 25/50/overflow pages,
  no program, late focus/retry/error/unmount и скрытие старых данных. Existing
  client program и assignment tests зелёные.

## Границы

Только app/src/features/client-program/{service,use-program}.ts, новые program-read
module-local helpers/tests, свой review и minimal docs/i18n. Не менять workspace-programs
(third active), client-scheduling/client-history, library/clients/invitations,
routes/screens/UI/auth provider, workspace-scheduling (другие), journal/export/delete,
SQL/types/deps/prototype. Existing helpers только читать, общий refactor не создавать.

## Источники и проверка

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR 0007/0061/0066 и existing tests/review своего модуля. Сначала graft map/ask;
если недоступен — зафиксировать и читать точные пути. Свежая база обязательна,
невлитые ветки не dependencies; продуктовые решения не выбирать заново.

- [ ] cd app && npm run check зелёный; CHANGELOG «Не выпущено», минимальный ROADMAP,
  app/review/som-24-client-program-read-fencing/README.md с точными проверками и ограничениями. При новом подходе
  ADR с незанятым номером и descriptive filename.
- [ ] App без комментариев/any, строки через i18n, без секретов/новых PNG.

Нет Docker/Supabase/браузера/устройств: SQL/RLS/live auth/native/parity/реальное
storage crash и owner acceptance не проверены. Только synthetic fixtures,
без реальных данных клиентов/платных сервисов. Не задавать вопросов, не менять
Linear/scripts/rules/main. Draft PR agent/som-24-client-program-read-fencing только в fix/som-50-template-picker,
заголовок SOM-24. Экраны и весь issue принимает владелец.
