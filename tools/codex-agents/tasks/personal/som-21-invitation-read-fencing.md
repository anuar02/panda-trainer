# SOM-21 · Scoped чтение экрана приглашения тренера

Linear: https://linear.app/something-great/issue/SOM-21

## Контекст

SOM-19/20/21 в базе: приглашения и seven-day issue/revoke/accept готовы как пакет,
owner/native/live gates открыты. Этот бриф выполняется после текущего
som-34-financial-read-session-fencing. Не повторять RPC или UI.
`app/app/workspace/invite/[id].tsx` InvitationManager читает person и latest invitation
прямо mutable Supabase client, доверяет SDK rows, ключ loaded содержит только attempt.
Новая сессия того же пользователя и late response могут сохранить прежнее состояние.
Нужно вынести read transport и защитить чтение/показ scoped текущей авторизацией.

## Критерии

- [ ] Отдельный typed read service/controller для person + latest invitation:
  expected actor/workspace/client UUID и trainer ownership, одна действующая auth
  identity на всех запросах; logout/new login/user switch отменяют результат.
  Refresh той же сессии различается согласно влитому auth контракту; credentials
  не входят в результаты/ключи/логи. Запросы не используют чужую mutable auth.
- [ ] Unknown rows валидируются runtime: client/workspace/ownership связи,
  ID, нужные display fields, даты UTC и nullable accepted/revoked, archive/not-found.
  Invitation принадлежит запрошенному client; добавить scoped selected поля,
  а не доверять filter alone. Latest order created_at,id детерминирован;
  limit(1) здесь intentional latest, не пытаться выдавать полную историю.
- [ ] Read route ключ включает scope/session/attempt; старые данные не видны
  при переключении, retry/late success/error/unmount не публикуют прошлый snapshot.
  Сохраняются тексты, layout, семь дней и current issue/revoke/share/copy callbacks.
  Уже показанная issued link скрывается при смене auth/scope; это display fence,
  issuance/revoke/accept mutation protocol и их policy не менять.
- [ ] Meaningful tests malformed/foreign client/invitation/date, archive/no invitation,
  same-user новая сессия между reads, разные actor/workspace/client, verified refresh,
  late success/error/retry/unmount и исчезновение прежней ссылки.

## Границы

Новый invitations read service/controller/hook, app/app/workspace/invite/[id].tsx
только read/display lifecycle, свои tests/review. Существующие invitations/service.ts
mutation/token/link helpers только читать, не менять. Не менять client invite route,
issue/revoke/accept RPC, pending-intent storage, auth provider, workspace-clients
(work владеет), billing/payments (текущая задача), library (third следующая),
journal/schedule/client-history, SQL/database.types.ts/dependencies.
Shared docs/i18n минимально. Новый read service API не навязывать другим модулям.

Зависимости SOM-19 и invitation base уже влиты; SOM-60 решение закрыто владельцем.
ADR0034 policy и ADR0064 domain не выбирать заново. Ветка
agent/som-21-invitation-read-fencing проверена ls-remote, отсутствует.

## Источники и общие требования

AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md, docs/app/LINEAR-WORKFLOW.md,
docs/app/{README,CONVENTIONS,PROJECT-MEMORY,ROADMAP,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md,
ADR 0007/0034/0061/0066, существующие app/review и tests соответствующего модуля.
Сначала graft map/ask, если недоступен — записать и читать точные пути.
Свежую базу и уже выполненное проверить перед реализацией. Все зависимости ниже
уже влиты; открытые статусы не означают отсутствие кода. Прототип не менять.

- [ ] cd app && npm run check зелёный; meaningful tests, CHANGELOG («Не выпущено»),
  минимальный checkpoint ROADMAP, свой app/review/<имя-брифа>/README.md с командами,
  результатами и непроверенным; ADR при новом подходе с незанятым номером.
- [ ] App без комментариев/any, строки через i18n, без секретов и новых PNG.

Нет Docker/Supabase/браузера/iOS/Android: SQL/RLS/live API/real auth/native/parity
и owner acceptance не объявлять проверенными. Только synthetic fixtures,
без реальных данных клиентов и платных сервисов. Не задавать вопросов,
не менять Linear, scripts/rules/main. Draft PR в agent/<имя-брифа> только
в fix/som-50-template-picker, заголовок с SOM-номером. Экраны принимает владелец.
