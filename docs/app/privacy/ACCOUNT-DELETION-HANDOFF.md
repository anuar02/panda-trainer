# SOM-41 · Передача удаления аккаунта

04.10.2026. Реализованный пакет: [ADR 0103](../decisions/0103-durable-account-deletion-and-local-proof.md),
[отчёт](../../../app/review/01-som-41-account-deletion/README.md).
Продуктовое правило shared/dual role принято владельцем в
[ADR 0101](../decisions/0101-account-deletion-keeps-trainer-history.md);
старый gate на это решение снят. Юридическое одобрение этим не подтверждено.

## Реализовано

- Settings/account → последствия из server inspect → полный известный account-local
  inventory → exact file outcome → acknowledgement → explicit delete → status/recovery.
  Отмена до команды ничего не удаляет. Роль/ownership определяет сервер.
- Проверенный getUser JWT, server-only service/Auth API, service-only SQL RPC.
  Client отвязывается у каждого тренера; trainer удаляет own workspace; dual оба.
  Чужие Auth/profile, карточки, программы, журналы и оплаты сохраняются.
- Child-first SQL cleanup всех current workspace tables, архивов, snapshots,
  bookings/groups/proposals, notes, journals/sets/conflicts/correction audit/receipts,
  attendance/credits/payments/reversals, invitations и private receipts.
  Audit Auth identity → NULL в сохраняемой чужой истории; business values остаются.
  Invitations всех отвязываемых карточек удаляются, старый bearer/card user link
  не возвращает доступ. Служебный deletion receipt сохраняется для восстановления.
- Durable prepare/database_deleted/complete; DB/Auth раздельны. Exact request ID и
  32-byte recovery capability сохраняются в защищённом authStorage до отправки.
  Status/retry после Auth deletion не требуют старого bearer. Capability не входит
  в экспорт/логи; сервер сохраняет только SHA-256. Чужой bearer отклоняется.
- Общий transaction lock + row guards для всех current public/private write tables;
  READ COMMITTED enforced. Scoped private transaction-context для immutable cleanup.
  Перечень FK/данных и preservation markers — pgTAP full fixtures. Row-lock deadlock
  может потребовать exact retry; DDL/TRUNCATE owner-процессы вне app boundary.
- Все account/workspace local rows трёх SQLite DB, включая старые workspace;
  account-scoped AsyncStorage pending/drafts. Неполное чтение блокирует, не означает
  ноль. Pending/rejected/conflicts/corrections/entry drafts/preload recovery не drop.
  Exact bytes/hash/scope/fingerprint+adapter outcome и отдельное acknowledgement.
  Изменение данных обесценивает proof, local export остаётся доступным в recovery.
- Root AsyncStorage inflight fence, сохранённые runner/session shutdown fences,
  SQLite account tombstone для поздних writers и scoped settled-cache cleanup.
  Частичная cleanup возобновляется только по исходным durable proof markers.
  При ошибке/новой записи данные сохранены, не выполняется blanket clear.

## Покрытые writers

SQL statement guard: onboarding/profile/workspace/card/invitation; exercise/template/
program assignment; booking/status/request/proposal; journal preparation/sync/finish/
conflict/correction; attendance/purchase/payment/reversal; notifications/push/private
receipts — все existing public/private ordinary writes, включая service без JWT.
Референсы Auth и workspace проверяет row guard, бизнес-правила этих RPC не заменены.

Local fence: AsyncStorage setItem/removeItem/mergeItem/multiSet/multiRemove/multiMerge
для scoped pending booking/status/proposal/billing/assignment/correction и library
exercise/template storage; семь SQLite journal/outbox/entry/preload tables для всех
connections. Демо и device theme/calm не account-scoped sensitive storage и не clear.
Auth/OTP/PKCE/invitation/recovery secrets исключены из export. Pending invitation
глобален: не объявляется account-owned и не очищается blanket; серверные invite
связи отвязываемых карточек удаляются. Формы уходят с route/auth lifecycle; это
synthetic fence coverage, native shutdown/reopen ещё нужен.

## Проверки и внешние gates

Независимые controller/service/UI/storage tests и server synthetic transport;
full pgTAP fixtures и Auth/concurrency сценарии добавлены в уже запускаемый CI
`supabase/tests/auth_email_smoke.py`. Standalone harness autodiscovery не предполагается.
В контейнере без Docker SQL/Auth не исполнялись. Types дополнены по SQL в формате
генератора; actual generated drift проверяет CI. Deno/native не объявлены проверенными.

Claude/CI: **needs-local-db** — reset/lint/pgTAP, type drift, existing concurrency
список и extended Auth smoke (в том числе partial DB/Auth, old JWT, two concurrent
recovery requests, inflight mutation/prepare). Нет deployment function в пилот ради
проверки. Installed iOS/Android: file cancel/error/share, SQLite crash/WAL/reopen,
logout/relogin/refresh/dismiss и два телефона. Offline/lost device/OS backup cleanup
не доказаны. Downloaded/shared exports — пользовательские копии, не scoped cache.

До реальных данных: специалист подтверждает регион/правовые основания/retention
сохраняемых trainer records и deletion receipt, оператор/контакты, 7-day backup
rotation/restore без возвращения удалённого, logs/access/rotation. Облачное применение,
юрист и реальные Auth revoke остаются внешними. Политика draft, не опубликована.
Экраны/native/accessibility/parity принимает только владелец; SOM-41 целиком и этап
пилота не объявлены принятыми. Pure preflight не разрешает удаление.
