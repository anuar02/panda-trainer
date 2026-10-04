# SOM-73 · Push v1 r3 · 04.10.2026

Full implementation, not the report-only PR #68. Branch:
`agent/12-som-73-push-v1-r3`; intended base `fix/som-50-template-picker`.
Published implementation commit `fa2b6112c153c1111f29a62dfb99bc8729107a4e` in
[draft PR #69](https://github.com/anuar02/panda-trainer/pull/69). App/database CI
started for that head; results are not yet claimed as received.
No issue, screen, stage or live delivery is declared accepted.

## Prerequisites and scope

Fetched base and fast-forward check: `4b19a78` already present. `gh pr view 67`
confirmed SOM-37 MERGED to the required base at 2026-10-04 05:14:30Z, squash
`4b19a78d692d7bd8d842f16322805611db44426c`. `gh pr view 66` confirmed SOM-36
MERGED at 04:02:22Z, squash `4e5b171428a3a41b0bef490be0d9c2db6f285d37`.
SOM-34/SOM-27/SOM-35 code is preserved. No booking, journal, financial writer,
existing migration, feed policy, prototype or workflow was changed.

Read live SOM-73, SOM-37 and trainerApp project/resources through Linear on
04.10.2026. SOM-73 remains In Progress and relates to SOM-37/SOM-42/SOM-57/SOM-64;
no duplicateOf. SOM-37 is In Review despite its merged implementation; live
criteria contain historical “push after pilot”, superseded by owner ADR 0065.
No Linear descriptions, milestone, status, comments or project updates changed.
Remote issue criteria do not establish SQL/concurrency/native acceptance.

`graft map` failed: executable absent; `graft/` directory also absent. Used
explicit repository documents and targeted `rg`/source reads as the recorded
fallback. No equivalent device/sender/scheduler implementation existed. Old r2
brief/report retained for audit. Applicable root/app AGENTS, Linear guide/workflow,
README/CONVENTIONS/ROADMAP/memory/parity/data model/open questions/delivery plan
and ADR 0007/0061/0064/0065/0067/0098 were consulted. Prototype notification/settings
source was read only. No sub-agent used.

## Implemented criteria

| Criterion | Delivered | Remaining evidence / approval |
| --- | --- | --- |
| Per-device token lifecycle | Three private RLS tables; own-user/session RPCs; hashed installation capability and durable command-sequence tombstone; rotation, restart/account switch/denial cleanup, awaited logout, late-response and same-user relogin fences; no token logging/React keys | Live RLS/Auth/SecureStore/OS behavior; offline external revocation cannot guarantee immediate server cleanup |
| Native permission/open | SDK 57 notifications/device via `npx expo install`; native system prompt once, Android channel, foreground/native rotation, web unsupported; cold/warm versioned feed IDs wait through login; current own target RPC and cancelled/unavailable/error states | Installed iOS/Android, native cold/warm/background/system settings, parity/accessibility; owner approval |
| Server sender | Consumes SOM-37 real feed; safe generic bodies and feed IDs; one logical notification/device delivery; materialization ≤500, claims ≤100, handler ≤20 with five concurrent calls; leases, retry/backoff, tickets/receipts, generation-specific invalid cleanup | DB runtime/concurrency and actual Expo tickets/receipts; external exactly-once explicitly NOT promised |
| Scheduling | Current confirmed bookings/active relationships; two-hour reminders; mandatory configurable morning local time; workspace timezone/date/DST; replay keys, changed start/recipient/cancellation checks, late-before-start and empty-day behavior | pgTAP runtime; exact morning time not chosen by owner; operator parameter required before deployment |
| Tests/types | Independent controller/native adapter/hook/open service/open hook/observer/worker/routing tests; pgTAP rights/replay/scheduling/leases; manual concurrent worker/device harness; generated public RPC shapes | CI exact type drift/lint/pgTAP; new harness not invoked by existing workflow |
| Handoff/docs | [PUSH-V1](../../../docs/app/PUSH-V1.md), [ADR 0099](../../../docs/app/decisions/0099-push-device-leases-and-due-evaluation.md), DATA-MODEL/OPEN-QUESTIONS, ROADMAP stages 8/11, CHANGELOG and app README | Cloud deployment/credential provisioning/scheduled invocation and owner acceptance |

Device/delivery raw tables have no anon/authenticated grants; metadata omits the
token. Capability permits revoking only the proven current installation across
an account switch. Server command sequence survives row deletion: late or exact
replayed RPCs cannot resurrect a logout binding or refresh registration time.
Logout must confirm removal before local signout, so offline cleanup failure is
an existing auth error with retry, not a false successful unbind. No new auth
provider or permission/settings UI was introduced.

Generic schedule changes are pushed from actual SOM-37 notification rows;
finished workout/notes/financial data are never copied into push. Scheduled kinds
reuse the same feed/read/RLS/target contracts. A daily plan uses the current authorized confirmed-booking count at claim time
and opens the current schedule with its recorded local date; no private snapshot
or invented count is used. Pending daily plan rechecks that the day remains nonempty.

Unknown send response/timeout/5xx or expired sending lease is persisted as
`unknown`, without automatic resend. One database delivery is not exactly-once
presentation. Known tickets can re-poll receipts; unknown without a ticket needs
an explicit operator recovery choice accepting possible loss/duplication.
[PUSH-V1](../../../docs/app/PUSH-V1.md) contains the full guarantee and recovery.

## Fresh verification

| Command / check | Result |
| --- | --- |
| `cd app && npx expo install expo-notifications expo-device` | SDK 57 compatible modules installed, lock updated; no other SDK dependency added |
| `cd app && npx expo install --check` | PASS: dependencies up to date |
| `cd app && npm run check` | PASS: TypeScript, ESLint zero warnings, Prettier, 233 suites / 3005 tests |
| Push-specific Jest coverage included in that check | Eight suites, 45 tests: controller/lifecycle, native adapter, native hook/logout, open service, open hook/lifetime, cold/warm observer, payload validation, actual worker with fake transport/store/clock |
| `cd app && CI=1 npm run export` | PASS: iOS/Android bundles plus web static routes including `/push-open`; one expo-asset exported-subpath fallback warning, no build error |
| `npx --yes deno check --config supabase/functions/push-v1/deno.json supabase/functions/push-v1/index.ts` | PASS: actual server entrypoint and SDK client; scoped Deno dependency lock included |
| Local Deno server with no Supabase URL/key and network permission only for localhost port 8000 | POST without authorization 401; non-POST 401; synthetic authorized POST without required configuration 503; no DB/Expo call possible; process stopped |
| Temporary `pgsql-parser@18.2.8` / `libpg-query@18.1.5` SQL/PLpgSQL parser | PASS: new migration SQL and all 10 function definitions parsed; pgTAP SQL parsed. Syntax-only PostgreSQL 18 parser, NOT target database lint/runtime |
| `python3 -m py_compile supabase/tests/push_concurrency.py` | PASS syntax; runtime NOT run; temporary bytecode removed |
| `git diff --check` | PASS |

Temporary parser reproduction (outside the checkout):

```sh
npm install --prefix /tmp/som73-sql-parser --no-package-lock --ignore-scripts pgsql-parser@18.2.8
node - <<'JS'
const fs = require('fs');
const parser = require('/tmp/som73-sql-parser/node_modules/libpg-query');
(async () => {
  const migration = fs.readFileSync('supabase/migrations/20261004110241_push_v1.sql', 'utf8');
  await parser.parse(migration);
  await parser.parsePlPgSQL(migration);
  await parser.parse(fs.readFileSync('supabase/tests/database/push_v1.test.sql', 'utf8'));
  console.log('SQL/PLpgSQL syntax PASS');
})();
JS
```

Native service tests fake Expo SDK/storage/network. Worker tests compile and run
the actual dependency-free server source through TypeScript with deterministic
fake transport, clock and store; they never invoke HTTP Expo endpoints. The
server localhost probe ran with external network access denied by Deno. No EAS,
APNs, FCM, Expo credentials or customer data were obtained or used.

Migration `20261004110241` is the previous latest base `20261004110101` plus
100 seconds; actual container UTC timestamp is earlier than that already-merged
base timestamp. This follows the requested numbering rule rather than inventing
a future round timestamp. Final base fetch confirmed ADR 0098 is latest; 0099
is the next available number. All existing migrations are unchanged.

## Not verified / deployment limits

Docker/psql/local Supabase DB are absent. SQL lint, pgTAP and exact public generated
schema drift await the standard GitHub database job. Public types were updated in
the generator's ordered format, but runtime regeneration is not claimed here.
The standard workflow does not run `notification_concurrency.py` or the new
`push_concurrency.py`. Their manual DB commands are in PUSH-V1; compilation alone
is not concurrency evidence. Existing financial live/payment concurrency and
SOM-37 notification concurrency remain external limitations, not accepted checks.

No cloud resources/cron, deployed function, real push send, EAS build, APNs/FCM
credentials, installed iOS/Android, two-phone Auth/Realtime, native permission
revocation, crash/reinstall storage, OS cold/warm routing, visual parity,
accessibility or owner acceptance were verified. Export builds are bundle checks,
not installed-app behavior. New texts/unavailable route are recorded for owner
review, not an approved prototype deviation. `PUSH_MORNING_LOCAL_TIME` has no
default: exact time remains an operator parameter and an OPEN-QUESTIONS item.
Private device/delivery/installation state is outside the existing account export;
this task does not declare that export complete or change deletion behavior.
