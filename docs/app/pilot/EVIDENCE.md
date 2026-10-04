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

## 03.10.2026 · Migration 20261003140000

- UTC: `2026-10-03T18:50Z`. Commit `1d08be1` (PR #34, CI зелёный: lint, pgTAP,
  concurrency, types). Dry-run: ровно `20261003140000_workout_sync_revision_fixes`,
  `seeds: []`, `roles: []`; затем `db push --linked --skip-vault`. Разрешение владельца.
- MCP: 25 migrations, последняя `20261003140000`; триггер `set_results_touch_updated_at`
  → `private.touch_set_result()`; `apply_operations` с `'[]'::jsonb`; `auth.users` 0.
- Security advisors без изменений (10 INFO private deny-all, 35 WARN командные RPC).

## 04.10.2026 · Migration 20261003150000

- UTC: `2026-10-04T00:16Z`. Commit `980e149` (PR #42 SOM-31 r2; CI зелёный, локально
  db lint/pgTAP/concurrency на слиянии с базой). Dry-run: ровно
  `20261003150000_prepare_workout_journal`, `seeds: []`, `roles: []`; затем
  `db push --linked --skip-vault`. Разрешение владельца.
- MCP: 26 migrations, последняя `20261003150000`; `prepare_workout_journal` —
  security definer, `search_path=pg_catalog`, `anon` без EXECUTE;
  `private.workout_preparation_receipts` с RLS; `auth.users` 0.
- Security advisors: +1 INFO (новая private таблица квитанций, deny-all) и +1 WARN
  (новая командная RPC) — ожидаемо; других изменений нет.

## 04.10.2026 · Migrations 20261004100000 … 20261004110241

- UTC: `2026-10-04T11:45Z`. Commit `3b59d02` (PR #56, #58, #66, #67, #69; CI зелёный;
  DB-PR #56/#58/#64 дополнительно локально; все 18 concurrency-скриптов в CI с #70).
  Dry-run: ровно 5 migrations (`explicit_workout_correction`, `exercise_replay_identity`,
  `client_overview_reads`, `notification_feed`, `push_v1`), `seeds: []`, `roles: []`;
  затем `db push --linked --skip-vault`. Разрешение владельца.
- MCP: 31 migrations, последняя `20261004110241`; RLS на всех таблицах `public`/`private`;
  ни одна security definer функция `public` не исполняется `anon`; у всех закреплён
  `search_path`; функции с `p_actor_id` сверяют его с `auth.uid()`; `auth.users` 0.
- Security advisors: 15 INFO (private deny-all), 47 WARN (командные RPC) — рост
  соответствует новым private таблицам и RPC; других классов замечаний нет.
- Edge Function `push-v1`, её secrets и расписание **не** развёрнуты.

## 04.10.2026 · Migrations 20261004134801, 20261004143210

- UTC: `2026-10-04T15:05Z`. Commit `4c70931` (PR #72 SOM-32 автомерж агента при зелёном
  CI; PR #73 SOM-41 влит координатором при зелёном CI). Dry-run: ровно
  `program_update` и `account_deletion`, `seeds: []`, `roles: []`; затем
  `db push --linked --skip-vault`. Разрешение владельца.
- MCP: 33 migrations, последняя `20261004143210`; RLS на всех таблицах; security definer
  без `search_path` — 0; `anon` не исполняет ни одну security definer функцию `public`.
  Пять `public.account_deletion_*` функций исполняет только `service_role`
  (не `anon`/`authenticated`); `auth.users` 0.
- Удаление аккаунта в пилоте не запускалось; юридическая проверка (ADR 0101) — gate
  до реальных данных.

Не подтверждено: Auth/SMTP/OAuth, Pages/DNS, регионы логов и
бэкапов, monitoring, smoke и приёмка пилота. SOM-40 остаётся открытым.
