# SOM-21 · Полный production-сценарий приглашений, повторная публикация r2

Linear: https://linear.app/something-great/issue/SOM-21
Ветка: agent/05-som-21-invitations-production-finish-r2. Заголовок PR с SOM-21.

## Контекст

Целая оставшаяся техническая работа SOM-21: выпуск/перевыпуск/отзыв, приватная ссылка,
ожидание входа и явное принятие с сохранением карточки/истории и нескольких тренеров.
Серверные RPC/receipts и screens уже в базе (ADR0034); правила 7 дней, замена старых
неиспользованных ссылок, один авторизованный держатель и immutable card binding приняты.
Домен утверждён ADR0064: trainer.narutouzumaki.kz, DNS/SMTP/cloud не настраивать.
Mutation service сейчас не закрепляет expected session; old cached result/accept
может вернуться новому login, а late clear должен сохранять новый pending token.
Передано work после его SOM-23 editor. Исходный personal02 имеет OK в summary,
но PR и remote agent ветки нет: код не считается влитым. Исходный бриф сохранён
для аудита. SOM-19/20 server+app в базе. На базе cbd99c9 mutation service всё ещё
вызывает mutable client.rpc после async random без expected session; это доказанный
незакрытый пробел, не повтор исправной реализации. Старые read/production брифы
с OK без PR не prerequisites. Сверить свежую базу и сохранить любые уже влитые
эквивалентные fixes. Одна полная SOM-21, включая read transport/validation нужные
для issue→accept→connections; не дробить на отдельные fencing/read/UI пакеты.
Невлитая SOM-23 не prerequisite invitation API; auth/onboarding уже в базе.

## Критерии

- [ ] Полный сценарий trainer issue/reissue/revoke→copy/share→cold/warm route→login→
  explicit accept→свои connections/history реализован без demo success. Семь дней,
  one-time claim, invalid/expired/revoked и чужая уже связанная карточка нейтральны.
  Server policy/RLS не ослаблять; несколько тренеров не объединять в одну карточку.
- [ ] Все mutations закрепляют caller actor/session и trainer workspace/client scope
  где применимо, JWT sub/session_id, explicit bearer, guards до/после каждого await,
  результата/error/cache. Same-user relogin/logout/switch fail closed, verified refresh
  допустим. Expected identity передавать из caller, не захватывать новую после ожидания.
- [ ] Issuance сохраняет token/requestId exact replay в живой операции при неизвестном
  исходе; revoke ID повторный, accept того же token использует существующий серверный
  replay. Double tap lock; async random token creation/старый finally не заменяют
  новую операцию. Не вводить новое долговременное хранение issued bearer ссылок.
- [ ] Pending deep-link intent сохраняется через вход. Late accept/error/cancel не
  удаляет новый token или новую команду; conditional clear проверяет актуальную
  identity и ожидаемый token. Logout/relogin/unmount не показывает old acceptance,
  не навигирует и не вызывает Share/clipboard от старого completion. Bearer intent
  только в существующем защищённом storage, не в логах/ошибках/аналитике/export.
- [ ] Независимые transport/route/pending/screen regressions полного сценария,
  lost response/replay, reissue/revoke, malformed response/UTC, actor/workspace/session
  races на random/RPC/storage/share awaits, refresh/wrong JWT, late errors/unmount,
  новый pending во время clear. Существующие invitation/read/connection tests зелёные;
  server ownership/one-time concurrency tests сверить и расширить при пробеле.

## Границы

invitations/service.ts mutations/token/link helpers, pending.ts/use-pending-invitation.ts,
новые mutation-specific helpers, app/app/invite/[token].tsx, workspace/invite/[id].tsx
ТОЛЬКО mutation/copy/share callbacks и их lifecycle; invitations/screens.tsx только
необходимый async lock/error. Invitation read transport/display разрешены только для полного сценария SOM-21:
валидация own rows, expected session, late errors, bounded results. Shared
client-history/program/read adapters personal06 не менять; их API сохранить.
Свои tests/review, минимальные docs/i18n. Existing auth provider/storage только читать.
SQL только invitation-specific regression tests/additive fix при доказанном defect.
Не менять workspace-clients/onboarding/library/editor, financial/client-scheduling/
client-home/history/progress/notifications/push (personal), journal/corrections/
export/sync (third), program/history
implementation, deps/prototype/cloud/DNS/SMTP. Один рабочий агент, без субагентов.

## Источники и проверка

Прочитать AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md,
docs/app/LINEAR-WORKFLOW.md, docs/app/{README,CONVENTIONS,DELIVERY-PLAN,
ROADMAP,OPEN-QUESTIONS,PROJECT-MEMORY,UI-PARITY}.md, ADR0007/0061/0064/0066.
Сначала graft map/ask; если executable/граф отсутствует, записать ограничение.
Свежая fix/som-50-template-picker обязательна. Невлитые чужие ветки не зависимости.
Сверить уже сделанное по свежей базе, не переписывать исправные реализации.

- [ ] Meaningful независимые regression tests; cd app && npm run check зелёный.
  SQL при изменении: новые pgTAP/concurrency cases, команды и handoff для CI.
- [ ] CHANGELOG «Не выпущено», минимальный ROADMAP, свой app/review/05-som-21-invitations-production-finish-r2/README.md
  с точными командами, результатами, критериями и ограничениями; ADR при новом
  подходе со свободным номером. App без комментариев/any, пользовательские строки
  через i18n, без секретов и новых PNG. Прототип не менять.

В контейнере нет Docker/Supabase/браузера/нативных устройств: SQL/pgTAP/concurrency,
реальное Auth/SQLite/file/share/crash/reopen, visual/native/accessibility/приёмка
не доказаны mocks. SQL runtime выполняет CI; изменения существующих migrations
запрещены. Если CI требует local DB, оставить needs-local-db для Claude и не вливать.
Экраны/issue принимает владелец. Не задавать вопросов, не менять Linear/scripts/rules/main,
не подключать платные сервисы/реальные данные. PR только agent/* → fix/som-50-template-picker.
