# SOM-40 · Pilot config package verification

03.10.2026. Branch `agent/som-40-pilot-config`, base `fix/som-50-template-picker`
at `08f0251`. Local preparation only; SOM-40 and pilot remain open.

## Delivered

- Public-only template and dependency-free Node CLI in `tools/pilot-config/`.
  Different cloud dev/pilot refs, matching HTTPS URLs, exact canonical invite domain,
  exact web/native redirects, Free choices, no paid options or prototype import.
- Missing/invalid input exits 1. Unknown fields, malicious values/keys, JSON and OS
  errors never echo input values or file paths. CLI does not read env/credential
  stores, access providers or mutate network state. Input must be public JSON;
  accidentally supplied secrets cannot be used as config or appear in diagnostics.
- [Environment handoff](../../../docs/app/pilot/ENVIRONMENT.md): separate Frankfurt
  Free project, migrations without seed/import/Vault sync, public env versus server
  Secrets, Pages/DNS/SMTP/OAuth/Auth setup and separate remote evidence gates.
- [ADR 0070](../../../docs/app/decisions/0070-public-pilot-preflight-and-remote-evidence.md),
  minimal CHANGELOG/ROADMAP entries. App code/config/dependencies, SQL, auth policy,
  existing deployments, monitoring/backup packages and privacy docs are unchanged.

## Exact local commands and results

From repo root, Node `v22.23.3`:

```sh
node --test tools/pilot-config/validate.test.mjs
node tools/pilot-config/validate.mjs tools/pilot-config/template.json
node --check tools/pilot-config/validate.mjs
node --check tools/pilot-config/validate.test.mjs
app/node_modules/.bin/supabase db push --help
cd app && npm run check
```

- CLI tests: **12/12 passed**, exit 0. Real subprocess invocations with temporary
  synthetic JSON, removed after each run. Tests exercise every missing field,
  dev==pilot, malformed refs/URLs, URL credentials/path/query/fragment, noncanonical
  domains, redirects (missing/duplicated/wildcard/dev/wrong scheme), paid choices,
  import and retention errors. Synthetic secret input in values/unknown field names,
  malformed JSON, CLI path/arguments and inherited synthetic credential variables
  is absent from stdout/stderr. Both valid synthetic origins and reversed redirect
  order pass with the explicit `LOCAL CONFIG VALID ONLY` / `NOT VERIFIED` wording.
- Unfilled template: **expected exit 1**, four safe project ref/URL diagnostics;
  no fake PASS. Actual project identities remain unknown, not invented.
- Node syntax checks: exit 0.
- Supabase **help only**, installed `2.118.0`: confirmed `--linked`, `--dry-run`,
  `--include-seed`, `--skip-vault`. No link, db push, deploy or account creation run.
- Full app check: **exit 0**, typecheck/lint/format green;
  **1430 tests / 142 suites passed**, no snapshots. CLI tests are separate from
  existing app CI; reviewer must run both commands above.
- `git diff --check`: exit 0. Local Markdown links checked to exist. Scope audit:
  only allowed new package/docs/review/ADR and minimal CHANGELOG/ROADMAP changes.

Graft executable and `graft/` directory are absent in this checkout. Required repo
instructions, ADR 0007/0064/0067, current config/runtime sources and app workflow
were read directly. Linear project and SOM-40 were read without writes: live issue
In Progress, no duplicate relation, prerequisite decisions listed, SOM-42 downstream.
The existing SOM-40 scope is broader than this package; no new issue created.
Provider documentation was checked read-only; links are in ENVIRONMENT.

## Remote gates: not verified / requires owner approval

No Docker, local Supabase, browser or native devices in this container. Not verified:
SQL/pgTAP/generated drift, actual cloud refs/plan/quotas, schema deployment,
Frankfurt database metadata, separate log and backup regions, DNS/TLS/Pages routes,
SMTP DNS and delivery, OAuth dashboards/callback exchange, paused Free wakeup and
connection error UX, actual builds/deep links, backup dump/rotation/isolated restore,
remote monitoring delivery/scrubbing/alerts, native/parity and pilot acceptance.

Backup tooling and monitoring are future integration packages, independently owned;
this package does not wait for them or assert their results. Their remote evidence
is required for readiness. No cloud services, paid options, deployments, mail sends,
real client data or production workflow were created or run here.

Operator handoff requires separate authorization for creation/configuration/deploy
and smoke mutations or messages. Real data additionally require specialist review
of storage outside Kazakhstan and explicit owner permission under ADR 0064.
All unknown account/provider/native identifiers remain placeholders. HTTPS deep
links and screens are not accepted; acceptance belongs to the owner.
