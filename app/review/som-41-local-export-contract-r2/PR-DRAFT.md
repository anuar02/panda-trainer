# Publication payload

Base: `fix/som-50-template-picker`

Head: `agent/som-41-local-export-contract-r2`

Draft: true

Title: `SOM-41: Preserve SQL conflict and correction forms in local export r2`

Before retrying publication, check for a draft with this head to avoid duplicates.

## Body

Исходный пакет SOM-41 из закрытого без слияния PR #39 перенесён в r2 на свежую fix/som-50-template-picker. Исправлены SQL-shaped current версии: replacement старого упражнения с sets, existing set aggregate, missing set на skipped exercise, note/shared и workout snapshot. Kind-specific relations отклоняют чужие exercise/child/replacement/version даже внутри одной тренировки.

Resolve_conflict correction сохраняет точную исходную операцию. Workout/entity/revision проверяются через scoped typed conflict того же snapshot; отсутствующий context сохраняет данные со статусом incomplete. Collector/storage/UI/auth/SQL/account-export/deletion не изменены.

Критерии:

- Сделано: весь исходный pure versioned envelope, операции/projections, rejected receipts, обе conflict versions/corrections, unknown/incomplete, bounded deterministic UTF-8, null/zero/exact units и Unicode.
- Сделано: все указанные SQL current формы lossless; kind-specific schema/scope/parent/version validation и resolve context seam без выдуманных UUID/proof.
- Сделано: round-trip и negative tests. На исходном serializer 16 из 28 новых regressions падают; r2 local tests — 2 suites / 40 tests PASS.
- Сделано: LOCAL-EXPORT-CONTRACT, handoff, ADR 0078, CHANGELOG/ROADMAP, свежий app/review/som-41-local-export-contract-r2/README.md. Старый отчёт помечен historical/superseded.
- Не проверено: реальные SQLite snapshot/reopen/crash/concurrent save-ack, SQL/pgTAP, native/web/file APIs, устройства, cloud/legal, collector UUID ownership.
- Требует одобрения владельца: SOM-41 целиком, export/delete integration/UX и экраны. Этот пакет не закрывает SOM-41 и не создаёт export/ack/identity/delete proof.

Проверки: `cd app && npm run check` — strict typecheck, lint, format и full Jest suite (159 suites / 1731 tests PASS на 9031157); `git diff --check` PASS. Только synthetic fixtures, без новых зависимостей/PNG/секретов/реальных данных/платных сервисов.
