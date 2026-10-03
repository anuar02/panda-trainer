# SOM-40 · Remote evidence пилота

Журнал подтверждённых remote gates из [ENVIRONMENT](ENVIRONMENT.md#cloud-readiness-local-validation-и-remote-evidence).
Без secrets, ключей, PII и скриншотов в git (ADR 0066).

## 03.10.2026 · Pilot project

- UTC: `2026-10-03T17:36Z`. Pilot ref: `vameovahvatonfyzztyi`,
  URL `https://vameovahvatonfyzztyi.supabase.co`.
- **Region Frankfurt (`eu-central-1`)** и **plan Free** — подтверждены владельцем
  в Supabase dashboard. Независимый признак: IPv6 DB host входит в AWS
  `2a05:d014::/35` (`eu-central-1`) по `ip-ranges.amazonaws.com`.
- Clean start, read-only через Supabase MCP: 0 migrations, 0 `auth.users`,
  0 storage buckets, 0 edge functions, пустая `public`; Postgres 17 совпадает
  с `supabase/config.toml`; security advisors без замечаний.
- Reviewer: владелец + Claude Code.

## 03.10.2026 · Schema deployment

- UTC: `2026-10-03T17:41Z`. Commit `7ec4539`, Supabase CLI `2.118.0`,
  `db push --linked --skip-vault` (dry-run перед этим: 24 migrations, `seeds: []`,
  `roles: []`). Разрешение владельца получено в сессии.
- `list_migrations`: 24 версии, `20260929073840_foundation` …
  `20261003130000_trainer_workspace_export`, совпадает с `supabase/migrations/`.
- RLS включён на всех таблицах: `public` 27/27, `private` 10/10.
- Данные: `private.exercise_catalog` 81 строка (справочник из migrations);
  `auth.users`, workspaces, client_records, bookings, storage buckets — 0.
- Security advisors: INFO `rls_enabled_no_policy` на 10 таблицах `private`
  (deny-all; у `anon`/`authenticated` нет USAGE на `private` — ожидаемо); WARN 35 `SECURITY DEFINER` RPC доступны
  роли `authenticated` — это командный API приложения; для `anon` замечаний нет.
  Performance: 56 FK без индекса (в основном `created_by`) и 19 unused indexes на
  пустой базе — не блокирует, пересмотреть после synthetic smoke.

Не подтверждено: Auth/SMTP/OAuth, Pages/DNS, регионы логов и
бэкапов, monitoring, smoke и приёмка пилота. SOM-40 остаётся открытым.
