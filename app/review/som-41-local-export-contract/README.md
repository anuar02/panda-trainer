# SOM-41 · Local export contract review

03.10.2026; synthetic-only package on base `96db40a`, after export UI.
Branch `agent/som-41-local-export-contract`; draft target `fix/som-50-template-picker`.

## Scope and criteria

- Сделано: isolated versioned pure envelope, exact allowlisted journal operations/
  row projections, original rejected receipts, both typed conflict versions and
  correction drafts; explicit unknown/incomplete sources and missing versions.
- Сделано: account/workspace/session comparison, UUID/revision/sequence/units/null/
  zero preservation, Unicode notes and UTF-8 size; deterministic JSON, bounded
  strings/records/nodes/depth/bytes, duplicate/foreign/malformed/credentials rejection.
- Сделано: no collector, storage, UI, auth, SQLite, runner, server export, deletion,
  SQL, generated types, dependencies, scripts or native adapter changes.
- Сделано: synthetic round-trip and rejection tests; no credentials/real data/PNG.
- Сделано: technical collector/save-ack atomicity/file-result/cleanup handoff,
  ADR 0075, CHANGELOG and minimal ROADMAP; deletion handoff only gains a link.
- Не проверено: runtime SQLite snapshot/reopen/crash, concurrent native save/ack,
  file API/save/share/cancellation, SQL/pgTAP, devices, browser, cloud/legal.
- Требует одобрения владельца: full SOM-41, export/delete integration and UX,
  screen/native acceptance. Этот package не закрывает SOM-41 или экраны.

## Commands and evidence

`command -v graft`: unavailable; repository has no graft directory. Live Linear
connector unavailable; no Linear mutation/comment/message attempted. Task scope
comes from owner brief and local DELIVERY-PLAN. No new duplicate issue created.

`cd app && npx prettier --write src/domain/account-local-export tests/account-local-export`
formats only new task code/tests.

`cd app && npm run check` runs TypeScript strict, ESLint (zero warnings),
repository formatting and complete Jest suite. Final run passed: 152/152 suites, 1581/1581 tests, zero snapshots (34.604 s).
Typecheck, ESLint and Prettier passed.

`git diff --check`: passed. Source/test scan for comments and `any`: no matches.
All fixtures are synthetic. No Docker/Supabase/browser/devices used.

## Limits and review notes

Overall result is always incomplete: otherLocalData has no implemented collector
contract. journalStatus is a structural completeness assertion only; unknown
sources, unavailable versions, missing linked conflict/draft records and unknown
atomicity cannot become complete journal evidence. Scope metadata cannot prove
ownership of UUID references without future authorized collector reads.

Parser intentionally accepts canonical serializer output only, rejecting repeated
JSON keys or alternate representations. This is neither import nor restore.
No export/ack evidence, identity verification, delete authorization, automatic
purge, or combining server success with local success exists.

See [contract](../../../docs/app/privacy/LOCAL-EXPORT-CONTRACT.md) for schema,
transport limits, unknown projection handling, transaction/barrier requirements,
post-file proof and cleanup boundaries. Retention and product policy unchanged.
