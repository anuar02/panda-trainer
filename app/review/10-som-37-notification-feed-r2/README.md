# SOM-37 · Notification feed r2 · 04.10.2026

Task: https://linear.app/something-great/issue/SOM-37
Branch: `agent/10-som-37-notification-feed-r2`
PR base: `fix/som-50-template-picker`. Draft publication required; not owner acceptance.

## Fresh-base and coordination evidence

- Read root/app AGENTS, LINEAR-AGENT-GUIDE, LINEAR-WORKFLOW, app README,
  CONVENTIONS, ROADMAP checkpoint, PROJECT-MEMORY, UI-PARITY, DELIVERY-PLAN,
  OPEN-QUESTIONS, DATA-MODEL and ADR 0007/0061/0065.
- `command -v graft` failed and `graft/` does not exist. Recorded fallback:
  scoped `rg`/exact source ranges. No graph build is possible in this checkout.
- Live Linear reads: SOM-37 `In Progress`, blocked by SOM-27/SOM-36, blocks
  SOM-49/SOM-73; no duplicate relation. SOM-73 `In Progress` builds push above
  SOM-37. Its four kinds and ADR 0065 supersede SOM-37's old push-after-pilot text.
  Project read first returned 502, retry succeeded. No Linear writes or messages.
- Waited for prerequisite PR #66. First two DB runs failed on fixture identity
  and private schema permissions; upstream fixed them. Both app/database checks
  succeeded in run `37175475478`; #66 was verified `MERGED` before implementation.
  SOM-27 #62 and billing #64 were already merged. Fresh base `4e5b171` contained
  no equivalent notifications table/feature. Fetched upstream `32b7c75` before
  handoff; it only fixes prerequisite migration date/references.
- Previous missing SOM-37 implementation/remote PR was not counted as evidence.
  No previous summary was used as fresh validation.

## Implemented scope

- Additive `20261004110101_notification_feed.sql`: owned tenant/user/role rows,
  unique event identity, allowed kinds, fixed safe version-only payload, RLS and
  grants, fixed search_path, transaction-bound event triggers and monotonic read RPC.
- Counterpart events for insert/confirmation/cancellation/reschedule and proposal
  request/counter/decline/withdraw; one booking time event on acceptance. First
  finished results and applied finished-visible corrections notify the client.
  Draft/private-only changes and no-op/replay emit nothing. Existing writers,
  financial policies, locks and previous migrations are unchanged by this task.
- Real client Home/trainer Today bell and account rows for the trainer workspace
  and each client connection; separate explicitly synthetic demo sheet. Both roles
  have loading/empty/error/retry/read/more/current-target behavior. Read is explicit;
  opening a notification does not confirm/cancel/mark it automatically.
- Stable cursor pagination at 50 rows with lookahead/has_more and exact whole-feed
  server count. Reconciliation resets to first page and exposes older rows via More.
  No hard total cap. Deleted/unfinished targets report unavailable; cancellation
  reports current cancellation instead of reopening a live action. Client booking
  and finished-history targets select the own object; trainer scheduling uses the
  target's current workspace-local date/session.
- Isolated INSERT/UPDATE-only Realtime clients/channel filters (no unscoped
  DELETE keys; removed rows reconciled on focus/foreground/reconnect); verified JWT user/session refresh;
  reconnect/focus/foreground server reconciliation, duplicate/order/read races,
  logout/relogin/workspace/client/caller/unmount lifetime fences and disposal.
- Generator-shaped public database types, independent service/controller/hook/
  feed/Realtime tests, pgTAP, true concurrency harness and event contract documented
  in `docs/app/DATA-MODEL.md` for SOM-73. No push transport/token/scheduler.

## Commands and fresh results

- `cd app && npm run check`: PASS, **225 suites / 2960 tests**; TypeScript strict,
  ESLint (zero warnings), Prettier and Jest green. This is mock/unit evidence.
- `python3 -m py_compile supabase/tests/notification_concurrency.py`: PASS,
  syntax only; generated cache is excluded from commit.
- `git diff --check`: PASS.
- Tool/runtime availability: `command -v docker`, `command -v psql`,
  `command -v supabase` found none. Supabase CLI dependency exists in app, but
  there is no running local database or Docker. SQL was not executed here.

## needs-local-db · Claude/CI gate

Current CI runs `supabase db lint --local --fail-on warning`, `supabase test db`
(including the new pgTAP file) and `cd app && npm run db:types:check`, plus existing
scheduling/payment concurrency harnesses. These are pending for this branch;
predecessor CI success is not SOM-37 SQL evidence.

The new harness is **not automatically invoked by the current workflow**. Run:

```sh
python3 supabase/tests/notification_concurrency.py --container supabase_db_trainerApp
```

It holds transaction one after confirm/read, observes session two waiting on a
real lock, then verifies one command event and the same first read timestamp.
Do not count `py_compile` or sequential pgTAP replay as a concurrency result.

Generate/compare public types against this migration on the real local CI schema.
The manual generator-shaped additions are not a completed generation proof.
Migration stamp is base max + one second because the actual container UTC was
behind existing base timestamp `20261004110100`; this preserves deployment order
without editing any existing migration. ADR 0098 records this conflict.

## Runtime/owner limitations

Not checked: real Realtime publication/RLS/Auth delivery, JWT refresh/reconnect on
two phones, background/foreground network loss, native navigation, safe-area/
accessibility/large text, browser or native screenshots and visual comparisons.
No browser/native/Docker runtime exists here. Mocks do not establish any of those.
No real client data, paid service, cloud/EAS/push or new PNG was used.

Reference: `prototype-fresh/js/sheets.js:161–198`, client Home bell and trainer
profile notification row. Existing Sheet/Card/icons/theme tokens are reused;
no generic replacement screen or placeholder server success. Expanded event kind
copy, read/count/more controls, added real entry placement and the obsolete
canonical trainer subtitle need owner review (OPEN-QUESTIONS). The prototype and
spec files were not changed. Parity checks for texts/layout/geometry/themes/large
font/native remain unchecked. SOM-49 is separate owner screen acceptance.

SOM-34 live/payment concurrency remains an external limitation inherited from
its own handoff; this task neither repeats financial code nor accepts that result.
SOM-37, screens and milestone are **not declared accepted/completed**.

## Publication

Implementation committed as `7e156dc` and pushed with upstream tracking to
`origin/agent/10-som-37-notification-feed-r2`. Published and read back:
[draft PR #67](https://github.com/anuar02/panda-trainer/pull/67), title includes
SOM-37, base `fix/som-50-template-picker`, correct head, `OPEN` and `isDraft=true`.
Remote head was verified by `git ls-remote`. This review-only publication record
is committed separately. CI for this PR is pending; no SQL/type-generation/real
concurrency success is claimed, and no merge or owner acceptance is claimed.

## Coordinator integration · 2026-10-04 UTC

Initial CI run 37177815271 failed the export public-table inventory assertion
when notifications was added. Notifications is explicitly excluded from the
version 1 trainer workspace export: it stores recipient-specific delivery/read
state, and exporting another recipient’s feed through trainer ownership is not
authorized by that contract. The existing export remains incomplete; notification
feed/read state is not included. Added the table to the coverage inventory and
an assertion that the version 1 collection remains excluded. No existing
migration or export RPC/client contract was changed. This does not establish
full account portability or owner acceptance. Fresh CI is required; no local
SQL runtime is available. The separate notification concurrency harness remains
unexecuted by the standard workflow.
