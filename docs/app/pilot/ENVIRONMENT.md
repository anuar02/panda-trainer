# SOM-40 · Отдельное пилотное окружение

03.10.2026. Проверяемая подготовка, **не созданное окружение и не приёмка пилота**.
Основание: [ADR 0064](../decisions/0064-pilot-data-region-retention-and-invites.md),
[ADR 0067](../decisions/0067-free-tier-pilot-budget.md),
[ADR 0070](../decisions/0070-public-pilot-preflight-and-remote-evidence.md).
База пакета: `08f0251`, `fix/som-50-template-picker`.

## Локальный preflight

Из корня скопировать [template](../../../tools/pilot-config/template.json) в public
JSON вне repo, заполнить реальные public refs/URLs облачных dev и pilot и выполнить:

```sh
node tools/pilot-config/validate.mjs /tmp/trainer-pilot-public.json
node --test tools/pilot-config/validate.test.mjs
```

Не подставлять secrets. Template с пустыми идентификаторами должен дать exit 1.
Exit 0 означает только согласованность заявленных значений. CLI не соединяется
с облаком, не доказывает регион через URL, не проверяет существование проекта,
не читает env/credential stores и не выполняет mutations.
Интерфейс и ограничения: [README](../../../tools/pilot-config/README.md).
`databaseRegion=eu-central-1` — намерение выбрать Frankfurt, не remote evidence.

## Воспроизводимый handoff создания проекта

Следующие шаги выполняет владелец/уполномоченный оператор в своих аккаунтах
после отдельного разрешения на создание и deployment. Здесь они не выполнялись.

1. В Supabase dashboard проверить выбранную organization и **Free** plan.
   Зафиксировать public ref/URL существующего cloud dev. Если dev ещё нет —
   оставить placeholders, local validation не должна проходить.
2. Создать новый отдельный проект `<PILOT_PROJECT_NAME>` с **конкретным** регионом
   Central EU (Frankfurt), `eu-central-1`. Не полагаться на общий Europe/default
   region selector. Новый DB password сохранить только в password manager.
3. Оставить Supabase Free: без Pro, PITR, paid compute/add-ons, custom API domain,
   read replicas и paid log drains. API — `https://<PILOT_PROJECT_REF>.supabase.co`.
   Перед подтверждением проверить отсутствие платежей и доступную Free project quota;
   если quota исчерпана — остановить создание, не апгрейдить и не удалять чужой проект.
4. Сохранить sanitized dashboard evidence: дата UTC, public ref, region label/code,
   plan, reviewer. Сравнить с dev ref/URL, заполнить public manifest и запустить CLI.
   Ref/URL не содержит региона: его подтверждает dashboard project infrastructure
   либо read-only Management API metadata с полем region (credentials только у оператора).
5. До схемы убедиться, что в новом проекте нет trainer/client/auth пользовательских
   данных. Пилот чистый: никаких экспортов PR #29, prototype localStorage или seed.

## Schema deployment существующими migrations

Handoff оператору, **не команды запуска в этой сессии**. CLI `2.118.0` закреплён
в `app/package.json`; `npm run db` работает с repo root через `--workdir ..`.
Использовать отдельный checkout согласованного commit, не рабочий dev checkout:
link сохраняет локальное состояние выбранного проекта. Сначала локально выполнить
`cd app && npm ci && npm run check`. Авторизация Supabase и DB password — через
защищённый интерактивный ввод/approved secret store, без secrets в shell history,
PR или логах. Из `app/`:

```sh
npm run db -- link --project-ref <PILOT_PROJECT_REF>
npm run db -- migration list --linked
npm run db -- db push --linked --skip-vault --dry-run
```

Перед записью дважды сравнить linked ref с manifest и dashboard, проверить dry-run:
только существующие `supabase/migrations/`, полный упорядоченный список и согласованный
commit. Если remote история не соответствует чистому проекту — остановиться,
не выполнять repair/reset или `--include-all` автоматически. После разрешения
оператору на применение именно этого плана:

```sh
npm run db -- db push --linked --skip-vault
npm run db -- migration list --linked
```

**Без `--include-seed`, `db reset`, `seed run`, prototype import, data restore**.
`supabase/config.toml` включает local seed, поэтому его reset/start workflow не является
процедурой чистого пилота. Migrations содержат справочный starter exercise catalog:
это нужные данные продукта, не импорт клиентов/занятий прототипа.
`--skip-vault` исключает синхронизацию Vault secrets из local config: применяется
только план migrations. Флаг сверён по help закреплённого CLI 2.118.0.
Новый cloud Auth не настраивается автоматически через `db push`.
Не запускать `config push`: local URLs, Mailpit и local provider settings не pilot.

После применения сравнить migration history, провести безопасный schema/RLS review
и синтетические smoke checks, сохраняя только обезличенные результаты.
SQL/pgTAP, CLI Docker-dependent операции и drift не проверены этим пакетом;
`.github/workflows/app.yml` поднимает локальный Supabase с seed для тестов,
не деплоит пилот. Не запускать production workflow и не считать локальный CI
доказательством remote deployment.

## Public env и server Secrets

| Значение | Где передаётся | Правило |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | pilot build env | Только pilot HTTPS URL; dev build — отдельный dev URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | pilot build env | Public anon key этого проекта, ограниченный RLS; не service role |
| `EXPO_PUBLIC_INVITATION_BASE_URL` | pilot build env | `https://trainer.narutouzumaki.kz`, без `/invite`, query/token |
| DB password/connection, Supabase access token, service role | password manager / server CI Secrets при отдельной настройке | Никогда `EXPO_PUBLIC_*`, public manifest или client bundle |
| SMTP password/API credential, Apple private key, OAuth client secret | Supabase/provider dashboards server secrets | Не app env, git и verification logs |

Это mapping действующего `app/.env.example`, `features/auth/client.ts` и
`features/invitations/service.ts`; существующие env/config файлы не изменяются.
Preflight намеренно не принимает ключи, даже public anon key. Pilot build environment
ещё не создан. После установки синтетически проверить фактический target project;
случайная dev сборка не становится pilot от одного manifest.

## Invite Pages и DNS

[ADR 0064](../decisions/0064-pilot-data-region-retention-and-invites.md) задаёт
Cloudflare Pages Free и только `trainer.narutouzumaki.kz`. В repo нет готового Pages
deployment config. `.github/workflows/app.yml` делает Expo static export как проверку,
не Pages deploy. `<PAGES_PROJECT_NAME>`, `<PAGES_PROJECT>.pages.dev`, build source,
output directory и account IDs остаются placeholders до отдельного handoff реализации.

Оператор сначала добавляет custom domain в dashboard **отдельного invite Pages
проекта**, затем согласует CNAME `trainer` → `<PAGES_PROJECT>.pages.dev` и TLS
в существующей Cloudflare зоне. Не заменять apex `narutouzumaki.kz`, его DNS,
домен/маршруты прототипа или существующий Pages project другого продукта.
Не создавать `invite.trainer…`. Перед публикацией проверить маршруты
`/invite/<synthetic-token>`, fallback, отсутствие токена в логах/analytics и обработку
невалидных/истёкших приглашений. Synthetic token не должен попадать в общий отчёт.

Для universal/app links нужны `/.well-known/apple-app-site-association` и
`/.well-known/assetlinks.json`, реальные `<APPLE_TEAM_ID>`, `<IOS_BUNDLE_ID>`,
`<ANDROID_PACKAGE_NAME>`, `<ANDROID_SIGNING_SHA256>` и native associated domains /
intent filters. Их нет в текущем `app/app.json`; в пакете они не добавляются.
Нужны отдельная реализация и installed release tests iOS/Android (включая fallback
без приложения). **Рабочий HTTPS deep link не обещан**; существующий custom scheme
сам по себе не доказывает universal links.

## SMTP, OAuth и Auth redirects

Сохраняем [ADR 0004](../decisions/0004-auth.md) и действующий
`supabase/config.toml`: e-mail шестизначный OTP, expiry 3600s, signup и confirmations
включены, anonymous sign-in выключен; SMS/password login не вводятся.
Email templates magic_link/confirmation — `supabase/templates/email-code.html`
с `{{ .Token }}`. В dashboard оператор переносит эти templates и согласованные
Auth settings; не заменяет код magic link и не снижает rate/security policy.

SMTP provider `<FREE_SMTP_PROVIDER>` ещё не выбран (Resend в ADR — пример).
В dashboard Free SMTP подтвердить sender `no-reply@trainer.narutouzumaki.kz`,
внести выданные provider SPF/DKIM/verification records **только** для этого sender
subdomain; не угадывать значения и не создавать дублирующий SPF. MX/DMARC менять
лишь по provider handoff, не затрагивать почту другого проекта. SMTP host/port/user
остаются `<SMTP_HOST>/<SMTP_PORT>/<SMTP_USER>`, password — server Secret.
Проверить TLS, DNS verification, Free daily/monthly quotas и Auth rate limits;
встроенный Supabase SMTP ограничен адресами команды, для пилота не подходит.
Рассылка и отправка даже smoke OTP требуют отдельной авторизации; здесь не выполнялись.

Pilot URL Configuration handoff:

- Site URL: `https://trainer.narutouzumaki.kz`.
- Allowed redirects: ровно `https://trainer.narutouzumaki.kz/auth/callback` и
  `panda-trainer://auth/callback`. Это existing runtime callbacks: web использует
  `window.location.origin`, native — literal scheme. Web callback требует отдельного
  размещения действительного Auth handler на этом origin, не просто DNS.
- Local config `localhost:8081`/`127.0.0.1:8081` остаётся dev-only;
  preview origins и wildcards в pilot не добавляются. Страница `/invite/<token>`
  не OAuth callback. Preflight не меняет remote settings или signup/access policy.

Google/Apple dashboard callback: `https://<PILOT_PROJECT_REF>.supabase.co/auth/v1/callback`
(проверить exact URL в Supabase provider UI); он отличается от app callback выше.
Google `<OAUTH_CLIENT_ID>`, authorized origins; Apple `<SERVICE_ID>`, team/key IDs,
verified domains и return URLs — placeholders из аккаунтов владельца. Client secrets
хранятся server-side. Apple subscription/новые paid credentials не приобретаются;
если доступ недоступен бесплатно — gate остаётся открытым. В provider dashboards
оператор конфигурирует только пилот после отдельного разрешения; identity, OTP,
OAuth cancellation/error и callback exchange проверяются на synthetic accounts.

## Cloud readiness: local validation и remote evidence

Ни один remote checkbox ниже не подтверждён этой работой. Для каждого доказательства
указать UTC, pilot public ref, commit/build, reviewer, результат и sanitized artifact
в согласованном доступе; никогда raw credentials, JWT, invite tokens, PII или полные
connection strings. Скриншоты не добавлять в git (ADR 0066).

| Проверка | Local validation этого пакета | Обязательное remote evidence / gate |
| --- | --- | --- |
| Isolation / HTTPS | Формат разных refs и matching URLs | Dashboard двух разных проектов и фактический target сборки |
| Database Frankfurt | Только `eu-central-1` intent | Project infrastructure region Frankfurt, точный ref; URL этого не доказывает |
| Logs region | Не проверяется CLI | Отдельно Supabase logs и будущий monitoring: provider region, processing/storage/export/retention; неизвестное не считать EU |
| Backups region | Только nightly dump/7 дней intent | Отдельно private storage location, runner/temp/logs, encryption/access, deletion/rotation ≤7 дней; GitHub Actions сам по себе не доказывает Frankfurt |
| Free / расходы | Только заявленные Free choices, paid=false | Dashboard тарифов и текущих quota/billing; лимиты DB/storage/egress/Auth/SMTP/Pages/EAS/events, доступная квота, ответственный и пороги |
| Schema / clean start | Только no prototype import intent | Migration history, RLS, отсутствие seed/user data; synthetic functional smoke |
| DNS / TLS / invites | Exact canonical domain | Pages domain/TLS, DNS evidence и actual routes; iOS/Android links отдельно |
| Auth | Exact redirect target list | SMTP DNS и OTP, Apple/Google PKCE callbacks на разрешённых synthetic accounts |
| Wakeup / connection errors | Не network test | На paused Free project оператор restore/wakeup, затем bounded retry; отдельно timeout/offline/DNS failure, безопасная понятная ошибка и сохранность pending local data; ни пустого успеха, ни автоматического paid upgrade |
| Backup / restore | Integration point, не готовый job | Ночной dump, private storage, restore в отдельную изолированную synthetic DB, roles/schema/data целостность, согласованные RPO/RTO и 7-day rotation; не restore в dev/pilot |
| Monitoring | Integration point, не готовая telemetry | Synthetic error, scrubbed payload без PII/token, доставка/alert/quota и отдельное доказательство региона; при исчерпании лимита остановка/решение владельца без расходов |
| Real data | Не допускаются fixtures с PII | Профильный специалист подтверждает допустимость хранения вне Казахстана; затем явное разрешение владельца и applicable privacy review |
| Pilot acceptance | Не выполняется | Native checks, все gates и явное одобрение владельца; SOM-40/этап 10 остаются открытыми |

Free project может быть paused после низкой активности за 7 дней. Это не лечится
фиктивным PASS или бесконечным retry: сначала проверить project state и соединение,
затем повторить разрешённый smoke и зафиксировать фактическую ошибку/восстановление.
Контейнер не проверяет UX этого состояния; новый keepalive/job не создаётся.

Smoke accounts: только отдельные вымышленные trainer A/B и client A/B с управляемыми
оператором тестовыми inboxes; ни реальных клиентов, ни prototype import. Отметить
account IDs в private fixture registry, проверить owner/client isolation,
issue/accept/revoke, preload/recovery и cleanup через разрешённый процесс.
Синтетическая проверка с отправкой на inbox или remote записью — отдельный
операторский шаг, не запуск local Mailpit script против облака.

Будущий backup package принимает pilot identity и server connection Secret,
владеет dump/restore tooling и private region/rotation evidence. Будущий monitoring
package принимает pilot environment/build и approved server/client настройки,
владеет scrub/quota/telemetry evidence. Их результаты не нужны для local preflight,
но нужны для cloud readiness. Пакет не ссылается на ещё несуществующие файлы,
не меняет чужие monitoring/backup workflows и не утверждает их готовность.
PR #28 preload и PR #29 export — кодовые integration points для synthetic smoke,
а не доказательство deploy, restore или remote telemetry.

## Проверенные внешние инструкции

Сверены 03.10.2026; при handoff оператор повторно проверяет provider UI и лимиты:
[Supabase regions](https://supabase.com/docs/guides/platform/regions),
[CLI db push](https://supabase.com/docs/reference/cli/supabase-db-push),
[Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Google](https://supabase.com/docs/guides/auth/social-login/auth-google),
[Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple),
[Free pausing](https://supabase.com/docs/guides/platform/free-project-pausing),
[backups](https://supabase.com/docs/guides/platform/backups),
[Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
